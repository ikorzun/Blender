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
// Глаза миксера — персонаж (план: «блендер с глазами, 3-4 эмоции»).
// Настроение по приоритету: финал > цепная реакция > помол > комбо > скука
function eyesMood(now, grinding){
  if (!level || intro) return '👀';
  if (level.over) return items.every(i => !i.alive) ? '🥳' : '😵';
  if (chainUntil > now) return '🤩';
  if (grinding) return '😠';
  if (comboUntil > now) return '😄';
  if ((now - stats.lastAction)/1000 > level.idleLimit - 5) return '🥱';
  return '👀';
}
// Диск заряда цепи СНИЗУ-СПРАВА от курсора/касания («пляжный мяч» Mac OS —
// референс владельца): сектор-пирог conic-gradient. Копится
// comboCount/CHAIN_COMBO_AT пока горит серия; в Power chain — остаток
// времени (оранжевый). Зовётся каждый кадр.
function tickChainBar(now){
  const cr = $('chainRing');
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
  const col = hot ? '#ff9d2e' : '#2aa876';
  cr.style.background = 'conic-gradient(' + col + ' 0 ' + (frac * 100).toFixed(1) + '%, transparent 0 100%)'; // внутри прозрачный (спека владельца), читаемость держит белая кайма
}
function updateEyes(now, grinding){
  const el = $('eyes');
  if (el.classList.contains('bounce')) return; // идёт реакция на тап
  const m = eyesMood(now, grinding);
  if (el.textContent !== m) el.textContent = m;
}
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
