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
// Сколько предметов СЧИТАЕТСЯ для эндшпиля. Камни и клад не входят (спека
// 2026-07-22): они не пары, и ∞-радиус не должен ждать, пока их уберут.
// ⚠️ ФУНКЦИЯ, А НЕ ПОВТОРНЫЙ ЦИКЛ: на этом числе стоят ОБЕ ступени эндшпиля и
// страж сьюта. Своя копия подсчёта у стража означала бы, что он проверяет своё
// представление о правиле, а не правило (закон проекта, пойманный пять раз).
function aliveCountForRadius(){
  let n = 0;
  for (const it of items) if (it.alive && !it.surprise && !it.frozen) n++;
  return n;
}
function updateMatchRadius(){
  if (!level) return;
  let top = 0;
  const aliveCnt = aliveCountForRadius();
  for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
  // ЭНДШПИЛЬ: остатки лежат на дне дальше друг от друга, чем зажатый в пол
  // радиус. Аудит ботом: 100% встрясок эндшпиля — из-за расстояния, ни одной
  // из-за захоронения. При <=8 живых радиусная проверка снимается.
  // ⚠️ Проверка ПЕРВАЯ, раньше цепи: инвариант владельца «эндшпильный ∞
  // СОХРАНЁН» — цепная реакция (потолок 1.1) не имеет права его душить,
  // иначе последние пары в цепи снова не совмещаются (анти-фрустрация).
  if (aliveCnt <= 8){ CFG.matchRadius = 99; return; }
  // МЯГКАЯ СТУПЕНЬ: предметов меньше десяти И встрясок почти нет — снимаем
  // радиусную проверку так же, как в жёсткой ступени (слово владельца
  // 2026-08-11). Стоит СРАЗУ за ней и до всех прочих веток по той же причине:
  // это анти-фрустрация, её не должны душить ни сжатие кучи, ни штраф промаха.
  if (aliveCnt < ENDGAME_SOFT_ALIVE &&
      (level.shakes + (typeof purchasedShakes === 'function' ? purchasedShakes() : 0)) <= ENDGAME_SOFT_SHAKES){
    CFG.matchRadius = 99; return;
  }
  const k = level.topY0 > 0 ? radiusAt(top) / radiusAt(level.topY0) : 1;
  const base = CFG.baseRadius;
  let r = Math.max(Math.min(MATCH_R_MIN, base), Math.min(base, base * k));
  // цепная реакция: радиус БОЛЬШЕ НЕ «вся чаша» — потолок зазора 1.1
  // (спека владельца 2026-07-21: «даже в турборежиме не больше 1.1»);
  // фишки цепи остаются: досыпка, молнии, ×2, продление серии.
  // Буст только ВВЕРХ: ручной слайдер выше потолка цепью не срезается
  // ⚠️ ВЕТКА ЦЕПИ БОЛЬШЕ НЕ ВЫХОДИТ ДОСРОЧНО (2026-08-11): ниже стоит ПОТОЛОК
  // ШТРАФА ЗА ПРОМАХ, и он обязан накрывать в том числе турбо — иначе «промах
  // сильно сбрасывает» не выполнялось бы ровно там, где игрок разогнался.
  // Значение ветки не изменилось: тот же `Math.max(r, COMBO_RADIUS)`.
  if (chainUntil > performance.now()){
    r = Math.max(r, COMBO_RADIUS);
  } else if (comboUntil > performance.now() && comboLevel > 0){
    // комбо-лихорадка: радиус растёт ЛЕСЕНКОЙ по ступеням серии (не сразу
    // до максимума — «мгновенные 3.5» владелец забраковал как слишком лёгкие).
    // Тоже только ВВЕРХ: при базе выше потолка лесенка радиус не понижает
    const t = Math.min(1, comboLevel / COMBO_STEPS);
    r = Math.max(r, r + (COMBO_RADIUS - r) * t);
  }
  // ШТРАФ ЗА ПРОМАХ — ПОТОЛОК ПОВЕРХ ВСЕГО, кроме эндшпильного ∞ (он вышел
  // раньше). Именно потолок, а не присваивание: сжатие кучи и лесенка серии
  // продолжают жить своей жизнью, штраф лишь не пускает результат выше себя.
  const пот = missRadiusCap();
  if (пот !== null) r = Math.min(r, пот);
  CFG.matchRadius = r;
}
// ===== ШТРАФ РАДИУСА ЗА ПРОМАХ (спека владельца 2026-08-11) =====
// «при ошибке на какое-то время сильно сбрасывать до 0.3, но через несколько
// секунд возвращать» — момент промаха, 0 = штрафа нет.
let missRadiusAt = 0;
function noteMissRadius(){ missRadiusAt = performance.now(); updateMatchRadius(); }
function missRadiusClear(){ missRadiusAt = 0; }
function missRadiusActive(now){
  return missRadiusAt > 0 && ((now || performance.now()) - missRadiusAt) < MATCH_R_MISS_MS;
}
// Потолок штрафа: `MATCH_R_MISS` в момент промаха, линейно к базе за
// `MATCH_R_MISS_MS`. ⚠️ Возвращает null, когда штрафа нет, а НЕ базу: потолок
// «равный базе» отличается от «потолка нет» ровно в тот день, когда база
// уедет ниже (ползунком в панели), и тогда штраф молча стал бы БУСТОМ.
function missRadiusCap(now){
  if (!missRadiusAt) return null;
  const t = ((now || performance.now()) - missRadiusAt) / MATCH_R_MISS_MS;
  if (t >= 1) return null;
  return MATCH_R_MISS + (CFG.baseRadius - MATCH_R_MISS) * Math.max(0, t);
}
// ⚠️⚠️ ВОССТАНОВЛЕНИЕ ИДЁТ ПО РЕАЛЬНЫМ ЧАСАМ, ПОЭТОМУ ЕГО НАДО ТИКАТЬ ИЗ ЦИКЛА.
// `refreshAccessibility` (а с ним и `updateMatchRadius`) в штиле НЕ тикает
// вовсе — куча спит. Игрок промахнулся, замер на пять секунд и тапнул: без
// этого тика радиус остался бы 0.3 навсегда. Тот же класс, что у «комбо-буст
// обязан погаснуть и на СПЯЩЕЙ куче» в 99-main.
// Отдаёт true РОВНО на последнем тике — чтобы вызывающий обновил HUD один раз.
function missRadiusTick(now){
  if (!missRadiusAt) return false;
  const кончился = !missRadiusActive(now);
  if (кончился) missRadiusAt = 0;
  updateMatchRadius();
  return кончился;
}
// Состояние комбо: до какого момента горит буст, время последнего матча,
// длина серии; цепная реакция: до какого момента, промахи на старте, тик досыпки
let comboUntil = 0, lastMatchMs = 0, comboCount = 0, comboLevel = 0;
let chainUntil = 0, chainStartMisses = 0, chainNextDrop = 0, chainNextBolt = 0;
// СЕРИЯ ТУРБО (спека владельца 2026-07-21): номер цепи в непрерывной связке —
// 1 у обычной, 2+ когда следующее турбо собрано ВНУТРИ активного (перезапуск
// окна в doMatch). >=2 — сигнал интерфейсу для глаз eyes-5. chainCarry —
// дробный аккумулятор досыпки (2.6 шт/тик не спавнится целиком за раз).
let chainSeries = 0, chainCarry = 0;
let veilPinned = false; // тюнер держит вуаль на всех — refresh её не перебивает
let accFlips = 0; // диагностика: сколько предметов сменили доступность за последний refresh
// ⚠️⚠️ ЧАСТИЧНЫЙ ОБХОД — ЛЕЧЕНИЕ ДЖАНКА НА HARD (замер 2026-08-14, ревизия по
// жалобе владельца «стало тупить больше»). ОДИН вызов веера лучей по всей куче
// стоит 79-86 мс (CPU ×4, ур.11/20), а тик шёл КАЖДЫЕ 300 мс, пока куча
// бодрствует, — то есть каждые 300 мс кадр застревал почти на 0.1 с. Замер
// кадра: Easy p95 33.5/33.8 против HARD 93.0/104.6, худший кадр 76 против 180.
// ⛔ МЕХАНИКА НЕ ТРОНУТА: тот же веер, те же лучи, тот же результат на предмет.
// Меняется только РАСПРЕДЕЛЕНИЕ работы: периодический тик обходит 1/ACC_SLICES
// кучи по кругу, полный цикл — 8 тиков. События (матч, встряска, регены, финал)
// по-прежнему зовут ПОЛНЫЙ обход, поэтому реакция на действие игрока мгновенна,
// как была; частичный — только фоновая переоценка осевшей кучи.
// ⚠️ Курсор ЖИВЁТ МЕЖДУ ВЫЗОВАМИ и обходит по живым: удаление предметов его не
// ломает (индекс берётся по модулю живой длины на каждом шаге).
const ACC_SLICES = 8;
let accCursor = 0;
// ⚠️⚠️ ЛОКАЛЬНЫЙ ПЕРЕСЧЁТ ВОКРУГ СОБЫТИЯ (2026-08-14, владелец подтвердил: у
// него включён HARD, то есть веер работает на полную). Полный обход стоит
// 79-86 мс (CPU ×4) и вызывался ПОСЛЕ КАЖДОГО СОВМЕЩЕНИЯ — то есть рывок
// садился на самое частое действие игрока.
// ФИЗИЧЕСКОЕ ОБОСНОВАНИЕ ЛОКАЛЬНОСТИ: лучи идут ВВЕРХ, к небу. Удаление группы
// открывает небо тем, кто лежал ПОД ней и рядом, — то есть внутри столба над
// точкой события. Далёкий предмет своей доступности от этого не меняет.
// ⚠️ РАДИУС ЩЕДРЫЙ (ACC_NEAR_R), а не «по размеру группы»: цена ошибки
// несимметрична — лишний предмет в выборке стоит доли миллисекунды, а
// пропущенный живёт с устаревшей вуалью до фонового круга.
// ⚠️ И ГЛАВНАЯ СТРАХОВКА: фоновый порционный обход всё равно проходит ВСЮ кучу
// за ~0.8 с, поэтому любая промашка локальности самоисцеляется — точность
// держит фон, скорость держит локальность.
// ⛔ ЦИЛИНДР, А НЕ СФЕРА: сравниваем по XZ и берём всех, кто ВЫШЕ точки минус
// запас. Предмет строго над удалённым может быть далеко по высоте, и сфера
// его бы не поймала — а он как раз тот, кто теперь видит небо.
const ACC_NEAR_R = 4.2;
function refreshAccessibilityNear(p, доп){
  updateMatchRadius();
  accFlips = 0;
  const R = ACC_NEAR_R + (доп || 0), R2 = R * R;
  for (const it of items){
    if (!it.alive) continue;
    const dx = it.p.x - p.x, dz = it.p.z - p.z;
    if (dx*dx + dz*dz > R2) continue;
    if (it.p.y < p.y - 2.0) continue;          // строго ниже события — не затронут
    const was = it.accessible;
    it.accessible = !it.animating && isAccessible(it);
    if (it.accessible !== was) accFlips++;
    if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
  }
}
function refreshAccessibility(частично){
  updateMatchRadius();
  accFlips = 0;
  if (частично){
    const живые = [];
    for (const it of items) if (it.alive) живые.push(it);
    if (!живые.length) return;
    const доля = Math.max(1, Math.ceil(живые.length / ACC_SLICES));
    for (let k = 0; k < доля; k++){
      const it = живые[(accCursor + k) % живые.length];
      const was = it.accessible;
      it.accessible = !it.animating && isAccessible(it);
      if (it.accessible !== was) accFlips++;
      if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
    }
    accCursor = (accCursor + доля) % живые.length;
    return;
  }
  accCursor = 0;
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
    // камни вуалью не мигают (спека 2026-07-22: «иная природа» читается
    // фактурой); лучи их тела при этом честно блокируют — завал настоящий
    // ⚠️ ПИН ТЮНЕРА выше доступности: без него превью «вуаль на всех» жило
    // максимум до следующего тика refresh (300 мс) и молча растворялось —
    // ползунки силы вуали были бы неподкручиваемы.
    if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
  }
}
// Плавное затухание/снятие вуали (~0.25 с), из главного цикла каждый кадр.
// Недоступные — серая вуаль (лерп к нейтральному), НЕ умножение цвета
// (умножение давало «грязные» тёмно-зелёный и коричневый). Сюрприз не
// вуалится — должен золотиться сквозь щели.
// ⚠️ РЕЖИМ 'desat' (спека владельца 2026-07-23) вуалит В ШЕЙДЕРЕ — иначе
// текстурные модели (114 из 130 в кадре) обесцветить НЕЛЬЗЯ: их material.color
// белый, цвет несёт атлас, и лерп color к серому лишь притемнял его.
// Лерп по color оставлен ЖИВЫМ фолбэком для материалов без нашего патча
// (бомба на MeshBasicMaterial, аварийный откат CFG.matcap=false) — без него
// они молча перестали бы вуалиться вовсе.
function applyVeil(it, k){
  const mat = it.mesh.material;
  const sh = mat.userData && mat.userData.shader;
  if (VEIL_MODE !== 'tint' && sh){
    sh.uniforms.uVeil.value = k;
    // 'fade': прозрачность поверх обесцвечивания. transparent выставлен ОДИН
    // раз при создании материала (переключать на лету = перекомпиляция).
    if (VEIL_MODE === 'fade') mat.opacity = 1 - k * (1 - VEIL_ALPHA);
    return;
  }
  mat.color.copy(it.baseColor).lerp(DIM_GREY, k);
}
// Вуаль ВСЕМ живым разом: превью в тюнере и изоляция замеров (доля
// недоступных гуляет от сида к сиду, на этом шуме дельта-замер тонет).
// k = число: ПРИБИТЬ вуаль всем на этом значении; k = null: отпустить,
// дальше вуаль снова ведёт доступность.
function veilAllItems(k){
  if (k === null){ veilPinned = false; refreshAccessibility(); return 0; }
  veilPinned = true;
  let n = 0;
  for (const it of items) if (it.alive){ it.veilK = k; it.veilTarget = k; applyVeil(it, k); n++; }
  return n;
}
function tickVeil(dt){
  const step = dt / 0.25;
  for (const it of items){
    if (!it.alive) continue;
    const target = it.veilTarget || 0, cur = it.veilK || 0;
    if (cur === target) continue;
    const next = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    it.veilK = next;
    applyVeil(it, next);
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
  if (r >= 9) return true;                 // эндшпиль (<=8 живых): вся чаша
  if (pairDist(a, b) > r) return false;    // грубая фаза (без GJK)
  // тело уже снято (animating/удалён): предмета физически нет — НЕ матч.
  // Прежний охватный вердикт «true» тихо откатывал метрику v3 на старую
  // щедрую сферу именно в гонке с растворением
  if (!a.body || !b.body) return false;
  return trueGapWithin(a, b, r);
}
function availablePairs(){
  const byKey = {};
  // animating отсекаем и здесь: между refresh'ами тапнутый предмет ещё числится
  // accessible, а его тело уже снято — пары с ним фантомные
  for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key] = byKey[it.key]||[]).push(it);
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
