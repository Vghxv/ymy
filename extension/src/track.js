const MUSIC_HOST = "music.youtube.com";
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** The video id when the URL is a YouTube Music track page, otherwise null. */
export function trackId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== MUSIC_HOST || url.pathname !== "/watch") {
      return null;
    }
    const id = url.searchParams.get("v");
    return id && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The link sent to the helper: just the track, never the playlist around it. */
export function canonicalUrl(id) {
  return `https://${MUSIC_HOST}/watch?v=${id}`;
}

/** "Song - YouTube Music" -> "Song" */
export function cleanTabTitle(title) {
  return String(title || "")
    .replace(/\s*-\s*YouTube Music\s*$/i, "")
    .trim();
}
