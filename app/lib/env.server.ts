import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16),
  REDIS_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // OpenRouter (multi-model AI)
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  // Deepgram (live transcription)
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  // Flutterwave
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().optional(),
  // Cryptomus
  CRYPTOMUS_API_KEY: z.string().optional(),
  CRYPTOMUS_MERCHANT_ID: z.string().optional(),
});

// Parse lazily and tolerate missing values in dev so the app can boot for UI work.
function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Invalid environment variables: " + parsed.error.flatten().fieldErrors,
      );
    }
    // dev fallback — return raw values so the server still starts
    return process.env as unknown as z.infer<typeof schema>;
  }
  return parsed.data;
}

export const env = load();
