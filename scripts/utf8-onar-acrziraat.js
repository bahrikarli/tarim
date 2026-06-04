/**
 * ACR Ziraat — bozuk UTF-8 arayüz dosyalarını tarim kaynağından onarır.
 * Kullanım: node scripts/utf8-onar-acrziraat.js [hedef] [kaynak]
 */
const fs = require('fs');
const path = require('path');

const hedef = path.resolve(process.argv[2] || 'C:\\acrziraat');
const kaynak = path.resolve(process.argv[3] || 'C:\\tarim');

const BOZUK = /MÃ¼|HÄ±|Ã–|â‚º|ReÃ§|TanÄ±|giriÅŸ/;

/** Senkron sonrası her zaman tarim'den alınmalı (XO ile eski bozuk kalmasın). */
const ZORUNLU_KOPYA = [
  'public/index.html',
];

function readUtf8(filePath) {
  let t = fs.readFileSync(filePath, 'utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t;
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function kopyala(rel) {
  const src = path.join(kaynak, rel);
  const dst = path.join(hedef, rel);
  if (!fs.existsSync(src)) {
    console.warn('  atlandi (kaynak yok):', rel);
    return false;
  }
  writeUtf8(dst, readUtf8(src));
  console.log('  kopyalandi:', rel);
  return true;
}

console.log('UTF-8 onar:', hedef);
console.log('Kaynak:', kaynak);

if (!fs.existsSync(kaynak)) {
  console.error('Kaynak klasor yok:', kaynak);
  process.exit(1);
}
if (!fs.existsSync(hedef)) {
  console.error('Hedef klasor yok:', hedef);
  process.exit(1);
}

for (const rel of ZORUNLU_KOPYA) {
  kopyala(rel);
}

const indexPath = path.join(hedef, 'public/index.html');
if (fs.existsSync(indexPath)) {
  const t = readUtf8(indexPath);
  if (BOZUK.test(t)) {
    console.error('HATA: index.html hala bozuk — kaynak tarim public/index.html kontrol edin.');
    process.exit(2);
  }
  console.log('index.html Turkce OK');
}

console.log('Tamam. Sonra acrziraat-marka-uygula veya SENKRON ile marka uygulanabilir.');
console.log('Sunucuyu yeniden baslatin; tarayicida Ctrl+F5.');
