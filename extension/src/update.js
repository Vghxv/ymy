export const RELEASES_API = "https://api.github.com/repos/Vghxv/ymy/releases/latest";

/** "v1.2.3" or "1.2.3" -> [1, 2, 3], or null for anything else. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text || "").trim());
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** GitHub's latest-release JSON -> { tag, version, url } when it is newer than `current`, else null. */
export function availableUpdate(release, current) {
  const tag = release && typeof release.tag_name === "string" ? release.tag_name : "";
  if (!release || release.draft || release.prerelease || !isNewer(tag, current)) return null;
  const url = typeof release.html_url === "string" ? release.html_url : "";
  return { tag, version: tag.replace(/^v/, ""), url };
}

/** Apply one helper message to the update state shown in the popup. */
export function reduceUpdate(update, msg) {
  switch (msg && msg.type) {
    case "update_progress":
      return { ...update, state: "updating", step: msg.step || "", message: "" };
    case "updated":
      return { ...update, state: "updated", message: "" };
    case "error":
      return { ...update, state: "error", message: msg.message || "The update failed." };
    default:
      return update;
  }
}

export function updateText(update) {
  switch (update.state) {
    case "available":
      return `ymy ${update.version} is available`;
    case "updating":
      return update.step === "installing" ? `Installing ${update.version}…` : `Downloading ${update.version}…`;
    case "updated":
      return `Updated to ${update.version}. Restarting…`;
    case "error":
      return update.message;
    default:
      return "";
  }
}
