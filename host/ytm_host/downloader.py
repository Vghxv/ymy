"""The actual job: validate, check the machine, run yt-dlp, report progress."""

import importlib
import logging
import os
import re
import sys

from . import system
from .errors import UPDATABLE, HelperError, classify
from .updater import update_yt_dlp

log = logging.getLogger("ytm_host.downloader")

URL_RE = re.compile(r"^https://music\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$")

OUTPUT_TEMPLATE = "%(artist,uploader)s - %(title)s.%(ext)s"

# Share of the progress bar: download, then convert, then done.
DOWNLOAD_SHARE = 90
CONVERT_START = 92
CONVERT_END = 99


class _YdlLogger:
    def debug(self, message):
        log.debug(message)

    def info(self, message):
        log.debug(message)

    def warning(self, message):
        log.debug(message)

    def error(self, message):
        log.error(message)


def load_yt_dlp(reload=False):
    if reload:
        for name in [n for n in sys.modules if n == "yt_dlp" or n.startswith("yt_dlp.")]:
            del sys.modules[name]
        importlib.invalidate_caches()
    return importlib.import_module("yt_dlp")


def build_options(out_dir, ffmpeg_path, progress_hook, postprocessor_hook, js_options=None):
    options = {
        "format": "bestaudio/best",
        "paths": {"home": out_dir},
        "outtmpl": OUTPUT_TEMPLATE,
        "windowsfilenames": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _YdlLogger(),
        "retries": 5,
        "fragment_retries": 5,
        "socket_timeout": 20,
        "concurrent_fragment_downloads": 4,
        "ffmpeg_location": ffmpeg_path,
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [postprocessor_hook],
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"},
            {"key": "FFmpegMetadata", "add_metadata": True, "add_chapters": False},
        ],
    }
    options.update(js_options or {})
    return options


class _Reporter:
    """Sends progress, never going backwards and never repeating itself."""

    def __init__(self, emit):
        self._emit = emit
        self._pct = 0
        self._last = None
        self.info_sent = False
        self.final_path = None

    def info(self, title, artist):
        if self.info_sent:
            return
        self.info_sent = True
        self._emit({"type": "info", "title": title or "", "artist": artist or ""})

    def progress(self, stage, pct):
        pct = max(self._pct, min(CONVERT_END, int(pct)))
        self._pct = pct
        if (stage, pct) != self._last:
            self._last = (stage, pct)
            self._emit({"type": "progress", "stage": stage, "pct": pct})


def _download_once(url, emit, yt_dlp, out_dir, ffmpeg_path, js_options):
    reporter = _Reporter(emit)

    def on_progress(data):
        if not reporter.info_sent:
            info = data.get("info_dict") or {}
            reporter.info(info.get("track") or info.get("title"), info.get("artist") or info.get("uploader"))
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            if total:
                reporter.progress("downloading", (data.get("downloaded_bytes") or 0) / total * DOWNLOAD_SHARE)
            elif data.get("fragment_count"):
                reporter.progress(
                    "downloading", (data.get("fragment_index") or 0) / data["fragment_count"] * DOWNLOAD_SHARE
                )
        elif status == "finished":
            reporter.progress("downloading", DOWNLOAD_SHARE)

    def on_postprocess(data):
        if data.get("postprocessor") != "ExtractAudio":
            return
        if data.get("status") == "started":
            reporter.progress("converting", CONVERT_START)
        elif data.get("status") == "finished":
            reporter.progress("converting", CONVERT_END)
            reporter.final_path = (data.get("info_dict") or {}).get("filepath")

    options = build_options(out_dir, ffmpeg_path, on_progress, on_postprocess, js_options)
    with yt_dlp.YoutubeDL(options) as ydl:
        result = ydl.extract_info(url, download=True)
        # yt-dlp's "finished" postprocessor hook carries the info_dict from *before* the
        # conversion, so final_path may point at the deleted source (.webm/.m4a). Try the
        # result's path first and fall back to swapping the extension for .mp3.
        candidates = [_path_from_result(result), reporter.final_path, _guess_path(ydl, result)]
        candidates += [os.path.splitext(p)[0] + ".mp3" for p in candidates if p]

    path = next((p for p in candidates if p and p.lower().endswith(".mp3") and os.path.isfile(p)), None)
    if not path:
        raise HelperError("unknown", "The download finished but the MP3 file was not found.")
    return path


def _path_from_result(result):
    downloads = (result or {}).get("requested_downloads") or []
    return downloads[0].get("filepath") if downloads else None


def _guess_path(ydl, result):
    try:
        return os.path.splitext(ydl.prepare_filename(result))[0] + ".mp3"
    except Exception:
        return None


def run_job(
    url,
    emit,
    load=load_yt_dlp,
    find_ffmpeg=system.find_ffmpeg,
    resolve_dir=system.resolve_output_dir,
    update=update_yt_dlp,
    js_options=system.js_runtime_options,
    output_dir=None,
):
    """Run one download. Always ends by emitting exactly one 'done' or 'error'."""
    try:
        path = _run(url, emit, load, find_ffmpeg, resolve_dir, update, js_options, output_dir)
    except HelperError as exc:
        log.warning("job failed: %s (%s)", exc.code, exc.message)
        emit({"type": "error", "code": exc.code, "message": exc.message})
        return
    except Exception as exc:
        log.exception("unexpected failure")
        code, message = classify(str(exc))
        emit({"type": "error", "code": code, "message": message})
        return
    emit({"type": "done", "path": path, "filename": os.path.basename(path)})


def _run(url, emit, load, find_ffmpeg, resolve_dir, update, js_options, output_dir=None):
    if not URL_RE.match(url or ""):
        raise HelperError("invalid_url", "That is not a YouTube Music track link.")

    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        raise HelperError("ffmpeg_missing", "ffmpeg was not found. Run install.bat again.")

    out_dir = resolve_dir(chosen=output_dir) if output_dir else resolve_dir()
    yt_dlp = load()
    updated = False

    while True:
        try:
            return _download_once(url, emit, yt_dlp, out_dir, ffmpeg_path, js_options())
        except HelperError:
            raise
        except Exception as exc:
            code, message = classify(str(exc))
            log.warning("attempt failed (%s): %s", code, exc)
            if code in UPDATABLE and not updated:
                updated = True
                emit({"type": "progress", "stage": "updating", "pct": 0})
                if update():
                    yt_dlp = load(reload=True)
                    continue
            raise HelperError(code, message)
