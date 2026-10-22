@echo off
setlocal
cd /d "%~dp0"
python host\register.py --uninstall
echo.
echo The helper is unregistered. Remove the extension from chrome://extensions yourself.
echo Your log in %USERPROFILE%\.ytm-mp3 were left alone.
pause
