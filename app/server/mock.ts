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

interface MockQuestion {
  question: string;
  type: string;
}

export const listMockInterviewsFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return prisma.mockInterview.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
});

// Starts a mock interview: generates questions and creates the record. Costs 3 credits up front.
export const startMockInterviewFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        jobDescriptionId: z.string().uuid().optional(),
        resumeId: z.string().uuid().optional(),
        role: z.string().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    if ((await checkCreditBalance(auth.userId)) < CREDIT_COSTS.MOCK_INTERVIEW) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
    }

    let jdContent = "";
    if (data.jobDescriptionId) {
      const jd = await prisma.jobDescription.findFirst({
        where: { id: data.jobDescriptionId, userId: auth.userId },
        select: { title: true, content: true },
      });
      jdContent = jd ? `${jd.title}\n${jd.content}` : "";
    }

    let qs: { questions: MockQuestion[] };
    try {
      const res = await aiJSON<typeof qs>({
        system: "You are conducting a mock interview. Generate a focused question set.",
        user:
          `Return JSON with key: questions (MockQuestion[]), MockQuestion = {question, type} where type is "behavioral" | "technical" | "situational". Generate 6 questions.\n\nRole: ${data.role ?? "General"}\nJob description:\n${jdContent.slice(0, 6000)}`,
      });
      qs = res.data;
    } catch {
      return { ok: false as const, error: "Could not start mock interview." };
    }

    const record = await prisma.mockInterview.create({
      data: {
        userId: auth.userId,
        organizationId: orgId,
        jobDescriptionId: data.jobDescriptionId ?? null,
        resumeId: data.resumeId ?? null,
        status: "IN_PROGRESS",
        questions: qs.questions as object,
        responses: [],
      },
    });

    try {
      await deductCredits(auth.userId, "MOCK_INTERVIEW", orgId, { mockId: record.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError)
        return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      throw err;
    }

    return { ok: true as const, id: record.id, questions: qs.questions };
  });

// Submits all responses, evaluates, and scores the interview. (Included in the start cost.)
export const submitMockInterviewFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        responses: z.array(z.object({ question: z.string(), answer: z.string() })),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const mock = await prisma.mockInterview.findFirst({
      where: { id: data.id, userId: auth.userId },
    });
    if (!mock) return { ok: false as const, error: "Not found" };

    interface Evaluation {
      communicationScore: number;
      confidenceScore: number;
      technicalScore: number;
      readinessScore: number;
      suggestions: string[];
      perAnswer: { question: string; feedback: string }[];
    }

    let evaluation: Evaluation;
    try {
      const res = await aiJSON<Evaluation>({
        system: "You are an interview evaluator scoring a candidate's mock interview.",
        user:
          `Return JSON: communicationScore, confidenceScore, technicalScore, readinessScore (each 0-100 int), suggestions (string[]), perAnswer ({question, feedback}[]).\n\nTranscript:\n${data.responses.map((r, i) => `Q${i + 1}: ${r.question}\nA: ${r.answer}`).join("\n\n")}`,
        maxTokens: 3000,
      });
      evaluation = res.data;
    } catch {
      return { ok: false as const, error: "Evaluation failed. Please try again." };
    }

    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

    await prisma.mockInterview.update({
      where: { id: mock.id },
      data: {
        status: "COMPLETED",
        responses: data.responses.map((r) => {
          const fb = evaluation.perAnswer?.find((p) => p.question === r.question);
          return { ...r, evaluation: fb?.feedback ?? "" };
        }) as object,
        communicationScore: clamp(evaluation.communicationScore),
        confidenceScore: clamp(evaluation.confidenceScore),
        technicalScore: clamp(evaluation.technicalScore),
        readinessScore: clamp(evaluation.readinessScore),
        suggestions: evaluation.suggestions as object,
      },
    });

    return { ok: true as const, id: mock.id };
  });
