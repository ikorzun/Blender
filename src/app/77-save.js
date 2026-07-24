// ===== 77-save: живучий сейв v1 (localStorage + Bridge storage) =====
// Монеты — ПАРА МОНОТОННЫХ счётчиков earned/spent (баланс = разность):
// мерж расхождений через max НЕ дюпит валюту (наивный max по балансу
// откатывал бы траты при сбое записи — вердикт аудита плана). Звёзды —
// по-уровнево max. Bridge storage не на всех платформах реальный —
// тогда честно остаёмся на localStorage.
const SAVE_KEY = 'mixer_save_v1';
// gen — ПОКОЛЕНИЕ сейва: инкрементируется сбросом прогресса. Монотонный
// max-мерж иначе воскрешал бы обнулённые монеты из отставшей облачной копии
// (Bridge storage мог не принять нули, а мерж по max их «поднимал» обратно).
// ⚠️ Чек-лист нового поля сейва: добавить в Save, в ОБЕ ветки mergeSave
// (перенос при from.gen>gen и мерж при равных), в resetProgress.
// ac — НАКОПЛЕНИЕ ПО ТИПАМ (спека владельца 2026-07-22): пожизненные
// монотонные счётчики совмещённых предметов КАЖДОГО типа (ключ = имя типа
// из ассетов, TYPES[].name). Ступень/множитель ВЫЧИСЛЯЮТСЯ из счётчика
// (accTier/accMult) и в сейве не дублируются — нечему расходиться.
// Мерж: max по ключу (образец he/hs), gen-эпоха уважается. При смене
// партии моделей осиротевшие ключи НЕ теряются (лог в accAuditOrphans).
// se/ss — ЗВЁЗДЫ-ВАЛЮТА (решение владельца 2026-07-23), earned/spent по
// образцу монет: баланс = разность, ОБА счётчика монотонные и мержатся по
// max. ⚠️ ПОЧЕМУ НЕ ОДНО ПОЛЕ-БАЛАНС: при max-мерже потраченное
// ВОССТАНАВЛИВАЛОСЬ бы из отставшей облачной копии — валюта дюпится
// бесконечно (вердикт аудита плана, та же грабля, что была у монет).
// stars[lv] — это РЕЙТИНГ уровня (1..3), он НЕ кошелёк: max-мерж для него
// корректен, тратами не трогается.
// bo — купленные бустом ступени по типам (монотонно, мерж max по ключу).
// sm — флаг разовой миграции рейтинга в стартовый баланс (монотонный 0->1).
const Save = { ce: 0, cs: 0, he: 3, hs: 0, se: 0, ss: 0, stars: {}, ac: {}, bo: {}, sm: 0, gen: 0 }; // he/hs — подсказки (старт 3, спека владельца)
function coins(){ return Math.max(0, Save.ce - Save.cs); }
function totalStars(){ let s = 0; for (const k in Save.stars) s += Save.stars[k]; return s; }
function mergeSave(into, from){
  if (!from) return;
  const gi = into.gen || 0, gf = from.gen || 0;
  if (gf > gi){
    // чужая копия из БОЛЕЕ НОВОГО поколения (после сброса): берём её целиком
    into.ce = from.ce || 0; into.cs = from.cs || 0;
    into.he = from.he != null ? from.he : 3; into.hs = from.hs || 0;
    into.se = from.se || 0; into.ss = from.ss || 0; into.sm = from.sm || 0;
    into.stars = Object.assign({}, from.stars || {});
    into.ac = Object.assign({}, from.ac || {});
    into.bo = Object.assign({}, from.bo || {});
    into.gen = gf;
    return;
  }
  if (gi > gf) return; // чужая копия из СТАРОГО поколения — игнор (не воскрешаем)
  into.ce = Math.max(into.ce || 0, from.ce || 0);
  into.cs = Math.max(into.cs || 0, from.cs || 0);
  into.he = Math.max(into.he || 3, from.he || 3); // старые сейвы без he получают стартовые 3
  into.hs = Math.max(into.hs || 0, from.hs || 0);
  // ⚠️ ЗВЁЗДЫ-ВАЛЮТА: max по ОБОИМ счётчикам. Потраченное (ss) не
  // откатывается отставшей копией — это и есть защита от дюпа.
  into.se = Math.max(into.se || 0, from.se || 0);
  into.ss = Math.max(into.ss || 0, from.ss || 0);
  into.sm = Math.max(into.sm || 0, from.sm || 0); // миграция разовая на все устройства
  const st = from.stars || {};
  for (const k in st) into.stars[k] = Math.max(into.stars[k] || 0, st[k] || 0);
  if (!into.ac) into.ac = {};
  const ac = from.ac || {};
  for (const k in ac) into.ac[k] = Math.max(into.ac[k] || 0, ac[k] || 0);
  if (!into.bo) into.bo = {};
  const bo = from.bo || {};
  for (const k in bo) into.bo[k] = Math.max(into.bo[k] || 0, bo[k] || 0);
}
function loadSave(){
  try { mergeSave(Save, JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch(e){}
}
function commitSave(){
  const json = JSON.stringify(Save);
  try { localStorage.setItem(SAVE_KEY, json); } catch(e){}
  // Bridge — асинхронно, fire-and-forget: сбой не критичен (мерж монотонный)
  try {
    if (window.bridge && window.bridge.storage) window.bridge.storage.set(SAVE_KEY, json).catch(()=>{});
  } catch(e){}
}
// после инициализации Bridge (78-ads): подтянуть облачную копию и смержить
function bridgeSyncSave(){
  try {
    if (!(window.bridge && window.bridge.storage)) return;
    window.bridge.storage.get(SAVE_KEY).then(v => {
      if (!v) return;
      try { mergeSave(Save, typeof v === 'string' ? JSON.parse(v) : v); } catch(e){}
      migrateStarsToWallet(); // облачная копия могла быть домиграционной
      commitSave(); updateHUD(); fireStarsChange();
    }).catch(()=>{});
  } catch(e){}
}
function hints(){ return Math.max(0, (Save.he || 0) - (Save.hs || 0)); }
function addHints(n){ if (n > 0){ Save.he += n; commitSave(); } }
function spendHint(){ if (hints() < 1) return false; Save.hs += 1; commitSave(); return true; }
function addCoins(n){ if (n > 0){ Save.ce += n; commitSave(); } }
function spendCoins(n){ if (coins() < n) return false; Save.cs += n; commitSave(); return true; }
function setStars(lv, n){ if ((Save.stars[lv] || 0) < n){ Save.stars[lv] = n; commitSave(); } }

// ===== ЗВЁЗДЫ-ВАЛЮТА: кошелёк (решение владельца 2026-07-23) =====
// Подписка для интерфейса: баланс поменялся (награда/трата/миграция).
const starChangeCbs = [];
function onStarsChange(cb){ if (typeof cb === 'function') starChangeCbs.push(cb); }
function fireStarsChange(){
  const ev = { balance: starBalance(), earned: Save.se || 0, spent: Save.ss || 0 };
  for (const cb of starChangeCbs){ try { cb(ev); } catch(e){} }
  try { updateHUD(); } catch(e){}
}
function starBalance(){ return Math.max(0, (Save.se || 0) - (Save.ss || 0)); }
// Номинал победы: по рейтингу + надбавка за номер уровня (поздние уровни
// длиннее — платят больше). Чистая функция, ею же считается миграция.
function starAward(lv, stars){
  if (!(stars > 0)) return 0;
  return (STAR_AWARD[Math.min(3, stars)] || 0) + STAR_LEVEL_BONUS * Math.max(1, lv | 0);
}
// Победа: платим ДЕЛЬТУ к прошлому рейтингу этого уровня. Перепрохождение
// без улучшения = 0 (анти-ферма: ур.1 короткий и даёт лёгкие 3★).
// Рейтинг обновляется отдельно (setStars) и тратами не трогается.
function awardStarsForWin(lv, stars){
  const prev = Save.stars[lv] || 0;
  const gain = Math.max(0, starAward(lv, stars) - starAward(lv, prev));
  if (gain > 0) Save.se = (Save.se || 0) + gain;
  setStars(lv, stars);
  commitSave();
  if (gain > 0) fireStarsChange();
  return gain;
}
function addStars(n){ if (n > 0){ Save.se = (Save.se || 0) + n; commitSave(); fireStarsChange(); } }
function spendStars(n){
  n = Math.max(0, n | 0);
  if (starBalance() < n) return false;
  Save.ss = (Save.ss || 0) + n;
  commitSave(); fireStarsChange();
  return true;
}
// РАЗОВАЯ МИГРАЦИЯ существующих сейвов: у игроков уже накоплен рейтинг —
// начисляем стартовый баланс по тому же номиналу, прогресс не обнуляем.
// Идемпотентна: флаг sm монотонный и мержится по max, поэтому второе
// устройство/второй запуск повторно не начислит.
function migrateStarsToWallet(){
  if (Save.sm) return 0;
  let sum = 0;
  for (const lv in Save.stars) sum += starAward(parseInt(lv, 10) || 1, Save.stars[lv] || 0);
  Save.sm = 1;
  if (sum > 0) Save.se = (Save.se || 0) + sum;
  commitSave();
  if (sum > 0){ try { Telemetry.ev('stars_migrate', { n: sum }); } catch(e){} }
  return sum;
}

// ===== BOOST: покупка ступени накопления за звёзды =====
// Купленные ступени живут ОТДЕЛЬНО от счётчика совмещений (ac): ac — это
// «сколько спасено» (витрина/музей показывают честную цифру), bo — «сколько
// докуплено». Итоговая ступень = сумма, с общим капом.
function boostTier(name){ return (Save.bo && Save.bo[name]) || 0; }
function boostPrice(name){
  const t = accTier(name);
  if (t >= ACC_TIER_CAP) return null; // выше капа покупать нечего
  return Math.round(BOOST_PRICE_BASE * Math.pow(BOOST_PRICE_MULT, t));
}
function canBoost(name){ const p = boostPrice(name); return p != null && starBalance() >= p; }
function buyBoost(name){
  const p = boostPrice(name);
  if (p == null) return { ok: false, reason: 'capped', tier: accTier(name) };
  if (starBalance() < p) return { ok: false, reason: 'insufficient', price: p, balance: starBalance() };
  if (!Save.bo) Save.bo = {};
  Save.ss = (Save.ss || 0) + p;          // трата — через монотонный счётчик
  Save.bo[name] = boostTier(name) + 1;
  commitSave(); fireStarsChange();
  try { Telemetry.ev('boost', { t: name, tier: accTier(name), price: p }); } catch(e){}
  return { ok: true, price: p, tier: accTier(name), mult: accMult(name),
    balance: starBalance(), next: boostPrice(name) };
}
// Полный сброс прогресса (кнопка в ⚙️): нули пишутся И в облако Bridge, а
// gen++ делает новое поколение СТАРШЕ любой отставшей облачной копии — даже
// если запись нулей в облако сорвётся, mergeSave старую копию не воскресит
function resetProgress(){
  Save.gen = (Save.gen || 0) + 1;
  Save.ce = 0; Save.cs = 0; Save.he = 3; Save.hs = 0; Save.stars = {}; Save.ac = {};
  Save.se = 0; Save.ss = 0; Save.bo = {}; Save.sm = 1; // sm=1: мигрировать нечего, рейтинг пуст
  commitSave();
  levelNum = 1;
  try { localStorage.setItem('mixer_level', '1'); } catch(e){}
}

// ===== НАКОПЛЕНИЕ ПО ТИПАМ: API (контракт для ИНТЕРФЕЙСА, см. WORKSTREAMS).
// Пороги — ряд ×2+100 владельца: 100/300/700/1500/3100/6300... = 100·(2^n−1).
function accThreshold(t){ return t <= 0 ? 0 : 100 * (Math.pow(2, t) - 1); }
function accCount(name){ return (Save.ac && Save.ac[name]) || 0; }
// Ступени, ЗАРАБОТАННЫЕ совмещениями (без учёта покупок) — по ним считается
// прогресс-полоска витрины: игрок должен видеть честное «спасено N из M».
function accCountTier(name){
  const c = accCount(name);
  let t = 0;
  while (t < ACC_TIER_CAP && c >= accThreshold(t + 1)) t++;
  return t;
}
// ИТОГОВАЯ ступень = заработанные + купленные бустом (общий кап).
function accTier(name){ return Math.min(ACC_TIER_CAP, accCountTier(name) + boostTier(name)); }
function accMult(name){ return 1 + ACC_MULT_STEP * accTier(name); }
function accNext(name){ // порог следующей ЗАРАБАТЫВАЕМОЙ ступени или null на капе
  const t = accCountTier(name);
  return t >= ACC_TIER_CAP ? null : accThreshold(t + 1);
}
// Событие апа ступени: интерфейс вешает всплывашку через onAccTierUp(cb);
// колбэк получает { name, tier, mult, item } В МОМЕНТ пересечения порога
// (из doMatch). Ошибка в чужом колбэке не роняет матч (try/catch).
const accTierUpCbs = [];
function onAccTierUp(cb){ if (typeof cb === 'function') accTierUpCbs.push(cb); }
function accAdd(name, n, item){
  if (!name || !(n > 0)) return;
  if (!Save.ac) Save.ac = {};
  const before = accTier(name);
  Save.ac[name] = accCount(name) + n;
  const after = accTier(name);
  commitSave();
  if (after > before){
    try { Telemetry.ev('acc_up', { t: name, tier: after }); } catch(e){}
    // ev.name — ЧЕЛОВЕЧЕСКИЙ ярлык (его рендерит всплывашка ИНТЕРФЕЙСА),
    // ev.key — ключ ассета; item ЖИВОЙ: mesh валиден, но тело Rapier уже
    // уничтожено и растворение стартовало — портрет снимать сразу в колбэке
    const ev = { name: accLabel(name), key: name, tier: after, mult: accMult(name), item: item || null };
    for (const cb of accTierUpCbs){ try { cb(ev); } catch(e){} }
  }
}
// ЧЕЛОВЕЧЕСКИЕ ЯРЛЫКИ ТИПОВ (просьба ИНТЕРФЕЙСА 2026-07-22: витрина музея
// показывала ключи ассетов). Правило: срезать префикс пачки + заглавная
// буква; уродцев-склейки — в карте исключений. Ярлыки EN (как кнопки).
// ⚠️ Список префиксов = ВСЕ пачки TYPES (запрос ИНТЕРФЕЙСА 2026-07-22: в
// витрине выходило «Brickround»/«Piratebarrel»). Заводишь новую пачку —
// добавь её префикс сюда, иначе ярлык поедет вместе с ключом ассета.
// Кирпичам добавлено слово «brick»: их имена — голые формы (round/bar/duo/
// stud...), и в списке музея «Round» без опоры не читается; пиратские
// предметы самостоятельны (Barrel/Cannon/Chest) и идут как есть.
// ⚠️ КЛЮЧИ КАРТЫ — ПОЛНЫЕ имена типов (не срез): срез у разных пачек
// совпадает (animalfish и foodfish оба давали «Fish» — две неразличимые
// строки в витрине), поэтому карта разводит их по исходному ключу.
const ACC_LABELS = {
  animalpolar: 'Polar bear', animalfish: 'Fish',
  carpolice: 'Police car', carrace: 'Race car', carfiretruck: 'Fire truck',
  cargarbagetruck: 'Garbage truck', carkartoobi: 'Go-kart', carbox: 'Box truck',
  carcone: 'Traffic cone',
  foodicecream: 'Ice cream', fooddonutsprinkles: 'Donut', foodfish: 'Cooked fish',
  foodwholeham: 'Whole ham', foodcakebirthday: 'Birthday cake',
  foodicecreamscoopmint: 'Mint ice cream', foodhotdog: 'Hot dog',
  foodchinese: 'Takeout box',
  // кирпичи: имена — голые формы (round/bar/duo/stud...), в списке музея
  // «Round» без опоры не читается; пиратские предметы самостоятельны
  // (Barrel/Cannon/Chest) и идут срезом как есть
  brickround: 'Round brick', brickbar: 'Bar brick', brickcorner: 'Corner brick',
  brickstud: 'Stud brick', brickclassic: 'Classic brick',
  bricksquare: 'Square brick', brickduo: 'Duo brick' };
// ⚠️ Список префиксов = ВСЕ пачки TYPES (запрос ИНТЕРФЕЙСА 2026-07-22: в
// витрине выходило «Brickround»/«Piratebarrel»). Заводишь новую пачку —
// добавь её префикс сюда, иначе ярлык поедет вместе с ключом ассета.
function accLabel(key){
  const k = String(key);
  if (ACC_LABELS[k]) return ACC_LABELS[k];
  const short = k.replace(/^(animal|food|car|brick|pirate)/, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}
// ОТКРЫТОСТЬ ТИПОВ ПРОГРЕССИЕЙ (контракт для ГРАФИКИ — 3D-портрет только
// открытым, иначе спойлер моделей). Правило ЕДИНОЕ с genLevel (40-items):
// типы открываются ПО ПОРЯДКУ массива TYPES, 9 на ур.1, +1 за уровень,
// потолок пула. levelNum монотонен в реальной игре (растёт на победе),
// поэтому = ДОСТИГНУТЫЙ МАКСИМУМ. Интерфейс имеет СВОЮ unlockedTypeCount
// (85-hud, его зона) — числа совпадают; converge позже, если захочет.
function typesUnlockedCount(){
  const lvl = (typeof levelNum === 'number' ? levelNum : 1);
  return Math.min(TYPES.length, LEVEL_TYPES_MIN + Math.max(0, lvl - 1));
}
function unlockedTypes(){ return TYPES.slice(0, typesUnlockedCount()).map(T => T.name); }
function isTypeUnlocked(name){
  const idx = TYPES.findIndex(T => T.name === name);
  return idx >= 0 && idx < typesUnlockedCount();
}

// Снапшот для витрины музея (контракт ИНТЕРФЕЙСА, 85-hud подхватывает по
// typeof): name — ярлык для показа, key — ключ ассета (аргумент accCount и
// др.), _item — живой предмет типа для офскрин-портрета (или null),
// unlocked — открыт ли тип прогрессией (ГРАФИКА рендерит портрет только
// открытым; поле аддитивное — старые потребители не задеты).
function accSnapshot(){
  const openN = typesUnlockedCount();
  return TYPES.map((T, i) => {
    const k = T.name;
    let live = null;
    try {
      if (typeof items !== 'undefined' && items)
        live = items.find(i => i.alive && !i.animating && i.type && i.type.name === k) || null;
    } catch(e){}
    return { name: accLabel(k), key: k, count: accCount(k), tier: accTier(k),
      mult: accMult(k), next: accNext(k),
      // BOOST для меню владельца: сколько ступеней докуплено, цена следующей
      // (null — упёрлись в кап) и хватает ли баланса прямо сейчас
      boost: boostTier(k), price: boostPrice(k), affordable: canBoost(k),
      unlocked: i < openN, _item: live };
  });
}
// Защита на смену партии моделей (обязательная связка (б) спеки): ключи
// сейва, которых нет в текущих TYPES, НЕ удаляются — прогресс переживёт
// возврат типа в пул; в консоль — предупреждение со списком.
function accAuditOrphans(){
  try {
    if (!Save.ac) return;
    const known = {};
    for (const T of TYPES) known[T.name] = 1;
    const orphans = Object.keys(Save.ac).filter(k => !known[k]);
    if (orphans.length)
      console.warn('[acc] осиротевшие счётчики накопления (тип вне текущей партии, прогресс сохранён): ' + orphans.join(', '));
  } catch(e){}
}
loadSave();
migrateStarsToWallet(); // разовая: рейтинг существующих сейвов -> стартовый баланс
accAuditOrphans();
