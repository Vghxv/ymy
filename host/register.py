"""Register (or remove) the native messaging helper for Chrome, Edge and Brave.

    python host\\register.py
    python host\\register.py --uninstall
"""

import base64
import hashlib
import json
import os
import sys

HOST_NAME = "com.ymy.downloader"

REGISTRY_BASES = [
    r"Software\Google\Chrome\NativeMessagingHosts",
    r"Software\Microsoft\Edge\NativeMessagingHosts",
    r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
]

HOST_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(HOST_DIR)
NATIVE_DIR = os.path.join(HOST_DIR, "native")
LAUNCHER_PATH = os.path.join(NATIVE_DIR, "host.bat")
MANIFEST_PATH = os.path.join(NATIVE_DIR, HOST_NAME + ".json")
EXTENSION_MANIFEST = os.path.join(PROJECT_DIR, "extension", "manifest.json")
VENV_PYTHON = os.path.join(PROJECT_DIR, ".venv", "Scripts", "python.exe")

# Paths are relative to the launcher itself (host\native\), so no folder name is ever
# pasted into the batch file, where cmd would expand any % in it.
LAUNCHER = '@echo off\r\ncd /d "%~dp0.."\r\n"%~dp0..\\..\\.venv\\Scripts\\python.exe" -X utf8 -m ytm_host\r\n'


def extension_id(manifest_path=EXTENSION_MANIFEST):
    """Chrome's id for an unpacked extension pinned by "key": sha256 of the key, hex mapped to a-p."""
    with open(manifest_path, encoding="utf-8") as handle:
        key = json.load(handle)["key"]
    digest = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def path_problem(path=PROJECT_DIR):
    """Chrome starts the helper through cmd.exe, which expands %NAME% in the path even inside quotes."""
    if "%" in path:
        return "The project folder path contains '%' ({}). Move or rename the folder so its path has no '%', then run install.bat again.".format(path)
    return ""


def install():
    import winreg

    problem = path_problem()
    if problem:
        sys.exit(problem)
    if not os.path.isfile(VENV_PYTHON):
        sys.exit("No virtual environment at {}. Run install.bat (it runs 'poetry install').".format(VENV_PYTHON))
    os.makedirs(NATIVE_DIR, exist_ok=True)

    with open(LAUNCHER_PATH, "w", newline="") as handle:
        handle.write(LAUNCHER)

    with open(MANIFEST_PATH, "w") as handle:
        json.dump(
            {
                "name": HOST_NAME,
                "description": "ymy helper",
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
    import winreg

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
