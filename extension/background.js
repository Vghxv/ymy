import { HOST_NAME, helperErrorMessage } from "./src/native.js";
import { getOutputDir, getUpdateCheck } from "./src/settings.js";
import { canonicalUrl, playlistId, playlistUrl, trackId } from "./src/track.js";
import { activeSummary, interruptedJob, isActive, newJob, reduce } from "./src/jobs.js";
import { isRunning, listed, newPlaylist, randomWaitMs, restored, resumed, startNext, stopped, subfolder, trackFinished } from "./src/playlist.js";
import { RELEASES_API, availableUpdate, isNewer, reduceUpdate } from "./src/update.js";

const MAX_STORED_JOBS = 200;
const DONE_BADGE_MS = 4000;
const UPDATE_ALARM = "update-check";
const UPDATE_CHECK_MINUTES = 24 * 60;
const UPDATE_NOTIFICATION = "update";
const RELOAD_DELAY_MS = 1500; // long enough for an open popup to show "Updated"
const PLAYLIST_ALARM = "playlist-next";

const jobs = new Map(); // track id -> job, oldest first
const helpers = new Map(); // track id -> native port
const popups = new Set(); // popup ports

let badgeTimer = null;
let doneFlash = false; // "OK" shown for a moment after the last download finished
let unseenError = false; // a download failed and no popup has been opened since
let selfUpdate = null; // { tag, version, url, state, step, message } while a newer release is known
let playlist = null; // the playlist being downloaded or just finished, one at a time (see src/playlist.js)

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

function baseTitle(url) {
  if (trackId(url)) return "Download this track as MP3";
  if (playlistId(url)) return "Download this playlist as MP3s";
  return "Open a track on YouTube Music to download";
}

function tabTitle(url) {
  const summary = activeSummary([...jobs.values()]);
  const base = baseTitle(url);
  if (!summary) return base;
  const tracks = summary.count === 1 ? "1 track" : `${summary.count} tracks`;
  return `Downloading ${tracks}. Click to see progress.\n${base}`;
}

// The tab may be closed, discarded or prerendered by the time these run, which rejects with "No tab with id".
function ignore() {}

function refreshTab(tabId, url) {
  const downloadable = !!trackId(url) || !!playlistId(url);
  chrome.action.setIcon({ tabId, path: iconSet(downloadable ? "on" : "off") }).catch(ignore);
  chrome.action.setTitle({ tabId, title: tabTitle(url) }).catch(ignore);
}

function refreshAllTabs() {
  chrome.tabs.query({}, (tabs) => tabs.forEach((tab) => refreshTab(tab.id, tab.url)));
}

chrome.runtime.onInstalled.addListener(refreshAllTabs);
chrome.runtime.onStartup.addListener(refreshAllTabs);
chrome.tabs.onUpdated.addListener((tabId, _change, tab) => refreshTab(tabId, tab.url));
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    refreshTab(tabId, tab.url);
  } catch {
    // Closed already, or Chrome's "Tabs cannot be edited right now" while a tab is dragged.
  }
});

// ---------- badge ----------
// Running: overall progress in red. Just finished: green "OK" for a moment.
// Failed: gray "ERR" until the popup is opened, so a failure isn't missed.
// Waiting for a playlist's next track: red "...".

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

function refreshBadge() {
  const summary = activeSummary([...jobs.values()]);
  if (summary) setBadge(summary.starting ? "..." : `${summary.pct}%`, "#d62828");
  else if (unseenError) setBadge("ERR", "#6b6b6b");
  else if (isRunning(playlist)) setBadge("...", "#d62828");
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
  const [{ jobs: saved = {}, update: savedUpdate = null, playlist: savedPlaylist = null }, session] = await Promise.all([
    chrome.storage.local.get(["jobs", "update", "playlist"]),
    chrome.storage.session.get("unseenError"),
  ]);
  for (const [id, job] of Object.entries(saved)) {
    jobs.set(id, isActive(job) ? interruptedJob(job) : job);
  }
  unseenError = session.unseenError === true;
  // Once the extension runs the new version, the stored update is done with.
  if (savedUpdate && isNewer(savedUpdate.tag, chrome.runtime.getManifest().version)) {
    selfUpdate = { ...savedUpdate, state: "available", step: "", message: "" };
  } else if (savedUpdate) {
    chrome.storage.local.remove("update");
  }
  if (savedPlaylist) await restorePlaylist(savedPlaylist);
}

