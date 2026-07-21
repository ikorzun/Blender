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
const FACE_LAYER = { calm:'fRound', surprised:'fRound', sly:'fRound', rolled:'fRound',
  closed:'fRound', kind:'fArc', angry:'fAngry', lose:'fX', squint:'fSquint' };
const FACE_GAZE = {                    // смещения зрачков [левый, правый]
  rolled: [[0,-24],[0,-24]],           // eyes-0-5: закатились вверх
  sly:    [[-16,-16],[16,16]],         // eyes-2: один вверх-влево, другой вниз-вправо
};
const PUP_BASE = 29, PUP_MAX = 50;     // радиусы зрачка из ассетов
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0;
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
// короткая реакция поверх состояния (тап по глазам, промах, сюрприз)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; }
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
// РАЗМЕР ЗРАЧКА = индикатор турбо (спека владельца: полоски нет, копит глаз):
// серия копится 29 -> 50, в самом турбо распахнуты на максимум.
function pupilScale(now){
  if (chainUntil > now) return PUP_MAX / PUP_BASE;
  let k = 1;
  if (comboUntil > now && comboCount > 0)
    k = 1 + (PUP_MAX / PUP_BASE - 1) * Math.min(1, comboCount / CHAIN_COMBO_AT);
  if (pupPulseUntil > now) k *= 1.25;
  return k;
}
// КУДА СМОТРЯТ: турбо — мечется, тап — на палец, помол — вниз на лопасти,
// поза эмоции — своя, иначе ленивое блуждание.
function gazeFor(now, state){
  if (chainUntil > now){
    if (now > dartAt){ dartAt = now + 180 + Math.random() * 120;
      dart = [(Math.random() * 2 - 1) * 24, (Math.random() * 2 - 1) * 20]; }
    return [dart, dart];
  }
  if (FACE_GAZE[state]) return FACE_GAZE[state];
  if (lookUntil > now && lookVec) return [lookVec, lookVec];
  if (now > wanderAt){ wanderAt = now + 1500 + Math.random() * 1500;
    wander = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 8]; }
  return [wander, wander];
}
// Диск заряда цепи СНИЗУ-СПРАВА от курсора/касания («пляжный мяч» Mac OS —
// референс владельца): сектор-пирог conic-gradient. Копится
// comboCount/CHAIN_COMBO_AT пока горит серия; в Power chain — остаток
// времени. Зовётся каждый кадр. ⚠️ Работает ПАРАЛЛЕЛЬНО с индикацией
// зрачками (спека владельца «турбо показывают глаза») — кольцо у курсора,
// зрачки на персонаже; обе живут за своими флагами, ничего не дублируется
// в одной точке экрана.
function tickChainBar(now){
  const cr = $('chainRing');
  if (!CHAIN_RING_ENABLED){ if (cr.style.display !== 'none') cr.style.display = 'none'; return; }
  let frac = -1, hot = false;
  if (chainUntil > now){
    frac = Math.max(0, (chainUntil - now) / CHAIN_MS); hot = true;
  } else if (comboUntil > now && comboCount > 0 && level && !level.over){
    frac = Math.min(1, comboCount / CHAIN_COMBO_AT);
  }
  if (frac < 0){ cr.style.display = 'none'; return; }
  cr.style.display = 'block';
  cr.classList.toggle('hot', hot); // .hot показывает пульсирующую молнию внутри
  cr.style.left = lastPtrX + 'px';
  cr.style.top = lastPtrY + 'px';
  // турбо: ГОЛУБОЙ диск с белой молнией; выработанное время — приглушённый
  // сектор того же голубого. Зарядка: зелёный пирог на прозрачном.
  if (hot){
    cr.style.background = 'conic-gradient(#4da6ff 0 ' + (frac * 100).toFixed(1) + '%, rgba(77,166,255,.38) 0 100%)';
  } else {
    cr.style.background = 'conic-gradient(#2aa876 0 ' + (frac * 100).toFixed(1) + '%, transparent 0 100%)';
  }
}
// тик всей конструкции — каждый кадр (моргание требует мельче 600 мс)
function tickFace(now){
  tickChainBar(now);
  // РЕАКЦИИ без правок в чужой зоне: следим за счётом. Вырос — зрачок
  // «ахнул», упал (промах −7 или помол −20) — зажмурился.
  if (level && !intro){
    if (lastScoreSeen === null) lastScoreSeen = stats.score;
    else if (stats.score > lastScoreSeen) facePulse();
    else if (stats.score < lastScoreSeen) faceEvent('squint', 220);
    lastScoreSeen = stats.score;
  } else lastScoreSeen = null;
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // моргание 120 мс раз в 4-7 с; в турбо и на помоле не моргаем
  const canBlink = faceState === 'calm' || faceState === 'kind' || faceState === 'rolled';
  if (now > nextBlinkAt && canBlink){
    blinkUntil = now + 120;
    nextBlinkAt = now + 4000 + Math.random() * 3000;
  }
  const st = faceHoldUntil > now ? faceHold : faceState;
  setFace(st, now, blinkUntil > now && st !== 'lose');
}
function setFace(state, now, blinking){
  const svg = $('eyes'), layer = FACE_LAYER[state] || 'fRound';
  for (const id of ['fRound','fArc','fAngry','fX','fSquint'])
    $(id).classList.toggle('on', id === layer);
  svg.classList.toggle('blink', !!blinking);
  if (layer !== 'fRound') return;                 // у прочих слоёв зрачков нет
  const g = gazeFor(now || performance.now(), state);
  const s = state === 'surprised' ? PUP_MAX / PUP_BASE : pupilScale(now || performance.now());
  $('pupL').style.transform = 'translate(' + g[0][0] + 'px,' + g[0][1] + 'px) scale(' + s.toFixed(3) + ')';
  $('pupR').style.transform = 'translate(' + g[1][0] + 'px,' + g[1][1] + 'px) scale(' + s.toFixed(3) + ')';
}
function updateEyes(now, grinding){ faceState = eyesMood(now, grinding); } // мод — раз в 600 мс
function updateHUD(){
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
  // Чипа монет на игровом экране НЕТ (мобильный макет + COINS_ENABLED в main
  // ведут в одну сторону) — счётчики валюты живут, показываем их в меню.
  // Счётчик подсказок из main сохраняем: он висит бейджем на круглой кнопке.
  $('hintCnt').textContent = hints();
  $('hintBtn').classList.toggle('off', hints() < 1);
  // «Прицел» доступен при деньгах; «Металлоискатель» — пока сюрприз жив и не использован
  $('scopeBtn').style.display = SCOPE_ENABLED ? '' : 'none';
  $('scopeBtn').classList.toggle('off', coins() < PRICE_SCOPE || level.over);
  const sp = items.find(i => i.surprise && i.alive);
  $('magnetBtn').style.display = (MAGNET_ENABLED && sp && !level.detectorUsed && !level.over) ? '' : 'none';
  $('apCount').textContent = availablePairs();
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // динамический; ∞ = эндшпиль
}
