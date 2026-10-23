import { idleJob, noTrackJob, statusText } from "../src/jobs.js";
import { HOST_NAME } from "../src/native.js";
import { getAutoCheck, getOutputDir } from "../src/settings.js";
import { canonicalUrl, cleanTabTitle, trackId } from "../src/track.js";

const card = document.getElementById("card");
const titleEl = document.getElementById("title");
const fillEl = document.getElementById("fill");
const statusEl = document.getElementById("status");
const actionEl = document.getElementById("action");
const savedEl = document.getElementById("saved");
const checkEl = document.getElementById("check");

const INDETERMINATE = new Set(["starting"]);
const ACTION_LABELS = { idle: "Download", error: "Retry", done: "Download again" };
const CHECK_TEXT = {
  checking: "Checking folder…",
  missing: "Not in the download folder",
  failed: "Couldn't check the folder",
};

let port = null;
let shown = null; // last job rendered
let existingPath = ""; // where this track already sits in the download folder, if anywhere
let checkState = ""; // "", "checking", "missing" or "failed"

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
  statusEl.textContent = alreadySaved ? "Already downloaded" : (idle && CHECK_TEXT[checkState]) || statusText(job);
  statusEl.title = alreadySaved ? existingPath : job.path || "";
  const label = alreadySaved ? ACTION_LABELS.done : ACTION_LABELS[job.state];
  actionEl.hidden = !label || !port;
  if (label) actionEl.textContent = label;
}

/** Ask the helper whether this exact track is already somewhere under the download folder. */
async function checkSaved(id) {
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

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tab && trackId(tab.url);
  if (!id) {
    render(noTrackJob());
    return;
  }

  const title = cleanTabTitle(tab.title);
  port = chrome.runtime.connect({ name: "popup" });
  render(idleJob(title));
  port.onMessage.addListener((msg) => {
    if (msg.type === "job") render(msg.job);
  });
  actionEl.addEventListener("click", () => {
    actionEl.hidden = true;
    port.postMessage({ cmd: "download", url: tab.url, title });
  });
  checkEl.addEventListener("click", () => checkSaved(id));
  port.postMessage({ cmd: "open", url: tab.url, title });
  // Searching the folder can be slow and touches network shares, so it's opt-in (see the options page).
  if (await getAutoCheck()) checkSaved(id);
}

main();
