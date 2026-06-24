import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseForResponse } from "~/lib/supabase.server";
import { ensureUserRecord } from "~/lib/auth.server";

// OAuth / email callback. Implemented as a server-route handler (not a loader)
// so the session cookies set by exchangeCodeForSession ship on the SAME 303
// Response as the redirect. Successful auth always lands on /dashboard.
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");

        // Only allow safe in-app relative paths (no open redirects).
        const rawNext = url.searchParams.get("next") ?? "/dashboard";
        const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
        // Where to send the user when the link is invalid/expired.
        const failPath = next === "/reset-password" ? "/forgot-password?error=expired" : "/login?error=oauth_failed";

        const redirectTo = (path: string, headers?: Headers) => {
          const h = headers ?? new Headers();
          h.set("Location", path); // relative — resolves against the app origin
          return new Response(null, { status: 303, headers: h });
        };

        if (!code) return redirectTo(failPath);

        const { supabase, headers } = createSupabaseForResponse(request);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) return redirectTo(failPath);

        // Provision app user + org + workspace + free credits (idempotent).
        await ensureUserRecord(data.user);
        // Recovery → /reset-password (session now active so updateUser works);
        // OAuth/email confirm → /dashboard.
        return redirectTo(next, headers);
      },
    },
  },
});
