/* OLat5 copilot — content script. Detects the meeting platform and injects a
   draggable, collapsible overlay with live transcript + AI suggestions. */
(function () {
  if (window.__olat5Injected) return;
  window.__olat5Injected = true;

  function detectPlatform() {
    const h = location.hostname;
    if (h.includes("meet.google.com")) return "MEET";
    if (h.includes("zoom.us")) return "ZOOM";
    if (h.includes("teams.microsoft.com")) return "TEAMS";
    if (h.includes("webex.com")) return "WEBEX";
    return null;
  }

  const platform = detectPlatform();
  if (!platform) return;

  let sessionId = null;
  let running = false;
  const transcriptLines = [];

  // ── overlay DOM ───────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "olat5-overlay";
  root.innerHTML = `
    <div class="olat5-header" id="olat5-drag">
      <span class="olat5-logo">O</span>
      <span class="olat5-title">OLat5 Copilot</span>
      <span class="olat5-spacer"></span>
      <button class="olat5-btn olat5-start" id="olat5-toggle-session">Start</button>
      <button class="olat5-icon" id="olat5-collapse" title="Collapse">—</button>
    </div>
    <div class="olat5-body" id="olat5-body">
      <div class="olat5-panel">
        <div class="olat5-label">Current Question</div>
        <div class="olat5-text" id="olat5-question">Waiting for a question…</div>
      </div>
      <div class="olat5-panel olat5-accent">
        <div class="olat5-label">Suggested Answer</div>
        <div class="olat5-text" id="olat5-answer">—</div>
      </div>
      <div class="olat5-panel">
        <div class="olat5-label">Key Talking Points</div>
        <ul class="olat5-list" id="olat5-points"></ul>
      </div>
      <div class="olat5-panel">
        <div class="olat5-label">STAR Framework</div>
        <div class="olat5-text olat5-small" id="olat5-star">—</div>
      </div>
      <div class="olat5-panel">
        <div class="olat5-label">Technical Guidance</div>
        <div class="olat5-text olat5-small" id="olat5-tech">—</div>
      </div>
      <div class="olat5-panel">
        <div class="olat5-label">AI Coaching Tip</div>
        <div class="olat5-text olat5-small" id="olat5-coach">Speak clearly and structure answers with STAR.</div>
      </div>
      <div class="olat5-panel">
        <div class="olat5-label">Live Transcript</div>
        <div class="olat5-transcript" id="olat5-transcript"></div>
      </div>
    </div>`;
  document.documentElement.appendChild(root);

  const $ = (id) => root.querySelector(id);
  const body = $("#olat5-body");

  // ── drag ──────────────────────────────────────────────────────
  (function enableDrag() {
    const handle = $("#olat5-drag");
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = root.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      root.style.left = ox + (e.clientX - sx) + "px";
      root.style.top = oy + (e.clientY - sy) + "px";
      root.style.right = "auto";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  })();

  // ── collapse ──────────────────────────────────────────────────
  $("#olat5-collapse").addEventListener("click", () => {
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "block" : "none";
    $("#olat5-collapse").textContent = hidden ? "—" : "+";
  });

  // ── start / stop ──────────────────────────────────────────────
  const toggleBtn = $("#olat5-toggle-session");
  toggleBtn.addEventListener("click", async () => {
    if (running) {
      toggleBtn.textContent = "…";
      await chrome.runtime.sendMessage({ type: "END_SESSION" });
      running = false;
      sessionId = null;
      toggleBtn.textContent = "Start";
      toggleBtn.classList.remove("olat5-stop");
    } else {
      toggleBtn.textContent = "…";
      const res = await chrome.runtime.sendMessage({ type: "START_SESSION", platform });
      if (res?.ok) {
        running = true;
        sessionId = res.sessionId;
        toggleBtn.textContent = "Stop";
        toggleBtn.classList.add("olat5-stop");
      } else {
        toggleBtn.textContent = "Start";
        setQuestion(res?.error === "INSUFFICIENT_CREDITS" ? "Out of credits — upgrade to continue." : (res?.error || "Could not start. Log in via the extension popup."));
      }
    }
  });

  // ── rendering ─────────────────────────────────────────────────
  function setQuestion(t) { $("#olat5-question").textContent = t; }
  function renderSuggestion(s) {
    $("#olat5-answer").textContent = s.suggestedAnswer || "—";
    const ul = $("#olat5-points");
    ul.innerHTML = "";
    (s.talkingPoints || []).forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      ul.appendChild(li);
    });
    if (s.star) {
      $("#olat5-star").textContent =
        `S: ${s.star.situation}\nT: ${s.star.task}\nA: ${s.star.action}\nR: ${s.star.result}`;
    }
    $("#olat5-tech").textContent = s.technicalGuidance || "—";
    if (s.followUp) $("#olat5-coach").textContent = s.followUp;
  }

  let lastQuestionAt = 0;
  async function requestSuggestion(question) {
    const now = Date.now();
    if (now - lastQuestionAt < 4000) return; // debounce
    lastQuestionAt = now;
    setQuestion(question);
    $("#olat5-answer").textContent = "Thinking…";
    const res = await chrome.runtime.sendMessage({
      type: "SUGGEST",
      question,
      transcript: transcriptLines.slice(-12).join("\n"),
      sessionId,
    });
    if (res?.ok && res.suggestion) renderSuggestion(res.suggestion);
    else $("#olat5-answer").textContent = res?.error === "AI_NOT_CONFIGURED" ? "AI not configured." : "Could not generate a suggestion.";
  }

  // ── incoming transcripts ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "OLAT5_TRANSCRIPT" || !msg.segments) return;
    const tEl = $("#olat5-transcript");
    msg.segments.forEach((seg) => {
      const line = `${seg.speaker}: ${seg.text}`;
      transcriptLines.push(line);
      const div = document.createElement("div");
      div.className = "olat5-line";
      div.textContent = line;
      tEl.appendChild(div);
      tEl.scrollTop = tEl.scrollHeight;
      // Auto-suggest when the *other* speaker asks a question.
      if (seg.isQuestion && seg.speakerRole !== "SELF") requestSuggestion(seg.text);
    });
  });

  // Restore running state if a session is already active.
  chrome.storage.local.get("olat5_active").then((r) => {
    if (r.olat5_active?.sessionId) {
      running = true;
      sessionId = r.olat5_active.sessionId;
      toggleBtn.textContent = "Stop";
      toggleBtn.classList.add("olat5-stop");
    }
  });
})();
