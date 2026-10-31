/** The pause between two tracks, to keep the request rate low. */
export const WAIT_MIN_MS = 50_000;
export const WAIT_MAX_MS = 70_000;

const RUNNING_STATES = new Set(["loading", "downloading", "waiting"]);

// Every following track would fail the same way, or make YouTube's rate limiting worse.
const STOPPING_CODES = new Set(["helper", "ffmpeg_missing", "disk", "network", "rate_limited", "bot_check", "extractor_broken"]);

export function randomWaitMs(random = Math.random) {
  return WAIT_MIN_MS + Math.floor(random() * (WAIT_MAX_MS - WAIT_MIN_MS + 1));
}

export function isRunning(playlist) {
  return !!playlist && RUNNING_STATES.has(playlist.state);
}

export function newPlaylist(id, title = "") {
  return { id, title, state: "loading", tracks: [], next: 0, failed: 0, currentId: "", wakeAt: 0, message: "" };
}

/** Apply the helper's answer to "list this playlist". */
export function listed(playlist, msg) {
  if (msg.type === "playlist") return { ...playlist, title: msg.title || playlist.title, tracks: msg.tracks || [] };
  return { ...playlist, state: "error", message: msg.message || "Couldn't read this playlist." };
}

export function startNext(playlist) {
  const track = playlist.tracks[playlist.next];
  return { ...playlist, state: "downloading", next: playlist.next + 1, currentId: track.id, wakeAt: 0 };
}

function waiting(playlist, waitMs, now) {
  return { ...playlist, state: "waiting", currentId: "", wakeAt: now + waitMs, message: "" };
}

/** The current track stopped running: wait for the next one, finish, or stop. */
export function trackFinished(playlist, job, waitMs, now = Date.now()) {
  const failed = job.state === "error";
  if (failed && STOPPING_CODES.has(job.code)) {
    // Resuming tries this track again.
    return { ...playlist, state: "stopped", next: playlist.next - 1, currentId: "", message: job.message };
  }
  const next = { ...playlist, failed: playlist.failed + (failed ? 1 : 0) };
  if (next.next >= next.tracks.length) return { ...next, state: "done", currentId: "" };
  return waiting(next, waitMs, now);
}

/** The user pressed Stop. A track that is already downloading is left to finish. */
export function stopped(playlist) {
  const state = playlist.next >= playlist.tracks.length ? "done" : "stopped";
  return { ...playlist, state, currentId: "", wakeAt: 0, message: "" };
}

/** The wait also applies here, so a resume keeps the same pace. */
export function resumed(playlist, waitMs, now = Date.now()) {
  return waiting(playlist, waitMs, now);
}

/** Back after the browser or service worker went away: nothing is running anymore. */
export function restored(playlist, waitMs, now = Date.now()) {
  switch (playlist.state) {
    case "loading":
      return { ...playlist, state: "error", message: "Interrupted. Try again." };
    case "downloading":
      return waiting({ ...playlist, next: playlist.next - 1 }, waitMs, now);
    default:
      return playlist;
  }
}

export function playlistText(playlist, now = Date.now()) {
  const total = playlist.tracks.length;
  switch (playlist.state) {
    case "loading":
      return "Reading the playlist…";
    case "downloading":
      return `Track ${playlist.next} of ${total}`;
    case "waiting": {
      const seconds = Math.max(0, Math.ceil((playlist.wakeAt - now) / 1000));
      return `${playlist.next} of ${total} done · next in ${seconds} s`;
    }
    case "done": {
      const saved = playlist.next - playlist.failed;
      return playlist.failed ? `${saved} of ${total} saved, ${playlist.failed} failed` : `All ${total} tracks saved`;
    }
    case "stopped": {
      const progress = `Stopped after ${playlist.next} of ${total}.`;
      return playlist.message ? `${playlist.message} ${progress}` : progress;
    }
    case "error":
      return playlist.message;
    default:
      return "";
  }
}
