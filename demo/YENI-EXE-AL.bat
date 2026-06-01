@echo off
setlocal

set "DEMO=%~dp0"
set "PROJE=%DEMO%.."
cd /d "%PROJE%"

echo.
echo  TARIM — EXE URETIMI
echo  Proje: %CD%
echo.

if not exist "%CD%\package.json" (
  echo HATA: package.json yok.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js kurulu degil. https://nodejs.org
  pause
  exit /b 1
)

if not exist "%CD%\node_modules\pkg" (
  echo node_modules eksik - npm install calisiyor...
  call npm install
  if errorlevel 1 pause & exit /b 1
)

echo Calisan program kapatiliyor...
call "%DEMO%DURDUR.bat" >nul 2>&1
taskkill /F /IM "tarim-otomasyon.exe" >nul 2>&1
taskkill /F /IM "Tarim-Otomasyon.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo EXE olusturuluyor (1-2 dk)...
call npm run build:exe
if errorlevel 1 (
  echo BUILD HATA
  pause
  exit /b 1
)

node "%DEMO%exe-kopyala.js"
if errorlevel 1 pause & exit /b 1

if exist "%PROJE%\.env" (
  copy /Y "%PROJE%\.env" "%DEMO%.env" >nul
  echo demo\.env guncellendi ^(proje kokunden^).
) else if not exist "%DEMO%.env" if exist "%DEMO%.env.ornek" copy /Y "%DEMO%.env.ornek" "%DEMO%.env" >nul

echo.
echo  TAMAM: %DEMO%Tarim-Otomasyon.exe
echo  Gorsel baslat: BASLAT-GORUNTULU.bat
echo.
pause
exit /b 0
