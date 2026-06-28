import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import {
  createInvoice,
  isCryptomusConfigured,
  CryptomusError,
} from "~/lib/cryptomus.server";
import {
  initTransaction,
  isPaystackConfigured,
  PaystackError,
} from "~/lib/paystack.server";

// ── Pricing catalog (single source of truth, USD) ────────────────────────────
// One-time credit packs. Each credit = 30 minutes of live usage.
export const CREDIT_PACKS = {
  starter: { amount: "24.00", amountCents: 2400, credits: 5, label: "Starter" },
  pro: { amount: "69.00", amountCents: 6900, credits: 60, label: "Pro" },
  business: { amount: "99.00", amountCents: 9900, credits: 100, label: "Business" },
} as const;
export type CreditPackKey = keyof typeof CREDIT_PACKS;

// Recurring Pro subscriptions. "Unlimited calls" in the UI is backed by a large
// internal credit allocation so usage accounting stays consistent everywhere.
export const SUBSCRIPTION_PLANS = {
  monthly: {
    amount: "49.00",
    amountCents: 4900,
    interval: "MONTHLY" as const,
    allocation: 300,
    label: "Pro Monthly",
  },
  annual: {
    amount: "285.00",
    amountCents: 28500,
    interval: "ANNUAL" as const,
    allocation: 3600,
    label: "Pro Annual",
  },
} as const;
export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

const assetSchema = z.enum(["USDT", "BTC", "ETH"]).optional();
const methodSchema = z.enum(["paystack", "cryptomus"]).default("cryptomus");

type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

// Shared provider dispatch. Creates a PENDING payment (carrying the purchase
// kind + fulfillment data on `raw` for the webhook), then starts the chosen
// provider's hosted checkout. Cryptomus behaviour is unchanged.
async function startProviderCheckout(opts: {
  userId: string;
  organizationId: string;
  email: string;
  reference: string;
  plan: string;
  amountCents: number;
  amountUsd: string;
  method: "paystack" | "cryptomus";
  asset?: "USDT" | "BTC" | "ETH";
  raw: Prisma.InputJsonObject;
}): Promise<CheckoutResult> {
  if (opts.method === "paystack" && !isPaystackConfigured()) {
    return { ok: false, error: "PAYSTACK_NOT_CONFIGURED" };
  }
  if (opts.method === "cryptomus" && !isCryptomusConfigured()) {
    return { ok: false, error: "CRYPTO_NOT_CONFIGURED" };
  }

  await prisma.payment.create({
    data: {
      userId: opts.userId,
      organizationId: opts.organizationId,
      provider: opts.method === "paystack" ? "PAYSTACK" : "CRYPTOMUS",
      reference: opts.reference,
      plan: opts.plan,
      amount: opts.amountCents,
      currency: "USD",
      status: "PENDING",
      cryptoAsset: opts.method === "cryptomus" ? (opts.asset ?? null) : null,
      raw: opts.raw,
    },
  });

  try {
    if (opts.method === "paystack") {
      const tx = await initTransaction({
        email: opts.email,
        usdCents: opts.amountCents,
        reference: opts.reference,
        metadata: { ...opts.raw, userId: opts.userId, organizationId: opts.organizationId },
      });
      await prisma.payment.update({
        where: { reference: opts.reference },
        data: { raw: { ...opts.raw, authorizationUrl: tx.authorizationUrl } },
      });
      return { ok: true, url: tx.authorizationUrl };
    }
    const invoice = await createInvoice({
      amount: opts.amountUsd,
      currency: "USD",
      orderId: opts.reference,
      asset: opts.asset,
    });
    await prisma.payment.update({
      where: { reference: opts.reference },
      data: { raw: { ...opts.raw, uuid: invoice.uuid, url: invoice.url } },
    });
    return { ok: true, url: invoice.url };
  } catch (err) {
    await prisma.payment.update({ where: { reference: opts.reference }, data: { status: "FAILED" } });
    const message =
      err instanceof PaystackError || err instanceof CryptomusError ? err.message : "Checkout failed";
    return { ok: false, error: message };
  }
}

