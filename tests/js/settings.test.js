import assert from "node:assert/strict";
import { test } from "node:test";
import { outputDirError } from "../../extension/src/settings.js";

test("outputDirError accepts empty (default) and full paths", () => {
  for (const dir of ["", "  ", "D:\\Music", "C:/Users/me/Music", "\\\\server\\share\\music", "%USERPROFILE%\\Music", "~\\Music"]) {
    assert.equal(outputDirError(dir), "", dir);
  }
});

test("outputDirError rejects relative paths and bad characters", () => {
  assert.notEqual(outputDirError("Music"), "");
  assert.notEqual(outputDirError(".\\Music"), "");
  assert.notEqual(outputDirError("D:\\Mu?sic"), "");
});

test("getAutoCheck is off unless explicitly turned on", async () => {
  const { getAutoCheck } = await import("../../extension/src/settings.js");
  for (const [stored, expected] of [[{}, false], [{ autoCheck: false }, false], [{ autoCheck: "yes" }, false], [{ autoCheck: true }, true]]) {
    globalThis.chrome = { storage: { sync: { get: async () => stored } } };
    assert.equal(await getAutoCheck(), expected, JSON.stringify(stored));
  }
  delete globalThis.chrome;
});
