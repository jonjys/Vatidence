import { CONTACT } from "@/lib/contact";

/**
 * The public origin, read directly from process.env rather than the validated
 * env(): metadata, robots.txt and the sitemap are evaluated at build time, and
 * a local build without APP_URL must not fail.
 *
 * Trailing slashes are stripped here for the same reason as in env.ts - this
 * value is concatenated with paths.
 *
 * Production (VERCEL_ENV=production) must never fall back to localhost: that
 * would ship loopback URLs in the canonical, OpenGraph, sitemap and robots.
 * If APP_URL is unset there, use the canonical product origin instead.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;

export function resolveSiteUrl(appUrl: string | undefined, vercelEnv: string | undefined): string {
  const fallback = vercelEnv === "production" ? CONTACT.productUrl : "http://localhost:3000";
  const raw = (appUrl ?? fallback).replace(/\/+$/, "");
  if (vercelEnv === "production") {
    let host: string;
    try {
      host = new URL(raw).hostname;
    } catch {
      throw new Error("APP_URL must be an absolute URL in production");
    }
    if (LOOPBACK_HOST.test(host)) {
      throw new Error("APP_URL must not be localhost in production; metadata would ship loopback URLs.");
    }
  }
  return raw;
}

export const siteUrl = resolveSiteUrl(process.env.APP_URL, process.env.VERCEL_ENV);
