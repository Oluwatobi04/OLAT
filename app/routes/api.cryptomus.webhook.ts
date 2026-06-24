import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "~/lib/db.server";
import { verifyWebhookSign, isPaidStatus } from "~/lib/cryptomus.server";
import { setPlanAndAllocate, addCredits } from "~/lib/credits.server";

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
          // The checkout stashed what was bought on payment.raw.
          const raw = (payment.raw as unknown as {
            kind?: "credits" | "subscription";
            credits?: number;
            allocation?: number;
            interval?: string;
          } | null) ?? {};
          // Treat "PRO"/"TEAM" plans as subscriptions; "CREDITS" as a top-up.
          const isSubscription =
            raw.kind === "subscription" || payment.plan === "PRO" || payment.plan === "TEAM";

          // Mark the payment processed + audit (idempotency guarded above).
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { reference },
              data: { status: "SUCCESS", raw: payload as object },
            });

            if (isSubscription && payment.organizationId) {
              const interval = raw.interval === "ANNUAL" ? "ANNUAL" : "MONTHLY";
              const periodStart = new Date();
              const periodEnd = new Date(periodStart);
              if (interval === "ANNUAL") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
              else periodEnd.setMonth(periodEnd.getMonth() + 1);
              await tx.subscription.updateMany({
                where: { organizationId: payment.organizationId },
                data: {
                  plan: payment.plan === "TEAM" ? "TEAM" : "PRO",
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
                action: isSubscription ? "payment.subscription.success" : "payment.credits.success",
                target: reference,
                metadata: { plan: payment.plan, amount: payment.amount, status, ...raw },
              },
            });
          });

          // Grant the purchased benefit (separate tx in the credit service).
          if (isSubscription) {
            // Reset the monthly/annual allocation for the plan.
            await setPlanAndAllocate(
              payment.userId,
              payment.plan === "TEAM" ? "TEAM" : "PRO",
              payment.organizationId,
              typeof raw.allocation === "number" ? raw.allocation : undefined,
            );
          } else {
            // One-time credit pack: top up the existing balance.
            const credits = typeof raw.credits === "number" ? raw.credits : 0;
            if (credits > 0) {
              await addCredits(payment.userId, credits, "PURCHASE", payment.organizationId);
            }
          }
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
