import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Order pages and downloads are capability URLs: whoever holds the token
      // can read that order. They must never be crawled or indexed.
      // Shared /check/<number> links run a live VIES lookup on every open; a
      // crawler following them would spend the Commission's capacity on nobody.
      disallow: ["/r/", "/api/", "/check/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
