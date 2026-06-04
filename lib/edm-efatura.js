/**
 * EDM Bilişim e-Fatura SOAP istemcisi (test / canlı WSDL).
 * Dokümantasyon: https://docs.edmbilisim.com.tr/api/api-documentation/introduction.html
 */

const soap = require('soap');
const crypto = require('crypto');

function edmGuid() {
  return crypto.randomUUID();
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

function edmRequestHeader(cfg, sessionId) {
  return {
    SESSION_ID: sessionId || '0',
    CLIENT_TXN_ID: edmGuid(),
    ACTION_DATE: new Date().toISOString().slice(0, 19),
    REASON: cfg.reason,
    HOSTNAME: cfg.hostname,
    CHANNEL_NAME: cfg.channel,
    APPLICATION_NAME: cfg.application,
    COMPRESSED: 'N',
  };
}

function edmSoapHata(err) {
  const msg = err?.message || String(err);
  const body = err?.body || err?.response?.data;
  const root = err?.root;
  return {
    message: msg,
    fault: root?.Fault || root?.fault || null,
    body: typeof body === 'string' ? body.slice(0, 2000) : body,
  };
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
    USER_NAME: cfg.username,
    PASSWORD: cfg.password,
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
async function edmSonGidenFaturalar(cfgIn, sessionId, limit) {
  const cfg = { ...edmConfigOku(), ...cfgIn };
  const client = await edmSoapClientOlustur(cfg.wsdlUrl);
  const args = {
    REQUEST_HEADER: edmRequestHeader(cfg, sessionId),
    INVOICE_CONTENT_TYPE: 'XML',
    HEADER_ONLY: 'Y',
    INVOICE_SEARCH_KEY: {
      DIRECTION: 'OUT',
      LIMIT: limit || 5,
      LIMITSpecified: true,
    },
  };
  try {
    const [result] = await client.GetInvoiceAsync(args);
    return { success: true, result };
  } catch (err) {
    return { success: false, detail: edmSoapHata(err) };
  }
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
  edmSonGidenFaturalar,
};
