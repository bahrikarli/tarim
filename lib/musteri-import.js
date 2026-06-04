/**
 * Excel/CSV müşteri aktarımı — kolon eşleme ve doğrulama (API ile uyumlu).
 */

function trNorm(s) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/\s+/g, ' ');
}

function musteriTurNormalize(tur) {
  const t = trNorm(tur);
  if (t === 'tuzel' || t === 'kurumsal' || t === 'sirket' || t === 'tüzel' || t === 'tuzel') return 'Tuzel';
  return 'Gercek';
}

function telefonNormalize(raw) {
  let s = String(raw ?? '').replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('90') && s.length >= 12) s = s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s;
}

const KOLON_ALIAS = {
  tur: ['tur', 'tip', 'musteri turu', 'musteri tipi', 'tür'],
  adsoyad: ['adsoyad', 'ad soyad', 'ad_soyad', 'isim', 'musteri adi', 'musteri'],
  firmaadi: ['firmaadi', 'firma', 'firma adi', 'unvan', 'ünvan', 'sirket'],
  yetkili: ['yetkili', 'yetkili kisi', 'yetkili adi', 'sorumlu'],
  telefon: ['telefon', 'tel', 'cep', 'gsm', 'mobil', 'telefon no'],
  tcno: ['tcno', 'tc', 'tckn', 'tc kimlik', 'tc kimlik no'],
  vergino: ['vergino', 'vergi', 'vergi no', 'vkn'],
  il: ['il', 'şehir', 'sehir'],
  ilce: ['ilce', 'ilçe', 'ilce adi'],
  mahalle: ['mahalle', 'mah'],
  tanimadi: ['tanimadi', 'tanim adi', 'tanim', 'koy', 'köy', 'mevki'],
  adres: ['adres', 'adres satiri', 'acik adres'],
  bakiye: ['bakiye', 'borc', 'alacak', 'cari bakiye'],
};

function baslikAnahtar(hucre) {
  const n = trNorm(hucre).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [anahtar, liste] of Object.entries(KOLON_ALIAS)) {
    if (liste.some((a) => n === a || n.includes(a))) return anahtar;
  }
  return null;
}

function satirDeger(row, anahtar) {
  if (!row || !anahtar) return '';
  if (row[anahtar] != null && String(row[anahtar]).trim() !== '') return String(row[anahtar]).trim();
  return '';
}

function basliklariEsle(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const key = baslikAnahtar(h);
    if (key && map[key] == null) map[key] = i;
  });
  return map;
}

function satirObjesiOlustur(headerRow, cells, colMap) {
  const row = {};
  for (const [key, idx] of Object.entries(colMap)) {
    row[key] = cells[idx] != null ? String(cells[idx]).trim() : '';
  }
  if (!row.telefon && colMap.telefon == null) {
    for (let i = 0; i < cells.length; i++) {
      const h = baslikAnahtar(headerRow[i]);
      if (h === 'telefon') row.telefon = String(cells[i] ?? '').trim();
    }
  }
  return row;
}

function musteriImportDogrula(row) {
  const tur = musteriTurNormalize(satirDeger(row, 'tur') || 'Gercek');
  const telefonRaw = telefonNormalize(satirDeger(row, 'telefon'));
  if (!telefonRaw) return { ok: false, message: 'Telefon boş.' };
  if (!/^[1-9][0-9]{9}$/.test(telefonRaw)) {
    return { ok: false, message: `Geçersiz telefon: ${satirDeger(row, 'telefon')} (10 hane, 0 ile başlamamalı).` };
  }

  const ortak = {
    tur,
    telefonRaw,
    Il: satirDeger(row, 'il') || null,
    Ilce: satirDeger(row, 'ilce') || null,
    Mahalle: satirDeger(row, 'mahalle') || null,
    TanimAdi: satirDeger(row, 'tanimadi') || null,
    Adres: satirDeger(row, 'adres') || null,
    Bakiye: parseFloat(String(satirDeger(row, 'bakiye') || '0').replace(',', '.')) || 0,
  };

  if (tur === 'Tuzel') {
    const firma = satirDeger(row, 'firmaadi');
    const yetkili = satirDeger(row, 'yetkili') || satirDeger(row, 'adsoyad');
    const vergi = String(satirDeger(row, 'vergino')).replace(/\D/g, '');
    if (!firma) return { ok: false, message: 'Tüzel: firma ünvanı zorunlu.' };
    if (!yetkili) return { ok: false, message: 'Tüzel: yetkili zorunlu.' };
    if (vergi && vergi.length !== 10) return { ok: false, message: 'Vergi no 10 hane olmalı.' };
    return {
      ok: true,
      ...ortak,
      FirmaAdi: firma.substring(0, 150),
      AdSoyad: yetkili.substring(0, 100),
      yetkili: yetkili.substring(0, 120),
      vergino: vergi || null,
      tcno: null,
    };
  }

  const ad = satirDeger(row, 'adsoyad') || satirDeger(row, 'firmaadi');
  const tc = String(satirDeger(row, 'tcno')).replace(/\D/g, '');
  if (!ad) return { ok: false, message: 'Gerçek: ad soyad zorunlu.' };
  if (tc && tc.length !== 11) return { ok: false, message: 'TC 11 hane olmalı.' };
  return {
    ok: true,
    ...ortak,
    AdSoyad: ad.substring(0, 100),
    FirmaAdi: null,
    yetkili: null,
    vergino: null,
    tcno: tc || null,
  };
}

function csvSatirlariOku(icerik) {
  const metin = String(icerik).replace(/^\uFEFF/, '');
  const satirlar = [];
  let cur = '';
  let row = [];
  let inQ = false;
  const sep = (metin.split('\n')[0] || '').includes(';') ? ';' : ',';
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === sep) {
      row.push(cur);
      cur = '';
      continue;
    }
    if (!inQ && (c === '\n' || c === '\r')) {
      if (c === '\r' && metin[i + 1] === '\n') i++;
      row.push(cur);
      if (row.some((x) => String(x).trim())) satirlar.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    if (row.some((x) => String(x).trim())) satirlar.push(row);
  }
  return satirlar;
}

module.exports = {
  trNorm,
  musteriTurNormalize,
  telefonNormalize,
  baslikAnahtar,
  basliklariEsle,
  satirObjesiOlustur,
  musteriImportDogrula,
  csvSatirlariOku,
  KOLON_ALIAS,
};
