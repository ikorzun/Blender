// ===== 30-shapes: геометрии типов, палитра, материалы предметов =====
// Референсы владельца: webgl_geometries, webgl_geometry_shapes,
// webgl_geometry_teapot (формы); webgl_batch_lod_bvh (пастельные цвета
// в линейном HSL); webgl_loader_ldraw (финиш LEGO-пластика).

function spiralGeo(){
  const curve = new THREE.Curve();
  curve.getPoint = function(t){
    const turns = 2.2, a = 0.46, h = 1.5;
    const th = t*Math.PI*2*turns;
    return new THREE.Vector3(Math.cos(th)*a, (t-0.5)*h, Math.sin(th)*a);
  };
  return new THREE.TubeGeometry(curve, 64, 0.17, 8, false);
}
function starGeo(){
  const shape = new THREE.Shape();
  for (let i=0;i<10;i++){
    const rad = (i%2 === 0) ? 0.95 : 0.42;
    const a = i/10*Math.PI*2 - Math.PI/2;
    const x = Math.cos(a)*rad, y = Math.sin(a)*rad;
    if (i === 0) shape.moveTo(x,y); else shape.lineTo(x,y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth:0.38, bevelEnabled:true, bevelThickness:0.08, bevelSize:0.08, bevelSegments:2, curveSegments:6 });
  g.center();
  return g;
}
function heartGeo(){ // контур из webgl_geometry_shapes
  const s = new THREE.Shape();
  s.moveTo(0.25, 0.25);
  s.bezierCurveTo(0.25, 0.25, 0.20, 0, 0, 0);
  s.bezierCurveTo(-0.30, 0, -0.30, 0.35, -0.30, 0.35);
  s.bezierCurveTo(-0.30, 0.55, -0.15, 0.77, 0.25, 0.95);
  s.bezierCurveTo(0.60, 0.77, 0.80, 0.55, 0.80, 0.35);
  s.bezierCurveTo(0.80, 0.35, 0.80, 0, 0.50, 0);
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth:0.35, bevelEnabled:true, bevelThickness:0.07, bevelSize:0.07, bevelSegments:2, curveSegments:8 });
  g.center();
  g.rotateZ(Math.PI); // остриём вниз
  g.scale(1.35, 1.35, 1.35);
  return g;
}
function mergeGeos(parts){ // [geometry, Matrix4] -> одна не-индексированная геометрия
  const pos = [], norm = [];
  for (const [g, m] of parts){
    const ng = g.toNonIndexed();
    ng.applyMatrix4(m);
    pos.push.apply(pos, ng.attributes.position.array);
    norm.push.apply(norm, ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  return out;
}
function teapotGeo(){ // стилизованный чайник из примитивов (вместо тяжёлого TeapotGeometry)
  const parts = [];
  const M = (g, t, r, sc) => {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(t[0],t[1],t[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0],r[1],r[2])),
      new THREE.Vector3(sc[0],sc[1],sc[2]));
    parts.push([g, m]);
  };
  M(new THREE.SphereGeometry(0.62, 20, 14),          [0, 0, 0],       [0,0,0],   [1, 0.8, 1]);   // тело
  M(new THREE.CylinderGeometry(0.5, 0.56, 0.12, 20), [0, -0.46, 0],   [0,0,0],   [1, 1, 1]);     // дно
  M(new THREE.CylinderGeometry(0.2, 0.32, 0.16, 14), [0, 0.5, 0],     [0,0,0],   [1, 1, 1]);     // крышка
  M(new THREE.SphereGeometry(0.11, 10, 8),           [0, 0.63, 0],    [0,0,0],   [1, 1, 1]);     // пимпочка
  M(new THREE.ConeGeometry(0.15, 0.66, 10),          [0.72, 0.18, 0], [0,0,-2.1],[1, 1, 1]);     // носик
  M(new THREE.TorusGeometry(0.3, 0.075, 8, 16),      [-0.7, 0.05, 0], [0,0,0],   [1, 1, 1]);     // ручка
  return mergeGeos(parts);
}

