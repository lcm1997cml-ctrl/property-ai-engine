/**
 * POST /api/crawler/run
 *
 * Trigger a crawler job. Protected by CRAWLER_SECRET.
 *
 * Body: { "job": "crawlNewProjects" | "crawlProjectDetails", "secret": "..." }
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/crawler/run \
 *     -H "Content-Type: application/json" \
 *     -d '{"job":"crawlNewProjects","secret":"your-secret"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { CRAWLER_SECRET } from "@/lib/env";

type JobName = "crawlNewProjects" | "crawlProjectDetails";

export async function POST(req: NextRequest) {
  let body: { job?: string; secret?: string; batchSize?: number };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (!CRAWLER_SECRET || body.secret !== CRAWLER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobName = body.job as JobName | undefined;
  if (!jobName) {
    return NextResponse.json(
      { error: 'Missing "job" field. Valid jobs: crawlNewProjects, crawlProjectDetails' },
      { status: 400 }
    );
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────
  try {
    if (jobName === "crawlNewProjects") {
      const { crawlNewProjectsJob } = await import(
        "@/crawler/jobs/crawlNewProjectsJob"
      );
      const result = await crawlNewProjectsJob();
      return NextResponse.json({ ok: true, job: jobName, result });
    }

    if (jobName === "crawlProjectDetails") {
      const { crawlProjectDetailsJob } = await import(
        "@/crawler/jobs/crawlProjectDetailsJob"
      );
      const batchSize = typeof body.batchSize === "number" ? body.batchSize : 50;
      const result = await crawlProjectDetailsJob(batchSize);
      return NextResponse.json({ ok: true, job: jobName, result });
    }

    return NextResponse.json(
      { error: `Unknown job: ${jobName}` },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
