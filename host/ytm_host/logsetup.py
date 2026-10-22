import logging
import os
from logging.handlers import RotatingFileHandler

from .system import config_dir

MAX_LOG_BYTES = 256 * 1024


def setup():
    """Log to ~/.ytm-mp3/host.log. Logging problems must never break a download."""
    folder = config_dir()
    try:
        os.makedirs(folder, exist_ok=True)
        handler = RotatingFileHandler(
            os.path.join(folder, "host.log"),
            maxBytes=MAX_LOG_BYTES,
            backupCount=1,
            encoding="utf-8",
        )
    except OSError:
        return
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger("ytm_host")
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)
