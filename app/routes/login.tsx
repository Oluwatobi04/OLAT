import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import { Check, Star, ShieldCheck, Sparkles, Mic, CircleDot } from "lucide-react";
import { OAuthButtons } from "~/components/auth/oauth-buttons";
import { PasswordInput } from "~/components/auth/password-input";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Logo } from "~/components/brand/logo";
import { getOptionalAuth } from "~/lib/auth.server";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { signInFn } from "~/server/auth";

const redirectIfAuthed = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await getOptionalAuth();
  if (auth) throw redirect({ to: "/dashboard" });
  return null;
});

export const Route = createFileRoute("/login")({
  beforeLoad: () => redirectIfAuthed(),
  component: LoginPage,
});

const FEATURES = [
  "Real Time Transcription",
  "Instant AI Responses",
  "Resume Context",
  "Document Context",
  "Multi Platform Support",
];

const PLATFORMS = ["Google Meet", "Zoom", "Microsoft Teams", "Webex"];

function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // ── unchanged auth logic ──────────────────────────────────────
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) {
      toast.error("Enter a valid email and password");
      return;
    }
    const rememberMe = form.get("rememberMe") === "on";
    setLoading(true);
    try {
      const res = await signInFn({ data: { ...parsed.data, rememberMe } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Welcome back");
      await router.navigate({ to: "/dashboard" });
    } catch {
      toast.error("Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1.05fr_1fr]">
      {/* ── LEFT: hero / showcase ── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(48rem 32rem at 8% -10%, rgba(37,99,235,0.10), transparent 60%)," +
              "radial-gradient(42rem 30rem at 100% 0%, rgba(96,165,250,0.12), transparent 55%)," +
              "linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)",
          }}
        />
        <div className="relative z-10">
          <Logo height={40} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-lg"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#BFDBFE] bg-white px-3 py-1 text-xs font-medium text-[#2563EB] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" /> Interview Copilot
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-[#0F172A] xl:text-5xl">
            Ace Every Interview
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#475569]">
            OLat5 listens, transcribes, understands context, and helps you respond with confidence
            during interviews and meetings.
          </p>

          {/* Product screenshot mockup */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_50px_-20px_rgba(37,99,235,0.35)]">
            <div className="flex items-center gap-1.5 border-b border-[#F1F5F9] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
              <span className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#10B981]">
                <CircleDot className="h-3 w-3" /> Listening
              </span>
              <span className="ml-auto text-[10px] font-medium text-[#94A3B8]">OLat5 Workspace</span>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#2563EB]">Suggested response</p>
                <p className="mt-1 text-[13px] font-semibold leading-snug text-[#0F172A]">
                  “I led a team of five and shipped the launch two weeks early. Here's how…”
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["Stay specific", "Give one real example", "End with the result", "Keep it brief"].map((p) => (
                  <div key={p} className="flex items-center gap-1.5 rounded-lg bg-[#F8FAFC] px-2.5 py-1.5 text-[11px] text-[#334155]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" /> {p}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 rounded-xl bg-[#F8FAFC] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Live transcript</p>
                <p className="text-[12px] text-[#475569]"><span className="font-semibold text-[#0F172A]">Interviewer:</span> Tell me about a challenge you overcame.</p>
                <p className="text-[12px] text-[#475569]"><span className="font-semibold text-[#2563EB]">You:</span> Absolutely, last quarter…</p>
              </div>
            </div>
          </div>

          {/* Feature list */}
          <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-[#334155]">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#DBEAFE] text-[#2563EB]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* Supported platforms */}
          <div className="mt-7">
            <p className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">Works with</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs font-medium text-[#475569] shadow-sm"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Trust indicators */}
        <div className="relative z-10 flex items-center gap-6 text-sm text-[#475569]">
          <div className="flex items-center gap-1.5">
            <span className="flex">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
              ))}
            </span>
            <span className="font-medium text-[#0F172A]">4.9/5</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#10B981]" /> Bank grade encryption
          </div>
          <div className="flex items-center gap-1.5">
            <Mic className="h-4 w-4 text-[#2563EB]" /> Any meeting platform
          </div>
        </div>
      </aside>

      {/* ── RIGHT: login card ── */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* logo for mobile (left panel hidden) */}
          <Link to="/" className="mb-8 flex justify-center lg:hidden">
            <Logo height={36} />
          </Link>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Log in to OLat5</h2>
              <p className="mt-1 text-sm text-muted-foreground">Welcome back. Enter your credentials to continue.</p>
            </div>

            <OAuthButtons />
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-muted-foreground hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput id="password" name="password" autoComplete="current-password" required />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#475569]">
                <input
                  type="checkbox"
                  name="rememberMe"
                  defaultChecked
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-2 focus:ring-[#2563EB]"
                />
                Remember me
              </label>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Log in"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
