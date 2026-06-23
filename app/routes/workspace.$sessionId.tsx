import { createFileRoute, useRouter, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  MonitorUp,
  Monitor,
  ScanLine,
  Square,
  Sparkles,
  CircleDot,
  PauseCircle,
  Wifi,
  WifiOff,
  Copy,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  getWorkspaceFn,
  transcribeChunkFn,
  suggestFn,
  analyzeScreenFn,
  endWorkspaceFn,
} from "~/server/workspace";
import { Button } from "~/components/ui/button";
import { FalconMark } from "~/components/brand/logo";

export const Route = createFileRoute("/workspace/$sessionId")({
  loader: async ({ params }) => {
    const data = await getWorkspaceFn({ data: { sessionId: params.sessionId } });
    if (!data) throw redirect({ to: "/dashboard" });
    return data;
  },
  component: Workspace,
});

interface Segment {
  speaker: string;
  speakerRole: string;
  text: string;
  isQuestion?: boolean;
  confidence?: number;
  tMs?: number;
}
interface Suggestion {
  suggestedAnswer: string;
  talkingPoints: string[];
  exampleAnswer: string;
  technicalGuidance: string;
  quickTip: string;
}
type SourceMode = "hybrid" | "auto" | "manual";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function fmtClock(ms?: number): string {
  if (typeof ms !== "number") return "";
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Speaker label: "You" for the user, "Interviewer" when diarization is
// confident, "Speaker A/B…" as a softer fallback when it isn't.
function speakerLabel(s: Segment): string {
  if (s.speakerRole === "SELF") return "You";
  if (typeof s.confidence === "number" && s.confidence >= 0.8) return "Interviewer";
  const m = /Speaker (\d+)/.exec(s.speaker || "");
  return m ? `Speaker ${String.fromCharCode(64 + Number(m[1]))}` : "Speaker A";
}

function suggestionToText(s: Suggestion): string {
  const parts: string[] = [s.suggestedAnswer];
  if (s.talkingPoints?.length) parts.push("\nTalking points:\n" + s.talkingPoints.map((p) => `• ${p}`).join("\n"));
  if (s.exampleAnswer) parts.push("\nExample answer:\n" + s.exampleAnswer);
  if (s.technicalGuidance) parts.push("\nGuidance:\n" + s.technicalGuidance);
  if (s.quickTip) parts.push("\nTip: " + s.quickTip);
  return parts.join("\n");
}

function Workspace() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const sessionId = data.session.id;

  const [segments, setSegments] = useState<Segment[]>(
    data.transcripts.map((t) => ({
      speaker: t.speaker ?? "Speaker",
      speakerRole: t.speakerRole ?? "OTHER",
      text: t.text,
      confidence: t.confidence ?? undefined,
      tMs: t.startMs,
    })),
  );
  const [question, setQuestion] = useState<string>("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [thinking, setThinking] = useState(false);
  const [screenGuidance, setScreenGuidance] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "paused">("idle");
  const [credits, setCredits] = useState<number>(data.creditsRemaining);
  const [elapsed, setElapsed] = useState(0);
  const [sources, setSources] = useState({ tab: false, mic: false, screen: false });
  const [mode, setMode] = useState<SourceMode>("hybrid");

  const displayStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const recorders = useRef<MediaRecorder[]>([]);
  const capturing = useRef(false);
  const pausedRef = useRef(false);
  const videoEl = useRef<HTMLVideoElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const lastSuggestAt = useRef(0);
  const elapsedRef = useRef(0);
  const modeRef = useRef<SourceMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // session timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => {
      elapsedRef.current = e + 1;
      return e + 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  // keep transcript scrolled to the latest line
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments]);

  const requestSuggestion = useCallback(
    async (q: string, force = false) => {
      const text = q.trim();
      if (!text) return;
      const now = Date.now();
      if (!force && now - lastSuggestAt.current < 3500) return;
      lastSuggestAt.current = now;
      setQuestion(text);
      setThinking(true);
      try {
        const transcript = segments.slice(-12).map((s) => `${speakerLabel(s)}: ${s.text}`).join("\n");
        const res = await suggestFn({ data: { sessionId, question: text, transcript } });
        if (res.ok) {
          setSuggestion(res.suggestion);
          if (typeof res.creditsRemaining === "number") setCredits(res.creditsRemaining);
        } else {
          toast.error(res.error === "INSUFFICIENT_CREDITS" ? "Out of credits" : "Could not generate a suggestion");
        }
      } finally {
        setThinking(false);
      }
    },
    [segments, sessionId],
  );

  // Apply a detected question according to the active question-source mode.
  const handleDetected = useCallback(
    (text: string) => {
      const m = modeRef.current;
      if (m === "manual") return; // user-driven only
      // Hybrid: surface it for review/edit. Auto: also generate immediately.
      setQuestion(text);
      if (m === "auto") requestSuggestion(text);
    },
    [requestSuggestion],
  );

  // Pipe a stream's audio to the transcription endpoint. Provider-agnostic:
  // works for any tab's audio or the microphone.
  //
  // We record in short, SELF-CONTAINED clips: every start()/stop() cycle emits a
  // COMPLETE WebM file (with the header/init segment) that Deepgram's prerecorded
  // API can decode.
  const startRecorder = useCallback(
    (stream: MediaStream, speakerRole: "SELF" | "OTHER"): boolean => {
      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) return false;
      const audioOnly = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recordClip = () => {
        if (!capturing.current) return;
        let rec: MediaRecorder;
        try {
          rec = new MediaRecorder(audioOnly, { mimeType });
        } catch {
          return;
        }
        const parts: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) parts.push(e.data);
        };
        rec.onstop = async () => {
          recorders.current = recorders.current.filter((r) => r !== rec);
          const blob = new Blob(parts, { type: "audio/webm" });
          if (blob.size > 1500 && !pausedRef.current) {
            const audioBase64 = await blobToBase64(blob);
            if (audioBase64) {
              try {
                const res = await transcribeChunkFn({
                  data: { sessionId, audioBase64, mimetype: "audio/webm", speakerRole },
                });
                if (res.ok && res.segments.length) {
                  const tagged: Segment[] = res.segments.map((s) => ({ ...s, tMs: elapsedRef.current * 1000 }));
                  setSegments((prev) => [...prev, ...tagged]);
                  // Only the OTHER party's completed questions drive generation.
                  const q = tagged.find((s) => s.isQuestion && s.speakerRole === "OTHER");
                  if (q) handleDetected(q.text);
                }
              } catch {
                /* skip this clip */
              }
            }
          }
          if (capturing.current) recordClip();
        };
        recorders.current.push(rec);
        rec.start();
        window.setTimeout(() => {
          try {
            if (rec.state !== "inactive") rec.stop();
          } catch {
            /* noop */
          }
        }, 6000);
      };

      recordClip();
      return true;
    },
    [sessionId, handleDetected],
  );

  async function connect() {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      displayStream.current = display;
      if (videoEl.current) videoEl.current.srcObject = display;

      capturing.current = true;
      pausedRef.current = false;

      const tabAudio = startRecorder(display, "OTHER");
      const hasScreen = display.getVideoTracks().length > 0;

      let mic = false;
      try {
        const micStreamLocal = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.current = micStreamLocal;
        mic = startRecorder(micStreamLocal, "SELF");
      } catch {
        /* mic optional */
      }

      setSources({ tab: tabAudio, mic, screen: hasScreen });

      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        cleanup();
        setStatus("idle");
        setSources({ tab: false, mic: false, screen: false });
        toast.message("Screen sharing stopped");
      });

      if (tabAudio || mic) {
        setStatus("listening");
        toast.success(
          tabAudio
            ? "Connected. OLat5 is listening to the meeting"
            : "Listening to your mic. Tip: re-share and enable tab audio to hear the interviewer.",
        );
      } else {
        toast.error("No audio captured. Re-share and tick \"Share tab audio\" in the picker.");
      }
    } catch {
      toast.error("Couldn't start capture. Pick your meeting tab and allow sharing.");
    }
  }

  function togglePause() {
    if (status === "listening") {
      pausedRef.current = true;
      setStatus("paused");
    } else if (status === "paused") {
      pausedRef.current = false;
      setStatus("listening");
    }
  }

  const cleanup = useCallback(() => {
    capturing.current = false;
    recorders.current.forEach((r) => {
      try {
        if (r.state !== "inactive") r.stop();
      } catch {
        /* noop */
      }
    });
    recorders.current = [];
    displayStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  async function analyzeScreen() {
    const video = videoEl.current;
    if (!video || !displayStream.current) {
      toast.error("Connect screen share first");
      return;
    }
    setAnalyzing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.7);
      const res = await analyzeScreenFn({ data: { sessionId, imageBase64 } });
      if (res.ok) {
        setScreenGuidance(res.guidance);
        if (typeof res.creditsRemaining === "number") setCredits(res.creditsRemaining);
      } else {
        toast.error(res.error === "INSUFFICIENT_CREDITS" ? "Out of credits" : "Screen analysis failed");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function generateAnswer() {
    const fallback = [...segments].reverse().find((s) => s.speakerRole === "OTHER");
    requestSuggestion(question || fallback?.text || "Tell me about yourself.", true);
  }

  async function copyAnswer() {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestionToText(suggestion));
      toast.success("Answer copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function endSession() {
    cleanup();
    await endWorkspaceFn({ data: { sessionId, durationSec: elapsed } }).catch(() => {});
    toast.success("Session ended");
    await router.navigate({ to: "/dashboard/sessions" });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex h-screen flex-col bg-[#F8FAFC]">
      {/* Top toolbar */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-white px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <FalconMark size={24} className="rounded-md" />
          <span className="hidden max-w-[220px] truncate text-sm font-semibold text-foreground sm:inline">
            {data.session.title ?? "Live session"}
          </span>
        </Link>

        <span
          className={
            "ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
            (status === "listening" ? "bg-[#DCFCE7] text-[#10B981]" : status === "paused" ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#F1F5F9] text-[#475569]")
          }
        >
          {status === "listening" ? <CircleDot className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
          {status === "listening" ? "Listening" : status === "paused" ? "Paused" : "Not started"}
        </span>

        <span className="ml-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-border">
          {mm}:{ss}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {status === "idle" ? (
            <Button size="sm" onClick={connect}><MonitorUp className="h-4 w-4" /> Connect</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={togglePause}>
              {status === "paused" ? "Resume" : "Pause"}
            </Button>
          )}
          <span className="rounded-full bg-[#DBEAFE] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#2563EB]">
            {credits.toLocaleString()} credits
          </span>
          <Button size="sm" variant="destructive" onClick={endSession}>
            <Square className="h-3.5 w-3.5" /> End
          </Button>
        </div>
      </header>

      {/* Body grid. Desktop: [screen | AI] row, then Question, then Transcript.
          Tablet: stacked screen→AI→question→transcript.
          Mobile: transcript first, AI second. */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[40%_1fr] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:overflow-hidden">
        {/* ── SCREEN (reduced width) ── */}
        <section className="order-4 flex flex-col gap-3 md:order-1 lg:order-none lg:col-start-1 lg:row-start-1">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0B1220] shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
            <video ref={videoEl} autoPlay muted playsInline className="aspect-video w-full bg-[#0B1220] object-contain" />
            {status === "idle" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B1220]/95 px-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <MonitorUp className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-white">Share your meeting tab</p>
                <p className="max-w-xs text-xs text-white/60">
                  Works with any browser tab. Enable &quot;Share tab audio&quot; so OLat5 can hear the interviewer.
                </p>
                <Button size="sm" onClick={connect}><MonitorUp className="h-4 w-4" /> Connect &amp; listen</Button>
              </div>
            ) : null}
          </div>

          {/* status + prominent Analyze */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip on={status === "listening"} warn={status === "paused"} label={status === "listening" ? "Connected" : status === "paused" ? "Paused" : "Off"} IconOn={Wifi} IconOff={WifiOff} />
            <StatusChip on={sources.mic} label={sources.mic ? "Mic" : "No mic"} IconOn={Mic} IconOff={MicOff} />
            <StatusChip on={sources.screen} label={sources.screen ? "Screen" : "No screen"} IconOn={Monitor} IconOff={Monitor} />
            <Button size="sm" onClick={analyzeScreen} disabled={analyzing} className="ml-auto">
              <ScanLine className="h-4 w-4" /> {analyzing ? "Analyzing…" : "Analyze screen"}
            </Button>
          </div>

          {analyzing || screenGuidance ? (
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Screen analysis</p>
              {analyzing ? (
                <div className="space-y-2" aria-busy>
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[#EFF6FF]" />
                  <div className="h-3 w-full animate-pulse rounded bg-[#EFF6FF]" />
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#334155]">{screenGuidance}</div>
              )}
            </div>
          ) : null}
        </section>

        {/* ── AI RESPONSE (primary, expanded) ── */}
        <section className="order-2 flex min-h-0 flex-col rounded-2xl border border-[#BFDBFE] bg-white p-5 shadow-[0_8px_30px_rgba(37,99,235,0.10)] md:order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-7rem)]">
          <div className="flex flex-none items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">AI response</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={copyAnswer} disabled={!suggestion} aria-label="Copy answer">
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="secondary" onClick={() => requestSuggestion(question, true)} disabled={thinking || !question}>
                <RefreshCw className={"h-4 w-4 " + (thinking ? "animate-spin" : "")} /> Regenerate
              </Button>
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {thinking ? (
              <div className="space-y-2" aria-busy>
                <div className="h-5 w-3/4 animate-pulse rounded bg-[#EFF6FF]" />
                <div className="h-5 w-full animate-pulse rounded bg-[#EFF6FF]" />
                <div className="h-5 w-5/6 animate-pulse rounded bg-[#EFF6FF]" />
              </div>
            ) : suggestion ? (
              <div className="space-y-4">
                <p className="text-[19px] font-semibold leading-relaxed text-[#0F172A]">{suggestion.suggestedAnswer}</p>

                {suggestion.talkingPoints?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Talking points</p>
                    <ul className="space-y-1.5">
                      {suggestion.talkingPoints.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-[15px] leading-relaxed text-[#334155]">
                          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#2563EB]" /> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {suggestion.exampleAnswer ? (
                  <div className="rounded-xl bg-[#F8FAFC] p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Example answer</p>
                    <p className="text-[15px] leading-relaxed text-[#334155]">{suggestion.exampleAnswer}</p>
                  </div>
                ) : null}

                {suggestion.technicalGuidance ? (
                  <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#2563EB]">Guidance</p>
                    <p className="text-[15px] leading-relaxed text-[#1D4ED8]">{suggestion.technicalGuidance}</p>
                  </div>
                ) : null}

                {suggestion.quickTip ? (
                  <p className="flex items-start gap-2 text-[14px] text-[#475569]">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-none text-[#F59E0B]" /> {suggestion.quickTip}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                <Sparkles className="h-8 w-8 text-[#BFDBFE]" />
                <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                  When a question is asked, OLat5 shows a clear, structured answer here. You can also type a
                  question below and tap Generate.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── CURRENT QUESTION (manual input + source mode) ── */}
        <section className="order-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:order-3 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current question</p>
            <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5 text-xs">
              {(["hybrid", "auto", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "rounded-md px-2.5 py-1 font-medium capitalize transition-colors " +
                    (mode === m ? "bg-white text-[#2563EB] shadow-sm" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {m === "auto" ? "Auto detect" : m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) requestSuggestion(question, true);
              }}
              rows={2}
              placeholder="Type or paste a question"
              className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-white p-3 text-[15px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <Button onClick={() => requestSuggestion(question, true)} disabled={thinking || !question.trim()} className="sm:self-stretch">
              <Send className="h-4 w-4" /> Generate answer
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {mode === "manual"
              ? "Manual mode: detected questions are ignored — enter questions yourself."
              : mode === "auto"
                ? "Auto mode: OLat5 generates as soon as it detects a full question."
                : "Hybrid mode: detected questions appear here so you can edit before generating."}
          </p>
        </section>

        {/* ── LIVE TRANSCRIPT ── */}
        <section className="order-1 flex min-h-0 flex-col rounded-2xl border border-border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:order-4 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-3">
          <p className="flex-none pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Live transcript</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {segments.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Transcript appears here once you connect and the meeting starts.</p>
            ) : (
              <div className="space-y-3">
                {segments.map((s, i) => {
                  const isQ = s.isQuestion && s.speakerRole === "OTHER";
                  return (
                    <div
                      key={i}
                      className={
                        "rounded-lg text-[15px] leading-relaxed " +
                        (isQ ? "border-l-2 border-[#2563EB] bg-[#EFF6FF] px-3 py-1.5" : "px-1")
                      }
                    >
                      <span className="mr-2 align-middle text-[11px] tabular-nums text-[#94A3B8]">{fmtClock(s.tMs)}</span>
                      <span className={s.speakerRole === "SELF" ? "font-semibold text-[#2563EB]" : "font-semibold text-[#0F172A]"}>
                        {speakerLabel(s)}:
                      </span>{" "}
                      <span className="text-[#475569]">{s.text}</span>
                    </div>
                  );
                })}
                <div ref={transcriptEnd} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusChip({
  on, warn, label, IconOn, IconOff,
}: {
  on: boolean;
  warn?: boolean;
  label: string;
  IconOn: typeof Mic;
  IconOff: typeof Mic;
}) {
  const Icon = on ? IconOn : IconOff;
  const cls = on
    ? "bg-[#DCFCE7] text-[#10B981]"
    : warn
      ? "bg-[#FEF3C7] text-[#B45309]"
      : "bg-[#F1F5F9] text-[#94A3B8]";
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " + cls}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
