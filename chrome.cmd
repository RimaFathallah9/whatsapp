@echo off
cd /d "%~dp0"
call npm.cmd run chrome
exit /b %ERRORLEVEL%
