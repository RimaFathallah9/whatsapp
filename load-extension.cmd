@echo off
setlocal
cd /d "%~dp0"
echo PRIVATE EXTENSION
echo.
echo 1. Chrome -^> chrome://extensions
echo 2. Turn on Developer mode
echo 3. Load unpacked
echo 4. Select this folder:
echo    %cd%\extension
echo.
explorer "%cd%\extension"
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" chrome://extensions
exit /b 0
