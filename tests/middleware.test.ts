import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "@/middleware";

function requestTo(url: string, host: string): NextRequest {
  return new NextRequest(url, { headers: { host } });
}

describe("middleware", () => {
  it("redirects the old apex domain to the new one, permanently, preserving path and query", () => {
    const res = middleware(requestTo("https://viesproof.eu/terms?ref=x", "viesproof.eu"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://vatidence.nyttolabs.com/terms?ref=x");
  });

  it("redirects the old www subdomain too", () => {
    const res = middleware(requestTo("https://www.viesproof.eu/", "www.viesproof.eu"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://vatidence.nyttolabs.com/");
  });

  it("does not redirect requests already on the new domain", () => {
    const res = middleware(requestTo("https://vatidence.nyttolabs.com/", "vatidence.nyttolabs.com"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("excludes /api/* from the matcher so Stripe's webhook is never redirected", () => {
    expect(config.matcher).toEqual(["/((?!api/).*)"]);
  });
});
