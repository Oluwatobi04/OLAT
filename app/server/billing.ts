import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { isCryptomusConfigured } from "~/lib/cryptomus.server";
import { ensureCreditBalance, minutesForCredits } from "~/lib/credits.server";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS } from "~/server/payments";

// ── Billing status for the dashboard ─────────────────────────────────────────
// Cryptomus-only. Returns the current plan, credit balance + remaining minutes,
// the pricing catalog, recent payments, and usage.
export const getBillingStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = await requireAuth();
    if (!auth.organization) return null;

    const [subscription, balance, payments, usage] = await Promise.all([
      prisma.subscription.findUnique({ where: { organizationId: auth.organization.id } }),
      ensureCreditBalance(auth.userId, auth.organization.id),
      prisma.payment.findMany({
        where: { organizationId: auth.organization.id, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, plan: true, amount: true, currency: true, status: true, createdAt: true },
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
      payments,
      credits: {
        balance: balance.currentBalance,
        allocation: balance.monthlyAllocation,
        plan: balance.planType,
        remainingMinutes: minutesForCredits(balance.currentBalance),
      },
      usage: {
        minutes: usage.find((u) => u.metric === "TRANSCRIPTION_MINUTES")?._sum.quantity ?? 0,
        tokens: usage.find((u) => u.metric === "AI_TOKENS")?._sum.quantity ?? 0,
        sessions: usage.find((u) => u.metric === "SESSION_COUNT")?._sum.quantity ?? 0,
      },
      packs: CREDIT_PACKS,
      plans: SUBSCRIPTION_PLANS,
      cryptoConfigured: isCryptomusConfigured(),
    };
  },
);
