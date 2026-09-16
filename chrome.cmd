@echo off
setlocal
cd /d "%~dp0"
echo CHROME_ATTACH_V5
call npm.cmd run chrome
exit /b %ERRORLEVEL%
