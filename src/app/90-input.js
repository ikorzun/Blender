// ===== 90-input: tap, rotation, pinch-zoom, wheel, buttons =====

const CAM_R_MIN = 9, CAM_R_MAX = 21; // the bowl is wider
function setCamR(r){
  zoomAnim = null; // a gesture (wheel/pinch) outranks the button — the animation fades out
  camR = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, r)); updateCamera();
}
// VERTICAL VIEW PAN (the owner's spec 2026-07-21: «shift the camera
// vertically a little, so the leftovers can be raised and examined»): the
// camera target travels along Y within narrow limits — down to the bottom
// (leftovers in the center of the frame), a little above the default. The
// main gestures do NOT change; the pan hangs on the EXTRA ones: movement of
// the CENTER of a two-finger pinch (zoom is as it was — by distance), a
// vertical drag with the RIGHT button, Shift+wheel.
// Reset at the intro boundaries (resetPointers).
const TARGET_Y_MIN = 1.2, TARGET_Y_MAX = 5.2, TARGET_Y_DEF = 4.2;
function panLimits(){
  return { lo: TARGET_Y_MIN, hi: TARGET_Y_MAX };
}
function setTargetY(y){
  const lim = panLimits();
  camTarget.y = Math.max(lim.lo, Math.min(lim.hi, y));
  updateCamera();
}
// AUTO-PAN — ONE STEP IN THE ENDGAME (the owner's fixes 2026-07-21, the
// final one: «don't raise the bucket vertically at the start of the level...
// start raising it if 20% of the items from the initial load are left in the
// basket. Otherwise the bucket floats vertically, that's inconvenient»). No
// continuous following whatsoever: for the whole level the camera STANDS at
// the default 4.2; when the number of live items left is <= CAM_FOLLOW_FRAC of
// the starting load (level.aliveN0 from finalizeFill) — the level.camFollowOn
// latch flips, and the target ONCE smoothly slides down to the automation floor
// (a third of the travel, «the player will raise the rest himself») and moves
// no more. Chain top-ups do not release the latch — there is no «floating»
// back. A manual pan by gesture overrides the automation for 4 s.
const AUTO_FOLLOW_MIN = TARGET_Y_DEF - (TARGET_Y_DEF - TARGET_Y_MIN) / 3; // 3.2
const CAM_FOLLOW_FRAC = 0.2;
let panManualUntil = 0, camFollowAt = 0;
function noteManualPan(){
  panManualUntil = performance.now() + 4000;
  hintFly = null; // a player's gesture aborts the hint flight
}
function tickCamFollow(dt){
  if (intro || !level || !level.aliveN0 || paused) return;
  const now = performance.now();
  if (now < panManualUntil) return;
  if (!level.camFollowOn){
    if (now < camFollowAt) return;
    camFollowAt = now + 500; // counting the live ones — not every frame
    let aliveCnt = 0;
    for (const it of items) if (it.alive && !it.surprise) aliveCnt++;
    if (aliveCnt > level.aliveN0 * CAM_FOLLOW_FRAC) return; // the camera stands still
    level.camFollowOn = true;
  }
  const d = AUTO_FOLLOW_MIN - camTarget.y;
  if (Math.abs(d) > 0.005) setTargetY(camTarget.y + d * Math.min(1, dt * 1.5));
}
// ===== CAMERA FLIGHT TO THE HINT ===== (the testers' request, the owner's
// word 2026-08-03: «on a click on the hint the camera drives up to the object
// that can be matched»). Ease-out 900 ms: the azimuth by the shortest arc to
// the item, target.y to its height (inside the pan clamp), the radius down to
// <=13 (if farther). Any player GESTURE aborts the flight instantly (the abort
// is in noteManualPan and at the start of the orbit/pinch); the endgame auto-pan
// is held back by the same panManualUntil — otherwise it would immediately drag
// the target back to 3.2.
let hintFly = null;
function hintCamFly(item){
  const az2 = Math.atan2(item.p.x, item.p.z); // the position formula: x=sin(az), z=cos(az)
  let dAz = az2 - camAz;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz)); // the shortest arc
  // AND A VERTICAL TWIST (the owner's word 2026-08-04: «the hint must twist
  // not only horizontally but vertically too, otherwise the items may not be
  // visible»): a low anchor hides behind the rim when looking from above —
  // we tilt the orbit (phi) the more, the deeper the item lies.
  const phiTo = Math.max(0.45, Math.min(0.95, 0.45 + (1 - item.p.y / FUNNEL.H) * 0.4));
  hintFly = { t0: performance.now(), dur: 900,
    az0: camAz, az1: camAz + dAz,
    phi0: camPhi, phi1: phiTo,
    // ⚠️ the hint flight lives in THE SAME corridor as the manual pan (panLimits) —
    // one function for both paths, otherwise they would drift apart on the first edit of the limits
    y0: camTarget.y, y1: Math.max(panLimits().lo, Math.min(panLimits().hi, item.p.y)),
    r0: camR, r1: Math.min(camR, 13) };
  panManualUntil = performance.now() + 4500;
}
function tickHintFly(){
  if (!hintFly) return;
  const k = (performance.now() - hintFly.t0) / hintFly.dur;
  const e = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3);
  camAz = hintFly.az0 + (hintFly.az1 - hintFly.az0) * e;
  camPhi = hintFly.phi0 + (hintFly.phi1 - hintFly.phi0) * e;
  camR = hintFly.r0 + (hintFly.r1 - hintFly.r0) * e;
  camTarget.y = Math.max(panLimits().lo, Math.min(panLimits().hi, hintFly.y0 + (hintFly.y1 - hintFly.y0) * e));
  updateCamera();
  if (k >= 1) hintFly = null;
}
let rdrag = null; // vertical pan with the right button (the context menu is disabled anyway)
let pDown = null, dragging = false, pinch = null;
// the last cursor/touch position — the chain charge ring is bound to it
let lastPtrX = innerWidth / 2, lastPtrY = innerHeight / 2;
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  if (intro) return; // during the intro the camera is scripted — we don't accumulate gestures
  if (e.button === 2){ rdrag = { y: e.clientY, ty0: camTarget.y }; noteManualPan(); return; } // a right drag = pan, it does not go into tap/orbit
  touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (touches.size === 2){
    const [a,b] = [...touches.values()];
    pinch = { d0: Math.hypot(a.x-b.x, a.y-b.y), r0: camR, cy: (a.y+b.y)/2 };
    pDown = null; dragging = false; // the pinch cancels the tap and the rotation
  } else if (touches.size === 1){
    pDown = { x:e.clientX, y:e.clientY, az:camAz, phi:camPhi };
    dragging = false;
    faceLook(e.clientX, e.clientY); // the character follows the finger with his eyes
  } else {
    pDown = null;
  }
});
canvas.addEventListener('pointermove', e => {
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  if (intro) return; // during the intro the camera is scripted
  if (rdrag){
    // ⚠️ THE GRAB CURSOR ON THE RIGHT DRAG TOO (the owner's word 2026-08-30: «kogda pravoy
    // knopkoy tascaesh korzinu, kursor tozhe menyaetsya s paltsa na khvat»). It did not: this
    // branch returns BEFORE the block below that sets `html.grabbing`, so the vertical pan ran
    // with the pointing finger while the left-button orbit clenched the hand.
    // ⚠️ THE SAME 9 px THRESHOLD as the orbit, and deliberately: a bare right-click (the
    // context menu is disabled anyway) must not flash the hand. The PAN itself keeps starting
    // from the first pixel — the threshold gates the CURSOR only, so the view still answers
    // instantly. Cleanup needs nothing new: endPointer and resetPointers already unclench.
    if (Math.abs(e.clientY - rdrag.y) > 9) document.documentElement.classList.add('grabbing');
    noteManualPan(); setTargetY(rdrag.ty0 + (e.clientY - rdrag.y) * 0.012); return; // the content follows the mouse
  }
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pinch && touches.size === 2){
    const [a,b] = [...touches.values()];
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    if (d > 1) setCamR(pinch.r0 * pinch.d0 / d); // the fingers spread apart -> zoom in
    // vertical movement of the pinch CENTER — the view pan (the content follows the fingers)
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
    // the «clenched hand» cursor for the duration of the camera drag (desktop; the CSS
    // is in shell under the html.grabbing class, for touches the class is harmless — they have no cursors)
    document.documentElement.classList.add('grabbing');
  }
  if (dragging){
    camAz = pDown.az - dx*0.006;
    camPhi = Math.max(0.32, Math.min(1.35, pDown.phi - dy*0.004)); // up to ~77° — a side view of the mixer
    updateCamera();
    
  }
});
function endPointer(e){
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  rdrag = null;
  document.documentElement.classList.remove('grabbing'); // unclench the hand cursor
}
// reset of all gestures (called at the intro boundaries: a finger held down
// during the intro must not turn into a drag with a stale camera base)
// ⛔ CURSOR SHAKE ON AN ERROR — LIVED 20 MINUTES AND WAS REJECTED BY THE OWNER in a
// live test 2026-07-31 («remove the cursor shake»; before that he himself had managed
// to squeeze it from 1 s down to 0.5 s — that didn't help). It was: alternating two
// hotspots ±2px, classes cshake-a/b. DO NOT BRING BACK without his word; the
// implementation is in the history of v200.
function resetPointers(){
  document.documentElement.classList.remove('grabbing');
  touches.clear();
  pDown = null; dragging = false; pinch = null; rdrag = null;
  panManualUntil = 0; camFollowAt = 0; // the camFollowOn latch lives in level — a new one is created by genLevel
  setTargetY(TARGET_Y_DEF); // the view pan does not survive intro/level boundaries
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
  // Shift+wheel — the vertical view pan (scrolling down = looking lower);
  // the plain wheel — zoom, as it was
  if (e.shiftKey){ noteManualPan(); setTargetY(camTarget.y - e.deltaY * 0.004); }
  else setCamR(camR + e.deltaY * 0.012);
}, { passive:false });
// ZOOM WITH BUTTONS (node 829:1242, the owner's spec «added zoom at the
// testers' request»). ⚠️ We drive THE SAME `setCamR` as the wheel and the pinch:
// the CAM_R_MIN/MAX limits and `updateCamera` live inside it, therefore the
// buttons cannot take the camera where the gestures are not allowed to. The step
// of 1.6 is roughly one wheel click (0.012 × ~133), that is, the button and the
// wheel feel the same.
// ⚠️ The `intro` gate — same as on the wheel: during the intro input is muted entirely.
// ×2 to the former step (the owner's word 2026-08-05: «increase the zoom on a click
// on the control — x2 to the current implementation»); it was 1.6.
const ZOOM_STEP = 3.2;
// HOLDING (his word as well): «on a click and hold on = or - increase smoothly
// and slowly, until the player lifts his finger». Radius units per second; it
// starts after HOLD_DELAY, so that an ordinary click stays a step.
const ZOOM_HOLD_RATE = 2.4, ZOOM_HOLD_DELAY = 260;
// SMOOTH ZOOM WITH BUTTONS (the owner's word 2026-08-04: «a click and a tap on
// zoom zooms more smoothly, not so abruptly»): ease-out 260 ms by a ticker; a
// series of clicks adds up from the TARGET of the previous click, the limits are
// the same CAM_R_MIN/MAX. A gesture through setCamR kills the animation; the zoom
// button, like any gesture, aborts the hint flight.
let zoomAnim = null;
function zoomBy(d){
  if (intro) return;
  hintFly = null;
  const from = (zoomAnim ? zoomAnim.r1 : camR);
  const to = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, from + d));
  zoomAnim = { t0: performance.now(), dur: 260, r0: camR, r1: to };
}
function tickZoomAnim(){
  if (!zoomAnim) return;
  const k = (performance.now() - zoomAnim.t0) / zoomAnim.dur;
  const e = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3);
  camR = zoomAnim.r0 + (zoomAnim.r1 - zoomAnim.r0) * e;
  updateCamera();
  if (k >= 1) zoomAnim = null;
}
$('zoomInBtn').addEventListener('click', () => zoomBy(-ZOOM_STEP));   // closer = smaller radius
$('zoomOutBtn').addEventListener('click', () => zoomBy(+ZOOM_STEP));
// ⚠️ HOLDING IS A SEPARATE MODE, NOT A REPEATED CLICK: a continuous travel by
// real time (rate × dt), therefore the speed is the same at any fps; the ease-out
// animation is killed for that time, otherwise two sources would jerk the
// camera. A click stays a click: holding turns on only after the
// ZOOM_HOLD_DELAY pause, and by then the click handler no longer adds an extra step.
let zoomHold = null;
function zoomHoldStart(dir, btn){
  const t0 = performance.now();
  zoomHold = { dir, startAt: t0 + ZOOM_HOLD_DELAY, last: t0, moved: false, btn };
}
function zoomHoldStop(){
  const wasMoved = !!(zoomHold && zoomHold.moved);
  if (wasMoved && zoomHold.btn) zoomHold.btn.dataset.held = '1';
  zoomHold = null;
  return wasMoved;
}
function tickZoomHold(){
  if (!zoomHold) return;
  const now = performance.now();
  if (now < zoomHold.startAt){ zoomHold.last = now; return; }
  const dt = Math.min(0.1, (now - zoomHold.last) / 1000);
  zoomHold.last = now;
  if (dt <= 0) return;
  zoomHold.moved = true;
  zoomAnim = null;                       // the hold travel outranks the ease frame
  hintFly = null;
  camR = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, camR + zoomHold.dir * ZOOM_HOLD_RATE * dt));
  updateCamera();
}
for (const [id, dir] of [['zoomInBtn', -1], ['zoomOutBtn', +1]]){
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') zoomHoldStart(dir, b); });
  b.addEventListener('pointerup', () => zoomHoldStop());
  b.addEventListener('pointercancel', () => zoomHoldStop());
  b.addEventListener('pointerleave', () => zoomHoldStop());
  // we mute the click after a hold: the travel has already been made by the finger
  b.addEventListener('click', (e) => { if (b.dataset.held === '1'){ b.dataset.held = '0'; e.stopImmediatePropagation(); } }, true);
}

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', ()=>Sound.unlock()); // WebAudio lives only after a gesture (iOS)

