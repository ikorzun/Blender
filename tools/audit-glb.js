// GLB audit for the «Mixer» pipeline: geometry, materials, construction.
// We parse the container directly — no runtime loaders, exactly as the project requires.
const fs = require('fs');
const path = require('path');

const CT = { 5120:['BYTE',1], 5121:['UBYTE',1], 5122:['SHORT',2], 5123:['USHORT',2], 5125:['UINT',4], 5126:['FLOAT',4] };
const NC = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };

function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    if (type === 0x004E4942) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off = off + ((4 - (off % 4)) % 4);
  }
  return { json, bin, bytes: buf.length };
}

function accessorData(g, bin, idx) {
  const a = g.accessors[idx];
  const bv = g.bufferViews[a.bufferView];
  const [ctName, csz] = CT[a.componentType];
  const nc = NC[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || nc * csz;
  const out = new Float64Array(a.count * nc);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < nc; c++) {
      const o = base + i * stride + c * csz;
      let v;
      switch (a.componentType) {
        case 5126: v = bin.readFloatLE(o); break;
        case 5125: v = bin.readUInt32LE(o); break;
        case 5123: v = bin.readUInt16LE(o); break;
        case 5121: v = bin.readUInt8(o); break;
        case 5122: v = bin.readInt16LE(o); break;
        default: v = bin.readInt8(o);
      }
      out[i * nc + c] = v;
    }
  }
  return { data: out, count: a.count, nc, ctName };
}

// --- matrices ---
const mul = (a, b) => { const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o; };
const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0,0,0], r = n.rotation || [0,0,0,1], s = n.scale || [1,1,1];
  const [x,y,z,w] = r, x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
  return [
    (1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
    (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
    (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0,
    t[0], t[1], t[2], 1];
}
const xf = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]];

function audit(file) {
  const name = path.basename(file);
  const { json: g, bin, bytes } = readGLB(file);
  const R = { name, bytes, tris: 0, verts: 0, prims: 0, attrs: new Set(), mats: [], imgs: [],
              anims: (g.animations||[]).length, skins: (g.skins||[]).length,
              ext: (g.extensionsUsed||[]), meshNodes: 0, volume: 0,
              min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] };

  // scene graph walk with transform accumulation
  const walk = (ni, parent) => {
    const n = g.nodes[ni];
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      R.meshNodes++;
      for (const p of g.meshes[n.mesh].primitives) {
        R.prims++;
        Object.keys(p.attributes).forEach(a => R.attrs.add(a));
        const pos = accessorData(g, bin, p.attributes.POSITION);
        R.verts += pos.count;
        let idx = null;
        if (p.indices !== undefined) { idx = accessorData(g, bin, p.indices).data; R.tris += idx.length / 3; }
        else R.tris += pos.count / 3;
        if (p.material !== undefined && !R.mats.includes(p.material)) R.mats.push(p.material);
        // world-space bbox + volume (divergence theorem)
        const P = [];
        for (let i = 0; i < pos.count; i++) {
          const w = xf(m, [pos.data[i*3], pos.data[i*3+1], pos.data[i*3+2]]);
          P.push(w);
          for (let c = 0; c < 3; c++) { if (w[c] < R.min[c]) R.min[c] = w[c]; if (w[c] > R.max[c]) R.max[c] = w[c]; }
        }
        const tri = idx ? idx.length / 3 : pos.count / 3;
        for (let t = 0; t < tri; t++) {
          const a = P[idx ? idx[t*3] : t*3], b = P[idx ? idx[t*3+1] : t*3+1], c = P[idx ? idx[t*3+2] : t*3+2];
          R.volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
        }
      }
    }
    (n.children || []).forEach(c => walk(c, m));
  };
  const scene = g.scenes[g.scene || 0];
  scene.nodes.forEach(n => walk(n, ident()));

  R.materials = R.mats.map(i => {
    const m = g.materials[i] || {};
    const pbr = m.pbrMetallicRoughness || {};
    return { name: m.name || ('#' + i),
      baseColor: pbr.baseColorFactor ? pbr.baseColorFactor.map(v => +v.toFixed(3)) : null,
      baseColorTex: pbr.baseColorTexture !== undefined,
      metal: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1,
      rough: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1,
      mrTex: pbr.metallicRoughnessTexture !== undefined,
      normalTex: m.normalTexture !== undefined, emissiveTex: m.emissiveTexture !== undefined,
      emissive: m.emissiveFactor || null, alphaMode: m.alphaMode || 'OPAQUE', doubleSided: !!m.doubleSided };
  });
  R.imgs = (g.images || []).map((im, i) => {
    const bv = im.bufferView !== undefined ? g.bufferViews[im.bufferView] : null;
    return { i, mime: im.mimeType || (im.uri ? 'uri' : '?'), kb: bv ? Math.round(bv.byteLength / 1024) : 0 };
  });
  return R;
}

