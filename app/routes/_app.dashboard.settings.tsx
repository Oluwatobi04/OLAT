import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Sun, Moon, Monitor } from "lucide-react";
import { getProfileFn, updateProfileFn } from "~/server/dashboard";
import { updatePasswordFn } from "~/server/auth";
import { useTheme, type Theme } from "~/components/theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";

export const Route = createFileRoute("/_app/dashboard/settings")({
  loader: () => getProfileFn(),
  component: SettingsPage,
});

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function SettingsPage() {
  const profile = Route.useLoaderData();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSavingProfile(true);
    try {
      const res = await updateProfileFn({
        data: {
          fullName: String(form.get("fullName") ?? ""),
          jobTitle: String(form.get("jobTitle") ?? ""),
          company: String(form.get("company") ?? ""),
          timezone: String(form.get("timezone") ?? ""),
        },
      });
      if (!res.ok) {
        toast.error("Could not update profile");
        return;
      }
      toast.success("Profile updated");
      await router.invalidate(); // refetch getProfileFn so values persist on the page
    } catch {
      toast.error("Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await updatePasswordFn({ data: { password } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Password changed");
      (e.target as HTMLFormElement).reset();
    } catch {
      toast.error("Could not change password");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and security.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            key={`${profile.fullName}|${profile.jobTitle}|${profile.company}|${profile.timezone}`}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={saveProfile}
          >
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={profile.fullName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={profile.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" name="jobTitle" defaultValue={profile.jobTitle} placeholder="Product Manager" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" defaultValue={profile.company} placeholder="Acme Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={profile.timezone} placeholder="America/New_York" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how OLat5 looks. System follows your device setting.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  aria-pressed={active}
                  className={
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors " +
                    (active
                      ? "border-primary bg-accent text-primary"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  <opt.icon className="h-5 w-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <form className="grid max-w-sm gap-4" onSubmit={savePassword}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" />
            </div>
            <div>
              <Button type="submit" variant="outline" disabled={savingPassword}>
                {savingPassword ? "Updating..." : "Change password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
