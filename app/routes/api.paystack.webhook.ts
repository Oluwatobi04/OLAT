import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "~/lib/db.server";
import { verifyWebhookSignature, verifyTransaction } from "~/lib/paystack.server";
import { setPlanAndAllocate, addCredits } from "~/lib/credits.server";

// Paystack webhook. Verifies the x-paystack-signature (HMAC-SHA512), then on a
// successful charge re-verifies with the Paystack API (never trust the webhook
// payload alone) and idempotently fulfils the purchase: activates the plan or
// tops up credits, records the payment, and writes an audit entry.
export const Route = createFileRoute("/api/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-paystack-signature");
        if (!verifyWebhookSignature(rawBody, signature)) {
          return new Response("Invalid signature", { status: 403 });
        }

        let event: { event?: string; data?: { reference?: string; status?: string } };
        try {
          event = JSON.parse(rawBody);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const reference = String(event.data?.reference ?? "");
        if (!reference) return new Response("Missing reference", { status: 400 });

        const payment = await prisma.payment.findUnique({ where: { reference } });
        if (!payment) return new Response("Unknown payment", { status: 404 });

        // Idempotent: already fulfilled.
        if (payment.status === "SUCCESS") {
          return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
        }

        if (event.event === "charge.success") {
          // Defence in depth: confirm the charge with Paystack directly.
          let verified: { status: string } | null = null;
          try {
            verified = await verifyTransaction(reference);
          } catch {
            return new Response("Verify failed", { status: 502 });
          }
          if (verified.status !== "success") {
            return new Response(JSON.stringify({ ok: true, unconfirmed: true }), { status: 200 });
          }

          const raw = (payment.raw as unknown as {
            kind?: "credits" | "subscription";
            credits?: number;
            allocation?: number;
            interval?: string;
          } | null) ?? {};
          const isSubscription =
            raw.kind === "subscription" || payment.plan === "PRO" || payment.plan === "TEAM";

          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { reference },
              data: { status: "SUCCESS", raw: { ...raw, webhook: event.event } },
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
                metadata: { provider: "PAYSTACK", plan: payment.plan, amount: payment.amount, ...raw },
              },
            });
          });

          if (isSubscription) {
            await setPlanAndAllocate(
              payment.userId,
              payment.plan === "TEAM" ? "TEAM" : "PRO",
              payment.organizationId,
              typeof raw.allocation === "number" ? raw.allocation : undefined,
            );
          } else {
            const credits = typeof raw.credits === "number" ? raw.credits : 0;
            if (credits > 0) {
              await addCredits(payment.userId, credits, "PURCHASE", payment.organizationId);
            }
          }
        } else if (event.event === "charge.failed") {
          await prisma.payment.update({
            where: { reference },
            data: { status: "FAILED", raw: { webhook: event.event } },
          });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  },
});
