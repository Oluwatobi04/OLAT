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
  FileText,
  Briefcase,
  Building2,
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

interface Segment { speaker: string; speakerRole: string; text: string; isQuestion?: boolean }
interface Suggestion {
  suggestedAnswer: string;
  talkingPoints: string[];
  exampleAnswer: string;
  technicalGuidance: string;
  quickTip: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function Workspace() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const sessionId = data.session.id;

  const [segments, setSegments] = useState<Segment[]>(
    data.transcripts.map((t) => ({ speaker: t.speaker ?? "Speaker", speakerRole: t.speakerRole ?? "OTHER", text: t.text })),
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

  const displayStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const recorders = useRef<MediaRecorder[]>([]);
  const capturing = useRef(false);
  const pausedRef = useRef(false);
  const videoEl = useRef<HTMLVideoElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const lastSuggestAt = useRef(0);

  // session timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // keep transcript scrolled to the latest line
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments]);

  const requestSuggestion = useCallback(
    async (q: string) => {
      const now = Date.now();
      if (now - lastSuggestAt.current < 3500) return;
      lastSuggestAt.current = now;
      setQuestion(q);
      setThinking(true);
      try {
        const transcript = segments.slice(-12).map((s) => `${s.speaker}: ${s.text}`).join("\n");
        const res = await suggestFn({ data: { sessionId, question: q, transcript } });
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

  // Pipe a stream's audio to the transcription endpoint.
  // Provider-agnostic: works for any tab's audio or the microphone.
  //
  // We record in short, SELF-CONTAINED clips: every start()/stop() cycle emits a
  // COMPLETE WebM file (with the header/init segment) that Deepgram's prerecorded
  // API can decode. A single long-lived MediaRecorder with a timeslice only puts
  // the header on the first chunk; later chunks are headerless fragments Deepgram
  // cannot decode — which is exactly why the transcript stayed empty.
  const startRecorder = useCallback(
    (stream: MediaStream, speakerRole: "SELF" | "OTHER"): boolean => {
      const tracks = stream.getAudioTracks();
      console.info(
        `[OLat5 audio] ${speakerRole} audio tracks: ${tracks.length}`,
        tracks.map((t) => `${t.label || "track"}(${t.readyState},muted=${t.muted})`),
      );
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
                  console.info(`[OLat5 audio] ${speakerRole} +${res.segments.length} segment(s)`);
                  setSegments((prev) => [...prev, ...res.segments]);
                  const q = res.segments.find((s) => s.isQuestion && s.speakerRole === "OTHER");
                  if (q) requestSuggestion(q.text);
                }
              } catch {
                /* skip this clip */
              }
            }
          }
          if (capturing.current) recordClip(); // roll into the next self-contained clip
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
    [sessionId, requestSuggestion],
  );

  // Provider-agnostic capture. The browser's own tab picker lets the user
  // choose ANY meeting tab (Meet, Zoom, Teams, Webex, Discord, or anything else);
  // we only work with the resulting audio + screen streams.
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
      pausedRef.current = true; // clips keep cycling but are not sent for transcription
      setStatus("paused");
    } else if (status === "paused") {
      pausedRef.current = false;
      setStatus("listening");
    }
  }

  const cleanup = useCallback(() => {
    capturing.current = false; // stop the rolling-clip loop
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

  // Screen analysis only runs when the user asks for it.
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

  async function generateAnswer() {
    const lastOther = [...segments].reverse().find((s) => s.speakerRole === "OTHER");
    await requestSuggestion(lastOther?.text || question || "Tell me about yourself.");
  }

  async function endSession() {
    cleanup();
    await endWorkspaceFn({ data: { sessionId, durationSec: elapsed } }).catch(() => {});
    toast.success("Session ended");
    await router.navigate({ to: "/dashboard/sessions" });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const ctx = data.context;

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

      {/* Body: shared screen (65%) + copilot (35%) */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── LEFT 65%: shared screen + status + transcript ── */}
        <section className="flex min-h-0 flex-col border-b border-border bg-white lg:w-[65%] lg:flex-none lg:border-b-0 lg:border-r">
          <div className="flex-none p-4">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0B1220] shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
              <video
                ref={videoEl}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full bg-[#0B1220] object-contain"
              />
              {status === "idle" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B1220]/95 px-6 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <MonitorUp className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-white">Share your meeting tab</p>
                    <p className="mt-1 max-w-sm text-sm text-white/60">
                      Works with Google Meet, Zoom, Teams, Webex, Discord, or any browser tab. Enable
                      &quot;Share tab audio&quot; so OLat5 can hear the interviewer.
                    </p>
                  </div>
                  <Button onClick={connect}>
                    <MonitorUp className="h-4 w-4" /> Connect &amp; start listening
                  </Button>
                </div>
              ) : null}
            </div>

            {/* status row */}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip
                on={status === "listening"}
                warn={status === "paused"}
                label={status === "listening" ? "Connected" : status === "paused" ? "Paused" : "Not connected"}
                IconOn={Wifi}
                IconOff={WifiOff}
              />
              <StatusChip on={sources.mic} label={sources.mic ? "Microphone on" : "Microphone off"} IconOn={Mic} IconOff={MicOff} />
              <StatusChip on={sources.screen} label={sources.screen ? "Screen sharing" : "No screen"} IconOn={Monitor} IconOff={Monitor} />
            </div>
          </div>

          {/* transcript */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <p className="sticky top-0 bg-white py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Live transcript
            </p>
            {segments.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Transcript appears here once you connect and the meeting starts.</p>
            ) : (
              <div className="space-y-2.5">
                {segments.map((s, i) => (
                  <div key={i} className="text-[14px] leading-relaxed">
                    <span className={s.speakerRole === "SELF" ? "font-semibold text-[#2563EB]" : "font-semibold text-[#0F172A]"}>
                      {s.speakerRole === "SELF" ? "You" : s.speaker}:
                    </span>{" "}
                    <span className="text-[#475569]">{s.text}</span>
                  </div>
                ))}
                <div ref={transcriptEnd} />
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT 35%: copilot ── */}
        <aside className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-4">
          {/* Current question */}
          <Section label="Current question">
            <p className="text-[15px] text-[#0F172A]">{question || "Waiting for a question…"}</p>
          </Section>

          {/* AI response — the single, primary answer */}
          <div className="rounded-[20px] border border-[#BFDBFE] bg-white p-5 shadow-[0_8px_30px_rgba(37,99,235,0.10)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">AI response</p>
              <Button size="sm" onClick={generateAnswer} disabled={thinking}>
                <Sparkles className="h-4 w-4" /> {thinking ? "Generating…" : "Generate answer"}
              </Button>
            </div>
            {thinking ? (
              <div className="mt-4 space-y-2" aria-busy>
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#EFF6FF]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#EFF6FF]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#EFF6FF]" />
              </div>
            ) : suggestion ? (
              <p className="mt-3 text-[20px] font-semibold leading-relaxed text-[#0F172A]">
                {suggestion.suggestedAnswer}
              </p>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                When the interviewer asks something, OLat5 shows one clear answer here. You can also tap
                Generate answer anytime.
              </p>
            )}
          </div>

          {/* Screen analysis — only updates when requested */}
          <Section
            label="Screen analysis"
            action={
              <Button size="sm" variant="secondary" onClick={analyzeScreen} disabled={analyzing}>
                <ScanLine className="h-4 w-4" /> {analyzing ? "Analyzing…" : "Analyze"}
              </Button>
            }
          >
            {screenGuidance ? (
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#334155]">{screenGuidance}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Tap Analyze to read the shared screen, a coding task, a slide, or a diagram.</p>
            )}
          </Section>

          {/* Context — compact */}
          <Section label="Context">
            <div className="space-y-2">
              <ContextRow icon={Briefcase} label="Role" value={ctx?.role} />
              <ContextRow icon={Building2} label="Company" value={ctx?.company} />
              <ContextRow icon={Building2} label="Industry" value={ctx?.industry} />
              <ContextRow icon={FileText} label="Resume" value={ctx?.resumeText ? "Attached" : "None"} />
              <ContextRow icon={FileText} label="Job description" value={ctx?.jobDescriptionText ? "Attached" : "None"} />
            </div>
          </Section>
        </aside>
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

function ContextRow({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#F8FAFC] px-3 py-2">
      <Icon className="h-4 w-4 flex-none text-[#94A3B8]" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="ml-auto truncate text-sm font-medium text-[#0F172A]">{value || "None"}</span>
    </div>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
