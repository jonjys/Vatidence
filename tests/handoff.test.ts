import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("free-to-paid handoff", () => {
  const free = readFileSync("src/components/free-check.tsx", "utf8");
  const form = readFileSync("src/components/order-form.tsx", "utf8");

  it("makes the escalate action a primary button, not a text link", () => {
    expect(free).toContain('className="escalate"');
    expect(free).not.toMatch(/className="link"/);
    expect(free).toContain("MINIMUM_ORDER_MINOR");
    expect(free).toMatch(/Start a paid verification/);
    expect(free).toMatch(/Next step is a paid verification/);
  });

  it("makes the €4.90 floor obvious next to the live price and the published table", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    expect(home).toContain("minimumFloorExplanation");
    expect(home).toContain("Tier rate per number");
    expect(form).toContain("formatLiveQuoteHint");
    expect(form).toContain("minimumFloorExplanation");
    expect(form).toContain("billable");
    expect(form).toContain("pay-needs");
    expect(form).toContain("payCtaLabel");
    expect(form).toContain("payBlockedHint");
  });

  it("lands the free-check number in the batch and scrolls to the order form", () => {
    expect(form).toContain("seed.vatNumber");
    expect(form).toContain('getElementById("order")');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('id="order"');
  });

  it("exposes an example list and a clear action", () => {
    expect(form).toContain("Load example list");
    expect(form).toContain("Clear list");
    expect(form).toContain("exampleVatListText");
  });

  it("surfaces 502/503 checkout failures as not-charged, not a network blame", () => {
    expect(form).toContain("checkoutErrorMessage");
    expect(form).toContain("CHECKOUT_NETWORK");
    expect(form).toContain("readJsonBody");
  });

  it("returns a cancelled checkout to the form with the list, not a dead result page", () => {
    const stripe = readFileSync("src/lib/stripe.ts", "utf8");
    const result = readFileSync("src/app/r/[token]/page.tsx", "utf8");
    expect(stripe).toContain("checkoutCancelUrl");
    expect(form).toContain("canceled");
    expect(result).toContain("Return to the form with this list");
    expect(result).toContain("relist");
  });
});
