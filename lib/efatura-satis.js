const crypto = require('crypto');
const { ublTrFaturaXmlOlustur, ublTrFaturaBase64, kdvAyir } = require('./ubl-tr-fatura');
const { ublTrXmlTamSayfaHtml } = require('./ubl-tr-html');
const {
  edmConfigOku,
  edmLogin,
  edmCheckUser,
  edmSendInvoice,
  edmFaturaIndirAkilli,
  edmGbAliasNormalize,
  edmAliasTemizle,
} = require('./edm-efatura');

function musteriTuzelMi(m) {
  const t = String(m?.tur || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return t === 'tuzel' || t === 'tüzel' || t === 'kurumsal';
}

function efaturaKdvOran() {
  const n = Number(process.env.EDM_KDV_ORAN || '20');
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

function efaturaFaturaSeri() {
  return String(process.env.EDM_FATURA_SERI || 'ACR').trim() || 'ACR';
}

function htmlEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paraFmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0,00 ₺';
  return `${x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function efaturaGorunumGovdeHtml(o, opts) {
  const tipLabel = o.tip === 'EARSIV' ? 'e-Arşiv Fatura' : 'e-Fatura';
  const kdv = o.kdvOzet || {};
  const kalemler = Array.isArray(o.kalemler) ? o.kalemler : [];
  const satirlar = kalemler.map((k) => `
    <tr>
      <td>${htmlEsc(k.urunAdi)}</td>
      <td class="num">${k.miktar}</td>
      <td class="num">${paraFmt(k.birimFiyat)}</td>
      <td class="num"><strong>${paraFmt(k.satirTutar)}</strong></td>
    </tr>`).join('');
  const uyari = '';
  const tarihStr = o.faturaTarih
    ? new Date(o.faturaTarih).toLocaleString('tr-TR')
    : new Date().toLocaleString('tr-TR');

  return `
    ${uyari}
    <div class="ust">
      <div>
        <div class="etiket">${htmlEsc(tipLabel)}</div>
        <div class="firma">${htmlEsc(o.saticiUnvan || 'Satıcı')}</div>
        <div class="kucuk">VKN: ${htmlEsc(o.saticiVkn || '—')}</div>
      </div>
      <div class="sag">
        <div class="etiket">Alıcı</div>
        <div class="firma">${htmlEsc(o.aliciAd || 'Müşteri')}</div>
        <div class="kucuk">${htmlEsc(o.aliciKimlik || '—')}</div>
      </div>
    </div>
    <div class="bilgi">
      <div><strong>Fatura no:</strong> ${htmlEsc(o.mevcutFaturaNo || o.faturaNo || '—')}</div>
      <div><strong>UUID:</strong> ${htmlEsc(o.mevcutUUID || o.uuid || '—')}</div>
      <div><strong>Tarih:</strong> ${htmlEsc(tarihStr)}</div>
    </div>
    <table>
      <thead>
        <tr><th>Ürün</th><th class="num">Adet</th><th class="num">Birim fiyat</th><th class="num">Tutar</th></tr>
      </thead>
      <tbody>${satirlar || '<tr><td colspan="4" style="text-align:center;color:#666">Kalem yok</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Matrah (KDV hariç)</td><td class="num">${paraFmt(kdv.matrah || 0)}</td></tr>
        <tr><td colspan="3" class="num">KDV (%${o.kdvOran || 20})</td><td class="num">${paraFmt(kdv.kdv || 0)}</td></tr>
        <tr class="toplam"><td colspan="3" class="num">Genel toplam</td><td class="num">${paraFmt(kdv.toplam || o.tutar || 0)}</td></tr>
      </tfoot>
    </table>`;
}

function edmResmiHtmlGecerliMi(html) {
  const s = String(html || '').trim();
  if (s.length < 3000) return false;
  if (!/<html[\s>]/i.test(s)) return false;
  if (s.includes('toolbar no-print') && s.includes('GİB\'e gönderilen fatura bilgilerinden')) return false;
  if (s.includes('UBL-TR XML') && s.includes('oluşturuldu')) return false;
  return true;
}

function efaturaTamSayfaHtml(govde, baslik) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${htmlEsc(baslik || 'Fatura')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #222; margin: 0; padding: 24px; max-width: 820px; }
    .uyari { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 12px; line-height: 1.45; }
    .ust { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #1b5e20; }
    .etiket { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .03em; }
    .firma { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .kucuk { font-size: 12px; color: #555; margin-top: 2px; }
    .sag { text-align: right; }
    .bilgi { background: #f4f8f4; border: 1px solid #c8e6c9; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 12px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #ccc; padding: 7px 8px; }
    th { background: #f5f5f5; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    tfoot tr.toplam td { font-weight: 700; background: #f0f0f0; }
    .toolbar { margin-bottom: 16px; }
    .toolbar button, .toolbar a { margin-right: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; border-radius: 6px; text-decoration: none; display: inline-block; }
    .btn-yazdir { background: #1b5e20; color: #fff; border: none; }
    .btn-portal { background: #fff; color: #1b5e20; border: 1px solid #1b5e20; }
    @media print { .toolbar, .uyari { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" class="btn-yazdir" onclick="window.print()">Yazdır / PDF olarak kaydet</button>
  </div>
  ${govde}
</body>
</html>`;
}

async function efaturaSatisGorunumHtml(pool, hareketID, opts) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk) return { success: false, message: 'Satış hareketi bulunamadı.' };
  if (yuk.hareket.EfaturaDurum !== 'Gonderildi') {
    return { success: false, message: 'Bu satış için kesilmiş fatura yok.' };
  }
  const kayitliUbl = String(yuk.hareket.EfaturaUblXml || '').trim();
  if (kayitliUbl && kayitliUbl.includes('<Invoice')) {
    const uyari = opts && opts.yedek
      ? 'GİB\'e gönderilen UBL-TR XML\'den oluşturuldu. EDM HTML alınamadıysa bu görünümü kullanın. <strong>Yazdır → PDF olarak kaydet</strong>.'
      : 'GİB UBL-TR fatura görünümü.';
    const html = ublTrXmlTamSayfaHtml(kayitliUbl, { uyari });
    return {
      success: true,
      html,
      faturaNo: yuk.hareket.EfaturaNo,
      uuid: yuk.hareket.EfaturaUUID,
      kaynak: 'ubl',
    };
  }
  const sirket = await sirketAyarlariOku(pool);
  const cfg = edmConfigOku();
  const oniz = efaturaOnizlemeOlustur(yuk.hareket, yuk.kalemler, sirket, !!(cfg.username && cfg.password));
  oniz.faturaTarih = yuk.hareket.EfaturaTarih || yuk.hareket.Tarih;
  oniz.tip = String(yuk.hareket.EfaturaTip || oniz.tip || 'EARSIV').toUpperCase() === 'EFATURA' ? 'EFATURA' : 'EARSIV';
  const govde = efaturaGorunumGovdeHtml(oniz, { yedek: !!(opts && opts.yedek) });
  const faturaNo = oniz.mevcutFaturaNo || oniz.faturaNo || hareketID;
  const html = efaturaTamSayfaHtml(govde, `Fatura ${faturaNo}`);
  return { success: true, html, faturaNo, uuid: oniz.mevcutUUID };
}

