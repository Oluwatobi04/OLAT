import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, UserPlus, Trash2 } from "lucide-react";
import {
  getTeamDataFn,
  inviteMemberFn,
  createTeamFn,
  updateMemberRoleFn,
  removeMemberFn,
} from "~/server/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { initials } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/team")({
  loader: () => getTeamDataFn(),
  component: TeamPage,
});

const ROLES = ["ADMIN", "MANAGER", "MEMBER", "BILLING"] as const;

function TeamPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canManage = ["OWNER", "ADMIN"].includes(data.role);
  const canCreateTeam = ["OWNER", "ADMIN", "MANAGER"].includes(data.role);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await inviteMemberFn({
        data: {
          email: String(form.get("email") ?? ""),
          role: (form.get("role") as (typeof ROLES)[number]) ?? "MEMBER",
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invitation sent");
      (e.target as HTMLFormElement).reset();
      await router.invalidate();
    } catch {
      toast.error("Could not invite member");
    } finally {
      setBusy(false);
    }
  }

  async function addTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await createTeamFn({
        data: {
          name: String(form.get("teamName") ?? ""),
          description: String(form.get("teamDesc") ?? "") || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Team created");
      (e.target as HTMLFormElement).reset();
      await router.invalidate();
    } catch {
      toast.error("Could not create team");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(membershipId: string, role: (typeof ROLES)[number]) {
    setBusy(true);
    try {
      const res = await updateMemberRoleFn({ data: { membershipId, role } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Role updated");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function remove(membershipId: string) {
    setBusy(true);
    try {
      const res = await removeMemberFn({ data: { membershipId } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Member removed");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team management</h1>
        <p className="text-sm text-muted-foreground">
          Invite members, assign roles, and organize teams.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Invite a member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={invite}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="teammate@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  name="role"
                  defaultValue="MEMBER"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-40"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0) + r.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={busy}>
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members ({data.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {data.members.map((m) => (
              <div key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    {m.user.profile?.avatarUrl ? (
                      <AvatarImage src={m.user.profile.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {initials(m.user.profile?.fullName, m.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.user.profile?.fullName ?? m.user.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {m.status === "INVITED" ? <Badge variant="outline">Invited</Badge> : null}
                  {canManage && m.role !== "OWNER" ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => changeRole(m.id, e.target.value as (typeof ROLES)[number])}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0) + r.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="secondary">{m.role}</Badge>
                  )}
                  {canManage && m.role !== "OWNER" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(m.id)}
                      disabled={busy}
                      aria-label="Remove member"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Group members into teams.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canCreateTeam ? (
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={addTeam}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="teamName">Team name</Label>
                <Input id="teamName" name="teamName" required placeholder="Engineering" />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="teamDesc">Description</Label>
                <Input id="teamDesc" name="teamDesc" placeholder="Optional" />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus className="h-4 w-4" /> Add team
              </Button>
            </form>
          ) : null}

          {data.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {data.teams.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{t._count.memberships} members</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
