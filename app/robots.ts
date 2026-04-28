import type { MetadataRoute } from "next";

/**
 * Search-engine crawler directives.
 *
 * Allows public pages, blocks API + crawler control endpoints. Update
 * `host` to the canonical production URL before launch.
 */
export default function robots(): MetadataRoute.Robots {
  const host = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/_next/", "/admin/"],
      },
    ],
    sitemap: `${host}/sitemap.xml`,
    host,
  };
}