async function sirketAyarlariOku(pool) {
  const rs = await pool.request().query(`
    SELECT TOP 1 SirketUnvan, SirketVergiNo, SirketAdres, SirketTelefon, EdmGbAlias
    FROM SistemAyarlar WHERE AyarID = 1
  `);
  const row = rs.recordset[0] || {};
  return {
    unvan: String(row.SirketUnvan || '').trim(),
    vkn: String(row.SirketVergiNo || process.env.EDM_SENDER_VKN || '').trim(),
    adres: String(row.SirketAdres || '').trim(),
    telefon: String(row.SirketTelefon || '').trim(),
    gbAlias: edmGbAliasNormalize(String(row.EdmGbAlias || process.env.EDM_GB_ALIAS || '').trim()),
  };
}

async function satisHareketiYukle(pool, hareketID) {
  const hRs = await pool.request()
    .input('HID', hareketID)
    .query(`
      SELECT h.HareketID, h.MusteriID, h.Tur, h.ToplamTutar, h.Aciklama, h.Tarih,
             h.EfaturaDurum, h.EfaturaTip, h.EfaturaUUID, h.EfaturaNo, h.EfaturaHata, h.EfaturaTarih,
             h.EfaturaUblXml, h.EfaturaEdmHtml, h.EfaturaEdmHtmlTarih,
             m.AdSoyad, m.FirmaAdi, m.TanimAdi, m.Adres, m.Il, m.Ilce, m.tur, m.tcno, m.vergino, m.yetkili
      FROM MusteriHareketleri h
      INNER JOIN Musteriler m ON m.MusteriID = h.MusteriID
      WHERE h.HareketID = @HID
    `);
  if (!hRs.recordset.length) return null;
  const hareket = hRs.recordset[0];
  const kRs = await pool.request()
    .input('HID', hareketID)
    .query(`
      SELECT DetayID, StokID, UrunAdi, Miktar, BirimFiyat, SatirTutar
      FROM MusteriHareketDetaylari WHERE HareketID = @HID ORDER BY DetayID
    `);
  return { hareket, kalemler: kRs.recordset || [] };
}

