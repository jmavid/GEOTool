import { and, asc, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Plan } from "@/db/schema";
import type { User } from "@/lib/auth/session";
import { ANALYSIS_WINDOW_MS, PLANS } from "@/lib/plans";
import { UserError } from "@/lib/errors";

const DEFAULT_PROJECT = "My websites";

/** Every account has at least one project; non-agency plans only ever use this one. */
export async function defaultProjectId(userId: string): Promise<string> {
  const db = getDb();
  const first = await db.query.projects.findFirst({ columns: { id: true }, where: eq(schema.projects.userId, userId), orderBy: asc(schema.projects.createdAt) });
  if (first) return first.id;
  const [created] = await db.insert(schema.projects).values({ userId, name: DEFAULT_PROJECT }).returning({ id: schema.projects.id });
  return created.id;
}

/** The project when it belongs to the user, else null (never trust a projectId from a form). */
export async function ownedProject(userId: string, projectId: string) {
  return (await getDb().query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)) })) ?? null;
}

/** Websites across all of the user's projects. */
export async function trackedWebsiteIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ websiteId: schema.projectWebsites.websiteId })
    .from(schema.projectWebsites)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectWebsites.projectId))
    .where(eq(schema.projects.userId, userId));
  return rows.map((r) => r.websiteId);
}

export async function analysesLast30Days(userId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.analyses)
    .where(and(eq(schema.analyses.userId, userId), eq(schema.analyses.trigger, "USER"), gte(schema.analyses.createdAt, new Date(Date.now() - ANALYSIS_WINDOW_MS))));
  return n;
}

export async function attachWebsite(projectId: string, websiteId: string): Promise<void> {
  await getDb().insert(schema.projectWebsites).values({ projectId, websiteId }).onConflictDoNothing();
}

export async function detachWebsite(userId: string, projectWebsiteId: string): Promise<void> {
  const db = getDb();
  const row = await db.query.projectWebsites.findFirst({ where: eq(schema.projectWebsites.id, projectWebsiteId) });
  if (!row || !(await ownedProject(userId, row.projectId))) throw new UserError("That website isn't in your dashboard.");
  await db.delete(schema.projectWebsites).where(eq(schema.projectWebsites.id, projectWebsiteId));
}

/** Agency plans group sites by client; other plans keep the single default project. */
export async function createProject(user: User, rawName: string): Promise<string> {
  if (!PLANS[user.plan].reports) throw new UserError("Client projects are part of the Agency plan.");
  const name = rawName.trim().slice(0, 80);
  if (!name) throw new UserError("Give the project a name.");
  const [created] = await getDb().insert(schema.projects).values({ userId: user.id, name }).returning({ id: schema.projects.id });
  return created.id;
}

export interface DashboardSite {
  linkId: string;
  websiteId: string;
  domain: string;
  url: string;
  latest: { id: string; status: string; score: number | null; createdAt: Date } | null;
  history: { id: string; score: number; createdAt: Date }[];
}

export interface DashboardProject {
  id: string;
  name: string;
  sites: DashboardSite[];
}

/** Projects with each site's latest analysis and its completed score history (oldest first). */
export async function dashboard(userId: string): Promise<DashboardProject[]> {
  const db = getDb();
  await defaultProjectId(userId);
  const projects = await db.query.projects.findMany({ where: eq(schema.projects.userId, userId), orderBy: asc(schema.projects.createdAt) });
  const links = projects.length
    ? await db
        .select({ linkId: schema.projectWebsites.id, projectId: schema.projectWebsites.projectId, websiteId: schema.websites.id, domain: schema.websites.domain, url: schema.websites.url })
        .from(schema.projectWebsites)
        .innerJoin(schema.websites, eq(schema.websites.id, schema.projectWebsites.websiteId))
        .where(inArray(schema.projectWebsites.projectId, projects.map((p) => p.id)))
        .orderBy(asc(schema.projectWebsites.createdAt))
    : [];
  const websiteIds = [...new Set(links.map((l) => l.websiteId))];
  const runs = websiteIds.length
    ? await db.query.analyses.findMany({
        columns: { id: true, websiteId: true, status: true, geoScore: true, createdAt: true },
        where: inArray(schema.analyses.websiteId, websiteIds),
        orderBy: desc(schema.analyses.createdAt),
      })
    : [];

  const siteFor = (l: (typeof links)[number]): DashboardSite => {
    const own = runs.filter((r) => r.websiteId === l.websiteId);
    const latest = own[0];
    return {
      ...l,
      latest: latest ? { id: latest.id, status: latest.status, score: latest.geoScore, createdAt: latest.createdAt } : null,
      history: own
        .filter((r) => r.status === "COMPLETED" && r.geoScore !== null)
        .slice(0, 12)
        .reverse()
        .map((r) => ({ id: r.id, score: r.geoScore!, createdAt: r.createdAt })),
    };
  };
  return projects.map((p) => ({ id: p.id, name: p.name, sites: links.filter((l) => l.projectId === p.id).map(siteFor) }));
}

