import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "~/components/auth/auth-shell";
import { OAuthButtons } from "~/components/auth/oauth-buttons";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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

function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      const res = await signInFn({ data: parsed.data });
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
    <AuthShell
      title="Log in to OLat5"
      subtitle="Welcome back. Enter your credentials to continue."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <OAuthButtons />
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </Button>
      </form>
    </AuthShell>
  );
}
