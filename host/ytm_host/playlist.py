"""Listing the tracks of a playlist. The extension downloads them one by one.

The tracks are the ones YouTube Music shows and plays (see ytmusic.py), which are
not always the videos yt-dlp lists for the same playlist.
"""

import json
import logging
import os
import re

from . import system, ytmusic
from .errors import HelperError
from .library import ID_RE, video_ids_in
from .protocol import MAX_MESSAGE_BYTES

log = logging.getLogger("ytm_host.playlist")

PLAYLIST_URL_RE = re.compile(r"^https://music\.youtube\.com/playlist\?list=([A-Za-z0-9_-]+)\Z")

NOT_FOUND_MESSAGE = "Can't open this playlist. Private playlists and Liked Music need a sign-in, which ymy doesn't do."

# Listed by YouTube in place of tracks that are gone.
GONE_TITLES = {"[Deleted video]", "[Private video]"}

# Leaves room for the rest of the message around the track list.
MAX_TRACKS_BYTES = MAX_MESSAGE_BYTES - 64 * 1024


def tracks_from(info):
    """The downloadable tracks of a playlist, in order and without repeats.

    A track is the video YouTube Music plays; "added" is the one in the playlist when that differs.
    """
    tracks = {}
    for entry in (info or {}).get("entries") or []:
        vid = (entry or {}).get("id")
        title = entry.get("title") if entry else None
        if isinstance(vid, str) and ID_RE.match(vid) and title not in GONE_TITLES:
            track = {"id": vid, "title": title or ""}
            added = entry.get("added")
            if isinstance(added, str) and added != vid and ID_RE.match(added):
                track["added"] = added
            tracks.setdefault(vid, track)
    return list(tracks.values())


def fit_message(tracks):
    """Native messages are limited in size. Titles are only hints, so they go first."""
    if len(json.dumps(tracks, ensure_ascii=False).encode("utf-8")) <= MAX_TRACKS_BYTES:
        return tracks
    return [{"id": track["id"], "title": ""} for track in tracks]


def _list(url, read):
    match = PLAYLIST_URL_RE.match(url or "")
    if not match:
        raise HelperError("invalid_url", "That is not a YouTube Music playlist link.")
    try:
        info = read(match.group(1))
    except Exception as exc:
        raise HelperError.from_text(str(exc))
    if info is None:
        raise HelperError("playlist_not_found", NOT_FOUND_MESSAGE)
    tracks = tracks_from(info)
    if not tracks:
        raise HelperError("playlist_empty", "This playlist has no tracks to download.")
    return info.get("title") or "", tracks


def _on_disk(name, output_dir, resolve_dir):
    """The video ids already in the playlist's folder. Like a check, this never creates the folder."""
    root = system.expand_dir(output_dir) if output_dir else resolve_dir()
    return video_ids_in(os.path.join(root, system.folder_name(name)))


def run_playlist(url, emit, output_dir=None, read=ytmusic.read_playlist, subfolder="", resolve_dir=system.resolve_output_dir):
    """Answer a 'playlist' request with exactly one 'playlist' or 'error' message.

    subfolder names the folder when the playlist has no title, and the tracks
    that are already in that folder are left out of the answer.
    """
    try:
        title, tracks = _list(url, read)
        on_disk = _on_disk(title or subfolder, output_dir, resolve_dir)
    except HelperError as error:
        log.warning("listing failed: %s (%s)", error.code, error.message)
        emit(error.to_message())
        return
    except Exception:
        log.exception("unexpected failure")
        emit(HelperError("unknown", "Couldn't read this playlist.").to_message())
        return
    # A file saved from the video in the playlist is the same song too.
    missing = [track for track in tracks if not on_disk & {track["id"], track.get("added")}]
    skipped = len(tracks) - len(missing)
    log.info("playlist %s: %d tracks, %d already downloaded", url, len(tracks), skipped)
    missing = [{"id": track["id"], "title": track["title"]} for track in missing]
    emit({"type": "playlist", "title": title, "tracks": fit_message(missing), "skipped": skipped})
