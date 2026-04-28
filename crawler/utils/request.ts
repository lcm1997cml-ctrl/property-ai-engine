/**
 * HTTP utility for crawler fetches.
 * - Randomised User-Agent rotation
 * - Configurable retry with exponential back-off
 * - Rate-limiting delay between requests
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  /** Milliseconds to wait between requests (default: 1500) */
  rateDelayMs?: number;
  /** Max number of attempts (default: 3) */
  maxRetries?: number;
  /** Base back-off in ms, doubles each retry (default: 2000) */
  backoffBaseMs?: number;
  /** Extra headers */
  headers?: Record<string, string>;
}

/**
 * Fetch a URL as text with retry and rate-limiting.
 * Throws on non-2xx after all retries exhausted.
 */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const {
    rateDelayMs = 1500,
    maxRetries = 3,
    backoffBaseMs = 2000,
    headers = {},
  } = opts;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const delay = backoffBaseMs * Math.pow(2, attempt - 2);
        await sleep(delay);
      }

      const res = await fetch(url, {
        headers: {
          "User-Agent": randomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          ...headers,
        },
        // Next.js fetch cache: no-store so each crawler run gets fresh data
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      const text = await res.text();

      // Rate-limit delay after each successful fetch
      await sleep(rateDelayMs);

      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) continue;
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

/**
 * Fetch JSON from a URL (e.g. API endpoints).
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const html = await fetchHtml(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...opts.headers,
    },
  });
  return JSON.parse(html) as T;
}
