export const OUTPUT_DIR_KEY = "outputDir";
export const AUTO_CHECK_KEY = "autoCheck";

/** Why a typed download folder can't be used, or "" when it is fine (empty means default). */
export function outputDirError(dir) {
  const text = String(dir || "").trim();
  if (!text) return "";
  const absolute = /^[A-Za-z]:[\\/]/.test(text) || /^\\\\[^\\]+\\[^\\]+/.test(text) || /^[~%]/.test(text);
  if (!absolute) return "Use a full path, like D:\\Music.";
  if (/[<>"|?*]/.test(text.replace(/^[A-Za-z]:/, ""))) return 'The path can\'t contain < > " | ? *';
  return "";
}

export async function getOutputDir() {
  const stored = await chrome.storage.sync.get(OUTPUT_DIR_KEY);
  return String(stored[OUTPUT_DIR_KEY] || "").trim();
}

/** Whether the popup searches the download folder by itself when it opens. Off unless the user turned it on. */
export async function getAutoCheck() {
  const stored = await chrome.storage.sync.get(AUTO_CHECK_KEY);
  return stored[AUTO_CHECK_KEY] === true;
}
