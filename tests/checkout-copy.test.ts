import { describe, expect, it } from "vitest";
import { checkoutCancelUrl, payBlockedHint, payCtaLabel } from "@/lib/checkout-copy";

describe("payCtaLabel", () => {
  it("tells the customer what is missing instead of a mute Pay button", () => {
    expect(payCtaLabel({ busy: false, hasBillableItems: true, requesterOk: false })).toBe(
      "Enter your VAT number to continue",
    );
    expect(payCtaLabel({ busy: false, hasBillableItems: false, requesterOk: true })).toBe(
      "Add VAT numbers to continue",
    );
    expect(payCtaLabel({ busy: false, hasBillableItems: true, requesterOk: true })).toBe("Pay and verify");
    expect(payCtaLabel({ busy: true, hasBillableItems: true, requesterOk: true })).toBe("Opening checkout…");
  });
});

describe("payBlockedHint", () => {
  it("names the requester VAT requirement and the €4.90 floor", () => {
    const both = payBlockedHint({ hasBillableItems: false, requesterOk: false });
    expect(both).toMatch(/own EU VAT number/);
    expect(both).toMatch(/4\.90/);

    const vat = payBlockedHint({ hasBillableItems: true, requesterOk: false });
    expect(vat).toMatch(/consultation numbers/);
    expect(vat).toMatch(/own EU VAT number/);

    const list = payBlockedHint({ hasBillableItems: false, requesterOk: true });
    expect(list).toMatch(/4\.90/);
    expect(list).toMatch(/single number/);
  });

  it("is silent once the order can be paid", () => {
    expect(payBlockedHint({ hasBillableItems: true, requesterOk: true })).toBeNull();
  });
});

describe("checkoutCancelUrl", () => {
  it("returns the customer to the form with the same list, not a dead result page", () => {
    expect(checkoutCancelUrl("https://viesproof.eu", "tok_abc")).toBe(
      "https://viesproof.eu/?relist=tok_abc&canceled=1",
    );
    expect(checkoutCancelUrl("https://viesproof.eu/", "tok_abc")).toBe(
      "https://viesproof.eu/?relist=tok_abc&canceled=1",
    );
  });
});
