@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set "ROOT=%~dp0.."
set "REPO=bahrikarli/tarim-updates"
set "REPO_URL=https://github.com/%REPO%.git"
set "UPDATE_DIR=%USERPROFILE%\tarim-updates"
set "SEED=%ROOT%\tarim-updates-seed"

cd /d "%ROOT%"

echo.
echo ============================================
echo   TARIM-UPDATES — ILK KURULUM
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo HATA: Git kurulu degil. https://git-scm.com/download/win
  pause
  exit /b 1
)

where gh >nul 2>nul
if not errorlevel 1 (
  gh repo view "%REPO%" >nul 2>nul
  if errorlevel 1 (
    echo GitHub'da repo henuz yok: %REPO%
    echo.
    echo --- ELLE OLUSTURUN (1 dakika) ---
    echo 1. Tarayicida acin:
    echo    https://github.com/new?name=tarim-updates^&description=Tarim+Otomasyon+guncelleme
    echo 2. Owner: bahrikarli
    echo 3. Repository name: tarim-updates
    echo 4. Public secin
    echo 5. README / .gitignore / license EKLEMEYIN (bos repo)
    echo 6. Create repository
    echo.
    echo Repo olusturduktan sonra bu dosyaya tekrar cift tiklayin.
    echo.
    start "" "https://github.com/new?name=tarim-updates&description=Tarim+Otomasyon+guncelleme+paketleri"
    pause
    exit /b 1
  )
  echo OK: GitHub reposu mevcut — %REPO%
) else (
  echo NOT: gh CLI yok; repo'nun GitHub'da oldugunu varsayiyoruz.
)

if not exist "%SEED%\guncelleme.json" (
  echo HATA: Seed klasoru eksik: %SEED%
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in (`node -p "require('./package.json').version"`) do set "VER=%%i"

echo.
echo [1/4] Yerel klasor: %UPDATE_DIR%
if exist "%UPDATE_DIR%\.git" (
  echo      Mevcut clone guncelleniyor...
  git -C "%UPDATE_DIR%" pull
) else (
  if exist "%UPDATE_DIR%" rmdir /s /q "%UPDATE_DIR%"
  git clone "%REPO_URL%" "%UPDATE_DIR%"
  if errorlevel 1 (
    echo HATA: clone basarisiz. Repo public mi? gh auth login yaptiniz mi?
    pause
    exit /b 1
  )
)

echo.
echo [2/4] Manifest v%VER% yaziliyor...
copy /y "%SEED%\README.md" "%UPDATE_DIR%\" >nul
node "%ROOT%\scripts\tarim-updates-manifest-yaz.js" "%UPDATE_DIR%" "%VER%"
if errorlevel 1 (
  copy /y "%SEED%\guncelleme.json" "%UPDATE_DIR%\" >nul
  copy /y "%SEED%\guncelleme.json" "%UPDATE_DIR%\guncelleme-%VER%.json" >nul
)

echo.
echo [3/4] Git commit...
git -C "%UPDATE_DIR%" add README.md guncelleme.json "guncelleme-%VER%.json" 2>nul
git -C "%UPDATE_DIR%" diff --cached --quiet
if errorlevel 1 (
  git -C "%UPDATE_DIR%" commit -m "İlk kurulum: manifest v%VER%"
)

echo.
echo [4/4] GitHub'a push...
git -C "%UPDATE_DIR%" branch -M main 2>nul
git -C "%UPDATE_DIR%" push -u origin main
if errorlevel 1 (
  echo.
  echo Push basarisiz. Bir kez calistirin:
  echo   gh auth login
  echo   gh auth setup-git
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   TAMAM — %REPO% hazir
echo ============================================
echo.
echo Manifest (main):
echo   https://raw.githubusercontent.com/%REPO%/main/guncelleme.json
echo.
echo Sonraki adim — ilk ZIP + Release:
echo   cd /d %ROOT%
echo   release-all.bat
echo.
echo   (veya sadece main push: git-yayinla.bat — once ZIP gerekir)
echo.
pause
endlocal
