@echo off
setlocal
cd /d "%~dp0"
echo CHROME_ATTACH_V6
call npm.cmd run chrome
exit /b %ERRORLEVEL%
