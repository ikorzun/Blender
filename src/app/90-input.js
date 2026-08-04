// ===== 90-input: тап, вращение, пинч-зум, колесо, кнопки =====

const CAM_R_MIN = 9, CAM_R_MAX = 21; // чаша шире
function setCamR(r){ camR = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, r)); updateCamera(); }
// ВЕРТИКАЛЬНЫЙ ПАН ВЗГЛЯДА (спека владельца 2026-07-21: «чуть сместить
// камеру по вертикали, чтобы приподнять и рассмотреть остатки»): target
// камеры ездит по Y в узких пределах — вниз до дна (остатки в центре
// кадра), чуть вверх от дефолта. Основные жесты НЕ меняются; пан висит
// на ДОПОЛНИТЕЛЬНЫХ: движение ЦЕНТРА двухпальцевого щипка (зум как был —
// расстоянием), вертикальный драг ПРАВОЙ кнопкой, Shift+колесо.
// Сбрасывается на границах интро (resetPointers).
const TARGET_Y_MIN = 1.2, TARGET_Y_MAX = 5.2, TARGET_Y_DEF = 4.2;
function setTargetY(y){
  camTarget.y = Math.max(TARGET_Y_MIN, Math.min(TARGET_Y_MAX, y));
  updateCamera();
}
// АВТОПАН — ОДИН ШАГ В ЭНДШПИЛЕ (правки владельца 2026-07-21, финальная:
// «не поднимай ведро по вертикали в начале уровня... начни поднимать если
// в корзине остаётся 20% вещей от первоначальной загрузки. Иначе ведро
// плавает по вертикали, это неудобно»). Никакого непрерывного следования:
// весь уровень камера СТОИТ на дефолтных 4.2; когда живых предметов
// остаётся <= CAM_FOLLOW_FRAC от стартовой загрузки (level.aliveN0 из
// finalizeFill) — защёлка level.camFollowOn, и target ОДИН РАЗ плавно
// съезжает к полу автоматики (треть хода, «остальное игрок поднимет сам»)
// и больше не двигается. Досыпки цепи защёлку не снимают — обратного
// «плавания» нет. Ручной пан жестами перебивает автоматику на 4 с.
const AUTO_FOLLOW_MIN = TARGET_Y_DEF - (TARGET_Y_DEF - TARGET_Y_MIN) / 3; // 3.2
const CAM_FOLLOW_FRAC = 0.2;
let panManualUntil = 0, camFollowAt = 0;
function noteManualPan(){
  panManualUntil = performance.now() + 4000;
  hintFly = null; // жест игрока обрывает полёт подсказки
}
function tickCamFollow(dt){
  if (intro || !level || !level.aliveN0 || paused) return;
  const now = performance.now();
  if (now < panManualUntil) return;
  if (!level.camFollowOn){
    if (now < camFollowAt) return;
    camFollowAt = now + 500; // подсчёт живых — не каждый кадр
    let aliveCnt = 0;
    for (const it of items) if (it.alive && !it.surprise) aliveCnt++;
    if (aliveCnt > level.aliveN0 * CAM_FOLLOW_FRAC) return; // камера стоит
    level.camFollowOn = true;
  }
  const d = AUTO_FOLLOW_MIN - camTarget.y;
  if (Math.abs(d) > 0.005) setTargetY(camTarget.y + d * Math.min(1, dt * 1.5));
}
// ===== ПОЛЁТ КАМЕРЫ К ПОДСКАЗКЕ ===== (просьба тестеров, слово владельца
// 2026-08-03: «при клике на подсказку камера подъезжает к объекту, который
// можно совместить»). Ease-out 900 мс: азимут кратчайшей дугой к предмету,
// target.y к его высоте (в клампе пана), радиус до <=13 (если дальше).
// Любой ЖЕСТ игрока обрывает полёт мгновенно (обрыв в noteManualPan и в
// начале орбиты/щипка); автопан эндшпиля придержан той же panManualUntil —
// иначе он тут же утаскивал бы target назад к 3.2.
let hintFly = null;
function hintCamFly(item){
  const az2 = Math.atan2(item.p.x, item.p.z); // формула позиции: x=sin(az), z=cos(az)
  let dAz = az2 - camAz;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz)); // кратчайшая дуга
  hintFly = { t0: performance.now(), dur: 900,
    az0: camAz, az1: camAz + dAz,
    y0: camTarget.y, y1: Math.max(TARGET_Y_MIN, Math.min(TARGET_Y_MAX, item.p.y)),
    r0: camR, r1: Math.min(camR, 13) };
  panManualUntil = performance.now() + 4500;
}
function tickHintFly(){
  if (!hintFly) return;
  const k = (performance.now() - hintFly.t0) / hintFly.dur;
  const e = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3);
  camAz = hintFly.az0 + (hintFly.az1 - hintFly.az0) * e;
  camR = hintFly.r0 + (hintFly.r1 - hintFly.r0) * e;
  camTarget.y = Math.max(TARGET_Y_MIN, Math.min(TARGET_Y_MAX, hintFly.y0 + (hintFly.y1 - hintFly.y0) * e));
  updateCamera();
  if (k >= 1) hintFly = null;
}
let rdrag = null; // вертикальный пан правой кнопкой (контекст-меню и так отключено)
let pDown = null, dragging = false, pinch = null;
// последняя позиция курсора/касания — к ней привязано кольцо заряда цепи
let lastPtrX = innerWidth / 2, lastPtrY = innerHeight / 2;
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  if (intro) return; // во время интро камера скриптована — жесты не копим
  if (e.button === 2){ rdrag = { y: e.clientY, ty0: camTarget.y }; noteManualPan(); return; } // правый драг = пан, в тап/орбиту не идёт
  touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (touches.size === 2){
    const [a,b] = [...touches.values()];
    pinch = { d0: Math.hypot(a.x-b.x, a.y-b.y), r0: camR, cy: (a.y+b.y)/2 };
    pDown = null; dragging = false; // пинч отменяет тап и вращение
  } else if (touches.size === 1){
    pDown = { x:e.clientX, y:e.clientY, az:camAz, phi:camPhi };
    dragging = false;
    faceLook(e.clientX, e.clientY); // персонаж провожает палец взглядом
  } else {
    pDown = null;
  }
});
canvas.addEventListener('pointermove', e => {
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  if (intro) return; // во время интро камера скриптована
  if (rdrag){ noteManualPan(); setTargetY(rdrag.ty0 + (e.clientY - rdrag.y) * 0.012); return; } // контент следует за мышью
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pinch && touches.size === 2){
    const [a,b] = [...touches.values()];
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    if (d > 1) setCamR(pinch.r0 * pinch.d0 / d); // пальцы разводятся -> приближение
    // движение ЦЕНТРА щипка по вертикали — пан взгляда (контент следует за пальцами)
    const cy = (a.y + b.y) / 2;
    noteManualPan();
    setTargetY(camTarget.y + (cy - pinch.cy) * 0.012);
    pinch.cy = cy;
    return;
  }
  if (!pDown) return;
  const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
  if (!dragging && Math.hypot(dx,dy) > 9){
    dragging = true;
    // курсор «сжатая рука» на время драга камеры (десктоп; CSS в shell по
    // классу html.grabbing, тачам класс безвреден — курсоров у них нет)
    document.documentElement.classList.add('grabbing');
  }
  if (dragging){
    camAz = pDown.az - dx*0.006;
    camPhi = Math.max(0.32, Math.min(1.35, pDown.phi - dy*0.004)); // до ~77° — вид сбоку на миксер
    updateCamera();
  }
});
function endPointer(e){
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  rdrag = null;
  document.documentElement.classList.remove('grabbing'); // разжать руку-курсор
}
// сброс всех жестов (вызывается на границах интро: зажатый в интро палец
// не должен превращаться в драг со старой базой камеры)
// ⛔ ДРОЖЬ КУРСОРА НА ОШИБКЕ — ЖИЛА 20 МИНУТ И ОТВЕРГНУТА ВЛАДЕЛЬЦЕМ живым
// тестом 2026-07-31 («убери дрожь курсора»; до этого он же успел ужать её с
// 1 c до 0.5 c — не помогло). Была: чередование двух хотспотов ±2px, классы
// cshake-a/b. НЕ ВОЗВРАЩАТЬ без его слова; реализация — в истории v200.
function resetPointers(){
  document.documentElement.classList.remove('grabbing');
  touches.clear();
  pDown = null; dragging = false; pinch = null; rdrag = null;
  panManualUntil = 0; camFollowAt = 0; // защёлка camFollowOn живёт в level — новую создаёт genLevel
  setTargetY(TARGET_Y_DEF); // пан взгляда не переживает границы интро/уровня
}
canvas.addEventListener('pointerup', e => {
  if (pDown && !dragging && !pinch && !intro) handleTap(e.clientX, e.clientY);
  endPointer(e);
  pDown = null; dragging = false;
});
canvas.addEventListener('pointercancel', e => { endPointer(e); pDown = null; dragging = false; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (intro) return;
  // Shift+колесо — вертикальный пан взгляда (скролл вниз = смотреть ниже);
  // обычное колесо — зум, как было
  if (e.shiftKey){ noteManualPan(); setTargetY(camTarget.y - e.deltaY * 0.004); }
  else setCamR(camR + e.deltaY * 0.012);
}, { passive:false });
// ЗУМ КНОПКАМИ (нода 829:1242, спека владельца «добавил зум по просьбе
// тестировщиков»). ⚠️ Ведём ТУ ЖЕ `setCamR`, что колесо и щипок: пределы
// CAM_R_MIN/MAX и `updateCamera` живут внутри неё, поэтому кнопки не могут
// увести камеру туда, куда не пускают жесты. Шаг 1.6 — примерно щелчок колеса
// (0.012 × ~133), то есть кнопка и колесо ощущаются одинаково.
// ⚠️ Гейт `intro` — как у колеса: в интро ввод глушится целиком.
const ZOOM_STEP = 1.6;
function zoomBy(d){ if (intro) return; setCamR(camR + d); }
$('zoomInBtn').addEventListener('click', () => zoomBy(-ZOOM_STEP));   // ближе = меньше радиус
$('zoomOutBtn').addEventListener('click', () => zoomBy(+ZOOM_STEP));
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', ()=>Sound.unlock()); // WebAudio живёт только после жеста (iOS)

