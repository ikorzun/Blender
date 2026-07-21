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
const Save = { ce: 0, cs: 0, he: 3, hs: 0, stars: {}, gen: 0 }; // he/hs — подсказки (старт 3, спека владельца)
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
  Save.ce = 0; Save.cs = 0; Save.he = 3; Save.hs = 0; Save.stars = {};
  commitSave();
  levelNum = 1;
  try { localStorage.setItem('mixer_level', '1'); } catch(e){}
}
loadSave();
