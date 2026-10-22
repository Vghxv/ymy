import os
import tempfile
import unittest

from ytm_host import system
from ytm_host.errors import HelperError


class OutputDirTests(unittest.TestCase):
    def test_defaults_to_music(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(system.resolve_output_dir(home), os.path.join(home, "Music"))

    def test_music_blocked_falls_back_to_downloads(self):
        with tempfile.TemporaryDirectory() as home:
            with open(os.path.join(home, "Music"), "w") as handle:
                handle.write("a file where the folder should be")
            self.assertEqual(system.resolve_output_dir(home), os.path.join(home, "Downloads"))

    def test_nothing_usable_raises(self):
        with tempfile.TemporaryDirectory() as home:
            for name in ("Music", "Downloads"):
                with open(os.path.join(home, name), "w") as handle:
                    handle.write("x")
            missing_home = os.path.join(home, "Music", "nested")
            with self.assertRaises(HelperError) as ctx:
                system.resolve_output_dir(missing_home)
            self.assertEqual(ctx.exception.code, "disk")


class ChosenOutputDirTests(unittest.TestCase):
    def test_chosen_folder_wins_and_is_created(self):
        with tempfile.TemporaryDirectory() as home:
            target = os.path.join(home, "picked", "sub")
            self.assertEqual(system.resolve_output_dir(home, chosen=target), target)
            self.assertTrue(os.path.isdir(target))

    def test_relative_chosen_folder_raises(self):
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaises(HelperError):
                system.resolve_output_dir(home, chosen="Music")

    def test_unusable_chosen_folder_raises_instead_of_falling_back(self):
        with tempfile.TemporaryDirectory() as home:
            blocker = os.path.join(home, "file")
            open(blocker, "w").close()
            with self.assertRaises(HelperError):
                system.resolve_output_dir(home, chosen=os.path.join(blocker, "sub"))

    def test_blank_chosen_folder_uses_default(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(system.resolve_output_dir(home, chosen="  "), os.path.join(home, "Music"))


class FfmpegTests(unittest.TestCase):
    def test_prefers_path(self):
        self.assertEqual(system.find_ffmpeg(which=lambda name: "C:\\bin\\ffmpeg.exe"), "C:\\bin\\ffmpeg.exe")

    def test_finds_winget_link(self):
        with tempfile.TemporaryDirectory() as base:
            links = os.path.join(base, "Microsoft", "WinGet", "Links")
            os.makedirs(links)
            exe = os.path.join(links, "ffmpeg.exe")
            open(exe, "w").close()
            self.assertEqual(system.find_ffmpeg(which=lambda n: None, local_appdata=base, program_data=""), exe)

    def test_finds_winget_package_folder(self):
        with tempfile.TemporaryDirectory() as base:
            bin_dir = os.path.join(base, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_x", "ffmpeg-7", "bin")
            os.makedirs(bin_dir)
            exe = os.path.join(bin_dir, "ffmpeg.exe")
            open(exe, "w").close()
            self.assertEqual(system.find_ffmpeg(which=lambda n: None, local_appdata=base, program_data=""), exe)

    def test_not_found(self):
        with tempfile.TemporaryDirectory() as base:
            self.assertIsNone(system.find_ffmpeg(which=lambda n: None, local_appdata=base, program_data=base))


class JsRuntimeTests(unittest.TestCase):
    def test_deno_is_the_default(self):
        self.assertEqual(system.js_runtime_options(which=lambda n: "x" if n == "deno" else None), {})

    def test_node_is_used_when_deno_is_missing(self):
        options = system.js_runtime_options(which=lambda n: "x" if n == "node" else None)
        self.assertEqual(options, {"js_runtimes": {"node": {}}})

    def test_neither(self):
        self.assertEqual(system.js_runtime_options(which=lambda n: None), {})


class AugmentPathTests(unittest.TestCase):
    def test_adds_winget_links_once(self):
        with tempfile.TemporaryDirectory() as base:
            links = os.path.join(base, "Microsoft", "WinGet", "Links")
            os.makedirs(links)
            environ = {"PATH": "C:\\Windows"}
            system.augment_path(base, environ)
            system.augment_path(base, environ)
            self.assertEqual(environ["PATH"].split(os.pathsep).count(links), 1)


if __name__ == "__main__":
    unittest.main()
