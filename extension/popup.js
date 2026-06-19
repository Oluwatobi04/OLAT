/* OLat5 copilot — popup: login + start a session on the active meeting tab. */
const CFG = self.OLAT5_CONFIG;
const $ = (id) => document.getElementById(id);

const SUPPORTED = /(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)/;

function show(view) {
  $("login-view").classList.toggle("hidden", view !== "login");
  $("session-view").classList.toggle("hidden", view !== "session");
}

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: "AUTH_STATE" });
  if (res?.user) {
    $("who").textContent = res.user.email || "Signed in";
    show("session");
  } else {
    show("login");
  }
}

$("login-btn").addEventListener("click", async () => {
  $("login-msg").textContent = "Signing in…";
  const res = await chrome.runtime.sendMessage({
    type: "LOGIN",
    email: $("email").value.trim(),
    password: $("password").value,
  });
  if (res?.ok) {
    $("login-msg").textContent = "";
    refresh();
  } else {
    $("login-msg").textContent = res?.error || "Login failed";
  }
});

$("logout-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  refresh();
});

$("dashboard-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${CFG.BACKEND_URL}/dashboard` });
});

$("start-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !SUPPORTED.test(tab.url)) {
    $("session-msg").textContent = "Open a Google Meet, Zoom, Teams, or Webex tab first.";
    return;
  }
  $("session-msg").textContent = "Starting…";
  let platform = "MEET";
  if (tab.url.includes("zoom.us")) platform = "ZOOM";
  else if (tab.url.includes("teams.microsoft.com")) platform = "TEAMS";
  else if (tab.url.includes("webex.com")) platform = "WEBEX";

  const res = await chrome.runtime.sendMessage({
    type: "START_SESSION",
    platform,
    tabId: tab.id,
  });
  if (res?.ok) {
    $("session-msg").textContent = "Live copilot running. Check the overlay on the meeting tab.";
  } else {
    $("session-msg").textContent =
      res?.error === "INSUFFICIENT_CREDITS" ? "Out of credits — upgrade to continue." : (res?.error || "Could not start.");
  }
});

refresh();
