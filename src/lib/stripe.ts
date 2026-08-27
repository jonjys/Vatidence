import Stripe from "stripe";
import { env } from "@/lib/env";
import type { RefundGateway } from "@/lib/refunds";

type GlobalWithStripe = typeof globalThis & { __vatproofStripe?: Stripe };

export function stripe(): Stripe {
  const g = globalThis as GlobalWithStripe;
  if (!g.__vatproofStripe) {
    g.__vatproofStripe = new Stripe(env().STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
      maxNetworkRetries: 3,
      timeout: 20_000,
      appInfo: { name: "vatproof", version: "1.0.0" },
    });
  }
  return g.__vatproofStripe;
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

export async function createCheckoutSession(input: CheckoutInput): Promise<Stripe.Checkout.Session> {
  const config = env();
  const resultUrl = `${config.APP_URL}/r/${input.publicToken}`;

  return stripe().checkout.sessions.create(
    {
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
                "Official EU VIES consultation numbers plus a sealed PDF/CSV evidence pack, delivered automatically.",
            },
          },
        },
      ],
      metadata: { order_id: input.orderId, public_token: input.publicToken },
      payment_intent_data: {
        description: `VATProof order ${input.orderId}`,
        metadata: { order_id: input.orderId, public_token: input.publicToken },
      },
      ...(config.STRIPE_TAX_ENABLED
        ? { automatic_tax: { enabled: true }, tax_id_collection: { enabled: true } }
        : {}),
      success_url: `${resultUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${resultUrl}?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h, Stripe's minimum window is 30m
      custom_text: {
        submit: {
          message: `Your results will appear at ${resultUrl} immediately after payment. Save this link.`,
        },
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

export type ChargeFee = { feeMinor: number; currency: string; chargeId: string };

/**
 * Stripe's processing fee is our only variable cost, and it is only knowable
 * from the balance transaction. Fetched so the ledger records true margin
 * rather than an estimate.
 *
 * Returns null when the balance transaction does not exist yet - Stripe
 * creates it asynchronously, so a charge webhook can arrive before the fee is
 * knowable. The cron sweep retries those; see backfillMissingFees.
 */
export async function fetchChargeFee(chargeId: string): Promise<ChargeFee | null> {
  const charge = await stripe().charges.retrieve(chargeId, { expand: ["balance_transaction"] });
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  return { feeMinor: bt.fee, currency: bt.currency, chargeId: charge.id };
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
  return { feeMinor: bt.fee, currency: bt.currency, chargeId: charge.id };
}
