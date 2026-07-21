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
// Простые новые формы (спека владельца 2026-07-20): все ВЫПУКЛЫЕ — физика
// и сэмплы доступности работают через convex hull без ручных компаундов
function eggGeo(){
  const g = new THREE.SphereGeometry(0.72, 16, 12);
  g.scale(1, 1.32, 1); // яйцо: вытянутая сфера
  return g;
}
function gemGeo(){ // кристалл: две 8-гранные пирамиды основаниями друг к другу
  const up = new THREE.ConeGeometry(0.7, 0.8, 8);
  const down = new THREE.ConeGeometry(0.7, 0.8, 8);
  const mUp = new THREE.Matrix4().makeTranslation(0, 0.4, 0);
  const mDown = new THREE.Matrix4().makeRotationX(Math.PI).setPosition(0, -0.4, 0);
  return mergeGeos([[up, mUp], [down, mDown]]);
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
// teapotGeo УДАЛЁН 2026-07-20 (спека владельца: «убери модель чайника»);
// сюрприз-археология вернётся с реальной моделью из 3D-ассетов

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
  // --- модели из «3d assets»: 24 зверя (36-models) ---
  // Раскраска РОДНАЯ — общий атлас Textures/colormap.png встроен в модуль,
  // материал берёт его как map (tex:1), цвет материала при этом БЕЛЫЙ.
  // `color` здесь красит НЕ модель, а ТРУХУ при распаде — подобран под зверя.
  // ⚠️ ПОРЯДОК = ЧИТАЕМОСТЬ. genLevel берёт первые 9+уровень−1 типов, значит
  // первая девятка это то, что игрок видит на старте. Впереди стоят самые
  // РАЗЛИЧИМЫЕ (пчела, краб, свинья, пингвин, гусеница, рыба, слон, белый
  // медведь, тигр); бурые лохматики — бобёр, олень, заяц, кабан, обезьяна —
  // уведены в хвост: с родной раскраской они похожи друг на друга, а матч
  // идёт ПО ТИПУ, и путать их на старте нельзя.
  // --- модели владельца из «3d assets» (36-models) ---
  // 24 зверя + 24 блюда, ПЕРЕМЕШАНЫ через одного (спека владельца
  // 2026-07-21: «перемешай животных и еду в миксер»). Чередование не
  // косметика: genLevel берёт первые 9+уровень−1 типов, и без него на
  // старте были бы одни звери, а еда всплыла бы только к 25-му уровню.
  // Раскраска РОДНАЯ: у каждой пачки СВОЙ атлас (tex:'animal'/'food'),
  // цвет материала белый. Поле `color` красит НЕ модель, а ТРУХУ
  // при распаде — подобрано под каждый предмет.
  // Внутри пачек порядок задан РАЗЛИЧИМОСТЬЮ: впереди контрастные
  // (пчела, пицца, краб, банан), похожие бурые звери — в хвосте.
  // --- модели владельца из «3d assets» (36-models) ---
  // 24 зверя + 24 блюда + 18 машин, ПЕРЕМЕШАНЫ по кругу зверь/еда/машина
  // (спека владельца 2026-07-21). Чередование не косметика: genLevel берёт
  // первые 9+уровень−1 типов, и без него на старте была бы одна пачка,
  // а остальные всплыли бы только к 25-му и 49-му уровню.
  // У КАЖДОЙ ПАЧКИ СВОЙ АТЛАС (tex:'animal'/'food'/'car'), цвет материала
  // белый. Поле `color` красит НЕ модель, а ТРУХУ при распаде.
  // Внутри пачек порядок задан РАЗЛИЧИМОСТЬЮ: впереди контрастные.
  { name:'animalbee',             color:0xffd633, rc:1.0, tex:'animal', mat:'soft', geo:animalbeeGeo },
  { name:'foodpizza',             color:0xe8a33d, rc:1.0, tex:'food', mat:'soft', geo:foodpizzaGeo },
  { name:'carpolice',             color:0x3a6ee0, rc:1.0, tex:'car', mat:'soft', geo:carpoliceGeo },
  { name:'animalcrab',            color:0xff5a2b, rc:1.0, tex:'animal', mat:'soft', geo:animalcrabGeo },
  { name:'foodbanana',            color:0xffe14d, rc:1.0, tex:'food', mat:'soft', geo:foodbananaGeo },
  { name:'cartaxi',               color:0xffc21a, rc:1.0, tex:'car', mat:'soft', geo:cartaxiGeo },
  { name:'animalpig',             color:0xff9ec4, rc:1.0, tex:'animal', mat:'soft', geo:animalpigGeo },
  { name:'foodwatermelon',        color:0xff5a6e, rc:1.0, tex:'food', mat:'soft', geo:foodwatermelonGeo },
  { name:'carfiretruck',          color:0xe03a2e, rc:1.0, tex:'car', mat:'soft', geo:carfiretruckGeo },
  { name:'animalpenguin',         color:0x3a4048, rc:1.0, tex:'animal', mat:'soft', geo:animalpenguinGeo },
  { name:'fooddonutsprinkles',    color:0xffb3d1, rc:1.0, tex:'food', mat:'soft', geo:fooddonutsprinklesGeo },
  { name:'carambulance',          color:0xeef2f6, rc:1.0, tex:'car', mat:'soft', geo:carambulanceGeo },
  { name:'animalcaterpillar',     color:0x5ac44a, rc:1.0, tex:'animal', mat:'soft', geo:animalcaterpillarGeo },
  { name:'foodburger',            color:0xc98a4b, rc:1.0, tex:'food', mat:'soft', geo:foodburgerGeo },
  { name:'cargarbagetruck',       color:0x4a9e5c, rc:1.0, tex:'car', mat:'soft', geo:cargarbagetruckGeo },
  { name:'animalfish',            color:0xff8c3a, rc:1.0, tex:'animal', mat:'soft', geo:animalfishGeo },
  { name:'foodbroccoli',          color:0x4caf50, rc:1.0, tex:'food', mat:'soft', geo:foodbroccoliGeo },
  { name:'carrace',               color:0xff5a2b, rc:1.0, tex:'car', mat:'soft', geo:carraceGeo },
  { name:'animalelephant',        color:0x9aa6b4, rc:1.0, tex:'animal', mat:'soft', geo:animalelephantGeo },
  { name:'foodcherries',          color:0xd93a4a, rc:1.0, tex:'food', mat:'soft', geo:foodcherriesGeo },
  { name:'carsedan',              color:0x5a9ad9, rc:1.0, tex:'car', mat:'soft', geo:carsedanGeo },
  { name:'animalpolar',           color:0xe8eef4, rc:1.0, tex:'animal', mat:'soft', geo:animalpolarGeo },
  { name:'foodcorn',              color:0xffd54a, rc:1.0, tex:'food', mat:'soft', geo:foodcornGeo },
  { name:'carsuv',                color:0x8a8f96, rc:1.0, tex:'car', mat:'soft', geo:carsuvGeo },
  { name:'animaltiger',           color:0xff8a2b, rc:1.0, tex:'animal', mat:'soft', geo:animaltigerGeo },
  { name:'foodcupcake',           color:0xffa8c8, rc:1.0, tex:'food', mat:'soft', geo:foodcupcakeGeo },
  { name:'cartractor',            color:0x4caf50, rc:1.0, tex:'car', mat:'soft', geo:cartractorGeo },
  { name:'animalpanda',           color:0xd8dce2, rc:1.0, tex:'animal', mat:'soft', geo:animalpandaGeo },
  { name:'foodicecream',          color:0xffd9b8, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamGeo },
  { name:'cartruck',              color:0xd9d9d9, rc:1.0, tex:'car', mat:'soft', geo:cartruckGeo },
  { name:'animalcow',             color:0xe6ddd0, rc:1.0, tex:'animal', mat:'soft', geo:animalcowGeo },
  { name:'foodtaco',              color:0xf0b040, rc:1.0, tex:'food', mat:'soft', geo:foodtacoGeo },
  { name:'carvan',                color:0xe0a04a, rc:1.0, tex:'car', mat:'soft', geo:carvanGeo },
  { name:'animalparrot',          color:0xe2453a, rc:1.0, tex:'animal', mat:'soft', geo:animalparrotGeo },
  { name:'foodstrawberry',        color:0xe83a4a, rc:1.0, tex:'food', mat:'soft', geo:foodstrawberryGeo },
  { name:'carracefuture',         color:0x9a5ae0, rc:1.0, tex:'car', mat:'soft', geo:carracefutureGeo },
  { name:'animalkoala',           color:0x9ba3ad, rc:1.0, tex:'animal', mat:'soft', geo:animalkoalaGeo },
  { name:'foodorange',            color:0xff9a2b, rc:1.0, tex:'food', mat:'soft', geo:foodorangeGeo },
  { name:'carhatchbacksports',    color:0xe0405c, rc:1.0, tex:'car', mat:'soft', geo:carhatchbacksportsGeo },
  { name:'animalcat',             color:0x6b7280, rc:1.0, tex:'animal', mat:'soft', geo:animalcatGeo },
  { name:'foodcarrot',            color:0xff8c2b, rc:1.0, tex:'food', mat:'soft', geo:foodcarrotGeo },
  { name:'carsedansports',        color:0x2fa8a0, rc:1.0, tex:'car', mat:'soft', geo:carsedansportsGeo },
  { name:'animalgiraffe',         color:0xe0b23a, rc:1.0, tex:'animal', mat:'soft', geo:animalgiraffeGeo },
  { name:'foodcheese',            color:0xffd24a, rc:1.0, tex:'food', mat:'soft', geo:foodcheeseGeo },
  { name:'carsuvluxury',          color:0x6b7280, rc:1.0, tex:'car', mat:'soft', geo:carsuvluxuryGeo },
  { name:'animalchick',           color:0xffd84a, rc:1.0, tex:'animal', mat:'soft', geo:animalchickGeo },
  { name:'foodfries',             color:0xffc94a, rc:1.0, tex:'food', mat:'soft', geo:foodfriesGeo },
  { name:'cartractorshovel',      color:0xffb02b, rc:1.0, tex:'car', mat:'soft', geo:cartractorshovelGeo },
  { name:'animalfox',             color:0xf07a34, rc:1.0, tex:'animal', mat:'soft', geo:animalfoxGeo },
  { name:'foodhotdog',            color:0xe07a4a, rc:1.0, tex:'food', mat:'soft', geo:foodhotdogGeo },
  { name:'cardelivery',           color:0xf0e0c0, rc:1.0, tex:'car', mat:'soft', geo:cardeliveryGeo },
  { name:'animallion',            color:0xd9a05b, rc:1.0, tex:'animal', mat:'soft', geo:animallionGeo },
  { name:'foodcroissant',         color:0xe0b070, rc:1.0, tex:'food', mat:'soft', geo:foodcroissantGeo },
  { name:'carkartoobi',           color:0xff7ac4, rc:1.0, tex:'car', mat:'soft', geo:carkartoobiGeo },
  { name:'animalmonkey',          color:0xa9713f, rc:1.0, tex:'animal', mat:'soft', geo:animalmonkeyGeo },
  { name:'foodcookie',            color:0xc08a50, rc:1.0, tex:'food', mat:'soft', geo:foodcookieGeo },
  { name:'animaldog',             color:0xc98f5a, rc:1.0, tex:'animal', mat:'soft', geo:animaldogGeo },
  { name:'foodgrapes',            color:0x9a5ac4, rc:1.0, tex:'food', mat:'soft', geo:foodgrapesGeo },
  { name:'animalbeaver',          color:0x9c6b42, rc:1.0, tex:'animal', mat:'soft', geo:animalbeaverGeo },
  { name:'foodmushroom',          color:0xe8ddc8, rc:1.0, tex:'food', mat:'soft', geo:foodmushroomGeo },
  { name:'animaldeer',            color:0xb07a4a, rc:1.0, tex:'animal', mat:'soft', geo:animaldeerGeo },
  { name:'foodpineapple',         color:0xf0c040, rc:1.0, tex:'food', mat:'soft', geo:foodpineappleGeo },
  { name:'animalbunny',           color:0xd8b895, rc:1.0, tex:'animal', mat:'soft', geo:animalbunnyGeo },
  { name:'foodtomato',            color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodtomatoGeo },
  { name:'animalhog',             color:0x8d6144, rc:1.0, tex:'animal', mat:'soft', geo:animalhogGeo },
  { name:'foodapple',             color:0xe83a3a, rc:1.0, tex:'food', mat:'soft', geo:foodappleGeo },
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
  // простые формы 2026-07-20 (появляются на поздних уровнях по рампе типов)
  { name:'egg',    color:0xe05ce0, rc:0.85, mat:'soft',    geo:eggGeo },
  { name:'prism',  color:0x35c9a3, rc:0.78, mat:'soft',    geo:()=>new THREE.CylinderGeometry(0.75,0.75,1.4,3) },
  { name:'nut',    color:0xb8c0cc, rc:0.80, wr:0.7, mat:'chrome', geo:()=>new THREE.CylinderGeometry(0.85,0.85,0.55,6) },
  { name:'gem',    color:0x8f66ff, rc:0.75, mat:'soft',    geo:gemGeo },
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
