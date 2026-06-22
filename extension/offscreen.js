/* OLat5 copilot — offscreen audio capture + Deepgram live streaming.
   Captures the meeting tab's audio, streams it to Deepgram over WebSocket
   using a short-lived key, and posts transcript segments to the background. */

let stream = null;
let recorder = null;
let ws = null;
let audioCtx = null;
let keepAlive = null;
let reconnectTimer = null;
let currentKey = null;
let startMsBase = 0;

const QUESTION_RE = /\?\s*$/;
const QUESTION_HINTS = /\b(tell me|describe|why|how|what|walk me through|can you|could you|explain|give an example|have you ever|where do you see)\b/i;

function isQuestion(text) {
  return QUESTION_RE.test(text.trim()) || QUESTION_HINTS.test(text);
}

function buildWsUrl() {
  // NOTE: do NOT set `encoding`/`sample_rate` here. MediaRecorder emits
  // WebM-containerized Opus; Deepgram auto-detects the container. Forcing
  // `encoding=opus` makes Deepgram misread the bytes and return no transcript.
  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    diarize: "true",
    punctuate: "true",
    interim_results: "true",
    language: "en",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function connectDeepgram(key) {
  currentKey = key;
  // Deepgram browser auth via WebSocket subprotocol: ["token", <key>].
  ws = new WebSocket(buildWsUrl(), ["token", key]);

  ws.onopen = () => {
    keepAlive = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 8000);
  };

  ws.onmessage = (evt) => {
    let data;
    try {
      data = JSON.parse(evt.data);
    } catch {
      return;
    }
    const alt = data?.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;
    if (!data.is_final) return; // only persist finals

    const words = alt.words ?? [];
    const speakerNum = words[0]?.speaker ?? 0;
    const startMs = Math.round((data.start ?? 0) * 1000);
    const endMs = Math.round(((data.start ?? 0) + (data.duration ?? 0)) * 1000);

    const segment = {
      speaker: `Speaker ${speakerNum + 1}`,
      speakerRole: speakerNum === 0 ? "OTHER" : "SELF",
      text: alt.transcript,
      startMs,
      endMs,
      confidence: alt.confidence ?? 0,
      isQuestion: isQuestion(alt.transcript),
    };

    chrome.runtime.sendMessage({ type: "TRANSCRIPT_SEGMENTS", segments: [segment] });
  };

  ws.onclose = () => {
    cleanupWs();
    // Auto-reconnect while capturing.
    if (stream && currentKey) {
      reconnectTimer = setTimeout(() => connectDeepgram(currentKey), 1500);
    }
  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
}

function cleanupWs() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  ws = null;
}

async function start(streamId, deepgramKey) {
  startMsBase = Date.now();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
  });

  // Keep the meeting audible to the user (tab capture otherwise mutes it).
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(audioCtx.destination);

  connectDeepgram(deepgramKey);

  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      e.data.arrayBuffer().then((buf) => ws.send(buf));
    }
  };
  recorder.start(250); // 250ms chunks
}

function stop() {
  currentKey = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (recorder && recorder.state !== "inactive") recorder.stop();
  recorder = null;
  if (ws) { try { ws.send(JSON.stringify({ type: "CloseStream" })); ws.close(); } catch {} }
  cleanupWs();
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "START") {
    start(msg.streamId, msg.deepgramKey)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message }));
    return true;
  }
  if (msg.type === "STOP") {
    stop();
    sendResponse({ ok: true });
  }
});
