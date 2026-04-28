/**
 * Fetches the 28Hse new-homes list pages.
 *
 * Live list URL (EN): https://www.28hse.com/en/new-properties/
 * Pagination: /en/new-properties/page-2, page-3, …
 */

import { fetchHtml } from "../utils/request";
import type { Logger } from "../utils/logging";

export interface NewProjectsListPage {
  url: string;
  html: string;
  pageNumber: number;
  fetchedAt: string;
}

const BASE_URL = "https://www.28hse.com";

/**
 * Build paginated list page URLs.
 * 28Hse typically uses query params like ?p=2, ?p=3 for pagination.
 * Adjust the pattern after inspecting live URL structure.
 */
function buildListPageUrl(pageNumber: number): string {
  const base = `${BASE_URL}/en/new-properties`;
  if (pageNumber === 1) return `${base}/`;
  return `${base}/page-${pageNumber}`;
}

/**
 * Fetch all new-project list pages.
 * Stops when a page returns no project links (end of pagination).
 *
 * @param maxPages - Safety cap to avoid infinite loops (default: 20)
 */
export async function fetchNewProjectsListPages(
  logger: Logger,
  maxPages = 20
): Promise<NewProjectsListPage[]> {
  const pages: NewProjectsListPage[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const url = buildListPageUrl(pageNum);
    logger.info(`Fetching list page ${pageNum}`, { url });

    try {
      const html = await fetchHtml(url, { rateDelayMs: 2000 });
      pages.push({
        url,
        html,
        pageNumber: pageNum,
        fetchedAt: new Date().toISOString(),
      });

      // Check for end of pagination: parser will detect if no project cards exist.
      // For now we fetch up to maxPages; the job layer trims empty pages.
      logger.debug(`Fetched list page ${pageNum} (${html.length} bytes)`);
    } catch (err) {
      logger.error(`Failed to fetch list page ${pageNum}`, { url, err: String(err) });
      // Stop pagination on error to avoid cascading failures
      break;
    }
  }

  return pages;
}
