const MUSIC_HOST = "music.youtube.com";
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const LIST_PATTERN = /^[A-Za-z0-9_-]+$/;
const PLAYLIST_PAGES = new Set(["/playlist", "/watch"]);

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

/**
 * The playlist id when the URL is a playlist page or a track played from a playlist, otherwise null.
 * YouTube Music adds an endless radio mix (list=RD...) to any track you play: that is not a playlist to download.
 */
export function playlistId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== MUSIC_HOST || !PLAYLIST_PAGES.has(url.pathname)) {
      return null;
    }
    const id = url.searchParams.get("list");
    return id && LIST_PATTERN.test(id) && !id.startsWith("RD") ? id : null;
  } catch {
    return null;
  }
}

export function playlistUrl(id) {
  return `https://${MUSIC_HOST}/playlist?list=${id}`;
}

/**
 * The playlist's name in its page, or "" when there is none: a playlist that is missing or
 * needs a sign-in gets "undefined" or the site's name there.
 */
export function playlistPageTitle(doc) {
  const title = doc.querySelector('meta[property="og:title"]')?.content?.trim() || "";
  return title === "undefined" || title === "YouTube Music" ? "" : title;
}

/** "Song - YouTube Music" or "Song | YouTube Music" -> "Song" */
export function cleanTabTitle(title) {
  return String(title || "")
    .replace(/\s*[-|]\s*YouTube Music\s*$/i, "")
    .trim();
}
