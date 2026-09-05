import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/site";

describe("resolveSiteUrl", () => {
  it("falls back to localhost for a local build without APP_URL", () => {
    expect(resolveSiteUrl(undefined, undefined)).toBe("http://localhost:3000");
    expect(resolveSiteUrl(undefined, "development")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes so generated URLs never double up", () => {
    expect(resolveSiteUrl("https://viesproof.eu/", undefined)).toBe("https://viesproof.eu");
    expect(resolveSiteUrl("https://viesproof.eu///", "production")).toBe("https://viesproof.eu");
  });

  it("uses the canonical product origin on Vercel when APP_URL is unset", () => {
    expect(resolveSiteUrl(undefined, "production")).toBe("https://viesproof.eu");
    expect(resolveSiteUrl(undefined, "preview")).toBe("https://viesproof.eu");
  });

  it("refuses to ship localhost in Vercel metadata", () => {
    expect(() => resolveSiteUrl("http://localhost:3000", "production")).toThrow(/localhost/);
    expect(() => resolveSiteUrl("http://127.0.0.1:3000", "preview")).toThrow(/localhost/);
  });

  it("treats a blank APP_URL as unset rather than building an invalid URL", () => {
    // `APP_URL=` in a .env file. Without this the empty string survives and
    // `new URL(siteUrl)` in the layout dies with a bare "Invalid URL".
    expect(resolveSiteUrl("", undefined)).toBe("http://localhost:3000");
    expect(resolveSiteUrl("   ", undefined)).toBe("http://localhost:3000");
    expect(resolveSiteUrl("", "production")).toBe("https://viesproof.eu");
    expect(() => new URL(resolveSiteUrl("", undefined))).not.toThrow();
  });

  it("keeps an explicit public APP_URL in production", () => {
    expect(resolveSiteUrl("https://viesproof.eu", "production")).toBe("https://viesproof.eu");
  });
});
