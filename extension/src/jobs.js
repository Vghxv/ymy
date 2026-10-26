const ACTIVE_STATES = new Set(["starting", "downloading", "converting"]);

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
  return { state: "none", title: "No track on this tab", pct: 0, message: "Open a track on YouTube Music to download it." };
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
    case "done":
      return "Done";
    case "error":
      return job.message || "Download failed.";
    case "none":
      return job.message;
    default:
      return "";
  }
}

/** "just now", "5 min ago", "2 hours ago", "3 days ago" */
export function timeAgo(then, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The status line of a job in the popup's download list. */
export function historyText(job, now = Date.now()) {
  if (job.state === "done") return `Saved · ${timeAgo(job.at, now)}`;
  if (job.state === "error") return `${timeAgo(job.at, now)} · ${statusText(job)}`;
  return statusText(job);
}

/** All running jobs together, for the toolbar badge, or null when nothing is running. */
export function activeSummary(jobs) {
  const active = jobs.filter(isActive);
  if (!active.length) return null;
  const pct = Math.round(active.reduce((sum, job) => sum + (job.pct || 0), 0) / active.length);
  return { count: active.length, pct, starting: active.every((job) => job.state === "starting") };
}
