// ===== 30-shapes: геометрии типов, палитра, материалы предметов =====
// Референсы владельца: webgl_geometries, webgl_geometry_shapes,
// webgl_geometry_teapot (формы); webgl_batch_lod_bvh (пастельные цвета
// в линейном HSL); webgl_loader_ldraw (финиш LEGO-пластика).

// Простые новые формы (спека владельца 2026-07-20): все ВЫПУКЛЫЕ — физика
// и сэмплы доступности работают через convex hull без ручных компаундов
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
// ⚠️ ПОРЯДОК ЗНАЧИМ: прогрессия ОТКРЫВАЕТ первые typesCount типов (9 на 1-м
// уровне, +1 за уровень). ⚠️ С 2026-07-30 genLevel берёт из открытого диапазона
// СЛУЧАЙНУЮ выборку нужного размера, а НЕ первые подряд — до этого всё, что
// стояло дальше индекса PAIRS-1 (89), не спавнилось никогда (см. genLevel).
// Порядок по-прежнему решает, КОГДА тип открывается,
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
  { name:'foodbanana',            color:0xffe14d, rc:1.4, tex:'food', mat:'soft', geo:()=>foodbananaGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodorange',            color:0xff9a2b, rc:1.0, tex:'food', mat:'soft', geo:foodorangeGeo },
  { name:'animalbee',             color:0xffd633, rc:1.0, tex:'animal', mat:'soft', geo:animalbeeGeo },
  { name:'animalcrab',            color:0xff5a2b, rc:1.0, tex:'animal', mat:'soft', geo:animalcrabGeo },
  { name:'animalpig',             color:0xff9ec4, rc:1.0, tex:'animal', mat:'soft', geo:animalpigGeo },
  { name:'carpolice',             color:0x3a6ee0, rc:1.4, tex:'car', mat:'soft', geo:()=>carpoliceGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickround', color:0x35b8e0, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickroundGeo },
  { name:'piratebarrel', color:0xea9168, rc:1.0, tex:'pirate', mat:'soft', geo:piratebarrelGeo },
  { name:'steak',  color:0xe23b2e, rc:0.85, wr:0.53, mat:'model', geo: steakGeo }, // ⚠️ МОДЕЛЬ ВЛАДЕЛЬЦА (35-steak) — ДЕРЖИМ БЛИЗКО К НАЧАЛУ по его спеке 2026-07-30: на индексе 92 она открывалась только с 85-го уровня, куда доходят единицы, то есть в игре её фактически не было. Индекс 9 = открывается со ВТОРОГО уровня. НЕ уводить в хвост. wr — плоский, для теста стены
  { name:'foodstrawberry',        color:0xe83a4a, rc:1.0, tex:'food', mat:'soft', geo:foodstrawberryGeo },
  { name:'foodbroccoli',          color:0x4caf50, rc:1.0, tex:'food', mat:'soft', geo:foodbroccoliGeo },
  { name:'foodgrapes',            color:0x9a5ac4, rc:1.0, tex:'food', mat:'soft', geo:foodgrapesGeo },
  { name:'animalpenguin',         color:0x3a4048, rc:1.0, tex:'animal', mat:'soft', geo:animalpenguinGeo },
  { name:'animalcaterpillar',     color:0x5ac44a, rc:1.0, tex:'animal', mat:'soft', geo:animalcaterpillarGeo },
  { name:'animalfish',            color:0xff8c3a, rc:1.0, tex:'animal', mat:'soft', geo:animalfishGeo },
  { name:'cartaxi',               color:0xffc21a, rc:1.4, tex:'car', mat:'soft', geo:()=>cartaxiGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickbar', color:0xe8433a, rc:1.0, wr:0.98, tex:'brick', paint:1, mat:'soft', geo:brickbarGeo },
  { name:'piratepalm', color:0xc87551, rc:1.0, tex:'pirate', mat:'soft', geo:piratepalmGeo },
  { name:'foodcorn',              color:0xffd54a, rc:1.0, tex:'food', mat:'soft', geo:foodcornGeo },
  { name:'foodeggplant',          color:0x7a4a9e, rc:1.0, tex:'food', mat:'soft', geo:foodeggplantGeo },
  { name:'foodlemon',             color:0xffe83a, rc:1.0, tex:'food', mat:'soft', geo:foodlemonGeo },
  { name:'animalelephant',        color:0x9aa6b4, rc:1.0, tex:'animal', mat:'soft', geo:animalelephantGeo },
  { name:'animalpolar',           color:0xe8eef4, rc:1.0, tex:'animal', mat:'soft', geo:animalpolarGeo },
  { name:'animaltiger',           color:0xff8a2b, rc:1.0, tex:'animal', mat:'soft', geo:animaltigerGeo },
  { name:'carfiretruck',          color:0xe03a2e, rc:1.4, tex:'car', mat:'soft', geo:()=>carfiretruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickcorner', color:0xb45ac4, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickcornerGeo },
  { name:'piratecannon', color:0x4d515f, rc:1.0, tex:'pirate', mat:'soft', geo:piratecannonGeo },
  { name:'foodtomato',            color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodtomatoGeo },
  { name:'foodcarrot',            color:0xff8c2b, rc:1.0, tex:'food', mat:'soft', geo:foodcarrotGeo },
  { name:'foodpineapple',         color:0xf0c040, rc:1.0, tex:'food', mat:'soft', geo:foodpineappleGeo },
  { name:'animalpanda',           color:0xd8dce2, rc:1.0, tex:'animal', mat:'soft', geo:animalpandaGeo },
  { name:'animalcow',             color:0xe6ddd0, rc:1.0, tex:'animal', mat:'soft', geo:animalcowGeo },
  { name:'animalparrot',          color:0xe2453a, rc:1.0, tex:'animal', mat:'soft', geo:animalparrotGeo },
  { name:'carambulance',          color:0xeef2f6, rc:1.4, tex:'car', mat:'soft', geo:()=>carambulanceGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickstud', color:0xffd633, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickstudGeo },
  { name:'piratechest', color:0xa4abcd, rc:1.0, tex:'pirate', mat:'soft', geo:piratechestGeo },
  { name:'foodcherries',          color:0xd93a4a, rc:1.0, tex:'food', mat:'soft', geo:foodcherriesGeo },
  { name:'foodavocado',           color:0x6b8f3a, rc:1.0, tex:'food', mat:'soft', geo:foodavocadoGeo },
  { name:'foodapple',             color:0xe83a3a, rc:1.0, tex:'food', mat:'soft', geo:foodappleGeo },
  { name:'animalkoala',           color:0x9ba3ad, rc:1.0, tex:'animal', mat:'soft', geo:animalkoalaGeo },
  { name:'animalcat',             color:0x6b7280, rc:1.0, tex:'animal', mat:'soft', geo:animalcatGeo },
  { name:'animalgiraffe',         color:0xe0b23a, rc:1.0, tex:'animal', mat:'soft', geo:animalgiraffeGeo },
  { name:'cargarbagetruck',       color:0x4a9e5c, rc:1.4, tex:'car', mat:'soft', geo:()=>cargarbagetruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickclassic', color:0x5ac44a, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickclassicGeo },
  { name:'piratecrate', color:0x3aa378, rc:1.0, tex:'pirate', mat:'soft', geo:piratecrateGeo },
  { name:'foodpear',              color:0xc8d94a, rc:1.0, tex:'food', mat:'soft', geo:foodpearGeo },
  { name:'foodpumpkin',           color:0xff8a2b, rc:1.0, tex:'food', mat:'soft', geo:foodpumpkinGeo },
  { name:'foodpaprika',           color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodpaprikaGeo },
  { name:'animalchick',           color:0xffd84a, rc:1.0, tex:'animal', mat:'soft', geo:animalchickGeo },
  { name:'animalfox',             color:0xf07a34, rc:1.0, tex:'animal', mat:'soft', geo:animalfoxGeo },
  { name:'animallion',            color:0xd9a05b, rc:1.0, tex:'animal', mat:'soft', geo:animallionGeo },
  { name:'carrace',               color:0xff5a2b, rc:1.4, tex:'car', mat:'soft', geo:()=>carraceGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'bricksquare', color:0xff9a2b, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:bricksquareGeo },
  { name:'pirateball', color:0x505362, rc:1.0, tex:'pirate', mat:'soft', geo:pirateballGeo },
  { name:'foodcabbage',           color:0x8fc46a, rc:1.0, tex:'food', mat:'soft', geo:foodcabbageGeo },
  { name:'foodbeet',              color:0xa03a6b, rc:1.0, tex:'food', mat:'soft', geo:foodbeetGeo },
  { name:'foodcoconut',           color:0xb08a5a, rc:1.0, tex:'food', mat:'soft', geo:foodcoconutGeo },
  { name:'animalmonkey',          color:0xa9713f, rc:1.0, tex:'animal', mat:'soft', geo:animalmonkeyGeo },
  { name:'animaldog',             color:0xc98f5a, rc:1.0, tex:'animal', mat:'soft', geo:animaldogGeo },
  { name:'animalbeaver',          color:0x9c6b42, rc:1.0, tex:'animal', mat:'soft', geo:animalbeaverGeo },
  { name:'cartractor',            color:0x4caf50, rc:1.4, tex:'car', mat:'soft', geo:()=>cartractorGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickduo', color:0x3a6ee0, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickduoGeo },
  { name:'piratetower', color:0xadb5d9, rc:1.0, tex:'pirate', mat:'soft', geo:piratetowerGeo },
  { name:'foodmushroom',          color:0xe8ddc8, rc:1.0, tex:'food', mat:'soft', geo:foodmushroomGeo },
  { name:'foodonion',             color:0xd9c0a8, rc:1.0, tex:'food', mat:'soft', geo:foodonionGeo },
  { name:'foodcauliflower',       color:0xeee6d0, rc:1.0, tex:'food', mat:'soft', geo:foodcauliflowerGeo },
  { name:'animaldeer',            color:0xb07a4a, rc:1.0, tex:'animal', mat:'soft', geo:animaldeerGeo },
  { name:'animalbunny',           color:0xd8b895, rc:1.0, tex:'animal', mat:'soft', geo:animalbunnyGeo },
  { name:'animalhog',             color:0x8d6144, rc:1.0, tex:'animal', mat:'soft', geo:animalhogGeo },
  { name:'carvan',                color:0xe0a04a, rc:1.4, tex:'car', mat:'soft', geo:()=>carvanGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'piratedoor', color:0xadb5d9, rc:1.0, tex:'pirate', mat:'soft', geo:piratedoorGeo },
  { name:'foodcupcake',           color:0xffa8c8, rc:1.0, tex:'food', mat:'soft', geo:foodcupcakeGeo },
  { name:'foodicecream',          color:0xffd9b8, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamGeo },
  { name:'foodburger',            color:0xc98a4b, rc:1.0, tex:'food', mat:'soft', geo:foodburgerGeo },
  { name:'carcone', color:0xff9944, rc:1.4, tex:'car', mat:'soft', geo:()=>carconeGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodcroissant',         color:0xe0b070, rc:1.0, tex:'food', mat:'soft', geo:foodcroissantGeo },
  { name:'foodcookie',            color:0xc08a50, rc:1.0, tex:'food', mat:'soft', geo:foodcookieGeo },
  { name:'foodleek', color:0x4db781, rc:1.0, wr:0.32, tex:'food', mat:'soft', geo:foodleekGeo },
  { name:'carbox', color:0xb86847, rc:1.4, tex:'car', mat:'soft', geo:()=>carboxGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodfish', color:0x626880, rc:1.0, wr:0.89, tex:'food', mat:'soft', geo:foodfishGeo },
  { name:'foodturkey', color:0x945841, rc:1.0, tex:'food', mat:'soft', geo:foodturkeyGeo },
  { name:'foodcheese', color:0xffc759, rc:1.0, wr:0.98, tex:'food', mat:'soft', geo:foodcheeseGeo },
  { name:'cartruck', color:0x4a9e5c, rc:1.4, tex:'car', mat:'soft', geo:()=>cartruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodsundae', color:0xe45e48, rc:1.0, wr:0.37, tex:'food', mat:'soft', geo:foodsundaeGeo },
  { name:'foodchinese', color:0xebebf2, rc:1.0, tex:'food', mat:'soft', geo:foodchineseGeo },
  { name:'foodwholeham', color:0xdc9e76, rc:1.0, tex:'food', mat:'soft', geo:foodwholehamGeo },
  { name:'carkartoobi', color:0x8a6ec8, rc:1.4, tex:'car', mat:'soft', geo:()=>carkartoobiGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodtaco', color:0xd4926b, rc:1.0, wr:0.85, tex:'food', mat:'soft', geo:foodtacoGeo },
  { name:'foodhotdog', color:0xeb9268, rc:1.0, wr:0.99, tex:'food', mat:'soft', geo:foodhotdogGeo },
  { name:'foodcakebirthday', color:0xffc044, rc:1.0, tex:'food', mat:'soft', geo:foodcakebirthdayGeo },
  { name:'foodicecreamscoopmint', color:0x2b9571, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamscoopmintGeo },
  { name:'fooddonutsprinkles',    color:0xffb3d1, rc:1.0, tex:'food', mat:'soft', geo:fooddonutsprinklesGeo },

  // ===== ПАРТИЯ KENNEY 2026-07-30: 28 предметов из 7 китов (модуль 38-kenney.js,
  // отдельный от 36-models — см. WORKSTREAMS, там же почему 36-models НЕ перегенерён).
  // ⚠️ ДОПИСАНЫ В ХВОСТ НАМЕРЕННО: типы открываются ПО ПОРЯДКУ массива, поэтому
  // хвост не двигает ранние уровни — отобранная кривая 1..84 остаётся какой была.
  // color красит НЕ модель (её красит атлас), а ТРУХУ при распаде — подобран по
  // доминирующему тону предмета. wr там, где конвертер отметил плоскую форму.
  { name:'holidaycandycanered', color:0xe8574a, rc:1.0, wr:0.55, tex:'holiday', mat:'soft', geo:holidaycandycaneredGeo },
  { name:'holidaygingerbreadman', color:0xc08a50, rc:1.0, wr:0.83, tex:'holiday', mat:'soft', geo:holidaygingerbreadmanGeo },
  { name:'holidayhanukkahdreidel', color:0x5b8fd0, rc:1.0, tex:'holiday', mat:'soft', geo:holidayhanukkahdreidelGeo },
  { name:'holidaynutcracker', color:0xd6483f, rc:1.0, wr:0.49, tex:'holiday', mat:'soft', geo:holidaynutcrackerGeo },
  { name:'holidaypresentacube', color:0xe0574f, rc:1.0, tex:'holiday', mat:'soft', geo:holidaypresentacubeGeo },
  { name:'holidaypresentaround', color:0x6fb8e0, rc:1.0, tex:'holiday', mat:'soft', geo:holidaypresentaroundGeo },
  { name:'holidayreindeer', color:0x9a6b45, rc:1.0, tex:'holiday', mat:'soft', geo:holidayreindeerGeo },
  { name:'holidaysnowman', color:0xeef4fb, rc:1.0, tex:'holiday', mat:'soft', geo:holidaysnowmanGeo },
  { name:'survivalbarrel', color:0x9a6b45, rc:1.0, tex:'survival', mat:'soft', geo:survivalbarrelGeo },
  { name:'survivalbottle', color:0x7fb8a8, rc:1.0, wr:0.38, tex:'survival', mat:'soft', geo:survivalbottleGeo },
  { name:'survivalbucket', color:0x8d949e, rc:1.0, tex:'survival', mat:'soft', geo:survivalbucketGeo },
  { name:'survivalchest', color:0xa77b4a, rc:1.0, tex:'survival', mat:'soft', geo:survivalchestGeo },
  // ⚠️ РЫБА ДОБАВЛЕНА ПО ПРЯМОЙ ПРОСЬБЕ ВЛАДЕЛЬЦА 2026-07-30 («добавь рыбу,
  // объектов слишком мало»). Я отводила её как риск путаницы с золотой
  // РЫБКОЙ-СЮРПРИЗОМ — владелец решил иначе. Риск умеренный: у сюрприза
  // свой золотой emissive-материал (MeshStandard даже в matcap-режиме),
  // а эта идёт с атласом survival — тон и блеск разные.
  { name:'survivalfish', color:0x7fa8c4, rc:1.0, wr:0.89, tex:'survival', mat:'soft', geo:survivalfishGeo },
  { name:'survivaltoolaxe', color:0x8d949e, rc:1.0, wr:0.43, tex:'survival', mat:'soft', geo:survivaltoolaxeGeo },
  { name:'survivaltoolhammer', color:0x8d949e, rc:1.0, wr:0.57, tex:'survival', mat:'soft', geo:survivaltoolhammerGeo },
  { name:'survivaltoolpickaxe', color:0x8d949e, rc:1.0, wr:0.67, tex:'survival', mat:'soft', geo:survivaltoolpickaxeGeo },
  { name:'toycaritemcoingold', color:0xf2c14a, rc:1.0, tex:'toycar', mat:'soft', geo:toycaritemcoingoldGeo },
  { name:'toycaritemcone', color:0xff9944, rc:1.0, tex:'toycar', mat:'soft', geo:toycaritemconeGeo },
  { name:'toycarvehiclemonstertruck', color:0x6f7ad0, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclemonstertruckGeo },
  { name:'toycarvehiclespeedster', color:0xe8574a, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclespeedsterGeo },
  { name:'toycarvehiclevintageracer', color:0x4aa3c9, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclevintageracerGeo },
  { name:'factoryboxsmall', color:0xc9a06a, rc:1.0, tex:'factory', mat:'soft', geo:factoryboxsmallGeo },
  { name:'factorycoga', color:0x8d949e, rc:1.0, wr:0.96, tex:'factory', mat:'soft', geo:factorycogaGeo },
  { name:'factorycogc', color:0x8d949e, rc:1.0, wr:0.94, tex:'factory', mat:'soft', geo:factorycogcGeo },
  { name:'factorypistonround', color:0xadb5d9, rc:1.0, tex:'factory', mat:'soft', geo:factorypistonroundGeo },
  { name:'marketcashregister', color:0x9aa4b0, rc:1.0, tex:'market', mat:'soft', geo:marketcashregisterGeo },
  { name:'marketshoppingbasket', color:0xe05a5a, rc:1.0, tex:'market', mat:'soft', geo:marketshoppingbasketGeo },
  { name:'arcadeclawmachine', color:0x6f7ad0, rc:1.0, tex:'arcade', mat:'soft', geo:arcadeclawmachineGeo },
  { name:'forestplant', color:0x5fb562, rc:1.0, tex:'forest', mat:'soft', geo:forestplantGeo },
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
