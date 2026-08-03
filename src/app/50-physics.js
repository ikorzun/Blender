// ===== 50-physics: Rapier (WASM) — честная твердотельная физика =====
// Решение по docs/ADR-001: convex hull / примитивы / компаунды вместо
// сферных кластеров, масса из ПЛОТНОСТИ материала (хром тяжёлый, пластик
// лёгкий), честное вращение и трение, стабильные стеки без дребезга.
// Rapier инлайнится в index.html (src/vendor/rapier.js, window.RAPIER).
// Глобальный сон остаётся НАШ (99-main): авто-сон Rapier медленный из-за
// докатывания круглых форм; в штиле world.step() не вызывается вовсе.

let world = null;
const DENSITY = { chrome: 7.8, gold: 5.0, plastic: 1.2, rock: 2.6 }; // rock — камни (спека 2026-07-22, «тяжёлые»)
const FRICTION = 0.5, RESTIT = 0.12;
// Внутренний отступ физических стен от СТЕКЛА: предметы останавливаются,
// не доходя до стеклянной поверхности, — визуального проникновения нет
const WALL_GAP = 0.12;
const WALL_SEG = 32;
// ⚠️⚠️ КОРЕНЬ ПРОВАЛА, ЗАМЕР 2026-07-30: солвер ТЕРПИТ ГЛУБОКОЕ ПРОНИКНОВЕНИЕ
// ПЛОСКИХ ФОРМ под нагрузкой кучи, а наш глобальный сон выключает интегратор —
// и то, что утонуло к моменту сна, остаётся утопленным ДО КОНЦА УРОВНЯ.
// Жертвы — почти всегда ПЛОСКИЕ модели, и взрыв для этого НЕ НУЖЕН: худший
// замеренный случай выпал на чистой осадке, без единой встряски.
// ⚠️ ИМЕНА ЖЕРТВ СМЕНИЛИСЬ, КЛАСС — НЕТ. Порог выводился на пуле, где были
// стейк (13 случаев из 17) и леденец; обоих УДАЛИЛИ из игры в v1-test-187.
// Перезамер на TYPES=120: первый в очереди теперь `brickbar`, за ним
// пряничный человек. Не читать список типов как актуальный — читать «плоское
// под нагрузкой кучи»; появится новая плоская модель — она будет следующей.
// ⚠️ ПОРОГ ВЗЯТ ИЗ РАСПРЕДЕЛЕНИЯ, А НЕ НА ГЛАЗ, и распределение БИМОДАЛЬНО.
// 60 снимков УСНУВШЕЙ кучи (только она и бывает «навсегда»): p50 0.024,
// p90 0.061, p95 0.071, дальше 0.083 — и ПУСТОЙ КОРИДОР до 0.224, где сидит
// ровно один случай, тот самый баг. 0.12 стоит посередине коридора: в 1.45
// раза выше здорового максимума и в 1.87 раза ниже дефекта.
// ⚠️ ПЕРЕЗАМЕРЕНО НА TYPES=120 (v1-test-187, после удаления стейка и леденца),
// 66 снимков: p95 0.086, максимум 0.088, выше 0.10 — НОЛЬ. Порог остаётся
// верен с запасом 1.36×. ⚠️ ПРИ СЛЕДУЮЩЕЙ СМЕНЕ ПАРТИИ МОДЕЛЕЙ ПЕРЕМЕРИТЬ:
// число выведено из формы предметов, а не из физики вообще.
// ⚠️ НА ЛЕТЯЩЕЙ КУЧЕ ЭТИ ЧИСЛА ДРУГИЕ (p95 0.13, max 0.28) и порогом НЕ
// являются — там просадка расходится сама, см. гейт покоя в rescueSweep.
const FLOOR_PEN_MAX = 0.12;
// «почти неподвижен» для гейта покоя (см. rescueSweep). Ориентир — наши же
// пороги сна: штиль кучи maxV<0.25, форс-сон maxV<2.0.
const FLOOR_CALM_V = 0.5;
// сколько проверок подряд (по 0.5 с) просадка должна держаться, чтобы её
// подняли даже у ДВИЖУЩЕГОСЯ предмета. 3 = ~1.5 с: транзиент от встряски
// столько не живёт, а вибрация помола держит предмет утопленным десятками
// секунд (замер соака: 30 с подряд).
const FLOOR_SUNK_TICKS = 3;
let floorCol = null;    // коллайдер плиты — истинное проникновение по манифолду
let tmpWallBody = null;  // высокая временная стена на время осадки genLevel (ОДНО тело, A1)

const _pq = new THREE.Quaternion();
const _pe = new THREE.Euler();

