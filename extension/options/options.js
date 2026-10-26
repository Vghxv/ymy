import {
  AUTO_CHECK_KEY,
  OUTPUT_DIR_KEY,
  UPDATE_CHECK_KEY,
  getAutoCheck,
  getOutputDir,
  getUpdateCheck,
  outputDirError,
} from "../src/settings.js";

const form = document.getElementById("form");
const dirEl = document.getElementById("dir");
const statusEl = document.getElementById("status");
const resetEl = document.getElementById("reset");
const autoCheckEl = document.getElementById("auto-check");
const checkStatusEl = document.getElementById("check-status");
const updateCheckEl = document.getElementById("update-check");
const updateNowEl = document.getElementById("update-now");
const updateStatusEl = document.getElementById("update-status");

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
  try {
    await chrome.storage.sync.set({ [OUTPUT_DIR_KEY]: dir });
  } catch (error) {
    // Sync storage has write quotas (about 120 a minute).
    show(`Couldn't save: ${error.message}`, "error");
    return;
  }
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
  try {
    await chrome.storage.sync.set({ [AUTO_CHECK_KEY]: autoCheckEl.checked });
  } catch (error) {
    autoCheckEl.checked = !autoCheckEl.checked;
    show(`Couldn't save: ${error.message}`, "error", checkStatusEl);
    return;
  }
  show(autoCheckEl.checked ? "Saved. The popup checks by itself." : "Saved. Checks only run when you click.", "ok", checkStatusEl);
});

updateCheckEl.addEventListener("change", async () => {
  try {
    await chrome.storage.sync.set({ [UPDATE_CHECK_KEY]: updateCheckEl.checked });
  } catch (error) {
    updateCheckEl.checked = !updateCheckEl.checked;
    show(`Couldn't save: ${error.message}`, "error", updateStatusEl);
    return;
  }
  show(updateCheckEl.checked ? "Saved. Checks once a day." : "Saved. Checks only when you click.", "ok", updateStatusEl);
});

updateNowEl.addEventListener("click", async () => {
  updateNowEl.disabled = true;
  show("Checking…", "", updateStatusEl);
  const reply = await chrome.runtime.sendMessage({ cmd: "checkUpdate" }).catch((error) => ({ error: error.message }));
  updateNowEl.disabled = false;
  if (reply?.error) show(`Couldn't check: ${reply.error}`, "error", updateStatusEl);
  else if (reply?.update) show(`ymy ${reply.update.version} is available. Update from the popup.`, "ok", updateStatusEl);
  else show(`You have the latest version (${chrome.runtime.getManifest().version}).`, "ok", updateStatusEl);
});

getUpdateCheck().then((on) => {
  updateCheckEl.checked = on;
});

getOutputDir().then((dir) => {
  dirEl.value = dir;
});

getAutoCheck().then((on) => {
  autoCheckEl.checked = on;
});