async function restorePlaylist(saved) {
  playlist = restored(saved, randomWaitMs());
  if (playlist !== saved) chrome.storage.local.set({ playlist });
  // Alarms usually survive a browser restart, but that isn't guaranteed.
  if (playlist.state === "waiting" && !(await chrome.alarms.get(PLAYLIST_ALARM))) schedulePlaylist();
  refreshBadge();
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

/** A popup can close at any moment, before its onDisconnect has run. */
function send(port, msg) {
  try {
    port.postMessage(msg);
  } catch {
    popups.delete(port);
  }
}

function broadcast() {
  const list = jobList();
  for (const port of popups) send(port, { type: "jobs", jobs: list });
}

function broadcastUpdate() {
  for (const port of popups) send(port, { type: "update", update: selfUpdate });
}

function setJob(id, job) {
  const wasActive = isActive(jobs.get(id));
  jobs.set(id, job);
  persistJobs();
  if (wasActive && !isActive(job)) {
    jobFinished(job);
    if (playlist?.currentId === id) playlistTrackFinished(job);
  }
  if (wasActive !== isActive(job)) refreshAllTabs();
  refreshBadge();
  broadcast();
}

/** Apply one helper message to the stored job. */
function update(id, msg) {
  // A late message for a job that was cleared from the list would otherwise come back as a job without an id.
  if (!jobs.has(id)) return;
  setJob(id, reduce(jobs.get(id), msg));
}

function fail(id, reason) {
  update(id, { type: "error", code: "helper", message: helperErrorMessage(reason) });
}

// ---------- talking to the helper ----------

async function startDownload(id, titleHint, folder = "") {
  helpers.get(id)?.disconnect();
  jobs.delete(id); // a new attempt moves to the top of the list
  setJob(id, { ...newJob(id, titleHint), subfolder: folder }); // kept so a retry saves to the same place

  let outputDir;
  let port;
  try {
    outputDir = await getOutputDir();
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

  port.postMessage({ type: "download", url: canonicalUrl(id), output_dir: outputDir, subfolder: folder });
}

// ---------- playlists ----------
// The helper lists the tracks; each one then downloads like a single track, with a random
// wait in between. The service worker stops during a wait, so the state is kept in local
// storage and an alarm wakes it for the next track. A browser restart picks up where it left off.

function setPlaylist(next) {
  playlist = next;
  if (playlist) chrome.storage.local.set({ playlist });
  else chrome.storage.local.remove("playlist");
  refreshBadge();
  for (const port of popups) send(port, { type: "playlist", playlist });
}

function schedulePlaylist() {
  chrome.alarms.create(PLAYLIST_ALARM, { when: playlist.wakeAt });
}

function waitForNextTrack(next) {
  setPlaylist(next);
  if (playlist.state === "waiting") schedulePlaylist();
}

async function startPlaylist(id, titleHint) {
  setPlaylist(newPlaylist(id, titleHint));
  const stillLoading = () => playlist?.state === "loading" && playlist.id === id;

  let outputDir;
  let port;
  try {
    outputDir = await getOutputDir();
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (error) {
    if (stillLoading()) setPlaylist(listed(playlist, { type: "error", message: helperErrorMessage(error.message) }));
    return;
  }
  port.onMessage.addListener((msg) => {
    if (!stillLoading()) return;
    setPlaylist(listed(playlist, msg));
    if (stillLoading()) downloadNextTrack();
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message;
    if (stillLoading()) setPlaylist(listed(playlist, { type: "error", message: helperErrorMessage(reason) }));
  });
  // The helper leaves out the tracks that are already in the playlist's folder.
  port.postMessage({ type: "playlist", url: playlistUrl(id), output_dir: outputDir, subfolder: subfolder(playlist) });
}

function downloadNextTrack() {
  const { id, title } = playlist.tracks[playlist.next];
  setPlaylist(startNext(playlist));
  // Started by hand in the meantime: that download counts as this track's.
  const existing = jobs.get(id);
  if (!isActive(existing)) startDownload(id, title || existing?.title || "", subfolder(playlist));
}

function playlistTrackFinished(job) {
  waitForNextTrack(trackFinished(playlist, job, randomWaitMs()));
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== PLAYLIST_ALARM) return;
  await ready;
  if (playlist?.state === "waiting") downloadNextTrack();
});

function handlePlaylistCommand(msg) {
  switch (msg.cmd) {
    case "playlist": {
      const id = playlistId(msg.url);
      if (!id || playlist || selfUpdate?.state === "updating") return;
      startPlaylist(id, msg.title || "");
      return;
    }
    case "playlistStop":
      if (!isRunning(playlist)) return;
      chrome.alarms.clear(PLAYLIST_ALARM);
      // Nothing to come back to when it is still being listed.
      setPlaylist(playlist.state === "loading" ? null : stopped(playlist));
      return;
    case "playlistResume":
      if (playlist?.state !== "stopped" || selfUpdate?.state === "updating") return;
      waitForNextTrack(resumed(playlist, randomWaitMs()));
      return;
    case "playlistDismiss":
      if (!isRunning(playlist)) setPlaylist(null);
      return;
  }
}

// ---------- updates ----------
// Once a day, ask GitHub for the latest release. A newer one gets a notification with an
// "Update now" button and a banner in the popup. The helper replaces the project files,
// then the extension reloads itself from them.

function setUpdate(next) {
  selfUpdate = next;
  if (selfUpdate) chrome.storage.local.set({ update: selfUpdate });
  else chrome.storage.local.remove("update");
  broadcastUpdate();
}

/** Ask GitHub for the latest release. Returns the known update, or null when this is the latest version. */
async function checkForUpdate() {
  const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const found = availableUpdate(await response.json(), chrome.runtime.getManifest().version);
  await ready;
  if (selfUpdate?.state === "updating" || selfUpdate?.state === "updated") return selfUpdate;
  if (!found) {
    setUpdate(null);
    return null;
  }
  if (selfUpdate?.tag === found.tag) return selfUpdate; // already announced
  setUpdate({ ...found, state: "available", step: "", message: "" });
  chrome.notifications.create(UPDATE_NOTIFICATION, {
    type: "basic",
    iconUrl: "icons/on128.png",
    title: `ymy ${found.version} is available`,
    message: "Update now, or later from the toolbar popup.",
    buttons: [{ title: "Update now" }, { title: "What's new" }],
  });
  return selfUpdate;
}

async function startUpdate() {
  await ready;
  if (!selfUpdate || selfUpdate.state === "updating" || selfUpdate.state === "updated") return;
  // The helper replaces its own files and yt-dlp's, which a running download is using.
  if ([...jobs.values()].some(isActive) || isRunning(playlist)) {
    setUpdate({ ...selfUpdate, state: "error", message: "Wait for the downloads to finish, then update." });
    return;
  }
  setUpdate({ ...selfUpdate, state: "updating", step: "", message: "" });

  let port;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (error) {
    setUpdate({ ...selfUpdate, state: "error", message: helperErrorMessage(error.message) });
    return;
  }
  port.onMessage.addListener((msg) => {
    setUpdate(reduceUpdate(selfUpdate, msg));
    if (msg.type === "updated") setTimeout(() => chrome.runtime.reload(), RELOAD_DELAY_MS);
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message;
    if (selfUpdate?.state === "updating") setUpdate({ ...selfUpdate, state: "error", message: helperErrorMessage(reason) });
  });
  port.postMessage({ type: "update", tag: selfUpdate.tag });
}

function openReleasePage() {
  if (selfUpdate?.url) chrome.tabs.create({ url: selfUpdate.url });
}

chrome.alarms.get(UPDATE_ALARM).then((alarm) => {
  if (!alarm) chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_CHECK_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== UPDATE_ALARM || !(await getUpdateCheck())) return;
  // Offline or rate-limited: the next alarm tries again.
  checkForUpdate().catch((error) => console.warn("update check failed:", error.message));
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id !== UPDATE_NOTIFICATION) return;
  chrome.notifications.clear(id);
  if (index === 0) startUpdate();
  else openReleasePage();
});

