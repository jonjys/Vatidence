import type { MetadataRoute } from "next";
import { CONTACT } from "@/lib/contact";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Order pages and downloads are capability URLs: whoever holds the token
      // can read that order. They must never be crawled or indexed.
      disallow: ["/r/", "/api/"],
    },
    sitemap: `${CONTACT.productUrl}/sitemap.xml`,
  };
}
