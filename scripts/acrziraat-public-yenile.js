/**
 * public klasorunu tarim'den UTF-8 olarak kopyalar, sonra marka uygular.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const tarimRoot = path.join(__dirname, '..');
const hedef = path.resolve(process.argv[2] || 'C:\\acrziraat');
const kaynak = path.join(tarimRoot, 'public');
const hedefPublic = path.join(hedef, 'public');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name);
    const d = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(kaynak)) {
  console.error('Kaynak yok:', kaynak);
  process.exit(1);
}

console.log('public kopyalaniyor:', kaynak, '->', hedefPublic);
if (fs.existsSync(hedefPublic)) fs.rmSync(hedefPublic, { recursive: true, force: true });
copyDir(kaynak, hedefPublic);

execFileSync(process.execPath, [path.join(__dirname, 'acrziraat-marka-uygula.js'), hedef], {
  stdio: 'inherit',
  cwd: tarimRoot,
});

console.log('public yenilendi (UTF-8).');
