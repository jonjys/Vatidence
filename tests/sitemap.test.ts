import { describe, expect, it } from "vitest";
import { GET } from "@/app/sitemap.xml/route";
import { CONTACT } from "@/lib/contact";
import { SITEMAP_LASTMOD, sitemapUrls, sitemapXml } from "@/lib/sitemap";

const { default: robots } = await import("@/app/robots");

describe("sitemap", () => {
  it("is pinned to the canonical product origin, not APP_URL or localhost", () => {
    expect(sitemapUrls()).toEqual([
      "https://viesproof.eu/",
      "https://viesproof.eu/contact",
      "https://viesproof.eu/terms",
      "https://viesproof.eu/refunds",
      "https://viesproof.eu/privacy",
    ]);
    expect(CONTACT.productUrl).toBe("https://viesproof.eu");
  });

  it("dates the content, not the moment of the request", () => {
    expect(SITEMAP_LASTMOD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sitemapXml()).toContain(`<lastmod>${SITEMAP_LASTMOD}</lastmod>`);
    expect(sitemapXml()).toBe(sitemapXml());
  });

  it("never lists an order page, whose token is the only thing protecting it", () => {
    expect(sitemapXml()).not.toContain("/r/");
  });

  it("never contains localhost, even if APP_URL is a loopback", () => {
    expect(sitemapXml()).not.toMatch(/localhost|127\.0\.0\.1/i);
  });

  it("answers GET /sitemap.xml as XML without going through the metadata helper", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/xml/);
    const body = await res.text();
    expect(body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(body).toContain("<urlset");
    expect(body).toContain("https://viesproof.eu/privacy");
    expect(body).not.toContain("localhost");
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
    expect(String(r.sitemap)).not.toContain("localhost");
  });
});
