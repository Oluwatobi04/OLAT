import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import {
  createInvoice,
  isCryptomusConfigured,
  CryptomusError,
} from "~/lib/cryptomus.server";

// Paid plans available via crypto. Amounts are fiat decimal strings (USD).
export const CRYPTO_PLANS = {
  PRO: { amount: "12.99", credits: 60, label: "Pro" },
  TEAM: { amount: "49.00", credits: 200, label: "Team" },
} as const;

export type CryptoPlan = keyof typeof CRYPTO_PLANS;

// Create a Cryptomus invoice for a plan and return the hosted checkout URL.
export const createCryptoCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        plan: z.enum(["PRO", "TEAM"]),
        asset: z.enum(["USDT", "BTC", "ETH"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!isCryptomusConfigured()) {
      return { ok: false as const, error: "CRYPTO_NOT_CONFIGURED" };
    }

    const plan = CRYPTO_PLANS[data.plan as CryptoPlan];
    const reference = `olat5_${data.plan}_${randomUUID()}`;

    // Record a pending payment first so the webhook can reconcile by reference.
    await prisma.payment.create({
      data: {
        userId: auth.userId,
        organizationId: auth.organization?.id ?? null,
        provider: "CRYPTOMUS",
        reference,
        plan: data.plan,
        amount: Math.round(parseFloat(plan.amount) * 100),
        currency: "USD",
        status: "PENDING",
        cryptoAsset: data.asset ?? null,
      },
    });

    try {
      const invoice = await createInvoice({
        amount: plan.amount,
        currency: "USD",
        orderId: reference,
        asset: data.asset,
      });
      await prisma.payment.update({
        where: { reference },
        data: { raw: { uuid: invoice.uuid, url: invoice.url } },
      });
      return { ok: true as const, url: invoice.url };
    } catch (err) {
      await prisma.payment.update({
        where: { reference },
        data: { status: "FAILED" },
      });
      const message = err instanceof CryptomusError ? err.message : "Checkout failed";
      return { ok: false as const, error: message };
    }
  });

// Pro subscription plans, billed via Cryptomus. Amounts are fiat USD strings.
export const SUBSCRIPTION_PLANS = {
  monthly: { amount: "29.00", amountCents: 2900, interval: "MONTHLY" as const, label: "Pro Monthly" },
  annual: { amount: "290.00", amountCents: 29000, interval: "ANNUAL" as const, label: "Pro Annual" },
} as const;

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

// Create a Cryptomus invoice for a Pro subscription (monthly/annual).
// Records a PENDING payment carrying the interval; the webhook activates the
// subscription and allocates credits once Cryptomus confirms payment.
export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        plan: z.enum(["monthly", "annual"]),
        asset: z.enum(["USDT", "BTC", "ETH"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    if (!isCryptomusConfigured()) {
      return { ok: false as const, error: "CRYPTO_NOT_CONFIGURED" };
    }

    const cfg = SUBSCRIPTION_PLANS[data.plan as SubscriptionPlanKey];
    const reference = `olat5_sub_${cfg.interval}_${randomUUID()}`;

    await prisma.payment.create({
      data: {
        userId: auth.userId,
        organizationId: auth.organization.id,
        provider: "CRYPTOMUS",
        reference,
        plan: "PRO",
        amount: cfg.amountCents,
        currency: "USD",
        status: "PENDING",
        cryptoAsset: data.asset ?? null,
        raw: { interval: cfg.interval }, // carried to the webhook for period calc
      },
    });

    try {
      const invoice = await createInvoice({
        amount: cfg.amount,
        currency: "USD",
        orderId: reference,
        asset: data.asset,
      });
      await prisma.payment.update({
        where: { reference },
        data: { raw: { uuid: invoice.uuid, url: invoice.url, interval: cfg.interval } },
      });
      return { ok: true as const, url: invoice.url };
    } catch (err) {
      await prisma.payment.update({ where: { reference }, data: { status: "FAILED" } });
      const message = err instanceof CryptomusError ? err.message : "Checkout failed";
      return { ok: false as const, error: message };
    }
  });

// Payment history for the current user.
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
