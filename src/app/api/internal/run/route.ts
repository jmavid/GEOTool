import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/pipeline/run";
import type { RequestMeta } from "@/lib/owner-notify";
import { isInternalRequest } from "@/lib/security/internal";

// Called only by the queue consumer in worker.js through the self service binding.
export async function POST(req: Request) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { analysisId, meta } = (await req.json().catch(() => ({}))) as { analysisId?: string; meta?: RequestMeta };
  if (!analysisId) return NextResponse.json({ error: "Missing analysisId" }, { status: 400 });
  await runAnalysis(analysisId, meta);
  return NextResponse.json({ ok: true });
}
