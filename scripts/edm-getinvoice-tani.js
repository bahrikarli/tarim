#!/usr/bin/env node
const path = require('path');
const envRoot = process.env.EDM_ENV_ROOT || path.join(__dirname, '..');
require(path.join(envRoot, 'lib/env-yukle')).envYukle();
const soap = require('soap');
const tarimLib = path.join(__dirname, '..', 'lib', 'edm-efatura');
const { edmLogin, edmConfigOku } = require(tarimLib);
const edmGbAliasNormalize = require(tarimLib).edmGbAliasNormalize
  || ((a) => { let x = String(a || '').trim().replace(/^urn:mail:/i, '').toLowerCase(); return x ? `urn:mail:${x}` : ''; });

function hdr(cfg, sessionId) {
  const crypto = require('crypto');
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return {
    attributes: { xmlns: '' },
    SESSION_ID: sessionId,
    CLIENT_TXN_ID: crypto.randomUUID(),
    ACTION_DATE: `${d.toISOString().slice(0, 19)}${sign}${pad(off / 60)}:${pad(off % 60)}`,
    REASON: cfg.reason,
    APPLICATION_NAME: cfg.application,
    HOSTNAME: cfg.hostname,
    CHANNEL_NAME: cfg.channel,
    COMPRESSED: 'N',
  };
}

function contentAyikla(result) {
  const inv = result?.INVOICE;
  const o = Array.isArray(inv) ? inv[0] : inv;
  const c = o?.CONTENT;
  if (!c) return { len: 0, status: o?.HEADER?.STATUS };
  const s = typeof c === 'string' ? c : (c._ || c.$value || '');
  return { len: s.length, head: Buffer.from(s, 'base64').slice(0, 8).toString(), status: o?.HEADER?.STATUS };
}

async function getInv(client, cfg, sessionId, search, tip, headerOnly) {
  const args = {
    REQUEST_HEADER: hdr(cfg, sessionId),
    INVOICE_SEARCH_KEY: { attributes: { xmlns: '' }, LIMIT: 1, LIMITSpecified: true, ...search },
    HEADER_ONLY: { attributes: { xmlns: '' }, $value: headerOnly || 'N' },
    INVOICE_CONTENT_TYPE: { attributes: { xmlns: '' }, $value: tip },
  };
  const [r] = await client.GetInvoiceAsync(args);
  return r;
}

async function main() {
  const uuid = process.argv[2] || '659d3363-30da-4679-845f-1b2299fc756c';
  const id = process.argv[3] || 'ACR2026000000004';
  const cfg = edmConfigOku();
  const login = await edmLogin();
  if (!login.success) return console.error(login);
  const client = await soap.createClientAsync(cfg.wsdlUrl, { wsdl_options: { timeout: 90000 }, disableCache: true });
  const methods = Object.keys(client).filter((k) => /Async$/.test(k) && /Invoice|Archive|Document/i.test(k));
  console.log('SOAP metodlari:', methods.join(', '));

  const gb = edmGbAliasNormalize(process.env.EDM_GB_ALIAS || '');
  const sender = process.env.EDM_SENDER_VKN || '0051294826';
  const denemeler = [
    ['PDF uuid+earchive', { DIRECTION: 'OUT-EARCHIVE', UUID: uuid }],
    ['PDF id+earchive', { DIRECTION: 'OUT-EARCHIVE', ID: id }],
    ['PDF id+FROM', { DIRECTION: 'OUT-EARCHIVE', ID: id, FROM: gb }],
    ['PDF id+SENDER', { DIRECTION: 'OUT-EARCHIVE', ID: id, SENDER: sender }],
    ['HTML id', { DIRECTION: 'OUT-EARCHIVE', ID: id }],
    ['XML id', { DIRECTION: 'OUT-EARCHIVE', ID: id }],
    ['HEADER id', { DIRECTION: 'OUT-EARCHIVE', ID: id }],
  ];

  for (const [label, search] of denemeler) {
    try {
      const headerOnly = label.startsWith('HEADER') ? 'Y' : 'N';
      const tip = label.includes('HTML') ? 'HTML' : label.includes('XML') ? 'XML' : 'PDF';
      const r = await getInv(client, cfg, login.sessionId, search, tip, headerOnly);
      if (headerOnly === 'Y') {
        const inv = Array.isArray(r?.INVOICE) ? r.INVOICE[0] : r?.INVOICE;
        console.log(label, '=>', inv?.ID, inv?.UUID, inv?.HEADER?.STATUS, inv?.HEADER?.EARCHIVE);
      } else {
        console.log(label, '=>', contentAyikla(r));
      }
    } catch (e) {
      const body = typeof e.body === 'string' ? e.body.slice(0, 200) : '';
      console.log(label, '=> HATA', String(e.message || e).slice(0, 100), body.slice(0, 80));
    }
  }

  if (client.GetInvoiceStatusAsync) {
    try {
      const [st] = await client.GetInvoiceStatusAsync({
        REQUEST_HEADER: hdr(cfg, login.sessionId),
        INVOICE: { attributes: { xmlns: '' }, ID: id, UUID: uuid },
      });
      console.log('GetInvoiceStatus =>', JSON.stringify(st).slice(0, 400));
    } catch (e) {
      console.log('GetInvoiceStatus HATA', String(e.message || e).slice(0, 150));
    }
  }
}

main().catch(console.error);
