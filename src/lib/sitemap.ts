import { CONTACT } from "@/lib/contact";

/**
 * Public crawl list. Always the canonical product origin — never APP_URL,
 * never localhost, never a preview hostname. Google should index
 * viesproof.eu, not a Vercel deployment URL, and a missing APP_URL at
 * build time must not take the sitemap down or fill it with loopback.
 *
 * lastmod is content metadata, not a request timestamp: bump it when these
 * pages change.
 */
export const SITEMAP_LASTMOD = "2026-09-04";

const PAGES: ReadonlyArray<{ path: string; changefreq: "monthly" | "yearly"; priority: string }> = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  { path: "/contact", changefreq: "yearly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/refunds", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
];

export function sitemapUrls(): string[] {
  return PAGES.map((page) => `${CONTACT.productUrl}${page.path}`);
}

export function sitemapXml(): string {
  const urls = PAGES.map(
    (page) => `  <url>
    <loc>${CONTACT.productUrl}${page.path}</loc>
    <lastmod>${SITEMAP_LASTMOD}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}
