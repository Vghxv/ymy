import os
import subprocess
import tempfile
import unittest
from types import SimpleNamespace

from ytm_host.updater import COOLDOWN_SECONDS, update_yt_dlp


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.stamp = os.path.join(self.folder.name, "last_update")
        self.calls = []

    def tearDown(self):
        self.folder.cleanup()

    def runner(self, returncode=0, error=None):
        def run(command, **kwargs):
            self.calls.append(command)
            if error:
                raise error
            return SimpleNamespace(returncode=returncode)

        return run

    def test_runs_pip_and_reports_success(self):
        self.assertTrue(update_yt_dlp(self.stamp, run=self.runner(0), python="py"))
        self.assertEqual(self.calls[0][:5], ["py", "-m", "pip", "install", "-U"])
        self.assertIn("yt-dlp[default]", self.calls[0])

    def test_pip_failure_is_reported(self):
        self.assertFalse(update_yt_dlp(self.stamp, run=self.runner(1)))

    def test_missing_pip_is_reported(self):
        self.assertFalse(update_yt_dlp(self.stamp, run=self.runner(error=OSError("no pip"))))

    def test_timeout_is_reported(self):
        self.assertFalse(update_yt_dlp(self.stamp, run=self.runner(error=subprocess.TimeoutExpired("pip", 1))))

    def test_cooldown_blocks_a_second_attempt(self):
        self.assertTrue(update_yt_dlp(self.stamp, run=self.runner(0)))
        self.assertFalse(update_yt_dlp(self.stamp, run=self.runner(0)))
        self.assertEqual(len(self.calls), 1)

    def test_cooldown_expires(self):
        update_yt_dlp(self.stamp, run=self.runner(0))
        later = os.path.getmtime(self.stamp) + COOLDOWN_SECONDS + 1
        self.assertTrue(update_yt_dlp(self.stamp, run=self.runner(0), now=lambda: later))
        self.assertEqual(len(self.calls), 2)

    def test_failed_attempt_still_starts_the_cooldown(self):
        update_yt_dlp(self.stamp, run=self.runner(1))
        self.assertFalse(update_yt_dlp(self.stamp, run=self.runner(0)))


if __name__ == "__main__":
    unittest.main()
