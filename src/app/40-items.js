// ===== 40-items: создание предметов, сюрприз, генерация уровня =====

const geoCache = new Map();
let items = [];
let stats, level;
// номер уровня — переживает перезагрузку
let levelNum = 1;
// Кап роликов «подсказка за рекламу», привязанный к НОМЕРУ уровня (не к
// объекту level): переживает Restart той же партии, обнуляется только на
// НОВОМ уровне. Подробности и почему так — у места использования в genLevel.
let adHintLevelNo = -1, adHintCarry = AD_HINTS_PER_LEVEL;
// ⛔⛔ ВОССТАНОВЛЕНИЕ УРОВНЯ ОТСЮДА ПЕРЕЕХАЛО В 77-save (ПОСЛЕ loadSave).
// Здесь оно ЛОМАЛОСЬ ПО ПОСТРОЕНИЮ: склейка сортирует модули по имени,
// 40 < 77, и «typeof Save» на верхнем уровне бросал ReferenceError (TDZ у
// const — typeof безопасен только для НЕОБЪЯВЛЕННЫХ), пустой catch его
// глотал, и localStorage-ветка гибла заодно — она стояла в том же try выше
// строки падения. С 2026-08-07 холодный старт ТЕРЯЛ сохранённый уровень:
// каждый перезапуск начинал с 1-го. Нашло внешнее ревью 2026-08-13,
// воспроизведено (mixer_level=11 -> alive 80). НЕ возвращать чтение Save в
// модуль с номером меньше 77.

