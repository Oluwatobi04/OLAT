import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { aiJSON, aiVision, isAIConfigured } from "~/lib/ai.server";
import { transcribeAudio, isDeepgramConfigured } from "~/lib/deepgram.server";
import {
  buildContextBlock,
  createInterviewContext,
  loadSessionContextBlock,
} from "~/lib/interview-context";
import {
  checkCreditBalance,
  deductCredits,
  deductCreditsBestEffort,
  creditsForMinutes,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "~/lib/credits.server";

const QUESTION_RE = /\?\s*$/;
const QUESTION_HINTS =
  /\b(tell me|describe|why|how|what|walk me through|can you|could you|explain|give an example|have you|where do you see|talk about)\b/i;
// Only treat a COMPLETED utterance with enough words as a question — avoids
// firing on partial fragments. Deepgram returns complete utterances per clip.
function isQuestion(t: string) {
  const trimmed = t.trim();
  if (trimmed.split(/\s+/).length < 3) return false;
  return QUESTION_RE.test(trimmed) || QUESTION_HINTS.test(trimmed);
}

// ── Data for the 3-step new-session flow ─────────────────────────────────────
export const getNewSessionDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const [resumes, balance] = await Promise.all([
    prisma.resumeUpload.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, fileName: true },
    }),
    prisma.creditBalance.findUnique({ where: { userId: auth.userId } }),
  ]);
  return {
    user: auth.user,
    resumes,
    credits: { remaining: balance?.currentBalance ?? 0, plan: balance?.planType ?? "FREE" },
    deepgramReady: isDeepgramConfigured(),
    aiReady: isAIConfigured(),
  };
});

// ── Create a session from the 3-step flow ────────────────────────────────────
export const createWorkspaceSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        role: z.string().min(1).max(160),
        company: z.string().max(160).optional(),
        industry: z.string().max(120).optional(),
        jobDescription: z.string().max(20000).optional(),
        resumeId: z.string().uuid().optional(),
        notes: z.string().max(8000).optional(),
        language: z.string().max(12).default("en"),
        model: z.enum(["claude", "gpt", "gemini"]).default("claude"),
        responseStyle: z.enum(["concise", "balanced", "detailed"]).default("concise"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;
    if (!orgId) return { ok: false as const, error: "No organization" };
    if (!isDeepgramConfigured()) return { ok: false as const, error: "DEEPGRAM_NOT_CONFIGURED" };
    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.LIVE_SESSION) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    const ctx = await createInterviewContext({
      userId: auth.userId,
      organizationId: orgId,
      role: data.role,
      company: data.company ?? null,
      industry: data.industry ?? null,
      resumeId: data.resumeId ?? null,
      jobDescriptionText: data.jobDescription ?? null,
    });

    const session = await prisma.session.create({
      data: {
        organizationId: orgId,
        userId: auth.userId,
        title: `${data.role}${data.company ? ` · ${data.company}` : ""}`,
        mode: "INTERVIEW",
        status: "LIVE",
        language: data.language,
        interviewContextId: ctx.id,
        metadata: {
          role: data.role,
          company: data.company ?? null,
          industry: data.industry ?? null,
          notes: data.notes ?? "",
          model: data.model,
          responseStyle: data.responseStyle,
        },
      },
      select: { id: true },
    });

    try {
      const { remaining } = await deductCredits(auth.userId, "LIVE_SESSION", orgId, {
        sessionId: session.id,
      });
      return { ok: true as const, sessionId: session.id, creditsRemaining: remaining };
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      throw err;
    }
  });

