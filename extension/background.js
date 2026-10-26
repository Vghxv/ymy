import { HOST_NAME, helperErrorMessage } from "./src/native.js";
import { getOutputDir } from "./src/settings.js";
import { canonicalUrl, trackId } from "./src/track.js";
import { activeSummary, interruptedJob, isActive, newJob, reduce } from "./src/jobs.js";

const MAX_STORED_JOBS = 20;
const DONE_BADGE_MS = 4000;

const jobs = new Map(); // track id -> job, oldest first
const helpers = new Map(); // track id -> native port
const popups = new Set(); // popup ports

let badgeTimer = null;
let doneFlash = false; // "OK" shown for a moment after the last download finished
let unseenError = false; // a download failed and no popup has been opened since

// ---------- icon state ----------
// The icon's color says whether this tab can be downloaded (red) or not (gray).
// It is never disabled, so the popup and its download list open from any tab.

function iconSet(name) {
  return {
    16: `icons/${name}16.png`,
    32: `icons/${name}32.png`,
    48: `icons/${name}48.png`,
    128: `icons/${name}128.png`,
  };
}

function tabTitle(downloadable) {
  const summary = activeSummary([...jobs.values()]);
  const base = downloadable ? "Download this track as MP3" : "Open a track on YouTube Music to download";
  if (!summary) return base;
  const tracks = summary.count === 1 ? "1 track" : `${summary.count} tracks`;
  return `Downloading ${tracks}. Click to see progress.\n${base}`;
}

// The tab may be closed, discarded or prerendered by the time these run, which rejects with "No tab with id".
function ignore() {}

function refreshTab(tabId, url) {
  const downloadable = !!trackId(url);
  chrome.action.setIcon({ tabId, path: iconSet(downloadable ? "on" : "off") }).catch(ignore);
  chrome.action.setTitle({ tabId, title: tabTitle(downloadable) }).catch(ignore);
}

function refreshAllTabs() {
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
// Running: overall progress in red. Just finished: green "OK" for a moment.
// Failed: gray "ERR" until the popup is opened, so a failure isn't missed.

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

function refreshBadge() {
  const summary = activeSummary([...jobs.values()]);
  if (summary) setBadge(summary.starting ? "..." : `${summary.pct}%`, "#d62828");
  else if (unseenError) setBadge("ERR", "#6b6b6b");
  else if (doneFlash) setBadge("OK", "#2a9d3f");
  else setBadge("");
}

/** Called when a job stops running. */
function jobFinished(job) {
  if (job.state === "error") {
    unseenError = true;
    chrome.storage.session.set({ unseenError });
  } else {
    clearTimeout(badgeTimer);
    doneFlash = true;
    badgeTimer = setTimeout(() => {
      doneFlash = false;
      refreshBadge();
    }, DONE_BADGE_MS);
  }
}

function markSeen() {
  if (!unseenError) return;
  unseenError = false;
  chrome.storage.session.set({ unseenError });
  refreshBadge();
}

// ---------- job state (kept in local storage: it is the download history) ----------

const ready = restoreJobs();

async function restoreJobs() {
  const [{ jobs: saved = {} }, session] = await Promise.all([
    chrome.storage.local.get("jobs"),
    chrome.storage.session.get("unseenError"),
  ]);
  for (const [id, job] of Object.entries(saved)) {
    jobs.set(id, isActive(job) ? interruptedJob(job) : job);
  }
  unseenError = session.unseenError === true;
}

function persistJobs() {
  while (jobs.size > MAX_STORED_JOBS) {
    const oldest = [...jobs.entries()].find(([, job]) => !isActive(job));
    if (!oldest) break;
    jobs.delete(oldest[0]);
  }
  chrome.storage.local.set({ jobs: Object.fromEntries(jobs) });
}

/** Newest first, as the popup lists them. */
function jobList() {
  return [...jobs.values()].reverse();
}

function broadcast() {
  const list = jobList();
  for (const port of popups) port.postMessage({ type: "jobs", jobs: list });
}

function setJob(id, job) {
  const wasActive = isActive(jobs.get(id));
  jobs.set(id, job);
  persistJobs();
  if (wasActive && !isActive(job)) jobFinished(job);
  if (wasActive !== isActive(job)) refreshAllTabs();
  refreshBadge();
  broadcast();
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
  jobs.delete(id); // a new attempt moves to the top of the list
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

async function handlePopupCommand(port, msg) {
  await ready;
  switch (msg.cmd) {
    case "open":
      markSeen();
      port.postMessage({ type: "jobs", jobs: jobList() });
      return;
    case "download": {
      const id = trackId(msg.url);
      if (!id) return;
      const existing = jobs.get(id);
      if (isActive(existing)) broadcast();
      else startDownload(id, msg.title || existing?.title || "");
      return;
    }
    case "clear":
      for (const [id, job] of jobs) {
        if (!isActive(job)) jobs.delete(id);
      }
      persistJobs();
      markSeen();
      broadcast();
      return;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  popups.add(port);
  port.onMessage.addListener((msg) => handlePopupCommand(port, msg));
  port.onDisconnect.addListener(() => popups.delete(port));
});
