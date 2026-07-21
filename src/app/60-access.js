// ===== 60-access: физическая доступность, подсчёт пар =====

const DIM_GREY = new THREE.Color(0xb6bcc6).convertSRGBToLinear(); // вуаль недоступных: светлый нейтральный под белое поле
const raycaster = new THREE.Raycaster();
function aliveMeshes(){ return items.filter(i=>i.alive).map(i=>i.mesh); }

// Доступность — СТРОГО СВЕРХУ и ПО ФОРМЕ, независимо от камеры.
// История двух багов, которые это чинит (владелец зафиксировал их как корневые):
// 1) луч в ЦЕНТР предмета: у тора/узла в центре ДЫРКА — луч пролетал насквозь,
//    полностью видимый бублик считался «перекрытым» с ракурсов, где дырка
//    смотрит на наблюдателя (матч работал с одного ракурса и не работал с другого);
// 2) лучи ОТ КАМЕРЫ: доступность (и серая вуаль) менялись при вращении камеры —
//    предметы «тускнели в зависимости от ракурса».
// Теперь: ВЕЕР лучей «к небу» по сэмплам ФИЗИЧЕСКОЙ формы предмета (ниже).
// Камера ни при чём. Механика включается сложностью Hard (CFG.hard);
// по умолчанию доступно всё живое, кроме сюрприза — он всегда честный.
const _apt = new THREE.Vector3();
// Лучи бьём ЧЕРЕЗ RAPIER (нативный BVH, микросекунды на луч; three-raycast
// по мешам стоил 86-106 мс на refresh). Сэмплы — из item.samples,
// построенных по ФИЗИЧЕСКИМ коллайдерам (50-physics buildAccessSamples).
//
// ВЕЕР «К НЕБУ»: вертикаль + 6 наклонных (~35°). Чисто вертикальный луч
// хоронил визуально открытые предметы под НАВИСАЮЩИМ соседом (кейс владельца:
// два открытых додекаэдра рядом не матчились — над одним нависал конус).
// Предмет доступен, если хоть одна точка его физформы видит небо в конусе
// ~35°. Стены чаши луч честно блокируют (сквозь стекло пальцем не залезть).
const SKY_DIRS = [{ x:0, y:1, z:0 }];
for (let a = 0; a < 6; a++){
  const th = a/6 * Math.PI*2, s = Math.sin(0.6), c = Math.cos(0.6); // 0.6 рад ≈ 34°
  SKY_DIRS.push({ x: Math.cos(th)*s, y: c, z: Math.sin(th)*s });
}
let _rapierRay = null;
function isAccessible(item){
  // лёгкая сложность: любая пара доступна. Исключение — СЮРПРИЗ: он всегда
  // «по-честному» перекрыт (иначе +150 снимался бы тапом с первой секунды)
  if (!CFG.hard && !item.surprise) return true;
  if (!item.samples || !item.samples.length) return false;
  if (!_rapierRay) _rapierRay = new RAPIER.Ray({ x:0, y:0, z:0 }, { x:0, y:1, z:0 });
  const q = item.mesh.quaternion;
  const n = item.samples.length / 3;
  for (let k = 0; k < n; k++){
    _apt.set(item.samples[k*3], item.samples[k*3+1], item.samples[k*3+2])
      .applyQuaternion(q).add(item.p);
    _rapierRay.origin.x = _apt.x; _rapierRay.origin.y = _apt.y; _rapierRay.origin.z = _apt.z;
    for (let d = 0; d < SKY_DIRS.length; d++){
      _rapierRay.dir = SKY_DIRS[d];
      // старт ВНУТРИ собственного коллайдера — своё тело исключаем из каста
      const hit = world.castRay(_rapierRay, 40, true, null, null, null, item.body);
      if (!hit) return true; // луч дошёл до неба
    }
  }
  return false;
}
// Динамический радиус совпадения: сжимается вместе с поверхностью кучи
// (см. комментарий в 00-config). Пол — MATCH_R_MIN, но ручной baseRadius
// меньше пола (дебаг/тесты) уважается как есть.
function updateMatchRadius(){
  if (!level) return;
  // цепная реакция: радиус БОЛЬШЕ НЕ «вся чаша» — потолок зазора 1.1
  // (спека владельца 2026-07-21: «даже в турборежиме не больше 1.1»);
  // фишки цепи остаются: досыпка, молнии, ×2, продление серии
  if (chainUntil > performance.now()){ CFG.matchRadius = COMBO_RADIUS; return; }
  let top = 0, aliveCnt = 0;
  for (const it of items) if (it.alive){ top = Math.max(top, it.p.y + it.r); if (!it.surprise) aliveCnt++; }
  // ЭНДШПИЛЬ: остатки лежат на дне дальше друг от друга, чем зажатый в пол
  // радиус. Аудит ботом: 100% встрясок эндшпиля — из-за расстояния, ни одной
  // из-за захоронения. При <=8 живых радиусная проверка снимается.
  if (aliveCnt <= 8){ CFG.matchRadius = 99; return; }
  const k = level.topY0 > 0 ? radiusAt(top) / radiusAt(level.topY0) : 1;
  const base = CFG.baseRadius;
  CFG.matchRadius = Math.max(Math.min(MATCH_R_MIN, base), Math.min(base, base * k));
  // комбо-лихорадка: радиус растёт ЛЕСЕНКОЙ по ступеням серии (не сразу
  // до максимума — «мгновенные 3.5» владелец забраковал как слишком лёгкие)
  if (comboUntil > performance.now() && comboLevel > 0){
    const t = Math.min(1, comboLevel / COMBO_STEPS);
    CFG.matchRadius = CFG.matchRadius + (COMBO_RADIUS - CFG.matchRadius) * t;
  }
}
// Состояние комбо: до какого момента горит буст, время последнего матча,
// длина серии; цепная реакция: до какого момента, промахи на старте, тик досыпки
let comboUntil = 0, lastMatchMs = 0, comboCount = 0, comboLevel = 0;
let chainUntil = 0, chainStartMisses = 0, chainNextDrop = 0, chainNextBolt = 0;
let accFlips = 0; // диагностика: сколько предметов сменили доступность за последний refresh
function refreshAccessibility(){
  updateMatchRadius();
  accFlips = 0;
  for (const it of items){
    if (!it.alive) continue;
    const was = it.accessible;
    // animating (тело удалено, растворяется) лучи не блокирует — без гварда
    // «воскресал» в счётчике доступных пар и мигал цифрой HUD
    it.accessible = !it.animating && isAccessible(it);
    if (it.accessible !== was) accFlips++;
    // вуаль применяется ПЛАВНО в tickVeil (мгновенные скачки цвета всей кучи
    // при пересчёте читались как «цвета скачут» — жалоба владельца);
    // у animating вуаль не трогаем — пусть дотлевает как есть
    if (!it.animating) it.veilTarget = (CFG.highlight && !it.surprise && !it.accessible) ? 0.65 : 0;
  }
}
// Плавное затухание/снятие вуали (~0.25 с), из главного цикла каждый кадр.
// Недоступные — серая вуаль (лерп к нейтральному), НЕ умножение цвета
// (умножение давало «грязные» тёмно-зелёный и коричневый). Сюрприз не
// вуалится — должен золотиться сквозь щели.
function tickVeil(dt){
  const step = dt / 0.25;
  for (const it of items){
    if (!it.alive) continue;
    const target = it.veilTarget || 0, cur = it.veilK || 0;
    if (cur === target) continue;
    const next = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    it.veilK = next;
    it.mesh.material.color.copy(it.baseColor).lerp(DIM_GREY, next);
  }
}
// Дистанция пары = ЗАЗОР между поверхностями (охватные радиусы); может быть
// слегка отрицательной при касании/нахлёсте — это «вплотную», всегда матч
function pairDist(a, b){ return a.p.distanceTo(b.p) - a.r - b.r; }
// ЕДИНСТВЕННОЕ правило совпадения (тап/бот/подсказка/прицел/счётчик пар/
// детект тупика — все ходят сюда; новые проверки писать ТОЛЬКО через
// pairMatch). МЕТРИКА v3 (спека владельца 2026-07-20): ИСТИННЫЙ зазор
// между физическими поверхностями через GJK Rapier — охватные сферы
// анизотропно щедрили продолговатым (стейк плашмя «матчился сквозь воздух»:
// видимый зазор 1.0 = охватный −0.46). Охватный зазор остаётся ФИЛЬТРОМ
// грубой фазы: он НИЖНЯЯ граница истинного, отсечение честное. Компаунды
// (тор/узел/спираль/чайник) — перебор пар коллайдеров с ранним выходом;
// дырка тора при этом «настоящая» (расстояние до трубки, не до диска).
function trueGapWithin(a, b, r){
  const na = a.body.numColliders(), nb = b.body.numColliders();
  for (let i = 0; i < na; i++){
    const ca = a.body.collider(i);
    for (let j = 0; j < nb; j++){
      const sc = ca.contactCollider(b.body.collider(j), r);
      if (sc && sc.distance <= r) return true;
    }
  }
  return false;
}
function pairMatch(a, b){
  if (!CFG.radiusOn) return true;
  const r = CFG.matchRadius;
  if (r >= 9) return true;                 // цепная реакция/эндшпиль: вся чаша
  if (pairDist(a, b) > r) return false;    // грубая фаза (без GJK)
  if (!a.body || !b.body) return true;     // страховка: тело уже снято — охватный вердикт
  return trueGapWithin(a, b, r);
}
function availablePairs(){
  const byKey = {};
  for (const it of items) if (it.alive && it.accessible) (byKey[it.key] = byKey[it.key]||[]).push(it);
  let cnt = 0;
  for (const k in byKey){
    const arr = byKey[k];
    for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
      if (pairMatch(arr[i], arr[j])) cnt++;
    }
  }
  return cnt;
}
// Есть ли вообще возможный матч (два живых предмета одного типа), где угодно
function hasAnyPair(){
  const cnt = {};
  for (const it of items){
    if (!it.alive) continue;
    cnt[it.key] = (cnt[it.key]||0) + 1;
    if (cnt[it.key] >= 2) return true;
  }
  return false;
}
