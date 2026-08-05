// ===== 99-main: главный цикл, отладочный API, старт =====

let camShake = 0, lastT = performance.now(), lastAccMs = 0, lastHudMs = 0;
let lastMtText = null; // кэш отсчёта до помола — DOM трогаем только при смене
let lastFireOn = null; // кэш огня угрозы — класс тоже только при смене
let grindStartMs = 0;  // якорь начала помола: огонь после FIRE_AFTER_GRIND_MS непрерывного Grinding
if (FIRE_DROP_MODE === 'always') $('face').classList.add('dropped');

// Перф-метр (соак-тест и замеры на устройствах, потребитель — soak.js):
// кольца последних 600 кадров — сырое время кадра и время шага физики
const frameRing = [], stepRing = [];
let perfFrames = 0, perfWorstMs = 0;
// фазы ТЕКУЩЕГО кадра — копятся по ходу loop и складываются в _lastPh в конце
let _phStep = 0, _phSolve = 0, _phSync = 0, _phSub = 0, _phFx = 0, _phBuild = 0, _phTap = 0, _phUi = 0, _phRen = 0;
let seriesNextTick = 0; // троттлинг тревожного тика окна серии (пакет темпа)
// ⚠️ РАЗБОРКА КАДРА ПО ПОДСИСТЕМАМ (2026-07-31, задача владельца «игра
// подтупливает на мобиле»). Прежний перф-метр давал кадр ОДНИМ КОМКОМ и
// шаг физики отдельно — по такой паре нельзя сказать, кто ест кадр: остаток
// сваливался в «всё остальное» и молча включал рендер, частицы и тики HUD.
// Кольца: fx — stepFX (частицы), ren — renderer.render, ui — прочие тики
// (вуаль/тонировка/глаза/камера/HUD). Цена инструментовки — 4 замера
// performance.now на кадр, вынесена в отчёт отдельным замером.
const fxRing = [], renRing = [], uiRing = [];
// разборка САМОГО шага физики + число подшагов за кадр (см. stepPhysics)
const solveRing = [], syncRing = [], subRing = [], buildRing = [], tapRing = [];
// снимок ОДНОГО худшего кадра (см. разбор в loop): фазы прошлого кадра + outside
let _worstFrame = null, _wfRaw = 0, _lastPh = null;
// ⚠️ ВТОРОЙ СНИМОК — КАДР С МАКСИМАЛЬНОЙ ПОСТРОЙКОЙ ЭФФЕКТОВ, и он нужен
// отдельно от худшего. Замер показал, что это РАЗНЫЕ кадры: пик держит солвер,
// а постройка садится на соседний. Вопрос «стоит ли пул эффектов» решается не
// тоталом постройки, а тем, насколько тяжёл кадр, который её несёт: 11 мс
// поверх 38 мс солвера — это одно, 11 мс поверх пустого кадра — совсем другое.
let _worstBuildFrame = null, _wbBuild = 0;
let _tapPh = { pick:0, cand:0, ghost:0 };  // фазы последнего тапа (профилировка)
const _pushRing = (r, v) => { r.push(v); if (r.length > 600) r.shift(); };

// ===== Интро уровня (по мокапу владельца): вид сбоку -> предметы сыплются
// в пустую чашу (~2 с живой физики) -> 2-секундный облёт вокруг чаши
// с плавным переходом на игровой вид сверху. Ввод и миксер заблокированы.
let intro = null; // { phase:'drop'|'orbit', t, shakes }
let pendingTrim = false; // трим и база радиуса ждут ОСЕВШЕЙ кучи (см. finalizeFill)
function startIntro(){
  // экран 'intro' — облёт; закрывается finishIntro/skipIntro (docs/METRICS.md §3)
  try { Telemetry.screen.enter('intro'); } catch(_){}
  // КОНТРАКТ С ИНТЕРФЕЙСОМ v2 (спека владельца 2026-07-22: «блок плавно
  // разворачивается ПОСЛЕ анимации облёта ведра»): класс `introdone` на
  // <html> снят на время интро, повешен в finishIntro — их CSS разворачивает
  // витрину по нему. Сигнал именно КОНЦА облёта, а не построения панели.
  document.documentElement.classList.remove('introdone');
  // ⚠️ ФАЗА 'wait' — ЖДЁМ, ПОКА ПЛОЩАДКА УБЕРЁТ СВОЙ ЗАНАВЕС (жалоба владельца
  // 2026-07-30: «пропала анимация заполнения корзины, сразу попадаю на её
  // разворот»). Замер диспетчера показал, почему: сплэш площадки непрозрачный
  // и висит 1778→3947 мс, а предметы сыплются 1706→3200 — ВСЯ анимация играла
  // в закрытый занавес, игрок видел только хвост облёта.
  // Пока фаза 'wait': физика НЕ шагает (предметы стоят над чашей, их никто не
  // видит — занавес сверху), камера на стартовом виде сбоку. Как занавес ушёл —
  // переходим в 'drop' и куча сыплется НА ГЛАЗАХ.
  // ⚠️ ПОЧЕМУ НЕ ПЕРЕНЕСЛИ genLevel ЗА ЗАНАВЕС: loop и весь HUD читают level,
  // а до genLevel его нет — пришлось бы гейтить десяток мест. Заморозка на
  // один-два кадра дешевле и локальнее.
  // ⚠️ ПОЧЕМУ ЭТО НЕ ВОЗВРАЩАЕТ РЕГРЕССИЮ «предметы висят в воздухе»: та была
  // ФОРС-СНОМ по чистым часам ПОСРЕДИ падения столба, на глазах игрока и на
  // неопределённое время. Здесь пауза до ПЕРВОГО шага физики, под занавесом,
  // и снимается гарантированно (Ads.curtainGone всегда резолвится, предел 12 с).
  intro = { phase:'wait', t: 0, shakes: 0, readySent: false };
  resetPointers();
  setFallCap(11); // мягче терминальная скорость на время досыпки
  camAz = 0.35; camPhi = 1.25; camR = 17.8;
  updateCamera();
}
// Страховка от рыхлых сидов: всё, что торчит выше линии заполнения после
// утряски, тихо изымается ПАРАМИ (верхний + его близнец) — чётность типов
// цела, переполнения не бывает никогда
function trimOverfill(){
  let removed = 0;
  for (let guard=0; guard<8; guard++){
    let top = null;
    for (const it of items){
      // сюрприз/бомба/камень триму не кандидаты: непарные спецпредметы,
      // изъятие «топ-пары» для них вырождается в одиночное удаление
      if (it.alive && !it.surprise && !it.bomb && !it.rock && (!top || it.p.y + it.r > top.p.y + top.r)) top = it;
    }
    if (!top || top.p.y + top.r <= FUNNEL.H - 0.2) return removed;
    const twin = items.find(i => i !== top && i.alive && i.key === top.key);
    [top, twin].forEach(it => { if (it) { removeItem(it); removed++; } });
  }
  return removed;
}
function finishIntro(){
  try { Telemetry.screen.enter('game'); } catch(_){}   // с этого момента идёт партия
  // ПЛОЩАДКЕ: первый ИГРАБЕЛЬНЫЙ кадр + старт уровня. GAME_READY раньше
  // уходил из Ads.init (до genLevel и интро) — площадка снимала свой лоадер
  // над чёрным экраном. LEVEL_STARTED у Poki/CrazyGames маппится в нативный
  // gameplayStart: без него площадка пейсит рекламу вслепую. Оба вызова
  // идемпотентны и молчат вне bridge-режима.
  try { Ads.gameReady(); Ads.msg('LEVEL_STARTED', { level: String(levelNum) }); } catch(_){}
  intro = null;
  document.documentElement.classList.add('introdone'); // облёт кончился — витрина разворачивается
  resetPointers();
  setFallCap(); // вернуть боевую терминальную скорость
  // отпустить сюрприз (был прибит ко дну на время осадки)
  const sp = items.find(i => i.surprise && i.body);
  if (sp) sp.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
  camAz = 0; camPhi = 0.45; camR = 16.2;
  updateCamera();
  stats.t0 = performance.now();
  stats.lastAction = performance.now();
  // свежий 3-секундный бюджет форс-сна ПОСЛЕ интро: wakeAtMs стоял с genLevel,
  // и бюджет истекал к концу интро — форс-сон бил на первом же кадре игры
  wakeAtMs = performance.now(); calmT = 0;
  // ⚠️ ТРИМ И БАЗУ РАДИУСА ЗДЕСЬ НЕ СЧИТАТЬ: куча к концу облёта может ещё
  // падать (на слабых машинах — сильно); трим по летящему столбу тихо удалял
  // до 16 предметов, а topY0 по нему ломал динамический радиус. Ждём штиля.
  pendingTrim = true;
  refreshAccessibility(); updateHUD();
}
// Финализация заполнения — СТРОГО по осевшей куче (из loop при штиле)
function finalizeFill(){
  // после изъятия пар куча ОБЯЗАНА доосесть: трим по спящей куче оставлял
  // замороженные полости (предметы висели над дырами от изъятых близнецов)
  if (trimOverfill() > 0) wakePhysics('trim');
  let top0 = 0, aliveN = 0;
  // камни не в счёте (спека 2026-07-22): пар-скор и порог автопана (20%)
  // считаются по совмещаемой массе
  for (const it of items) if (it.alive){ top0 = Math.max(top0, it.p.y + it.r); if (!it.surprise && !it.rock) aliveN++; }
  level.topY0 = top0;
  level.aliveN0 = aliveN; // стартовая загрузка — порог 20% для автопана камеры
  // пар-скор (звёзды): база = «всё сматчено парами без комбо» ПО ТИПАМ и
  // С УЧЁТОМ МНОЖИТЕЛЕЙ НАКОПЛЕНИЯ (обязательная связка (а) спеки владельца
  // 2026-07-22: иначе прокачанные типы делали бы 2★/3★ автоматом — база
  // растёт вместе с ценой матчей, пороги остаются скилловыми). Сюрприз,
  // бомба и КАМНИ в пары не входят (не матчатся; заодно ушёл старый перекос
  // базы на пол-пары от бомбы). ⚠️ Камни добавлены 2026-07-22 вслед за их
  // вводом в main: они НЕСОВМЕЩАЕМЫ (key 'ROCK#i' уникален), но их type.name
  // общий ('rocksa'/'rockssandc'), поэтому пара камней одного вида раздувала
  // базу на 20 очков, которые игрок не может заработать НИКАК. С 16-го
  // уровня 1 камень, +1 каждые 5, кап 6 — до 3 фантомных пар (60 очков).
  // Правка МЕТА в физическом файле — санкционирована задачей диспетчера
  // (баланс-таблица).
  const accPerType = {};
  for (const it of items) if (it.alive && !it.surprise && !it.bomb && !it.rock)
    accPerType[it.type.name] = (accPerType[it.type.name] || 0) + 1;
  let accPar = 0;
  for (const k in accPerType) accPar += Math.floor(accPerType[k] / 2) * MATCH_SCORE * 2 * accMult(k);
  level.parBase = Math.round(accPar);
  refreshAccessibility(); updateHUD();
}
function tickIntro(dt){
  intro.t += dt;
  if (intro.phase === 'wait'){
    // Ждём ВТОРОГО тика: к нему первый кадр с пустой чашей уже ушёл на экран,
    // и «игра готова» — не ложь. Слать раньше нельзя ровно по той причине,
    // которая записана в 78-ads: площадка сняла бы лоадер над пустотой.
    if (!intro.readySent && intro.t > 0){
      intro.readySent = true;
      // ЭТО И ЕСТЬ «ТРЕТЬЯ ТОЧКА»: уровень сгенерирован, чаша нарисована,
      // предметы ещё не тронулись. GAME_READY здесь СНИМАЕТ занавес площадки
      // (в SDK узел удаляется синхронно внутри вызова — разбор ИНТЕГРАЦИИ),
      // то есть момент снятия мы не угадываем, а НАЗНАЧАЕМ.
      try { Ads.gameReady(); } catch(_){}
      // Разрешается всегда: сразу на file:// и без SDK, по game_ready,
      // страховкой, жёстким пределом. Ждать вечно эта ветка не может.
      try {
        Ads.curtainGone.then(()=>{
          if (!(intro && intro.phase === 'wait')) return;
          // ПРОЛОГ-КОМИКС новому игроку — ровно здесь: занавес убран, чаша
          // пустая, предметы ещё не тронулись (86-story). Если пролог не нужен,
          // колбэк зовётся сразу и падение начинается как раньше.
          storyPrologue(()=>{ if (intro && intro.phase === 'wait'){ intro.phase = 'drop'; intro.t = 0; } });
        });
      } catch(_){ intro.phase = 'drop'; intro.t = 0; }
    }
    return;
  }
  if (intro.phase === 'drop'){
    // К ОБЛЁТУ ПОРАНЬШЕ (спека владельца: «ускорь переход»): не ждём
    // почти-штиля — куча доседает уже во время облёта (утряска в орбите
    // гейтится maxV<3, трим всё равно ждёт штиля через pendingTrim)
    if ((intro.t > 0.8 && maxBodySpeed() < 3.5) || intro.t > 1.4){
      removeTempTallWall();
      intro.phase = 'orbit'; intro.t = 0;
    }
  } else {
    // живая вибро-утряска ВСЕЙ массы во время облёта (арки-мосты рыхлят кучу);
    // только по УЖЕ осевшей массе — бить по летящему столбу опасно (вылеты)
    if (intro.shakes < 3 && intro.t > 0.1 + intro.shakes*0.3 && maxBodySpeed() < 3){
      intro.shakes++;
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top > FUNNEL.H - 0.4){
        for (const it of items){
          if (it.alive && it.body)
            impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
        }
      }
    }
    const k = Math.min(1, intro.t / 1); // облёт за 1 секунду (требование владельца)
    const e = k*k*(3 - 2*k); // smoothstep
    // финиш РОВНО в 2π (≡ 0): раньше облёт кончался на 0.35+2π, а finishIntro
    // ставил 0 — скачок ~20° в последний кадр («дёргается» — баг владельца)
    camAz = 0.35 + e*(Math.PI*2 - 0.35);
    camPhi = 1.25 + (0.45 - 1.25)*e; // сбоку -> сверху
    camR = 17.8 + (16.2 - 17.8)*e;
    updateCamera();
    if (k >= 1) finishIntro();
  }
}

