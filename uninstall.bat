@echo off
setlocal
cd /d "%~dp0"
python host\register.py --uninstall
echo.
echo The helper is unregistered. Remove the extension from chrome://extensions yourself.
echo Your log in %USERPROFILE%\.ymy and the .venv folder here were left alone. Delete them if you like.
pause