$('shakeBtn').addEventListener('click', requestShake);
// ⚠️⚠️ ICON TOSS ON A CLICK (the owner's word 2026-08-21-g: «add a pleasant and
// fast animation to the Shake icon on hover and on click — the icon is tossed
// up a little»). The hover is entirely in CSS, here only the click: the class on
// the button, the keyframes on the inner wrapper `.shake-art` (why on the
// wrapper — explained next to the rule itself in shell.html).
// ⚠️ AS A SEPARATE LISTENER, AND NOT INSIDE `requestShake`: that one silently
// returns during the intro and after the end of the level, while the icon must
// respond to EVERY tap — otherwise the player reads a dead tap as «the button is
// broken». This is an input response, not a mechanics event, and mixing them in
// one function is not needed.
// ⚠️ RESTART THROUGH A REFLOW: without removing the class and forcing a
// recalculation a repeated click in a row will NOT restart the animation (the same
// trick as with `.hit` in the showcase). We remove it on `animationend`, not by a
// timer: a timer would drift from the duration on the very first edit of the keyframes.
// ⛔⛔ THE TOSS LISTENER HAS BEEN REMOVED (the owner's word 2026-08-21-p: «delete
// the other animations»). Here hung a separate `click` on `#shakeBtn`, which put on
// the `.toss` class (through a reflow, so that a second click in a row restarted the
// keyframes) and removed it on `animationend`. It was separate NOT BY ACCIDENT: inside
// `requestShake` the toss would be silent during the intro and after the end of the
// level — the function simply returns there. The class, the `@keyframes shakeToss`
// keyframes and the `.toss` rule have been deleted from the styles by the same edit,
// no orphans are left.
// IN THE AD STATE A TAP = A VIDEO, not an ordinary hint. There is deliberately NO
// confirming overlay (a META decision, the dispatcher agreed): the word «Ad» on the
// button already makes the tap deliberate; the historical shake overlay is not
// copied here. showHint() would have redirected on its own too, but an explicit
// branch reads more honestly and does not depend on the order of the checks inside it.
// TYPE CHARGE: a click = detonation, instantly, without confirmation (popups are
// rejected by the canon). The guards are inside detonateCharge.
// ⚠️ POINTERDOWN, NOT CLICK (the owner's complaint from his phone: «I have to press
// twice and there is a lag»): click is synthesized on up and is swallowed if between
// down and up the node blinked (dissolving writes opacity frame by frame) or the
// finger drifted a little. pointerdown fires INSTANTLY and does not depend on up.
// stopPropagation — so that the same down does not leak into the canvas/bar gestures.
$('chargeBtn').addEventListener('pointerdown', (e)=>{
  e.stopPropagation(); e.preventDefault();
  try { detonateCharge(); } catch(err){}
});
$('hintBtn').addEventListener('click', ()=>{
  if (typeof adHintAvailable === 'function' && adHintAvailable()) requestAdHint();
  else showHint();
});
// THE EYES FOLLOW THE CURSOR DURING GAMEPLAY TOO (the owner's word 2026-08-06:
// «refine the mixer's eyes in the calm state, so that during gameplay they follow
// the cursor the same way as in the pause menu»). We do NOT introduce a separate
// mechanic: the same `faceLook` with which the character already follows the finger
// on a tap — it simply now has a second source, mouse movement.
// ⚠️ THE PRIORITY LADDER IS UNTOUCHED BY CONSTRUCTION: `gazeFor` reads `lookVec`
// ONLY after `FACE_GAZE[state]`, therefore grinding/tiredness/defeat override the
// following by themselves, without a single guard here.
// ⚠️ ONLY A REAL CURSOR (`pointer:fine`): on touch screens mousemove is synthesized
// from a tap, and the pupils would jerk toward the finger on top of their own
// reaction to a match.
// ⚠️ THE 50 ms THROTTLE IS LOAD-BEARING, NOT COSMETIC: `faceLook` reads
// getBoundingClientRect() of the construction — on every mousemove that is a forced
// layout recalculation in a frame where the solver is already running.
if (window.matchMedia && matchMedia('(pointer:fine)').matches){
  let lastLook = 0;
  window.addEventListener('mousemove', (e)=>{
    if (intro || paused) return;            // the intro and the pause do not drive the eyes
    if ($('mainScreen').classList.contains('open')) return; // the menu has its own eyes
    const t = performance.now();
    if (t - lastLook < 50) return;
    lastLook = t;
    faceLook(e.clientX, e.clientY);
  }, { passive: true });
}

