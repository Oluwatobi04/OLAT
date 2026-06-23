import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { aiComplete, isAIConfigured } from "~/lib/ai.server";
import { checkCreditBalance, deductCredits, CREDIT_COSTS } from "~/lib/credits.server";

// Sum DEBIT credit transactions per session for the given user.
async function creditsBySession(userId: string): Promise<Map<string, number>> {
  const txns = await prisma.creditTransaction.findMany({
    where: { userId, direction: "DEBIT" },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { creditsUsed: true, metadata: true },
  });
  const map = new Map<string, number>();
  for (const t of txns) {
    const sid = (t.metadata as { sessionId?: string } | null)?.sessionId;
    if (sid) map.set(sid, (map.get(sid) ?? 0) + t.creditsUsed);
  }
  return map;
}

// ── Session history (read-only list for the management page) ─────────────────
export const listSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  if (!auth.organization) return [];

  const [sessions, creditMap] = await Promise.all([
    prisma.session.findMany({
      where: { organizationId: auth.organization.id },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        mode: true,
        platform: true,
        status: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        summary: true,
        _count: { select: { transcripts: true } },
      },
    }),
    creditsBySession(auth.userId),
  ]);

  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    mode: s.mode,
    platform: s.platform,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    transcriptCount: s._count.transcripts,
    hasSummary: Boolean(s.summary),
    creditsUsed: creditMap.get(s.id) ?? 0,
  }));
});

// ── Full detail for one session (transcript access, summary, export) ─────────
export const getSessionDetailFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return null;
    const session = await prisma.session.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        organizationId: true,
        title: true,
        mode: true,
        platform: true,
        status: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        summary: true,
      },
    });
    if (!session || session.organizationId !== auth.organization.id) return null;

    const [transcripts, creditMap] = await Promise.all([
      prisma.transcript.findMany({
        where: { sessionId: session.id },
        orderBy: { startMs: "asc" },
        select: { id: true, speaker: true, speakerRole: true, text: true, startMs: true, confidence: true },
      }),
      creditsBySession(auth.userId),
    ]);

    const { organizationId: _omit, ...rest } = session;
    return { session: rest, transcripts, creditsUsed: creditMap.get(session.id) ?? 0 };
  });

// ── Generate (or regenerate) an AI summary from the transcript ───────────────
export const generateSessionSummaryFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!isAIConfigured()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };

    const session = await prisma.session.findUnique({
      where: { id: data.id },
      select: { id: true, organizationId: true },
    });
    if (!session || session.organizationId !== auth.organization.id) {
      return { ok: false as const, error: "Not found" };
    }

    const transcripts = await prisma.transcript.findMany({
      where: { sessionId: data.id },
      orderBy: { startMs: "asc" },
      select: { speakerRole: true, text: true },
    });
    if (transcripts.length === 0) return { ok: false as const, error: "No transcript to summarize" };
    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.INTERVIEW_SUMMARY) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    const convo = transcripts
      .map((t) => `${t.speakerRole === "SELF" ? "You" : "Interviewer"}: ${t.text}`)
      .join("\n")
      .slice(0, 12000);

    try {
      const { content } = await aiComplete({
        system:
          "You summarize an interview or meeting transcript for the candidate's own records. " +
          "Write in plain English. Return short markdown with sections: **Summary** (2-3 sentences), " +
          "**Key questions asked** (bullets), **How you did** (1-2 bullets), **Follow-ups to prepare** (bullets). Keep it tight.",
        user: convo,
        maxTokens: 700,
        temperature: 0.4,
      });
      await prisma.session.update({ where: { id: data.id }, data: { summary: content } });
      const { remaining } = await deductCredits(auth.userId, "INTERVIEW_SUMMARY", session.organizationId, {
        sessionId: data.id,
      });
      return { ok: true as const, summary: content, creditsRemaining: remaining };
    } catch {
      return { ok: false as const, error: "Could not generate summary" };
    }
  });

// ── Delete a session ─────────────────────────────────────────────────────────
export const deleteSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    const session = await prisma.session.findUnique({ where: { id: data.id } });
    if (!session || session.organizationId !== auth.organization.id) {
      return { ok: false as const, error: "Not found" };
    }
    await prisma.session.delete({ where: { id: data.id } });
    return { ok: true as const };
  });