// size — НЕПРЕРЫВНЫЙ множитель (разброс с 20-го уровня: ±10% на старте,
// до ±30% с уровнями — числа пересмотрены 2026-08-15, см. 00-config).
// Геометрия от размера не зависит (масштаб на меше) — кэш по типу.
// Материал предмета по типу — ВЫНЕСЕН из makeItem (2026-07-24), чтобы портреты
// коллекции (thumbItemForKey в 85-hud) строили ТОТ ЖЕ материал (matcap-патч,
// вуаль, texTune) без дублирования и дрейфа от боевого. Зависит только от t.
function itemMaterial(t){
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
      // t.paint (КИРПИЧИ, решение владельца 2026-07-22 «крась кирпичи»): у
      // пачки Brick атлас БЕЛЫЙ (замер по UV: #f9f9fc), различать 11 белых
      // прямоугольников сверху нельзя — поэтому цвет им даёт палитра, как
      // процедурным. Шейдер множит белый атлас на color, тон выходит чистым,
      // и труха (fxColor от t.color) совпадает с самим кирпичом.
      color: t.mat === 'chrome' ? 0xb8c0cc
           : t.paint ? candyColor(t.color, t.dl)
           : (t.tex || t.mat === 'model') ? 0xffffff
           : candyColor(t.color, t.dl),
      map: t.tex ? modelColormap(t.tex) : null,
      // у текстурных — почти белый matcap, иначе он пережимает авторские цвета.
      // ПОКРАШЕННЫМ он не нужен: их цвет несёт material.color, а не атлас,
      // значит им идёт обычный 'soft' — с ним форма читается объёмнее.
      matcap: makeMatcap(t.tex && !t.paint ? 'tex' : (t.mat === 'chrome' ? 'metal' : 'soft')),
      vertexColors: t.mat === 'model',
    });
    // ручки яркости/контраста калиброваны под АВТОРСКИЕ атласы; покрашенным
    // они ни к чему — там цвет уже наш
    if (t.tex && !t.paint) mat.userData.texTune = 1;
    addMatcapEmissive(mat);          // без этого падает подсветка Hint
    mat.onBeforeCompile = matcapSpecPatch;
    // ⚠️ Режим 'fade' платит ВСЕГДА и ЗА ВСЕХ: three ставит предмет в
    // прозрачную очередь по флагу material.transparent, а не по opacity —
    // доступные (opacity 1) тоже уезжают туда и теряют ранний Z. Поэтому
    // флаг выставляется ОДИН раз здесь: дёргать его покадрово нельзя,
    // смена transparent — это перекомпиляция шейдера.
    // ⚠️ ФЛАГ ТОЛЬКО В HARD: в Easy вуали нет вовсе (isAccessible отдаёт true
    // всем), поэтому прозрачная очередь и потеря раннего Z в дефолтном режиме
    // не нужны никому. Раньше флаг стоял всегда и Easy платил впустую.
    if (VEIL_MODE === 'fade' && CFG.hard) mat.transparent = true;
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
      color: (t.tex && !t.paint) ? 0xffffff : candyColor(t.color, t.dl), // paint — см. matcap-ветку
      map: t.tex ? modelColormap(t.tex) : null,
      metalness: 0, roughness: 0.18,
    });
    mat.envMapIntensity = 0.5;
  }
  return mat;
}
function makeItem(typeIdx, size){
  const t = TYPES[typeIdx], sz = { s: size || 1 };
  const gkey = String(typeIdx);
  if (!geoCache.has(gkey)) geoCache.set(gkey, t.geo());
  const mat = itemMaterial(t);
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
function makeSurprise(spawn){
  // если рыбка есть и в TYPES — геометрию берём из общего кэша типов, а не
  // плодим второй экземпляр той же BufferGeometry под ключом 'S'
  if (!geoCache.has('S')){
    const ti = TYPES.findIndex(t => t.geo === surpriseGeoFn);
    if (ti >= 0){
      const gkey = String(ti);
      if (!geoCache.has(gkey)) geoCache.set(gkey, TYPES[ti].geo());
      geoCache.set('S', geoCache.get(gkey)); // общий объект: dispose по 'S' не делается нигде
    } else {
      geoCache.set('S', surpriseGeoFn());
    }
  }
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
    r: 1.0 * 1.2 * MESH_SCALE, p: (spawn ? spawn.clone() : new THREE.Vector3(0, FLOOR_REST + 0.8, 0)),
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
  // ⚠️ ТОЛЬКО ДЛЯ СТАРОГО ПУТИ «лежит на дне». При ЗАБРОСЕ СВЕРХУ (слово
  // владельца 2026-08-04) прибивка означала бы «завис в воздухе навсегда» —
  // ровно это и поймала A/B-проба: topY 12.04 против базовых 7.14, куча не
  // оседала, рыбка не падала. Заброшенный золотой — обычное живое тело.
  if (!spawn) item.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  return item;
}

// Чёрный шар-бомба (спека владельца 2026-07-22, через диспетчера): не
// матчится (key уникален — hasAnyPair/подсказка/прицел её парой не считают),
// тап по доступной — взрыв ближайших соседей (detonateBomb в 80-gameplay;
// поведение — зона ФИЗИКИ по правилу 9, здесь только фабрика). Тело — живая
// ветка 'ball' в 50-physics (как сюрприз ходит через 'surprisehull').
// ПЕРЕЛИВАЮЩАЯСЯ БОМБА (спека владельца 2026-07-23 «сделай переливающейся»).
// ⛔⛔ ЗДЕСЬ ПЁКСЯ ПРОЦЕДУРНЫЙ РАДУЖНЫЙ МАТЧЕП БОМБЫ (`bombMatcap`, ~40 строк:
// френель + тонкоплёночный hue по радиусу и углу + узкая искра). СНЯТ 2026-08-17
// по слову владельца «возьми для бомбы» вместе с его картинкой — теперь матчеп
// приезжает из `07-matcap-bomb.js` (`bombMatcapTex`).
// ⚠️ ПРИЧИНА, ПО КОТОРОЙ ОН ВООБЩЕ БЫЛ, НЕ ИСЧЕЗЛА: three r149 не умеет
// `MeshPhysicalMaterial.iridescence` (r150+, а UMD выше r160 не поднять), и
// перелив по-прежнему живёт ТЕКСТУРОЙ, а не материалом. Захочется вернуть
// процедурный — `git revert`, код цел в истории.
// ⚠️ Сам приём не изменился: matcap = лукап по нормали В ПРОСТРАНСТВЕ КАМЕРЫ,
// поэтому при качении шара картинка «плывёт» сама, без света и без патча.
function makeBomb(){
  if (!geoCache.has('B')) geoCache.set('B', new THREE.SphereGeometry(0.95, 28, 20));
  // переливающийся: радужный matcap (bombMatcap), лукап по нормали в
  // пространстве камеры — при качении шара разводы «плывут». Плоский
  // MeshMatcapMaterial (без нашего spec-патча): свет не нужен, всё в текстуре.
  const mat = new THREE.MeshMatcapMaterial({ matcap: bombMatcapTex() });
  const mesh = new THREE.Mesh(geoCache.get('B'), mat);
  mesh.scale.setScalar(1.0 * MESH_SCALE); // «средний размер»: охват 0.95·MESH_SCALE
  const item = {
    key: 'BOMB', bomb: true, type: { name: 'bomb', mat: 'plain' },
    baseColor: mat.color.clone(),
    fxColor: new THREE.Color(0x3a3f4a).convertSRGBToLinear(), // тёмная труха взрыва
    r: 0.95 * MESH_SCALE, scl: 1.0 * MESH_SCALE,
    p: new THREE.Vector3(), body: null, geo: geoCache.get('B'),
    mesh, alive: true, animating: false, accessible: false,
  };
  mesh.userData.item = item;
  scene.add(mesh);
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
  // дробный объём тика (2.6 = +30%, спека владельца): целая часть спавнится,
  // хвост копится в chainCarry до следующего тика
  chainCarry += CHAIN_DROP_N;
  const want = Math.floor(chainCarry);
  chainCarry -= want;
  let dropped = 0;
  for (let k = 0; k < want; k++){
    if (aliveCnt + dropped >= PAIRS*2 + 1) break;
    dropOneFromSky(k);
    dropped++;
  }
  if (dropped){ wakePhysics('chainDrop'); updateHUD(); }
}
// ═══ БОМБА: КОГДА ОНА ЕСТЬ (спека владельца 2026-08-12) ═══
// Разрыв живёт В ПАМЯТИ СЕССИИ, а не в сейве: это не прогресс и не валюта, а
// ритм подачи. Поле сейва потребовало бы мержа между устройствами (чек-лист в
// 77-save), и два устройства спорили бы о том, чей разрыв правильный.
let bombNextLevel = BOMB_FROM_LEVEL;
function bombAlive(){ for (const it of items) if (it.alive && it.bomb) return true; return false; }
function bombDueThisLevel(){
  if (levelNum < BOMB_FROM_LEVEL) return false;
  return levelNum >= bombNextLevel;
}
// Разрыв назначается ТОЛЬКО когда бомба реально выдана — иначе пропущенный
// уровень сдвигал бы очередь молча.
function bombNoteGiven(){
  const шаг = BOMB_GAP_MIN + Math.floor(Math.random() * (BOMB_GAP_MAX - BOMB_GAP_MIN + 1));
  bombNextLevel = levelNum + шаг;
}
// НАГРАДА ЗА СЕРИИ: бомба падает с неба тем же путём, что досыпка турбо.
// ⚠️ Гварды: не раньше пятого уровня, не в финале/конце, и НЕ ВТОРАЯ — если
// бомба уже в чаше, награда пропускается (инвариант «одна бомба» цел).
function bombDropReward(){
  if (!level || level.over || levelNum < BOMB_FROM_LEVEL) return false;
  if (level.bombReward || bombAlive()) return false;
  level.bombReward = true;
  const b = makeBomb();
  const maxD = Math.max(0.1, radiusAt(FUNNEL.H) * 0.7 - b.r);
  const th = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxD;
  b.p.set(Math.cos(th) * d, FUNNEL.H + 2, Math.sin(th) * d);
  b.mesh.position.copy(b.p);
  createItemBody(b, 'ball', geoCache.get('B'));
  items.push(b);
  wakePhysics('bombReward'); updateHUD();
  return true;
}
// Спавн одного СЛУЧАЙНОГО предмета над чашей (живое падение)
function dropOneFromSky(k, forcedTypeIdx){
  const typeIdx = (forcedTypeIdx == null)
    ? Math.floor(Math.random() * (level.typesCount || LEVEL_TYPES_MIN))
    : forcedTypeIdx;
  const it = makeItem(typeIdx, levelSize());
  const maxD = Math.max(0.1, radiusAt(FUNNEL.H) * 0.7 - it.r);
  const th = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxD;
  it.p.set(Math.cos(th) * d, FUNNEL.H + 2 + (k || 0) * 1.2, Math.sin(th) * d);
  it.mesh.position.copy(it.p);
  createItemBody(it, TYPES[typeIdx].name, it.geo);
  items.push(it);
  return it;
}
// ФИНАЛЬНАЯ ДОКИДКА ПАР (просьба тестировщиков, «Делай» владельца
// 2026-08-02: «люди хотят хэппиэнд и завершение с удовлетворением и
// победой. Сейчас они видят, как оставшиеся вещи перемалывает блендер»):
// в момент «остались одни сироты» (finale) каждому живому ОБЫЧНОМУ
// предмету докидывается партнёр ЕГО типа — уровень завершается сбором
// всего в пары, а не зрелищем помола. Камни/бомбы/сюрпризы не в счёт и не
// докидываются (слово владельца: «камни и бомбы мелим»). Один раз за
// уровень. Метка refill на докинутых: doMatch по ней даёт только БАЗОВУЮ
// цену матча (обещание владельцу «без серийных множителей, чтобы не было
// выгодно нарочно оставлять сирот»; прокачка типа и купленный бустер
// очков остаются — они не серийные).
function finalPairsRefill(){
  if (level.finalRefillDone) return false;
  level.finalRefillDone = true; // и «только камни» второй раз не проверяем
  const orphans = [];
  for (const it of items)
    if (it.alive && !it.bomb && !it.surprise && !it.frozen) orphans.push(it);
  if (!orphans.length) return false; // остались камни/бомбы — мелем как мусор
  let k = 0;
  for (const o of orphans){
    const idx = parseInt(String(o.key).slice(1), 10); // key обычных = 'T'+typeIdx
    if (!(idx >= 0)) continue;
    const p = dropOneFromSky(k++, idx);
    p.refill = true;
  }
  if (k){
    wakePhysics('finalRefill');
    toast('Final pairs');
    stats.lastAction = performance.now(); // помол отложен — дать собрать
    level.stuck = -4;                     // фора детекторам, пока досыпка оседает
    Telemetry.ev('final_refill', { lv: levelNum, n: k });
    setTimeout(()=>{ refreshAccessibility(); updateHUD(); }, 900);
  }
  return k > 0;
}
// ПОПОЛНЕНИЕ БОНУСНОГО УРОВНЯ (пункт 4 владельца дословно: «пополнение
// происходит 2 раза, когда вещей становится меньше 20% от начальных,
// пополняются каждый раз до отметки 50% от количества на старте уровня»).
// ⚠️⚠️ СЫПЛЕМ ПАРАМИ, А НЕ ПООДИНОЧКЕ, И ЭТО НЕСУЩЕЕ. Досыпка турбо
// (`dropOneFromSky` россыпью) сирот плодит легально — их доедает финал. На
// бонусе финала нет: пункт 5 требует, чтобы куча ушла ПАРАМИ до нуля, и
// одна нечётная сирота повесила бы уровень навсегда.
function bonusRefill(нужно){
  const пар = Math.floor(Math.max(0, нужно) / 2);
  if (!пар) return 0;
  // ⚠️ СПАВН НАД ЖИВОЙ КУЧЕЙ, А НЕ НАД ЧАШЕЙ: `dropOneFromSky` метит в
  // FUNNEL.H+2, то есть на бонусе ВНУТРЬ ковра (он лежит на BONUS_FLOOR
  // много выше) — предметы рождались бы внутри соседей.
  // ⚠️ `topY` — это ТЕСТ-ХУК в 99-main, а не функция игры (грепом проверено):
  // считаем верх кучи здесь. Первая версия звала хук и падала ReferenceError
  // внутри тика — пополнение молча не приходило, а счётчик его тратил.
  let верх = BONUS_FLOOR;
  for (const it of items) if (it.alive) верх = Math.max(верх, it.p.y + it.r);
  let n = 0;
  for (let i = 0; i < пар; i++){
    const typeIdx = Math.floor(Math.random() * (level.typesCount || LEVEL_TYPES_MIN));
    const size = levelSize();                 // близнецы пары — ОДНОГО размера (канон)
    for (let half = 0; half < 2; half++){
      const it = makeItem(typeIdx, size);
      const слой = Math.floor(n / 10);         // столько же на слой, что и у спавна витрины
      const hx = Math.max(0.1, bonusHalfX() - it.r - 0.1);
      const hz = Math.max(0.1, BONUS_D/2 - it.r - 0.1);
      it.p.set((Math.random()*2-1)*hx, верх + 1.6 + слой * 1.35 + Math.random() * 0.25,
               (Math.random()*2-1)*hz);
      it.mesh.position.copy(it.p);
      createItemBody(it, TYPES[typeIdx].name, it.geo);
      items.push(it); n++;
    }
  }
  wakePhysics('bonusRefill');
  stats.lastAction = performance.now();
  toast('Refill +' + n);
  Telemetry.ev('bonus_refill', { lv: levelNum, n, r: level.bonusRefills });
  setTimeout(()=>{ refreshAccessibility(); updateHUD(); }, 900);
  return n;
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
  // первые SIZE_UNIFORM_LEVELS уровней — все предметы ОДНОГО размера; дальше
  // рампа разброса. ⚠️ ЧИСЛА ПЕРЕСМОТРЕНЫ 2026-08-15 по живой игре владельца
  // («собирать из-за размера становится некомфортно»): старт с 20-го, шаг
  // 2%/ур, потолок ±30% — то есть предмет НИКОГДА не мельче 70% базового.
  // Подробности и его цитата — у констант в 00-config.
  if (levelNum <= SIZE_UNIFORM_LEVELS) return 1;
  const spread = Math.min(SIZE_SPREAD_MAX, SIZE_SPREAD_MIN + (levelNum - SIZE_UNIFORM_LEVELS - 1) * SIZE_SPREAD_STEP);
  return 1 + (Math.random() * 2 - 1) * spread;
}

// очередь глыб — В ПАМЯТИ СЕССИИ, как у бомбы: это ритм подачи, не прогресс
let frozenNextLevel = FROZEN_FROM_LEVEL;
function freezeItem(it){
  it.frozen = true; it.frozenReady = false;
  it.frozenKey = it.key;              // для ВОЗВРАТА в парные механики
  // ⚠️ КЛЮЧ ≠ ИМЯ ТИПА (ключи вида «T5», зачёт идёт по type.name из doMatch) —
  // первая версия сравнивала разные пространства имён, и зачёт молчал.
  // Поймано пробой, а не чтением. Тип храним ОТДЕЛЬНО.
  it.frozenType = it.type.name;
  it.key = 'FROZEN#' + Math.floor(Math.random() * 1e9);   // уникален — вне парных механик
  it.frozenNeedItems = FROZEN_PAIRS_N * 2;                // зачёт ШТУКАМИ: 2 штуки = пара
  it.frozenGotItems = 0;
  makeIceShell(it);
}
// ГЛЫБА — ДВА НИЗКОПОЛИГОНАЛЬНЫХ СЛОЯ ПОВЕРХ МЕША (приём накладки огня:
// материал самого предмета НЕ трогается ни на кадр — портреты коллекции
// рендерятся тем же классом материала, «морозное» просочилось бы в музей).
// Полупрозрачность — opacity, transmission запрещён каноном. Трещины —
// РОСТ ВЕРШИННОГО ШУМА по ступеням зачёта (базовые позиции хранятся).
// ⚠️⚠️ ЛЁД = «ИНЕЙ-КОРКА», ВЫБОР ВЛАДЕЛЬЦА 2026-08-13 из стенда пяти вариантов
// + его же доводки: «чуть толще (больше отступ от объекта)», «немного
// внутреннего свечения, словно лёд», «трескается и ломается как чаша — разные
// куски». ⛔ СТЕНД (?ice=N, __game.iceStyle) СРЕЗАН — победитель стал
// единственным боевым видом; варианты — в истории git (коммит 358fb4c).
// УСТРОЙСТВО: раздутая копия МЕША ПРЕДМЕТА (приём накладки огня — материал
// предмета не трогается), порезанная на КУСКИ Вороного по треугольникам —
// техника разлёта чаши: принадлежность куску записана В ВЕРШИНЫ (aCen/aDir/
// aSpin), щели и разлёт гонит вершинный шейдер по юниформам. Один меш, один
// draw call на глыбу; ⚠️ имя атрибута aCen, НЕ centroid (зарезервировано GLSL).
const ICE_SCALE = 1.14;     // «чуть толще»: на стенде было 1.07
const ICE_CHUNKS = 12;      // кусков корки
const ICE_BOOM_MS = 700;    // разлёт по РЕАЛЬНЫМ часам (tickIceBooms в 99-main)
function iceCrustMat(){
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uCol:  { value: new THREE.Color(0x8fd4ff) },   // тело инея
      uRim:  { value: new THREE.Color(0xdff4ff) },   // ободок по краю
      uGlow: { value: new THREE.Color(0xbfeaff) },   // внутреннее свечение
      uGlowK:{ value: 0.38 },
      uGap:  { value: 0 },   // щели между кусками — ступени трещин
      uBoom: { value: 0 },   // разлёт 0..1
    },
    vertexShader: [
      'attribute vec3 aCen; attribute vec3 aDir; attribute vec3 aSpin;',
      'uniform float uGap; uniform float uBoom;',
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  vec3 p = position + normalize(aCen + vec3(1e-4)) * uGap;',
      '  vec3 n = normal;',
      '  if (uBoom > 0.0){',
      '    vec3 lp = p - aCen;',
      '    float a = uBoom * (2.0 + aSpin.y * 3.0);',
      '    vec3 ax = normalize(aSpin);',
      '    lp = lp*cos(a) + cross(ax, lp)*sin(a) + ax*dot(ax, lp)*(1.0-cos(a));',
      '    n  = n*cos(a)  + cross(ax, n)*sin(a)  + ax*dot(ax, n)*(1.0-cos(a));',
      '    p = aCen + lp + aDir * uBoom * 1.6;',
      '    p.y -= uBoom * uBoom * 1.1;',
      '  }',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  vN = normalMatrix * n; vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'].join('\n'),
    fragmentShader: [
      'varying vec3 vN; varying vec3 vV;',
      'uniform vec3 uCol; uniform vec3 uRim; uniform vec3 uGlow;',
      'uniform float uGlowK; uniform float uBoom;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
      '  float d = abs(dot(N, V));',
      '  float f = pow(1.0 - d, 1.6);',
      // свечение — В ЛОБ камере (анти-френель): середина корки мягко светится
      // холодным, «словно лёд»; НЕ additive — на светлом небе additive тонет
      '  vec3 c = mix(uCol, uRim, f) + uGlow * (pow(d, 2.0) * uGlowK);',
      '  float a = mix(0.18, 0.9, f) * (1.0 - uBoom * 0.85);',
      '  gl_FragColor = vec4(c, a);',
      '}'].join('\n'),
  });
}
// Выпечка корки: копия геометрии предмета -> non-indexed, каждый ТРЕУГОЛЬНИК
// приписан ближайшему из ICE_CHUNKS сидов (Вороной по поверхности), центроид
// куска и его полёт — в вершинные атрибуты. Всё детерминировано хешем
// (Math.sin(i*127.1)*43758.5453 — тот же приём, что у прежних трещин): у одной
// глыбы всегда один узор, куски не мигают между кадрами.
function bakeIceCrust(g0){
  const src = g0.index ? g0.toNonIndexed() : g0.clone();
  const pos = src.attributes.position;
  const triN = Math.floor(pos.count / 3);
  const h01 = (i) => { const h = Math.sin(i * 127.1) * 43758.5453; return h - Math.floor(h); };
  const seeds = [];
  for (let s = 0; s < ICE_CHUNKS; s++){
    const vi = Math.floor(Math.abs(h01(s + 7)) * pos.count);
    seeds.push(new THREE.Vector3().fromBufferAttribute(pos, Math.min(vi, pos.count - 1)));
  }
  const chunkOf = new Int32Array(triN);
  const csum = []; const ccnt = new Int32Array(ICE_CHUNKS);
  for (let s = 0; s < ICE_CHUNKS; s++) csum.push(new THREE.Vector3());
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < triN; t++){
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++){ v.fromBufferAttribute(pos, t * 3 + k); c.add(v); }
    c.multiplyScalar(1 / 3);
    let best = 0, bd = Infinity;
    for (let s = 0; s < ICE_CHUNKS; s++){
      const d = c.distanceToSquared(seeds[s]);
      if (d < bd){ bd = d; best = s; }
    }
    chunkOf[t] = best;
    csum[best].add(c); ccnt[best]++;
  }
  const cen = csum.map((sm, s) => ccnt[s] ? sm.multiplyScalar(1 / ccnt[s]) : sm.set(0, 0, 0));
  const aCen = new Float32Array(pos.count * 3);
  const aDir = new Float32Array(pos.count * 3);
  const aSpin = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3(), ax = new THREE.Vector3();
  for (let t = 0; t < triN; t++){
    const s = chunkOf[t], cc = cen[s];
    // полёт: от центра предмета наружу + подброс вверх + джиттер куска
    dir.copy(cc).normalize();
    dir.x += (h01(s * 3 + 1) - 0.5) * 0.7;
    dir.z += (h01(s * 3 + 2) - 0.5) * 0.7;
    dir.y = Math.abs(dir.y) * 0.4 + 0.55;
    dir.normalize();
    ax.set(h01(s * 5 + 1) - 0.5, h01(s * 5 + 2) - 0.5, h01(s * 5 + 3) - 0.5).normalize();
    for (let k = 0; k < 3; k++){
      const i = t * 3 + k;
      aCen[i * 3] = cc.x; aCen[i * 3 + 1] = cc.y; aCen[i * 3 + 2] = cc.z;
      aDir[i * 3] = dir.x; aDir[i * 3 + 1] = dir.y; aDir[i * 3 + 2] = dir.z;
      aSpin[i * 3] = ax.x; aSpin[i * 3 + 1] = ax.y; aSpin[i * 3 + 2] = ax.z;
    }
  }
  src.setAttribute('aCen', new THREE.BufferAttribute(aCen, 3));
  src.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
  src.setAttribute('aSpin', new THREE.BufferAttribute(aSpin, 3));
  return src;
}
function makeIceShell(it){
  const shell = new THREE.Group();
  const крк = new THREE.Mesh(bakeIceCrust(it.mesh.geometry), iceCrustMat());
  крк.scale.setScalar(ICE_SCALE);
  крк.renderOrder = 3;
  shell.add(крк);
  shell.userData.iceMat = крк.material;
  shell.renderOrder = 3;
  it.mesh.add(shell);
  it.iceShell = shell;
  iceCracks(it); // нулевая ступень: волосяные швы — корка сразу «колотая»
}
// Ступени трещин = щели между кусками: юниформа, вершины не трогаются.
// Узор детерминирован выпечкой — трещины УГЛУБЛЯЮТСЯ, а не мигают.
function iceCracks(it){
  const shell = it.iceShell; if (!shell || !shell.userData.iceMat) return;
  const k = Math.min(1, it.frozenGotItems / it.frozenNeedItems);
  shell.userData.iceMat.uniforms.uGap.value = 0.012 + 0.06 * k;
}
// Разлёт корки «как чаша»: скорлупа отцепляется от предмета В МИР (предмет
// остаётся жить и двигаться), куски летят шейдером по РЕАЛЬНЫМ часам —
// тик tickIceBooms зовётся из loop (99-main).
const iceBooms = [];
function iceBoomStart(it){
  const shell = it.iceShell; if (!shell) return;
  it.iceShell = null;
  try { scene.attach(shell); } catch (e) { it.mesh.remove(shell); return; }
  iceBooms.push({ shell, mat: shell.userData.iceMat, t0: performance.now() });
}
function tickIceBooms(now){
  for (let i = iceBooms.length - 1; i >= 0; i--){
    const b = iceBooms[i];
    const k = (now - b.t0) / ICE_BOOM_MS;
    if (k >= 1){
      scene.remove(b.shell);
      for (const m of b.shell.children){ m.geometry.dispose(); m.material.dispose(); }
      iceBooms.splice(i, 1);
      continue;
    }
    if (b.mat) b.mat.uniforms.uBoom.value = k;
  }
}
// ⛔ removeIceShell СРЕЗАН вместе со стендом: единственный вызыватель (breakIce)
// перешёл на iceBoomStart (разлёт кусками). Вернуть — из истории git.

