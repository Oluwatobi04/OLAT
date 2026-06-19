import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mic, Plus, Trash2 } from "lucide-react";
import { listSessionsFn, createSessionFn, deleteSessionFn } from "~/server/sessions";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/sessions")({
  loader: () => listSessionsFn(),
  component: SessionsPage,
});

const MODES = ["MEETING", "INTERVIEW", "COACHING", "SALES", "GENERIC"] as const;

function SessionsPage() {
  const sessions = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await createSessionFn({
        data: {
          title: String(form.get("title") ?? "") || undefined,
          mode: form.get("mode") as (typeof MODES)[number],
          platform: String(form.get("platform") ?? "") || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Session started");
      setCreating(false);
      await router.invalidate();
    } catch {
      toast.error("Could not create session");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      const res = await deleteSessionFn({ data: { id } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Session deleted");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Your interviews and meetings, transcribed and summarized.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> New session
        </Button>
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>Start a new session</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleCreate}>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="Weekly sync" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <select
                  id="mode"
                  name="mode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue="MEETING"
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform">Platform</Label>
                <Input id="platform" name="platform" placeholder="Zoom" />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={busy}>
                  {busy ? "Starting..." : "Start session"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Mic className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title ?? "Untitled session"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.mode}
                      {s.platform ? ` · ${s.platform}` : ""} · {formatDate(s.startedAt)}
                      {s.durationSec ? ` · ${Math.round(s.durationSec / 60)} min` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={s.status === "COMPLETED" ? "success" : "secondary"}>
                      {s.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(s.id)}
                      disabled={busy}
                      aria-label="Delete session"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
