import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { aiComplete, isAIConfigured } from "~/lib/ai.server";
import { buildContextBlock, loadSessionContextBlock } from "~/lib/interview-context";
import {
  checkCreditBalance,
  deductCredits,
  type CreditAction,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "~/lib/credits.server";

// Maps an analysis kind → its credit action + prompt config.
const KINDS = {
  INTERVIEW_SUMMARY: {
    action: "INTERVIEW_SUMMARY" as CreditAction,
    system: "You summarize interviews into a concise, structured recap.",
    prompt: (t: string) =>
      `Summarize this interview. Include: overview, key discussion points, candidate strengths, concerns, and recommended next steps.\n\n${t}`,
  },
  FOLLOW_UP_EMAIL: {
    action: "FOLLOW_UP_EMAIL" as CreditAction,
    system: "You draft professional, warm follow-up emails after interviews.",
    prompt: (t: string) =>
      `Draft a concise, professional follow-up email based on this interview context.\n\n${t}`,
  },
  MEETING_SUMMARY: {
    action: "MEETING_SUMMARY" as CreditAction,
    system: "You summarize meetings into action items and decisions.",
    prompt: (t: string) =>
      `Summarize this meeting. Include: TL;DR, key points, decisions, and action items with owners.\n\n${t}`,
  },
  ATS_OPTIMIZATION: {
    action: "ATS_OPTIMIZATION" as CreditAction,
    system: "You optimize resumes to pass ATS systems for a target role.",
    prompt: (t: string) =>
      `Provide concrete ATS optimization edits (keywords to add, phrasing, formatting) for this resume/role context.\n\n${t}`,
  },
  SKILL_GAP: {
    action: "SKILL_GAP" as CreditAction,
    system: "You perform skill-gap analysis between a candidate and a target role.",
    prompt: (t: string) =>
      `Identify the candidate's skill gaps vs the target role and a prioritized learning plan.\n\n${t}`,
  },
  COACHING_REPORT: {
    action: "COACHING_REPORT" as CreditAction,
    system: "You are an executive interview coach writing a detailed coaching report.",
    prompt: (t: string) =>
      `Write a detailed coaching report with strengths, growth areas, drills, and a 2-week improvement plan.\n\n${t}`,
  },
  PERFORMANCE_REPORT: {
    action: "PERFORMANCE_REPORT" as CreditAction,
    system: "You write detailed interview performance reports with scores and evidence.",
    prompt: (t: string) =>
      `Write a detailed interview performance report: scored competencies, evidence, and verdict.\n\n${t}`,
  },
} as const;

type Kind = keyof typeof KINDS;

export const listAnalysesFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return prisma.aiAnalysis.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
});

export const runAnalysisFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        kind: z.enum([
          "INTERVIEW_SUMMARY",
          "FOLLOW_UP_EMAIL",
          "MEETING_SUMMARY",
          "ATS_OPTIMIZATION",
          "SKILL_GAP",
          "COACHING_REPORT",
          "PERFORMANCE_REPORT",
        ]),
        input: z.string().min(10, "Provide source content"),
        sessionId: z.string().uuid().optional(),
        resumeId: z.string().uuid().optional(),
        jobDescriptionId: z.string().uuid().optional(),
        role: z.string().max(160).optional(),
        company: z.string().max(160).optional(),
        industry: z.string().max(120).optional(),
        model: z.enum(["claude", "gpt", "gemini"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;
    const kind = data.kind as Kind;
    const cfg = KINDS[kind];

    if (!isAIConfigured()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };
    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS[cfg.action]) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    // Tailor the report to the candidate's real role/industry (any profession).
    const contextBlock =
      buildContextBlock({ role: data.role, company: data.company, industry: data.industry }) ||
      (await loadSessionContextBlock(data.sessionId));

    let content: string;
    let model: string;
    try {
      const res = await aiComplete({
        system:
          cfg.system +
          " The candidate may work in any profession; tailor everything to their actual role and industry and never assume a tech career.",
        user: contextBlock + cfg.prompt(data.input.slice(0, 12000)),
        model: data.model,
        maxTokens: 2500,
      });
      content = res.content;
      model = res.model;
    } catch {
      return { ok: false as const, error: "AI request failed. Please try again." };
    }

    const record = await prisma.aiAnalysis.create({
      data: {
        userId: auth.userId,
        organizationId: orgId,
        kind,
        sessionId: data.sessionId ?? null,
        resumeId: data.resumeId ?? null,
        jobDescriptionId: data.jobDescriptionId ?? null,
        model,
        content,
      },
    });

    try {
      await deductCredits(auth.userId, cfg.action, orgId, { analysisId: record.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      throw err;
    }

    return { ok: true as const, id: record.id, content };
  });
