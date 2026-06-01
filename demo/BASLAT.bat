@echo off
setlocal
cd /d "%~dp0"

if not exist "baslat-arkaplan.ps1" (
  msg * "baslat-arkaplan.ps1 eksik. Tum demo klasorunu kopyalayin." /time:15
  exit /b 1
)

if not exist "Tarim-Otomasyon.exe" (
  where node >nul 2>&1
  if errorlevel 1 (
    msg * "Tarim-Otomasyon.exe yok ve Node.js kurulu degil. Once EXE-URET.bat calistirin." /time:20
    exit /b 1
  )
)

if exist "%~dp0baslat.vbs" (
  wscript.exe //nologo "%~dp0baslat.vbs" 2>nul
  if not errorlevel 1 exit /b 0
)

powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0baslat-arkaplan.ps1"
exit /b %ERRORLEVEL%
