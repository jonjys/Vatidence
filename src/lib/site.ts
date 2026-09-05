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
 * origin instead. A local `next build` still uses localhost.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;

function shipsPublicly(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production" || vercelEnv === "preview";
}

export function resolveSiteUrl(appUrl: string | undefined, vercelEnv: string | undefined): string {
  const fallback = shipsPublicly(vercelEnv) ? CONTACT.productUrl : "http://localhost:3000";
  // `APP_URL=` with nothing after it is a realistic mistake in a .env file, and
  // `??` does not catch it. Left as "", it reaches `new URL(siteUrl)` in the
  // layout and fails the build with a bare "Invalid URL" naming nothing.
  const given = appUrl?.trim();
  const raw = (given === undefined || given === "" ? fallback : given).replace(/\/+$/, "");
  if (shipsPublicly(vercelEnv)) {
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

export const siteUrl = resolveSiteUrl(process.env.APP_URL, process.env.VERCEL_ENV);
