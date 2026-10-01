// Vercel Web Analytics records the URL of every page view. Two kinds of URL on
// this site must never leave the browser as-is:
//
// - /r/<token> is an order's only credential (see the privacy page): anyone
//   holding it can read the order. It is reported as /r/[token].
// - Stripe's success redirect appends ?session_id=cs_live_..., and other query
//   strings can carry anything a visitor pasted. Every parameter is dropped
//   except the two flags that make the checkout funnel readable without custom
//   events (not available on the Hobby plan): paid=1 and canceled=1.
const KEPT_FLAGS = ["paid", "canceled"] as const;

export function redactAnalyticsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/^\/r\/.+/, "/r/[token]");
  const kept = new URLSearchParams();
  for (const flag of KEPT_FLAGS) {
    if (url.searchParams.get(flag) === "1") kept.set(flag, "1");
  }
  const query = kept.toString();
  return `${url.origin}${path}${query ? `?${query}` : ""}`;
}
