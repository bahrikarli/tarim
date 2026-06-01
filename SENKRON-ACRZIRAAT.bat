@echo off
title tarim -^> acrziraat kod senkronu
cd /d "%~dp0"
echo.
echo  tarim kodlari acrziraat klasorune aktarilir.
echo  .env ve veritabani DEGISMEZ.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\senkron-acrziraat.ps1"
echo.
pause
