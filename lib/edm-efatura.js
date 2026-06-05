/**
 * EDM Bilişim e-Fatura SOAP istemcisi (test / canlı WSDL).
 * Dokümantasyon: https://docs.edmbilisim.com.tr/api/api-documentation/introduction.html
 */

const soap = require('soap');
const crypto = require('crypto');

function edmGuid() {
  return crypto.randomUUID();
}

function edmXmlAttrs() {
  return { attributes: { xmlns: '' } };
}

function edmXmlValue(value) {
  return { ...edmXmlAttrs(), $value: value };
}

function edmActionDate() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${d.toISOString().slice(0, 19)}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** Gönderici birim (GB) — tam format: urn:mail:...@... */
function edmGbAliasNormalize(alias) {
  let a = String(alias || '').trim();
  if (!a) return '';
  a = a.replace(/^urn:mail:/i, '');
  a = a.toLocaleLowerCase('en-US');
  return `urn:mail:${a}`;
}

/** Alıcı posta kutusu (PK) — HEADER TO / RECEIVER alias, urn:mail: olmadan */
function edmPkAliasNormalize(alias) {
  let a = String(alias || '').trim();
  if (!a) return '';
  a = a.replace(/^urn:mail:/i, '');
  return a.toLocaleLowerCase('en-US');
}

function edmAliasTemizle(alias) {
  return edmPkAliasNormalize(alias);
}

function edmConfigOku() {
  const wsdlUrl = String(process.env.EDM_WSDL_URL || '').trim()
    || 'https://test.edmbilisim.com.tr/EFaturaEDM21ea/EFaturaEDM.svc?singleWsdl';
  return {
    wsdlUrl,
    username: String(process.env.EDM_USERNAME || '').trim(),
    password: String(process.env.EDM_PASSWORD || ''),
    hostname: String(process.env.EDM_HOSTNAME || 'ACRZIRAAT').trim(),
    reason: String(process.env.EDM_REASON || 'E-fatura entegrasyon testi').trim(),
    channel: String(process.env.EDM_CHANNEL || 'ACRZIRAAT').trim(),
    application: String(process.env.EDM_APPLICATION || 'ACR Ziraat').trim(),
    testModu: String(process.env.EDM_TEST || '1').trim() !== '0',
  };
}

function edmUserListesiAyikla(raw) {
  if (!raw) return [];
  const list = raw.USER || raw.User || raw.users || raw;
  if (Array.isArray(list)) return list;
  if (list && typeof list === 'object') return [list];
  return [];
}

function edmRequestHeader(cfg, sessionId) {
  return {
    ...edmXmlAttrs(),
    SESSION_ID: sessionId || '0',
    CLIENT_TXN_ID: edmGuid(),
    ACTION_DATE: edmActionDate(),
    REASON: cfg.reason,
    APPLICATION_NAME: cfg.application,
    HOSTNAME: cfg.hostname,
    CHANNEL_NAME: cfg.channel,
    COMPRESSED: 'N',
  };
}

function edmSoapMesaj(err) {
  if (!err) return 'Bilinmeyen SOAP hatası';
  const body = typeof err.body === 'string' ? err.body : '';
  if (body.includes('504 Gateway')) {
    return 'EDM sunucusu zaman aşımına uğradı (504). Birkaç dakika sonra tekrar deneyin veya EDM portalından PDF indirin.';
  }
  const fault = err.root?.Fault || err.root?.fault;
  const faultStr = fault?.faultstring?._ || fault?.faultstring || fault?.faultstring?.$value;
  if (faultStr) return String(faultStr);
  const msg = err.message;
  if (typeof msg === 'string' && msg && msg !== '[object Object]') return msg;
  if (typeof msg === 'object' && msg) {
    try {
      return JSON.stringify(msg).slice(0, 600);
    } catch (_) { /* ignore */ }
  }
  const m = body.match(/<faultstring[^>]*>([^<]+)/i);
  if (m) return m[1];
  return String(err);
}

function edmSoapHata(err) {
  const body = err?.body || err?.response?.data;
  const root = err?.root;
  return {
    message: edmSoapMesaj(err),
    fault: root?.Fault || root?.fault || null,
    body: typeof body === 'string' ? body.slice(0, 2000) : body,
  };
}

/** e-Arşiv / e-Fatura giden yönü (GetInvoice DIRECTION) */
function edmFaturaYonu(tip) {
  const t = String(tip || '').trim().toUpperCase();
  if (t === 'EARSIV' || t === 'E-ARSIV') return 'OUT-EARCHIVE';
  if (t === 'EFATURA' || t === 'E-FATURA') return 'OUT-EINVOICE';
  return 'OUT';
}