// THE CHAIN BY THE OWNER'S WORD 2026-08-06: end of the level -> STATISTICS -> the
// announcement of a new kind -> the next level. Previously the announcement fell on
// top of the statistics right after the level («that is not logical»). ⚠️ genLevel is
// IN THE CALLBACK of the announcement, and not next to it: otherwise a new level would
// be generated UNDER the open vignette and the player would come out of it into an
// already running intro. The refusal branches of storyOnWin call the callback themselves.
// ⚠️ The interstitial goes AFTER the announcement, by the same order «first show, then
// load»: two fullscreen layers (the vignette and the video) must not coincide.
// ⚠️ A LINK WAS ADDED 2026-08-10 (the owner's word: the new-item screen «comes
// seamlessly right after the level-end screen»): statistics → NEW ITEM → announcement →
// level. The new-item screen stands BEFORE the story announcement deliberately: it is
// about the reward of the level just closed, while the announcement is about the next one.
// ⚠️ `newObjOnWin` decides for itself whether there is a reason, and ALWAYS calls the
// callback — otherwise «Next» would silently stop starting a level where there is no new
// item (exactly the rake the announcement already had: refusal branches are obliged to
// hand over control).
$('againBtn').addEventListener('click', ()=>{
  hide('winOverlay');
  // ⛔⛔ NO INTERSTITIAL HERE ANY MORE (the owner's word 2026-09-03: «ads only when the shakes
  // and the tips have run out, nowhere else»). `Ads.maybeInterstitial()` stood in this callback
  // and was the ONLY interstitial show point of the game; it is gone together with the cadence.
  newObjOnWin(()=> storyOnWin(()=>{ genLevel(); }));
});
{ const b = $('newObjBtn'); if (b) b.addEventListener('click', ()=> newObjHide()); }
$('loseAgainBtn').addEventListener('click', ()=>{ hide('loseOverlay'); genLevel(); });
// ⛔⛔ TWO REWARDED PLACEMENTS ARE GONE (the owner's word 2026-09-03: «ads only when the shakes
// and the tips have run out, nowhere else»): the «×2 coins» button of the victory screen
// (`winX2Btn`, dead since COINS_ENABLED=false anyway) and the «📺 Continue» of the defeat
// screen (`loseAdContinue` → continueRun, +1 shake and CONTINUE_DROP items). Their markup,
// handlers, `continueRun`, `CONTINUE_DROP` and `level.continueUsed` are removed together;
// the two remaining rewarded flows are the shake (80-gameplay requestShake) and the tip
// (requestAdHint), both offered ONLY when the stock is empty.
// ⚠️ THE «SCOPE» AND «METAL DETECTOR» BUTTONS HAVE BEEN REMOVED (the owner's spec
// 2026-07-29: «on loading on mobile the old magnet buttons and something else in the
// lower left corner blink — all of that has to be removed»). They lay in the markup
// visible and were hidden only by the FIRST tick of updateHUD, that is, after the
// engine started — hence the blinking. This OVERRIDES the former «do not delete, hide
// by a flag» (2026-07-18/21). The mechanic itself (scopeHighlight/detectorHighlight,
// PRICE_SCOPE, the SCOPE_ENABLED/MAGNET_ENABLED flags) is NOT touched — bringing the
// buttons back = bringing back these two handlers and two lines of markup in bottomBar.
// the mixer's eyes: A TAP = A PROVOCATION (the owner's spec 2026-07-30 «a click or a
// tap on the eyes immediately angers the mixer and turns the grinding on»; OVERRIDES
// «it winks» 2026-07-19). The mechanic is NOT new — the same path as the punishment
// for idling: the patience is declared exhausted (lastAction into the past), the
// 99-main scheduler starts chewing the lower pairs; the eyes get angry BY THEMSELVES —
// the grinding overrides all states (the canon of the eyes). The first bite is
// IMMEDIATE (nextGrind = now).
// It stops like an ordinary grinding: any match/shake resets the idling.
// ⚠️ The 'match' sound has been REMOVED — it LIED «you matched» (AUDIO-PLAN §1 called
// this an outright lie); the grinding gives its own sound, we do not invent a separate one.
// ⚠️ The price of a provocation = the price of the grinding (−20/bite from level 2 on,
// level 1 without penalties per the common table) — the owner asked for exactly «turns
// the grinding on», and softening it without his word is not allowed.
$('eyes').addEventListener('click', ()=>{
  const el = $('eyes');
  el.classList.remove('bounce'); void el.offsetWidth;
  el.classList.add('bounce');
  setTimeout(()=>{ el.classList.remove('bounce'); }, 450);
  // ⚠️ BEFORE the run-state gate below on purpose: the bounce and the buzz answer the touch
  // outside a live round too, and a control that moves and vibrates but stays silent reads as
  // half-broken. The grinder's own answer is a separate, later consequence of the poke.
  try { Sound.play('eyes'); } catch(e){}
  vibrate(25);
  if (intro || paused || !level || level.over) return; // outside a run — only the bounce
  stats.lastAction = performance.now() - (level.idleLimit + 0.5)*1000; // the patience is exhausted
  level.nextGrind = performance.now();                                 // the bite immediately
  Telemetry.ev('poke', { lv: levelNum });
});
// PAUSE (the INTERFACE mockup: the button at the top left instead of ⚙️, an overlay
// with Continue/Restart/Settings). Under the hood — a REAL freeze pauseGame/
// resumeGame (99-main): a freeze frame, a shift of all the clock anchors, the
// afterPause queue; the pauseBtn/resumeBtn handlers are below, next to the keyboard block.
// The exits from the pause into genLevel/settings are obliged to resume (otherwise the
// loop stands as a freeze frame, and the intro of the new level does not tick).
$('pauseRestart').addEventListener('click', ()=>{ resumeGame(); genLevel(); });
$('museumBtn').addEventListener('click', openMuseum);
$('museumClose').addEventListener('click', closeMuseum);
// the popup demo button (the developer panel): a random live item
$('tierDemoBtn').addEventListener('click', ()=>{
  const alive = items.filter(i => i.alive && !i.surprise);
  if (!alive.length) return;
  const it = alive[(Math.random() * alive.length) | 0];
  showTierUp({ name: String(it.key), tier: 2, mult: 1.25, item: it });
});
$('pauseSettings').addEventListener('click', ()=>{
  resumeGame(); $('debugPanel').style.display = 'block';
});
$('loseContinue').addEventListener('click', ()=>{ hide('loseOverlay'); level.over = false; level.stuck = -8; }); // ~5 s of grace, then the dead end will show up again
// the ⚙️ panel is opened from the pause (there is no ⚙️ button on the game screen any more)
$('radiusToggle').addEventListener('change', e => { CFG.radiusOn = e.target.checked; $('radiusVal').parentElement.style.opacity = CFG.radiusOn ? 1 : 0.4; updateHUD(); });
// the difficulty lives in localStorage — the choice survives a reload
try { CFG.hard = localStorage.getItem('mixer_hard') === '1'; } catch(e){}
$('hardToggle').checked = CFG.hard;
$('hardToggle').addEventListener('change', e => applyHard(e.target.checked));
$('radiusRange').addEventListener('input', e => { CFG.baseRadius = parseFloat(e.target.value); updateMatchRadius(); $('radiusVal').textContent = CFG.matchRadius.toFixed(2); updateHUD(); });
$('hlToggle').addEventListener('change', e => { CFG.highlight = e.target.checked; refreshAccessibility(); });
$('soundToggle').addEventListener('change', e => applySound(e.target.checked));
// A MEASUREMENT ON A LIVE PHONE (the dispatcher's order): the owner plays a level
// and presses one button — the report goes to the clipboard.
// ⚠️ THREE PATHS, AND ALL THREE ARE NEEDED: `navigator.clipboard` requires a secure
// context (on the portal over https there is one, on file:// there is not), the old
// execCommand asks for a REAL selection, and if even that did not work — the text is
// obliged to stay on the screen, so that the owner copies it by hand. Doing nothing
// silently is not allowed: he is not a programmer and there will be no second attempt.
$('perfCopyBtn').addEventListener('click', ()=>{
  let txt = '';
  try { txt = JSON.stringify(__game.perfReport(), null, 1); }
  catch(e){ txt = 'perfReport error: ' + (e && e.message); }
  const out = $('perfOut');
  out.style.display = 'block'; out.value = txt;
  // ⚠️ THE WORDING OF THE TOAST IS NOT COSMETIC. `execCommand('copy')` can return
  // true having put nothing in (a measurement on an insecure origin: `navigator.clipboard`
  // is absent, execCommand reported success, the buffer is empty). Were we to say «copied»
  // — the owner would press «paste», get emptiness and give up: he has one attempt.
  // That is why the text ALWAYS stays in a visible field and is selected, and the toast
  // speaks about BOTH paths. We promise nothing beyond what we can guarantee.
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
$('mcEditBtn').addEventListener('click', () => { matcapEdit(); });
// LEVEL SELECTION (the owner 2026-08-13). Through __game.setLevel DELIBERATELY — one
// point of writing the level for the panel and for the suite, we do not make copies of the logic.
$('lvlJumpBtn').addEventListener('click', ()=>{
  const n = parseInt($('lvlJumpInp').value, 10);
  if (!(n >= 1)) return;
  try { window.__game.setLevel(n); } catch(e){}
  $('debugPanel').style.display = 'none';
  genLevel();
});
// THE BOWL BURST (the v2 prototype): the bench buttons — the same point as with the turbo
if ($('bowlCrackBtn')) $('bowlCrackBtn').addEventListener('click', ()=>{ bowlCrackAdd(); });
if ($('bowlShatterBtn')) $('bowlShatterBtn').addEventListener('click', ()=>{
  if (level && !level.over){ level.bowlCracks = bowlN(); shatterBowl(); }
  $('debugPanel').style.display='none';
});
if ($('bowlNInp')) $('bowlNInp').addEventListener('change', (e)=>{ bowlNRuntime = Math.max(0, parseInt(e.target.value,10)||0); });

// ===== THE MAIN SCREEN / PAUSE (mockup 770:1271) — the handlers =====
// The difficulty and the sound are controlled FROM TWO PLACES (the pause checkboxes +
// the main screen controls) — single points, so that the states do not drift apart.
function applyHard(v){
  CFG.hard = !!v;
  try { localStorage.setItem('mixer_hard', CFG.hard ? '1' : '0'); } catch(e){}
  if (level) level.idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // the mixer's timer follows the difficulty live
  refreshAccessibility(); updateHUD();
  $('hardToggle').checked = CFG.hard;
  if (typeof refreshMainSettings === 'function') refreshMainSettings();
}
// ⚠️ A THIN WRAPPER over applySoundVol (85-hud) — the holder of the pause states
// (#soundToggle) needs exactly ON/OFF. Turning it on returns the LAST non-zero
// volume (and not always 100): a player who set 40 and then flicked the toggle must
// get his 40 back, otherwise the toggle quietly erases his choice.
function applySound(on){
  applySoundVol(on ? soundVolPrev : 0);
}
// THE WHOLE Play block is clickable → a return into the game (the owner's spec «every
// area is tappable»): the handler is on the .ms-play CARD, and not on the button — a
// click on the button (inside) arrives by the same bubbling, therefore the separate
// button handler has been REMOVED (otherwise a double closeMainScreen/genLevel). The
// empty field of the card is a target too.
function menuPlayResume(){
  const fresh = !level || level.over; // there is no live run — the START of a new one
  closeMainScreen();                  // will lift ONLY its own pause (see 85-hud)
  if (fresh){
    // ⛔⛔ THE OVERLAYS MUST GO FIRST (review finding 4, 2026-08-28). Until now only the
    // «Again» button cleared them (`:348` / `:352`), and this path did not — so backgrounding
    // the tab on «level complete», opening the menu and pressing Play started the new level
    // UNDERNEATH the stale win screen: the player saw «complete» over a level already pouring
    // and already grinding below, and the only way out was «Next», which threw that level away,
    // generated another one and could show one extra interstitial.
    // ⚠️ Measured as reachable IN THE iOS WRAPPER TOO, not only in a browser: the wrapper
    // session logged `vis hidden +6362 ms` / `vis visible +8039 ms`, so the page really does
    // see backgrounding there — and backgrounding a phone app on the win screen is a far more
    // ordinary gesture than switching a desktop tab.
    // ⛔ DELIBERATELY NOT DOING WHAT «Again» ALSO DOES: no new-item / story / interstitial
    // chain. The review named that as an open question for the owner and set «does not fire»
    // as the default; this fix keeps that default rather than deciding it silently.
    hide('winOverlay'); hide('loseOverlay');
    genLevel();
  }
}
document.querySelector('.ms-play').addEventListener('click', menuPlayResume);
// THE FLOATING BUTTON leads to the same place as the Play card — one action, one
// path (otherwise the guards of the pause and of starting a new run would diverge).
$('msFloatResume').addEventListener('click', menuPlayResume);
// MENU SCROLLING: two independent appearances (the owner's specs 2026-07-31).
//  `#msSticky.on` — the «My Collection» block has gone above the top of the view →
//                   the compact header of node 815:1506 SLIDES OUT from the top;
//  `.playoff`     — the Play card has gone above the top → the button 815:1521 pops up from below.
// ⚠️ THE THRESHOLDS ARE DIFFERENT AND ARE BOUND TO DIFFERENT BLOCKS — this is a direct
// spec, and not taste: the owner asked for the header «ONLY when the My Collection block
// goes away», and for the button — when the real one is not visible. Tying them to one
// threshold would mean showing a duplicate on top of the visible original (the button) or
// hiding the header ahead of time.
// ⚠️ The listener is passive — otherwise the browser waits for the handler before
// scrolling and on a phone the scroll starts to stutter.
// The button of the floating header is a MIRROR: the click goes into the real one, so that
// the handler and its guards live in one place.
if ($('msGetMore2')) $('msGetMore2').addEventListener('click', () => $('msGetMore').click());
(function(){
  const ms = $('mainScreen'), play = document.querySelector('.ms-play'),
        sticky = $('msSticky');
  if (!ms || !play) return;
  ms.addEventListener('scroll', () => {
    // ⚠️ THE FLOATING HEADER APPEARS WHEN THE «My Collection» BLOCK GOES ABOVE THE
    // TOP OF THE VIEW (the owner's spec 2026-07-31), and NOT on the fact of scrolling.
    // The threshold is the BOTTOM edge of the title: while it is visible even partly,
    // «My collection» would be read on the screen twice. The title lives in the flow
    // above the grid, its rect is the border of the block.
    if (sticky){
      const t = document.querySelector('.ms-coll-title');
      sticky.classList.toggle('on', !!t && t.getBoundingClientRect().bottom <= 0);
    }
    // ⚠️ THE THRESHOLD OF THE BUTTON IS SIMPLY THE TOP OF THE VIEW. Previously it was
    // counted from the bottom of the STICKY header: that one hung over the Play card and
    // made it unclickable earlier than the button went off the screen (a dead window of
    // 78px). There is no stickiness any more — the header travels with the flow, it does
    // not overlap anything, and the window closes by itself.
    ms.classList.toggle('playoff', play.getBoundingClientRect().bottom <= 0);
  }, { passive: true });
})();
// the debug panel — from the menu (previously the entrance was in the pause card)
// THE LEADERBOARD SCREEN: it is opened from the menu, it is closed by the cross. ⚠️ The
// tabs are REAL buttons, and not a switching of a class by hand: the guard is obliged to
// walk the same path as the player.
// ⚠️ THERE IS ONE LISTENER, AND IT HANGS ON THE ROW, AND NOT ON THE BUTTON. By the mockup
// THE WHOLE pill is pressable; a click on the button (with the mouse or with Enter from
// the keyboard) BUBBLES here by itself, therefore both paths are closed by one line. A
// second listener on the button would give TWO openings for one press — that is, two
// network round trips.
{ const b = $('msLbEntry');  if (b) b.addEventListener('click', ()=> lbScreenOpen()); }
{ const b = $('lbClose');   if (b) b.addEventListener('click', ()=> lbScreenClose()); }


if (DEV) $('msDev').addEventListener('click', ()=>{ closeMainScreen();
  $('lvlJumpInp').value = levelNum; // the field shows the CURRENT level when opened
  $('debugPanel').style.display = 'block'; });
// The Sound slider = the VOLUME 0..1 (symmetrically with Music). It used to be «on/off
// by a threshold» — because of that the position of the slider was not saved (see applySoundVol).
$('msSound').addEventListener('input', e => { applySoundVol(parseInt(e.target.value, 10) / 100); msFill(e.target); });
// The Music slider = the VOLUME of the background track (0..1); applyMusic itself starts/mutes it
$('msMusic').addEventListener('input', e => { applyMusic(parseInt(e.target.value, 10) / 100); msFill(e.target); });
// THE SWITCHES OF THE MOBILE MOCKUP (870:1536/1539). ⚠️ They go through THE SAME
// applySoundVol/applyMusic as the sliders: the controls have one state, a second tract
// would diverge from the first. Turning it on returns the LAST non-zero volume —
// otherwise the switch would erase the choice made with the slider.
$('msSoundSw').addEventListener('click', () => {
  applySoundVol(soundVol > 0 ? 0 : soundVolPrev);
  refreshMainSettings();
});
$('msMusicSw').addEventListener('click', () => {
  applyMusic(musicVol > 0 ? 0 : musicVolPrev);
  refreshMainSettings();
});
// THE FIRST GESTURE on the page unlocks autoplay (audio.play() before a gesture is
// blocked by the browser). Once, passively — the game's pointerdown handlers are not touched.
let bgmUnlocked = false;
function unlockBgm(){
  if (bgmUnlocked) return; bgmUnlocked = true;
  const bgm = $('bgm'); if (bgm){ bgm.volume = musicOut(musicVol); if (musicVol > 0) bgm.play().catch(()=>{}); }
}
// ⚠️⚠️ THE GESTURE IS ANY GESTURE, AND NOT ONLY A TOUCH (the owner's complaint «the
// music starts playing with a delay», taken apart by the measurement 2026-08-11). A
// measurement of three scenarios: a tap during the intro DOES start the music (the intro
// does not eat it — verified), while a KEY did not start it AT ALL: on the desktop a
// player who presses space (the shake) stayed without music forever. Hence the whole list of types.
// ⚠️ `capture:true` — so that no handler above could swallow the event before us: the
// unlocking must not depend on someone else's `stopPropagation`.
['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach(t =>
  window.addEventListener(t, unlockBgm, { passive: true, capture: true }));
// ⚠️ AND ONE ATTEMPT WITHOUT A GESTURE, IMMEDIATELY. The autoplay policy usually
// rejects it — then `catch` stays silent and everything is decided by the first gesture.
// But in some environments (the portal has already got a gesture, a desktop with previous
// interaction) it goes through, and the music starts IMMEDIATELY, and not when the player
// first touches the screen. It costs zero.
try { const _b = $('bgm'); if (_b && musicVol > 0) _b.play().then(()=>{ bgmUnlocked = true; }).catch(()=>{}); } catch(e){}
$('msDiff').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  applyHard(b.dataset.hard === '1');
});
// Get More / Subscribe / Boost / Open — ECONOMIC FORKS (META/INTEGRATION):
// on a placeholder until the owner's decision, the action is a «coming soon» note
// «GET MORE» — the ONE-package screen (the owner's word 2026-09-03, mockups 937:1505 / 937:1533);
// until then it was the screen of three booster bundles (783:95 / 785:112).
// It opens ON TOP of the menu; the game is already on the menu's pause, we do NOT set our
// own pause (the ownership of the pause belongs to openMainScreen, going in there is not
// allowed, see CLAUDE.md).
$('msGetMore').addEventListener('click', ()=> { show('starsOverlay'); try { refreshBundlePrices(); } catch(e){} });
$('starsClose').addEventListener('click', ()=> hide('starsOverlay'));
// THE PURCHASE goes through the META handle buyBundle(tier). The handle may not exist
// yet: then we CREDIT NOTHING (a mock crediting is forbidden — this is currency), and we
// behave like the former Get More in a test build: the «Coming soon» toast + console.warn.
// ⛔ THE WHOLE-CARD CLICK (the owner's spec 2026-07-28) WENT AWAY WITH THE CARDS (2026-09-03):
// the one-package screen has no card, the button is the only purchase control.
document.querySelectorAll('#starsOverlay .st-buy').forEach(btn => {
  btn.addEventListener('click', ()=>{
    // ⚠️ THE NAME OF THE TIER IS A STRING, AND NOT A NUMBER. Here stood `+btn.dataset.tier`,
    // that is, 5 went into buyBundle, while the bundles are named 'bundle5' — the product was
    // not found, the function quietly returned a refusal, and nobody read it. The player
    // pressed «Upgrade $4.99» and got NOTHING: neither the purchase, nor an error. The suite
    // did not see the hole, because it called buyBundle with a string and did not press the button.
    const tier = 'bundle' + btn.dataset.tier;
    if (typeof buyBundle !== 'function'){ toast('Coming soon'); return; }
    // ⚠️ 🔴 IN PRODUCTION THE PRODUCT IS NOT HANDED OUT WHILE THERE ARE NO PAYMENTS (the
    // INTEGRATION report 2026-07-29, the hole is mine). The story has two steps: at first the
    // button did not work at all (a number instead of a string id), in v163 I fixed that — and
    // it started crediting the bundle WITHOUT PAYMENT, with live price tags $4.99/$9.99/$19.99
    // on the build being handed out. There is no payment gateway in the project at all: the
    // `payments` Bridge is not used even once.
    // ⚠️ WHY NOT REMOVE THE BUTTON ALTOGETHER: the owner needs an EMULATION of the purchased
    // mode, in order to look at the booster on the screen. That is why the handing out stayed,
    // but ONLY in development (DEV: file://, localhost, ?dev=1) — in the same place where the
    // whole service interface lives. In production — an honest «soon».
    // THE GATE HAS BEEN REMOVED TOGETHER WITH THE INTRODUCTION OF bridge.payments (the
    // Integration package 2026-08-03, exactly as the former comment prescribed): in production
    // the purchase goes THROUGH A PAYMENT — Ads.purchase(tier) itself carries out the payment
    // and the handing out (inside, the order is «hand out -> close»); we read {ok}. Where there
    // are no payments (a platform without payments) — the former honest «soon».
    if (!DEV){
      if (!(typeof Ads === 'object' && Ads.purchase)){ toast('Coming soon'); return; }
      Ads.purchase(tier).then((res) => {
        if (!res || !res.ok){
          console.warn('[stars] purchase did not go through:', tier, res);
          // ⚠️ SILENCE ON A REFUSAL. Until 2026-08-28 EVERY non-ok answer showed «Purchase
          // failed» — including the player's own cancel, which called their deliberate choice
          // an error. 'cancelled' and 'pending' (Ask to Buy awaiting approval) are now silent;
          // a pending one arrives later through the restore pass, so a message would be a lie
          // in the other direction.
          // ⚠️ 'pending' gets its OWN word rather than silence. iOS shows its own «request
          // sent» sheet, so this is not the only feedback — but the game's own card still
          // invites a second tap, and a second tap sends a SECOND approval request to the
          // parent for the same product. One honest line prevents that.
          const r = res && res.reason;
          if (r === 'pending') toast('Waiting for approval');
          else if (r !== 'cancelled')
            toast(r === 'unsupported' || r === 'unavailable' ? 'Coming soon' : 'Purchase failed');
          return;
        }
        Sound.play('surprise', 0.55); vibrate([15, 30, 15]);
        hide('starsOverlay'); refreshMainScreen();
      });
      return;
    }
    const res = buyBundle(tier);
    // ⚠️ WE READ THE RESULT WITHOUT FAIL: a silent refusal is exactly what made the hole
    // live unnoticed. Any future divergence of the name is now visible both to the player
    // and in the console.
    if (!res || !res.ok){
      console.warn('[stars] purchase did not go through:', tier, res);
      toast('Purchase failed'); return;
    }
    Sound.play('surprise', 0.55); vibrate([15, 30, 15]);
    toast('TEST: booster activated');   // it is visible that this is an emulation, and not a purchase
    hide('starsOverlay'); refreshMainScreen();
  });
});
// msSubscribe has been removed together with the menu banner (the owner's word 2026-08-03)
$('msGrid').addEventListener('click', e => {
  const btn = e.target.closest('.msc-boost');
  if (btn){
    // «Open» on the locked ones is still a stub (the unlocking of a kind goes by the level progression)
    if (btn.dataset.act !== 'boost'){ toast('Coming soon'); return; }
    const boostKey = btn.closest('.msc').dataset.key;
    const res = buyBoost(boostKey);
    // refreshMainScreen rebuilds the grid (the balance/the availability of the others) — we hang
    // the celebration AFTER, on the fresh card by key (the green top-up + the particles of joy)
    if (res.ok){ Sound.play('surprise', 0.55); vibrate([15, 30, 15]); refreshMainScreen(); boostCelebrate(boostKey); }
    else toast(res.reason === 'capped' ? 'Max tier reached' : 'Not enough stars');
    return;
  }
  const card = e.target.closest('.msc'); if (!card || card.classList.contains('lock')) return;
  // #4 (the owner's spec): A TAP = A SPIN of the portrait (like the hover on the desktop). On
  // TOUCH (there is no hover) a tap toggles the spin of the portrait WITHOUT a change of size;
  // on the desktop the spin is given by the hover.
  // ⛔⛔ THE DESKTOP BRANCH HAS BEEN REMOVED 2026-08-21-n (the owner's word «right now this is
  //    a kind of click, and it has to be made a hover, desktop»). Here stood
  //    `msSelKey = (msSelKey === card.dataset.key) ? null : card.dataset.key;`
  //    and after it `buildMainCollection()` — that is, THE CLICK LATCHED the highlight.
  //    Now it is given by `:hover` in the styles, and a click on the card itself on the
  //    desktop does nothing.
  // ⚠️ THIS DOES NOT TOUCH THE PURCHASE: the Boost button is intercepted ABOVE in this same
  //    handler and takes the key from the `dataset.key` of the nearest card, and not from the
  //    removed variable — a press on the button does not reach this line.
  // ⚠️ TOUCH IS NOT TOUCHED EITHER: it goes into the tap-spin a line above and never set
  //    the highlight.
  if (!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches)){ msCardTapSpin(card); return; }
});
// DESKTOP/TABLET (mockup 747:1048): #lvlSvg (LV) and #tmSvg (the time) live in the left
// group next to the pause. MOBILE (#11, the owner's spec 2026-07-27 «above the score — the
// LEVEL, not the time»): we move #lvlSvg into the right stack before #scSvg (LV above the
// score), and #tmSvg stays HIDDEN (the time is a vestige). The nodes are physically moved —
// the ids are not duplicated. To bring the time back = the LEVEL_TIME_IN_HUD flag.
function layoutHUD(){
  const desk = innerWidth >= 768;
  const left = document.querySelector('#topBar .grp');
  if (desk){
    left.appendChild($('lvlSvg'));       // LV next to the pause (the desktop mockup)
    left.appendChild($('tmSvg'));        // the time is on the left too (hidden by the flag)
    $('lvlSvg').style.display = '';       // we hand the control over to CSS (media ≥768 → block)
  } else {
    $('statStack').insertBefore($('tmSvg'), $('scSvg'));   // the time is hidden, but we keep it in the stack
    $('statStack').insertBefore($('lvlSvg'), $('scSvg'));  // LV right above the score
    $('lvlSvg').style.display = 'block';  // the CSS base hides #lvlSvg — we show it in the stack
  }
  $('tmSvg').style.display = LEVEL_TIME_IN_HUD ? '' : 'none'; // the time is hidden from the HUD (the flag is off)
  // after a change of the layout the scale of the frames is different — re-fit by the content
  if (typeof fitStat === 'function'){ fitStat('lvlNum'); fitStat('timer'); }
}
addEventListener('resize', layoutHUD);
layoutHUD();
// The interface sound: one delegated hook on ALL the buttons (the owner's spec)
document.addEventListener('click', e => {
  if (e.target && e.target.closest && e.target.closest('button')) Sound.play('ui');
}, true);
// Space = the shake (desktop): the guards are inside requestShake (the intro/the end)
addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat){
    e.preventDefault();
    if (paused) return;
    // under the ad overlays Space does not shake the bowl (and does not open a second
    // question about the shake on top of a running video)
    if ($('adOverlay').style.display === 'flex') return; // adAskOverlay has been removed (the video starts right away)
    requestShake();
  }
});
// The keyboard must work IMMEDIATELY, without a click on the bowl: in an embedding
// (the preview panel, the portals) the iframe is deaf to keys until it gets the focus —
// we take it programmatically at the start and on every return into the window
function grabKeyFocus(){ try { canvas.focus({ preventScroll: true }); } catch(e){} }
addEventListener('focus', grabKeyFocus);
document.addEventListener('visibilitychange', () => {
  // a minimized tab = a pause: rAF does not tick in the background, while the clocks of
  // the mixer/the combo run — the player used to come back to eaten items. The guards
  // (the intro/the end/already on pause) are inside pauseGame; the player resumes himself
  // with the Continue button.
  // ⚠️ THROUGH THE MENU, and not a bare pauseGame(): the pauseOverlay card is no longer
  // shown (the main screen has replaced it) — a NON-silent pause would have left the
  // player in front of an orphaned popup. openMainScreen sets the pause silently and takes
  // the ownership upon itself, the Resume button will lift it.
  if (document.hidden) openMainScreen();
  else grabKeyFocus();
});
// ⚠️ THE WRAPPER IS MANDATORY: pauseGame(silent) has taken an argument since 2026-07-23,
// and a listener would pass the event object into it — a MouseEvent is truthy, and the
// pause popup would silently stop being shown (caught by the suite right away).
// PAUSE = THE MAIN SCREEN (the owner's spec «it is both the main screen and the pause»):
// instead of the pauseOverlay card the menu opens. The pause is set SILENTLY inside
// openMainScreen, and only its own one — the menu does not open on top of an ad one.
$('pauseBtn').addEventListener('click', openMainScreen);
$('resumeBtn').addEventListener('click', resumeGame);
$('resetBtn').addEventListener('click', ()=>{
  resetProgress();
  $('debugPanel').style.display = 'none';
  toast('Progress reset');
  genLevel(); updateHUD();
});

