"""Reading a playlist the way YouTube Music shows it.

yt-dlp reads playlists through www.youtube.com, which lists the videos that were
added. YouTube Music may play another upload of the same song in a row's place,
and only its own API says which one, so the tracks are listed from there.
"""

import json
import logging
import urllib.request

log = logging.getLogger("ytm_host.ytmusic")

API_URL = "https://music.youtube.com/youtubei/v1/browse?prettyPrint=false"
CLIENT_VERSION = "1.20260707.12.00"
TIMEOUT_SECONDS = 20
# Pages hold 100 tracks; a playlist holds at most 5000.
MAX_PAGES = 60


def _client_version():
    """yt-dlp keeps its client version current; ours is only the fallback."""
    try:
        from yt_dlp.extractor.youtube._base import INNERTUBE_CLIENTS

        return INNERTUBE_CLIENTS["web_music"]["INNERTUBE_CONTEXT"]["client"]["clientVersion"]
    except Exception:
        return CLIENT_VERSION


def _post(body):
    body = {"context": {"client": {"clientName": "WEB_REMIX", "clientVersion": _client_version(), "hl": "en"}}, **body}
    request = urllib.request.Request(
        API_URL,
        json.dumps(body).encode("utf-8"),
        {"Content-Type": "application/json", "Origin": "https://music.youtube.com", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


def _find(node, key):
    """Every value stored under this key, at any depth."""
    if isinstance(node, dict):
        for name, value in node.items():
            if name == key:
                yield value
            else:
                yield from _find(value, key)
    elif isinstance(node, list):
        for value in node:
            yield from _find(value, key)


def _first(node, key):
    return next(_find(node, key), None)


def _text(node):
    runs = (node or {}).get("runs") or []
    return "".join(run.get("text") or "" for run in runs if isinstance(run, dict))


def _title(page):
    header = _first(page, "musicResponsiveHeaderRenderer") or _first(page, "musicEditablePlaylistDetailHeaderRenderer")
    title = _text((header or {}).get("title")) or (_first(page, "microformatDataRenderer") or {}).get("title")
    return title if isinstance(title, str) else ""


def entry_from(row):
    """A row as {id: the video it plays, added: the video in the playlist, title}."""
    added = ((_first(row, "likeButtonRenderer") or {}).get("target") or {}).get("videoId")
    played = (row.get("playlistItemData") or {}).get("videoId") or added
    columns = row.get("flexColumns") or []
    title = _text(_first(columns[0], "text")) if columns else ""
    return {"id": played, "added": added, "title": title}


def _items(page):
    """The rows of one page and the token of the next page, if any."""
    shelf = _first(page, "musicPlaylistShelfRenderer")
    if shelf is not None:
        items = shelf.get("contents") or []
    else:
        items = [item for action in _find(page, "appendContinuationItemsAction") for item in action.get("continuationItems") or []]
    rows, token = [], None
    for item in items:
        if not isinstance(item, dict):
            continue
        if "musicResponsiveListItemRenderer" in item:
            rows.append(item["musicResponsiveListItemRenderer"])
        elif "continuationItemRenderer" in item:
            token = _first(item["continuationItemRenderer"], "token")
    return rows, token if isinstance(token, str) else None


def read_playlist(playlist_id, post=_post):
    """{title, entries} like yt-dlp's, or None when YouTube Music has no such playlist to show."""
    page = post({"browseId": "VL" + playlist_id})
    if _first(page, "musicPlaylistShelfRenderer") is None and _first(page, "musicResponsiveHeaderRenderer") is None:
        return None
    title = _title(page)
    entries = []
    for _ in range(MAX_PAGES):
        rows, token = _items(page)
        entries += [entry_from(row) for row in rows]
        if not token:
            break
        page = post({"continuation": token})
    log.debug("YouTube Music lists %d tracks in %s", len(entries), playlist_id)
    return {"title": title, "entries": entries}
