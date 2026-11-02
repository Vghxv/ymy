# ymy

A browser extension that saves YouTube Music audio you have the rights to as MP3 files. Open a track or a playlist, click the toolbar icon, click **Download** or **Download all**.

- One click per track, with a progress bar in the popup and on the icon badge
- One click for a whole playlist, saved to its own folder, with a wait between tracks
- A list of recent downloads, so you can follow them from any tab
- A download manager page that updates live while downloads run
- Saves `Artist - Title.mp3` (192 kbps) with title, artist and album tags
- Downloads keep going when you close the popup
- Optional check for whether you already have the track

**Works on:** Windows 10 and 11, with Chrome, Edge or Brave.

## Install

1. Download `ymy-vX.Y.Z.zip` from [Releases](https://github.com/Vghxv/ymy/releases/latest) and extract it to a folder you'll keep, for example `C:\Tools\ymy`. The folder path must not contain a `%` sign.
2. Double-click **`install.bat`**. It installs what's missing, sets up the helper (the small program on your computer that does the downloading) and connects it to your browser. If it installs Python, close the window and run `install.bat` again.
3. Restart your browser.
4. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder inside your ymy folder.
5. Pin the **ymy** icon to the toolbar.

If you move the ymy folder later, run `install.bat` again.

### What the installer changes

To connect the helper to your browsers, `install.bat` adds one entry per browser to the Windows registry. They apply to your Windows user only, and no admin rights are needed:

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymy.downloader
```

These entries tell your browser where to find the helper, using two small files the installer creates in the `host\native` folder. If your computer is missing Python, ffmpeg, Deno or Poetry, the installer adds them the usual way, with Windows' package manager (winget) or Python's (pipx).

## Usage

1. Open a track on [music.youtube.com](https://music.youtube.com). The icon turns **red** (it is gray on pages with nothing to download, such as the home page).
2. Click the icon, then **Download**.
3. Watch the progress in the popup, or close it and carry on: play another track, switch tabs, start more downloads.

The icon can always be clicked, even when it's gray. The popup shows the track in the current tab at the top and, under it, **Recent downloads**: running downloads with their progress, finished ones (the folder button shows the MP3 in Explorer) and failed ones with a **Retry** button. Click a title to open the track again. **Clear** empties the list; running downloads stay.

| Icon | Meaning |
| --- | --- |
| Red | This tab is a track or playlist you can download |
| Gray | Nothing to download on this tab (the popup still shows your downloads) |
| Red badge `45%` | Downloads are running (overall progress); hover the icon to see how many |
| Red badge `...` | A download is starting, or a playlist is waiting for its next track |
| Green badge `OK` | Everything finished, shown for a few seconds |
| Gray badge `ERR` | A download failed; stays until you open the popup or download manager, click **Clear**, or restart the browser |

### Playlists

Open a playlist, or a track you played from one, and click the icon. A bar at the top of the popup offers **Download all**. The radio mix YouTube Music adds to a track you play isn't a playlist, so it gets no such offer.

- Tracks download one at a time, with a random wait of 50 to 70 seconds between them. A long playlist takes a while.
- You can close the popup and the browser. After a restart, the playlist continues where it left off.
- **Stop** ends the playlist after the track being downloaded, and **Resume** continues it after one more wait.
- The playlist stops by itself when the next tracks would fail too, for example with no connection, a full disk or YouTube limiting your requests. **Resume** tries the same track again. Any other failed track is counted and skipped; you can **Retry** it from the list.
- Only one playlist runs at a time. Click **Dismiss** on a finished or stopped playlist to start another. You can still download single tracks in the meantime.

### Download manager

Click the **≡** button in the popup to open the download manager in a new tab. It shows the same downloads as the popup with more room, and updates by itself while downloads run, wherever you started them. You can keep it open in the background.

- The line under the heading counts what's running, saved and failed.
- **All**, **Running**, **Saved** and **Failed** filter the list.
- Running downloads come first, with their progress. After them, the most recent download comes first.
- **Show in folder** shows a finished MP3 in Explorer, and **Open folder** at the top opens the download folder.
- **Retry** starts a failed download again.
- **Remove** takes one finished or failed download off the list, and **Clear finished** takes off all of them. The MP3 files stay on your disk.
- Click a title to open the track on YouTube Music.
- While a playlist runs, a panel at the top shows its progress and the tracks still to come, with the same **Stop**, **Resume** and **Dismiss** buttons as the popup.

The list keeps the latest 200 downloads, shared with the popup. A download that has started can't be cancelled.

### Download folder

By default, files go to your **Music** folder (or **Downloads** if Music isn't available). A playlist's tracks go to a subfolder named after the playlist, and retrying one of them saves it there too.

To choose another folder: right-click the icon → **Options**, type a full path such as `D:\Music\YouTube` and click **Save**. The folder is created if needed. **Use default** goes back to the Music folder.

The folder icon at the top of the popup opens the download folder in Explorer, with the track selected if it was just downloaded or found there.

Only finished MP3s go to the download folder. Partial downloads and the audio before conversion are kept in `%USERPROFILE%\.ymy\temp`, which you can empty whenever no download is running.

### Already downloaded?

Click **Check folder** in the popup to find out whether the track is already in your download folder or any of its subfolders. If it is, the popup shows **✓ In folder** (hover to see where).

Only MP3s downloaded with this extension are recognized, even if you renamed or moved them since.

**Download all** always leaves out the tracks already in the playlist's own folder, whatever this setting is, so you can run it again to fetch only what's new. It doesn't look in the rest of the download folder, so a track you saved elsewhere is downloaded again. The network folder warning below applies here too.

To check automatically every time the popup opens, turn on **Check for downloaded songs automatically** in the options. It's off by default:

> **Warning**
> - **Network folders:** if your download folder is on another computer (`\\server\share` or a mapped network drive), every check sends that computer your Windows sign-in details in a scrambled form (a password hash), which its owner could try to crack. Only use a network folder you trust.
> - **Large folders:** checking a big folder, or a whole drive like `C:\`, can take minutes. Use a folder that holds only your music.

## Updating

### Updating ymy

Once a day the extension asks GitHub whether a new version of ymy has been released. If there is one:

- a notification pops up with **Update now** and **What's new** buttons, and
- the popup shows a green bar with an **Update** button until you update.

One click is enough. The helper downloads the new version from GitHub, checks that the download is complete and unchanged, and replaces ymy's files and components. Your settings are kept, and the extension then restarts itself. Downloads can't start while this runs. If a download or playlist is still running, the update doesn't start and the popup asks you to wait: click **Retry** in the bar once they finish, or **Stop** the playlist first.

- To stop the daily check, turn off **Check GitHub for a new version of ymy once a day** in the options. **Check now** there still works.
- If a new version needs `install.bat` to be run again, its release notes will say so.

### Updating yt-dlp yourself

yt-dlp is the tool ymy uses to download from YouTube. Each new version of ymy comes with a tested copy of it, and between versions it never updates itself. When YouTube changes something, downloads fail with **"YouTube changed something"**, and you can update yt-dlp yourself:

1. Check the [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) for the latest version number. Waiting a day or two after a release is safer.
2. Open a terminal in the ymy folder and run these commands, with that version number in place of `YYYY.MM.DD`:
   ```
   poetry add "yt-dlp[default]==YYYY.MM.DD"
   poetry install --no-root --sync
   ```
   If the second command gives an error, run `poetry sync --no-root` instead.
3. Restart your browser.

Nothing ymy depends on changes by itself: only updating ymy or following these steps changes it.

## Troubleshooting

| The popup says | What to do |
| --- | --- |
| Helper not installed | Run `install.bat`, then restart the browser. |
| The helper doesn't allow this extension | Run `install.bat` again. On the extensions page, the extension ID must be `daebijkbdhdfckkflkjkofmkhpemjanh`. |
| ffmpeg was not found | Run `install.bat` again, then restart the browser. |
| Can't create / write to the download folder | Choose another folder in the options, or click **Use default**. |
| YouTube changed something | Update ymy from the popup if it offers one, else update yt-dlp (see [Updating](#updating)). |
| YouTube is asking for verification / rate-limiting | Wait a while and try again. |
| This track is age-restricted / needs a paid subscription | These tracks can't be downloaded. |
| Can't open this playlist | Private playlists and Liked Music need a sign-in, which ymy doesn't do. |
| Stopped after 3 of 20 | Fix what the message before it says, if anything, then click **Resume**. |
| Anything else | Look at the log: `%USERPROFILE%\.ymy\host.log` |

If `install.bat` reports that the project folder path contains `%`, move or rename your ymy folder and run it again.

## Limitations

- YouTube Music only: no regular `youtube.com` videos.
- Album pages don't offer **Download all**, but a track you play from the album usually does.
- Private playlists and Liked Music can't be downloaded as a playlist, because ymy doesn't sign in.
- Age-restricted, members-only and Premium-only tracks can't be downloaded.
- No cover art is embedded.

## Privacy

Everything runs on your computer, and only these connections leave it:

- **YouTube Music:** to read playlists and download tracks. When you open the popup on a track or playlist, it also loads that page, without your sign-in, to get its name.
- **GitHub:** to look for a new version of ymy once a day (you can turn that off in the options) and when you click **Check now**, and to download it when you click **Update**.
- **Your browser account:** if browser sync is on, your browser syncs ymy's settings, including the download folder path, through your account.

Nothing is collected or sent anywhere else. The helper keeps a small log in `%USERPROFILE%\.ymy\host.log`.

## Uninstall

1. Double-click **`uninstall.bat`**. It removes the registry entries and the helper's two small files, which disconnects the helper from your browser.
2. Remove the extension from `chrome://extensions`.
3. Optionally, delete your ymy folder and `%USERPROFILE%\.ymy`.

---

Only download content you have the rights to.
