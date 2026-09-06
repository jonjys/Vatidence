import { describe, expect, it } from "vitest";

process.env.APP_URL = "https://viesproof.eu/";

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

describe("sitemap", () => {
  it("reports the same lastModified on every call", async () => {
    // Regression: this used to be `new Date()`, so two fetches a second apart
    // disagreed and every page looked freshly changed on each regeneration.
    const a = sitemap();
    await new Promise((r) => setTimeout(r, 5));
    const b = sitemap();
    expect(a.map((e) => e.lastModified)).toEqual(b.map((e) => e.lastModified));
  });

  it("dates the content, not the moment of the request", () => {
    for (const entry of sitemap()) {
      expect(String(entry.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lists exactly the public pages, absolute and without a double slash", () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://viesproof.eu/",
      "https://viesproof.eu/sv",
      "https://viesproof.eu/contact",
      "https://viesproof.eu/terms",
      "https://viesproof.eu/refunds",
      "https://viesproof.eu/privacy",
    ]);
  });

  it("never lists an order page, whose token is the only thing protecting it", () => {
    expect(sitemap().some((e) => e.url.includes("/r/"))).toBe(false);
  });
});

describe("robots", () => {
  it("keeps crawlers out of order pages and the API, and points at the sitemap", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const disallow = rules.flatMap((rule) =>
      rule?.disallow === undefined ? [] : Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow],
    );
    expect(disallow).toContain("/r/");
    expect(disallow).toContain("/api/");
    expect(r.sitemap).toBe("https://viesproof.eu/sitemap.xml");
  });
});
