import { NextResponse } from "next/server";
import { z } from "zod";
import { applySubscriptionAction } from "@/lib/tracking";

const Params = z.object({ token: z.string().regex(/^[0-9a-f-]{32,36}$/), action: z.enum(["confirm", "unsubscribe"]) });

/**
 * POST only: link scanners in mail clients follow GET links, which must never confirm or unsubscribe.
 * Serves both the buttons on /subscription/[token] and RFC 8058 one-click unsubscribe (List-Unsubscribe-Post).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const parsed = Params.safeParse({ token: url.searchParams.get("token"), action: url.searchParams.get("action") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  const ok = await applySubscriptionAction(parsed.data.token, parsed.data.action);
  if (!ok) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  return NextResponse.redirect(new URL(`/subscription/${parsed.data.token}?done=${parsed.data.action}`, url), 303);
}
