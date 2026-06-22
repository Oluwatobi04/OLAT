/* OLat5 copilot — background service worker.
   Coordinates auth, session lifecycle, and the offscreen audio capturer. */
importScripts("config.js");

const CFG = self.OLAT5_CONFIG;

// ── auth helpers ───────────────────────────────────────────────
async function getSession() {
  const { olat5_session } = await chrome.storage.local.get("olat5_session");
  return olat5_session ?? null;
}
async function setSession(session) {
  await chrome.storage.local.set({ olat5_session: session });
}
async function clearSession() {
  await chrome.storage.local.remove("olat5_session");
}

async function getAccessToken() {
  const session = await getSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 > Date.now() + 30000) {
    return session.access_token;
  }
  // refresh
  if (!session.refresh_token) return session.access_token ?? null;
  try {
    const res = await fetch(
      `${CFG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      },
    );
    if (!res.ok) return session.access_token ?? null;
    const json = await res.json();
    const next = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
      user: json.user,
    };
    await setSession(next);
    return next.access_token;
  } catch {
    return session.access_token ?? null;
  }
}

async function api(path, body) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${CFG.BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ── offscreen document management ──────────────────────────────
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Capture meeting tab audio for real-time transcription.",
  });
}

async function startCapture(tabId) {
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const dg = await api("/api/live/token", {}); // { key }
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "START",
    streamId,
    deepgramKey: dg.key,
  });
}

async function stopCapture() {
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" });
}

// ── message router ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "LOGIN": {
          const res = await fetch(
            `${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
              method: "POST",
              headers: { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ email: msg.email, password: msg.password }),
            },
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error_description || json.msg || "Login failed");
          await setSession({
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
            user: json.user,
          });
          sendResponse({ ok: true, user: json.user });
          break;
        }
        case "LOGOUT":
          await clearSession();
          sendResponse({ ok: true });
          break;
        case "AUTH_STATE": {
          const session = await getSession();
          sendResponse({ ok: true, user: session?.user ?? null });
          break;
        }
        case "GET_CREDITS": {
          const out = await api("/api/live/session", { action: "credits" });
          sendResponse(out);
          break;
        }
        case "START_SESSION": {
          const tabId = msg.tabId ?? sender?.tab?.id;
          const { sessionId, creditsRemaining, context } = await api("/api/live/session", {
            action: "start",
            platform: msg.platform,
            title: msg.title,
            role: msg.role,
            company: msg.company,
            industry: msg.industry,
          });
          await chrome.storage.local.set({
            olat5_active: { sessionId, platform: msg.platform, context: context ?? null },
          });
          if (tabId) await startCapture(tabId);
          sendResponse({ ok: true, sessionId, creditsRemaining, context });
          break;
        }
        case "END_SESSION": {
          await stopCapture();
          const { olat5_active } = await chrome.storage.local.get("olat5_active");
          let result = { ok: true };
          if (olat5_active?.sessionId) {
            result = await api("/api/live/session", {
              action: "end",
              sessionId: olat5_active.sessionId,
            });
          }
          await chrome.storage.local.remove("olat5_active");
          sendResponse({ ok: true, ...result });
          break;
        }
        case "SUGGEST": {
          const out = await api("/api/live/suggest", {
            question: msg.question,
            transcript: msg.transcript,
            sessionId: msg.sessionId,
          });
          sendResponse(out);
          break;
        }
        case "TRANSCRIPT_SEGMENTS": {
          // From offscreen — persist + forward to the active meeting tab overlay.
          const { olat5_active } = await chrome.storage.local.get("olat5_active");
          if (olat5_active?.sessionId && msg.segments?.length) {
            api("/api/live/session", {
              action: "transcript",
              sessionId: olat5_active.sessionId,
              segments: msg.segments,
            }).catch(() => {});
          }
          forwardToActiveTab({ type: "OLAT5_TRANSCRIPT", segments: msg.segments });
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true; // async response
});

async function forwardToActiveTab(payload) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
}