// ═══ THE CURSOR PRESS ═══ (the owner's word 2026-08-02, verbatim: «when I click the
// mouse button, shrink the cursor by 3-5% for a fraction of a second and then bring it
// back. Do it fast, but not jerkily, so that there is a feeling of a press»)
// A PNG cursor cannot be scaled with CSS — at the start we generate 96% copies of BOTH
// images (the hand and the grab) with a canvas around their hotspot (otherwise the tip of
// the finger would shift and the click would «drift») and for 140 ms we put html.cursorpress on.
// The mouse only: touch has no cursor. The 140 ms is fixed — fast, but entirely visible to
// the eye; the return is by a timer, not by mouseup (while holding, the cursor comes back
// by itself — «for a fraction of a second» per the spec).
let cursorPressTimer = 0, cursorPressReady = false;
(function buildPressedCursors(){
  const found = { point: null, grab: null }; // {uris:[1x,2x], hot:[x,y], fall}
  const walk = (rules) => {
    for (const rule of rules){
      // ⚠️ WITHOUT a continue on cssRules: in a fresh Chromium (nested CSS)
      // .cssRules exists on EVERY rule — «children first» would skip everything
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      const cur = rule.style && rule.style.cursor;
      if (!cur || cur.indexOf('image-set') < 0 || cur.indexOf('data:image') < 0) continue;
      const uris = [...cur.matchAll(/url\("?(data:image\/png;base64,[^")\s]+)"?\)/g)].map(m => m[1]);
      const tail = cur.match(/\)\s+(\d+)\s+(\d+)\s*,\s*([a-z-]+)/);
      if (uris.length < 2 || !tail) continue;
      const rec = { uris: uris.slice(0, 2), hot: [+tail[1], +tail[2]], fall: tail[3] };
      if (tail[3] === 'grabbing') found.grab = rec;
      else if (!found.point) found.point = rec; // the hand: the first base rule
    }
  };
  try{
    for (const sheet of document.styleSheets){
      try{ walk(sheet.cssRules); }catch(e){}
    }
  }catch(e){}
  if (!found.point || !found.grab) return; // the cursors are not ours — quietly, without the effect
  const SHRINK = 0.96; // −4%, the middle of the spec's «3-5%»
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
    shrinkOne(rec.uris[0], rec.hot[0], rec.hot[1]),          // 1x: the hotspot as it is
    shrinkOne(rec.uris[1], rec.hot[0]*2, rec.hot[1]*2),      // 2x: the hotspot ×2 in pixels
  ]);
  Promise.all([shrinkPair(found.point), shrinkPair(found.grab)]).then(([p, g]) => {
    const set = (pair, rec) =>
      `image-set(url(${pair[0]}) 1x, url(${pair[1]}) 2x) ${rec.hot[0]} ${rec.hot[1]}, ${rec.fall} !important`;
    const st = document.createElement('style');
    st.id = 'cursorPressStyle';
    // the selectors repeat the production ones: the base+the buttons — the hand, grabbing —
    // the grab; the grabbing rule is LOWER and more specific, so that during a drag it is
    // exactly the grab that shrinks, without a substitution of the picture (otherwise it would be «jerky»)
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
}, true); // capture: it fires on the buttons too, whose click might not bubble
