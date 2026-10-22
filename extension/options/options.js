import { OUTPUT_DIR_KEY, outputDirError } from "../src/settings.js";

const form = document.getElementById("form");
const dirEl = document.getElementById("dir");
const statusEl = document.getElementById("status");
const resetEl = document.getElementById("reset");

function show(text, kind = "") {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
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

chrome.storage.sync.get(OUTPUT_DIR_KEY).then((stored) => {
  dirEl.value = stored[OUTPUT_DIR_KEY] || "";
});
