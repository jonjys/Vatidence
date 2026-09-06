import { describe, expect, it } from "vitest";
import {
  checkoutCancelUrl,
  checkoutProductDescription,
  checkoutSubmitMessage,
  payBlockedHint,
  payCtaLabel,
  stripeChargeNotice,
} from "@/lib/checkout-copy";
import { quote } from "@/lib/pricing";

describe("payCtaLabel", () => {
  it("tells the customer what is missing instead of a mute Pay button", () => {
    expect(payCtaLabel({ busy: false, hasBillableItems: true, requesterOk: false })).toBe(
      "Enter your VAT number to continue",
    );
    expect(payCtaLabel({ busy: false, hasBillableItems: false, requesterOk: true })).toBe(
      "Add VAT numbers to continue",
    );
    expect(payCtaLabel({ busy: true, hasBillableItems: true, requesterOk: true })).toBe("Opening checkout…");
  });

  it("names the Stripe amount, and the floor, once the order can be paid", () => {
    expect(
      payCtaLabel({ busy: false, hasBillableItems: true, requesterOk: true, totalMinor: 490, minimumApplied: true }),
    ).toBe("Pay €4.90 minimum");
    expect(
      payCtaLabel({ busy: false, hasBillableItems: true, requesterOk: true, totalMinor: 585, minimumApplied: false }),
    ).toMatch(/Pay €5\.85/);
  });
});

describe("payBlockedHint", () => {
  it("names the requester VAT requirement and the €4.90 floor", () => {
    const both = payBlockedHint({ hasBillableItems: false, requesterOk: false });
    expect(both).toMatch(/own EU VAT number/);
    expect(both).toMatch(/4\.90/);

    const vat = payBlockedHint({ hasBillableItems: true, requesterOk: false });
    expect(vat).toMatch(/consultation numbers/);
    expect(vat).toMatch(/not billed as a row/);

    const list = payBlockedHint({ hasBillableItems: false, requesterOk: true });
    expect(list).toMatch(/4\.90/);
    expect(list).toMatch(/single number/);
  });

  it("is silent once the order can be paid", () => {
    expect(payBlockedHint({ hasBillableItems: true, requesterOk: true })).toBeNull();
  });
});

describe("stripeChargeNotice", () => {
  it("says Stripe will charge the €4.90 floor for a small batch", () => {
    const line = stripeChargeNotice(quote(1));
    expect(line).toMatch(/Stripe will charge/);
    expect(line).toMatch(/4\.90/);
    expect(line).toMatch(/minimum/);
    expect(line).not.toMatch(/official proof|evidence pack/i);
  });
});

describe("checkout line the customer sees on Stripe", () => {
  it("states the floor on a €4.90 session and does not call the PDF official proof", () => {
    const one = checkoutProductDescription(1, 490);
    expect(one).toMatch(/4\.90/);
    expect(one).toMatch(/minimum/);
    expect(one).toMatch(/Not tax advice/);
    expect(one).not.toMatch(/evidence pack|official proof/i);

    const big = checkoutProductDescription(15, 585);
    expect(big).not.toMatch(/minimum/);
    expect(big).toMatch(/Not tax advice/);
  });

  it("repeats the floor on the Checkout submit helper for a minimum order", () => {
    const msg = checkoutSubmitMessage("https://viesproof.eu/r/tok", 1, 490, "Sold by Nytto Labs.");
    expect(msg).toMatch(/4\.90/);
    expect(msg).toMatch(/minimum/);
    expect(msg).toContain("https://viesproof.eu/r/tok");
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
