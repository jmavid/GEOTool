import { NextResponse } from "next/server";
import { consumeLoginToken, sameOrigin, startSession } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";

/** POST only: mail scanners follow GET links, so they can't spend someone's sign-in link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const plan = paidPlan(form?.get("plan"));
  const user = await consumeLoginToken(token);
  if (!user) return NextResponse.redirect(new URL(`/auth/verify/${encodeURIComponent(token)}`, req.url), 303);
  await startSession(user.id);
  return NextResponse.redirect(new URL(plan ? `/pricing?plan=${plan}` : "/dashboard", req.url), 303);
}
