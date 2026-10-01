import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { redactAnalyticsUrl } from "@/lib/analytics-url";

const ORIGIN = "https://vatidence.nyttolabs.com";

describe("redactAnalyticsUrl", () => {
  it("never reports an order token", () => {
    const token = "whmfEz1FMX0maki0WspeLjsFT_5YX10_";
    for (const raw of [`${ORIGIN}/r/${token}`, `${ORIGIN}/r/${token}/`, `${ORIGIN}/r/${token}#rows`]) {
      const out = redactAnalyticsUrl(raw);
      expect(out).not.toContain(token);
      expect(out).toBe(`${ORIGIN}/r/[token]`);
    }
  });

  it("drops the Stripe session id and every other parameter, keeping only paid/canceled", () => {
    const paid = redactAnalyticsUrl(`${ORIGIN}/r/abc123?paid=1&session_id=cs_live_a1b2c3`);
    expect(paid).toBe(`${ORIGIN}/r/[token]?paid=1`);
    expect(paid).not.toContain("cs_live");
    expect(redactAnalyticsUrl(`${ORIGIN}/r/abc123?canceled=1`)).toBe(`${ORIGIN}/r/[token]?canceled=1`);
    expect(redactAnalyticsUrl(`${ORIGIN}/?vat=SE556677889901&utm_source=x`)).toBe(`${ORIGIN}/`);
    expect(redactAnalyticsUrl(`${ORIGIN}/?paid=yes`)).toBe(`${ORIGIN}/`);
  });

  it("leaves ordinary pages alone and drops unparseable input", () => {
    for (const path of ["/", "/contact", "/terms", "/refunds", "/privacy"]) {
      expect(redactAnalyticsUrl(`${ORIGIN}${path}`)).toBe(`${ORIGIN}${path}`);
    }
    expect(redactAnalyticsUrl("not a url")).toBeNull();
  });

  it("is what the analytics component sends, and the privacy page discloses it", () => {
    const component = readFileSync("src/components/site-analytics.tsx", "utf8");
    expect(component).toMatch(/beforeSend=/);
    expect(component).toMatch(/redactAnalyticsUrl\(event\.url\)/);
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/<SiteAnalytics \/>/);
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toMatch(/Vercel Web Analytics/);
    expect(privacy).not.toMatch(/no analytics/);
  });
});