function efaturaOnizlemeOlustur(hareket, kalemler, sirket, edmKullanici) {
  const tuzel = musteriTuzelMi(hareket);
  const vergiNo = String(hareket.vergino || '').trim();
  const tcNo = String(hareket.tcno || '').trim();
  const engeller = [];

  if ((hareket.Tur || '').toLowerCase() !== 'satis') {
    engeller.push('Yalnızca satış hareketleri faturalandırılabilir.');
  }
  if (!kalemler.length) {
    engeller.push('Satış kalemi bulunamadı.');
  }
  if (Number(hareket.ToplamTutar) <= 0) {
    engeller.push('Satış tutarı sıfır.');
  }
  if (!sirket.vkn || sirket.vkn.length !== 10) {
    engeller.push('Ayarlar → Şirket vergi no (10 hane VKN) tanımlı olmalı.');
  }
  if (!sirket.unvan) {
    engeller.push('Ayarlar → Şirket ünvanı tanımlı olmalı.');
  }
  if (!sirket.gbAlias) {
    engeller.push('Ayarlar → EDM gönderici etiketi (GB) girin. EDM test portalından veya Alper Demir\'den alınır.');
  }
  if (!edmKullanici) {
    engeller.push('EDM kullanıcı/şifre (.env) tanımlı olmalı.');
  }

  let tip = 'EARSIV';
  let aliciKimlik = '';
  if (tuzel && vergiNo.length === 10) {
    tip = 'EFATURA';
    aliciKimlik = vergiNo;
  } else if (tcNo.length === 11) {
    tip = 'EARSIV';
    aliciKimlik = tcNo;
  } else if (tuzel) {
    engeller.push('Tüzel müşteride 10 haneli vergi no eksik.');
  } else {
    engeller.push('Gerçek kişi müşteride 11 haneli TC kimlik no eksik.');
  }

  const aliciAd = tuzel
    ? String(hareket.FirmaAdi || hareket.AdSoyad || '').trim()
    : String(hareket.AdSoyad || hareket.TanimAdi || '').trim();

  const kdvOran = efaturaKdvOran();
  let matrahToplam = 0;
  let kdvToplam = 0;
  const kalemListe = kalemler.map((k) => {
    const satirTutar = Number(k.SatirTutar) || 0;
    const { matrah, kdv, tutar } = kdvAyir(satirTutar, kdvOran);
    matrahToplam += matrah;
    kdvToplam += kdv;
    return {
      urunAdi: String(k.UrunAdi || '').trim(),
      miktar: Number(k.Miktar) || 0,
      birimFiyat: Number(k.BirimFiyat) || 0,
      satirTutar: tutar,
      matrah,
      kdv,
    };
  });
  matrahToplam = Math.round(matrahToplam * 100) / 100;
  kdvToplam = Math.round(kdvToplam * 100) / 100;

  const kesimEngeller = hareket.EfaturaDurum === 'Gonderildi'
    ? ['Bu satış için zaten e-fatura kesilmiş.']
    : engeller;

  return {
    hareketID: hareket.HareketID,
    tip,
    aliciAd,
    aliciKimlik,
    tutar: Number(hareket.ToplamTutar),
    kalemSayisi: kalemler.length,
    kdvOran,
    kalemler: kalemListe,
    kdvOzet: { matrah: matrahToplam, kdv: kdvToplam, toplam: Number(hareket.ToplamTutar) },
    saticiUnvan: String(sirket.unvan || '').trim(),
    saticiVkn: String(sirket.vkn || '').trim(),
    kesilebilir: kesimEngeller.length === 0,
    engeller: kesimEngeller,
    mevcutDurum: hareket.EfaturaDurum || null,
    mevcutFaturaNo: hareket.EfaturaNo || null,
    mevcutUUID: hareket.EfaturaUUID || null,
    edmPortalUrl: String(process.env.EDM_TEST || '1').trim() !== '0'
      ? 'https://test.edmbilisim.com.tr/EFaturaUI21ea'
      : 'https://portal2.edmbilisim.com.tr/EFaturaUI',
  };
}

