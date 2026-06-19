import { createClient } from "@supabase/supabase-js";
import { prisma } from "./db.server";
import { ensureUserRecord } from "./auth.server";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

export interface ApiUser {
  userId: string;
  email: string;
  organizationId: string | null;
}

// Validate a Bearer Supabase access token from a cross-origin request (the
// Chrome extension). Returns the resolved app user, or null when invalid.
export async function authenticateBearer(request: Request): Promise<ApiUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  await ensureUserRecord(data.user);

  const membership = await prisma.membership.findFirst({
    where: { userId: data.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    organizationId: membership?.organizationId ?? null,
  };
}

// CORS headers — the extension runs from a chrome-extension:// origin.
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
