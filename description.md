# ymy

A browser extension that saves YouTube Music audio you have the rights to as MP3 files. Open a track or playlist, click the toolbar icon, then click **Download** or **Download all**.

- Progress bar in the popup and on the icon badge
- Whole playlists, saved to their own folder, with a wait between tracks
- A list of recent downloads, available from any tab
- A download manager page that updates live
- Saves `Artist - Title.mp3` (192 kbps) with title, artist and album tags
- Downloads continue after you close the popup
- Optional check for whether you already have a track

**Works on:** Windows 10 and 11, with Chrome, Edge or Brave.

## Install

1. Download `ymy-vX.Y.Z.zip` from [Releases](https://github.com/Vghxv/ymy/releases/latest) and extract it to a folder you'll keep, for example `C:\Tools\ymy`. The path must not contain a `%` sign.
2. Double-click **`install.bat`**. It installs what's missing, sets up the helper (the program on your computer that does the downloading) and connects it to your browser. If it installs Python, close the window and run `install.bat` again.
3. Restart your browser.
4. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder inside your ymy folder.
5. Pin the **ymy** icon to the toolbar.

If you move the ymy folder, run `install.bat` again.

### What the installer changes

`install.bat` adds one Windows registry entry per browser, for your Windows user only. It needs no admin rights.

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymy.downloader
```

The entries tell your browser where to find the helper, through two files the installer creates in `host\native`. If missing, it installs Python, ffmpeg, Poetry and, unless you have Node, Deno, using winget or pipx.

## Usage

1. Open a track on [music.youtube.com](https://music.youtube.com). The icon turns **red**.
2. Click the icon, then **Download**.
3. Watch the progress in the popup, or close it and carry on.

The popup shows the current tab's track and, under it, **Recent downloads**: running ones with their progress, finished ones (the folder button shows the MP3 in Explorer) and failed ones with **Retry**. Click a title to open the track. **Clear** removes everything except running downloads.

| Icon | Meaning |
| --- | --- |
| Red | This tab is a track or playlist you can download |
| Gray | Nothing to download on this tab; the popup still opens and shows your downloads |
| Red badge `45%` | Overall progress of running downloads; hover the icon to see how many |
| Red badge `...` | A download is starting, or a playlist is waiting for its next track |
| Green badge `OK` | Everything finished; shown for a few seconds |
| Gray badge `ERR` | A download failed; stays until you open the popup or download manager, click **Clear**, or restart the browser |

### Playlists

Open a playlist, or a track played from one, and click the icon. A bar at the top of the popup offers **Download all**. The radio mix YouTube Music adds to a track doesn't count as a playlist.

- Tracks download one at a time, with a random wait of 50 to 70 seconds between them.
- You can close the popup and the browser. After a restart, the playlist continues where it left off.
- **Stop** ends the playlist after the current track. **Resume** continues it after one more wait.
- The playlist stops by itself when the next tracks would fail too, for example with no connection, a full disk or YouTube limiting your requests. **Resume** retries the same track. Any other failed track is counted and skipped; you can **Retry** it from the list.
- Only one playlist runs at a time. Click **Dismiss** on a finished or stopped playlist to start another. Single tracks can still be downloaded meanwhile.

### Download manager

Click **≡** in the popup to open the download manager in a new tab. It shows the same downloads as the popup, with more room.

- The line under the heading counts what's running, saved and failed.
- **All**, **Running**, **Saved** and **Failed** filter the list.
- Running downloads come first, then the most recent.
- **Show in folder** shows a finished MP3 in Explorer. **Open folder** opens the download folder.
- **Retry** restarts a failed download.
- **Remove** takes one finished or failed download off the list, and **Clear finished** takes off all of them. The MP3 files stay on your disk.
- Click a title to open the track on YouTube Music.
- While a playlist runs, a panel at the top shows its progress and remaining tracks, with **Stop**, **Resume** and **Dismiss**.

The list keeps the latest 200 downloads. A download that has started can't be cancelled.

### Download folder

By default, files go to your **Music** folder, or **Downloads** if Music isn't available. A playlist's tracks go to a subfolder named after the playlist, including when retried.

To choose another folder, right-click the icon → **Options**, type a full path such as `D:\Music\YouTube` and click **Save**. The folder is created if needed. **Use default** goes back to the default folder.

The folder icon at the top of the popup opens the download folder in Explorer, with the track selected if it was just downloaded or found there.

Partial downloads and audio awaiting conversion are kept in `%USERPROFILE%\.ymy\temp`. You can empty it when no download is running.

### Already downloaded?

Click **Check folder** in the popup to search your download folder and its subfolders for the track. If it's there, the popup shows **✓ In folder** (hover to see where). Only MP3s downloaded with this extension are recognized, even if renamed or moved.

To check every time the popup opens, turn on **Check for downloaded songs automatically** in the options. It's off by default.

> **Warning**
> - **Network folders:** if your download folder is on another computer (`\\server\share` or a mapped network drive), every check sends that computer your Windows sign-in details in a scrambled form (a password hash), which its owner could try to crack. Only use a network folder you trust.
> - **Large folders:** checking a big folder, or a whole drive like `C:\`, can take minutes. Use a folder that holds only your music.

**Download all** skips tracks already in the playlist's folder, so you can run it again to fetch only what's new. Tracks saved elsewhere in the download folder are downloaded again. This check always runs, and the network folder warning applies to it.

## Updating

### ymy

Once a day, ymy checks GitHub for a new version. If there is one, a notification offers **Update now** and **What's new**, and the popup shows a green bar with **Update**.

Click either update button. The helper downloads the new version, checks that it's complete and unchanged, and replaces ymy's files and components. Your settings are kept, and the extension restarts itself. No download can start during the update.

The update won't start while a download or playlist is running. Wait for downloads to finish, stopping any playlist first, then click **Retry** in the bar.

- To stop the daily check, turn off **Check GitHub for a new version of ymy once a day** in the options. **Check now** still works.
- If a new version needs `install.bat` run again, its release notes will say so.

### yt-dlp

yt-dlp is the tool ymy uses to download from YouTube. Each ymy version comes with a tested copy, which never updates itself. If YouTube changes something, downloads fail with **"YouTube changed something"**, and you can update yt-dlp yourself:

1. Find the latest version number in the [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases). Waiting a day or two after a release is safer.
2. Open a terminal in the ymy folder and run these commands, with that version number in place of `YYYY.MM.DD`:
   ```
   poetry add "yt-dlp[default]==YYYY.MM.DD"
   poetry install --no-root --sync
   ```
   If the second command gives an error, run `poetry sync --no-root` instead.
3. Restart your browser.

## Troubleshooting

| The popup says | What to do |
| --- | --- |
| Helper not installed | Run `install.bat`, then restart the browser. |
| ffmpeg was not found | Run `install.bat`, then restart the browser. |
| The helper doesn't allow this extension | Run `install.bat`. On the extensions page, the extension ID must be `daebijkbdhdfckkflkjkofmkhpemjanh`. |
| Can't create / write to the download folder | Choose another folder in the options, or click **Use default**. |
| YouTube changed something | Update ymy from the popup if it offers one; otherwise update yt-dlp (see [Updating](#updating)). |
| YouTube is asking for verification / rate-limiting | Wait a while, then try again. |
| Stopped after 3 of 20 | Fix the problem named before it, if any, then click **Resume**. |
| Anything else | Look at the log: `%USERPROFILE%\.ymy\host.log` |

## Limitations

- YouTube Music only: no regular `youtube.com` videos.
- Album pages don't offer **Download all**, but a track played from the album usually does.
- Private playlists and Liked Music can't be downloaded as a playlist, because ymy doesn't sign in.
- Age-restricted, members-only and Premium-only tracks can't be downloaded.
- No cover art is embedded.

## Privacy

ymy runs on your computer and connects only to:

- **YouTube Music:** to read playlists and download tracks. When you open the popup on a track or playlist, it also loads that page, without your sign-in, to get its name.
- **GitHub:** to look for a new version once a day (you can turn that off in the options) or when you click **Check now**, and to download it when you click **Update**.

If browser sync is on, your browser also syncs ymy's settings, including the download folder path, through your account. Nothing is collected or sent anywhere else. The helper keeps a small log in `%USERPROFILE%\.ymy\host.log`.

## Uninstall

1. Double-click **`uninstall.bat`**. It removes the registry entries and the helper's two files, which disconnects the helper from your browser.
2. Remove the extension from `chrome://extensions`.
3. Optionally, delete your ymy folder and `%USERPROFILE%\.ymy`.

---

Only download content you have the rights to.
