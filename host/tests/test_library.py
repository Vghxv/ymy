import os
import struct
import tempfile
import unittest

from ytm_host.library import find_track, run_check, tag_mentions, video_id

VID = "dQw4w9WgXcQ"
URL = "https://music.youtube.com/watch?v=" + VID


def syncsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def frame(frame_id, body, version=4):
    size = syncsafe(len(body)) if version == 4 else struct.pack(">I", len(body))
    return frame_id + size + b"\x00\x00" + body


def id3(frames, version=4, padding=32):
    body = b"".join(frames) + b"\x00" * padding
    return b"ID3" + bytes([version, 0, 0]) + syncsafe(len(body)) + body + b"\xff\xfbaudio"


def comment(text):
    return frame(b"COMM", b"\x00eng\x00" + text.encode("latin-1"))


class TagTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, data):
        path = os.path.join(self.dir, *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        return path

    def test_comment_frame_matches(self):
        path = self.write("a.mp3", id3([frame(b"TIT2", b"\x03Song"), comment(URL)]))
        self.assertTrue(tag_mentions(path, VID))

    def test_other_video_does_not_match(self):
        path = self.write("a.mp3", id3([comment("https://music.youtube.com/watch?v=AAAAAAAAAAA")]))
        self.assertFalse(tag_mentions(path, VID))

    def test_txxx_utf16_v3_matches_after_cover_art(self):
        art = frame(b"APIC", b"\x00image/jpeg\x00\x03\x00" + b"\x00" * 200_000, version=3)
        txxx = frame(b"TXXX", b"\x01" + "purl\x00".encode("utf-16") + URL.encode("utf-16"), version=3)
        path = self.write("a.mp3", id3([art, txxx], version=3))
        self.assertTrue(tag_mentions(path, VID))

    def test_id_only_in_audio_is_ignored(self):
        path = self.write("a.mp3", id3([frame(b"TIT2", b"\x03Song")]) + URL.encode())
        self.assertFalse(tag_mentions(path, VID))

    def test_untagged_and_garbage_files(self):
        self.assertFalse(tag_mentions(self.write("a.mp3", b"\xff\xfb" + URL.encode()), VID))
        self.assertFalse(tag_mentions(self.write("b.mp3", b"ID3\x04\x00\x00\x7f\x7f\x7f\x7fCOMM"), VID))
        self.assertFalse(tag_mentions(os.path.join(self.dir, "missing.mp3"), VID))

    def test_find_track_searches_subfolders(self):
        self.write("x/other.mp3", id3([comment("https://music.youtube.com/watch?v=AAAAAAAAAAA")]))
        target = self.write("x/y/z/Artist - Song.MP3", id3([comment(URL)]))
        self.write("x/notes.txt", URL.encode())
        self.assertEqual(find_track(self.dir, VID), target)

    def test_find_track_none(self):
        self.write("a.mp3", id3([comment("nothing here")]))
        self.assertIsNone(find_track(self.dir, VID))
        self.assertIsNone(find_track(os.path.join(self.dir, "nope"), VID))
        self.assertIsNone(find_track(self.dir, "bad"))

    def test_video_id(self):
        self.assertEqual(video_id(URL), VID)
        self.assertEqual(video_id(URL + "&list=RDAMVM"), VID)
        self.assertIsNone(video_id("https://music.youtube.com/"))

    def test_run_check_messages(self):
        target = self.write("sub/a.mp3", id3([comment(URL)]))
        sent = []
        run_check(URL, sent.append, output_dir=self.dir)
        self.assertEqual(sent, [{"type": "found", "path": target, "filename": "a.mp3"}])
        sent.clear()
        run_check("https://music.youtube.com/watch?v=AAAAAAAAAAA", sent.append, resolve_dir=lambda: self.dir)
        self.assertEqual(sent, [{"type": "missing"}])


if __name__ == "__main__":
    unittest.main()
