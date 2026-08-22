#!/usr/bin/env python3
"""GLB -> data module src/app/36-models.js (single-file build, no loaders).

Run:
    python3 tools/glb2module.py <output.js> <directory>:<prefix> [<directory>:<prefix> ...]

Example (three packs, each with ITS OWN palette atlas):
    python3 tools/glb2module.py src/app/36-models.js \
        "3d assets/Animals/.lowpoly:animal" \
        "3d assets/Food/.lowpoly:food" \
        "3d assets/Car/.lowpoly:car"

The directories are the OUTPUT of tools/blender-decimate.py, not the source folder: heavy
models must be simplified BEFORE this step, here the shape is untouchable.

What is put into the module:
- positions, THE ORIGINAL NORMALS and UVs, the index buffer AS IT IS IN THE FILE. Normals and
  indices are not recomputed: they encode where a seam is hard and where it is smooth.
  Recomputing through computeVertexNormals gave FLAT faceting, and any model
  looked like a crude lump regardless of the polygon count;
- the palette atlas of EACH pack as a data URI (the MODEL_ATLASES registry). It is looked for
  in <directory>/Textures/colormap.png and one level up — the Blender pass
  copies only .glb and does not drag the Textures folder along with it;
- the geometry is centred and normalised to the RC bounding radius; function names are
  prefixed with the pack (otherwise animal-fish and plain fish would collide).

Prints ready-made lines for TYPES in 30-shapes.js — the colour is filled in by hand
(for models with a texture the color field paints NOT the model, but the debris when it breaks apart).
"""
import json, math, os, re, struct, sys

# counter of fixed-up normals: a NaN in the data module brings down the WHOLE IIFE, therefore
# the failure must be loud, and not a silent substitution
BAD_NRM = [0]

# Target bounding radius. Larger than that of the primitives (0.70-0.95), DELIBERATELY:
# the models are thin and elongated, at an equal bounding radius their volume is half that of a ball —
# at 0.78 the bowl filled up only to topY 3.4 against the norm of 7.5-9.0.
RC = 1.00
# The polygon-count limit — only FOR A WARNING in the report. Bringing models
# to it is the job of tools/blender-decimate.py BEFORE this step; here the shape
# is untouchable.
TARGET_TRIS = 1500
# The exclusion list. EMPTY: the concrete mixer no longer needs to be excluded — it
# tore apart only because of the voxel remesh, and that one was enabled only because
# the simplification target was set too low (1200). At TARGET=15000 the remesh is not
# needed at all, and the collapse goes through cleanly.
EXCLUDE = set()

CT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
CT_FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as f:
        buf = f.read()
    assert buf[:4] == b'glTF', f'{path}: not a GLB'
    off, js, bin_ = 12, None, None
    while off < len(buf):
        ln, ty = struct.unpack_from('<II', buf, off)
        chunk = buf[off + 8: off + 8 + ln]
        if ty == 0x4E4F534A:
            js = json.loads(chunk)
        elif ty == 0x004E4942:
            bin_ = chunk
        off += 8 + ln
        off += (4 - off % 4) % 4
    return js, bin_


def accessor(g, bin_, idx):
    a = g['accessors'][idx]
    bv = g['bufferViews'][a['bufferView']]
    nc, csz = NCOMP[a['type']], CT_SIZE[a['componentType']]
    fmt = CT_FMT[a['componentType']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or nc * csz
    if stride == nc * csz:  # tight packing — we read it in one go
        vals = struct.unpack_from('<' + fmt * (nc * a['count']), bin_, base)
        return [vals[i * nc:(i + 1) * nc] for i in range(a['count'])]
    return [struct.unpack_from('<' + fmt * nc, bin_, base + i * stride)
            for i in range(a['count'])]


def node_matrix(n):
    if 'matrix' in n:
        return list(n['matrix'])
    t = n.get('translation', [0, 0, 0])
    q = n.get('rotation', [0, 0, 0, 1])
    s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
            (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
            (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
            t[0], t[1], t[2], 1]


def mat_mul(a, b):
    o = [0.0] * 16
    for r in range(4):
        for c in range(4):
            o[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
    return o


def xform_dir(m, v):
    """Rotation of a normal by the node matrix. Correct for rotation and UNIFORM
    scale; for a non-uniform one an inverse-transposed matrix is needed — our
    assets have none of those, if one appears it will show up as «drifted» lighting."""
    x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2]
    y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2]
    z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
    ln = (x * x + y * y + z * z) ** 0.5 or 1.0
    o = (x / ln, y / ln, z / ln)
    # ⚠️⚠️ A DEGENERATE NORMAL FROM THE SOURCE. `or 1.0` catches ZERO, but not NaN:
    # NaN is truthy, dividing by it gives NaN, and it drives off into the module as the string
    # «nan» — and that is not a JS number, the whole IIFE falls with «nan is not defined».
    # Exactly like that the updated fire truck arrived on 2026-08-19: nine NaNs in
    # the normals, the build would not come up at all. We substitute «up» and WE COUNT it.
    if not all(map(math.isfinite, o)):
        BAD_NRM[0] += 1
        return (0.0, 1.0, 0.0)
    return o


def xform(m, p):
    return (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14])