function initPhysicsWorld(){
  world = new RAPIER.World({ x: 0, y: -G, z: 0 });
  world.timestep = 1/60;
  // по доке/issues Rapier: плотные стеки стабильнее с большим числом итераций
  try { world.numSolverIterations = 8; } catch(e){}
  try { world.maxCcdSubsteps = 4; } catch(e){}
  // Контейнер: СТУПЕНЧАТЫЙ конус из 12 колец вертикальных сегментов.
  // История: одна длинная наклонная панель с кватернион-поворотом стояла
  // не по конусу (у дна грань уезжала на ~0.3 наружу — предметы «в стекле»,
  // спасатель штормил). Кольца без наклона: грань = radiusAt(midY)-WALL_GAP
  // тривиально верна. Ступенька между кольцами 0.12 — внутрь не выступает.
  // ⚠️ A1 (перф мобильного тира 2026-07-31): ВЕСЬ КОНТЕЙНЕР — ОДНО фикс-тело
  // со многими коллайдерами. Было 417 отдельных тел (12 колец × 32 + 32
  // верхних + дно) против 182 предметов. Геометрия не меняется: раньше
  // смещение нёс body, поворот — коллайдер; теперь оба несёт коллайдер, а
  // тело стоит в начале координат.
  // ⛔⛔ ВЫИГРЫША ЭТО НЕ ДАЛО, И ПРИЧИНУ НАЗЫВАЮ ЧЕСТНО — Я ОПТИМИЗИРОВАЛ НЕ ТОТ
  // СЧЁТЧИК. Замер: солвер p95 при CPU ×4 37.0 -> 35.7 (шум), без троттлинга
  // 6.7 -> 6.7. ТЕЛ стало 599 -> 183, а КОЛЛАЙДЕРОВ как было 599, так и
  // осталось — ШИРОКАЯ ФАЗА RAPIER РАБОТАЕТ ПО КОЛЛАЙДЕРАМ (прокси), а не по
  // телам. 417 стенных прокси никуда не делись.
  // ⚠️ СЛЕДСТВИЕ ДЛЯ БУДУЩЕЙ ПРАВКИ СТЕН: настоящий рычаг — ЧИСЛО СТЕННЫХ
  // КОЛЛАЙДЕРОВ (меньше сегментов / одна форма на всю чашу), а не число тел.
  // ⚠️ И оговорка к слову «тождественно»: геометрия — да, ПОВЕДЕНИЕ — нет.
  // Порядок контактов в солвере меняется, куча из 182 тел хаотична, траектории
  // расходятся. Статистика цела (живых 182/182, верх 7.65 -> 7.54, под полом 0).
  const shellB = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  shellBody = shellB; // ЧАША-РАЗЛЁТ (прототип v2): доступ для пересборки стен
  const RINGS = 12, LOW = 0.5;
  for (let ring = 0; ring < RINGS; ring++){
    const y0 = LOW + (FUNNEL.H - LOW)*ring/RINGS;
    const y1 = LOW + (FUNNEL.H - LOW)*(ring + 1)/RINGS;
    const midY = (y0 + y1)/2;
    // ⚠️ ГРАНЬ КОЛЬЦА — ПО ЕГО НИЖНЕЙ КРОМКЕ, А НЕ ПО СЕРЕДИНЕ (замер 2026-07-31).
    // Ступенька кольца 0.725 по высоте, конус за неё расширяется на 0.134.
    // При грани по midY стена у НИЗА кольца оказывается ШИРЕ конуса на этой
    // высоте — предмет, лежащий на ней, честно торчит за radiusAt(его y), и
    // спасатель считает это вылетом: после снятия π/2 телепортов стало вдвое
    // больше (24 -> 47 на ур.40). По y0 стена ВСЕГДА внутри конуса.
    const faceR = radiusAt(y0) - WALL_GAP;
    const chord = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    for (let i = 0; i < WALL_SEG; i++){
      const a = (i + 0.5)/WALL_SEG*Math.PI*2;
      const cd = RAPIER.ColliderDesc.cuboid(0.30, (y1 - y0)/2 + 0.09, chord/2)
        .setFriction(FRICTION).setRestitution(RESTIT)
        .setTranslation(Math.cos(a)*(faceR + 0.30), midY, Math.sin(a)*(faceR + 0.30));
      _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ БЕЗ +π/2: локальная X обязана уйти в РАДИАЛЬ (см. шапку WALL_SEG)
      cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
      wallColliders.push(world.createCollider(cd, shellB)); // съёмные (разлёт чаши)
    }
  }
  // вертикальное продолжение над кромкой: скользкое, БЕЗ наклона (наклон
  // тоже был источником геометрической ошибки)
  for (let i = 0; i < WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const faceR = FUNNEL.R1 - WALL_GAP;
    const chord2 = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const cd2 = RAPIER.ColliderDesc.cuboid(0.30, 2.1, chord2/2)
      .setFriction(0.02).setRestitution(RESTIT)
      .setTranslation(Math.cos(a)*(faceR + 0.30), FUNNEL.H + 2.0, Math.sin(a)*(faceR + 0.30));
    _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ БЕЗ +π/2: локальная X обязана уйти в РАДИАЛЬ (см. шапку WALL_SEG)
    cd2.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    wallColliders.push(world.createCollider(cd2, shellB)); // съёмные (разлёт чаши)
  }
  // ⚠️ ПЛИТА ТОНКАЯ (полутолщина 0.3, то есть [0.55..1.15]) И ПОД НЕЙ ПУСТО.
  // Замер 2026-07-30: максимум просадки на летящей куче 0.28 — до середины
  // плиты, где узкая фаза дала бы нормаль ВНИЗ и предмет выдавило бы в пустоту
  // на лопасти, остаётся 7%. Утолщение вниз (полутолщина 2.4) ПРОБОВАЛИ: на
  // распределение просадок и на перф не влияет (шаг физики на взрыве p95
  // 7.9-10.9 против 7.7-9.1), ОТКЛОНЕНО владельцем 2026-07-30 — «откати
  // толщину плиты, оставь только спасателя». Возврат = два числа в этих строках.
  // плита — на том же теле контейнера; floorCol нужен спасателю пола (по нему
  // берётся ИСТИННОЕ проникновение), и он остаётся отдельным КОЛЛАЙДЕРОМ
  floorCol = world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.3, radiusAt(FLOOR_REST) + 0.2)
      .setFriction(FRICTION).setTranslation(0, FLOOR_REST - 0.3, 0), shellB);
}

