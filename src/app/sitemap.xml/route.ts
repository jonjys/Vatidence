import { sitemapXml } from "@/lib/sitemap";

/**
 * Explicit XML response instead of Next's metadata `app/sitemap.ts`.
 *
 * The metadata helper is an App Router document: production responses
 * `Vary` on RSC headers, and some fetchers (and a cold function path)
 * get a 500 rather than the prerendered XML. A Route Handler is just
 * bytes with a content-type, and the URLs come from CONTACT.productUrl
 * so localhost cannot appear even if APP_URL is unset.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(sitemapXml(), {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
