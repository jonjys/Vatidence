"use client";

import { Analytics } from "@vercel/analytics/react";
import { redactAnalyticsUrl } from "@/lib/analytics-url";

// Cookieless page-view counting, served from this domain (/_vercel/insights).
// Every URL goes through redactAnalyticsUrl first so order tokens and Stripe
// session ids are never recorded.
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = redactAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
