import assert from "node:assert/strict";
import { test } from "node:test";
import { FILTERS, filterCounts, playlistPct, sortJobs, summaryText, upcomingTracks } from "../../extension/src/manager.js";

const running = (id, at) => ({ id, state: "downloading", at });
const done = (id, at) => ({ id, state: "done", at });
const failed = (id, at) => ({ id, state: "error", at });

test("sortJobs puts running downloads first in a fixed order, then the most recent", () => {
  const jobs = [done("a", 10), running("z", 99), failed("b", 30), running("c", 1)];
  assert.deepEqual(sortJobs(jobs).map((job) => job.id), ["c", "z", "b", "a"]);
  // A progress message changes a running job's time, not its place.
  const later = [done("a", 10), running("z", 5), failed("b", 30), running("c", 200)];
  assert.deepEqual(sortJobs(later).map((job) => job.id), ["c", "z", "b", "a"]);
});

test("sortJobs leaves the given list alone", () => {
  const jobs = [done("a", 1), done("b", 2)];
  sortJobs(jobs);
  assert.deepEqual(jobs.map((job) => job.id), ["a", "b"]);
});

test("filters and their counts", () => {
  const jobs = [running("a", 1), { id: "b", state: "starting", at: 1 }, { id: "c", state: "converting", at: 1 }, done("d", 1), failed("e", 1)];
  assert.deepEqual(filterCounts(jobs), { all: 5, active: 3, done: 1, failed: 1 });
  assert.deepEqual(jobs.filter(FILTERS.failed).map((job) => job.id), ["e"]);
  assert.equal(summaryText(jobs), "3 running · 1 saved · 1 failed");
});

test("playlistPct doesn't count the track still downloading", () => {
  const tracks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.equal(playlistPct({ state: "downloading", next: 1, tracks }), 0);
  assert.equal(playlistPct({ state: "waiting", next: 1, tracks }), 25);
  assert.equal(playlistPct({ state: "done", next: 4, tracks }), 100);
  assert.equal(playlistPct({ state: "loading", next: 0, tracks: [] }), 0);
});

test("upcomingTracks leaves out what has started", () => {
  const tracks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(upcomingTracks({ next: 2, tracks }), [{ id: "c" }]);
  assert.deepEqual(upcomingTracks({ next: 3, tracks }), []);
});
