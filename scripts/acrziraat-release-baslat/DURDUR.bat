@echo off
echo ACR Ziraat durduruluyor...
taskkill /F /IM "ACR-Ziraat-Otomasyon.exe" >nul 2>&1
taskkill /F /IM "acrziraat-otomasyon.exe" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3012 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Tamam.
timeout /t 2 >nul
