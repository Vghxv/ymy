import { AUTO_CHECK_KEY, OUTPUT_DIR_KEY, getAutoCheck, getOutputDir, outputDirError } from "../src/settings.js";

const form = document.getElementById("form");
const dirEl = document.getElementById("dir");
const statusEl = document.getElementById("status");
const resetEl = document.getElementById("reset");
const autoCheckEl = document.getElementById("auto-check");
const checkStatusEl = document.getElementById("check-status");

function show(text, kind = "", el = statusEl) {
  el.textContent = text;
  el.dataset.kind = kind;
}

async function save(value) {
  const dir = value.trim();
  const error = outputDirError(dir);
  if (error) {
    show(error, "error");
    return;
  }
  await chrome.storage.sync.set({ [OUTPUT_DIR_KEY]: dir });
  dirEl.value = dir;
  show(dir ? "Saved." : "Saved. Using the default folder.", "ok");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  save(dirEl.value);
});

resetEl.addEventListener("click", () => save(""));
dirEl.addEventListener("input", () => show(""));

autoCheckEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ [AUTO_CHECK_KEY]: autoCheckEl.checked });
  show(autoCheckEl.checked ? "Saved. The popup checks by itself." : "Saved. Checks only run when you click.", "ok", checkStatusEl);
});

getOutputDir().then((dir) => {
  dirEl.value = dir;
});

getAutoCheck().then((on) => {
  autoCheckEl.checked = on;
});