async function edmOturumAc() {
  const login = await edmLogin();
  if (!login.success) return login;
  return { success: true, sessionId: login.sessionId };
}

async function aliciPkAliasBul(sessionId, kimlik, earsiv) {
  if (earsiv) return { alias: '', pkList: [] };
  const check = await edmCheckUser(sessionId, kimlik);
  if (!check.success) return check;
  const users = check.users || [];
  const pk = users.filter((u) => String(u.UNIT || '').toUpperCase() === 'PK');
  if (!pk.length) {
    return {
      success: false,
      message: 'Alıcı e-fatura mükellefi değil veya posta kutusu bulunamadı. e-Arşiv kullanın.',
      users,
    };
  }
  const alias = edmAliasTemizle(pk[0].ALIAS);
  return { success: true, alias, pkList: pk };
}

async function efaturaSatisOnizle(pool, hareketID) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk) return { success: false, message: 'Satış hareketi bulunamadı.' };
  const sirket = await sirketAyarlariOku(pool);
  const cfg = edmConfigOku();
  const onizleme = efaturaOnizlemeOlustur(
    yuk.hareket,
    yuk.kalemler,
    sirket,
    !!(cfg.username && cfg.password),
  );
  return { success: true, onizleme, sirket: { unvan: sirket.unvan, vkn: sirket.vkn } };
}

