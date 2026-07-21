// ===== 85-hud: DOM-хелперы и обновление интерфейса =====

function $(id){ return document.getElementById(id); }
function show(id){ $(id).style.display = 'flex'; }
function hide(id){ $(id).style.display = 'none'; }
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.opacity = 0; }, 1600);
}
function fmtTime(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
// ===== Персонаж: 7 эмоций + живая анимация (ассеты владельца, Figma 741:1420) =====
// Четыре НЕЗАВИСИМЫХ слоя: ЭМОЦИЯ (какая форма) + ВЗГЛЯД (куда смотрят
// зрачки) + РЕАКЦИЯ (короткий всплеск) + МОРГАНИЕ. Круглая пара
// параметрическая: зрачок ездит ±24 и меняет размер 15..50 в единицах
// viewBox — этим покрыты семейства eyes-0 (взгляд/размер), eyes-2 (хитрые)
// и eyes-5 (подмигивание). Несводимые формы — отдельными слоями SVG.
// Дуги eyes-4-4 УДАЛЕНЫ (спека владельца 2026-07-21): «добрые» показываем
// не формой, а РАЗМЕРОМ зрачков — асимметрией eyes-5 (741:1357).
const FACE_LAYER = { calm:'fRound', surprised:'fRound', sly:'fRound', rolled:'fRound',
  closed:'fRound', kind:'fRound', angry:'fAngry', lose:'fX', sad:'fSad' };
// Геометрия из ассетов (viewBox 240×120): белок r60, зрачок r29.
const EYE_R = 60, PUP_MIN = 15, PUP_WIDE = 50;
// eyes-5 (асимметрия: левый зрачок 40, правый белок 44 со зрачком 12) пока
// НЕ задействован — ждёт решения владельца, куда его повесить
const FACE_GAZE = {                    // смещения зрачков [левый, правый]
  rolled: [[0,-24],[0,-24]],           // eyes-0-5: закатились вверх
  sly:    [[-16,-16],[16,16]],         // eyes-2: один вверх-влево, другой вниз-вправо
};
const PUP_BASE = 29;                   // радиус зрачка в покое (eyes-0)
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0, faceHoldFrom = 0;
let lookVec = null, lookUntil = 0, wander = [0,0], wanderAt = 0, dart = [0,0], dartAt = 0;
let pupPulseUntil = 0, lastScoreSeen = null;
// Приоритет сверху вниз. Лесенка угрозы: спокойные -> закатанные -> хитрые -> злые
function eyesMood(now, grinding){
  if (!level || intro) return 'calm';
  if (level.over) return items.every(i => !i.alive) ? 'kind' : 'lose'; // ✕✕ из набора
  if (chainUntil > now) return 'surprised';       // турбо
  if (grinding) return 'angry';                   // лопасти едят вещи
  const idle = (now - stats.lastAction)/1000;
  if (level.idleLimit - idle <= 3) return 'sly';  // предвкушение: ≤3 с до перемолки
  if (comboUntil > now) return 'kind';            // горит серия
  if (idle > 8) return 'rolled';                  // заскучал
  return 'calm';
}
// Диск заряда у курсора (tickChainBar) УДАЛЁН: индикатор турбо теперь
// РАЗМЕР ЗРАЧКА персонажа (спека владельца в чате ИНТЕРФЕЙСА: «полоски
// нет, копит глаз») — см. eyeSizes ниже. CHAIN_RING_ENABLED в 00-config
// остался мёртвым флагом истории.
// короткая реакция поверх состояния (тап по глазам, промах, сюрприз)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; faceHoldFrom = 0; }
// зрачки поворачиваются к точке экрана (тап игрока) на 1.4 с
function faceLook(x, y){
  const r = $('face').getBoundingClientRect();
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const k = 24 * Math.min(1, d / 260);          // чем дальше тап, тем сильнее косит
  lookVec = [dx / d * k, dy / d * k];
  lookUntil = performance.now() + 1400;
}
function facePulse(){ pupPulseUntil = performance.now() + 180; } // «ах!» на матче
// РАЗМЕРЫ ЗРАЧКОВ И БЕЛКОВ, отдельно для левого и правого глаза.
// Драматургия буста (спека владельца): копится — зрачки РАСТУТ 29->50;
// как только буст набран — резко СЖИМАЮТСЯ до 15 (eyes-0-1) и катаются.
function eyeSizes(now, state){
  const s = { pl: PUP_BASE, pr: PUP_BASE, wl: EYE_R, wr: EYE_R };
  if (chainUntil > now){ s.pl = s.pr = PUP_MIN; return s; }   // турбо: сжались
  if (state === 'surprised'){ s.pl = s.pr = PUP_WIDE; return s; }
  if (state === 'kind'){
    // НАБОР БУСТА: зрачки растут 29 -> 50 по мере серии (спека владельца).
    // Дуги eyes-4-4 этим и заменены — размером, а не формой.
    const t = Math.min(1, comboCount / CHAIN_COMBO_AT);
    s.pl = s.pr = PUP_BASE + (PUP_WIDE - PUP_BASE) * t;
    return s;
  }
  if (pupPulseUntil > now){ s.pl = s.pr = PUP_BASE * 1.25; }   // «ах!» на матче
  return s;
}
// КУДА СМОТРЯТ. Вектор задаётся с запасом — реальную амплитуду обрежет
// clampGaze по свободному месту внутри белка.
function gazeFor(now, state){
  if (chainUntil > now){
    // ТУРБО: зрачки КАТАЮТСЯ в РАЗНЫЕ стороны (спека владельца) — один по
    // часовой, другой против, оборот примерно за 1.2 с
    const th = now / 1000 * 5.2;
    const c = Math.cos(th) * 99, sn = Math.sin(th) * 99;       // 99 = «до упора»
    return [[c, sn], [-c, -sn]];
  }
  if (FACE_GAZE[state]) return FACE_GAZE[state];
  if (lookUntil > now && lookVec) return [lookVec, lookVec];
  if (now > wanderAt){ wanderAt = now + 1500 + Math.random() * 1500;
    wander = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 8]; }
  return [wander, wander];
}
// ⚠️ ГЛАВНОЕ ПРАВИЛО (спека владельца): чёрный зрачок НИКОГДА не выходит за
// белок. Свободный ход = радиус белка − радиус зрачка − 1 (запас, чтобы не
// касался края). Без этого распахнутый зрачок при взгляде вбок вылезал наружу.
function clampGaze(vec, pupR, eyeR){
  const room = Math.max(0, eyeR - pupR - 1);
  const d = Math.hypot(vec[0], vec[1]);
  if (d <= room || d === 0) return vec;
  return [vec[0] / d * room, vec[1] / d * room];
}
// тик всей конструкции — каждый кадр (моргание требует мельче 600 мс)
function tickFace(now){
  // РЕАКЦИИ без правок в чужой зоне: следим за счётом. Вырос — зрачок
  // «ахнул», упал (промах −7) — ГРУСТНО смотрят вниз (eyes-1-6, спека
  // владельца). ⚠️ ВО ВРЕМЯ ПОМОЛА реакции ГЛУШАТСЯ: штраф −20 капает
  // каждый помол, и грусть перебивала бы злые глаза — владелец требует
  // «при работе блендера всегда злые».
  if (level && !intro && !lastGrind){
    if (lastScoreSeen === null) lastScoreSeen = stats.score;
    else if (stats.score > lastScoreSeen) facePulse();
    else if (stats.score < lastScoreSeen){
      // естественный вход в грусть: зрачки НЫРЯЮТ вниз (80 мс на круглой
      // паре), затем выезжают веки; после грусти взгляд ещё висит внизу
      lookVec = [0, 18]; lookUntil = performance.now() + 1900;
      faceHold = 'sad'; faceHoldUntil = performance.now() + 780;
      faceHoldFrom = performance.now() + 80; // 80 мс — нырок зрачков до век
    }
    lastScoreSeen = stats.score;
  } else lastScoreSeen = null;
  // время меняет ширину раз в секунду — обжимаем рамку по факту смены
  const tmStr = $('timer').textContent;
  if (tmStr !== tmStrLast){ tmStrLast = tmStr; fitStat('timer'); }
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // моргание 120 мс раз в 4-7 с; в турбо и на помоле не моргаем
  const canBlink = faceState === 'calm' || faceState === 'kind' || faceState === 'rolled';
  if (now > nextBlinkAt && canBlink){
    blinkUntil = now + 120;
    nextBlinkAt = now + 4000 + Math.random() * 3000;
  }
  // помол перебивает всё, включая короткие реакции и моргание;
  // faceHoldFrom задерживает включение hold-состояния (нырок зрачков)
  const holdOn = faceHoldUntil > now && now >= faceHoldFrom;
  const st = lastGrind ? 'angry' : (holdOn ? faceHold : faceState);
  setFace(st, now, blinkUntil > now && st !== 'lose' && !lastGrind);
}
function setFace(state, now, blinking){
  const svg = $('eyes'), layer = FACE_LAYER[state] || 'fRound';
  for (const id of ['fRound','fAngry','fX','fSad'])
    $(id).classList.toggle('on', id === layer);
  svg.classList.toggle('blink', !!blinking);
  if (layer === 'fAngry'){
    // злые СЛЕДЯТ ЗА ЧАШЕЙ (спека владельца): влево -> вправо -> вниз,
    // шаг ~0.8 с; CSS-переход на .p сглаживает; клип держит внутри белка
    const seq = [[-11, 5], [11, 5], [0, 11]];
    const g2 = seq[Math.floor((now || performance.now()) / 800) % 3];
    $('pupAL').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    $('pupAR').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    return;
  }
  if (layer !== 'fRound') return;                 // у прочих слоёв зрачков нет
  const t = now || performance.now();
  const sz = eyeSizes(t, state), g = gazeFor(t, state);
  const gl = clampGaze(g[0], sz.pl, sz.wl), gr = clampGaze(g[1], sz.pr, sz.wr);
  $('pupL').style.transform = 'translate(' + gl[0].toFixed(1) + 'px,' + gl[1].toFixed(1) +
    'px) scale(' + (sz.pl / PUP_BASE).toFixed(3) + ')';
  $('pupR').style.transform = 'translate(' + gr[0].toFixed(1) + 'px,' + gr[1].toFixed(1) +
    'px) scale(' + (sz.pr / PUP_BASE).toFixed(3) + ')';
  $('wL').style.transform = 'scale(' + (sz.wl / EYE_R).toFixed(3) + ')';
  $('wR').style.transform = 'scale(' + (sz.wr / EYE_R).toFixed(3) + ')';
}
let lastGrind = false;
function updateEyes(now, grinding){ lastGrind = !!grinding; faceState = eyesMood(now, grinding); } // мод — раз в 600 мс
// Ночь по тем же границам, что выбор панорамы в 05-sky (skyForNow):
// 18..5. Дублируем сознательно: 05-sky сгенерирован тулзой и руками не
// правится, а ошибка тут стоит лишь оттенка кнопки.
function isNightSky(){
  let h = 12; try { h = new Date().getHours(); } catch(e){}
  return h >= 18 || h < 5;
}
// Обжать svg-рамку по тексту: ширина = длина текста в юнитах viewBox ×
// текущий масштаб (высота/27). Без этого фиксированные рамки давали дыру
// между LV и временем и наезд времени на глаза (скрин владельца).
function fitStat(id){
  const t = $(id), svg = t.ownerSVGElement;
  const u = t.getComputedTextLength() + 3;          // ширина в юнитах viewBox
  // ⚠️ менять надо И viewBox, И css-ширину: svg держит пропорции viewBox
  // (meet) — одна лишь ширина при высоте 42 УМЕНЬШАЛА контент (LV мельче
  // времени на скрине владельца)
  svg.setAttribute('viewBox', '0 0 ' + u.toFixed(1) + ' 27');
  const k = (svg.getBoundingClientRect().height || 27) / 27;
  svg.style.width = (u * k) + 'px';
}
let tmStrLast = '';
function updateHUD(){
  document.documentElement.classList.toggle('night', isNightSky());
  $('lvlNum').textContent = 'LV ' + levelNum; // виден на десктопе/планшете
  fitStat('lvlNum');
  // мобильный макет 741:1738: справа стек «предметов / время / очки».
  // Номера уровня на игровом экране нет, монет тоже (кошелёк — в меню).
  $('pairsLeft').textContent = items.filter(i=>i.alive).length;
  // колонка макета рассчитана на трёхзначные очки, а к 3-му уровню счёт
  // пятизначный — крупные значения сжимаем, иначе стек наезжает на глаза
  $('score').textContent = '★ ' + (stats.score >= 10000
    ? (stats.score / 1000).toFixed(1) + 'k' : stats.score);
  const btn = $('shakeBtn');
  if (level.shakes > 0){ btn.classList.remove('ad','off'); $('shakeLbl').textContent = 'Shake ×' + level.shakes; }
  else if (level.adShakes > 0){ btn.classList.add('ad'); btn.classList.remove('off'); $('shakeLbl').textContent = '📺 Shake'; }
  else { btn.classList.add('off'); btn.classList.remove('ad'); $('shakeLbl').textContent = 'No shakes'; }
  // чипа монет и счётчика подсказок в макете 741:1738 НЕТ (монеты к тому же
  // скрыты COINS_ENABLED; кошелёк уедет в меню). Заряды подсказок живут в
  // сейве — кнопка просто гаснет при нуле
  $('hintCnt').textContent = hints(); // остаток зарядов бейджем на кнопке
  $('hintBtn').classList.toggle('off', hints() < 1);
  // «Прицел» доступен при деньгах; «Металлоискатель» — пока сюрприз жив и не использован
  $('scopeBtn').style.display = SCOPE_ENABLED ? '' : 'none';
  $('scopeBtn').classList.toggle('off', coins() < PRICE_SCOPE || level.over);
  const sp = items.find(i => i.surprise && i.alive);
  $('magnetBtn').style.display = (MAGNET_ENABLED && sp && !level.detectorUsed && !level.over) ? '' : 'none';
  $('apCount').textContent = availablePairs();
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // динамический; ∞ = эндшпиль
}
