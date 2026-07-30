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
function noteManualPan(){ panManualUntil = performance.now() + 4000; }
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
$('restartBtn').addEventListener('click', ()=>{ $('debugPanel').style.display='none'; genLevel(); });

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
// ПРОКРУТКА МЕНЮ: два состояния (спека владельца 2026-07-31).
//  `.stuck`   — шапка уже уехала под свой `top`, показываем её видом ноды 815:1506;
//  `.playoff` — карточка Play ушла ЗА ВЕРХ экрана, снизу всплывает кнопка 815:1521.
// ⚠️ ДВА РАЗНЫХ ПОРОГА, а не один: шапка обязана меняться сразу при прокрутке,
// а кнопка — только когда настоящая кнопка Play не видна; связать их одним
// порогом значило бы показывать дубль поверх видимого оригинала.
// ⚠️ Слушатель passive — иначе браузер ждёт обработчик перед прокруткой и на
// телефоне скролл начинает подтормаживать.
(function(){
  const ms = $('mainScreen'), play = document.querySelector('.ms-play'),
        head = document.querySelector('.ms-head');
  if (!ms || !play) return;
  ms.addEventListener('scroll', () => {
    ms.classList.toggle('stuck', ms.scrollTop > 4);
    // ⚠️ ПОРОГ — ПО НИЗУ ЗАЛИПШЕЙ ШАПКИ, А НЕ ПО НУЛЮ ЭКРАНА. Карточка Play
    // уходит ПОД шапку раньше, чем за верх вью, и в этом окне (замер: 78px
    // прокрутки) настоящая кнопка уже не нажимается, а плавающей ещё нет —
    // нажать было нечего. Низ шапки читаем с живого узла: он зависит от
    // safe-area, числом его не зашить.
    const порог = head ? head.getBoundingClientRect().bottom + 8 : 8;
    ms.classList.toggle('playoff', play.getBoundingClientRect().bottom < порог);
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
    // ⚠️ СНИМАТЬ ЭТОТ ГЕЙТ ТОЛЬКО ВМЕСТЕ С ВВОДОМ bridge.payments, не раньше.
    if (!DEV){ toast('Coming soon'); return; }
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
$('msSubscribe').addEventListener('click', ()=> toast('Coming soon'));
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
