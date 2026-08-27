import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { isUnknownParameterError } from "@/lib/stripe";

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
