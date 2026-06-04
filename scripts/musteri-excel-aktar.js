#!/usr/bin/env node
/**
 * Excel (.xlsx) veya CSV — müşterileri MSSQL Musteriler tablosuna aktarır.
 * ACR Ziraat için: C:\acrziraat klasöründe çalıştırın (DB_NAME=acrziraat) veya MUSTERI-EXCEL-AKTAR.bat
 *
 * Kullanım:
 *   node scripts/musteri-excel-aktar.js
 *   node scripts/musteri-excel-aktar.js --dosya "C:\liste\musteriler.xlsx"
 *   node scripts/musteri-excel-aktar.js --dosya data\musteriler.csv --dry-run
 *   node scripts/musteri-excel-aktar.js --atla-telefon   (aynı telefon varsa satırı atla)
 *
 * Şablon: data/musteri-aktar-sablon.csv (Excel'de açıp doldurun, xlsx olarak da kaydedebilirsiniz)
 */

const fs = require('fs');
const path = require('path');
const { sql, poolPromise } = require('../db');
const { ensureTemelTablolar } = require('../lib/temel-schema');
const {
  basliklariEsle,
  satirObjesiOlustur,
  musteriImportDogrula,
  csvSatirlariOku,
} = require('../lib/musteri-import');

const KOK = path.join(__dirname, '..');
const VARSAYILAN_DOSYALAR = [
  path.join(KOK, 'data', 'musteriler.xlsx'),
  path.join(KOK, 'data', 'musteriler.csv'),
  path.join(KOK, 'data', 'musteri-aktar-sablon.csv'),
];

function argAl(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}

function bayrakVar(flag) {
  return process.argv.includes(flag);
}

function dosyaBul() {
  const arg = argAl('--dosya') || process.argv.find((a) => !a.startsWith('-') && /\.(xlsx|xls|csv)$/i.test(a));
  if (arg) {
    const p = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
    if (!fs.existsSync(p)) {
      console.error(`Dosya bulunamadı: ${p}`);
      process.exit(1);
    }
    return p;
  }
  for (const p of VARSAYILAN_DOSYALAR) {
    if (fs.existsSync(p) && !/sablon/i.test(p)) return p;
  }
  console.error(`
Müşteri dosyası bulunamadı.

1) Excel listenizi şuraya koyun:  data\\musteriler.xlsx
   veya CSV:                  data\\musteriler.csv
2) Şablon için:               data\\musteri-aktar-sablon.csv
3) Çalıştırın:
   node scripts/musteri-excel-aktar.js --dosya "C:\\yol\\liste.xlsx"
`);
  process.exit(1);
}

function xlsxOku(dosyaYolu) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (_) {
    console.error('xlsx paketi yok. Proje klasöründe: npm install');
    process.exit(1);
  }
  const wb = XLSX.readFile(dosyaYolu, { cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim())));
}

function dosyadanSatirlar(dosyaYolu) {
  const ext = path.extname(dosyaYolu).toLowerCase();
  if (ext === '.csv') {
    const buf = fs.readFileSync(dosyaYolu);
    let icerik = buf.toString('utf8');
    if (icerik.includes('\uFFFD') || (!icerik.includes('Ad') && buf[0] === 0xFD)) {
      icerik = buf.toString('latin1');
    }
    return csvSatirlariOku(icerik);
  }
  if (ext === '.xlsx' || ext === '.xls') return xlsxOku(dosyaYolu);
  console.error('Desteklenen: .xlsx, .xls, .csv');
  process.exit(1);
}

async function telefonMevcut(pool, telefon) {
  const rs = await pool.request()
    .input('Tel', sql.NVarChar(20), telefon)
    .query('SELECT TOP 1 MusteriID FROM Musteriler WHERE Telefon = @Tel');
  return rs.recordset[0]?.MusteriID || null;
}

