# ymy

Browser extension that downloads YouTube Music tracks as MP3s.

Windows 10/11, Chrome, Edge or Brave.

for more details, see [description.md](description.md).

## Install

1. Clone this repo somewhere permanent
2. Run `install.bat`.
3. Restart the browser.
4. Go to `chrome://extensions`, enable Developer mode, **Load unpacked**, pick the `extension` folder.

Moved the folder? Run `install.bat` again.

## Use

Open a track on music.youtube.com, click the icon, click **Download**.

Files are saved as `Artist - Title.mp3` (192 kbps, tagged) in your Music folder. Change the folder in the extension's Options.

**Check folder** tells you if you already have the track. You can make it run automatically in Options, but avoid it on network drives or huge folders.

## Updating yt-dlp

If downloads fail with "YouTube changed something", update yt-dlp:

```
poetry add "yt-dlp[default]==<version>"
poetry install --no-root --sync
```

Then restart the browser.

## Problems

Run `install.bat` again and restart the browser. If that doesn't help, check `%USERPROFILE%\.ymy\host.log`.

## Uninstall

Run `python host\register.py --uninstall`, remove the extension, and delete `%USERPROFILE%\.ymy`.
