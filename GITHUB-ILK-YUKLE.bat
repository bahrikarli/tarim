@echo off
setlocal
title Tarim — GitHub repo olustur ve push
cd /d "%~dp0"

set REPO=bahrikarli/tarim
set REPO_URL=https://github.com/%REPO%.git

echo.
echo === Tarim GitHub ilk yukleme ===
echo Repo: %REPO_URL%
echo.

where gh >nul 2>&1
if errorlevel 1 (
  echo HATA: GitHub CLI ^(gh^) yok.
  echo Kur: https://cli.github.com/
  exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo GitHub oturumu yok. Tarayici acilacak — giris yapin.
  gh auth login -h github.com -p https -w
  if errorlevel 1 exit /b 1
  gh auth setup-git
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)

gh repo view %REPO% >nul 2>&1
if errorlevel 1 (
  echo.
  echo [1/2] GitHub'da repo olusturuluyor ^(private^)...
  gh repo create %REPO% --private --source=. --remote=origin --description "Tarim Otomasyon — stok, recete, mobil"
  if errorlevel 1 (
    echo.
    echo Manuel: https://github.com/new
    echo   Ad: tarim
    echo   Private onerilir
    echo Sonra tekrar bu BAT'i calistirin.
    exit /b 1
  )
) else (
  echo Repo zaten var: %REPO%
)

echo.
echo [2/2] Push...
git push -u origin master
if errorlevel 1 git push -u origin main
if errorlevel 1 (
  echo Push basarisiz. gh auth login ve tekrar deneyin.
  exit /b 1
)

echo.
echo Tamam: %REPO_URL%
endlocal
pause
