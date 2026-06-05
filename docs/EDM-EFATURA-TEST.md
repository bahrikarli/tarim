# EDM Bilişim e-Fatura — test rehberi (ACR Ziraat)

## 1) Test hesabı (EDM’den)

E-posta: **isgelistirme@edmbilisim.com.tr**

İstenecekler:

- Test **kullanıcı adı** ve **şifre**
- Doğru **test WSDL** adresi (sürüm farklı olabilir; örnek aşağıda)

Dokümantasyon: https://docs.edmbilisim.com.tr/api/api-documentation/introduction.html

## 2) .env ayarları

`C:\ACRZIRAAT\.env` veya `%LOCALAPPDATA%\ACR Ziraat\.env`:

```env
EDM_WSDL_URL=https://test.edmbilisim.com.tr/EFaturaEDM21ea/EFaturaEDM.svc?singleWsdl
EDM_USERNAME=edm_test_kullanici
EDM_PASSWORD=edm_test_sifre
EDM_HOSTNAME=ACRZIRAAT
EDM_CHANNEL=ACRZIRAAT
EDM_APPLICATION=ACR Ziraat
EDM_TEST=1
```

EDM farklı WSDL verirse yalnızca `EDM_WSDL_URL` satırını değiştirin.

## 3) Bağımlılık

```powershell
cd C:\ACRZIRAAT
npm install
```

## 4) Komut satırı testi

```powershell
node scripts/edm-efatura-test.js
```

Başarılı çıktı: `"success": true` ve `sessionId`.

## 5) Uygulama içi test (sunucu açıkken)

Tarayıcı veya Postman:

- `GET http://localhost:3012/api/efatura/edm/durum` — ayar özeti (şifre gösterilmez)
- `POST http://localhost:3012/api/efatura/edm/baglanti-testi` — Login testi

## 6) Satıştan e-Fatura / e-Arşiv

1. **Ayarlar** → Şirket ünvanı ve 10 haneli VKN  
2. `.env` → `EDM_GB_ALIAS` (gönderici birim etiketi, EDM’den)  
3. Müşteri → tüzel için vergi no, gerçek kişi için TC kimlik no  
4. Satış kaydından sonra onay sorulur veya cari hareketlerde **e-Fatura** butonu  

| Müşteri | Belge |
|---------|--------|
| Tüzel + VKN | e-Fatura |
| Gerçek kişi + TCKN | e-Arşiv |

API:

- `GET /api/efatura/satis/:hareketID/onizle`
- `POST /api/efatura/satis/:hareketID/kes`

Önce **Login testi** yeşil olmalı; `EDM_GB_ALIAS` ve şirket VKN tanımlı olmalı.
