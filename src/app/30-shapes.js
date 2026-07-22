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
  // ⚠️ ПУЛ — ТОЛЬКО МОДЕЛИ ВЛАДЕЛЬЦА (решение владельца 2026-07-21:
  // «процедурные формы удали совсем»). Куб, шар, тор, конус и прочие
  // примитивы ИЗ ПУЛА УБРАНЫ. Их фабрики в этом файле ОСТАВЛЕНЫ живыми
  // намеренно: на gemGeo висит фолбэк геометрии сюрприза (makeSurprise
  // в 40-items), а gemGeo опирается на mergeGeos — рвать эту цепочку ради
  // косметики не стоит. Вернуть примитив в игру = добавить строку сюда.
  //
  // 30 фруктов-овощей + 24 зверя + 8 машин + 7 кирпичей + 8 пиратов,
  // ЗАМЕС 3:3:1:1:1 (решение владельца 2026-07-22), плюс стейк
  // (35-steak — тоже модель владельца, не примитив; вершинные цвета,
  // без атласа). У каждой пачки СВОЙ атлас (tex:'animal'/'food'/'car'/
  // 'brick'/'pirate'), цвет материала БЕЛЫЙ; `color` красит НЕ модель, а ТРУХУ.
  //
  // ⚠️ ИСКЛЮЧЕНИЕ — КИРПИЧИ (`paint:1`, решение владельца «крась кирпичи»):
  // атлас пачки Brick БЕЛЫЙ (замер по UV: #f9f9fc у 152 моделей из 185), а
  // сверху они всего лишь прямоугольники разной пропорции — различить их
  // белыми нельзя. Поэтому им цвет даёт ПАЛИТРА (candyColor от `color`),
  // как процедурным, и `color` тут красит И модель, И труху. Реализация —
  // ветка t.paint в makeItem (40-items).
  // ⚠️ Из 185 файлов Brick взято 7: остальное — те же формы в 8 вариантах
  // кромки (bevel/none/round/square × hq/lq), сверху неотличимых, плюс
  // дубли длины (1x4/1x6/1x8 — один и тот же брусок). Из 19 Pirate взято 8:
  // КОРАБЛИ НЕ ВЗЯТЫ (пять близнецов сверху, охват 5.0-6.5 против 1.0 и
  // заполненность 0.15-0.18 — convex hull соврал бы грубо), флаги и пальма-
  // флагшток плоские. Камни rocks-* не трогаем — резерв владельца.
  //
  // ⚠️ ПОРЯДОК = ПРОГРЕССИЯ: genLevel берёт ПЕРВЫЕ 9+уровень−1 типов.
  // Впереди самые различимые — матч идёт ПО ТИПУ, путать на старте нельзя.
  // В ХВОСТЕ намеренно: стейк и ПОНЧИК. Пончик уведён туда по решению
  // владельца — его выпуклая оболочка заливает дырку, и в Hard бублик
  // «перекрывает» то, что сквозь неё видно; выбран увод, а не компаунд.
  { name:'foodwatermelon',        color:0xff5a6e, rc:1.0, tex:'food', mat:'soft', geo:foodwatermelonGeo },
  // БАНАН +40% (просьба владельца 2026-07-22). Масштаб задаётся В ГЕОМЕТРИИ,
  // а не через mesh.scale: из неё же берутся полуразмеры half (тест стены по
  // OBB) и convex hull коллайдера, поэтому картинка, физформа и габарит
  // сходятся сами. Парный rc:1.4 держит в согласии ИГРОВУЮ метрику (item.r —
  // зазор пар, доступность, wallR). Менять что-то одно из двух НЕЛЬЗЯ.
  // ⚠️ .clone() ОБЯЗАТЕЛЕН: modelGeo оборачивает МОДУЛЬНЫЕ массивы 36-models
  // без копии (new BufferAttribute(POS,3)), а .scale() мутирует и позиции,
  // и нормали. Без клона мы бы испортили общий буфер типа: сейчас это молчит
  // только потому, что geoCache никогда не чистится и geo() зовётся один раз —
  // стоит очистить кэш на регене, и банан рос бы на 40% КАЖДЫЙ раз.
  { name:'foodbanana',            color:0xffe14d, rc:1.4, tex:'food', mat:'soft', geo:()=>foodbananaGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodorange',            color:0xff9a2b, rc:1.0, tex:'food', mat:'soft', geo:foodorangeGeo },
  { name:'animalbee',             color:0xffd633, rc:1.0, tex:'animal', mat:'soft', geo:animalbeeGeo },
  { name:'animalcrab',            color:0xff5a2b, rc:1.0, tex:'animal', mat:'soft', geo:animalcrabGeo },
  { name:'animalpig',             color:0xff9ec4, rc:1.0, tex:'animal', mat:'soft', geo:animalpigGeo },
  { name:'carpolice',             color:0x3a6ee0, rc:1.0, tex:'car', mat:'soft', geo:carpoliceGeo },
  { name:'brickround', color:0x35b8e0, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickroundGeo },
  { name:'piratebarrel', color:0xea9168, rc:1.0, tex:'pirate', mat:'soft', geo:piratebarrelGeo },
  { name:'foodstrawberry',        color:0xe83a4a, rc:1.0, tex:'food', mat:'soft', geo:foodstrawberryGeo },
  { name:'foodbroccoli',          color:0x4caf50, rc:1.0, tex:'food', mat:'soft', geo:foodbroccoliGeo },
  { name:'foodgrapes',            color:0x9a5ac4, rc:1.0, tex:'food', mat:'soft', geo:foodgrapesGeo },
  { name:'animalpenguin',         color:0x3a4048, rc:1.0, tex:'animal', mat:'soft', geo:animalpenguinGeo },
  { name:'animalcaterpillar',     color:0x5ac44a, rc:1.0, tex:'animal', mat:'soft', geo:animalcaterpillarGeo },
  { name:'animalfish',            color:0xff8c3a, rc:1.0, tex:'animal', mat:'soft', geo:animalfishGeo },
  { name:'cartaxi',               color:0xffc21a, rc:1.0, tex:'car', mat:'soft', geo:cartaxiGeo },
  { name:'brickbar', color:0xe8433a, rc:1.0, wr:0.98, tex:'brick', paint:1, mat:'soft', geo:brickbarGeo },
  { name:'piratepalm', color:0xc87551, rc:1.0, tex:'pirate', mat:'soft', geo:piratepalmGeo },
  { name:'foodcorn',              color:0xffd54a, rc:1.0, tex:'food', mat:'soft', geo:foodcornGeo },
  { name:'foodeggplant',          color:0x7a4a9e, rc:1.0, tex:'food', mat:'soft', geo:foodeggplantGeo },
  { name:'foodlemon',             color:0xffe83a, rc:1.0, tex:'food', mat:'soft', geo:foodlemonGeo },
  { name:'animalelephant',        color:0x9aa6b4, rc:1.0, tex:'animal', mat:'soft', geo:animalelephantGeo },
  { name:'animalpolar',           color:0xe8eef4, rc:1.0, tex:'animal', mat:'soft', geo:animalpolarGeo },
  { name:'animaltiger',           color:0xff8a2b, rc:1.0, tex:'animal', mat:'soft', geo:animaltigerGeo },
  { name:'carfiretruck',          color:0xe03a2e, rc:1.0, tex:'car', mat:'soft', geo:carfiretruckGeo },
  { name:'brickcorner', color:0xb45ac4, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickcornerGeo },
  { name:'piratecannon', color:0x4d515f, rc:1.0, tex:'pirate', mat:'soft', geo:piratecannonGeo },
  { name:'foodtomato',            color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodtomatoGeo },
  { name:'foodcarrot',            color:0xff8c2b, rc:1.0, tex:'food', mat:'soft', geo:foodcarrotGeo },
  { name:'foodpineapple',         color:0xf0c040, rc:1.0, tex:'food', mat:'soft', geo:foodpineappleGeo },
  { name:'animalpanda',           color:0xd8dce2, rc:1.0, tex:'animal', mat:'soft', geo:animalpandaGeo },
  { name:'animalcow',             color:0xe6ddd0, rc:1.0, tex:'animal', mat:'soft', geo:animalcowGeo },
  { name:'animalparrot',          color:0xe2453a, rc:1.0, tex:'animal', mat:'soft', geo:animalparrotGeo },
  { name:'carambulance',          color:0xeef2f6, rc:1.0, tex:'car', mat:'soft', geo:carambulanceGeo },
  { name:'brickstud', color:0xffd633, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickstudGeo },
  { name:'piratechest', color:0xa4abcd, rc:1.0, tex:'pirate', mat:'soft', geo:piratechestGeo },
  { name:'foodcherries',          color:0xd93a4a, rc:1.0, tex:'food', mat:'soft', geo:foodcherriesGeo },
  { name:'foodavocado',           color:0x6b8f3a, rc:1.0, tex:'food', mat:'soft', geo:foodavocadoGeo },
  { name:'foodapple',             color:0xe83a3a, rc:1.0, tex:'food', mat:'soft', geo:foodappleGeo },
  { name:'animalkoala',           color:0x9ba3ad, rc:1.0, tex:'animal', mat:'soft', geo:animalkoalaGeo },
  { name:'animalcat',             color:0x6b7280, rc:1.0, tex:'animal', mat:'soft', geo:animalcatGeo },
  { name:'animalgiraffe',         color:0xe0b23a, rc:1.0, tex:'animal', mat:'soft', geo:animalgiraffeGeo },
  { name:'cargarbagetruck',       color:0x4a9e5c, rc:1.0, tex:'car', mat:'soft', geo:cargarbagetruckGeo },
  { name:'brickclassic', color:0x5ac44a, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickclassicGeo },
  { name:'piratecrate', color:0x3aa378, rc:1.0, tex:'pirate', mat:'soft', geo:piratecrateGeo },
  { name:'foodpear',              color:0xc8d94a, rc:1.0, tex:'food', mat:'soft', geo:foodpearGeo },
  { name:'foodpumpkin',           color:0xff8a2b, rc:1.0, tex:'food', mat:'soft', geo:foodpumpkinGeo },
  { name:'foodpaprika',           color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodpaprikaGeo },
  { name:'animalchick',           color:0xffd84a, rc:1.0, tex:'animal', mat:'soft', geo:animalchickGeo },
  { name:'animalfox',             color:0xf07a34, rc:1.0, tex:'animal', mat:'soft', geo:animalfoxGeo },
  { name:'animallion',            color:0xd9a05b, rc:1.0, tex:'animal', mat:'soft', geo:animallionGeo },
  { name:'carrace',               color:0xff5a2b, rc:1.0, tex:'car', mat:'soft', geo:carraceGeo },
  { name:'bricksquare', color:0xff9a2b, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:bricksquareGeo },
  { name:'pirateball', color:0x505362, rc:1.0, tex:'pirate', mat:'soft', geo:pirateballGeo },
  { name:'foodcabbage',           color:0x8fc46a, rc:1.0, tex:'food', mat:'soft', geo:foodcabbageGeo },
  { name:'foodbeet',              color:0xa03a6b, rc:1.0, tex:'food', mat:'soft', geo:foodbeetGeo },
  { name:'foodcoconut',           color:0xb08a5a, rc:1.0, tex:'food', mat:'soft', geo:foodcoconutGeo },
  { name:'animalmonkey',          color:0xa9713f, rc:1.0, tex:'animal', mat:'soft', geo:animalmonkeyGeo },
  { name:'animaldog',             color:0xc98f5a, rc:1.0, tex:'animal', mat:'soft', geo:animaldogGeo },
  { name:'animalbeaver',          color:0x9c6b42, rc:1.0, tex:'animal', mat:'soft', geo:animalbeaverGeo },
  { name:'cartractor',            color:0x4caf50, rc:1.0, tex:'car', mat:'soft', geo:cartractorGeo },
  { name:'brickduo', color:0x3a6ee0, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickduoGeo },
  { name:'piratetower', color:0xadb5d9, rc:1.0, tex:'pirate', mat:'soft', geo:piratetowerGeo },
  { name:'foodmushroom',          color:0xe8ddc8, rc:1.0, tex:'food', mat:'soft', geo:foodmushroomGeo },
  { name:'foodonion',             color:0xd9c0a8, rc:1.0, tex:'food', mat:'soft', geo:foodonionGeo },
  { name:'foodcauliflower',       color:0xeee6d0, rc:1.0, tex:'food', mat:'soft', geo:foodcauliflowerGeo },
  { name:'animaldeer',            color:0xb07a4a, rc:1.0, tex:'animal', mat:'soft', geo:animaldeerGeo },
  { name:'animalbunny',           color:0xd8b895, rc:1.0, tex:'animal', mat:'soft', geo:animalbunnyGeo },
  { name:'animalhog',             color:0x8d6144, rc:1.0, tex:'animal', mat:'soft', geo:animalhogGeo },
  { name:'carvan',                color:0xe0a04a, rc:1.0, tex:'car', mat:'soft', geo:carvanGeo },
  { name:'piratedoor', color:0xadb5d9, rc:1.0, tex:'pirate', mat:'soft', geo:piratedoorGeo },
  { name:'foodcupcake',           color:0xffa8c8, rc:1.0, tex:'food', mat:'soft', geo:foodcupcakeGeo },
  { name:'foodicecream',          color:0xffd9b8, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamGeo },
  { name:'foodburger',            color:0xc98a4b, rc:1.0, tex:'food', mat:'soft', geo:foodburgerGeo },
  { name:'foodcroissant',         color:0xe0b070, rc:1.0, tex:'food', mat:'soft', geo:foodcroissantGeo },
  { name:'foodcookie',            color:0xc08a50, rc:1.0, tex:'food', mat:'soft', geo:foodcookieGeo },
  { name:'fooddonutsprinkles',    color:0xffb3d1, rc:1.0, tex:'food', mat:'soft', geo:fooddonutsprinklesGeo },
  { name:'steak',  color:0xe23b2e, rc:0.85, wr:0.53, mat:'model', geo: steakGeo }, // модель владельца (35-steak); wr — плоский, для теста стены
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
