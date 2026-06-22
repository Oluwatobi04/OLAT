import OpenAI from "openai";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Friendly model aliases → OpenRouter model ids.
export const MODELS = {
  claude: "anthropic/claude-haiku-4.5",
  gpt: "openai/gpt-4o-mini",
  gemini: "google/gemini-3.5-flash",
} as const;

export type ModelAlias = keyof typeof MODELS;

// OpenRouter is OpenAI-compatible, so we reuse the OpenAI SDK with a custom baseURL.
// We disable the SDK's own retries (we implement bounded retry below) and set a
// hard timeout so a stalled upstream can't hang a request indefinitely.
const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY || "placeholder",
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 60_000,
  maxRetries: 0,
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

// True when an OpenRouter API key is present. AI features are disabled without it.
export function isAIConfigured(): boolean {
  return Boolean(OPENROUTER_API_KEY);
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

// Vision completion — sends an image (data URL or https URL) + instruction.
// Used by the workspace "Analyze Screen" feature. Uses a vision-capable model.
export async function aiVision(opts: {
  system: string;
  user: string;
  imageUrl: string;
  model?: string;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new AIServiceError("OPENROUTER_API_KEY is not configured");
  }
  const model = opts.model || "openai/gpt-4o-mini";
  const res = await withRetry(() =>
    client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 900,
      messages: [
        { role: "system", content: opts.system },
        {
          role: "user",
          content: [
            { type: "text", text: opts.user },
            { type: "image_url", image_url: { url: opts.imageUrl } },
          ],
        },
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
      messages: [
        {
          role: "system",
          content:
            opts.system +
            "\n\nRespond ONLY with a single valid JSON object. No markdown fences, no commentary, no prose before or after.",
        },
        { role: "user", content: opts.user },
      ],
    }),
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  try {
    return { data: JSON.parse(extractJSON(raw)) as T, model };
  } catch (err) {
    throw new AIServiceError("AI returned invalid JSON", err);
  }
}

// Robustly extract a JSON object/array from a model response that may include
// markdown fences or stray prose. Works across Claude, GPT, and Gemini.
function extractJSON(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const objStart = t.indexOf("{");
  const arrStart = t.indexOf("[");
  const start =
    objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start === -1) return t;
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  return end > start ? t.slice(start, end + 1) : t;
}