// Сон физики: в покое интегратор ВЫКЛЮЧЕН — предметы лежат абсолютно
// неподвижно (микродрожь от вечной борьбы гравитации с коррекцией
// нервировала владельца). Будим на любое событие, меняющее массу.
let physAwake = true, calmT = 0, wakeAtMs = 0, vibT = 0;
const psLog = []; // диагностика: журнал сна/пробуждений {t, ev, src, v}
function wakePhysics(src){
  psLog.push({ t: Math.round(performance.now()), ev: 'wake', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  if (!physAwake) wakeAllBodies();
  physAwake = true; calmT = 0; wakeAtMs = performance.now();
}
function sleepPhysics(src){
  // спасённый (телепортированный из стены) должен ДООСЕСТЬ — сон отменяется,
  // иначе замораживали предмет в воздухе на новом месте; уснём на след. штиле
  if (rescueSweep(true) > 0){ calmT = 0; return; }
  psLog.push({ t: Math.round(performance.now()), ev: 'sleep', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  physAwake = false; calmT = 0;
  sleepAllBodies();
  if (level) refreshAccessibility(); // финальный срез по уснувшей куче
}
// ⚠️⚠️ ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ПИШЕТСЯ uResY. Кто МЕНЯЕТ РАЗМЕР БУФЕРА —
// ОБЯЗАН позвать resize(), иначе юниформа протухает. Раньше это было почти
// безобидно (uResY кормил только слои uCombo/uGrind, а они в покое равны нулю),
// но с 2026-07-31 от неё зависит САМА БАЗА неба (раскладка стопов по экрану),
// и протухшая uResY срезает верх палитры. Ловушка найдена ревью: понижение
// качества applyPerfTier('low') зовёт setPixelRatio+setSize ПОСРЕДИ ИГРЫ и
// resize() не вызывало — замер на 400×800 DPR 1.5 давал верх кадра #42b9ff
// (третий стоп) вместо #6e86ff (первый), и так до конца сессии, потому что на
// телефоне события resize может не случиться вовсе.
// ⚠️ ПОЧЕМУ ПРАВКА ЗДЕСЬ, А НЕ ВНУТРИ applyPerfTier: та объявлена в 10-stage и
// зовётся там же на старте (deviceLooksWeak) РАНЬШЕ инициализации skyMat —
// обращение к нему изнутри упало бы в TDZ. Поэтому resize() зовут вызывающие.
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  if (skyMat) skyMat.uniforms.uResY.value = renderer.domElement.height; // база неба + слои лихорадки
}
addEventListener('resize', resize);

// ВИТРИНА: ПРАВИЛО ШИРИНЫ ВМЕСТО CAMNEAR (спека владельца 2026-07-27
// «на десктопе и планшетах панель НЕ убирать; убираем только если игровое
// поле остаётся уже 2/3 экрана — панель занимает 1/3»). Скрытие по
// приближению камеры (camnear v1-v3: пороги по чаше, затем устойчивый край
// кучи hullR) ПОЛНОСТЬЮ ОТМЕНЕНО — при любом зуме панель стоит. Видимость
// теперь ЧИСТЫЙ CSS: @media (min-width:813px) в shell.html (порог = 3×271px
// занятой полосы панели, замер 2026-07-27; сменится ширина панели — пере-
// мерить). pointer:fine снят — планшеты тоже видят панель. JS-машинерии нет.

// iOS/Android-хром (метод About-Us, приказ владельца 2026-07-22): статусбар/
// остров iOS красится ТОЛЬКО через meta theme-color (фон страницы там
// игнорируется), жестовая зона снизу и Android-тулбар — фоном html/body.
// Без этого тёмная тема телефона рисует чёрные поля вокруг канваса.
// Красим всё в тон ВЕРХА панорамы неба (сэмпл её верхней полоски 2D-канвасом);
// панорама выбирается раз за сессию (день/ночь в 10-stage) — одного прогона
// с ретраем до декодировки data:uri достаточно.
function tintChrome(){
  // ПАНОРАМ БОЛЬШЕ НЕТ (спека владельца 2026-07-22 — небо стало градиентом),
  // сэмплить нечего: берём ВЕРХНИЙ цвет градиента напрямую из 10-stage.
  // Он же — то, что видно у верхней кромки экрана, ради чего сэмпл и делался.
  // ⚠️ Ждать/ретраить больше НЕ надо: цвет известен сразу, без декода картинки.
  try {
    const col = skyChromeCSS;
    document.documentElement.style.backgroundColor = col;
    document.body.style.backgroundColor = col;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', col);
  } catch(e){}
}
tintChrome();

// ПАУЗА: замораживаем игру целиком; все якоря НА ЧАСАХ (таймер миксера,
// окна комбо/цепи, t0, форс-сон) на резюме сдвигаются на длительность паузы —
// пауза не «съедает» простой и не гасит серию
let paused = false, pausedAt = 0;
// setTimeout-хвосты игровых цепочек (удаление матча, помол, финал) НЕ замирают
// с паузой: колбэк, созревший под паузой, доделал бы removeItem/checkEnd —
// вплоть до победы на застывшем экране. Такие колбэки оборачиваются в
// afterPause: под паузой откладываются в очередь, resumeGame их дренирует.
const pausedQueue = [];
function afterPause(fn){ if (paused) pausedQueue.push(fn); else fn(); }
// silent=true — ПАУЗА БЕЗ ПОПАПА (запрос ИНТЕГРАЦИИ 2026-07-23 под рекламу:
// игрок не должен возвращаться из ролика в нашу карточку паузы с настройками
// и закрывать её руками). ВОЗВРАЩАЕТ true, только если паузу поставил ИМЕННО
// ЭТОТ вызов — вызывающий обязан резюмить лишь свою паузу: вкладка могла уйти
// в hidden, тогда паузу поставил visibilitychange (90-input), и её снимает
// ТОЛЬКО игрок кнопкой Continue. Автоматический resume поверх чужой паузы
// вернул бы игрока в живую игру, которую он не возобновлял.
function pauseGame(silent){
  if (paused || intro || !level || level.over) return false;
  paused = true; pausedAt = performance.now();
  // ⚠️ НЕ писать textContent в #eyes: это SVG-конструкция персонажа
  // (85-hud) — текст уничтожил бы слои. Лицо просто застывает стоп-кадром.
  if (!silent) show('pauseOverlay');
  try { Ads.msg('LEVEL_PAUSED'); } catch(_){} // площадке: геймплей встал (нативный gameplayStop)
  return true;
}
function resumeGame(){
  if (!paused) return;
  const d = performance.now() - pausedAt;
  stats.t0 += d; stats.lastAction += d;
  if (level.nextGrind) level.nextGrind += d;
  wakeAtMs += d;
  if (comboUntil) comboUntil += d;
  if (chainUntil){ chainUntil += d; chainNextDrop += d; chainNextBolt += d; }
  if (lastMatchMs) lastMatchMs += d;
  if (grindStartMs) grindStartMs += d; // огонь помола — тоже якорь на часах
  if (chargeUntil) chargeUntil += d;   // ревью v212: пауза (реклама/меню/вкладка)
                                       // не съедает TTL заряда — как все якоря;
                                       // потратить под паузой всё равно нельзя
  lastT = performance.now(); // без гигантского dt на первом кадре
  paused = false;
  try { Ads.msg('LEVEL_RESUMED'); } catch(_){} // площадке: геймплей продолжился (нативный gameplayStart)
  // дренаж отложенных цепочек СТРОГО после paused=false (иначе afterPause
  // вернул бы их в очередь) и после сдвига якорей — колбэки читают часы
  pausedQueue.splice(0).forEach(fn => { try { fn(); } catch(e){} });
  hide('pauseOverlay');
  updateHUD();
}
// ⚠️ ОПРЕДЕЛЕНИЕ СЛАБОГО УСТРОЙСТВА ЗАМЕРОМ (спека владельца 2026-07-29).
// Копим окно РЕАЛЬНЫХ кадров и смотрим МЕДИАНУ, а не среднее: одна секундная
// заминка (сборка мусора, уход во вкладку) среднее утащит, медиану — нет.
// Считаем только когда игра действительно рисует нагруженную сцену: не в интро
// и не на паузе, иначе замерили бы пустой экран и сочли телефон быстрым.
// Кадры длиннее PERF_OUTLIER_MS выбрасываем — это не рендер, это система.
let perfWin = [], perfWinStart = 0, perfDecided = false;
function tickPerfTier(ms){
  if (perfDecided || CFG.perfTier === 'low') { perfDecided = true; return; }
  if (intro || ms > PERF_OUTLIER_MS) return;   // интро и системные заминки не в счёт
  if (!perfWinStart) perfWinStart = performance.now();
  perfWin.push(ms);
  if (performance.now() - perfWinStart < PERF_WINDOW_MS || perfWin.length < PERF_MIN_SAMPLES) return;
  perfWin.sort((a,b) => a - b);
  const med = perfWin[perfWin.length >> 1];
  perfDecided = true;                       // решаем ОДИН раз за сессию
  if (med > PERF_SLOW_FRAME_MS){
    applyPerfTier('low');
    resize();  // ⚠️ ОБЯЗАТЕЛЬНО, см. комментарий у resize: понижение качества
               // меняет высоту буфера, а uResY пишет только resize()
    console.warn('[perf] слабое устройство: медиана кадра ' + med.toFixed(1) + ' мс -> качество понижено');
  }
  perfWin = [];
}

// ГОРЯЩИЙ ПРЕДМЕТ (спека владельца 2026-08-01: «1 предмет за 30 секунд может
// загореться»). Раз в FIRE_EVERY_MS вспыхивает ОДИН предмет; горит FIRE_BURN_MS
// и гаснет сам. Собрал группу этого типа — бонус (начисление за диспетчером,
// стык — burningName в 70-fx).
// ⚠️ ЧАСЫ ИДУТ ТОЛЬКО В ЖИВОЙ ПАРТИИ: в интро, на паузе и после конца уровня
// окно не копится — иначе игрок вернулся бы с рекламы к мгновенной вспышке,
// а за длинную паузу накопился бы «долг» из нескольких.
// ⚠️ ГОРИТ РОВНО ОДИН: igniteItem сам тушит предыдущего, а следующая вспышка
// назначается от МОМЕНТА ЭТОЙ, а не от момента, когда прошлый догорел.
let fireNextMs = 0;
function tickFireSpawn(now){
  if (intro || paused || !level || level.over){ fireNextMs = 0; return; }
  if (!fireNextMs){ fireNextMs = now + FIRE_EVERY_MS; return; }  // первый отсчёт с начала партии
  if (now < fireNextMs || burningName()) return;
  const cand = [];
  for (const it of items){
    if (!it.alive || !it.mesh || !it.type) continue;
    if (it.surprise || it.bomb || it.rock) continue;     // спецпредметы не горят
    if (!isAccessible(it)) continue;                     // справедливость (работает на Hard)
    cand.push(it);
  }
  if (!cand.length){ fireNextMs = now + 2000; return; }  // нечего поджечь — пробуем позже
  // ВИДИМОСТЬ: берём из верхних, иначе пламя утонет в куче (см. FIRE_TOP_N)
  cand.sort((a, b) => b.p.y - a.p.y);
  const top = cand.slice(0, Math.min(FIRE_TOP_N, cand.length));
  igniteItem(top[Math.floor(Math.random() * top.length)]);
  fireNextMs = now + FIRE_EVERY_MS;
}

function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  const rawMs = now - lastT;
  let dt = Math.min(0.033, rawMs/1000); lastT = now;
  if (paused){ renderer.render(scene, camera); return; } // стоп-кадр (до перф-метра — пауза не портит статистику кадров)
  perfFrames++;
  if (perfFrames > 5){ // первые кадры — прогрев страницы, в статистику не идут
    frameRing.push(rawMs); if (frameRing.length > 600) frameRing.shift();
    if (rawMs > perfWorstMs) perfWorstMs = rawMs;
    // ⚠️⚠️ РАЗБОР ХУДШЕГО КАДРА ЦЕЛИКОМ (A2). p95/max отдельных колец — это
    // максимумы РАЗНЫХ кадров, и по ним нельзя сказать, из чего сложился один
    // плохой. Здесь снимок ОДНОГО кадра: все фазы плюс `outside` — время,
    // которого нет НИ В ОДНОЙ моей фазе. Это не остаток от округления: туда
    // попадают работа браузера (стиль/лейаут/композит — у нас есть DOM-капли
    // сока с CSS-переходами), сборка мусора и планировщик rAF. Без этой
    // колонки «кадр 107 мс» неотличим: у меня дорого или снаружи.
    // ⚠️ Фазы берутся от ПРЕДЫДУЩЕГО кадра, и это не приблизительность:
    // rawMs = (старт этого кадра) − (старт прошлого) = работа ПРОШЛОГО кадра
    // + браузер + простой. Складывать его с фазами ТЕКУЩЕГО было бы враньём.
    if (_lastPh && rawMs > _wfRaw){
      _wfRaw = rawMs;
      _worstFrame = Object.assign({ raw: +rawMs.toFixed(1),
        outside: +(rawMs - _lastPh.work).toFixed(1) }, _lastPh);
    }
    tickPerfTier(rawMs);
  }
  if (intro) tickIntro(dt);
  try { chargeTick(); } catch(e){}   // растворение заряда типа (80-gameplay, TTL 7 c)
  tickFires();                       // огонь по силуэту (70-fx): гонит время и тушит
  tickFireSpawn(now);                // вспышка горящего предмета (спека владельца)
  // ⚠️ СПАСАТЕЛЬ ЗАВИСШИХ УДАЛЕНИЙ (найдено пробами v218, класс ЛАТЕНТНЫЙ —
  // воспроизведён и на v217): у матча анимация сжатия и removeItem едут
  // ПАРАЛЛЕЛЬНЫМИ таймерами (addFX + setTimeout→afterPause), и изредка хвост
  // не наступает — предметы остаются alive+animating НАВСЕГДА: полусжатые
  // висят в куче, глотают рейкаст тапа, недоступны матчам (сьют ловил как
  // «за тап ушло 0»). По образцу спасателя пола: страховка по СРОКУ — жизнь
  // анимации ≤0.16с + пауза 150мс, всё старше ANIM_RESCUE_MS зависло̆ —
  // доудаляем с warn. Корень (почему хвост не наступает) — TODO расследовать.
  if (!paused){
    const nowA = performance.now();
    for (const it of items){
      if (it.alive && it.animating && it.animStartMs && nowA - it.animStartMs > ANIM_RESCUE_MS){
        console.warn('[anim-rescue] зависшее удаление доедено:', it.type && it.type.name);
        it.animStartMs = 0;
        try { removeItem(it); } catch(e){}
      }
    }
  }
  // ТРЕВОГА ОКНА СЕРИИ (пакет темпа): у края окна — сухой тик раз в 250 мс.
  // В турбо не тикаем (там своя лихорадка), визуальный канал — глаза (Интерфейс).
  {
    const nowT = performance.now();
    if (comboUntil > nowT && chainUntil <= nowT && !intro){
      const left = comboUntil - nowT;
      if (left < SERIES_TICK_FROM && nowT >= seriesNextTick){
        Sound.play('tick'); seriesNextTick = nowT + 250;
      }
    }
  }
  // в фазе ожидания занавеса физика СТОИТ — иначе куча ссыплется под сплэшем
  if (physAwake && !(intro && intro.phase === 'wait')){
    // в интро физика ускорена: заполнение чаши на 30% быстрее (спека
    // владельца), камера при этом идёт по реальному времени — облёт прежний
    stepPhysics(intro ? dt * INTRO_TIME_SCALE : dt);
    if (perfFrames > 5){
      _pushRing(stepRing, stepMsLast);
      _pushRing(solveRing, stepSolveMs); _pushRing(syncRing, stepSyncMs); _pushRing(subRing, stepSubsteps);
      _phStep = stepMsLast; _phSolve = stepSolveMs; _phSync = stepSyncMs; _phSub = stepSubsteps;
    }
    const maxV = maxBodySpeed();
    const noAnim = !items.some(i=>i.alive && i.animating);
    // штиль: скорости тел малы, анимаций нет — замораживаем до следующего
    // события. НЕ в интро: мгновение тишины между слоями сыплющегося столба —
    // ещё не штиль, сон заморозил бы осадку (и интро-утряска не будит физику)
    if (!intro && maxV < 0.25 && noAnim){
      calmT += dt;
      if (calmT > 0.4) sleepPhysics('calm');
    } else calmT = 0;
    // медленное докатывание круглых форм может длиться долго — через 3 с
    // бодрствования усыпляем принудительно. ⚠️ ТОЛЬКО ПРИ ПОЧТИ-ШТИЛЕ и НЕ в
    // интро: форс-сон по чистым часам замораживал столб, падающий на v≈17
    // (зависшие в воздухе предметы — баг владельца); докатывание — это v<2
    if (!intro && maxV < 2.0 && noAnim && now - wakeAtMs > 3000) sleepPhysics('force3s');
  }
  // отложенная финализация заполнения: как только куча после интро осела
  if (pendingTrim && !intro && (!physAwake || maxBodySpeed() < 1.0)){
    pendingTrim = false;
    finalizeFill();
  }
  const _tFx = performance.now();
  stepFX(dt);
  const _tUi = performance.now();
  if (perfFrames > 5){ _phFx = _tUi - _tFx; _phBuild = fxBuildTake(); const _tm = tapMsTake();
    _phTap = _tm; _pushRing(fxRing, _phFx); _pushRing(buildRing, _phBuild); _pushRing(tapRing, _tm);
    // ⚠️ фазы держим от ПОСЛЕДНЕГО НАСТОЯЩЕГО тапа: перезапись каждым
    // кадром затирала их нулями с кадров без тапа, и разборка читалась
    // как «выбор 0 + кандидаты 0 + призрак 0» при ненулевом итоге
    const _ph = tapPhasesTake(_tm); if (_tm > 0) _tapPh = _ph; }
  tickVeil(dt);
  tickDepthTint(dt); // ГРАФИКА: верх кучи для тонировки по глубине (10-stage)
  tickFace(now); // ИНТЕРФЕЙС: персонаж-глаза (эмоция+взгляд+зрачок-индикатор турбо); заменил tickChainBar
  tickCamFollow(dt);
  tickHintFly(); // полёт камеры к подсказке (90-input), обрывается жестом // камера сама опускается за кучей по мере разбора (90-input, спека владельца)
  // комбо-буст обязан погаснуть и на СПЯЩЕЙ куче (refresh в штиле не тикает,
  // а тап читает CFG.matchRadius напрямую — залипший буст был бы читом)
  if (comboUntil && now > comboUntil){
    comboUntil = 0; comboCount = 0; comboLevel = 0;
    updateMatchRadius(); updateHUD();
  }
  // цепная реакция: досыпка по тику; гаснет по таймеру / chainMissesLimit() (Easy 4, Hard 3)
  // промахам / финалу-концу (досыпать пары в финал миксера нельзя — он бы прервался)
  if (chainUntil){
    if (level.over || now > chainUntil || stats.misses - chainStartMisses >= chainMissesLimit() || !hasAnyPair()){
      chainUntil = 0; comboCount = 0; chainSeries = 0; chainCarry = 0;
      updateMatchRadius(); updateHUD();
    } else if (now >= chainNextDrop){
      chainNextDrop = now + CHAIN_DROP_MS;
      // ОКНО ДОСЫПКИ — только первые CHAIN_DROP_WINDOW_MS цепи (спека владельца
      // 2026-07-31 «всё укладывается в 3 секунды»): старт цепи восстанавливаем
      // из chainUntil (единственный источник, паузо-сдвиги двигают его сами)
      if (now < chainUntil - CHAIN_MS + CHAIN_DROP_WINDOW_MS) chainRefill();
    }
    // амбиентный треск: короткие дуги между верхними предметами.
    // ⚠️ ГУЩЕ (спека владельца 2026-07-28 «больше мелких молний»): тик чаще и
    // за тик выпускается несколько КОРОТКИХ разрядов. Дорогая часть тика —
    // filter+sort по всей куче, поэтому она делается ОДИН раз, а разряды берут
    // пары из уже готового списка (участить сам тик втрое было бы втрое дороже).
    if (chainUntil && now >= chainNextBolt){
      chainNextBolt = now + BOLT_TICK_MS + Math.random()*BOLT_TICK_JIT;
      const topmost = items.filter(i => i.alive && !i.animating).sort((a,b) => b.p.y - a.p.y).slice(0, 24);
      if (topmost.length > 3){
        for (let n = 0; n < BOLT_PER_TICK; n++){
          // до 3 попыток найти БЛИЗКУЮ пару: раньше неудачный жребий гасил
          // весь тик и треск заикался
          for (let att = 0; att < 3; att++){
            const a0 = topmost[Math.floor(Math.random()*topmost.length)];
            const b0 = topmost[Math.floor(Math.random()*topmost.length)];
            if (a0 !== b0 && a0.p.distanceTo(b0.p) < BOLT_MAX_D){ boltFX(a0.p, b0.p); break; }
          }
        }
      }
    }
  }
  // фон-лихорадка: низ неба наливается красным (сильнее в цепной реакции)
  if (skyMat){
    // ЧАСЫ ЗВЁЗД. ⚠️ КОПИМ dt, а не берём performance.now(): dt в игре КЛАМПНУТ,
    // поэтому на паузе, при уходе вкладки и на просадке кадра моргание не
    // «перепрыгивает» вперёд — иначе после возврата всё небо мигнуло бы разом.
    // ⚠️ И БЕЗ ГЕЙТА ПО НОЧИ: юниформа копится всегда, а ветка звёзд днём не
    // исполняется вовсе (uStars = 0) — ветвление тут дороже сложения.
    skyMat.uniforms.uTime.value += dt;
    // подогрев фона растёт с длиной серии: чем ближе цепь — тем гуще зелень
    const target = chainUntil ? 1 : (comboUntil > now ? 0.3 + 0.5 * Math.min(1, comboCount / chainComboAt()) : 0);
    const cur = skyMat.uniforms.uCombo.value, stepK = dt / 0.35;
    skyMat.uniforms.uCombo.value = cur < target ? Math.min(target, cur + stepK) : Math.max(target, cur - stepK);
  }
  // тики по реальным часам (не по dt): при низком FPS детект тупика/миксера
  // не растягивается. В ШТИЛЕ доступность не пересчитывается вовсе —
  // предметы неподвижны, она не может измениться (перф: refresh ~десятки мс)
  if (physAwake && now - lastAccMs > 300){ lastAccMs = now; refreshAccessibility(); }
  // миксер: финальная зачистка остатков без пар; иначе — наказание за простой
  let grinding = false;
  if (!level.over && !intro){
    const anyAlive = items.some(i=>i.alive);
    const idle = (now - stats.lastAction)/1000;
    // ФИНАЛЬНАЯ ДОКИДКА ПАР — ПЕРЕД помолом остатков (см. 40-items): в
    // первый кадр НАСТОЯЩЕГО finale сироты получают партнёров, hasAnyPair
    // оживает, и ветка помола ниже не включается.
    // ⚠️ БЕЗ АНИМАЦИЙ В КАДРЕ — обязательное условие (пойман прогоном):
    // у слияния предметы «живы, но в анимации», и когда последняя пара типа
    // сливается, на миг «пар нет» при живых прочих — рефилл срабатывал
    // ПОСРЕДИ уровня, сжигая единственный заряд и досыпая лишнее; на
    // настоящем finale сироту потом молча съедал finaleGrind.
    const finaleAnimBusy = items.some(i => i.alive && i.animating);
    if (anyAlive && !hasAnyPair() && !level.finalRefillDone && !finaleAnimBusy) finalPairsRefill();
    // ⚠️ ПОМОЛ НЕ ОПЕРЕЖАЕТ РЕФИЛЛ (пойман стражем): в «грязный» кадр
    // (последняя пара ещё в анимации слияния) рефилл пасует по своему
    // anim-гейту, а помол без гейта съедал сироту до докидки. Пока рефилл
    // не потрачен — финальный помол ждёт того же чистого кадра; после
    // траты (или пустой докидки) ест как раньше, в любые кадры.
    if (anyAlive && !hasAnyPair() && (level.finalRefillDone || !finaleAnimBusy)){
      grinding = true;
      if (now >= level.nextGrind){ level.nextGrind = now + 500; finaleGrind(); }
    } else if (anyAlive && hasAnyPair() && (idle > level.idleLimit || level.deadlock)){
      // ⚠️ hasAnyPair() в условии — закрытая БОКОВАЯ ДВЕРЬ (пойман стражем
      // докидки): в finale «грязного» кадра первая ветка пасовала, и сироту
      // съедал ЭТОТ помол — хотя его смысл (наказание простоя / разбор кучи
      // до пары) существует только ПРИ живых парах; finale целиком ведёт
      // ветка выше (рефилл, потом finaleGrind).
      // idle>idleLimit — наказание за простой; level.deadlock — ТУПИК-ВЫРУЧАЛКА
      // (нет достижимых пар + нет встрясок, выставляется в 600-мс тике ниже):
      // помол разбирает кучу, пока не появится достижимая пара, ВМЕСТО экрана
      // поражения (решение владельца 2026-07-27 «помол = штраф, не смерть»).
      grinding = true;
      if (now >= level.nextGrind){
        level.nextGrind = now + MIXER_PERIOD*1000;
        mixerGrind();
      }
    }
  }
  // фон-помол: ВЕРХ неба наливается красным — ЛЕСЕНКА УГРОЗЫ (спека владельца
  // 2026-07-21-г). Работают лопасти -> цель 1.0; иначе за <GRIND_LEAD с до помола
  // цель растёт САМА по таймеру (GRIND_LEAD−left)/GRIND_LEAD «медленно»; матч
  // сбрасывает lastAction -> left подскакивает до idleLimit -> цель 0. Гаснет
  // БЫСТРЕЕ, чем растёт (вниз GRIND_FADE_DN ~0.2 с, вверх GRIND_FADE_UP ~0.35 с).
  // Гейты intro/over и сигнал grinding — те же, что у миксера выше. Правка в
  // 99-main санкционирована диспетчером (спека 2026-07-21-в/г): таймер живёт тут.
  if (skyMat){
    let gTgt = 0;
    if (grinding) gTgt = 1;
    else if (!level.over && !intro && items.some(i=>i.alive)){
      // телеграф не длиннее самого таймера: после ÷3 (idleLimit 10/3.3) на Hard
      // GRIND_LEAD=10 > idleLimit → небо было всегда ≥67% красным. Кап lead под
      // idleLimit → красный честно наливается 0→1 по всему простою (Easy 10==10
      // бит-в-бит как было, Hard 3.3 получает полную рампу без пола).
      const lead = Math.min(GRIND_LEAD, level.idleLimit);
      const left = level.idleLimit - (now - stats.lastAction)/1000; // сек до помола
      if (left < lead) gTgt = Math.min(1, Math.max(0, (lead - left)/lead));
    }
    const gCur = skyMat.uniforms.uGrind.value;
    const gStep = dt / (gTgt < gCur ? GRIND_FADE_DN : GRIND_FADE_UP); // вниз быстрее подъёма
    skyMat.uniforms.uGrind.value = gCur < gTgt ? Math.min(gTgt, gCur + gStep) : Math.max(gTgt, gCur - gStep);
  }
  // лопасти: стоят, пока миксер не работает (владельца нервировало холостое вращение)
  mixerSpeed += ((grinding ? 14 : 0) - mixerSpeed) * Math.min(1, dt*3);
  mixerBlades.rotation.y += mixerSpeed * dt;
  // работающий миксер ВИБРИРУЕТ массу: нижним слоям лёгкие импульсы
  if (grinding){
    if (!physAwake) wakePhysics('grind');
    wakeAtMs = now; // при перемалывании не засыпаем принудительно
    vibT += dt;
    if (vibT > 0.12){
      vibT = 0;
      for (const it of items){
        if (!it.alive || it.animating || !it.body) continue;
        if (it.p.y < FLOOR_REST + 2.2){
          const wk = it.shakeK || 1; // вес: вибрация миксера тоже по пачке
          impulseBody(it, (Math.random()-0.5)*0.4*wk, Math.random()*0.3*wk, (Math.random()-0.5)*0.4*wk);
        }
      }
    }
  }
  // ОТСЧЁТ ДО ПОМОЛА — КАЖДЫЙ КАДР (жалоба владельца: «таймер под глазами
  // запаздывает и дёргается»): в 600-мс HUD-тике граница секунды проскакивала
  // и число меняло значение неравномерно. grinding уже посчитан выше; DOM
  // трогаем только при СМЕНЕ текста — перерисовка SVG-обводки не бесплатна.
  {
    let txt = '', fireOn = false;
    if (!intro && !level.over && items.some(i => i.alive)){
      const idleS = (now - stats.lastAction) / 1000;
      // при работе лопастей — ПУСТО (спека владельца 2026-07-31 со скрина:
      // «убери это слово, и так понятно, что идёт измельчение» — злые глаза и
      // лопасти уже говорят всё; ОТМЕНЯЕТ прежнее «вместо красного 0 слово
      // владельца); и число, и слово всегда чёрные с белой обводкой (CSS)
      txt = grinding ? '' : String(Math.max(0, Math.ceil(level.idleLimit - idleS)));
      // ОГОНЬ у глаз (правка владельца 2026-07-22): ТОЛЬКО после 3 с
      // непрерывного помола — эскалация уже идущего Grinding, а не телеграф
      // приближения (тот несёт красная лесенка неба). Матч рвёт помол ->
      // якорь сбрасывается, огонь гаснет.
      if (grinding){
        if (!grindStartMs) grindStartMs = now;
        fireOn = now - grindStartMs >= FIRE_AFTER_GRIND_MS;
      } else grindStartMs = 0;
    } else grindStartMs = 0;
    if (fireOn !== lastFireOn){
      lastFireOn = fireOn;
      $('fFire').classList.toggle('on', fireOn);
      // конструкция опускается под корону (решение владельца; подрежим —
      // FIRE_DROP_MODE в 00-config): 'fire' — вместе с огнём, 'always' —
      // класс ставится один раз ниже и не снимается
      if (FIRE_DROP_MODE === 'fire') $('face').classList.toggle('dropped', fireOn);
    }
    if (txt !== lastMtText){
      lastMtText = txt;
      if (!txt){
        $('mixerTimerSvg').style.display = 'none';
      } else {
        const mt = $('mixerTimer');
        mt.textContent = txt;
        mt.classList.toggle('grind', txt === 'Grinding');
        $('mixerTimerSvg').style.display = 'block';
      }
    }
  }
  if (now - lastHudMs > 600){
    lastHudMs = now;
    updateEyes(now, grinding);
    const ap = availablePairs();
    $('apCount').textContent = ap;
    const alive = items.some(i=>i.alive);
    const noMoves = alive && ap === 0 && !level.over;
    const idle = (now - stats.lastAction)/1000;
    // Красный баннер УДАЛЁН (спека владельца 2026-07-19): всю коммуникацию
    // несёт таймер-чип в левой верхней группе — подложка плывёт из зелёной
    // в красную по мере истечения времени; при помоле — красный «0 с»
    const finale = alive && !hasAnyPair();
    // (отсчёт до помола ПЕРЕЕХАЛ в каждокадровый блок ниже — в 600-мс тике
    // секунды обновлялись то через 0.6 с, то через 1.2 с: «таймер запаздывает
    // и дёргается», жалоба владельца 2026-07-21)
    // ТУПИК → ПОМОЛ-ВЫРУЧАЛКА, НЕ ПОРАЖЕНИЕ (решение владельца 2026-07-27
    // «помол = штраф, не смерть»): пары есть, но недоступны, и встрясок нет —
    // ждём 2 стабильных проверки (~1.2 c, чтобы масса доосела; при финале и при
    // движении не срабатывает), затем ставим level.deadlock → кадровый gate
    // выше гонит mixerGrind, разбирая кучу, пока не появится достижимая пара.
    // Цена выручки — очки (−20/помол), она же влияет на лидерборд. Экран
    // поражения (showLose) больше не вызывается из тупика; UI жив на будущее.
    // ⚠️ КУПЛЕННЫЙ ЗАПАС ВСТРЯСОК = АГЕНТНОСТЬ: пока он есть, тупика НЕТ —
    // игроку есть чем разрулить, и выручалка-помол (она стоит очков) не должна
    // включаться за него. Условие расширено вместе с вводом бандлов.
    // ⚠️ И ВСТРЯСКА ЗА РЕКЛАМУ — ТОЖЕ АГЕНТНОСТЬ (слово владельца 2026-08-01:
    // «встряска за рекламу считается выходом»): при adShakes>0 тупик не
    // объявляется. Сейчас adShakes=∞ → deadlock-ветка фактически в резерве
    // (на случай площадок без rewarded/отключения рекламы); кучу при простое
    // всё равно разбирает обычный idle-помол — вечного стояния нет.
    // БЕСПЛАТНАЯ АВТО-ВСТРЯСКА (просьба тестировщиков «иначе ощущение, что
    // вымогают шейки за рекламу» + условие владельца 2026-08-02 дословно:
    // «только при условии, что объекты далеко друг от друга и их невозможно
    // соединить»): пары по типам ЕСТЬ (не finale), соединимых НЕТ (noMoves),
    // бесплатные и купленные встряски кончились — раньше здесь игрока ждала
    // только кнопка «за рекламу» (adShakes безлимитны и НЕ проверяются —
    // в этом суть жалобы). Один раз за уровень, 2 стабильных тика (~1.2 с)
    // на оседание массы — как у детектора тупика ниже.
    if (noMoves && !finale && !level.autoShakeUsed && level.shakes === 0 &&
        purchasedShakes() === 0 && !items.some(i=>i.alive && i.animating)){
      level.autoStuck = (level.autoStuck || 0) + 1;
      if (level.autoStuck >= 2){
        level.autoShakeUsed = true; level.autoStuck = 0;
        stats.autoShakes = (stats.autoShakes || 0) + 1;
        toast('Free shake');
        performShake(); updateHUD();
        Telemetry.ev('auto_shake', { lv: levelNum });
      }
    } else if (level.autoStuck) level.autoStuck = 0;
    if (noMoves && !finale && level.shakes === 0 && purchasedShakes() === 0 &&
        !(level.adShakes > 0) && !items.some(i=>i.alive && i.animating)){
      level.stuck++;
      if (level.stuck >= 2) level.deadlock = true;
    } else {
      level.stuck = Math.min(level.stuck, 0);
      // вернулась агентность (появилась достижимая пара / встряски) — тупик снят,
      // помол-выручалка останавливается. НЕ снимаем по items animating: сам помол
      // анимирует предметы, иначе флаг схлопнулся бы на первом же обороте лопастей.
      // ⚠️ СБРАСЫВАЕМ lastAction на переходе тупик→снят: помол мог крутиться дольше
      // idleLimit (stats.lastAction застыл), и без сброса idle-помол ДОГРЫЗАЛ бы кучу
      // после появления пары (idle всё ещё > idleLimit), пока игрок не тапнет — даём
      // свежий отсчёт, чтобы выручалка встала РОВНО с появлением достижимой пары.
      if (level.deadlock && (ap > 0 || level.shakes > 0 || purchasedShakes() > 0)){
        level.deadlock = false;
        stats.lastAction = now;
      }
    }
    // время партии (ЧЁРНОЕ — спека владельца 2026-07-21, был зелёный макета);
    // отсчёт до перемолки — отдельное число под глазами
    if (LEVEL_TIME_IN_HUD && !level.over) $('timer').textContent = fmtTime(Math.round((now-stats.t0)/1000)); // скрытому таймеру и fitStat не нужен
  }
  // стекло РАСТВОРЯЕТСЯ при приближении камеры (спека владельца: вблизи
  // чаша не нужна и мешает совмещать): полная плотность при camR>=13.5,
  // полностью тает к camR<=10 (smoothstep)
  if (bowlMat){
    const gk = Math.max(0, Math.min(1, (camR - 10) / 3.5));
    const k = gk * gk * (3 - 2 * gk);
    bowlMat.uniforms.uFade.value = k;   // стекло — ShaderMaterial (20-arena)
    bowlMesh.visible = k > 0.02;
  }
  // тени перерисовываем только когда что-то движется (свет статичен; в штиле
  // экономим ~150 теневых draw calls каждый кадр)
  renderer.shadowMap.needsUpdate = physAwake || !!intro || mixerSpeed > 0.01 || fx.length > 0;
  if (camShake > 0){
    camShake -= dt;
    updateCamera();
    camera.position.x += (Math.random()-0.5)*camShake*0.8;
    camera.position.y += (Math.random()-0.5)*camShake*0.8;
  }
  // ⚠️ ui = ВСЁ между stepFX и рендером (вуаль/тонировка/глаза/камера/HUD).
  // Меряем здесь, а не по кускам: цель разборки — найти ГЛАВНОГО едока, а не
  // расписать тик глаз до микросекунды. Понадобится дробить — дробить тогда.
  if (perfFrames > 5){ _phUi = performance.now() - _tUi; _pushRing(uiRing, _phUi); }
  const _tRen = performance.now();
  renderer.render(scene, camera);
  // ⚠️ ЭТО НЕ ВРЕМЯ GPU. renderer.render отдаёт команды и возвращается; настоящая
  // работа видеочипа асинхронна и сюда не попадает. Число честно ловит ОБХОД
  // СЦЕНЫ И ДРАЙВЕРНЫЕ ВЫЗОВЫ (draw calls, загрузку буферов частиц) — на мобиле
  // это и есть основной CPU-налог рендера. Настоящий GPU-таймлайн headless не
  // отдаёт; для него нужен реальный телефон.
  if (perfFrames > 5){
    _phRen = performance.now() - _tRen;
    _pushRing(renRing, _phRen);
    // фазы ЭТОГО кадра — их прочтёт следующий, когда узнает свой rawMs
    _lastPh = { work: +(performance.now() - now).toFixed(1), step: +_phStep.toFixed(1),
      solve: +_phSolve.toFixed(1), sync: +_phSync.toFixed(1), sub: _phSub,
      fx: +_phFx.toFixed(1), build: +_phBuild.toFixed(1), tap: +_phTap.toFixed(1),
      ui: +_phUi.toFixed(1), ren: +_phRen.toFixed(1) };
    if (_lastPh.build > _wbBuild){ _wbBuild = _lastPh.build; _worstBuildFrame = Object.assign({}, _lastPh); }
    _phStep = _phSolve = _phSync = _phSub = _phFx = _phBuild = _phTap = _phUi = _phRen = 0;
  }
}

// ---------- Отладочный API ----------
// ⚠️ ПИКСЕЛЬ, ГДЕ ПРЕДМЕТ — ПЕРВОЕ ПЕРЕСЕЧЕНИЕ ЛУЧА (общий для findByTex и
// bestTapTarget; только для тестов). Проекция ЦЕНТРА для клика НЕ ГОДИТСЯ:
// центр бывает закрыт соседом, и тест бьёт не по тому предмету. Историю этой
// грабли писали дважды: флейк-репорт v76 (клик по центру попадал в
// загораживающий предмет, «−20» вместо «+120») и флейк v157 (новый ассерт капа
// кликал по центру группы, случайно попадал в БОМБУ и детонировал её ДО секции
// бомбы — три ассерта бомбы падали через раз). Пробуем центр и 8 смещений по
// экранным осям камеры на 0.55·r; ни один не подошёл — предмет закрыт целиком.
function pickCtx(){
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
  return { meshes: aliveMeshes(), rc: new THREE.Raycaster(), right, up };
}
function visiblePixel(it, ctx){
  for (let k = 0; k < 9; k++){
    const wp = it.p.clone();
    if (k > 0){
      const a = (k - 1)/8*Math.PI*2, d = it.r * 0.55;
      wp.add(ctx.right.clone().multiplyScalar(Math.cos(a)*d))
        .add(ctx.up.clone().multiplyScalar(Math.sin(a)*d));
    }
    const sp = wp.project(camera);
    // ⚠️ ПРОВЕРЯЕМ ПО ОКРУГЛЁННОМУ ПИКСЕЛЮ, а не по сырой проекции: тест кликает
    // ЦЕЛЫМИ координатами, а смещённые пробы лежат у самого силуэта — округление
    // на полпикселя перебрасывало луч на соседа. Замер: 5 расхождений «обещано
    // n, ушло меньше» из 14 тапов; после сверки по округлённому — 0.
    const px = Math.round((sp.x + 1)/2*innerWidth), py = Math.round((-sp.y + 1)/2*innerHeight);
    ctx.rc.setFromCamera({ x: px/innerWidth*2 - 1, y: -(py/innerHeight*2 - 1) }, camera);
    const hits = ctx.rc.intersectObjects(ctx.meshes, false);
    if (hits.length && hits[0].object.userData.item === it) return { px, py };
  }
  return null;
}
window.__game = {
  alive(){ return items.filter(i=>i.alive).length; },
  availablePairs,
  autoMatch(){
    stats.lastAction = performance.now(); // стендовый матч = действие игрока:
    // иначе долгие бот-прогоны «простаивали» для idle-помола, и он параллельно
    // выедал кучу (в бою тап обновляет lastAction сам)
    refreshAccessibility();
    const byKey = {};
    for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key]=byKey[it.key]||[]).push(it);
    for (const k in byKey){
      const arr = byKey[k];
      for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
        if (pairMatch(arr[i], arr[j])){ doMatch([arr[i], arr[j]]); return true; }
      }
    }
    return false;
  },
  shake: performShake,
  penalizeTest(){ penalize(null, 10, 10); }, // тест: промах через единую точку штрафа
  hintShow(){ showHint(); },                 // тест/стенд: честный путь кнопки подсказки
  hintLast(){ return hintLastPick; },        // тест: самоотчёт последнего выбора (read-only)
  itemsBrief(){ return items.filter(i => i.alive).map(i => ({ key: String(i.key), x: +i.p.x.toFixed(2), y: +i.p.y.toFixed(2), z: +i.p.z.toFixed(2), acc: !!i.accessible })); },

  // тест: съесть один ОБЫЧНЫЙ предмет (сирота для стража финальной докидки).
  // В бою сироты создаёт бомба (взрыв соседей нечётом); ручка воспроизводит
  // ФАКТ сироты, а страж проверяет ПОВЕДЕНИЕ после факта — саму докидку.
  killOneTest(kind){
    const pred = kind === 'surprise' ? (i => i.alive && i.surprise)
               : kind === 'bomb'     ? (i => i.alive && i.bomb)
                                     : (i => i.alive && !i.rock && !i.bomb && !i.surprise);
    const it = items.find(pred);
    if (it) removeItem(it);
    return items.filter(i => i.alive).length;
  },
  requestShake: requestShake, // тест: РЕАЛЬНЫЙ путь встряски с учётом (бесплатные -> купленные -> реклама)
  cfg: CFG,
  regen: genLevel,
  // дебаг-тюнер пресетов matcap (10-stage): ползунки поверх HUD, живое
  // применение, вывод значений кнопкой Copy. Повторный вызов закрывает.
  matcapTuner,
  matcapPresets(){ return JSON.parse(JSON.stringify(MATCAP_PRESETS)); },
  // замер вуали: выставить её ВСЕМ живым разом. Нужна именно так — чтобы
  // сравнивать стоимость шейдера на ОДНОЙ И ТОЙ ЖЕ сцене (доля недоступных
  // от сида к сиду гуляет 121-136, и на этом шуме тонет любой честный дельта-замер)
  veilAll: veilAllItems,
  // ДЕБАГ ГРАФИКИ (цена прозрачности + цена переключения сложности на лету,
  // 2026-07-29): флип material.transparent на ВСЕХ живых предметах. Возвращает
  // мс на сам флип + первый кадр — это и есть цена перекомпиляции (transparent
  // входит в ключ программы three через `#define OPAQUE`).
  // ЗАМЕРЕНО: 1-й флип 183 материалов — 34 мс (компиляция второго варианта),
  // каждый следующий 1.2-1.6 мс (обе программы уже в кэше three). Поэтому
  // «сложность применяется со следующего уровня» — ограничение снимаемое.
  // Им же меряется цена прозрачности парным чередующимся замером (см. WORKSTREAMS).
  setItemsTransparent(on){
    const t0 = performance.now();
    let n = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const m = it.mesh.material;
      if (!m || m.transparent === !!on) continue;
      m.transparent = !!on;
      m.opacity = on ? VEIL_ALPHA : 1;
      m.needsUpdate = true; n++;
    }
    renderer.render(scene, camera);          // форсим компиляцию здесь, а не в тике
    return { flipped: n, ms: +(performance.now() - t0).toFixed(1) };
  },
  // ДЕБАГ ГРАФИКИ (подбор тона вуали, спека владельца «светло-синяя, не серая»):
  // менять тон/светлоту/подъём на ЖИВОЙ сцене без пересборки. uVeilCol и
  // uVeilTune — ОБЩИЕ юниформы (10-stage), поэтому правка видна сразу всем.
  // Оставлен постоянным (как matcapTuner): тон — вкусовое решение владельца,
  // и он к нему возвращался уже дважды; пересобирать билд на каждый оттенок
  // не нужно, а контактный лист вариантов снимается одним прогоном.
  veilTune(hex, light, lift){
    if (hex != null) uVeilCol.value.setHex(hex).convertSRGBToLinear();
    if (light != null) uVeilTune.value.x = light;
    if (lift != null) uVeilTune.value.y = lift;
    return { hex: '#' + (hex == null ? 0 : hex).toString(16), light: uVeilTune.value.x, lift: uVeilTune.value.y };
  },
  // ДЕБАГ ГРАФИКИ: раскладка стопов неба на живой сцене — 'screen' (как
  // CSS-градиент владельца) или 'view' (по высоте взгляда). Нужен для A/B без
  // пересборки: разница между режимами ВИДНА ТОЛЬКО НА СКРИНЕ, числами её не
  // передать, а решение о раскладке — за владельцем. Дефолт — SKY_MAP.
  skyMap(mode){
    if (skyMat && mode != null) skyMat.uniforms.uSkyMap.value = mode === 'view' ? 0 : 1;
    return skyMat ? (skyMat.uniforms.uSkyMap.value ? 'screen' : 'view') : null;
  },
  // час, по которому выбраны небо и тема (форс через ?hour=N) — для стражей тем
  skyHour(){ return { hour: skyHourNow(), time: skyTimeNow(), night: isNightSky() }; },
  // ДЕБАГ ГРАФИКИ: подменить палитру неба на живой сцене (подбор цветов
  // владельцем без пересборки, как veilTune). Массив хексов любой длины >= 2.
  skyStops(list){ return setSkyStops(list); },
  // ДЕБАГ ГРАФИКИ: форма звезды на живой сцене — 0 чистая точка, 1 искра.
  // Контактный лист вариантов снимается одним прогоном, как у палитр.
  starSpark(v){ if (skyMat && v != null) skyMat.uniforms.uStarSpark.value = v;
    return skyMat ? skyMat.uniforms.uStarSpark.value : null; },
  // срез вуали для сьюта: сколько материалов реально получили uVeil>0
  veilStats(){
    let withShader = 0, veiled = 0, max = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const sh = it.mesh.material.userData && it.mesh.material.userData.shader;
      if (!sh) continue;
      withShader++;
      const v = sh.uniforms.uVeil.value;
      if (v > 0.01) veiled++;
      if (v > max) max = v;
    }
    return { mode: VEIL_MODE, withShader, veiled, max: +max.toFixed(2) };
  },
  // A/B прозрачности НА ЖИВОЙ странице. Боевой режим задаёт VEIL_MODE в
  // 00-config; здесь — только замер и показ владельцу, без пересборки.
  // ⚠️ Смена transparent — перекомпиляция шейдера: после вызова дать кадр-другой
  // на прогрев, иначе в замер попадёт компиляция, а не установившаяся цена.
  veilFade(on){
    let n = 0;
    for (const it of items){
      if (!it.mesh || !it.mesh.material.userData.shader) continue;
      const m = it.mesh.material;
      m.transparent = !!on; m.needsUpdate = true;
      m.opacity = on ? 1 - (it.veilK || 0) * (1 - VEIL_ALPHA) : 1;
      n++;
    }
    return n;
  },
  // контрольная сумма пикселей пресета: сьют проверяет ПЕРЕСЪЁМКУ текстуры,
  // а не только смену числа в объекте (иначе ассерт был бы пустым)
  matcapSum(kind){
    const t = matcapCache.get(kind);
    if (!t) return -1;
    const d = t.image.data; let s = 0;
    for (let i = 0; i < d.length; i += 97) s += d[i];
    return s;
  },
  // мгновенно завершить интро (для тестов): синхронная осадка + утряска
  skipIntro(){
    // ⚠️ Пролог-комикс висит поверх фазы 'wait' и ЖДЁТ тапа. В автопрогоне
    // тапать некому: без этой строки сьют застревал бы на первом же экране,
    // а координатные клики уходили бы в панель. Закрываем штатно — так пролог
    // ещё и метится показанным, и не всплывает в следующих секциях.
    try { storyForceClose(); } catch(_){}
    if (!intro) return;
    intro = null;
    // тот же сигнал, что и у честного finishIntro (иначе витрина ждала бы
    // облёта, которого в тестах/пробах не будет) — и те же сообщения площадке
    document.documentElement.classList.add('introdone');
    try { Ads.gameReady(); Ads.msg('LEVEL_STARTED', { level: String(levelNum) }); } catch(_){}
    for (let s=0; s<300; s++){
      world.step();
      // терминальная скорость и тут: столб падает с ~40 юнитов, v>20
      // пробивала компаунды (латентный источник флейков тестов)
      if (s % 3 === 0) for (const it of items){
        if (!it.alive || !it.body) continue;
        const v = it.body.linvel();
        if (v.y < -16) it.body.setLinvel({ x: v.x, y: -16, z: v.z }, false);
      }
    }
    syncMeshes();
    // вибро-утряска ВСЕЙ массы: свежая куча рыхлая (арки-мосты в конусе),
    // импульсы только верхним мосты не рушат
    for (let round=0; round<8; round++){
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top <= FUNNEL.H - 0.4) break;
      for (const it of items){
        if (it.alive && it.body)
          impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
      }
      for (let s=0; s<70; s++) world.step();
      syncMeshes();
    }
    removeTempTallWall();
    finishIntro();
    pendingTrim = false;
    finalizeFill(); // синхронно: тесты читают topY0/трим сразу после skipIntro
    sleepPhysics('skipIntro');
    renderer.shadowMap.needsUpdate = true; // осадка прошла мимо loop-гейта — тень по финальной куче
  },
  level(){ return level; },
  stats(){ return stats; },
  levelNum(){ return levelNum; },
  // отладка/сьют: последние события телеметрии (буфер копится даже при
  // выключенной отправке — иначе метрики нельзя было бы проверить до прода)
  telemetry(n){ const b = Telemetry.buffer(); return n ? b.slice(-n) : b; },
  telemetryScreen(){ return Telemetry.screen.current(); },
  freeShakes(lv){ return freeShakesFor(lv == null ? levelNum : lv); }, // лесенка запаса 3+⌊ур/10⌋
  adsMode(){ return Ads.mode; },
  // отладка/тесты: принудительный пересчёт доступности и её слепок
  forceRefresh(){ refreshAccessibility(); },
  // диагностика регрессии: сон физики, мигание вуали, «висуны» в воздухе
  awake(){ return { physAwake, sinceWakeMs: physAwake ? Math.round(performance.now() - wakeAtMs) : 0, maxV: +maxBodySpeed().toFixed(2) }; },
  accFlips(){ return accFlips; },
  // v1: кошелёк и звёзды (тесты экономики)
  wallet(){ return { coins: coins(), ce: Save.ce, cs: Save.cs, hints: hints(),
    stars: Object.assign({}, Save.stars), total: totalStars(),
    starBalance: starBalance(), se: Save.se, ss: Save.ss }; },
  grant(n){ addCoins(n); updateHUD(); },
  // ===== ЕДИНЫЙ БАЛАНС + BOOST + ОТКРЫТИЕ (контракт для ИНТЕРФЕЙСА,
  // финализация владельца 2026-07-24: очки=звёзды=баланс=лидерборд).
  // Все ручки честные — плейсхолдеры меню можно снимать.
  starBalance: starBalance,       // ЕДИНОЕ число: чип, кошелёк, лидерборд-база
  liveBalance: liveBalance,       // для ЧИПА в игре: баланс + незабанкованный счёт уровня
  leaderboardScore: leaderboardScore, // ранг = СЫГРАННОЕ (se−max(0,ss−tu)); ниже кошелька на неистраченный tu — пополнение не поднимает ранг
  spendStars: spendStars,         // списание с проверкой достаточности -> bool
  onStarsChange: onStarsChange,   // подписка: {balance, earned, spent}
  boostPrice: boostPrice,         // цена следующей ступени типа (null — кап)
  canBoost: canBoost,             // хватает ли баланса
  buyBoost: buyBoost,             // покупка -> {ok, price, tier, mult, balance, next}
  boostTier: boostTier,           // сколько ступеней докуплено у типа
  // ОТКРЫТИЕ ТИПА ЗА БАЛАНС (на закрытых карточках коллекции)
  typeUnlockPrice: typeUnlockPrice, // цена или null (уже открыт/неизвестен)
  canUnlockType: canUnlockType,     // хватает ли баланса
  purchaseUnlock: purchaseUnlock,   // покупка -> {ok, price, balance}
  starAward: starAward,           // номинал (только миграция) — оставлен для тестов
  // тест/отладка
  starGrant(n){ addStars(n); return starBalance(); },
  // ПОДСКАЗКА ЗА РЕКЛАМУ — контракт с ИНТЕРФЕЙСОМ (бейдж «Ad» на кнопке):
  // adHintAvailable() — рисовать ли ad-состояние; requestAdHint() — запустить
  // ролик (сам showHint уже уходит в эту ветку при нуле зарядов).
  adHintAvailable: adHintAvailable,
  requestAdHint: requestAdHint,
  spendHint: spendHint, // тест-ручка: слить заряды, чтобы проверить ad-ветку
  // БАНДЛЫ — контракт с ИНТЕРФЕЙСОМ (экран «More Stars») и ИНТЕГРАЦИЕЙ
  // (buyBundle зовётся ПОСЛЕ подтверждённой оплаты; сами платежи не мои).
  buyBundle: buyBundle,               // покупка тира целиком
  bundleState: bundleState,           // снимок для отрисовки активного
  bundles(){ return STAR_BUNDLES.map(b => ({ ...b })); }, // витрина тиров
  scoreBoostMult: scoreBoostMult,     // активный множитель (1 — окна нет)
  scoreBoostLeftMs: scoreBoostLeftMs, // остаток сильнейшего тира — таймер экрана
  noAdActive: noAdActive, noAdLeftMs: noAdLeftMs,
  purchasedShakes: purchasedShakes,
  boostRaw(){ return { bx: Save.bx, na: Save.na, pe: Save.pe, ps: Save.ps, ls: Save.ls }; }, // тест-ручка
  boostSetClock(ls){ Save.ls = ls; commitSave(); }, // тест: подделать «виденное время»
  boostClear(){ boostClear(); return scoreBoostMult(); }, // тест: снять окна начисто
  // СЮЖЕТ (86-story): состояние глав и ручной показ для тестов
  storyState(){ return { st: Save.st || 0, sv: Save.sv || 0, open: !!document.getElementById('storyOverlay'),
                         due: (storyDue() || {}).id || null, busy: storyBusy, on: storyOn }; },
  storyOnWin(){ return storyOnWin(); },
  // ТЕКСТЫ ДОЛГОЙ МЕТЫ (пункт 1.3): строки и одноразовость правила
  metaTexts(key){ return { line: accToastLine(key), saved: accSavedText(key),
                           next: accNextText(key), rule: accRuleText() }; },
  metaRuleState(){ return { due: accRuleDue(), mt: Save.mt || 0 }; },
  metaRuleMark(){ accRuleMark(); return Save.mt; },
  metaRuleReset(){ Save.mt = 0; commitSave(); },
  storyReset(){ Save.st = 0; Save.sv = 0; commitSave(); },
  storyMark(bit){ Save.st = (Save.st || 0) | bit; commitSave(); },       // тест: считать главу показанной
  storySetLevelMark(lv){ Save.sv = lv; commitSave(); },                  // тест: когда была последняя виньетка
  storyClearAcc(){ Save.ac = {}; commitSave(); },  // тест: обнулить накопления — вехи К2-К4 считаются по ним
  storyPrologueDue(){ return storyPrologueDue(); },
  storyPrologueSpy(cb){ return storyPrologue(cb); }, // тест: проверить, что колбэк зовётся
  storyPrologueNow(){ Save.st = 0; commitSave(); return new Promise(r => storyPrologue(() => r(true))); },
  storyClose(){ const b = document.getElementById('storyOverlay');
    if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return !document.getElementById('storyOverlay'); },
  storyTypeNames(){ return TYPES.filter(t => t.tex).map(t => t.name); }, // тест: имена типов с пачкой
  storyPackOf(name){ const t = TYPES.find(x => x.name === name); return t ? t.tex : null; },
  storyFullSet(){ return stFullSet(); },
  storyFillSet(){ // тест: добрать самую маленькую годную пачку до полного зала
    const by = {}; for (const t of TYPES) if (t.tex) (by[t.tex] = by[t.tex] || []).push(t.name);
    let best = null;
    for (const k in by) if (by[k].length >= 4 && (!best || by[k].length < by[best].length)) best = k;
    if (best) by[best].forEach(n => accAdd(n, 1, null)); // accGrant — метод __game, глобальная точка это accAdd
    return best;
  },
  storyEnable(v){ storyEnable(v); }, // тест: глушить сюжет на механических секциях
  bankScore(n){ return bankLevelScore(n); },
  addScore(n){ stats.score += n | 0; return stats.score; }, // тест: подвинуть живой счёт уровня // тест деноминации банка счёта
  scoreShownDenom: scoreShownDenom,          // #10: деноминир. показ счёта (чип и попы — одна шкала)
  clearBought(){ Save.uk = {}; commitSave(); }, // тест: сбросить купленные разлоки (изоляция прогрессионного ассерта)
  starMigrate(){ return migrateStarsToWallet(); },
  saveRaw(){ return JSON.parse(JSON.stringify(Save)); },
  mergeRaw(o){ mergeSave(Save, o); commitSave(); return starBalance(); },
  // НАКОПЛЕНИЕ ПО ТИПАМ (спека владельца 2026-07-22) — контракт для
  // ИНТЕРФЕЙСА (вкладка «Музей объектов» + всплывашка апа) и тестов;
  // сама функция глобальная в 77-save (85-hud подхватывает по typeof)
  accSnapshot(){ return accSnapshot(); },
  // ОТКРЫТОСТЬ ТИПОВ прогрессией (контракт для ГРАФИКИ: портрет только
  // открытым). Правило единое с genLevel; accSnapshot() уже несёт поле
  // `unlocked` per-тип, эти ручки — для прямых запросов/тестов.
  unlockedTypes: unlockedTypes,       // -> [type.name] открытых по достигнутому уровню
  isTypeUnlocked: isTypeUnlocked,     // (name) -> bool
  accGrant(name, n){ accAdd(name, n, null); return { count: accCount(name), tier: accTier(name), mult: accMult(name), next: accNext(name) }; },
  onAccTierUp: onAccTierUp, // подписка на ап ступени ({name, tier, mult, item})
  // тесты баланса: форс уровня (правила штрафов зависят от levelNum)
  setLevel(n){ levelNum = Math.max(1, n | 0); try { localStorage.setItem('mixer_level', String(levelNum)); } catch(e){} },
  // ⚠️ ТЕСТ-ХУК, НЕ ВРЕМЕННЫЙ — НЕ УДАЛЯТЬ (метка «ВРЕМЕННО, удалю после
  // бейка» висела здесь ошибочно и чуть не привела к сносу 2026-07-27).
  // На нём стоит ЕДИНСТВЕННЫЙ страж инварианта «поза статики и спина — ОДИН
  // источник» (сам инвариант — в CLAUDE.md: развести нельзя, иначе скачок при
  // подмене img→канвас на hover). Ассерт сьюта МЕНЯЕТ позу этим хуком и ждёт,
  // что спин стартует с новой. ПОЧЕМУ БЕЗ МУТАЦИИ НЕЛЬЗЯ: статика и спин
  // читают ОДНУ переменную PORTRAIT_YAW0 — любой getter вернул бы её дважды,
  // и сверка «getter против getter» была бы пуста и зелена всегда. Мутация и
  // ЕСТЬ проверка. ГРАФИКА доказала симуляцией (дала спину свою копию yaw):
  // ассерт упал — startAngle −0.6 вместо 0.2; вернули общую — снова 0.2.
  // Рамку стережёт отдельный thumbFrames, а ПОЗУ — только этот хук.
  // Сменить позу + сбросить thumbCache, чтобы портрет переснялся.
  setPortraitPose(tx, yaw){ PORTRAIT_TILT_X = tx; PORTRAIT_YAW0 = yaw;
    for (const k in thumbCache) delete thumbCache[k]; return [PORTRAIT_TILT_X, PORTRAIT_YAW0]; },
  // статический портрет как data-URL (проба/сьют): ghost=true -> гхост-режим
  thumbURL(key, ghost){ const it = thumbItemForKey(key, ghost); return it ? itemThumb(it) : null; },
  // РЕГРЕССИЯ #3 (спека владельца 2026-07-24 «размер при hover = размер статики»):
  // статика (itemThumb) и спин ДОЛЖНЫ кадрировать ОДНИМ frameCylinder — иначе
  // на hover подмена img->канвас шринкает объект. Хук фреймит обе камеры ПРЯМО
  // (мимо кэша itemThumb) на одном меше и сверяет ширины ортокамер бит-в-бит.
  // Сьют ассертит equal===true; если кто-то ужмёт itemThumb обратно по силуэту —
  // ассерт покраснеет. Лёгкий (без рендера/readback).
  thumbFrames(key){
    const it = thumbItemForKey(key); if (!it) return null;
    if (!thumbR) itemThumb(it); // поднять thumbCam/thumbR
    ensureSpinR();
    thumbCam.updateMatrixWorld(true);
    const m1 = new THREE.Mesh(it.mesh.geometry, it.mesh.material); m1.scale.copy(it.mesh.scale);
    frameCylinder(thumbCam, m1);
    const m2 = new THREE.Mesh(it.mesh.geometry, it.mesh.material); m2.scale.copy(it.mesh.scale);
    frameCylinder(spinCam, m2);
    const tW = thumbCam.right - thumbCam.left, sW = spinCam.right - spinCam.left;
    return { thumbW: +tW.toFixed(4), spinW: +sW.toFixed(4), equal: Math.abs(tW - sW) < 1e-4 };
  },
  // ДЕБАГ ГРАФИКИ (вращение портрета, 2026-07-24): мост к thumb-машинерии
  // 85-hud. thumbSpinKey резолвит ключ->портрет-меш и монтирует спин в host
  // (item через границу page.evaluate не передать). buildAllThumbs — перф
  // варианта B: время построения портретов всех открытых типов.
  thumbSpinKey(key, sel){ const it = thumbItemForKey(key); const host = sel ? document.querySelector(sel) : null; if (it && host) thumbSpinStart(it, host); return !!(it && host); },
  // TAP=HOVER (#4): тап-обработчик интерфейса. Резолв ключ->портрет + host по
  // селектору, дальше toggle (см. thumbSpinToggle в 85-hud). Возвращает,
  // крутится ли карточка после вызова.
  thumbSpinToggleKey(key, sel){ const it = thumbItemForKey(key); const host = sel ? document.querySelector(sel) : null; return (it && host) ? thumbSpinToggle(it, host) : false; },
  thumbSpinStop, thumbSpinToggle, thumbItemForKey,
  spinState(){ return { active: !!spinItem, angle: +spinAngle.toFixed(3), rafOn: !!spinRAF,
    mounted: !!(spinR && spinR.domElement.parentNode),
    // ширина ортокамеры: Y-инвариантная рамка ставится ОДИН раз -> константна
    // весь спин (пересчёт = «дыхание»). Округляю грубо, чтобы не ловить эпсилон.
    camW: spinCam ? +(spinCam.right - spinCam.left).toFixed(4) : 0 }; },
  buildAllThumbs(n){
    const rows = (typeof accSnapshot === 'function') ? accSnapshot() : [];
    const lim = Math.min(n || rows.length, rows.length); let built = 0;
    for (let i = 0; i < lim; i++){ const it = thumbItemForKey(rows[i].key); if (it && itemThumb(it)) built++; }
    return { built, total: lim };
  },
  // ДЕБАГ ГРАФИКИ (осколки, полировка 2026-07-23): выстрелить shardFX над
  // кучей — скрин визуала и перф-замер (реальный бурст/помол собрать
  // детерминированно тяжело: burstFX нужна пачка >=4, помол хука не имеет).
  // Мост к эффекту 70-fx, поведение (burstFX/grindShred) не трогает.
  shardBurst(n, opts){
    opts = opts || {};
    const c = new THREE.Color(opts.color != null ? opts.color : 0x4a6cff);
    const y = opts.y != null ? opts.y : FUNNEL.H + 2; // по умолчанию над кромкой — чистое небо
    shardFX(new THREE.Vector3(opts.x || 0, y, opts.z || 0), c,
      Object.assign({ count: n || 10, up: 4, spread: 2.6, size: 0.18, life: 0.6 }, opts));
    wakePhysics('shardTest');
    return fx.length;
  },
  // ⚠️ ХУК НЕСУЩИЙ: на нём единственная защита «свет один на игру». Читается
  // ПОСЛЕ shardBurst — тогда это свет, которым скол УЖЕ запечён, а не тот,
  // которым запёкся бы. Уберут syncShardLight из makeShardGeo (свет снова
  // станет снимком на старте) или вернут вторую константу — здесь останется
  // старое значение, страж покраснеет. Снести хук = тихо снять стража.
  shardLight(){ return SHARD_LIGHT.toArray().map(v => +v.toFixed(3)); },
  // ⚠️⚠️ ФОРМЫ ЖИВЫХ ОСКОЛКОВ — ПОДПИСЬ БУФЕРА КАЖДОГО, а не их количество.
  // Инвариант ГРАФИКИ: «каждый скол уникален» (углы тетраэдра сдвинуты ±38%,
  // тинт печётся по нормали грани). Стерёг его до сих пор ТОЛЬКО счётчик
  // геометрий сцены, а он доказывает, что геометрии СОЗДАВАЛИСЬ, — не что
  // формы РАЗНЫЕ: регрессия «одна форма на весь залп через новый объект
  // геометрии» прошла бы мимо него зелёной. Здесь читается содержимое.
  // ⚠️ Понадобится и как предусловие пула буферов: под пулом счётчик
  // геометрий перестаёт расти по построению (декремент живёт только в
  // onGeometryDispose), то есть старый страж покраснеет на ВЕРНОЙ правке —
  // заменять его надо этим, а не ослаблять порог.
  shardShapes(){
    const out = [];
    for (const f of fx){
      const o = f.obj;
      if (!o || !o.userData || !o.userData.shard) continue;
      const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (!p) continue;
      // подпись: сумма и сумма квадратов координат + первый тинт. Двух разных
      // сколов с совпадающей парой сумм не бывает практически, а сравнивать
      // массивы целиком через мост в тест дорого и шумно.
      let s = 0, q = 0;
      for (let i = 0; i < p.array.length; i++){ s += p.array[i]; q += p.array[i]*p.array[i]; }
      out.push({ n: p.array.length, s: +s.toFixed(6), q: +q.toFixed(6),
        tint: c ? +c.array[0].toFixed(4) : null });
    }
    return out;
  },
  // КАЛИБРОВКА ЗВЁЗД: экранные координаты ЛУЧШЕЙ доступной группы
  // (findHintGroup — тот же поиск, что у подсказки). Нужно ботам, которые
  // ходят РЕАЛЬНЫМИ тапами: findByTex отдаёт любой предмет пачки, часто без
  // пары в радиусе, и такой тап штрафуется как промах (замер показал 85%
  // промахов) — человек же бьёт по видимой группе. Только для тестов.
  // mode 'any' — СЛУЧАЙНАЯ валидная группа (модель обычного игрока: он бьёт
  // по первой замеченной паре, а не сканирует чашу в поисках максимума);
  // без аргумента — ЛУЧШАЯ группа (модель внимательного игрока). Разброс
  // между этими двумя моделями и есть коридор, в котором живут пороги звёзд.
  // ручки качества для тестов и замеров
  perfTier(){ return { tier: CFG.perfTier, dpr: renderer.getPixelRatio(), fx: CFG.fxScale,
    shadows: renderer.shadowMap.enabled, decided: perfDecided }; },
  setPerfTier(t){ if (t !== 'low') return false;
    const ok = applyPerfTier('low'); if (ok) resize(); return ok; },  // resize — см. tickPerfTier
  bestTapTarget(mode){
    refreshAccessibility();
    const acc = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && i.accessible);
    // ⚠️ ГРУППА СЧИТАЕТСЯ ВОКРУГ КОНКРЕТНОГО ЯКОРЯ — ровно так, как её
    // пересоберёт handleTap, ВКЛЮЧАЯ кап. pairMatch — это БЛИЗОСТЬ (зазор <=
    // matchRadius), а НЕ класс эквивалентности: у соседа по цепочке набор
    // соседей свой. Поэтому «n от одного предмета, пиксель от другого» врёт —
    // ревью v157 замерило: 9 тапов из 14 уносили не то число, что обещано.
    const groupAround = (it) => {
      let g = acc.filter(o => o !== it && o.key === it.key && pairMatch(o, it));
      const raw = g.length + 1;
      if (g.length > MATCH_MAX_N - 1){
        g = g.map(o => ({ o, d: pairDist(o, it) })).sort((a, b) => a.d - b.d)
             .slice(0, MATCH_MAX_N - 1).map(v => v.o);
      }
      return { n: g.length + 1, raw };
    };
    const cands = [];
    for (const it of acc){ const g = groupAround(it); if (g.n > 1) cands.push({ it, n: g.n, raw: g.raw }); }
    if (!cands.length) return null;
    // mode 'any' — СЛУЧАЙНЫЙ порядок (модель обычного игрока: бьёт по первой
    // замеченной паре); без аргумента — сперва САМЫЕ КРУПНЫЕ группы (модель
    // внимательного игрока). Разброс двух моделей и есть коридор порогов звёзд.
    if (mode === 'any') for (let i = cands.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t;
    } else cands.sort((a, b) => b.raw - a.raw);
    // ⚠️ ПЕРЕБИРАЕМ ВСЕХ КАНДИДАТОВ, а не одну группу: доступность считается
    // лучами В НЕБО, а пиксель — лучом ОТ КАМЕРЫ, и предмет бывает доступен,
    // но закрыт соседом. Первая версия v157 сдавалась на первой же закрытой
    // группе и отдавала null при сотне живых пар (замер ревью: дефолтный режим
    // возвращал null на ур.5/10/20, хотя 31-40 из 60 групп были видимы), а
    // ассерт капа молча уходил в «пропуск». Как findByTex — идём до упора.
    const ctx = pickCtx();
    for (const c of cands){
      const px = visiblePixel(c.it, ctx);
      // n — размер того матча, который РЕАЛЬНО соберётся вокруг отданного
      // пикселя (с капом); raw — тот же матч ДО капа, по нему видно, сработал
      // ли кап вообще (нужно ассерту сьюта, иначе он проверяет пустоту).
      if (px) return Object.assign({ n: c.n, raw: c.raw, name: c.it.type.name }, px);
    }
    return { n: 0, occluded: true };   // группы есть, но все закрыты от камеры
  },
  // тест множителя: сматчить пару КОНКРЕТНОГО типа (доступную и в радиусе)
  matchType(name){
    refreshAccessibility();
    const arr = items.filter(i => i.alive && i.accessible && !i.animating && !i.surprise && !i.bomb && !i.rock && i.type.name === name);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (pairMatch(arr[i], arr[j])){ doMatch([arr[i], arr[j]]); return true; }
    return false;
  },
  // индекс живого предмета типа — для адресных ручек (ignite и т.п.)
  indexByType(name){
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      if (it.alive && !it.animating && it.type && it.type.name === name) return i;
    }
    return -1;
  },
  // живые по типам (независимая проверка пар-скора в тестах)
  aliveByType(){
    const m = {};
    for (const it of items) if (it.alive && !it.surprise && !it.bomb) m[it.type.name] = (m[it.type.name] || 0) + 1;
    return m;
  },
  // диагностика зависших удалений (найдено пробой v218: doMatch отработал,
  // а removeItem не случился — см. разбор в журнале)
  isPaused(){ return paused; },
  animCount(){ let k = 0; for (const it of items) if (it.alive && it.animating) k++; return k; },
  // ПАКЕТ ТЕМПА — API для глаз Интерфейса (спека владельца: показ темпа
  // ТОЛЬКО глазами, шкалы нет). mult читает ТУ ЖЕ seriesMult, что и деньги.
  series(){
    const n = performance.now();
    const active = comboUntil > n;
    return { len: active ? comboCount : 0, mult: active ? seriesMult(n) : 1,
             leftMs: Math.max(0, Math.round(comboUntil - n)),
             winMs: seriesWindowMs(comboCount) };
  },
  combo(){
    const n = performance.now();
    let top = 0, airborne = 0;
    for (const it of items) if (it.alive){ if (it.p.y < FUNNEL.H) top = Math.max(top, it.p.y + it.r); else airborne++; }
    return { hot: comboUntil > n, count: comboCount, level: comboLevel, chain: chainUntil > n, series: chainSeries, radius: +CFG.matchRadius.toFixed(2),
      top: +top.toFixed(2), airborne, nextDropIn: chainUntil ? Math.round(chainNextDrop - n) : null };
  },
  // ДЕБАГ ГРАФИКИ (густота молний, 2026-07-28): непрерывно сыпать разряды между
  // верхними предметами ms миллисекунд. Нужен потому, что молния живёт 0.16 с —
  // случайный скрин ловит её как повезёт, и «стало ли гуще» на глаз не проверить.
  // Мост к boltFX (70-fx), поведение цепи/турбо не трогает. Как shardBurst у осколков.
  boltProbe(ms){
    const top = items.filter(i => i.alive && !i.animating).sort((a,b) => b.p.y - a.p.y).slice(0, 24);
    if (top.length < 4) return 0;
    const t = setInterval(() => {
      for (let n = 0; n < BOLT_PER_TICK; n++)
        for (let a = 0; a < 3; a++){
          const x = top[Math.floor(Math.random()*top.length)], y = top[Math.floor(Math.random()*top.length)];
          if (x !== y && x.p.distanceTo(y.p) < BOLT_MAX_D){ boltFX(x.p, y.p); break; }
        }
    }, 45);
    setTimeout(() => clearInterval(t), ms || 1500);
    return top.length;
  },
  psLog(){ return psLog.slice(); },
  // ⚙️ ЭФФЕКТЫ ВЫБОРА ВЛАДЕЛЬЦА 2026-08-01 — отладка и стражи.
  // ⚠️ У ОГНЯ ПОКА НЕТ ИГРОВОГО ТРИГГЕРА: владелец одобрил ВИД («покажи, как он
  // может прям гореть»), но когда именно предмет загорается — отдельная спека,
  // её нет. До неё огонь живёт функцией и этой ручкой, а не механикой.
  // ⚙️ ГОРЯЩИЙ ПРЕДМЕТ: стык для бонуса (зона диспетчера) и ручки для стражей
  burning(){ return burningName(); },
  fireDue(ms){ if (ms != null) fireNextMs = performance.now() + ms; return fireNextMs; },
  ignite(i){
    // без индекса — САМЫЙ ВЕРХНИЙ живой: нулевой это сюрприз на дне, и огонь
    // на нём не виден вовсе (поймано первым же скрином при переносе)
    let it = i != null ? items[i] : null;
    if (!it){
      for (const c of items) if (c.alive && !c.surprise && (!it || c.p.y > it.p.y)) it = c;
    }
    if (!it || !it.alive) return null;
    // ⚠️ ЧЕРЕЗ МЕХАНИКУ, не голым эффектом (ловля стража бонуса v232): ручка
    // осталась от переноса эффектов и звала fireSilhouetteFX напрямую —
    // burningItem не ставился, бонус и «горит ровно один» её не видели.
    igniteItem(it);
    return { type: it.type && it.type.name, fires: fires.length };
  },
  extinguish(){ extinguishAll(); return fires.length; },
  firesN(){ return fires.length; },
  // срез для стражей переноса: жива ли ОБЩАЯ геометрия типа после распила и
  // не оброс ли предмет чужими детьми (огонь обязан быть накладкой-ребёнком,
  // а не правкой материала — иначе просочится в портреты коллекции)
  fxProbe(){
    // ⚠️ ДЕТИ СЧИТАЮТСЯ ПО ПРЕДМЕТАМ, А ГЕОМЕТРИЯ — ПО ТИПАМ, И ЭТО РАЗНЫЕ
    // ВЫБОРКИ. Первая версия складывала всё в карту по имени типа — и предмет
    // с накладкой огня ЗАТИРАЛСЯ другим предметом того же типа: страж честно
    // печатал «предметов с детьми 0» при горящем предмете. Классика «метрика
    // правдоподобна, но меряет не то».
    const byType = {};
    let kidsTotal = 0, kidsMax = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const k = it.mesh.children.length;
      kidsTotal += k; if (k > kidsMax) kidsMax = k;
      if (!it.type) continue;
      const g = it.mesh.geometry, a = g && g.attributes && g.attributes.position;
      const v = a ? a.count : 0;
      // по типу держим ХУДШЕЕ: если хоть у одного предмета типа геометрия
      // умерла, тип обязан считаться мёртвым
      if (!(it.type.name in byType) || v < byType[it.type.name]) byType[it.type.name] = v;
    }
    // ⚠️ СЧИТАЕМ САМИ ПОЛОВИНЫ ПО МЕТКЕ, А НЕ КОСВЕННЫЙ ИТОГ. Страж «объектов
    // сцены не стало больше» дважды оказался тавтологичным: при диверсии
    // (половины не убираются) число случайно совпадало с исправным, потому что
    // одновременно уходили перемолотые предметы. Метка keepGeo есть ТОЛЬКО у
    // половин распила — их и считаем поимённо.
    let halves = 0;
    for (const o of scene.children) if (o.userData && o.userData.keepGeo) halves++;
    return { types: Object.keys(byType).length, byType, kidsTotal, kidsMax, halves,
             fires: fires.length, fxN: fx.length };
  },
  grindNow(){ mixerGrind(); return true; },
  // камни: число живых (тесты рампы спавна) и индекс первого (постановка сцен)
  rocks(){ return items.filter(i => i.alive && i.rock).length; },
  rockIndex(){ return items.findIndex(i => i.alive && i.rock); },
  // бомба: индекс живой бомбы (-1 если нет) и принудительная детонация
  bombIndex(){ return items.findIndex(i => i.alive && i.bomb); },
  // РЕГРЕССИЯ #2 (спека владельца 2026-07-23 «переливающаяся бомба»): материал
  // бомбы — радужный MeshMatcapMaterial (bombMatcap), НЕ плоский MeshBasicMaterial.
  // Сьют ассертит type==='MeshMatcapMaterial' && hasMatcap.
  bombMatKind(){ const b = items.find(i => i.alive && i.bomb); if (!b) return null;
    const m = b.mesh.material; return { type: m.type, hasMatcap: !!m.matcap }; },
  detonate(){
    const b = items.find(i => i.alive && i.bomb && !i.animating);
    if (!b) return false;
    detonateBomb(b);
    return true;
  },
  // скрин-пробы эффектов: ВИДИМАЯ точка первого доступного предмета пачки
  // (для реального mouse.click в headless). v2 по флейк-репорту диспетчера
  // (v76): проекция ЦЕНТРА иногда попадала в ЗАГОРАЖИВАЮЩИЙ передний предмет
  // (клик матчил чужую группу: «−20» превращался в «+120»). Теперь точка
  // ищется рейкастом с камеры — центр + 8 смещений по экранным осям в
  // пределах охвата; отдаётся только пиксель, где предмет — ПЕРВОЕ
  // пересечение. Все точки закрыты у всех кандидатов -> {occluded:true}:
  // вызывающий делает встряску и повторяет.
  findByTex(tex){
    const ctx = pickCtx();
    let firstHidden = null;
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      if (!it.alive || !it.accessible || it.animating || it.type.tex !== tex) continue;
      const px = visiblePixel(it, ctx);
      if (px) return Object.assign({ i, name: it.type.name }, px);
      if (!firstHidden) firstHidden = { i, name: it.type.name, occluded: true };
    }
    return firstHidden;
  },
  // вес при встряске: средняя |v| живых тел по пачкам (car/animal/food/...)
  // — замер отклика сразу после shake(); для тюнинга SHAKE_RESP владельцем
  // отклик кучи ПО ВЫСОТЕ (замер «взрыв похож на shake», 2026-07-27):
  // средняя |v| и доля шевельнувшихся в трёх слоях — низ/середина/ВЕРХ.
  // Верх — ключевой: до второго слоя волны он стоял как вкопанный.
  velByHeight(){
    const alive = items.filter(i => i.alive && i.body && !i.animating);
    if (!alive.length) return {};
    const ys = alive.map(i => i.p.y).sort((a,b) => a-b);
    const q1 = ys[Math.floor(ys.length/3)], q2 = ys[Math.floor(ys.length*2/3)];
    const band = { низ: [], середина: [], верх: [] };
    for (const it of alive){
      const v = it.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      (it.p.y <= q1 ? band['низ'] : it.p.y <= q2 ? band['середина'] : band['верх']).push(s);
    }
    const out = {};
    for (const k in band){
      const a = band[k];
      out[k] = a.length ? { n: a.length, avg: +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2),
        max: +Math.max(...a).toFixed(2), movingPct: Math.round(a.filter(v=>v>0.5).length/a.length*100) } : null;
    }
    return out;
  },
  velByTex(){
    const m = {};
    for (const it of items){
      if (!it.alive || !it.body) continue;
      const v = it.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      const k = it.type.tex || it.type.name;
      (m[k] = m[k] || { n: 0, sum: 0 }).n++; m[k].sum += s;
    }
    for (const k in m) m[k] = +(m[k].sum / m[k].n).toFixed(2);
    return m;
  },
  sfx(){ return Sound.loaded(); }, // какие аудио-сэмплы декодированы
  // перф-срез для соак-теста и замеров на устройствах (см. soak.js):
  // времена кадра/шага физики за последние ~10 с + счётчики ресурсов,
  // по которым ловятся утечки (тела/коллайдеры/меши/геометрии/DOM/куча)
  // Обнулить кольца перф-метра: профилировка меряет ОКНО СЦЕНАРИЯ (взрыв,
  // осыпание), а не всю сессию — иначе кадры старта и skipIntro тянут
  // статистику и «взрыв» выходит дороже, чем он есть.
  // Тест-хук профилировки: перевести качество вниз РУКАМИ. Боевая автоматика
  // решает один раз за сессию по медиане кадра и НЕ РАБОТАЕТ В ИНТРО (см.
  // tickPerfTier) — а профилировать «слабый» тир на осыпании надо.
  perfTierSet(t){ const ok = applyPerfTier(t); if (ok) resize(); return CFG.perfTier; },
  // ⚠️ ТОЛЬКО ДЛЯ ЗАМЕРА ЧУВСТВИТЕЛЬНОСТИ, НЕ ДЛЯ БОЯ. Крутит числовые ручки
  // солвера на живом мире, чтобы понять ЦЕНУ каждой, прежде чем что-то менять.
  // Менять их всерьёз нельзя без слова владельца: итерации и подшаги держат
  // плотную кучу от взаимного проваливания, то есть это ПОВЕДЕНИЕ, а не
  // качество картинки (см. комментарий у applyPerfTier).
  // Перепись СЛОЖНОСТИ физической сцены: сколько тел и коллайдеров стоит
  // контейнер против предметов, и из скольких вершин строятся выпуклые
  // оболочки. Цена узкой фазы растёт с вершинами, цена широкой — с числом
  // прокси, а геймплей ни от того, ни от другого не зависит.
  colliderCensus(){
    let itemBodies = 0, itemCols = 0, hullVerts = [], compounds = 0;
    for (const it of items){
      if (!it.alive || !it.body) continue;
      itemBodies++;
      const n = it.body.numColliders(); itemCols += n;
      if (n > 1) compounds++;
      const g = it.geo || (it.mesh && it.mesh.geometry);
      if (g && g.attributes && g.attributes.position) hullVerts.push(g.attributes.position.count);
    }
    hullVerts.sort((a, b) => b - a);
    const total = world.bodies.len ? world.bodies.len() : -1;
    return { total, itemBodies, itemCols, staticBodies: total - itemBodies,
      compounds, hullMax: hullVerts[0] || 0,
      hullMed: hullVerts[hullVerts.length >> 1] || 0,
      hullSum: hullVerts.reduce((s, v) => s + v, 0) };
  },
  physKnobs(o){
    o = o || {};
    if (o.iters != null) try { world.numSolverIterations = o.iters; } catch(e){}
    if (o.ccdSub != null) try { world.maxCcdSubsteps = o.ccdSub; } catch(e){}
    if (o.ccd != null) for (const it of items) if (it.alive && it.body) it.body.enableCcd(!!o.ccd);
    if (o.maxSub != null) setMaxSubsteps(o.maxSub);
    return { iters: world.numSolverIterations, ccdSub: world.maxCcdSubsteps, maxSub: maxSubsteps() };
  },
  perfReset(){ frameRing.length = 0; stepRing.length = 0; solveRing.length = 0; syncRing.length = 0; subRing.length = 0; buildRing.length = 0; tapRing.length = 0;
    fxRing.length = 0; renRing.length = 0; uiRing.length = 0; perfWorstMs = 0;
    _worstFrame = null; _wfRaw = 0; _worstBuildFrame = null; _wbBuild = 0; },
  perfStats(){
    const q = a => {
      if (!a.length) return { avg: 0, p95: 0, max: 0 };
      const s = a.slice().sort((x, y) => x - y);
      return { avg: +(s.reduce((t, v) => t + v, 0)/s.length).toFixed(2),
        p95: +s[Math.min(s.length-1, Math.floor(s.length*0.95))].toFixed(2),
        max: +s[s.length-1].toFixed(2) };
    };
    return { frame: q(frameRing), step: q(stepRing),
      fx: q(fxRing), ren: q(renRing), ui: q(uiRing), parts: fxParticleCount(),
      solve: q(solveRing), sync: q(syncRing), sub: q(subRing), build: q(buildRing), tap: q(tapRing), tapPh: _tapPh,
      frames: perfFrames, worstMs: +perfWorstMs.toFixed(1), worstFrame: _worstFrame, worstBuildFrame: _worstBuildFrame,
      bodies: world.bodies && world.bodies.len ? world.bodies.len() : -1,
      colliders: world.colliders && world.colliders.len ? world.colliders.len() : -1,
      sceneChildren: scene.children.length, fxN: fx.length,
      geoms: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      domNodes: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : -1 };
  },
  // Постройка эффектов ПО ВИДАМ (A2): собственное время конструктора и число
  // вызовов. `build` в perfStats даёт только тотал, а он складывается из
  // очень разных статей (облако трухи против 15 осколков), и по тоталу нельзя
  // сказать, куда целить пул. reset=true обнуляет — замер идёт окном вокруг
  // события. ⚠️ Виды, которых нет в списке обёрток 70-fx, здесь НЕ ПОЯВЯТСЯ:
  // молчание — это «не обёрнут», а не «бесплатно».
  fxBreak(reset){ return fxBuildBreak(reset); },
  // Метки видов: список зарегистрированных + первая коллизия, если она есть.
  // ⚠️ Коллизия метки — НЕ косметика: `fxBuildBy` ключуется меткой, и две
  // разные функции под одним именем складываются в одну строку отчёта. Ровно
  // это и случилось с `'spark'` (поймала ГРАФИКА): число было суммой двух
  // эффектов и оказалось верным лишь потому, что один из них мёртв.
  fxKinds(){ return { kinds: Object.keys(fxKindOwner).sort(), dup: fxKindDup }; },
  // ОТЧЁТ ДЛЯ ЗАМЕРА НА ЖИВОМ ТЕЛЕФОНЕ (заказ диспетчера): всё, что нужно для
  // разбора лага, ОДНИМ объектом — владельцу достаточно нажать кнопку.
  // ⚠️ Счётчики НЕ сбрасываются: worstFrame копится с загрузки страницы, и это
  // ровно то, что нужно — «худший момент за партию», а не за последнюю секунду.
  perfReport(){
    const p = this.perfStats();
    return {
      когда: new Date().toISOString(),
      сборка: (document.getElementById('buildVer') || {}).textContent || '?',
      устройство: {
        ua: navigator.userAgent,
        экран: screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1),
        окно: innerWidth + '×' + innerHeight,
        ядер: navigator.hardwareConcurrency || '?',
        памятиГБ: navigator.deviceMemory || '?',
      },
      партия: { уровень: levelNum, живых: items.filter(i => i.alive).length,
        сложность: CFG.hard ? 'Hard' : 'Easy', тир: CFG.perfTier,
        dpr: renderer.getPixelRatio(), fxScale: CFG.fxScale, подшагов: maxSubsteps() },
      кадр: { p95: p.frame.p95, max: p.frame.max, кадров: p.frames },
      фазы_p95: { шаг: p.step.p95, солвер: p.solve.p95, синк: p.sync.p95,
        постройка: p.build.p95, тап: p.tap.p95, эффекты: p.fx.p95, ui: p.ui.p95, рендер: p.ren.p95 },
      худший_кадр: p.worstFrame,
      кадр_с_постройкой: p.worstBuildFrame,
      эффекты_по_видам: fxBuildBreak(false),
      сцена: { тел: p.bodies, коллайдеров: p.colliders, геометрий: p.geoms,
        drawCalls: p.drawCalls, треугольников: p.tris, частиц: p.parts, кучаМБ: p.heapMB },
    };
  },
  // отладка: телепорт предмета (постановка сцен доступности в тестах)
  place(i, x, y, z){
    const it = items[i];
    if (!it || !it.body) return false;
    it.body.setTranslation({ x, y, z }, true);
    it.body.setLinvel({ x:0, y:0, z:0 }, true);
    it.body.setAngvel({ x:0, y:0, z:0 }, true);
    // ГРАБЛЯ Rapier: query pipeline (castRay) видит телепорт только после
    // world.step() или явной прокачки — иначе лучи бьют по фантому
    if (world.propagateModifiedBodyPositionsToColliders) world.propagateModifiedBodyPositionsToColliders();
    syncMeshes();
    renderer.shadowMap.needsUpdate = true; // autoUpdate=false: телепорт без пробуждения физики оставлял тень на старом месте
    return true;
  },
  // Диагностика «дыры» (жалоба владельца 2026-07-30): краткий срез всех живых
  // тел — имя/высота/нижняя точка/сон/контакты. floaters() ловит зазор ПОД
  // предметом, но не ловит ПРОВАЛ СКВОЗЬ ПОЛ (провалившийся лежит на лопастях
  // с контактами и без зазора) — для него нужен именно y ниже FLOOR_REST.
  itemsBrief(){
    return items.filter(i => i.alive && i.body).map(i => ({
      name: i.type ? i.type.name : '?', y: +i.p.y.toFixed(2),
      bottom: +(i.p.y - i.r).toFixed(2), r: +i.r.toFixed(2),
      // low — нижняя точка по ориентированной коробке (bottom по охватной
      // сфере врёт вдвое у плоских). ⚠️ ОЦЕНКА СВЕРХУ, для порогов не годится;
      // pen — ИСТИННОЕ проникновение в плиту пола по манифолду (null = нет
      // контакта с полом), вот он ground truth.
      low: +lowestPoint(i).toFixed(3), pen: floorPenetration(i),
      d: +Math.hypot(i.p.x, i.p.z).toFixed(2),
      sleeping: i.body.isSleeping(), rock: !!i.rock, bomb: !!i.bomb
    }));
  },
  // диагностика провала: кто сидит ЦЕНТРОМ ниже пола. У выпуклого предмета,
  // лежащего на полу, центр ВСЕГДА выше FLOOR_REST на свой полу-габарит —
  // значит центр ниже пола = проникновение или уже провал насквозь.
  underFloor(){
    return items.filter(i => i.alive && i.body && i.p.y < FLOOR_REST)
      .map(i => ({ name: i.type.name, y: +i.p.y.toFixed(3),
        low: +lowestPoint(i).toFixed(3), pen: floorPenetration(i),
        d: +Math.hypot(i.p.x, i.p.z).toFixed(2), sleeping: i.body.isSleeping(),
        touching: this.contacts(items.indexOf(i)).touching,
        rock: !!i.rock, bomb: !!i.bomb }));
  },
  // ТЕСТ-ХУК СПАСАТЕЛЯ, НЕСУЩИЙ: прогнать sweep СИНХРОННО. Без него страж
  // пола был бы гонкой — place() физику НЕ будит, а на спящей куче sweep не
  // зовёт никто (stepPhysics не вызывается вовсе), и «зелёный» ничего не значил бы.
  // ⚠️ syncMeshes ОБЯЗАТЕЛЕН: спасатель двигает ТЕЛА, а item.p обновляется
  // только синхронизацией. В бою это неважно (следующий кадр всё равно
  // синхронизирует), но здесь без него хук отдавал бы старые координаты и
  // страж «после подъёма под полом никого» падал бы на пустом месте.
  rescueNow(){ const n = rescueSweep(); syncMeshes(); return n; },
  // заряд типа: состояние/грант/детонация (стражи сьюта)
  charge(){ return chargeState(); },
  chargeGrant(name, ms){ chargeName = name; chargeUntil = performance.now() + (ms || CHARGE_TTL_MS); updateHUD(); return chargeState(); },
  detonateCharge(){ return detonateCharge(); },
  chainAt(){ return chainComboAt(); },
  floaters(){
    // предмет «висит», если под его нижней точкой пусто больше 0.35.
    // ⚠️ Один луч из центра лжёт про «мосты»: плоский предмет (стейк) лежит
    // КОНЦАМИ на соседях, центр — над полостью, а у стены луч уходит мимо
    // диска пола сквозь клиновые щели внешних краёв ступенчатых панелей
    // (соак 2026-07-20, сид 101). Честная опора — контактные пары Rapier:
    // висун = gap>0.35 И contacts===0. contacts>0 при gap>0.35 — «мост», норма.
    const ray = new RAPIER.Ray({ x:0, y:0, z:0 }, { x:0, y:-1, z:0 });
    const out = [];
    for (const it of items){
      if (!it.alive || !it.body) continue;
      ray.origin.x = it.p.x; ray.origin.y = it.p.y - it.r - 0.02; ray.origin.z = it.p.z;
      if (ray.origin.y <= FLOOR_REST + 0.05) continue; // лежит на дне
      const hit = world.castRay(ray, 30, true, null, null, null, it.body);
      // Rapier 0.12+ переименовал toi -> timeOfImpact: с hit.toi зазор был
      // undefined, и floaters видел ТОЛЬКО случаи «луч не попал вовсе»
      // (gap=30) — конечные зависания молчали (нашлось соаком 2026-07-20)
      const gap = hit ? (hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi) : 30;
      if (gap > 0.35) out.push({ name: it.type.name, y: +it.p.y.toFixed(2),
        d: +Math.hypot(it.p.x, it.p.z).toFixed(2), gap: +gap.toFixed(2),
        contacts: this.contacts(items.indexOf(it)).touching, sleeping: it.body.isSleeping() });
    }
    return out;
  },
  // контактные пары нарровой фазы предмета i: pairs — соседи по AABB,
  // touching — с реальными точками контакта. Пары живут и на спящей куче
  // (наш глобальный сон не зовёт world.step, граф остаётся от последнего шага);
  // -1 = API недоступен (страховка на смену версии Rapier)
  contacts(i){
    const it = items[i];
    if (!it || !it.body || !world.contactPairsWith) return { pairs: -1, touching: -1 };
    let pairs = 0, touching = 0;
    try {
      for (let c = 0; c < it.body.numColliders(); c++){
        const col = it.body.collider(c);
        world.contactPairsWith(col, other => {
          pairs++;
          world.contactPair(col, other, m => { if (m.numContacts() > 0) touching++; });
        });
      }
    } catch (e){ return { pairs: -1, touching: -1 }; }
    return { pairs, touching };
  },
  accessibleList(){
    const out = [];
    items.forEach((it, i) => { if (it.alive && it.accessible) out.push(i); });
    return out;
  },
  // слепок по типам: сколько живых и сколько из них доступно
  typesSnapshot(){
    const m = {};
    items.forEach(it => {
      if (!it.alive) return;
      const n = it.type.name;
      (m[n] = m[n] || { alive: 0, acc: 0 }).alive++;
      if (it.accessible) m[n].acc++;
    });
    return m;
  },
  cam(){ return { az: +camAz.toFixed(3), phi: +camPhi.toFixed(3), r: +camR.toFixed(2), ty: +camTarget.y.toFixed(2), intro: !!intro, fly: !!hintFly }; },
  // отладка: постановка дистанции камеры (тесты зума: стекло чаши, витрина)
  setCamR(v){ camR = Math.max(6, Math.min(24, +v || camR)); updateCamera(); },
  // ПРИМИТИВЫ ПОД РЕКЛАМУ (контракт с ИНТЕГРАЦИЕЙ 2026-07-23). Боевой
  // потребитель — 78-ads: pause(true) на входе в показ, resume() на ВСЕХ
  // развязках, но ТОЛЬКО если pause вернул true (иначе снимем чужую паузу
  // от visibilitychange, которую обязан снять игрок кнопкой Continue).
  pause(silent){ return pauseGame(silent); },
  resume(){ resumeGame(); },
  sound: Sound, // setMuted/isMuted — внешний мьют, независимый от CFG.sound
  // отладка: состояние паузы, видимость попапа и ВНЕШНИЙ мьют
  pauseState(){ return { paused: paused,
    overlay: $('pauseOverlay').style.display === 'flex',
    muted: Sound.isMuted() }; },
  // отладка: поиск NaN в состоянии предметов
  scanNaN(){
    const bad = [];
    items.forEach((it, i) => {
      const ok = isFinite(it.p.x + it.p.y + it.p.z)
        && isFinite(it.mesh.position.x + it.mesh.position.y + it.mesh.position.z);
      if (!ok) bad.push({ i, name: it.type.name, alive: it.alive, p: [it.p.x, it.p.y, it.p.z] });
    });
    return bad;
  },
  topY(){ let m = 0; for (const it of items) if (it.alive) m = Math.max(m, it.p.y + it.r); return m; },
  // отладка/тесты: уникальные множители размера живых предметов (спека
  // «первые 15 уровней — один размер»: до ур.15 включительно ровно [1])
  sizes(){
    const s = new Set();
    for (const it of items) if (it.alive && !it.surprise) s.add(+((it.scl || 0) / MESH_SCALE).toFixed(3));
    return [...s].sort((a, b) => a - b);
  },
  // максимальный ВЫСТУП края предмета за внутреннюю поверхность стекла
  // (>0 — предмет визуально в стекле/снаружи; допуск ~0.0 благодаря WALL_GAP)
  // ⚠️ РАСПРЕДЕЛЕНИЕ, А НЕ МАКСИМУМ. `maxWallExcess` отдаёт ОДИН сэмпл на
  // прогон, и на нём нельзя ни ставить норму, ни сравнивать варианты: замер
  // 2026-07-31 показал, что редкие события на 8-16 прогонах дают
  // противоположный порядок вариантов. Здесь — выступ КАЖДОГО живого предмета,
  // то есть под две сотни сэмплов за один снимок.
  wallExcessAll(){
    const out = [];
    for (const it of items){
      if (!it.alive) continue;
      const d = Math.hypot(it.p.x, it.p.z);
      out.push(+((d + (d > 1e-3 ? radialReach(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r))) - radiusAt(it.p.y)).toFixed(3));
    }
    return out;
  },
  maxWallExcess(){
    let worst = -99, who = '';
    for (const it of items){
      if (!it.alive) continue;
      const d = Math.hypot(it.p.x, it.p.z);
      const ex = (d + (d > 1e-3 ? radialReach(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r))) - radiusAt(it.p.y);
      if (ex > worst){ worst = ex; who = it.type.name + ' y=' + it.p.y.toFixed(2) + ' d=' + d.toFixed(2)
        + ' wall=' + radiusAt(it.p.y).toFixed(2) + ' r=' + it.r.toFixed(2); }
    }
    return { excess: +worst.toFixed(3), who };
  },
  topItem(){ let best = null; for (const it of items) if (it.alive && (!best || it.p.y + it.r > best.p.y + best.r)) best = it;
    return best ? { name: best.type.name, y: +(best.p.y + best.r).toFixed(2), meshY: +best.mesh.position.y.toFixed(2), sleeping: best.body ? best.body.isSleeping() : null } : null; },
  // отладка: оставить по одному предмету каждого типа (для теста финала миксера)
  leaveSingles(){
    const seen = new Set();
    for (const it of items){
      if (!it.alive) continue;
      if (seen.has(it.key)){ removeItem(it); }
      else seen.add(it.key);
    }
    wakePhysics('leaveSingles');
    refreshAccessibility(); updateHUD();
  },
};

