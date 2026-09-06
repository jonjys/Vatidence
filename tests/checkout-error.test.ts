import { describe, expect, it } from "vitest";
import {
  CHECKOUT_NETWORK,
  CHECKOUT_NOT_STARTED,
  CHECKOUT_UNAVAILABLE,
  checkoutErrorMessage,
  messageFromErrorBody,
} from "@/lib/checkout-error";

describe("checkoutErrorMessage", () => {
  it("says nothing was charged on a 502, even when the body is HTML or generic", () => {
    expect(checkoutErrorMessage(502, null)).toBe(CHECKOUT_NOT_STARTED);
    expect(checkoutErrorMessage(502, { error: "order_failed", message: "Could not start checkout. Please try again." })).toBe(
      CHECKOUT_NOT_STARTED,
    );
    expect(checkoutErrorMessage(504, "<html>Gateway timeout</html>")).toBe(CHECKOUT_NOT_STARTED);
  });

  it("says nothing was charged on a 503", () => {
    expect(checkoutErrorMessage(503, null)).toBe(CHECKOUT_UNAVAILABLE);
    expect(checkoutErrorMessage(503, { message: "The service is temporarily unavailable. Please try again." })).toBe(
      "The service is temporarily unavailable. Please try again.",
    );
  });

  it("keeps the server's 429 and 400 wording", () => {
    expect(checkoutErrorMessage(429, { message: "Too many orders from this address. Try again shortly." })).toMatch(
      /Too many orders/,
    );
    expect(checkoutErrorMessage(400, { message: `"DE" does not match the DE VAT number format.` })).toContain("does not match");
    expect(checkoutErrorMessage(400, null)).toBe("Could not start checkout. Please try again.");
  });

  it("reads a message only from a JSON-shaped body", () => {
    expect(messageFromErrorBody({ message: "  hello  " })).toBe("hello");
    expect(messageFromErrorBody(null)).toBeNull();
    expect(messageFromErrorBody("not json")).toBeNull();
  });

  it("exposes a network copy that does not blame the customer for a drop", () => {
    expect(CHECKOUT_NETWORK).toMatch(/have not been charged/);
  });
});
