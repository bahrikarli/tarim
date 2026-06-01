@echo off
title tarim -^> acrziraat senkron + otomatik paket
cd /d "%~dp0"
echo.
echo [1/2] Kod senkronu...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\senkron-acrziraat.ps1"
if errorlevel 1 exit /b 1
echo.
echo [2/2] ACR Ziraat release ^(surum +1, zip^)...
call "C:\acrziraat\release-otomatik.bat"
exit /b %ERRORLEVEL%
