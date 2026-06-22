import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Radio, Sparkles, Clock } from "lucide-react";
import {
  startLiveSessionFn,
  transcribeLiveFn,
  endLiveSessionFn,
} from "~/server/live";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { friendlyError } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/live")({
  component: LivePage,
});

interface Segment {
  speaker: string;
  text: string;
  startMs: number;
}

function LivePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);

  async function start() {
    try {
      const res = await startLiveSessionFn({ data: {} });
      if (!res.ok) {
        toast.error(
          res.error === "DEEPGRAM_NOT_CONFIGURED"
            ? "Live transcription isn't configured."
            : friendlyError(res.error),
        );
        return;
      }
      setSessionId(res.sessionId);
      setCreditsLeft(res.creditsRemaining);
      setSegments([]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recorder.start();
      mediaRef.current = recorder;

      startedAt.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
        1000,
      );
      setRecording(true);
      toast.success("Session started. Recording.");
    } catch (err) {
      toast.error(
        err instanceof DOMException
          ? "Microphone access denied"
          : "Could not start the session",
      );
    }
  }

  async function stop() {
    const recorder = mediaRef.current;
    const id = sessionId;
    if (!recorder || !id) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setProcessing(true);

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });

    try {
      const base64 = await blobToBase64(blob);
      const res = await transcribeLiveFn({
        data: { sessionId: id, audioBase64: base64, mimetype: "audio/webm" },
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        setSegments(res.segments.map((s) => ({ speaker: s.speaker, text: s.text, startMs: s.startMs })));
        toast.success("Transcript ready");
      }
      await endLiveSessionFn({ data: { sessionId: id, durationSec: elapsed } });
    } catch {
      toast.error("Transcription failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Interview</h1>
          <p className="text-sm text-muted-foreground">
            Real time recording with AI transcription and speaker detection. Costs 5 credits.
          </p>
        </div>
        {recording ? (
          <Badge variant="destructive" className="gap-1.5">
            <Radio className="h-3 w-3 animate-pulse" /> LIVE · {fmt(elapsed)}
          </Badge>
        ) : creditsLeft !== null ? (
          <Badge variant="secondary">{creditsLeft} credits available</Badge>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transcript */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Live Transcript</CardTitle>
            {processing ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#8B5CF6] [animation-delay:.2s]" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#8B5CF6] [animation-delay:.4s]" />
                Transcribing
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            {segments.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-inset ring-white/10">
                  <Mic className="h-7 w-7 text-[#60a5fa]" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {recording
                    ? "Recording… speak now. Stop to generate the transcript."
                    : "Start a live session to capture and transcribe your interview."}
                </p>
                {!recording && !processing ? (
                  <Button onClick={start}>
                    <Mic className="h-4 w-4" /> Start live session
                  </Button>
                ) : null}
                {recording ? (
                  <Button variant="destructive" onClick={stop}>
                    <Square className="h-4 w-4" /> Stop &amp; transcribe
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {segments.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-xs font-semibold text-white">
                      {s.speaker.replace("Speaker ", "S")}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {s.speaker} · {fmt(Math.floor(s.startMs / 1000))}
                      </p>
                      <p className="text-sm">{s.text}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <Button onClick={start} variant="secondary" size="sm">
                    <Mic className="h-4 w-4" /> New session
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controls / insights */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session controls</CardTitle>
              <CardDescription>5 credits per session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!recording ? (
                <Button onClick={start} className="w-full" disabled={processing}>
                  <Mic className="h-4 w-4" /> {processing ? "Processing…" : "Start session"}
                </Button>
              ) : (
                <Button variant="destructive" className="w-full" onClick={stop}>
                  <Square className="h-4 w-4" /> Stop &amp; transcribe
                </Button>
              )}
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" /> Duration
                </span>
                <span className="font-mono">{fmt(elapsed)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-[#8B5CF6]" /> AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {segments.length > 0
                  ? `${segments.length} utterances captured. Generate a summary or coaching report from the Sessions page.`
                  : "Insights appear here after your session is transcribed."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
