import type { MetadataRoute } from "next";
import { searchListings } from "@/services/listingService";
import { DISTRICTS } from "@/types/listing";

/**
 * Dynamic sitemap — listed at /sitemap.xml.
 *
 * Includes: static pages + every district search-result page + every active
 * listing detail page. Updated on every revalidation.
 *
 * Production: set NEXT_PUBLIC_SITE_URL to your canonical domain before launch.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${host}/`,        changeFrequency: "daily",   priority: 1.0 },
    { url: `${host}/search`,  changeFrequency: "hourly",  priority: 0.9 },
    { url: `${host}/compare`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${host}/mortgage`,changeFrequency: "monthly", priority: 0.6 },
    { url: `${host}/privacy`, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${host}/terms`,   changeFrequency: "yearly",  priority: 0.3 },
    { url: `${host}/contact`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const districtRoutes: MetadataRoute.Sitemap = DISTRICTS.map((d) => ({
    url: `${host}/search?district=${encodeURIComponent(d)}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  // Listing detail pages — fetch all active, non-partial listings
  let listingRoutes: MetadataRoute.Sitemap = [];
  try {
    const listings = await searchListings({});
    listingRoutes = listings
      .filter((l) => l.status !== "sold_out")
      .map((l) => ({
        url: `${host}/listing/${l.slug}`,
        lastModified: l.lastSeenAt ? new Date(l.lastSeenAt) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch {
    // Silent — sitemap still useful with static routes if DB is unreachable
  }

  return [...staticRoutes, ...districtRoutes, ...listingRoutes];
}
