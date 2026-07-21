// ===== 77-save: живучий сейв v1 (localStorage + Bridge storage) =====
// Монеты — ПАРА МОНОТОННЫХ счётчиков earned/spent (баланс = разность):
// мерж расхождений через max НЕ дюпит валюту (наивный max по балансу
// откатывал бы траты при сбое записи — вердикт аудита плана). Звёзды —
// по-уровнево max. Bridge storage не на всех платформах реальный —
// тогда честно остаёмся на localStorage.
const SAVE_KEY = 'mixer_save_v1';
const Save = { ce: 0, cs: 0, he: 3, hs: 0, stars: {} }; // he/hs — подсказки (старт 3, спека владельца)
function coins(){ return Math.max(0, Save.ce - Save.cs); }
function totalStars(){ let s = 0; for (const k in Save.stars) s += Save.stars[k]; return s; }
function mergeSave(into, from){
  if (!from) return;
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
// Полный сброс прогресса (кнопка в ⚙️): нули пишутся И в облако Bridge —
// иначе монотонный мерж (max) воскресил бы монеты из облачной копии
function resetProgress(){
  Save.ce = 0; Save.cs = 0; Save.he = 3; Save.hs = 0; Save.stars = {};
  commitSave();
  levelNum = 1;
  try { localStorage.setItem('mixer_level', '1'); } catch(e){}
}
loadSave();
