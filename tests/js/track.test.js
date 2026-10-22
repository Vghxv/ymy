import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalUrl, cleanTabTitle, trackId } from "../../extension/src/track.js";

test("trackId accepts a YouTube Music track page and ignores extra params", () => {
  assert.equal(trackId("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(trackId("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("trackId rejects everything that is not a music track page", () => {
  for (const url of [
    "https://music.youtube.com/",
    "https://music.youtube.com/playlist?list=PL123",
    "https://music.youtube.com/browse/MPREb_x",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=short",
    "https://music.youtube.com/watch",
    "not a url",
    "",
    undefined,
    null,
  ]) {
    assert.equal(trackId(url), null, String(url));
  }
});

test("canonicalUrl keeps only the track", () => {
  assert.equal(canonicalUrl("dQw4w9WgXcQ"), "https://music.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("cleanTabTitle strips the site suffix", () => {
  assert.equal(cleanTabTitle("Some Song - YouTube Music"), "Some Song");
  assert.equal(cleanTabTitle("Some Song"), "Some Song");
  assert.equal(cleanTabTitle(undefined), "");
});
