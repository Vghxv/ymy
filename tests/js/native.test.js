import assert from "node:assert/strict";
import { test } from "node:test";
import { HOST_NAME, helperErrorMessage } from "../../extension/src/native.js";

test("helper name matches the native messaging registration", () => {
  assert.equal(HOST_NAME, "com.ytm_mp3.downloader");
});

test("helperErrorMessage explains the common failures", () => {
  assert.match(helperErrorMessage("Specified native messaging host not found."), /install\.bat/);
  assert.match(helperErrorMessage("Access to the specified native messaging host is forbidden."), /doesn't allow/);
  assert.match(helperErrorMessage("Native host has exited."), /stopped unexpectedly/);
  assert.match(helperErrorMessage(undefined), /stopped unexpectedly/);
});
