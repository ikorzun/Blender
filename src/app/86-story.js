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
// ⚠️ ПРОЛОГ ЖИВЁТ БЫСТРЕЕ виньеток: он стоит ПЕРЕД первой игрой, и каждая
// лишняя секунда здесь бьёт по козырю портала «играю через 20 секунд».
// 3 панели × 2.6 с = 7.8 с в худшем случае, если игрок не трогает экран вовсе;
// тап пролистывает мгновенно, то есть внимательный проходит за ~1-2 с.
const STORY_INTRO_MS = 2600;
const STORY_GAP_LEVELS = 2;    // §6.3: не чаще одной виньетки на 2 уровня
const STORY_INK = '#fff', STORY_DIM = 'rgba(255,255,255,.5)', STORY_ACC = '#c0ff47';
const STORY_BG = '#0e1320', STORY_PAPER = '#161c2a', STORY_FIRE = '#ff5a3c';

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
  // ЗЛЫЕ — отдельная форма (в игре это eyes-3, клин): белок закрывается сверху-
  // изнутри «бровью» цветом подложки. Так злость читается без новой геометрии.
  if (mood === 'angry'){
    const brow = (bx, dir) =>
      '<path d="M' + (bx - 30 * dir) + ' ' + (cy - 34) + ' L' + (bx + 30 * dir) + ' ' + (cy - 8) +
      ' L' + (bx + 30 * dir) + ' ' + (cy - 34) + ' Z" fill="' + STORY_BG + '"/>';
    return stEye(cx - 30, cy, 26, 12, -3, 5) + brow(cx - 30, 1) +
           stEye(cx + 30, cy, 26, 12,  3, 5) + brow(cx + 30, -1);
  }
  const m = { calm:  { r: 26, pr: 11, dx: 0,  dy: 2 },
              dream: { r: 26, pr: 10, dx: 2,  dy: -9 },
              adore: { r: 27, pr: 17, dx: 0,  dy: 0 },
              doubt: { r: 26, pr: 10, dx: -8, dy: 3 },   // взгляд в сторону: «а куда они деваются?»
              sly:   { r: 26, pr: 12, dx: 7,  dy: 6 },   // хитрые: зрачки вниз-вбок (в игре eyes-2)
              shock: { r: 30, pr: 8,  dx: 0,  dy: 0 } }[mood] || { r: 26, pr: 11, dx: 0, dy: 2 };
  // хитрым добавляем полуприкрытое верхнее веко — иначе они читаются как спокойные
  const lid = mood === 'sly'
    ? '<rect x="' + (cx - 62) + '" y="' + (cy - 30) + '" width="124" height="17" fill="' + STORY_BG + '"/>' : '';
  return stEye(cx - 30, cy, m.r, m.pr, m.dx, m.dy) + stEye(cx + 30, cy, m.r, m.pr, m.dx, m.dy) + lid;
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
// Знак вопроса — рисуем ПУТЁМ, а не текстом: шрифт не нужен, локализация тоже
// (символ, а не слово — инвариант «бессловесно» цел).
function stQuestion(x, y, s){
  return '<path d="M' + (x - s * .34) + ' ' + (y - s * .34) +
         ' a' + s * .36 + ' ' + s * .36 + ' 0 1 1 ' + s * .62 + ' ' + s * .3 +
         ' q-' + s * .28 + ' ' + s * .22 + ' -' + s * .28 + ' ' + s * .42 + '"' +
         ' fill="none" stroke="' + STORY_INK + '" stroke-width="' + s * .17 + '" stroke-linecap="round"/>' +
         '<circle cx="' + (x + s * .06) + '" cy="' + (y + s * .62) + '" r="' + s * .11 + '" fill="' + STORY_INK + '"/>';
}
// Полка музея: предметы стоят ЦЕЛЫМИ и довольными — то, чего он не ожидал увидеть
function stShelf(x, y, w){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="7" rx="3" fill="' + STORY_DIM + '"/>';
}
function stSpark(x, y, s){
  return '<path d="M' + x + ' ' + (y - s) + ' L' + (x + s * .28) + ' ' + (y - s * .28) +
         ' L' + (x + s) + ' ' + y + ' L' + (x + s * .28) + ' ' + (y + s * .28) +
         ' L' + x + ' ' + (y + s) + ' L' + (x - s * .28) + ' ' + (y + s * .28) +
         ' L' + (x - s) + ' ' + y + ' L' + (x - s * .28) + ' ' + (y - s * .28) + ' Z" fill="' + STORY_ACC + '"/>';
}
function stFlame(x, y, s){
  // ⚠️ Симметричная «капля» читалась КАПЛЕЙ, а не огнём (видно на скрине).
  // Язык пламени делаем АСИММЕТРИЧНЫМ и с внутренним ядром посветлее —
  // два тона превращают силуэт в огонь без градиентов и текстур.
  const outer = 'M' + x + ' ' + (y - s) +
    ' q' + s * .34 + ' ' + s * .42 + ' ' + s * .16 + ' ' + s * .72 +
    ' q' + s * .30 + ' -' + s * .12 + ' ' + s * .22 + ' -' + s * .40 +
    ' q' + s * .42 + ' ' + s * .58 + ' -' + s * .04 + ' ' + s * 1.02 +
    ' q-' + s * .34 + ' ' + s * .30 + ' -' + s * .72 + ' 0' +
    ' q-' + s * .46 + ' -' + s * .52 + ' ' + s * .38 + ' -' + s * 1.34 + ' Z';
  const core = 'M' + x + ' ' + (y - s * .14) +
    ' q' + s * .30 + ' ' + s * .34 + ' ' + s * .06 + ' ' + s * .60 +
    ' q-' + s * .26 + ' ' + s * .18 + ' -' + s * .40 + ' -' + s * .06 +
    ' q-' + s * .18 + ' -' + s * .28 + ' ' + s * .34 + ' -' + s * .54 + ' Z';
  return '<path d="' + outer + '" fill="' + STORY_FIRE + '"/>' +
         '<path d="' + core + '" fill="#ffc247"/>';
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

// К2 «Куда?..»: первое сомнение. В пузыре предмет ТАЕТ и на его месте «?».
// Он впервые замечает, что смолотое куда-то девается. Сетап твиста К4.
function stPanelK2(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(146, 22, 194, 106, 130, 134) +
    stApple(190, 74, 30) +
    '<g opacity=".45">' + stArrow(216, 74, 34) + '</g>' +
    stQuestion(292, 74, 40) +
    stJar(30, 116, 84, 96) + stEyes(72, 152, 'doubt') +
    '</svg>';
}
// К3 «Раздел второй»: чек-лист рецепта. Сад закрыт ✓ — на очереди ЗВЕРИ.
// Хитрые глаза: план идёт по плану (он всё ещё уверен, что побеждает).
function stPanelK3(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    '<rect x="140" y="34" width="196" height="162" rx="10" fill="' + STORY_PAPER + '" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    stApple(186, 80, 28) +
    '<path d="M222 80 l8 9 l15 -18" fill="none" stroke="' + STORY_ACC + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M186 112 L186 132" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M180 126 L186 134 L192 126" fill="none" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    stAnimal(186, 160, 30) +
    '<circle cx="252" cy="160" r="15" fill="none" stroke="' + STORY_INK + '" stroke-width="3"/>' +
    stJar(24, 112, 84, 96) + stEyes(66, 148, 'sly') +
    '</svg>';
}
// К4 «Музей?!» — ТВИСТ, 3 панели: он видит полку со «смолотыми» целыми →
// шок → ярость. Дальше эскалация сложности получает нарративное объяснение.
function stPanelK4a(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stApple(130, 92, 30) + stAnimal(196, 92, 32) + stCar(266, 96, 32) +
    stSpark(160, 58, 8) + stSpark(232, 54, 7) + stSpark(300, 66, 6) +
    stShelf(96, 122, 210) +
    stJar(20, 130, 74, 84) + stEyes(57, 160, 'calm') +
    '</svg>';
}
function stPanelK4b(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stApple(126, 74, 26) + stAnimal(186, 74, 28) + stCar(250, 78, 28) +
    stShelf(96, 100, 190) +
    stJar(120, 132, 110, 84) + stEyes(175, 168, 'shock') +
    '</svg>';
}
function stPanelK4c(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stFlame(96, 150, 46) + stFlame(268, 146, 42) +
    stFlame(52, 172, 30) + stFlame(310, 170, 32) + stFlame(180, 60, 26) +
    stJar(116, 104, 128, 100) + stEyes(180, 140, 'angry') +
    '</svg>';
}

// ── ВЕХИ-ТРИГГЕРЫ. ⚠️ Выведены из МОИХ данных (Save.ac, пожизненные счётчики
// по типам), а не из событий интерфейса: спека привязывала К2-К4 к музею, но
// музей И ЕСТЬ эти счётчики — тип «на полке», если его хоть раз спасли.
// Так главы не ждут чужой зоны и работают уже сегодня.
const STORY_SET_MIN = 4; // «зал» — пачка от 4 типов: пачки из 1-2 (forest/arcade/
// market) стоят в ХВОСТЕ массива, но защита нужна на будущее: сет из одного
// предмета не должен считаться собранным залом и запускать твист.
function stPacks(){
  const by = {};
  for (const t of TYPES) if (t.tex) (by[t.tex] = by[t.tex] || []).push(t.name);
  return by;
}
// Пачки, в которых есть тип с ДОСТИГНУТОЙ первой ступенью накопления
function stTieredPacks(){
  const by = stPacks(), out = [];
  // ⚠️ accCountTier, а НЕ accTier: последний складывает заработанное с
  // КУПЛЕННЫМ за деньги (boostTier). На accTier веха «первый экспонат встал на
  // полку» выдавалась бы игроку, который НИЧЕГО не собрал, а просто купил
  // Boost — сюжет поздравлял бы с чужой заслугой. Поймано собственным
  // прогоном: сьют покупает бусты, и К2 всплывал при нулевых счётчиках.
  for (const k in by) if (by[k].some(n => accCountTier(n) >= 1)) out.push(k);
  return out;
}
// Первый ПОЛНЫЙ зал: все типы пачки хоть раз спасены (и пачка не карликовая)
function stFullSet(){
  const by = stPacks();
  for (const k in by){
    if (by[k].length < STORY_SET_MIN) continue;
    if (by[k].every(n => accCount(n) > 0)) return k;
  }
  return null;
}

// ── ГЛАВЫ. bit — разряд битмаски Save.st (§7): монотонно, мерж OR, глава не
// показывается дважды; потеря сейва = повтор с К0 (безвредно).
// `when` — веха главы. null = «сразу, как дошла очередь».
const STORY_CHAPTERS = [
  { id: 'k0', bit: 1, panels: [stPanelK0a, stPanelK0b], when: null },       // пролог — 2 панели (§3)
  { id: 'k1', bit: 2, panels: [stPanelK1],  when: null },
  // первый «экспонат встал на полку» = первый тип, добравшийся до 1-й ступени
  { id: 'k2', bit: 4, panels: [stPanelK2],  when: () => stTieredPacks().length >= 1 },
  // «раздел второй» = ступень появилась во ВТОРОЙ пачке (новый зал рецепта)
  { id: 'k3', bit: 8, panels: [stPanelK3],  when: () => stTieredPacks().length >= 2 },
  // ТВИСТ: первый полностью собранный зал
  { id: 'k4', bit: 16, panels: [stPanelK4a, stPanelK4b, stPanelK4c], when: () => !!stFullSet() },
];
function storySeen(bit){ return !!((Save.st || 0) & bit); }
// Какая глава «должна» сейчас. ВЕХА ВАЖНЕЕ ОЧЕРЕДИ (§6.3): К0 привязан к
// ПЕРВОЙ победе и паузу не ждёт, остальные — не чаще раза в 2 уровня.
function storyDue(){
  const lv = Math.max(1, levelNum - 1); // уровень, который только что пройден
  // ⚠️ ПОРЯДОК СТРОГИЙ: глава ждёт, пока показана предыдущая. Иначе твист К4
  // («он узнал про музей») мог бы опередить К2 («первое сомнение») — у игрока
  // с быстрым сетом сюжет собрался бы задом наперёд.
  for (const ch of STORY_CHAPTERS){
    if (storySeen(ch.bit)) continue;
    if (ch.when && !ch.when()) return null;   // веха не наступила — и следующие ждут
    // К0 привязан к ПЕРВОЙ победе и паузу не ждёт (веха важнее очереди, §6.3)
    if (ch.bit !== 1 && lv - (Save.sv || 0) < STORY_GAP_LEVELS) return null;
    return ch;
  }
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
// ⚠️ ТОЧКА ВЫЗОВА ПЕРЕЕХАЛА (слово владельца 2026-08-06: «экран анонса нового
// предмета должен быть перед уровнем и ПОСЛЕ статистики пройденного уровня.
// Сейчас он сразу же после уровня и это не логично»). Раньше звался из checkEnd
// СРАЗУ ПОСЛЕ show('winOverlay') и ложился поверх ещё не прочитанной статистики;
// теперь его зовёт кнопка «Next» (90-input) и ждёт `done`, чтобы уровень
// начинался ПОСЛЕ анонса. Комментарий выше про «панель поверх экрана победы»
// этим ОТМЕНЁН.
// ⚠️ `done` ОБЯЗАН вызваться на ВСЕХ ветках, включая отказные (сюжет выключен,
// уровень без тапов, главы нет) — иначе кнопка «Next» молча перестала бы
// начинать уровень в самом частом случае: когда анонса нет.
function storyOnWin(done){
  const fin = () => { if (done) done(); };
  if (!storyOn) return fin();
  // §6.1 «никогда до первого тапа»: уровень, выигранный без единого тапа
  // (доехал финальной зачисткой), виньетку не открывает — подождёт следующего.
  if (!stats || !stats.taps) return fin();
  const ch = storyDue();
  if (ch) storyPlay(ch, fin); else fin();
}
// Показ. Оверлей строится из JS (см. заметку о зонах в шапке файла).
function storyPlay(ch, done){
  if (storyBusy){ if (done) done(); return; }
  storyBusy = true;
  const autoMs = ch.intro ? STORY_INTRO_MS : STORY_AUTO_MS;
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
    timer = setTimeout(next, autoMs);
  };
  const close = () => {
    clearTimeout(timer);
    box.remove();
    storyBusy = false;
    // отметку ставим ПО ЗАВЕРШЕНИИ, включая скип: скип не наказывается (§6.2),
    // глава считается показанной и второй раз не всплывёт.
    Save.st = (Save.st || 0) | (ch.marks || ch.bit);
    Save.sv = Math.max(Save.sv || 0, Math.max(1, levelNum - 1));
    commitSave();
    Telemetry.ev('story', { ch: ch.id });
    if (done) done();
  };
  storyDismiss = close; // чтобы skipIntro/тесты могли закрыть панель штатно
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); next(); });
  document.body.appendChild(box);
  draw();
  timer = setTimeout(next, autoMs);
}
// ── ПРОЛОГ (спека владельца 2026-07-30: «рассказать эту историю ПЕРЕД игрой
// в виде комикса»). ⚠️ ЭТО ОСОЗНАННАЯ ОТМЕНА правила §6.1 спеки «никогда до
// первого тапа сессии»: оно защищало козырь «играю через 20 секунд», и слово
// владельца новее. Риск снят КОНСТРУКЦИЕЙ, а не игнором:
//  • пролог встроен в фазу 'wait' интро — занавес площадки уже убран, чаша
//    пустая, а предметы ЕЩЁ НЕ ПАДАЛИ. Значит анимация заполнения (владелец
//    отдельно за неё бился) не теряется: она просто начинается после комикса.
//  • панели быстрее обычных (2.6 с против 4), тап пролистывает мгновенно;
//  • показывается РОВНО ОДИН РАЗ за жизнь сейва и только НОВОМУ игроку.
// ⚠️ Условие «st === 0», а не «бит не стоит»: у игрока, который уже видел К0/К1
// между уровнями по старой схеме, пролог НЕ всплывёт — иначе он посмотрел бы
// тот же контент дважды. Закрытие пролога метит и К0, и К1 — между уровнями
// они больше не придут.
const STORY_PROLOGUE = { id: 'p0', bit: 32, marks: 32 | 1 | 2, intro: true,
                         panels: [stPanelK0a, stPanelK0b, stPanelK1] };
let storyDismiss = null;
function storyPrologueDue(){ return storyOn && (Save.st || 0) === 0; }
// done() зовётся ВСЕГДА — и когда пролог показан, и когда он не нужен:
// на этом колбэке висит запуск падения предметов, потерять его нельзя.
function storyPrologue(done){
  if (!storyPrologueDue()) return done && done();
  storyPlay(STORY_PROLOGUE, done);
}
// Закрыть открытую панель штатно (skipIntro в тестах, аварийные пути)
function storyForceClose(){ if (storyDismiss) storyDismiss(); return !document.getElementById('storyOverlay'); }
