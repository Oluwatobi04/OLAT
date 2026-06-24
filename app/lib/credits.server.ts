import { prisma } from "./db.server";
import type { Prisma } from "@prisma/client";

// ── Canonical credit model ───────────────────────────────────────────────────
// One single rule across the whole app: 1 credit = 30 minutes of live
// Interview Copilot usage.  credits_used = ceil(session_minutes / 30).
export const MINUTES_PER_CREDIT = 30;

// Live interview cost from a session's duration in minutes (minimum 1 credit).
export function creditsForMinutes(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / MINUTES_PER_CREDIT));
}

// Inverse: how many minutes a credit balance is worth (for "remaining minutes").
export function minutesForCredits(credits: number): number {
  return Math.max(0, credits) * MINUTES_PER_CREDIT;
}

// Credit costs per AI action. LIVE_SESSION is the reservation taken when a
// session starts (the first 30-minute block); the remainder is charged at the
// end from the real duration via creditsForMinutes().
export const CREDIT_COSTS = {
  RESUME_ANALYSIS: 1,
  JD_ANALYSIS: 1,
  MOCK_INTERVIEW: 3,
  LIVE_SESSION: 1,
  SCREEN_ANALYSIS: 1,
  LIVE_SUGGESTION: 0,
  INTERVIEW_SUMMARY: 1,
  FOLLOW_UP_EMAIL: 1,
  MEETING_SUMMARY: 1,
  ATS_OPTIMIZATION: 1,
  SKILL_GAP: 1,
  COACHING_REPORT: 3,
  PERFORMANCE_REPORT: 3,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// Monthly credit allocations granted by an active plan.
// PRO is the monthly subscription baseline; annual grants more (see billing).
export const PLAN_ALLOCATIONS = {
  FREE: 10,
  PRO: 300,
  TEAM: 200,
} as const;

export type PlanType = keyof typeof PLAN_ALLOCATIONS;

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
  ) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

// Ensure a balance row exists for a user; creates a FREE balance on first use.
export async function ensureCreditBalance(userId: string, organizationId?: string | null) {
  const existing = await prisma.creditBalance.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.creditBalance.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      currentBalance: PLAN_ALLOCATIONS.FREE,
      monthlyAllocation: PLAN_ALLOCATIONS.FREE,
      planType: "FREE",
    },
  });
}

export async function checkCreditBalance(userId: string): Promise<number> {
  const bal = await ensureCreditBalance(userId);
  return bal.currentBalance;
}

// Atomically deduct credits for an action. Throws InsufficientCreditsError if short.
export async function deductCredits(
  userId: string,
  action: CreditAction,
  organizationId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<{ remaining: number; used: number }> {
  const cost = CREDIT_COSTS[action];

  return prisma.$transaction(async (tx) => {
    const bal =
      (await tx.creditBalance.findUnique({ where: { userId } })) ??
      (await tx.creditBalance.create({
        data: {
          userId,
          organizationId: organizationId ?? null,
          currentBalance: PLAN_ALLOCATIONS.FREE,
          monthlyAllocation: PLAN_ALLOCATIONS.FREE,
          planType: "FREE",
        },
      }));

    if (bal.currentBalance < cost) {
      throw new InsufficientCreditsError(cost, bal.currentBalance);
    }

    const remaining = bal.currentBalance - cost;
    await tx.creditBalance.update({
      where: { userId },
      data: { currentBalance: remaining },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        organizationId: organizationId ?? bal.organizationId,
        actionType: action,
        creditsUsed: cost,
        remainingBalance: remaining,
        direction: "DEBIT",
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return { remaining, used: cost };
  });
}

// Add credits (refund, top-up, plan grant).
export async function addCredits(
  userId: string,
  amount: number,
  reason: string,
  organizationId?: string | null,
): Promise<{ remaining: number }> {
  return prisma.$transaction(async (tx) => {
    const bal = await ensureCreditBalanceTx(tx, userId, organizationId);
    const remaining = bal.currentBalance + amount;
    await tx.creditBalance.update({ where: { userId }, data: { currentBalance: remaining } });
    await tx.creditTransaction.create({
      data: {
        userId,
        organizationId: organizationId ?? bal.organizationId,
        actionType: reason,
        creditsUsed: amount,
        remainingBalance: remaining,
        direction: "CREDIT",
      },
    });
    return { remaining };
  });
}

// Best-effort debit that never throws and never drives the balance negative.
// Used to reconcile a live session's real duration at end-of-call.
export async function deductCreditsBestEffort(
  userId: string,
  amount: number,
  actionType: string,
  organizationId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<{ remaining: number; used: number }> {
  if (amount <= 0) {
    return { remaining: await checkCreditBalance(userId), used: 0 };
  }
  return prisma.$transaction(async (tx) => {
    const bal = await ensureCreditBalanceTx(tx, userId, organizationId);
    const used = Math.min(amount, bal.currentBalance);
    if (used <= 0) return { remaining: bal.currentBalance, used: 0 };
    const remaining = bal.currentBalance - used;
    await tx.creditBalance.update({ where: { userId }, data: { currentBalance: remaining } });
    await tx.creditTransaction.create({
      data: {
        userId,
        organizationId: organizationId ?? bal.organizationId,
        actionType,
        creditsUsed: used,
        remainingBalance: remaining,
        direction: "DEBIT",
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return { remaining, used };
  });
}

// Set the plan and reset the monthly allocation (called after successful payment).
// `allocationOverride` lets annual subscriptions grant a larger pool than the
// monthly PLAN_ALLOCATIONS baseline (e.g. 3,600 for the annual Pro plan).
export async function setPlanAndAllocate(
  userId: string,
  plan: PlanType,
  organizationId?: string | null,
  allocationOverride?: number,
): Promise<void> {
  const allocation = allocationOverride ?? PLAN_ALLOCATIONS[plan];
  await prisma.$transaction(async (tx) => {
    const existing = await tx.creditBalance.findUnique({ where: { userId } });
    const before = existing?.currentBalance ?? 0;
    await tx.creditBalance.upsert({
      where: { userId },
      update: {
        planType: plan,
        monthlyAllocation: allocation,
        currentBalance: allocation,
        lastResetAt: new Date(),
      },
      create: {
        userId,
        organizationId: organizationId ?? null,
        planType: plan,
        monthlyAllocation: allocation,
        currentBalance: allocation,
      },
    });
    // Record the SIGNED delta so balance always equals SUM(ledger entries).
    const delta = allocation - before;
    await tx.creditTransaction.create({
      data: {
        userId,
        organizationId: organizationId ?? existing?.organizationId ?? null,
        actionType: "SUBSCRIPTION_ALLOCATION",
        creditsUsed: Math.abs(delta),
        remainingBalance: allocation,
        direction: delta >= 0 ? "CREDIT" : "DEBIT",
      },
    });
  });
}

// Reset monthly credits to the plan allocation (cron/manual).
export async function resetMonthlyCredits(userId: string): Promise<void> {
  const bal = await prisma.creditBalance.findUnique({ where: { userId } });
  if (!bal) return;
  await prisma.creditBalance.update({
    where: { userId },
    data: { currentBalance: bal.monthlyAllocation, lastResetAt: new Date() },
  });
}

// internal helper using an existing transaction client
async function ensureCreditBalanceTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  organizationId?: string | null,
) {
  const existing = await tx.creditBalance.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.creditBalance.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      currentBalance: PLAN_ALLOCATIONS.FREE,
      monthlyAllocation: PLAN_ALLOCATIONS.FREE,
      planType: "FREE",
    },
  });
}
