#!/usr/bin/env node
const path = require('path');
const envRoot = process.env.EDM_ENV_ROOT || path.join(__dirname, '..');
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const soap = require('soap');
const tarimLib = path.join(__dirname, '..', 'lib', 'edm-efatura');
const { edmLogin, edmConfigOku, edmRequestHeader, edmXmlValue } = require(tarimLib);
function edmCrTarihAraligi(tarih) {
  const merkez = tarih ? new Date(tarih) : new Date();
  if (Number.isNaN(merkez.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}+03:00`;
  const start = new Date(merkez); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
  const end = new Date(merkez); end.setDate(end.getDate() + 7); end.setHours(23, 59, 59, 0);
  return { start: iso(start), end: iso(end) };
}

async function dene(client, cfg, sessionId, name, key) {
  const t0 = Date.now();
  try {
    const [r] = await client.GetInvoiceAsync({
      REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
      INVOICE_SEARCH_KEY: key,
      HEADER_ONLY: edmXmlValue('N'),
      INVOICE_CONTENT_TYPE: edmXmlValue('HTML'),
    });
    const inv = Array.isArray(r?.INVOICE) ? r.INVOICE[0] : r?.INVOICE;
    const c = inv?.CONTENT;
    const s = typeof c === 'string' ? c : (c && (c._ || c.$value));
    console.log(name, `${Date.now() - t0}ms`, s ? `OK ${s.length}` : 'BOS', inv?.HEADER?.STATUS || '');
  } catch (e) {
    console.log(name, `${Date.now() - t0}ms`, 'ERR', String(e.message || e).slice(0, 100));
  }
}

async function main() {
  const id = process.argv[2] || 'ACR2026000000004';
  const cfg = edmConfigOku();
  const login = await edmLogin();
  const client = await soap.createClientAsync(cfg.wsdlUrl, { wsdl_options: { timeout: 90000 }, disableCache: true });
  const ar = edmCrTarihAraligi(new Date());
  await dene(client, cfg, login.sessionId, 'doc+cr', {
    attributes: { xmlns: '' },
    ID: id,
    DIRECTION: 'OUT-EARCHIVE',
    READ_INCLUDED: false,
    READ_INCLUDEDSpecified: true,
    ISARCHIVED: false,
    ISARCHIVEDSpecified: true,
    CR_START_DATE: ar.start,
    CR_START_DATESpecified: true,
    CR_END_DATE: ar.end,
    CR_END_DATESpecified: true,
  });
  await dene(client, cfg, login.sessionId, 'minimal', {
    attributes: { xmlns: '' },
    ID: id,
    DIRECTION: 'OUT-EARCHIVE',
  });
  await dene(client, cfg, login.sessionId, 'OUT', {
    attributes: { xmlns: '' },
    ID: id,
    DIRECTION: 'OUT',
  });
}

main().catch(console.error);
