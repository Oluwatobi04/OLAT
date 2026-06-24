import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const REMEMBER_COOKIE = "olat5-remember";

// Request-scoped Supabase client that reads/writes auth cookies via the
// TanStack Start server request/response context.
//
// `persistSession` controls the "remember me" behaviour: when false, auth
// cookies are downgraded to session cookies (no maxAge/expires) so the session
// ends when the browser closes. When the option is omitted we honor the
// preference cookie written at sign-in, so token refreshes keep the same
// lifetime across requests.
export function getSupabaseServerClient(opts?: { persistSession?: boolean }): SupabaseClient {
  const request = getRequest();
  const cookieHeader = request?.headers.get("cookie") ?? "";

  const persist =
    opts?.persistSession ??
    !parseCookieHeader(cookieHeader).some(
      (c) => c.name === REMEMBER_COOKIE && c.value === "0",
    );

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader).map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookies) {
          const cookieOpts: CookieOptions = persist
            ? options
            : { ...options, maxAge: undefined, expires: undefined };
          setResponseHeader(
            "Set-Cookie",
            serializeCookieHeader(name, value, cookieOpts),
          );
        }
      },
    },
  });
}

// Persists the "remember me" choice so later token refreshes keep the same
// cookie lifetime. When remember is off the preference itself is a session
// cookie, so it disappears with the session.
export function setRememberPreference(remember: boolean): void {
  setResponseHeader(
    "Set-Cookie",
    serializeCookieHeader(REMEMBER_COOKIE, remember ? "1" : "0", {
      path: "/",
      sameSite: "lax",
      ...(remember ? { maxAge: 60 * 60 * 24 * 365 } : {}),
    }),
  );
}

// Build a Supabase client for a raw server-route handler (e.g. the OAuth
// callback), writing any auth cookies onto a Headers object the caller fully
// controls. This guarantees Set-Cookie ships on the SAME Response as the
// redirect — otherwise the new session is lost and the user bounces to /login.
export function createSupabaseForResponse(request: Request): {
  supabase: SupabaseClient;
  headers: Headers;
} {
  const headers = new Headers();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader).map((c) => ({ name: c.name, value: c.value ?? "" }));
      },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookies) {
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
      },
    },
  });
  return { supabase, headers };
}

// Privileged admin client (service role) — never expose to the browser.
export function getSupabaseAdminClient(): SupabaseClient {
  return createServerClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
