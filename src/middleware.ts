import { NextResponse, type NextRequest } from "next/server";

/**
 * The product moved from viesproof.eu to vatidence.nyttolabs.com. Stripe's
 * webhook is still configured against the old domain until the dashboard
 * endpoint is updated by hand, and a redirect breaks a POST outright - Stripe
 * does not follow redirects on webhook deliveries. Excluding /api/* here (and
 * in the matcher below) keeps that endpoint working, unmodified, for as long
 * as the switch takes.
 */
const OLD_HOSTS = new Set(["viesproof.eu", "www.viesproof.eu"]);
const NEW_HOST = "vatidence.nyttolabs.com";

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get("host") ?? "";
  if (!OLD_HOSTS.has(host)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = NEW_HOST;
  url.port = "";
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ["/((?!api/).*)"],
};
