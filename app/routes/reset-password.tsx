import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "~/components/auth/auth-shell";
import { PasswordInput } from "~/components/auth/password-input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { updatePasswordFn, signOutFn } from "~/server/auth";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const parsed = z.string().min(8).safeParse(password);
    if (!parsed.success) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await updatePasswordFn({ data: { password } });
      if (!res.ok) {
        // Most common cause: the recovery link expired or was already used, so
        // there's no active recovery session to update.
        toast.error(
          /session|jwt|expired|missing/i.test(res.error)
            ? "This reset link has expired. Please request a new one."
            : res.error,
        );
        return;
      }
      // End the recovery session and send the user to log in with the new password.
      await signOutFn().catch(() => {});
      toast.success("Password updated — please log in");
      await router.navigate({ to: "/login" });
    } catch {
      toast.error("Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you haven't used before."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
