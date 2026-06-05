const crypto = require('crypto');

function xmlEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bugunTarihSaat() {
  const d = new Date();
  const tarih = d.toISOString().slice(0, 10);
  const saat = d.toTimeString().slice(0, 8);
  return { tarih, saat };
}

function kdvAyir(kdvDahilTutar, oran) {
  const tutar = Math.round(Number(kdvDahilTutar) * 100) / 100;
  const matrah = Math.round((tutar / (1 + oran / 100)) * 100) / 100;
  const kdv = Math.round((tutar - matrah) * 100) / 100;
  return { tutar, matrah, kdv };
}

/**
 * Satış hareketinden UBL-TR 1.2 fatura XML üretir.
 * @param {object} opts
 * @param {boolean} opts.earsiv
 * @param {number} opts.kdvOran
 * @param {object} opts.sirket
 * @param {object} opts.musteri
 * @param {object} opts.hareket
 * @param {Array} opts.kalemler
 */
function ublTrFaturaXmlOlustur(opts) {
  const earsiv = !!opts.earsiv;
  const kdvOran = Number(opts.kdvOran) || 20;
  const sirket = opts.sirket || {};
  const musteri = opts.musteri || {};
  const hareket = opts.hareket || {};
  const kalemler = Array.isArray(opts.kalemler) ? opts.kalemler : [];

  const uuid = opts.uuid || crypto.randomUUID();
  const faturaNo = String(opts.faturaNo || `ACR${hareket.HareketID || Date.now()}`);
  let tarih = opts.tarih;
  let saat = opts.saat;
  if (!tarih || !saat) {
    const ts = opts.faturaTarih ? new Date(opts.faturaTarih) : new Date();
    if (!Number.isNaN(ts.getTime())) {
      tarih = ts.toISOString().slice(0, 10);
      saat = ts.toTimeString().slice(0, 8);
    } else {
      ({ tarih, saat } = bugunTarihSaat());
    }
  }
  const profileId = earsiv ? 'EARSIVFATURA' : 'TICARIFATURA';

  const senderVkn = String(sirket.vkn || '').trim();
  const senderUnvan = String(sirket.unvan || 'Firma').trim();
  const senderAdres = String(sirket.adres || 'Türkiye').trim();

  const tur = String(musteri.tur || '').trim().toLocaleLowerCase('tr-TR');
  const tuzel = tur === 'tuzel' || tur === 'tüzel' || tur === 'kurumsal';
  const aliciVknTckn = tuzel
    ? String(musteri.vergino || '').trim()
    : String(musteri.tcno || '').trim();
  const aliciScheme = tuzel ? 'VKN' : 'TCKN';
  const aliciUnvan = tuzel
    ? String(musteri.FirmaAdi || musteri.firmaAdi || musteri.AdSoyad || 'Müşteri').trim()
    : String(musteri.AdSoyad || musteri.TanimAdi || 'Müşteri').trim();
  const aliciAdres = String(musteri.Adres || musteri.adres || 'Türkiye').trim();

  let toplamMatrah = 0;
  let toplamKdv = 0;
  let toplamTutar = 0;

  const satirXml = kalemler.map((k, i) => {
    const ad = String(k.UrunAdi || 'Ürün').trim();
    const miktar = Number(k.Miktar) || 1;
    const satirTutar = Number(k.SatirTutar) || 0;
    const { matrah, kdv, tutar } = kdvAyir(satirTutar, kdvOran);
    toplamMatrah += matrah;
    toplamKdv += kdv;
    toplamTutar += tutar;
    const birimFiyat = Math.round((matrah / miktar) * 100) / 100;
    return `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${miktar}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="TRY">${matrah.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="TRY">${kdv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="TRY">${matrah.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="TRY">${kdv.toFixed(2)}</cbc:TaxAmount>
          <cbc:Percent>${kdvOran}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme>
              <cbc:Name>KDV</cbc:Name>
              <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${xmlEsc(ad)}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="TRY">${birimFiyat.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('');

  toplamMatrah = Math.round(toplamMatrah * 100) / 100;
  toplamKdv = Math.round(toplamKdv * 100) / 100;
  toplamTutar = Math.round(toplamTutar * 100) / 100;

  const adParcalari = aliciUnvan.split(/\s+/).filter(Boolean);
  const aliciAd = adParcalari[0] || aliciUnvan || 'Müşteri';
  const aliciSoyad = adParcalari.length > 1 ? adParcalari.slice(1).join(' ') : '-';
  const aliciPersonXml = aliciScheme === 'TCKN'
    ? `<cac:Person>
      <cbc:FirstName>${xmlEsc(aliciAd)}</cbc:FirstName>
      <cbc:FamilyName>${xmlEsc(aliciSoyad)}</cbc:FamilyName>
    </cac:Person>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${xmlEsc(faturaNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:IssueTime>${saat}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${kalemler.length}</cbc:LineCountNumeric>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${xmlEsc(senderVkn)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlEsc(senderUnvan)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEsc(senderAdres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>Türkiye</cbc:CitySubdivisionName>
        <cbc:CityName>Türkiye</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${aliciScheme}">${xmlEsc(aliciVknTckn)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlEsc(aliciUnvan)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEsc(aliciAdres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>Türkiye</cbc:CitySubdivisionName>
        <cbc:CityName>Türkiye</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      ${aliciPersonXml}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">${toplamKdv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">${toplamMatrah.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">${toplamKdv.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${kdvOran}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">${toplamMatrah.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">${toplamMatrah.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">${toplamTutar.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="TRY">${toplamTutar.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${satirXml}
</Invoice>`;
}

function ublTrFaturaBase64(xml) {
  return Buffer.from(xml, 'utf8').toString('base64');
}

module.exports = {
  ublTrFaturaXmlOlustur,
  ublTrFaturaBase64,
  kdvAyir,
};
