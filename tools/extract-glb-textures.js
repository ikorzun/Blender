// Извлекаем PNG из GLB и определяем их характер:
// палитра/трим-рампа (можно запечь в вершинные цвета) или детальная карта (нельзя).
const fs = require('fs'), path = require('path');
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

function readGLB(file) {
  const buf = fs.readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    if (type === 0x004E4942) bin = data;
    off = off + 8 + len; off = off + ((4 - (off % 4)) % 4);
  }
  return { json, bin };
}

const dir = process.argv[2];
const manifest = [];
for (const f of fs.readdirSync(dir).filter(x => /\.glb$/i.test(x))) {
  const { json: g, bin } = readGLB(path.join(dir, f));
  (g.images || []).forEach((im, i) => {
    if (im.bufferView === undefined) return;
    const bv = g.bufferViews[im.bufferView];
    const data = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    // размеры из IHDR
    const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
    const name = `${path.basename(f, '.glb')}__${im.name || 'img' + i}.png`.replace(/[^\w.\-]/g, '_');
    fs.writeFileSync(path.join(OUT, name), data);
    manifest.push({ glb: f, file: name, w, h, kb: Math.round(bv.byteLength / 1024) });
  });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('извлечено PNG:', manifest.length);
for (const m of manifest) console.log(`  ${m.glb.padEnd(22)} ${m.file.padEnd(46)} ${m.w}×${m.h}  ${m.kb} КБ`);

// дубликаты по содержимому
const crypto = require('crypto');
const byHash = {};
for (const m of manifest) {
  const h = crypto.createHash('md5').update(fs.readFileSync(path.join(OUT, m.file))).digest('hex').slice(0, 8);
  (byHash[h] = byHash[h] || []).push(m.file);
}
const dups = Object.values(byHash).filter(a => a.length > 1);
console.log('\nОДИНАКОВЫЕ текстуры в разных моделях:', dups.length ? '' : 'нет');
dups.forEach(a => console.log('  •', a.join('  ==  ')));
