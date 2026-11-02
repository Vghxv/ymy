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

1. Download `ymy-vX.Y.Z.zip` from [Releases](https://github.com/Vghxv/ymy/releases/latest) and extract it to a folder you'll keep, for example `C:\Tools\ymy`. The folder path must not contain a `%` sign. A git clone works too, but you then update it with git instead of one click (see [Updating](#updating)).
2. Double-click **`install.bat`**. It installs what's missing (Python, ffmpeg, Deno, Poetry), sets up the downloader and connects it to your browser. If it installs Python, close the window and run `install.bat` again.
3. Restart your browser.
4. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder inside this project.
5. Pin the **ymy** icon to the toolbar.

If you move the project folder later, run `install.bat` again.

### What the installer changes

To connect the helper to your browsers, `install.bat` adds one registry key per browser, for your Windows user only (`HKEY_CURRENT_USER`, no admin rights needed):

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ymy.downloader
HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymy.downloader
```

Each key points to `host\native\com.ymy.downloader.json`, which the installer writes along with its launcher, `host\native\host.bat`. Python, ffmpeg, Deno and Poetry, if the installer has to add them, are installed the usual way through winget or pipx.

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
| Gray badge `ERR` | A download failed; stays until you open the popup |

### Playlists

Open a playlist, or a track you played from one, and click the icon. A bar at the top of the popup offers **Download all**. The radio mix YouTube Music adds to a track you play isn't a playlist, so it gets no such offer.

- Tracks download one at a time, with a random wait of 50 to 70 seconds between them. A long playlist takes a while.
- You can close the popup and the browser. After a restart, the playlist continues where it left off.
- **Stop** ends the playlist after the track being downloaded, and **Resume** continues it after one more wait.
- The playlist stops by itself when the next tracks would fail too, for example with no connection, a full disk or YouTube rate-limiting. **Resume** tries the same track again. Any other failed track is counted and skipped; you can **Retry** it from the list.
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
> - **Network folders:** if your download folder is on another computer (`\\server\share` or a mapped network drive), every check sends that computer your Windows password hash. Only use a network folder you trust.
> - **Large folders:** checking a big folder, or a whole drive like `C:\`, can take minutes. Use a folder that holds only your music.

## Updating

### ymy

Once a day the extension asks GitHub whether a new version of ymy has been released. If there is one:

- a notification pops up with **Update now** and **What's new** buttons, and
- the popup shows a green bar with an **Update** button until you update.

One click is enough. The helper downloads `ymy-vX.Y.Z.zip` from the release, checks it against the SHA-256 checksum GitHub publishes for it, replaces the project files (your `.venv` and settings are kept), runs `poetry install` for the new versions in `poetry.lock`, and the extension restarts itself. Downloads can't start while this runs. If a download or playlist is still running, the update doesn't start and the popup asks you to wait: click **Retry** in the bar once they finish, or **Stop** the playlist first.

- To stop the daily check, turn off **Check GitHub for a new version of ymy once a day** in the options. **Check now** there still works.
- If you cloned the project with git, the one-click update refuses to overwrite your clone. Run `git pull` and `poetry install --no-root` instead.
- If the release changes how the helper is registered, its release notes will say to run `install.bat` again.

### yt-dlp by hand

New ymy releases come with a tested yt-dlp version. Between releases, yt-dlp stays at a fixed version and never updates itself. When YouTube changes something, downloads fail with **"YouTube changed something"**, and you can update it yourself:

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
| YouTube changed something | Update ymy from the popup if it offers one, else update yt-dlp (see [Updating](#updating)). |
| This copy is a git clone | Run `git pull`, then `poetry install --no-root`. |
| YouTube is asking for verification / rate-limiting | Wait a while and try again. |
| This track is age-restricted / needs a paid subscription | These tracks can't be downloaded. |
| Can't open this playlist | Private playlists and Liked Music need a sign-in, which ymy doesn't do. |
| Stopped after 3 of 20 | Fix what the message before it says, if anything, then click **Resume**. |
| Anything else | Look at the log: `%USERPROFILE%\.ymy\host.log` |

If `install.bat` reports that the project folder path contains `%`, move or rename the folder and run it again.

## Limitations

- YouTube Music only: no regular `youtube.com` videos.
- Album pages don't offer **Download all**.
- Private playlists and Liked Music can't be downloaded as a playlist, because ymy doesn't sign in.
- Age-restricted, members-only and Premium-only tracks can't be downloaded.
- No cover art is embedded.

## Privacy

Everything runs on your computer. The extension only talks to YouTube Music (to download), to the local helper, and once a day to GitHub to look for a new ymy release (you can turn that off in the options). When you click **Update**, the helper downloads the release from GitHub. Nothing is collected or sent anywhere else. The helper keeps a small log in `%USERPROFILE%\.ymy\host.log`.

## Uninstall

1. Double-click **`uninstall.bat`**. It removes the registry keys and the files in `host\native\`, which disconnects the helper from your browser.
2. Remove the extension from `chrome://extensions`.
3. Optionally, delete the project folder and `%USERPROFILE%\.ymy`.

## Development

Run the tests from the project folder:

```
npm test                          # extension, needs Node 22
poetry run npm run test:host      # helper
```

GitHub Actions runs both on Windows on every push to `main` and on every pull request, except for changes that only touch docs or assets (see `.github/workflows/test.yml`).

---

Only download content you have the rights to.