def convert(path):
    g, bin_ = read_glb(path)
    if not g.get('meshes') or not g.get('nodes'):
        raise ValueError('the file has no geometry (an empty export from Blender?)')
    # ⚠️ WE KEEP THE ORIGINAL INDICES AND NORMALS. Earlier the geometry was taken apart
    # into unconnected triangles, and the normals were recomputed — the result was
    # FLAT faceting, because of which any model looked like a crude lump
    # regardless of the number of triangles («the topology is a total disaster»).
    # The index buffer from the file already encodes where a seam is hard and where it is smooth:
    # on hard edges the vertices have been duplicated by the model's author. We take it as is.
    verts, norms, uvs, idx, smooth = [], [], [], [], [True]

    def walk(ni, parent):
        n = g['nodes'][ni]
        m = mat_mul(parent, node_matrix(n))
        if 'mesh' in n:
            for p in g['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4:
                    continue  # triangles only
                pos = accessor(g, bin_, p['attributes']['POSITION'])
                base = len(verts)
                for v in pos:
                    verts.append(xform(m, v))
                if 'NORMAL' in p['attributes']:
                    for nv in accessor(g, bin_, p['attributes']['NORMAL']):
                        norms.append(xform_dir(m, nv))
                else:
                    smooth[0] = False
                    norms.extend([(0.0, 1.0, 0.0)] * len(pos))
                if 'TEXCOORD_0' in p['attributes']:
                    for uv in accessor(g, bin_, p['attributes']['TEXCOORD_0']):
                        uvs.append((uv[0], uv[1]))
                else:
                    uvs.extend([(0.0, 0.0)] * len(pos))
                if 'indices' in p:
                    idx.extend(i[0] + base for i in accessor(g, bin_, p['indices']))
                else:
                    idx.extend(range(base, base + len(pos)))
        for c in n.get('children', []):
            walk(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for ni in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(ni, ident)
    assert idx, f'{path}: no triangles found'
    ntri = len(idx) // 3
    over = ntri > TARGET_TRIS

    lo = [min(v[i] for v in verts) for i in range(3)]
    hi = [max(v[i] for v in verts) for i in range(3)]
    cen = [(lo[i] + hi[i]) / 2 for i in range(3)]
    rad = max(sum((v[i] - cen[i]) ** 2 for i in range(3)) ** 0.5 for v in verts)
    k = RC / rad

    flat_pos = []
    for v in verts:
        flat_pos += [(v[i] - cen[i]) * k for i in range(3)]
    flat_nrm = []
    for v in norms:
        flat_nrm += [v[0], v[1], v[2]]
    flat_uv = []
    for v in uvs:
        flat_uv += [v[0], v[1]]
    has_uv = any(u != 0.0 or v != 0.0 for u, v in uvs)
    half = [(hi[i] - lo[i]) / 2 * k for i in range(3)]
    return flat_pos, flat_nrm, flat_uv, has_uv, idx, ntri, half, smooth[0], over


def nrm3(x):
    # UV of the palette atlas: stripes about 1/16 wide, three digits with a margin
    # ⚠️ THE LAST LINE OF DEFENCE AGAINST NaN/inf: in the module they become a bare `nan`,
    # that is, an unknown identifier, and they bring down the whole IIFE.
    if not math.isfinite(x): return '0'
    s = f'{x:.4f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def nrm2(x):
    if not math.isfinite(x): return '0'
    s = f'{x:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def num(x):
    s = f'{x:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


ATLAS_JS = """// Registry of palette atlases: EACH pack of models (animals, food, cars) has
// ITS OWN colormap. While there was only one pack, the atlas was one too — with the second one all
// the models would take someone else's palette.
const MODEL_ATLASES = {};
const _atlasTex = {};
function modelColormap(pack){
  if (_atlasTex[pack]) return _atlasTex[pack];
  // ⚠️ A 1×1 WHITE STUB until the PNG is decoded. Without it the texture has no
  // image at all for the first frames, sampling gives zeros, and the shader MULTIPLIES by it — the models
  // flash BLACK at the start of a level. A white stub is neutral: the multiplier is
  // 1.0, the object is simply visible for a second without colouring. The sky got the same stub
  // in 10-stage — the reason is the same.
  const stub = document.createElement('canvas');
  stub.width = stub.height = 1;
  const sg = stub.getContext('2d');
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, 1, 1);
  const img = new Image();
  const t = new THREE.Texture(stub);
  t.flipY = false;                 // glTF counts UV from the TOP left corner
  t.encoding = THREE.sRGBEncoding;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;       // the atlas stripes are narrow, mips would blend them
  // we swap the source only WHEN the image is ready — both images are
  // image-like, the loading path in three is one and the same
  img.onload = () => { t.image = img; t.needsUpdate = true; };
  img.src = MODEL_ATLASES[pack];
  _atlasTex[pack] = t;
  return t;
}
function modelGeo(pos, nrm, uv, idx){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // normals FROM THE FILE: smoothing where the model's author intended it
  if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  else g.computeVertexNormals();
  return g;
}"""


def find_colormap(src_dir, explicit):
    """The shared palette atlas of the set. We look next to the models and one level up:
    the Blender pass copies only .glb, it does not drag the Textures folder along."""
    cands = [explicit] if explicit else []
    # ⚠️ THE THIRD CANDIDATE — NEXT TO THE MODELS, WITHOUT Textures/. That is how the owner's
    # export is laid out, «3d assets/InGame/<Pack>/colormap.png» (2026-08-19): the atlas lies
    # right in the pack's folder. Without this line the generator silently writes a module WITHOUT
    # an atlas, and the whole pack comes out white — the failure is silent, there is no error.
    cands += [os.path.join(src_dir, 'colormap.png'),
              os.path.join(src_dir, 'Textures', 'colormap.png'),
              os.path.join(os.path.dirname(src_dir.rstrip('/')), 'Textures', 'colormap.png')]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def main(out_path, packs):
    """packs — a list of (directory, prefix). Each pack has ITS OWN atlas."""
    parts = ["""// ===== 36-models: the owner's models from «3d assets» =====
// Generated by tools/glb2module.py — DO NOT EDIT BY HAND.
// Geometry + UV + THE ORIGINAL NORMALS; the colour is given by the pack's palette atlas.
// The index buffer is preserved from the file: it encodes where a seam is hard and where it is
// smooth, therefore the model is shaded exactly as its author intended."""]
    parts.append(ATLAS_JS)
    report, skipped = [], []
    for src_dir, prefix in packs:
        cm = find_colormap(src_dir, None)
        if cm:
            import base64
            b64 = base64.b64encode(open(cm, 'rb').read()).decode('ascii')
            parts.append(f"MODEL_ATLASES['{prefix}'] = 'data:image/png;base64,{b64}';")
        else:
            skipped.append((src_dir, 'ATLAS NOT FOUND'))
        files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith('.glb'))
        for f in files:
            raw = re.sub(r'^[0-9]+', '', re.sub(r'[^a-z0-9]', '', os.path.splitext(f)[0].lower()))
            # the pack name in the prefix: animals and food have identical stems
            # (animal-fish and fish), without the prefix the functions would overwrite each other
            name = raw if raw.startswith(prefix) else prefix + raw
            try:
                badBefore = BAD_NRM[0]
                fpos, fnrm, fuv, has_uv, idx, ntri, half, smooth, over = convert(os.path.join(src_dir, f))
                if BAD_NRM[0] > badBefore:
                    print(f'  ⚠️ {name}: degenerate normals fixed up — '
                          f'{BAD_NRM[0] - badBefore} (NaN in the source)', file=sys.stderr)
            except Exception as e:
                skipped.append((f, str(e)))
                continue
            base = 'M_' + name.upper()
            it = 'Uint32Array' if len(fpos) // 3 > 65535 else 'Uint16Array'
            parts.append(f'// {f} — {ntri} tris, {len(fpos)//3} verts.' + (' ⚠ above the limit' if over else ''))
            parts.append(f'const {base}_POS = new Float32Array([{",".join(num(v) for v in fpos)}]);')
            parts.append(f'const {base}_NRM = {"new Float32Array([" + ",".join(nrm2(v) for v in fnrm) + "])" if smooth else "null"};')
            parts.append(f'const {base}_UV = {"new Float32Array([" + ",".join(nrm3(v) for v in fuv) + "])" if has_uv else "null"};')
            parts.append(f'const {base}_IDX = new {it}([{",".join(str(i) for i in idx)}]);')
            parts.append(f'function {name}Geo(){{ return modelGeo({base}_POS, {base}_NRM, {base}_UV, {base}_IDX); }}')
            report.append((name, prefix, ntri, max(half[0], half[2]), half, over))
    open(out_path, 'w').write('\n'.join(parts) + '\n')

    kb = os.path.getsize(out_path) / 1024
    print(f'{out_path}: {kb:.0f} KB, models {len(report)}\n')
    for f, why in skipped:
        print(f'⚠ NOT TAKEN  {f}: {why}')
    if skipped:
        print()
    print(f'{"name":<22}{"pack":>8}{"tris":>7}{"wr":>7}   line for TYPES')
    for name, prefix, ntri, wr, half, over in report:
        flat = f", wr:{wr:.2f}" if min(half) / max(half) < 0.35 else ''
        print(f'{name:<22}{prefix:>8}{ntri:>7}{wr:>7.2f}{"  ⚠" if over else "   "}'
              f"{{ name:'{name}', color:0x??????, rc:{RC}{flat}, tex:'{prefix}', mat:'soft', geo:{name}Geo }},")


if __name__ == '__main__':
    # tools/glb2module.py <output.js> <directory>:<prefix> [<directory>:<prefix> ...]
    out = sys.argv[1]
    packs = [tuple(a.rsplit(':', 1)) for a in sys.argv[2:]]
    main(out, packs)
