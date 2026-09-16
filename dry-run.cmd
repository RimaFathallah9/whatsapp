@echo off
cd /d "%~dp0"
call npm.cmd run dry-run
exit /b %ERRORLEVEL%
