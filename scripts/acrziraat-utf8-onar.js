/**
 * Bozuk UTF-8 (mojibake) metinleri duzeltir — acrziraat public + db.
 */
const fs = require('fs');
const path = require('path');

const hedef = path.resolve(process.argv[2] || 'C:\\acrziraat');

const MOJIBAKE = [
  ['Ã§', 'ç'], ['Ã‡', 'Ç'], ['Ä±', 'ı'], ['Ä°', 'İ'],
  ['Ã¶', 'ö'], ['Ã–', 'Ö'], ['Ã¼', 'ü'], ['Ãœ', 'Ü'],
  ['ÅŸ', 'ş'], ['Åž', 'Ş'], ['ÄŸ', 'ğ'], ['Äž', 'Ğ'],
  ['Â·', '·'], ['â€¦', '…'], ['â†’', '→'], ['â†', '←'],
  ['â€"', '—'], ['â‚º', '₺'], ['Ã—', '×'],
  ['BaÄŸlantÄ±', 'Bağlantı'], ['KullanÄ±cÄ±', 'Kullanıcı'],
  ['Åifre', 'Şifre'], ['HÄ±zlÄ±', 'Hızlı'], ['giriÅŸ', 'giriş'],
  ['DiÄŸer', 'Diğer'], ['SatÄ±ÅŸ', 'Satış'], ['Ã‡Ä±kÄ±ÅŸ', 'Çıkış'],
  ['BugÃ¼nkÃ¼', 'Bugünkü'], ['ÃœrÃ¼n', 'Ürün'], ['adÄ±', 'adı'],
  ['Ã¼rÃ¼n', 'ürün'], ['SatÄ±ÅŸÄ±', 'Satışı'], ['GÃ¼bre', 'Gübre'],
  ['ilaÃ§', 'ilaç'], ['KayÄ±t', 'Kayıt'], ['MÃ¼ÅŸteri', 'Müşteri'],
  ['BorÃ§lu', 'Borçlu'], ['ReÃ§ete', 'Reçete'], ['TarÄ±m', 'Tarım'],
  ['Ã¼rÃ¼nÃ¼', 'ürünü'], ['TanÄ±mlÄ±', 'Tanımlı'], ['gÃ¶re', 'göre'],
  ['ihtiyacÄ±nÄ±', 'ihtiyacını'], ['kayÄ±t', 'kayıt'], ['HenÃ¼z', 'Henüz'],
  ['KayÄ±tlÄ±', 'Kayıtlı'], ['VarsayÄ±lan', 'Varsayılan'], ['sayfanÄ±n', 'sayfanın'],
  ['FarklÄ±', 'Farklı'], ['iÃ§in', 'için'], ['dÃ¼zenleyin', 'düzenleyin'],
  ['tanÄ±mlÄ±', 'tanımlı'], ['deÄŸil', 'değil'], ['klasÃ¶rÃ¼nde', 'klasöründe'],
  ['dosyasÄ±', 'dosyası'], ['oluÅŸturun', 'oluşturun'], ['kopyalayÄ±p', 'kopyalayıp'],
  ['ÅŸu', 'Şu'], ['satÄ±rlarÄ±', 'satırları'], ['gerÃ§ek', 'gerçek'],
  ['baÄŸlantÄ±sÄ±', 'bağlantısı'], ['iÃ§inde', 'içinde'],
  ['â€"', '—'], ['Stok Â· ReÃ§ete', 'Stok · Reçete'],
];

function fixText(t) {
  let out = t;
  for (const [bad, good] of MOJIBAKE) {
    out = out.split(bad).join(good);
  }
  return out;
}

function walk(dir, exts) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, exts);
    else if (exts.some((e) => ent.name.endsWith(e))) {
      let t = fs.readFileSync(p, 'utf8');
      if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
      const fixed = fixText(t);
      if (fixed !== t) {
        fs.writeFileSync(p, fixed, 'utf8');
        console.log('  onarildi:', path.relative(hedef, p));
      }
    }
  }
}

console.log('UTF-8 onarim:', hedef);
walk(path.join(hedef, 'public'), ['.html', '.js', '.css', '.json']);
for (const f of ['db.js', 'server.js']) {
  const p = path.join(hedef, f);
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, 'utf8');
  const fixed = fixText(t);
  if (fixed !== t) {
    fs.writeFileSync(p, fixed, 'utf8');
    console.log('  onarildi:', f);
  }
}
console.log('Tamam.');
