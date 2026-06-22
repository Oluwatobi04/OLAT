import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aiJSON, isAIConfigured, type ModelAlias } from "~/lib/ai.server";
import { checkCreditBalance } from "~/lib/credits.server";
import { authenticateBearer, jsonResponse, preflight } from "~/lib/api-auth.server";
import { loadSessionContextBlock } from "~/lib/interview-context";

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  transcript: z.string().max(8000).optional(),
  role: z.string().max(200).optional(),
  sessionId: z.string().uuid().optional(),
});

interface Suggestion {
  suggestedAnswer: string;
  talkingPoints: string[];
  star: { situation: string; task: string; action: string; result: string };
  technicalGuidance: string;
  followUp: string;
}

const FALLBACK: ModelAlias[] = ["claude", "gpt", "gemini"];

// Real-time copilot: given a detected interview question + rolling transcript,
// returns a structured answer. Tries Claude → GPT → Gemini for resilience.
export const Route = createFileRoute("/api/live/suggest")({
  server: {
    handlers: {
      OPTIONS: ({ request }: { request: Request }) => preflight(request),
      POST: async ({ request }: { request: Request }) => {
        const user = await authenticateBearer(request);
        if (!user) return jsonResponse(request, { error: "UNAUTHORIZED" }, 401);
        if (!isAIConfigured()) {
          return jsonResponse(request, { error: "AI_NOT_CONFIGURED" }, 503);
        }
        // Suggestions are covered by the live session's upfront credit charge;
        // require a positive balance to prevent abuse outside a session.
        if ((await checkCreditBalance(user.userId)) <= 0) {
          return jsonResponse(request, { error: "INSUFFICIENT_CREDITS" }, 402);
        }

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return jsonResponse(request, { error: "INVALID_BODY" }, 400);
        }

        // Pull the interview context attached to this session (role, company,
        // industry, resume, JD) so suggestions fit the candidate's actual job.
        const contextBlock = await loadSessionContextBlock(parsed.sessionId);

        const system =
          "You are a calm, friendly interview helper whispering to a candidate during a live interview. " +
          "The candidate may be in ANY profession — teacher, nurse, chef, lawyer, accountant, salesperson, engineer, etc. " +
          "Always tailor your help to their actual role and industry from the interview context. Never assume a tech job. " +
          "Write the way a smart friend would coach them in the moment. Use plain, everyday English. " +
          "Short sentences. No jargon, no corporate buzzwords, no framework names. Be specific and practical, never generic. " +
          "The candidate is under pressure and reading fast, so every word must earn its place.";
        const userPrompt =
          contextBlock +
          `Their target role: ${parsed.role ?? "(see interview context above)"}\n` +
          `Recent conversation:\n${parsed.transcript ?? "(none yet)"}\n\n` +
          `The interviewer just asked: "${parsed.question}"\n\n` +
          `Return ONLY a JSON object with these keys:\n` +
          `- "suggestedAnswer": what they could say, in plain English, 2-3 short sentences they can speak out loud, fitting their role and industry.\n` +
          `- "talkingPoints": 2-4 very short bullet phrases (max ~8 words each) to remember.\n` +
          `- "star": a real-example structure as plain sentences {situation, task, action, result} — no labels, just natural wording relevant to their profession.\n` +
          `- "technicalGuidance": one or two short, practical role-specific tips ONLY if the question needs domain/technical knowledge for THIS profession, else "".\n` +
          `- "followUp": one short, encouraging tip (max one sentence).\n` +
          `Keep everything friendly and easy to read at a glance. Never exceed 3 short paragraphs total.`;

        let lastErr: unknown;
        for (const model of FALLBACK) {
          try {
            const { data, model: used } = await aiJSON<Suggestion>({
              system,
              user: userPrompt,
              model,
              temperature: 0.4,
              maxTokens: 1200,
            });
            const creditsRemaining = await checkCreditBalance(user.userId);
            return jsonResponse(request, {
              ok: true,
              model: used,
              suggestion: data,
              creditsRemaining,
            });
          } catch (err) {
            lastErr = err;
          }
        }
        const message = lastErr instanceof Error ? lastErr.message : "AI failed";
        return jsonResponse(request, { error: message }, 502);
      },
    },
  },
});