// Старт асинхронный: сперва WASM-инициализация Rapier
if (!window.RAPIER){
  window.__fatal && window.__fatal('Physics engine (Rapier) failed to load.');
} else {
  RAPIER.init().then(() => {
    initPhysicsWorld();
    resize(); updateCamera(); Ads.init(); genLevel(); loop();
    grabKeyFocus(); // Space работает с первого кадра, без клика по чаше
    // ⚠️ ФЛАГ «ИГРА ПОДНЯЛАСЬ» — по нему window.onerror (shell.html) перестаёт
    // хоронить сессию фатальным экраном. До этой строки ошибка действительно
    // означает «не запустилось», после — игра уже идёт, и падение чужого
    // скрипта не повод убивать партию (жалоба владельца 2026-07-29 со скрина:
    // «Failed to start 3D — Script error.» на работающей игре).
    window.__booted = true;
  }).catch(e => { window.__fatal && window.__fatal('Physics init failed: ' + e.message); });
}

// ⚠️ СЛУЖЕБНЫЙ ИНТЕРФЕЙС СНИМАЕТСЯ В БОЮ (спека владельца 2026-07-29).
// Не вырезан, а закрыт: на нём стоит весь сьют, и вырезав его, мы тестировали
// бы не то, что выпускаем. В боевой сборке window.__game просто отсутствует —
// вместе с ним закрыты starGrant (выдать валюту), buyBundle (бандл за $19.99
// бесплатно), setLevel и boostSetClock (переставить метку времени, на которой
// держится защита от перевода часов). Открыть на живом сайте: ?dev=1.
if (!DEV){ try { delete window.__game; } catch(e){ window.__game = undefined; } }
