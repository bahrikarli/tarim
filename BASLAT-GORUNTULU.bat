@echo off
title Tarim Otomasyon — Gorsel Baslat
cd /d "%~dp0"

if not exist "%~dp0demo\BASLAT.bat" (
  echo demo\BASLAT.bat bulunamadi.
  pause
  exit /b 1
)

call "%~dp0demo\BASLAT.bat"
exit /b %ERRORLEVEL%
