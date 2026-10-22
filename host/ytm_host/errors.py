"""Turn raw yt-dlp / system errors into a stable code plus a short, human message."""

import re

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
PREFIX_RE = re.compile(r"^(ERROR:\s*)?(\[[^\]]+\]\s*([\w-]+:\s*)?)?")

MAX_MESSAGE_CHARS = 200

# Only these codes are worth fixing by updating yt-dlp.
UPDATABLE = frozenset({"extractor_broken"})


class HelperError(Exception):
    def __init__(self, code, message=None):
        message = message or MESSAGES.get(code, "Download failed.")
        super().__init__(message)
        self.code = code
        self.message = message

    @classmethod
    def from_text(cls, text):
        return cls(*classify(text))

    def to_message(self):
        return {"type": "error", "code": self.code, "message": self.message}


# Order matters: the first matching rule wins.
RULES = [
    ("ffmpeg_missing",
     r"ffmpeg (is )?not (found|installed)|ffprobe and ffmpeg not found|Cannot find ffmpeg",
     "ffmpeg was not found. Run install.bat again."),
    ("private", r"Private video",
     "This track is private."),
    ("age_restricted", r"confirm your age|age-restricted|inappropriate for some users",
     "This track is age-restricted and can't be downloaded without signing in."),
    ("premium", r"Music Premium|members-only|Join this channel",
     "This track needs a paid subscription."),
    ("bot_check", r"not a bot|Sign in to confirm",
     "YouTube is asking for verification. Try again later."),
    ("unavailable",
     r"Video unavailable|not available in your country|has been removed|This video is not available|blocked it",
     "This track is unavailable."),
    ("rate_limited", r"HTTP Error 429|Too Many Requests",
     "YouTube is rate-limiting requests. Wait a few minutes."),
    ("extractor_broken",
     r"HTTP Error 4\d\d|Unable to extract|nsig|signature|Requested format is not available|"
     r"player response|Failed to extract|unable to download video data|JavaScript runtime|"
     r"No supported JavaScript|challenge",
     "YouTube changed something and the downloader couldn't keep up."),
    ("network",
     r"getaddrinfo|Temporary failure|timed out|Connection (reset|refused|aborted)|"
     r"Network is unreachable|Unable to download (webpage|API JSON)|Name or service|URLError|"
     r"Remote end closed",
     "Can't reach YouTube. Check your connection."),
    ("disk",
     r"No space left|Permission denied|Access is denied|Errno 13|Errno 28|File name too long",
     "Can't write the file. Check the disk and folder permissions."),
    ("conversion_failed", r"Postprocessing|ffmpeg exited|Conversion failed",
     "Converting to MP3 failed."),
]

_COMPILED = [(code, re.compile(pattern, re.IGNORECASE), message) for code, pattern, message in RULES]
MESSAGES = {code: message for code, _, message in RULES}


def clean_message(text):
    text = ANSI_RE.sub("", str(text or "")).strip()
    first_line = text.splitlines()[0] if text else ""
    first_line = PREFIX_RE.sub("", first_line).strip()
    if len(first_line) > MAX_MESSAGE_CHARS:
        first_line = first_line[: MAX_MESSAGE_CHARS - 1] + "…"
    return first_line


def classify(text):
    """Return (code, message) for an error text."""
    raw = ANSI_RE.sub("", str(text or ""))
    for code, pattern, message in _COMPILED:
        if pattern.search(raw):
            return code, message
    return "unknown", clean_message(raw) or "Download failed."
