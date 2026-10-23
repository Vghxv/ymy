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

where poetry >nul 2>nul
if errorlevel 1 (
  if not exist "%USERPROFILE%\.local\bin\poetry.exe" (
    echo Installing Poetry with pipx...
    python -m pip install --user --upgrade pipx --disable-pip-version-check
    python -m pipx install poetry
  )
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

echo Installing yt-dlp and its dependencies at the versions in poetry.lock...
call poetry env use python
call poetry install --no-root
if errorlevel 1 (
  echo poetry install failed. See the message above.
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
