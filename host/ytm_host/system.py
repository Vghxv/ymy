"""Looking around the machine: app folder, output folder, ffmpeg, JavaScript runtime."""

import glob
import logging
import os
import shutil
import subprocess

from .errors import HelperError

log = logging.getLogger("ytm_host.system")

APP_DIR_NAME = ".ymy"


def config_dir():
    return os.path.join(os.path.expanduser("~"), APP_DIR_NAME)


def temp_dir():
    """Where yt-dlp keeps partial downloads and the audio before MP3 conversion."""
    return os.path.join(config_dir(), "temp")


def expand_dir(path):
    """A folder typed in the extension options, with ~ and %VARS% expanded."""
    return os.path.expandvars(os.path.expanduser(path.strip()))


def resolve_output_dir(home=None, chosen=None):
    """The folder picked in the extension options, else the first usable folder from:
    Music, Downloads, home."""
    if isinstance(chosen, str) and chosen.strip():
        return _chosen_output_dir(expand_dir(chosen))
    home = home or os.path.expanduser("~")
    candidates = [
        os.path.join(home, "Music"),
        os.path.join(home, "Downloads"),
        home,
    ]
    for folder in candidates:
        try:
            os.makedirs(folder, exist_ok=True)
        except OSError:
            continue
        if os.path.isdir(folder) and os.access(folder, os.W_OK):
            return folder
    raise HelperError("disk", "No writable output folder found.")


def _chosen_output_dir(folder):
    """The user asked for this folder explicitly, so fail loudly instead of falling back."""
    if not os.path.isabs(folder):
        raise HelperError("disk", "The download folder in the extension options must be a full path.")
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError:
        raise HelperError("disk", "Can't create the download folder {}. Change it in the extension options.".format(folder))
    if not os.path.isdir(folder) or not os.access(folder, os.W_OK):
        raise HelperError("disk", "Can't write to {}. Change the download folder in the extension options.".format(folder))
    return folder


def winget_dir(local_appdata=None):
    base = local_appdata or os.environ.get("LOCALAPPDATA")
    return os.path.join(base, "Microsoft", "WinGet") if base else None


def find_ffmpeg(which=shutil.which, local_appdata=None, program_data=None):
    """PATH first, then the places winget and chocolatey put it."""
    found = which("ffmpeg")
    if found:
        return found
    winget = winget_dir(local_appdata)
    candidates = []
    if winget:
        candidates.append(os.path.join(winget, "Links", "ffmpeg.exe"))
        pattern = os.path.join(winget, "Packages", "Gyan.FFmpeg*", "**", "bin", "ffmpeg.exe")
        candidates += sorted(glob.glob(pattern, recursive=True))
    data = program_data or os.environ.get("ProgramData")
    if data:
        candidates.append(os.path.join(data, "chocolatey", "bin", "ffmpeg.exe"))
    return next((c for c in candidates if os.path.isfile(c)), None)


def augment_path(local_appdata=None, environ=None):
    """The browser may have started before winget added its Links folder to PATH."""
    environ = os.environ if environ is None else environ
    winget = winget_dir(local_appdata)
    links = winget and os.path.join(winget, "Links")
    if not links or not os.path.isdir(links):
        return
    path = environ.get("PATH", "")
    if links.lower() not in (p.lower() for p in path.split(os.pathsep)):
        environ["PATH"] = path + os.pathsep + links


def js_runtime_options(which=shutil.which):
    """yt-dlp enables Deno by default. Fall back to Node when that is all we have."""
    if not which("deno") and which("node"):
        return {"js_runtimes": {"node": {}}}
    return {}


def explorer_args(folder, path=None):
    """Show the folder in Explorer, with the file selected when there is one."""
    if path and os.path.isfile(path):
        return ["explorer.exe", "/select,", os.path.normpath(path)]
    return ["explorer.exe", os.path.normpath(folder)]


def run_open(path, emit, output_dir=None, resolve_dir=resolve_output_dir, popen=subprocess.Popen):
    """Answer an 'open' request with one 'opened' or 'error' message."""
    try:
        folder = resolve_dir(chosen=output_dir)
        args = explorer_args(folder, path)
        # Explorer's exit code means nothing, so only a failure to start it counts.
        popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except HelperError as exc:
        emit(exc.to_message())
        return
    except OSError:
        log.exception("explorer failed to start")
        emit({"type": "error", "code": "explorer", "message": "Couldn't open Explorer."})
        return
    log.info("opened %s", args[-1])
    emit({"type": "opened"})
