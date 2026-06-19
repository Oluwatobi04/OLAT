import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload, Trash2 } from "lucide-react";
import { listResumesFn, analyzeResumeFn, deleteResumeFn } from "~/server/resume";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/resume")({
  loader: () => listResumesFn(),
  component: ResumePage,
});

interface ResumeAnalysis {
  strengths?: string[];
  weaknesses?: string[];
  missingSkills?: string[];
  atsRecommendations?: string[];
  improvementSuggestions?: string[];
}

function ResumePage() {
  const resumes = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a PDF or DOCX file");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      const res = await analyzeResumeFn({ data: fd });
      if (!res.ok) {
        toast.error(res.error === "INSUFFICIENT_CREDITS" ? "Not enough credits (need 1)" : res.error);
        return;
      }
      toast.success("Resume analyzed (−1 credit)");
      if (fileRef.current) fileRef.current.value = "";
      await router.invalidate();
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteResumeFn({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resume Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Upload a resume (PDF or DOCX) for an ATS score and AI feedback. Costs 1 credit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload resume
          </CardTitle>
          <CardDescription>PDF or DOCX, up to 10MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={onUpload}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Analyzing..." : "Analyze"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {resumes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No resumes analyzed yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {resumes.map((r) => {
            const analysis = (r.analysis ?? {}) as ResumeAnalysis;
            return (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{r.fileName}</CardTitle>
                    <CardDescription>{formatDate(r.createdAt)}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.fileUrl ? (
                      <a href={r.fileUrl} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">View file</Button>
                      </a>
                    ) : null}
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)} disabled={busy} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ScoreBar label="Resume score" value={r.resumeScore ?? 0} />
                    <ScoreBar label="ATS score" value={r.atsScore ?? 0} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Bullets title="Strengths" items={analysis.strengths} tone="good" />
                    <Bullets title="Weaknesses" items={analysis.weaknesses} tone="bad" />
                    <Bullets title="Missing skills" items={analysis.missingSkills} tone="bad" />
                    <Bullets title="ATS recommendations" items={analysis.atsRecommendations} />
                  </div>
                  {analysis.improvementSuggestions?.length ? (
                    <Bullets title="Improvement suggestions" items={analysis.improvementSuggestions} />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Need more credits? <Link to="/dashboard/credits" className="underline">View credits</Link>
      </p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}/100</span>
      </div>
      <Progress
        value={value}
        indicatorClassName={value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-destructive"}
      />
    </div>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone?: "good" | "bad";
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={
                tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : "text-primary"
              }
            >
              •
            </span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
