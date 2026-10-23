"""Entry point launched by the browser: one request in, progress and a result out."""

import logging
import os
import sys

from . import logsetup, system
from .downloader import run_job
from .library import run_check
from .protocol import ProtocolError, read_message, write_message

log = logging.getLogger("ytm_host")

# request type -> (handler, the request field passed as its first argument)
HANDLERS = {"check": (run_check, "url"), "download": (run_job, "url"), "open": (system.run_open, "path")}


def _binary_stdio():
    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def _protocol_error(message):
    return {"type": "error", "code": "protocol", "message": message}


def main():
    _binary_stdio()
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    sys.stdout = sys.stderr  # nothing else may write to the protocol channel

    logsetup.setup()
    system.augment_path()

    alive = True

    def emit(message):
        nonlocal alive
        if not alive:
            return
        try:
            write_message(stdout, message)
        except (OSError, ValueError):
            alive = False

    try:
        request = read_message(stdin)
    except ProtocolError as exc:
        log.error("bad request: %s", exc)
        emit(_protocol_error("The helper got a malformed request."))
        return 1

    entry = HANDLERS.get(request.get("type")) if isinstance(request, dict) else None
    if not entry:
        emit(_protocol_error("The helper got an unknown request."))
        return 1

    handler, field = entry
    argument = request.get(field)
    argument = argument if isinstance(argument, str) else ""
    output_dir = request.get("output_dir")
    output_dir = output_dir if isinstance(output_dir, str) and output_dir.strip() else None
    log.info("%s requested: %s (folder: %s)", request["type"], argument, output_dir or "default")
    handler(argument, emit, output_dir=output_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
