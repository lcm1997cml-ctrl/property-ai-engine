/**
 * SEO helpers — single source of truth for canonical URL, OG/Twitter
 * defaults, JSON-LD generators.
 *
 * Production: set NEXT_PUBLIC_SITE_URL=https://yourdomain.com in Vercel
 * env vars so canonical URLs / sitemap / OG resolve correctly.
 */

import type { Metadata } from "next";
import { SITE_CONFIG } from "./config";

/** Canonical site URL. Falls back to a local dev placeholder. */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Build an absolute URL for a relative path. */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Default Metadata applied to every page via app/layout.tsx.
 * Per-page metadata only needs to override what's different.
 */
export function defaultMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: SITE_CONFIG.name,
      template: `%s | ${SITE_CONFIG.name}`,
    },
    description: SITE_CONFIG.description,
    applicationName: SITE_CONFIG.name,
    keywords: [
      "香港樓盤", "香港新樓", "新樓盤", "樓盤搜尋", "二手樓",
      "新盤推介", "按揭計算機", "樓盤比較", "啟德新盤", "將軍澳新盤",
      "沙田樓盤", "馬鞍山樓盤", "元朗樓盤", "大埔樓盤", "Hong Kong property",
    ],
    authors: [{ name: SITE_CONFIG.name }],
    creator: SITE_CONFIG.name,
    publisher: SITE_CONFIG.name,
    formatDetection: {
      telephone: false,
      email: false,
      address: false,
    },
    openGraph: {
      type: "website",
      locale: "zh_HK",
      url: SITE_URL,
      siteName: SITE_CONFIG.name,
      title: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical: SITE_URL,
      languages: {
        "zh-HK": SITE_URL,
      },
    },
    category: "real estate",
  };
}

/**
 * JSON-LD Organization schema — included site-wide (in app/layout.tsx).
 * Helps Google associate the site with a brand entity.
 */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: SITE_CONFIG.name,
    url: SITE_URL,
    description: SITE_CONFIG.description,
    areaServed: {
      "@type": "Place",
      name: "Hong Kong",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: `+${SITE_CONFIG.whatsappNumber}`,
      availableLanguage: ["zh-HK", "yue", "en"],
    },
  };
}

/**
 * JSON-LD WebSite schema with sitelinks SearchBox.
 * Lets Google show a site-search box in the SERP.
 */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.name,
    url: SITE_URL,
    inLanguage: "zh-HK",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?district={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

interface ListingForJsonLd {
  slug: string;
  estateName: string;
  titleZh?: string;
  titleEn?: string;
  district: string;
  subDistrict?: string;
  address?: string;
  price: number;
  priceMax?: number;
  saleableArea: number;
  saleableAreaMax?: number;
  bedrooms: number;
  description?: string;
  descriptionZh?: string;
  developer?: string;
  completionYear?: number;
  imageUrl?: string;
  status?: string;
  dataCompleteness?: "full" | "partial";
}

/**
 * JSON-LD for a single property listing.
 *
 * We use schema.org `Residence` + `RealEstateListing` (latter is the more
 * specific type Google understands for SERP rich cards). Includes price
 * spec, geo (district as locality), and floor area in square feet.
 */
export function listingJsonLd(listing: ListingForJsonLd): Record<string, unknown> {
  const name = listing.titleZh ?? listing.titleEn ?? listing.estateName;
  const url = absoluteUrl(`/listing/${listing.slug}`);
  const isPartial = listing.dataCompleteness === "partial";
  const isSoldOut = listing.status === "sold_out";

  const offers: Record<string, unknown> | undefined =
    isPartial || isSoldOut || !listing.price
      ? undefined
      : {
          "@type": "Offer",
          priceCurrency: "HKD",
          price: listing.price,
          ...(listing.priceMax && listing.priceMax > listing.price
            ? { highPrice: listing.priceMax, lowPrice: listing.price }
            : {}),
          availability: isSoldOut
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
          url,
        };

  const area =
    listing.saleableArea > 0
      ? {
          "@type": "QuantitativeValue",
          value: listing.saleableArea,
          unitCode: "FTK", // square feet UN/CEFACT code
          unitText: "ft²",
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name,
    url,
    description:
      listing.descriptionZh ??
      listing.description ??
      `${name} — ${listing.district}${listing.subDistrict ? ` · ${listing.subDistrict}` : ""} 樓盤資訊`,
    image: listing.imageUrl ? [listing.imageUrl] : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.district,
      addressRegion: "Hong Kong",
      addressCountry: "HK",
      streetAddress: listing.address ?? undefined,
    },
    numberOfRooms: listing.bedrooms >= 0 && listing.bedrooms <= 8 ? listing.bedrooms : undefined,
    floorSize: area,
    yearBuilt: listing.completionYear ?? undefined,
    offers,
    additionalProperty: listing.developer
      ? [{ "@type": "PropertyValue", name: "Developer", value: listing.developer }]
      : undefined,
  };
}

/**
 * JSON-LD BreadcrumbList — surfaces breadcrumb chips in Google SERP.
 */
export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : absoluteUrl(item.url),
    })),
  };
}

/**
 * Build a one-line description suitable for OG / meta tags.
 */
export function buildListingDescription(listing: ListingForJsonLd): string {
  const name = listing.titleZh ?? listing.titleEn ?? listing.estateName;
  const parts: string[] = [];
  parts.push(name);
  parts.push(listing.district);
  if (listing.subDistrict) parts.push(listing.subDistrict);
  if (listing.bedrooms >= 0 && listing.bedrooms <= 8 && listing.bedrooms > 0) {
    parts.push(`${listing.bedrooms}房`);
  } else if (listing.bedrooms === 0) {
    parts.push("開放式");
  }
  if (listing.saleableArea > 0) parts.push(`實用 ${listing.saleableArea}呎²`);
  if (listing.dataCompleteness !== "partial" && listing.price > 0) {
    const wan = Math.round(listing.price / 10_000);
    parts.push(`約 ${wan}萬`);
  }
  if (listing.descriptionZh) {
    return `${parts.join(" · ")} ｜ ${listing.descriptionZh.slice(0, 80)}`;
  }
  return parts.join(" · ");
}
