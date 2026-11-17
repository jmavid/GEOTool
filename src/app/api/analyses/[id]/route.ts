import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getReport } from "@/lib/analyses";
import { currentUser } from "@/lib/auth/session";
import { LEAD_COOKIE, notifyLeads, reportAccess } from "@/lib/leads";
import { reportSummary } from "@/lib/teaser";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const headers = { "cache-control": "no-store" };
  if (!report.result) return NextResponse.json({ ...report, locked: false }, { headers });

  // A finished report only opens for signed-in users and visitors who gave their email.
  const access = await reportAccess(id, { signedIn: !!(await currentUser()), token: (await cookies()).get(LEAD_COOKIE)?.value });
  // Before the email is verified only the summary goes out (see lib/teaser), never the full results.
  if (!access.allowed) return NextResponse.json({ ...report, result: null, locked: true, summary: reportSummary(report.result) }, { headers });
  if (access.added) after(() => notifyLeads(id));
  return NextResponse.json({ ...report, locked: false }, { headers });
}
