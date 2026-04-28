/**
 * Parses 28Hse new-homes list pages (/en/new-properties/).
 *
 * DOM: each card is `.ui.item.newprop_items` with title link `a.header` and meta lines.
 */

import * as cheerio from "cheerio";
import type { NewProjectsListPage } from "../fetchers/28hseNewProjectsFetcher";
import type { Logger } from "../utils/logging";

export interface ParsedProjectSummary {
  /** URL to the detail page */
  detailUrl: string;
  /** Raw project name as scraped */
  rawName: string;
  /** Raw district string as scraped */
  rawDistrict?: string;
  /** Full location line (district + address) */
  rawLocationLine?: string;
  /** Raw price string as scraped (list page often shows PSF only) */
  rawPrice?: string;
  /** Source page URL */
  sourceUrl: string;
  parsedAt: string;
}

export interface ParsedListPageResult {
  projects: ParsedProjectSummary[];
  /** Whether any projects were found on this page (false = end of pagination) */
  hasProjects: boolean;
}

const DETAIL_PATH_RE = /^\/en\/new-properties\/[a-z0-9][a-z0-9-]*\/?$/i;

function absolutize(href: string): string {
  if (href.startsWith("http")) return href.split("#")[0]!;
  const origin = "https://www.28hse.com";
  return `${origin}${href.startsWith("/") ? "" : "/"}${href}`.split("#")[0]!;
}

/**
 * Parse a single list page HTML and extract project summaries.
 */
export function parseNewProjectsListPage(
  page: NewProjectsListPage,
  logger: Logger
): ParsedListPageResult {
  const projects: ParsedProjectSummary[] = [];
  const parseWarnings: string[] = [];
  const $ = cheerio.load(page.html);

  const cards = $(".ui.item.newprop_items");
  if (cards.length === 0) {
    parseWarnings.push("selector_missed:.ui.item.newprop_items (no listing cards)");
  }

  const seen = new Set<string>();

  cards.each((_, el) => {
    const $card = $(el);
    const $titleA = $card.find("a.header").first();
    const href = $titleA.attr("href")?.trim();
    const rawName = $titleA.text().replace(/\s+/g, " ").trim();
    if (!href || !rawName) {
      parseWarnings.push("selector_missed:a.header (missing href or title in a card)");
      return;
    }

    let path = href;
    try {
      path = new URL(href, "https://www.28hse.com").pathname;
    } catch {
      parseWarnings.push(`invalid_href:${href}`);
      return;
    }

    if (!DETAIL_PATH_RE.test(path)) return;

    const detailUrl = absolutize(href);
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const metaText = $card.find(".meta div").first().text().replace(/\s+/g, " ").trim();
    let rawDistrict: string | undefined;
    let rawLocationLine = metaText || undefined;
    if (metaText) {
      const parts = metaText.split(/\u2003|,/).map((s) => s.trim()).filter(Boolean);
      rawDistrict = parts[0];
    }

    const psfLine = $card.find(".right.floated.description .statistic .value").first().text().replace(/\s+/g, " ").trim();

    projects.push({
      detailUrl,
      rawName,
      rawDistrict,
      rawLocationLine,
      rawPrice: psfLine || undefined,
      sourceUrl: page.url,
      parsedAt: new Date().toISOString(),
    });
  });

  if (parseWarnings.length) {
    logger.warn("28Hse list parse diagnostics", { url: page.url, parseWarnings });
  }

  if (projects.length === 0) {
    logger.warn("No projects found on list page — possibly end of pagination or selector mismatch", {
      url: page.url,
      pageNumber: page.pageNumber,
    });
  } else {
    logger.info(`Parsed ${projects.length} project summaries from page ${page.pageNumber}`);
  }

  return { projects, hasProjects: projects.length > 0 };
}

/**
 * Parse all fetched list pages and return the full project summary list.
 * Deduplicates by detailUrl.
 */
export function parseAllListPages(
  pages: NewProjectsListPage[],
  logger: Logger
): ParsedProjectSummary[] {
  const seen = new Set<string>();
  const all: ParsedProjectSummary[] = [];

  for (const page of pages) {
    const { projects } = parseNewProjectsListPage(page, logger);
    for (const p of projects) {
      if (!seen.has(p.detailUrl)) {
        seen.add(p.detailUrl);
        all.push(p);
      }
    }
  }

  logger.info(`Total unique projects found across all list pages: ${all.length}`);
  return all;
}