/** EDM dokümanı: CR_START_DATE / CR_END_DATE (+03:00) */
function edmIsoTarihTr(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+03:00`;
}

function edmCrTarihAraligi(tarih) {
  const merkez = tarih ? new Date(tarih) : new Date();
  if (Number.isNaN(merkez.getTime())) return null;
  const start = new Date(merkez);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(merkez);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 0);
  return { start: edmIsoTarihTr(start), end: edmIsoTarihTr(end) };
}

function edmLoginSonucAyikla(raw) {
  if (!raw || typeof raw !== 'object') return { sessionId: null, raw };
  const sessionId = raw.SESSION_ID
    || raw.SessionId
    || raw.sessionId
    || raw.LoginResponse?.SESSION_ID
    || null;
  return { sessionId: sessionId ? String(sessionId) : null, raw };
}

async function edmSoapClientOlustur(wsdlUrl) {
  return soap.createClientAsync(wsdlUrl, {
    wsdl_options: { timeout: 60000 },
    disableCache: true,
  });
}

/**
 * EDM Login — test bağlantısının ilk adımı.
 */
async function edmLogin(cfgIn) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  if (!cfg.username || !cfg.password) {
    return {
      success: false,
      message: 'EDM_USERNAME ve EDM_PASSWORD .env dosyasında tanımlı olmalı.',
    };
  }

  let client;
  try {
    client = await edmSoapClientOlustur(cfg.wsdlUrl);
  } catch (err) {
    return { success: false, message: 'WSDL / SOAP istemci hatası', detail: edmSoapHata(err), wsdlUrl: cfg.wsdlUrl };
  }

  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, '0'),
    USER_NAME: edmXmlValue(cfg.username),
    PASSWORD: edmXmlValue(cfg.password),
  };

  try {
    const method = client.LoginAsync ? 'LoginAsync' : null;
    if (!method || !client[method]) {
      return { success: false, message: 'WSDL içinde Login metodu bulunamadı.', wsdlUrl: cfg.wsdlUrl };
    }
    const [result] = await client.LoginAsync(args);
    const { sessionId, raw } = edmLoginSonucAyikla(result);
    if (!sessionId) {
      return {
        success: false,
        message: 'Login yanıtında SESSION_ID yok. Kullanıcı/şifre veya WSDL sürümünü kontrol edin.',
        raw,
        wsdlUrl: cfg.wsdlUrl,
      };
    }
    return {
      success: true,
      message: 'EDM test girişi başarılı.',
      sessionId,
      wsdlUrl: cfg.wsdlUrl,
      testModu: cfg.testModu,
    };
  } catch (err) {
    return {
      success: false,
      message: 'EDM Login hatası',
      detail: edmSoapHata(err),
      wsdlUrl: cfg.wsdlUrl,
    };
  }
}

/**
 * Oturum açıkken kısa fatura listesi (giden, son 5).
 */
async function edmSoapCagir(wsdlUrl, methodName, args, opts) {
  const timeoutMs = Number(opts?.timeoutMs) || 60000;
  const client = await soap.createClientAsync(wsdlUrl, {
    wsdl_options: { timeout: timeoutMs },
    disableCache: true,
  });
  const fn = `${methodName}Async`;
  if (!client[fn]) {
    return { success: false, message: `WSDL içinde ${methodName} metodu bulunamadı.` };
  }
  try {
    const [result] = await client[fn](args);
    return { success: true, result };
  } catch (err) {
    return { success: false, message: edmSoapMesaj(err), detail: edmSoapHata(err) };
  }
}

/**
 * VKN/TCKN için e-fatura posta kutusu (PK) etiketi sorgular.
 */
async function edmCheckUser(sessionId, identifier, cfgIn) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    USER: {
      ...edmXmlAttrs(),
      IDENTIFIER: String(identifier || '').trim(),
    },
  };
  const cagri = await edmSoapCagir(cfg.wsdlUrl, 'CheckUser', args);
  if (!cagri.success) return cagri;
  const users = edmUserListesiAyikla(cagri.result);
  return { success: true, users };
}

/**
 * UBL-TR faturayı EDM üzerinden GİB'e gönderir.
 */
async function edmSendInvoice(payload) {
  const cfg = edmConfigOku();
  const {
    sessionId,
    senderVkn,
    receiverVkn,
    gbAlias,
    pkAlias,
    earsiv,
    uuid,
    content,
  } = payload;

  const pk = edmPkAliasNormalize(pkAlias);
  const gb = edmGbAliasNormalize(gbAlias);
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    RECEIVER: {
      attributes: {
        xmlns: '',
        vkn: String(receiverVkn || '').trim(),
        alias: pk,
      },
    },
    INVOICE: {
      attributes: { TRXID: '0', xmlns: '' },
      HEADER: {
        ...edmXmlAttrs(),
        SENDER: String(senderVkn || '').trim(),
        RECEIVER: String(receiverVkn || '').trim(),
        FROM: gb,
        TO: pk,
        INTERNETSALES: 'false',
        EARCHIVE: earsiv ? 'true' : 'false',
        EARCHIVE_REPORT_SENDDATE: '0001-01-01',
        CANCEL_EARCHIVE_REPORT_SENDDATE: '0001-01-01',
      },
      CONTENT: content,
    },
  };

  const cagri = await edmSoapCagir(cfg.wsdlUrl, 'SendInvoice', args);
  if (!cagri.success) return cagri;

  const raw = cagri.result || {};
  const inv = raw.INVOICE || raw.Invoice || raw;
  const invObj = Array.isArray(inv) ? inv[0] : inv;
  const attrs = invObj?.attributes || invObj?.$ || {};
  const faturaNo = invObj?.ID || attrs.ID || null;
  const outUuid = invObj?.UUID || attrs.UUID || uuid || null;
  const status = invObj?.HEADER?.STATUS || invObj?.STATUS || null;

  return {
    success: true,
    message: 'Fatura EDM\'ye iletildi.',
    faturaNo: faturaNo ? String(faturaNo) : null,
    uuid: outUuid ? String(outUuid) : null,
    status: status ? String(status) : null,
    raw,
  };
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

/**
 * GetInvoice INVOICE_SEARCH_KEY — EDM resmi doküman formatı.
 * @see EDM Web Servis API 1.4 GET INVOICE
 */
function edmFaturaAramaAnahtari(arama) {
  const search = {
    ...edmXmlAttrs(),
    DIRECTION: arama.yon || edmFaturaYonu(arama.tip),
    READ_INCLUDED: false,
    ISARCHIVED: false,
  };
  if (arama.faturaNo) search.ID = String(arama.faturaNo).trim();
  else if (arama.uuid) search.UUID = String(arama.uuid).trim();

  const aralik = edmCrTarihAraligi(arama.crTarih || arama.faturaTarih);
  if (aralik && arama.crTarihKullan !== false) {
    search.CR_START_DATE = aralik.start;
    search.CR_END_DATE = aralik.end;
  }

  if (arama.fromGb) search.FROM = String(arama.fromGb).trim();
  if (arama.senderVkn && arama.useSenderFilter) search.SENDER = String(arama.senderVkn).trim();

  if (arama.limit) {
    search.LIMIT = Number(arama.limit) || 1;
    search.LIMITSpecified = true;
  }
  return search;
}

/**
 * Giden faturayı EDM'den UUID veya fatura no ile çeker (PDF / HTML / XML).
 * UUID ve ID aynı istekte gönderilmez (EDM hata verebilir).
 */
async function edmFaturaIndir(sessionId, arama, contentType, cfgIn) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  const tip = String(contentType || 'PDF').toUpperCase();
  const search = edmFaturaAramaAnahtari(arama);
  if (!search.UUID && !search.ID) {
    return { success: false, message: 'Fatura UUID veya fatura no gerekli.' };
  }

  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    INVOICE_SEARCH_KEY: search,
    HEADER_ONLY: edmXmlValue('N'),
    INVOICE_CONTENT_TYPE: edmXmlValue(tip),
  };

  const timeoutMs = Number(cfgIn?.timeoutMs) || 60000;
  const cagri = await edmSoapCagir(cfg.wsdlUrl, 'GetInvoice', args, { timeoutMs });
  if (!cagri.success) return cagri;

  const b64 = edmFaturaContentAyikla(cagri.result);
  if (!b64) {
    return {
      success: false,
      message: 'EDM fatura içeriği boş döndü. Fatura henüz işleniyor olabilir; birkaç dakika sonra tekrar deneyin.',
      raw: cagri.result,
    };
  }
  return {
    success: true,
    contentType: tip,
    base64: b64,
    yon: search.DIRECTION,
  };
}

/**
 * GetInvoiceStatus — EDM doküman 1.5 (INVOICE TRXID="0" UUID="...").
 */
async function edmFaturaDurumSorgula(sessionId, arama, cfgIn) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  const uuid = String(arama.uuid || '').trim();
  const faturaNo = String(arama.faturaNo || '').trim();
  if (!uuid && !faturaNo) {
    return { success: false, message: 'Durum sorgusu için UUID veya fatura no gerekli.' };
  }
  const invAttrs = { TRXID: '0', xmlns: '' };
  if (uuid) invAttrs.UUID = uuid;
  if (faturaNo && !uuid) invAttrs.ID = faturaNo;
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    INVOICE: { attributes: invAttrs },
  };
  const cagri = await edmSoapCagir(cfg.wsdlUrl, 'GetInvoiceStatus', args, { timeoutMs: 30000 });
  if (!cagri.success) return cagri;
  const st = cagri.result?.INVOICE_STATUS || cagri.result;
  const stObj = Array.isArray(st) ? st[0] : st;
  return {
    success: true,
    status: stObj?.STATUS ? String(stObj.STATUS) : null,
    statusDesc: stObj?.STATUS_DESCRIPTION ? String(stObj.STATUS_DESCRIPTION) : null,
    direction: stObj?.DIRECTION ? String(stObj.DIRECTION) : null,
    raw: stObj,
  };
}

/** PDF/HTML/XML — fatura no + OUT-EARCHIVE/OUT-EINVOICE, sonra OUT (EDM doküman). */
async function edmFaturaIndirAkilli(sessionId, arama, contentType, opts) {
  const hizli = !!(opts && opts.hizli);
  const yon = arama.yon || edmFaturaYonu(arama.tip);
  const denemeler = [];
  const ekle = (y, fn) => {
    if (fn) denemeler.push({ yon: y, faturaNo: fn });
  };
  if (arama.faturaNo) {
    ekle(yon, arama.faturaNo);
    if (yon !== 'OUT') ekle('OUT', arama.faturaNo);
    if (yon === 'OUT-EARCHIVE') ekle('OUT-EINVOICE', arama.faturaNo);
  } else if (arama.uuid) {
    denemeler.push({ yon, uuid: arama.uuid });
  }

  const tip = String(contentType || 'PDF').toUpperCase();
  const timeoutMs = tip === 'HTML' ? 70000 : (hizli ? 45000 : 90000);
  const maxDeneme = tip === 'HTML' ? 3 : 1;
  let sonHata = { success: false, message: 'EDM fatura indirilemedi.' };
  for (let tur = 0; tur < maxDeneme; tur += 1) {
    for (const d of denemeler) {
      const r = await edmFaturaIndir(sessionId, {
        ...arama,
        yon: d.yon,
        uuid: d.uuid,
        faturaNo: d.faturaNo,
      }, contentType, { timeoutMs });
      if (r.success) return r;
      sonHata = r;
    }
    if (tur < maxDeneme - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
  return sonHata;
}

async function edmSonGidenFaturalar(cfgIn, sessionId, limit) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  const aralik = edmCrTarihAraligi(new Date());
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    INVOICE_CONTENT_TYPE: edmXmlValue('XML'),
    HEADER_ONLY: edmXmlValue('Y'),
    INVOICE_SEARCH_KEY: {
      ...edmXmlAttrs(),
      DIRECTION: 'OUT',
      READ_INCLUDED: false,
      READ_INCLUDEDSpecified: true,
      ISARCHIVED: false,
      ISARCHIVEDSpecified: true,
      ...(aralik ? {
        CR_START_DATE: aralik.start,
        CR_START_DATESpecified: true,
        CR_END_DATE: aralik.end,
        CR_END_DATESpecified: true,
      } : {}),
      LIMIT: limit || 5,
      LIMITSpecified: true,
    },
  };
  const cagri = await edmSoapCagir(cfg.wsdlUrl, 'GetInvoice', args);
  if (!cagri.success) return cagri;
  return { success: true, result: cagri.result };
}

async function edmBaglantiTesti(cfgIn) {
  const login = await edmLogin(cfgIn);
  if (!login.success) return login;

  let liste = null;
  try {
    liste = await edmSonGidenFaturalar(cfgIn, login.sessionId, 3);
  } catch (_) {
    liste = { success: false, message: 'GetInvoice atlandı' };
  }

  return {
    ...login,
    liste,
  };
}

module.exports = {
  edmConfigOku,
  edmLogin,
  edmBaglantiTesti,
  edmCheckUser,
  edmSendInvoice,
  edmSonGidenFaturalar,
  edmFaturaIndir,
  edmFaturaIndirAkilli,
  edmFaturaDurumSorgula,
  edmFaturaYonu,
  edmGbAliasNormalize,
  edmAliasTemizle,
};
