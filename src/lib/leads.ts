import { and, count, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendOwnerEmail } from "@/lib/email/owner-send";
import { sendEmail } from "@/lib/email/send";
import { ownerLeadEmail, reportReadyEmail } from "@/lib/email/templates";
import { UserError } from "@/lib/errors";
import type { RequestMeta } from "@/lib/owner-notify";
import type { BrandProfile } from "@/lib/pipeline/profile";
import type { GeoScore } from "@/lib/pipeline/score";
import { hashIp, unlimitedIp } from "@/lib/security/rate-limit";
import { appUrl } from "@/lib/tracking";

/** Contacts one IP may leave per day: plenty for a team, too few to spam strangers with report emails. */
const LEADS_PER_IP_PER_DAY = 10;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** Lower-cased and trimmed, or null when it doesn't look like an address. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/**
 * Saves a visitor's email for a report, tells the owner, and emails the report at once if it is already finished.
 * The report email itself is sent when the analysis ends (see notifyLeads).
 */
export async function saveLead(input: { analysisId: string; email: string; marketing: boolean; meta: RequestMeta }): Promise<{ ready: boolean }> {
  const email = normalizeEmail(input.email);
  if (!email) throw new UserError("Enter a valid email address.");
  const db = getDb();
  const analysis = await db.query.analyses.findFirst({ columns: { id: true, websiteId: true, status: true }, where: eq(schema.analyses.id, input.analysisId) });
  if (!analysis) throw new UserError("This report doesn't exist.");

  const ipHash = hashIp(input.meta.ip);
  if (!unlimitedIp(input.meta.ip)) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gte(schema.leads.createdAt, new Date(Date.now() - 24 * 3_600_000))));
    if (n >= LEADS_PER_IP_PER_DAY) throw new UserError("Too many emails from this connection today. Try again tomorrow.");
  }

  const existing = await db.query.leads.findFirst({ where: and(eq(schema.leads.email, email), eq(schema.leads.analysisId, analysis.id)) });
  if (existing) {
    if (input.marketing && !existing.marketingConsent) await db.update(schema.leads).set({ marketingConsent: true }).where(eq(schema.leads.id, existing.id));
  } else {
    await db.insert(schema.leads).values({ email, analysisId: analysis.id, websiteId: analysis.websiteId, marketingConsent: input.marketing, ipHash });
    await notifyOwnerOfLead(email, analysis.websiteId, analysis.id, input.marketing, input.meta);
  }

  const done = analysis.status === "COMPLETED" || analysis.status === "FAILED";
  if (done) await notifyLeads(analysis.id);
  return { ready: done };
}

async function notifyOwnerOfLead(email: string, websiteId: string, analysisId: string, marketing: boolean, meta: RequestMeta) {
  const to = process.env.OWNER_NOTIFY_EMAIL?.trim();
  if (!to) return;
  try {
    const website = await getDb().query.websites.findFirst({ columns: { domain: true }, where: eq(schema.websites.id, websiteId) });
    const sent = await sendOwnerEmail(
      ownerLeadEmail({
        to,
        email,
        domain: website?.domain ?? "unknown site",
        marketing,
        reportUrl: `${appUrl()}/report/${analysisId}`,
        ip: meta.ip,
        country: meta.country ?? null,
      }),
    );
    console.info(`[lead ${analysisId}] owner email ${sent ? "sent" : "not sent"}`);
  } catch (err) {
    console.error(`[lead ${analysisId}] owner email failed:`, err);
  }
}

/** Emails the finished (or failed) report to everyone who asked for it and hasn't got it yet. Never throws. */
export async function notifyLeads(analysisId: string): Promise<number> {
  try {
    const db = getDb();
    const analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
    if (!analysis || (analysis.status !== "COMPLETED" && analysis.status !== "FAILED")) return 0;
    const pending = await db.query.leads.findMany({ where: and(eq(schema.leads.analysisId, analysisId), isNull(schema.leads.reportSentAt)) });
    if (!pending.length) return 0;
    const [website, topFix] = await Promise.all([
      db.query.websites.findFirst({ columns: { domain: true }, where: eq(schema.websites.id, analysis.websiteId) }),
      db.query.recommendations.findFirst({ columns: { title: true }, where: eq(schema.recommendations.analysisId, analysisId), orderBy: schema.recommendations.order }),
    ]);
    const domain = website?.domain ?? "your website";
    const totals = (analysis.scoreBreakdown as GeoScore | null)?.totals;
    let sent = 0;
    for (const lead of pending) {
      const ok = await sendEmail(
        reportReadyEmail({
          to: lead.email,
          domain,
          brand: (analysis.profile as BrandProfile | null)?.brand ?? domain,
          score: analysis.status === "COMPLETED" ? (analysis.geoScore ?? 0) : null,
          mentioned: totals?.mentioned ?? 0,
          responses: totals?.responses ?? 0,
          topFix: topFix?.title ?? null,
          reportUrl: `${appUrl()}/report/${analysisId}`,
          homeUrl: appUrl(),
        }),
      );
      if (ok) {
        sent++;
        await db.update(schema.leads).set({ reportSentAt: new Date() }).where(eq(schema.leads.id, lead.id));
      }
    }
    console.info(`[analysis ${analysisId}] report emailed to ${sent} of ${pending.length} contacts`);
    return sent;
  } catch (err) {
    console.error(`[analysis ${analysisId}] contact emails failed:`, err);
    return 0;
  }
}

/** The contacts who asked for this report, for the owner's email. */
export async function leadEmailsFor(analysisId: string): Promise<string[]> {
  const rows = await getDb().query.leads.findMany({ columns: { email: true }, where: eq(schema.leads.analysisId, analysisId) });
  return rows.map((r) => r.email);
}
