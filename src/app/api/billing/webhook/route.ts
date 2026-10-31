import { NextResponse } from "next/server";
import { billingConfigured, handleStripeWebhook } from "@/lib/billing";

/** Stripe → us. The signature check is the authentication; the body must stay raw for it. */
export async function POST(req: Request) {
  if (!billingConfigured()) return new NextResponse("Billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });
  const body = await req.text();
  try {
    await handleStripeWebhook(body, signature);
  } catch (err) {
    const bad = (err as { type?: string }).type === "StripeSignatureVerificationError";
    if (!bad) console.error("stripe webhook failed:", err);
    // 400 for forged calls; 500 lets Stripe retry real events that failed on our side.
    return new NextResponse(bad ? "Bad signature" : "Webhook error", { status: bad ? 400 : 500 });
  }
  return NextResponse.json({ received: true });
}
