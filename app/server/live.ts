import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { transcribeAudio, isDeepgramConfigured } from "~/lib/deepgram.server";
import {
  checkCreditBalance,
  deductCredits,
  CREDIT_COSTS,
} from "~/lib/credits.server";

// Start a live interview session. Deducts the live-session credit cost up front.
export const startLiveSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ title: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    if (!isDeepgramConfigured()) {
      return { ok: false as const, error: "DEEPGRAM_NOT_CONFIGURED" };
    }
    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.LIVE_SESSION) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    if (!orgId) return { ok: false as const, error: "No organization" };

    const session = await prisma.session.create({
      data: {
        organizationId: orgId,
        userId: auth.userId,
        title: data.title ?? "Live Interview",
        mode: "INTERVIEW",
        status: "LIVE",
      },
      select: { id: true },
    });

    const { remaining } = await deductCredits(auth.userId, "LIVE_SESSION", orgId, {
      sessionId: session.id,
    });

    return { ok: true as const, sessionId: session.id, creditsRemaining: remaining };
  });

// Transcribe a recorded audio chunk (base64) and persist the segments.
export const transcribeLiveFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        audioBase64: z.string().min(1),
        mimetype: z.string().default("audio/webm"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();

    const session = await prisma.session.findUnique({ where: { id: data.sessionId } });
    if (!session || session.userId !== auth.userId) {
      return { ok: false as const, error: "Session not found" };
    }

    const buffer = Buffer.from(data.audioBase64, "base64");
    if (buffer.length === 0) return { ok: false as const, error: "Empty audio" };

    try {
      const { segments, fullText } = await transcribeAudio(buffer, data.mimetype);

      if (segments.length > 0) {
        await prisma.transcript.createMany({
          data: segments.map((s) => ({
            sessionId: data.sessionId,
            speaker: s.speaker,
            speakerRole: s.speaker.endsWith("1") ? "SELF" : "OTHER",
            text: s.text,
            startMs: s.startMs,
            endMs: s.endMs,
            confidence: s.confidence,
          })),
        });
      }

      return { ok: true as const, segments, fullText };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      return { ok: false as const, error: message };
    }
  });

// End a live session and persist its duration.
export const endLiveSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), durationSec: z.number().int().nonnegative() }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({ where: { id: data.sessionId } });
    if (!session || session.userId !== auth.userId) {
      return { ok: false as const, error: "Session not found" };
    }
    await prisma.session.update({
      where: { id: data.sessionId },
      data: { status: "COMPLETED", endedAt: new Date(), durationSec: data.durationSec },
    });
    return { ok: true as const };
  });

// Load a session's stored transcript timeline.
export const getLiveTranscriptFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { id: true, userId: true, title: true, status: true, summary: true },
    });
    if (!session || session.userId !== auth.userId) return null;
    const transcripts = await prisma.transcript.findMany({
      where: { sessionId: data.sessionId },
      orderBy: { startMs: "asc" },
      select: { id: true, speaker: true, speakerRole: true, text: true, startMs: true },
    });
    return { session, transcripts };
  });
