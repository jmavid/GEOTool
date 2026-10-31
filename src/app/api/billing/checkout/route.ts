import { NextResponse } from "next/server";
import { checkoutUrl, paidPlan } from "@/lib/billing";
import { currentUser, sameOrigin } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";

/** Form POST from /pricing → 303 to Stripe Checkout. Signed-out visitors sign in first. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const plan = paidPlan((await req.formData().catch(() => null))?.get("plan"));
  if (!plan) return NextResponse.redirect(new URL("/pricing", req.url), 303);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?plan=${plan}`, req.url), 303);
  try {
    return NextResponse.redirect(await checkoutUrl(user, plan), 303);
  } catch (err) {
    console.error("checkout failed:", err);
    return NextResponse.redirect(new URL(`/pricing?error=${encodeURIComponent(publicMessage(err))}`, req.url), 303);
  }
}