// ===== ЧАША-РАЗЛЁТ (прототип v2): стены-призраки =====
// ⚠️ НЕ removeCollider: первая версия удаляла и пересоздавала стены на
// genLevel — WASM Rapier падал «unreachable» в первом же step после
// пересоздания (краш пойман стражем сброса). Сенсор — канонически
// безопасный путь: коллайдер остаётся в мире,但 перестаёт толкаться;
// восстановление = один флаг, ноль созданий/удалений.
let wallColliders = [], shellBody = null;
function dropWalls(){
  for (const c of wallColliders){ try { c.setSensor(true); } catch(e){} }
  // И ДНО-ПЛИТА ТОЖЕ (слово владельца 2026-08-03: «если чаша разбивается,
  // то не должно оставаться её силуэта») — твёрдая плита держала кучу
  // невидимым диском в форме дна, предметы «лежали по чаше». Призрачное дно:
  // при разлёте всё честно сыплется в белую пустоту (слоу-мо придерживает),
  // сбор-волна догоняет предметы в полёте.
  try { floorCol.setSensor(true); } catch(e){}
}
function ensureWalls(){
  for (const c of wallColliders){ try { if (c.isSensor()) c.setSensor(false); } catch(e){} }
  try { if (floorCol.isSensor()) floorCol.setSensor(false); } catch(e){}
}
function wallsCount(){ // число ТВЁРДЫХ стенных коллайдеров (для стражей)
  let n = 0;
  for (const c of wallColliders){ try { if (!c.isSensor()) n++; } catch(e){} }
  return n;
}

// временная стена — тоже ОДНО тело (A1): она строится и сносится КАЖДЫЙ
// уровень, то есть прежние 32 тела создавались и удалялись на каждом genLevel
function buildTempTallWall(){
  removeTempTallWall();
  tmpWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (let i=0; i<WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const chord = 2*(FUNNEL.R1 - WALL_GAP)*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const cd = RAPIER.ColliderDesc.cuboid(0.15, 24, chord/2).setFriction(0.02)
      .setTranslation(Math.cos(a)*(FUNNEL.R1 - WALL_GAP + 0.15), 24, Math.sin(a)*(FUNNEL.R1 - WALL_GAP + 0.15));
    _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ БЕЗ +π/2: локальная X обязана уйти в РАДИАЛЬ (см. шапку WALL_SEG)
    cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    world.createCollider(cd, tmpWallBody);
  }
}
function removeTempTallWall(){
  if (tmpWallBody) world.removeRigidBody(tmpWallBody);
  tmpWallBody = null;
}

// Физическая форма по типу: примитив / convex hull из рендер-геометрии / компаунд
function hullFromGeometry(geo, s){
  const src = geo.attributes.position.array;
  const pts = new Float32Array(src.length);
  for (let i=0; i<src.length; i++) pts[i] = src[i]*s;
  return RAPIER.ColliderDesc.convexHull(pts);
}
// «Катучие» формы глушим по вращению сильнее — в Rapier нет трения качения
const ROLLY = { ball:1, torus:1, cyl:1, knot:1, spiral:1, pill:1, egg:1 };

