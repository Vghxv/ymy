@echo off
setlocal
cd /d "%~dp0"
echo === YT Music MP3 installer ===

python --version >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Installing Python 3.12 with winget...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python is installed. Close this window and run install.bat again.
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo Installing ffmpeg...
  winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
)

where deno >nul 2>nul
if errorlevel 1 (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Installing Deno, which yt-dlp needs for YouTube...
    winget install -e --id DenoLand.Deno --accept-package-agreements --accept-source-agreements
  )
)

echo Installing yt-dlp...
python -m pip install -U -r requirements.txt --disable-pip-version-check
if errorlevel 1 (
  echo pip failed. See the message above.
  pause
  exit /b 1
)

python host\register.py
if errorlevel 1 (
  echo Could not register the helper. See the message above.
  pause
  exit /b 1
)

echo.
echo Done.
echo 1. Restart your browser.
echo 2. Open chrome://extensions, turn on Developer mode, click Load unpacked.
echo 3. Pick the "extension" folder in this project.
pause
