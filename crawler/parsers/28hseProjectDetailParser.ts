/**
 * Parses a 28Hse new-homes project detail page (/en/new-properties/{slug}).
 *
 * Uses cheerio against the live DOM under `.newprop_whole_page_results`.
 */

import * as cheerio from "cheerio";
import type { ProjectDetailPage } from "../fetchers/28hseProjectDetailFetcher";
import type { Logger } from "../utils/logging";

// ─── Raw (pre-normalization) types ────────────────────────────────────────────

export interface RawProjectUnit {
  rawLabel?: string;
  rawRoomCount?: string;
  rawSaleableArea?: string;    // min saleable area
  rawSaleableAreaMax?: string; // max saleable area
  rawPrice?: string;           // min price
  rawPriceMax?: string;        // max price
  rawPricePerSqft?: string;
  rawUnitCount?: string;
  rawAvailability?: string;    // "available" | "sold_out" | "pending" | "unknown"
}

export interface RawMediaItem {
  mediaType: "image" | "floorplan" | "pdf";
  url: string;
}

export interface RawProjectDetail {
  sourceUrl: string;
  fetchedAt: string;
  parsedAt: string;

  rawName?: string;
  rawDistrict?: string;
  rawSubDistrict?: string;
  rawDeveloper?: string;
  rawPriceFrom?: string;
  rawPriceTo?: string;
  rawSaleableAreaFrom?: string;
  rawSaleableAreaTo?: string;
  rawRoomSummary?: string;
  rawDescription?: string;
  rawStatus?: string;
  rawAddress?: string;
  rawCompletionDate?: string;

  /**
   * Which strategy was used to extract rawPriceFrom:
   * "pricelist_table" | "pricelist_pdf_rows" | "jsonld_aggregate" | "page_scan" | "none"
   */
  priceStrategy: string;

  /** Which expected regions of the DOM were empty (for debugging selectors). */
  parseWarnings: string[];

  units: RawProjectUnit[];
  media: RawMediaItem[];
}

function warn(warnings: string[], code: string, detail?: string): void {
  warnings.push(detail ? `${code}:${detail}` : code);
}

