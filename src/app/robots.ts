import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Order pages and downloads are capability URLs: whoever holds the token
      // can read that order. They must never be crawled or indexed.
      disallow: ["/r/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
