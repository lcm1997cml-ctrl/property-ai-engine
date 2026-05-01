import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Building2, Clock, ExternalLink, ArrowLeft, AlertTriangle,
  Calendar, FileText, LayoutGrid, Calculator,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import { getListingBySlug } from "@/services/listingService";
import { SITE_CONFIG, buildWhatsAppUrl } from "@/lib/config";
import { buildListingInquiryMessage } from "@/lib/whatsappMessages";
import {
  formatPrice, formatPriceRange, formatArea,
} from "@/lib/formatters";
import { formatRoomTypePsf } from "@/lib/roomTypeDisplay";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  buildListingDescription,
  listingJsonLd,
} from "@/lib/seo";
import type { RoomTypeSummary } from "@/types/listing";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ISR: each listing detail page gets cached for 30 minutes after first render.
// Repeat visits hit the Vercel edge cache instead of running DB queries.
export const revalidate = 1800;

/**
 * Pre-render every active listing's detail page at build time so the first
 * visitor doesn't pay a DB round-trip. Combined with the `revalidate` above,
 * every listing page is served as static HTML from Vercel's edge CDN; the
 * background regeneration only kicks in after the cache window elapses.
 *
 * `dynamicParams = true` (the default) keeps newly-crawled listings working
 * — they render on-demand the first time, then get added to the static set.
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  // Local import keeps Prisma out of the bundle when the route is ISR'd
  // without a build-time pass (e.g. dev mode).
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.listing.findMany({
    where: { status: "active" },
    select: { slug: true },
    // Cap to avoid blowing the build timeout on unbounded growth.
    take: 500,
  });
  return rows.map((r) => ({ slug: r.slug }));
}

// ── Chinese-description picker ──────────────────────────────────────────────
//
// The 28hse crawler historically stored either Chinese or English text into
// `description` depending on whether the Chinese detail page fetch succeeded
// (and never populated `descriptionZh`). That means for many legacy listings
// `description` is English — we don't want to surface that in a Chinese UI.
//
// Strategy: prefer `descriptionZh`; else use `description` only if it actually
// contains CJK characters; otherwise return null and let the caller render a
// "整理中" placeholder.
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
function hasCjk(s: string | null | undefined): s is string {
  return typeof s === "string" && CJK_RE.test(s);
}
function pickChineseDescription(listing: {
  descriptionZh?: string | null;
  description?: string | null;
}): string | null {
  if (hasCjk(listing.descriptionZh)) return listing.descriptionZh;
  if (hasCjk(listing.description)) return listing.description;
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) {
    return {
      title: "樓盤不存在",
      robots: { index: false, follow: false },
    };
  }
  const priceLabel = listing.dataCompleteness === "partial"
    ? "售價待公布"
    : formatPrice(listing.price);
  const displayName = listing.titleZh ?? listing.titleEn ?? listing.estateName;
  const titleLine = `${displayName} | ${priceLabel} | ${listing.district}`;
  const description =
    pickChineseDescription(listing) ?? buildListingDescription(listing);
  const canonical = absoluteUrl(`/listing/${listing.slug}`);

  return {
    title: titleLine,
    description,
    alternates: {
      canonical,
      languages: { "zh-HK": canonical },
    },
    openGraph: {
      type: "article",
      url: canonical,
      title: titleLine,
      description,
      siteName: "香港樓盤搜尋",
      locale: "zh_HK",
    },
    twitter: {
      card: "summary_large_image",
      title: titleLine,
      description,
    },
    keywords: [
      displayName,
      listing.district,
      listing.subDistrict ?? "",
      "香港樓盤",
      "樓盤資訊",
      listing.developer ?? "",
    ].filter(Boolean) as string[],
    other: {
      "og:locale": "zh_HK",
    },
  };
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const isPartial = listing.dataCompleteness === "partial";
  const isSuspicious = listing.dataQuality === "suspicious";
  const displayName = listing.titleZh ?? listing.titleEn ?? listing.estateName;

  // Room types arrive on the same Prisma query (via include), so no second
  // round-trip to the DB.
  const roomTypes = listing.roomTypes ?? [];
  const hasRoomTypes = roomTypes.length > 0;

  // Media for 平面圖 CTA
  // (media fetching can be added later; for now use WhatsApp fallback)

  // ── SEO: structured data ─────────────────────────────────────────────────
  const jsonLd = listingJsonLd(listing);
  const breadcrumbs = breadcrumbJsonLd([
    { name: "首頁", url: "/" },
    { name: "搜尋樓盤", url: "/search" },
    { name: listing.district, url: `/search?district=${encodeURIComponent(listing.district)}` },
    { name: displayName, url: `/listing/${listing.slug}` },
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* JSON-LD: RealEstateListing + BreadcrumbList — drives Google rich snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Breadcrumb */}
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        返回搜尋結果
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5">
        <div className={`px-6 py-6 text-white ${isPartial ? "bg-gradient-to-r from-gray-500 to-gray-600" : "bg-gradient-to-r from-blue-600 to-blue-700"}`}>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              {/* Chinese name primary, English secondary */}
              <h1 className="text-2xl font-bold mb-0.5">{displayName}</h1>
              {listing.titleEn && listing.titleZh && (
                <p className={`text-sm mb-1 ${isPartial ? "text-gray-300" : "text-blue-200"}`}>
                  {listing.titleEn}
                </p>
              )}
              <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${isPartial ? "text-gray-300" : "text-blue-100"}`}>
                <span className="flex items-center gap-1">
                  <MapPin size={13} />
                  {listing.district}
                </span>
                {listing.address && <span>· {listing.address}</span>}
                {listing.developer && (
                  <span className="flex items-center gap-1">
                    · <Building2 size={13} /> {listing.developer}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              {isPartial ? (
                <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-2">
                  <Clock size={15} className="text-gray-300" />
                  <span className="text-white font-medium text-sm">售價待公布</span>
                </div>
              ) : (
                <Link
                  href={`/mortgage?price=${listing.price}`}
                  className="group inline-flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-white/10"
                  title="點擊即時計算按揭月供"
                >
                  <div className="text-3xl font-bold leading-tight">
                    {listing.priceMax
                      ? formatPriceRange(listing.price, listing.priceMax)
                      : formatPrice(listing.price)}
                  </div>
                  <div className="flex flex-col items-start">
                    <Calculator
                      size={16}
                      className="text-white/70 group-hover:text-white transition-colors"
                    />
                    <span className="text-[10px] leading-none text-white/70 group-hover:text-white mt-0.5">
                      計按揭
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Compact summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 text-sm">
          <SummaryCell label="地區" value={listing.district} />
          <SummaryCell
            label="實用面積"
            value={
              listing.saleableAreaMax
                ? `${listing.saleableArea}–${listing.saleableAreaMax}呎²`
                : formatArea(listing.saleableArea)
            }
          />
          <SummaryCell
            label="預計落成"
            value={listing.completionYear ? `${listing.completionYear}年` : "—"}
          />
          <SummaryCell label="物業類型" value={listing.propertyType} />
        </div>
      </div>

      {/* Partial notice */}
      {isPartial && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm">
          <Clock size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold text-amber-800">售價尚未公布</span>
            <span className="text-amber-700 ml-1">— 此項目資訊已儲存，待發展商公布價單後將自動更新。</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: main content */}
        <div className="md:col-span-2 space-y-5">

          {/* Project info table */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">項目資料</h2>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Detail label="屋苑" value={displayName} />
              {listing.developer && <Detail label="發展商" value={listing.developer} />}
              {listing.address && <Detail label="地址" value={listing.address} />}
              {listing.completionYear && <Detail label="預計落成" value={`${listing.completionYear}年`} />}
              {listing.grossArea && <Detail label="建築面積" value={formatArea(listing.grossArea)} />}
              <Detail label="數據來源" value={listing.source} />
            </div>
            {listing.tags && listing.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            )}
          </section>

          {/* Room-type table */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">戶型售價一覽</h2>

            {!hasRoomTypes ? (
              <div className="text-sm text-gray-600">
                {isSuspicious && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3">
                    <AlertTriangle size={15} className="shrink-0" />
                    資料待更新，僅供參考
                  </div>
                )}
                房型資料整理中 — 如需最新 1–4 房資料，請 WhatsApp 查詢。
              </div>
            ) : (
              <>
                {isSuspicious && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    <AlertTriangle size={13} className="shrink-0" />
                    資料待更新，僅供參考
                  </div>
                )}
                <RoomTypeTable roomTypes={roomTypes} isPartial={isPartial} />
                <p className="text-xs text-gray-400 mt-3">
                  以上為各房型起步參考資料，實際售價以發展商公布價單為準。
                </p>
              </>
            )}
          </section>

          {/* Chinese project intro — only surface Chinese text (never English
              fallback). Legacy listings without Chinese text yet get a
              placeholder + WhatsApp CTA. */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">項目介紹</h2>
            {(() => {
              const intro = pickChineseDescription(listing);
              if (intro) {
                return (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {intro}
                  </p>
                );
              }
              return (
                <div>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    中文介紹整理中 — 如需了解{displayName}的項目詳情、單位供應及最新資料,歡迎 WhatsApp 查詢。
                  </p>
                  <div className="mt-3">
                    <WhatsAppCTA
                      message={buildListingInquiryMessage(listing)}
                      label="WhatsApp 查詢項目詳情"
                      size="sm"
                    />
                  </div>
                </div>
              );
            })()}
          </section>
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          {/* CTA buttons */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">立即查詢</h3>

            <WhatsAppCTA
              message={buildListingInquiryMessage(listing)}
              label="WhatsApp 查詢詳情"
              size="md"
              block
            />

            <a
              href={buildWhatsAppUrl(
                buildListingInquiryMessage(listing, { intent: "price-list" }),
                SITE_CONFIG.whatsappNumber
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg py-2 hover:bg-green-100 transition-colors"
            >
              <FileText size={14} />
              索取價單
            </a>

            <a
              href={buildWhatsAppUrl(
                buildListingInquiryMessage(listing, { intent: "floor-plan" }),
                SITE_CONFIG.whatsappNumber
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg py-2 hover:bg-blue-100 transition-colors"
            >
              <LayoutGrid size={14} />
              索取平面圖
            </a>

            {listing.sourceUrl && (
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ExternalLink size={13} />
                查看原始資料
              </a>
            )}
          </div>

          {/* 回報資料錯誤 — separate card so it doesn't compete with the
              primary CTAs but is still discoverable. */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} className="text-amber-500" />
              發現資料有錯？
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              價格、面積、房型不正確？協助我哋改善資料質素，回報後會盡快核實。
            </p>
            <a
              href={buildWhatsAppUrl(
                buildListingInquiryMessage(listing, { intent: "report-error" }),
                SITE_CONFIG.whatsappNumber
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg py-2 hover:bg-amber-100 transition-colors font-medium"
            >
              <AlertTriangle size={14} />
              一鍵 WhatsApp 回報
            </a>
          </div>

          {/* Source info */}
          <div className="text-xs text-gray-400 text-center px-2">
            <Calendar size={11} className="inline mr-1" />
            資料更新：{new Date(listing.lastSeenAt).toLocaleDateString("zh-HK")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className="font-semibold text-gray-900 text-sm">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </>
  );
}

function RoomTypeTable({
  roomTypes,
  isPartial,
}: {
  roomTypes: RoomTypeSummary[];
  isPartial: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="text-left pb-2 font-medium">房型</th>
            <th className="text-right pb-2 font-medium">實用面積</th>
            <th className="text-right pb-2 font-medium">售價（參考）</th>
            <th className="text-right pb-2 font-medium">呎價</th>
            <th className="text-right pb-2 font-medium">狀態</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {roomTypes.map((rt) => {
            const isLowConf = rt.confidence === "low";
            const isMedConf = rt.confidence === "medium";
            return (
              <tr key={rt.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 font-medium text-gray-900">
                  {rt.unitLabel}
                  {isMedConf && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">(參考)</span>
                  )}
                  {isLowConf && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">(待更新)</span>
                  )}
                </td>
                <td className="py-2.5 text-right text-gray-700">
                  {isLowConf ? (
                    <span className="text-gray-400 text-xs">待更新</span>
                  ) : (
                    <AreaCell min={rt.minSaleableArea} max={rt.maxSaleableArea} />
                  )}
                </td>
                <td className="py-2.5 text-right font-semibold text-blue-700">
                  {isPartial ? (
                    <span className="text-gray-400 font-normal text-xs">待公布</span>
                  ) : isLowConf ? (
                    <span className="text-gray-400 font-normal text-xs">待更新</span>
                  ) : (
                    <PriceCell
                      min={rt.minPrice}
                      max={rt.maxPrice}
                      availability={rt.availability}
                    />
                  )}
                </td>
                <td className="py-2.5 text-right text-gray-700 whitespace-nowrap">
                  {isLowConf ? (
                    <span className="text-gray-400 text-xs">待更新</span>
                  ) : (
                    <PsfCell rt={rt} isListingPartial={isPartial} />
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <AvailabilityBadge availability={rt.availability} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Implausibly wide areas under a single roomtype_code usually mean 28Hse
 * has lumped a special unit (garden / duplex / villa) under the same
 * "2-bedroom" or "3-bedroom" tab as standard flats. Showing "419–1309呎²"
 * misleads — the typical 2BR is around 419, the 1309 is the rare special.
 * When max > 2.2× min, fall back to "{min}呎²起".
 */
const AREA_SPREAD_RATIO_LIMIT = 2.2;

function AreaCell({ min, max }: { min?: number; max?: number }) {
  if (!min) return <span className="text-gray-400 text-xs">待更新</span>;
  if (max && max !== min) {
    if (max > min * AREA_SPREAD_RATIO_LIMIT) return <>{min}呎²起</>;
    return <>{min}–{max}呎²</>;
  }
  return <>{min}呎²</>;
}

/** Same intuition as AREA_SPREAD_RATIO_LIMIT — extreme price spread within a
 *  single room type usually means a special unit was lumped in. */
const PRICE_SPREAD_RATIO_LIMIT = 3.0;

function PriceCell({
  min,
  max,
  availability,
}: {
  min?: number;
  max?: number;
  availability: string;
}) {
  if (availability === "sold_out") {
    return <span className="text-gray-400 font-normal text-xs">已售罄</span>;
  }
  if (!min) return <span className="text-gray-400 font-normal text-xs">待更新</span>;
  if (max && max !== min) {
    if (max > min * PRICE_SPREAD_RATIO_LIMIT) {
      return <>{formatPrice(min)} 起</>;
    }
    return <>{formatPrice(min)} – {formatPrice(max)}</>;
  }
  return <>{formatPrice(min)} 起</>;
}

/**
 * Per-room-type 呎價 cell. Renders the formatted psf, with placeholder/待更新
 * styling when the underlying data is incomplete or the listing is partial.
 */
function PsfCell({
  rt,
  isListingPartial,
}: {
  rt: RoomTypeSummary;
  isListingPartial: boolean;
}) {
  const text = formatRoomTypePsf(rt, isListingPartial);
  // "待" indicates a placeholder (待公布 / 待更新 / 已售罄) — render in muted style
  const isPlaceholder = /待|售罄/.test(text);
  if (isPlaceholder) {
    return <span className="text-gray-400 font-normal text-xs">{text}</span>;
  }
  return <span className="text-sm font-medium text-gray-800">{text}</span>;
}

function AvailabilityBadge({ availability }: { availability: string }) {
  if (availability === "sold_out")
    return <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5">售罄</span>;
  if (availability === "pending")
    return <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">待售</span>;
  if (availability === "available")
    return <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">發售中</span>;
  return <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">待更新</span>;
}
