# Sürüm çıkarma sırası

## Müşteri güncelleme paketi (CMD — yönetici)

1. `release-otomatik.bat` (siz)
2. `git-yayinla.bat` (siz)
3. `kullanici-guncelle.bat` (müşteri)

## Masaüstü uygulama (PowerShell — yönetici)

Önce GitHub oturumu: `gh auth login` (token dosyaya yazmayın)

```powershell
npm run build:desktop:fresh
```

veya tam akış:

```bat
release-all.bat
```

`GH_TOKEN` gerekirse yalnızca oturumda kullanın; repoya commit etmeyin.
