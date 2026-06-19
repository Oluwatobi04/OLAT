import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import {
  checkCreditBalance,
  deductCredits,
  CREDIT_COSTS,
} from "~/lib/credits.server";
import { authenticateBearer, jsonResponse, preflight } from "~/lib/api-auth.server";

const segmentSchema = z.object({
  speaker: z.string().max(60).optional(),
  speakerRole: z.enum(["SELF", "OTHER", "UNKNOWN"]).optional(),
  text: z.string().min(1).max(4000),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().optional(),
  isQuestion: z.boolean().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    title: z.string().max(200).optional(),
    platform: z.string().max(40).optional(),
  }),
  z.object({
    action: z.literal("transcript"),
    sessionId: z.string().uuid(),
    segments: z.array(segmentSchema).min(1).max(50),
  }),
  z.object({
    action: z.literal("end"),
    sessionId: z.string().uuid(),
  }),
]);

// Live session lifecycle for the extension: start (charges 5 credits),
// transcript (append segments), end (finalize + stats).
export const Route = createFileRoute("/api/live/session")({
  server: {
    handlers: {
      OPTIONS: ({ request }: { request: Request }) => preflight(request),
      POST: async ({ request }: { request: Request }) => {
        const user = await authenticateBearer(request);
        if (!user) return jsonResponse(request, { error: "UNAUTHORIZED" }, 401);
        if (!user.organizationId) {
          return jsonResponse(request, { error: "NO_ORGANIZATION" }, 400);
        }

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return jsonResponse(request, { error: "INVALID_BODY" }, 400);
        }

        // ── start ──────────────────────────────────────────────
        if (body.action === "start") {
          if ((await checkCreditBalance(user.userId)) < CREDIT_COSTS.LIVE_SESSION) {
            return jsonResponse(request, { error: "INSUFFICIENT_CREDITS" }, 402);
          }
          const session = await prisma.session.create({
            data: {
              organizationId: user.organizationId,
              userId: user.userId,
              title: body.title ?? "Live Interview",
              mode: "INTERVIEW",
              platform: body.platform ?? null,
              status: "LIVE",
            },
            select: { id: true },
          });
          await deductCredits(user.userId, "LIVE_SESSION", user.organizationId, {
            sessionId: session.id,
          });
          return jsonResponse(request, { ok: true, sessionId: session.id });
        }

        // Ownership check for transcript/end.
        const session = await prisma.session.findUnique({
          where: { id: body.sessionId },
          select: { id: true, userId: true, startedAt: true },
        });
        if (!session || session.userId !== user.userId) {
          return jsonResponse(request, { error: "SESSION_NOT_FOUND" }, 404);
        }

        // ── transcript ─────────────────────────────────────────
        if (body.action === "transcript") {
          await prisma.transcript.createMany({
            data: body.segments.map((s) => ({
              sessionId: session.id,
              speaker: s.speaker ?? null,
              speakerRole: s.speakerRole ?? null,
              text: s.text,
              startMs: s.startMs,
              endMs: s.endMs,
              confidence: s.confidence ?? null,
              isFinal: true,
            })),
          });
          return jsonResponse(request, { ok: true, stored: body.segments.length });
        }

        // ── end ────────────────────────────────────────────────
        const durationSec = Math.max(
          0,
          Math.round((Date.now() - session.startedAt.getTime()) / 1000),
        );
        const [, transcriptCount] = await Promise.all([
          prisma.session.update({
            where: { id: session.id },
            data: { status: "COMPLETED", endedAt: new Date(), durationSec },
          }),
          prisma.transcript.count({ where: { sessionId: session.id } }),
        ]);
        return jsonResponse(request, {
          ok: true,
          sessionId: session.id,
          durationSec,
          transcriptCount,
        });
      },
    },
  },
});
