import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Mic,
  Search,
  Trash2,
  ChevronDown,
  FileText,
  Sparkles,
  Download,
  Clock,
  Coins,
  Plus,
} from "lucide-react";
import {
  listSessionsFn,
  getSessionDetailFn,
  generateSessionSummaryFn,
  deleteSessionFn,
} from "~/server/sessions";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/sessions")({
  loader: () => listSessionsFn(),
  component: SessionsPage,
});

type SessionRow = Awaited<ReturnType<typeof listSessionsFn>>[number];
type Detail = NonNullable<Awaited<ReturnType<typeof getSessionDetailFn>>>;

const STATUSES = ["ALL", "LIVE", "COMPLETED", "PROCESSING", "FAILED"] as const;

function fmtDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min` : `${s}s`;
}

function speakerLabel(role: string | null, speaker: string | null, confidence: number | null): string {
  if (role === "SELF") return "You";
  if (typeof confidence === "number" && confidence >= 0.8) return "Interviewer";
  return speaker ? speaker.replace(/Speaker (\d+)/, (_, n) => `Speaker ${String.fromCharCode(64 + Number(n))}`) : "Speaker A";
}

function SessionsPage() {
  const sessions = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail | "loading">>({});
  const [working, setWorking] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesQ = !q || (s.title ?? "").toLowerCase().includes(q) || (s.platform ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "ALL" || s.status === status;
      return matchesQ && matchesStatus;
    });
  }, [sessions, query, status]);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!details[id]) {
      setDetails((d) => ({ ...d, [id]: "loading" }));
      const detail = await getSessionDetailFn({ data: { id } }).catch(() => null);
      setDetails((d) => ({ ...d, [id]: detail ?? "loading" }));
    }
  }

  async function summarize(id: string) {
    setWorking(`sum:${id}`);
    try {
      const res = await generateSessionSummaryFn({ data: { id } });
      if (!res.ok) {
        toast.error(
          res.error === "AI_NOT_CONFIGURED"
            ? "AI isn't configured yet."
            : res.error === "INSUFFICIENT_CREDITS"
              ? "Out of credits."
              : res.error,
        );
        return;
      }
      toast.success("Summary ready");
      // refresh the cached detail + the row's hasSummary flag
      setDetails((d) => {
        const cur = d[id];
        if (cur && cur !== "loading") return { ...d, [id]: { ...cur, session: { ...cur.session, summary: res.summary } } };
        return d;
      });
      await router.invalidate();
    } finally {
      setWorking(null);
    }
  }

  async function remove(id: string) {
    setWorking(`del:${id}`);
    try {
      const res = await deleteSessionFn({ data: { id } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Session deleted");
      if (expanded === id) setExpanded(null);
      await router.invalidate();
    } finally {
      setWorking(null);
    }
  }

  function exportSession(row: SessionRow) {
    const d = details[row.id];
    if (!d || d === "loading") {
      toast.message("Open the session first to export it.");
      return;
    }
    const lines = [
      `# ${d.session.title ?? "Interview session"}`,
      "",
      `Date: ${formatDate(d.session.startedAt)}`,
      `Duration: ${fmtDuration(d.session.durationSec)}`,
      `Credits used: ${d.creditsUsed}`,
      "",
    ];
    if (d.session.summary) lines.push("## Summary", "", d.session.summary, "");
    lines.push("## Transcript", "");
    if (d.transcripts.length === 0) lines.push("(no transcript)");
    for (const t of d.transcripts) {
      lines.push(`**${speakerLabel(t.speakerRole, t.speaker, t.confidence)}:** ${t.text}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.session.title ?? "session").replace(/[^\w.-]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Interview Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Your interviews and meetings, transcribed and summarized.
          </p>
        </div>
        {/* Canonical session-start: same path as Home → /workspace/new */}
        <Button asChild>
          <Link to="/workspace/new">
            <Plus className="h-4 w-4" /> Start Session
          </Link>
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#2563EB]">
              <Mic className="h-7 w-7" />
            </span>
            <div>
              <p className="text-base font-semibold text-[#0F172A]">No sessions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your transcribed sessions will show up here.</p>
            </div>
            <Button asChild>
              <Link to="/workspace/new">
                <Mic className="h-4 w-4" /> Start your first interview
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search + filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                    (status === s ? "bg-[#2563EB] text-white" : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]")
                  }
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">No sessions match your filters.</p>
              ) : (
                <div className="divide-y">
                  {filtered.map((s) => {
                    const open = expanded === s.id;
                    const detail = details[s.id];
                    return (
                      <div key={s.id}>
                        <div className="flex items-center gap-4 p-4">
                          <button onClick={() => toggle(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <ChevronDown
                              className={"h-4 w-4 flex-none text-muted-foreground transition-transform " + (open ? "rotate-180" : "")}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#0F172A]">{s.title ?? "Untitled session"}</p>
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                <span>{s.mode}</span>
                                {s.platform ? <span>· {s.platform}</span> : null}
                                <span>· {formatDate(s.startedAt)}</span>
                                <span className="inline-flex items-center gap-1">· <Clock className="h-3 w-3" /> {fmtDuration(s.durationSec)}</span>
                                <span className="inline-flex items-center gap-1">· <Coins className="h-3 w-3" /> {s.creditsUsed}</span>
                              </p>
                            </div>
                          </button>
                          <div className="flex flex-none items-center gap-2">
                            <Badge variant={s.transcriptCount > 0 ? "success" : "secondary"}>
                              {s.transcriptCount > 0 ? "Transcript" : "No transcript"}
                            </Badge>
                            <Badge variant={s.hasSummary ? "success" : "outline"}>
                              {s.hasSummary ? "Summary" : "No summary"}
                            </Badge>
                            <Badge variant={s.status === "COMPLETED" ? "success" : "secondary"}>{s.status}</Badge>
                          </div>
                        </div>

                        {open ? (
                          <div className="border-t border-border bg-[#F8FAFC] p-4">
                            {detail === "loading" || !detail ? (
                              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => summarize(s.id)}
                                    disabled={working === `sum:${s.id}` || detail.transcripts.length === 0}
                                  >
                                    <Sparkles className="h-4 w-4" />
                                    {working === `sum:${s.id}` ? "Summarizing…" : detail.session.summary ? "Regenerate summary" : "Generate summary"}
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => exportSession(s)}>
                                    <Download className="h-4 w-4" /> Export
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => remove(s.id)}
                                    disabled={working === `del:${s.id}`}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete
                                  </Button>
                                </div>

                                {detail.session.summary ? (
                                  <div className="rounded-xl border border-[#BFDBFE] bg-white p-4">
                                    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#2563EB]">
                                      <Sparkles className="h-3.5 w-3.5" /> AI summary
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#334155]">{detail.session.summary}</p>
                                  </div>
                                ) : null}

                                <div className="rounded-xl border border-border bg-white p-4">
                                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    <FileText className="h-3.5 w-3.5" /> Transcript
                                  </p>
                                  {detail.transcripts.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No transcript was captured for this session.</p>
                                  ) : (
                                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                                      {detail.transcripts.map((t) => (
                                        <p key={t.id} className="text-sm leading-relaxed">
                                          <span className={t.speakerRole === "SELF" ? "font-semibold text-[#2563EB]" : "font-semibold text-[#0F172A]"}>
                                            {speakerLabel(t.speakerRole, t.speaker, t.confidence)}:
                                          </span>{" "}
                                          <span className="text-[#475569]">{t.text}</span>
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
