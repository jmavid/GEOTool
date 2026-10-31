import { NextResponse } from "next/server";
import { z } from "zod";
import { createAnalysis } from "@/lib/analyses";
import { publicMessage } from "@/lib/errors";
import { burstLimited } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

const Body = z.object({ url: z.string().trim().min(3).max(2048), turnstileToken: z.string().max(2048).optional() });

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (burstLimited(ip)) return NextResponse.json({ error: "Too many requests. Slow down a little." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a website URL." }, { status: 400 });

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return NextResponse.json({ error: "We couldn't verify you're human. Refresh the page and try again." }, { status: 403 });
  }

  try {
    const { id, reused } = await createAnalysis(parsed.data.url, ip);
    return NextResponse.json({ id, reused }, { status: reused ? 200 : 201 });
  } catch (err) {
    const message = publicMessage(err);
    if (message.startsWith("Something went wrong")) console.error("create analysis failed:", err);
    return NextResponse.json({ error: message }, { status: message.startsWith("Something went wrong") ? 500 : 400 });
  }
}
