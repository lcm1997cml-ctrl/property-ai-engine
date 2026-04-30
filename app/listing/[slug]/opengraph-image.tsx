import { ImageResponse } from "next/og";
import { getListingBySlug } from "@/services/listingService";
import { SITE_CONFIG } from "@/lib/config";
import { formatPrice } from "@/lib/formatters";

/**
 * Per-listing Open Graph image (1200×630).
 *
 * Renders estate name, district, price band and headline stats so a Facebook /
 * WhatsApp / Twitter share preview tells the recipient what they're clicking
 * before they click.
 *
 * Falls back to the site-default OG image if the listing can't be fetched.
 */

export const runtime = "nodejs"; // service uses Prisma — Node runtime required
export const alt = "樓盤資訊";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface PageProps {
  params: { slug: string };
}

export default async function ListingOg({ params }: PageProps): Promise<ImageResponse> {
  const listing = await getListingBySlug(params.slug).catch(() => null);

  // Fallback: graceful default if DB is unreachable
  if (!listing) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
            color: "white",
            fontFamily: "system-ui",
            fontSize: 80,
            fontWeight: 800,
          }}
        >
          {SITE_CONFIG.name}
        </div>
      ),
      { ...size }
    );
  }

  const name = listing.titleZh ?? listing.titleEn ?? listing.estateName;
  const isPartial = listing.dataCompleteness === "partial";
  const isSoldOut = listing.status === "sold_out";

  const priceLabel = isSoldOut
    ? "已售罄"
    : isPartial || !listing.price
      ? "售價待公布"
      : listing.priceMax && listing.priceMax > listing.price
        ? `${formatPrice(listing.price)} – ${formatPrice(listing.priceMax)}`
        : `${formatPrice(listing.price)} 起`;

  const subInfo: string[] = [];
  if (listing.subDistrict) subInfo.push(listing.subDistrict);
  if (listing.developer) subInfo.push(listing.developer);
  if (listing.completionYear) subInfo.push(`${listing.completionYear}年`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #2563eb 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top: brand + district badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, fontWeight: 600, opacity: 0.85 }}>{SITE_CONFIG.name}</div>
          <div
            style={{
              fontSize: 22,
              padding: "8px 20px",
              background: "rgba(255,255,255,0.18)",
              borderRadius: 999,
            }}
          >
            {listing.district}
          </div>
        </div>

        {/* Middle: estate name + sub info */}
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>
            {name}
          </div>
          {subInfo.length > 0 && (
            <div
              style={{
                marginTop: 18,
                fontSize: 28,
                opacity: 0.82,
                display: "flex",
                gap: 18,
              }}
            >
              {subInfo.map((s, i) => (
                <span key={i} style={{ display: "flex" }}>
                  {i > 0 && <span style={{ marginRight: 18, opacity: 0.6 }}>·</span>}
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: price + headline metrics */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, opacity: 0.7, marginBottom: 6 }}>參考價</div>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>{priceLabel}</div>
          </div>
          {listing.saleableArea > 0 && (
            <div
              style={{
                fontSize: 28,
                padding: "14px 28px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: 16,
                display: "flex",
                gap: 16,
              }}
            >
              <span>實用 {listing.saleableArea} 呎²</span>
              {listing.bedrooms >= 0 && listing.bedrooms <= 8 && listing.bedrooms > 0 && (
                <>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span>{listing.bedrooms}房</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
