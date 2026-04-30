import type { Metadata } from "next";
import { Suspense } from "react";
import SearchFilters from "@/components/properties/SearchFilters";
import SearchResults from "./SearchResults";
import {
  searchListings,
  computeMarketSummary,
  getSearchDistrictOptions,
} from "@/services/listingService";
import type { SearchParams, BedroomFilter, MarketFocus } from "@/types/listing";
import { absoluteUrl } from "@/lib/seo";

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

// ISR: each unique filter combo gets cached for 30 minutes. Subsequent
// visitors hitting the same /search?district=X&bedrooms=Y URL hit edge cache.
export const revalidate = 1800;

function parseBedroomsParam(raw: string | undefined): BedroomFilter | undefined {
  if (!raw) return undefined;
  if (raw === "4plus" || raw === "gte4") return "gte4";
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseMarketFocus(raw: string | undefined): MarketFocus | undefined {
  if (raw === "new" || raw === "secondary") return raw;
  return undefined;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const district = params.district || "";
  const maxPrice =
    params.floor15m === "1"
      ? "1500萬以上"
      : params.maxPrice
        ? `${Number(params.maxPrice) / 10000}萬以下`
        : "";
  const bedrooms =
    params.bedrooms === "4plus" || params.bedrooms === "gte4"
      ? "4房或以上"
      : params.bedrooms === "0"
        ? "開放式"
        : params.bedrooms
          ? `${params.bedrooms}房`
          : "";
  const focus =
    params.focus === "new"
      ? "新樓"
      : params.focus === "secondary"
        ? "精選二手比較"
        : "";
  const minPriceLabel =
    params.minPrice && params.floor15m !== "1"
      ? `${Number(params.minPrice) / 10000}萬起`
      : "";
  const parts = [district, focus, bedrooms, maxPrice, minPriceLabel].filter(Boolean);
  const title = parts.length ? `${parts.join(" ")} 樓盤搜尋` : "搜尋樓盤";

  const description = parts.length
    ? `${parts.join("、")} 香港樓盤搜尋。新盤為主，附精選同區二手對比，附按揭月供計算。`
    : "搜尋香港新樓盤、二手對比參考、按揭計算 — 一站搞掂。";

  // Canonical URL — strip transient sort params, keep filter params so each
  // filtered view has its own canonical / OG.
  const canonicalParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    if (["sortBy", "page"].includes(k)) continue;
    canonicalParams.set(k, v);
  }
  const qs = canonicalParams.toString();
  const canonical = absoluteUrl(`/search${qs ? `?${qs}` : ""}`);

  return {
    title,
    description,
    alternates: { canonical, languages: { "zh-HK": canonical } },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: "香港樓盤搜尋",
      locale: "zh_HK",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const districtOptions = await getSearchDistrictOptions();

  const serviceParams: SearchParams = {
    district: (params.district as SearchParams["district"]) || undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    priceFloor1500: params.floor15m === "1",
    bedrooms: parseBedroomsParam(params.bedrooms),
    minArea: params.minArea && Number.isFinite(Number(params.minArea))
      ? Number(params.minArea)
      : undefined,
    maxArea: params.maxArea && Number.isFinite(Number(params.maxArea))
      ? Number(params.maxArea)
      : undefined,
    marketFocus: parseMarketFocus(params.focus),
    sortBy: (params.sortBy as SearchParams["sortBy"]) || undefined,
    priceKnown: params.priceKnown === "1" || undefined,
  };

  const listings = await searchListings(serviceParams);
  const summary = computeMarketSummary(listings);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">搜尋樓盤</h1>
        <p className="text-sm text-gray-500">
          以新盤為主，精選同區二手作比較參考——幫你更快作決定。
        </p>
      </div>

      {/* Filters — client component */}
      <Suspense>
        <SearchFilters districtOptions={districtOptions} />
      </Suspense>

      {/* Results — receives pre-fetched data from server */}
      <SearchResults params={params} listings={listings} summary={summary} />
    </div>
  );
}
