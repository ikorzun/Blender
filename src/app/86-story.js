// ===== 86-story: бессловесные виньетки сюжета (канон — docs/STORY-SPEC.md) =====
// Задание владельца 2026-07-30: «реализуй сюжет, начни с К0 и К1».
//
// ЯДРО ЛОРА (§1 спеки): блендер одержим Великим Рецептом — смузи из всего
// сущего. Он уверен, что ИГРОК его лучший помощник: матч на его глазах
// выглядит как уничтожение (предметы лопаются в труху — наши же эффекты),
// он в восторге от комбо и НЕ ЗНАЕТ, что вещи уходят в музей. Игрок с первых
// минут знает больше злодея — казуальная ирония, понятная без единого слова.
//
// ⚠️ ИНВАРИАНТЫ, КОТОРЫЕ ЗДЕСЬ СОБЛЮДЕНЫ ДОСЛОВНО (§0 и §6 спеки):
//  1. БЕССЛОВЕСНО — ни одной реплики, только пиктограммы. Локализация не нужна
//     вовсе, и это осознанный инвариант роадмапа, а не экономия.
//  2. НОЛЬ ПРАВОК ГЕЙМПЛЕЯ — сюжет слой поверх: одна строка вызова в checkEnd
//     после show('winOverlay'), больше ядро не тронуто.
//  3. НЕ ДОБАВЛЯЕТ ЭКРАНОВ в цикл «победа → Дальше»: панель ВКЛАДЫВАЕТСЯ в уже
//     показанный экран победы (слой поверх), а не встаёт перед ним.
//  4. ≤4 с автономно, тап = мгновенный скип, скип НЕ наказывается.
//  5. ≤1 виньетки за STORY_GAP_LEVELS уровня; веха важнее очереди.
//  6. Никогда до первого тапа — гейт по stats.taps (см. storyOnWin).
//
// ⚠️ ЗОНА: разметку оверлея спека отдавала ИНТЕРФЕЙСУ. Я строю её ИЗ JS и не
// трогаю shell.html — так фича целиком лежит в своей зоне и не конфликтует с
// их ветками. Стилизацию/перенос в разметку интерфейс может забрать позже:
// точка входа одна (storyPlay), панели — чистые функции, возвращающие SVG.

const STORY_AUTO_MS = 4000;    // §6.2: панель живёт не дольше 4 с сама по себе
const STORY_GAP_LEVELS = 2;    // §6.3: не чаще одной виньетки на 2 уровня
const STORY_INK = '#fff', STORY_DIM = 'rgba(255,255,255,.5)', STORY_ACC = '#c0ff47';

