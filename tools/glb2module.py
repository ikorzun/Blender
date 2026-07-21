#!/usr/bin/env python3
"""GLB -> data-модуль src/app/36-models.js (однофайловая сборка, лоадеров нет).

ТЕКСТУРЫ И UV ОТБРАСЫВАЮТСЯ намеренно (просьба владельца 2026-07-20):
берём только геометрию, цвет приходит из палитры TYPES как у примитивов.

Что делает: сливает все примитивы модели в один НЕиндексированный массив
позиций (flat-шейдинг через computeVertexNormals, как у стейка), применяет
трансформы нод, центрирует по bbox и нормирует охват под rc.

Запуск:  python3 tools/glb2module.py "3d assets" src/app/36-models.js
"""
import json, os, re, struct, sys

# Целевой охватный радиус. Больше, чем у примитивов (0.70-0.95), НАМЕРЕННО:
# модели тонкие и вытянутые, при равном охвате их объём вдвое меньше шара —
# на 0.78 чаша заполнялась лишь до topY 3.4 при норме 7.5-9.0.
RC = 1.00
# Планка полигонажа — только ДЛЯ ПРЕДУПРЕЖДЕНИЯ в отчёте. Приводить модели
# к ней должен tools/blender-decimate.py ДО этого шага; здесь форма
# неприкосновенна.
TARGET_TRIS = 1500
# Список исключений. ПУСТ: бетономешалку исключать больше не нужно — она
# рвалась только из-за воксельного ремеша, а он включался лишь потому, что
# цель упрощения стояла слишком низко (1200). При TARGET=15000 ремеш не
# нужен вовсе, и схлопывание проходит чисто.
EXCLUDE = set()

CT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
CT_FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as f:
        buf = f.read()
    assert buf[:4] == b'glTF', f'{path}: не GLB'
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
    if stride == nc * csz:  # плотная упаковка — читаем одним махом
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
    """Поворот нормали матрицей ноды. Корректно для поворота и РАВНОМЕРНОГО
    масштаба; для неравномерного нужна обратно-транспонированная — у наших
    ассетов такого нет, при появлении будет заметно по «съехавшему» свету."""
    x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2]
    y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2]
    z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
    ln = (x * x + y * y + z * z) ** 0.5 or 1.0
    return (x / ln, y / ln, z / ln)


def xform(m, p):
    return (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14])


