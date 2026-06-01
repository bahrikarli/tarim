@echo off
chcp 65001 >nul
title ACR Ziraat — guvenlik duvari 3012
echo.
echo ACR Ziraat — TCP 3012 gelen baglanti izni
echo (Yonetici olarak calistirin)
echo.

netsh advfirewall firewall delete rule name="ACR Ziraat TCP 3012" >nul 2>&1
netsh advfirewall firewall add rule name="ACR Ziraat TCP 3012" dir=in action=allow protocol=TCP localport=3012 profile=any

if %errorlevel% equ 0 (
  echo Tamam. Port 3012 acildi.
) else (
  echo HATA: Sag tik ^> Yonetici olarak calistir
)
pause
