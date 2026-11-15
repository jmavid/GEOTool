import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendEmail } from "@/lib/email/send";
import { ownerAnalysisEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/tracking";

/**
 * Emails the site owner (OWNER_NOTIFY_EMAIL) about an analysis a client ran, finished or failed.
 * Weekly re-checks are automatic, not a client using the service, so they send none. Never throws.
 */
export async function notifyOwner(analysisId: string): Promise<void> {
  const to = process.env.OWNER_NOTIFY_EMAIL?.trim();
  if (!to) return;
  try {
    const db = getDb();
    const analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
    if (!analysis || analysis.trigger !== "USER" || (analysis.status !== "COMPLETED" && analysis.status !== "FAILED")) return;
    const website = await db.query.websites.findFirst({ where: eq(schema.websites.id, analysis.websiteId) });
    const user = analysis.userId ? await db.query.users.findFirst({ where: eq(schema.users.id, analysis.userId) }) : null;
    const engines = Object.values((analysis.providerScores ?? {}) as Record<string, { name?: string }>).map((p) => p.name ?? "");
    const end = analysis.completedAt ?? new Date();
    await sendEmail(
      ownerAnalysisEmail({
        to,
        domain: website?.domain ?? "unknown site",
        reportUrl: `${appUrl()}/report/${analysis.id}`,
        status: analysis.status,
        score: analysis.geoScore,
        error: analysis.error,
        plan: analysis.plan,
        account: user?.email ?? null,
        engines: engines.filter(Boolean),
        costUsd: analysis.costUsd,
        seconds: (end.getTime() - analysis.createdAt.getTime()) / 1000,
      }),
    );
  } catch (err) {
    console.error(`[analysis ${analysisId}] owner email failed:`, err);
  }
}
