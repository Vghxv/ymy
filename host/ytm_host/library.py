"""Finding a track that was already downloaded, anywhere under the output folder.

Downloads carry their YouTube link in the ID3 tag (yt-dlp's FFmpegMetadata writes
webpage_url to the comment and purl fields), so a file is "the same song" when its
tag mentions the video id. Only the tag is read, and big binary frames like cover
art are skipped, so a large library is scanned quickly.
"""

import logging
import os
import re
import struct

from . import system

log = logging.getLogger("ytm_host.library")

VIDEO_ID = r"[A-Za-z0-9_-]{11}"
ID_RE = re.compile(VIDEO_ID + r"\Z")
URL_ID_RE = re.compile(r"[?&]v=(" + VIDEO_ID + r")(?:&|$)")

# Frames that can hold the link. Everything else is skipped without reading it.
TEXT_FRAMES = {b"COMM", b"TXXX", b"WXXX", b"WOAS", b"WOAF"}
MAX_FRAME_BYTES = 64 * 1024


def video_id(url):
    match = URL_ID_RE.search(url or "")
    return match.group(1) if match else None


def _syncsafe(data):
    return (data[0] << 21) | (data[1] << 14) | (data[2] << 7) | data[3]


def _size(data, version):
    """ID3v2.4 sizes are syncsafe; v2.3 sizes are plain big-endian."""
    return _syncsafe(data) if version == 4 else struct.unpack(">I", data)[0]


def _needles(vid):
    needles = []
    for prefix in ("v=", "youtu.be/"):
        text = prefix + vid
        needles += [text.encode("latin-1"), text.encode("utf-16-le"), text.encode("utf-16-be")]
    return needles


def tag_mentions(path, vid):
    """True when the ID3v2 tag of this file contains a link to the video id."""
    needles = _needles(vid)
    try:
        with open(path, "rb") as handle:
            header = handle.read(10)
            if len(header) < 10 or header[:3] != b"ID3":
                return False
            version = header[3]
            if version not in (3, 4):
                return False
            end = 10 + _syncsafe(header[6:10])
            pos = 10
            if header[5] & 0x40:  # extended header
                ext = handle.read(4)
                if len(ext) < 4:
                    return False
                ext_size = _size(ext, version) + (4 if version == 3 else 0)
                pos += ext_size
                handle.seek(pos)
            while pos + 10 <= end:
                frame = handle.read(10)
                if len(frame) < 10 or frame[0] == 0:
                    return False  # padding or truncated
                frame_id = frame[:4]
                size = _size(frame[4:8], version)
                pos += 10
                if size <= 0 or pos + size > end:
                    return False
                if frame_id in TEXT_FRAMES and size <= MAX_FRAME_BYTES:
                    body = handle.read(size)
                    if any(needle in body for needle in needles):
                        return True
                else:
                    handle.seek(size, os.SEEK_CUR)
                pos += size
    except OSError:
        return False
    return False


def find_track(root, vid):
    """Path of an MP3 under root (any depth) tagged with this video id, else None."""
    if not ID_RE.match(vid or "") or not root or not os.path.isdir(root):
        return None
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith((".", "$"))]
        for name in files:
            if name.lower().endswith(".mp3"):
                path = os.path.join(folder, name)
                if tag_mentions(path, vid):
                    return path
    return None


def run_check(url, emit, output_dir=None, resolve_dir=system.resolve_output_dir):
    """Answer a 'check' request with exactly one 'found' or 'missing' message."""
    vid = video_id(url)
    root = None
    try:
        # Unlike a download, a check must never create the folder.
        root = system.expand_dir(output_dir) if output_dir and output_dir.strip() else resolve_dir()
        path = find_track(root, vid)
    except Exception:
        log.exception("library check failed")
        path = None
    log.info("check %s in %s: %s", vid, root, path or "not found")
    if path:
        emit({"type": "found", "path": path, "filename": os.path.basename(path)})
    else:
        emit({"type": "missing"})
