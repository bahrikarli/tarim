@echo off
title ACR Ziraat UTF-8 onar
cd /d "%~dp0"
node scripts\utf8-onar-acrziraat.js C:\acrziraat C:\tarim
if errorlevel 1 goto hata
node scripts\acrziraat-marka-uygula.js C:\acrziraat
if errorlevel 1 goto hata
echo.
echo Tamam. C:\acrziraat icinde DURDUR.bat sonra BASLAT.bat — tarayicida Ctrl+F5
pause
exit /b 0
:hata
pause
exit /b 1
