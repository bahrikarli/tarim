@echo off
chcp 65001 >nul
title Tarim — guvenlik duvari 3011
echo.
echo Tarim Otomasyon — TCP 3011 gelen baglanti izni
echo (Yonetici olarak calistirin)
echo.

netsh advfirewall firewall delete rule name="Tarim Otomasyon TCP 3011" >nul 2>&1
netsh advfirewall firewall add rule name="Tarim Otomasyon TCP 3011" dir=in action=allow protocol=TCP localport=3011 profile=any

if %errorlevel% equ 0 (
  echo.
  echo Tamam. Port 3011 acildi.
  echo   Yerel:  http://127.0.0.1:3011
  echo   Ag:     http://SUNUCU-IP:3011
  echo   Mobil:  http://SUNUCU-IP:3011/mobil
  echo.
  echo Bulut sunucuda ^(Azure/AWS vb.^) panelden de 3011/TCP inbound acin.
) else (
  echo.
  echo HATA: Kural eklenemedi.
  echo Sag tik ^> Yonetici olarak calistir
)

echo.
pause
