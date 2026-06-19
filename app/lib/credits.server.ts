import { prisma } from "./db.server";
import type { Prisma } from "@prisma/client";

// Universal credit costs per AI action.
export const CREDIT_COSTS = {
  RESUME_ANALYSIS: 1,
  JD_ANALYSIS: 1,
  QUESTION_GENERATION: 1,
  TECHNICAL_QUESTIONS: 1,
  SUGGESTED_ANSWERS: 1,
  MOCK_INTERVIEW: 3,
  LIVE_SESSION: 5,
  INTERVIEW_SUMMARY: 1,
  FOLLOW_UP_EMAIL: 1,
  MEETING_SUMMARY: 1,
  ATS_OPTIMIZATION: 1,
  SKILL_GAP: 1,
  COACHING_REPORT: 3,
  PERFORMANCE_REPORT: 3,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export const PLAN_ALLOCATIONS = {
  FREE: 10,
  PRO: 60,
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

// Set the plan and reset the monthly allocation (called after successful payment).
export async function setPlanAndAllocate(
  userId: string,
  plan: PlanType,
  organizationId?: string | null,
): Promise<void> {
  const allocation = PLAN_ALLOCATIONS[plan];
  await prisma.creditBalance.upsert({
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
  await prisma.creditTransaction.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      actionType: `PLAN_${plan}`,
      creditsUsed: allocation,
      remainingBalance: allocation,
      direction: "CREDIT",
    },
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
