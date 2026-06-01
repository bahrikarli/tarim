# tarim-updates

**Tarım Otomasyon** için otomatik güncelleme kanalı.

Elektrik projesindeki `elektrik-updates` reposundan **bağımsızdır**.

## Dosyalar

| Dosya | Açıklama |
|--------|----------|
| `guncelleme.json` | Programın okuduğu manifest (`app: tarim-otomasyon`) |
| `tarim-otomasyon-X.Y.Z.zip` | Müşteri kurulum paketi (release ile) |

## Manifest adresi

```
https://github.com/bahrikarli/tarim-updates/releases/latest/download/guncelleme.json
```

## Yeni sürüm yayınlama (geliştirici)

`C:\tarim` klasöründe:

```bat
release-all.bat
```

veya sürüm numarası ile:

```bat
release-all.bat 1.0.51
```

Bu komut ZIP oluşturur, GitHub Release açar ve `guncelleme.json` yükler.

Alternatif (sadece main dalına push):

```bat
git-yayinla.bat
```
