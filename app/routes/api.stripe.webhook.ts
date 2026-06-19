import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { stripe } from "~/lib/stripe.server";
import { prisma } from "~/lib/db.server";
import { redis } from "~/lib/redis.server";
import { planKeyForPrice, PLANS } from "~/lib/stripe.server";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Map Stripe subscription status → our enum.
function mapStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case "active":
      return "ACTIVE" as const;
    case "trialing":
      return "TRIALING" as const;
    case "past_due":
      return "PAST_DUE" as const;
    case "canceled":
      return "CANCELED" as const;
    case "unpaid":
      return "UNPAID" as const;
    default:
      return "INCOMPLETE" as const;
  }
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  if (!redis) return false;
  try {
    const set = await redis.set(`stripe:evt:${eventId}`, "1", "EX", 86400, "NX");
    return set === null; // null => key already existed
  } catch {
    return false;
  }
}

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.organizationId;
  let organizationId = orgId;

  if (!organizationId) {
    const org = await prisma.organization.findFirst({
      where: { stripeCustomerId: String(sub.customer) },
      select: { id: true },
    });
    organizationId = org?.id;
  }
  if (!organizationId) return;

  const priceId = sub.items.data[0]?.price.id ?? null;
  const planKey = planKeyForPrice(priceId);
  const interval = planKey ? PLANS[planKey].interval : "MONTHLY";

  await prisma.subscription.upsert({
    where: { organizationId },
    update: {
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: sub.status === "canceled" ? "FREE" : "PRO",
      interval,
      status: mapStatus(sub.status),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
    create: {
      organizationId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: "PRO",
      interval,
      status: mapStatus(sub.status),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
  });
}

async function recordInvoice(invoice: Stripe.Invoice) {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: String(invoice.customer) },
    select: { id: true },
  });
  if (!org) return;
  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status ?? "open",
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
    },
    create: {
      organizationId: org.id,
      stripeInvoiceId: invoice.id,
      number: invoice.number ?? null,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status ?? "open",
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
    },
  });
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }
    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        WEBHOOK_SECRET,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      return new Response(`Webhook error: ${message}`, { status: 400 });
    }

    if (await alreadyProcessed(event.id)) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
      });
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await upsertFromSubscription(event.data.object as Stripe.Subscription);
          break;
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.subscription) {
            const sub = await stripe.subscriptions.retrieve(
              String(session.subscription),
            );
            await upsertFromSubscription(sub);
          }
          break;
        }
        case "invoice.paid":
        case "invoice.payment_failed":
        case "invoice.finalized":
          await recordInvoice(event.data.object as Stripe.Invoice);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("[stripe webhook] handler error", err);
      return new Response("Handler error", { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
      },
    },
  },
});
