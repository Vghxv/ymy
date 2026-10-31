"""Listing the tracks of a playlist. The extension downloads them one by one."""

import json
import logging
import re

from .downloader import _YdlLogger, load_yt_dlp
from .errors import HelperError
from .library import ID_RE
from .protocol import MAX_MESSAGE_BYTES

log = logging.getLogger("ytm_host.playlist")

PLAYLIST_URL_RE = re.compile(r"^https://music\.youtube\.com/playlist\?list=[A-Za-z0-9_-]+\Z")

NOT_FOUND_RE = re.compile(r"playlist does not exist", re.IGNORECASE)
NOT_FOUND_MESSAGE = "Can't open this playlist. Private playlists and Liked Music need a sign-in, which ymy doesn't do."

# Listed by YouTube in place of tracks that are gone.
GONE_TITLES = {"[Deleted video]", "[Private video]"}

# Leaves room for the rest of the message around the track list.
MAX_TRACKS_BYTES = MAX_MESSAGE_BYTES - 64 * 1024


def build_options():
    return {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _YdlLogger(),
        "socket_timeout": 20,
    }


def tracks_from(info):
    """The downloadable tracks of a yt-dlp playlist result, in order and without repeats."""
    tracks = {}
    for entry in (info or {}).get("entries") or []:
        vid = (entry or {}).get("id")
        title = entry.get("title") if entry else None
        if isinstance(vid, str) and ID_RE.match(vid) and title not in GONE_TITLES:
            tracks.setdefault(vid, {"id": vid, "title": title or ""})
    return list(tracks.values())


def fit_message(tracks):
    """Native messages are limited in size. Titles are only hints, so they go first."""
    if len(json.dumps(tracks, ensure_ascii=False).encode("utf-8")) <= MAX_TRACKS_BYTES:
        return tracks
    return [{"id": track["id"], "title": ""} for track in tracks]


def _list(url, load):
    if not PLAYLIST_URL_RE.match(url or ""):
        raise HelperError("invalid_url", "That is not a YouTube Music playlist link.")
    try:
        with load().YoutubeDL(build_options()) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        if NOT_FOUND_RE.search(str(exc)):
            raise HelperError("playlist_not_found", NOT_FOUND_MESSAGE)
        raise HelperError.from_text(str(exc))
    tracks = tracks_from(info)
    if not tracks:
        raise HelperError("playlist_empty", "This playlist has no tracks to download.")
    return info.get("title") or "", tracks


def run_playlist(url, emit, output_dir=None, load=load_yt_dlp):
    """Answer a 'playlist' request with exactly one 'playlist' or 'error' message."""
    try:
        title, tracks = _list(url, load)
    except HelperError as error:
        log.warning("listing failed: %s (%s)", error.code, error.message)
        emit(error.to_message())
        return
    except Exception:
        log.exception("unexpected failure")
        emit(HelperError("unknown", "Couldn't read this playlist.").to_message())
        return
    log.info("playlist %s: %d tracks", url, len(tracks))
    emit({"type": "playlist", "title": title, "tracks": fit_message(tracks)})
