import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendOwnerEmail } from "@/lib/email/owner-send";
import { ownerAnalysisEmail } from "@/lib/email/templates";
import { leadEmailsFor } from "@/lib/leads";
import { appUrl } from "@/lib/tracking";

/** Who asked for an analysis. Only travels with the queue message to the owner's email; never stored. */
export interface RequestMeta {
  ip: string;
  country?: string;
  userAgent?: string;
}

/** The request details from Cloudflare's headers. */
export function requestMeta(req: Request): RequestMeta {
  const h = req.headers;
  return {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    country: h.get("cf-ipcountry") ?? undefined,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined,
  };
}

/**
 * Emails the site owner (OWNER_NOTIFY_EMAIL) about an analysis a client asked for: when it finishes or fails, or right
 * away when an existing report was reused. Weekly re-checks are automatic, so they send none. Never throws.
 */
export async function notifyOwner(analysisId: string, meta?: RequestMeta, opts: { reused?: boolean } = {}): Promise<void> {
  const to = process.env.OWNER_NOTIFY_EMAIL?.trim();
  if (!to) return console.warn(`[analysis ${analysisId}] owner email skipped: OWNER_NOTIFY_EMAIL is not set`);
  try {
    const db = getDb();
    const analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
    if (!analysis || analysis.trigger !== "USER") return console.info(`[analysis ${analysisId}] owner email skipped: not a client run`);
    if (!opts.reused && analysis.status !== "COMPLETED" && analysis.status !== "FAILED") return;
    const website = await db.query.websites.findFirst({ where: eq(schema.websites.id, analysis.websiteId) });
    const user = analysis.userId ? await db.query.users.findFirst({ where: eq(schema.users.id, analysis.userId) }) : null;
    const engines = Object.values((analysis.providerScores ?? {}) as Record<string, { name?: string }>).map((p) => p.name ?? "");
    const end = analysis.completedAt ?? new Date();
    const sent = await sendOwnerEmail(
      ownerAnalysisEmail({
        to,
        domain: website?.domain ?? "unknown site",
        url: website?.url ?? "",
        reportUrl: `${appUrl()}/report/${analysis.id}`,
        status: analysis.status,
        reused: !!opts.reused,
        score: analysis.geoScore,
        error: analysis.error,
        plan: analysis.plan,
        account: user?.email ?? null,
        contacts: await leadEmailsFor(analysis.id),
        ip: meta?.ip ?? null,
        country: meta?.country ?? null,
        userAgent: meta?.userAgent ?? null,
        engines: engines.filter(Boolean),
        costUsd: opts.reused ? 0 : analysis.costUsd,
        seconds: opts.reused ? null : (end.getTime() - analysis.createdAt.getTime()) / 1000,
        at: new Date(),
      }),
    );
    if (sent) console.info(`[analysis ${analysisId}] owner email sent (${opts.reused ? "reused report" : analysis.status})`);
    else console.warn(`[analysis ${analysisId}] owner email not sent`);
  } catch (err) {
    console.error(`[analysis ${analysisId}] owner email failed:`, err);
  }
}
