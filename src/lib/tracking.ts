import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { GeoScore } from "@/lib/pipeline/score";
import type { BrandProfile } from "@/lib/pipeline/profile";
import { promptsFor } from "@/lib/plans";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { confirmationEmail, weeklyEmail } from "@/lib/email/templates";
import { enqueue, hashIp } from "@/lib/analyses";
import { UserError } from "@/lib/errors";

/** Plan of scheduled runs: same prompt budget as the STARTER plan that sells weekly tracking. */
const TRACKING_PLAN = "STARTER" as const;
/** A site analyzed less than this long ago is not re-run (its user may have just checked it by hand). */
export const MIN_GAP_MS = 6 * 24 * 3_600_000;

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const manageUrl = (token: string, action: "confirm" | "unsubscribe") => `${appUrl()}/subscription/${token}?action=${action}`;
export const oneClickUnsubscribeUrl = (token: string) => `${appUrl()}/api/subscriptions/manage?token=${token}&action=unsubscribe`;

export interface LatestRun {
  websiteId: string;
  status: string | null;
  createdAt: Date | null;
}

/** Pure: which tracked websites get a run this week, oldest first, capped. */
export function pickWebsitesToRefresh(latest: LatestRun[], now: number, max: number): string[] {
  return latest
    .filter((r) => r.status !== "QUEUED" && r.status !== "RUNNING")
    .filter((r) => !r.createdAt || now - r.createdAt.getTime() >= MIN_GAP_MS)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
    .slice(0, Math.max(0, max))
    .map((r) => r.websiteId);
}

/** Cron entry (Mondays): queues one analysis per website with at least one confirmed subscriber. */
export async function scheduleWeeklyAnalyses(): Promise<{ queued: number; tracked: number }> {
  if (!emailConfigured()) {
    console.warn("[tracking] email is not configured: weekly runs skipped");
    return { queued: 0, tracked: 0 };
  }
  const db = getDb();
  const active = await db
    .selectDistinct({ websiteId: schema.subscriptions.websiteId })
    .from(schema.subscriptions)
    .where(and(isNotNull(schema.subscriptions.confirmedAt), isNull(schema.subscriptions.unsubscribedAt)));

  const latest: LatestRun[] = await Promise.all(
    active.map(async ({ websiteId }) => {
      const last = await db.query.analyses.findFirst({
        columns: { status: true, createdAt: true },
        where: eq(schema.analyses.websiteId, websiteId),
        orderBy: desc(schema.analyses.createdAt),
      });
      return { websiteId, status: last?.status ?? null, createdAt: last?.createdAt ?? null };
    }),
  );

  const picked = pickWebsitesToRefresh(latest, Date.now(), Number(process.env.MAX_WEEKLY_ANALYSES ?? 50));
  for (const websiteId of picked) {
    const [created] = await db
      .insert(schema.analyses)
      .values({ websiteId, plan: TRACKING_PLAN, trigger: "SCHEDULED" })
      .returning({ id: schema.analyses.id });
    await enqueue(created.id);
  }
  if (picked.length < latest.length) console.info(`[tracking] ${latest.length - picked.length} tracked sites skipped (recent run or cap)`);
  return { queued: picked.length, tracked: active.length };
}

/**
 * "Track my score weekly" sign-up for the analysis' website.
 * - waitlist: email sending isn't set up yet; the address is kept as a demand signal.
 * - pending: a confirmation email was sent (new or re-activated sign-up).
 * - confirmed: already tracking; nothing is sent, so the form can't be used to spam an address.
 */