// ── Buy a one-time credit pack (Paystack or Cryptomus) ───────────────────────
export const createCreditCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ pack: z.enum(["starter", "pro", "business"]), asset: assetSchema, method: methodSchema })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }

    const pack = CREDIT_PACKS[data.pack as CreditPackKey];
    const reference = `olat5_credits_${data.pack}_${randomUUID()}`;

    return startProviderCheckout({
      userId: auth.userId,
      organizationId: auth.organization.id,
      email: auth.email,
      reference,
      plan: "CREDITS",
      amountCents: pack.amountCents,
      amountUsd: pack.amount,
      method: data.method,
      asset: data.asset,
      raw: { kind: "credits", pack: data.pack, credits: pack.credits },
    });
  });

// ── Subscribe to Pro (monthly/annual) (Paystack or Cryptomus) ────────────────
export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ plan: z.enum(["monthly", "annual"]), asset: assetSchema, method: methodSchema })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }

    const cfg = SUBSCRIPTION_PLANS[data.plan as SubscriptionPlanKey];
    const reference = `olat5_sub_${cfg.interval}_${randomUUID()}`;

    return startProviderCheckout({
      userId: auth.userId,
      organizationId: auth.organization.id,
      email: auth.email,
      reference,
      plan: "PRO",
      amountCents: cfg.amountCents,
      amountUsd: cfg.amount,
      method: data.method,
      asset: data.asset,
      raw: { kind: "subscription", interval: cfg.interval, allocation: cfg.allocation },
    });
  });

// ── Admin: payments overview for the organization ────────────────────────────
// Revenue totals, per-provider breakdown, status counts, and a searchable list
// (by customer email or transaction reference). Gated to OWNER/ADMIN/BILLING.
export const getAdminPaymentsFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ search: z.string().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization || !["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return null;
    }
    const orgId = auth.organization.id;
    const search = data.search?.trim();

    // Resolve a search term to matching user ids (by email) within the org.
    let userIdFilter: string[] | undefined;
    if (search) {
      const users = await prisma.user.findMany({
        where: { email: { contains: search, mode: "insensitive" }, memberships: { some: { organizationId: orgId } } },
        select: { id: true },
      });
      userIdFilter = users.map((u) => u.id);
    }

    const where: Prisma.PaymentWhereInput = search
      ? {
          organizationId: orgId,
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            ...(userIdFilter && userIdFilter.length ? [{ userId: { in: userIdFilter } }] : []),
          ],
        }
      : { organizationId: orgId };

    const [grouped, statusCounts, payments] = await Promise.all([
      prisma.payment.groupBy({
        by: ["provider"],
        where: { organizationId: orgId, status: "SUCCESS" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true, userId: true, provider: true, reference: true, plan: true,
          amount: true, currency: true, status: true, createdAt: true,
        },
      }),
    ]);

    // Attach customer emails.
    const emails = new Map<string, string>();
    const ids = [...new Set(payments.map((p) => p.userId))];
    if (ids.length) {
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
      users.forEach((u) => emails.set(u.id, u.email));
    }

    const byProvider = grouped.map((g) => ({
      provider: g.provider,
      revenue: g._sum.amount ?? 0,
      count: g._count._all,
    }));
    const totalRevenue = byProvider.reduce((s, p) => s + p.revenue, 0);
    const count = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;

    return {
      totalRevenue,
      byProvider,
      counts: { success: count("SUCCESS"), failed: count("FAILED"), pending: count("PENDING") },
      payments: payments.map((p) => ({ ...p, email: emails.get(p.userId) ?? "—" })),
    };
  });

// ── Payment history for the current user ─────────────────────────────────────
export const listPaymentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return prisma.payment.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      provider: true,
      plan: true,
      amount: true,
      currency: true,
      status: true,
      cryptoAsset: true,
      createdAt: true,
    },
  });
});
