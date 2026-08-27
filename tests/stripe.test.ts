import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  feeFromBalanceTransaction,
  feeMemo,
  feeWasConverted,
  isPermanentlyUnresolvable,
  isUnknownParameterError,
} from "@/lib/stripe";

/**
 * Every checkout session opts out of Managed Payments explicitly, with a
 * fallback for API versions that do not know the parameter. The predicate that
 * chooses between "retry without it" and "this is a real failure" is the whole
 * safety of that fallback: too broad and it silently retries a request that
 * should have surfaced, too narrow and checkout stays down.
 */
function invalidRequest(message: string, param?: string): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    message,
    ...(param === undefined ? {} : { param }),
  });
}

describe("isUnknownParameterError", () => {
  it("recognises an API version that does not know the parameter", () => {
    const e = invalidRequest("Received unknown parameter: managed_payments", "managed_payments");
    expect(isUnknownParameterError(e, "managed_payments")).toBe(true);
  });

  it("recognises it from the message alone when Stripe sends no param", () => {
    expect(isUnknownParameterError(invalidRequest("Received unknown parameter: managed_payments"), "managed_payments")).toBe(
      true,
    );
  });

  it("does NOT swallow the Managed Payments conflict itself", () => {
    // The real production failure. It names managed_payments but is not an
    // unknown-parameter error, and retrying without the opt-out would fail
    // again - it has to propagate.
    const e = invalidRequest(
      "custom_text cannot be used with Managed Payments, which is enabled by default on your account. " +
        "Remove custom_text, or pass managed_payments[enabled]=false to disable it for this request.",
    );
    expect(isUnknownParameterError(e, "managed_payments")).toBe(false);
  });

  it("ignores an unknown-parameter error about some other field", () => {
    const e = invalidRequest("Received unknown parameter: nonsense_field", "nonsense_field");
    expect(isUnknownParameterError(e, "managed_payments")).toBe(false);
  });

  it("ignores errors that are not Stripe invalid-request errors", () => {
    expect(isUnknownParameterError(new Error("Received unknown parameter: managed_payments"), "managed_payments")).toBe(
      false,
    );
    expect(isUnknownParameterError(null, "managed_payments")).toBe(false);
  });
});

/**
 * The ledger's whole premise is that margin = SUM(amount_minor) over an order.
 * That only holds if every entry is in the same currency. This account prices
 * in EUR and settles in SEK, so Stripe reports the fee in SEK - booking it raw
 * would have made the arithmetic meaningless rather than merely inconsistent.
 */
function bt(over: Partial<Stripe.BalanceTransaction>): Stripe.BalanceTransaction {
  return {
    id: "txn_1",
    object: "balance_transaction",
    amount: 5434,
    currency: "sek",
    fee: 371,
    net: 5063,
    exchange_rate: 11.0905,
    ...over,
  } as Stripe.BalanceTransaction;
}

describe("fee currency", () => {
  it("expresses a settled fee in the currency the customer was charged in", () => {
    // The real first sale: EUR 4.90 settled as SEK 54.34, SEK 3.71 of fee.
    const fee = feeFromBalanceTransaction(
      bt({ source_currency: "eur" } as Partial<Stripe.BalanceTransaction>),
      "ch_1",
    );
    expect(fee.settledMinor).toBe(371);
    expect(fee.settledCurrency).toBe("sek");
    expect(fee.feeMinor).toBe(33); // 371 / 11.0905 = 33.45 cents
    expect(fee.currency).toBe("eur");
    expect(feeWasConverted(fee)).toBe(true);
  });

  it("keeps the settled amount on the entry so the conversion stays auditable", () => {
    const fee = feeFromBalanceTransaction(
      bt({ source_currency: "eur" } as Partial<Stripe.BalanceTransaction>),
      "ch_1",
    );
    expect(feeMemo(fee)).toBe("Stripe processing fee (settled 371 SEK)");
  });

  it("leaves an unconverted fee exactly as Stripe reported it", () => {
    const fee = feeFromBalanceTransaction(bt({ currency: "eur", exchange_rate: null, fee: 32 }), "ch_2");
    expect(fee.feeMinor).toBe(32);
    expect(fee.currency).toBe("eur");
    expect(fee.settledCurrency).toBe("eur");
    expect(feeWasConverted(fee)).toBe(false);
    expect(feeMemo(fee)).toBe("Stripe processing fee");
  });

  it("does not divide by a zero or missing exchange rate", () => {
    expect(feeFromBalanceTransaction(bt({ exchange_rate: 0 }), "ch_3").feeMinor).toBe(371);
    expect(feeFromBalanceTransaction(bt({ exchange_rate: null }), "ch_4").feeMinor).toBe(371);
  });
});

describe("isPermanentlyUnresolvable", () => {
  it("recognises a payment intent that belongs to another Stripe account", () => {
    const e = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message: "No such payment_intent: 'pi_old_account'",
      code: "resource_missing",
    });
    expect(isPermanentlyUnresolvable(e)).toBe(true);
  });

  it("treats anything else as worth retrying", () => {
    const e = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message: "Rate limited",
      code: "lock_timeout",
    });
    expect(isPermanentlyUnresolvable(e)).toBe(false);
    expect(isPermanentlyUnresolvable(new Error("boom"))).toBe(false);
  });
});
