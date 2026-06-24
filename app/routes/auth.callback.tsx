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

        const redirectTo = (path: string, headers?: Headers) => {
          const h = headers ?? new Headers();
          h.set("Location", path); // relative — resolves against the app origin
          return new Response(null, { status: 303, headers: h });
        };

        if (!code) return redirectTo("/login?error=oauth_failed");

        const { supabase, headers } = createSupabaseForResponse(request);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) return redirectTo("/login?error=oauth_failed");

        // Provision app user + org + workspace + free credits (idempotent).
        await ensureUserRecord(data.user);
        return redirectTo("/dashboard", headers);
      },
    },
  },
});
