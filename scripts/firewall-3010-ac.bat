@echo off
chcp 65001 >nul
echo ELEKTRIK - Windows guvenlik duvarina 3010 portu ekleniyor...
netsh advfirewall firewall delete rule name="ELEKTRIK 3010" >nul 2>&1
netsh advfirewall firewall add rule name="ELEKTRIK 3010" dir=in action=allow protocol=TCP localport=3010
if %errorlevel% equ 0 (
  echo Tamam. Simdi telefondan tekrar deneyin.
) else (
  echo HATA: Yonetici olarak calistirin - dosyaya sag tik ^> Yonetici olarak calistir
)
pause
