/**
 * Structured logger for crawler jobs.
 * Outputs JSON lines in production, human-readable in dev.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  ts: string;
  job?: string;
  msg: string;
  data?: unknown;
}

function emit(entry: LogEntry) {
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `[${entry.ts}] ${entry.level.toUpperCase().padEnd(5)} ${entry.job ? `[${entry.job}] ` : ""}${entry.msg}${entry.data ? ` ${JSON.stringify(entry.data)}` : ""}`;

  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(jobName?: string) {
  const log = (level: LogLevel, msg: string, data?: unknown) => {
    emit({ level, ts: new Date().toISOString(), job: jobName, msg, data });
  };

  return {
    info:  (msg: string, data?: unknown) => log("info", msg, data),
    warn:  (msg: string, data?: unknown) => log("warn", msg, data),
    error: (msg: string, data?: unknown) => log("error", msg, data),
    debug: (msg: string, data?: unknown) => {
      if (process.env.NODE_ENV !== "production") log("debug", msg, data);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
