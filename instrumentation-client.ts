/**
 * Client-side Sentry instrumentation — opt-in.
 *
 * Mirrors the same dependency-free pattern as instrumentation.ts. Activates
 * only when `@sentry/nextjs` is installed AND NEXT_PUBLIC_SENTRY_DSN is set.
 * Otherwise no-op.
 *
 * Next.js 15+ auto-imports this file on the client when present.
 */

type SentryModule = {
  init: (opts: {
    dsn: string;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
    environment?: string;
  }) => void;
};

const dynamicImport = new Function("p", "return import(p)") as (
  pkg: string
) => Promise<unknown>;

(async () => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  let Sentry: SentryModule;
  try {
    const mod = (await dynamicImport("@sentry/nextjs")) as SentryModule;
    if (!mod || typeof mod.init !== "function") return;
    Sentry = mod;
  } catch {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,        // disable session replay by default (privacy)
    replaysOnErrorSampleRate: 0.0,
    environment: process.env.NODE_ENV ?? "development",
  });
})();
