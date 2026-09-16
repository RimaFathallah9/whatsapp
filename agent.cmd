@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\attach-chrome.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%
call npm.cmd run agent
exit /b %ERRORLEVEL%
