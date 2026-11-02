import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WAIT_MAX_MS,
  WAIT_MIN_MS,
  isRunning,
  listed,
  newPlaylist,
  playlistText,
  randomWaitMs,
  restored,
  resumed,
  startNext,
  stopped,
  subfolder,
  trackFinished,
} from "../../extension/src/playlist.js";

const T0 = 1_000_000;
const TRACKS = [
  { id: "aaaaaaaaaaa", title: "One" },
  { id: "bbbbbbbbbbb", title: "Two" },
];

function loaded() {
  return listed(newPlaylist("PL1", "Tab"), { type: "playlist", title: "Mix", tracks: TRACKS });
}

test("the wait between tracks is 50 to 70 seconds", () => {
  assert.equal(WAIT_MIN_MS, 50_000);
  assert.equal(WAIT_MAX_MS, 70_000);
  assert.equal(randomWaitMs(() => 0), 50_000);
  assert.equal(randomWaitMs(() => 0.999999), 70_000);
  for (let i = 0; i < 1000; i++) {
    const wait = randomWaitMs();
    assert.ok(wait >= 50_000 && wait <= 70_000, String(wait));
  }
});

test("a playlist downloads a track, waits, downloads the next and finishes without a last wait", () => {
  let playlist = newPlaylist("PL1", "Tab");
  assert.ok(isRunning(playlist));
  assert.equal(playlistText(playlist), "Reading the playlist…");

  playlist = startNext(listed(playlist, { type: "playlist", title: "Mix", tracks: TRACKS }));
  assert.equal(playlist.title, "Mix");
  assert.equal(playlist.currentId, "aaaaaaaaaaa");
  assert.equal(playlistText(playlist), "Track 1 of 2");

  playlist = trackFinished(playlist, { state: "done" }, 60_000, T0);
  assert.equal(playlist.state, "waiting");
  assert.equal(playlist.wakeAt, T0 + 60_000);
  assert.equal(playlist.currentId, "");
  assert.equal(playlistText(playlist, T0 + 18_500), "1 of 2 done · next in 42 s");

  playlist = startNext(playlist);
  assert.equal(playlist.currentId, "bbbbbbbbbbb");

  playlist = trackFinished(playlist, { state: "done" }, 60_000, T0);
  assert.equal(playlist.state, "done");
  assert.equal(playlist.wakeAt, 0);
  assert.ok(!isRunning(playlist));
  assert.equal(playlistText(playlist), "All 2 tracks saved");
});

test("a track that can't be downloaded is counted and the playlist goes on", () => {
  let playlist = trackFinished(startNext(loaded()), { state: "error", code: "premium", message: "Paid" }, 60_000, T0);
  assert.equal(playlist.state, "waiting");
  assert.equal(playlist.failed, 1);
  playlist = trackFinished(startNext(playlist), { state: "done" }, 60_000, T0);
  assert.equal(playlistText(playlist), "1 of 2 saved, 1 failed");
});

test("errors that would hit every track stop the playlist, and resuming retries that track after a wait", () => {
  for (const code of ["helper", "ffmpeg_missing", "disk", "network", "rate_limited", "bot_check", "extractor_broken"]) {
    const playlist = trackFinished(startNext(loaded()), { state: "error", code, message: "Slow down." }, 60_000, T0);
    assert.equal(playlist.state, "stopped", code);
    assert.equal(playlist.next, 0);
    assert.equal(playlist.failed, 0);
    assert.equal(playlistText(playlist), "Slow down. Stopped after 0 of 2.");

    const again = resumed(playlist, 55_000, T0);
    assert.equal(again.state, "waiting");
    assert.equal(again.wakeAt, T0 + 55_000);
    assert.equal(again.message, "");
    assert.equal(startNext(again).currentId, "aaaaaaaaaaa");
  }
});

test("Stop keeps the place, and stopping during the last track just finishes", () => {
  const first = stopped(startNext(loaded()));
  assert.equal(first.state, "stopped");
  assert.equal(first.currentId, "");
  assert.equal(playlistText(first), "Stopped after 1 of 2.");

  const last = trackFinished(startNext(loaded()), { state: "done" }, 60_000, T0);
  assert.equal(stopped(startNext(last)).state, "done");
});

test("the tracks' folder is named after the playlist, or its id when it has no title", () => {
  assert.equal(subfolder(loaded()), "Mix");
  assert.equal(subfolder(listed(newPlaylist("PL1", "Tab"), { type: "playlist", title: "", tracks: TRACKS })), "Tab");
  assert.equal(subfolder(listed(newPlaylist("PL1"), { type: "playlist", title: "", tracks: TRACKS })), "PL1");
});

test("tracks already in the folder are counted, and a playlist with nothing left is done", () => {
  let playlist = listed(newPlaylist("PL1"), { type: "playlist", title: "Mix", tracks: TRACKS.slice(1), skipped: 1 });
  assert.equal(playlist.state, "loading");
  playlist = trackFinished(startNext(playlist), { state: "done" }, 60_000, T0);
  assert.equal(playlistText(playlist), "All 1 tracks saved, 1 already in the folder");

  const nothingLeft = listed(newPlaylist("PL1"), { type: "playlist", title: "Mix", tracks: [], skipped: 2 });
  assert.equal(nothingLeft.state, "done");
  assert.ok(!isRunning(nothingLeft));
  assert.equal(playlistText(nothingLeft), "All 2 tracks are already in the folder");
});

test("a listing failure is an error with the helper's message", () => {
  const playlist = listed(newPlaylist("PL1"), { type: "error", message: "Private." });
  assert.equal(playlist.state, "error");
  assert.equal(playlistText(playlist), "Private.");
  assert.ok(!isRunning(playlist));
});

test("after a restart the interrupted track is tried again and waits stay as they were", () => {
  assert.equal(restored(newPlaylist("PL1"), 60_000, T0).state, "error");

  const interrupted = restored(startNext(loaded()), 60_000, T0);
  assert.equal(interrupted.state, "waiting");
  assert.equal(interrupted.wakeAt, T0 + 60_000);
  assert.equal(startNext(interrupted).currentId, "aaaaaaaaaaa");

  const waitingNow = trackFinished(startNext(loaded()), { state: "done" }, 60_000, T0);
  assert.equal(restored(waitingNow, 1, T0 + 5), waitingNow);
  const over = stopped(startNext(loaded()));
  assert.equal(restored(over, 1, T0), over);
});
