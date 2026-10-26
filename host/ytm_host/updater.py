"""Updating ymy in place: fetch a release zip from GitHub, check it, unpack it over the project, reinstall."""

import hashlib
import io
import json
import logging
import os
import re
import shutil
import subprocess
import urllib.request
import zipfile

from .errors import HelperError

log = logging.getLogger("ytm_host.updater")

REPO = "Vghxv/ymy"
TAG_RE = re.compile(r"v\d+\.\d+\.\d+\Z")
API_URL = "https://api.github.com/repos/{}/releases/tags/{{}}".format(REPO)
DOWNLOAD_PREFIX = "https://github.com/{}/releases/download/".format(REPO)
ZIP_PREFIX = "ymy/"  # git archive --prefix in .github/workflows/release.yml
MAX_ZIP_BYTES = 20 * 1024 * 1024
POETRY_TIMEOUT_S = 600

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAGING_NAME = ".update-staging"


def _fetch(url, limit=MAX_ZIP_BYTES):
    request = urllib.request.Request(url, headers={"User-Agent": "ymy-updater"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise HelperError("update", "The update is unexpectedly large. Download it from GitHub instead.")
    return data


def release_asset(release, tag):
    """The zip's download URL and sha256 from GitHub's release JSON."""
    name = "ymy-{}.zip".format(tag)
    for asset in release.get("assets") or []:
        if asset.get("name") != name:
            continue
        url = asset.get("browser_download_url") or ""
        digest = asset.get("digest") or ""
        if not url.startswith(DOWNLOAD_PREFIX) or not digest.startswith("sha256:"):
            break
        return url, digest[len("sha256:"):].lower()
    raise HelperError("update", "The {} release has no usable download. Download it from GitHub instead.".format(tag))


def safe_members(archive):
    """Project-relative paths of the files in the zip, refusing anything that could land outside the project."""
    members = []
    for info in archive.infolist():
        name = info.filename
        if not name.startswith(ZIP_PREFIX) or "\\" in name or ":" in name:
            raise HelperError("update", "The update zip has an unexpected layout.")
        relative = name[len(ZIP_PREFIX):]
        if info.is_dir() or not relative:
            continue
        parts = relative.split("/")
        if any(part in ("", ".", "..") for part in parts) or parts[0] in (".venv", ".git", STAGING_NAME):
            raise HelperError("update", "The update zip has an unexpected layout.")
        members.append((info, relative))
    if not any(relative == "extension/manifest.json" for _, relative in members):
        raise HelperError("update", "The update zip has an unexpected layout.")
    return members


def install_files(data, project_dir):
    """Unpack everything into a staging folder first, then move each file into place."""
    staging = os.path.join(project_dir, STAGING_NAME)
    shutil.rmtree(staging, ignore_errors=True)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = safe_members(archive)
            for info, relative in members:
                target = os.path.join(staging, *relative.split("/"))
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with archive.open(info) as source, open(target, "wb") as handle:
                    shutil.copyfileobj(source, handle)
        # Same volume as the project, so each replace is a rename.
        for _, relative in members:
            target = os.path.join(project_dir, *relative.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            os.replace(os.path.join(staging, *relative.split("/")), target)
    except zipfile.BadZipFile:
        raise HelperError("update", "The update download is damaged. Try again.")
    except OSError:
        log.exception("could not write the update")
        raise HelperError("update", "Couldn't write the new files. Run install.bat after downloading the release from GitHub.")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def find_poetry(which=shutil.which, home=None):
    """PATH first, then where install.bat's pipx puts it."""
    found = which("poetry")
    if found:
        return found
    candidate = os.path.join(home or os.path.expanduser("~"), ".local", "bin", "poetry.exe")
    return candidate if os.path.isfile(candidate) else None


def install_dependencies(project_dir, run=subprocess.run, which=shutil.which):
    poetry = find_poetry(which)
    if not poetry:
        raise HelperError("update", "Updated, but Poetry was not found. Run install.bat.")
    try:
        result = run(
            [poetry, "install", "--no-root", "--no-interaction"],
            cwd=project_dir,
            stdin=subprocess.DEVNULL,  # our stdin is the browser's message pipe
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=POETRY_TIMEOUT_S,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired):
        log.exception("poetry install failed to run")
        raise HelperError("update", "Updated, but installing the new dependencies failed. Run install.bat.")
    output = result.stdout.decode("utf-8", "replace") if result.stdout else ""
    log.info("poetry install exited %s:\n%s", result.returncode, output)
    if result.returncode != 0:
        raise HelperError("update", "Updated, but installing the new dependencies failed. Run install.bat.")


def run_update(tag, emit, output_dir=None, project_dir=PROJECT_DIR, fetch=_fetch, run=subprocess.run, which=shutil.which):
    """Answer an 'update' request with 'update_progress' messages, then 'updated' or 'error'."""
    try:
        if not TAG_RE.match(tag):
            raise HelperError("update", "Unknown version.")
        if os.path.exists(os.path.join(project_dir, ".git")):
            raise HelperError("git_clone", "This copy is a git clone. Update it with git pull instead.")

        emit({"type": "update_progress", "step": "downloading"})
        try:
            release = json.loads(fetch(API_URL.format(tag), limit=1024 * 1024).decode("utf-8"))
            url, digest = release_asset(release, tag)
            data = fetch(url)
        except (OSError, ValueError):
            log.exception("update download failed")
            raise HelperError("network", "Can't reach GitHub. Check your connection.")
        if hashlib.sha256(data).hexdigest() != digest:
            raise HelperError("update", "The update download doesn't match its checksum. Try again.")

        emit({"type": "update_progress", "step": "installing"})
        install_files(data, project_dir)
        install_dependencies(project_dir, run=run, which=which)
    except HelperError as exc:
        log.warning("update to %s failed: %s", tag, exc.message)
        emit(exc.to_message())
        return
    log.info("updated to %s", tag)
    emit({"type": "updated", "version": tag})
