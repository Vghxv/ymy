# YT Music MP3

A browser extension that saves YouTube Music tracks as MP3 files. Open a track, click the toolbar icon, click **Download**.

- One click per track, with a progress bar in the popup and on the icon badge
- Saves `Artist - Title.mp3` (192 kbps) with title, artist and album tags
- Downloads keep going when you close the popup
- Optional check for whether you already have the track

**Works on:** Windows 10 and 11, with Chrome, Edge or Brave.

## Install

1. Download or clone this repository to a folder you'll keep, for example `C:\Tools\ytm-mp3`. The folder path must not contain a `%` sign.
2. Double-click **`install.bat`**. It installs what's missing (Python, ffmpeg, Deno, Poetry), sets up the downloader and connects it to your browser. If it installs Python, close the window and run `install.bat` again.
3. Restart your browser.
4. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder inside this project.
5. Pin the **YT Music MP3** icon to the toolbar.

If you move the project folder later, run `install.bat` again.

## Usage

1. Open a track on [music.youtube.com](https://music.youtube.com). The icon turns **red** (it is gray on pages with nothing to download, such as the home page or a playlist).
2. Click the icon, then **Download**.
3. Watch the progress in the popup, or close it: the badge shows the progress, then `OK` or `ERR`.

If a download fails, the popup says why and shows a **Retry** button.

### Download folder

By default, files go to your **Music** folder (or **Downloads** if Music isn't available).

To choose another folder: right-click the icon → **Options**, type a full path such as `D:\Music\YouTube` and click **Save**. The folder is created if needed. **Use default** goes back to the Music folder.

Only finished MP3s go to the download folder. Partial downloads and the audio before conversion are kept in `%USERPROFILE%\.ytm-mp3\temp`, which you can empty whenever no download is running.

### Already downloaded?

Click **Check folder** in the popup to find out whether the track is already in your download folder or any of its subfolders. If it is, the popup shows **✓ In folder** (hover to see where).

Only MP3s downloaded with this extension are recognized, even if you renamed or moved them since.

To check automatically every time the popup opens, turn on **Check for downloaded songs automatically** in the options. It's off by default:

> **Warning**
> - **Network folders:** if your download folder is on another computer (`\\server\share` or a mapped network drive), every check sends that computer your Windows password hash. Only use a network folder you trust.
> - **Large folders:** checking a big folder, or a whole drive like `C:\`, can take minutes. Use a folder that holds only your music.

## Updating

The downloader (yt-dlp) is kept at a fixed version and never updates itself. When YouTube changes something, downloads fail with **"YouTube changed something"**, and you update it yourself:

1. Check the [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) for the latest version number. Waiting a day or two after a release is safer.
2. Open a terminal in the project folder and run, with that version number:
   ```
   poetry add "yt-dlp[default]==2026.11.05"
   poetry install --no-root --sync
   ```
   On Poetry 2.x, the second command is `poetry sync --no-root`.
3. Restart your browser.

Every package is installed at an exact, checksum-verified version listed in `poetry.lock`, so nothing changes unless you run these steps.

## Troubleshooting

| The popup says | What to do |
| --- | --- |
| Helper not installed | Run `install.bat`, then restart the browser. |
| The helper doesn't allow this extension | Run `install.bat` again. On the extensions page, the extension ID must be `daebijkbdhdfckkflkjkofmkhpemjanh`. |
| ffmpeg was not found | Run `install.bat` again, then restart the browser. |
| Can't create / write to the download folder | Choose another folder in the options, or click **Use default**. |
| YouTube changed something | Update yt-dlp (see [Updating](#updating)). |
| YouTube is asking for verification / rate-limiting | Wait a while and try again. |
| This track is age-restricted / needs a paid subscription | These tracks can't be downloaded. |
| Anything else | Look at the log: `%USERPROFILE%\.ytm-mp3\host.log` |

If `install.bat` reports that the project folder path contains `%`, move or rename the folder and run it again.

## Limitations

- Single tracks only: no playlists or albums, and no regular `youtube.com` videos.
- Age-restricted, members-only and Premium-only tracks can't be downloaded.
- No cover art is embedded.

## Privacy

Everything runs on your computer. The extension only talks to YouTube Music (to download) and to the local helper. Nothing is collected or sent anywhere else. The helper keeps a small log in `%USERPROFILE%\.ytm-mp3\host.log`.

## Uninstall

1. Run **`uninstall.bat`** to disconnect the helper from your browser.
2. Remove the extension from `chrome://extensions`.
3. Optionally, delete the project folder and `%USERPROFILE%\.ytm-mp3`.

---

Only download content you have the rights to.
