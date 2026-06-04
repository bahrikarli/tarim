# tarim -> acrziraat kod senkronu (veritabani DAHIL DEGIL).
# Kullanim: powershell -File scripts\senkron-acrziraat.ps1
# veya: SENKRON-ACRZIRAAT.bat

param(
  [string]$Kaynak = 'C:\tarim',
  [string]$Hedef = 'C:\acrziraat',
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Kaynak = (Resolve-Path $Kaynak).Path.TrimEnd('\')
$Hedef = $Hedef.TrimEnd('\')

if (-not (Test-Path $Kaynak)) { throw "Kaynak yok: $Kaynak" }
if (-not (Test-Path $Hedef)) { throw "Hedef yok: $Hedef" }

$excludeDirs = @(
  'node_modules', '.git', 'dist', 'dist-desktop',
  'release-v1.0.51', 'release-v1.0.52', 'release-v1.0.53', 'release-v1.0.54'
) | ForEach-Object { '/XD', $_ }

$excludeFiles = @(
  '.env', '.env.example', 'OKU-BENI.txt', 'BASLAT.bat',
  'VERITABANI-KOPYALA.bat', 'demo-sure.json',
  'package-lock.json', 'release.bat', 'release-otomatik.bat', 'PAKET-OLUSTUR.bat',
  'MUSTERI-NE-VERILIR.txt', 'bump-version.js'
) | ForEach-Object { '/XF', $_ }

# acrziraat ozel sql / script (tarim uzerine yazilmasin)
$excludeFiles += '/XF', 'tarim-acrziraat.bak'
$excludeFiles += '/XF', 'acrziraat-veritabani-olustur.sql'
$excludeFiles += '/XF', 'tarim-veritabanindan-kopyala.sql'
$excludeFiles += '/XF', 'veritabani-tarimden-kopyala.ps1'

Write-Host "Senkron: $Kaynak  ->  $Hedef"
Write-Host "(Veritabani ve .env dokunulmaz; sonunda ACR Ziraat markasi uygulanir.)"
Write-Host ""

$roboArgs = @(
  $Kaynak, $Hedef,
  '/E',
  '/XO',
  '/R:1', '/W:1',
  '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'
) + $excludeDirs + $excludeFiles

if ($WhatIf) { $roboArgs += '/L' }

& robocopy @roboArgs
$rc = $LASTEXITCODE
if ($rc -ge 8) { throw "robocopy hata kodu: $rc" }

Write-Host ""
Write-Host "Baslat scriptleri (release paketi)..."
$baslatKaynak = Join-Path $Kaynak 'scripts\acrziraat-release-baslat'
$baslatHedef = Join-Path $Hedef 'scripts\acrziraat-release-baslat'
if (Test-Path $baslatKaynak) {
  New-Item -ItemType Directory -Force -Path $baslatHedef | Out-Null
  Copy-Item (Join-Path $baslatKaynak '*') $baslatHedef -Force
}

Write-Host ""
Write-Host 'UTF-8 arayuz onarimi (index.html, robocopy /XO atlanmasin)...'
$onarJs = Join-Path $Kaynak 'scripts\utf8-onar-acrziraat.js'
if (Test-Path $onarJs) {
  & node $onarJs $Hedef $Kaynak
  if ($LASTEXITCODE -ne 0) { throw "utf8-onar-acrziraat.js hata: $LASTEXITCODE" }
} else {
  Write-Warning 'utf8-onar-acrziraat.js bulunamadi.'
}

Write-Host ""
Write-Host 'ACR Ziraat ozel ayarlar uygulaniyor...'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Kaynak 'scripts\acrziraat-ozel-ayarlar.ps1') -Hedef $Hedef

Write-Host ""
Write-Host 'Tamam. acrziraat sunucusunu yeniden baslatin (port 3012).'
Write-Host 'Veri icin ayri: VERITABANI-KOPYALA.bat (sadece DB kopyasi gerekirse).'

exit 0
