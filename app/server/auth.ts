import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient, setRememberPreference } from "~/lib/supabase.server";
import { ensureUserRecord, getSessionUser, requireAuth } from "~/lib/auth.server";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signInSchema = credentialsSchema.extend({
  rememberMe: z.boolean().optional(),
});

const signupSchema = credentialsSchema.extend({
  fullName: z.string().min(1).max(120).optional(),
});

// ── Sign up with email + password ────────────────────────────────────────
export const signUpFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => signupSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${APP_URL}/auth/callback`,
        data: data.fullName ? { full_name: data.fullName } : undefined,
      },
    });
    if (error) return { ok: false as const, error: error.message };

    // If email confirmation is disabled, a session exists immediately.
    if (result.user && result.session) {
      await ensureUserRecord(result.user);
      return { ok: true as const, needsVerification: false };
    }
    return { ok: true as const, needsVerification: true };
  });

// ── Log in with email + password ──────────────────────────────────────────
export const signInFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => signInSchema.parse(d))
  .handler(async ({ data }) => {
    const remember = data.rememberMe ?? true;
    // Record the preference (for future refreshes) and apply it to this
    // request's auth cookies.
    setRememberPreference(remember);
    const supabase = getSupabaseServerClient({ persistSession: remember });
    const { data: result, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) return { ok: false as const, error: error.message };
    if (result.user) await ensureUserRecord(result.user);
    return { ok: true as const };
  });

// ── Log out ────────────────────────────────────────────────────────────────
export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true as const };
});

// ── Forgot password (send reset email) ──────────────────────────────────────
export const forgotPasswordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${APP_URL}/reset-password`,
    });
    // Always return ok to avoid leaking which emails are registered.
    if (error) console.error("[forgotPassword]", error.message);
    return { ok: true as const };
  });

// ── Update password (after reset link / from settings) ──────────────────────
export const updatePasswordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ password: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ── Resend verification email ────────────────────────────────────────────────
export const resendVerificationFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: data.email,
      options: { emailRedirectTo: `${APP_URL}/auth/callback` },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ── Begin OAuth (Google / GitHub) — returns the provider redirect URL ─────────
export const oauthSignInFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ provider: z.enum(["google", "github"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.auth.signInWithOAuth({
      provider: data.provider,
      options: { redirectTo: `${APP_URL}/auth/callback` },
    });
    if (error || !result.url) {
      return { ok: false as const, error: error?.message ?? "OAuth init failed" };
    }
    return { ok: true as const, url: result.url };
  });

// ── Read current auth context (for client components) ─────────────────────────
export const getAuthContextFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await getSessionUser();
    if (!user) return null;
    return requireAuth();
  },
);
