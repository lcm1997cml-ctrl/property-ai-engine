/**
 * Next.js instrumentation hook — runs on server start (Node + Edge).
 *
 * Sentry error-tracking is wired here as OPT-IN infrastructure:
 *   • Dependency `@sentry/nextjs` is *not* a hard dependency of this project.
 *   • This file activates ONLY when both:
 *       1. `@sentry/nextjs` is installed (`npm install @sentry/nextjs`)
 *       2. `NEXT_PUBLIC_SENTRY_DSN` (or `SENTRY_DSN`) env var is set
 *   • If either is missing, this is a silent no-op — the rest of the site
 *     keeps working unchanged.
 *
 * This pattern is intentional: Sentry adds bundle weight and a vendor
 * dependency, so we leave it dormant until the operator is ready to enable it.
 *
 * To enable:
 *   1. npm install --save @sentry/nextjs
 *   2. Add NEXT_PUBLIC_SENTRY_DSN=https://...@o.../... to .env
 *   3. Restart the server. Errors auto-report from this point.
 */

type SentryModule = {
  init: (opts: { dsn: string; tracesSampleRate?: number; environment?: string }) => void;
};

/**
 * Use a string-name dynamic import to avoid TypeScript resolving
 * `@sentry/nextjs` at compile time. This keeps the project type-clean
 * regardless of whether the package is installed.
 */
const dynamicImport = new Function("p", "return import(p)") as (
  pkg: string
) => Promise<unknown>;

async function loadSentry(): Promise<SentryModule | null> {
  try {
    const mod = (await dynamicImport("@sentry/nextjs")) as SentryModule;
    return mod && typeof mod.init === "function" ? mod : null;
  } catch {
    return null;
  }
}

export async function register(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;

  const Sentry = await loadSentry();
  if (!Sentry) {
    // Operator set DSN but didn't install the package — log a hint, then no-op.
    if (typeof console !== "undefined") {
      console.warn(
        "[instrumentation] SENTRY_DSN set but @sentry/nextjs not installed. Run: npm i @sentry/nextjs"
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1, // 10% of transactions traced — adjust as needed
    environment: process.env.NODE_ENV ?? "development",
  });
}
