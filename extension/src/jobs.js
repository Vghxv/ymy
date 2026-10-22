const ACTIVE_STATES = new Set(["starting", "downloading", "converting", "updating"]);

/** How long a finished job is shown again when the popup is reopened. */
export const DONE_SHOWN_MS = 30_000;

export function isActive(job) {
  return !!job && ACTIVE_STATES.has(job.state);
}

export function newJob(id, title = "", now = Date.now()) {
  return { id, title, state: "starting", pct: 0, message: "", path: "", at: now };
}

/** What the popup shows before anything is downloaded. */
export function idleJob(title = "") {
  return { state: "idle", title, pct: 0 };
}

/** What the popup shows on a tab that isn't a track page. */
export function noTrackJob() {
  return { state: "error", title: "", pct: 0, message: "Open a track on YouTube Music first." };
}

export function interruptedJob(job, now = Date.now()) {
  return { ...job, state: "error", message: "Interrupted. Try again.", at: now };
}

/** Apply one message from the helper to a job and return the new job. */
export function reduce(job, msg, now = Date.now()) {
  const next = { ...job, at: now };
  switch (msg && msg.type) {
    case "info":
      if (msg.title) next.title = msg.title;
      return next;
    case "progress":
      if (ACTIVE_STATES.has(msg.stage)) next.state = msg.stage;
      next.pct = Math.max(0, Math.min(100, Math.round(Number(msg.pct) || 0)));
      return next;
    case "done":
      return { ...next, state: "done", pct: 100, message: "", path: msg.path || "" };
    case "error":
      return { ...next, state: "error", message: msg.message || "Download failed." };
    default:
      return job;
  }
}

/** Whether a popup opened now should show this job instead of the idle "Download" state. */
export function shownOnOpen(job, now = Date.now()) {
  if (!job) return false;
  if (isActive(job) || job.state === "error") return true;
  if (job.state === "done") return now - job.at <= DONE_SHOWN_MS;
  return false;
}

export function statusText(job) {
  switch (job.state) {
    case "idle":
      return "Ready to download";
    case "starting":
      return "Starting…";
    case "downloading":
      return `Downloading… ${job.pct}%`;
    case "converting":
      return "Converting to MP3…";
    case "updating":
      return "Updating downloader…";
    case "done":
      return "Done";
    case "error":
      return job.message || "Download failed.";
    default:
      return "";
  }
}
