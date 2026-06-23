import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "~/lib/db.server";
import { verifyWebhookSign, isPaidStatus } from "~/lib/cryptomus.server";
import { setPlanAndAllocate, type PlanType } from "~/lib/credits.server";

// Cryptomus payment webhook. Verifies the signature, then on a paid status
// activates the plan, allocates credits, and updates the subscription.
export const Route = createFileRoute("/api/cryptomus/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        if (!verifyWebhookSign(payload)) {
          return new Response("Invalid signature", { status: 403 });
        }

        const reference = String(payload.order_id ?? "");
        const status = String(payload.status ?? "");
        if (!reference) return new Response("Missing order_id", { status: 400 });

        const payment = await prisma.payment.findUnique({ where: { reference } });
        if (!payment) return new Response("Unknown payment", { status: 404 });

        // Idempotent: already processed.
        if (payment.status === "SUCCESS") {
          return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
        }

        if (isPaidStatus(status)) {
          const plan = payment.plan as PlanType;
          // Billing interval was stashed on the payment at checkout time.
          const interval =
            (payment.raw as unknown as { interval?: string } | null)?.interval === "ANNUAL"
              ? "ANNUAL"
              : "MONTHLY";
          const periodStart = new Date();
          const periodEnd = new Date(periodStart);
          if (interval === "ANNUAL") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          else periodEnd.setMonth(periodEnd.getMonth() + 1);

          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { reference },
              data: { status: "SUCCESS", raw: payload as object },
            });
            // Mirror onto the org subscription when present.
            if (payment.organizationId) {
              await tx.subscription.updateMany({
                where: { organizationId: payment.organizationId },
                data: {
                  plan: plan === "TEAM" ? "TEAM" : "PRO",
                  status: "ACTIVE",
                  interval,
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                  cancelAtPeriodEnd: false,
                },
              });
            }
            await tx.auditLog.create({
              data: {
                organizationId: payment.organizationId,
                actorId: payment.userId,
                action: "payment.cryptomus.success",
                target: reference,
                metadata: { plan, amount: payment.amount, status },
              },
            });
          });

          // Allocate the plan's monthly credits (separate tx in the service).
          await setPlanAndAllocate(payment.userId, plan, payment.organizationId);
        } else if (["cancel", "fail", "wrong_amount", "system_fail"].includes(status)) {
          await prisma.payment.update({
            where: { reference },
            data: { status: "FAILED", raw: payload as object },
          });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  },
});
