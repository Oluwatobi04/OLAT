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

// Request-scoped Supabase client that reads/writes auth cookies via the
// TanStack Start server request/response context.
export function getSupabaseServerClient(): SupabaseClient {
  const request = getRequest();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const header = request?.headers.get("cookie") ?? "";
        return parseCookieHeader(header).map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookies) {
          setResponseHeader(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        }
      },
    },
  });
}

// Privileged admin client (service role) — never expose to the browser.
export function getSupabaseAdminClient(): SupabaseClient {
  return createServerClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
