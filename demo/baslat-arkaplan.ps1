# Sunucu + masaustu uygulama penceresi (tarayici sekmesi degil); kapaninca sunucu durur.
$ErrorActionPreference = 'Continue'
$Demo = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Proje = Split-Path -Parent $Demo
$Exe = Join-Path $Demo 'Tarim-Otomasyon.exe'
$EnvOrnek = Join-Path $Demo '.env.ornek'
$EnvLocal = Join-Path $Demo '.env'
$Port = 3011
$Url = "http://127.0.0.1:$Port/"
$Log = Join-Path $Demo 'son-calistirma.log'

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  try { Add-Content -Path $Log -Value $line -Encoding UTF8 } catch { }
}

function Show-Hata([string]$msg) {
  Write-Log "HATA: $msg"
  $kisa = if ($msg.Length -gt 900) { $msg.Substring(0, 900) + '...' } else { $msg }
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [void][System.Windows.Forms.MessageBox]::Show($kisa, 'Tarım Otomasyon', 'OK', 'Warning')
  } catch {
    cmd.exe /c "msg %username% /time:25 `"$($kisa -replace '"','''')`"" 2>$null
  }
}

function Read-PortFromEnv([string]$envPath) {
  if (-not (Test-Path $envPath)) { return 3011 }
  foreach ($line in Get-Content $envPath -ErrorAction SilentlyContinue) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)') { return [int]$Matches[1] }
  }
  return 3011
}

function Sync-EnvFromProje {
  $projeEnv = Join-Path $Proje '.env'
  if (-not (Test-Path $projeEnv)) { return }
  Copy-Item $projeEnv $EnvLocal -Force
  Write-Log "Ayarlar proje kokundeki .env dosyasindan alindi: $projeEnv"
}

function Ensure-EnvUygulamaModu([string]$envPath) {
  $lines = @(Get-Content $envPath -ErrorAction SilentlyContinue)
  $keys = @{ OPEN_APP = '1'; OPEN_BROWSER = '1' }
  foreach ($k in $keys.Keys) {
    $hit = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*$k\s*=") {
        $lines[$i] = "$k=$($keys[$k])"
        $hit = $true
        break
      }
    }
    if (-not $hit) { $lines += "$k=$($keys[$k])" }
  }
  Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

function Stop-Tarim {
  foreach ($n in @('Tarim-Otomasyon', 'tarim-otomasyon', 'electron')) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  try {
    Get-NetTCPConnection -LocalPort $script:Port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  } catch {
    netstat -ano 2>$null | Select-String ":$($script:Port)\s+.*LISTENING" | ForEach-Object {
      if ($_ -match '\s+(\d+)\s*$') { taskkill /F /PID $Matches[1] 2>$null | Out-Null }
    }
  }
}

function Test-ServerReady {
  try {
    $r = Invoke-WebRequest -Uri $script:Url -UseBasicParsing -TimeoutSec 4
    return $r.StatusCode -ge 200
  } catch { }
  try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadString($script:Url) | Out-Null
    return $true
  } catch { return $false }
}

function Test-AppRunning {
  try {
    $q = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction Stop
    foreach ($x in $q) {
      if ($x.CommandLine -match "--app=.*$($script:Port)|127\.0\.0\.1:$($script:Port)") { return $true }
    }
  } catch { }
  foreach ($n in @('msedge', 'chrome')) {
    foreach ($p in (Get-Process -Name $n -ErrorAction SilentlyContinue)) {
      if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        $t = $p.MainWindowTitle
        if ($t -match 'Tarım|TARIM') { return $true }
      }
    }
  }
  return $false
}

function Open-UygulamaPenceresi {
  Write-Log 'Masaustu uygulama penceresi aciliyor (app modu)...'
  $pencerePs1 = Join-Path $Demo 'pencere-ac.ps1'
  if (-not (Test-Path $pencerePs1)) {
    Write-Log 'HATA: pencere-ac.ps1 eksik'
    return $false
  }
  try {
    & $pencerePs1 -EnvPath $EnvLocal -Url $script:Url
    Start-Sleep -Seconds 3
    return (Test-AppRunning)
  } catch {
    Write-Log ("pencere-ac: " + $_.Exception.Message)
    return $false
  }
}

function Start-SunucuExe {
  $vbs = Join-Path $Demo 'sunucu-gizli.vbs'
  if (Test-Path $vbs) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList "//nologo `"$vbs`"" -WindowStyle Hidden | Out-Null
    return
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.WorkingDirectory = $Demo
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $psi.EnvironmentVariables['OPEN_BROWSER'] = '0'
  $psi.EnvironmentVariables['OPEN_APP'] = '1'
  [void][System.Diagnostics.Process]::Start($psi)
}

function Start-SunucuNode {
  $serverJs = Join-Path $Proje 'server.js'
  if (-not (Test-Path $serverJs)) { return $false }
  Write-Log 'EXE yok — Node ile sunucu baslatiliyor...'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'node'
  $psi.Arguments = "`"$serverJs`""
  $psi.WorkingDirectory = $Proje
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $psi.EnvironmentVariables['OPEN_BROWSER'] = '0'
  $psi.EnvironmentVariables['OPEN_APP'] = '0'
  [void][System.Diagnostics.Process]::Start($psi)
  return $true
}

try {
  Write-Log '=== BASLAT ==='

  if (-not (Test-Path (Join-Path $Demo 'public\index.html'))) {
    if (Test-Path (Join-Path $Proje 'public\index.html')) {
      Write-Log 'public klasoru proje kokunden kullanilacak (EXE paketi henuz yok).'
    } else {
      Show-Hata 'public\index.html eksik.'
      exit 1
    }
  }

  if (-not (Test-Path (Join-Path $Demo 'pencere-ac.ps1'))) {
    Show-Hata 'pencere-ac.ps1 eksik — demo klasoru tam degil.'
    exit 1
  }

  if (-not (Test-Path $EnvLocal)) {
    if (Test-Path (Join-Path $Proje '.env')) { Copy-Item (Join-Path $Proje '.env') $EnvLocal -Force }
    elseif (Test-Path $EnvOrnek) { Copy-Item $EnvOrnek $EnvLocal -Force }
  }
  if (-not (Test-Path $EnvLocal)) {
    Show-Hata '.env yok. .env.ornek dosyasini .env yapip SQL bilgilerini yazin.'
    exit 1
  }

  # demo\.env icinde ornek sifre kaldiysa proje kokundeki gercek .env kullan
  $envText = Get-Content $EnvLocal -Raw -ErrorAction SilentlyContinue
  if ($envText -match 'BURAYA_SQL_SIFRE' -and (Test-Path (Join-Path $Proje '.env'))) {
    Sync-EnvFromProje
  } elseif (Test-Path (Join-Path $Proje '.env')) {
    Sync-EnvFromProje
  }

  Ensure-EnvUygulamaModu $EnvLocal
  $script:Port = Read-PortFromEnv $EnvLocal
  $script:Url = "http://127.0.0.1:$($script:Port)/"

  $envDst = Join-Path $env:LOCALAPPDATA 'Tarım Otomasyon'
  New-Item -ItemType Directory -Force -Path $envDst | Out-Null
  Copy-Item $EnvLocal (Join-Path $envDst '.env') -Force

  $useExe = Test-Path $Exe
  if (-not $useExe) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
      Show-Hata @"
Tarim-Otomasyon.exe bulunamadi ve Node.js yok.

1) EXE-URET.bat ile exe olusturun, veya
2) Node.js kurup demo klasorune exe kopyalayin.

Klasor: $Demo
"@
      exit 1
    }
  }

  Stop-Tarim
  Start-Sleep -Milliseconds 600
  if ($useExe) { Start-SunucuExe } else { Start-SunucuNode }
  Write-Log 'Sunucu bekleniyor...'

  $ready = $false
  for ($i = 1; $i -le 180; $i++) {
    if (Test-ServerReady) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    Stop-Tarim
    Show-Hata @"
Sunucu acilmadi (port $($script:Port)).

1) demo\.env icinde DB_PASSWORD dogru mu? (Ornek: C:\tarim\.env kopyalayin)
2) SQL Server calisiyor mu?
3) EXE-URET.bat sonrasi tekrar deneyin.

Log: $Log
"@
    exit 1
  }
  Write-Log 'Sunucu hazir.'

  $opened = Open-UygulamaPenceresi
  if (-not $opened) { Start-Sleep -Seconds 2; $opened = Open-UygulamaPenceresi }

  if (-not $opened) {
    Write-Log 'UYARI: Uygulama penceresi acilamadi.'
    Show-Hata @"
Pencere acilamadi.

Edge veya Chrome kurulu olmali.
Log: $Log
"@
    exit 0
  }

  Write-Log 'Uygulama acildi, kapanis izleniyor...'
  $kapaliSay = 0
  while ($true) {
    if (Test-AppRunning) { $kapaliSay = 0 }
    else {
      $kapaliSay++
      if ($kapaliSay -ge 5) { break }
    }
    Start-Sleep -Milliseconds 1000
  }

  Write-Log 'Uygulama kapandi, sunucu durduruluyor.'
  Stop-Tarim
  Write-Log '=== BITTI ==='
} catch {
  Stop-Tarim
  Show-Hata ("Baslatma hatasi: " + ($_.Exception.Message))
  exit 1
}
