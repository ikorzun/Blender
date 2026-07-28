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
// se/ss — ЕДИНЫЙ БАЛАНС (финализация владельцем 2026-07-24: «очки=звёзды=
// баланс»). se = ПОЖИЗНЕННЫЙ накопленный игровой счёт (деноминированный,
// score/SCORE_DENOM, банкуется на победе раз за уровень), ss = пожизненные
// траты. balance = se−ss — ОДНО число: чип в игре, кошелёк в меню, лидерборд.
// ⚠️ ПОЧЕМУ НЕ ОДНО ПОЛЕ-БАЛАНС с max-мержем: потраченное ВОССТАНАВЛИВАЛОСЬ
// бы из отставшей облачной копии — дюп (вердикт аудита, грабля монет).
// «Одно число» — это СЕМАНТИКА (разность), хранение остаётся двумя
// монотонными счётчиками. Фарм не грозит: игра линейна, реплея пройденных
// уровней нет (levelNum только растёт) — счёт банкуется раз за уровень.
// ⚠️ ЕСЛИ появится level-select/реплей — вернуть «лучший счёт за уровень»
// (Save.sc[lv], банк дельты), иначе переигровка лёгкого уровня = ферма.
// stars[lv] — РЕЙТИНГ уровня (1..3), качество прохождения; НЕ кошелёк,
// max-мерж, тратами не трогается. bo — купленные бустом ступени (max).
// uk — купленные ЗАРАНЕЕ типы (открытие за баланс; мерж OR). sm — флаг
// разовой миграции старых сейвов (монотонный 0->1).
// ⚠️ tu — ПОПОЛНЕННЫЕ звёзды (монотонный, мерж max). ⚠️ АКТИВНЫХ ИСТОЧНИКОВ
// НЕТ с 2026-07-27: паки звёзд удалены по слову владельца («нет понятия пака
// звёзд»), а бустер бандла идёт через se («работает на всё»). Поле НЕ удаляем —
// оно уже в живых сейвах (grandfather) и держит фикс A на будущее.
// РАЗВЕДЕНЫ с se (сыгранным счётом), чтобы ЛИДЕРБОРД не был pay-to-win
// (фикс A, таблица №2 2026-07-24): купленное наполняет КОШЕЛЁК, но ранг
// растёт только СЫГРАННЫМ счётом. balance(кошелёк)=se+tu−ss;
// leaderboard=se−max(0,ss−tu) (траты сперва съедают tu, потом сыгранное).
// bx — ОКНА МНОЖИТЕЛЯ БАНДЛА: {множитель: момент истечения}. Ключ = сам
// множитель, поэтому мерж — max ПО КЛЮЧУ (как ac/bo) и «апгрейд» чужим тиром
// невозможен по построению. na — окно без межстраничной рекламы (epoch ms).
// pe/ps — КУПЛЕННЫЕ ВСТРЯСКИ монотонной парой (образец he/hs), постоянный
// кошелёк поверх 3 бесплатных на уровень. ls — «последнее виденное время»,
// монотонная метка против отката часов.
const Save = { ce: 0, cs: 0, he: 3, hs: 0, se: 0, ss: 0, tu: 0, stars: {}, ac: {}, bo: {}, uk: {}, sm: 0, gen: 0, bx: {}, na: 0, pe: 0, ps: 0, ls: 0 }; // he/hs — подсказки (старт 3, спека владельца)
function coins(){ return Math.max(0, Save.ce - Save.cs); }
function totalStars(){ let s = 0; for (const k in Save.stars) s += Save.stars[k]; return s; }
function mergeSave(into, from){
  if (!from) return;
  const gi = into.gen || 0, gf = from.gen || 0;
  if (gf > gi){
    // чужая копия из БОЛЕЕ НОВОГО поколения (после сброса): берём её целиком
    into.ce = from.ce || 0; into.cs = from.cs || 0;
    into.he = from.he != null ? from.he : 3; into.hs = from.hs || 0;
    into.se = from.se || 0; into.ss = from.ss || 0; into.tu = from.tu || 0; into.sm = from.sm || 0;
    into.na = from.na || 0; into.pe = from.pe || 0; into.ps = from.ps || 0;
    into.bx = Object.assign({}, (from.bx && typeof from.bx === 'object') ? from.bx : {});
    into.stars = Object.assign({}, from.stars || {});
    into.ac = Object.assign({}, from.ac || {});
    into.bo = Object.assign({}, from.bo || {});
    into.uk = Object.assign({}, from.uk || {});
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
  into.tu = Math.max(into.tu || 0, from.tu || 0); // пополнения — монотонны, как se/ss
  into.sm = Math.max(into.sm || 0, from.sm || 0); // миграция разовая на все устройства
  into.ls = Math.max(into.ls || 0, from.ls || 0); // метка времени монотонна — откат часов не лечится сменой устройства
  into.na = Math.max(into.na || 0, from.na || 0); // окно без рекламы — монотонно
  into.pe = Math.max(into.pe || 0, from.pe || 0); // купленные встряски: пара как he/hs,
  into.ps = Math.max(into.ps || 0, from.ps || 0); // отставшая копия не воскрешает потраченное
  // ⚠️ ОКНА МНОЖИТЕЛЯ — max ПО КЛЮЧУ-МНОЖИТЕЛЮ. Ключ несёт сам множитель,
  // поэтому копия с коротким x5 НЕ может «поднять» действующий x2: она кладёт
  // своё время в СВОЙ ключ. Прежняя схема (одна пара срок+множитель) такой
  // апгрейд допускала — из-за неё и разведено по ключам.
  if (!into.bx || typeof into.bx !== 'object') into.bx = {};
  const bxf = (from.bx && typeof from.bx === 'object') ? from.bx : {};
  for (const k in bxf) into.bx[k] = Math.max(into.bx[k] || 0, bxf[k] || 0);
  const st = from.stars || {};
  for (const k in st) into.stars[k] = Math.max(into.stars[k] || 0, st[k] || 0);
  if (!into.ac) into.ac = {};
  const ac = from.ac || {};
  for (const k in ac) into.ac[k] = Math.max(into.ac[k] || 0, ac[k] || 0);
  if (!into.bo) into.bo = {};
  const bo = from.bo || {};
  for (const k in bo) into.bo[k] = Math.max(into.bo[k] || 0, bo[k] || 0);
  if (!into.uk) into.uk = {};
  const uk = from.uk || {};
  for (const k in uk) if (uk[k]) into.uk[k] = 1; // купленные разлоки — мерж OR
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
// ── БАНДЛЫ: множитель-окно + расходники + окно без рекламы ──────────────────
// ⚠️ ЧАСЫ УСТРОЙСТВА — ЕДИНСТВЕННЫЙ ИСТОЧНИК ВРЕМЕНИ, и ему нельзя верить:
// перевести часы назад = продлить оплаченное окно бесплатно. Защита —
// МОНОТОННАЯ метка `ls` (мержится по max между устройствами, смена устройства
// обхода не даёт). При откате остаток ПЕРЕАНКОРИВАЕТСЯ (см. boostNow):
// выигранного времени ноль, потерянного тоже. ⚠️ ПОЛНАЯ защита — server-time,
// зона ИНТЕГРАЦИИ (та же зависимость, что у дневного капа рекламы).
let lsDirty = 0;
// Все временные окна разом: тиры множителя (bx по ключу-множителю) + no-Ad (na).
function boostWindows(){ if (!Save.bx || typeof Save.bx !== 'object') Save.bx = {}; return Save.bx; }
function boostNow(){
  const now = Date.now();
  const seen = Save.ls || 0;
  if (now < seen - BOOST_CLOCK_SLACK_MS){
    // ⚠️ ЧАСЫ ОТКАТИЛИ. НЕ СЖИГАЕМ оплаченное, а ПЕРЕАНКОРИВАЕМ ОСТАТОК:
    // сколько было на момент последнего честного замера — столько и остаётся.
    // ⚠️ ПОЧЕМУ НЕ «СЧИТАТЬ ИСТЁКШИМ» (поймано собственным прогоном): метка
    // `ls` монотонна, поэтому ОДИН скачок часов ВПЕРЁД (NTP, перевод времени
    // в другой игре) залипал бы навсегда — now уже никогда не догонит ls, и
    // КАЖДОЕ следующее КУПЛЕННОЕ окно умирало бы мгновенно: платящий получает
    // ноль. Переанкор самолечится — новая точка отсчёта есть текущее время.
    const w = boostWindows();
    for (const k in w){ const left = Math.max(0, (w[k] || 0) - seen); if (left > 0) w[k] = now + left; else delete w[k]; }
    const naLeft = Math.max(0, (Save.na || 0) - seen);
    Save.na = naLeft > 0 ? now + naLeft : 0;
    Save.ls = now;
    commitSave();
    return { now, rolled: true };
  }
  if (now > seen){
    Save.ls = now;
    if (now - lsDirty > 60000){ lsDirty = now; commitSave(); } // метка грубая — не пишем каждый кадр
  }
  return { now, rolled: false };
}
// ⚠️ МНОЖИТЕЛИ НЕ СТЕКУЮТСЯ — играет СИЛЬНЕЙШИЙ ЖИВОЙ тир, время копится
// КАЖДОМУ тиру своё (дефолт диспетчера). Купив x5-на-30-минут поверх
// x2-на-день, игрок получает 30 минут x5, после чего возвращается остаток x2 —
// ничего не сгорает. ⚠️ Отклонять покупку, как в прежнем каркасе-бустере,
// БОЛЬШЕ НЕЛЬЗЯ: в бандле едут расходники, отказ съел бы оплаченное.
function scoreBoostMult(){
  const t = boostNow(); const w = boostWindows();
  let best = 1;
  for (const k in w) if (w[k] > t.now) best = Math.max(best, +k || 1);
  return best;
}
// Остаток ДЕЙСТВУЮЩЕГО (сильнейшего) тира — для таймера на экране.
function scoreBoostLeftMs(){
  const t = boostNow(); const w = boostWindows();
  const m = scoreBoostMult();
  return m > 1 ? Math.max(0, (w[m] || 0) - t.now) : 0;
}
function boostClear(){ Save.bx = {}; Save.na = 0; commitSave(); }
// ОКНО БЕЗ РЕКЛАМЫ: гасит ТОЛЬКО межстраничные; rewarded живут — их игрок
// просит сам (решение диспетчера), и они же несут заряды подсказок/встрясок.
function noAdActive(){ const t = boostNow(); return (Save.na || 0) > t.now; }
function noAdLeftMs(){ const t = boostNow(); return Math.max(0, (Save.na || 0) - t.now); }
// КУПЛЕННЫЕ ВСТРЯСКИ — ПОСТОЯННЫЙ кошелёк монотонной парой (образец he/hs):
// анти-дюп по построению, облачный max-мерж не воскрешает потраченное.
function purchasedShakes(){ return Math.max(0, (Save.pe || 0) - (Save.ps || 0)); }
function spendPurchasedShake(){ if (purchasedShakes() < 1) return false; Save.ps = (Save.ps || 0) + 1; commitSave(); return true; }
// ПОКУПКА БАНДЛА — точка входа ИНТЕГРАЦИИ (зовётся ПОСЛЕ подтверждённой оплаты).
function buyBundle(id){
  const b = STAR_BUNDLES.find(x => x.id === id);
  if (!b) return { ok: false, reason: 'unknown' };
  const t = boostNow(); const w = boostWindows();
  w[b.mult] = Math.max(w[b.mult] || 0, t.now) + b.ms; // время копится СВОЕМУ тиру
  Save.na = Math.max(Save.na || 0, t.now) + b.noAdMs; // окно без рекламы — просто плюсуется
  Save.pe = (Save.pe || 0) + b.shakes;
  Save.ls = Math.max(Save.ls || 0, t.now);
  addHints(b.hints); // подсказки — в существующие заряды he, новой системы не надо
  commitSave();
  Telemetry.ev('bundle_buy', { tier: b.id, usd: b.usd, mult: b.mult });
  return { ok: true, tier: b.id, mult: scoreBoostMult(), state: bundleState() };
}
// Снимок для ИНТЕРФЕЙСА (отрисовка активного бандла).
function bundleState(){
  const t = boostNow(); const w = boostWindows();
  const tiers = STAR_BUNDLES.map(b => ({ id: b.id, mult: b.mult, leftMs: Math.max(0, (w[b.mult] || 0) - t.now) }));
  return { mult: scoreBoostMult(), boostLeftMs: scoreBoostLeftMs(), tiers,
           shakes: purchasedShakes(), hints: hints(), noAd: noAdActive(), noAdLeftMs: noAdLeftMs() };
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
// КОШЕЛЁК = сыгранное + пополнения − траты (то, что можно ТРАТИТЬ).
function starBalance(){ return Math.max(0, (Save.se || 0) + (Save.tu || 0) - (Save.ss || 0)); }
// ЛИДЕРБОРД (финализация владельца 2026-07-24 + фикс A таблицы №2): ранг =
// только СЫГРАННЫЙ счёт. Траты сперва съедают пополнения (tu), и лишь
// избыток трат сверх пополнений роняет сыгранное — так покупка звёзд НЕ
// поднимает ранг (не pay-to-win), а трата на буст/анлок сверх купленного
// осознанно роняет позицию (размен владельца). Сам лидерборд-фича ждёт
// площадки (Playgama/Yandex да, Poki нет) — пока число-хендл.
function leaderboardScore(){ return Math.max(0, (Save.se || 0) - Math.max(0, (Save.ss || 0) - (Save.tu || 0))); }
// ДЕНОМИНИРОВАННЫЙ ПОКАЗ счёта: floor(max(0,score)/10). Единый источник для
// чипа И для всплывающих поп-чисел (#10 владельца 2026-07-27: «числа понятны
// и в процессе, и в подсчёте»). ⚠️ Поп считается как ДЕЛЬТА этой величины
// (scoreShownDelta), а не floor(value/10) поштучно — иначе сумма попов
// расходится с приростом чипа на перенос (±1 дрейф). Гарантия: Σ попов =
// изменение чипа за уровень, бит-в-бит.
function scoreShownDenom(v){ return Math.floor(Math.max(0, v || 0) / SCORE_DENOM); }
function scoreShownDelta(before, after){ return scoreShownDenom(after) - scoreShownDenom(before); }
// ЖИВОЙ баланс для чипа в игре (запрос ИНТЕРФЕЙСУ: чип показывает balance,
// а не per-level score): банкованный баланс + ещё НЕ забанкованный счёт
// текущего уровня. На победе счёт уезжает в se, поэтому число непрерывно.
function liveBalance(){
  let live = 0;
  try {
    if (typeof level !== 'undefined' && level && !level.over &&
        typeof stats !== 'undefined' && stats)
      live = scoreShownDenom(stats.score);
  } catch(e){}
  return starBalance() + live;
}
// БАНК СЧЁТА НА ПОБЕДЕ (финализация владельца: «всё заработанное в уровне =
// баланс»). se += score/SCORE_DENOM (деноминация ×10, floor, клампится ≥0).
// Раз за уровень — игра линейна, реплея нет, поэтому не фармится.
function bankLevelScore(score){
  const gain = Math.floor(Math.max(0, score || 0) / SCORE_DENOM);
  if (gain > 0){ Save.se = (Save.se || 0) + gain; commitSave(); fireStarsChange(); }
  return gain;
}
// Номинал победы по РЕЙТИНГУ — остался ТОЛЬКО для grandfather-миграции
// старых сейвов (у них нет истории счёта, сеем стартовый баланс из рейтинга;
// магнитуда совпадает с новым банком ~сотни/уровень). Валюту за победу
// больше НЕ считает — её несёт bankLevelScore.
function starAward(lv, stars){
  if (!(stars > 0)) return 0;
  return (STAR_AWARD[Math.min(3, stars)] || 0) + STAR_LEVEL_BONUS * Math.max(1, lv | 0);
}
// ПОПОЛНЕНИЕ кошелька (реклама/IAP) — в tu, НЕ в se: не поднимает лидерборд
// (фикс A). Кормит кошелёк, тратится наравне со сыгранным.
// ⚠️ Живых вызовов нет с 2026-07-27 (паки удалены): остаётся точкой входа для
// будущих топапов и тест-ручкой starGrant. Пишет в tu — ранг не поднимает.
function addStars(n){ if (n > 0){ Save.tu = (Save.tu || 0) + n; commitSave(); fireStarsChange(); } }
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
  if (!isTypeUnlocked(name)) return null;          // буст только ОТКРЫТОГО типа (гейт)
  if (accTier(name) >= ACC_TIER_CAP) return null;  // множитель уже на потолке — нечего давать
  if (boostTier(name) >= BOOST_TIER_CAP) return null; // купленный потолок (анкор 62000, фикс ревью)
  // ⚠️ ЦЕНА от КУПЛЕННЫХ ступеней (boostTier), НЕ суммарных (accTier) —
  // фикс B таблицы №2: иначе буст СЫГРАННОГО типа (у него есть заработанные
  // ступени) стоил бы 2000·2^earned, «макс любимого» раздувался до 248k+,
  // и пак-якорь «Mega=макс типа=62000» врал. Теперь каждая купленная
  // ступень удваивается независимо от наигранности: 2000/4000/8000/16000/32000
  // (кап BOOST_TIER_CAP=5 → сумма 62000, универсально для любого типа).
  return Math.round(BOOST_PRICE_BASE * Math.pow(BOOST_PRICE_MULT, boostTier(name)));
}
function canBoost(name){ const p = boostPrice(name); return p != null && starBalance() >= p; }
function buyBoost(name){
  if (!isTypeUnlocked(name)) return { ok: false, reason: 'locked' }; // сначала открыть тип
  const p = boostPrice(name);
  if (p == null) return { ok: false, reason: 'capped', tier: accTier(name), boughtTier: boostTier(name) };
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
  Save.se = 0; Save.ss = 0; Save.tu = 0; Save.bo = {}; Save.uk = {}; Save.sm = 1;
  Save.bx = {}; Save.na = 0; Save.pe = 0; Save.ps = 0; // окна бандла и купленные встряски // sm=1: мигрировать нечего, рейтинг пуст
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
// Открыт = прогрессией ИЛИ куплен заранее за баланс (uk). ⚠️ Покупной
// разлок раскрывает тип в КОЛЛЕКЦИИ/портрете (и позволяет буст), но НЕ
// меняет пул спавна genLevel (это была бы правка ядра/сложности) — тип
// начнёт выпадать в игре по обычной прогрессии. Интерпретация помечена
// диспетчеру; если владелец захочет ранний СПАВН — отдельная правка genLevel.
function isTypeUnlocked(name){
  const idx = TYPES.findIndex(T => T.name === name);
  if (idx >= 0 && idx < typesUnlockedCount()) return true;
  return !!(Save.uk && Save.uk[name]);
}
function unlockedTypes(){ return TYPES.filter(T => isTypeUnlocked(T.name)).map(T => T.name); }
// ОТКРЫТИЕ ТИПА ЗА БАЛАНС (финализация владельца 2026-07-24). Цена
// LEVEL-SCALED (матрица #9, §v3): BASE + PER_LEVEL·levelNum — растёт с
// доходом, держит вмятину ~29% банка на любом уровне. Трата через ss →
// баланс и лидерборд падают (осознанный размен владельца). Уже открытые
// не продаём. ⚠️ Цена от ТЕКУЩЕГО уровня, НЕ от дистанции до типа —
// безопасность спайка структурна (спавн-гейт), см. §v3 TRIPWIRE.
function typeUnlockPrice(name){
  if (isTypeUnlocked(name)) return null; // уже открыт (прогрессией или куплен)
  const idx = TYPES.findIndex(T => T.name === name);
  return idx >= 0 ? (TYPE_UNLOCK_BASE + TYPE_UNLOCK_PER_LEVEL * levelNum) : null;
}
function canUnlockType(name){ const p = typeUnlockPrice(name); return p != null && starBalance() >= p; }
function purchaseUnlock(name){
  const p = typeUnlockPrice(name);
  if (p == null) return { ok: false, reason: isTypeUnlocked(name) ? 'already' : 'unknown' };
  if (starBalance() < p) return { ok: false, reason: 'insufficient', price: p, balance: starBalance() };
  if (!Save.uk) Save.uk = {};
  Save.ss = (Save.ss || 0) + p; // трата — монотонный счётчик (лидерборд падает)
  Save.uk[name] = 1;
  commitSave(); fireStarsChange();
  try { Telemetry.ev('unlock_buy', { t: name, price: p }); } catch(e){}
  return { ok: true, price: p, balance: starBalance() };
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
    const prog = i < openN;
    return { name: accLabel(k), key: k, count: accCount(k), tier: accTier(k),
      mult: accMult(k), next: accNext(k),
      // BOOST для меню владельца: сколько ступеней докуплено, цена следующей
      // (null — упёрлись в кап) и хватает ли баланса прямо сейчас
      boost: boostTier(k), price: boostPrice(k), affordable: canBoost(k),
      // ОТКРЫТИЕ: unlocked = прогрессией ИЛИ куплено; bought — именно куплено
      // (интерфейс отличает «дошёл» от «купил заранее»); unlockPrice/canUnlock
      // — для кнопки «открыть за баланс» на ЗАКРЫТЫХ карточках
      unlocked: prog || !!(Save.uk && Save.uk[k]), bought: !!(Save.uk && Save.uk[k]),
      unlockPrice: typeUnlockPrice(k), canUnlock: canUnlockType(k),
      _item: live };
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
