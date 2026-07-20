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
# Потолок полигонажа. Ориентир для боя — 400 тр. (стейк 144, на экране до 181
# предмета); здесь порог заведомо мягкий, он ловит только декорации вроде
# RetroComputerBooth (29721 тр., 23 МБ). Пропуски ПЕЧАТАЮТСЯ, не молчком.
MAX_TRIS = 3000

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
    out = []
    for i in range(a['count']):
        o = base + i * stride
        out.append(struct.unpack_from('<' + fmt * nc, bin_, o))
    return out


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


def xform(m, p):
    return (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14])


def convert(path):
    g, bin_ = read_glb(path)
    tris = []

    def walk(ni, parent):
        n = g['nodes'][ni]
        m = mat_mul(parent, node_matrix(n))
        if 'mesh' in n:
            for p in g['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4:
                    continue  # только треугольники
                pos = [xform(m, v) for v in accessor(g, bin_, p['attributes']['POSITION'])]
                idx = [i[0] for i in accessor(g, bin_, p['indices'])] if 'indices' in p \
                    else list(range(len(pos)))
                for t in range(0, len(idx), 3):
                    tris.append((pos[idx[t]], pos[idx[t + 1]], pos[idx[t + 2]]))
        for c in n.get('children', []):
            walk(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for ni in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(ni, ident)
    assert tris, f'{path}: треугольников не найдено'

    vs = [v for tri in tris for v in tri]
    lo = [min(v[i] for v in vs) for i in range(3)]
    hi = [max(v[i] for v in vs) for i in range(3)]
    cen = [(lo[i] + hi[i]) / 2 for i in range(3)]
    rad = max(sum((v[i] - cen[i]) ** 2 for i in range(3)) ** 0.5 for v in vs)
    k = RC / rad

    flat = []
    for v in vs:
        flat += [(v[i] - cen[i]) * k for i in range(3)]
    half = [(hi[i] - lo[i]) / 2 * k for i in range(3)]
    return flat, len(tris), half


def num(x):
    s = f'{x:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def main(src_dir, out_path):
    files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith('.glb'))
    assert files, f'GLB в {src_dir} не найдены'
    parts = ["""// ===== 36-models: модели владельца из «3d assets» =====
// Сгенерировано tools/glb2module.py — РУКАМИ НЕ ПРАВИТЬ.
// ТЕКСТУРЫ И UV ОТБРОШЕНЫ (просьба владельца 2026-07-20: «убери все текстуры,
// хочу глянуть») — остаётся геометрия, цвет берётся из палитры TYPES.
// Примитивы слиты в один НЕиндексированный массив: flat-шейдинг получается
// сам из computeVertexNormals, как у стейка (35-steak).
function modelGeo(pos){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}"""]
    report, skipped = [], []
    for f in files:
        # имя -> валидный JS-идентификатор: «048_Frogaxon_Art» -> frogaxonart
        # (ведущие цифры сделали бы `function 048...Geo()` синтаксической ошибкой)
        name = re.sub(r'^[0-9]+', '', re.sub(r'[^a-z0-9]', '', os.path.splitext(f)[0].lower()))
        flat, ntri, half = convert(os.path.join(src_dir, f))
        if ntri > MAX_TRIS:
            skipped.append((f, ntri))
            continue
        const = 'M_' + name.upper() + '_POS'
        parts.append(f'// {f} — {ntri} тр.')
        parts.append(f'const {const} = new Float32Array([{",".join(num(v) for v in flat)}]);')
        parts.append(f'function {name}Geo(){{ return modelGeo({const}); }}')
        wr = max(half[0], half[2])
        report.append((name, f, ntri, wr, half))
    open(out_path, 'w').write('\n'.join(parts) + '\n')

    kb = os.path.getsize(out_path) / 1024
    print(f'{out_path}: {kb:.0f} КБ, моделей {len(report)}\n')
    for f, n in skipped:
        print(f'⚠ ПРОПУЩЕНА {f}: {n} тр. > потолка {MAX_TRIS} — это декорация, не предмет в кучу')
    if skipped:
        print()
    print(f'{"имя":<12}{"тр.":>6}{"wr":>7}   полугабариты (x,y,z)   строка для TYPES')
    for name, f, ntri, wr, half in report:
        hs = ' '.join(f'{h:.2f}' for h in half)
        flat_flag = f", wr:{wr:.2f}" if min(half) / max(half) < 0.35 else ''
        print(f'{name:<12}{ntri:>6}{wr:>7.2f}   {hs}   '
              f"{{ name:'{name}', color:0x??????, rc:{RC}{flat_flag}, mat:'soft', geo:{name}Geo }},")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