// ── Словарь фигур. Язык — тот же, что у персонажа: белые формы, чёрные
// зрачки, плоская заливка. Никаких градиентов и теней (§3 спеки).
function stEye(cx, cy, r, pr, dx, dy){
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff"/>' +
         '<circle cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="' + pr + '" fill="#1d1c26"/>';
}
// Глаза блендера. mood повторяет каноничные состояния из EYES-CHARACTER-SPEC:
// 'calm' — сверяется с рецептом; 'dream' — взгляд вверх, мечтает; 'adore' —
// распахнутые зрачки, «помощник превзошёл себя».
function stEyes(cx, cy, mood){
  const m = { calm:  { r: 26, pr: 11, dx: 0,  dy: 2 },
              dream: { r: 26, pr: 10, dx: 2,  dy: -9 },
              adore: { r: 27, pr: 17, dx: 0,  dy: 0 } }[mood] || { r: 26, pr: 11, dx: 0, dy: 2 };
  return stEye(cx - 30, cy, m.r, m.pr, m.dx, m.dy) + stEye(cx + 30, cy, m.r, m.pr, m.dx, m.dy);
}
// Чаша миксера — узнаваемый силуэт, тонкий контур (в игре стекло почти прозрачно)
function stJar(x, y, w, h){
  const x2 = x + w, yb = y + h, i = w * 0.17;
  return '<path d="M' + x + ' ' + y + ' L' + x2 + ' ' + y +
         ' L' + (x2 - i) + ' ' + (yb - 12) + ' Q' + (x2 - i) + ' ' + yb + ' ' + (x2 - i - 14) + ' ' + yb +
         ' L' + (x + i + 14) + ' ' + yb + ' Q' + (x + i) + ' ' + yb + ' ' + (x + i) + ' ' + (yb - 12) + ' Z"' +
         ' fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2.5"/>';
}
// Пузырь мысли: облако + два хвостовых кружка к персонажу
function stBubble(x, y, w, h, tailX, tailY){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 3) +
         '" fill="rgba(255,255,255,.10)" stroke="' + STORY_DIM + '" stroke-width="2"/>' +
         '<circle cx="' + tailX + '" cy="' + tailY + '" r="7" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2"/>' +
         '<circle cx="' + (tailX - 11) + '" cy="' + (tailY + 15) + '" r="4.5" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2"/>';
}
// Пиктограммы ингредиентов — силуэты наших же пачек моделей (food/animal/car)
function stApple(x, y, s){
  return '<circle cx="' + x + '" cy="' + (y + s * .1) + '" r="' + s * .55 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + x + ' ' + (y - s * .45) + ' q' + s * .35 + ' -' + s * .35 + ' ' + s * .5 + ' -' + s * .1 +
         ' q-' + s * .3 + ' ' + s * .25 + ' -' + s * .5 + ' ' + s * .1 + ' Z" fill="' + STORY_INK + '"/>';
}
function stAnimal(x, y, s){ // мордочка с ушами — читается как «зверь»
  return '<circle cx="' + x + '" cy="' + (y + s * .05) + '" r="' + s * .5 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x - s * .45) + ' ' + (y - s * .3) + ' l' + s * .05 + ' -' + s * .45 + ' l' + s * .38 + ' ' + s * .26 + ' Z" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x + s * .45) + ' ' + (y - s * .3) + ' l-' + s * .05 + ' -' + s * .45 + ' l-' + s * .38 + ' ' + s * .26 + ' Z" fill="' + STORY_INK + '"/>';
}
function stCar(x, y, s){
  return '<rect x="' + (x - s * .6) + '" y="' + (y - s * .1) + '" width="' + s * 1.2 + '" height="' + s * .42 + '" rx="' + s * .14 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x - s * .34) + ' ' + (y - s * .1) + ' l' + s * .16 + ' -' + s * .3 + ' l' + s * .4 + ' 0 l' + s * .16 + ' ' + s * .3 + ' Z" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + (x - s * .32) + '" cy="' + (y + s * .34) + '" r="' + s * .16 + '" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + (x + s * .32) + '" cy="' + (y + s * .34) + '" r="' + s * .16 + '" fill="' + STORY_INK + '"/>';
}
function stGlobe(x, y, s){ // ЗЕМЛЯ — последняя строка рецепта
  return '<circle cx="' + x + '" cy="' + y + '" r="' + s * .58 + '" fill="none" stroke="' + STORY_INK + '" stroke-width="3"/>' +
         '<ellipse cx="' + x + '" cy="' + y + '" rx="' + s * .26 + '" ry="' + s * .58 + '" fill="none" stroke="' + STORY_INK + '" stroke-width="2.4"/>' +
         '<path d="M' + (x - s * .58) + ' ' + y + ' L' + (x + s * .58) + ' ' + y + '" stroke="' + STORY_INK + '" stroke-width="2.4"/>';
}
function stDots(x, y, s){ // «…» — раздел за разделом, до самого низа списка
  return '<circle cx="' + (x - s * .35) + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>' +
         '<circle cx="' + x + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>' +
         '<circle cx="' + (x + s * .35) + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>';
}
function stTap(x, y, s){ // палец-тап: кружок + расходящаяся волна
  return '<circle cx="' + x + '" cy="' + y + '" r="' + s * .26 + '" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + x + '" cy="' + y + '" r="' + s * .52 + '" fill="none" stroke="' + STORY_DIM + '" stroke-width="2.4"/>';
}
function stDust(x, y, s){ // труха — то, что ОН видит вместо спасения
  let o = '';
  const p = [[-.5,-.2,.13],[-.15,-.45,.1],[.2,-.25,.14],[.5,.05,.1],[-.35,.3,.11],[.1,.35,.13],[.42,-.4,.08]];
  for (const q of p) o += '<circle cx="' + (x + q[0] * s) + '" cy="' + (y + q[1] * s) + '" r="' + q[2] * s + '" fill="' + STORY_INK + '"/>';
  return o;
}
function stHeart(x, y, s){
  return '<path d="M' + x + ' ' + (y + s * .42) + ' C' + (x - s * .75) + ' ' + (y - s * .1) + ' ' + (x - s * .3) + ' ' + (y - s * .62) + ' ' + x + ' ' + (y - s * .18) +
         ' C' + (x + s * .3) + ' ' + (y - s * .62) + ' ' + (x + s * .75) + ' ' + (y - s * .1) + ' ' + x + ' ' + (y + s * .42) + ' Z" fill="' + STORY_ACC + '"/>';
}
function stArrow(x, y, w){
  return '<path d="M' + x + ' ' + y + ' L' + (x + w) + ' ' + y + '" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round"/>' +
         '<path d="M' + (x + w - 9) + ' ' + (y - 7) + ' L' + (x + w) + ' ' + y + ' L' + (x + w - 9) + ' ' + (y + 7) + '" fill="none" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
}

