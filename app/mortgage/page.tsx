import type { Metadata } from "next";
import MortgageCalculator from "./MortgageCalculator";
import { getAllListings } from "@/services/listingService";
import { parsePropertyPriceInput } from "@/lib/formatters";
import { absoluteUrl } from "@/lib/seo";

const mortgageDescription =
  "香港按揭計算機 — 輸入樓價即時計算每月供款，並推薦預算範圍內的樓盤。支援不同年期、利率、首期。";

export const metadata: Metadata = {
  title: "按揭計算機",
  description: mortgageDescription,
  alternates: {
    canonical: absoluteUrl("/mortgage"),
    languages: { "zh-HK": absoluteUrl("/mortgage") },
  },
  openGraph: {
    type: "website",
    url: absoluteUrl("/mortgage"),
    title: "按揭計算機",
    description: mortgageDescription,
    siteName: "香港樓盤搜尋",
    locale: "zh_HK",
  },
  twitter: {
    card: "summary_large_image",
    title: "按揭計算機",
    description: mortgageDescription,
  },
  keywords: ["按揭計算機", "按揭月供", "樓宇按揭", "Hong Kong mortgage calculator"],
};

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function MortgagePage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Allow pre-filling price from listing detail page (?price=11400000 or ?price=11,400,000)
  const rawPrice = params.price;
  const parsed =
    typeof rawPrice === "string" ? parsePropertyPriceInput(rawPrice) : NaN;
  const initialPrice =
    typeof rawPrice === "string" && Number.isFinite(parsed) && parsed > 0
      ? parsed
      : undefined;

  const allListings = await getAllListings();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">按揭計算機</h1>
        <p className="text-sm text-gray-500">計算每月按揭供款，並即時推薦預算範圍內的樓盤</p>
      </div>
      <MortgageCalculator initialPrice={initialPrice} allListings={allListings} />
    </div>
  );
}