// ── Load everything the workspace needs ──────────────────────────────────────
export const getWorkspaceFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        metadata: true,
        startedAt: true,
        interviewContextId: true,
      },
    });
    if (!session || session.userId !== auth.userId) return null;

    const [transcripts, context, remaining] = await Promise.all([
      prisma.transcript.findMany({
        where: { sessionId: session.id },
        orderBy: { startMs: "asc" },
        select: { id: true, speaker: true, speakerRole: true, text: true, startMs: true, confidence: true },
      }),
      session.interviewContextId
        ? prisma.interviewContext.findUnique({ where: { id: session.interviewContextId } })
        : null,
      checkCreditBalance(auth.userId),
    ]);

    const m = (session.metadata as Record<string, unknown> | null) ?? {};
    const meta = {
      role: (m.role as string | null) ?? null,
      company: (m.company as string | null) ?? null,
      industry: (m.industry as string | null) ?? null,
      notes: (m.notes as string | null) ?? "",
      model: (m.model as string | null) ?? "claude",
      responseStyle: (m.responseStyle as string | null) ?? "concise",
    };

    return {
      session: { id: session.id, title: session.title, status: session.status, startedAt: session.startedAt },
      meta,
      context: context
        ? {
            role: context.role,
            company: context.company,
            industry: context.industry,
            resumeText: context.resumeText,
            jobDescriptionText: context.jobDescriptionText,
          }
        : null,
      transcripts,
      creditsRemaining: remaining,
    };
  });

// ── Transcribe a recorded audio chunk and persist segments ───────────────────
export const transcribeChunkFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        audioBase64: z.string().min(1),
        mimetype: z.string().default("audio/webm"),
        speakerRole: z.enum(["SELF", "OTHER"]).default("OTHER"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({ where: { id: data.sessionId } });
    if (!session || session.userId !== auth.userId) return { ok: false as const, error: "Session not found" };

    const buffer = Buffer.from(data.audioBase64, "base64");
    if (buffer.length === 0) return { ok: false as const, segments: [] };

    try {
      const { segments } = await transcribeAudio(buffer, data.mimetype);
      const enriched = segments
        .filter((s) => s.text.trim())
        .map((s) => ({ ...s, speakerRole: data.speakerRole, isQuestion: isQuestion(s.text) }));

      if (enriched.length > 0) {
        await prisma.transcript.createMany({
          data: enriched.map((s) => ({
            sessionId: session.id,
            speaker: s.speaker,
            speakerRole: s.speakerRole,
            text: s.text,
            startMs: s.startMs,
            endMs: s.endMs,
            confidence: s.confidence,
          })),
        });
      }
      return { ok: true as const, segments: enriched };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Transcription failed", segments: [] };
    }
  });

interface Suggestion {
  suggestedAnswer: string;
  talkingPoints: string[];
  exampleAnswer: string;
  technicalGuidance: string;
  quickTip: string;
}

// ── Generate a suggested response (plain English, bullet-friendly) ────────────
export const suggestFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        question: z.string().min(1).max(2000),
        transcript: z.string().max(8000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!isAIConfigured()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { userId: true, metadata: true },
    });
    if (!session || session.userId !== auth.userId) return { ok: false as const, error: "Session not found" };
    if ((await checkCreditBalance(auth.userId)) <= 0) return { ok: false as const, error: "INSUFFICIENT_CREDITS" };

    const meta = (session.metadata as Record<string, unknown>) ?? {};
    const model = (meta.model as string) ?? "claude";
    const contextBlock = await loadSessionContextBlock(data.sessionId);

    const system =
      "You are a calm, friendly interview helper for ANY profession. Tailor everything to the candidate's role and industry from the context. Never assume a tech job. " +
      "Write in plain, everyday English a nervous candidate can read at a glance. Short sentences. Bullet-friendly. No jargon, no framework names, no corporate buzzwords.";
    const user =
      contextBlock +
      `Recent conversation:\n${data.transcript ?? "(none yet)"}\n\n` +
      `The interviewer asked: "${data.question}"\n\n` +
      `Return ONLY JSON with keys:\n` +
      `- "suggestedAnswer": 2-3 short sentences they can say out loud.\n` +
      `- "talkingPoints": 3-4 very short bullet phrases (max ~8 words).\n` +
      `- "exampleAnswer": a short real-example answer in natural sentences (no labels).\n` +
      `- "technicalGuidance": one or two short role-specific tips ONLY if the question needs domain knowledge, else "".\n` +
      `- "quickTip": one short encouraging tip.\n` +
      `Never exceed 3 short paragraphs total.`;

    try {
      const { data: suggestion, model: used } = await aiJSON<Suggestion>({
        system,
        user,
        model,
        temperature: 0.4,
        maxTokens: 1100,
      });
      return {
        ok: true as const,
        suggestion,
        model: used,
        creditsRemaining: await checkCreditBalance(auth.userId),
      };
    } catch {
      return { ok: false as const, error: "Could not generate a suggestion." };
    }
  });

