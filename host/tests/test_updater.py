import hashlib
import io
import json
import os
import subprocess
import tempfile
import unittest
import zipfile

from ytm_host import updater
from ytm_host.errors import HelperError

TAG = "v1.2.3"
ZIP_URL = updater.DOWNLOAD_PREFIX + TAG + "/ymy-" + TAG + ".zip"


def make_zip(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    return buffer.getvalue()


def release_json(data, digest=None):
    digest = digest or "sha256:" + hashlib.sha256(data).hexdigest()
    return json.dumps(
        {"assets": [{"name": "ymy-" + TAG + ".zip", "browser_download_url": ZIP_URL, "digest": digest}]}
    ).encode("utf-8")


GOOD_FILES = {
    "ymy/": "",
    "ymy/extension/manifest.json": '{"version": "1.2.3"}',
    "ymy/host/ytm_host/new_module.py": "x = 1\n",
}


class Run:
    """Stands in for subprocess.run and records the call."""

    def __init__(self, returncode=0):
        self.returncode = returncode
        self.calls = []

    def __call__(self, args, **kwargs):
        self.calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, self.returncode, stdout=b"ok")


class RunUpdateTests(unittest.TestCase):
    def setUp(self):
        self.project = tempfile.TemporaryDirectory()
        self.addCleanup(self.project.cleanup)
        self.root = self.project.name
        os.makedirs(os.path.join(self.root, "extension"))
        with open(os.path.join(self.root, "extension", "manifest.json"), "w") as handle:
            handle.write('{"version": "1.0.0"}')
        self.messages = []

    def update(self, data, release=None, run=None, tag=TAG):
        release = release if release is not None else release_json(data)
        responses = {updater.API_URL.format(TAG): release, ZIP_URL: data}
        self.run = run or Run()
        updater.run_update(
            tag,
            self.messages.append,
            project_dir=self.root,
            fetch=lambda url, limit=None: responses[url],
            run=self.run,
            which=lambda name: "C:\\poetry.exe",
        )
        return self.messages[-1]

    def read(self, *parts):
        with open(os.path.join(self.root, *parts)) as handle:
            return handle.read()

    def test_replaces_files_and_reinstalls(self):
        last = self.update(make_zip(GOOD_FILES))
        self.assertEqual(last, {"type": "updated", "version": TAG})
        self.assertEqual(self.read("extension", "manifest.json"), '{"version": "1.2.3"}')
        self.assertEqual(self.read("host", "ytm_host", "new_module.py"), "x = 1\n")
        self.assertFalse(os.path.exists(os.path.join(self.root, updater.STAGING_NAME)))
        args, kwargs = self.run.calls[0]
        self.assertEqual(args[:3], ["C:\\poetry.exe", "install", "--no-root"])
        self.assertEqual(kwargs["cwd"], self.root)
        self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
        steps = [m["step"] for m in self.messages if m["type"] == "update_progress"]
        self.assertEqual(steps, ["downloading", "installing"])

    def test_checksum_mismatch_changes_nothing(self):
        data = make_zip(GOOD_FILES)
        last = self.update(data, release=release_json(data, digest="sha256:" + "0" * 64))
        self.assertEqual(last["type"], "error")
        self.assertIn("checksum", last["message"])
        self.assertEqual(self.read("extension", "manifest.json"), '{"version": "1.0.0"}')
        self.assertEqual(self.run.calls, [])

    def test_path_outside_the_project_is_refused(self):
        files = dict(GOOD_FILES, **{"ymy/../evil.txt": "x"})
        last = self.update(make_zip(files))
        self.assertEqual(last["type"], "error")
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(self.root), "evil.txt")))
        self.assertEqual(self.read("extension", "manifest.json"), '{"version": "1.0.0"}')

    def test_zip_may_not_touch_the_venv(self):
        last = self.update(make_zip(dict(GOOD_FILES, **{"ymy/.venv/Scripts/python.exe": "x"})))
        self.assertEqual(last["type"], "error")

    def test_bad_tag_is_refused_before_any_download(self):
        last = self.update(b"", tag="v1.2.3/../../x")
        self.assertEqual(last, {"type": "error", "code": "update", "message": "Unknown version."})

    def test_git_clone_is_left_to_git(self):
        os.makedirs(os.path.join(self.root, ".git"))
        last = self.update(make_zip(GOOD_FILES))
        self.assertEqual(last["code"], "git_clone")
        self.assertEqual(self.read("extension", "manifest.json"), '{"version": "1.0.0"}')

    def test_failed_poetry_install_is_reported(self):
        last = self.update(make_zip(GOOD_FILES), run=Run(returncode=1))
        self.assertEqual(last["type"], "error")
        self.assertIn("install.bat", last["message"])

    def test_network_failure(self):
        def fetch(url, limit=None):
            raise OSError("getaddrinfo failed")

        updater.run_update(TAG, self.messages.append, project_dir=self.root, fetch=fetch, run=Run())
        self.assertEqual(self.messages[-1]["code"], "network")


class ReleaseAssetTests(unittest.TestCase):
    def test_asset_from_another_host_is_refused(self):
        release = {"assets": [{"name": "ymy-v1.2.3.zip", "browser_download_url": "https://evil.example/x.zip",
                               "digest": "sha256:ab"}]}
        with self.assertRaises(HelperError):
            updater.release_asset(release, TAG)

    def test_asset_without_digest_is_refused(self):
        release = {"assets": [{"name": "ymy-v1.2.3.zip", "browser_download_url": ZIP_URL}]}
        with self.assertRaises(HelperError):
            updater.release_asset(release, TAG)


class FindPoetryTests(unittest.TestCase):
    def test_falls_back_to_pipx_location(self):
        with tempfile.TemporaryDirectory() as home:
            os.makedirs(os.path.join(home, ".local", "bin"))
            path = os.path.join(home, ".local", "bin", "poetry.exe")
            open(path, "w").close()
            self.assertEqual(updater.find_poetry(lambda name: None, home=home), path)

    def test_none_when_missing(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertIsNone(updater.find_poetry(lambda name: None, home=home))


if __name__ == "__main__":
    unittest.main()
