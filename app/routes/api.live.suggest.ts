import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { aiJSON, isAIConfigured, type ModelAlias } from "~/lib/ai.server";
import { checkCreditBalance } from "~/lib/credits.server";
import { authenticateBearer, jsonResponse, preflight } from "~/lib/api-auth.server";

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

        const system =
          "You are an elite real-time interview copilot. The candidate is in a live interview. " +
          "Given the interviewer's question and recent transcript, produce a concise, natural answer the candidate can speak, " +
          "plus talking points and a STAR breakdown. Be specific and confident, not generic.";
        const userPrompt =
          `Role: ${parsed.role ?? "the candidate's target role"}\n` +
          `Recent transcript:\n${parsed.transcript ?? "(none)"}\n\n` +
          `Interviewer question: "${parsed.question}"\n\n` +
          `Return JSON with keys: suggestedAnswer (string, 2-4 sentences), talkingPoints (string[]), ` +
          `star {situation, task, action, result}, technicalGuidance (string), followUp (string).`;

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
            return jsonResponse(request, { ok: true, model: used, suggestion: data });
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