/**
 * Every (website, paying owner) pair: these sites get the weekly run, and their owners its email. An account only counts
 * its oldest websites up to its plan's limit, so a downgrade can't keep paying for more sites than the plan includes.
 */
export async function paidTrackedSites() {
  const rows = await getDb()
    .select({ userId: schema.users.id, websiteId: schema.projectWebsites.websiteId, email: schema.users.email, plan: schema.users.plan })
    .from(schema.projectWebsites)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectWebsites.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .where(ne(schema.users.plan, "FREE"))
    .orderBy(asc(schema.projectWebsites.createdAt));
  return withinPlan(rows);
}

/** Pure: keep each account's first N distinct websites, N = its plan's website limit. */
export function withinPlan<T extends { userId: string; websiteId: string; plan: Plan }>(rows: T[]): T[] {
  const seen = new Map<string, Set<string>>();
  return rows.filter((r) => {
    const sites = seen.get(r.userId) ?? new Set<string>();
    seen.set(r.userId, sites);
    if (sites.has(r.websiteId) || sites.size >= PLANS[r.plan].websites) return false;
    sites.add(r.websiteId);
    return true;
  });
}

export interface ClientReportSite {
  domain: string;
  brand: string;
  analysisId: string | null;
  score: number | null;
  previous: number | null;
  history: number[];
  date: Date | null;
  mentioned: number;
  recommended: number;
  responses: number;
  sentiment: { positive: number; neutral: number; negative: number };
  competitors: { name: string; share: number; isTarget: boolean }[];
  fixes: { priority: string; title: string; action: string }[];
}

/** Agency client report: latest completed analysis of every site in the project. Owner + Agency plan only. */
export async function clientReport(user: User, projectId: string) {
  if (!PLANS[user.plan].reports) throw new UserError("Client reports are part of the Agency plan.");
  const project = await ownedProject(user.id, projectId);
  if (!project) throw new UserError("That project doesn't exist.");
  const db = getDb();
  const sites = (await dashboard(user.id)).find((p) => p.id === projectId)?.sites ?? [];

  const rows: ClientReportSite[] = await Promise.all(
    sites.map(async (s) => {
      const latestId = s.history.at(-1)?.id ?? null;
      const analysis = latestId ? await db.query.analyses.findFirst({ where: eq(schema.analyses.id, latestId) }) : null;
      const [responses, competitors, fixes] = latestId
        ? await Promise.all([
            db.query.aiResponses.findMany({ columns: { brandMentioned: true, recommended: true, sentiment: true }, where: eq(schema.aiResponses.analysisId, latestId) }),
            db.query.competitors.findMany({ where: eq(schema.competitors.analysisId, latestId), orderBy: desc(schema.competitors.mentions), limit: 4 }),
            db.query.recommendations.findMany({ where: eq(schema.recommendations.analysisId, latestId), orderBy: asc(schema.recommendations.order), limit: 3 }),
          ])
        : [[], [], []];
      const scores = s.history.map((h) => h.score);
      const count = (k: string) => responses.filter((r) => r.brandMentioned && r.sentiment === k).length;
      return {
        domain: s.domain,
        brand: (analysis?.profile as { brand?: string } | null)?.brand ?? s.domain,
        analysisId: latestId,
        score: scores.at(-1) ?? null,
        previous: scores.length > 1 ? scores.at(-2)! : null,
        history: scores,
        date: s.history.at(-1)?.createdAt ?? null,
        mentioned: responses.filter((r) => r.brandMentioned).length,
        recommended: responses.filter((r) => r.recommended).length,
        responses: responses.length,
        sentiment: { positive: count("positive"), neutral: count("neutral"), negative: count("negative") },
        competitors: competitors.map((c) => ({ name: c.name, share: c.shareOfVoice, isTarget: c.isTarget })),
        fixes: fixes.map((f) => ({ priority: f.priority, title: f.title, action: f.action })),
      };
    }),
  );
  return { project, agencyName: user.agencyName, sites: rows };
}
