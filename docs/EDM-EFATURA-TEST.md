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

## 6) Sonraki adımlar (henüz yok)

1. Test fatura XML (UBL-TR) üretimi  
2. `LoadInvoice` / `SendInvoice`  
3. Müşteri satışından “e-Fatura kes” butonu  
4. e-Arşiv (B2C) ayrı profil  

Önce **Login testi** yeşil olmalı; sonra fatura gönderimine geçilir.