async function efaturaSatisKes(pool, hareketID) {
  const oniz = await efaturaSatisOnizle(pool, hareketID);
  if (!oniz.success) return oniz;
  if (!oniz.onizleme.kesilebilir) {
    return {
      success: false,
      message: oniz.onizleme.engeller[0] || 'e-Fatura kesilemez.',
      engeller: oniz.onizleme.engeller,
    };
  }

  const yuk = await satisHareketiYukle(pool, hareketID);
  const sirket = await sirketAyarlariOku(pool);
  const { hareket, kalemler } = yuk;
  const earsiv = oniz.onizleme.tip === 'EARSIV';
  const aliciKimlik = oniz.onizleme.aliciKimlik;

  const oturum = await edmOturumAc();
  if (!oturum.success) {
    await efaturaDurumKaydet(pool, hareketID, 'Hata', null, null, null, oturum.message);
    return oturum;
  }

  let pkAlias = '';
  if (!earsiv) {
    const pk = await aliciPkAliasBul(oturum.sessionId, aliciKimlik, false);
    if (!pk.success) {
      await efaturaDurumKaydet(pool, hareketID, 'Hata', oniz.onizleme.tip, null, null, pk.message);
      return pk;
    }
    pkAlias = pk.alias;
  }

  const uuid = crypto.randomUUID();
  const faturaNo = `${efaturaFaturaSeri()}${new Date().getFullYear()}${String(hareketID).padStart(9, '0')}`;
  const xml = ublTrFaturaXmlOlustur({
    earsiv,
    kdvOran: efaturaKdvOran(),
    uuid,
    faturaNo,
    sirket,
    musteri: hareket,
    hareket,
    kalemler,
  });
  const content = ublTrFaturaBase64(xml);

  const gbAlias = edmGbAliasNormalize(sirket.gbAlias || process.env.EDM_GB_ALIAS || '');
  const send = await edmSendInvoice({
    sessionId: oturum.sessionId,
    senderVkn: sirket.vkn,
    receiverVkn: aliciKimlik,
    gbAlias,
    pkAlias,
    earsiv,
    uuid,
    content,
  });

  if (!send.success) {
    await efaturaDurumKaydet(pool, hareketID, 'Hata', oniz.onizleme.tip, uuid, null, send.message);
    return send;
  }

  await efaturaDurumKaydet(
    pool,
    hareketID,
    'Gonderildi',
    oniz.onizleme.tip,
    send.uuid || uuid,
    send.faturaNo || faturaNo,
    null,
    xml,
  );

  efaturaEdmHtmlArkaPlanIndir(pool, hareketID);

  return {
    success: true,
    message: earsiv ? 'e-Arşiv fatura gönderildi.' : 'e-Fatura gönderildi.',
    tip: oniz.onizleme.tip,
    uuid: send.uuid || uuid,
    faturaNo: send.faturaNo || faturaNo,
    durum: send.status || null,
  };
}

async function efaturaDurumKaydet(pool, hareketID, durum, tip, uuid, faturaNo, hata, ublXml) {
  await pool.request()
    .input('HID', hareketID)
    .input('Durum', durum)
    .input('Tip', tip)
    .input('UUID', uuid)
    .input('FaturaNo', faturaNo)
    .input('Hata', hata ? String(hata).substring(0, 500) : null)
    .input('UblXml', ublXml ? String(ublXml) : null)
    .query(`
      UPDATE MusteriHareketleri
      SET EfaturaDurum = @Durum,
          EfaturaTip = @Tip,
          EfaturaUUID = @UUID,
          EfaturaNo = @FaturaNo,
          EfaturaHata = @Hata,
          EfaturaUblXml = CASE WHEN @UblXml IS NOT NULL THEN @UblXml ELSE EfaturaUblXml END,
          EfaturaTarih = CASE WHEN @Durum = N'Gonderildi' THEN GETDATE() ELSE EfaturaTarih END
      WHERE HareketID = @HID
    `);
}

async function efaturaEdmHtmlKaydet(pool, hareketID, html) {
  const metin = String(html || '').trim();
  if (!edmResmiHtmlGecerliMi(metin)) return { success: false, message: 'Geçersiz EDM HTML.' };
  await pool.request()
    .input('HID', hareketID)
    .input('Html', metin)
    .query(`
      UPDATE MusteriHareketleri
      SET EfaturaEdmHtml = @Html, EfaturaEdmHtmlTarih = GETDATE()
      WHERE HareketID = @HID
    `);
  return { success: true };
}

function efaturaEdmHtmlArkaPlanIndir(pool, hareketID) {
  setImmediate(() => {
    efaturaEdmHtmlCanliIndirKaydet(pool, hareketID, { arkaPlan: true }).catch((err) => {
      console.warn('[EFATURA] EDM HTML arka plan:', err.message || err);
    });
  });
}

