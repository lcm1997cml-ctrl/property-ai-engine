import type { Metadata } from "next";
import { Suspense } from "react";
import CompareContent from "./CompareContent";
import { getAllListings, getListingsByIds } from "@/services/listingService";

export const metadata: Metadata = { title: "比較樓盤" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[]>>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  // ids can be repeated: ?ids=lst-001&ids=lst-002 or ?ids=lst-001,lst-002
  const rawIds = params.ids;
  let ids: string[] = [];
  if (Array.isArray(rawIds)) {
    ids = rawIds;
  } else if (typeof rawIds === "string") {
    ids = rawIds.includes(",") ? rawIds.split(",") : [rawIds];
  }

  const [allListings, initialListings] = await Promise.all([
    getAllListings(),
    ids.length > 0 ? getListingsByIds(ids) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">比較樓盤</h1>
        <p className="text-sm text-gray-500">最多同時比較4個樓盤，輕鬆找出最適合的選擇</p>
      </div>
      <Suspense>
        <CompareContent
          initialIds={ids.slice(0, 4)}
          allListings={allListings}
          initialListings={initialListings.slice(0, 4)}
        />
      </Suspense>
    </div>
  );
}
