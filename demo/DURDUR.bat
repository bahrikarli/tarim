@echo off
echo Tarim Otomasyon durduruluyor...
taskkill /F /IM "Tarim-Otomasyon.exe" >nul 2>&1
taskkill /F /IM "Tarım Otomasyon.exe" >nul 2>&1
taskkill /F /IM "tarim-otomasyon.exe" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3011 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Tamam.
timeout /t 2 >nul
