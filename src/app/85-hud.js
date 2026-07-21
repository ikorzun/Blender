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
// ===== Персонаж: 7 эмоций (матрица владельца 2026-07-21) =====
// Логика отдаёт ИМЯ состояния, отрисовка — отдельно (setFace): сейчас
// эмодзи-ЗАГЛУШКА, дальше SVG со слоем зрачков — менять только FACE_GLYPH.
const FACE_STATES = ['calm','kind','angry','surprised','closed','sly','rolled'];
const FACE_GLYPH = { // ВРЕМЕННО, до приезда ассетов
  calm:'👀', kind:'😊', angry:'😠', surprised:'😲', closed:'😑', sly:'😏', rolled:'🙄' };
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0;
// Приоритет сверху вниз. Лесенка угрозы: спокойные -> закатанные -> хитрые -> злые
function eyesMood(now, grinding){
  if (!level || intro) return 'calm';
  if (level.over) return items.every(i => !i.alive) ? 'kind' : 'closed';
  if (chainUntil > now) return 'surprised';       // турбо
  if (grinding) return 'angry';                   // лопасти едят вещи
  const idle = (now - stats.lastAction)/1000;
  if (level.idleLimit - idle <= 3) return 'sly';  // предвкушение: ≤3 с до перемолки
  if (comboUntil > now) return 'kind';            // горит серия
  if (idle > 8) return 'rolled';                  // заскучал
  return 'calm';
}
// короткая реакция поверх состояния (тап по глазам, раскопанный сюрприз)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; }
// тик всей конструкции — каждый кадр (моргание требует мельче 600 мс)
function tickFace(now){
  tickChainBar(now);
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // моргание 120 мс раз в 4-7 с, только в спокойных/добрых
  if (now > nextBlinkAt && (faceState === 'calm' || faceState === 'kind')){
    blinkUntil = now + 120;
    nextBlinkAt = now + 4000 + Math.random() * 3000;
  }
  setFace(faceHoldUntil > now ? faceHold : (blinkUntil > now ? 'closed' : faceState));
}
function setFace(state){
  const el = $('eyes'), g = FACE_GLYPH[state] || FACE_GLYPH.calm;
  if (el.textContent !== g) el.textContent = g;
}
// Полоска заряда цепи: копится comboCount/CHAIN_COMBO_AT пока серия горит;
// в реакции — ОСТАТОК времени Power chain (оранжевая). Зовётся каждый кадр.
function tickChainBar(now){
  const cb = $('chainBar'), fill = cb.firstElementChild;
  if (chainUntil > now){
    cb.style.display = 'block';
    cb.classList.add('hot');
    fill.style.width = Math.max(0, (chainUntil - now) / CHAIN_MS * 100) + '%';
  } else if (comboUntil > now && comboCount > 0 && level && !level.over){
    cb.style.display = 'block';
    cb.classList.remove('hot');
    fill.style.width = Math.min(100, comboCount / CHAIN_COMBO_AT * 100) + '%';
  } else {
    cb.style.display = 'none';
  }
}
function updateEyes(now, grinding){ faceState = eyesMood(now, grinding); } // мод — раз в 600 мс
function updateHUD(){
  const left = items.filter(i=>i.alive).length;
  $('pairsLeft').textContent = 'Ур.' + levelNum + ' · ' + left; // уровень + предметов осталось
  $('score').textContent = '★ ' + stats.score;
  const dots = $('shakeDots');
  dots.innerHTML = '';
  for (let i=0;i<3;i++){
    const d = document.createElement('span');
    d.className = 'dot' + (i < level.shakes ? ' on' : '');
    dots.appendChild(d);
  }
  const btn = $('shakeBtn');
  if (level.shakes > 0){ btn.classList.remove('ad','off'); $('shakeLbl').textContent = 'Shake'; }
  else if (level.adShakes > 0){ btn.classList.add('ad'); btn.classList.remove('off'); $('shakeLbl').textContent = '📺 Shake'; }
  else { btn.classList.add('off'); btn.classList.remove('ad'); $('shakeLbl').textContent = 'No shakes'; }
  $('coinsChip').textContent = '🪙 ' + coins();
  // «Прицел» доступен при деньгах; «Металлоискатель» — пока сюрприз жив и не использован
  $('scopeBtn').style.display = SCOPE_ENABLED ? '' : 'none';
  $('scopeBtn').classList.toggle('off', coins() < PRICE_SCOPE || level.over);
  const sp = items.find(i => i.surprise && i.alive);
  $('magnetBtn').style.display = (MAGNET_ENABLED && sp && !level.detectorUsed && !level.over) ? '' : 'none';
  $('apCount').textContent = availablePairs();
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // динамический; ∞ = эндшпиль
}
