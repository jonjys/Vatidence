import Stripe from "stripe";
import { CONTACT } from "@/lib/contact";
import { env } from "@/lib/env";
import type { RefundGateway } from "@/lib/refunds";

type GlobalWithStripe = typeof globalThis & { __viesproofStripe?: Stripe };

export function stripe(): Stripe {
  const g = globalThis as GlobalWithStripe;
  if (!g.__viesproofStripe) {
    g.__viesproofStripe = new Stripe(env().STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
      maxNetworkRetries: 3,
      timeout: 20_000,
      appInfo: { name: "viesproof", version: "1.0.0" },
    });
  }
  return g.__viesproofStripe;
}

export const stripeRefunds: RefundGateway = {
  async refund({ paymentIntentId, amountMinor, idempotencyKey, reason }) {
    const refund = await stripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amountMinor,
        metadata: { reason: reason.slice(0, 490) },
      },
      { idempotencyKey },
    );
    return { id: refund.id };
  },
};

export type CheckoutInput = {
  orderId: string;
  publicToken: string;
  itemCount: number;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
};

/**
 * Stripe's Managed Payments makes Stripe the merchant of record for a 3.5%
 * surcharge per transaction, and it is incompatible with `custom_text`. It can
 * be switched on account-wide from the dashboard - and is on by default for
 * new accounts - which takes checkout down with a 502 without a single line of
 * our code changing. This machine is supposed to run unattended, so every
 * session opts out explicitly rather than trusting an account setting.
 */
export function isUnknownParameterError(e: unknown, param: string): boolean {
  if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) return false;
  const message = e.message.toLowerCase();
  return (
    (e.param === param || message.includes(param)) &&
    (message.includes("unknown parameter") || message.includes("unrecognized parameter"))
  );
}

export async function createCheckoutSession(input: CheckoutInput): Promise<Stripe.Checkout.Session> {
  const params = checkoutParams(input);
  const options = { idempotencyKey: input.idempotencyKey };

  try {
    return await stripe().checkout.sessions.create(
      // Not in the pinned SDK's types yet; the API at this version accepts it.
      { ...params, managed_payments: { enabled: false } } as Stripe.Checkout.SessionCreateParams,
      options,
    );
  } catch (e) {
    if (!isUnknownParameterError(e, "managed_payments")) throw e;
    // An API version that does not know the parameter cannot have Managed
    // Payments enabled either, so a plain session is the correct fallback.
    // Stripe saves no idempotent result for a parameter validation failure,
    // so reusing the key here is safe.
    return stripe().checkout.sessions.create(params, options);
  }
}

function checkoutParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const config = env();
  const resultUrl = `${config.APP_URL}/r/${input.publicToken}`;

  return {
    mode: "payment",
    client_reference_id: input.publicToken,
    // The customer never creates an account here; Stripe collects the email
    // for the receipt and we never copy it into our own database.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountMinor,
          product_data: {
            name: `VIES verification of ${input.itemCount} EU VAT number${input.itemCount === 1 ? "" : "s"}`,
            description:
              "VIES consultation numbers plus a sealed PDF/CSV evidence pack, delivered automatically.",
          },
        },
      },
    ],
    metadata: { order_id: input.orderId, public_token: input.publicToken },
    payment_intent_data: {
      description: `VIESProof order ${input.orderId}`,
      metadata: { order_id: input.orderId, public_token: input.publicToken },
      // Without this the charge shows only the Stripe account's own name,
      // which a customer who bought VAT evidence will not recognise weeks
      // later. Unrecognised descriptors are what chargebacks are made of.
      statement_descriptor_suffix: config.STRIPE_STATEMENT_SUFFIX,
    },
    ...(config.STRIPE_TAX_ENABLED
      ? { automatic_tax: { enabled: true }, tax_id_collection: { enabled: true } }
      : {}),
    success_url: `${resultUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${resultUrl}?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h, Stripe's minimum window is 30m
    custom_text: {
      submit: {
        message:
          `Your results will appear at ${resultUrl} immediately after payment. Save this link. ` +
          `Sold by ${CONTACT.operator} (${CONTACT.operatorUrl}). Billing questions: ${CONTACT.email.billing}.`,
      },
    },
  };
}

export type ChargeFee = {
  /** The fee as Stripe settled it, in the account's settlement currency. */
  settledMinor: number;
  settledCurrency: string;
  /**
   * The same fee expressed in the currency the customer was charged in.
   *
   * These differ whenever the account settles in a different currency than it
   * prices in - this account prices in EUR and settles in SEK, which also adds
   * a currency conversion fee. The ledger sums amount_minor to get margin, so
   * an entry in a foreign currency does not merely look odd, it makes the
   * arithmetic wrong. Every entry is therefore booked in the order's currency.
   */
  feeMinor: number;
  currency: string;
  chargeId: string;
};

/**
 * Stripe reports the fee only on the balance transaction, and only in the
 * settlement currency. When that differs from the presentment currency the
 * balance transaction also carries the exchange rate it applied, so the fee
 * can be expressed in the currency the customer actually paid without
 * inventing a rate of our own.
 */
export function feeFromBalanceTransaction(bt: Stripe.BalanceTransaction, chargeId: string): ChargeFee {
  const settledCurrency = bt.currency;
  const rate = bt.exchange_rate;
  const converted = rate && rate > 0 ? Math.round(bt.fee / rate) : bt.fee;
  return {
    settledMinor: bt.fee,
    settledCurrency,
    feeMinor: converted,
    // Without a rate there was no conversion, so the currencies are the same.
    currency: rate && rate > 0 ? presentmentCurrencyOf(bt) : settledCurrency,
    chargeId,
  };
}

/**
 * A converted balance transaction does not name the presentment currency, but
 * the charge it came from does; `source_currency` carries it when Stripe
 * populates it. Falling back to the settlement currency is safe because that
 * is only reached when no conversion happened.
 */
function presentmentCurrencyOf(bt: Stripe.BalanceTransaction): string {
  const withSource = bt as Stripe.BalanceTransaction & { source_currency?: string };
  return withSource.source_currency ?? bt.currency;
}

/** True when the fee had to be converted out of the settlement currency. */
export function feeWasConverted(fee: ChargeFee): boolean {
  return fee.settledCurrency !== fee.currency || fee.settledMinor !== fee.feeMinor;
}

export function feeMemo(fee: ChargeFee): string {
  if (!feeWasConverted(fee)) return "Stripe processing fee";
  // Keep the settled amount on the entry: it is what actually left the balance.
  return `Stripe processing fee (settled ${fee.settledMinor} ${fee.settledCurrency.toUpperCase()})`;
}

/**
 * Stripe's processing fee is our only variable cost, and it is only knowable
 * from the balance transaction. Fetched so the ledger records true margin
 * rather than an estimate.
 *
 * Returns null when the balance transaction does not exist yet - Stripe
 * creates it asynchronously, so a charge webhook can arrive before the fee is
 * knowable. The cron sweep retries those.
 */
export async function fetchChargeFee(chargeId: string): Promise<ChargeFee | null> {
  const charge = await stripe().charges.retrieve(chargeId, { expand: ["balance_transaction"] });
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  return feeFromBalanceTransaction(bt, charge.id);
}

/**
 * Same, starting from the payment intent. The checkout.session.completed
 * payload carries the payment intent as a bare id, so this is the only handle
 * an order is guaranteed to have.
 */
export async function fetchFeeForPaymentIntent(paymentIntentId: string): Promise<ChargeFee | null> {
  const intent = await stripe().paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  return feeFromBalanceTransaction(bt, charge.id);
}

/**
 * A payment intent that belongs to a different Stripe account can never be
 * resolved from this one. After an account switch the old orders are exactly
 * that, and chasing them nightly forever is noise, not diligence.
 */
export function isPermanentlyUnresolvable(e: unknown): boolean {
  return e instanceof Stripe.errors.StripeInvalidRequestError && e.code === "resource_missing";
}
