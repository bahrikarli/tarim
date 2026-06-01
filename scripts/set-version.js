const fs = require('fs');

const version = String(process.argv[2] || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('HATA: Version formati x.y.z olmali. Ornek: 1.0.11');
  process.exit(1);
}

function readText(path) {
  let t = fs.readFileSync(path, 'utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t;
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function writeJson(path, obj) {
  fs.writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

for (const file of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(file)) continue;

  const json = readJson(file);
  json.version = version;

  if (json.packages && json.packages['']) {
    json.packages[''].version = version;
  }

  writeJson(file, json);
  console.log(`${file} -> ${version}`);
}

const indexPath = 'public/index.html';
if (fs.existsSync(indexPath)) {
  let html = readText(indexPath);
  html = html.replace(
    /(src="(?:js\/utils\.js|js\/navigation\.js|app\.js|mobil\/[^"]+))(?:\?v=[^"]*)?"/g,
    `$1?v=${version}"`
  );
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log(`${indexPath} asset version -> ${version}`);
}