// rc — эффективный радиус НЕмасштабированной геометрии (между инрадиусом и
// охватывающей сферой): коллайдер = rc * s * MESH_SCALE, чтобы предметы
// визуально касались пола и друг друга, а не висели на невидимых сферах.
// Палитра — дружелюбная пастель (тёмно-зелёный и коричневый исключены);
// mat: soft (полированный цветной лак), chrome (зеркальный хром) —
// эталон webgl_materials_envmaps_fasthdr (сферы №5 и №3).
// ⚠️ ПОРЯДОК ЗНАЧИМ: genLevel берёт ПЕРВЫЕ typesCount типов (9 на 1-м уровне,
// +1 за уровень до 15). Модели владельца поставлены В НАЧАЛО намеренно —
// иначе на первых уровнях их не увидеть (просьба 2026-07-20 «хочу глянуть»).
// Вернуть примитивы вперёд = просто переставить блоки местами.
// Тип 'teapot' убран по просьбе владельца; функция teapotGeo ОСТАВЛЕНА —
// на ней держится золотой сюрприз со дна (makeSurprise).
const TYPES = [
  // --- модели из «3d assets» (36-models, текстуры сняты) ---
  // цвет — плоский из палитры; тона разнесены по кругу через 36°
  // rc=1.0 (больше примитивов) НАМЕРЕННО: модели тонкие, при охвате 0.78
  // чаша набиралась только до topY 3.4 при норме 7.5-9.0. Значения rc/wr
  // печатает tools/glb2module.py — держать синхронными с RC в конвертере.
  // Тона раскиданы по кругу с шагом 168° (а не подряд): соседи по списку
  // расходятся и по тону, и по светлоте (LIGHT_OFFSETS ниже).
  // --- модели из «3d assets» (36-models, текстуры сняты) ---
  // 24 зверя, 422-951 тр. каждый — упрощать не потребовалось ни одного.
  // rc=1.0: у моделей охват ~0.9-1.1, приводим к общему.
  // Тона раскиданы по кругу с шагом 105° (взаимно простым с 24), чтобы
  // соседи по списку расходились и по тону, и по светлоте (LIGHT_OFFSETS).
  // ⚠️ Зверей 24, а genLevel берёт первые typesCount = 9 + уровень − 1.
  // Значит примитивы ниже начнут появляться только с 17-го уровня —
  // фактически игра стала «звериной». Порядок блоков менять здесь.
  { name:'animalbeaver',        color:0xe23636, rc:1.0, mat:'soft', geo:animalbeaverGeo },
  { name:'animalbee',           color:0x61e236, rc:1.0, mat:'soft', geo:animalbeeGeo },
  { name:'animalbunny',         color:0x368ce2, rc:1.0, mat:'soft', geo:animalbunnyGeo },
  { name:'animalcat',           color:0xe236b7, rc:1.0, mat:'soft', geo:animalcatGeo },
  { name:'animalcaterpillar',   color:0xe2e236, rc:1.0, mat:'soft', geo:animalcaterpillarGeo },
  { name:'animalchick',         color:0x36e2b7, rc:1.0, mat:'soft', geo:animalchickGeo },
  { name:'animalcow',           color:0x8c36e2, rc:1.0, mat:'soft', geo:animalcowGeo },
  { name:'animalcrab',          color:0xe26136, rc:1.0, mat:'soft', geo:animalcrabGeo },
  { name:'animaldeer',          color:0x36e236, rc:1.0, mat:'soft', geo:animaldeerGeo },
  { name:'animaldog',           color:0x3661e2, rc:1.0, mat:'soft', geo:animaldogGeo },
  { name:'animalelephant',      color:0xe2368c, rc:1.0, mat:'soft', geo:animalelephantGeo },
  { name:'animalfish',          color:0xb7e236, rc:1.0, mat:'soft', geo:animalfishGeo },
  { name:'animalfox',           color:0x36e2e2, rc:1.0, mat:'soft', geo:animalfoxGeo },
  { name:'animalgiraffe',       color:0xb736e2, rc:1.0, mat:'soft', geo:animalgiraffeGeo },
  { name:'animalhog',           color:0xe28c36, rc:1.0, mat:'soft', geo:animalhogGeo },
  { name:'animalkoala',         color:0x36e261, rc:1.0, mat:'soft', geo:animalkoalaGeo },
  { name:'animallion',          color:0x3636e2, rc:1.0, mat:'soft', geo:animallionGeo },
  { name:'animalmonkey',        color:0xe23661, rc:1.0, mat:'soft', geo:animalmonkeyGeo },
  { name:'animalpanda',         color:0x8ce236, rc:1.0, mat:'soft', geo:animalpandaGeo },
  { name:'animalparrot',        color:0x36b7e2, rc:1.0, mat:'soft', geo:animalparrotGeo },
  { name:'animalpenguin',       color:0xe236e2, rc:1.0, mat:'soft', geo:animalpenguinGeo },
  { name:'animalpig',           color:0xe2b736, rc:1.0, mat:'soft', geo:animalpigGeo },
  { name:'animalpolar',         color:0x36e28c, rc:1.0, mat:'soft', geo:animalpolarGeo },
  { name:'animaltiger',         color:0x6136e2, rc:1.0, mat:'soft', geo:animaltigerGeo },
  // --- примитивы ---
  { name:'cube',   color:0xf2f4f8, rc:0.85, mat:'chrome',  geo:()=>new THREE.BoxGeometry(1.5,1.5,1.5) },
  { name:'ball',   color:0x7aa2ff, rc:0.95, mat:'soft',    geo:()=>new THREE.SphereGeometry(0.95,18,14) },
  { name:'cone',   color:0xffe066, rc:0.75, mat:'soft',    geo:()=>new THREE.ConeGeometry(0.85,1.7,16) },
  { name:'torus',  color:0x7ee0a0, rc:0.70, mat:'soft',    geo:()=>new THREE.TorusGeometry(0.68,0.32,10,20) },
  { name:'cyl',    color:0xffb27a, rc:0.75, mat:'soft',    geo:()=>new THREE.CylinderGeometry(0.7,0.7,1.6,16) },
  { name:'steak',  color:0xe23b2e, rc:0.85, wr:0.53, mat:'model', geo: steakGeo }, // модель владельца (35-steak); wr — плоский, для теста стены
  { name:'octa',   color:0xb388ff, rc:0.80, mat:'soft',    geo:()=>new THREE.OctahedronGeometry(1.05) },
  { name:'dode',   color:0x7adcf0, rc:0.85, mat:'soft',    geo:()=>new THREE.DodecahedronGeometry(1.0) },
  { name:'tetra',  color:0xff9ac2, rc:0.70, mat:'soft',    geo:()=>new THREE.TetrahedronGeometry(1.25) },
  { name:'knot',   color:0xff8a8a, rc:0.72, mat:'soft',    geo:()=>new THREE.TorusKnotGeometry(0.58,0.2,64,8) },
  { name:'spiral', color:0xa8e07a, rc:0.70, mat:'soft',    geo:spiralGeo },
  { name:'star',   color:0xffd27a, rc:0.78, mat:'soft',    geo:starGeo },
  { name:'heart',  color:0xff8fa8, rc:0.72, mat:'soft',    geo:heartGeo },
  { name:'pill',   color:0x8fd8ff, rc:0.70, mat:'soft',    geo:()=>new THREE.CapsuleGeometry(0.5,0.7,6,12) },
];

