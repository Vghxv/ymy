import { historyText, idleJob, isActive, noTrackJob, shownOnOpen, statusText } from "../src/jobs.js";
import { HOST_NAME, helperErrorMessage } from "../src/native.js";
import { getAutoCheck, getOutputDir } from "../src/settings.js";
import { canonicalUrl, cleanTabTitle, trackId } from "../src/track.js";

const card = document.getElementById("card");
const titleEl = document.getElementById("title");
const fillEl = document.getElementById("fill");
const statusEl = document.getElementById("status");
const actionEl = document.getElementById("action");
const savedEl = document.getElementById("saved");
const checkEl = document.getElementById("check");
const openEl = document.getElementById("open");
const historyEl = document.getElementById("history");
const listEl = document.getElementById("list");
const clearEl = document.getElementById("clear");
const itemTemplate = document.getElementById("item");

const INDETERMINATE = new Set(["starting"]);
const ACTION_LABELS = { idle: "Download", error: "Retry", done: "Download again" };
const CHECK_TEXT = {
  checking: "Checking folder…",
  missing: "Not in the download folder",
  failed: "Couldn't check the folder",
};
const OPEN_FAILED = "Couldn't open the folder";

let port = null;
let tabTrack = null; // { id, url, title } of the track in this tab, if any
let jobs = []; // every download the background knows about, newest first
let received = false; // whether the background has sent the job list yet
let follow = false; // whether the card shows this track's download instead of the idle "Download" state
let shown = null; // last job rendered in the card
let existingPath = ""; // where this track already sits in the download folder, if anywhere
let checkState = ""; // "", "checking", "missing" or "failed"
let openError = ""; // why the last "Open folder" click failed

/** The job the card shows: this tab's download, the idle state, or the no-track hint. */
function cardJob() {
  if (!tabTrack) return noTrackJob();
  const job = jobs.find((j) => j.id === tabTrack.id);
  return follow && job ? job : idleJob(tabTrack.title);
}

function render(job) {
  shown = job;
  const title = job.title || "YouTube Music track";
  titleEl.textContent = title;
  titleEl.title = title;
  card.dataset.state = job.state;
  const idle = job.state === "idle";
  const alreadySaved = !!existingPath && idle;
  savedEl.hidden = !alreadySaved;
  savedEl.title = existingPath;
  checkEl.hidden = !idle || !!existingPath || checkState === "checking" || checkState === "missing";
  fillEl.style.width = INDETERMINATE.has(job.state) ? "" : `${job.pct || 0}%`;
  statusEl.textContent =
    openError || (alreadySaved ? "Already downloaded" : (idle && CHECK_TEXT[checkState]) || statusText(job));
  statusEl.title = alreadySaved ? existingPath : job.path || "";
  const label = alreadySaved ? ACTION_LABELS.done : ACTION_LABELS[job.state];
  actionEl.hidden = !label || !tabTrack;
  if (label) actionEl.textContent = label;
}

function renderItem(job, now) {
  const item = itemTemplate.content.firstElementChild.cloneNode(true);
  item.dataset.state = job.state;
  const title = job.title || "YouTube Music track";
  const titleLink = item.querySelector(".item-title");
  titleLink.textContent = title;
  titleLink.title = `${title}\nOpen on YouTube Music`;
  titleLink.href = canonicalUrl(job.id);
  titleLink.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: canonicalUrl(job.id) });
  });

  item.querySelector(".fill").style.width = INDETERMINATE.has(job.state) ? "" : `${job.pct || 0}%`;
  const status = item.querySelector(".item-status");
  status.textContent = historyText(job, now);
  status.title = job.path || job.message || "";

  const folder = item.querySelector(".item-folder");
  folder.hidden = job.state !== "done" || !job.path;
  folder.addEventListener("click", () => openFolder(job.path));

  const retry = item.querySelector(".item-retry");
  retry.hidden = job.state !== "error";
  retry.addEventListener("click", () => {
    retry.hidden = true;
    send({ cmd: "download", url: canonicalUrl(job.id), title: job.title });
  });
  return item;
}

/** The list under the card: every download except the one the card already shows. */
function renderList() {
  const now = Date.now();
  const others = jobs.filter((job) => job !== shown);
  listEl.replaceChildren(...others.map((job) => renderItem(job, now)));
  historyEl.hidden = !others.length;
  clearEl.hidden = !jobs.some((job) => !isActive(job));
}

function renderAll() {
  render(cardJob());
  renderList();
}

function onJobs(list) {
  const first = !received;
  received = true;
  jobs = list;
  const job = tabTrack && jobs.find((j) => j.id === tabTrack.id);
  // When the popup opens, a finished download is only shown for a short while (see shownOnOpen).
  // After that, whatever happens to this track while the popup is open is shown live.
  if (first) follow = shownOnOpen(job);
  if (isActive(job)) follow = true;
  renderAll();
}

/** Show the download folder in Explorer, with the given MP3 selected (or this track's, when we know where it is). */
async function openFolder(selected) {
  openError = "";
  const path = selected || existingPath || (shown && shown.state === "done" && shown.path) || "";
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      type: "open",
      path,
      output_dir: await getOutputDir(),
    });
    if (!reply || reply.type !== "opened") openError = (reply && reply.message) || OPEN_FAILED;
  } catch (error) {
    openError = helperErrorMessage(error.message);
  }
  if (shown) render(shown);
}

/** Ask the helper whether this exact track is already somewhere under the download folder. */
async function checkSaved(id) {
  openError = "";
  checkState = "checking";
  if (shown) render(shown);
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      type: "check",
      url: canonicalUrl(id),
      output_dir: await getOutputDir(),
    });
    if (reply && reply.type === "found" && reply.path) {
      existingPath = reply.path;
      checkState = "";
    } else {
      checkState = "missing";
    }
  } catch {
    // No helper or it failed. Downloading reports the real error.
    checkState = "failed";
  }
  if (shown) render(shown);
}

function connect() {
  port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "jobs") onJobs(msg.jobs);
  });
  // The service worker stops when idle and takes the port with it, even while the popup stays open.
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    port = null;
  });
  port.postMessage({ cmd: "open" });
}

/** Send a command to the background, reconnecting (and waking it) if it went away. */
function send(msg) {
  if (!port) connect();
  port.postMessage(msg);
}

async function main() {
  openEl.addEventListener("click", () => openFolder());
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tab && trackId(tab.url);
  if (id) tabTrack = { id, url: tab.url, title: cleanTabTitle(tab.title) };
  renderAll();

  // Connect on every tab, so downloads started elsewhere can be followed from here.
  connect();
  clearEl.addEventListener("click", () => send({ cmd: "clear" }));
  // Keep "5 min ago" current while the popup stays open.
  setInterval(renderList, 30_000);
  if (!tabTrack) return;

  actionEl.addEventListener("click", () => {
    openError = "";
    actionEl.hidden = true;
    follow = true;
    send({ cmd: "download", url: tabTrack.url, title: tabTrack.title });
  });
  checkEl.addEventListener("click", () => checkSaved(id));
  // Searching the folder can be slow and touches network shares, so it's opt-in (see the options page).
  if (await getAutoCheck()) checkSaved(id);
}

main();
