import unittest

from ytm_host.errors import UPDATABLE, classify, clean_message


class ClassifyTests(unittest.TestCase):
    def check(self, text, code):
        self.assertEqual(classify(text)[0], code, text)

    def test_known_failures(self):
        self.check("ERROR: [youtube] abc: Video unavailable. This video is not available", "unavailable")
        self.check("ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "private")
        self.check("ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate", "age_restricted")
        self.check("ERROR: [youtube] abc: Sign in to confirm you're not a bot", "bot_check")
        self.check("ERROR: unable to download video data: HTTP Error 403: Forbidden", "extractor_broken")
        self.check("ERROR: [youtube] abc: Requested format is not available", "extractor_broken")
        self.check("ERROR: [youtube] abc: Unable to extract player response", "extractor_broken")
        self.check("HTTP Error 429: Too Many Requests", "rate_limited")
        self.check("<urlopen error [Errno 11001] getaddrinfo failed>", "network")
        self.check("ERROR: Postprocessing: ffprobe and ffmpeg not found", "ffmpeg_missing")
        self.check("[Errno 28] No space left on device", "disk")
        self.check("ERROR: Postprocessing: Conversion failed!", "conversion_failed")

    def test_unknown_error_keeps_a_short_readable_message(self):
        code, message = classify("ERROR: [youtube] abc: something nobody has seen before")
        self.assertEqual(code, "unknown")
        self.assertEqual(message, "something nobody has seen before")

    def test_empty_error(self):
        self.assertEqual(classify(""), ("unknown", "Download failed."))

    def test_only_extractor_breakage_triggers_an_update(self):
        self.assertEqual(UPDATABLE, {"extractor_broken"})


class CleanMessageTests(unittest.TestCase):
    def test_strips_ansi_prefix_and_extra_lines(self):
        text = "\x1b[0;31mERROR:\x1b[0m [youtube] dQw4w9WgXcQ: Boom\nsecond line"
        self.assertEqual(clean_message(text), "Boom")

    def test_truncates_long_messages(self):
        self.assertLessEqual(len(clean_message("x" * 1000)), 200)


if __name__ == "__main__":
    unittest.main()
