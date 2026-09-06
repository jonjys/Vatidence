import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("free-to-paid handoff", () => {
  const free = readFileSync("src/components/free-check.tsx", "utf8");
  const form = readFileSync("src/components/order-form.tsx", "utf8");

  it("makes the escalate action a primary button, not a text link", () => {
    expect(free).toContain('className="escalate"');
    expect(free).not.toMatch(/className="link"/);
    expect(free).toContain("MINIMUM_ORDER_MINOR");
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
});
