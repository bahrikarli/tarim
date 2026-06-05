#!/usr/bin/env node
/**
 * EDM oturumu açıp şirket VKN için GB (gönderici birim) etiketini listeler.
 * Kullanım: node scripts/edm-gb-alias-bul.js [VKN]
 */
const path = require('path');
const envRoot = process.env.EDM_ENV_ROOT || path.join(__dirname, '..');
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const { edmLogin, edmCheckUser } = require(path.join(envRoot, 'lib/edm-efatura'));

async function main() {
  const vkn = (process.argv[2] || process.env.EDM_SENDER_VKN || '').trim();
  const login = await edmLogin();
  if (!login.success) {
    console.error(JSON.stringify(login, null, 2));
    process.exit(1);
  }
  console.log('Oturum OK\n');
  if (!vkn) {
    console.log('VKN verilmedi. Kullanım: node scripts/edm-gb-alias-bul.js 1234567890');
    console.log('veya .env içine EDM_SENDER_VKN=... ekleyin.');
    process.exit(1);
  }
  const check = await edmCheckUser(login.sessionId, vkn);
  if (!check.success) {
    console.error(JSON.stringify(check, null, 2));
    process.exit(1);
  }
  const users = check.users || [];
  const gb = users.filter((u) => String(u.UNIT || '').toUpperCase() === 'GB');
  const pk = users.filter((u) => String(u.UNIT || '').toUpperCase() === 'PK');
  console.log('VKN:', vkn);
  console.log('\nGB (gönderici — EDM_GB_ALIAS):');
  gb.forEach((u) => console.log(' ', u.ALIAS));
  if (pk.length) {
    console.log('\nPK (posta kutusu):');
    pk.forEach((u) => console.log(' ', u.ALIAS));
  }
  if (!gb.length) {
    console.log('\nGB bulunamadı. EDM test portalından etiketi kontrol edin.');
    process.exit(1);
  }
  console.log('\n.env önerisi:');
  console.log(`EDM_GB_ALIAS=${gb[0].ALIAS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