// ---------- report ----------
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /\.glb$/i.test(f)).sort();
const TARGET_TRIS = 400;   // target: steak 144 tris, up to 181 items on screen
const TARGET_KB = 150;     // budget of the «new hall» from the roadmap

console.log('\n================ 3D ASSET AUDIT FOR THE «MIXER» PIPELINE ================\n');
const all = [];
for (const f of files) {
  let R; try { R = audit(path.join(dir, f)); } catch (e) { console.log(f, 'ERROR:', e.message); continue; }
  all.push(R);
  const dim = [0,1,2].map(c => R.max[c] - R.min[c]);
  const bboxVol = dim[0] * dim[1] * dim[2];
  const fill = bboxVol > 0 ? Math.abs(R.volume) / bboxVol : 0;
  const centre = [0,1,2].map(c => (R.max[c] + R.min[c]) / 2);
  const rc = Math.max(...[0,1,2].map(c => Math.max(Math.abs(R.max[c] - centre[c]), Math.abs(R.min[c] - centre[c]))));
  const flat = Math.min(...dim) / Math.max(...dim);
  const texKb = R.imgs.reduce((s, i) => s + i.kb, 0);

  console.log('─'.repeat(74));
  console.log(R.name.toUpperCase(), ` ${Math.round(R.bytes/1024)} KB`);
  console.log('  triangles     :', Math.round(R.tris), R.tris > TARGET_TRIS ? `  ⚠ target ${TARGET_TRIS}` : '  ✓');
  console.log('  vertices      :', R.verts, ' primitives:', R.prims, ' mesh nodes:', R.meshNodes,
              R.meshNodes > 1 ? '  ⚠ several nodes — a merge will be needed' : '');
  console.log('  attributes    :', [...R.attrs].join(', '),
              R.attrs.has('COLOR_0') ? '  ✓ vertex colours present' : '  ⚠ NO vertex colours');
  console.log('  dimensions    :', dim.map(d => d.toFixed(2)).join(' × '),
              ` extent rc=${rc.toFixed(2)}  flatness=${flat.toFixed(2)}`, flat < 0.35 ? ' ⚠ flat → wr needed' : '');
  console.log('  centre offset :', centre.map(c => c.toFixed(2)).join(', '),
              Math.hypot(...centre) > 0.01 * rc ? ' ⚠ not at zero' : ' ✓');
  console.log('  fill ratio    :', fill.toFixed(2), fill < 0.25 ? ' ⚠ heavily concave → the convex hull will lie' : ' ✓ hull will do');
  console.log('  materials     :', R.materials.length);
  for (const m of R.materials) {
    const tex = [m.baseColorTex && 'baseColor', m.mrTex && 'metalRough', m.normalTex && 'normal', m.emissiveTex && 'emissive'].filter(Boolean);
    console.log(`    · ${m.name}: color=${m.baseColor ? m.baseColor.slice(0,3).join('/') : '—'}`,
                `metal=${m.metal} rough=${m.rough}`, tex.length ? `TEXTURES: ${tex.join('+')}` : 'no textures',
                m.alphaMode !== 'OPAQUE' ? `alpha=${m.alphaMode}` : '', m.doubleSided ? 'doubleSided' : '');
  }
  console.log('  images        :', R.imgs.length ? R.imgs.map(i => `${i.mime.replace('image/','')} ${i.kb}KB`).join(', ') + `  = ${texKb} KB` : 'none  ✓');
  if (R.anims || R.skins) console.log('  ⚠ animations:', R.anims, ' skins:', R.skins, '— not supported by the pipeline');
  if (R.ext.length) console.log('  extensions    :', R.ext.join(', '),
      R.ext.some(e => /draco|meshopt|basisu/i.test(e)) ? ' ⚠ compression → a decoder is needed, single-file delivery is at risk' : '');
}

console.log('─'.repeat(74));
console.log('\nSUMMARY (up to 181 items in the game at once):');
const totTris = all.reduce((s, r) => s + r.tris, 0) / all.length;
console.log('  average polycount   :', Math.round(totTris), 'tris → with 181 items ≈', Math.round(totTris * 181 / 1000), 'k triangles');
console.log('  current steak       : 144 tris → 26k with 181 items');
console.log('  total file weight   :', Math.round(all.reduce((s, r) => s + r.bytes, 0) / 1024), 'KB (hall budget ~' + TARGET_KB + ' KB per model)');
