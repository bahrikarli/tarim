# Tarım Otomasyon

Stok, reçete, müşteri ve mobil arayüz — Node.js + SQL Server.

## Geliştirme

```bat
npm install
copy .env.example .env
npm start
```

Varsayılan port: **3011**

Sunucuda ag / mobil erisimi icin (yonetici):

```bat
FIREWALL-3011-AC.bat
```

veya PowerShell (yonetici):

```powershell
New-NetFirewallRule -DisplayName "Tarim Otomasyon TCP 3011" -Direction Inbound -Protocol TCP -LocalPort 3011 -Action Allow -Profile Any
```

## Release

```bat
release.bat 1.0.53
```

Güncelleme paketleri ayrı repoda: [tarim-updates](https://github.com/bahrikarli/tarim-updates)

## ACR Ziraat kopyası

`SENKRON-ACRZIRAAT.bat` — `c:\acrziraat` ile kod senkronu (veritabanı ayrı).

## Gizli dosyalar

`.env` commit edilmez. Örnek: `.env.example`
