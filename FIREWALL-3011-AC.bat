@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0scripts\firewall-3011-ac.bat' -Verb RunAs"
exit /b %ERRORLEVEL%
