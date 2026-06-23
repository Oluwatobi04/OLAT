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

// ── Buy a one-time credit pack via Cryptomus ─────────────────────────────────
export const createCreditCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ pack: z.enum(["starter", "pro", "business"]), asset: assetSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    if (!isCryptomusConfigured()) return { ok: false as const, error: "CRYPTO_NOT_CONFIGURED" };

    const pack = CREDIT_PACKS[data.pack as CreditPackKey];
    const reference = `olat5_credits_${data.pack}_${randomUUID()}`;

    // Pending payment carries the purchase kind + credit amount for the webhook.
    await prisma.payment.create({
      data: {
        userId: auth.userId,
        organizationId: auth.organization.id,
        provider: "CRYPTOMUS",
        reference,
        plan: "CREDITS",
        amount: pack.amountCents,
        currency: "USD",
        status: "PENDING",
        cryptoAsset: data.asset ?? null,
        raw: { kind: "credits", pack: data.pack, credits: pack.credits },
      },
    });

    try {
      const invoice = await createInvoice({
        amount: pack.amount,
        currency: "USD",
        orderId: reference,
        asset: data.asset,
      });
      await prisma.payment.update({
        where: { reference },
        data: { raw: { kind: "credits", pack: data.pack, credits: pack.credits, uuid: invoice.uuid, url: invoice.url } },
      });
      return { ok: true as const, url: invoice.url };
    } catch (err) {
      await prisma.payment.update({ where: { reference }, data: { status: "FAILED" } });
      const message = err instanceof CryptomusError ? err.message : "Checkout failed";
      return { ok: false as const, error: message };
    }
  });

// ── Subscribe to Pro (monthly/annual) via Cryptomus ──────────────────────────
export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ plan: z.enum(["monthly", "annual"]), asset: assetSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "BILLING"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    if (!isCryptomusConfigured()) return { ok: false as const, error: "CRYPTO_NOT_CONFIGURED" };

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
        raw: { kind: "subscription", interval: cfg.interval, allocation: cfg.allocation },
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
        data: {
          raw: {
            kind: "subscription",
            interval: cfg.interval,
            allocation: cfg.allocation,
            uuid: invoice.uuid,
            url: invoice.url,
          },
        },
      });
      return { ok: true as const, url: invoice.url };
    } catch (err) {
      await prisma.payment.update({ where: { reference }, data: { status: "FAILED" } });
      const message = err instanceof CryptomusError ? err.message : "Checkout failed";
      return { ok: false as const, error: message };
    }
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