// ── Analyze a captured screen frame ──────────────────────────────────────────
export const analyzeScreenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), imageBase64: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!isAIConfigured()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { userId: true, organizationId: true },
    });
    if (!session || session.userId !== auth.userId) return { ok: false as const, error: "Session not found" };
    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.SCREEN_ANALYSIS) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    const contextBlock = await loadSessionContextBlock(data.sessionId);
    const imageUrl = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;

    try {
      const { content } = await aiVision({
        system:
          "You help a candidate during a live interview. Look at their screen and figure out what's being asked — " +
          "a coding problem, LeetCode, a whiteboard, an SQL query, a system-design prompt, a product question, a slide, or a diagram. " +
          "Then give short, plain-English guidance on how to approach it. Use bullet points. No long paragraphs.",
        user:
          contextBlock +
          "What is on this screen, and how should the candidate approach it? Keep it short and practical.",
        imageUrl,
        maxTokens: 700,
      });
      const { remaining } = await deductCredits(auth.userId, "SCREEN_ANALYSIS", session.organizationId, {
        sessionId: data.sessionId,
      });
      return { ok: true as const, guidance: content, creditsRemaining: remaining };
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      return { ok: false as const, error: "Screen analysis failed." };
    }
  });

// ── Save session notes ───────────────────────────────────────────────────────
export const saveNotesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), notes: z.string().max(8000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { userId: true, metadata: true },
    });
    if (!session || session.userId !== auth.userId) return { ok: false as const };
    const meta = (session.metadata as Record<string, unknown>) ?? {};
    await prisma.session.update({
      where: { id: data.sessionId },
      data: { metadata: { ...meta, notes: data.notes } },
    });
    return { ok: true as const };
  });

// ── End the session ──────────────────────────────────────────────────────────
// Finalizes the record and reconciles credits from the REAL duration using the
// canonical rule (1 credit = 30 min). One credit was reserved at start, so we
// charge only the remainder here (best-effort, never negative).
export const endWorkspaceFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), durationSec: z.number().int().nonnegative() }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { userId: true, organizationId: true, status: true },
    });
    if (!session || session.userId !== auth.userId) return { ok: false as const };

    const alreadyEnded = session.status === "COMPLETED";
    await prisma.session.update({
      where: { id: data.sessionId },
      data: { status: "COMPLETED", endedAt: new Date(), durationSec: data.durationSec },
    });

    let creditsUsed = CREDIT_COSTS.LIVE_SESSION; // the reservation taken at start
    if (!alreadyEnded) {
      const minutes = data.durationSec / 60;
      const total = creditsForMinutes(minutes); // ceil(min/30), min 1
      const remainder = total - CREDIT_COSTS.LIVE_SESSION;
      if (remainder > 0) {
        const { used } = await deductCreditsBestEffort(
          auth.userId,
          remainder,
          "LIVE_SESSION",
          session.organizationId,
          { sessionId: data.sessionId, durationSec: data.durationSec, billedMinutes: Math.round(minutes) },
        );
        creditsUsed += used;
      }
    }
    return { ok: true as const, creditsUsed };
  });
