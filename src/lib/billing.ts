import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Plan } from "@/db/schema";
import type { User } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { appUrl } from "@/lib/tracking";

export type PaidPlan = Exclude<Plan, "FREE">;
export const PAID_PLANS: PaidPlan[] = ["STARTER", "PRO", "AGENCY"];
/** past_due keeps the plan while Stripe retries the card; anything else (canceled, unpaid...) drops to FREE. */
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

function prices(): Record<PaidPlan, string> {
  return { STARTER: env("STRIPE_PRICE_STARTER"), PRO: env("STRIPE_PRICE_PRO"), AGENCY: env("STRIPE_PRICE_AGENCY") };
}

/** Billing is on once the secret key, the webhook secret and a price per paid plan exist. */
export function billingConfigured(): boolean {
  return !!env("STRIPE_SECRET_KEY") && !!env("STRIPE_WEBHOOK_SECRET") && Object.values(prices()).every(Boolean);
}

function stripe(): Stripe {
  return new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
}

/** Pure: the plan a Stripe subscription grants. Unknown prices grant nothing. */
export function planFromSubscription(status: string, priceId: string | undefined, priceIds: Record<PaidPlan, string>): Plan {
  if (!PAYING_STATUSES.has(status) || !priceId) return "FREE";
  return PAID_PLANS.find((p) => priceIds[p] === priceId) ?? "FREE";
}

async function customerFor(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await getDb().update(schema.users).set({ stripeCustomerId: customer.id }).where(eq(schema.users.id, user.id));
  return customer.id;
}

/** Hosted Checkout for a new subscription. Users who already pay change plans in the portal, never with a second subscription. */
export async function checkoutUrl(user: User, plan: PaidPlan): Promise<string> {
  if (!billingConfigured()) throw new UserError("Payments aren't open yet.");
  if (user.plan !== "FREE") return portalUrl(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    client_reference_id: user.id,
    line_items: [{ price: prices()[plan], quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${appUrl()}/dashboard?checkout=success`,
    cancel_url: `${appUrl()}/pricing`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/** Stripe's customer portal: change plan, update the card, download invoices, cancel. */
export async function portalUrl(user: User): Promise<string> {
  if (!billingConfigured()) throw new UserError("Payments aren't open yet.");
  const session = await stripe().billingPortal.sessions.create({ customer: await customerFor(user), return_url: `${appUrl()}/account` });
  return session.url;
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.stripeCustomerId, customerId) });
  if (!user) {
    console.warn(`[billing] subscription ${sub.id} for unknown customer ${customerId}`);
    return;
  }
  const item = sub.items.data[0];
  const plan = planFromSubscription(sub.status, item?.price.id, prices());
  // An old subscription ending must not downgrade a user who already moved to a newer one.
  if (plan === "FREE" && user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) return;
  await db
    .update(schema.users)
    .set({
      plan,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    })
    .where(eq(schema.users.id, user.id));
}

/** Verifies the Stripe signature, then applies subscription changes. Throws on a bad signature. */
export async function handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
  const s = stripe();
  const event = await s.webhooks.constructEventAsync(rawBody, signature, env("STRIPE_WEBHOOK_SECRET"), undefined, Stripe.createSubtleCryptoProvider());
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Re-read instead of trusting the payload: events can arrive out of order.
      await syncSubscription(await s.subscriptions.retrieve(event.data.object.id));
      break;
    case "checkout.session.completed": {
      const id = event.data.object.subscription;
      if (id) await syncSubscription(await s.subscriptions.retrieve(typeof id === "string" ? id : id.id));
      break;
    }
  }
}
