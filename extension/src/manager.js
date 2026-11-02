import { isActive } from "./jobs.js";

export const FILTERS = {
  all: () => true,
  active: isActive,
  done: (job) => job.state === "done",
  failed: (job) => job.state === "error",
};

/**
 * Running downloads first, then the most recent. Running ones keep a fixed order,
 * because their time changes with every progress message and the rows would jump around.
 */
export function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    if (isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1;
    if (isActive(a)) return a.id < b.id ? -1 : 1;
    return b.at - a.at;
  });
}

/** How many jobs each filter would show. */
export function filterCounts(jobs) {
  const counts = {};
  for (const [name, matches] of Object.entries(FILTERS)) counts[name] = jobs.filter(matches).length;
  return counts;
}

export function summaryText(jobs) {
  const { active, done, failed } = filterCounts(jobs);
  return `${active} running · ${done} saved · ${failed} failed`;
}

/** Share of the playlist that is finished. The track being downloaded doesn't count yet. */
export function playlistPct(playlist) {
  const total = playlist.tracks.length;
  if (!total) return 0;
  const finished = playlist.next - (playlist.state === "downloading" ? 1 : 0);
  return Math.round((finished / total) * 100);
}

/** The tracks that haven't started yet. */
export function upcomingTracks(playlist) {
  return playlist.tracks.slice(playlist.next);
}
