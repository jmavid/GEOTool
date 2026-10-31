import { NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/security/internal";
import { scheduleWeeklyAnalyses } from "@/lib/tracking";

// Called only by the weekly Cron Trigger in worker.js through the self service binding.
export async function POST(req: Request) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await scheduleWeeklyAnalyses();
  console.info(`[tracking] weekly run: ${result.queued} queued for ${result.tracked} tracked sites`);
  return NextResponse.json(result);
}
