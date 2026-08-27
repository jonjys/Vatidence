import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * When the content of these pages last actually changed.
 *
 * This was `new Date()`, which stamped every regeneration with the instant it
 * happened - so the sitemap claimed, to the millisecond, that the terms and
 * the privacy notice had changed again on every single fetch. Google discards
 * a `lastmod` it judges inaccurate, and "always exactly now" is the clearest
 * possible signal of that.
 *
 * It is content metadata, not a build timestamp: bump it when these pages
 * change, and leave it alone for a deploy that does not touch them.
 */
const CONTENT_LAST_MODIFIED = "2026-08-27";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/terms`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/refunds`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/privacy`, lastModified: CONTENT_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
