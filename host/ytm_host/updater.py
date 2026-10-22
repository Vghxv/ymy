"""Self-update of yt-dlp, used once when YouTube seems to have changed."""

import os
import subprocess
import sys
import time

from .system import config_dir

COOLDOWN_SECONDS = 3600
UPDATE_TIMEOUT_SECONDS = 240


def update_yt_dlp(stamp_path=None, run=subprocess.run, now=time.time, python=None):
    """Run pip to upgrade yt-dlp. Returns True only if pip succeeded.

    A stamp file limits this to one attempt per hour, so a persistent failure
    (for example no internet) doesn't trigger a pip run on every click.
    """
    stamp_path = stamp_path or os.path.join(config_dir(), "last_update")
    try:
        if now() - os.path.getmtime(stamp_path) < COOLDOWN_SECONDS:
            return False
    except OSError:
        pass
    try:
        os.makedirs(os.path.dirname(stamp_path), exist_ok=True)
        with open(stamp_path, "w") as handle:
            handle.write(str(int(now())))
    except OSError:
        pass

    command = [
        python or sys.executable, "-m", "pip", "install", "-U", "yt-dlp[default]",
        "--disable-pip-version-check", "--quiet",
    ]
    try:
        result = run(
            command,
            capture_output=True,
            timeout=UPDATE_TIMEOUT_SECONDS,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0