$('shakeBtn').addEventListener('click', requestShake);
// В AD-СОСТОЯНИИ ТАП = РОЛИК, а не обычная подсказка. Подтверждающего оверлея
// НЕТ намеренно (решение МЕТЫ, диспетчер согласовал): слово «Ad» на кнопке уже
// делает тап осознанным; исторический оверлей встряски сюда не копируем.
// showHint() и сам перенаправил бы, но явная ветка читается честнее и не
// зависит от порядка проверок внутри него.
// ЗАРЯД ТИПА: клик = детонация, мгновенно, без подтверждения (попапы
// отвергнуты канонично). Гварды внутри detonateCharge.
// ⚠️ POINTERDOWN, НЕ CLICK (жалоба владельца с телефона: «приходится нажимать
// дважды и есть задержка»): click синтезируется на up и глотается, если между
// down и up узел моргнул (растворение пишет opacity покадрово) или палец чуть
// уехал. pointerdown срабатывает МГНОВЕННО и не зависит от up.
// stopPropagation — чтобы тот же down не утёк в жестыканваса/бара.
$('chargeBtn').addEventListener('pointerdown', (e)=>{
  e.stopPropagation(); e.preventDefault();
  try { detonateCharge(); } catch(err){}
});
$('hintBtn').addEventListener('click', ()=>{
  if (typeof adHintAvailable === 'function' && adHintAvailable()) requestAdHint();
  else showHint();
});
$('againBtn').addEventListener('click', ()=>{ hide('winOverlay'); Ads.maybeInterstitial(); genLevel(); });
$('loseAgainBtn').addEventListener('click', ()=>{ hide('loseOverlay'); genLevel(); }); // БЕЗ maybeInterstitial: межстраничная только на ПОБЕДНОМ переходе (againBtn), не на Retry из тупика (там спасение — rewarded Continue) — спека владельца 2026-07-24
// ×2 монет за rewarded на экране победы (второй по конверсии плейсмент)
$('winX2Btn').addEventListener('click', ()=>{
  $('winX2Btn').style.display = 'none';
  // выигрыш захватываем В МОМЕНТ КЛИКА: к концу ролика level может смениться
  // (checkEnd пересоздаёт coinsWon уже для нового уровня)
  const won = level.coinsWon;
  Ads.showRewarded(()=>{
    addCoins(won);
    $('winCoins').textContent = '+' + (won * 2) + ' 🪙 (×2)';
    Telemetry.ev('rw', { p: 'x2' });
    updateHUD();
  }, ()=>{ $('winX2Btn').style.display = ''; }); // FAILED/CLOSED — кнопка возвращается
});
// Continue после поражения — 1 раз за уровень
$('loseAdContinue').addEventListener('click', ()=>{
  Ads.showRewarded(()=>{ Telemetry.ev('rw', { p: 'continue' }); continueRun(); });
});
// ⚠️ КНОПКИ «ПРИЦЕЛ» И «МЕТАЛЛОИСКАТЕЛЬ» УДАЛЕНЫ (спека владельца 2026-07-29:
// «при загрузке в мобильном моргают старые кнопки магнита и ещё что-то в левом
// нижнем углу — это всё нужно удалить»). Они лежали в разметке видимыми и
// прятались лишь ПЕРВЫМ тиком updateHUD, то есть после запуска движка — отсюда
// и моргание. ОТМЕНЯЕТ прежнее «не удаляй, скрой флагом» (2026-07-18/21).
// Сама механика (scopeHighlight/detectorHighlight, PRICE_SCOPE, флаги
// SCOPE_ENABLED/MAGNET_ENABLED) НЕ тронута — вернуть кнопки = вернуть эти
// два обработчика и две строки разметки в bottomBar.
// глаза миксера: ТАП = ПРОВОКАЦИЯ (спека владельца 2026-07-30 «клик или тап на
// глаза сразу злит миксер и включает измельчение»; ОТМЕНЯЕТ «подмигивает»
// 2026-07-19). Механика НЕ новая — тот же путь, что наказание за простой:
// терпение объявляется исчерпанным (lastAction в прошлое), планировщик 99-main
// начинает жевать нижние пары; глаза злеют САМИ — помол перебивает все
// состояния (канон глаз). Первый укус НЕМЕДЛЕННО (nextGrind = now).
// Останавливается как обычный помол: любой матч/встряска сбрасывают простой.
// ⚠️ Звук 'match' УБРАН — он ВРАЛ «совместил» (AUDIO-PLAN §1 звал это прямой
// ложью); свой звук даёт сам помол, отдельного не выдумываем.
// ⚠️ Цена провокации = цена помола (−20/укус со 2-го уровня, ур.1 без штрафов
// по общей таблице) — владелец просил именно «включает измельчение», смягчать
// без его слова нельзя.
$('eyes').addEventListener('click', ()=>{
  const el = $('eyes');
  el.classList.remove('bounce'); void el.offsetWidth;
  el.classList.add('bounce');
  setTimeout(()=>{ el.classList.remove('bounce'); }, 450);
  vibrate(25);
  if (intro || paused || !level || level.over) return; // вне партии — только подскок
  stats.lastAction = performance.now() - (level.idleLimit + 0.5)*1000; // терпение исчерпано
  level.nextGrind = performance.now();                                 // укус сразу
  Telemetry.ev('poke', { lv: levelNum });
});
// ПАУЗА (макет ИНТЕРФЕЙСА: кнопка слева сверху вместо ⚙️, оверлей с
// Continue/Restart/Settings). Под капотом — НАСТОЯЩАЯ заморозка pauseGame/
// resumeGame (99-main): стоп-кадр, сдвиг всех часовых якорей, afterPause-
// очередь; хендлеры pauseBtn/resumeBtn ниже, у блока клавиатуры.
// Выходы из паузы в genLevel/настройки обязаны резюмить (иначе loop стоит
// стоп-кадром, а интро нового уровня не тикает).
$('pauseRestart').addEventListener('click', ()=>{ resumeGame(); genLevel(); });
$('museumBtn').addEventListener('click', openMuseum);
$('museumClose').addEventListener('click', closeMuseum);
// демо-кнопка всплывашки (панель разработчика): случайный живой предмет
$('tierDemoBtn').addEventListener('click', ()=>{
  const alive = items.filter(i => i.alive && !i.surprise);
  if (!alive.length) return;
  const it = alive[(Math.random() * alive.length) | 0];
  showTierUp({ name: String(it.key), tier: 2, mult: 1.25, item: it });
});
$('pauseSettings').addEventListener('click', ()=>{
  resumeGame(); $('debugPanel').style.display = 'block';
});
$('loseContinue').addEventListener('click', ()=>{ hide('loseOverlay'); level.over = false; level.stuck = -8; }); // ~5 c форы, потом тупик покажется снова
// ⚙️-панель открывается из паузы (кнопки ⚙️ на игровом экране больше нет)
$('radiusToggle').addEventListener('change', e => { CFG.radiusOn = e.target.checked; $('radiusVal').parentElement.style.opacity = CFG.radiusOn ? 1 : 0.4; updateHUD(); });
// сложность живёт в localStorage — выбор переживает перезагрузку
try { CFG.hard = localStorage.getItem('mixer_hard') === '1'; } catch(e){}
$('hardToggle').checked = CFG.hard;
$('hardToggle').addEventListener('change', e => applyHard(e.target.checked));
$('radiusRange').addEventListener('input', e => { CFG.baseRadius = parseFloat(e.target.value); updateMatchRadius(); $('radiusVal').textContent = CFG.matchRadius.toFixed(2); updateHUD(); });
$('hlToggle').addEventListener('change', e => { CFG.highlight = e.target.checked; refreshAccessibility(); });
$('soundToggle').addEventListener('change', e => applySound(e.target.checked));
// ЗАМЕР НА ЖИВОМ ТЕЛЕФОНЕ (заказ диспетчера): владелец играет уровень и
// нажимает одну кнопку — отчёт уходит в буфер обмена.
// ⚠️ ТРИ ПУТИ, И ВСЕ ТРИ НУЖНЫ: `navigator.clipboard` требует защищённого
// контекста (на портале https есть, на file:// нет), старый execCommand просит
// РЕАЛЬНОГО выделения, а если не сработало и это — текст обязан остаться на
// экране, чтобы владелец скопировал руками. Молча ничего не сделать нельзя:
// он не программист и второй попытки не будет.
$('perfCopyBtn').addEventListener('click', ()=>{
  let txt = '';
  try { txt = JSON.stringify(__game.perfReport(), null, 1); }
  catch(e){ txt = 'perfReport error: ' + (e && e.message); }
  const out = $('perfOut');
  out.style.display = 'block'; out.value = txt;
  // ⚠️ ФОРМУЛИРОВКА ТОСТА — НЕ КОСМЕТИКА. `execCommand('copy')` умеет вернуть
  // true, ничего не положив (замер на незащищённом origin: `navigator.clipboard`
  // отсутствует, execCommand отчитался успехом, буфер пуст). Скажи мы «скопировано»
  // — владелец нажмёт «вставить», получит пустоту и бросит: попытка у него одна.
  // Поэтому текст ВСЕГДА остаётся в видимом поле и выделен, а тост говорит про
  // ОБА пути. Ничего не обещаем сверх того, что можем гарантировать.
  const done = () => { out.select(); toast('Perf report ready — paste in chat (or copy from the box)'); };
  const manual = () => { out.select(); toast('Copy the text from the box below'); };
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done, () => {
      out.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
      ok ? done() : manual();
    });
  } else {
    out.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    ok ? done() : manual();
  }
});
$('restartBtn').addEventListener('click', ()=>{ $('debugPanel').style.display='none'; genLevel(); });
// ЧАША-РАЗЛЁТ (прототип v2): стендовые кнопки — та же точка, что у турбо
if ($('bowlCrackBtn')) $('bowlCrackBtn').addEventListener('click', ()=>{ bowlCrackAdd(); });
if ($('bowlShatterBtn')) $('bowlShatterBtn').addEventListener('click', ()=>{
  if (level && !level.over){ level.bowlCracks = bowlN(); shatterBowl(); }
  $('debugPanel').style.display='none';
});
if ($('bowlNInp')) $('bowlNInp').addEventListener('change', (e)=>{ bowlNRuntime = Math.max(0, parseInt(e.target.value,10)||0); });

