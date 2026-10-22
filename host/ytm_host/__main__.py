"""Entry point launched by the browser: one request in, progress and a result out."""

import logging
import os
import sys

from . import logsetup, system
from .downloader import run_job
from .library import run_check
from .protocol import ProtocolError, read_message, write_message

log = logging.getLogger("ytm_host")


def _binary_stdio():
    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def main():
    _binary_stdio()
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    sys.stdout = sys.stderr  # nothing else may write to the protocol channel

    logsetup.setup()
    system.augment_path()

    alive = {"ok": True}

    def emit(message):
        if not alive["ok"]:
            return
        try:
            write_message(stdout, message)
        except (OSError, ValueError):
            alive["ok"] = False

    try:
        request = read_message(stdin)
    except ProtocolError as exc:
        log.error("bad request: %s", exc)
        emit({"type": "error", "code": "protocol", "message": "The helper got a malformed request."})
        return 1

    if isinstance(request, dict) and request.get("type") == "check":
        output_dir = request.get("output_dir")
        run_check(request.get("url", ""), emit, output_dir=output_dir)
        return 0

    if not isinstance(request, dict) or request.get("type") != "download":
        emit({"type": "error", "code": "protocol", "message": "The helper got an unknown request."})
        return 1

    log.info("download requested: %s", request.get("url"))
    output_dir = request.get("output_dir")
    if output_dir:
        log.info("output folder from extension: %s", output_dir)
    run_job(request.get("url", ""), emit, output_dir=output_dir if isinstance(output_dir, str) else None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