export async function subscribe(analysisId: string, email: string, ip: string): Promise<"waitlist" | "pending" | "confirmed"> {
  const db = getDb();
  const analysis = await db.query.analyses.findFirst({ columns: { id: true, websiteId: true }, where: eq(schema.analyses.id, analysisId) });
  if (!analysis) throw new UserError("This report doesn't exist.");
  const normalized = email.toLowerCase();
  const where = and(eq(schema.subscriptions.email, normalized), eq(schema.subscriptions.websiteId, analysis.websiteId));

  const existing = await db.query.subscriptions.findFirst({ where });
  if (existing?.confirmedAt && !existing.unsubscribedAt) return "confirmed";
  const live = emailConfigured();
  if (existing && !existing.unsubscribedAt) {
    // Still waiting for confirmation: one email per sign-up, re-sending only after a day.
    if (!live) return "waitlist";
    if (existing.createdAt.getTime() > Date.now() - 24 * 3_600_000) return "pending";
  }

  const [sub] = existing
    ? await db
        .update(schema.subscriptions)
        .set({ confirmedAt: null, unsubscribedAt: null, createdAt: new Date(), token: existing.token ?? crypto.randomUUID() })
        .where(eq(schema.subscriptions.id, existing.id))
        .returning()
    : await db.insert(schema.subscriptions).values({ email: normalized, websiteId: analysis.websiteId, analysisId, ipHash: hashIp(ip) }).returning();
  if (!live) return "waitlist";

  const website = await db.query.websites.findFirst({ columns: { domain: true }, where: eq(schema.websites.id, analysis.websiteId) });
  const sent = await sendEmail(
    confirmationEmail({ to: normalized, domain: website?.domain ?? "your site", confirmUrl: manageUrl(sub.token!, "confirm"), questions: promptsFor(TRACKING_PLAN) }),
  );
  if (!sent) throw new UserError("We couldn't send the confirmation email. Please try again later.");
  return "pending";
}

export type SubscriptionAction = "confirm" | "unsubscribe";

export async function findSubscription(token: string) {
  const db = getDb();
  const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.token, token) });
  if (!sub) return null;
  const website = await db.query.websites.findFirst({ columns: { domain: true }, where: eq(schema.websites.id, sub.websiteId) });
  return { ...sub, domain: website?.domain ?? "your site" };
}

/** Idempotent. Returns false when the token is unknown. */
export async function applySubscriptionAction(token: string, action: SubscriptionAction): Promise<boolean> {
  const db = getDb();
  const set = action === "confirm" ? { confirmedAt: new Date(), unsubscribedAt: null } : { unsubscribedAt: new Date() };
  const rows = await db.update(schema.subscriptions).set(set).where(eq(schema.subscriptions.token, token)).returning({ id: schema.subscriptions.id });
  return rows.length > 0;
}

/** After a scheduled run: email the new score to each confirmed subscriber, at most once per analysis. */
export async function notifySubscribers(analysisId: string): Promise<number> {
  const db = getDb();
  const analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
  if (!analysis || analysis.status !== "COMPLETED" || analysis.trigger !== "SCHEDULED") return 0;

  const [website, previous, topFix, subs] = await Promise.all([
    db.query.websites.findFirst({ where: eq(schema.websites.id, analysis.websiteId) }),
    db.query.analyses.findFirst({
      columns: { geoScore: true },
      where: and(
        eq(schema.analyses.websiteId, analysis.websiteId),
        eq(schema.analyses.status, "COMPLETED"),
        ne(schema.analyses.id, analysisId),
        lt(schema.analyses.createdAt, analysis.createdAt),
      ),
      orderBy: desc(schema.analyses.createdAt),
    }),
    db.query.recommendations.findFirst({ columns: { title: true }, where: eq(schema.recommendations.analysisId, analysisId), orderBy: schema.recommendations.order }),
    db.query.subscriptions.findMany({
      where: and(
        eq(schema.subscriptions.websiteId, analysis.websiteId),
        isNotNull(schema.subscriptions.confirmedAt),
        isNull(schema.subscriptions.unsubscribedAt),
        or(isNull(schema.subscriptions.lastNotifiedAnalysisId), ne(schema.subscriptions.lastNotifiedAnalysisId, analysisId)),
      ),
    }),
  ]);
  if (!website) return 0;

  const profile = analysis.profile as BrandProfile | null;
  const totals = (analysis.scoreBreakdown as GeoScore | null)?.totals;
  const sent: string[] = [];
  for (const sub of subs) {
    if (!sub.token) continue;
    const ok = await sendEmail(
      weeklyEmail({
        to: sub.email,
        brand: profile?.brand ?? website.domain,
        domain: website.domain,
        score: analysis.geoScore ?? 0,
        previous: previous?.geoScore ?? null,
        mentioned: totals?.mentioned ?? 0,
        responses: totals?.responses ?? 0,
        topFix: topFix?.title ?? null,
        reportUrl: `${appUrl()}/report/${analysisId}`,
        unsubscribeUrl: manageUrl(sub.token, "unsubscribe"),
        oneClickUnsubscribeUrl: oneClickUnsubscribeUrl(sub.token),
      }),
    );
    if (ok) sent.push(sub.id);
  }
  if (sent.length) await db.update(schema.subscriptions).set({ lastNotifiedAnalysisId: analysisId }).where(inArray(schema.subscriptions.id, sent));
  return sent.length;
}
