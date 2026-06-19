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

interface JDAnalysis {
  requiredSkills: string[];
  responsibilities: string[];
  keywords: string[];
  skillMatchPct: number;
}

export const listJobDescriptionsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = await requireAuth();
    return prisma.jobDescription.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },
);

export const analyzeJobDescriptionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        company: z.string().max(200).optional(),
        content: z.string().min(20, "Paste the full job description"),
        resumeId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    const balance = await checkCreditBalance(auth.userId);
    if (balance < CREDIT_COSTS.JD_ANALYSIS) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS", balance };
    }

    // If a resume is provided, factor its text into the skill-match score.
    let resumeText = "";
    if (data.resumeId) {
      const r = await prisma.resumeUpload.findFirst({
        where: { id: data.resumeId, userId: auth.userId },
        select: { extractedText: true },
      });
      resumeText = r?.extractedText ?? "";
    }

    let analysis: JDAnalysis;
    try {
      const res = await aiJSON<JDAnalysis>({
        system: "You are an expert technical recruiter analyzing job descriptions.",
        user:
          `Return JSON with keys: requiredSkills (string[]), responsibilities (string[]), keywords (string[]), skillMatchPct (0-100 int — how well the candidate resume matches; if no resume, estimate 0).\n\nJob title: ${data.title}\nCompany: ${data.company ?? "N/A"}\n\nJob description:\n${data.content.slice(0, 10000)}\n\nCandidate resume (may be empty):\n${resumeText.slice(0, 8000)}`,
      });
      analysis = res.data;
    } catch {
      return { ok: false as const, error: "AI analysis failed. Please try again." };
    }

    const record = await prisma.jobDescription.create({
      data: {
        userId: auth.userId,
        organizationId: orgId,
        title: data.title,
        company: data.company ?? null,
        content: data.content,
        analysis: analysis as object,
        skillMatchPct: Math.max(0, Math.min(100, Math.round(Number(analysis.skillMatchPct) || 0))),
      },
    });

    try {
      await deductCredits(auth.userId, "JD_ANALYSIS", orgId, { jobDescriptionId: record.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return { ok: false as const, error: "INSUFFICIENT_CREDITS", balance: 0 };
      }
      throw err;
    }

    return { ok: true as const, id: record.id };
  });

export const deleteJobDescriptionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const j = await prisma.jobDescription.findUnique({ where: { id: data.id } });
    if (!j || j.userId !== auth.userId) return { ok: false as const, error: "Not found" };
    await prisma.jobDescription.delete({ where: { id: data.id } });
    return { ok: true as const };
  });
