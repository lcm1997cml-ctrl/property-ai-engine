/**
 * Fetches individual new-project detail pages from 28Hse.
 *
 * Takes a list of detail page URLs (extracted by the list parser)
 * and returns raw HTML for the detail parser.
 */

import { fetchHtml } from "../utils/request";
import type { Logger } from "../utils/logging";

export interface ProjectDetailPage {
  url: string;
  html: string;
  fetchedAt: string;
}

/**
 * Fetch a single project detail page.
 */
export async function fetchProjectDetailPage(
  url: string,
  logger: Logger
): Promise<ProjectDetailPage | null> {
  logger.info("Fetching project detail", { url });

  try {
    const html = await fetchHtml(url, { rateDelayMs: 2000 });
    logger.debug(`Fetched detail page (${html.length} bytes)`, { url });
    return { url, html, fetchedAt: new Date().toISOString() };
  } catch (err) {
    logger.error("Failed to fetch project detail", { url, err: String(err) });
    return null;
  }
}

/**
 * Fetch multiple project detail pages with rate limiting.
 * Failed pages are skipped (null entries removed).
 */
export async function fetchProjectDetailPages(
  urls: string[],
  logger: Logger
): Promise<ProjectDetailPage[]> {
  const results: ProjectDetailPage[] = [];

  for (const url of urls) {
    const page = await fetchProjectDetailPage(url, logger);
    if (page) results.push(page);
  }

  return results;
}