def convert(path):
    g, bin_ = read_glb(path)
    if not g.get('meshes') or not g.get('nodes'):
        raise ValueError('в файле нет геометрии (пустой экспорт из Blender?)')
    # ⚠️ СОХРАНЯЕМ ИСХОДНЫЕ ИНДЕКСЫ И НОРМАЛИ. Раньше геометрия разбиралась
    # на несвязанные треугольники, а нормали пересчитывались — получалось
    # ПЛОСКОЕ гранение, из-за которого любая модель выглядела грубым комком
    # независимо от числа треугольников («с топологией полная беда»).
    # Индексный буфер из файла уже кодирует, где шов жёсткий, а где гладкий:
    # на жёстких рёбрах вершины продублированы автором модели. Берём как есть.
    verts, norms, uvs, idx, smooth = [], [], [], [], [True]

    def walk(ni, parent):
        n = g['nodes'][ni]
        m = mat_mul(parent, node_matrix(n))
        if 'mesh' in n:
            for p in g['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4:
                    continue  # только треугольники
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
    assert idx, f'{path}: треугольников не найдено'
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
    # UV палитрового атласа: полосы шириной ~1/16, три знака с запасом
    s = f'{x:.4f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def nrm2(x):
    s = f'{x:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def num(x):
    s = f'{x:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def find_colormap(src_dir, explicit):
    """Общий палитровый атлас набора. Ищем рядом с моделями и на уровень выше:
    Blender-проход копирует только .glb, папку Textures не тащит."""
    cands = [explicit] if explicit else []
    cands += [os.path.join(src_dir, 'Textures', 'colormap.png'),
              os.path.join(os.path.dirname(src_dir.rstrip('/')), 'Textures', 'colormap.png')]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def main(src_dir, out_path, tex_path=None):
    files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith('.glb'))
    assert files, f'GLB в {src_dir} не найдены'
    parts = ["""// ===== 36-models: модели владельца из «3d assets» =====
// Сгенерировано tools/glb2module.py — РУКАМИ НЕ ПРАВИТЬ.
// ТЕКСТУРЫ И UV ОТБРОШЕНЫ (просьба владельца 2026-07-20: «убери все текстуры,
// хочу глянуть») — остаётся геометрия, цвет берётся из палитры TYPES.
// Примитивы слиты в один НЕиндексированный массив: flat-шейдинг получается
// сам из computeVertexNormals, как у стейка (35-steak).
function modelGeo(pos, nrm, uv, idx){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // нормали ИЗ ФАЙЛА: сглаживание там, где его задумал автор модели.
  // computeVertexNormals по не-индексированной геометрии давал плоское
  // гранение и превращал любую модель в комок.
  if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  else g.computeVertexNormals();
  return g;
}"""]
    cm = find_colormap(src_dir, tex_path)
    if cm:
        import base64
        b64 = base64.b64encode(open(cm, 'rb').read()).decode('ascii')
        parts.append('// Палитровый атлас набора — ОДИН на все модели, встроен как data-URI.')
        parts.append('// ⚠️ flipY=false: glTF считает UV от ВЕРХНЕГО левого угла, three по')
        parts.append('// умолчанию от нижнего — без этого каждая модель берёт не свою полосу.')
        parts.append('// ⚠️ Мипы ВЫКЛЮЧЕНЫ: полосы атласа узкие (~1/16 ширины), на дальних')
        parts.append('// уровнях мипов соседние цвета смешивались бы в грязь.')
        parts.append(f"const MODELS_COLORMAP_SRC = 'data:image/png;base64,{b64}';")
        parts.append('''let _colormapTex = null;
function modelColormap(){
  if (_colormapTex) return _colormapTex;
  const img = new Image();
  const t = new THREE.Texture(img);
  t.flipY = false;
  t.encoding = THREE.sRGBEncoding;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  img.onload = () => { t.needsUpdate = true; };
  img.src = MODELS_COLORMAP_SRC;
  _colormapTex = t;
  return t;
}''')
    report, skipped = [], []
    for f in sorted(os.listdir(src_dir)):
        if f.lower().endswith(('.fbx', '.obj', '.dae', '.blend')):
            skipped.append((f, 'формат не поддержан — нужен .glb (экспорт из Blender)'))
    for f in files:
        # имя -> валидный JS-идентификатор: «048_Frogaxon_Art» -> frogaxonart
        # (ведущие цифры сделали бы `function 048...Geo()` синтаксической ошибкой)
        name = re.sub(r'^[0-9]+', '', re.sub(r'[^a-z0-9]', '', os.path.splitext(f)[0].lower()))
        try:
            fpos, fnrm, fuv, has_uv, idx, ntri, half, smooth, over = convert(os.path.join(src_dir, f))
        except Exception as e:
            skipped.append((f, str(e)))
            continue
        if name in EXCLUDE:
            skipped.append((f, 'в списке исключений — не переживает упрощение'))
            continue
        base = 'M_' + name.upper()
        it = 'Uint32Array' if len(fpos) // 3 > 65535 else 'Uint16Array'
        tag = f'{ntri} тр., {len(fpos)//3} верш.' + (' ⚠ выше планки' if over else '')
        parts.append(f'// {f} — {tag}')
        parts.append(f'const {base}_POS = new Float32Array([{",".join(num(v) for v in fpos)}]);')
        # нормали — единичные векторы, двух знаков хватает (ошибка < 1 градуса)
        parts.append(f'const {base}_NRM = {"new Float32Array([" + ",".join(nrm2(v) for v in fnrm) + "])" if smooth else "null"};')
        parts.append(f'const {base}_UV = {"new Float32Array([" + ",".join(nrm3(v) for v in fuv) + "])" if has_uv else "null"};')
        parts.append(f'const {base}_IDX = new {it}([{",".join(str(i) for i in idx)}]);')
        parts.append(f'function {name}Geo(){{ return modelGeo({base}_POS, {base}_NRM, {base}_UV, {base}_IDX); }}')
        wr = max(half[0], half[2])
        report.append((name, f, ntri, wr, half, len(fpos) // 3, over))
    open(out_path, 'w').write('\n'.join(parts) + '\n')

    kb = os.path.getsize(out_path) / 1024
    print(f'{out_path}: {kb:.0f} КБ, моделей {len(report)}'
          + (f', атлас {os.path.basename(cm)} встроен' if cm else ', АТЛАС НЕ НАЙДЕН') + '\n')
    for f, why in skipped:
        print(f'⚠ НЕ ВЗЯТА  {f}: {why}')
    if skipped:
        print()
    print(f'{"имя":<18}{"тр.":>7}{"верш.":>7}{"wr":>7}   строка для TYPES')
    for name, f, ntri, wr, half, nvert, over in report:
        flat_flag = f", wr:{wr:.2f}" if min(half) / max(half) < 0.35 else ''
        print(f'{name:<18}{ntri:>7}{nvert:>7}{wr:>7.2f}{"  ⚠" if over else "   "}'
              f"{{ name:'{name}', color:0x??????, rc:{RC}{flat_flag}, mat:'soft', geo:{name}Geo }},")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
