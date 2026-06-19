import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { aiJSON } from "~/lib/ai.server";
import {
  checkCreditBalance,
  deductCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "~/lib/credits.server";

interface Question {
  question: string;
  category?: string;
}
interface SuggestedAnswer {
  question: string;
  starAnswer?: string;
  technicalGuide?: string;
  talkingPoints: string[];
}

async function loadContext(userId: string, resumeId?: string, jdId?: string) {
  const [resume, jd] = await Promise.all([
    resumeId
      ? prisma.resumeUpload.findFirst({
          where: { id: resumeId, userId },
          select: { extractedText: true },
        })
      : null,
    jdId
      ? prisma.jobDescription.findFirst({
          where: { id: jdId, userId },
          select: { title: true, company: true, content: true },
        })
      : null,
  ]);
  return {
    resumeText: resume?.extractedText ?? "",
    jd,
  };
}

export const listInterviewPrepFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return prisma.interviewPrep.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
});

// Generates behavioral, technical, and company-specific questions. 1 credit.
export const generateQuestionsFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        resumeId: z.string().uuid().optional(),
        jobDescriptionId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.QUESTION_GENERATION) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    const { resumeText, jd } = await loadContext(
      auth.userId,
      data.resumeId,
      data.jobDescriptionId,
    );

    let result: {
      behavioral: Question[];
      technical: Question[];
      company: Question[];
    };
    try {
      const res = await aiJSON<typeof result>({
        system: "You are an expert interview coach generating tailored interview questions.",
        user:
          `Return JSON with keys: behavioral (Question[]), technical (Question[]), company (Question[]). Each Question = {question, category}. Generate 6 behavioral, 6 technical, and 4 company-specific questions.\n\nRole: ${jd?.title ?? "General"}\nCompany: ${jd?.company ?? "N/A"}\nJob description:\n${(jd?.content ?? "").slice(0, 6000)}\n\nCandidate resume:\n${resumeText.slice(0, 6000)}`,
      });
      result = res.data;
    } catch {
      return { ok: false as const, error: "Generation failed. Please try again." };
    }

    const record = await prisma.interviewPrep.create({
      data: {
        userId: auth.userId,
        organizationId: orgId,
        resumeId: data.resumeId ?? null,
        jobDescriptionId: data.jobDescriptionId ?? null,
        behavioralQuestions: result.behavioral as object,
        technicalQuestions: result.technical as object,
        companyQuestions: result.company as object,
      },
    });

    try {
      await deductCredits(auth.userId, "QUESTION_GENERATION", orgId, { prepId: record.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      throw err;
    }

    return { ok: true as const, id: record.id };
  });

// Generates STAR-format / technical suggested answers for an existing prep. 1 credit.
export const generateAnswersFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ prepId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    const prep = await prisma.interviewPrep.findFirst({
      where: { id: data.prepId, userId: auth.userId },
    });
    if (!prep) return { ok: false as const, error: "Prep not found" };

    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.SUGGESTED_ANSWERS) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    const questions = [
      ...((prep.behavioralQuestions as Question[] | null) ?? []),
      ...((prep.technicalQuestions as Question[] | null) ?? []),
      ...((prep.companyQuestions as Question[] | null) ?? []),
    ].map((q) => q.question);

    let answers: { answers: SuggestedAnswer[] };
    try {
      const res = await aiJSON<typeof answers>({
        system: "You are an expert interview coach writing model answers.",
        user:
          `Return JSON with key: answers (SuggestedAnswer[]). SuggestedAnswer = {question, starAnswer, technicalGuide, talkingPoints (string[])}. Provide a STAR answer for behavioral questions and a technicalGuide for technical ones.\n\nQuestions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
        maxTokens: 3500,
      });
      answers = res.data;
    } catch {
      return { ok: false as const, error: "Generation failed. Please try again." };
    }

    await prisma.interviewPrep.update({
      where: { id: prep.id },
      data: { suggestedAnswers: answers.answers as object },
    });

    try {
      await deductCredits(auth.userId, "SUGGESTED_ANSWERS", orgId, { prepId: prep.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      throw err;
    }

    return { ok: true as const, id: prep.id };
  });
