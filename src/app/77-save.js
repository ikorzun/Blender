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
const Save = { ce: 0, cs: 0, he: 3, hs: 0, stars: {}, ac: {}, gen: 0 }; // he/hs — подсказки (старт 3, спека владельца)
function coins(){ return Math.max(0, Save.ce - Save.cs); }
function totalStars(){ let s = 0; for (const k in Save.stars) s += Save.stars[k]; return s; }
function mergeSave(into, from){
  if (!from) return;
  const gi = into.gen || 0, gf = from.gen || 0;
  if (gf > gi){
    // чужая копия из БОЛЕЕ НОВОГО поколения (после сброса): берём её целиком
    into.ce = from.ce || 0; into.cs = from.cs || 0;
    into.he = from.he != null ? from.he : 3; into.hs = from.hs || 0;
    into.stars = Object.assign({}, from.stars || {});
    into.ac = Object.assign({}, from.ac || {});
    into.gen = gf;
    return;
  }
  if (gi > gf) return; // чужая копия из СТАРОГО поколения — игнор (не воскрешаем)
  into.ce = Math.max(into.ce || 0, from.ce || 0);
  into.cs = Math.max(into.cs || 0, from.cs || 0);
  into.he = Math.max(into.he || 3, from.he || 3); // старые сейвы без he получают стартовые 3
  into.hs = Math.max(into.hs || 0, from.hs || 0);
  const st = from.stars || {};
  for (const k in st) into.stars[k] = Math.max(into.stars[k] || 0, st[k] || 0);
  if (!into.ac) into.ac = {};
  const ac = from.ac || {};
  for (const k in ac) into.ac[k] = Math.max(into.ac[k] || 0, ac[k] || 0);
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
      commitSave(); updateHUD();
    }).catch(()=>{});
  } catch(e){}
}
function hints(){ return Math.max(0, (Save.he || 0) - (Save.hs || 0)); }
function addHints(n){ if (n > 0){ Save.he += n; commitSave(); } }
function spendHint(){ if (hints() < 1) return false; Save.hs += 1; commitSave(); return true; }
function addCoins(n){ if (n > 0){ Save.ce += n; commitSave(); } }
function spendCoins(n){ if (coins() < n) return false; Save.cs += n; commitSave(); return true; }
function setStars(lv, n){ if ((Save.stars[lv] || 0) < n){ Save.stars[lv] = n; commitSave(); } }
// Полный сброс прогресса (кнопка в ⚙️): нули пишутся И в облако Bridge, а
// gen++ делает новое поколение СТАРШЕ любой отставшей облачной копии — даже
// если запись нулей в облако сорвётся, mergeSave старую копию не воскресит
function resetProgress(){
  Save.gen = (Save.gen || 0) + 1;
  Save.ce = 0; Save.cs = 0; Save.he = 3; Save.hs = 0; Save.stars = {}; Save.ac = {};
  commitSave();
  levelNum = 1;
  try { localStorage.setItem('mixer_level', '1'); } catch(e){}
}

// ===== НАКОПЛЕНИЕ ПО ТИПАМ: API (контракт для ИНТЕРФЕЙСА, см. WORKSTREAMS).
// Пороги — ряд ×2+100 владельца: 100/300/700/1500/3100/6300... = 100·(2^n−1).
function accThreshold(t){ return t <= 0 ? 0 : 100 * (Math.pow(2, t) - 1); }
function accCount(name){ return (Save.ac && Save.ac[name]) || 0; }
function accTier(name){
  const c = accCount(name);
  let t = 0;
  while (t < ACC_TIER_CAP && c >= accThreshold(t + 1)) t++;
  return t;
}
function accMult(name){ return 1 + ACC_MULT_STEP * accTier(name); }
function accNext(name){ // порог следующей ступени или null на капе
  const t = accTier(name);
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
    const ev = { name: name, tier: after, mult: accMult(name), item: item || null };
    for (const cb of accTierUpCbs){ try { cb(ev); } catch(e){} }
  }
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
accAuditOrphans();
