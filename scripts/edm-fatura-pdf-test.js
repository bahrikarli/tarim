#!/usr/bin/env node
const path = require('path');
const envRoot = process.env.EDM_ENV_ROOT || path.join(__dirname, '..');
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const { edmLogin, edmFaturaIndir } = require(path.join(envRoot, 'lib/edm-efatura'));

async function main() {
  const uuid = process.argv[2] || '';
  const faturaNo = process.argv[3] || 'ACR2026000000001';
  const login = await edmLogin();
  if (!login.success) {
    console.error(JSON.stringify(login, null, 2));
    process.exit(1);
  }
  for (const tip of ['PDF', 'HTML', 'XML']) {
    console.log('\n---', tip, '---');
    const r = await edmFaturaIndir(login.sessionId, { uuid, faturaNo }, tip);
    if (!r.success) {
      console.log('HATA:', r.message);
      if (r.detail) console.log(r.detail.message || r.detail);
      continue;
    }
    console.log('OK base64 uzunluk:', r.base64?.length || 0);
    console.log('ilk 40:', String(r.base64 || '').slice(0, 40));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
