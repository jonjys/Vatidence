import { CONTACT } from "@/lib/contact";

/**
 * The public origin, read directly from process.env rather than the validated
 * env(): metadata, robots.txt and the sitemap are evaluated at build time, and
 * a local build without APP_URL must not fail.
 *
 * Trailing slashes are stripped here for the same reason as in env.ts - this
 * value is concatenated with paths.
 *
 * Vercel production *and* preview builds must never fall back to localhost:
 * that would ship loopback URLs in the canonical, OpenGraph, sitemap and robots
 * on a public hostname. If APP_URL is unset there, use the canonical product
 * origin instead. Sitemap XML does not use this module at all: it is pinned
 * to CONTACT.productUrl so a missing APP_URL cannot 500 the crawl file or
 * fill it with loopback URLs.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;

function shipsPublicly(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production" || vercelEnv === "preview";
}

export function resolveSiteUrl(
  appUrl: string | undefined,
  vercelEnv: string | undefined,
  vercelFlag?: string,
): string {
  const publicShip = shipsPublicly(vercelEnv) || vercelFlag === "1";
  const fallback = publicShip ? CONTACT.productUrl : "http://localhost:3000";
  const raw = (appUrl ?? fallback).replace(/\/+$/, "");
  if (publicShip) {
    let host: string;
    try {
      host = new URL(raw).hostname;
    } catch {
      throw new Error("APP_URL must be an absolute URL on Vercel");
    }
    if (LOOPBACK_HOST.test(host)) {
      throw new Error("APP_URL must not be localhost on Vercel; metadata would ship loopback URLs.");
    }
  }
  return raw;
}

export const siteUrl = resolveSiteUrl(process.env.APP_URL, process.env.VERCEL_ENV, process.env.VERCEL);
