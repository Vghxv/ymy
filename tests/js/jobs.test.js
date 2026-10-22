import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DONE_SHOWN_MS,
  idleJob,
  interruptedJob,
  isActive,
  newJob,
  noTrackJob,
  reduce,
  shownOnOpen,
  statusText,
} from "../../extension/src/jobs.js";

const T0 = 1_000_000;

test("a job moves from starting through downloading and converting to done", () => {
  let job = newJob("abc", "Tab title", T0);
  assert.equal(job.state, "starting");
  assert.ok(isActive(job));

  job = reduce(job, { type: "info", title: "Real Title" }, T0 + 1);
  assert.equal(job.title, "Real Title");

  job = reduce(job, { type: "progress", stage: "downloading", pct: 42 }, T0 + 2);
  assert.equal(job.state, "downloading");
  assert.equal(job.pct, 42);
  assert.equal(statusText(job), "Downloading\u2026 42%");

  job = reduce(job, { type: "progress", stage: "converting", pct: 95 }, T0 + 3);
  assert.equal(statusText(job), "Converting to MP3\u2026");

  job = reduce(job, { type: "done", path: "C:\\Music\\a.mp3" }, T0 + 4);
  assert.equal(job.state, "done");
  assert.equal(job.pct, 100);
  assert.equal(job.path, "C:\\Music\\a.mp3");
  assert.ok(!isActive(job));
});

test("errors keep the helper's message, with a fallback", () => {
  const job = newJob("abc");
  assert.equal(reduce(job, { type: "error", message: "Nope" }).message, "Nope");
  assert.equal(statusText(reduce(job, { type: "error" })), "Download failed.");
});

test("progress is clamped and unknown messages are ignored", () => {
  const job = newJob("abc");
  assert.equal(reduce(job, { type: "progress", stage: "downloading", pct: 250 }).pct, 100);
  assert.equal(reduce(job, { type: "progress", stage: "downloading", pct: -5 }).pct, 0);
  assert.equal(reduce(job, { type: "mystery" }), job);
  assert.equal(reduce(job, undefined), job);
});

test("an unknown stage does not change the state", () => {
  const job = reduce(newJob("abc"), { type: "progress", stage: "dancing", pct: 10 });
  assert.equal(job.state, "starting");
});

test("shownOnOpen: new, running, recently finished, old, and failed jobs", () => {
  assert.equal(shownOnOpen(undefined, T0), false);
  assert.equal(shownOnOpen(newJob("a", "", T0), T0 + 5), true);

  const done = reduce(newJob("a", "", T0), { type: "done", path: "p" }, T0);
  assert.equal(shownOnOpen(done, T0 + DONE_SHOWN_MS - 1), true);
  assert.equal(shownOnOpen(done, T0 + DONE_SHOWN_MS + 1), false);

  const failed = reduce(newJob("a", "", T0), { type: "error", message: "x" }, T0);
  assert.equal(shownOnOpen(failed, T0 + 1), true);
});

test("statusText for the idle and no-track states", () => {
  assert.equal(statusText(idleJob("T")), "Ready to download");
  assert.equal(statusText(noTrackJob()), "Open a track on YouTube Music first.");
  assert.ok(!shownOnOpen(idleJob()));
});

test("interruptedJob turns a running job into an error", () => {
  const job = interruptedJob(newJob("a", "T", T0), T0 + 1);
  assert.equal(job.state, "error");
  assert.equal(job.title, "T");
  assert.ok(!isActive(job));
});
