"""Native messaging framing: a 4-byte little-endian length, then UTF-8 JSON."""

import json
import struct

MAX_MESSAGE_BYTES = 1024 * 1024


class ProtocolError(Exception):
    pass


def read_message(stream):
    """Read one message. Returns None on a clean end of stream."""
    header = stream.read(4)
    if not header:
        return None
    if len(header) < 4:
        raise ProtocolError("truncated message header")
    (length,) = struct.unpack("<I", header)
    if length > MAX_MESSAGE_BYTES:
        raise ProtocolError("message too large")
    body = stream.read(length)
    if len(body) < length:
        raise ProtocolError("truncated message body")
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError("invalid JSON: {}".format(exc))


def write_message(stream, message):
    data = json.dumps(message, ensure_ascii=False).encode("utf-8")
    if len(data) > MAX_MESSAGE_BYTES:
        raise ProtocolError("message too large")
    stream.write(struct.pack("<I", len(data)))
    stream.write(data)
    stream.flush()
