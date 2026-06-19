const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? "";

export function isDeepgramConfigured(): boolean {
  return Boolean(DEEPGRAM_API_KEY);
}

export class DeepgramError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "DeepgramError";
  }
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

interface DeepgramUtterance {
  speaker?: number;
  transcript: string;
  start: number;
  end: number;
  confidence?: number;
}

// Transcribe an audio buffer with speaker diarization. Returns ordered
// utterances mapped to speaker-tagged segments.
export async function transcribeAudio(
  audio: Buffer | Uint8Array,
  mimetype = "audio/webm",
): Promise<{ segments: TranscriptSegment[]; fullText: string }> {
  if (!isDeepgramConfigured()) {
    throw new DeepgramError("Deepgram is not configured");
  }

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    diarize: "true",
    punctuate: "true",
    utterances: "true",
    language: "en",
  });

  let res: Response;
  try {
    res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": mimetype,
      },
      body: new Uint8Array(audio) as unknown as BodyInit,
    });
  } catch (err) {
    throw new DeepgramError("Failed to reach Deepgram", err);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DeepgramError(`Deepgram error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: {
      utterances?: DeepgramUtterance[];
      channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
    };
  };

  const utterances = json.results?.utterances ?? [];
  const segments: TranscriptSegment[] = utterances.map((u) => ({
    speaker: `Speaker ${(u.speaker ?? 0) + 1}`,
    text: u.transcript,
    startMs: Math.round(u.start * 1000),
    endMs: Math.round(u.end * 1000),
    confidence: u.confidence ?? 0,
  }));

  const fullText =
    segments.map((s) => s.text).join(" ").trim() ||
    json.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
    "";

  return { segments, fullText };
}
