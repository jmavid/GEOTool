import { NextResponse } from "next/server";
import { portalUrl } from "@/lib/billing";
import { currentUser, sameOrigin } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  try {
    return NextResponse.redirect(await portalUrl(user), 303);
  } catch (err) {
    console.error("billing portal failed:", err);
    return NextResponse.redirect(new URL(`/account?error=${encodeURIComponent(publicMessage(err))}`, req.url), 303);
  }
}
