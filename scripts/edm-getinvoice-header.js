#!/usr/bin/env node
const path = require('path');
const tarimRoot = path.join(__dirname, '..');
const envRoot = process.env.EDM_ENV_ROOT || tarimRoot;
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const { edmLogin, edmFaturaIndir, edmSonGidenFaturalar } = require(path.join(tarimRoot, 'lib/edm-efatura'));

async function main() {
  const login = await edmLogin();
  console.log('login', login.success);
  if (!login.success) return;

  const uuid = process.argv[2] || '00a26129-60ba-4d65-9c73-5c30c1fa5822';
  const id = process.argv[3] || 'ACR2026000000001';

  // header only list
  const soap = require('soap');
  const { edmConfigOku } = require(path.join(tarimRoot, 'lib/edm-efatura'));
  const cfg = edmConfigOku();
  const client = await soap.createClientAsync(cfg.wsdlUrl, { wsdl_options: { timeout: 60000 }, disableCache: true });

  function hdr(sessionId, dir, extra) {
    const crypto = require('crypto');
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return {
      REQUEST_HEADER: {
        attributes: { xmlns: '' },
        SESSION_ID: sessionId,
        CLIENT_TXN_ID: crypto.randomUUID(),
        ACTION_DATE: `${d.toISOString().slice(0, 19)}${sign}${pad(off / 60)}:${pad(off % 60)}`,
        REASON: cfg.reason,
        APPLICATION_NAME: cfg.application,
        HOSTNAME: cfg.hostname,
        CHANNEL_NAME: cfg.channel,
        COMPRESSED: 'N',
      },
      INVOICE_CONTENT_TYPE: { attributes: { xmlns: '' }, $value: 'XML' },
      HEADER_ONLY: { attributes: { xmlns: '' }, $value: 'Y' },
      INVOICE_SEARCH_KEY: {
        attributes: { xmlns: '' },
        DIRECTION: dir,
        LIMIT: 5,
        LIMITSpecified: true,
        ...extra,
      },
    };
  }

  for (const dir of ['OUT-EARCHIVE', 'OUT']) {
    try {
      const [r] = await client.GetInvoiceAsync(hdr(login.sessionId, dir, { ID: id }));
      const inv = r?.INVOICE;
      const arr = Array.isArray(inv) ? inv : inv ? [inv] : [];
      console.log('\n', dir, 'count', arr.length);
      for (const i of arr) {
        console.log(' ', i.ID, i.UUID, i.HEADER?.STATUS, i.HEADER?.EARCHIVE);
      }
    } catch (e) {
      console.log(dir, 'ERR', String(e?.message || e).slice(0, 200));
      if (e?.body) console.log(String(e.body).slice(0, 400));
    }
  }
}

main().catch(console.error);
