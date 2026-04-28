/**
 * Central env config — import from here instead of reading process.env directly.
 */

/** When true the app reads mock data from data/mockListings.ts instead of the DB. */
export const USE_MOCK_DATA = process.env.USE_MOCK_DATA === "true";

export const DATABASE_URL = process.env.DATABASE_URL ?? "";

/** Secret for protecting /api/crawler/run */
export const CRAWLER_SECRET = process.env.CRAWLER_SECRET ?? "";