// СИНХРОННАЯ УКЛАДКА ВИТРИНЫ (без анимации). Решётка рождается внахлёст —
// эти шаги её разжимают. ⚠️ Хвост повторяет skipIntro: снять временную стену,
// снять ожидание трима (на витрине трима нет) — а finalizeFill и сон делает
// переход фазы, чтобы aliveN0 появился ровно к началу партии.
function settleBonusNow(){
  setFallCap(11);
  // ⚠️⚠️ ВЫХОДИМ ПО ФАКТУ ПОКОЯ, А НЕ ПО СЧЁТЧИКУ. Число шагов до штиля гуляет
  // по раскладкам (замер: maxV после 160 шагов — от 0.27 до 3.96), поэтому
  // фиксированный счёт пришлось бы ставить по ХУДШЕМУ случаю и платить его
  // всегда. Кап остаётся страховкой от незакрывающегося случая.
  // ⚠️ Проверяем не каждый шаг: `maxBodySpeed` — обход всей кучи, на 182 телах
  // он сам по себе заметен рядом с ценой шага.
  let i = 0;
  for (; i < BONUS_SETTLE_STEPS; i++){
    world.step();
    if (i > 40 && (i % 10 === 0) && maxBodySpeed() < 0.35) break;
  }
  bonusSettleSteps = i;   // наружу для стража: осадка ДЕЙСТВИТЕЛЬНО сходится
  syncMeshes();
  removeTempTallWall();
  setFallCap();
}
let bonusSettleSteps = 0;
function genLevel(){
  // ⚠️⚠️ ВИТРИНА РЕШАЕТСЯ ПЕРВОЙ СТРОКОЙ, И ЭТО НЕСУЩЕЕ: `buildTempTallWall`
  // ниже уже спрашивает `isBonusLevel`, а раньше эта развилка читала
  // `level.bonus` — то есть ПРЕДЫДУЩИЙ уровень (дефект того же класса, что и
  // сам инцидент: значение зависит от уровня, а точка чтения живёт вне его
  // жизненного цикла). Взвод ТРАТИТСЯ здесь же: следующий уровень снова обычный.
  // ⚠️⚠️ ЕДИНСТВЕННАЯ ТОЧКА, ГДЕ РЕШАЕТСЯ «этот уровень — витрина». Стоит ПЕРВОЙ
  // строкой, до `buildTempTallWall` и до спавна: всё, что зовётся из genLevel
  // раньше строки `level = {...}`, читает уже готовый флаг, а не номер уровня.
  bonusNow = bonusArmed || bonusByPeriod(levelNum); bonusArmed = false;
  Ads.cancel(); // висящий rewarded-показ замкнут на СТАРЫЙ level — награду глушим
  // ГОРЯЩИЙ ПРЕДМЕТ: гасим и обнуляем окно — предметы старого уровня сейчас
  // уйдут, а накладка огня висит НА МЕШЕ и уехала бы вместе с ним в никуда
  extinguishAll();
  // тени существуют только в MeshStandard-ветке: рантайм-флип CFG.matcap в ⚙️
  // без этого оставлял полусостояние (теневой пасс на матах, которые его не видят)
  renderer.shadowMap.enabled = !CFG.matcap;
  items.forEach(removeItem);
  items = [];
  // ⚠️⚠️ ШИРИНУ ВИТРИНЫ ЗАМОРАЖИВАЕМ ЗДЕСЬ — ДО ВСЕГО ОСТАЛЬНОГО. Дальше её
  // читают временная стена, спавн, число пар, стены контейнера и спасатель;
  // возьми кто-нибудь «живой» аспект позже — и они разъедутся между собой.
  if (isBonusLevel(levelNum)) bonusFreezeBox();
  buildTempTallWall(); // столб спавна выше кромки — держим высокой стеной
  // прогрессия по уровню: число типов (главный рычаг против тупиков);
  // терпение миксера — по сложности, радиус — динамический (updateMatchRadius)
  const БОНУС = isBonusLevel(levelNum);
  // ⚠️⚠️ НА ВИТРИНЕ ВИДОВ НЕ БОЛЬШЕ BONUS_TYPES_MAX (слово владельца: «иначе
  // очень сложно»). Число типов — главный рычаг сложности, и на стене из 260
  // предметов он решает всё: при 12-22 видах пара теряется в шуме.
  // ⛔ ПОТОЛОК, А НЕ ФИКСАЦИЯ: `Math.min` с обычной прогрессией — на ранних
  // уровнях открыто меньше пяти типов, и выдумывать недостающие нельзя.
  // ⚠️ ОТСЮДА ЖЕ ПИТАЕТСЯ ПОПОЛНЕНИЕ: оно берёт `level.typesCount`, то есть
  // досыпает из ТЕХ ЖЕ пяти видов, а не из всего открытого пула.
  const typesCount = Math.min(TYPES.length, LEVEL_TYPES_MIN + (levelNum - 1),
    БОНУС ? BONUS_TYPES_MAX : Infinity);
  const idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // терпение миксера по сложности
  // укороченные уровни 1-3 (план v1): первая победа к 3-й минуте
  // ⚠️ БОНУСНЫЙ УРОВЕНЬ: пар больше — заполняем не чашу, а весь кадр
  const pairsCnt = БОНУС ? bonusPairs() : pairsForLevel(levelNum); // прогрессия 40 -> 90 пар (00-config)

  // пары: тип + размер; мелкие вниз, крупные наверх
  const pairs = [];
  // ⚠️⚠️ РЕШЁТКА ВИТРИНЫ СЧИТАЕТСЯ ОДИН РАЗ НА УРОВЕНЬ, ПО САМОМУ КРУПНОМУ
  // ПРЕДМЕТУ ПАРТИИ. Первая версия брала шаг ОТ КАЖДОГО предмета, а счётчик
  // рядов был общий — у крупного типа шаг выходил 1.60 против 1.14, вместимость
  // ряда падала вчетверо, и он улетал в 45-й ряд. Замер вскрыл это сразу:
  // куча стартовала с высоты 50 и за 90 шагов не успевала лечь.
  let решётка = null;
  // ⚠️⚠️ РАЗВЯЗКА ДВУХ ПАРАЛЛЕЛЬНЫХ ФИКСОВ ОДНОЙ СТРОКИ (2026-07-30, v181).
  // Мёртвый хвост TYPES чинили ДВАЖДЫ, не зная друг о друге: диспетчер в v178
  // (детерминированная равномерная развёртка `round(i·(N−1)/(pairs−1))`) и
  // ГРАФИКА по прямому слову владельца «поменяй строку выбора типов, чтобы всё
  // ожило» (Фишер-Йетс + round-robin, ниже). ПОБЕДИЛА ВЕРСИЯ ГРАФИКИ, причина
  // не политическая, а игровая: моя развёртка на уровнях с typesCount > pairsCnt
  // брала ОДИН И ТОТ ЖЕ поднабор типов в каждой раскладке, их выборка — СЛУЧАЙНЫЕ
  // 90 из открытых, каждая раскладка разная. Для поздней игры это разнообразие
  // бесплатно. Обе версии держат кривую 1..82 нетронутой (пока typesCount <=
  // pairsCnt, берутся ВСЕ открытые типы) — это проверено и там, и там.
  // ⚠️ СЛЕДСТВИЕ ДЛЯ ТЕСТОВ: на высоких уровнях состав кучи НЕДЕТЕРМИНИРОВАН.
  // Ассерт «тип X есть в куче на ур.Y» при Y > 82 обязан собирать ОБЪЕДИНЕНИЕ
  // по нескольким regen — одиночный реген даёт флейк с вероятностью ~26%.
  // ⚠️⚠️ ВЫБОР ТИПОВ УРОВНЯ (спека владельца 2026-07-30 «поменяй строку выбора
  // типов, чтобы всё ожило»). БЫЛО: `type: i % typesCount` — круговой перебор
  // С НУЛЯ, поэтому при pairsCnt=90 спавнялись ТОЛЬКО индексы 0..89, а весь
  // хвост TYPES был СТРУКТУРНО МЁРТВ при любом уровне. Мертвы были и свои:
  // foodicecreamscoopmint (90), fooddonutsprinkles (91) и steak (92) —
  // собственная модель владельца в игру не попадала НИКОГДА. Отсюда же ложь в
  // доках «потолок прогрессии = TYPES.length»: реальный потолок был PAIRS.
  // СТАЛО: столько же РАЗНЫХ типов, но выбранных ИЗ ВСЕГО открытого диапазона.
  // ⚠️ ЧИСЛО типов НЕ ТРОНУТО — это главный рычаг сложности, и он остаётся
  // min(typesCount, pairsCnt), как был. Меняется только КАКИЕ именно.
  // ⚠️ КРИВАЯ 1..82 НЕ ЗАТРОНУТА БИТ-В-БИТ: пока typesCount <= pairsCnt, distinct
  // равен typesCount, то есть берутся ВСЕ открытые типы — тот же САМЫЙ НАБОР,
  // что и раньше (меняется лишь порядок в массиве pairs, а он всё равно
  // сортируется по размеру ниже). Выборка начинает что-то отсекать только с
  // typesCount > pairsCnt, то есть ровно там, где раньше была мёртвая зона.
  const distinct = Math.min(typesCount, pairsCnt);
  const pool = [];
  for (let i = 0; i < typesCount; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--){          // Фишер-Йетс по открытому диапазону
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  // round-robin по ВЫБРАННЫМ — распределение копий по типам такое же ровное,
  // как было у `i % typesCount` (иначе редкие типы давали бы сирот)
  for (let i=0;i<pairsCnt;i++) pairs.push({ type: pool[i % distinct], size: levelSize() });  pairs.sort((a,b)=>a.size - b.size); // мелкие первыми (лягут ниже)
  let n = 0;
  if (БОНУС){
    // ⚠️⚠️ ШАГ — ПО СРЕДНЕМУ ГАБАРИТУ, А ПОДЪЁМ ПЕРВОГО РЯДА — ПО МАКСИМАЛЬНОМУ.
    // Шаг по МАКСИМУМУ выглядел безопаснее, но он вчетверо режет вместимость
    // ряда (один банан с r=0.87 против типичных 0.62 давал 4 колонки вместо 6
    // и один слой вместо двух), решётка выходила выше пятидесяти, и осадка
    // физически не успевала её уложить. Средний шаг оставляет лёгкий нахлёст —
    // его солвер разжимает за десятки шагов, это дешевле падения с высоты.
    let maxR = 0.1, сумма = 0, счёт = 0;
    for (const pr of pairs){
      const r = TYPES[pr.type].rc * pr.size * MESH_SCALE;
      maxR = Math.max(maxR, r); сумма += r * 2; счёт += 2;
    }
    const avgR = счёт ? сумма / счёт : 0.62;
    const шаг = Math.max(0.35, avgR * 2 * BONUS_LATTICE_K);
    решётка = {
      шаг,
      шагY: Math.max(0.25, шаг * BONUS_LATTICE_KY),
      колонок: Math.max(1, Math.floor((2*bonusHalfX() - 0.1) / шаг)),
      слоёв:  Math.max(1, Math.floor((BONUS_D - 0.1) / шаг)),
      maxR,
    };
    решётка.наРяд = решётка.колонок * решётка.слоёв;
    // ⚠️⚠️ ЯЧЕЙКИ ПЕРЕМЕШИВАЮТСЯ, ИНАЧЕ ТИПЫ ЛОЖАТСЯ БЛОКАМИ. Решётка
    // заполняется в порядке СОЗДАНИЯ пар, то есть все крабы подряд, все бананы
    // подряд — на кадре это читается как выложенная витрина магазина, а не как
    // куча, и матчи становятся тривиальными (целый блок одного типа под рукой).
    // Ливень перемешивал их сам; здесь ливня нет, значит мешаем явно.
    // ⚠️ Перемешиваются ПОЗИЦИИ, а не СОСТАВ: типы и их количества те же, а
    // состав уровня — рычаг сложности, его без спеки владельца не трогают.
    const всего = pairs.length * 2;
    решётка.ячейки = new Array(всего);
    for (let i = 0; i < всего; i++) решётка.ячейки[i] = i;
    for (let i = всего - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = решётка.ячейки[i]; решётка.ячейки[i] = решётка.ячейки[j]; решётка.ячейки[j] = t;
    }
  }
  for (const pr of pairs){
    for (let k=0;k<2;k++){
      const it = makeItem(pr.type, pr.size);
      // столб НАД чашей СЛОЯМИ (по 8 — чаша шире, шаг 1.35): без стартовых
      // перекрытий — они взрывали столб и закидывали предметы на торцы стен
      // ⚠️⚠️ НА ВИТРИНЕ СТОЛБ ПРЯМОУГОЛЬНЫЙ, А ЧИСЛО НА СЛОЙ — ПО ЕЁ ПЛОЩАДИ.
      // Прежние 24 были посчитаны под широкий круглый ковёр R=7.6; в footprint
      // ящика 7.4×4.2 столько не помещается, и слой рождался бы С ПЕРЕКРЫТИЯМИ —
      // ровно та грабля, что записана строкой выше про «взрывали столб».
      const наСлой = БОНУС ? 10 : 8;
      const layer = Math.floor(n/наСлой);
      const низ = БОНУС ? BONUS_FLOOR : FUNNEL.H;
      const y = низ + 1.6 + layer*1.35 + Math.random()*0.25;
      if (БОНУС){
        // ⚠️⚠️ ВИТРИНА УКЛАДЫВАЕТСЯ РЕШЁТКОЙ НА МЕСТЕ, А НЕ СЫПЛЕТСЯ СТОЛБОМ
        // (слово владельца 2026-08-17-г: «анимации на 10 уровне быть не должно,
        // игрок видит сразу объекты»). Предметы рождаются там, где им лежать,
        // и короткая синхронная осадка в конце genLevel только разжимает
        // нахлёст. Столба над ящиком нет вовсе — падать нечему.
        // ⚠️ ШАГ РЕШЁТКИ ОТ ГАБАРИТА ПРЕДМЕТА, а не общий: с 20-го уровня идёт
        // разброс размеров, и единый шаг впаял бы крупные друг в друга — та
        // самая грабля «стартовые перекрытия взрывали столб».
        const Р = решётка, шаг = Р.шаг;
        const ячейка = Р.ячейки[n] != null ? Р.ячейки[n] : n;
        const ряд = Math.floor(ячейка / Р.наРяд), вРяду = ячейка % Р.наРяд;
        const cx = вРяду % Р.колонок, cz = Math.floor(вРяду / Р.колонок);
        // ячейки центрируем в пролёте, чтобы поля слева и справа были равны
        const шир = (Р.колонок - 1) * шаг, глуб = (Р.слоёв - 1) * шаг;
        it.p.set(-шир/2 + cx*шаг + (Math.random()-0.5)*0.10,
                 BONUS_FLOOR + Р.maxR + 0.05 + ряд*Р.шагY + (Math.random()-0.5)*0.06,
                 -глуб/2 + cz*шаг + (Math.random()-0.5)*0.06);
      } else {
        const maxD = Math.max(0.1, radiusAt(низ)*0.85 - it.r);
        const th = Math.random()*Math.PI*2, d = Math.sqrt(Math.random())*maxD;
        it.p.set(Math.cos(th)*d, y, Math.sin(th)*d);
      }
      it.mesh.position.copy(it.p);
      createItemBody(it, TYPES[pr.type].name, it.geo);
      // ⚠️⚠️ НА ВИТРИНЕ ВОЛН НЕТ. Они размазывают цену ЛИВНЯ по кадрам, а ливня
      // здесь не существует; и главное — придержанное тело ВЫКЛЮЧЕНО, то есть
      // синхронная осадка его не тронула бы и нахлёст решётки остался бы навсегда.
      if (!БОНУС){ it.wave = layer; waveHold(it); }
      items.push(it); n++;
      // бомба — в СЕРЕДИНУ столба заполнения (спека 2026-07-22): ровно на
      // половине предметов, слоем выше текущего — осядет в середину кучи
      // ⚠️ БОМБА ТЕПЕРЬ НЕ КАЖДЫЙ УРОВЕНЬ (спека владельца 2026-08-12): с 5-го и
      // с разрывом 1-3. Решение спрашивается ЗДЕСЬ, в единственной точке спавна.
      // ⚠️⚠️ НА БОНУСЕ СПЕЦПРЕДМЕТОВ НЕТ ВОВСЕ (бомба, камни, клад, глыба) — и
      // это НЕ вкусовое упрощение, а ТРЕБОВАНИЕ ПУНКТА 5 владельца: по истечении
      // времени куча уходит ПАРАМИ «пока не исчезнут все». Спецпредмет пары не
      // имеет, а сток (как и помол) их не трогает — уровень не закончился бы
      // НИКОГДА. Замер, показавший это: живых 261 = 130 пар × 2 + ОДИН клад.
      if (n === pairsCnt && !БОНУС && bombDueThisLevel()){
        bombNoteGiven();
        const b = makeBomb();
        b.p.set((Math.random()-0.5)*2, FUNNEL.H + 1.6 + Math.floor(n/8)*1.35 + 0.7, (Math.random()-0.5)*2);
        b.mesh.position.copy(b.p);
        createItemBody(b, 'ball', geoCache.get('B'));
        b.wave = Math.floor(n/8); waveHold(b);
        items.push(b);
      }
    }
  }
  // ⛔ СПАВН КАМНЕЙ СНЯТ 2026-08-17 вместе с самими камнями (слово владельца).
  // ЗОЛОТОЙ ОБЪЕКТ ЗАБРАСЫВАЕТСЯ СО ВСЕМИ (слово владельца 2026-08-04:
  // «изначально этого объекта нет и он забрасывается с остальными объектами
  // при наполнении чаши»; прежняя спека «ложится на дно первым» отменена им
  // же). ⚠️ СОЗДАЁМ СРАЗУ В ТОЧКЕ ЗАБРОСА, а не двигаем готовое тело:
  // первая версия ставила тело у дна и переносила setTranslation — тело
  // ЗАВИСАЛО в воздухе (A/B-проба: topY 12.04 против базовых 7.14, куча
  // не оседала). Rapier-тело должно рождаться там, где ему падать.
  {
    // ⚠️ ПЕРВЫЙ СЛОЙ СТОЛБА (два прогона сьюта: из середины столба золотой
    // садился НА кучу — переставал быть «закопанным» (страж доступности) и
    // задирал высоту заполнения выше кромки). Слово владельца выполняется
    // и так: он ЗАБРАСЫВАЕТСЯ вместе с остальными и виден в полёте, просто
    // летит в первой волне и честно оказывается в глубине, как раньше.
    // первая волна столба: виден в полёте вместе с прочими и честно уходит
    // в глубину кучи (страж «закопанная рыбка» и высота заполнения целы)
    // ⚠️⚠️ ГЕЙТ (спека владельца 2026-08-12): с 10-го уровня И только если
    // куплена хоть одна ступень буста. Ниже — клада в чаше нет вовсе.
    // ⚠️ ВСЕ ПОТРЕБИТЕЛИ СЮРПРИЗА УЖЕ ТЕРПЯТ ЕГО ОТСУТСТВИЕ ПО ПОСТРОЕНИЮ:
    // они либо фильтруют `!it.surprise`, либо ищут `find(...)` и выходят по
    // `if (!sp) return`. Проверено перечислением всех 20 мест перед правкой —
    // ни одно не полагается на то, что клад ЕСТЬ.
    if (!БОНУС && levelNum >= SURPRISE_FROM_LEVEL &&
        (typeof anyBoostBought !== 'function' || anyBoostBought())){
      const th = Math.random() * Math.PI * 2, d = Math.random() * 1.8;
      const spawn = new THREE.Vector3(Math.cos(th) * d, FUNNEL.H + 1.6 + 0.5, Math.sin(th) * d);
      items.push(makeSurprise(spawn));
    }

  // ═══ ЗАМОРОЖЕННЫЕ ГЛЫБЫ (спека владельца 2026-08-13; константы в 00-config).
  // Морозим ОДНОГО ИЗ ПАРЫ уже созданного типа: состав уровня и чётность не
  // трогаются вовсе. Ключ подменяется (приём камней) — все парные механики,
  // подсказка, докидка и заряд исключают глыбу АВТОМАТИЧЕСКИ; исходный ключ
  // хранится в frozenKey и возвращается при разбитии.
  // ⚠️ Очередь глыбы на бонусе НЕ СДВИГАЕТСЯ: пропущенный уровень тихо
  // отодвинул бы её, а бонус — это пауза в обычной прогрессии, а не её шаг.
  if (!БОНУС && levelNum >= FROZEN_FROM_LEVEL && levelNum >= frozenNextLevel){
    if (items.some(i => i.surprise)){
      // «разведи на следующие уровни»: с кладом в одной куче не живёт
      frozenNextLevel = levelNum + 1;
    } else {
      const поТипу = {};
      for (const it of items)
        if (it.alive !== false && !it.surprise && !it.bomb && it.type)
          (поТипу[it.type.name] = поТипу[it.type.name] || []).push(it);
      // тип годен, если копий хватает на N свободных пар + партнёра глыбы
      const годные = Object.keys(поТипу).filter(k => поТипу[k].length >= FROZEN_PAIRS_N * 2 + 2);
      if (годные.length){
        const сколько = Math.min(FROZEN_MAX_PER_LEVEL, 1 + (Math.random() < 0.5 ? 1 : 0), годные.length);
        for (let g = 0; g < сколько; g++){
          const k = годные.splice(Math.floor(Math.random() * годные.length), 1)[0];
          const жертвы = поТипу[k];
          freezeItem(жертвы[Math.floor(Math.random() * жертвы.length)]);
        }
        frozenNextLevel = levelNum +
          (FROZEN_GAP_MIN + Math.floor(Math.random() * (FROZEN_GAP_MAX - FROZEN_GAP_MIN + 1)));
      } else {
        frozenNextLevel = levelNum + 1;  // пула не хватило — пробуем следующий
      }
    }
  }
  }
  // БЕЗ предварительной осадки: падение происходит ЖИВЬЁМ на экране
  // (интро: вид сбоку -> облёт -> вид сверху); утряска и трим — в интро
  // (tickIntro/finishIntro) или в __game.skipIntro() для тестов
  stats = { taps:0, matches:0, misses:0, shakesUsed:0, adShakesUsed:0, adHintsUsed:0, score:0,
            t0: performance.now(), lastAction: performance.now() };
  // ⚠️ adHints (кап роликов на подсказку) НЕ пишется в сейв — это анти-дюп:
  // остаток в Save мержился бы по max и облако ВОЗВРАЩАЛО бы просмотренный
  // ролик. Награда (+1 заряд) уходит в монотонную пару he/hs — дюп-безопасна.
  // ⚠️ И НЕ обнуляется на КАЖДЫЙ genLevel, а привязан к НОМЕРУ уровня: иначе
  // «Restart» в паузе (pauseRestart -> genLevel) refill'ил бы кап, и подсказки
  // за рекламу становились бы БЕСКОНЕЧНЫМИ. У встряски этой дыры нет — её
  // награда тратится внутри уровня, а заряд подсказки ПОЖИЗНЕННЫЙ (he).
  if (adHintLevelNo !== levelNum){ adHintLevelNo = levelNum; adHintCarry = AD_HINTS_PER_LEVEL; }
  // встряски растут с уровнем (freeShakesFor в 00-config; лесенка возвращена
  // спекой владельца 2026-07-30 «подними встряски»),
  // раньше был флэт 3 и с ~15 ур. запаса не хватало на «сухие» эпизоды
  level = { shakes: freeShakesFor(levelNum), adShakes: AD_SHAKES_PER_LEVEL, adHints: adHintCarry, over:false, stuck:0, autoShakeUsed:false, autoStuck:0, finalRefillDone:false, nextGrind:0, chargeGiven:false, idleLimit, typesCount, banked:0, // banked — досрочно забанкованные единицы уровня (водяной знак)
            topY0: 0, parBase: 0, coinsWon: 0, continueUsed: false, detectorUsed: false,
            aliveN0: 0, camFollowOn: false, deadlock: false, // deadlock: тупик → помол-выручалка (99-main)
            // БОНУСНЫЙ УРОВЕНЬ (спека владельца 2026-08-15). Флаг снимается с
            // levelNum ОДИН РАЗ и живёт в уровне: все потребители читают
            // `level.bonus`, а не пересчитывают условие у себя — иначе смена
            // периода развела бы их между собой посреди партии.
            bonus: isBonusLevel(levelNum),
            bonusEndAt: 0,      // ставится в finishIntro: отсчёт с конца интро
            bonusDrainAt: 0,    // следующая пара стока
            bonusRefills: 0 };
  comboUntil = 0; lastMatchMs = 0; comboCount = 0; comboLevel = 0; chainUntil = 0; chainSeries = 0; chainCarry = 0; // комбо/цепная реакция не переживают уровень
  missRadiusClear();   // и штраф за промах: новый уровень начинается с полного радиуса
  chargeName = ''; chargeUntil = 0; // ревью v212: заряд типа тоже не переживает
  // ЧАША-РАЗЛЁТ (прототип v2): чаша НОВАЯ каждый уровень (решение №1
  // владельца) — трещины в ноль, стекло и стены восстановлены
  // снимок множителей на старте уровня — по нему тост решает, ВЫРОС ли
  // множитель в этой партии (слово владельца 2026-08-05)
  level.multAtStart = {};
  try { for (const t of TYPES) level.multAtStart[t.name] = accMult(t.name); } catch(e){}
  level.bowlCracks = 0; bowlShattering = false;
  try { restoreBowlVis(); } catch(e){}
  try { ensureWalls(); } catch(e){}
  // уровень — иначе чип чужого типа в новом уровне, детонация по новой куче
  // после быстрого рестарта и ВТОРОЙ заряд поверх (chargeGiven у уровня свежий)
  Telemetry.ev('level_start', { lv: levelNum });
  wakePhysics('genLevel');
  // ⚠️⚠️ ВИТРИНА УКЛАДЫВАЕТСЯ ЗДЕСЬ, СИНХРОННО, ДО ПЕРВОГО КАДРА. Так требование
  // «анимации быть не должно, игрок видит сразу объекты» выполняется САМО:
  // первый же нарисованный кадр показывает готовый ящик.
  // ⛔ И ИМЕННО ЗДЕСЬ, А НЕ ЧЕРЕЗ `finishIntro()` ИЗ genLevel — тот шлёт
  // GAME_READY, а на ХОЛОДНОМ старте прямо на бонусном уровне кадров нарисовано
  // НОЛЬ: занавес площадки снялся бы над пустым экраном (запрет «третьей точки»).
  // Плюс в finishIntro заводятся часы раунда — они сгорели бы под занавесом.
  // Фаза 'wait' остаётся, она просто невидима: куча уже на месте.
  if (isBonusLevel(levelNum)) settleBonusNow();
  startIntro();
  refreshAccessibility();
  updateHUD();
}
