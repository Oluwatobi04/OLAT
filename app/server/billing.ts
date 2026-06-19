import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { stripe, PLANS, type PlanKey } from "~/lib/stripe.server";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Ensure the org has a Stripe customer, creating one on demand.
async function ensureCustomer(orgId: string): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { id: true, name: true, billingEmail: true, stripeCustomerId: true },
  });
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    email: org.billingEmail ?? undefined,
    metadata: { organizationId: org.id },
  });
  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// ── Billing status for the dashboard ─────────────────────────────────────────
export const getBillingStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = await requireAuth();
    if (!auth.organization) return null;
    const [subscription, invoices, usage] = await Promise.all([
      prisma.subscription.findUnique({ where: { organizationId: auth.organization.id } }),
      prisma.invoice.findMany({
        where: { organizationId: auth.organization.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.aiUsage.groupBy({
        by: ["metric"],
        where: { organizationId: auth.organization.id },
        _sum: { quantity: true },
      }),
    ]);
    return {
      role: auth.organization.role,
      subscription,
      invoices,
      usage: {
        minutes: usage.find((u) => u.metric === "TRANSCRIPTION_MINUTES")?._sum.quantity ?? 0,
        tokens: usage.find((u) => u.metric === "AI_TOKENS")?._sum.quantity ?? 0,
        sessions: usage.find((u) => u.metric === "SESSION_COUNT")?._sum.quantity ?? 0,
      },
      plans: {
        monthly: { label: PLANS.monthly.label, amount: PLANS.monthly.amount },
        annual: { label: PLANS.annual.label, amount: PLANS.annual.amount },
      },
    };
  },
);

// ── Create a Checkout session for a plan ─────────────────────────────────────
export const createCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ plan: z.enum(["monthly", "annual"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }

    const plan = PLANS[data.plan as PlanKey];
    if (!plan.priceId) return { ok: false as const, error: "Plan not configured" };

    const customerId = await ensureCustomer(auth.organization.id);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/dashboard/billing?status=success`,
      cancel_url: `${APP_URL}/dashboard/billing?status=cancelled`,
      subscription_data: {
        metadata: { organizationId: auth.organization.id },
      },
      metadata: { organizationId: auth.organization.id },
    });
    if (!session.url) return { ok: false as const, error: "Could not start checkout" };
    return { ok: true as const, url: session.url };
  });

// ── Open the Stripe billing portal ───────────────────────────────────────────
export const createPortalFn = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await requireAuth();
  if (!auth.organization) return { ok: false as const, error: "No organization" };
  if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
    return { ok: false as const, error: "Insufficient permissions" };
  }
  const customerId = await ensureCustomer(auth.organization.id);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/dashboard/billing`,
  });
  return { ok: true as const, url: portal.url };
});

// ── Cancel at period end ─────────────────────────────────────────────────────
export const cancelSubscriptionFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    const sub = await prisma.subscription.findUnique({
      where: { organizationId: auth.organization.id },
    });
    if (!sub?.stripeSubscriptionId) {
      return { ok: false as const, error: "No active subscription" };
    }
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await prisma.subscription.update({
      where: { organizationId: auth.organization.id },
      data: { cancelAtPeriodEnd: true },
    });
    return { ok: true as const };
  },
);
