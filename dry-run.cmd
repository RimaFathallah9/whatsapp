@echo off
setlocal
cd /d "%~dp0"
echo CHROME_ATTACH_V4
call npm.cmd run dry-run
exit /b %ERRORLEVEL%
