import { NextResponse } from "next/server";
import { consumeLoginToken, sameOrigin, startSession } from "@/lib/auth/session";

/** POST only: mail scanners follow GET links, so they can't spend someone's sign-in link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const token = String((await req.formData().catch(() => null))?.get("token") ?? "");
  const user = await consumeLoginToken(token);
  if (!user) return NextResponse.redirect(new URL(`/auth/verify/${encodeURIComponent(token)}?expired=1`, req.url), 303);
  await startSession(user.id);
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
