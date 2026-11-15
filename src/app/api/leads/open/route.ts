import { NextResponse } from "next/server";
import { contactForToken, LEAD_COOKIE, LEAD_COOKIE_MAX_AGE } from "@/lib/leads";

/** The report link in our emails: remembers the contact on this device, then opens the report. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("k");
  const report = url.searchParams.get("r") ?? "";
  const target = new URL(/^[0-9a-f-]{36}$/.test(report) ? `/report/${report}` : "/", url);
  const res = NextResponse.redirect(target, 303);
  if (await contactForToken(token)) {
    res.cookies.set(LEAD_COOKIE, token!, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LEAD_COOKIE_MAX_AGE });
  }
  return res;
}
