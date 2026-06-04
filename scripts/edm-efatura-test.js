#!/usr/bin/env node
/**
 * EDM Bilişim e-fatura TEST bağlantısı
 *
 * 1) isgelistirme@edmbilisim.com.tr → test kullanıcı + şifre isteyin
 * 2) .env dosyasına EDM_* satırlarını ekleyin
 * 3) node scripts/edm-efatura-test.js
 */

require('../lib/env-yukle').envYukle();
const { edmBaglantiTesti, edmConfigOku } = require('../lib/edm-efatura');

async function main() {
  const cfg = edmConfigOku();
  console.log('--- EDM Bilişim e-Fatura test ---');
  console.log('WSDL:', cfg.wsdlUrl);
  console.log('Test modu:', cfg.testModu ? 'evet' : 'hayır');
  console.log('Kullanıcı:', cfg.username ? `${cfg.username.slice(0, 3)}***` : '(tanımsız)');
  console.log('');

  if (!cfg.username || !cfg.password) {
    console.error(`
EDM kullanıcı bilgisi yok.

.env dosyanıza ekleyin (ACR Ziraat: %LOCALAPPDATA%\\ACR Ziraat\\.env veya C:\\ACRZIRAAT\\.env):

EDM_WSDL_URL=https://test.edmbilisim.com.tr/EFaturaEDM21ea/EFaturaEDM.svc?singleWsdl
EDM_USERNAME=...
EDM_PASSWORD=...
EDM_HOSTNAME=ACRZIRAAT
EDM_CHANNEL=ACRZIRAAT
EDM_APPLICATION=ACR Ziraat
EDM_TEST=1

Test hesabı: isgelistirme@edmbilisim.com.tr
`);
    process.exit(1);
  }

  const sonuc = await edmBaglantiTesti();
  console.log(JSON.stringify(sonuc, null, 2));
  process.exit(sonuc.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
