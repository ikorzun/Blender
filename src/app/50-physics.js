// ===== 50-physics: Rapier (WASM) — честная твердотельная физика =====
// Решение по docs/ADR-001: convex hull / примитивы / компаунды вместо
// сферных кластеров, масса из ПЛОТНОСТИ материала (хром тяжёлый, пластик
// лёгкий), честное вращение и трение, стабильные стеки без дребезга.
// Rapier инлайнится в index.html (src/vendor/rapier.js, window.RAPIER).
// Глобальный сон остаётся НАШ (99-main): авто-сон Rapier медленный из-за
// докатывания круглых форм; в штиле world.step() не вызывается вовсе.

let world = null;
const DENSITY = { chrome: 7.8, gold: 5.0, plastic: 1.2 };
const FRICTION = 0.5, RESTIT = 0.12;
// Внутренний отступ физических стен от СТЕКЛА: предметы останавливаются,
// не доходя до стеклянной поверхности, — визуального проникновения нет
const WALL_GAP = 0.12;
const WALL_SEG = 32;
let tmpWallBodies = []; // высокая временная стена на время осадки genLevel

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
  const RINGS = 12, LOW = 0.5;
  for (let ring = 0; ring < RINGS; ring++){
    const y0 = LOW + (FUNNEL.H - LOW)*ring/RINGS;
    const y1 = LOW + (FUNNEL.H - LOW)*(ring + 1)/RINGS;
    const midY = (y0 + y1)/2;
    const faceR = radiusAt(midY) - WALL_GAP;
    const chord = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    for (let i = 0; i < WALL_SEG; i++){
      const a = (i + 0.5)/WALL_SEG*Math.PI*2;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
        .setTranslation(Math.cos(a)*(faceR + 0.30), midY, Math.sin(a)*(faceR + 0.30)));
      const cd = RAPIER.ColliderDesc.cuboid(0.30, (y1 - y0)/2 + 0.09, chord/2)
        .setFriction(FRICTION).setRestitution(RESTIT);
      _pq.setFromEuler(_pe.set(0, -a + Math.PI/2, 0));
      cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
      world.createCollider(cd, body);
    }
  }
  // вертикальное продолжение над кромкой: скользкое, БЕЗ наклона (наклон
  // тоже был источником геометрической ошибки)
  for (let i = 0; i < WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const faceR = FUNNEL.R1 - WALL_GAP;
    const chord2 = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const b2 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(Math.cos(a)*(faceR + 0.30), FUNNEL.H + 2.0, Math.sin(a)*(faceR + 0.30)));
    const cd2 = RAPIER.ColliderDesc.cuboid(0.30, 2.1, chord2/2)
      .setFriction(0.02).setRestitution(RESTIT);
    _pq.setFromEuler(_pe.set(0, -a + Math.PI/2, 0));
    cd2.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    world.createCollider(cd2, b2);
  }
  const floorB = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, FLOOR_REST - 0.3, 0));
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.3, radiusAt(FLOOR_REST) + 0.2).setFriction(FRICTION), floorB);
}

function buildTempTallWall(){
  removeTempTallWall();
  for (let i=0; i<WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const chord = 2*(FUNNEL.R1 - WALL_GAP)*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(Math.cos(a)*(FUNNEL.R1 - WALL_GAP + 0.15), 24, Math.sin(a)*(FUNNEL.R1 - WALL_GAP + 0.15)));
    const cd = RAPIER.ColliderDesc.cuboid(0.15, 24, chord/2).setFriction(0.02);
    _pq.setFromEuler(_pe.set(0, -a + Math.PI/2, 0));
    cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    world.createCollider(cd, b);
    tmpWallBodies.push(b);
  }
}
function removeTempTallWall(){
  tmpWallBodies.forEach(b => world.removeRigidBody(b));
  tmpWallBodies = [];
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
  const density = item.surprise ? DENSITY.gold : (item.type.mat === 'chrome' ? DENSITY.chrome : DENSITY.plastic);
  // вес при встряске (вариант 1): отклик на рыхление по пачке модели;
  // нет в карте (стейк/сюрприз) = 1.0
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

// Степпер с аккумулятором фиксированного шага (до 3 подшагов за кадр)
let physAcc = 0, rescueMs = 0, stepMsLast = 0; // stepMsLast — перф-метр (см. soak.js)
const MAX_FALL = 16; // терминальная скорость падения: CCD ненадёжен на мелких
                     // сферах компаундов при v>20 (rapier.js issue #302)
// в интро столб падает с 30+ единиц и на 16-18 пробивал стены (3-4 спасения
// за интро) — на время досыпки терминальная скорость ниже (энергия ∝ v²)
let fallCap = MAX_FALL;
function setFallCap(v){ fallCap = v || MAX_FALL; }
function stepPhysics(dt){
  const _t0 = performance.now();
  physAcc = Math.min(physAcc + dt, 3/60);
  while (physAcc >= 1/60){
    world.step();
    physAcc -= 1/60;
  }
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel();
    if (v.y < -fallCap) it.body.setLinvel({ x: v.x, y: -fallCap, z: v.z }, false);
  }
  syncMeshes();
  // страховка (раз в 0.5 с): предмет за пределами чаши возвращается внутрь
  const now = performance.now();
  if (now - rescueMs > 500){
    rescueMs = now;
    rescueSweep();
  }
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
function rescueSweep(){
  let rescued = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const d = Math.hypot(it.p.x, it.p.z);
    // при стоящей временной стене спавна легальный радиус — R1 на любой высоте
    // (падающие у края телепортировались ПРЯМО В ПОЛЁТЕ на глазах игрока);
    // горизонтальный габарит — wallR: у плоских моделей (стейк) охватный r
    // сильно переоценивает ширину и давал шторм ложных спасений
    const legalR = tmpWallBodies.length ? Math.max(radiusAt(it.p.y), FUNNEL.R1) : radiusAt(it.p.y);
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
    }
  }
  return rescued;
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
