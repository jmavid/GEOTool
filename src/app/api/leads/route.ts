import { NextResponse } from "next/server";
import { z } from "zod";
import { publicMessage } from "@/lib/errors";
import { saveLead } from "@/lib/leads";
import { requestMeta } from "@/lib/owner-notify";
import { burstLimited } from "@/lib/security/rate-limit";

const Body = z.object({
  analysisId: z.string().regex(/^[0-9a-f-]{36}$/),
  email: z.string().max(254),
  marketing: z.boolean().optional(),
});

/**
 * The email form on the report page: saves the contact and emails them the report link. It sets no cookie: the report
 * only opens from that link (api/leads/open), which proves the address is theirs.
 */
export async function POST(req: Request) {
  const meta = requestMeta(req);
  if (burstLimited(`lead:${meta.ip}`)) return NextResponse.json({ error: "Too many requests. Slow down a little." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    const { ready } = await saveLead({ ...parsed.data, marketing: parsed.data.marketing ?? false, meta });
    return NextResponse.json({ ok: true, ready });
  } catch (err) {
    const message = publicMessage(err, "We couldn't save your email. Try again.");
    if (message.startsWith("We couldn't save")) console.error("save lead failed:", err);
    return NextResponse.json({ error: message }, { status: message.startsWith("We couldn't save") ? 500 : 400 });
  }
}
