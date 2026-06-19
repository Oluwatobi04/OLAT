import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, TrendingUp, ArrowUpRight } from "lucide-react";
import { getCreditDashboardFn } from "~/server/credits";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/credits")({
  loader: () => getCreditDashboardFn(),
  component: CreditsPage,
});

function CreditsPage() {
  const data = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
        <p className="text-sm text-muted-foreground">
          Track your usage and remaining AI credits.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> Credit balance
          </CardTitle>
          <Badge variant={data.plan === "FREE" ? "secondary" : "default"}>
            {data.plan} plan
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-4xl font-bold">{data.currentBalance}</span>
              <span className="text-lg text-muted-foreground">
                {" "}
                / {data.monthlyAllocation} credits remaining
              </span>
            </div>
            <span className="text-sm text-muted-foreground">{data.used} used</span>
          </div>
          <Progress
            value={data.pctRemaining}
            indicatorClassName={
              data.lowCredits ? "bg-destructive" : data.pctRemaining < 50 ? "bg-amber-500" : "bg-primary"
            }
          />
          {data.lowCredits ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <TrendingUp className="h-4 w-4" />
                You&apos;re running low on credits ({data.pctRemaining}% left). Upgrade for more.
              </div>
              <Button size="sm" asChild>
                <Link to="/dashboard/billing">
                  Upgrade <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["FREE", "PRO", "TEAM"] as const).map((p) => (
          <Card key={p} className={p === data.plan ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{p}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.allocations[p]}</div>
              <p className="text-xs text-muted-foreground">credits / month</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.transactions.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No usage yet.
            </p>
          ) : (
            <div className="divide-y">
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{formatAction(t.actionType)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        t.direction === "CREDIT"
                          ? "text-sm font-medium text-emerald-600"
                          : "text-sm font-medium text-foreground"
                      }
                    >
                      {t.direction === "CREDIT" ? "+" : "−"}
                      {t.creditsUsed}
                    </span>
                    <Badge variant="outline">{t.remainingBalance} left</Badge>
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

function formatAction(a: string): string {
  return a
    .replace(/^PLAN_/, "Plan: ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
