import { historyText, isActive } from "../src/jobs.js";
import { FILTERS, filterCounts, playlistPct, sortJobs, summaryText, upcomingTracks } from "../src/manager.js";
import { HOST_NAME, helperErrorMessage } from "../src/native.js";
import { isRunning, playlistText } from "../src/playlist.js";
import { getOutputDir } from "../src/settings.js";
import { canonicalUrl } from "../src/track.js";

const FILTER_LABELS = { all: "All", active: "Running", done: "Saved", failed: "Failed" };
const EMPTY_TEXT = {
  all: "Nothing downloaded yet.",
  active: "Nothing is downloading.",
  done: "No saved downloads in this list.",
  failed: "No failed downloads.",
};
const OPEN_FAILED = "Couldn't open the folder";

const summaryEl = document.getElementById("summary");
const noticeEl = document.getElementById("notice");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const clearEl = document.getElementById("clear");
const itemTemplate = document.getElementById("item");
const filterEls = [...document.querySelectorAll(".filter")];
const playlistEl = document.getElementById("playlist");
const playlistTitleEl = document.getElementById("playlist-title");
const playlistStatusEl = document.getElementById("playlist-status");
const playlistFillEl = document.getElementById("playlist-fill");
const playlistActionEl = document.getElementById("playlist-action");
const playlistDismissEl = document.getElementById("playlist-dismiss");
const upcomingEl = document.getElementById("upcoming");
const upcomingSummaryEl = document.getElementById("upcoming-summary");
const upcomingListEl = document.getElementById("upcoming-list");

let port = null;
let jobs = [];
let playlist = null;
let filter = "all";
let shownUpcoming = ""; // which upcoming tracks are listed, so a long list isn't rebuilt every second
const rows = new Map(); // job id -> list item, kept so a click isn't lost to a progress update

function connect() {
  port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "jobs") setJobs(msg.jobs);
    if (msg.type === "playlist") setPlaylist(msg.playlist);
  });
  // The service worker stops when idle. That's fine: updates also arrive through storage (see main).
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

function setJobs(list) {
  jobs = sortJobs(list);
  renderJobs();
}

function setPlaylist(next) {
  playlist = next;
  renderPlaylist();
}

function createRow(id) {
  const row = itemTemplate.content.firstElementChild.cloneNode(true);
  const titleLink = row.querySelector(".job-title");
  titleLink.href = canonicalUrl(id);
  titleLink.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: canonicalUrl(id) });
  });
  row.querySelector(".job-folder").addEventListener("click", () => {
    openFolder(jobs.find((job) => job.id === id)?.path);
  });
  row.querySelector(".job-retry").addEventListener("click", (event) => {
    event.currentTarget.hidden = true;
    const job = jobs.find((j) => j.id === id);
    send({ cmd: "download", url: canonicalUrl(id), title: job?.title });
  });
  row.querySelector(".job-remove").addEventListener("click", () => send({ cmd: "remove", id }));
  return row;
}

function updateRow(row, job, now) {
  row.dataset.state = job.state;
  const title = job.title || "YouTube Music track";
  const titleLink = row.querySelector(".job-title");
  titleLink.textContent = title;
  titleLink.title = `${title}\nOpen on YouTube Music`;
  row.querySelector(".fill").style.width = job.state === "starting" ? "" : `${job.pct || 0}%`;
  const status = row.querySelector(".job-status");
  status.textContent = historyText(job, now);
  status.title = job.path || "";
  row.querySelector(".job-folder").hidden = job.state !== "done" || !job.path;
  row.querySelector(".job-retry").hidden = job.state !== "error";
  row.querySelector(".job-remove").hidden = isActive(job);
}