// ===== ГЛАВНЫЙ ЭКРАН / ПАУЗА (макет 770:1271) — обработчики =====
// Сложность и звук управляются ИЗ ДВУХ МЕСТ (чекбоксы паузы + контролы
// главного экрана) — единые точки, чтобы состояния не разъезжались.
function applyHard(v){
  CFG.hard = !!v;
  try { localStorage.setItem('mixer_hard', CFG.hard ? '1' : '0'); } catch(e){}
  if (level) level.idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // таймер миксера живо следует сложности
  refreshAccessibility(); updateHUD();
  $('hardToggle').checked = CFG.hard;
  if (typeof refreshMainSettings === 'function') refreshMainSettings();
}
// ⚠️ ТОНКАЯ ОБЁРТКА над applySoundVol (85-hud) — держателю состояний паузы
// (#soundToggle) нужен именно ВКЛ/ВЫКЛ. Включение возвращает ПОСЛЕДНЮЮ
// ненулевую громкость (а не всегда 100): игрок, поставивший 40 и щёлкнувший
// тумблером, должен получить свои 40, иначе тумблер тихо стирает его выбор.
function applySound(on){
  applySoundVol(on ? soundVolPrev : 0);
}
// ВЕСЬ Play-блок кликабелен → возврат в игру (спека владельца «всякая область
// тапабельна»): хендлер на КАРТОЧКУ .ms-play, а не на кнопку — клик по кнопке
// (внутри) доходит тем же всплытием, поэтому отдельный хендлер кнопки СНЯТ
// (иначе двойной closeMainScreen/genLevel). Пустое поле карточки — тоже цель.
function menuPlayResume(){
  const fresh = !level || level.over; // нет живой партии — СТАРТ новой
  closeMainScreen();                  // снимет ТОЛЬКО свою паузу (см. 85-hud)
  if (fresh) genLevel();
}
document.querySelector('.ms-play').addEventListener('click', menuPlayResume);
// ПЛАВАЮЩАЯ КНОПКА ведёт туда же, что и карточка Play — одно действие, один
// путь (иначе разошлись бы гварды паузы и старта новой партии).
$('msFloatResume').addEventListener('click', menuPlayResume);
// ПРОКРУТКА МЕНЮ: два независимых показа (спеки владельца 2026-07-31).
//  `#msSticky.on` — блок «My Collection» ушёл за верх вью → сверху ВЫЕЗЖАЕТ
//                   компактная шапка ноды 815:1506;
//  `.playoff`     — карточка Play ушла за верх → снизу всплывает кнопка 815:1521.
// ⚠️ ПОРОГИ РАЗНЫЕ И ПРИВЯЗАНЫ К РАЗНЫМ БЛОКАМ — это прямая спека, а не вкус:
// шапку владелец просил «ТОЛЬКО когда блок My Collection уходит», а кнопку —
// когда не видно настоящей. Связать их одним порогом значило бы показывать
// дубль поверх видимого оригинала (кнопка) или прятать шапку до срока.
// ⚠️ Слушатель passive — иначе браузер ждёт обработчик перед прокруткой и на
// телефоне скролл начинает подтормаживать.
// Кнопка плавающей шапки — ЗЕРКАЛО: клик уходит в настоящую, чтобы обработчик
// и его гварды жили в одном месте.
if ($('msGetMore2')) $('msGetMore2').addEventListener('click', () => $('msGetMore').click());
(function(){
  const ms = $('mainScreen'), play = document.querySelector('.ms-play'),
        sticky = $('msSticky');
  if (!ms || !play) return;
  ms.addEventListener('scroll', () => {
    // ⚠️ ПЛАВАЮЩАЯ ШАПКА — ПО УХОДУ БЛОКА «My Collection» ЗА ВЕРХ ВЬЮ (спека
    // владельца 2026-07-31), а НЕ по факту прокрутки. Порог — НИЖНЯЯ кромка
    // заголовка: пока он хоть частью виден, «My collection» читалось бы на
    // экране дважды. Заголовок живёт в потоке над сеткой, его rect и есть
    // граница блока.
    if (sticky){
      const t = document.querySelector('.ms-coll-title');
      sticky.classList.toggle('on', !!t && t.getBoundingClientRect().bottom <= 0);
    }
    // ⚠️ ПОРОГ КНОПКИ — ПРОСТО ВЕРХ ВЬЮ. Прежде он считался от низа ЗАЛИПШЕЙ
    // шапки: та висела над карточкой Play и делала её ненажимаемой раньше, чем
    // кнопка уходила за экран (мёртвое окно 78px). Залипания больше нет —
    // шапка едет с потоком, ничего не перекрывает, и окно закрывается само.
    ms.classList.toggle('playoff', play.getBoundingClientRect().bottom <= 0);
  }, { passive: true });
})();
// отладочная панель — из меню (раньше вход был в карточке паузы)
if (DEV) $('msDev').addEventListener('click', ()=>{ closeMainScreen(); $('debugPanel').style.display = 'block'; });
// Sound-ползунок = ГРОМКОСТЬ 0..1 (симметрично Music). Было «вкл/выкл по
// порогу» — из-за этого положение ползунка не сохранялось (см. applySoundVol).
$('msSound').addEventListener('input', e => { applySoundVol(parseInt(e.target.value, 10) / 100); msFill(e.target); });
// Music-ползунок = ГРОМКОСТЬ фонового трека (0..1); applyMusic сам заводит/глушит
$('msMusic').addEventListener('input', e => { applyMusic(parseInt(e.target.value, 10) / 100); msFill(e.target); });
// ПЕРВЫЙ ЖЕСТ страницы разблокирует автоплей (audio.play() до жеста браузер
// блокирует). Один раз, пассивно — игровые pointerdown-хендлеры не задеты.
let bgmUnlocked = false;
function unlockBgm(){
  if (bgmUnlocked) return; bgmUnlocked = true;
  const bgm = $('bgm'); if (bgm){ bgm.volume = musicVol; if (musicVol > 0) bgm.play().catch(()=>{}); }
}
window.addEventListener('pointerdown', unlockBgm, { passive: true });
$('msDiff').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  applyHard(b.dataset.hard === '1');
});
// Get More / Subscribe / Boost / Open — ЭКОНОМИЧЕСКИЕ РАЗВИЛКИ (МЕТА/ИНТЕГРАЦИЯ):
// на плейсхолдере до решения владельца, действие — заметка «скоро»
// «MORE STARS» (Get More) — экран бандлов бустера (макеты 783:95 / 785:112).
// Открывается ПОВЕРХ меню; игра уже на паузе меню, своей паузы НЕ ставим
// (владение паузой — у openMainScreen, лезть туда нельзя, см. CLAUDE.md).
$('msGetMore').addEventListener('click', ()=> show('starsOverlay'));
$('starsClose').addEventListener('click', ()=> hide('starsOverlay'));
// ПОКУПКА — через ручку МЕТЫ buyBundle(tier). Ручки может ещё не быть:
// тогда НИЧЕГО НЕ НАЧИСЛЯЕМ (мок-начисление запрещено — это валюта), а ведём
// себя как прежний Get More в тестбилде: тост «Coming soon» + console.warn.
// КЛИК/ТАП ПО ВСЕЙ КАРТОЧКЕ = КЛИК ПО КНОПКЕ ПОКУПКИ (спека владельца
// 2026-07-28). ⚠️ Клик по САМОЙ кнопке пропускаем — иначе покупка ушла бы
// ДВАЖДЫ (обработчик кнопки + этот). Делегирование на оверлее: карточки
// статичны, но так правило переживёт возможную пересборку разметки.
$('starsOverlay').addEventListener('click', (e) => {
  if (e.target.closest('.st-buy')) return;      // кнопка отработает сама
  const card = e.target.closest('.st-card'); if (!card) return;
  const btn = card.querySelector('.st-buy'); if (btn) btn.click();
});
document.querySelectorAll('#starsOverlay .st-buy').forEach(btn => {
  btn.addEventListener('click', ()=>{
    // ⚠️ ИМЯ ТИРА — СТРОКА, А НЕ ЧИСЛО. Здесь стоял `+btn.dataset.tier`, то есть
    // в buyBundle уходило 5, а бандлы зовутся 'bundle5' — товар не находился,
    // функция тихо возвращала отказ, и его никто не читал. Игрок жал
    // «Upgrade $4.99» и не получал НИЧЕГО: ни покупки, ни ошибки. Сьют дыру не
    // видел, потому что звал buyBundle строкой и кнопку не нажимал.
    const tier = 'bundle' + btn.dataset.tier;
    if (typeof buyBundle !== 'function'){ toast('Coming soon'); return; }
    // ⚠️ 🔴 В БОЮ ТОВАР НЕ ВЫДАЁТСЯ, ПОКА НЕТ ПЛАТЕЖЕЙ (репорт ИНТЕГРАЦИИ
    // 2026-07-29, дыра моя). История в две ступени: сперва кнопка не работала
    // вовсе (число вместо строкового id), в v163 я это починил — и она стала
    // начислять бандл БЕЗ ОПЛАТЫ, при живых ценниках $4.99/$9.99/$19.99 на
    // раздаваемой сборке. Платёжного шлюза в проекте нет вообще: `payments`
    // Bridge не используется ни разу.
    // ⚠️ ПОЧЕМУ НЕ СНЯТЬ КНОПКУ СОВСЕМ: владельцу нужна ЭМУЛЯЦИЯ купленного
    // режима, чтобы смотреть бустер на экране. Поэтому выдача осталась, но
    // ТОЛЬКО в разработке (DEV: file://, localhost, ?dev=1) — там же, где живёт
    // весь служебный интерфейс. В бою — честное «скоро».
    // ГЕЙТ СНЯТ ВМЕСТЕ С ВВОДОМ bridge.payments (пакет Интеграции
    // 2026-08-03, как и предписывал прежний комментарий): в бою покупка
    // идёт ЧЕРЕЗ ПЛАТЁЖ — Ads.purchase(tier) сам проводит оплату и выдачу
    // (внутри порядок «выдать -> закрыть»); мы читаем {ok}. Где платежей
    // нет (площадка без payments) — прежнее честное «скоро».
    if (!DEV){
      if (!(typeof Ads === 'object' && Ads.purchase)){ toast('Coming soon'); return; }
      Ads.purchase(tier).then((res) => {
        if (!res || !res.ok){
          console.warn('[stars] покупка не прошла:', tier, res);
          toast(res && (res.reason === 'unsupported' || res.reason === 'unavailable') ? 'Coming soon' : 'Purchase failed');
          return;
        }
        Sound.play('surprise', 0.55); vibrate([15, 30, 15]);
        hide('starsOverlay'); refreshMainScreen();
      });
      return;
    }
    const res = buyBundle(tier);
    // ⚠️ РЕЗУЛЬТАТ ЧИТАЕМ ОБЯЗАТЕЛЬНО: молчаливый отказ — это ровно то, из-за
    // чего дыра прожила незамеченной. Любое будущее расхождение имени теперь
    // видно и игроку, и в консоли.
    if (!res || !res.ok){
      console.warn('[stars] покупка не прошла:', tier, res);
      toast('Purchase failed'); return;
    }
    Sound.play('surprise', 0.55); vibrate([15, 30, 15]);
    toast('TEST: booster activated');   // видно, что это эмуляция, а не покупка
    hide('starsOverlay'); refreshMainScreen();
  });
});
// msSubscribe удалён вместе с баннером меню (слово владельца 2026-08-03)
$('msGrid').addEventListener('click', e => {
  const btn = e.target.closest('.msc-boost');
  if (btn){
    // «Open» у локнутых — ещё заглушка (открытие типа идёт прогрессией уровней)
    if (btn.dataset.act !== 'boost'){ toast('Coming soon'); return; }
    const boostKey = btn.closest('.msc').dataset.key;
    const res = buyBoost(boostKey);
    // refreshMainScreen пересобирает сетку (баланс/доступность прочих) — целебрацию
    // вешаем ПОСЛЕ, на свежую карточку по ключу (зелёная доливка + частицы радости)
    if (res.ok){ Sound.play('surprise', 0.55); vibrate([15, 30, 15]); refreshMainScreen(); boostCelebrate(boostKey); }
    else toast(res.reason === 'capped' ? 'Max tier reached' : 'Not enough stars');
    return;
  }
  const card = e.target.closest('.msc'); if (!card || card.classList.contains('lock')) return;
  // #4 (спека владельца): ТАП = СПИН портрета (как ховер на десктопе). На ТАЧе
  // (нет hover) тап крутит портрет toggle БЕЗ смены размера; на десктопе спин
  // даёт hover, а клик — по-прежнему выбор карточки (визуал).
  if (!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches)){ msCardTapSpin(card); return; }
  msSelKey = (msSelKey === card.dataset.key) ? null : card.dataset.key; // выбор карточки (визуал)
  buildMainCollection();
});
// ДЕСКТОП/ПЛАНШЕТ (макет 747:1048): #lvlSvg (LV) и #tmSvg (время) живут в левой
// группе у паузы. МОБАЙЛ (#11, спека владельца 2026-07-27 «над очками — УРОВЕНЬ,
// не время»): #lvlSvg переносим в правый стек перед #scSvg (LV над очками), а
// #tmSvg остаётся СКРЫТЫМ (время — атавизм). Узлы физически переносятся — id не
// дублируются. Время вернуть = флаг LEVEL_TIME_IN_HUD.
function layoutHUD(){
  const desk = innerWidth >= 768;
  const left = document.querySelector('#topBar .grp');
  if (desk){
    left.appendChild($('lvlSvg'));       // LV у паузы (десктоп-макет)
    left.appendChild($('tmSvg'));        // время тоже слева (скрыто флагом)
    $('lvlSvg').style.display = '';       // управление отдаём CSS (media ≥768 → block)
  } else {
    $('statStack').insertBefore($('tmSvg'), $('scSvg'));   // время скрыто, но держим в стеке
    $('statStack').insertBefore($('lvlSvg'), $('scSvg'));  // LV прямо над очками
    $('lvlSvg').style.display = 'block';  // база CSS прячет #lvlSvg — показываем в стеке
  }
  $('tmSvg').style.display = LEVEL_TIME_IN_HUD ? '' : 'none'; // время скрыто из HUD (флаг off)
  // после смены раскладки масштаб рамок другой — пережать по контенту
  if (typeof fitStat === 'function'){ fitStat('lvlNum'); fitStat('timer'); }
}
addEventListener('resize', layoutHUD);
layoutHUD();
// Звук интерфейса: один делегированный хук на ВСЕ кнопки (спека владельца)
document.addEventListener('click', e => {
  if (e.target && e.target.closest && e.target.closest('button')) Sound.play('ui');
}, true);
// Space = встряска (десктоп): гварды внутри requestShake (интро/конец)
addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat){
    e.preventDefault();
    if (paused) return;
    // под оверлеями рекламы Space чашу не трясёт (и не открывает второй
    // вопрос о встряске поверх идущего ролика)
    if ($('adOverlay').style.display === 'flex') return; // adAskOverlay удалён (ролик идёт сразу)
    requestShake();
  }
});
// Клавиатура должна работать СРАЗУ, без клика по чаше: во встраивании
// (превью-панель, порталы) iframe глух к клавишам, пока не получит фокус —
// забираем его программно при старте и при каждом возврате в окно
function grabKeyFocus(){ try { canvas.focus({ preventScroll: true }); } catch(e){} }
addEventListener('focus', grabKeyFocus);
document.addEventListener('visibilitychange', () => {
  // свёрнутая вкладка = пауза: rAF в фоне не тикает, а часы миксера/комбо
  // идут — игрок возвращался к съеденным предметам. Гварды (интро/конец/уже
  // на паузе) внутри pauseGame; резюмится игрок сам кнопкой Continue.
  // ⚠️ ЧЕРЕЗ МЕНЮ, а не голый pauseGame(): карточка pauseOverlay больше не
  // показывается (её заменил главный экран) — НЕтихая пауза оставила бы
  // игрока перед осиротевшим попапом. openMainScreen ставит паузу тихо и
  // берёт владение на себя, снимет её кнопка Resume.
  if (document.hidden) openMainScreen();
  else grabKeyFocus();
});
// ⚠️ ОБЁРТКА ОБЯЗАТЕЛЬНА: pauseGame(silent) с 2026-07-23 принимает аргумент,
// а слушатель передал бы в него объект события — MouseEvent truthy, и попап
// паузы молча перестал бы показываться (поймано сьютом сразу же).
// ПАУЗА = ГЛАВНЫЙ ЭКРАН (спека владельца «это и главный экран и пауза»):
// вместо карточки pauseOverlay открывается меню. Пауза ставится ТИХО внутри
// openMainScreen, и только своя — поверх рекламной меню не открывается.
$('pauseBtn').addEventListener('click', openMainScreen);
$('resumeBtn').addEventListener('click', resumeGame);
$('resetBtn').addEventListener('click', ()=>{
  resetProgress();
  $('debugPanel').style.display = 'none';
  toast('Progress reset');
  genLevel(); updateHUD();
});

