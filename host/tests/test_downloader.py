import os
import tempfile
import unittest
from types import SimpleNamespace

from ytm_host.downloader import URL_RE, build_options, run_job

GOOD_URL = "https://music.youtube.com/watch?v=dQw4w9WgXcQ"


def make_fake_yt_dlp(behaviours):
    """A stand-in for the yt_dlp module. Each YoutubeDL use consumes one behaviour.

    A behaviour is either an Exception instance to raise, or a callable
    taking (options, out_dir) that plays the download and returns the info dict.
    """
    behaviours = list(behaviours)

    class FakeYoutubeDL:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def extract_info(self, url, download=True):
            behaviour = behaviours.pop(0)
            if isinstance(behaviour, Exception):
                raise behaviour
            return behaviour(self.options)

        def prepare_filename(self, info):
            return info["_filename"]

    return SimpleNamespace(YoutubeDL=FakeYoutubeDL)


def successful_download(filename="Artist - Song.mp3", report_via_hook=True):
    def play(options):
        out_dir = options["paths"]["home"]
        path = os.path.join(out_dir, filename)
        info = {"title": "Song", "artist": "Artist", "track": "Song"}
        options["progress_hooks"][0]({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100, "info_dict": info})
        options["progress_hooks"][0]({"status": "downloading", "downloaded_bytes": 100, "total_bytes": 100, "info_dict": info})
        options["progress_hooks"][0]({"status": "finished", "info_dict": info})
        options["postprocessor_hooks"][0]({"status": "started", "postprocessor": "ExtractAudio", "info_dict": info})
        with open(path, "wb") as handle:
            handle.write(b"mp3")
        if report_via_hook:
            options["postprocessor_hooks"][0](
                {"status": "finished", "postprocessor": "ExtractAudio", "info_dict": {"filepath": path}}
            )
            return {"requested_downloads": []}
        return {"requested_downloads": [{"filepath": path}], "_filename": path}

    return play


class RunJobTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.events = []
        self.update_calls = 0

    def tearDown(self):
        self.folder.cleanup()

    def run_job(self, yt_dlp_behaviours, url=GOOD_URL, ffmpeg="ffmpeg", update_result=True, reload_behaviours=None):
        loads = []

        def load(reload=False):
            loads.append(reload)
            if reload:
                return make_fake_yt_dlp(reload_behaviours or [])
            return make_fake_yt_dlp(yt_dlp_behaviours)

        def update():
            self.update_calls += 1
            return update_result

        run_job(
            url,
            self.events.append,
            load=load,
            find_ffmpeg=lambda: ffmpeg,
            resolve_dir=lambda: self.folder.name,
            update=update,
            js_options=lambda: {},
        )
        self.loads = loads
        return self.events

    def last(self):
        return self.events[-1]

    def types(self):
        return [event["type"] for event in self.events]

    def test_successful_download_reports_info_progress_and_done(self):
        self.run_job([successful_download()])
        self.assertEqual(self.events[0], {"type": "info", "title": "Song", "artist": "Artist"})
        self.assertEqual(self.last()["type"], "done")
        self.assertEqual(self.last()["filename"], "Artist - Song.mp3")
        self.assertTrue(os.path.isfile(self.last()["path"]))
        self.assertEqual(self.types().count("done") + self.types().count("error"), 1)

    def test_progress_is_monotonic_and_never_reaches_100_before_done(self):
        self.run_job([successful_download()])
        percentages = [e["pct"] for e in self.events if e["type"] == "progress"]
        self.assertEqual(percentages, sorted(percentages))
        self.assertLess(max(percentages), 100)
        stages = {e["stage"] for e in self.events if e["type"] == "progress"}
        self.assertEqual(stages, {"downloading", "converting"})

    def test_progress_events_are_not_repeated(self):
        self.run_job([successful_download()])
        progress = [(e["stage"], e["pct"]) for e in self.events if e["type"] == "progress"]
        self.assertEqual(len(progress), len(set(progress)))

    def test_path_falls_back_to_the_result_when_no_hook_reports_it(self):
        self.run_job([successful_download(report_via_hook=False)])
        self.assertEqual(self.last()["type"], "done")

    def test_invalid_url_is_rejected_before_any_work(self):
        self.run_job([], url="https://evil.example/watch?v=dQw4w9WgXcQ")
        self.assertEqual(self.last()["code"], "invalid_url")
        self.assertEqual(self.loads, [])

    def test_playlist_url_is_rejected(self):
        self.run_job([], url=GOOD_URL + "&list=RDx")
        self.assertEqual(self.last()["code"], "invalid_url")

    def test_missing_ffmpeg_fails_fast(self):
        self.run_job([], ffmpeg=None)
        self.assertEqual(self.last()["code"], "ffmpeg_missing")
        self.assertEqual(self.loads, [])

    def test_unavailable_track_reports_a_friendly_error_without_updating(self):
        self.run_job([Exception("ERROR: [youtube] dQw4w9WgXcQ: Video unavailable")])
        self.assertEqual(self.last(), {"type": "error", "code": "unavailable", "message": "This track is unavailable."})
        self.assertEqual(self.update_calls, 0)

    def test_extractor_breakage_updates_and_retries_once(self):
        self.run_job(
            [Exception("ERROR: unable to download video data: HTTP Error 403: Forbidden")],
            reload_behaviours=[successful_download()],
        )
        self.assertEqual(self.update_calls, 1)
        self.assertEqual(self.loads, [False, True])
        self.assertIn({"type": "progress", "stage": "updating", "pct": 0}, self.events)
        self.assertEqual(self.last()["type"], "done")

    def test_failed_update_reports_the_original_problem(self):
        self.run_job(
            [Exception("ERROR: Unable to extract player response")],
            update_result=False,
        )
        self.assertEqual(self.last()["code"], "extractor_broken")
        self.assertEqual(self.update_calls, 1)
        self.assertEqual(self.loads, [False])

    def test_still_broken_after_update_does_not_loop(self):
        self.run_job(
            [Exception("HTTP Error 403: Forbidden")],
            reload_behaviours=[Exception("HTTP Error 403: Forbidden")],
        )
        self.assertEqual(self.update_calls, 1)
        self.assertEqual(self.last()["code"], "extractor_broken")

    def test_missing_output_file_is_an_error_not_a_fake_success(self):
        def finishes_without_a_file(options):
            return {"requested_downloads": [{"filepath": os.path.join(self.folder.name, "ghost.mp3")}]}

        self.run_job([finishes_without_a_file])
        self.assertEqual(self.last()["type"], "error")

    def test_exactly_one_terminal_event(self):
        self.run_job([Exception("boom")])
        self.assertEqual(self.types().count("done") + self.types().count("error"), 1)


class OptionsTests(unittest.TestCase):
    def test_options_ask_for_mp3_and_a_single_track(self):
        options = build_options("C:\\Music", "ffmpeg.exe", lambda d: None, lambda d: None)
        self.assertTrue(options["noplaylist"])
        self.assertEqual(options["paths"], {"home": "C:\\Music"})
        self.assertEqual(options["postprocessors"][0]["preferredcodec"], "mp3")
        self.assertEqual(options["ffmpeg_location"], "ffmpeg.exe")

    def test_js_options_are_merged(self):
        options = build_options("x", "y", lambda d: None, lambda d: None, {"js_runtimes": {"node": {}}})
        self.assertEqual(options["js_runtimes"], {"node": {}})


class UrlTests(unittest.TestCase):
    def test_only_canonical_track_urls_match(self):
        self.assertTrue(URL_RE.match(GOOD_URL))
        for bad in (
            "https://music.youtube.com/watch?v=short",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "http://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ\nrm",
        ):
            self.assertFalse(URL_RE.match(bad), bad)


if __name__ == "__main__":
    unittest.main()
