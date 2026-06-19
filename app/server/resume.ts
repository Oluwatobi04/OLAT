import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { uploadResumeFile } from "~/lib/storage.server";
import { detectDocType, extractResumeText } from "~/lib/parse.server";
import { aiJSON, isAIConfigured } from "~/lib/ai.server";
import {
  checkCreditBalance,
  deductCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "~/lib/credits.server";

interface ResumeParsed {
  skills: string[];
  experience: { title: string; company: string; duration: string }[];
  education: string[];
  certifications: string[];
  projects: string[];
}
interface ResumeAnalysis {
  resumeScore: number;
  atsScore: number;
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  atsRecommendations: string[];
  improvementSuggestions: string[];
}

export const listResumesFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return prisma.resumeUpload.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
});

// Upload + parse + AI-analyze a resume. Costs 1 credit (charged after success).
export const analyzeResumeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected multipart form data");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("No file provided");
    return { file };
  })
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id ?? null;

    if (!isAIConfigured()) return { ok: false as const, error: "AI_NOT_CONFIGURED" };

    const balance = await checkCreditBalance(auth.userId);
    if (balance < CREDIT_COSTS.RESUME_ANALYSIS) {
      return { ok: false as const, error: "INSUFFICIENT_CREDITS", balance };
    }

    const file = data.file;
    const docType = detectDocType(file.name, file.type);
    if (!docType) {
      return { ok: false as const, error: "Unsupported file type. Use PDF or DOCX." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false as const, error: "File too large (max 10MB)." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    let extractedText = "";
    try {
      extractedText = await extractResumeText(bytes, docType);
    } catch {
      return { ok: false as const, error: "Could not read the document text." };
    }
    if (extractedText.length < 30) {
      return { ok: false as const, error: "The document appears to be empty or unreadable." };
    }

    const { signedUrl, path } = await uploadResumeFile({
      userId: auth.userId,
      fileName: file.name,
      bytes,
      contentType: file.type || "application/pdf",
    });

    let parsed: ResumeParsed;
    let analysis: ResumeAnalysis;
    try {
      const parsedRes = await aiJSON<ResumeParsed>({
        system:
          "You are an expert resume parser. Extract structured data from the resume text.",
        user:
          `Extract JSON with keys: skills (string[]), experience ({title,company,duration}[]), education (string[]), certifications (string[]), projects (string[]).\n\nResume:\n${extractedText.slice(0, 12000)}`,
      });
      parsed = parsedRes.data;

      const analysisRes = await aiJSON<ResumeAnalysis>({
        system:
          "You are an ATS and resume-quality expert. Score and critique the resume objectively.",
        user:
          `Return JSON with keys: resumeScore (0-100 int), atsScore (0-100 int), strengths (string[]), weaknesses (string[]), missingSkills (string[]), atsRecommendations (string[]), improvementSuggestions (string[]).\n\nResume:\n${extractedText.slice(0, 12000)}`,
      });
      analysis = analysisRes.data;
    } catch {
      return { ok: false as const, error: "AI analysis failed. Please try again." };
    }

    const clamp = (n: unknown) =>
      Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

    const record = await prisma.resumeUpload.create({
      data: {
        userId: auth.userId,
        organizationId: orgId,
        fileName: file.name,
        fileUrl: signedUrl,
        storagePath: path,
        extractedText: extractedText.slice(0, 20000),
        parsed: parsed as object,
        analysis: analysis as object,
        resumeScore: clamp(analysis.resumeScore),
        atsScore: clamp(analysis.atsScore),
      },
    });

    try {
      await deductCredits(auth.userId, "RESUME_ANALYSIS", orgId, { resumeId: record.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return { ok: false as const, error: "INSUFFICIENT_CREDITS", balance: 0 };
      }
      throw err;
    }

    return { ok: true as const, id: record.id };
  });

export const deleteResumeFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const r = await prisma.resumeUpload.findUnique({ where: { id: data.id } });
    if (!r || r.userId !== auth.userId) return { ok: false as const, error: "Not found" };
    await prisma.resumeUpload.delete({ where: { id: data.id } });
    return { ok: true as const };
  });