// Сочная карамель: HSL нормализуется в sRGB (s=0.75) и конвертится в linear.
// История: линейная пастель L=0.5 (как в batch_lod_bvh) была «слишком
// ванильной» по оценке владельца — не возвращать.
//
// РАЗНЕСЁННАЯ СВЕТЛОТА (спека владельца 2026-07-20): раньше светлота была
// зафиксирована на 0.55 у ВСЕХ типов, и различал их только тон. На 15 типах
// круг ещё делился, на 24 (после моделей) — исчерпался: куча читалась
// неоновой рябью, а в оттенках серого (и у дальтоников, ~8% мужчин) типы
// сливались вовсе, хотя матч ПО ТИПУ — ядро механики.
//
// ⚠️ ИСТОРИЯ ДВУХ ПОДХОДОВ (первый забракован владельцем — не возвращать):
// СНАЧАЛА целились в АБСОЛЮТНУЮ яркость (relative luminance) — каждому типу
// своя ступень, бисекция гнала светлоту, пока тон в неё не попадёт. Разделение
// вышло, цвет — нет: у тонов разная природная яркость, и жёлтый/лайм, которым
// досталась низкая ступень, уезжали в болото, а синий/фиолетовый на высокой
// разбеливались в пастель. Куча стала пыльно-розовой с оливковым. Карамель,
// принятая владельцем третьей итерацией, была убита.
// ТЕПЕРЬ сдвиг ОТНОСИТЕЛЬНЫЙ: тон остаётся у своей природной светлоты 0.55 и
// лишь смещается на ±0.20. Соседи расходятся по значению — этого хватает,
// чтобы куча не сливалась, — но ни один тон не выдавливается за края, где
// HSL-насыщенность перестаёт давать цветность.
function candyColor(hex, dl){
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, 0.75, Math.max(0.30, Math.min(0.78, 0.55 + (dl || 0))));
  return c.convertSRGBToLinear();
}
// Сдвиги раскладываются ПО ПОРЯДКУ типов, поэтому соседи по списку заведомо
// расходятся по светлоте. Тона у моделей тоже раскиданы по кругу с шагом 168°,
// так что совпасть и по тону, и по светлоте соседи не могут.
const LIGHT_OFFSETS = [0.00, -0.15, 0.12, -0.08, 0.18, -0.20];
TYPES.forEach((t, i) => { if (t.mat === 'soft') t.dl = LIGHT_OFFSETS[i % LIGHT_OFFSETS.length]; });
const MESH_SCALE = 0.62;
