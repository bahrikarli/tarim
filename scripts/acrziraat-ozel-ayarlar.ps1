# Senkron sonrasi acrziraat marka / port / env ayarlari.
param([string]$Hedef = 'C:\acrziraat')

$Hedef = $Hedef.TrimEnd('\')
function W([string]$rel, [string]$content) {
  $p = Join-Path $Hedef $rel
  $dir = Split-Path $p -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($p, $content, [System.Text.UTF8Encoding]::new($false))
}

# Marka / UTF-8 — Node ile (Set-Content Turkce bozar)
$markaJs = Join-Path $PSScriptRoot 'acrziraat-marka-uygula.js'
if (Test-Path $markaJs) {
  & node $markaJs $Hedef
  if ($LASTEXITCODE -ne 0) { throw "acrziraat-marka-uygula.js hata: $LASTEXITCODE" }
} else {
  Write-Warning "acrziraat-marka-uygula.js bulunamadi: $markaJs"
}

# Sunucu / release baslat dosyalari (tarim demo ezilmesin)
$baslatSrc = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts\acrziraat-release-baslat'
if (-not (Test-Path $baslatSrc)) {
  $baslatSrc = Join-Path $Hedef 'scripts\acrziraat-release-baslat'
}
if (Test-Path $baslatSrc) {
  $demoDir = Join-Path $Hedef 'demo'
  New-Item -ItemType Directory -Force -Path $demoDir | Out-Null
  Copy-Item (Join-Path $baslatSrc '*') $demoDir -Force
  Write-Host "  demo\ baslat dosyalari (ACR Ziraat) guncellendi."
}

# Gelistirme kok BASLAT (node server.js)
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

Write-Host "  Marka ve .env.example guncellendi."
