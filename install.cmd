@echo off
cd /d "%~dp0"
call npm.cmd install
exit /b %ERRORLEVEL%