async function musteriEkle(pool, d) {
  await pool.request()
    .input('AdSoyad', sql.NVarChar(100), d.AdSoyad)
    .input('FirmaAdi', sql.NVarChar(150), d.FirmaAdi)
    .input('Telefon', sql.NVarChar(20), d.telefonRaw)
    .input('Adres', sql.NVarChar(255), d.Adres)
    .input('Il', sql.NVarChar(60), d.Il)
    .input('Ilce', sql.NVarChar(60), d.Ilce)
    .input('Mahalle', sql.NVarChar(120), d.Mahalle)
    .input('TanimAdi', sql.NVarChar(120), d.TanimAdi)
    .input('tur', sql.NVarChar(20), d.tur)
    .input('tcno', sql.NVarChar(11), d.tcno)
    .input('vergino', sql.NVarChar(20), d.vergino)
    .input('yetkili', sql.NVarChar(120), d.yetkili)
    .input('Bakiye', sql.Decimal(18, 2), d.Bakiye)
    .query(`
      INSERT INTO Musteriler
        (AdSoyad, FirmaAdi, Telefon, Adres, Il, Ilce, Mahalle, TanimAdi, tur, tcno, vergino, yetkili, Bakiye)
      VALUES
        (@AdSoyad, @FirmaAdi, @Telefon, @Adres, @Il, @Ilce, @Mahalle, @TanimAdi, @tur, @tcno, @vergino, @yetkili, @Bakiye)
    `);
}

async function main() {
  const dosya = dosyaBul();
  const dryRun = bayrakVar('--dry-run');
  const atlaTelefon = bayrakVar('--atla-telefon');

  console.log(`Dosya: ${dosya}`);
  if (dryRun) console.log('(Deneme modu — veritabanına yazılmayacak)\n');

  const satirlar = dosyadanSatirlar(dosya);
  if (satirlar.length < 2) {
    console.error('En az başlık + 1 veri satırı gerekli.');
    process.exit(1);
  }

  const headerRow = satirlar[0];
  const colMap = basliklariEsle(headerRow);
  if (colMap.telefon == null) {
    console.error('Excel başlığında "Telefon" kolonu bulunamadı. Şablon: data/musteri-aktar-sablon.csv');
    console.error('Bulunan başlıklar:', headerRow.join(' | '));
    process.exit(1);
  }
  if (colMap.adsoyad == null && colMap.firmaadi == null) {
    console.error('En az "AdSoyad" veya "FirmaAdi" kolonu gerekli.');
    process.exit(1);
  }

  const pool = await poolPromise;
  await ensureTemelTablolar(pool);

  let eklenen = 0;
  let atlanan = 0;
  let hata = 0;

  for (let i = 1; i < satirlar.length; i++) {
    const cells = satirlar[i];
    if (!cells.some((c) => String(c).trim())) continue;

    const row = satirObjesiOlustur(headerRow, cells, colMap);
    const dogrulama = musteriImportDogrula(row);
    const satirNo = i + 1;

    if (!dogrulama.ok) {
      hata++;
      console.log(`  [${satirNo}] HATA: ${dogrulama.message}`);
      continue;
    }

    if (atlaTelefon) {
      const mevcut = await telefonMevcut(pool, dogrulama.telefonRaw);
      if (mevcut) {
        atlanan++;
        console.log(`  [${satirNo}] ATLA (telefon kayıtlı): ${dogrulama.telefonRaw} — ${dogrulama.AdSoyad || dogrulama.FirmaAdi}`);
        continue;
      }
    }

    if (dryRun) {
      eklenen++;
      console.log(`  [${satirNo}] OK: ${dogrulama.tur} — ${dogrulama.AdSoyad || dogrulama.FirmaAdi} — ${dogrulama.telefonRaw}`);
      continue;
    }

    try {
      await musteriEkle(pool, dogrulama);
      eklenen++;
      console.log(`  [${satirNo}] Eklendi: ${dogrulama.AdSoyad || dogrulama.FirmaAdi}`);
    } catch (err) {
      hata++;
      console.log(`  [${satirNo}] DB: ${err.message || err}`);
    }
  }

  console.log('\n--- Özet ---');
  console.log(`Eklenen${dryRun ? ' (deneme)' : ''}: ${eklenen}`);
  console.log(`Atlanan: ${atlanan}`);
  console.log(`Hatalı: ${hata}`);
  process.exit(hata > 0 && eklenen === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