async function efaturaEdmHtmlCanliIndirKaydet(pool, hareketID, opts) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk || yuk.hareket.EfaturaDurum !== 'Gonderildi') {
    return { success: false, message: 'Kesilmiş fatura yok.' };
  }
  const kayitli = String(yuk.hareket.EfaturaEdmHtml || '').trim();
  if (kayitli && edmResmiHtmlGecerliMi(kayitli)) {
    return { success: true, html: kayitli, kaynak: 'kayit', faturaNo: yuk.hareket.EfaturaNo, uuid: yuk.hareket.EfaturaUUID };
  }

  const uuid = String(yuk.hareket.EfaturaUUID || '').trim();
  const faturaNo = String(yuk.hareket.EfaturaNo || '').trim();
  const tip = String(yuk.hareket.EfaturaTip || '').trim();
  if (!uuid && !faturaNo) return { success: false, message: 'Fatura UUID / no yok.' };

  const sirket = await sirketAyarlariOku(pool);
  const oturum = await edmOturumAc();
  if (!oturum.success) return oturum;

  const arama = {
    uuid,
    faturaNo,
    tip: tip || 'EARSIV',
    fromGb: edmGbAliasNormalize(sirket.gbAlias || process.env.EDM_GB_ALIAS || ''),
    faturaTarih: yuk.hareket.EfaturaTarih || yuk.hareket.Tarih,
  };

  const arkaPlan = !!(opts && opts.arkaPlan);
  const denemeSayisi = arkaPlan ? 6 : 1;
  let sonHata = { success: false, message: 'EDM resmi HTML alınamadı.' };
  for (let i = 0; i < denemeSayisi; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, arkaPlan ? 15000 * i : 0));
    }
    const indir = await edmFaturaIndirAkilli(oturum.sessionId, arama, 'HTML', { hizli: !arkaPlan });
    if (!indir.success) {
      sonHata = indir;
      continue;
    }
    const html = Buffer.from(indir.base64, 'base64').toString('utf8');
    if (!edmResmiHtmlGecerliMi(html)) {
      sonHata = { success: false, message: 'EDM yanıtı geçerli HTML değil.' };
      continue;
    }
    await efaturaEdmHtmlKaydet(pool, hareketID, html);
    return {
      success: true,
      html,
      kaynak: 'edm',
      faturaNo,
      uuid,
      contentType: 'text/html; charset=utf-8',
    };
  }
  return sonHata;
}

async function efaturaSatisResmiHtml(pool, hareketID, opts) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk) return { success: false, message: 'Satış hareketi bulunamadı.' };
  if (yuk.hareket.EfaturaDurum !== 'Gonderildi') {
    return { success: false, message: 'Bu satış için kesilmiş fatura yok.' };
  }

  const kayitli = String(yuk.hareket.EfaturaEdmHtml || '').trim();
  if (kayitli && edmResmiHtmlGecerliMi(kayitli)) {
    return {
      success: true,
      format: 'html',
      kaynak: 'edm-kayit',
      faturaNo: yuk.hareket.EfaturaNo,
      uuid: yuk.hareket.EfaturaUUID,
      html: kayitli,
      contentType: 'text/html; charset=utf-8',
    };
  }

  if (opts && opts.sadeceKayitli) {
    const portal = String(process.env.EDM_TEST || '1').trim() !== '0'
      ? 'https://test.edmbilisim.com.tr/EFaturaUI21ea'
      : 'https://portal2.edmbilisim.com.tr/EFaturaUI';
    return {
      success: false,
      message: 'Resmi EDM HTML henüz kaydedilmedi. EDM sunucusu yanıt verene kadar bekleyin veya tekrar deneyin.',
      edmHtmlKayitli: false,
      edmPortalUrl: portal,
      faturaNo: yuk.hareket.EfaturaNo,
      uuid: yuk.hareket.EfaturaUUID,
    };
  }

  const canli = await efaturaEdmHtmlCanliIndirKaydet(pool, hareketID, { arkaPlan: false });
  if (canli.success) {
    return {
      success: true,
      format: 'html',
      kaynak: canli.kaynak === 'kayit' ? 'edm-kayit' : 'edm',
      faturaNo: canli.faturaNo,
      uuid: canli.uuid,
      html: canli.html,
      contentType: 'text/html; charset=utf-8',
    };
  }

  const portal = String(process.env.EDM_TEST || '1').trim() !== '0'
    ? 'https://test.edmbilisim.com.tr/EFaturaUI21ea'
    : 'https://portal2.edmbilisim.com.tr/EFaturaUI';

  return {
    ...canli,
    edmHtmlKayitli: false,
    edmPortalUrl: portal,
    detay: 'Giden Faturalar → faturayı aç → PDF/HTML indir. Test ortamında GetInvoice zaman aşımı sık görülür.',
  };
}

