import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, Trash2 } from "lucide-react";
import {
  listJobDescriptionsFn,
  analyzeJobDescriptionFn,
  deleteJobDescriptionFn,
} from "~/server/jobdesc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { formatDate, friendlyError } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/job-descriptions")({
  loader: () => listJobDescriptionsFn(),
  component: JobDescPage,
});

interface JDAnalysis {
  requiredSkills?: string[];
  responsibilities?: string[];
  keywords?: string[];
}

function JobDescPage() {
  const jds = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await analyzeJobDescriptionFn({
        data: {
          title: String(form.get("title") ?? ""),
          company: String(form.get("company") ?? "") || undefined,
          content: String(form.get("content") ?? ""),
        },
      });
      if (!res.ok) {
        toast.error(friendlyError(res.error));
        return;
      }
      toast.success("Job description analyzed (−1 credit)");
      (e.target as HTMLFormElement).reset();
      await router.invalidate();
    } catch {
      toast.error("Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteJobDescriptionFn({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Description Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Extract required skills, responsibilities, and keywords. Costs 1 credit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a job description</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Job title</Label>
                <Input id="title" name="title" required placeholder="Senior Frontend Engineer" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" placeholder="Acme Inc." />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Description</Label>
              <textarea
                id="content"
                name="content"
                required
                rows={6}
                placeholder="Paste the full job description here..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Analyzing..." : "Analyze"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {jds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No job descriptions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jds.map((jd) => {
            const a = (jd.analysis ?? {}) as JDAnalysis;
            return (
              <Card key={jd.id}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{jd.title}</CardTitle>
                    <CardDescription>
                      {jd.company ? `${jd.company} · ` : ""}
                      {formatDate(jd.createdAt)}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(jd.id)} disabled={busy} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {typeof jd.skillMatchPct === "number" ? (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Skill match</span>
                        <span className="font-semibold">{jd.skillMatchPct}%</span>
                      </div>
                      <Progress value={jd.skillMatchPct} />
                    </div>
                  ) : null}
                  {a.requiredSkills?.length ? (
                    <div>
                      <p className="mb-1 text-sm font-medium">Required skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.requiredSkills.map((s, i) => (
                          <Badge key={i} variant="secondary">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {a.keywords?.length ? (
                    <div>
                      <p className="mb-1 text-sm font-medium">Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.keywords.map((s, i) => (
                          <Badge key={i} variant="outline">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {a.responsibilities?.length ? (
                    <div>
                      <p className="mb-1 text-sm font-medium">Key responsibilities</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {a.responsibilities.map((s, i) => (
                          <li key={i} className="flex gap-2"><span className="text-primary">•</span>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
