/**
 * package.json patch sürümünü +1 yapar.
 * Kullanım:
 *   node scripts/bump-version.js           -> yeni sürümü yazar (stdout)
 *   node scripts/bump-version.js --apply   -> package.json + cache bust uygular
 *   node scripts/bump-version.js --apply --part=minor
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const apply = process.argv.includes('--apply');
const part = (process.argv.find((a) => a.startsWith('--part=')) || '--part=patch').split('=')[1];

const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('HATA: package.json yok:', pkgPath);
  process.exit(1);
}

let pkgRaw = fs.readFileSync(pkgPath, 'utf8');
if (pkgRaw.charCodeAt(0) === 0xfeff) pkgRaw = pkgRaw.slice(1);
const pkg = JSON.parse(pkgRaw);
const cur = String(pkg.version || '1.0.0').trim();
const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error('HATA: Gecersiz surum:', cur);
  process.exit(1);
}

let major = Number(m[1]);
let minor = Number(m[2]);
let patch = Number(m[3]);

if (part === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (part === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const next = `${major}.${minor}.${patch}`;

if (apply) {
  const setVer = path.join(__dirname, 'set-version.js');
  execFileSync(process.execPath, [setVer, next], { cwd: root, stdio: 'inherit' });
}

process.stdout.write(`${next}\n`);