async function efaturaKayitliUblXml(pool, hareketID) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk) return { success: false, message: 'Satış hareketi bulunamadı.' };
  const { hareket, kalemler } = yuk;
  if (hareket.EfaturaDurum !== 'Gonderildi') {
    return { success: false, message: 'Bu satış için kesilmiş fatura yok.' };
  }
  const kayitli = String(hareket.EfaturaUblXml || '').trim();
  if (kayitli) {
    return {
      success: true,
      xml: kayitli,
      kaynak: 'kayit',
      faturaNo: hareket.EfaturaNo,
      uuid: hareket.EfaturaUUID,
    };
  }
  const sirket = await sirketAyarlariOku(pool);
  const earsiv = String(hareket.EfaturaTip || '').toUpperCase() === 'EARSIV';
  const xml = ublTrFaturaXmlOlustur({
    earsiv,
    kdvOran: efaturaKdvOran(),
    uuid: String(hareket.EfaturaUUID || '').trim(),
    faturaNo: String(hareket.EfaturaNo || '').trim(),
    faturaTarih: hareket.EfaturaTarih || hareket.Tarih,
    sirket,
    musteri: hareket,
    hareket,
    kalemler,
  });
  return {
    success: true,
    xml,
    kaynak: 'uretim',
    faturaNo: hareket.EfaturaNo,
    uuid: hareket.EfaturaUUID,
  };
}

