import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Play } from "lucide-react";
import {
  listMockInterviewsFn,
  startMockInterviewFn,
  submitMockInterviewFn,
} from "~/server/mock";
import { listJobDescriptionsFn } from "~/server/jobdesc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { formatDate, friendlyError } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/mock")({
  loader: async () => {
    const [mocks, jds] = await Promise.all([listMockInterviewsFn(), listJobDescriptionsFn()]);
    return { mocks, jds };
  },
  component: MockPage,
});

interface MockQuestion {
  question: string;
  type: string;
}

function MockPage() {
  const { mocks, jds } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; questions: MockQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await startMockInterviewFn({
        data: {
          role: String(form.get("role") ?? "") || undefined,
          jobDescriptionId: (String(form.get("jdId") ?? "") || undefined) as string | undefined,
        },
      });
      if (!res.ok) {
        toast.error(friendlyError(res.error));
        return;
      }
      setActive({ id: res.id, questions: res.questions });
      setAnswers({});
      toast.success("Mock interview started (−3 credits)");
    } catch {
      toast.error("Could not start");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active) return;
    const responses = active.questions.map((q, i) => ({
      question: q.question,
      answer: answers[i] ?? "",
    }));
    if (responses.some((r) => r.answer.trim().length < 2)) {
      toast.error("Answer every question before submitting");
      return;
    }
    setBusy(true);
    try {
      const res = await submitMockInterviewFn({ data: { id: active.id, responses } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Interview evaluated");
      setActive(null);
      setAnswers({});
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mock Interview</h1>
          <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
        </div>
        <div className="space-y-4">
          {active.questions.map((q, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">
                  Q{i + 1}. {q.question}
                </CardTitle>
                <CardDescription>{q.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  rows={4}
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  placeholder="Type your answer..."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </CardContent>
            </Card>
          ))}
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? "Evaluating..." : "Submit for evaluation"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mock Interviews</h1>
        <p className="text-sm text-muted-foreground">
          Practice with AI-generated questions and get scored feedback. Costs 3 credits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start a mock interview</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={start}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="role">Target role</Label>
              <Input id="role" name="role" placeholder="Senior Backend Engineer" />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="jdId">Job description (optional)</Label>
              <select id="jdId" name="jdId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">None</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              <Play className="h-4 w-4" /> Start
            </Button>
          </form>
        </CardContent>
      </Card>

      {mocks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessagesSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No mock interviews yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mocks.map((m) => (
            <Card key={m.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Mock · {formatDate(m.createdAt)}</CardTitle>
                <Badge variant={m.status === "COMPLETED" ? "success" : "secondary"}>{m.status}</Badge>
              </CardHeader>
              {m.status === "COMPLETED" ? (
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Score label="Communication" value={m.communicationScore ?? 0} />
                    <Score label="Confidence" value={m.confidenceScore ?? 0} />
                    <Score label="Technical" value={m.technicalScore ?? 0} />
                    <Score label="Readiness" value={m.readinessScore ?? 0} />
                  </div>
                  {Array.isArray(m.suggestions) && m.suggestions.length ? (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {(m.suggestions as string[]).map((s, i) => (
                        <li key={i} className="flex gap-2"><span className="text-primary">•</span>{s}</li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <Progress value={value} indicatorClassName={value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-destructive"} />
    </div>
  );
}
