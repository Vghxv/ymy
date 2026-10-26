import assert from "node:assert/strict";
import { test } from "node:test";
import { availableUpdate, isNewer, parseVersion, reduceUpdate, updateText } from "../../extension/src/update.js";

test("parseVersion accepts tags and plain versions only", () => {
  assert.deepEqual(parseVersion("v1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersion("10.0.1"), [10, 0, 1]);
  assert.equal(parseVersion("v1.2"), null);
  assert.equal(parseVersion("v1.2.3-beta"), null);
  assert.equal(parseVersion(undefined), null);
});

test("isNewer compares numerically", () => {
  assert.equal(isNewer("v1.0.10", "1.0.9"), true);
  assert.equal(isNewer("v2.0.0", "1.9.9"), true);
  assert.equal(isNewer("v1.0.1", "1.0.1"), false);
  assert.equal(isNewer("v1.0.0", "1.0.1"), false);
  assert.equal(isNewer("garbage", "1.0.1"), false);
});

test("availableUpdate only reports newer, published releases", () => {
  const release = { tag_name: "v1.1.0", html_url: "https://github.com/Vghxv/ymy/releases/tag/v1.1.0" };
  assert.deepEqual(availableUpdate(release, "1.0.1"), { tag: "v1.1.0", version: "1.1.0", url: release.html_url });
  assert.equal(availableUpdate(release, "1.1.0"), null);
  assert.equal(availableUpdate({ ...release, prerelease: true }, "1.0.1"), null);
  assert.equal(availableUpdate({ ...release, draft: true }, "1.0.1"), null);
  assert.equal(availableUpdate({ message: "API rate limit exceeded" }, "1.0.1"), null);
  assert.equal(availableUpdate(null, "1.0.1"), null);
});

test("reduceUpdate follows the helper's messages", () => {
  const start = { tag: "v1.1.0", version: "1.1.0", state: "available" };
  const downloading = reduceUpdate(start, { type: "update_progress", step: "downloading" });
  assert.equal(updateText(downloading), "Downloading 1.1.0…");
  const installing = reduceUpdate(downloading, { type: "update_progress", step: "installing" });
  assert.equal(updateText(installing), "Installing 1.1.0…");
  assert.equal(reduceUpdate(installing, { type: "updated" }).state, "updated");
  const failed = reduceUpdate(installing, { type: "error", message: "Can't reach GitHub." });
  assert.equal(failed.state, "error");
  assert.equal(updateText(failed), "Can't reach GitHub.");
  assert.equal(reduceUpdate(start, { type: "nonsense" }), start);
});
