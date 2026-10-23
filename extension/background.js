import { HOST_NAME, helperErrorMessage } from "./src/native.js";
import { getOutputDir } from "./src/settings.js";
import { canonicalUrl, trackId } from "./src/track.js";
import { idleJob, interruptedJob, isActive, newJob, noTrackJob, reduce, shownOnOpen } from "./src/jobs.js";

const MAX_STORED_JOBS = 20;

const jobs = new Map(); // track id -> job
const helpers = new Map(); // track id -> native port
const popups = new Set(); // { port, id }

let badgeTimer = null;

// ---------- icon state ----------

function iconSet(name) {
  return {
    16: `icons/${name}16.png`,
    32: `icons/${name}32.png`,
    48: `icons/${name}48.png`,
    128: `icons/${name}128.png`,
  };
}

function refreshTab(tabId, url) {
  const downloadable = !!trackId(url);
  chrome.action.setIcon({ tabId, path: iconSet(downloadable ? "on" : "off") });
  chrome.action.setTitle({
    tabId,
    title: downloadable ? "Download this track as MP3" : "Open a track on YouTube Music to download",
  });
  if (downloadable) chrome.action.enable(tabId);
  else chrome.action.disable(tabId);
}

function refreshAllTabs() {
  chrome.action.disable();
  chrome.tabs.query({}, (tabs) => tabs.forEach((tab) => refreshTab(tab.id, tab.url)));
}

chrome.runtime.onInstalled.addListener(refreshAllTabs);
chrome.runtime.onStartup.addListener(refreshAllTabs);
chrome.tabs.onUpdated.addListener((tabId, _change, tab) => refreshTab(tabId, tab.url));
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  refreshTab(tabId, tab.url);
});

// ---------- badge ----------

function showBadge(job) {
  clearTimeout(badgeTimer);
  if (isActive(job)) {
    const text = job.state === "downloading" ? `${job.pct}%` : "...";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#d62828" });
    return;
  }
  const done = job.state === "done";
  chrome.action.setBadgeText({ text: done ? "OK" : "ERR" });
  chrome.action.setBadgeBackgroundColor({ color: done ? "#2a9d3f" : "#6b6b6b" });
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

// ---------- job state (kept in session storage so it survives worker restarts) ----------

const ready = restoreJobs();

async function restoreJobs() {
  const { jobs: saved = {} } = await chrome.storage.session.get("jobs");
  for (const [id, job] of Object.entries(saved)) {
    jobs.set(id, isActive(job) ? interruptedJob(job) : job);
  }
}

function persistJobs() {
  while (jobs.size > MAX_STORED_JOBS) {
    const oldest = [...jobs.entries()].find(([, job]) => !isActive(job));
    if (!oldest) break;
    jobs.delete(oldest[0]);
  }
  chrome.storage.session.set({ jobs: Object.fromEntries(jobs) });
}

function sendJob(popup, job) {
  popup.port.postMessage({ type: "job", job });
}

function setJob(id, job) {
  jobs.set(id, job);
  persistJobs();
  showBadge(job);
  for (const popup of popups) {
    if (popup.id === id) sendJob(popup, job);
  }
}

/** Apply one helper message to the stored job. */
function update(id, msg) {
  setJob(id, reduce(jobs.get(id), msg));
}

function fail(id, reason) {
  update(id, { type: "error", message: helperErrorMessage(reason) });
}

// ---------- talking to the helper ----------

async function startDownload(id, titleHint) {
  helpers.get(id)?.disconnect();
  setJob(id, newJob(id, titleHint));
  const outputDir = await getOutputDir();

  let port;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (error) {
    fail(id, error.message);
    return;
  }
  helpers.set(id, port);

  port.onMessage.addListener((msg) => update(id, msg));

  port.onDisconnect.addListener(() => {
    // Read lastError unconditionally, or Chrome logs "Unchecked runtime.lastError" on every normal exit.
    const reason = chrome.runtime.lastError?.message;
    if (helpers.get(id) === port) helpers.delete(id);
    if (isActive(jobs.get(id))) fail(id, reason);
  });

  port.postMessage({ type: "download", url: canonicalUrl(id), output_dir: outputDir });
}

// ---------- popup ----------

async function handlePopupCommand(popup, msg) {
  await ready;
  const id = trackId(msg.url);
  if (!id) {
    sendJob(popup, noTrackJob());
    return;
  }
  popup.id = id;

  const existing = jobs.get(id);
  if (msg.cmd === "download") {
    if (isActive(existing)) sendJob(popup, existing);
    else startDownload(id, msg.title || existing?.title || "");
    return;
  }
  // "open": show what's going on for this track, or the idle state with a Download button.
  sendJob(popup, shownOnOpen(existing) ? existing : idleJob(msg.title));
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  const popup = { port, id: null };
  popups.add(popup);
  port.onMessage.addListener((msg) => handlePopupCommand(popup, msg));
  port.onDisconnect.addListener(() => popups.delete(popup));
});
