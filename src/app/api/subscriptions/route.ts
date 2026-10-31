import { NextResponse } from "next/server";
import { z } from "zod";
import { publicMessage } from "@/lib/errors";
import { burstLimited } from "@/lib/security/rate-limit";
import { subscribe } from "@/lib/tracking";

const Body = z.object({
  analysisId: z.string().regex(/^[0-9a-f-]{36}$/),
  email: z.string().trim().max(254).pipe(z.email()),
});

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (burstLimited(`sub:${ip}`)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    const status = await subscribe(parsed.data.analysisId, parsed.data.email, ip);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const message = publicMessage(err);
    return NextResponse.json({ error: message }, { status: message.startsWith("Something went wrong") ? 500 : 400 });
  }
}
