import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Clock, Cpu, Users, Plus } from "lucide-react";
import { getDashboardDataFn } from "~/server/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/")({
  loader: () => getDashboardDataFn(),
  component: DashboardOverview,
});

function DashboardOverview() {
  const data = Route.useLoaderData();
  const stats = [
    { label: "Sessions", value: data.stats.sessions, icon: Mic },
    { label: "Minutes transcribed", value: data.stats.minutes, icon: Clock },
    { label: "AI tokens used", value: data.stats.tokens.toLocaleString(), icon: Cpu },
    { label: "Team members", value: data.stats.members, icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back{data.auth.user.profile?.fullName ? `, ${data.auth.user.profile.fullName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening in your workspace.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/sessions">
            <Plus className="h-4 w-4" /> New session
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent sessions</CardTitle>
          <Badge variant="secondary">{data.plan} plan</Badge>
        </CardHeader>
        <CardContent>
          {data.recentSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Mic className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No sessions yet. Start your first one to see it here.
              </p>
              <Button asChild size="sm">
                <Link to="/dashboard/sessions">
                  <Plus className="h-4 w-4" /> New session
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {data.recentSessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title ?? "Untitled session"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.mode} · {formatDate(s.startedAt)}
                    </p>
                  </div>
                  <Badge variant={s.status === "COMPLETED" ? "success" : "secondary"}>
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