function renderJobs() {
  const now = Date.now();
  const counts = filterCounts(jobs);
  summaryEl.textContent = summaryText(jobs);
  for (const el of filterEls) {
    const name = el.dataset.filter;
    el.textContent = `${FILTER_LABELS[name]} (${counts[name]})`;
    el.setAttribute("aria-pressed", String(name === filter));
  }
  clearEl.hidden = !jobs.some((job) => !isActive(job));

  const visible = jobs.filter(FILTERS[filter]);
  for (const id of rows.keys()) {
    if (!visible.some((job) => job.id === id)) rows.delete(id);
  }
  const wanted = visible.map((job) => {
    if (!rows.has(job.id)) rows.set(job.id, createRow(job.id));
    const row = rows.get(job.id);
    updateRow(row, job, now);
    return row;
  });
  // Moving a row would drop the keyboard focus inside it, so only touch the DOM when the order changed.
  if (wanted.length !== listEl.children.length || wanted.some((row, i) => listEl.children[i] !== row)) {
    listEl.replaceChildren(...wanted);
  }
  emptyEl.hidden = visible.length > 0;
  emptyEl.textContent = EMPTY_TEXT[filter];
}

function renderUpcoming() {
  const tracks = playlist ? upcomingTracks(playlist) : [];
  upcomingEl.hidden = !isRunning(playlist) || !tracks.length;
  if (upcomingEl.hidden) return;
  const key = `${playlist.id}:${playlist.next}`;
  if (key === shownUpcoming) return;
  shownUpcoming = key;
  upcomingSummaryEl.textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"} to go`;
  upcomingListEl.start = playlist.next + 1;
  upcomingListEl.replaceChildren(
    ...tracks.map((track) => {
      const item = document.createElement("li");
      item.textContent = track.title || track.id;
      return item;
    }),
  );
}

function renderPlaylist() {
  playlistEl.hidden = !playlist;
  if (!playlist) return;
  const title = playlist.title || "This playlist";
  playlistEl.dataset.state = playlist.state;
  playlistTitleEl.textContent = title;
  playlistTitleEl.title = title;
  playlistStatusEl.textContent = playlistText(playlist);
  playlistFillEl.style.width = `${playlistPct(playlist)}%`;
  playlistDismissEl.hidden = isRunning(playlist);
  const label = isRunning(playlist) ? "Stop" : playlist.state === "stopped" ? "Resume" : "";
  playlistActionEl.hidden = !label;
  playlistActionEl.textContent = label;
  renderUpcoming();
}

/** Show the download folder in Explorer, with the given MP3 selected if there is one. */
async function openFolder(path = "") {
  let error = "";
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, {
      type: "open",
      path,
      output_dir: await getOutputDir(),
    });
    if (!reply || reply.type !== "opened") error = (reply && reply.message) || OPEN_FAILED;
  } catch (failure) {
    error = helperErrorMessage(failure.message);
  }
  noticeEl.hidden = !error;
  noticeEl.textContent = error;
}

function main() {
  // Everything the background does is written to storage, so this keeps the page live
  // without keeping the service worker awake, and works for downloads started anywhere.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.jobs) setJobs(Object.values(changes.jobs.newValue || {}));
    if (changes.playlist) setPlaylist(changes.playlist.newValue || null);
  });
  // Also wakes the worker, which turns downloads cut off by a browser restart into errors.
  connect();

  document.getElementById("open").addEventListener("click", () => openFolder());
  clearEl.addEventListener("click", () => send({ cmd: "clear" }));
  for (const el of filterEls) {
    el.addEventListener("click", () => {
      filter = el.dataset.filter;
      renderJobs();
    });
  }
  playlistActionEl.addEventListener("click", () => {
    playlistActionEl.hidden = true;
    send({ cmd: isRunning(playlist) ? "playlistStop" : "playlistResume" });
  });
  playlistDismissEl.addEventListener("click", () => send({ cmd: "playlistDismiss" }));

  // Keep the countdown and "5 min ago" current.
  setInterval(() => {
    if (isRunning(playlist)) renderPlaylist();
  }, 1000);
  setInterval(renderJobs, 30_000);
  renderJobs();
}

main();
