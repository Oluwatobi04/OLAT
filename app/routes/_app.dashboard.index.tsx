import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Mic,
  FileText,
  FolderOpen,
  ArrowRight,
  Upload,
  Clock,
  Coins,
  Activity,
} from "lucide-react";
import { getHomeFn } from "~/server/dashboard";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/")({
  loader: () => getHomeFn(),
  component: DashboardHome,
});

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35 } }),
};

function DashboardHome() {
  const data = Route.useLoaderData();
  const firstName = data.user.profile?.fullName?.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.section
        initial="hidden"
        animate="show"
        custom={0}
        variants={fade}
        className="overflow-hidden rounded-[24px] border border-border bg-white p-8 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
      >
        <p className="text-sm font-medium text-[#2563EB]">Welcome back{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0F172A]">
          Ready for your next interview?
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
          Start a session and OLat5 listens, transcribes, and tells you exactly what to say,
          all inside your browser.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/workspace/new">
              <Mic className="h-4 w-4" /> Start session
            </Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link to="/dashboard/resume">
              <Upload className="h-4 w-4" /> Upload resume
            </Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link to="/dashboard/job-descriptions">
              <FolderOpen className="h-4 w-4" /> Upload documents
            </Link>
          </Button>
        </div>
      </motion.section>

      {/* Quick stats (real counts) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sessions", value: data.counts.sessions, icon: Mic },
          { label: "Resumes", value: data.counts.resumes, icon: FileText },
          { label: "Documents", value: data.counts.documents, icon: FolderOpen },
          { label: "Available Credits", value: data.credits.remaining.toLocaleString(), icon: Coins },
        ].map((s, i) => (
          <motion.div key={s.label} initial="hidden" animate="show" custom={i + 1} variants={fade}>
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">{s.value}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <s.icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent sessions */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Header title="Recent sessions" to="/dashboard/sessions" />
            {data.sessions.length === 0 ? (
              <Empty icon={Mic} text="No sessions yet. Start your first interview session." />
            ) : (
              <div className="mt-2 divide-y divide-border">
                {data.sessions.map((s) => (
                  <Link
                    key={s.id}
                    to="/dashboard/sessions"
                    className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-[#F8FAFC]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0F172A]">{s.title ?? "Untitled session"}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.mode}
                        {s.platform ? ` · ${s.platform}` : ""} · {formatDate(s.startedAt)}
                        {s.durationSec ? ` · ${Math.round(s.durationSec / 60)} min` : ""}
                      </p>
                    </div>
                    <Badge variant={s.status === "COMPLETED" ? "success" : "secondary"}>{s.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan + credits */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#0F172A]">Current Plan</p>
              <span className="rounded-full bg-[#2563EB] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                {data.credits.plan} Plan
              </span>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Available Credits
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums text-[#0F172A]">
                {data.credits.remaining.toLocaleString()}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                / {data.credits.allocation > 0 ? data.credits.allocation.toLocaleString() : "∞"} Credits
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">1 Credit = 30 Minutes</p>
            <p className="mt-2 text-sm font-semibold text-[#2563EB]">
              Approx. {(data.credits.remaining * 30).toLocaleString()} Minutes Remaining
            </p>

            {data.credits.allocation > 0 ? (
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6]"
                  style={{ width: `${Math.min(100, (data.credits.remaining / data.credits.allocation) * 100)}%` }}
                />
              </div>
            ) : null}

            <Button className="mt-5 w-full" asChild>
              <Link to="/dashboard/billing">Upgrade Plan</Link>
            </Button>

            {data.credits.plan !== "FREE" ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {data.credits.used.toLocaleString()} credits used this cycle
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Resume library */}
        <Card>
          <CardContent className="p-6">
            <Header title="Resume Library" to="/dashboard/resume" />
            {data.resumes.length === 0 ? (
              <Empty icon={FileText} text="No resumes uploaded yet." />
            ) : (
              <div className="mt-2 space-y-2">
                {data.resumes.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-[#0F172A]">{r.fileName}</span>
                    {typeof r.atsScore === "number" ? (
                      <span className="ml-2 flex-none text-xs font-semibold text-[#10B981]">ATS {r.atsScore}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardContent className="p-6">
            <Header title="Documents" to="/dashboard/job-descriptions" />
            {data.documents.length === 0 ? (
              <Empty icon={FolderOpen} text="No documents yet." />
            ) : (
              <div className="mt-2 space-y-2">
                {data.documents.map((d) => (
                  <div key={d.id} className="rounded-lg bg-[#F8FAFC] px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-[#0F172A]">{d.title}</p>
                    {d.company ? <p className="text-xs text-muted-foreground">{d.company}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardContent className="p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
              <Activity className="h-4 w-4 text-[#2563EB]" /> Recent activity
            </p>
            {data.activity.length === 0 ? (
              <Empty icon={Clock} text="No activity yet." />
            ) : (
              <div className="mt-3 space-y-3">
                {data.activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{labelFor(a.actionType)}</span>
                    <span className={a.direction === "CREDIT" ? "font-medium text-[#10B981]" : "font-medium text-[#475569]"}>
                      {a.direction === "CREDIT" ? "+" : "−"}
                      {a.creditsUsed}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Header({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
      <Link to={to} className="flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline">
        View all <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Mic; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="h-7 w-7 text-[#CBD5E1]" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function labelFor(action: string): string {
  const map: Record<string, string> = {
    SIGNUP_BONUS: "Signup bonus",
    SESSION_USAGE: "Interview session",
    LIVE_SESSION: "Interview session",
    PURCHASE: "Credit purchase",
    SUBSCRIPTION_ALLOCATION: "Plan credits",
    ADMIN_ADJUSTMENT: "Account adjustment",
    RESUME_ANALYSIS: "Resume analysis",
    JD_ANALYSIS: "Job description analysis",
    MOCK_INTERVIEW: "Mock interview",
    TRIAL_TOPUP: "Trial credit top-up",
    INTERVIEW_SUMMARY: "Interview summary",
    SCREEN_ANALYSIS: "Screen analysis",
    COACHING_REPORT: "Coaching report",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
