"""Register (or remove) the native messaging helper for Chrome, Edge and Brave.

    python host\\register.py
    python host\\register.py --uninstall
"""

import base64
import hashlib
import json
import os
import sys
import winreg

HOST_NAME = "com.ytm_mp3.downloader"

REGISTRY_BASES = [
    r"Software\Google\Chrome\NativeMessagingHosts",
    r"Software\Microsoft\Edge\NativeMessagingHosts",
    r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
]

HOST_DIR = os.path.dirname(os.path.abspath(__file__))
NATIVE_DIR = os.path.join(HOST_DIR, "native")
LAUNCHER_PATH = os.path.join(NATIVE_DIR, "host.bat")
MANIFEST_PATH = os.path.join(NATIVE_DIR, HOST_NAME + ".json")
EXTENSION_MANIFEST = os.path.join(os.path.dirname(HOST_DIR), "extension", "manifest.json")


def extension_id(manifest_path=EXTENSION_MANIFEST):
    """Chrome's id for an unpacked extension pinned by "key": sha256 of the key, hex mapped to a-p."""
    with open(manifest_path, encoding="utf-8") as handle:
        key = json.load(handle)["key"]
    digest = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def install():
    os.makedirs(NATIVE_DIR, exist_ok=True)

    with open(LAUNCHER_PATH, "w", newline="") as handle:
        handle.write('@echo off\r\ncd /d "{}"\r\n"{}" -X utf8 -m ytm_host\r\n'.format(HOST_DIR, sys.executable))

    with open(MANIFEST_PATH, "w") as handle:
        json.dump(
            {
                "name": HOST_NAME,
                "description": "YT Music MP3 helper",
                "path": LAUNCHER_PATH,
                "type": "stdio",
                "allowed_origins": ["chrome-extension://{}/".format(extension_id())],
            },
            handle,
            indent=2,
        )

    for key_path in _registry_keys():
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, MANIFEST_PATH)
    print("Helper registered for Chrome, Edge and Brave.")


def _registry_keys():
    return [base + "\\" + HOST_NAME for base in REGISTRY_BASES]


def uninstall():
    for key_path in _registry_keys():
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
        except FileNotFoundError:
            pass
    for path in (LAUNCHER_PATH, MANIFEST_PATH):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
    print("Helper unregistered.")


if __name__ == "__main__":
    if "--uninstall" in sys.argv[1:]:
        uninstall()
    else:
        install()