chrome.notifications.onClicked.addListener((id) => {
  if (id !== UPDATE_NOTIFICATION) return;
  chrome.notifications.clear(id);
  openReleasePage();
});

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  // Reloading an unpacked extension also counts as an "update", with the same version.
  if (reason !== "update" || previousVersion === chrome.runtime.getManifest().version) return;
  chrome.notifications.create("updated", {
    type: "basic",
    iconUrl: "icons/on128.png",
    title: `ymy is now ${chrome.runtime.getManifest().version}`,
    message: "Restart the browser if downloads don't work.",
  });
});

// ---------- popup ----------

async function handlePopupCommand(port, msg) {
  await ready;
  switch (msg.cmd) {
    case "open":
      markSeen();
      send(port, { type: "jobs", jobs: jobList() });
      send(port, { type: "update", update: selfUpdate });
      send(port, { type: "playlist", playlist });
      return;
    case "playlist":
    case "playlistStop":
    case "playlistResume":
    case "playlistDismiss":
      handlePlaylistCommand(msg);
      send(port, { type: "playlist", playlist }); // also for a command that changed nothing
      return;
    case "download": {
      const id = trackId(msg.url);
      if (!id || selfUpdate?.state === "updating") return;
      const existing = jobs.get(id);
      if (isActive(existing)) broadcast();
      else startDownload(id, msg.title || existing?.title || "", existing?.subfolder);
      return;
    }
    case "remove":
      if (!jobs.has(msg.id) || isActive(jobs.get(msg.id))) return;
      jobs.delete(msg.id);
      persistJobs();
      broadcast();
      return;
    case "clear":
      for (const [id, job] of jobs) {
        if (!isActive(job)) jobs.delete(id);
      }
      persistJobs();
      markSeen();
      broadcast();
      return;
    case "update":
      startUpdate();
      return;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  popups.add(port);
  port.onMessage.addListener((msg) => handlePopupCommand(port, msg).catch((error) => console.error(error)));
  port.onDisconnect.addListener(() => popups.delete(port));
});

// The options page's "Check now" button.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.cmd !== "checkUpdate") return false;
  checkForUpdate().then(
    (found) => sendResponse({ update: found }),
    (error) => sendResponse({ error: error.message }),
  );
  return true; // answered asynchronously
});
