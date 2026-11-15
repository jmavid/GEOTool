import { and, countDistinct, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashIp } from "@/lib/security/rate-limit";

export interface FunnelStep {
  key: string;
  label: string;
  hint: string;
  count: number;
  /** Share of the previous step that reached this one (null for the first step or an empty previous step). */
  fromPrevious: number | null;
}

/** Turns raw counts into funnel steps with step-to-step conversion. Pure, so it is unit-tested. */
export function buildFunnel(counts: { started: number; completed: number; leads: number; accounts: number; paid: number }): FunnelStep[] {
  const raw: Omit<FunnelStep, "fromPrevious">[] = [
    { key: "started", label: "Launched an analysis", hint: "different visitors (by connection) who entered a website", count: counts.started },
    { key: "completed", label: "Got a finished report", hint: "of those, whose analysis completed", count: counts.completed },
    { key: "leads", label: "Left their email", hint: "different emails given to open a report", count: counts.leads },
    { key: "accounts", label: "Created an account", hint: "signed in for the first time", count: counts.accounts },
    { key: "paid", label: "Paid", hint: "accounts created in the period that are on a paid plan", count: counts.paid },
  ];
  return raw.map((s, i) => ({ ...s, fromPrevious: i === 0 || raw[i - 1].count === 0 ? null : s.count / raw[i - 1].count }));
}

/** Hashes of the owner's exact UNLIMITED_IPS addresses, so the owner's own tests don't count (prefixes can't be hashed). */
export function ownerIpHashes(): string[] {
  return (process.env.UNLIMITED_IPS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !s.endsWith(".") && !s.endsWith(":"))
    .map(hashIp);
}

/** Whether this signed-in email is the site owner's (OWNER_NOTIFY_EMAIL), who alone may see the funnel. */
export function isOwner(email: string | null | undefined): boolean {
  const owner = process.env.OWNER_NOTIFY_EMAIL?.trim().toLowerCase();
  return !!owner && !!email && email.trim().toLowerCase() === owner;
}

/** Funnel for visitors who arrived in the last `days` days, leaving out the owner's own IPs and email. */
export async function funnelSince(days: number): Promise<FunnelStep[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 3_600_000);
  const ownerHashes = ownerIpHashes();
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL?.trim().toLowerCase() || "";
  const notOwnerIp = (col: typeof schema.analyses.ipHash | typeof schema.leads.ipHash) =>
    ownerHashes.length ? sql`(${col} is null or ${notInArray(col, ownerHashes)})` : sql`1 = 1`;

  const userRuns = and(eq(schema.analyses.trigger, "USER"), gte(schema.analyses.createdAt, since), notOwnerIp(schema.analyses.ipHash));
  const [[started], [completed], [leads], [accounts], [paid]] = await Promise.all([
    db.select({ n: countDistinct(schema.analyses.ipHash) }).from(schema.analyses).where(userRuns),
    db.select({ n: countDistinct(schema.analyses.ipHash) }).from(schema.analyses).where(and(userRuns, eq(schema.analyses.status, "COMPLETED"))),
    db
      .select({ n: countDistinct(schema.leads.email) })
      .from(schema.leads)
      .where(and(gte(schema.leads.createdAt, since), ne(schema.leads.email, ownerEmail), notOwnerIp(schema.leads.ipHash))),
    db.select({ n: countDistinct(schema.users.id) }).from(schema.users).where(and(gte(schema.users.createdAt, since), ne(schema.users.email, ownerEmail))),
    db
      .select({ n: countDistinct(schema.users.id) })
      .from(schema.users)
      .where(and(gte(schema.users.createdAt, since), ne(schema.users.email, ownerEmail), inArray(schema.users.plan, ["STARTER", "PRO", "AGENCY"]))),
  ]);
  return buildFunnel({ started: started.n, completed: completed.n, leads: leads.n, accounts: accounts.n, paid: paid.n });
}
