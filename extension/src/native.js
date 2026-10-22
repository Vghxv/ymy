export const HOST_NAME = "com.ytm_mp3.downloader";

/** Chrome's native messaging error text -> something the user can act on. */
export function helperErrorMessage(raw) {
  const text = String(raw || "");
  if (/not found/i.test(text)) {
    return "Helper not installed. Run install.bat, then restart the browser.";
  }
  if (/forbidden/i.test(text)) {
    return "The helper doesn't allow this extension. Run install.bat again.";
  }
  return "The helper stopped unexpectedly. See .ytm-mp3\\host.log in your user folder.";
}
