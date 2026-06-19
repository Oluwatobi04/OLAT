import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Sparkles } from "lucide-react";
import {
  listInterviewPrepFn,
  generateQuestionsFn,
  generateAnswersFn,
} from "~/server/interviewprep";
import { listResumesFn } from "~/server/resume";
import { listJobDescriptionsFn } from "~/server/jobdesc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { formatDate, friendlyError } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/interview-prep")({
  loader: async () => {
    const [preps, resumes, jds] = await Promise.all([
      listInterviewPrepFn(),
      listResumesFn(),
      listJobDescriptionsFn(),
    ]);
    return { preps, resumes, jds };
  },
  component: InterviewPrepPage,
});

interface Question {
  question: string;
  category?: string;
}
interface SuggestedAnswer {
  question: string;
  starAnswer?: string;
  technicalGuide?: string;
  talkingPoints?: string[];
}

function InterviewPrepPage() {
  const { preps, resumes, jds } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await generateQuestionsFn({
        data: {
          resumeId: (String(form.get("resumeId") ?? "") || undefined) as string | undefined,
          jobDescriptionId: (String(form.get("jdId") ?? "") || undefined) as string | undefined,
        },
      });
      if (!res.ok) {
        toast.error(friendlyError(res.error));
        return;
      }
      toast.success("Questions generated (−1 credit)");
      await router.invalidate();
    } catch {
      toast.error("Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function answers(prepId: string) {
    setBusy(true);
    try {
      const res = await generateAnswersFn({ data: { prepId } });
      if (!res.ok) {
        toast.error(friendlyError(res.error));
        return;
      }
      toast.success("Suggested answers generated (−1 credit)");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interview Prep</h1>
        <p className="text-sm text-muted-foreground">
          Generate tailored questions and model answers from your resume and a job description.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate questions</CardTitle>
          <CardDescription>Costs 1 credit. Suggested answers cost 1 more.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={generate}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="resumeId">Resume (optional)</Label>
              <select id="resumeId" name="resumeId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">None</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.fileName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="jdId">Job description (optional)</Label>
              <select id="jdId" name="jdId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">None</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}{j.company ? ` · ${j.company}` : ""}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              <Sparkles className="h-4 w-4" /> Generate
            </Button>
          </form>
        </CardContent>
      </Card>

      {preps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No prep sets yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {preps.map((p) => {
            const behavioral = (p.behavioralQuestions as Question[] | null) ?? [];
            const technical = (p.technicalQuestions as Question[] | null) ?? [];
            const company = (p.companyQuestions as Question[] | null) ?? [];
            const sugg = (p.suggestedAnswers as SuggestedAnswer[] | null) ?? [];
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Prep · {formatDate(p.createdAt)}</CardTitle>
                  {sugg.length === 0 ? (
                    <Button size="sm" variant="outline" onClick={() => answers(p.id)} disabled={busy}>
                      Generate answers (−1)
                    </Button>
                  ) : (
                    <Badge variant="success">Answers ready</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="behavioral">
                    <TabsList>
                      <TabsTrigger value="behavioral">Behavioral ({behavioral.length})</TabsTrigger>
                      <TabsTrigger value="technical">Technical ({technical.length})</TabsTrigger>
                      <TabsTrigger value="company">Company ({company.length})</TabsTrigger>
                      {sugg.length ? <TabsTrigger value="answers">Answers ({sugg.length})</TabsTrigger> : null}
                    </TabsList>
                    <TabsContent value="behavioral"><QList items={behavioral} /></TabsContent>
                    <TabsContent value="technical"><QList items={technical} /></TabsContent>
                    <TabsContent value="company"><QList items={company} /></TabsContent>
                    {sugg.length ? (
                      <TabsContent value="answers">
                        <div className="space-y-4">
                          {sugg.map((a, i) => (
                            <div key={i} className="rounded-md border p-3">
                              <p className="font-medium">{a.question}</p>
                              {a.starAnswer ? <p className="mt-1 text-sm text-muted-foreground"><strong>STAR:</strong> {a.starAnswer}</p> : null}
                              {a.technicalGuide ? <p className="mt-1 text-sm text-muted-foreground"><strong>Guide:</strong> {a.technicalGuide}</p> : null}
                              {a.talkingPoints?.length ? (
                                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                  {a.talkingPoints.map((t, j) => <li key={j} className="flex gap-2"><span className="text-primary">•</span>{t}</li>)}
                                </ul>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    ) : null}
                  </Tabs>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QList({ items }: { items: { question: string; category?: string }[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <ol className="space-y-2">
      {items.map((q, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="font-medium text-muted-foreground">{i + 1}.</span>
          <span>{q.question}{q.category ? <Badge variant="outline" className="ml-2">{q.category}</Badge> : null}</span>
        </li>
      ))}
    </ol>
  );
}
