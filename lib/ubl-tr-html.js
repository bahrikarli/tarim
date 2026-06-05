/**
 * UBL-TR Invoice XML → okunabilir HTML (GİB fatura özeti).
 * Ham XML tarayıcıda açılmaz; bu modül HTML üretir.
 */

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

function ublIlkMetin(xml, etiket) {
  const re = new RegExp(`<(?:[\\w-]+:)?${etiket}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${etiket}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function ublBlokMetin(xml, blok, etiket) {
  const blokRe = new RegExp(`<(?:[\\w-]+:)?${blok}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${blok}>`, 'i');
  const bm = String(xml || '').match(blokRe);
  if (!bm) return '';
  const re = new RegExp(`<(?:[\\w-]+:)?${etiket}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${etiket}>`, 'i');
  const m = bm[1].match(re);
  return m ? m[1].trim() : '';
}

function ublKimlik(xml, blok) {
  const b = String(xml || '').match(new RegExp(`<(?:[\\w-]+:)?${blok}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${blok}>`, 'i'));
  if (!b) return '';
  const ids = [...b[1].matchAll(/<(?:[\w-]+:)?ID\s+schemeID="([^"]*)"[^>]*>([^<]*)</gi)];
  for (const m of ids) {
    const scheme = (m[1] || '').toUpperCase();
    if (scheme === 'VKN' || scheme === 'TCKN') return m[2].trim();
  }
  const m = b[1].match(/<(?:[\w-]+:)?ID[^>]*>([^<]*)</i);
  return m ? m[1].trim() : '';
}

function ublKalemler(xml) {
  const lines = [...String(xml || '').matchAll(/<(?:[\w-]+:)?InvoiceLine[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?InvoiceLine>/gi)];
  return lines.map((lm) => {
    const block = lm[1];
    const miktarM = block.match(/<(?:[\w-]+:)?InvoicedQuantity[^>]*>([^<]*)</i);
    const fiyatM = block.match(/<(?:[\w-]+:)?Price[^>]*>[\s\S]*?<(?:[\w-]+:)?PriceAmount[^>]*>([^<]*)</i);
    const tutarM = block.match(/<(?:[\w-]+:)?LineExtensionAmount[^>]*>([^<]*)</i);
    const adM = block.match(/<(?:[\w-]+:)?Item[^>]*>[\s\S]*?<(?:[\w-]+:)?Name[^>]*>([^<]*)</i);
    return {
      urunAdi: adM ? adM[1].trim() : 'Kalem',
      miktar: miktarM ? Number(miktarM[1]) || miktarM[1] : 0,
      birimFiyat: fiyatM ? Number(fiyatM[1]) : 0,
      satirTutar: tutarM ? Number(tutarM[1]) : 0,
    };
  });
}

function ublTrXmlParse(xml) {
  const profile = ublIlkMetin(xml, 'ProfileID');
  const faturaNo = ublIlkMetin(xml, 'ID');
  const uuid = ublIlkMetin(xml, 'UUID');
  const tarih = ublIlkMetin(xml, 'IssueDate');
  const saat = ublIlkMetin(xml, 'IssueTime');
  const saticiUnvan = ublBlokMetin(xml, 'AccountingSupplierParty', 'Name') || ublBlokMetin(xml, 'Signature', 'Name');
  const saticiVkn = ublKimlik(xml, 'AccountingSupplierParty');
  const aliciAd = ublBlokMetin(xml, 'AccountingCustomerParty', 'Name')
    || [ublBlokMetin(xml, 'AccountingCustomerParty', 'FirstName'), ublBlokMetin(xml, 'AccountingCustomerParty', 'FamilyName')].filter(Boolean).join(' ');
  const aliciKimlik = ublKimlik(xml, 'AccountingCustomerParty');
  const kalemler = ublKalemler(xml);
  const matrah = Number(ublIlkMetin(xml, 'LineExtensionAmount')) || 0;
  const kdv = Number(ublIlkMetin(xml, 'TaxAmount')) || 0;
  const toplam = Number(ublIlkMetin(xml, 'PayableAmount')) || (matrah + kdv);
  let kdvOran = 20;
  const oranM = String(xml || '').match(/<(?:[\w-]+:)?Percent[^>]*>([^<]*)</i);
  if (oranM) kdvOran = Number(oranM[1]) || 20;

  return {
    tip: /EARSIV/i.test(profile) ? 'EARSIV' : 'EFATURA',
    faturaNo,
    uuid,
    faturaTarih: tarih ? `${tarih} ${saat || ''}`.trim() : null,
    saticiUnvan,
    saticiVkn,
    aliciAd,
    aliciKimlik,
    kalemler,
    kdvOzet: { matrah, kdv, toplam },
    kdvOran,
    tutar: toplam,
  };
}

function ublTrXmlHtmlGovde(data, opts) {
  const tipLabel = data.tip === 'EARSIV' ? 'e-Arşiv Fatura' : 'e-Fatura';
  const kalemler = data.kalemler || [];
  const kdv = data.kdvOzet || {};
  const satirlar = kalemler.map((k) => `
    <tr>
      <td>${htmlEsc(k.urunAdi)}</td>
      <td class="num">${k.miktar}</td>
      <td class="num">${paraFmt(k.birimFiyat)}</td>
      <td class="num"><strong>${paraFmt(k.satirTutar)}</strong></td>
    </tr>`).join('');
  const uyari = opts && opts.uyari
    ? `<div class="uyari">${opts.uyari}</div>`
    : '';
  return `
    ${uyari}
    <div class="ust">
      <div>
        <div class="etiket">${htmlEsc(tipLabel)} — UBL-TR</div>
        <div class="firma">${htmlEsc(data.saticiUnvan || 'Satıcı')}</div>
        <div class="kucuk">VKN: ${htmlEsc(data.saticiVkn || '—')}</div>
      </div>
      <div class="sag">
        <div class="etiket">Alıcı</div>
        <div class="firma">${htmlEsc(data.aliciAd || 'Müşteri')}</div>
        <div class="kucuk">${htmlEsc(data.aliciKimlik || '—')}</div>
      </div>
    </div>
    <div class="bilgi">
      <div><strong>Fatura no:</strong> ${htmlEsc(data.faturaNo || '—')}</div>
      <div><strong>UUID:</strong> ${htmlEsc(data.uuid || '—')}</div>
      <div><strong>Tarih:</strong> ${htmlEsc(data.faturaTarih || '—')}</div>
    </div>
    <table>
      <thead>
        <tr><th>Ürün</th><th class="num">Adet</th><th class="num">Birim fiyat</th><th class="num">Tutar</th></tr>
      </thead>
      <tbody>${satirlar || '<tr><td colspan="4" style="text-align:center;color:#666">Kalem yok</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Matrah (KDV hariç)</td><td class="num">${paraFmt(kdv.matrah || 0)}</td></tr>
        <tr><td colspan="3" class="num">KDV (%${data.kdvOran || 20})</td><td class="num">${paraFmt(kdv.kdv || 0)}</td></tr>
        <tr class="toplam"><td colspan="3" class="num">Genel toplam</td><td class="num">${paraFmt(kdv.toplam || data.tutar || 0)}</td></tr>
      </tfoot>
    </table>`;
}

function ublTrXmlTamSayfaHtml(xml, opts) {
  const data = ublTrXmlParse(xml);
  const govde = ublTrXmlHtmlGovde(data, opts);
  const baslik = `Fatura ${data.faturaNo || ''}`.trim();
  const stil = `
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #222; margin: 0; padding: 24px; max-width: 820px; }
    .uyari { background: #e8f4fd; border: 1px solid #90caf9; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 12px; line-height: 1.45; }
    .ust { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #1b5e20; }
    .etiket { font-size: 11px; color: #666; text-transform: uppercase; }
    .firma { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .kucuk { font-size: 12px; color: #555; margin-top: 2px; }
    .sag { text-align: right; }
    .bilgi { background: #f4f8f4; border: 1px solid #c8e6c9; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 12px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 7px 8px; }
    th { background: #f5f5f5; }
    .num { text-align: right; white-space: nowrap; }
    tfoot tr.toplam td { font-weight: 700; background: #f0f0f0; }
    .toolbar { margin-bottom: 16px; }
    .btn-yazdir { background: #1b5e20; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
    @media print { .toolbar, .uyari { display: none !important; } body { padding: 0; } }`;
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>${htmlEsc(baslik)}</title><style>${stil}</style></head>
<body>
  <div class="toolbar no-print"><button type="button" class="btn-yazdir" onclick="window.print()">Yazdır / PDF olarak kaydet</button></div>
  ${govde}
</body></html>`;
}

module.exports = {
  ublTrXmlParse,
  ublTrXmlTamSayfaHtml,
};
