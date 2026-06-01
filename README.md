# Tarım Otomasyon

Stok, reçete, müşteri ve mobil arayüz — Node.js + SQL Server.

## Geliştirme

```bat
npm install
copy .env.example .env
npm start
```

Varsayılan port: **3011**

## Release

```bat
release.bat 1.0.53
```

Güncelleme paketleri ayrı repoda: [tarim-updates](https://github.com/bahrikarli/tarim-updates)

## ACR Ziraat kopyası

`SENKRON-ACRZIRAAT.bat` — `c:\acrziraat` ile kod senkronu (veritabanı ayrı).

## Gizli dosyalar

`.env` commit edilmez. Örnek: `.env.example`
