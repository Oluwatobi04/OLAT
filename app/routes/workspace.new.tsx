import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Mic, Settings2, Cable } from "lucide-react";
import { getNewSessionDataFn, createWorkspaceSessionFn } from "~/server/workspace";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Logo } from "~/components/brand/logo";

export const Route = createFileRoute("/workspace/new")({
  loader: () => getNewSessionDataFn(),
  component: NewSessionFlow,
});

const STEPS = [
  { n: 1, label: "Interview info", icon: Mic },
  { n: 2, label: "AI settings", icon: Settings2 },
  { n: 3, label: "Connect sources", icon: Cable },
] as const;

function NewSessionFlow() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    role: "",
    company: "",
    industry: "",
    jobDescription: "",
    resumeId: "",
    notes: "",
    language: "en",
    model: "claude" as "claude" | "gpt" | "gemini",
    responseStyle: "concise" as "concise" | "balanced" | "detailed",
    mic: true,
    tabAudio: true,
    screen: false,
  });
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function start() {
    if (!form.role.trim() || !form.industry.trim()) {
      toast.error("Role and industry are required");
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const res = await createWorkspaceSessionFn({
        data: {
          role: form.role.trim(),
          company: form.company.trim() || undefined,
          industry: form.industry.trim(),
          jobDescription: form.jobDescription.trim() || undefined,
          resumeId: form.resumeId || undefined,
          notes: form.notes.trim() || undefined,
          language: form.language,
          model: form.model,
          responseStyle: form.responseStyle,
        },
      });
      if (!res.ok) {
        toast.error(
          res.error === "INSUFFICIENT_CREDITS"
            ? "Not enough credits to start a session."
            : res.error === "DEEPGRAM_NOT_CONFIGURED"
              ? "Transcription isn't configured."
              : res.error,
        );
        return;
      }
      await router.navigate({ to: "/workspace/$sessionId", params: { sessionId: res.sessionId } });
    } catch {
      toast.error("Could not start session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
        <Link to="/dashboard" className="flex items-center">
          <Logo height={28} />
        </Link>
        <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Stepper */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div
                className={
                  "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors " +
                  (step >= s.n ? "bg-[#DBEAFE] text-[#2563EB]" : "bg-white text-muted-foreground ring-1 ring-border")
                }
              >
                {step > s.n ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 ? <div className="mx-1 h-px w-6 bg-border" /> : null}
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-[20px] border border-border bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-8"
        >
          {step === 1 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#0F172A]">Interview information</h2>
              <p className="text-sm text-muted-foreground">Works for any profession. Be specific.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role *"><Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Registered Nurse" /></Field>
                <Field label="Company"><Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Mayo Clinic" /></Field>
                <Field label="Industry *"><Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Healthcare" /></Field>
                <Field label="Resume">
                  <select
                    value={form.resumeId}
                    onChange={(e) => set("resumeId", e.target.value)}
                    className="flex h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                  >
                    <option value="">None</option>
                    {data.resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Job description"><textarea value={form.jobDescription} onChange={(e) => set("jobDescription", e.target.value)} rows={4} className="w-full rounded-xl border border-border bg-white p-3 text-sm" placeholder="Paste the job description (optional)" /></Field>
              <Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-white p-3 text-sm" placeholder="Anything you want OLat5 to keep in mind" /></Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-[#0F172A]">AI settings</h2>
              <Field label="Language">
                <select value={form.language} onChange={(e) => set("language", e.target.value)} className="flex h-11 w-full rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </Field>
              <Field label="Model">
                <div className="grid grid-cols-3 gap-2">
                  {(["claude", "gpt", "gemini"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => set("model", m)}
                      className={"rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors " + (form.model === m ? "border-[#2563EB] bg-[#DBEAFE] text-[#2563EB]" : "border-border bg-white text-muted-foreground hover:bg-[#F8FAFC]")}>
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Response style">
                <div className="grid grid-cols-3 gap-2">
                  {(["concise", "balanced", "detailed"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => set("responseStyle", s)}
                      className={"rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors " + (form.responseStyle === s ? "border-[#2563EB] bg-[#DBEAFE] text-[#2563EB]" : "border-border bg-white text-muted-foreground hover:bg-[#F8FAFC]")}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#0F172A]">Connect sources</h2>
              <p className="text-sm text-muted-foreground">Choose what OLat5 listens to. You can change this in the workspace.</p>
              {[
                { k: "mic", title: "Microphone", desc: "Your voice" },
                { k: "tabAudio", title: "Tab / meeting audio", desc: "The interviewer's voice via screen share with audio" },
                { k: "screen", title: "Screen share", desc: "For the Analyze Screen feature" },
              ].map((src) => (
                <label key={src.k} className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-white p-4">
                  <div>
                    <p className="text-sm font-medium text-[#0F172A]">{src.title}</p>
                    <p className="text-xs text-muted-foreground">{src.desc}</p>
                  </div>
                  <input type="checkbox" checked={form[src.k as keyof typeof form] as boolean} onChange={(e) => set(src.k as keyof typeof form, e.target.checked)} className="h-5 w-5 accent-[#2563EB]" />
                </label>
              ))}
              {!data.deepgramReady || !data.aiReady ? (
                <p className="rounded-xl bg-[#FEF2F2] p-3 text-xs text-[#EF4444]">Some services aren't configured; live help may be limited.</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => Math.min(3, s + 1))}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Start session"} <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
        </motion.div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{data.credits.remaining.toLocaleString()} credits available · 1 credit = 30 minutes</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
