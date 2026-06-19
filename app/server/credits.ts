import { createServerFn } from "@tanstack/react-start";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { ensureCreditBalance, CREDIT_COSTS, PLAN_ALLOCATIONS } from "~/lib/credits.server";

export const getCreditDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const balance = await ensureCreditBalance(auth.userId, auth.organization?.id);
  const transactions = await prisma.creditTransaction.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const used = Math.max(0, balance.monthlyAllocation - balance.currentBalance);
  const pctRemaining =
    balance.monthlyAllocation > 0
      ? Math.round((balance.currentBalance / balance.monthlyAllocation) * 100)
      : 0;

  return {
    plan: balance.planType,
    currentBalance: balance.currentBalance,
    monthlyAllocation: balance.monthlyAllocation,
    used,
    pctRemaining,
    lowCredits: pctRemaining < 20,
    transactions,
    costs: CREDIT_COSTS,
    allocations: PLAN_ALLOCATIONS,
  };
});