// ═══ НАЖАТИЕ КУРСОРА ═══ (слово владельца 2026-08-02 дословно: «когда я
// кликаю на кнопку мыши, на 3-5% уменьшай курсор на долю секунды и потом
// возвращай. Делай это быстро, но не дергано, чтобы было ощущение нажатия»)
// PNG-курсор нельзя масштабировать CSS'ом — на старте генерим 96%-копии
// ОБЕИХ картинок (рука и захват) canvas'ом вокруг их hotspot (иначе кончик
// пальца сместился бы и клик «поехал») и на 140 мс вешаем html.cursorpress.
// Только мышь: у тача курсора нет. 140 мс фиксированно — быстро, но целиком
// видимо глазу; возврат таймером, не mouseup (при удержании курсор
// возвращается сам — «на долю секунды» по спеке).
let cursorPressTimer = 0, cursorPressReady = false;
(function buildPressedCursors(){
  const found = { point: null, grab: null }; // {uris:[1x,2x], hot:[x,y], fall}
  const walk = (rules) => {
    for (const rule of rules){
      // ⚠️ БЕЗ continue по cssRules: в свежем Chromium (вложенный CSS)
      // .cssRules есть у КАЖДОГО правила — «сначала дети» пропускало бы всё
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      const cur = rule.style && rule.style.cursor;
      if (!cur || cur.indexOf('image-set') < 0 || cur.indexOf('data:image') < 0) continue;
      const uris = [...cur.matchAll(/url\("?(data:image\/png;base64,[^")\s]+)"?\)/g)].map(m => m[1]);
      const tail = cur.match(/\)\s+(\d+)\s+(\d+)\s*,\s*([a-z-]+)/);
      if (uris.length < 2 || !tail) continue;
      const rec = { uris: uris.slice(0, 2), hot: [+tail[1], +tail[2]], fall: tail[3] };
      if (tail[3] === 'grabbing') found.grab = rec;
      else if (!found.point) found.point = rec; // рука: первое base-правило
    }
  };
  try{
    for (const sheet of document.styleSheets){
      try{ walk(sheet.cssRules); }catch(e){}
    }
  }catch(e){}
  if (!found.point || !found.grab) return; // курсоры не наши — тихо без эффекта
  const SHRINK = 0.96; // −4%, середина спеки «3-5%»
  const shrinkOne = (uri, hx, hy) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.translate(hx, hy); ctx.scale(SHRINK, SHRINK); ctx.translate(-hx, -hy);
      ctx.drawImage(img, 0, 0);
      res(cv.toDataURL('image/png'));
    };
    img.onerror = rej;
    img.src = uri;
  });
  const shrinkPair = (rec) => Promise.all([
    shrinkOne(rec.uris[0], rec.hot[0], rec.hot[1]),          // 1x: hotspot как есть
    shrinkOne(rec.uris[1], rec.hot[0]*2, rec.hot[1]*2),      // 2x: hotspot ×2 в пикселях
  ]);
  Promise.all([shrinkPair(found.point), shrinkPair(found.grab)]).then(([p, g]) => {
    const set = (pair, rec) =>
      `image-set(url(${pair[0]}) 1x, url(${pair[1]}) 2x) ${rec.hot[0]} ${rec.hot[1]}, ${rec.fall} !important`;
    const st = document.createElement('style');
    st.id = 'cursorPressStyle';
    // селекторы повторяют боевые: база+кнопки — рука, grabbing — захват;
    // правило grabbing НИЖЕ и специфичнее, чтобы во время драга сжимался
    // именно захват, без подмены картинки (иначе было бы «дёргано»)
    st.textContent =
      'html.cursorpress, html.cursorpress body, html.cursorpress #c, html.cursorpress button,' +
      ' html.cursorpress input[type=range], html.cursorpress input[type=checkbox],' +
      ' html.cursorpress .ms-play, html.cursorpress .devlink, html.cursorpress .ms-sub,' +
      ' html.cursorpress .st-buy { cursor: ' + set(p, found.point) + '; }\n' +
      'html.grabbing.cursorpress, html.grabbing.cursorpress #c { cursor: ' + set(g, found.grab) + '; }';
    document.head.appendChild(st);
    cursorPressReady = true;
  }).catch(() => {});
})();
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || !cursorPressReady) return;
  document.documentElement.classList.add('cursorpress');
  clearTimeout(cursorPressTimer);
  cursorPressTimer = setTimeout(() => document.documentElement.classList.remove('cursorpress'), 140);
}, true); // capture: срабатывает и на кнопках, чей клик мог бы не всплыть