async function efaturaSatisBelgeAl(pool, hareketID, istenenFormat, opts) {
  const yuk = await satisHareketiYukle(pool, hareketID);
  if (!yuk) return { success: false, message: 'Satış hareketi bulunamadı.' };
  const { hareket } = yuk;
  if (hareket.EfaturaDurum !== 'Gonderildi') {
    return { success: false, message: 'Bu satış için kesilmiş fatura yok.' };
  }
  const uuid = String(hareket.EfaturaUUID || '').trim();
  const faturaNo = String(hareket.EfaturaNo || '').trim();
  const tip = String(hareket.EfaturaTip || '').trim();
  if (!uuid && !faturaNo) {
    return { success: false, message: 'Fatura UUID / no kaydı yok.' };
  }

  const format = String(istenenFormat || 'pdf').toLowerCase();
  const hizli = !opts || opts.hizli !== false;
  const sirket = await sirketAyarlariOku(pool);
  const oturum = await edmOturumAc();
  if (!oturum.success) return oturum;

  const arama = {
    uuid,
    faturaNo,
    tip: tip || (String(hareket.EfaturaTip || '').toUpperCase() === 'EFATURA' ? 'EFATURA' : 'EARSIV'),
    fromGb: edmGbAliasNormalize(sirket.gbAlias || process.env.EDM_GB_ALIAS || ''),
    faturaTarih: hareket.EfaturaTarih || hareket.Tarih,
  };
  const edmOpts = { hizli };
  // EDM test ortamında PDF zaman aşımı veriyor; resmi GİB görünümü HTML olarak geliyor.
  // EDM test: PDF endpoint 504 veriyor; resmi GİB görünümü HTML olarak gelir.
  const edmSira = format === 'xml'
    ? ['XML']
    : hizli
      ? ['HTML', 'XML']
      : ['HTML', 'XML', 'PDF'];

  for (const edmTip of edmSira) {
    const indir = await edmFaturaIndirAkilli(oturum.sessionId, arama, edmTip, edmOpts);
    if (!indir.success) continue;
    if (edmTip === 'PDF' && (format === 'pdf' || format === 'auto')) {
      return {
        success: true,
        format: 'pdf',
        kaynak: 'edm',
        faturaNo,
        uuid,
        contentType: 'application/pdf',
        base64: indir.base64,
      };
    }
    if (edmTip === 'HTML' && (format === 'html' || format === 'pdf' || format === 'auto')) {
      const html = Buffer.from(indir.base64, 'base64').toString('utf8');
      if (edmResmiHtmlGecerliMi(html)) {
        await efaturaEdmHtmlKaydet(pool, hareketID, html).catch(() => {});
      }
      return {
        success: true,
        format: 'html',
        kaynak: 'edm',
        faturaNo,
        uuid,
        contentType: 'text/html; charset=utf-8',
        html,
      };
    }
    if (edmTip === 'XML') {
      const xml = Buffer.from(indir.base64, 'base64').toString('utf8');
      if (format === 'xml') {
        return {
          success: true,
          format: 'xml',
          kaynak: 'edm',
          faturaNo,
          uuid,
          contentType: 'application/xml; charset=utf-8',
          xml,
        };
      }
      const html = ublTrXmlTamSayfaHtml(xml, {
        uyari: 'EDM\'den alınan UBL-TR faturanın HTML görünümü. <strong>Yazdır → PDF olarak kaydet</strong>.',
      });
      return {
        success: true,
        format: 'html',
        kaynak: 'edm-ubl',
        faturaNo,
        uuid,
        contentType: 'text/html; charset=utf-8',
        html,
      };
    }
  }

  const ubl = await efaturaKayitliUblXml(pool, hareketID);
  if (!ubl.success) return ubl;

  if (format === 'xml') {
    return {
      success: true,
      format: 'xml',
      kaynak: ubl.kaynak,
      faturaNo: ubl.faturaNo,
      uuid: ubl.uuid,
      contentType: 'application/xml; charset=utf-8',
      xml: ubl.xml,
    };
  }

  if (format === 'pdf' || format === 'html' || format === 'auto' || format === 'gorunum') {
    const gorunum = await efaturaSatisGorunumHtml(pool, hareketID, { yedek: true });
    if (!gorunum.success) return gorunum;
    return {
      success: true,
      format: 'html',
      kaynak: 'yedek',
      faturaNo: gorunum.faturaNo,
      uuid: gorunum.uuid,
      contentType: 'text/html; charset=utf-8',
      html: gorunum.html,
    };
  }

  const portal = String(process.env.EDM_TEST || '1').trim() !== '0'
    ? 'https://test.edmbilisim.com.tr/EFaturaUI21ea'
    : 'https://portal2.edmbilisim.com.tr/EFaturaUI';

  return {
    success: false,
    message: 'EDM resmi PDF şu an indirilemedi. EDM test sunucusu yanıt vermiyor olabilir.',
    detay: 'Giden Faturalar → faturayı aç → PDF indir. Portal: ' + portal,
    faturaNo,
    uuid,
    edmPortalUrl: portal,
  };
}

async function efaturaSatisPdfAl(pool, hareketID) {
  return efaturaSatisBelgeAl(pool, hareketID, 'pdf');
}

async function efaturaSatisUblHtml(pool, hareketID) {
  const ubl = await efaturaKayitliUblXml(pool, hareketID);
  if (!ubl.success) return ubl;
  const html = ublTrXmlTamSayfaHtml(ubl.xml, {
    uyari: 'UBL-TR XML dosyasından oluşturulmuş fatura görünümü. Ham XML tarayıcıda okunmaz; bu sayfayı yazdırın.',
  });
  return {
    success: true,
    html,
    faturaNo: ubl.faturaNo,
    uuid: ubl.uuid,
    kaynak: ubl.kaynak,
  };
}

module.exports = {
  efaturaSatisOnizle,
  efaturaSatisKes,
  efaturaSatisPdfAl,
  efaturaSatisBelgeAl,
  efaturaSatisGorunumHtml,
  efaturaSatisUblHtml,
  efaturaSatisResmiHtml,
  efaturaEdmHtmlCanliIndirKaydet,
  efaturaKayitliUblXml,
  musteriTuzelMi,
};
