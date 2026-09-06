import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function markdownFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

describe("first-customer docs", () => {
  const files = markdownFiles("docs");
  const outreach = readFileSync("docs/outreach.md", "utf8");
  const smoke = readFileSync("docs/checkout-smoke-test.md", "utf8");

  it("ships outreach copy and a checkout smoke test", () => {
    expect(files.sort()).toEqual(["docs/checkout-smoke-test.md", "docs/outreach.md"]);
  });

  it("has English and Swedish email plus LinkedIn templates", () => {
    expect(outreach).toMatch(/VIES consultation numbers without the 40-second/);
    expect(outreach).toMatch(/VIES-konsultationsnummer utan 40 sekunder/);
    expect(outreach).toMatch(/LinkedIn DM — English/);
    expect(outreach).toMatch(/LinkedIn DM — Swedish/);
    expect(outreach).toMatch(/If they already used the free check/);
    expect(outreach).toMatch(/zero successful PaymentIntents|expire unpaid/);
    expect(outreach).toContain("https://viesproof.eu");
    expect(outreach).toContain("hello@nyttolabs.com");
  });

  it("does not invent reviews, traffic, or a private mailbox", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/@(gmail|hotmail)\.com/i);
    expect(all).not.toMatch(/fkornelind/i);
    expect(all).not.toMatch(/\bSE\d{10,12}\b/);
    expect(all).not.toMatch(/5-star|trusted by \d+|already used by \d+/i);
  });

  it("tells the operator how to smoke-test without taking a live card", () => {
    expect(smoke).toMatch(/sk_test_/);
    expect(smoke).toMatch(/4242 4242 4242 4242/);
    expect(smoke).toMatch(/cs_live_/);
    expect(smoke).toMatch(/zero successful PaymentIntents|unproven/i);
    expect(smoke).toMatch(/Do \*\*not\*\* complete a livemode payment/);
    expect(smoke).toMatch(/checkoutCancelUrl|relist/);
    expect(smoke).toMatch(/Managed Payments/);
    expect(smoke).toMatch(/Deployment Protection/);
  });
});
