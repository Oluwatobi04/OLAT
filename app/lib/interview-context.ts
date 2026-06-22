import { prisma } from "./db.server";

// A profession-agnostic interview context. Every field is optional except role;
// the builder degrades gracefully so the system never assumes a tech career.
export interface InterviewContextInput {
  role?: string | null;
  company?: string | null;
  industry?: string | null;
  resumeText?: string | null;
  jobDescriptionText?: string | null;
  generatedContext?: string | null;
}

// Derives a compact, human-readable context summary at capture time (no AI call,
// so it adds zero latency/cost to the live path). Stored as `generatedContext`.
export function deriveContextSummary(input: InterviewContextInput): string {
  const role = (input.role || "").trim() || "an unspecified role";
  const company = (input.company || "").trim();
  const industry = (input.industry || "").trim();
  const bits: string[] = [
    `The candidate is interviewing for ${role}` +
      (company ? ` at ${company}` : "") +
      (industry ? ` in the ${industry} industry` : "") +
      ".",
  ];
  if (input.resumeText && input.resumeText.trim()) {
    bits.push("They have provided a resume describing their background.");
  }
  if (input.jobDescriptionText && input.jobDescriptionText.trim()) {
    bits.push("A job description for the target role is available.");
  }
  bits.push(
    "Tailor all guidance to this exact role and industry. Do not assume a software or technology career unless the role itself is technical.",
  );
  return bits.join(" ");
}

// Builds the prompt block injected into every AI call. Returns "" when there's
// nothing useful, so callers can append unconditionally.
export function buildContextBlock(input: InterviewContextInput | null | undefined): string {
  if (!input) return "";
  const lines: string[] = [];
  if (input.role) lines.push(`Role applying for: ${input.role}`);
  if (input.company) lines.push(`Company: ${input.company}`);
  if (input.industry) lines.push(`Industry: ${input.industry}`);
  if (input.generatedContext) lines.push(`Context: ${input.generatedContext}`);
  if (input.resumeText && input.resumeText.trim()) {
    lines.push(`Candidate resume (excerpt):\n${input.resumeText.slice(0, 3500)}`);
  }
  if (input.jobDescriptionText && input.jobDescriptionText.trim()) {
    lines.push(`Job description (excerpt):\n${input.jobDescriptionText.slice(0, 3500)}`);
  }
  if (!lines.length) return "";
  return (
    "=== INTERVIEW CONTEXT (use this to tailor every answer to the candidate's actual role and industry; never assume a tech career) ===\n" +
    lines.join("\n") +
    "\n=== END CONTEXT ===\n\n"
  );
}

// Loads the InterviewContext attached to a session (if any).
export async function loadSessionContextBlock(
  sessionId: string | null | undefined,
): Promise<string> {
  if (!sessionId) return "";
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { interviewContextId: true },
  });
  if (!session?.interviewContextId) return "";
  const ctx = await prisma.interviewContext.findUnique({
    where: { id: session.interviewContextId },
  });
  return buildContextBlock(ctx);
}

// Resolves resume/JD text from stored records, then creates an InterviewContext.
export async function createInterviewContext(opts: {
  userId: string;
  organizationId?: string | null;
  role: string;
  company?: string | null;
  industry?: string | null;
  resumeId?: string | null;
  jobDescriptionId?: string | null;
  resumeText?: string | null;
  jobDescriptionText?: string | null;
}) {
  let resumeText = opts.resumeText ?? null;
  let jobDescriptionText = opts.jobDescriptionText ?? null;

  if (!resumeText && opts.resumeId) {
    const r = await prisma.resumeUpload.findFirst({
      where: { id: opts.resumeId, userId: opts.userId },
      select: { extractedText: true },
    });
    resumeText = r?.extractedText ?? null;
  }
  if (!jobDescriptionText && opts.jobDescriptionId) {
    const jd = await prisma.jobDescription.findFirst({
      where: { id: opts.jobDescriptionId, userId: opts.userId },
      select: { title: true, content: true },
    });
    jobDescriptionText = jd ? `${jd.title}\n${jd.content}` : null;
  }

  const generatedContext = deriveContextSummary({
    role: opts.role,
    company: opts.company,
    industry: opts.industry,
    resumeText,
    jobDescriptionText,
  });

  return prisma.interviewContext.create({
    data: {
      userId: opts.userId,
      organizationId: opts.organizationId ?? null,
      role: opts.role,
      company: opts.company ?? null,
      industry: opts.industry ?? null,
      resumeId: opts.resumeId ?? null,
      jobDescriptionId: opts.jobDescriptionId ?? null,
      resumeText,
      jobDescriptionText,
      generatedContext,
    },
  });
}
