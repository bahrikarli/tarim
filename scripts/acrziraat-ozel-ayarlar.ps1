# Senkron sonrasi acrziraat marka / port / env ayarlari.
param([string]$Hedef = 'C:\acrziraat')

$Hedef = $Hedef.TrimEnd('\')
function W([string]$rel, [string]$content) {
  $p = Join-Path $Hedef $rel
  $dir = Split-Path $p -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($p, $content, [System.Text.UTF8Encoding]::new($false))
}

# --- package.json: tarim'den gelse bile acrziraat kalsin ---
$pkgPath = Join-Path $Hedef 'package.json'
if (Test-Path $pkgPath) {
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  $pkg.name = 'acrziraat-otomasyon'
  $pkg.description = 'ACR Ziraat — stok, reçete ve müşteri işleri'
  $pkg.build.appId = 'com.acrziraat.otomasyon'
  $pkg.build.productName = 'ACR Ziraat'
  if ($pkg.scripts.'start:exe') {
    $pkg.scripts.'start:exe' = $pkg.scripts.'start:exe' -replace 'tarim-otomasyon', 'acrziraat-otomasyon'
  }
  if ($pkg.scripts.'build:exe') {
    $pkg.scripts.'build:exe' = $pkg.scripts.'build:exe' -replace 'tarim-otomasyon', 'acrziraat-otomasyon'
  }
  if ($pkg.scripts.'build:desktop') {
    $pkg.scripts.'build:desktop' = $pkg.scripts.'build:desktop' -replace 'Tarım Otomasyon', 'ACR Ziraat'
  }
  $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
}

# db.js on ekleri
$dbPath = Join-Path $Hedef 'db.js'
if (Test-Path $dbPath) {
  $t = Get-Content $dbPath -Raw
  $t = $t -replace '\[TARIM\]', '[ACR-ZIRAAT]'
  Set-Content $dbPath $t -Encoding UTF8 -NoNewline
}

# env-yukle, backup
$envYukle = Join-Path $Hedef 'lib\env-yukle.js'
if (Test-Path $envYukle) {
  (Get-Content $envYukle -Raw) -replace "Tarım Otomasyon", 'ACR Ziraat' | Set-Content $envYukle -Encoding UTF8 -NoNewline
}
$backup = Join-Path $Hedef 'lib\backup-paths.js'
if (Test-Path $backup) {
  (Get-Content $backup -Raw) -replace 'TARIM-backups', 'ACRZIRAAT-backups' | Set-Content $backup -Encoding UTF8 -NoNewline
}

# mobil localStorage
$mobilApp = Join-Path $Hedef 'public\mobil\app.js'
if (Test-Path $mobilApp) {
  $t = Get-Content $mobilApp -Raw
  $t = $t -replace "tarim_mobil_api", 'acrziraat_mobil_api'
  $t = $t -replace "tarim_mobil_kullanici", 'acrziraat_mobil_kullanici'
  Set-Content $mobilApp $t -Encoding UTF8 -NoNewline
}

# index basliklari
$idx = Join-Path $Hedef 'public\index.html'
if (Test-Path $idx) {
  $t = Get-Content $idx -Raw
  $t = $t -replace '<title>Tarım Otomasyonu</title>', '<title>ACR Ziraat</title>'
  $t = $t -replace '>Tarım Otomasyonu<', '>ACR Ziraat<'
  Set-Content $idx $t -Encoding UTF8 -NoNewline
}
$mobilIdx = Join-Path $Hedef 'public\mobil\index.html'
if (Test-Path $mobilIdx) {
  $t = Get-Content $mobilIdx -Raw
  $t = $t -replace '<title>Tarım Mobil</title>', '<title>ACR Ziraat Mobil</title>'
  $t = $t -replace '<h1 class="login-title">TARIM</h1>', '<h1 class="login-title">ACR Ziraat</h1>'
  Set-Content $mobilIdx $t -Encoding UTF8 -NoNewline
}

# .env.example sablon (mevcut .env dokunulmaz)
W '.env.example' @"
PORT=3012
DB_SERVER=localhost
DB_NAME=acrziraat
DB_USER=sa
DB_PASSWORD=your_password_here
DB_ENCRYPT=false
DB_TRUST_CERT=true
UPDATE_MANIFEST_URL=off
OPEN_BROWSER=0
"@

# BASLAT.bat
W 'BASLAT.bat' @"
@echo off
title ACR Ziraat
cd /d "%~dp0"
if not exist "node_modules\" (
  echo npm install...
  call npm install
)
echo http://localhost:3012
start "" "http://127.0.0.1:3012"
node server.js
"@

Write-Host "  Marka ve .env.example / BASLAT.bat guncellendi."
