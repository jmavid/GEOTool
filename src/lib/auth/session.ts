import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, count, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashIp } from "@/lib/security/rate-limit";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { resetEmail, verifyEmail } from "@/lib/email/templates";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
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

type TokenPurpose = "login" | "verify" | "reset";

/**
 * Stores a single-use link token (only its SHA-256) and returns the raw token for the email. Rate-limited per address
 * and per IP, so the forms can't be used to flood someone's inbox.
 */
async function issueToken(email: string, ip: string, purpose: TokenPurpose, passwordHash: string | null = null): Promise<string> {
  if (!emailConfigured()) throw new UserError("Accounts aren't open yet. Please check back soon.");
  const db = getDb();
  const ipHash = hashIp(ip);
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [[byEmail], [byIp]] = await Promise.all([
    db.select({ n: count() }).from(schema.loginTokens).where(and(eq(schema.loginTokens.email, email), gte(schema.loginTokens.createdAt, hourAgo))),
    db.select({ n: count() }).from(schema.loginTokens).where(and(eq(schema.loginTokens.ipHash, ipHash), gte(schema.loginTokens.createdAt, hourAgo))),
  ]);
  if (byEmail.n >= LINKS_PER_EMAIL_PER_HOUR || byIp.n >= LINKS_PER_IP_PER_HOUR) {
    throw new UserError("Too many emails sent. Use the last link we sent, or try again in an hour.");
  }
  const token = newToken();
  await db.insert(schema.loginTokens).values({ id: sha256(token), email, ipHash, purpose, passwordHash, expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
  return token;
}

async function send(email: Parameters<typeof sendEmail>[0]): Promise<void> {
  if (!(await sendEmail(email))) throw new UserError("We couldn't send the email. Please try again later.");
}

const normalize = (raw: string) => raw.trim().toLowerCase();
const withPlan = (url: string, plan: string | null) => (plan ? `${url}?plan=${plan}` : url);

/**
 * Sign-up: emails a confirmation link. The account and its password are only created when that link is used, so nobody
 * can claim someone else's address. If the address already has an account, it gets a "set a new password" link instead,
 * and the response is the same either way (the form doesn't reveal who has an account).
 */
export async function signUp(rawEmail: string, password: string, ip: string, plan: string | null = null): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem);
  const email = normalize(rawEmail);
  const existing = await getDb().query.users.findFirst({ columns: { id: true }, where: eq(schema.users.email, email) });
  if (existing) {
    const token = await issueToken(email, ip, "reset");
    await send(resetEmail({ to: email, url: `${appUrl()}/reset/${token}`, minutes: LINK_MINUTES, signupAttempt: true }));
    return;
  }
  const token = await issueToken(email, ip, "verify", await hashPassword(password));
  await send(verifyEmail({ to: email, url: withPlan(`${appUrl()}/auth/verify/${token}`, plan), minutes: LINK_MINUTES }));
}

// Compared against when the address has no password, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** The account for this email and password, or null. Accounts made with email links have no password until reset. */
export async function signIn(rawEmail: string, password: string): Promise<User | null> {
  const user = await getDb().query.users.findFirst({ where: eq(schema.users.email, normalize(rawEmail)) });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return ok && user?.passwordHash ? user : null;
}

/** Emails a "set a new password" link if the address has an account; silent otherwise (same response either way). */
export async function requestPasswordReset(rawEmail: string, ip: string): Promise<void> {
  const email = normalize(rawEmail);
  const user = await getDb().query.users.findFirst({ columns: { id: true }, where: eq(schema.users.email, email) });
  if (!user) return;
  const token = await issueToken(email, ip, "reset");
  await send(resetEmail({ to: email, url: `${appUrl()}/reset/${token}`, minutes: LINK_MINUTES }));
}

/** Spends a link token of one of these purposes; returns its row, or null when unknown, used, expired or another kind. */
async function spendToken(token: string, purposes: TokenPurpose[]) {
  if (!isTokenShape(token)) return null;
  const now = new Date();
  // The conditional UPDATE is the single-use guarantee: two clicks can't both get a row back.
  const [row] = await getDb()
    .update(schema.loginTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.loginTokens.id, sha256(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
    .returning({ email: schema.loginTokens.email, purpose: schema.loginTokens.purpose, passwordHash: schema.loginTokens.passwordHash });
  return row && purposes.includes(row.purpose) ? row : null;
}

/** Creates the account if needed, marks the email proven and, when given, sets the password. */
async function provenAccount(email: string, passwordHash: string | null): Promise<User | null> {
  const db = getDb();
  const now = new Date();
  await db.insert(schema.users).values({ email, passwordHash, emailVerifiedAt: now }).onConflictDoNothing();
  await db
    .update(schema.users)
    .set(passwordHash ? { passwordHash, emailVerifiedAt: now } : { emailVerifiedAt: now })
    .where(eq(schema.users.email, email));
  return (await db.query.users.findFirst({ where: eq(schema.users.email, email) })) ?? null;
}

/** Spends a sign-up confirmation link (or an older emailed sign-in link) and returns the (possibly new) user, or null when it doesn't work. */
export async function consumeLoginToken(token: string): Promise<User | null> {
  const row = await spendToken(token, ["login", "verify"]);
  return row ? provenAccount(row.email, row.passwordHash) : null;
}

/** Spends a password-reset link and sets the new password. Null when the link doesn't work. */
export async function resetPassword(token: string, password: string): Promise<User | null> {
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem);
  const row = await spendToken(token, ["reset"]);
  return row ? provenAccount(row.email, await hashPassword(password)) : null;
}

/** The link's purpose while it still works (without spending it: pages only spend it on a button press), else null. */
export async function usableTokenPurpose(token: string): Promise<TokenPurpose | null> {
  if (!isTokenShape(token)) return null;
  const row = await getDb().query.loginTokens.findFirst({
    columns: { purpose: true },
    where: and(eq(schema.loginTokens.id, sha256(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())),
  });
  return row?.purpose ?? null;
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
  await db.delete(schema.leads).where(eq(schema.leads.email, user.email));
  await db.delete(schema.loginTokens).where(eq(schema.loginTokens.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  (await cookies()).delete(SESSION_COOKIE);
}
