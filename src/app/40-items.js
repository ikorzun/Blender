// ===== 40-items: создание предметов, сюрприз, генерация уровня =====

const geoCache = new Map();
let items = [];
let stats, level;
// номер уровня — переживает перезагрузку
let levelNum = 1;
try { levelNum = Math.max(1, parseInt(localStorage.getItem('mixer_level') || '1', 10) || 1); } catch(e){}

// size — НЕПРЕРЫВНЫЙ множитель (спека владельца: разброс ±10% на старте,
// до ±50% с уровнями). Геометрия от размера не зависит (масштаб на меше) —
// кэш по типу.
function makeItem(typeIdx, size){
  const t = TYPES[typeIdx], sz = { s: size || 1 };
  const gkey = String(typeIdx);
  if (!geoCache.has(gkey)) geoCache.set(gkey, t.geo());
  let mat;
  if (CFG.matcap){
    // «Запечённый свет» (makeMatcap в 10-stage): цвет предмета и серая вуаль
    // работают как прежде — шейдер УМНОЖАЕТ matcap на material.color.
    mat = new THREE.MeshMatcapMaterial({
      // t.tex — «родная» раскраска модели из общего палитрового атласа
      // (36-models). Цвет материала тогда БЕЛЫЙ: шейдер множит map на color,
      // и любой оттенок здесь испортил бы задуманную автором раскраску.
      // Серая вуаль недоступности продолжает работать — она лерпает этот же
      // color от белого к серому, то есть просто притемняет текстуру.
      // графит осветлён до 0xb8c0cc: характер металла несёт сам matcap, а
      // тёмный 0x424a56 в умножении давал чёрные кубы (см. MATCAP_PRESETS)
      color: t.mat === 'chrome' ? 0xb8c0cc
           : (t.tex || t.mat === 'model') ? 0xffffff
           : candyColor(t.color, t.dl),
      map: t.tex ? modelColormap(t.tex) : null,
      // у текстурных — почти белый matcap, иначе он пережимает авторские цвета
      matcap: makeMatcap(t.tex ? 'tex' : (t.mat === 'chrome' ? 'metal' : 'soft')),
      vertexColors: t.mat === 'model',
    });
    if (t.tex) mat.userData.texTune = 1;  // патч выдаст ему ручки яркости/контраста
    addMatcapEmissive(mat);          // без этого падает подсветка Hint
    mat.onBeforeCompile = matcapSpecPatch;
  } else if (t.mat === 'chrome'){
    // Цикл v4: белый хром на белом фоне сливался («кубы еле различимы») —
    // теперь тёмный ГРАФИТОВЫЙ металлик: читается на белом, блики стабильны
    mat = new THREE.MeshStandardMaterial({ color: 0x424a56, metalness: 1, roughness: 0.3 });
    mat.envMapIntensity = 0.9;
  } else if (t.mat === 'model'){
    // импортированная модель с СОБСТВЕННЫМИ вершинными цветами (стейк):
    // material.color белый — вуаль недоступности работает лерпом к серому
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0, roughness: 0.18 });
    mat.envMapIntensity = 0.5;
  } else {
    // Цикл v4: мягкий глянец вместо зеркала (roughness 0 давал скачущие
    // блики при повороте камеры) — цвет доминирует, блик размытый и стабильный
    mat = new THREE.MeshStandardMaterial({
      color: t.tex ? 0xffffff : candyColor(t.color, t.dl),
      map: t.tex ? modelColormap(t.tex) : null,
      metalness: 0, roughness: 0.18,
    });
    mat.envMapIntensity = 0.5;
  }
  const geo = geoCache.get(gkey);
  // полуразмеры В ЛОКАЛЬНЫХ единицах — для честного теста стены по
  // ориентированной коробке (radialReach в 50-physics). Считаются ОДИН раз
  // на тип: геометрия общая через geoCache, масштаб подставляется отдельно.
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const half = { x: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)),
                 y: Math.max(Math.abs(bb.min.y), Math.abs(bb.max.y)),
                 z: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.scale.setScalar(sz.s * MESH_SCALE);
  const item = {
    key: 'T' + typeIdx, // матч по ТИПУ: размер не имеет значения
    type: t, baseColor: mat.color.clone(),
    // цвет трухи: у моделей с текстурой и вершинными цветами baseColor БЕЛЫЙ,
    // и без этого при распаде летела бы белая пыль вместо цветной
    fxColor: (t.tex || t.mat === 'model') ? new THREE.Color(t.color).convertSRGBToLinear() : null,
    r: t.rc * sz.s * MESH_SCALE, p: new THREE.Vector3(),
    wallR: (t.wr || t.rc) * sz.s * MESH_SCALE, // запасной габарит (если half нет)
    half, // полуразмеры в локальных единицах — тест стены по OBB
    scl: sz.s * MESH_SCALE,
    geo: geoCache.get(gkey), // для convex hull в физике
    body: null,
    mesh, alive: true, animating: false, accessible: false,
    veilK: 0, veilTarget: 0,
  };
  mesh.userData.item = item;
  mesh.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
  scene.add(mesh);
  return item;
}

