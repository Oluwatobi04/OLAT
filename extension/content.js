/* OLat5 copilot — content script (premium overlay).
   Detects the meeting platform and injects a draggable, resizable overlay with
   a live transcript and plain-English AI suggestions. Three modes: Compact,
   Focus (wide), and Presentation (minimized floating falcon). */
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

  // ── falcon mark (inline SVG, matches the official OLat5 brand) ──
  const FALCON = `
    <svg viewBox="0 0 128 128" class="olat5-falcon" aria-hidden="true">
      <defs>
        <linearGradient id="o5bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3b82f6"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#06b6d4"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="124" height="124" rx="30" fill="url(#o5bg)"/>
      <g fill="#fff">
        <path d="M64 40 C50 40 36 48 24 68 C40 62 50 62 60 66 C52 70 46 78 42 90 C56 78 64 74 64 74 Z"/>
        <path d="M64 40 C78 40 92 48 104 68 C88 62 78 62 68 66 C76 70 82 78 86 90 C72 78 64 74 64 74 Z"/>
        <path d="M64 34 C69 34 73 38 73 44 C73 49 70 52 66 53 L78 58 L66 59 C66 66 64 74 64 74 C64 74 62 66 62 59 L50 58 L62 53 C58 52 55 49 55 44 C55 38 59 34 64 34 Z"/>
      </g>
    </svg>`;

  let sessionId = null;
  let running = false;
  let paused = false;
  let mode = "compact"; // compact | focus
  let credits = null;
  const transcriptLines = [];

  // ── overlay DOM ───────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "olat5-overlay";
  root.className = "olat5-compact";
  root.innerHTML = `
    <div class="olat5-header" id="olat5-drag">
      <span class="olat5-brand">
        ${FALCON}
        <span class="olat5-brand-text">
          <span class="olat5-name">OLat5</span>
          <span class="olat5-tag">AI Interview Copilot</span>
        </span>
      </span>
      <span class="olat5-spacer"></span>
      <span class="olat5-status" id="olat5-status"><i class="olat5-dot"></i><span id="olat5-status-text">Not started</span></span>
      <span class="olat5-credits" id="olat5-credits" title="Credits left">
        <span id="olat5-credit-count">—</span><span class="olat5-credit-label">credits</span>
      </span>
      <div class="olat5-actions">
        <button class="olat5-icon" id="olat5-mode" title="Toggle Focus mode">⤢</button>
        <button class="olat5-icon" id="olat5-present" title="Presentation mode (minimize)">▢</button>
      </div>
    </div>

    <div class="olat5-body" id="olat5-body">
      <div class="olat5-setup" id="olat5-setup">
        <div class="olat5-label">Interview setup</div>
        <input class="olat5-input" id="olat5-role" placeholder="Role you're applying for *" autocomplete="off" />
        <div class="olat5-setup-row">
          <input class="olat5-input" id="olat5-company" placeholder="Company" autocomplete="off" />
          <input class="olat5-input" id="olat5-industry" placeholder="Industry *" autocomplete="off" />
        </div>
        <div class="olat5-setup-hint" id="olat5-setup-hint">Works for any profession — teacher, nurse, chef, lawyer, engineer, and more.</div>
      </div>

      <div class="olat5-context" id="olat5-context" style="display:none"></div>

      <button class="olat5-cta" id="olat5-toggle-session">Start session</button>

      <div class="olat5-panel olat5-hero">
        <div class="olat5-label">Suggested response</div>
        <div class="olat5-answer" id="olat5-answer">Press <b>Start session</b> and OLat5 will suggest what to say when you're asked a question.</div>
      </div>

      <div class="olat5-panel">
        <div class="olat5-label">What they're asking</div>
        <div class="olat5-text" id="olat5-question">Waiting for a question…</div>
      </div>

      <div class="olat5-grid">
        <div class="olat5-panel">
          <div class="olat5-label">Points to mention</div>
          <ul class="olat5-list" id="olat5-points"><li class="olat5-muted">—</li></ul>
        </div>
        <div class="olat5-panel">
          <div class="olat5-label">Quick tip</div>
          <div class="olat5-text olat5-small" id="olat5-coach">Speak slowly. Give one real example.</div>
        </div>
      </div>

      <div class="olat5-panel">
        <div class="olat5-label">Example answer</div>
        <div class="olat5-text olat5-small" id="olat5-star">—</div>
      </div>

      <div class="olat5-panel" id="olat5-tech-panel">
        <div class="olat5-label">Technical help</div>
        <div class="olat5-text olat5-small" id="olat5-tech">—</div>
      </div>

      <div class="olat5-panel">
        <div class="olat5-label">Conversation notes</div>
        <div class="olat5-transcript" id="olat5-transcript"></div>
      </div>
    </div>

    <button class="olat5-restore" id="olat5-restore" title="Open OLat5">${FALCON}</button>`;
  document.documentElement.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const body = $("#olat5-body");

  // ── status system ─────────────────────────────────────────────
  const STATUS = {
    idle:       { text: "Not started", cls: "s-idle" },
    starting:   { text: "Starting…",   cls: "s-proc" },
    listening:  { text: "Listening",   cls: "s-live" },
    processing: { text: "Processing",  cls: "s-proc" },
    paused:     { text: "Paused",      cls: "s-paused" },
    ended:      { text: "Ended",       cls: "s-idle" },
  };
  function setStatus(key) {
    const s = STATUS[key] || STATUS.idle;
    const el = $("#olat5-status");
    el.className = "olat5-status " + s.cls;
    $("#olat5-status-text").textContent = s.text;
  }

  // ── credits (with count-up animation) ─────────────────────────
  function animateCount(el, from, to) {
    const start = performance.now();
    const dur = 500;
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function setCredits(n) {
    if (typeof n !== "number") return;
    const el = $("#olat5-credit-count");
    const prev = credits ?? n;
    credits = n;
    animateCount(el, prev, n);
    $("#olat5-credits").classList.toggle("olat5-low", n <= 5);
  }

  // ── rendering ─────────────────────────────────────────────────
  function setQuestion(t) { $("#olat5-question").textContent = t; }

  // Highlight short, strong phrases so the eye lands on what to say.
  function emphasize(text) {
    const safe = String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return safe.replace(/“([^”]+)”|"([^"]+)"/g, (_m, a, b) => `<mark>${a || b}</mark>`);
  }

  function renderSuggestion(s) {
    $("#olat5-answer").innerHTML = emphasize(s.suggestedAnswer || "—");
    const ul = $("#olat5-points");
    ul.innerHTML = "";
    const pts = s.talkingPoints || [];
    if (!pts.length) ul.innerHTML = '<li class="olat5-muted">—</li>';
    pts.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      ul.appendChild(li);
    });
    if (s.star && (s.star.situation || s.star.action)) {
      $("#olat5-star").textContent =
        [s.star.situation, s.star.task, s.star.action, s.star.result].filter(Boolean).join(" ");
    }
    const tech = (s.technicalGuidance || "").trim();
    $("#olat5-tech").textContent = tech || "—";
    $("#olat5-tech-panel").style.display = tech ? "block" : "none";
    if (s.followUp) $("#olat5-coach").textContent = s.followUp;
  }

  let lastQuestionAt = 0;
  async function requestSuggestion(question) {
    if (paused || !running) return;
    const now = Date.now();
    if (now - lastQuestionAt < 4000) return; // debounce
    lastQuestionAt = now;
    setQuestion(question);
    setStatus("processing");
    $("#olat5-answer").innerHTML = '<span class="olat5-thinking">Thinking<i>.</i><i>.</i><i>.</i></span>';
    const res = await chrome.runtime.sendMessage({
      type: "SUGGEST",
      question,
      transcript: transcriptLines.slice(-12).join("\n"),
      sessionId,
    });
    if (res?.ok && res.suggestion) {
      renderSuggestion(res.suggestion);
      if (typeof res.creditsRemaining === "number") setCredits(res.creditsRemaining);
    } else {
      $("#olat5-answer").textContent =
        res?.error === "AI_NOT_CONFIGURED" ? "AI isn't set up yet." :
        res?.error === "INSUFFICIENT_CREDITS" ? "You're out of credits — top up to keep going." :
        "Couldn't get a suggestion. Trying again next question.";
    }
    if (running && !paused) setStatus("listening");
  }

  // ── interview context ─────────────────────────────────────────
  function renderContext(ctx) {
    if (!ctx || !ctx.role) { $("#olat5-context").style.display = "none"; return; }
    $("#olat5-context").style.display = "block";
    $("#olat5-context").innerHTML = `
      <div class="olat5-ctx-row"><span class="olat5-ctx-k">Role</span><span class="olat5-ctx-v">${esc(ctx.role)}</span></div>
      ${ctx.company ? `<div class="olat5-ctx-row"><span class="olat5-ctx-k">Company</span><span class="olat5-ctx-v">${esc(ctx.company)}</span></div>` : ""}
      ${ctx.industry ? `<div class="olat5-ctx-row"><span class="olat5-ctx-k">Industry</span><span class="olat5-ctx-v">${esc(ctx.industry)}</span></div>` : ""}`;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  // ── start / stop ──────────────────────────────────────────────
  const toggleBtn = $("#olat5-toggle-session");
  toggleBtn.addEventListener("click", async () => {
    if (running) {
      toggleBtn.textContent = "Ending…";
      const res = await chrome.runtime.sendMessage({ type: "END_SESSION" });
      if (typeof res?.creditsRemaining === "number") setCredits(res.creditsRemaining);
      running = false; paused = false; sessionId = null;
      toggleBtn.textContent = "Start session";
      toggleBtn.classList.remove("olat5-stop");
      $("#olat5-setup").style.display = "block";
      setStatus("ended");
      setTimeout(() => { if (!running) setStatus("idle"); }, 2500);
    } else {
      const role = $("#olat5-role").value.trim();
      const company = $("#olat5-company").value.trim();
      const industry = $("#olat5-industry").value.trim();
      if (!role || !industry) {
        const hint = $("#olat5-setup-hint");
        hint.textContent = "Please enter at least the role and industry to continue.";
        hint.classList.add("olat5-hint-error");
        ($("#olat5-role").value.trim() ? $("#olat5-industry") : $("#olat5-role")).focus();
        return;
      }
      toggleBtn.textContent = "Starting…";
      setStatus("starting");
      const res = await chrome.runtime.sendMessage({
        type: "START_SESSION",
        platform,
        role,
        company,
        industry,
      });
      if (res?.ok) {
        running = true;
        sessionId = res.sessionId;
        if (typeof res.creditsRemaining === "number") setCredits(res.creditsRemaining);
        renderContext(res.context || { role, company, industry });
        $("#olat5-setup").style.display = "none";
        toggleBtn.textContent = "Stop session";
        toggleBtn.classList.add("olat5-stop");
        setStatus("listening");
        $("#olat5-answer").textContent = "Listening… I'll suggest what to say when they ask something.";
      } else {
        toggleBtn.textContent = "Start session";
        setStatus("idle");
        setQuestion(
          res?.error === "INSUFFICIENT_CREDITS"
            ? "Out of credits — top up to continue."
            : (res?.error || "Couldn't start. Log in from the OLat5 popup."),
        );
      }
    }
  });

  // ── mode toggle (compact ↔ focus) ─────────────────────────────
  $("#olat5-mode").addEventListener("click", () => {
    mode = mode === "compact" ? "focus" : "compact";
    root.classList.toggle("olat5-focus", mode === "focus");
    root.classList.toggle("olat5-compact", mode === "compact");
    chrome.storage.local.set({ olat5_mode: mode });
  });

  // ── presentation mode (minimize + pause copilot) ──────────────
  function enterPresentation() {
    paused = true;
    root.classList.add("olat5-presentation");
    if (running) setStatus("paused");
  }
  function exitPresentation() {
    root.classList.remove("olat5-presentation");
    paused = false;
    if (running) setStatus("listening");
  }
  $("#olat5-present").addEventListener("click", enterPresentation);
  $("#olat5-restore").addEventListener("click", exitPresentation);

  // ── drag ──────────────────────────────────────────────────────
  (function enableDrag() {
    const handle = $("#olat5-drag");
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = root.getBoundingClientRect();
      ox = r.left; oy = r.top;
      root.classList.add("olat5-dragging");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      root.style.left = Math.max(8, ox + (e.clientX - sx)) + "px";
      root.style.top = Math.max(8, oy + (e.clientY - sy)) + "px";
      root.style.right = "auto";
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
      root.classList.remove("olat5-dragging");
    });
  })();

  // ── incoming transcripts ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "OLAT5_TRANSCRIPT" || !msg.segments) return;
    const tEl = $("#olat5-transcript");
    msg.segments.forEach((seg) => {
      const line = `${seg.speaker}: ${seg.text}`;
      transcriptLines.push(line);
      const div = document.createElement("div");
      div.className = "olat5-line" + (seg.speakerRole === "SELF" ? " olat5-self" : "");
      div.textContent = line;
      tEl.appendChild(div);
      tEl.scrollTop = tEl.scrollHeight;
      if (seg.isQuestion && seg.speakerRole !== "SELF") requestSuggestion(seg.text);
    });
  });

  // ── init: restore mode, active session, and credits ───────────
  chrome.storage.local.get(["olat5_active", "olat5_mode"]).then((r) => {
    if (r.olat5_mode === "focus") {
      mode = "focus";
      root.classList.add("olat5-focus");
      root.classList.remove("olat5-compact");
    }
    if (r.olat5_active?.sessionId) {
      running = true;
      sessionId = r.olat5_active.sessionId;
      toggleBtn.textContent = "Stop session";
      toggleBtn.classList.add("olat5-stop");
      setStatus("listening");
      if (r.olat5_active.context) {
        renderContext(r.olat5_active.context);
        $("#olat5-setup").style.display = "none";
      }
    }
  });

  chrome.runtime.sendMessage({ type: "GET_CREDITS" }).then((res) => {
    if (res?.ok && typeof res.creditsRemaining === "number") setCredits(res.creditsRemaining);
  }).catch(() => {});
})();
