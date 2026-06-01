@echo off
chcp 65001 >nul 2>&1
set "ROOT=%~dp0.."
set "VER=%~1"
if "%VER%"=="" (
  for /f "usebackq delims=" %%i in (`node -p "require('%ROOT:\=/%/package.json').version"`) do set "VER=%%i"
)

set "ZIP=%ROOT%tarim-otomasyon-%VER%.zip"
set "MAN=%ROOT%guncelleme.json"

echo.
echo ============================================
echo   TARIM-UPDATES — MANUEL RELEASE v%VER%
echo ============================================
echo.
echo GitHub token push/release yapamiyorsa tarayicidan yukleyin:
echo.

if not exist "%ZIP%" (
  echo HATA: ZIP yok: %ZIP%
  echo Once: release-all.bat  (veya npm run build:exe + paket)
  pause
  exit /b 1
)

echo Dosyalar:
echo   ZIP: %ZIP%
echo   Manifest: %MAN%
echo.
echo 1) Asagidaki sayfa acilacak — "Publish release"
echo 2) Tag: v%VER%  (yeni tag olustur)
echo 3) Release title: v%VER%
echo 4) "Attach binaries" ile SURUKLE-BIRAK:
echo      - tarim-otomasyon-%VER%.zip
echo      - guncelleme.json  (%MAN% dosyasini secin)
echo 5) Publish release
echo.
echo Kontrol adresi:
echo   https://github.com/bahrikarli/tarim-updates/releases/latest/download/guncelleme.json
echo.

start "" "https://github.com/bahrikarli/tarim-updates/releases/new?tag=v%VER%&title=v%VER%"

explorer /select,"%ZIP%"

pause