// ── ПАНЕЛИ ──────────────────────────────────────────────────────────────────
// К0 «Рецепт», панель 1: книга. Список ингредиентов по разделам, и последняя
// строка — ЗЕМЛЯ. Одна галочка (§3: максимум одна стрелка/галочка) стоит у
// первого раздела: он уже начал.
function stPanelK0a(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    // книга: две страницы с корешком
    '<rect x="112" y="26" width="216" height="178" rx="10" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    '<path d="M220 26 L220 204" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    stApple(158, 62, 26) + '<path d="M186 62 l7 8 l13 -16" fill="none" stroke="' + STORY_ACC + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
    stAnimal(158, 118, 26) +
    stCar(158, 172, 26) +
    stDots(274, 62, 30) +
    stGlobe(274, 140, 52) +
    // он сам, слева, сверяется со списком
    stJar(18, 96, 78, 96) + stEyes(57, 132, 'calm') +
    '</svg>';
}
// К0, панель 2: мечта. В пузыре — чаша, а внутри неё ЗЕМЛЯ. Взгляд вверх.
function stPanelK0b(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(122, 18, 214, 150, 108, 172) +
    stJar(186, 40, 88, 106) + stGlobe(230, 100, 56) +
    stJar(24, 118, 78, 92) + stEyes(63, 152, 'dream') +
    '</svg>';
}
// К1 «Помощник»: он смотрит на игрока с обожанием. В пузыре — как он ВИДИТ
// работу игрока: тап → труха. Сердечки снаружи: восторг помощником.
// ⚠️ Вся ирония держится на том, что зритель уже знает: труха — это спасение.
function stPanelK1(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(150, 20, 190, 104, 132, 132) +
    stTap(196, 72, 44) + stArrow(230, 72, 38) + stDust(300, 72, 40) +
    stJar(30, 118, 84, 96) + stEyes(72, 154, 'adore') +
    stHeart(26, 92, 24) + stHeart(114, 104, 18) +
    '</svg>';
}

