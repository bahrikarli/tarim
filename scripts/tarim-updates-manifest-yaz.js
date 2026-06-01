const fs = require('fs');
const path = require('path');

const hedefDir = process.argv[2];
const ver = process.argv[3] || require(path.join(__dirname, '..', 'package.json')).version;
if (!hedefDir) {
  console.error('Kullanim: node tarim-updates-manifest-yaz.js <hedefKlasor> [surum]');
  process.exit(1);
}

const manifest = {
  app: 'tarim-otomasyon',
  version: ver,
  repo: 'bahrikarli/tarim-updates',
  tag: `v${ver}`,
  assetName: `tarim-otomasyon-${ver}.zip`,
  notes: `Tarım güncelleme manifest v${ver}`,
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
fs.writeFileSync(path.join(hedefDir, 'guncelleme.json'), json, 'utf8');
fs.writeFileSync(path.join(hedefDir, `guncelleme-${ver}.json`), json, 'utf8');
console.log('OK:', path.join(hedefDir, 'guncelleme.json'), 'v' + ver);
