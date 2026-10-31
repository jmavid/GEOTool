import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, count, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashIp } from "@/lib/analyses";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { loginEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/tracking";
import { UserError } from "@/lib/errors";

export const SESSION_COOKIE = "geo_session";
const SESSION_MS = 30 * 24 * 3_600_000;
const LINK_MINUTES = 15;
/** Sign-in emails per address and per IP per hour: stops the form being used to flood someone's inbox. */
const LINKS_PER_EMAIL_PER_HOUR = 3;
const LINKS_PER_IP_PER_HOUR = 10;

export type User = typeof schema.users.$inferSelect;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

/** Emails a single-use sign-in link. Says nothing about whether the address has an account. `plan`: resume checkout after. */
export async function requestLoginLink(rawEmail: string, ip: string, plan: string | null = null): Promise<void> {
  if (!emailConfigured()) throw new UserError("Sign-in isn't open yet. Please check back soon.");
  const email = rawEmail.trim().toLowerCase();
  const db = getDb();
  const ipHash = hashIp(ip);
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [[byEmail], [byIp]] = await Promise.all([
    db.select({ n: count() }).from(schema.loginTokens).where(and(eq(schema.loginTokens.email, email), gte(schema.loginTokens.createdAt, hourAgo))),
    db.select({ n: count() }).from(schema.loginTokens).where(and(eq(schema.loginTokens.ipHash, ipHash), gte(schema.loginTokens.createdAt, hourAgo))),
  ]);
  if (byEmail.n >= LINKS_PER_EMAIL_PER_HOUR || byIp.n >= LINKS_PER_IP_PER_HOUR) {
    throw new UserError("Too many sign-in emails. Use the last link we sent, or try again in an hour.");
  }

  const token = newToken();
  await db.insert(schema.loginTokens).values({ id: sha256(token), email, ipHash, expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
  const sent = await sendEmail(loginEmail({ to: email, loginUrl: `${appUrl()}/auth/verify/${token}${plan ? `?plan=${plan}` : ""}`, minutes: LINK_MINUTES }));
  if (!sent) throw new UserError("We couldn't send the email. Please try again later.");
}

/** Spends a sign-in token and returns the (possibly new) user, or null when the link is unknown, used or expired. */
export async function consumeLoginToken(token: string): Promise<User | null> {
  if (!isTokenShape(token)) return null;
  const db = getDb();
  const now = new Date();
  // The conditional UPDATE is the single-use guarantee: two clicks can't both get a row back.
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.loginTokens.id, sha256(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
    .returning({ email: schema.loginTokens.email });
  if (!row) return null;
  await db.insert(schema.users).values({ email: row.email }).onConflictDoNothing();
  return (await db.query.users.findFirst({ where: eq(schema.users.email, row.email) })) ?? null;
}

/** Whether the link still works, without spending it (the verify page only spends it on the button press). */
export async function loginTokenUsable(token: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const row = await getDb().query.loginTokens.findFirst({
    columns: { id: true },
    where: and(eq(schema.loginTokens.id, sha256(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())),
  });
  return !!row;
}

export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const db = getDb();
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  // Housekeeping on sign-in rather than a cron: expired sessions and links are useless anyway.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.delete(schema.loginTokens).where(lt(schema.loginTokens.expiresAt, new Date(Date.now() - 24 * 3_600_000)));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !isTokenShape(token)) return null;
  const db = getDb();
  const session = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())) });
  if (!session) return null;
  return (await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) })) ?? null;
});

/**
 * Mutating routes accept same-origin requests only. SameSite=Lax already keeps the session cookie off
 * cross-site POSTs; this also covers same-site subdomains.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // "null" comes from privacy referrer policies; the browser's own Sec-Fetch-Site then decides.
  if (!origin || origin === "null") return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/**
 * Erases the account: sessions, projects and their website links (cascade), sign-in links and tracking emails for this
 * address. Analyses stay (reports are shareable and hold no personal data) but lose the link to the user.
 */
export async function deleteAccount(user: User): Promise<void> {
  const db = getDb();
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.email, user.email));
  await db.delete(schema.loginTokens).where(eq(schema.loginTokens.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  (await cookies()).delete(SESSION_COOKIE);
}
