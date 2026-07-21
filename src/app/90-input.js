// ===== 90-input: тап, вращение, пинч-зум, колесо, кнопки =====

const CAM_R_MIN = 9, CAM_R_MAX = 21; // чаша шире
function setCamR(r){ camR = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, r)); updateCamera(); }
let pDown = null, dragging = false, pinch = null;
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
  if (intro) return; // во время интро камера скриптована — жесты не копим
  touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (touches.size === 2){
    const [a,b] = [...touches.values()];
    pinch = { d0: Math.hypot(a.x-b.x, a.y-b.y), r0: camR };
    pDown = null; dragging = false; // пинч отменяет тап и вращение
  } else if (touches.size === 1){
    pDown = { x:e.clientX, y:e.clientY, az:camAz, phi:camPhi };
    dragging = false;
  } else {
    pDown = null;
  }
});
canvas.addEventListener('pointermove', e => {
  if (intro) return; // во время интро камера скриптована
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pinch && touches.size === 2){
    const [a,b] = [...touches.values()];
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    if (d > 1) setCamR(pinch.r0 * pinch.d0 / d); // пальцы разводятся -> приближение
    return;
  }
  if (!pDown) return;
  const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
  if (!dragging && Math.hypot(dx,dy) > 9) dragging = true;
  if (dragging){
    camAz = pDown.az - dx*0.006;
    camPhi = Math.max(0.32, Math.min(1.35, pDown.phi - dy*0.004)); // до ~77° — вид сбоку на миксер
    updateCamera();
  }
});
function endPointer(e){
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
}
// сброс всех жестов (вызывается на границах интро: зажатый в интро палец
// не должен превращаться в драг со старой базой камеры)
function resetPointers(){
  touches.clear();
  pDown = null; dragging = false; pinch = null;
}
canvas.addEventListener('pointerup', e => {
  if (pDown && !dragging && !pinch && !intro) handleTap(e.clientX, e.clientY);
  endPointer(e);
  pDown = null; dragging = false;
});
canvas.addEventListener('pointercancel', e => { endPointer(e); pDown = null; dragging = false; });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (!intro) setCamR(camR + e.deltaY * 0.012); }, { passive:false });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', ()=>Sound.unlock()); // WebAudio живёт только после жеста (iOS)

$('shakeBtn').addEventListener('click', requestShake);
$('hintBtn').addEventListener('click', showHint);
$('adYes').addEventListener('click', startAd);
$('adNo').addEventListener('click', ()=>hide('adAskOverlay'));
$('againBtn').addEventListener('click', ()=>{ hide('winOverlay'); Ads.maybeInterstitial(); genLevel(); });
$('loseAgainBtn').addEventListener('click', ()=>{ hide('loseOverlay'); Ads.maybeInterstitial(); genLevel(); });
// ×2 монет за rewarded на экране победы (второй по конверсии плейсмент)
$('winX2Btn').addEventListener('click', ()=>{
  $('winX2Btn').style.display = 'none';
  Ads.showRewarded(()=>{
    addCoins(level.coinsWon);
    $('winCoins').textContent = '+' + (level.coinsWon * 2) + ' 🪙 (×2)';
    Telemetry.ev('rw', { p: 'x2' });
    updateHUD();
  });
});
// Continue после поражения — 1 раз за уровень
$('loseAdContinue').addEventListener('click', ()=>{
  Ads.showRewarded(()=>{ continueRun(); });
});
// «Прицел»: 15 монет, все доступные пары на 5 с
$('scopeBtn').addEventListener('click', ()=>{
  if (level.over || intro) return;
  if (!spendCoins(PRICE_SCOPE)){ toast('Нужно ' + PRICE_SCOPE + ' 🪙'); return; }
  Telemetry.ev('spend', { item: 'scope' });
  refreshAccessibility();
  scopeHighlight();
  stats.lastAction = performance.now();
  updateHUD();
});
// «Металлоискатель»: rewarded, показывает где копать до сюрприза
$('magnetBtn').addEventListener('click', ()=>{
  if (level.over || intro || level.detectorUsed) return;
  Ads.showRewarded(()=>{ detectorHighlight(); });
});
$('coinShakeBtn').addEventListener('click', buyCoinShake);
// глаза миксера: интерактивный персонаж — подмигивает на тап
$('eyes').addEventListener('click', ()=>{
  const el = $('eyes');
  el.classList.remove('bounce'); void el.offsetWidth;
  el.classList.add('bounce');
  faceEvent('sly', 800); // подмигнул в ответ на тап
  Sound.play('match', 1); vibrate(10);
  setTimeout(()=>{ el.classList.remove('bounce'); }, 450);
});
$('loseContinue').addEventListener('click', ()=>{ hide('loseOverlay'); level.over = false; level.stuck = -8; }); // ~5 c форы, потом тупик покажется снова
$('gearBtn').addEventListener('click', ()=>{
  const p = $('debugPanel');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
});
$('radiusToggle').addEventListener('change', e => { CFG.radiusOn = e.target.checked; $('radiusVal').parentElement.style.opacity = CFG.radiusOn ? 1 : 0.4; updateHUD(); });
// сложность живёт в localStorage — выбор переживает перезагрузку
try { CFG.hard = localStorage.getItem('mixer_hard') === '1'; } catch(e){}
$('hardToggle').checked = CFG.hard;
$('hardToggle').addEventListener('change', e => {
  CFG.hard = e.target.checked;
  try { localStorage.setItem('mixer_hard', CFG.hard ? '1' : '0'); } catch(e){}
  if (level) level.idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // таймер миксера живо следует сложности
  refreshAccessibility(); updateHUD();
});
$('radiusRange').addEventListener('input', e => { CFG.baseRadius = parseFloat(e.target.value); updateMatchRadius(); $('radiusVal').textContent = CFG.matchRadius.toFixed(2); updateHUD(); });
$('hlToggle').addEventListener('change', e => { CFG.highlight = e.target.checked; refreshAccessibility(); });
$('soundToggle').addEventListener('change', e => { CFG.sound = e.target.checked; });
$('restartBtn').addEventListener('click', ()=>{ $('debugPanel').style.display='none'; genLevel(); });
