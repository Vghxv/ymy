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
