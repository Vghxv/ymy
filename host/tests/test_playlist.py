import unittest
from types import SimpleNamespace

from ytm_host.playlist import MAX_TRACKS_BYTES, PLAYLIST_URL_RE, fit_message, run_playlist, tracks_from

GOOD_URL = "https://music.youtube.com/playlist?list=PL123_abc-XYZ"
A = "dQw4w9WgXcQ"
B = "AAAAAAAAAAA"


def fake_yt_dlp(result):
    class FakeYoutubeDL:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def extract_info(self, url, download=True):
            assert download is False
            if isinstance(result, Exception):
                raise result
            return result

    return SimpleNamespace(YoutubeDL=FakeYoutubeDL)


class RunPlaylistTests(unittest.TestCase):
    def run_playlist(self, result, url=GOOD_URL):
        events = []
        loads = []

        def load():
            loads.append(True)
            return fake_yt_dlp(result)

        run_playlist(url, events.append, output_dir="ignored", load=load)
        self.assertEqual(len(events), 1)
        self.loads = loads
        return events[0]

    def test_lists_title_and_tracks(self):
        reply = self.run_playlist({"title": "Mix", "entries": [{"id": A, "title": "One"}, {"id": B, "title": "Two"}]})
        self.assertEqual(
            reply,
            {"type": "playlist", "title": "Mix", "tracks": [{"id": A, "title": "One"}, {"id": B, "title": "Two"}]},
        )

    def test_only_playlist_links_are_accepted(self):
        reply = self.run_playlist({}, url="https://evil.example/playlist?list=PL1")
        self.assertEqual(reply["code"], "invalid_url")
        self.assertEqual(self.loads, [])

    def test_a_playlist_without_tracks_is_an_error(self):
        self.assertEqual(self.run_playlist({"title": "Mix", "entries": []})["code"], "playlist_empty")

    def test_private_playlists_get_a_clear_message(self):
        reply = self.run_playlist(Exception("ERROR: [youtube:tab] LM: YouTube said: The playlist does not exist."))
        self.assertEqual(reply["code"], "playlist_not_found")
        self.assertIn("sign-in", reply["message"])

    def test_other_failures_are_classified(self):
        self.assertEqual(self.run_playlist(Exception("HTTP Error 429: Too Many Requests"))["code"], "rate_limited")


class TracksTests(unittest.TestCase):
    def test_gone_repeated_and_malformed_entries_are_dropped(self):
        info = {
            "entries": [
                {"id": A, "title": "One"},
                None,
                {"id": B, "title": "[Deleted video]"},
                {"id": "short", "title": "Bad id"},
                {"title": "No id"},
                {"id": A, "title": "One again"},
            ]
        }
        self.assertEqual(tracks_from(info), [{"id": A, "title": "One"}])

    def test_no_result_means_no_tracks(self):
        self.assertEqual(tracks_from(None), [])
        self.assertEqual(tracks_from({"entries": None}), [])

    def test_a_missing_title_is_blank(self):
        self.assertEqual(tracks_from({"entries": [{"id": A}]}), [{"id": A, "title": ""}])

    def test_huge_lists_lose_their_titles_to_fit_a_message(self):
        small = [{"id": A, "title": "One"}]
        self.assertEqual(fit_message(small), small)
        huge = [{"id": A, "title": "x" * 1000} for _ in range(MAX_TRACKS_BYTES // 1000)]
        self.assertEqual(fit_message(huge)[0], {"id": A, "title": ""})


class UrlTests(unittest.TestCase):
    def test_only_canonical_playlist_urls_match(self):
        self.assertTrue(PLAYLIST_URL_RE.match(GOOD_URL))
        for bad in (
            "https://music.youtube.com/playlist",
            "https://music.youtube.com/playlist?list=",
            "https://music.youtube.com/playlist?list=PL1&x=1",
            "https://www.youtube.com/playlist?list=PL1",
            "http://music.youtube.com/playlist?list=PL1",
            "https://music.youtube.com/playlist?list=PL1\nrm",
        ):
            self.assertFalse(PLAYLIST_URL_RE.match(bad), bad)


if __name__ == "__main__":
    unittest.main()