function readJsonLdName(html: string): string | undefined {
  const m = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m?.[1]) return undefined;
  try {
    const data = JSON.parse(m[1]) as { name?: string };
    return typeof data.name === "string" ? data.name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse a detail page HTML into raw project data.
 */
export function parseProjectDetailPage(
  page: ProjectDetailPage,
  logger: Logger
): RawProjectDetail {
  const { html, url, fetchedAt } = page;
  const parseWarnings: string[] = [];
  const $ = cheerio.load(html);

  const root = $(".newprop_whole_page_results").first();
  if (!root.length) {
    warn(parseWarnings, "selector_missed", ".newprop_whole_page_results");
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  let rawName = root.find("h2.ui.header strong").first().text().replace(/\s+/g, " ").trim();
  if (!rawName) {
    rawName =
      $('meta[property="og:title"]').attr("content")?.split(/\s*[|–-]\s*/)[0]?.trim() ||
      readJsonLdName(html) ||
      $("title").text().split(/\s*[|–-]\s*/)[0]?.trim() ||
      "";
  }
  if (!rawName) warn(parseWarnings, "selector_missed", "title:h2.ui.header strong|og:title|ld+json.name");

  // ── Address line (district + street) ───────────────────────────────────────
  const col = root.find(".ui.desktop.segment .row .eleven.wide.column").first();
  const h2 = col.find("h2.ui.header").first();
  let addressLine = "";
  if (h2.length) {
    const addrDiv = h2.closest("div").nextAll("div").not(".divider").first();
    addressLine = addrDiv.text().replace(/\s+/g, " ").trim();
  }
  if (!addressLine) {
    warn(parseWarnings, "selector_missed", "address:column after h2.ui.header");
  }

  let rawDistrict: string | undefined;
  let rawAddress: string | undefined;
  if (addressLine) {
    const comma = addressLine.indexOf(",");
    if (comma >= 0) {
      rawDistrict = addressLine.slice(0, comma).trim();
      rawAddress = addressLine.slice(comma + 1).trim();
    } else {
      rawDistrict = addressLine;
    }
  }

  // ── Developer + completion (labels) ────────────────────────────────────────
  let rawDeveloper: string | undefined;
  let rawCompletionDate: string | undefined;
  const labels = root.find(".detail_tags .ui.large.label");
  if (!labels.length) warn(parseWarnings, "selector_missed", ".detail_tags .ui.large.label");
  labels.each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (/pricelist/i.test(t)) return;
    if (/complete\s+on/i.test(t)) {
      rawCompletionDate = t;
      return;
    }
    if (!rawDeveloper) rawDeveloper = t;
  });
  if (!rawDeveloper) warn(parseWarnings, "selector_missed", "developer_label");

  // ── Sales status (first segment only — avoid matching “Sold” in stats) ─────
  const salesFull = root.find(".sales_status").first().text().replace(/\s+/g, " ").trim();
  const rawStatus = salesFull.split("|")[0]?.trim();
  if (!rawStatus) warn(parseWarnings, "selector_missed", ".sales_status");

  // ── Room mix summary (tab buttons) ──────────────────────────────────────────
  const roomParts: string[] = [];
  root.find("#roomtype_segment_result button.roomtype_switch_btn[roomtype_code]").each((_, el) => {
    const code = $(el).attr("roomtype_code")?.trim();
    if (!code || code.toLowerCase() === "all") return;
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (label) roomParts.push(label);
  });
  const rawRoomSummary = roomParts.length ? roomParts.join(" | ") : undefined;
  if (!rawRoomSummary) warn(parseWarnings, "selector_missed", "#roomtype_segment_result button.roomtype_switch_btn");

  // ── Intro blurb ─────────────────────────────────────────────────────────────
  const rawDescription = root.find(".column.intro").first().text().replace(/\s+/g, " ").trim() || undefined;
  if (!rawDescription) warn(parseWarnings, "selector_missed", ".column.intro");

  // ── JSON-LD: extract offer prices early (used for units AND as price fallback) ─
  const minPriceByCode = new Map<string, number>();
  const maxPriceByCode = new Map<string, number>();
  const allJsonLdPrices: number[] = []; // all offer prices regardless of room code
  const ldMatch = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (ldMatch?.[1]) {
    try {
      const ldData = JSON.parse(ldMatch[1]) as {
        offers?: Array<{ priceSpecification?: { name?: string; price?: string } }>;
      };
      const offerList = Array.isArray(ldData.offers) ? ldData.offers : [];
      const priceListByCode = new Map<string, number[]>();

      for (const offer of offerList) {
        const ps = offer.priceSpecification;
        if (!ps?.price) continue;
        const nameLc = (ps.name ?? "").toLowerCase();
        let code: string | null = null;
        if (nameLc.startsWith("studio")) code = "STUDIO";
        else if (nameLc.startsWith("1-bedroom")) code = "1";
        else if (nameLc.startsWith("2-bedroom")) code = "2";
        else if (nameLc.startsWith("3-bedroom")) code = "3";
        else if (nameLc.startsWith("4-bedroom")) code = "4";

        // Parse "2.91M" or "2.96M - 3.43M" — take all values
        for (const part of ps.price.split(/\s*-\s*/)) {
          const t = part.trim();
          let val: number | null = null;
          if (/m$/i.test(t)) val = parseFloat(t) * 1_000_000;
          else if (/萬/.test(t)) val = parseFloat(t) * 10_000;
          else { const n = parseFloat(t.replace(/[^0-9.]/g, "")); if (n > 100_000) val = n; }
          if (val !== null && Number.isFinite(val) && val > 0) {
            allJsonLdPrices.push(val);
            if (code) {
              if (!priceListByCode.has(code)) priceListByCode.set(code, []);
              priceListByCode.get(code)!.push(val);
            }
          }
        }
      }

      for (const [code, prices] of priceListByCode) {
        minPriceByCode.set(code, Math.min(...prices));
        maxPriceByCode.set(code, Math.max(...prices));
      }
    } catch {
      // JSON-LD parse failure is non-fatal
    }
  }

  // ── Pricelist: multi-strategy price extraction ─────────────────────────────
  let rawPriceFrom: string | undefined;
  let rawPriceTo: string | undefined;
  let rawSaleableAreaFrom: string | undefined;
  let rawSaleableAreaTo: string | undefined;
  let priceStrategy = "none";

  /** Format a HKD integer as e.g. "2.910M" for downstream parsePrice */
  function fmtM(n: number): string {
    return `${(n / 1_000_000).toFixed(3)}M`;
  }

  /** Parse all price numbers (HKD) from a raw text cell like "$2.862M - $4.707M" */
  function extractPricesFromCell(text: string): number[] {
    const results: number[] = [];
    for (const part of text.split(/\s*-\s*/)) {
      const t = part.replace(/[^0-9.MmBb億萬]/g, "").trim();
      if (!t) continue;
      let val: number | null = null;
      if (/[Mm]$/.test(t)) val = parseFloat(t) * 1_000_000;
      else if (/億/.test(t)) val = parseFloat(t) * 100_000_000;
      else if (/萬/.test(t)) val = parseFloat(t) * 10_000;
      else { const n = parseFloat(t); if (n > 100_000) val = n; }
      if (val !== null && Number.isFinite(val) && val > 0) results.push(val);
    }
    return results;
  }

  const tableRows = root.find(".pricelist_result_refresh table tbody tr");
  if (!tableRows.length) warn(parseWarnings, "selector_missed", ".pricelist_result_refresh table tbody tr");

  // Strategy A: "lowest price unit" / "highest price unit" summary rows
  tableRows.each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("td");
    if (cells.length < 4) return;
    const label = $(cells[0]).text().replace(/\s+/g, " ").trim().toLowerCase();
    const areaText = $(cells[2]).text().replace(/\s+/g, " ").trim();
    const priceText = $(cells[3]).text().replace(/\s+/g, " ").trim();

    if (label.includes("lowest price unit")) {
      rawSaleableAreaFrom = areaText || rawSaleableAreaFrom;
      rawPriceFrom = priceText || rawPriceFrom;
      if (priceText) priceStrategy = "pricelist_table";
    } else if (label.includes("highest price unit")) {
      rawSaleableAreaTo = areaText || rawSaleableAreaTo;
      rawPriceTo = priceText || rawPriceTo;
    }
  });

  if (!rawPriceFrom) warn(parseWarnings, "selector_missed", "pricelist_row:lowest_price_unit");
  if (!rawPriceTo) warn(parseWarnings, "selector_missed", "pricelist_row:highest_price_unit");

  // Strategy B: pricelist PDF download rows — aggregate min/max across all price ranges
  if (!rawPriceFrom) {
    const allPdfPrices: number[] = [];
    const allPdfAreas: number[] = [];
    tableRows.each((_, tr) => {
      const $tr = $(tr);
      if (!$tr.hasClass("download_pricelist_pdf") && !$tr.attr("href")?.includes("pdf")) return;
      const cells = $tr.find("td");
      if (cells.length < 4) return;
      const areaCell = $(cells[2]).text().trim();
      const priceCell = $(cells[3]).text().trim();
      allPdfPrices.push(...extractPricesFromCell(priceCell));
      // area: "218 - 303 ft²" — take all numbers
      for (const m of areaCell.matchAll(/(\d+)/g)) {
        const n = parseInt(m[1]!, 10);
        if (n > 0) allPdfAreas.push(n);
      }
    });
    if (allPdfPrices.length > 0) {
      rawPriceFrom = fmtM(Math.min(...allPdfPrices));
      rawPriceTo = fmtM(Math.max(...allPdfPrices));
      if (allPdfAreas.length > 0) {
        rawSaleableAreaFrom = `${Math.min(...allPdfAreas)} ft²`;
        rawSaleableAreaTo = `${Math.max(...allPdfAreas)} ft²`;
      }
      priceStrategy = "pricelist_pdf_rows";
    }
  }

  // Strategy C: JSON-LD offers aggregate — use all individual unit prices
  if (!rawPriceFrom && allJsonLdPrices.length > 0) {
    rawPriceFrom = fmtM(Math.min(...allJsonLdPrices));
    rawPriceTo = fmtM(Math.max(...allJsonLdPrices));
    priceStrategy = "jsonld_aggregate";
  }

  // ── Unit types: per-room-type pricing from JSON-LD offers + roomTypeItem cards ─
  //
  // Each .roomTypeItem card is ONE individual unit with:
  //   .description div[0]  → "N units"  (unit count label)
  //   .description div[1]  → "NNN ft²"  (saleable area)
  //   .description div[2]  → "XX.XXM"   (price — this is what the old code missed)
  //   .extra label.roomtype_status_label → "sold out" | "available" | etc.
  //
  // We scan ALL cards to build per-code aggregates.  JSON-LD is often a single
  // offer (one available unit) and misses sold-out room types entirely.

  const minAreaByCode = new Map<string, number>();
  const maxAreaByCode = new Map<string, number>();
  const minPriceFromCards = new Map<string, number>();
  const maxPriceFromCards = new Map<string, number>();
  const soldCountByCode = new Map<string, number>();
  const totalCountByCode = new Map<string, number>();

  root.find(".roomTypeItem[roomtype_code]").each((_, el) => {
    const code = $(el).attr("roomtype_code")?.toUpperCase();
    if (!code || code === "ALL") return;

    totalCountByCode.set(code, (totalCountByCode.get(code) ?? 0) + 1);

    // Availability: read the status label inside the card — far more reliable
    // than button CSS classes which are often missing for sold-out types.
    const statusLabel = $(el).find("label.roomtype_status_label").text().toLowerCase();
    if (/sold/.test(statusLabel)) {
      soldCountByCode.set(code, (soldCountByCode.get(code) ?? 0) + 1);
    }

    $(el)
      .find(".description div")
      .each((__, div) => {
        const t = $(div).text().replace(/\s+/g, " ").trim();

        // Area: "538 ft²"
        for (const m of t.matchAll(/(\d+)\s*ft[²2]/gi)) {
          const area = parseInt(m[1]!, 10);
          if (area <= 0) continue;
          if (!minAreaByCode.has(code) || area < minAreaByCode.get(code)!)
            minAreaByCode.set(code, area);
          if (!maxAreaByCode.has(code) || area > maxAreaByCode.get(code)!)
            maxAreaByCode.set(code, area);
        }

        // Price: "10.92M" — the last div in .description typically holds the price.
        // Match a standalone decimal+M value (no area suffix).
        const priceM = /^([\d.]+)\s*[Mm]$/.exec(t);
        if (priceM) {
          const price = parseFloat(priceM[1]!) * 1_000_000;
          if (price > 0) {
            if (!minPriceFromCards.has(code) || price < minPriceFromCards.get(code)!)
              minPriceFromCards.set(code, price);
            if (!maxPriceFromCards.has(code) || price > maxPriceFromCards.get(code)!)
              maxPriceFromCards.set(code, price);
          }
        }
      });
  });

  // Merge card prices into the JSON-LD price maps for any code not already covered.
  // JSON-LD is preferred when present because it reflects current offer prices;
  // card prices include sold-out units and are used as a fallback.
  for (const [code, price] of minPriceFromCards) {
    if (!minPriceByCode.has(code)) minPriceByCode.set(code, price);
  }
  for (const [code, price] of maxPriceFromCards) {
    if (!maxPriceByCode.has(code)) maxPriceByCode.set(code, price);
  }

  // build one RawProjectUnit per room type found in the room-type buttons
  const ROOM_LABEL: Record<string, string> = {
    STUDIO: "開放式",
    "1": "1房",
    "2": "2房",
    "3": "3房",
    "4": "4房或以上",
  };
  // rawRoomCount values that parseBedrooms can interpret for each code
  const ROOM_COUNT_STR: Record<string, string> = {
    STUDIO: "Studio",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
  };

  const units: RawProjectUnit[] = [];
  root
    .find("#roomtype_segment_result button.roomtype_switch_btn[roomtype_code]")
    .each((_, btn) => {
      const $btn = $(btn);
      const code = $btn.attr("roomtype_code")?.toUpperCase();
      if (!code || code === "ALL") return;
      const label = ROOM_LABEL[code];
      if (!label) return; // unknown code

      // Availability: card-based counts are the authoritative signal.
      // Fall back to button class/text only when no card data exists for this code.
      const total = totalCountByCode.get(code) ?? 0;
      const sold = soldCountByCode.get(code) ?? 0;
      let rawAvailability: string;

      if (total > 0) {
        // Derived directly from individual unit cards
        rawAvailability = sold === total ? "sold_out" : "available";
      } else {
        // No card data — fall back to button-level signals
        const btnClass = ($btn.attr("class") ?? "").toLowerCase();
        const btnText = $btn.text().toLowerCase();
        if (/sold.?out|售罄|售完/.test(btnClass) || /sold.?out|售罄|售完/.test(btnText)) {
          rawAvailability = "sold_out";
        } else if (/coming.?soon|待售|預售/.test(btnClass) || /coming.?soon|待售|預售/.test(btnText)) {
          rawAvailability = "pending";
        } else if ($btn.is("[disabled]") || /disabled/.test(btnClass)) {
          rawAvailability = "sold_out";
        } else if (minPriceByCode.has(code)) {
          rawAvailability = "available";
        } else {
          rawAvailability = "unknown";
        }
      }

      const minPrice = minPriceByCode.get(code);
      const maxPrice = maxPriceByCode.get(code);
      const minArea = minAreaByCode.get(code);
      const maxArea = maxAreaByCode.get(code);

      units.push({
        rawLabel: label,
        rawRoomCount: ROOM_COUNT_STR[code] ?? code,
        rawSaleableArea: minArea !== undefined ? `${minArea} ft²` : undefined,
        rawSaleableAreaMax: maxArea !== undefined && maxArea !== minArea ? `${maxArea} ft²` : undefined,
        rawPrice: minPrice !== undefined ? `${(minPrice / 1_000_000).toFixed(3)}M` : undefined,
        rawPriceMax: maxPrice !== undefined && maxPrice !== minPrice ? `${(maxPrice / 1_000_000).toFixed(3)}M` : undefined,
        rawAvailability,
        rawUnitCount: total > 0 ? String(total) : undefined,
      });
    });

  // ── Media: hero carousel (data-src + optional mp4) ─────────────────────────
  const media: RawMediaItem[] = [];
  const seenMedia = new Set<string>();
  const slider = root.find("#mySliderPictures");
  if (!slider.length) warn(parseWarnings, "selector_missed", "#mySliderPictures");

  slider.find("img").each((_, img) => {
    const $img = $(img);
    const dataSrc = $img.attr("data-src")?.trim();
    const src = $img.attr("src")?.trim();
    const url = dataSrc || src;
    if (!url || url.startsWith("data:")) return;
    const abs = url.startsWith("http") ? url : `https://www.28hse.com${url.startsWith("/") ? "" : "/"}${url}`;
    if (/loadingphoto|roomtypeloading|placeholder|noimage/i.test(abs)) return;

    const mp4 = $img.attr("mp4linkurl") || $img.attr("mp4LinkUrl");

    if (mp4 && /^https?:\/\//i.test(mp4) && !seenMedia.has(mp4)) {
      seenMedia.add(mp4);
      media.push({ mediaType: "image", url: mp4 });
    }

    if (!seenMedia.has(abs)) {
      seenMedia.add(abs);
      const isFp = /floorplan|平面|價單|pricelist.*\.jpg/i.test(abs);
      media.push({ mediaType: isFp ? "floorplan" : "image", url: abs });
    }
  });

  if (!media.length) warn(parseWarnings, "selector_missed", "#mySliderPictures img (no media urls)");

  if (parseWarnings.length) {
    logger.warn("28Hse detail parse diagnostics", { url, parseWarnings });
  }

  logger.debug("Parsed detail page", {
    url,
    rawName,
    rawDistrict,
    rawDeveloper,
    rawPriceFrom,
    rawPriceTo,
    priceStrategy,
    mediaCount: media.length,
  });

  return {
    sourceUrl: url,
    fetchedAt,
    parsedAt: new Date().toISOString(),
    rawName: rawName || undefined,
    rawDistrict,
    rawAddress,
    rawDeveloper,
    rawPriceFrom,
    rawPriceTo,
    rawSaleableAreaFrom,
    rawSaleableAreaTo,
    rawRoomSummary,
    rawDescription,
    rawStatus,
    rawCompletionDate,
    priceStrategy,
    parseWarnings,
    units,
    media,
  };
}