// Цепочка капсул по ломаной (точная физика трубчатых форм: тор, узел,
// спираль). ВАЖНО: three строит тор/узел в плоскости XY — прежние
// компаунды шаров стояли в XZ, перпендикулярно мешу, отсюда «впаивания».
const _capQ = new THREE.Quaternion(), _capUp = new THREE.Vector3(0,1,0), _capDir = new THREE.Vector3();
function addCapsuleChain(add, pts, r){
  for (let i=0; i<pts.length-1; i++){
    const a = pts[i], b = pts[i+1];
    _capDir.set(b.x-a.x, b.y-a.y, b.z-a.z);
    const len = _capDir.length();
    if (len < 1e-6) continue;
    _capDir.multiplyScalar(1/len);
    _capQ.setFromUnitVectors(_capUp, _capDir);
    const cd = RAPIER.ColliderDesc.capsule(len/2, r)
      .setRotation({ x:_capQ.x, y:_capQ.y, z:_capQ.z, w:_capQ.w });
    add(cd, (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
  }
}

// Сэмплы доступности строятся ИЗ ФИЗИЧЕСКИХ форм (точки строго внутри
// коллайдеров): вертикальная колонка через внутреннюю точку гарантированно
// пересекает свой коллайдер — ложный промах невозможен. Сэмплы с рендер-мешей
// давали редкий рассинхрон с физикой (спираль/узел: 1 из ~70 одиночек).
function buildAccessSamples(item, typeName, geo){
  const s = item.scl;
  const pts = [];
  const push = (x, y, z) => pts.push(x, y, z);
  switch (typeName){
    case 'cube':
      push(0, 0, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) push(sx*0.45*s, 0.45*s, sz*0.45*s);
      break;
    case 'ball':
      push(0, 0, 0); push(0.5*s, 0, 0); push(-0.5*s, 0, 0); push(0, 0, 0.5*s); push(0, 0, -0.5*s);
      break;
    case 'cyl':  push(0, 0, 0); push(0, 0.5*s, 0); push(0, -0.5*s, 0); push(0.35*s, 0, 0); push(-0.35*s, 0, 0); break;
    case 'pill': push(0, 0, 0); push(0, 0.4*s, 0); push(0, -0.4*s, 0); break;
    case 'torus':
      for (let k = 0; k < 8; k++){ const a = k/8*Math.PI*2; push(Math.cos(a)*0.68*s, Math.sin(a)*0.68*s, 0); }
      break;
    case 'knot': {
      const R = 0.58*s;
      for (let k = 0; k < 10; k++){
        const u = k/10 * Math.PI*4, cs = Math.cos(1.5*u);
        push(R*(2+cs)*0.5*Math.cos(u), R*(2+cs)*0.5*Math.sin(u), R*Math.sin(1.5*u)*0.5);
      }
      break;
    }
    case 'spiral':
      for (let k = 0; k < 8; k++){
        const t = k/7, th = t*Math.PI*2*2.2;
        push(Math.cos(th)*0.46*s, (t-0.5)*1.5*s, Math.sin(th)*0.46*s);
      }
      break;
    case 'teapot':
    case 'surprise':
      push(0, 0, 0); push(0, 0.3*s, 0); push(0.62*s, 0.15*s, 0); push(-0.7*s, 0.05*s, 0);
      break;
    default: { // hull-типы: центроиды граней рендера, стянутые к центру —
               // выпуклая комбинация вершин => строго внутри convex hull
      const pos = geo.attributes.position;
      const idx = geo.index ? geo.index.array : null;
      const triCount = Math.floor((idx ? idx.length : pos.count) / 3);
      const K = 8, step = Math.max(1, Math.floor(triCount / K));
      for (let k = 0; k < K; k++){
        const t = Math.min(triCount - 1, k*step);
        const i0 = idx ? idx[t*3] : t*3, i1 = idx ? idx[t*3+1] : t*3+1, i2 = idx ? idx[t*3+2] : t*3+2;
        const cx = (pos.getX(i0)+pos.getX(i1)+pos.getX(i2))/3;
        const cy = (pos.getY(i0)+pos.getY(i1)+pos.getY(i2))/3;
        const cz = (pos.getZ(i0)+pos.getZ(i1)+pos.getZ(i2))/3;
        push(cx*0.6*s, cy*0.6*s, cz*0.6*s);
      }
    }
  }
  item.samples = new Float32Array(pts);
}
function createItemBody(item, typeName, geo){
  const s = item.scl;
  const density = item.surprise ? DENSITY.gold : item.rock ? DENSITY.rock : (item.type.mat === 'chrome' ? DENSITY.chrome : DENSITY.plastic);
  // вес при встряске (вариант 1): отклик на рыхление по пачке модели;
  // нет в карте (сюрприз/бомба/тип без tex) = 1.0. Раньше примером был стейк —
  // тип удалён владельцем в v187, правило от этого не изменилось
  item.shakeK = SHAKE_RESP[item.type.tex] || 1;
  item.mesh.updateMatrixWorld();
  const q = item.mesh.quaternion;
  const bd = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(item.p.x, item.p.y, item.p.z)
    .setRotation({ x:q.x, y:q.y, z:q.z, w:q.w })
    .setCcdEnabled(true) // против туннелирования на скорости (интро/встряска)
    .setLinearDamping(0.3)
    .setAngularDamping(ROLLY[typeName] ? 2.5 : 1.2);
  const body = world.createRigidBody(bd);
  const add = (cd, ox, oy, oz) => {
    cd.setDensity(density).setFriction(FRICTION).setRestitution(RESTIT);
    if (ox !== undefined) cd.setTranslation(ox, oy, oz);
    world.createCollider(cd, body);
  };
  switch (typeName){
    case 'cube':   add(RAPIER.ColliderDesc.cuboid(0.75*s, 0.75*s, 0.75*s)); break;
    case 'ball':   add(RAPIER.ColliderDesc.ball(0.95*s)); break;
    case 'cyl':    add(RAPIER.ColliderDesc.cylinder(0.8*s, 0.7*s)); break;
    case 'pill':   add(RAPIER.ColliderDesc.capsule(0.35*s, 0.5*s)); break;
    case 'torus': { // кольцо в XY (как TorusGeometry), 12 капсул по кругу
      const pts = [];
      for (let k=0;k<=12;k++){ const a = k/12*Math.PI*2;
        pts.push({ x: Math.cos(a)*0.68*s, y: Math.sin(a)*0.68*s, z: 0 }); }
      addCapsuleChain(add, pts, 0.32*s);
      break;
    }
    case 'knot': { // параметрика TorusKnot(p=2,q=3) из three, 18 сегментов
      const R = 0.58*s, pts = [];
      for (let k=0;k<=18;k++){
        const u = k/18 * Math.PI*4; // p=2 -> период 4π
        const cs = Math.cos(1.5*u);
        pts.push({
          x: R*(2+cs)*0.5*Math.cos(u),
          y: R*(2+cs)*0.5*Math.sin(u),
          z: R*Math.sin(1.5*u)*0.5,
        });
      }
      addCapsuleChain(add, pts, 0.2*s);
      break;
    }
    case 'spiral': { // хеликс как в spiralGeo, 12 сегментов
      const pts = [];
      for (let k=0;k<=12;k++){
        const t = k/12, th = t*Math.PI*2*2.2;
        pts.push({ x: Math.cos(th)*0.46*s, y: (t-0.5)*1.5*s, z: Math.sin(th)*0.46*s });
      }
      addCapsuleChain(add, pts, 0.19*s);
      break;
    }
    case 'teapot':
    case 'surprise':
      add(RAPIER.ColliderDesc.ball(0.58*s), 0, 0, 0);
      add(RAPIER.ColliderDesc.ball(0.24*s), 0.62*s, 0.15*s, 0);
      add(RAPIER.ColliderDesc.ball(0.28*s), -0.7*s, 0.05*s, 0);
      break;
    default: { // cone, octa, dode, tetra, star, heart — convex hull из реальной геометрии
      const cd = hullFromGeometry(geo, s);
      if (cd) add(cd);
      else add(RAPIER.ColliderDesc.ball(item.r)); // страховка на вырожденный hull
    }
  }
  item.body = body;
  buildAccessSamples(item, typeName, geo);
}

function destroyItemBody(item){
  if (item.body){
    world.removeRigidBody(item.body);
    item.body = null;
  }
}

// Синхронизация: позиция И ВРАЩЕНИЕ мешей теперь из тел (вращение честное)
function syncMeshes(){
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const t = it.body.translation();
    it.p.set(t.x, t.y, t.z);
    it.mesh.position.set(t.x, t.y, t.z);
    const r = it.body.rotation();
    it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

// Степпер с аккумулятором фиксированного шага (до SUBSTEP_CAP подшагов за кадр)
let physAcc = 0, rescueMs = 0, stepMsLast = 0; // stepMsLast — перф-метр (см. soak.js)
const MAX_FALL = 16; // терминальная скорость падения: CCD ненадёжен на мелких
                     // сферах компаундов при v>20 (rapier.js issue #302)
// в интро столб падает с 30+ единиц и на 16-18 пробивал стены (3-4 спасения
// за интро) — на время досыпки терминальная скорость ниже (энергия ∝ v²)
let fallCap = MAX_FALL;
function setFallCap(v){ fallCap = v || MAX_FALL; }
// РАЗБОРКА ШАГА (профилировка мобильного тира 2026-07-31): в одном stepMsLast
// сидят четыре разные работы, и на слабом CPU они не в равных долях.
// substeps особенно важен: аккумулятор фиксированного шага при МЕДЛЕННОМ кадре
// прогоняет world.step несколько раз — то есть цена растёт ровно там, где кадр
// и так не успевает. Числа отдаёт __game.physBreak().
let stepSolveMs = 0, stepSyncMs = 0, stepCapMs = 0, stepRescueMs = 0, stepSubsteps = 0;
// ⚠️⚠️ ПОТОЛОК ПОДШАГОВ ЗА КАДР = 2 (A3, перф мобильного тира 2026-08-01,
// решение диспетчера по замерам). Было 3.
// ЗАЧЕМ: аккумулятор фиксированного шага — УСИЛИТЕЛЬ, а не просто цена.
// Медленный кадр -> больше dt -> больше вызовов world.step -> кадр ещё
// медленнее. На осыпании p95 подшагов упирался ровно в потолок.
// ЧТО ДАЁТ (осыпание, CPU ×4, 6 сидов, перезамер на базе С УЖЕ ИСПРАВЛЕННЫМИ
// СТЕНАМИ и A1): солвер p95 36.7 -> 22.5, то есть −39%; кадр p95 41.4 -> 27.9.
// ЧТО СТОИТ: середина полёта чуть отстаёт, к 2.6 с сходится (верх кучи
// 8.65 -> 10.79 на отметке 2000 мс, но 7.70 -> 7.96 на 2600 мс). ДЛИТЕЛЬНОСТЬ
// осыпания по стенным часам НЕ выросла (до сна 5538 -> 5391 мс, −3% = шум):
// кламп аккумулятора отбрасывает время, но кадры при этом идут чаще.
// ⚠️ ИТОГ ЗАПОЛНЕНИЯ СВЕРЕН ОТДЕЛЬНО (8 сидов): интро кончается по часам
// КАМЕРЫ, а не по «куча улеглась», поэтому другой потолок мог бы застать
// осадку в другой стадии и трим срезал бы другое число пар. Не срезал:
// живых 182/182 в обоих, верх 7.73 -> 7.72, wallExcess max 0.141 -> 0.098,
// провалов в пол 0, спасений 1.
// ⛔ ПОЧЕМУ ГЛОБАЛЬНО, А НЕ СТУПЕНЬЮ ТИРА — ДОВОД СТРУКТУРНЫЙ: `tickPerfTier`
// ПРОПУСКАЕТ ИНТРО (`if (intro …) return`), то есть ступень физически не может
// сработать до конца ПЕРВОГО осыпания — ровно того момента, на который жаловался
// владелец. Ступень тут не оптимизация, а дырка.
// ⚠️ И «на быстрой машине кап не свяжет» — ПРОВЕРЕНО И НЕВЕРНО: без троттлинга
// p95 подшагов тоже 3, потому что в интро dt множится на INTRO_TIME_SCALE=1.7
// (16.7×1.7 = 28 мс). Осыпание меняется ОДИНАКОВО на всех устройствах, и это
// сознательный выбор: однородное ощущение лучше двух разных.
// ⛔ ≤1 ПРОБОВАЛИ И ОТВЕРГЛИ: −78% солвера, но к 2.6 с куча ещё в воздухе
// (верх 16.2 против 7.7) — видимое замедленное кино. Это спека ощущения,
// возвращать только словом владельца.
// ⚠️⚠️ ЛОЖНАЯ ТРЕВОГА, ЗАПИСАНА ЧТОБЫ НЕ ПОВТОРИЛИ: соак A3 дал 41 телепорт
// спасателя против 6 у контрольного прогона — и это НЕ регрессия, а РАЗНЫЙ
// ОБЪЁМ РАБОТЫ. Прогон A3 прошёл ТРИ уровня и 2 победы, контроль все 12 минут
// просидел на первом с нулём побед; сравнивались тоталы за разное количество
// сыгранного. Нормировка развела: чистых интро 0/0 (32 прогона), смен уровня
// 0 против 1 (48 смен), а РАСПРЕДЕЛЕНИЕ выступа за стену (8710/8856 сэмплов,
// ур.10+40, осадка + 3 встряски) совпало — p99 0.078/0.076, max 0.173/0.180,
// выше нормы 0.20 НОЛЬ у обоих; спасений на равной работе 66 (≤3) против
// 42 (≤2). ⛔ ПРАВИЛО: тотал редких событий за прогон сравним ТОЛЬКО при
// равном объёме сыгранного — иначе меряется прогресс бота, а не физика.
let SUBSTEP_CAP = 2;
function setMaxSubsteps(n){ SUBSTEP_CAP = Math.max(1, n | 0); }
function maxSubsteps(){ return SUBSTEP_CAP; }
function stepPhysics(dt){
  const _t0 = performance.now();
  physAcc = Math.min(physAcc + dt, SUBSTEP_CAP/60);
  let n = 0;
  while (physAcc >= 1/60){
    world.step();
    physAcc -= 1/60;
    n++;
  }
  stepSubsteps = n;
  const _t1 = performance.now(); stepSolveMs = _t1 - _t0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel();
    if (v.y < -fallCap) it.body.setLinvel({ x: v.x, y: -fallCap, z: v.z }, false);
  }
  const _t2 = performance.now(); stepCapMs = _t2 - _t1;
  syncMeshes();
  const _t3 = performance.now(); stepSyncMs = _t3 - _t2;
  // страховка (раз в 0.5 с): предмет за пределами чаши возвращается внутрь
  const now = performance.now();
  if (now - rescueMs > 500){
    rescueMs = now;
    rescueSweep();
  }
  stepRescueMs = performance.now() - _t3;
  stepMsLast = performance.now() - _t0;
}
// Возврат «сбежавших»: край предмета глубже 0.18 в стекле (вдавлен в стену/
// снаружи) или ниже дна — телепорт внутрь. ОБЯЗАТЕЛЬНО зовётся перед сном:
// глобальный сон умел замораживать недовытолкнутые из стен тела.
// ГОРИЗОНТАЛЬНЫЙ ВЫЛЕТ предмета В СТОРОНУ СТЕНЫ с учётом ТЕКУЩЕГО ПОВОРОТА.
// ⚠️ Прежний wallR — ОДНО число на тип, то есть предмет считался шаром. Для
// плоских моделей это врёт вдвое: у пиццы охват 1.0 при любом наклоне, хотя
// ребром она занимает по горизонтали доли этого. Отсюда шторм ложных спасений
// (8 за интро при норме 0) — а спасение это ТЕЛЕПОРТ, игрок видит рывок.
// Здесь берётся ориентированная коробка: проекция её полуразмеров на
// радиальное направление. Для шара результат прежний, для плоского — честный.
const _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();
function radialReach(it, ux, uz){
  const h = it.half;
  if (!h || !it.body) return it.wallR || it.r;
  const r = it.body.rotation();
  _rq.set(r.x, r.y, r.z, r.w);
  _rm.makeRotationFromQuaternion(_rq);
  const m = _rm.elements; // столбцы — оси предмета в мире
  const obb = it.scl * (h.x * Math.abs(ux * m[0] + uz * m[2])
                      + h.y * Math.abs(ux * m[4] + uz * m[6])
                      + h.z * Math.abs(ux * m[8] + uz * m[10]));
  // ⚠️ МИНИМУМ из коробки и ОХВАТНОЙ СФЕРЫ. Коробка тесна для плоских, но для
  // КРУГЛЫХ она ХУЖЕ сферы: по диагонали даёт до 1.73 радиуса, и арбуз начал
  // ложно спасаться там, где раньше проходил. Обе оценки — честные верхние
  // границы, значит их минимум тоже честен и всегда не хуже каждой.
  return Math.min(it.r, obb);
}
// ВЕРТИКАЛЬНЫЙ ВЫЛЕТ ВНИЗ с учётом ТЕКУЩЕГО ПОВОРОТА — та же ориентированная
// коробка, что у radialReach, только проекция на мировую вертикаль. Нужна
// именно она, а не охватная сфера: у плоской модели охват под полметра, а
// плашмя она занимает вниз считанные сотые. ⚠️ min(r, obb) — по той же
// причине, что в radialReach.
// ⚠️ ЭТО ВЕРХНЯЯ ГРАНИЦА, а не точный габарит: для выпуклой оболочки коробка
// щедра (замер: у лежащей на полу кучи «нижняя точка» уходит под пол до 0.39
// чистой арифметикой, без всякого проникновения). Поэтому НА НЕЙ НЕЛЬЗЯ
// СТРОИТЬ ПОРОГ спасателя (он на истинном проникновении, см. rescueSweep) —
// здесь она только для диагностики (itemsBrief.low).
function downReach(it){
  const h = it.half;
  if (!h || !it.body) return it.r;
  const r = it.body.rotation();
  _rq.set(r.x, r.y, r.z, r.w);
  _rm.makeRotationFromQuaternion(_rq);
  const m = _rm.elements; // столбцы — оси предмета в мире; вертикаль: m[1], m[5], m[9]
  const obb = it.scl * (h.x * Math.abs(m[1]) + h.y * Math.abs(m[5]) + h.z * Math.abs(m[9]));
  return Math.min(it.r, obb);
}
function lowestPoint(it){ return it.p.y - downReach(it); }
// ИСТИННОЕ проникновение в плиту пола по контактному манифолду Rapier
// (contactDist < 0 = перекрытие) — ground truth для замеров, в отличие от
// оценок по сфере/коробке. null = контакта с полом нет вовсе.
function floorPenetration(it){
  if (!floorCol || !it.body || !world.contactPair) return null;
  let deepest = null;
  try {
    for (let c = 0; c < it.body.numColliders(); c++){
      world.contactPair(it.body.collider(c), floorCol, m => {
        for (let k = 0; k < m.numContacts(); k++){
          const d = m.contactDist(k);
          if (deepest === null || d < deepest) deepest = d;
        }
      });
    }
  } catch (e){ return null; }
  return deepest;
}
// beforeSleep — вызов ИЗ sleepPhysics, перед самой заморозкой мира. Тогда
// гейт покоя снимается: «предмет ещё движется, сам выйдет» верно только пока
// физика шагает, а здесь она через мгновение остановится совсем.
function rescueSweep(beforeSleep){
  let rescued = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const d = Math.hypot(it.p.x, it.p.z);
    // при стоящей временной стене спавна легальный радиус — R1 на любой высоте
    // (падающие у края телепортировались ПРЯМО В ПОЛЁТЕ на глазах игрока);
    // горизонтальный габарит — wallR: у ПЛОСКИХ моделей охватный r сильно
    // переоценивает ширину и давал шторм ложных спасений (грабля найдена на
    // стейке — тип удалён в v187, но правило про КЛАСС плоских живо: wr в
    // TYPES обязателен любой модели с одной осью много меньше остальных)
    const legalR = tmpWallBody ? Math.max(radiusAt(it.p.y), FUNNEL.R1) : radiusAt(it.p.y);
    const reach = d > 1e-3 ? radialReach(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r);
    const out = (d + reach) > legalR + 0.18 || it.p.y < FLOOR_REST - 0.8 || it.p.y > 60;
    if (out){
      rescued++;
      console.warn('[rescue]', it.type.name, 'd=' + d.toFixed(2), 'y=' + it.p.y.toFixed(2), 'r=' + it.r.toFixed(2));
      // ЛОКАЛЬНО внутрь на той же высоте: телепорт на верх чаши был виден
      // игроку как «прыжок» и затягивал осадку (предмет падал заново)
      const ry = Math.min(Math.max(it.p.y, FLOOR_REST + 0.6), FUNNEL.H);
      const fit = Math.max(0, radiusAt(ry) - it.r - 0.25);
      const len = Math.hypot(it.p.x, it.p.z) || 1;
      it.body.setTranslation({ x: it.p.x/len*fit, y: ry, z: it.p.z/len*fit }, true);
      it.body.setLinvel({ x:0, y:0, z:0 }, true);
      it.body.setAngvel({ x:0, y:0, z:0 }, true);
      wakePhysics('rescue'); // пусть доосядет
      continue;
    }
    // ПОЛ (жалоба владельца 2026-07-30 «дыра в объектах»): предмет, вдавленный
    // В ПЛИТУ пола, оставался там навсегда — глобальный сон выключает
    // интегратор, и утонувший предмет висел под кучей до конца уровня.
    // ⚠️⚠️ ГЕЙТ ПО ПОКОЮ — БЕЗ НЕГО ЭТО ШТОРМ, А НЕ ЗАЩИТА. На ЛЕТЯЩЕЙ куче
    // (встряска, взрыв) просадка 0.05..0.28 — НОРМА: замер распределения дал
    // p95 0.13 при максимуме 0.28, и она расходится сама за доли секунды.
    // Вечной, то есть видимой игроку, она становится ровно тогда, когда куча
    // в этот момент замирает. Поэтому поднимаем только ПОЧТИ НЕПОДВИЖНЫХ, а
    // пред-сонный вызов rescueSweep из sleepPhysics ловит именно тот момент,
    // когда просадка вот-вот станет вечной.
    // ⚠️⚠️ И ИМЕННО ПОЭТОМУ ПЕРЕД СНОМ ГЕЙТ СНИМАЕТСЯ. Форс-сон срабатывает
    // при maxV<2.0, то есть куча ещё ползёт: с гейтом утонувший проскакивал
    // проверку, а через мгновение sleepAllBodies обнулял скорости и замораживал
    // его насовсем. Замером это стоило одного «провала» на 28 циклов ПОСЛЕ
    // введения спасателя — дыра нашлась только стрессом, не рассуждением.
    const pen = floorPenetration(it);
    const deep = pen !== null && pen < -FLOOR_PEN_MAX;
    // ⚠️⚠️ ВТОРАЯ ДЫРА, НАЙДЕНА СОАКОМ: «сон» — не единственный способ застрять
    // надолго. ПРИ ПОМОЛЕ куча не засыпает вовсе (wakeAtMs двигают каждый кадр),
    // а нижние слои постоянно ВИБРИРУЮТ импульсами миксера — предмет никогда
    // не «спокоен», гейт его отсекал, и плоская модель просидела в плите 30 с на
    // глазах игрока (pen дошёл до 0.248). Поэтому есть и второй ключ: просадка,
    // ДЕРЖАЩАЯСЯ подряд FLOOR_SUNK_TICKS проверок (~1.5 с), поднимается
    // независимо от скорости. Транзиент от встряски столько не живёт.
    // ⚠️ СЧЁТЧИК УБЫВАЕТ, А НЕ ОБНУЛЯЕТСЯ: под вибрацией помола просадка
    // ДРОЖИТ около порога, и один тик «чуть выше 0.12» сбрасывал бы часы
    // заново — предмет сидел бы в полу бесконечно, ни разу не набрав трёх
    // подряд. Убывание требует РЕАЛЬНОГО выхода, а не мигания.
    it.sunkN = Math.max(0, (it.sunkN || 0) + (deep ? 1 : -1));
    const lv = it.body.linvel();
    const calm = lv.x*lv.x + lv.y*lv.y + lv.z*lv.z < FLOOR_CALM_V*FLOOR_CALM_V;
    if (!beforeSleep && !calm && it.sunkN < FLOOR_SUNK_TICKS) continue;
    // ДВА НЕЗАВИСИМЫХ ПРИЗНАКА «в плите», и второй не для красоты:
    // (1) глубина по манифолду — ground truth, на ней стоит порог;
    // (2) ЦЕНТР ниже верха плиты — у выпуклого предмета, лежащего на полу,
    //     центр ВСЕГДА выше на свой полу-габарит, значит это уже провал.
    // ⚠️ Одного (1) НЕ ХВАТАЕТ: узкая фаза обновляется только в world.step(),
    // и сразу после телепорта (place, спасатель стены) манифолд ещё от старой
    // позиции. На одном pen детерминированный страж сьюта молча зеленел —
    // поймано им же. ⚠️ И НЕ СТРОИТЬ порог на «нижней точке» по коробке: у
    // здоровой лежащей кучи она уходит под пол до 0.39 безо всякого
    // проникновения (та же грабля, что была у wallR).
    if (!deep && it.p.y >= FLOOR_REST) continue;
    rescued++;
    console.warn('[floor]', it.type.name, 'y=' + it.p.y.toFixed(2),
      'pen=' + (pen === null ? 'none' : pen.toFixed(3)));
    // ПОДЪЁМ РОВНО НА ГЛУБИНУ ПОГРУЖЕНИЯ — по XZ предмет и так на своём месте,
    // ему нужно только выйти из плиты. Полный телепорт как у стены был бы
    // виден рывком там, где хватает миллиметров. Вторым слагаемым — гарантия
    // прогресса, когда манифолда ещё нет: иначе подъём был бы нулевым и
    // спасатель звал бы себя каждый sweep.
    const lift = Math.max(pen !== null && pen < 0 ? -pen : 0, FLOOR_REST + 0.02 - it.p.y);
    it.body.setTranslation({ x: it.p.x, y: it.p.y + lift, z: it.p.z }, true);
    // гасим ТОЛЬКО падение вниз: горизонталь и вращение оставляем, иначе
    // подъём читался бы как заморозка предмета
    if (lv.y < 0) it.body.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    wakePhysics('floor'); // пусть сосед сверху доосядет на освободившееся место
  }
  return rescued;
}

// Волна лопанья (пункт 5, спека владельца 2026-07-21): лёгкое радиальное
// вздрагивание соседей при бурсте группы >= BURST_MIN_N. Косметика, не
// рыхление: дельта скорости мала и гаснет квадратично к краю радиуса;
// лёгкие пачки (shakeK) вздрагивают сильнее — консистентно с весом встряски
// jolt (опционально, спека владельца 2026-07-27-б «взрыв бомбы похож на
// эффект shake»): ВТОРОЙ слой волны — лёгкий толчок ВСЕЙ куче, включая тех,
// кто вне радиуса R. Ближние получают радиальный ПАНЧ (характер взрыва),
// дальние — вздрагивание в духе встряски (подброс + случайный разброс), из-за
// чего «тряхнуло весь миксер», а не только эпицентр. ⚠️ jolt намеренно много
// меньше настоящей встряски (там ~9 по XZ и 5.4-11.4 подброса): цель —
// ОЩУЩЕНИЕ встряски, а не её механика; иначе бомба стала бы бесплатной
// встряской и сломала экономику бюджета 5 (см. замер в сдаче).
function blastWave(pos, R, vmax, jolt){
  for (const it of items){
    if (!it.alive || !it.body || it.animating) continue;
    const dx = it.p.x - pos.x, dz = it.p.z - pos.z;
    const d = Math.hypot(dx, it.p.y - pos.y, dz);
    if (d < 1e-3) continue;
    const wk = it.shakeK || 1;
    let ix = 0, iy = 0, iz = 0;
    if (d <= R){ // ПАНЧ: резкий радиальный, квадратичное затухание к краю зоны
      const f = vmax * (1 - d/R) * (1 - d/R) * wk;
      const inv = 1 / Math.max(Math.hypot(dx, dz), 0.3);
      ix += dx*inv*f; iy += f*0.3; iz += dz*inv*f;
    }
    if (jolt){ // ДЖОЛТ: вся куча вздрагивает; спад мягкий (к дальним не в ноль)
      // ⚠️ спад отсчитывается от ВЫСОТЫ ЧАШИ, а не от зоны поражения R:
      // «вздрагивает весь миксер» — свойство чаши. При R-привязке возврат
      // BOMB_RADIUS к прежним 2.2 молча сделал бы эффект локальным при той
      // же константе силы (ревью 2026-07-27).
      const j = jolt * wk / (1 + d/FUNNEL.H);
      // ⚠️ горизонталь НАМЕРЕННО вчетверо слабее вертикали (замер 2026-07-27):
      // с симметричным разбросом ±0.5j джолт вжимал предметы в стены и
      // УДВАИВАЛ работу спасателя (4 телепорта против 2 на базе). Подброс
      // вверх даёт то же ощущение встряски и в стены не толкает.
      ix += (Math.random()-0.5)*0.5*j;
      iy += (0.6 + Math.random()*0.5)*j; // подброс доминирует — читается как встряска
      iz += (Math.random()-0.5)*0.5*j;
    }
    if (ix || iy || iz) impulseBody(it, ix, iy, iz);
  }
  wakePhysics('burst');
}

// Максимальная скорость среди живых тел — для глобального штиля
function maxBodySpeed(){
  let m = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel(), w = it.body.angvel();
    const s = v.x*v.x + v.y*v.y + v.z*v.z + 0.2*(w.x*w.x + w.y*w.y + w.z*w.z);
    if (s > m) m = s;
  }
  return Math.sqrt(m);
}
function sleepAllBodies(){
  for (const it of items){
    if (!it.alive || !it.body) continue;
    it.body.setLinvel({ x:0, y:0, z:0 }, false);
    it.body.setAngvel({ x:0, y:0, z:0 }, false);
    it.body.sleep();
  }
}
function wakeAllBodies(){
  for (const it of items){
    if (it.alive && it.body) it.body.wakeUp();
  }
}
function impulseBody(item, ix, iy, iz){
  if (!item.body) return;
  const m = item.body.mass();
  item.body.applyImpulse({ x: ix*m, y: iy*m, z: iz*m }, true);
}
function spinBody(item, wx, wy, wz){
  if (!item.body) return;
  item.body.setAngvel({ x: wx, y: wy, z: wz }, true);
}
