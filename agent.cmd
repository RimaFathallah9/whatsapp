@echo off
cd /d "%~dp0"
call npm.cmd run agent
exit /b %ERRORLEVEL%
