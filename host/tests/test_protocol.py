import io
import struct
import unittest

from ytm_host.protocol import MAX_MESSAGE_BYTES, ProtocolError, read_message, write_message


class ProtocolTests(unittest.TestCase):
    def test_round_trip_with_unicode(self):
        buffer = io.BytesIO()
        write_message(buffer, {"type": "info", "title": "夜に駆ける"})
        buffer.seek(0)
        self.assertEqual(read_message(buffer), {"type": "info", "title": "夜に駆ける"})

    def test_two_messages_in_a_row(self):
        buffer = io.BytesIO()
        write_message(buffer, {"n": 1})
        write_message(buffer, {"n": 2})
        buffer.seek(0)
        self.assertEqual(read_message(buffer), {"n": 1})
        self.assertEqual(read_message(buffer), {"n": 2})
        self.assertIsNone(read_message(buffer))

    def test_empty_stream_is_a_clean_end(self):
        self.assertIsNone(read_message(io.BytesIO(b"")))

    def test_truncated_header(self):
        with self.assertRaises(ProtocolError):
            read_message(io.BytesIO(b"\x01\x00"))

    def test_truncated_body(self):
        with self.assertRaises(ProtocolError):
            read_message(io.BytesIO(struct.pack("<I", 10) + b"{}"))

    def test_oversized_message_is_rejected(self):
        with self.assertRaises(ProtocolError):
            read_message(io.BytesIO(struct.pack("<I", MAX_MESSAGE_BYTES + 1)))

    def test_invalid_json(self):
        body = b"not json"
        with self.assertRaises(ProtocolError):
            read_message(io.BytesIO(struct.pack("<I", len(body)) + body))


if __name__ == "__main__":
    unittest.main()
