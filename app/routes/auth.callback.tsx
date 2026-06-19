import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { ensureUserRecord } from "~/lib/auth.server";

// Exchanges the OAuth/email code for a session, bootstraps the app user,
// then redirects into the dashboard (or back to login on failure).
const handleCallback = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ code: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!data.code) throw redirect({ to: "/login" });
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.auth.exchangeCodeForSession(
      data.code,
    );
    if (error || !result.user) {
      throw redirect({ to: "/login", search: { error: "oauth_failed" } });
    }
    await ensureUserRecord(result.user);
    throw redirect({ to: "/dashboard" });
  });

export const Route = createFileRoute("/auth/callback")({
  validateSearch: z.object({ code: z.string().optional() }),
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }) => handleCallback({ data: { code: deps.code } }),
  component: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  ),
});
