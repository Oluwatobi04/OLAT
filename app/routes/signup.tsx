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
import { signUpFn } from "~/server/auth";

const redirectIfAuthed = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await getOptionalAuth();
  if (auth) throw redirect({ to: "/dashboard" });
  return null;
});

export const Route = createFileRoute("/signup")({
  beforeLoad: () => redirectIfAuthed(),
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = z
      .object({
        fullName: z.string().min(1, "Enter your name"),
        email: z.string().email(),
        password: z.string().min(8, "Password must be at least 8 characters"),
      })
      .safeParse({
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
      });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const res = await signUpFn({ data: parsed.data });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.needsVerification) {
        setVerifySent(true);
        toast.success("Check your email to verify your account");
        return;
      }
      toast.success("Account created");
      await router.navigate({ to: "/dashboard" });
    } catch {
      toast.error("Sign up failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (verifySent) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="We've sent a verification link to your inbox. Click it to activate your account."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        }
      >
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link to="/verify-email" className="text-primary hover:underline">
            resend the email
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start using OLat5 free. No credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
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
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Ada Lovelace" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