// ── ГЛАВЫ. bit — разряд битмаски Save.st (§7): монотонно, мерж OR, глава не
// показывается дважды; потеря сейва = повтор с К0 (безвредно).
const STORY_CHAPTERS = [
  { id: 'k0', bit: 1, panels: [stPanelK0a, stPanelK0b] }, // пролог — 2 панели (§3)
  { id: 'k1', bit: 2, panels: [stPanelK1] },
];
function storySeen(bit){ return !!((Save.st || 0) & bit); }
// Какая глава «должна» сейчас. ВЕХА ВАЖНЕЕ ОЧЕРЕДИ (§6.3): К0 привязан к
// ПЕРВОЙ победе и паузу не ждёт, остальные — не чаще раза в 2 уровня.
function storyDue(){
  const lv = Math.max(1, levelNum - 1); // уровень, который только что пройден
  if (!storySeen(1)) return STORY_CHAPTERS[0];
  if (lv - (Save.sv || 0) < STORY_GAP_LEVELS) return null;
  if (!storySeen(2)) return STORY_CHAPTERS[1];
  return null;
}
let storyBusy = false;
// ⚠️ ГЛУШИЛКА ДЛЯ АВТОПРОГОНОВ. Виньетка — полноэкранный слой, и она честно
// глотает тап (иначе первый же тап по панели нажал бы «Дальше» под ней).
// В сьюте победы случаются десятками, и открытая панель съедала координатные
// клики следующих секций — ровно та грабля, о которой предупреждает раздел
// «Верификация» в CLAUDE.md («закрывать оверлеи перед координатными кликами»).
// Сьют глушит сюжет на время механических секций и включает в своей.
let storyOn = true;
function storyEnable(v){ storyOn = v !== false; }
// Точка входа: зовётся из checkEnd СРАЗУ ПОСЛЕ show('winOverlay') — панель
// ложится поверх уже показанного экрана победы, не добавляя шага в цикл.
function storyOnWin(){
  if (!storyOn) return;
  // §6.1 «никогда до первого тапа»: уровень, выигранный без единого тапа
  // (доехал финальной зачисткой), виньетку не открывает — подождёт следующего.
  if (!stats || !stats.taps) return;
  const ch = storyDue();
  if (ch) storyPlay(ch);
}
// Показ. Оверлей строится из JS (см. заметку о зонах в шапке файла).
function storyPlay(ch){
  if (storyBusy) return;
  storyBusy = true;
  let i = 0, timer = 0;
  const box = document.createElement('div');
  box.id = 'storyOverlay';
  box.setAttribute('style',
    'position:fixed; inset:0; z-index:45; display:flex; align-items:center; justify-content:center;' +
    'background:#0e1320; cursor:pointer; -webkit-tap-highlight-color:transparent;');
  const stage = document.createElement('div');
  stage.setAttribute('style', 'width:min(460px, 88vw); aspect-ratio:360/230; transition:opacity .18s;');
  box.appendChild(stage);
  // подсказка «тапни» — три точки прогресса, без единого слова (§0)
  const dots = document.createElement('div');
  dots.setAttribute('style', 'position:absolute; bottom:34px; display:flex; gap:8px;');
  box.appendChild(dots);
  const draw = () => {
    stage.innerHTML = ch.panels[i]();
    dots.innerHTML = ch.panels.map((_, k) =>
      '<i style="width:7px;height:7px;border-radius:50%;background:' +
      (k === i ? STORY_INK : 'rgba(255,255,255,.28)') + '"></i>').join('');
  };
  const next = () => {
    clearTimeout(timer);
    i++;
    if (i >= ch.panels.length){ close(); return; }
    draw();
    timer = setTimeout(next, STORY_AUTO_MS);
  };
  const close = () => {
    clearTimeout(timer);
    box.remove();
    storyBusy = false;
    // отметку ставим ПО ЗАВЕРШЕНИИ, включая скип: скип не наказывается (§6.2),
    // глава считается показанной и второй раз не всплывёт.
    Save.st = (Save.st || 0) | ch.bit;
    Save.sv = Math.max(Save.sv || 0, Math.max(1, levelNum - 1));
    commitSave();
    Telemetry.ev('story', { ch: ch.id });
  };
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); next(); });
  document.body.appendChild(box);
  draw();
  timer = setTimeout(next, STORY_AUTO_MS);
}