// Сюрприз со дна («археология» из концепции): золотая РЫБКА, не матчится,
// светится сквозь щели; тап по раскопанному — бонус SURPRISE_BONUS.
// Модель вместо чайника — спека владельца 2026-07-20. Материал остаётся
// MeshStandard (matcap не умеет emissive), и это к лучшему: настоящий блеск
// золота среди «запечённых» предметов сам выделяет клад.
// ⚠️ ГРАБЛЯ (обожглись 2026-07-21): геометрия сюрприза ЖЁСТКО ЗАВИСИТ от
// содержимого папки «3d assets». Раньше здесь стоял present01Geo; владелец
// заменил всю партию моделей — функция исчезла, genLevel падал на ReferenceError
// ЕЩЁ ДО создания предметов, игра поднималась с пустой чашей и БЕЗ ошибки в
// консоли. Поэтому теперь с проверкой и откатом на встроенный чайник, который
// не зависит от папки. Если меняете модель — берите ту, что реально есть.
const surpriseGeoFn = typeof animalfishGeo === 'function' ? animalfishGeo : gemGeo; // фолбэк БЕЗ чайника (удалён): процедурный кристалл не зависит от папки ассетов
function makeSurprise(){
  if (!geoCache.has('S')) geoCache.set('S', surpriseGeoFn());
  const mat = new THREE.MeshStandardMaterial({ color: 0xffc84a, metalness: 1, roughness: 0.18 });
  mat.envMapIntensity = 1.1;
  mat.emissive = new THREE.Color(0x6b4a00);
  mat.emissiveIntensity = 0.5;
  const mesh = new THREE.Mesh(geoCache.get('S'), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  // масштаб 1.2 (был 1.5): у модели охват 1.0 против 0.78 у чайника —
  // так физический размер клада остаётся прежним
  mesh.scale.setScalar(1.2 * MESH_SCALE);
  const item = {
    key: 'SURPRISE', surprise: true, type: { name:'surprise', mat:'gold' }, baseColor: mat.color.clone(),
    r: 1.0 * 1.2 * MESH_SCALE, p: new THREE.Vector3(0, FLOOR_REST + 0.8, 0),
    scl: 1.2 * MESH_SCALE,
    body: null,
    mesh, alive: true, animating: false, accessible: false,
  };
  mesh.userData.item = item;
  mesh.rotation.set(0, Math.random()*6.28, 0);
  mesh.position.copy(item.p);
  scene.add(mesh);
  // ⚠️ Имя 'surprisehull', а НЕ 'surprise': ветка 'surprise' в 50-physics —
  // компаунд из трёх шаров под ЧАЙНИК (тело + носик + ручка), для подарка он
  // неверен. Незнакомое имя уходит в default -> convex hull из реальной
  // геометрии, а сэмплы доступности — в свою default-ветку. Плотность золота
  // берётся по флагу item.surprise и от имени не зависит.
  // Чайниковая ветка в 50-physics стала мёртвой — оставлена, это чужая зона.
  createItemBody(item, 'surprisehull', geoCache.get('S'));
  // на время осадки/утряски сюрприз ПРИБИТ ко дну (fixed): вибрация всей
  // массы выталкивает крупные тела наверх (эффект бразильского ореха) —
  // чайник всплывал и торчал над кромкой. Отпускается в finishIntro.
  item.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  return item;
}

// Цепная реакция: досыпка CHAIN_DROP_N СЛУЧАЙНЫХ предметов за тик — НЕ
// парами (спека владельца; сироты легальны, финал их ест). Типы независимые,
// из активных на уровне. Стоп при полной чаше или лимите 141.
function chainRefill(){
  // заполненность — по куче НИЖЕ кромки: летящие сверху свежесыпанные
  // не должны блокировать следующий тик (душили темп до ~1 шт/с);
  // от бесконечного столба страхует лимит одновременно летящих
  let aliveCnt = 0, top = 0, airborne = 0;
  for (const it of items) if (it.alive){
    aliveCnt++;
    if (it.p.y < FUNNEL.H) top = Math.max(top, it.p.y + it.r); else airborne++;
  }
  if (top > FUNNEL.H - 1 || airborne >= 8) return;
  let dropped = 0;
  for (let k = 0; k < CHAIN_DROP_N; k++){
    if (aliveCnt + dropped >= PAIRS*2 + 1) break;
    dropOneFromSky(k);
    dropped++;
  }
  if (dropped){ wakePhysics('chainDrop'); updateHUD(); }
}
// Спавн одного СЛУЧАЙНОГО предмета над чашей (живое падение)
function dropOneFromSky(k){
  const typeIdx = Math.floor(Math.random() * (level.typesCount || LEVEL_TYPES_MIN));
  const it = makeItem(typeIdx, levelSize());
  const maxD = Math.max(0.1, radiusAt(FUNNEL.H) * 0.7 - it.r);
  const th = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxD;
  it.p.set(Math.cos(th) * d, FUNNEL.H + 2 + (k || 0) * 1.2, Math.sin(th) * d);
  it.mesh.position.copy(it.p);
  createItemBody(it, TYPES[typeIdx].name, it.geo);
  items.push(it);
  return it;
}
// Continue после поражения: досыпка n предметов (без гварда полноты —
// проигранный уровень частично пуст, задача — вернуть игру к жизни)
function dropExtra(n){
  let aliveCnt = 0;
  for (const it of items) if (it.alive) aliveCnt++;
  for (let k = 0; k < n && aliveCnt + k < PAIRS*2 + 1; k++) dropOneFromSky(k % 5);
  wakePhysics('continueDrop');
  updateHUD();
}

// Единая точка удаления предмета: тело, меш, МАТЕРИАЛ (материалы у предметов
// персональные из-за вуали — без dispose копились в GPU-памяти уровень за
// уровнем). Геометрию НЕ трогать — она общая через geoCache.
function removeItem(it){
  it.alive = false;
  destroyItemBody(it);
  scene.remove(it.mesh);
  it.mesh.material.dispose();
}

// случайный размер предмета по разбросу текущего уровня (близнецы пары
// получают ОДИН размер — size генерится на пару)
function levelSize(){
  const spread = Math.min(SIZE_SPREAD_MAX, SIZE_SPREAD_MIN + (levelNum - 1) * SIZE_SPREAD_STEP);
  return 1 + (Math.random() * 2 - 1) * spread;
}

function genLevel(){
  items.forEach(removeItem);
  items = [];
  buildTempTallWall(); // столб спавна выше кромки — держим высокой стеной
  // прогрессия по уровню: число типов (главный рычаг против тупиков);
  // терпение миксера — по сложности, радиус — динамический (updateMatchRadius)
  const typesCount = Math.min(TYPES.length, LEVEL_TYPES_MIN + (levelNum - 1));
  const idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // терпение миксера по сложности
  // укороченные уровни 1-3 (план v1): первая победа к 3-й минуте
  const pairsCnt = levelNum <= PAIRS_EARLY.length ? PAIRS_EARLY[levelNum - 1] : PAIRS;
  // сюрприз (золотая рыбка) ложится на дно первым — спека владельца в чате
  // ГРАФИКИ (вернул спавн: при мерже удаление старого спавна затёрло строку)
  items.push(makeSurprise());
  // пары: тип + размер; мелкие вниз, крупные наверх
  const pairs = [];
  for (let i=0;i<pairsCnt;i++) pairs.push({ type: i % typesCount, size: levelSize() });
  pairs.sort((a,b)=>a.size - b.size); // мелкие первыми (лягут ниже)
  let n = 0;
  for (const pr of pairs){
    for (let k=0;k<2;k++){
      const it = makeItem(pr.type, pr.size);
      // столб НАД чашей СЛОЯМИ (по 8 — чаша шире, шаг 1.35): без стартовых
      // перекрытий — они взрывали столб и закидывали предметы на торцы стен
      const layer = Math.floor(n/8);
      const y = FUNNEL.H + 1.6 + layer*1.35 + Math.random()*0.25;
      const maxD = Math.max(0.1, radiusAt(FUNNEL.H)*0.85 - it.r);
      const th = Math.random()*Math.PI*2, d = Math.sqrt(Math.random())*maxD;
      it.p.set(Math.cos(th)*d, y, Math.sin(th)*d);
      it.mesh.position.copy(it.p);
      createItemBody(it, TYPES[pr.type].name, it.geo);
      items.push(it); n++;
    }
  }
  // БЕЗ предварительной осадки: падение происходит ЖИВЬЁМ на экране
  // (интро: вид сбоку -> облёт -> вид сверху); утряска и трим — в интро
  // (tickIntro/finishIntro) или в __game.skipIntro() для тестов
  stats = { taps:0, matches:0, misses:0, shakesUsed:0, adShakesUsed:0, score:0,
            t0: performance.now(), lastAction: performance.now() };
  level = { shakes:3, adShakes:2, over:false, stuck:0, nextGrind:0, idleLimit, typesCount,
            topY0: 0, parBase: 0, coinsWon: 0, continueUsed: false, detectorUsed: false };
  comboUntil = 0; lastMatchMs = 0; comboCount = 0; comboLevel = 0; chainUntil = 0; // комбо/цепная реакция не переживают уровень
  Telemetry.ev('level_start', { lv: levelNum });
  wakePhysics('genLevel');
  startIntro();
  refreshAccessibility();
  updateHUD();
}
