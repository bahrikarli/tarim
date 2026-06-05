#!/usr/bin/env node
const path = require('path');
const tarimRoot = path.join(__dirname, '..');
const envRoot = process.env.EDM_ENV_ROOT || tarimRoot;
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const soap = require('soap');
const { edmLogin, edmConfigOku } = require(path.join(tarimRoot, 'lib/edm-efatura'));

function edmRequestHeader(cfg, sessionId) {
  const crypto = require('crypto');
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const actionDate = `${d.toISOString().slice(0, 19)}${sign}${pad(off / 60)}:${pad(off % 60)}`;
  return {
    attributes: { xmlns: '' },
    SESSION_ID: sessionId || '0',
    CLIENT_TXN_ID: crypto.randomUUID(),
    ACTION_DATE: actionDate,
    REASON: cfg.reason,
    APPLICATION_NAME: cfg.application,
    HOSTNAME: cfg.hostname,
    CHANNEL_NAME: cfg.channel,
    COMPRESSED: 'N',
  };
}

function edmXmlValue(value) {
  return { attributes: { xmlns: '' }, $value: value };
}

function edmFaturaContentAyikla(result) {
  const inv = result?.INVOICE || result?.Invoice;
  const invObj = Array.isArray(inv) ? inv[0] : inv;
  if (!invObj) return null;
  const content = invObj.CONTENT || invObj.Content;
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    return content._ || content.$value || content.value || content.data || null;
  }
  return null;
}

async function dene(dir, tip, searchExtra) {
  const cfg = edmConfigOku();
  const login = await edmLogin();
  if (!login.success) throw new Error(login.message);
  const client = await soap.createClientAsync(cfg.wsdlUrl, {
    wsdl_options: { timeout: 120000 },
    disableCache: true,
  });
  const search = {
    attributes: { xmlns: '' },
    DIRECTION: dir,
    LIMIT: 1,
    LIMITSpecified: true,
    ...searchExtra,
  };
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, login.sessionId),
    INVOICE_SEARCH_KEY: search,
    HEADER_ONLY: edmXmlValue('N'),
    INVOICE_CONTENT_TYPE: edmXmlValue(tip),
  };
  try {
    const [result] = await client.GetInvoiceAsync(args);
    const b64 = edmFaturaContentAyikla(result);
    const inv = Array.isArray(result?.INVOICE) ? result.INVOICE[0] : result?.INVOICE;
    const status = inv?.HEADER?.STATUS || inv?.STATUS || '';
    console.log(dir, tip, JSON.stringify(searchExtra), '=>', b64 ? `OK len=${b64.length}` : 'BOS', status);
    if (b64 && tip === 'PDF') {
      console.log('  pdf head:', Buffer.from(b64, 'base64').slice(0, 8).toString());
    }
  } catch (e) {
    const body = typeof e?.body === 'string' ? e.body.slice(0, 120) : '';
    console.log(dir, tip, JSON.stringify(searchExtra), '=> HATA', String(e?.message || e).slice(0, 120), body);
  }
}

async function main() {
  const uuid = process.argv[2] || '00a26129-60ba-4d65-9c73-5c30c1fa5822';
  const id = process.argv[3] || 'ACR2026000000001';
  const sender = process.argv[4] || '0051294826';
  const tests = [
    ['OUT-EARCHIVE', 'PDF', { ID: id }],
    ['OUT-EARCHIVE', 'PDF', { UUID: uuid }],
    ['OUT-EARCHIVE', 'HTML', { ID: id }],
    ['OUT-EARCHIVE', 'XML', { ID: id }],
    ['OUT-EARCHIVE', 'PDF', { ID: id, SENDER: sender }],
  ];
  for (const [dir, tip, extra] of tests) {
    await dene(dir, tip, extra);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
