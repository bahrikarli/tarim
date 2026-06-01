@echo off
setlocal
cd /d "%~dp0"

if not exist "baslat-arkaplan.ps1" (
  msg * "baslat-arkaplan.ps1 eksik." /time:15
  exit /b 1
)

if not exist "ACR-Ziraat-Otomasyon.exe" if not exist "acrziraat-otomasyon.exe" (
  where node >nul 2>&1
  if errorlevel 1 (
    msg * "ACR-Ziraat-Otomasyon.exe yok. Release zip tam mi?" /time:20
    exit /b 1
  )
)

if exist "%~dp0baslat.vbs" (
  wscript.exe //nologo "%~dp0baslat.vbs" 2>nul
  if not errorlevel 1 exit /b 0
)

powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0baslat-arkaplan.ps1"
exit /b %ERRORLEVEL%
