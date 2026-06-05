/**
 * acrziraat marka / metin — UTF-8 guvenli (PowerShell Set-Content kullanmaz).
 * Kullanim: node scripts/acrziraat-marka-uygula.js [C:\acrziraat]
 */
const fs = require('fs');
const path = require('path');

const hedef = path.resolve(process.argv[2] || 'C:\\acrziraat');

function readText(filePath) {
  let t = fs.readFileSync(filePath, 'utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t;
}

function writeText(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function patchFile(rel, mutator) {
  const p = path.join(hedef, rel);
  if (!fs.existsSync(p)) return;
  let t = readText(p);
  t = mutator(t);
  writeText(p, t);
  console.log('  ', rel);
}

function patchJson(rel, mutator) {
  const p = path.join(hedef, rel);
  if (!fs.existsSync(p)) return;
  const json = JSON.parse(readText(p));
  mutator(json);
  writeText(p, `${JSON.stringify(json, null, 2)}\n`);
  console.log('  ', rel);
}

console.log('ACR Ziraat marka (UTF-8):', hedef);

patchJson('package.json', (pkg) => {
  pkg.name = 'acrziraat-otomasyon';
  pkg.description = 'ACR Ziraat — stok, reçete ve müşteri işleri';
  if (pkg.build) {
    pkg.build.appId = 'com.acrziraat.otomasyon';
    pkg.build.productName = 'ACR Ziraat';
  }
  const fixScript = (s) => {
    if (typeof s !== 'string') return s;
    return s
      .replace(/tarim-otomasyon/g, 'acrziraat-otomasyon')
      .replace(/Tarım Otomasyon/g, 'ACR Ziraat')
      .replace(/TarÄ±m Otomasyon/g, 'ACR Ziraat');
  };
  if (pkg.scripts) {
    for (const k of Object.keys(pkg.scripts)) {
      pkg.scripts[k] = fixScript(pkg.scripts[k]);
    }
  }
});

patchFile('db.js', (t) =>
  t
    .replace(/\[TARIM\]/g, '[ACR-ZIRAAT]')
    .replace(/tanımlı değil/g, 'tanımlı değil')
);

patchFile('lib/env-yukle.js', (t) =>
  t.replace(/Tarım Otomasyon/g, 'ACR Ziraat').replace(/TarÄ±m Otomasyon/g, 'ACR Ziraat')
);

patchFile('lib/backup-paths.js', (t) => t.replace(/TARIM-backups/g, 'ACRZIRAAT-backups'));

patchFile('public/mobil/app.js', (t) =>
  t
    .replace(/tarim_mobil_api/g, 'acrziraat_mobil_api')
    .replace(/tarim_mobil_kullanici/g, 'acrziraat_mobil_kullanici')
);

patchFile('public/index.html', (t) =>
  t
    .replace(/<title>Tarım Otomasyonu<\/title>/g, '<title>ACR Ziraat</title>')
    .replace(/<title>ACR Ziraat<\/title>/g, '<title>ACR Ziraat</title>')
    .replace(/>Tarım Otomasyonu</g, '>ACR Ziraat<')
    .replace(/id="appBaslikGiris">Tarım Otomasyonu</g, 'id="appBaslikGiris">ACR Ziraat')
    .replace(/id="appBaslikNavbar">Tarım Otomasyonu</g, 'id="appBaslikNavbar">ACR Ziraat')
);

patchFile('public/mobil/index.html', (t) =>
  t
    .replace(/<title>Tarım Mobil<\/title>/g, '<title>ACR Ziraat Mobil</title>')
    .replace(/<title>ACR Ziraat Mobil<\/title>/g, '<title>ACR Ziraat Mobil</title>')
    .replace(/<h1 class="login-title">TARIM<\/h1>/g, '<h1 class="login-title">ACR Ziraat</h1>')
    .replace(/placeholder="http:\/\/sunucu:3011"/g, 'placeholder="http://sunucu:3012"')
);

patchFile('public/mobil/manifest.json', (t) => {
  try {
    const m = JSON.parse(t);
    m.name = 'ACR Ziraat Mobil';
    m.short_name = 'ACR Ziraat';
    return `${JSON.stringify(m, null, 2)}\n`;
  } catch {
    return t.replace(/Tarım/g, 'ACR Ziraat');
  }
});

for (const rel of ['lib/temel-schema.js', 'lib/tarim-schema.js', 'tedarikci-schema.js']) {
  patchFile(rel, (t) => t.replace(/\[TARIM\]/g, '[ACR-ZIRAAT]'));
}

writeText(
  path.join(hedef, '.env.example'),
  `PORT=3012
DB_SERVER=localhost
DB_NAME=acrziraat
DB_USER=sa
DB_PASSWORD=your_password_here
DB_ENCRYPT=false
DB_TRUST_CERT=true
UPDATE_MANIFEST_URL=off
OPEN_BROWSER=0

# EDM Bilişim e-Fatura (test) — kullanici/sifre buraya
EDM_WSDL_URL=https://test.edmbilisim.com.tr/EFaturaEDM21ea/EFaturaEDM.svc?singleWsdl
EDM_USERNAME=
EDM_PASSWORD=
EDM_HOSTNAME=ACRZIRAAT
EDM_CHANNEL=ACRZIRAAT
EDM_APPLICATION=ACR Ziraat
EDM_TEST=1
EDM_GB_ALIAS=
EDM_KDV_ORAN=20
EDM_FATURA_SERI=ACR
`
);

console.log('Tamam.');
