import OpenAI from "openai";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Friendly model aliases → OpenRouter model ids.
export const MODELS = {
  claude: "anthropic/claude-3.5-sonnet",
  gpt: "openai/gpt-4o-mini",
  gemini: "google/gemini-flash-1.5",
} as const;

export type ModelAlias = keyof typeof MODELS;

// OpenRouter is OpenAI-compatible, so we reuse the OpenAI SDK with a custom baseURL.
const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY || "placeholder",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": APP_URL,
    "X-Title": "OLat5",
  },
});

export class AIServiceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "AIServiceError";
  }
}

function resolveModel(model?: ModelAlias | string): string {
  if (!model) return OPENROUTER_MODEL;
  if (model in MODELS) return MODELS[model as ModelAlias];
  return model;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      // retry only transient errors
      if (status && status < 500 && status !== 429) break;
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  throw new AIServiceError("AI request failed after retries", lastErr);
}

// Plain text completion.
export async function aiComplete(opts: {
  system: string;
  user: string;
  model?: ModelAlias | string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new AIServiceError("OPENROUTER_API_KEY is not configured");
  }
  const model = resolveModel(opts.model);
  const res = await withRetry(() =>
    client.chat.completions.create({
      model,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2000,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  );
  return { content: res.choices[0]?.message?.content ?? "", model };
}

// Strict JSON completion — instructs the model to return JSON and parses it.
export async function aiJSON<T>(opts: {
  system: string;
  user: string;
  model?: ModelAlias | string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; model: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new AIServiceError("OPENROUTER_API_KEY is not configured");
  }
  const model = resolveModel(opts.model);
  const res = await withRetry(() =>
    client.chat.completions.create({
      model,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            opts.system +
            "\n\nRespond ONLY with a valid JSON object. No markdown, no commentary.",
        },
        { role: "user", content: opts.user },
      ],
    }),
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  try {
    return { data: JSON.parse(stripFences(raw)) as T, model };
  } catch (err) {
    throw new AIServiceError("AI returned invalid JSON", err);
  }
}

function stripFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  return trimmed;
}
