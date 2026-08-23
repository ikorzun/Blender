// ===== 99-main: main loop, debug API, start =====

let camShake = 0, lastT = performance.now(), lastAccMs = 0, lastHudMs = 0;
let lastMtText = null; // cache of the countdown to grinding — we touch the DOM only on a change
// ⛔⛔ THE FIRE AT THE EYES WAS REMOVED BY THE OWNER'S WORD 2026-08-20 («remove the
// fire at the eyes»). Here lived `lastFireOn`, `grindStartMs` and the one-off
// setting of the `dropped` class. With the crown of flame the LOWERING of the
// construction went away too: it existed EXACTLY to give the crown room above the
// eyes (decision 2026-07-22 «lower the construction»), and with no fire there is nothing to lower for.
// ⚠️ DO NOT CONFUSE WITH THE OTHER FIRE: `fireSilhouetteFX` (a burning ITEM once every 30 s,
// `FIRE_EVERY_MS`/`FIRE_BURN_MS`/`FIRE_TOP_N`/`FIRE_BONUS_MULT`) — a separate
// mechanic, it is ALIVE and untouched.
// Restore — `git revert` of the commit «Fire at the eyes removed».

// Perf meter (soak test and measurements on devices, consumer — soak.js):
// rings of the last 600 frames — raw frame time and physics step time
const frameRing = [], stepRing = [];
let perfFrames = 0, perfWorstMs = 0;
// phases of the CURRENT frame — accumulated along loop and folded into _lastPh at the end
let _phStep = 0, _phSolve = 0, _phSync = 0, _phSub = 0, _phFx = 0, _phBuild = 0, _phTap = 0, _phUi = 0, _phRen = 0;
let seriesNextTick = 0; // throttling of the alarm tick of the series window (tempo package)
let slowmoUntil = 0;    // slow-mo of the bowl shatter (v2 prototype): dt is multiplied by K
// ⚠️ FRAME BREAKDOWN BY SUBSYSTEM (2026-07-31, the owner's task «the game
// lags a bit on mobile»). The former perf meter gave the frame as ONE LUMP and
// the physics step separately — from such a pair you cannot say who eats the frame:
// the remainder was dumped into «everything else» and silently swallowed render,
// particles and HUD ticks. Rings: fx — stepFX (particles), ren — renderer.render,
// ui — the rest of the ticks (veil/depth tint/eyes/camera/HUD). The price of the
// instrumentation — 4 performance.now measurements per frame, reported as a separate measurement.
const fxRing = [], renRing = [], uiRing = [];
// breakdown of the physics step ITSELF + number of substeps per frame (see stepPhysics)
const solveRing = [], syncRing = [], subRing = [], buildRing = [], tapRing = [];
// snapshot of ONE worst frame (see the breakdown in loop): phases of the previous frame + outside
let _worstFrame = null, _wfRaw = 0, _lastPh = null;
// ⚠️ THE SECOND SNAPSHOT — THE FRAME WITH THE MAXIMUM EFFECT BUILD, and it is needed
// separately from the worst one. The measurement showed these are DIFFERENT frames: the
// peak is held by the solver, while the build lands on the neighbour. The question «is an
// effect pool worth it» is decided not by the build total but by how heavy the frame that
// carries it is: 11 ms on top of 38 ms of solver is one thing, 11 ms on top of an empty frame is quite another.
let _worstBuildFrame = null, _wbBuild = 0;
let _tapPh = { pick:0, cand:0, ghost:0 };  // phases of the last tap (profiling)
const _pushRing = (r, v) => { r.push(v); if (r.length > 600) r.shift(); };

// ===== Level intro (per the owner's mockup): side view -> items pour
// into an empty bowl (~2 s of live physics) -> a 2-second orbit around the bowl
// with a smooth transition to the top-down gameplay view. Input and mixer are locked.
let intro = null; // { phase:'drop'|'orbit', t, shakes }
let pendingTrim = false; // trim and the radius base wait for a SETTLED pile (see finalizeFill)
function beginDrop(){
  intro.phase = 'drop'; intro.t = 0; introPerfStart();
}
function startIntro(){
  // screen 'intro' — the orbit; closed by finishIntro/skipIntro (docs/METRICS.md §3)
  try { Telemetry.screen.enter('intro'); } catch(_){}
  // CONTRACT WITH THE INTERFACE v2 (the owner's spec 2026-07-22: «the block smoothly
  // unfolds AFTER the bucket orbit animation»): the `introdone` class on
  // <html> is removed for the duration of the intro and set in finishIntro — their CSS
  // unfolds the showcase by it. The signal is precisely the END of the orbit, not the panel build.
  document.documentElement.classList.remove('introdone');
  // ⚠️ PHASE 'wait' — WE WAIT UNTIL THE PLATFORM REMOVES ITS CURTAIN (the owner's
  // complaint 2026-07-30: «the basket filling animation is gone, I land straight on its
  // unfolding»). The dispatcher's measurement showed why: the platform splash is opaque
  // and hangs 1778→3947 ms, while the items pour 1706→3200 — the WHOLE animation played
  // into a closed curtain, the player saw only the tail of the orbit.
  // While the phase is 'wait': physics does NOT step (the items stand above the bowl, nobody
  // sees them — the curtain is on top), the camera is at the starting side view. Once the curtain is gone —
  // we move to 'drop' and the pile pours IN PLAIN SIGHT.
  // ⚠️ WHY genLevel WAS NOT MOVED BEHIND THE CURTAIN: loop and the whole HUD read level,
  // and before genLevel it does not exist — we would have had to gate a dozen places. A freeze for
  // one or two frames is cheaper and more local.
  // ⚠️ WHY THIS DOES NOT BRING BACK THE REGRESSION «items hang in the air»: that one was
  // a FORCED SLEEP by pure clock IN THE MIDDLE of the falling column, in front of the player and for
  // an indefinite time. Here the pause lasts until the FIRST physics step, under the curtain,
  // and it is lifted for sure (Ads.curtainGone always resolves, limit 12 s).
  intro = { phase:'wait', t: 0, shakes: 0, readySent: false };
  waveArm();                    // wave queue — from scratch for every level
  resetPointers();
  // ⚠️ 14, NOT 11 (intro speed-up 2026-08-15). The limit was set against the column
  // punching through the walls at v=16-18; on Rapier 0.20 the containment is qualitatively
  // different (max wall excess in the soak 2.415 -> 0.330), so there is room to spare.
  // The live MAX_FALL 16 is still higher — it is still «softer», just closer.
  setFallCap(Math.min(MAX_FALL, 14 * INTRO_SPEED)); // softer than terminal, but follows the speed
  camAz = 0.35; camPhi = 1.25; camR = 17.8;
  updateCamera();
}
// Insurance against loose seeds: everything sticking out above the fill line after the
// shake-down is quietly removed IN PAIRS (the top one + its twin) — type parity stays
// intact, an overflow never happens
function trimOverfill(){
  let removed = 0;
  for (let guard=0; guard<8; guard++){
    let top = null;
    for (const it of items){
      // surprise/bomb/stone are not trim candidates: unpaired special items,
      // removing a «top pair» for them degenerates into a single deletion
      if (it.alive && !it.surprise && !it.bomb && !it.frozen && (!top || it.p.y + it.r > top.p.y + top.r)) top = it;
    }
    if (!top || top.p.y + top.r <= FUNNEL.H - 0.2) return removed;
    const twin = items.find(i => i !== top && i.alive && i.key === top.key);
    [top, twin].forEach(it => { if (it) { removeItem(it); removed++; } });
  }
  return removed;
}
// ⚠️⚠️ A FROZEN SLICE OF THE POURING — AN INSTRUMENT FOR A LIVE DEVICE (the owner's
// complaint 2026-08-11 «on the iPhone 17 there is a framerate drop while pouring»).
// ⛔ WITHOUT IT THE PERF REPORT DOES NOT SEE THIS MOMENT AT ALL: `frameRing` is a sliding
// window of 600 frames (~10 s), and the player reaches the developer panel through
// the pause and the menu, that is, by then the pouring frames are DISPLACED. One must measure
// where the event happens, and keep the snapshot until it is asked for.
// ⚠️ We do not start counters of our own: the slice is taken by THE SAME `perfStats()` as
// everything else. A copy of a metric next to the working one would diverge from it at the
// very first edit — the law this project has been burned by five times.
let _introPerf = null, _introT0 = 0;
function introPerfStart(){
  _introT0 = performance.now();
  try { __game.perfReset(); } catch(e){}
  // ⚠️ We hang the step-phase breakdown on THE SAME WINDOW as the pouring slice: otherwise the
  // phase numbers and the frame numbers cannot go into one table — they are about different stretches.
  try { if (profActive()) profReset(); } catch(e){}
}
function introPerfStop(){
  if (!_introT0) return;
  try {
    const p = __game.perfStats();
    _introPerf = { ms: Math.round(performance.now() - _introT0), level: levelNum,
      alive: items.filter(i => i.alive).length,
      frame: p.frame, step: p.step, solve: p.solve, sync: p.sync,
      ren: p.ren, ui: p.ui, fx: p.fx, sub: p.sub,
      frames: p.frames, worst: p.worstFrame,
      jank33: p.jank33, jank50: p.jank50,
      dpr: renderer.getPixelRatio(), tier: CFG.perfTier };
    // step phases — only when the profiler is switched on by hand (in the live build it is absent)
    try { if (profActive()) _introPerf.phases = profTake(); } catch(e){}
  } catch(e){}
  _introT0 = 0;
}
// ⚠️⚠️ AN ON-SCREEN COUNTER — SO THAT THE MEASUREMENT COMES FROM THE OWNER'S PHONE, NOT FROM THE BENCH
// (started 2026-08-13, the complaint «it started lagging more»: an A/B over three builds on
// the bench — both in Chromium and in WebKit 26 — did NOT show the regression, that is, the argument
// cannot be settled by my hardware; HIS numbers are needed). Switched on by `?fps=1`, it lives
// above everything, updates once per 500 ms. It shows: current FPS, the WORST over the
// last 3 seconds (that is exactly what «lags» means), the physics step, items on
// the scene, DPR and the level.
// ⚠️ WITHOUT THE FLAG IT COSTS NOTHING: one boolean check per frame, no DOM is created.
let fpsBadgeOn = false, fpsBadgeEl = null, fpsBadgeNext = 0, fpsBadgeRing = [];
try { fpsBadgeOn = new URLSearchParams(location.search).get('fps') === '1'; } catch(e){}
function fpsBadgeTick(now){
  if (!fpsBadgeOn) return;
  fpsBadgeRing.push(now);
  while (fpsBadgeRing.length && now - fpsBadgeRing[0] > 3000) fpsBadgeRing.shift();
  if (now < fpsBadgeNext) return;
  fpsBadgeNext = now + 500;
  if (!fpsBadgeEl){
    fpsBadgeEl = document.createElement('div');
    fpsBadgeEl.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);' +
      'z-index:99999;background:rgba(0,0,0,.72);color:#fff;font:700 15px/1.35 ui-monospace,monospace;' +
      'padding:8px 10px;border-radius:10px;pointer-events:none;white-space:pre;letter-spacing:.2px';
    document.body.appendChild(fpsBadgeEl);
  }
  // THE WORST FRAME OVER THE WINDOW — what a human calls «lagging»: the average FPS can
  // be excellent, while a single 200 ms frame is already visible as a jerk
  let worst = 0;
  for (let i = 1; i < fpsBadgeRing.length; i++){
    const d = fpsBadgeRing[i] - fpsBadgeRing[i-1];
    if (d > worst) worst = d;
  }
  const fps = fpsBadgeRing.length > 1
    ? Math.round(1000 * (fpsBadgeRing.length - 1) / (fpsBadgeRing[fpsBadgeRing.length-1] - fpsBadgeRing[0])) : 0;
  const step = stepRing.length ? (stepRing.reduce((a,b)=>a+b,0) / stepRing.length) : 0;
  fpsBadgeEl.textContent =
    'FPS ' + fps + '   worst frame ' + Math.round(worst) + ' ms\n' +
    'physics ' + step.toFixed(1) + ' ms   items ' + items.filter(i=>i.alive).length + '\n' +
    'lv.' + levelNum + '   DPR ' + (+renderer.getPixelRatio().toFixed(2)) +
    (intro ? '   (intro)' : '');
}
// ⚠️⚠️ AUTOMATIC FINAL ZOOM-IN AFTER THE ORBIT (the owner's word 2026-08-21-r: «in the
// bowl rotation animation, after the approach, add an automatic smooth zoom
// equal to the gradation of one press of the + button»).
// ⚠️ THE MAGNITUDE IS TAKEN FROM THE BUTTON ITSELF (`ZOOM_STEP`), IT IS NOT WRITTEN AS A NUMBER:
// «equal to the gradation of one press» is a requirement of MATCHING the button's step,
// and a copy of the number would diverge from it at the first edit of that step.
// ⚠️ THE FINAL ZOOM RUNS ON THE REAL CLOCK AND THROUGH rAF, not on game time: right
// after the intro the pile is still settling, the frame is heavy, and binding to the game clock
// would stretch the movement exactly where it is most noticeable.
// ⚠️ ANY PLAYER GESTURE CANCELS THE FINAL ZOOM: intercepting the camera from a finger is not allowed.
// The sign is a change of `camR` by somebody else; we compare with what we set ourselves.
let introZoomRAF = 0, introZoomWant = 0;
function introZoomStop(){ if (introZoomRAF) cancelAnimationFrame(introZoomRAF); introZoomRAF = 0; }
function introZoomStart(){
  introZoomStop();
  const step = (typeof ZOOM_STEP === 'number') ? ZOOM_STEP : 3.2;
  const from = camR, to = Math.max(CAM_R_MIN, from - step), t0 = performance.now(), durMs = 420;
  if (!(to < from)) return;
  let prev = from;
  const tick = () => {
    // the camera was touched from outside (drag, pinch, button) — we give way
    if (Math.abs(camR - prev) > 1e-4){ introZoomRAF = 0; return; }
    const k = Math.min(1, (performance.now() - t0) / durMs);
    const e = 1 - Math.pow(1 - k, 3);           // the same ease-out as the count-up of the score
    camR = from + (to - from) * e; prev = camR;
    updateCamera();
    introZoomRAF = k < 1 ? requestAnimationFrame(tick) : 0;
  };
  introZoomRAF = requestAnimationFrame(tick);
}

function finishIntro(){
  introPerfStop();
  waveReleaseAll();              // insurance: the orbit could have started before the queue                                     // pouring slice — BEFORE everything else
  try { Telemetry.screen.enter('game'); } catch(_){}   // from this moment the session is running
  // TO THE PLATFORM: the first PLAYABLE frame + the level start. GAME_READY used to
  // go out from Ads.init (before genLevel and the intro) — the platform removed its loader
  // over a black screen. LEVEL_STARTED on Poki/CrazyGames maps into the native
  // gameplayStart: without it the platform paces ads blindly. Both calls are
  // idempotent and silent outside bridge mode.
  try { Ads.gameReady(); Ads.msg('LEVEL_STARTED', { level: String(levelNum) }); } catch(_){}
  intro = null;
  document.documentElement.classList.add('introdone'); // the orbit is over — the showcase unfolds
  resetPointers();
  setFallCap(); // restore the live terminal speed
  // release the surprise (it was pinned to the bottom for the settling)
  const sp = items.find(i => i.surprise && i.body);
  if (sp) sp.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
  camAz = 0; camPhi = 0.45; camR = 16.2;
  updateCamera();
  introZoomStart();   // smooth final zoom by one «+» press (the owner's word 2026-08-21-r)
  stats.t0 = performance.now();
  stats.lastAction = performance.now();
  // a fresh 3-second forced-sleep budget AFTER the intro: wakeAtMs had stood since genLevel,
  // and the budget expired by the end of the intro — the forced sleep hit on the very first game frame
  wakeAtMs = performance.now(); calmT = 0;
  // ⚠️ DO NOT COMPUTE THE TRIM AND THE RADIUS BASE HERE: by the end of the orbit the pile may still
  // be falling (on weak machines — a lot); a trim over a flying column quietly removed
  // up to 16 items, and topY0 over it broke the dynamic radius. We wait for calm.
  pendingTrim = true;
  refreshAccessibility(); updateHUD();
}
// Fill finalization — STRICTLY over a settled pile (from loop when calm)
function finalizeFill(){
  // after the pairs are removed the pile MUST settle further: a trim over a sleeping pile left
  // frozen cavities (items hung above the holes from the removed twins)
  if (trimOverfill() > 0) wakePhysics('trim');
  let top0 = 0, aliveN = 0;
  // stones are not counted (spec 2026-07-22): the par score and the auto-pan threshold (20%)
  // are computed over the matchable mass
  for (const it of items) if (it.alive){ top0 = Math.max(top0, it.p.y + it.r); if (!it.surprise && !it.frozen) aliveN++; }
  level.topY0 = top0;
  level.aliveN0 = aliveN; // starting load — the 20% threshold for the camera auto-pan
  // par score (stars): the base = «everything matched in pairs without combos» BY TYPE and
  // WITH THE ACCUMULATION MULTIPLIERS TAKEN INTO ACCOUNT (the mandatory bundle (a) of the owner's spec
  // 2026-07-22: otherwise boosted types would make 2★/3★ automatically — the base
  // grows together with the price of matches, the thresholds stay skill-based). The surprise,
  // the bomb and the STONES are not part of pairs (they do not match; along the way the old skew of the
  // base by half a pair from the bomb went away). ⚠️ Stones were added 2026-07-22 following their
  // ⛔ The paragraph about stones was removed together with them (2026-08-17).
  // base by 20 points that the player cannot earn IN ANY WAY. From level 16
  // 1 stone, +1 every 5, cap 6 — up to 3 phantom pairs (60 points).
  // A META edit in a physics file — sanctioned by the dispatcher's task
  // (the balance table).
  const accPerType = {};
  for (const it of items) if (it.alive && !it.surprise && !it.bomb && !it.frozen)
    accPerType[it.type.name] = (accPerType[it.type.name] || 0) + 1;
  let accPar = 0;
  for (const k in accPerType) accPar += Math.floor(accPerType[k] / 2) * MATCH_SCORE * 2 * accMult(k);
  level.parBase = Math.round(accPar);
  refreshAccessibility(); updateHUD();
}
function tickIntro(dt){
  intro.t += dt;
  if (intro.phase === 'wait'){
    // We wait for the SECOND tick: by then the first frame with the empty bowl has already gone to the screen,
    // and «the game is ready» is not a lie. Sending earlier is forbidden for exactly the reason
    // written down in 78-ads: the platform would remove the loader over emptiness.
    if (!intro.readySent && intro.t > 0){
      intro.readySent = true;
      // THIS IS THE «THIRD POINT»: the level is generated, the bowl is drawn,
      // the items have not moved yet. GAME_READY here REMOVES the platform's curtain
      // (in the SDK the node is deleted synchronously inside the call — the INTEGRATION analysis),
      // that is, we do not guess the moment of removal, we APPOINT it.
      try { Ads.gameReady(); } catch(_){}
      // It always resolves: immediately on file:// and without an SDK, by game_ready,
      // by insurance, by a hard limit. This branch cannot wait forever.
      try {
        Ads.curtainGone.then(()=>{
          if (!(intro && intro.phase === 'wait')) return;
          // THE PROLOGUE COMIC for a new player — exactly here: the curtain is removed, the bowl
          // is empty, the items have not moved yet (86-story). If the prologue is not needed,
          // the callback is called right away and the fall starts as before.
          storyPrologue(()=>{ if (intro && intro.phase === 'wait'){ beginDrop(); } });
        });
      } catch(_){ beginDrop(); }
    }
    return;
  }
  if (intro.phase === 'drop'){
    // WAVES: we open the next layer by the REAL clock (see 50-physics).
    // ⚠️ The tick sits INSIDE the drop phase: in 'wait' physics does not step at all, and
    // releasing bodies there would mean piling them above the bowl behind the curtain.
    waveTick();
    // TO THE ORBIT EARLIER (the owner's spec: «speed up the transition»): we do not wait
    // for near-calm — the pile settles further already during the orbit (the shake-down in orbit
    // is gated by maxV<3, the trim waits for calm anyway through pendingTrim)
    // ⚠️ THE THRESHOLDS ARE TIGHTENED (0.8/1.4 -> 0.55/1.0): the pile settles during the orbit, and
    // the trim waits for calm anyway through pendingTrim — an early transition breaks
    // nothing, but removes the most noticeable pause «the items already lie there, and the camera
    // has not moved yet».
    if ((intro.t > INTRO_DROP_MIN && maxBodySpeed() < 3.5) || intro.t > INTRO_DROP_MAX){
      removeTempTallWall();
      intro.phase = 'orbit'; intro.t = 0;
    }
  } else {
    // ⚠️⚠️ THE WAVES TICK IN THE ORBIT TOO (dispatcher, acceptance #51, 2026-08-13).
    // THE MEASUREMENT THAT DEMANDED THIS: a tick only in 'drop' did not manage to hand out
    // the queue — the phase ends by `t > 0.8 && maxV < 3.5`, and with waves the pile at
    // the start is almost empty and the speeds are low, that is, the transition happens at the very
    // EARLIEST threshold. The remainder (up to ~100 bodies out of 182) was dumped by `waveReleaseAll`
    // in finishIntro ALL AT ONCE — the work moved BEYOND the intro window, in front of the player:
    // time to calm 5.9-6.0 s against 5.5 without waves (lv.11, CPU ×4), while
    // the intro-window metric honestly showed −51% and did not see this.
    // ⛔ This is exactly the canonical rake «the metric measures not what you name out loud»:
    // the measurement window ended where the edit had moved the load.
    // ⚠️ The orbit is a LAWFUL place for the top-up: the canon says outright «the pile settles already
    // during the orbit», and the shake-down here is gated by `maxV < 3` and does not hit a flying
    // column (its own rule «hitting a flying one is dangerous» is intact).
    waveTick();
    if (intro.shakes < 3 && intro.t > 0.1 + intro.shakes*0.3 && maxBodySpeed() < 3){
      intro.shakes++;
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top > FUNNEL.H - 0.4){
        for (const it of items){
          if (it.alive && it.body)
            impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
        }
      }
    }
    // ⚠️ THE ORBIT IS 0.65 s instead of 1.0 (the owner's word «speed up the turn around the bowl»).
    // The finish is still EXACTLY at 2π — otherwise the jerky last frame comes back.
    const k = Math.min(1, intro.t / INTRO_ORBIT_S);
    const e = k*k*(3 - 2*k); // smoothstep
    // the finish EXACTLY at 2π (≡ 0): the orbit used to end at 0.35+2π, while finishIntro
    // set 0 — a jump of ~20° in the last frame («it jerks» — the owner's bug)
    camAz = 0.35 + e*(Math.PI*2 - 0.35);
    camPhi = 1.25 + (0.45 - 1.25)*e; // from the side -> from above
    camR = 17.8 + (16.2 - 17.8)*e;
    updateCamera();
    if (k >= 1) finishIntro();
  }
}

// Physics sleep: at rest the integrator is OFF — the items lie absolutely
// still (the micro-tremor from the eternal fight of gravity against correction
// annoyed the owner). We wake up on any event that changes the mass.
let physAwake = true, calmT = 0, wakeAtMs = 0, vibT = 0;
const psLog = []; // diagnostics: the sleep/wake log {t, ev, src, v}
function wakePhysics(src){
  psLog.push({ t: Math.round(performance.now()), ev: 'wake', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  if (!physAwake) wakeAllBodies();
  physAwake = true; calmT = 0; wakeAtMs = performance.now();
}
function sleepPhysics(src){
  // a rescued item (teleported out of a wall) must SETTLE FURTHER — the sleep is cancelled,
  // otherwise we froze the item in mid-air at the new place; we will fall asleep at the next calm
  if (rescueSweep(true) > 0){ calmT = 0; return; }
  psLog.push({ t: Math.round(performance.now()), ev: 'sleep', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  physAwake = false; calmT = 0;
  sleepAllBodies();
  if (level) refreshAccessibility(); // final slice over the pile that fell asleep
}
// ⚠️⚠️ THE ONLY PLACE WHERE uResY IS WRITTEN. Whoever CHANGES THE BUFFER SIZE —
// IS OBLIGED to call resize(), otherwise the uniform goes stale. Earlier this was almost
// harmless (uResY fed only the uCombo/uGrind layers, and at rest they are zero),
// but since 2026-07-31 THE SKY BASE ITSELF depends on it (the layout of the stops across the screen),
// and a stale uResY cuts off the top of the palette. The trap was found by review: lowering
// the quality with applyPerfTier('low') calls setPixelRatio+setSize IN THE MIDDLE OF THE GAME and
// did not call resize() — a measurement at 400×800 DPR 1.5 gave the top of the frame as #42b9ff
// (the third stop) instead of #6e86ff (the first; ⛔ the hexes of the FORMER daytime palette, it was
// changed 2026-08-20-b — do not grep them as live), and so on until the end of the session, because on
// a phone the resize event may not happen at all.
// ⚠️ WHY THE FIX IS HERE AND NOT INSIDE applyPerfTier: that one is declared in 10-stage and
// is called there at startup (deviceLooksWeak) EARLIER than the initialization of skyMat —
// touching it from inside would fall into the TDZ. That is why resize() is called by the callers.
// ⛔⛔ HERE LIVED THE FORMULA FOR THE VIEW CORNER RADIUS (viewRadius, --view-r) —
// REMOVED ENTIRELY by the owner's word 2026-08-12 («drop the view rounding variant»).
// It lived less than a day; together with it the 3rd edition of the edges (the device
// theme) was removed too. The current 4th one is BLACK ALWAYS, statically, see shell.html.
// The formula was honest (measurement: 50/39/36/30 by screen share) — it was not the solution
// that turned out crooked, it was the very idea «the view as a card» that the owner rejected.
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  if (skyMat) skyMat.uniforms.uResY.value = renderer.domElement.height; // the sky base + the fever layers
}
addEventListener('resize', resize);

// SHOWCASE: THE WIDTH RULE INSTEAD OF CAMNEAR (the owner's spec 2026-07-27
// «on desktop and tablets do NOT hide the panel; we hide it only if the play
// field is left narrower than 2/3 of the screen — the panel takes 1/3»). Hiding by
// camera approach (camnear v1-v3: thresholds by the bowl, then the stable edge of
// the pile hullR) IS COMPLETELY CANCELLED — at any zoom the panel stays. Visibility
// is now PURE CSS: @media (min-width:813px) in shell.html (the threshold = 3×271px
// of the strip occupied by the panel, measurement 2026-07-27; if the panel width changes — re-
// measure). pointer:fine is removed — tablets see the panel too. There is no JS machinery.

// iOS/Android chrome (the About-Us method, the owner's order 2026-07-22): the iOS status bar /
// island is painted ONLY through meta theme-color (the page background is ignored
// there), the gesture zone at the bottom and the Android toolbar — by the html/body background.
// Without this the phone's dark theme draws black fields around the canvas.
// We paint with a PURE NEUTRAL BY THEME: light — white, dark — black.
// ⛔ A TOMBSTONE, TWO CANCELLATIONS IN A ROW — the header is read first, and it managed to lie
// twice: (1) «the tone of the TOP OF THE PANORAMA» — there are no panoramas since 2026-07-30, `05-sky.js`
// was deleted together with the background picture; (2) «the tone of the top sky stop» — matching
// the palette was CANCELLED by the owner 2026-08-10 («on the game one make it
// neutral too»). Matching the tone to the sky is no longer needed and MUST NOT be brought back.
// ⚠️ THE ONLY KNOB FOR CHANNEL DISTRIBUTION. false: the html/body background — the TOP
// stop, the meta — the BOTTOM one. A device screenshot will show the opposite — change it here.
// ⛔ The startup chromeSync call was removed together with the whole edge machinery (2026-08-14).

// PAUSE: we freeze the game entirely; all anchors ON THE CLOCK (the mixer timer,
// the combo/chain windows, t0, the forced sleep) are shifted on resume by the pause duration —
// the pause does not «eat» the idle time and does not extinguish the series
let paused = false, pausedAt = 0;
// The setTimeout tails of the game chains (match removal, grinding, finale) do NOT freeze
// with the pause: a callback that matured under the pause would finish removeItem/checkEnd —
// up to a victory on a frozen screen. Such callbacks are wrapped in
// afterPause: under the pause they are deferred into a queue, resumeGame drains them.
const pausedQueue = [];
function afterPause(fn){ if (paused) pausedQueue.push(fn); else fn(); }
// silent=true — A PAUSE WITHOUT THE POPUP (the INTEGRATION request 2026-07-23 for ads:
// the player must not come back from the clip into our pause card with the settings
// and close it by hand). RETURNS true only if the pause was set by EXACTLY
// THIS call — the caller is obliged to resume only its own pause: the tab could have gone
// hidden, then the pause was set by visibilitychange (90-input), and it is lifted
// ONLY by the player with the Continue button. An automatic resume on top of somebody else's pause
// would return the player into a live game that he did not resume.
function pauseGame(silent){
  // ⚠️⚠️ THE INTRO IS NO LONGER A REFUSAL (the owner's complaint 2026-08-12: «on pause the timer
  // does not stop and after a while the mixer starts working»).
  // The mechanics of the bug: on a refused pause the menu opened ANYWAY — its guard
  // can step back only before SOMEBODY ELSE'S pause (ads), and the case «could not set it
  // at all» was not foreseen. The player looks at the menu, the game under it
  // runs, the idle time ticks, and the mixer starts eating the pile. Measurement (Hard):
  // pause pressed in the intro → the menu is open, the pile 80 → 68 in 30 seconds.
  // ⚠️ THERE WERE TWO ENTRANCES INTO THE HOLE, and the second one explains the owner's «sometimes»: the pause
  // button in the intro (a window of ~9 s) AND the tab going into the background (90-input calls
  // openMainScreen on visibilitychange) — he minimized the phone during the pouring.
  // ⚠️ THE PAUSE FREEZES THE INTRO PURELY BY CONSTRUCTION: the `if (paused)` gate in
  // loop stands EARLIER than the tickIntro call, and the intro ticks on game time
  // (intro.t += dt) — on resume it continues from the same place. The resumeGame anchors
  // do not touch the intro: level.nextGrind in the intro equals 0 and is skipped.
  if (paused || !level || level.over) return false;
  paused = true; pausedAt = performance.now();
  // ⚠️ DO NOT write textContent into #eyes: this is the SVG construction of the character
  // (85-hud) — text would destroy the layers. The face simply freezes as a still frame.
  if (!silent) show('pauseOverlay');
  try { Ads.msg('LEVEL_PAUSED'); } catch(_){} // to the platform: gameplay has stopped (native gameplayStop)
  return true;
}
function resumeGame(){
  try { Telemetry.screen.enter('game'); } catch(e){} // leaving the menu — the pair to enter('menu') in openMainScreen
  if (!paused) return;
  const d = performance.now() - pausedAt;
  stats.t0 += d; stats.lastAction += d;
  if (level.nextGrind) level.nextGrind += d;
  wakeAtMs += d;
  if (comboUntil) comboUntil += d;
  if (missRadiusAt) missRadiusAt += d;   // the miss penalty — the same kind of real-time anchor
  if (chainUntil){ chainUntil += d; chainNextDrop += d; chainNextBolt += d; }
  if (lastMatchMs) lastMatchMs += d;
  // ⛔ Here the anchor of the fire at the eyes (`grindStartMs`) used to be shifted — removed together with the fire
  // 2026-08-20. ⚠️ THIS WAS AN ORPHANED REFERENCE: I removed the declaration and did not walk
  // through the consumers — `resumeGame` threw a ReferenceError on EVERY pause release,
  // and `node --check` and loading the game do not see that (the pause comes later).
  // The suite caught it; the canon rule «write out every removed declaration and grep
  // each one» exists exactly for such cases.
  if (chargeUntil) chargeUntil += d;   // review v212: the pause (ads/menu/tab)
                                       // does not eat the charge TTL — like all anchors;
                                       // spending it under the pause is impossible anyway
  lastT = performance.now(); // no giant dt on the first frame
  paused = false;
  try { Ads.msg('LEVEL_RESUMED'); } catch(_){} // to the platform: gameplay has resumed (native gameplayStart)
  // draining the deferred chains STRICTLY after paused=false (otherwise afterPause
  // would put them back into the queue) and after the anchors are shifted — the callbacks read the clock
  pausedQueue.splice(0).forEach(fn => { try { fn(); } catch(e){} });
  hide('pauseOverlay');
  updateHUD();
}
// ⚠️ DETECTING A WEAK DEVICE BY MEASUREMENT (the owner's spec 2026-07-29).
// We accumulate a window of REAL frames and look at the MEDIAN, not the average: a single one-second
// hitch (garbage collection, going to another tab) drags the average, the median — no.
// We count only when the game really draws a loaded scene: not in the intro
// and not on pause, otherwise we would measure an empty screen and consider the phone fast.
// Frames longer than PERF_OUTLIER_MS are thrown away — that is not render, that is the system.
let perfWin = [], perfWinStart = 0, perfDecided = false;
function tickPerfTier(ms){
  if (perfDecided || CFG.perfTier === 'low') { perfDecided = true; return; }
  if (intro || ms > PERF_OUTLIER_MS) return;   // the intro and system hitches do not count
  if (!perfWinStart) perfWinStart = performance.now();
  perfWin.push(ms);
  if (performance.now() - perfWinStart < PERF_WINDOW_MS || perfWin.length < PERF_MIN_SAMPLES) return;
  perfWin.sort((a,b) => a - b);
  const med = perfWin[perfWin.length >> 1];
  perfDecided = true;                       // we decide ONCE per session
  if (med > PERF_SLOW_FRAME_MS){
    applyPerfTier('low');
    resize();  // ⚠️ MANDATORY, see the comment at resize: lowering the quality
               // changes the buffer height, and uResY is written only by resize()
    console.warn('[perf] weak device: frame median ' + med.toFixed(1) + ' ms -> quality lowered');
  }
  perfWin = [];
}

// A BURNING ITEM (the owner's spec 2026-08-01: «1 item per 30 seconds may
// catch fire»). Once per FIRE_EVERY_MS ONE item flares up; it burns FIRE_BURN_MS
// and goes out by itself. Collected a group of this type — a bonus (the crediting is with the dispatcher,
// the seam — burningName in 70-fx).
// ⚠️ THE CLOCK RUNS ONLY IN A LIVE SESSION: in the intro, on pause and after the level ends
// the window does not accumulate — otherwise the player would come back from an ad to an instant flare-up,
// and over a long pause a «debt» of several would pile up.
// ⚠️ EXACTLY ONE BURNS: igniteItem itself extinguishes the previous one, and the next flare-up
// is scheduled from THE MOMENT OF THIS ONE, not from the moment the previous one burned out.
let fireNextMs = 0;
function tickFireSpawn(now){
  if (intro || paused || !level || level.over){ fireNextMs = 0; return; }
  if (!fireNextMs){ fireNextMs = now + FIRE_EVERY_MS; return; }  // the first countdown from the start of the session
  if (now < fireNextMs || burningName()) return;
  // ⚠️ ONLY WHAT IS COLLECTABLE BURNS (the owner's word 2026-08-05: «an object
  // catches fire only if it has at least one pair and it is within
  // reach for matching»). Two conditions, both mandatory:
  //  (1) ACCESSIBILITY — isAccessible (as before);
  //  (2) A REAL PAIR — there is ANOTHER live accessible item of the same kind,
  //      which the live radius reaches (pairMatch — the same function
  //      that decides a real tap, so the promise matches the game).
  // Otherwise a loner would burn that cannot be collected: the ×2 bonus is unreachable,
  // and the player sees an invitation and spends moves on it.
  const cand = [];
  const byKey = {};
  for (const it of items){
    if (!it.alive || !it.mesh || !it.type) continue;
    if (it.surprise || it.bomb || it.frozen) continue;     // special items do not burn
    if (it.animating || !isAccessible(it)) continue;     // fairness (works on Hard)
    (byKey[it.key] = byKey[it.key] || []).push(it);
  }
  for (const k in byKey){
    const arr = byKey[k];
    if (arr.length < 2) continue;                        // a loner does not burn
    for (const a of arr){
      if (arr.some(b => b !== a && pairMatch(a, b))) cand.push(a);
    }
  }
  if (!cand.length){ fireNextMs = now + 2000; return; }  // nothing to ignite — we try later
  // VISIBILITY: we take from the top ones, otherwise the flame drowns in the pile (see FIRE_TOP_N)
  cand.sort((a, b) => b.p.y - a.p.y);
  const top = cand.slice(0, Math.min(FIRE_TOP_N, cand.length));
  igniteItem(top[Math.floor(Math.random() * top.length)]);
  fireNextMs = now + FIRE_EVERY_MS;
}

function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  const rawMs = now - lastT;
  // FRAME CAP (live CFG.fpsCap=60, threshold 840/cap = 14 ms — see 00-config):
  // on 120 Hz phones we skip every second rAF tick BEFORE any
  // work. lastT does not move — dt honestly accumulates towards the next frame,
  // the simulation does not notice the cap (the fixed step is the same).
  // ⚠️ The threshold is DERIVED from the cap (840/cap), not a literal: headless cannot
  // release vsync, and a two-sided guard proves the mechanics with a cap of 30 on
  // ordinary 60 Hz (frames must become ~33 ms). 840/60 = exactly the live 14.
  if (CFG.fpsCap > 0 && rawMs < 840 / CFG.fpsCap) return;
  let dt = Math.min(0.033, rawMs/1000); lastT = now;
  // BOWL SHATTER: slow-mo (the owner's «yes!») — we slow down GAME time (physics,
  // fx, ticks on dt); the real clock (toasts, collection, HUD) is not touched
  if (now < slowmoUntil) dt *= BOWL_SLOWMO_K;
  if (paused){ renderer.render(scene, camera); return; } // a still frame (before the perf meter — the pause does not spoil the frame statistics)
  // ⚠️⚠️ THE MATCAP EDITOR FREEZES THE LEVEL CLOCK (the owner's word
  // 2026-08-17-e: «if the matcap editor is open, then we freeze the mixer timer»).
  // ⛔ SETTING A PAUSE IS FORBIDDEN — the whole point of the editor is to tweak the material
  // and look at it IN THE LIVE GAME. That is why the game runs, while the real-time anchors
  // MOVE TOGETHER WITH THE CLOCK: the remainder until grinding freezes at the value
  // it had at the moment of opening, and continues from it after closing.
  // ⚠️ THIS IS THE `resumeGame` TRICK, NOT «REFRESH lastAction» AS UNDER ADS:
  // a refresh would show the full period (the mixer does not eat either, but the timer
  // jumps to the maximum), whereas the owner asked to FREEZE.
  if (typeof mceIsOpen === 'function' && mceIsOpen() && stats && level && !level.over){
    stats.lastAction += rawMs;
    if (level.nextGrind) level.nextGrind += rawMs;
  }
  perfFrames++;
  if (perfFrames > 5){ // the first frames are the page warm-up, they do not go into the statistics
    frameRing.push(rawMs); if (frameRing.length > 600) frameRing.shift();
    fpsBadgeTick(now);          // on-screen counter by ?fps=1 (measurement FROM THE PHONE)
    if (rawMs > perfWorstMs) perfWorstMs = rawMs;
    // ⚠️⚠️ A BREAKDOWN OF THE WORST FRAME AS A WHOLE (A2). The p95/max of individual rings are
    // the maxima of DIFFERENT frames, and by them you cannot say what one
    // bad frame was made of. Here is a snapshot of ONE frame: all phases plus `outside` — the time
    // that is in NONE of my phases. This is not a rounding remainder: into it
    // go the browser's work (style/layout/composite — we have DOM juice drops
    // with CSS transitions), garbage collection and the rAF scheduler. Without this
    // column «a 107 ms frame» is indistinguishable: expensive in my code or outside.
    // ⚠️ The phases are taken from the PREVIOUS frame, and this is not an approximation:
    // rawMs = (the start of this frame) − (the start of the previous one) = the work of the PREVIOUS frame
    // + the browser + idling. Adding it to the phases of the CURRENT one would be a lie.
    if (_lastPh && rawMs > _wfRaw){
      _wfRaw = rawMs;
      _worstFrame = Object.assign({ raw: +rawMs.toFixed(1),
        outside: +(rawMs - _lastPh.work).toFixed(1) }, _lastPh);
    }
    tickPerfTier(rawMs);
  }
  if (intro) tickIntro(dt);
  try { chargeTick(); } catch(e){}   // dissolving of the type charge (80-gameplay, TTL 7 s)
  try { tickBowlCracks(now); } catch(e){} // the pulse of the crack telegraph at N-1
  tickFires();                       // fire along the silhouette (70-fx): drives time and extinguishes
  // the pulse of a READY ice block (the owner's word «it pulses, a tap is needed»): it breathes
  // with the shell scale; the item itself and its material are not touched
  for (const it of items) if (it.alive && it.frozen && it.iceShell)
    it.iceShell.scale.setScalar(it.frozenReady ? 1 + 0.06 * Math.sin(now * 0.008) : 1);
  tickIceBooms(now); // the crust scatter on the real clock (the pieces — a vertex shader)
  tickFireSpawn(now);                // the flare-up of a burning item (the owner's spec)
  // ⚠️ THE RESCUER OF STUCK REMOVALS (found by probes v218, the class is LATENT —
  // reproduced on v217 too): in a match the shrink animation and removeItem run on
  // PARALLEL timers (addFX + setTimeout→afterPause), and once in a while the tail
  // does not arrive — the items stay alive+animating FOREVER: half-shrunk
  // they hang in the pile, swallow the tap raycast, are unavailable to matches (the suite caught it as
  // «0 went away for a tap»). Modelled on the floor rescuer: insurance by DEADLINE — the life
  // of the animation ≤0.16s + a pause of 150ms, everything older than ANIM_RESCUE_MS is stuck —
  // we finish the removal with a warn. The root (why the tail does not arrive) — TODO to investigate.
  if (!paused){
    const nowA = performance.now();
    for (const it of items){
      if (it.alive && it.animating && it.animStartMs && nowA - it.animStartMs > ANIM_RESCUE_MS){
        console.warn('[anim-rescue] stuck removal finished off:', it.type && it.type.name);
        it.animStartMs = 0;
        try { removeItem(it); } catch(e){}
      }
    }
  }
  // THE SERIES WINDOW ALARM (tempo package): at the edge of the window — a dry tick once per 250 ms.
  // In turbo we do not tick (it has its own fever there), the visual channel is the eyes (Interface).
  {
    const nowT = performance.now();
    if (comboUntil > nowT && chainUntil <= nowT && !intro){
      const left = comboUntil - nowT;
      if (left < SERIES_TICK_FROM && nowT >= seriesNextTick){
        Sound.play('tick'); seriesNextTick = nowT + 250;
      }
    }
  }
  // in the curtain-wait phase physics STANDS STILL — otherwise the pile would pour down under the splash
  if (physAwake && !(intro && intro.phase === 'wait')){
    // in the intro physics is sped up: the bowl fills 30% faster (the owner's
    // spec), while the camera runs on real time — the orbit is unchanged
    stepPhysics(intro ? dt * INTRO_TIME_SCALE : dt);
    if (perfFrames > 5){
      _pushRing(stepRing, stepMsLast);
      _pushRing(solveRing, stepSolveMs); _pushRing(syncRing, stepSyncMs); _pushRing(subRing, stepSubsteps);
      _phStep = stepMsLast; _phSolve = stepSolveMs; _phSync = stepSyncMs; _phSub = stepSubsteps;
    }
    const maxV = maxBodySpeed();
    const noAnim = !items.some(i=>i.alive && i.animating);
    // calm: body speeds are small, there are no animations — we freeze until the next
    // event. NOT in the intro: a moment of silence between the layers of the pouring column is
    // not calm yet, sleep would freeze the settling (and the intro shake-down does not wake physics)
    if (!intro && maxV < 0.25 && noAnim){
      calmT += dt;
      if (calmT > 0.4) sleepPhysics('calm');
    } else calmT = 0;
    // the slow rolling of round shapes can last long — after 3 s
    // of being awake we put it to sleep forcibly. ⚠️ ONLY AT NEAR-CALM and NOT in
    // the intro: a forced sleep by pure clock froze the column falling at v≈17
    // (items hanging in the air — the owner's bug); rolling out is v<2
    if (!intro && maxV < 2.0 && noAnim && now - wakeAtMs > 3000) sleepPhysics('force3s');
  }
  // deferred fill finalization: as soon as the pile has settled after the intro
  if (pendingTrim && !intro && (!physAwake || maxBodySpeed() < 1.0)){
    pendingTrim = false;
    finalizeFill();
  }
  const _tFx = performance.now();
  stepFX(dt);
  const _tUi = performance.now();
  if (perfFrames > 5){ _phFx = _tUi - _tFx; _phBuild = fxBuildTake(); const _tm = tapMsTake();
    _phTap = _tm; _pushRing(fxRing, _phFx); _pushRing(buildRing, _phBuild); _pushRing(tapRing, _tm);
    // ⚠️ we keep the phases from the LAST REAL tap: overwriting them every
    // frame wiped them with zeros from frames without a tap, and the breakdown read
    // as «pick 0 + candidates 0 + ghost 0» with a non-zero total
    const _ph = tapPhasesTake(_tm); if (_tm > 0) _tapPh = _ph; }
  tickVeil(dt);
  tickDepthTint(dt); // GRAPHICS: the top of the pile for depth tinting (10-stage)
  tickFace(now); // INTERFACE: the eyes character (emotion+gaze+pupil as the turbo indicator); replaced tickChainBar
  tickCamFollow(dt);
  tickHintFly(); // the camera flight to the hint (90-input), interrupted by a gesture
  tickZoomAnim(); // smooth zoom by buttons (90-input), a gesture cancels it
  tickZoomHold(); // continuous zoom by holding (90-input) // the camera lowers itself after the pile as it is taken apart (90-input, the owner's spec)
  // the combo boost must go out on a SLEEPING pile too (refresh does not tick at calm,
  // and the tap reads CFG.matchRadius directly — a stuck boost would be a cheat)
  if (comboUntil && now > comboUntil){
    comboUntil = 0; comboCount = 0; comboLevel = 0;
    updateMatchRadius(); updateHUD();
  }
  // THE RADIUS PENALTY FOR A MISS CRAWLS BACK ON THE REAL CLOCK — we tick it here for
  // the same reason the combo boost goes out here: `refreshAccessibility`
  // does not work at calm, and the tap reads `CFG.matchRadius` directly. Missed,
  // froze for five seconds, tapped — the radius must already be restored.
  if (missRadiusTick(now)) updateHUD();
  // chain reaction: top-up by tick; goes out by timer / chainMissesLimit() (Easy 4, Hard 3)
  // by misses / by the finale-end (pairs must not be poured into the mixer finale — it would be interrupted)
  if (chainUntil){
    if (level.over || now > chainUntil || stats.misses - chainStartMisses >= chainMissesLimit() || !hasAnyPair()){
      chainUntil = 0; comboCount = 0; chainSeries = 0; chainCarry = 0;
      updateMatchRadius(); updateHUD();
    } else if (now >= chainNextDrop){
      chainNextDrop = now + CHAIN_DROP_MS;
      // THE TOP-UP WINDOW — only the first CHAIN_DROP_WINDOW_MS of the chain (the owner's spec
      // 2026-07-31 «everything fits into 3 seconds»): we restore the chain start
      // from chainUntil (the single source, the pause shifts move it themselves)
      if (now < chainUntil - CHAIN_MS + CHAIN_DROP_WINDOW_MS) chainRefill();
    }
    // ambient crackle: short arcs between the top items.
    // ⚠️ DENSER (the owner's spec 2026-07-28 «more small lightnings»): the tick is more frequent and
    // several SHORT discharges are released per tick. The expensive part of the tick is
    // filter+sort over the whole pile, so it is done ONCE, while the discharges take
    // pairs from the already prepared list (tripling the tick itself would have been three times as expensive).
    if (chainUntil && now >= chainNextBolt){
      chainNextBolt = now + BOLT_TICK_MS + Math.random()*BOLT_TICK_JIT;
      const topmost = items.filter(i => i.alive && !i.animating).sort((a,b) => b.p.y - a.p.y).slice(0, 24);
      if (topmost.length > 3){
        for (let n = 0; n < BOLT_PER_TICK; n++){
          // up to 3 attempts to find a CLOSE pair: earlier an unlucky draw extinguished
          // the whole tick and the crackle stuttered
          for (let att = 0; att < 3; att++){
            const a0 = topmost[Math.floor(Math.random()*topmost.length)];
            const b0 = topmost[Math.floor(Math.random()*topmost.length)];
            if (a0 !== b0 && a0.p.distanceTo(b0.p) < BOLT_MAX_D){ boltFX(a0.p, b0.p); break; }
          }
        }
      }
    }
  }
  // background fever: the bottom of the sky fills with red (stronger in the chain reaction)
  if (skyMat){
    // THE STARS CLOCK. ⚠️ WE ACCUMULATE dt instead of taking performance.now(): dt in the game is CLAMPED,
    // so on pause, when the tab goes away and on a frame drop the blinking does not
    // «jump» forward — otherwise after coming back the whole sky would blink at once.
    // ⚠️ AND WITHOUT A NIGHT GATE: the uniform accumulates always, while the stars branch by day is not
    // executed at all (uStars = 0) — branching here is more expensive than an addition.
    skyMat.uniforms.uTime.value += dt;
    // the background warm-up grows with the length of the series: the closer the chain — the denser the green
    const target = chainUntil ? 1 : (comboUntil > now ? 0.3 + 0.5 * Math.min(1, comboCount / chainComboAt()) : 0);
    const cur = skyMat.uniforms.uCombo.value, stepK = dt / 0.35;
    skyMat.uniforms.uCombo.value = cur < target ? Math.min(target, cur + stepK) : Math.max(target, cur - stepK);
  }
  // ticks on the real clock (not on dt): at a low FPS the deadlock/mixer detection
  // does not stretch. AT CALM accessibility is not recomputed at all —
  // the items are motionless, it cannot change (perf: refresh ~tens of ms)
  // ⚠️ MORE OFTEN BUT SMALLER: 100 ms over 1/8 of the pile instead of 300 ms over the whole one — the total
  // work is the same, the full cycle is 0.8 s, but the frame no longer gets stuck at 80-90 ms
  // (measurement Hard: p95 104.6 -> see the canon section). The full pass stays on
  // player events, here it is a background re-evaluation of the settled pile.
  if (physAwake && now - lastAccMs > 100){ lastAccMs = now; refreshAccessibility(true); }
  // mixer: the final clean-up of the leftovers without pairs; otherwise — the punishment for idling
  let grinding = false;
  if (!level.over && !intro){
    const anyAlive = items.some(i=>i.alive);
    const idle = (now - stats.lastAction)/1000;
    // THE FINAL PAIR TOP-UP — BEFORE grinding the leftovers (see 40-items): on
    // the first frame of a REAL finale the orphans get partners, hasAnyPair
    // comes alive, and the grinding branch below does not switch on.
    // ⚠️ NO ANIMATIONS IN THE FRAME — a mandatory condition (caught by a run):
    // in a merge the items are «alive but animating», and when the last pair of a type
    // merges, for an instant «there are no pairs» while the others are alive — the refill fired
    // IN THE MIDDLE of the level, burning the single charge and pouring in extra; on
    // a real finale the orphan was then silently eaten by finaleGrind.
    const finaleAnimBusy = items.some(i => i.alive && i.animating);
    if (anyAlive && !hasAnyPair() && !level.finalRefillDone && !finaleAnimBusy) finalPairsRefill();
    // ⚠️ GRINDING DOES NOT OUTRUN THE REFILL (caught by a guard): on a «dirty» frame
    // (the last pair is still in the merge animation) the refill passes by its own
    // anim gate, while grinding without a gate ate the orphan before the top-up. While the refill
    // is not spent — the final grinding waits for the same clean frame; after it is
    // spent (or the top-up came out empty) it eats as before, on any frames.
    if (anyAlive && !hasAnyPair() && (level.finalRefillDone || !finaleAnimBusy)){
      grinding = true;
      // THE FINALE IS FASTER (the owner's word 2026-08-05: «the blender must grind the remaining
      // objects faster»): the period 500 -> 220 ms. This is the TAIL of the
      // level without points — the speed-up more than halves the wait and does not
      // touch the PUNITIVE grinding (MIXER_PERIOD), which has its own price.
      if (now >= level.nextGrind){ level.nextGrind = now + FINALE_GRIND_MS; finaleGrind(); }
    } else if (anyAlive && hasAnyPair() && (idle > level.idleLimit || level.deadlock)){
      // ⚠️ hasAnyPair() in the condition is a closed SIDE DOOR (caught by the top-up
      // guard): in the finale of a «dirty» frame the first branch passed, and the orphan
      // was eaten by THIS grinding — although its meaning (punishing idling / taking the pile apart
      // down to a pair) exists only WHEN there are live pairs; the finale is entirely led
      // by the branch above (refill, then finaleGrind).
      // idle>idleLimit — the punishment for idling; level.deadlock — THE DEADLOCK RESCUE
      // (no reachable pairs + no shakes, set in the 600-ms tick below):
      // grinding takes the pile apart until a reachable pair appears, INSTEAD of the defeat
      // screen (the owner's decision 2026-07-27 «grinding = a penalty, not death»).
      grinding = true;
      if (now >= level.nextGrind){
        level.nextGrind = now + MIXER_PERIOD*1000;
        mixerGrind();
      }
    }
  }
  // ⛔⛔ THE RED-TOP DRIVER IS REMOVED (the owner's word 2026-08-20 «remove the change of the
  // background at the top (the reddening) when the mixer gets angry»). Here lived THE THREAT
  // LADDER: target 1.0 while the blades are running, otherwise growth by timer over
  // `GRIND_LEAD` seconds before the grinding, fading down faster than the rise.
  // ⚠️ THE GRINDING MECHANIC ITSELF IS INTACT — only its BACKGROUND display was removed. The threat
  // is still visible through the angry eyes, the countdown under them and the blades.
  // blades: they stand still while the mixer is not working (idle spinning annoyed the owner)
  mixerSpeed += ((grinding ? 14 : 0) - mixerSpeed) * Math.min(1, dt*3);
  mixerBlades.rotation.y += mixerSpeed * dt;
  // a working mixer VIBRATES the mass: light impulses to the lower layers
  if (grinding){
    if (!physAwake) wakePhysics('grind');
    wakeAtMs = now; // while grinding we do not fall asleep forcibly
    vibT += dt;
    if (vibT > 0.12){
      vibT = 0;
      for (const it of items){
        if (!it.alive || it.animating || !it.body) continue;
        if (it.p.y < FLOOR_REST + 2.2){
          const wk = it.shakeK || 1; // weight: the mixer vibration is per pack too
          impulseBody(it, (Math.random()-0.5)*0.4*wk, Math.random()*0.3*wk, (Math.random()-0.5)*0.4*wk);
        }
      }
    }
  }
  // THE COUNTDOWN TO GRINDING — EVERY FRAME (the owner's complaint: «the timer under the eyes
  // lags behind and jerks»): in the 600-ms HUD tick the second boundary slipped through
  // and the number changed unevenly. grinding has already been computed above; we touch the DOM
  // only on a CHANGE of the text — redrawing the SVG outline is not free.
  {
    let txt = '';
    if (!intro && !level.over && items.some(i => i.alive)){
      const idleS = (now - stats.lastAction) / 1000;
      // while the blades are working — EMPTY (the owner's spec 2026-07-31 from a screenshot:
      // «remove that word, it is clear anyway that grinding is going on» — the angry eyes and
      // the blades already say everything; this CANCELS the former «instead of a red 0 the owner's
      // word»); both the number and the word are always black with a white outline (CSS)
      txt = grinding ? '' : String(Math.max(0, Math.ceil(level.idleLimit - idleS)));
    }
    // ⛔ Here stood the ladder of the fire at the eyes (3 s of continuous grinding → a crown
    // of flame + the lowering of the construction). Removed by the owner's word 2026-08-20.
    // The grinding escalation is still carried by the ANGRY EYES, the countdown under them and the
    // spun-up blades themselves — the signal has not disappeared, two of its representations have.
    // ⛔ HERE STOOD «the red sky ladder (uGrind)» — IT WAS REMOVED THE SAME DAY,
    // as the second item of the same owner's word; do not look for the layer, it does not exist.
    if (txt !== lastMtText){
      lastMtText = txt;
      if (!txt){
        $('mixerTimerSvg').style.display = 'none';
      } else {
        const mt = $('mixerTimer');
        mt.textContent = txt;
        mt.classList.toggle('grind', txt === 'Grinding');
        $('mixerTimerSvg').style.display = 'block';
      }
    }
  }
  if (now - lastHudMs > 600){
    lastHudMs = now;
    updateEyes(now, grinding);
    const ap = availablePairs();
    $('apCount').textContent = ap;
    const alive = items.some(i=>i.alive);
    // ⚠️⚠️ UNDER THE RADIUS PENALTY «THERE ARE NO PAIRS» MEANS NOTHING. Found by reconnaissance
    // BEFORE the edit, not by a run: `ap` feeds the deadlock detector and the free
    // auto-shake, and TWO stable ticks (~1.2 s) are enough for both — while the penalty for
    // a miss lives 3 s. That is, the player would miss, the radius would drop, the pairs would
    // «disappear», and the game itself would declare a deadlock and start grinding the pile for points —
    // the punishment for a miss would turn into points being written off by grinding.
    // The penalty is TEMPORARY and SELF-CLEARING, by its meaning it cannot be a deadlock.
    const radiusPenalty = missRadiusActive(now);
    const noMoves = alive && ap === 0 && !level.over && !radiusPenalty;
    const idle = (now - stats.lastAction)/1000;
    // The red banner is DELETED (the owner's spec 2026-07-19): the whole communication
    // is carried by the timer chip in the top-left group — the backing floats from green
    // to red as the time runs out; while grinding — a red «0 s»
    const finale = alive && !hasAnyPair();
    // (the countdown to grinding MOVED into the per-frame block below — in the 600-ms tick
    // the seconds were updated sometimes after 0.6 s, sometimes after 1.2 s: «the timer lags
    // and jerks», the owner's complaint 2026-07-21)
    // DEADLOCK → THE RESCUE GRINDING, NOT A DEFEAT (the owner's decision 2026-07-27
    // «grinding = a penalty, not death»): there are pairs, but they are unreachable, and there are no shakes —
    // we wait for 2 stable checks (~1.2 s, so that the mass settles; in the finale and while
    // moving it does not fire), then we set level.deadlock → the per-frame gate
    // above drives mixerGrind, taking the pile apart until a reachable pair appears.
    // The price of the rescue is points (−20/grinding), and it also affects the leaderboard. The defeat
    // screen (showLose) is no longer called from a deadlock; the UI is alive for the future.
    // ⚠️ A PURCHASED STOCK OF SHAKES = AGENCY: while it exists there is NO deadlock —
    // the player has something to sort it out with, and the rescue grinding (it costs points) must not
    // switch on instead of him. The condition was extended together with the introduction of bundles.
    // ⚠️ AND A SHAKE FOR AN AD IS AGENCY TOO (the owner's word 2026-08-01:
    // «a shake for an ad counts as a way out»): while adShakes>0 the deadlock is not
    // declared. Right now adShakes=∞ → the deadlock branch is effectively in reserve
    // (in case of platforms without rewarded ads / with ads disabled); the pile while idling
    // is taken apart by the ordinary idle grinding anyway — there is no eternal standstill.
    // A FREE AUTO-SHAKE (the testers' request «otherwise it feels like they are
    // extorting shakes for ads» + the owner's condition 2026-08-02 verbatim:
    // «only on the condition that the objects are far from each other and it is impossible
    // to join them»): pairs by type EXIST (not a finale), joinable ones do NOT (noMoves),
    // the free and purchased shakes have run out — earlier only the «for an ad» button
    // was waiting for the player here (adShakes are unlimited and are NOT checked —
    // that is the essence of the complaint). Once per level, 2 stable ticks (~1.2 s)
    // for the mass to settle — as with the deadlock detector below.
    if (noMoves && !finale && !level.autoShakeUsed && level.shakes === 0 &&
        purchasedShakes() === 0 && !items.some(i=>i.alive && i.animating)){
      level.autoStuck = (level.autoStuck || 0) + 1;
      if (level.autoStuck >= 2){
        level.autoShakeUsed = true; level.autoStuck = 0;
        stats.autoShakes = (stats.autoShakes || 0) + 1;
        toast('Free shake');
        performShake(); updateHUD();
        Telemetry.ev('auto_shake', { lv: levelNum });
      }
    } else if (level.autoStuck) level.autoStuck = 0;
    if (noMoves && !finale && level.shakes === 0 && purchasedShakes() === 0 &&
        !(level.adShakes > 0) && !items.some(i=>i.alive && i.animating)){
      level.stuck++;
      if (level.stuck >= 2) level.deadlock = true;
    } else {
      level.stuck = Math.min(level.stuck, 0);
      // agency is back (a reachable pair / shakes appeared) — the deadlock is lifted,
      // the rescue grinding stops. We do NOT lift it by items animating: the grinding itself
      // animates the items, otherwise the flag would collapse on the very first turn of the blades.
      // ⚠️ WE RESET lastAction ON THE deadlock→lifted TRANSITION: the grinding could have been running longer than
      // idleLimit (stats.lastAction froze), and without the reset the idle grinding would KEEP GNAWING the pile
      // after a pair appeared (idle is still > idleLimit), until the player taps — we give
      // a fresh countdown, so that the rescue stops EXACTLY when a reachable pair appears.
      if (level.deadlock && (ap > 0 || level.shakes > 0 || purchasedShakes() > 0)){
        level.deadlock = false;
        stats.lastAction = now;
      }
    }
    // the session time (BLACK — the owner's spec 2026-07-21, it was the green of the mockup);
    // the countdown to grinding is a separate number under the eyes
    if (LEVEL_TIME_IN_HUD && !level.over) $('timer').textContent = fmtTime(Math.round((now-stats.t0)/1000)); // the hidden timer does not need fitStat either
  }
  // the glass DISSOLVES as the camera approaches (the owner's spec: up close
  // the bowl is not needed and gets in the way of matching): full density at camR>=13.5,
  // it melts completely by camR<=10 (smoothstep)
  if (bowlMat){
    const gk = Math.max(0, Math.min(1, (camR - 10) / 3.5));
    const k = gk * gk * (3 - 2 * gk);
    bowlMat.uniforms.uFade.value = k;   // the glass is a ShaderMaterial (20-arena)
    // ⚠️ AND WE DO NOT SHOW A BROKEN ONE: after the shatter ONLY the shards are left
    // of the bowl (the owner's word). Visibility is owned by this loop, so the gate
    // stands here and not in 20-arena — otherwise it would live for a single frame.
    bowlMesh.visible = (k > 0.02 && !bowlBroken)
  }
  // we redraw the shadows only when something is moving (the light is static; at calm
  // we save ~150 shadow draw calls every frame)
  renderer.shadowMap.needsUpdate = physAwake || !!intro || mixerSpeed > 0.01 || fx.length > 0;
  if (camShake > 0){
    camShake -= dt;
    updateCamera();
    camera.position.x += (Math.random()-0.5)*camShake*0.8;
    camera.position.y += (Math.random()-0.5)*camShake*0.8;
  }
  // ⚠️ ui = EVERYTHING between stepFX and the render (veil/depth tint/eyes/camera/HUD).
  // We measure it here and not piece by piece: the goal of the breakdown is to find THE MAIN eater, not
  // to itemize the eyes tick down to a microsecond. Should it need splitting — we split it then.
  if (perfFrames > 5){ _phUi = performance.now() - _tUi; _pushRing(uiRing, _phUi); }
  const _tRen = performance.now();
  renderer.render(scene, camera);
  // ⚠️ THIS IS NOT GPU TIME. renderer.render hands over the commands and returns; the real
  // work of the video chip is asynchronous and does not get here. The number honestly catches THE SCENE
  // TRAVERSAL AND THE DRIVER CALLS (draw calls, uploading particle buffers) — on mobile
  // that is the main CPU tax of rendering. A real GPU timeline is not given by headless;
  // for it a real phone is needed.
  if (perfFrames > 5){
    _phRen = performance.now() - _tRen;
    _pushRing(renRing, _phRen);
    // the phases of THIS frame — the next one will read them, when it learns its own rawMs
    _lastPh = { work: +(performance.now() - now).toFixed(1), step: +_phStep.toFixed(1),
      solve: +_phSolve.toFixed(1), sync: +_phSync.toFixed(1), sub: _phSub,
      fx: +_phFx.toFixed(1), build: +_phBuild.toFixed(1), tap: +_phTap.toFixed(1),
      ui: +_phUi.toFixed(1), ren: +_phRen.toFixed(1) };
    if (_lastPh.build > _wbBuild){ _wbBuild = _lastPh.build; _worstBuildFrame = Object.assign({}, _lastPh); }
    _phStep = _phSolve = _phSync = _phSub = _phFx = _phBuild = _phTap = _phUi = _phRen = 0;
  }
}

// ---------- Debug API ----------
// ⚠️ THE PIXEL WHERE THE ITEM IS THE FIRST RAY INTERSECTION (shared by findByTex and
// bestTapTarget; for tests only). The projection of the CENTRE IS NOT SUITABLE for a click:
// the centre is sometimes covered by a neighbour, and the test hits the wrong item. The history of this
// rake was written twice: the flake report v76 (a click on the centre landed on the
// occluding item, «−20» instead of «+120») and the flake v157 (a new cap assert
// clicked on the centre of a group, accidentally hit the BOMB and detonated it BEFORE the bomb
// section — three bomb asserts failed every other time). We try the centre and 8 offsets along
// the camera's screen axes by 0.55·r; if none fit — the item is completely covered.
function pickCtx(){
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
  return { meshes: aliveMeshes(), rc: new THREE.Raycaster(), right, up };
}
function visiblePixel(it, ctx){
  for (let k = 0; k < 9; k++){
    const wp = it.p.clone();
    if (k > 0){
      const a = (k - 1)/8*Math.PI*2, d = it.r * 0.55;
      wp.add(ctx.right.clone().multiplyScalar(Math.cos(a)*d))
        .add(ctx.up.clone().multiplyScalar(Math.sin(a)*d));
    }
    const sp = wp.project(camera);
    // ⚠️ WE CHECK BY THE ROUNDED PIXEL, not by the raw projection: the test clicks with
    // WHOLE coordinates, while the offset probes lie right at the silhouette — rounding
    // by half a pixel threw the ray onto a neighbour. Measurement: 5 discrepancies «promised
    // n, less went away» out of 14 taps; after checking by the rounded one — 0.
    const px = Math.round((sp.x + 1)/2*innerWidth), py = Math.round((-sp.y + 1)/2*innerHeight);
    ctx.rc.setFromCamera({ x: px/innerWidth*2 - 1, y: -(py/innerHeight*2 - 1) }, camera);
    const hits = ctx.rc.intersectObjects(ctx.meshes, false);
    if (hits.length && hits[0].object.userData.item === it) return { px, py };
  }
  return null;
}
window.__game = {
  alive(){ return items.filter(i=>i.alive).length; },
  availablePairs,
  autoMatch(){
    stats.lastAction = performance.now(); // a bench match = a player action:
    // otherwise long bot runs «idled» for the idle grinding, and it ate the pile
    // in parallel (in the live game the tap updates lastAction itself)
    refreshAccessibility();
    const byKey = {};
    for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key]=byKey[it.key]||[]).push(it);
    for (const k in byKey){
      const arr = byKey[k];
      for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
        if (pairMatch(arr[i], arr[j])){ doMatch([arr[i], arr[j]]); return true; }
      }
    }
    return false;
  },
  shake: performShake,
  penalizeTest(){ penalize(null, 10, 10); }, // test: a miss through the single penalty point
  multToastTest(name, mult){ showMultToast(name || 'T0', mult || 2); }, // test: the multiplier toast through the single point
  hintShow(){ showHint(); },                 // test/bench: the honest path of the hint button
  hintLast(){ return hintLastPick; },        // test: the self-report of the last pick (read-only)
  // ⚠️ THE NAME IS KEPT APART FROM THE PHYSICS itemsBrief (catch 2026-08-05): in the
  // __game object there were TWO itemsBrief keys, the last definition won —
  // my fields (x/z/acc/key) silently did not exist, the guard read undefined and
  // produced plausible zeros. Geometry is here, physics diagnostics is there.
  // ⚠️ THE `vy` FIELD WAS ADDED 2026-08-21-d FOR THE SAKE OF THE TOP-UP GUARD: without it
  // «the item starts with a downward speed» is observable by nothing — `awake().maxV`
  // gives the MAXIMUM over the whole pile and is polluted by somebody else's movement, while per-item
  // speeds were given outside by nobody. It is read straight from the body, there is no copy.
  itemsGeo(){ return items.filter(i => i.alive).map(i => { const v = i.body && i.body.linvel && i.body.linvel();
    return { key: String(i.key), name: (i.type && i.type.name) || '', x: +i.p.x.toFixed(2), y: +i.p.y.toFixed(2), z: +i.p.z.toFixed(2), r: +i.r.toFixed(3), acc: !!i.accessible, vy: v ? +v.y.toFixed(2) : null }; }); },

  // test: eat one ORDINARY item (an orphan for the final top-up guard).
  // In the live game orphans are created by the bomb (an odd number of neighbours blown up); the handle reproduces
  // the FACT of an orphan, while the guard checks the BEHAVIOUR after the fact — the top-up itself.
  killOneTest(kind){
    const pred = kind === 'surprise' ? (i => i.alive && i.surprise)
               : kind === 'bomb'     ? (i => i.alive && i.bomb)
                                     : (i => i.alive && !i.bomb && !i.surprise && !i.frozen);
    const it = items.find(pred);
    if (it) removeItem(it);
    return items.filter(i => i.alive).length;
  },
  requestShake: requestShake, // test: the REAL shake path with accounting (free -> purchased -> ad)
  cfg: CFG,
  regen: genLevel,
  // debug tuner of the matcap presets (10-stage): sliders on top of the HUD, live
  // application, printing the values with the Copy button. A repeated call closes it.
  matcapTuner,
  matcapPresets(){ return JSON.parse(JSON.stringify(MATCAP_PRESETS)); },
  // the strength of a pack's matcap: 0 — as it was, 1 — the library one at full strength
  packMatcapLoad(pack, src, opts){ return packMatcapLoad(pack, src, opts); },
  packMatcapGain(pack, g){
    if (g == null) return JSON.parse(JSON.stringify(PACK_MATCAP_GAIN));
    PACK_MATCAP_GAIN[pack] = g; return packMatcapApply(pack, PACK_MATCAP_MIX[pack]); },
  // whether two packs share ONE PICTURE: a weight assert stands on it (a second identical
  // base64 in the build is invisible to the eye and costs 54 KB)
  packMatcapSrcShared(a, b){ return PACK_MATCAP_SRC[a] === PACK_MATCAP_SRC[b] && !!PACK_MATCAP_SRC[a]; },
  packMatcapContrast(pack, c){
    if (c == null) return JSON.parse(JSON.stringify(PACK_MATCAP_CONTRAST));
    PACK_MATCAP_CONTRAST[pack] = c; return packMatcapApply(pack, PACK_MATCAP_MIX[pack]); },
  packMatcapMix(pack, k){
    if (k == null) return JSON.parse(JSON.stringify(PACK_MATCAP_MIX));
    return packMatcapApply(pack, Math.max(0, Math.min(1, k)));
  },
  // veil measurement: set it on ALL live items at once. It is needed exactly this way — so as to
  // compare the shader cost on ONE AND THE SAME scene (the share of inaccessible ones
  // wanders 121-136 from seed to seed, and any honest delta measurement drowns in that noise)
  veilAll: veilAllItems,
  // GRAPHICS DEBUG (the price of transparency + the price of switching complexity on the fly,
  // 2026-07-29): a flip of material.transparent on ALL live items. It returns
  // the ms of the flip itself + the first frame — and that is the price of recompilation (transparent
  // is part of the three program key through `#define OPAQUE`).
  // MEASURED: the 1st flip of 183 materials — 34 ms (compiling the second variant),
  // each next one 1.2-1.6 ms (both programs are already in the three cache). That is why
  // «the complexity is applied from the next level» is a removable limitation.
  // The price of transparency is measured by it too, with a paired alternating measurement (see WORKSTREAMS).
  setItemsTransparent(on){
    const t0 = performance.now();
    let n = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const m = it.mesh.material;
      if (!m || m.transparent === !!on) continue;
      m.transparent = !!on;
      m.opacity = on ? VEIL_ALPHA : 1;
      m.needsUpdate = true; n++;
    }
    renderer.render(scene, camera);          // we force the compilation here and not in the tick
    return { flipped: n, ms: +(performance.now() - t0).toFixed(1) };
  },
  // GRAPHICS DEBUG (picking the veil tone, the owner's spec «light blue, not grey»):
  // change the tone/lightness/lift on a LIVE scene without a rebuild. uVeilCol and
  // uVeilTune are SHARED uniforms (10-stage), so an edit is immediately visible to everyone.
  // Left permanent (like matcapTuner): the tone is the owner's taste decision,
  // and he has already come back to it twice; rebuilding the build for every shade
  // is not needed, and a contact sheet of variants is taken in one run.
  veilTune(hex, light, lift){
    if (hex != null) uVeilCol.value.setHex(hex).convertSRGBToLinear();
    if (light != null) uVeilTune.value.x = light;
    if (lift != null) uVeilTune.value.y = lift;
    return { hex: '#' + (hex == null ? 0 : hex).toString(16), light: uVeilTune.value.x, lift: uVeilTune.value.y };
  },
  // GRAPHICS DEBUG: the layout of the sky stops on a live scene — 'screen' (like
  // the owner's CSS gradient) or 'view' (by the height of the gaze). Needed for an A/B without
  // a rebuild: the difference between the modes IS VISIBLE ONLY ON A SCREENSHOT, it cannot be
  // conveyed in numbers, and the decision about the layout is the owner's. The default is SKY_MAP.
  skyMap(mode){
    if (skyMat && mode != null) skyMat.uniforms.uSkyMap.value = mode === 'view' ? 0 : 1;
    return skyMat ? (skyMat.uniforms.uSkyMap.value ? 'screen' : 'view') : null;
  },
  // the hour by which the sky and the theme were chosen (forced via ?hour=N) — for the theme guards
  skyHour(){ return { hour: skyHourNow(), time: skyTimeNow(), night: isNightSky() }; },
  // GRAPHICS DEBUG: substitute the sky palette on a live scene (the owner picking colours
  // without a rebuild, like veilTune). An array of hexes of any length >= 2.
  skyStops(list){ return setSkyStops(list); },
  // ⚠️⚠️ A LOAD-BEARING HOOK: the only check of the POSITIONS of the stops stands on it. They cannot
  // be caught by pixels — the owner's positions 0/36/65/100 differ from the even
  // 0/33.3/66.7/100 by Δ≈2 out of 255 per channel, that is, they drown in the frame noise.
  // We hand out the PARSED state and a READY CSS string: the guard checks that the
  // positions reached both consumers — the shader ramp and `--sky-grad`.
  skyInfo(){
    return { stops: skyStops.slice(), pos: skyPos.slice(),
             own: skyParsed.ownPos, grad: skyGradCSS };
  },
  // GRAPHICS DEBUG: the star shape on a live scene — 0 a pure dot, 1 a spark.
  // A contact sheet of variants is taken in one run, as with the palettes.
  starSpark(v){ if (skyMat && v != null) skyMat.uniforms.uStarSpark.value = v;
    return skyMat ? skyMat.uniforms.uStarSpark.value : null; },
  // a veil slice for the suite: how many materials really got uVeil>0
  veilStats(){
    let withShader = 0, veiled = 0, max = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const sh = it.mesh.material.userData && it.mesh.material.userData.shader;
      if (!sh) continue;
      withShader++;
      const v = sh.uniforms.uVeil.value;
      if (v > 0.01) veiled++;
      if (v > max) max = v;
    }
    return { mode: VEIL_MODE, withShader, veiled, max: +max.toFixed(2) };
  },
  // A/B of transparency ON A LIVE page. The live mode is set by VEIL_MODE in
  // 00-config; here it is only a measurement and a demo for the owner, without a rebuild.
  // ⚠️ Changing transparent means recompiling the shader: after the call give it a frame or two
  // to warm up, otherwise the compilation gets into the measurement instead of the settled price.
  veilFade(on){
    let n = 0;
    for (const it of items){
      if (!it.mesh || !it.mesh.material.userData.shader) continue;
      const m = it.mesh.material;
      m.transparent = !!on; m.needsUpdate = true;
      m.opacity = on ? 1 - (it.veilK || 0) * (1 - VEIL_ALPHA) : 1;
      n++;
    }
    return n;
  },
  // the checksum of the preset pixels: the suite checks the RE-SHOOTING of the texture,
  // and not just a change of a number in the object (otherwise the assert would be empty)
  matcapSum(kind){
    const t = matcapCache.get(kind);
    if (!t) return -1;
    const d = t.image.data; let s = 0;
    for (let i = 0; i < d.length; i += 97) s += d[i];
    return s;
  },
  // finish the intro instantly (for tests): a synchronous settling + shake-down
  skipIntro(){
    // ⚠️ The prologue comic hangs above the 'wait' phase and WAITS for a tap. In an auto run
    // there is nobody to tap: without this line the suite would get stuck on the very first screen,
    // and the coordinate clicks would go into the panel. We close it properly — that way the prologue
    // is also marked as shown, and does not pop up in the following sections.
    try { storyForceClose(); } catch(_){}
    if (!intro) return;
    intro = null;
    // the same signal as in the honest finishIntro (otherwise the showcase would wait for
    // an orbit that will not happen in tests/probes) — and the same messages to the platform
    document.documentElement.classList.add('introdone');
    try { Ads.gameReady(); Ads.msg('LEVEL_STARTED', { level: String(levelNum) }); } catch(_){}
    // ⚠️ THE WAVES MUST MATURE INSTANTLY: the whole suite stands on skipIntro, and
    // 300 synchronous steps do not move the real clock — without this line
    // the switched-off bodies would keep hanging above the bowl and the level would be empty.
    waveReleaseAll();
    for (let s=0; s<300; s++){
      world.step();
      // the terminal speed here too: the column falls from ~40 units, v>20
      // punched through the compounds (a latent source of test flakes)
      if (s % 3 === 0) for (const it of items){
        if (!it.alive || !it.body) continue;
        const v = it.body.linvel();
        if (v.y < -16) it.body.setLinvel({ x: v.x, y: -16, z: v.z }, false);
      }
    }
    syncMeshes();
    // a vibro shake-down of the WHOLE mass: a fresh pile is loose (arch bridges in the cone),
    // impulses only to the top ones do not break the bridges
    for (let round=0; round<8; round++){
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top <= FUNNEL.H - 0.4) break;
      for (const it of items){
        if (it.alive && it.body)
          impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
      }
      for (let s=0; s<70; s++) world.step();
      syncMeshes();
    }
    removeTempTallWall();
    finishIntro();
    pendingTrim = false;
    finalizeFill(); // synchronously: the tests read topY0/the trim right after skipIntro
    sleepPhysics('skipIntro');
    renderer.shadowMap.needsUpdate = true; // the settling passed by the loop gate — the shadow over the final pile
  },
  level(){ return level; },
  stats(){ return stats; },
  levelNum(){ return levelNum; },
  // debug/suite: the last telemetry events (the buffer accumulates even when
  // sending is off — otherwise the metrics could not be checked before production)
  telemetry(n){ const b = Telemetry.buffer(); return n ? b.slice(-n) : b; },
  telemetryScreen(){ return Telemetry.screen.current(); },
  guestId(){ return guestId(); },        // the player key for his own table
  guestAvatar(){ return guestAvatar(); }, // the avatar number derived from the key
  // ⚠️ THE GUARD NEEDS THE NAME TO ASSEMBLE A SNAPSHOT WITH ITS OWN ROW: identification in
  // `lbLoadOurs` goes by name+avatar (there is no identifier in the snapshot rows),
  // and without that pair the mock would not reproduce the case «found ourselves in the snapshot» at all.
  guestName(){ return guestName(); },
  // THE LEADERBOARD INSET ON VICTORY (85-hud). The handles are LOAD-BEARING: all the inset guards stand on them.
  // winScreen — showing/hiding the victory screen by the LIVE path (the same show/hide
  // that checkEnd calls) — the guards of the victory chain stand on it.
  // ⛔ The winLbStub/winLbInfo hooks were cut out together with the inset cluster (85-hud).
  winScreen(on){ if (on){ show('winOverlay'); try { fitWinTopRow(); } catch (e) {} }
    else hide('winOverlay'); },
  // ⚠️ A LOAD-BEARING HOOK, NOT A CONVENIENCE: the guard «the feature is off — there is no entry point to
  // the menu» stands on it. Without it the guard WOULD WAIT for somebody to open the menu with the module
  // removed — that is, it would inherit the situation instead of BRINGING IT ABOUT.
  lbEntryRefresh(){ lbEntryRefresh(); },
  // ⚠️ LOAD-BEARING: the guard of the table of live-rank cases (neighbours/top/refusal) stands on it.
  // This table cannot be run through `location`/the network — the server answers cannot be
  // set row by row in a test, and without the table only one remembered case is checked.
  lbRankNow(m, live, top){ return lbRankNow(m, live, top); },
  // ⚠️ LOAD-BEARING: the guard «by default all packs share ONE texture, while
  // a given pack changes ONLY its own items» stands on it. It hands out not flags but the identity
  // of the objects — otherwise my representation would be checked, not the scene.
  packMatcapInfo(){
    // ⚠️⚠️ «OWN» IS DETERMINED BY THE PACK REGISTRY, AND NOT BY «NOT EQUAL TO THE SHARED ONE».
    // The first edition counted as own any texture different from `tex`, and
    // recorded the BRICKS as own: they are painted, they have a lawful `soft` preset.
    // That is, the metric plausibly lied about exactly the case it
    // checks («a pack was given its own»).
    // ⚠️⚠️ THREE COUNTERS, NOT TWO, AND THE THIRD APPEARED FROM A MEASUREMENT, NOT FROM TASTE.
    // Since 2026-08-18 the cars and the food have THEIR OWN PICTURE (08-matcap-packs), and with
    // two counters they fell into NEITHER: they are not in the registry (`onOwn`
    // missed), they are not equal to the shared texture (`onShared` missed). The metric silently
    // lost exactly the two packs it is read for — the same genre as the one
    // written a paragraph above, only in the other direction.
    const baseTex = makeMatcap('tex'), packs = {};
    for (const it of items){
      if (!it || !it.alive || !it.type || !it.type.tex || !it.mesh) continue;
      const p = it.type.tex, m = it.mesh.material, ownTex = packMatcaps.get(p);
      const image = (typeof packMatcapTex === 'function') ? packMatcapTex(p) : null;
      const rec = packs[p] || (packs[p] = { items: 0, onOwn: 0, onImage: 0, onShared: 0 });
      rec.items++;
      if (m && ownTex && m.matcap === ownTex) rec.onOwn++;
      else if (m && image && m.matcap === image) rec.onImage++;
      else if (m && m.matcap === baseTex) rec.onShared++;
    }
    return { packs, registered: [...packMatcaps.keys()],
             withImage: (typeof PACK_MATCAP_SRC !== 'undefined')
               ? Object.keys(PACK_MATCAP_SRC).filter(k => PACK_MATCAP_SRC[k]) : [] };
  },
  // ⚠️ LOAD-BEARING: the guard «the bomb is dressed in the owner's picture» stands on it. This cannot be
  // checked by grepping the build — the inline base64 is present even when nobody
  // hangs it on a material; and the size of the picture is visible only after decoding.
  bombMatcapInfo(){
    const t = (typeof bombMatcapTex === 'function') ? bombMatcapTex() : null;
    const im = t && t.image;
    return { has:!!t, w:(im && im.width) | 0, h:(im && im.height) | 0,
             own:!!(im && im.width > 1) };
  },
  // ⚠️ A LOAD-BEARING HOOK: on it the guard «the live-table gate» runs THE HOST TABLE.
  // It cannot be run through `location` — the browser will not allow an arbitrary name, and the gate
  // has already twice let through a case nobody remembered. A separate end-to-end
  // assert proves that this very function is wired to `location`.
  lbHostIsLocal(protocol, hostname){ return lbHostIsLocal(protocol, hostname); },
  // THE NEW-ITEM SCREEN: the occasion, the display and a state snapshot for the guards.
  // ⚠️ `newObjInfo` hands out a LIVE CANVAS (`canvas:true`), not the fact of a call: without
  // this the guard «the model spins» would check the intent and not the picture —
  // the owner has twice caught a still backing instead of 3D.
  newObjDue(){ return newObjDue(); },
  // ⚠️ A HOOK FOR THE OCCASION GUARD: it is obliged to check the key against the LIVE order of types, and
  // not against a literal. The array order is a difficulty lever, it is edited by the owner's
  // spec; a literal in a test would drift apart from it silently.
  typeNameAt(i){ return (i >= 0 && i < TYPES.length) ? TYPES[i].name : null; },
  // ⚠️ THE START OF THE TYPE PROGRESSION — AS A LIVE NUMBER, NOT A LITERAL IN A TEST. The owner
  // edits it as the main difficulty lever (9 → 3 by the word 2026-08-11), and
  // the guard of «the new-item occasion», which kept a copy, went red on a HEALTHY build —
  // that very law about a copy next to a working value.
  levelTypesMin(){ return LEVEL_TYPES_MIN; },
  // ⚠️ LOAD-BEARING HOOKS OF THE BOMB SUPPLY (the owner's spec 2026-08-12): from outside only
  // «is there a bomb in the pile or not» is visible, while the rule consists of three values —
  // the level threshold, the gap and the reward for series. Without them the guard would check
  // the consequence and not the rule.
  // ⚠️ THE HOOK READS THE LIVE RULE, not a copy of the constants: a guard that wrote 10 into
  // itself will drift apart from the live game at the owner's very first edit.
  pausedNow(){ return paused; },
  // the pixel of a SPECIFIC item for a guard's live click (findByTex hands out
  // any item of the pack, while an ice block must be tapped as itself)
  pixelOf(i){ const it = items[i];
    if (!it || !it.alive) return null;
    return visiblePixel(it, pickCtx()) || { occluded: true }; },
  frozenInfo(){ return items.filter(i => i.alive && i.frozen).map(i => ({
    type: i.frozenType, got: i.frozenGotItems, need: i.frozenNeedItems,
    ready: !!i.frozenReady, index: items.indexOf(i),
    pulse: i.iceShell ? +i.iceShell.scale.x.toFixed(3) : null,
    gap: (i.iceShell && i.iceShell.userData.iceMat)
      ? +i.iceShell.userData.iceMat.uniforms.uGap.value.toFixed(4) : null })); },
  frozenNextAt(){ return frozenNextLevel; },
  // ⚠️ THE HOOKS CAME BACK AFTER THE BONUS LEVEL WAS REMOVED (2026-08-18). They were removed
  // together with its suite section — and with them died the CONTROL ARMS
  // asserting properties of the ORDINARY game: «special items spawn at all» and
  // «the drop phase in the intro does happen». The canonical «a guard dies together with its
  // mechanic» is about guards of a REMOVED mechanic, and not about controls that simply
  // lived in the same block.
  introPhase(){ return intro ? intro.phase : null; },
  specialsCount(){
    let treasure = 0, bombs = 0, iceBlocks = 0;   // ⛔ there are no stones in the game (2026-08-17)
    for (const it of items){
      if (!it.alive) continue;
      if (it.surprise) treasure++; else if (it.bomb) bombs++;
      else if (it.frozen) iceBlocks++;
    }
    return { treasure, bombs, iceBlocks, total: treasure + bombs + iceBlocks };
  },
  // ⛔ the iceStyle hook was CUT OUT together with the bench (the owner chose the frost crust);
  // we observe the crust scatter with this hook: the flight fraction of every live scatter
  iceBoomsInfo(){ return iceBooms.map(b => +(((performance.now() - b.t0) / ICE_BOOM_MS)).toFixed(2)); },
  frozenBreak(i){ const it = items[i]; if (it && it.frozen) breakIce(it); return !!(it && !it.frozen); },
  // ⛔ chromeInfo was REMOVED 2026-08-14 together with the edge machinery: there is nothing left to read
  surpriseRule(){ return { fromLevel: SURPRISE_FROM_LEVEL, level: levelNum,
                           hasBoost: (typeof anyBoostBought === 'function') ? anyBoostBought() : null,
                           inPile: (function (){ let n = 0; for (const it of items) if (it.alive && it.surprise) n++; return n; })() }; },
  bombRule(){ return { fromLevel: BOMB_FROM_LEVEL, gapMin: BOMB_GAP_MIN, gapMax: BOMB_GAP_MAX,
                       perSeries: BOMB_SERIES_REWARD, nextLevel: bombNextLevel,
                       inPile: (function (){ let n = 0; for (const it of items) if (it.alive && it.bomb) n++; return n; })(),
                       series: (level && level.bowlCracks) || 0, rewardGiven: !!(level && level.bombReward) }; },
  bombNextAt(lv){ if (lv != null) bombNextLevel = lv | 0; return bombNextLevel; },
  // ⚠️ LOAD-BEARING HOOKS OF THE RADIUS PENALTY (the owner's spec 2026-08-11). Without them
  // the mechanic cannot be checked: it is entirely inside an IIFE, and from outside only
  // `CFG.matchRadius` is visible — by it «it dropped because of a miss» is indistinguishable from «it dropped because
  // the pile shrank». `missRadius()` hands out the STATE, not a retelling.
  missRadius(){ return { active: missRadiusActive(), cap: missRadiusCap(),
                         counted: aliveCountForRadius(),   // the same number by which BOTH endgame steps decide
                         ownShakes: (level ? level.shakes : 0) + purchasedShakes(),
                         radius: +CFG.matchRadius.toFixed(3), base: CFG.baseRadius,
                         floor: MATCH_R_MIN, comboCap: COMBO_RADIUS,
                         bottom: MATCH_R_MISS, windowMs: MATCH_R_MISS_MS }; },
  missRadiusNow(){ noteMissRadius(); return missRadiusCap(); },
  baseRadiusDefault(){ return BASE_RADIUS_DEFAULT; }, // to the guards — return the live value, not a literal
  missRadiusClearTest(){ missRadiusClear(); updateMatchRadius(); }, // the transition guard: the same scene WITHOUT the penalty

  // ⚠️⚠️ A LOAD-BEARING HOOK: the fraction of the progress bar. It is shown by TWO screens (the showcase
  // and TOP ITEMS on victory) by one and the same function, while the defect itself was
  // ARITHMETIC — mixing a purchased tier with an earned one. The first guard
  // measured the WIDTH in `#vGrid` and gave zero in all three states: nobody ticks the panel on that
  // page, that is, dead DOM was being measured (the sixth case of
  // «caught not the property but its imitation»). We take the number from the function itself.
  vitFrac(k){ return (typeof vitFrac === 'function') ? vitFrac(k) : null; },
  // ⚠️ A LOAD-BEARING HOOK: the guard «every type has a material voice» stands on it. Without
  // it the link «item -> sound» cannot be checked by anything — it is entirely inside an IIFE.
  materialOf(name){ return materialOf(name); },
  // ⚠️ AND SEPARATELY — WHICH VOICES ARE ACTUALLY RECORDED: the markup exists for all
  // 120, while there are only three samples so far. The guard is obliged to distinguish «the type is marked up» and «the sound
  // is recorded», otherwise it would go green on a build without a single sample.
  sfxVoices(){ return Object.keys(SFX_B64).filter(k => k.indexOf('mat_') === 0).map(k => k.slice(4)); },
  newObjShow(key, done){ return newObjShow(key, done); },
  newObjHide(){ return newObjHide(); },
  newObjInfo(){
    const b = document.getElementById('newObj'), h = document.getElementById('newObjModel');
    if (!b) return null;
    const c = h ? h.querySelector('canvas') : null;
    // ⚠️ WE HAND OUT THE GLOW AS THE COMPUTED GRADIENT, and not as the value of a variable
    // that we wrote ourselves: the latter is a retelling of the intent, while the guard
    // is obliged to see the CONSEQUENCE (the variable may not reach the rule if
    // the background of `.no-shine` changes). Next to it — the expected tone of the type, so that
    // there is something to compare with, without writing a literal into the test.
    const sh = b.querySelector('.no-shine');
    const t = (function (){ const k = newObjLastKey; if (!k) return null;
      for (let i = 0; i < TYPES.length; i++) if (TYPES[i].name === k) return TYPES[i].color; return null; })();
    return { on: b.classList.contains('on'), canvas: !!c,
      width: c ? Math.round(c.getBoundingClientRect().width) : 0,
      glow: sh ? getComputedStyle(sh).backgroundImage : '',
      itemTone: (typeof t === 'number')
        ? ((t >> 16) & 255) + ', ' + ((t >> 8) & 255) + ', ' + (t & 255) : null,
      // ⛔ The name node no longer exists (the owner's word 2026-08-11). The field remains
      // and must be EMPTY — the guard «there is no name on the screen» stands on it: without it
      // a return of the caption would pass silently.
      name: (document.getElementById('newObjName') || {}).textContent || '' };
  },
  freeShakes(lv){ return freeShakesFor(lv == null ? levelNum : lv); }, // the stock ladder 3+⌊lv/10⌋
  adsMode(){ return Ads.mode; },
  // debug/tests: a forced recomputation of accessibility and its snapshot
  forceRefresh(){ refreshAccessibility(); },
  // regression diagnostics: physics sleep, veil blinking, «hangers» in mid-air
  awake(){ return { physAwake, sinceWakeMs: physAwake ? Math.round(performance.now() - wakeAtMs) : 0, maxV: +maxBodySpeed().toFixed(2) }; },
  accFlips(){ return accFlips; },
  // v1: the wallet and the stars (economy tests)
  wallet(){ return { coins: coins(), ce: Save.ce, cs: Save.cs, hints: hints(),
    stars: Object.assign({}, Save.stars), total: totalStars(),
    starBalance: starBalance(), se: Save.se, ss: Save.ss }; },
  grant(n){ addCoins(n); updateHUD(); },
  // ===== A SINGLE BALANCE + BOOST + UNLOCK (the contract for the INTERFACE,
  // the owner's finalization 2026-07-24: points=stars=balance=leaderboard).
  // All the handles are honest — the menu placeholders can be removed.
  starBalance: starBalance,       // THE SINGLE number: the chip, the wallet, the leaderboard base
  liveBalance: liveBalance,       // for the in-game CHIP: the balance + the unbanked level score
  leaderboardScore: leaderboardScore, // the rank = WHAT WAS PLAYED (se−max(0,ss−tu)); lower than the wallet by the unspent tu — a top-up does not raise the rank
  spendStars: spendStars,         // a write-off with a sufficiency check -> bool
  onStarsChange: onStarsChange,   // subscription: {balance, earned, spent}
  boostPrice: boostPrice,         // the price of the next tier of a type (null — the cap)
  canBoost: canBoost,             // whether the balance is enough
  buyBoost: buyBoost,             // a purchase -> {ok, price, tier, mult, balance, next}
  boostTier: boostTier,           // how many tiers have been bought up for a type
  // UNLOCKING A TYPE FOR BALANCE (on the locked collection cards)
  typeUnlockPrice: typeUnlockPrice, // the price or null (already unlocked/unknown)
  canUnlockType: canUnlockType,     // whether the balance is enough
  purchaseUnlock: purchaseUnlock,   // a purchase -> {ok, price, balance}
  starAward: starAward,           // the face value (migration only) — kept for the tests
  // test/debug
  starGrant(n){ addStars(n); return starBalance(); },
  // A HINT FOR AN AD — the contract with the INTERFACE (the «Ad» badge on the button):
  // adHintAvailable() — whether to draw the ad state; requestAdHint() — start
  // the clip (showHint itself already goes into this branch when there are zero charges).
  adHintAvailable: adHintAvailable,
  requestAdHint: requestAdHint,
  spendHint: spendHint, // a test handle: drain the charges to check the ad branch
  // BUNDLES — the contract with the INTERFACE (the «More Stars» screen) and the INTEGRATION
  // (buyBundle is called AFTER a confirmed payment; the payments themselves are not mine).
  buyBundle: buyBundle,               // buying a whole tier
  bundleState: bundleState,           // a snapshot for drawing the active one
  bundles(){ return STAR_BUNDLES.map(b => ({ ...b })); }, // the tier showcase
  scoreBoostMult: scoreBoostMult,     // the active multiplier (1 — there is no window)
  scoreBoostLeftMs: scoreBoostLeftMs, // the remainder of the strongest tier — the screen timer
  noAdActive: noAdActive, noAdLeftMs: noAdLeftMs,
  purchasedShakes: purchasedShakes,
  boostRaw(){ return { bx: Save.bx, na: Save.na, pe: Save.pe, ps: Save.ps, ls: Save.ls }; }, // a test handle
  boostSetClock(ls){ Save.ls = ls; commitSave(); }, // test: fake the «seen time»
  boostClear(){ boostClear(); return scoreBoostMult(); }, // test: clear the windows completely
  // THE STORY (86-story): the state of the chapters and a manual display for the tests
  storyState(){ return { st: Save.st || 0, sv: Save.sv || 0, open: !!document.getElementById('storyOverlay'),
                         due: (storyDue() || {}).id || null, busy: storyBusy, on: storyOn }; },
  // ⚠️ THE ARGUMENT IS PASSED THROUGH (2026-08-06): without it the hook dropped the callback, and the guard
  // «the announcement always hands control back to the level» would measure emptiness.
  storyOnWin(done){ return storyOnWin(done); },
  // THE TEXTS OF THE LONG META (item 1.3): the strings and the one-shot nature of the rule
  metaTexts(key){ return { line: accToastLine(key), saved: accSavedText(key),
                           next: accNextText(key), rule: accRuleText() }; },
  metaRuleState(){ return { due: accRuleDue(), mt: Save.mt || 0 }; },
  metaRuleMark(){ accRuleMark(); return Save.mt; },
  metaRuleReset(){ Save.mt = 0; commitSave(); },
  storyReset(){ Save.st = 0; Save.sv = 0; commitSave(); },
  storyMark(bit){ Save.st = (Save.st || 0) | bit; commitSave(); },       // test: count the chapter as shown
  storySetLevelMark(lv){ Save.sv = lv; commitSave(); },                  // test: when the last vignette was
  storyClearAcc(){ Save.ac = {}; commitSave(); },  // test: zero the accumulations — the K2-K4 milestones are counted by them
  storyPrologueDue(){ return storyPrologueDue(); },
  // ⚠️ TWO DIFFERENT HOOKS, AND THE DIFFERENCE IS LOAD-BEARING: `storyWinShipped` hands out the LIVE
  // constant (asserted by the guard «in the shipped build the between-levels vignette
  // is off by the owner's word»), `storyWinForce` is the auto-run lever
  // with which the story sections switch the mechanic on for themselves, so that it stays under
  // the guards until the feature returns. Merging them into one would mean letting the guard read
  // what the suite itself has set.
  storyWinShipped(){ return STORY_WIN_VIGNETTE; },
  storyWinForce(v){ return storyWinForceSet(v); },
  storyPrologueSpy(cb){ return storyPrologue(cb); }, // test: check that the callback is called
  storyPrologueNow(){ Save.st = 0; commitSave(); return new Promise(r => storyPrologue(() => r(true))); },
  storyClose(){ const b = document.getElementById('storyOverlay');
    if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return !document.getElementById('storyOverlay'); },
  storyTypeNames(){ return TYPES.filter(t => t.tex).map(t => t.name); }, // test: the names of the types that have a pack
  storyPackOf(name){ const t = TYPES.find(x => x.name === name); return t ? t.tex : null; },
  storyFullSet(){ return stFullSet(); },
  storyFillSet(){ // test: top up the smallest suitable pack to a full hall
    const by = {}; for (const t of TYPES) if (t.tex) (by[t.tex] = by[t.tex] || []).push(t.name);
    let best = null;
    for (const k in by) if (by[k].length >= 4 && (!best || by[k].length < by[best].length)) best = k;
    if (best) by[best].forEach(n => accAdd(n, 1, null)); // accGrant is a __game method, the global entry point is accAdd
    return best;
  },
  storyEnable(v){ storyEnable(v); }, // test: mute the story on the mechanical sections
  bankScore(n){ return bankLevelScore(n); },
  addScore(n){ stats.score += n | 0; return stats.score; }, // test: move the live level score // test of the score bank denomination
  scoreShownDenom: scoreShownDenom,          // #10: denominated score display (the chip and the pops are one scale)
  // ⚠️⚠️ A TEST HOOK FOR THE TREASURE PRECONDITION, AND IT WAS STARTED FROM A MEASUREMENT, NOT FOR CONVENIENCE.
  // The fish gate requires «at least one item has been boosted». The honest path (earn →
  // `buyBoost`) BROKE NINE neighbouring guards: a purchase raises FOREVER
  // the tier of the type they measure by name, and topping up the balance breaks
  // the chip format (`88.2k` against `88208`). This is exactly the canonical case «a guard,
  // while bringing the state about, breaks its neighbours on the page».
  // ⛔ That is why we set EXACTLY the condition the owner named and nothing more: one
  // purchased tier on the LAST type of the pool — not a single guard measures it.
  // The balance is not touched, other tiers are not touched.
  boostGrantForSurprise(){ const t = TYPES[TYPES.length - 1];
    Save.bo = Save.bo || {}; Save.bo[t.name] = Math.max(1, Save.bo[t.name] | 0);
    commitSave(); return { type: t.name, hasBoost: anyBoostBought() }; },
  clearBought(){ Save.uk = {}; commitSave(); }, // test: reset the purchased unlocks (isolating the progression assert)
  starMigrate(){ return migrateStarsToWallet(); },
  saveRaw(){ return JSON.parse(JSON.stringify(Save)); },
  mergeRaw(o){ mergeSave(Save, o); commitSave(); return starBalance(); },
  // ACCUMULATION BY TYPE (the owner's spec 2026-07-22) — the contract for
  // the INTERFACE (the «Museum of objects» tab + the tier-up popup) and for the tests;
  // the function itself is global in 77-save (85-hud picks it up by typeof)
  accSnapshot(){ return accSnapshot(); },
  // TYPE UNLOCKING by progression (the contract for GRAPHICS: a portrait only for
  // unlocked ones). The rule is the same as in genLevel; accSnapshot() already carries the
  // `unlocked` field per type, these handles are for direct queries/tests.
  unlockedTypes: unlockedTypes,       // -> [type.name] of those unlocked by the reached level
  isTypeUnlocked: isTypeUnlocked,     // (name) -> bool
  accGrant(name, n){ accAdd(name, n, null); return { count: accCount(name), tier: accTier(name), mult: accMult(name), next: accNext(name) }; },
  onAccTierUp: onAccTierUp, // subscription to a tier-up ({name, tier, mult, item})
  // balance tests: forcing the level (the penalty rules depend on levelNum)
  setLevel(n){ levelNum = Math.max(1, n | 0); try { localStorage.setItem('mixer_level', String(levelNum)); } catch(e){} }, // we do NOT touch Save.lv here: this is a test handle, not the player's progress
  // ⚠️ A TEST HOOK, NOT A TEMPORARY ONE — DO NOT DELETE (the label «TEMPORARY, I will remove it after
  // the bake» hung here by mistake and almost led to its demolition 2026-07-27).
  // On it stands the ONLY guard of the invariant «the pose of the still and of the spin is ONE
  // source» (the invariant itself is in CLAUDE.md: they must not be split, otherwise there is a jump when
  // img→canvas is substituted on hover). The suite assert CHANGES the pose with this hook and expects
  // the spin to start from the new one. WHY IT IS IMPOSSIBLE WITHOUT A MUTATION: the still and the spin
  // read ONE variable PORTRAIT_YAW0 — any getter would return it twice,
  // and a check of «getter against getter» would be empty and green always. The mutation IS
  // the check. GRAPHICS proved it by simulation (gave the spin its own copy of yaw):
  // the assert fell — startAngle −0.6 instead of 0.2; the shared one was returned — 0.2 again.
  // The frame is guarded by a separate thumbFrames, and the POSE — only by this hook.
  // Change the pose + reset thumbCache, so that the portrait is re-shot.
  setPortraitPose(tx, yaw){ PORTRAIT_TILT_X = tx; PORTRAIT_YAW0 = yaw;
    for (const k in thumbCache) delete thumbCache[k]; return [PORTRAIT_TILT_X, PORTRAIT_YAW0]; },
  // the static portrait as a data-URL (probe/suite): ghost=true -> ghost mode
  thumbURL(key, ghost){ const it = thumbItemForKey(key, ghost); return it ? itemThumb(it) : null; },
  // REGRESSION #3 (the owner's spec 2026-07-24 «the size on hover = the size of the still»):
  // the still (itemThumb) and the spin MUST frame with ONE frameCylinder — otherwise
  // on hover the img->canvas substitution shrinks the object. The hook frames both cameras DIRECTLY
  // (bypassing the itemThumb cache) on one mesh and compares the ortho camera widths bit for bit.
  // The suite asserts equal===true; if somebody shrinks itemThumb back to the silhouette —
  // the assert will go red. Lightweight (without a render/readback).
  thumbFrames(key){
    const it = thumbItemForKey(key); if (!it) return null;
    if (!thumbR) itemThumb(it); // bring up thumbCam/thumbR
    ensureSpinR();
    thumbCam.updateMatrixWorld(true);
    const m1 = new THREE.Mesh(it.mesh.geometry, it.mesh.material); m1.scale.copy(it.mesh.scale);
    frameCylinder(thumbCam, m1);
    const m2 = new THREE.Mesh(it.mesh.geometry, it.mesh.material); m2.scale.copy(it.mesh.scale);
    frameCylinder(spinCam, m2);
    const tW = thumbCam.right - thumbCam.left, sW = spinCam.right - spinCam.left;
    return { thumbW: +tW.toFixed(4), spinW: +sW.toFixed(4), equal: Math.abs(tW - sW) < 1e-4 };
  },
  // GRAPHICS DEBUG (portrait rotation, 2026-07-24): a bridge to the thumb machinery of
  // 85-hud. thumbSpinKey resolves key->portrait mesh and mounts the spin into host
  // (an item cannot be passed across the page.evaluate boundary). buildAllThumbs is the perf of
  // variant B: the build time of the portraits of all unlocked types.
  thumbSpinKey(key, sel){ const it = thumbItemForKey(key); const host = sel ? document.querySelector(sel) : null; if (it && host) thumbSpinStart(it, host); return !!(it && host); },
  // TAP=HOVER (#4): the interface's tap handler. Resolving key->portrait + host by
  // a selector, then a toggle (see thumbSpinToggle in 85-hud). It returns whether
  // the card is spinning after the call.
  thumbSpinToggleKey(key, sel){ const it = thumbItemForKey(key); const host = sel ? document.querySelector(sel) : null; return (it && host) ? thumbSpinToggle(it, host) : false; },
  thumbSpinStop, thumbSpinToggle, thumbItemForKey,
  // ⚠️ 2026-08-13: auto/px were added here for the guards of the new-item screen.
  // I managed to start a SECOND spinState and step on the written-down rake «a duplicate
  // key in __game silently eats the hook» (this one won, the later one in the file) —
  // the probe showed somebody else's fields instead of mine. Grep the name BEFORE adding.
  spinState(){ return { active: !!spinItem, angle: +spinAngle.toFixed(3), rafOn: !!spinRAF,
    auto: spinAuto, px: (spinR ? spinR.domElement.width : 0), tilt: +spinTilt.toFixed(3),
    mounted: !!(spinR && spinR.domElement.parentNode),
    // the ortho camera width: the Y-invariant frame is set ONCE -> it is constant
    // for the whole spin (a recomputation = «breathing»). I round coarsely, so as not to catch an epsilon.
    camW: spinCam ? +(spinCam.right - spinCam.left).toFixed(4) : 0 }; },
  buildAllThumbs(n){
    const rows = (typeof accSnapshot === 'function') ? accSnapshot() : [];
    const lim = Math.min(n || rows.length, rows.length); let built = 0;
    for (let i = 0; i < lim; i++){ const it = thumbItemForKey(rows[i].key); if (it && itemThumb(it)) built++; }
    return { built, total: lim };
  },
  // GRAPHICS DEBUG (shards, polish 2026-07-23): fire shardFX above
  // the pile — a visual screenshot and a perf measurement (assembling a real burst/grinding
  // deterministically is hard: burstFX needs a pack of >=4, grinding has no hook).
  // A bridge to the 70-fx effect, it does not touch behaviour (burstFX/grindShred).
  shardBurst(n, opts){
    opts = opts || {};
    const c = new THREE.Color(opts.color != null ? opts.color : 0x4a6cff);
    const y = opts.y != null ? opts.y : FUNNEL.H + 2; // by default above the rim — clear sky
    shardFX(new THREE.Vector3(opts.x || 0, y, opts.z || 0), c,
      Object.assign({ count: n || 10, up: 4, spread: 2.6, size: 0.18, life: 0.6 }, opts));
    wakePhysics('shardTest');
    return fx.length;
  },
  // ⚠️ A LOAD-BEARING HOOK: on it stands the only protection «one light per game». It is read
  // AFTER shardBurst — then it is the light the chip is ALREADY baked with, and not the one
  // it would have been baked with. If somebody removes syncShardLight from makeShardGeo (the light again
  // becomes a snapshot at startup) or brings back the second constant — the old value will stay
  // here, the guard will go red. Demolishing the hook = quietly removing the guard.
  shardLight(){ return SHARD_LIGHT.toArray().map(v => +v.toFixed(3)); },
  // ⚠️⚠️ THE SHAPES OF THE LIVE SHARDS — THE SIGNATURE OF EACH ONE'S BUFFER, and not their count.
  // The GRAPHICS invariant: «every chip is unique» (the tetrahedron corners are shifted by ±38%,
  // the tint is baked by the face normal). Until now it was guarded ONLY by the counter of
  // the scene's geometries, and that one proves that geometries WERE CREATED — not that
  // the shapes are DIFFERENT: the regression «one shape for the whole volley through a new geometry
  // object» would have passed it green. Here the contents are read.
  // ⚠️ It will be needed as a precondition of a buffer pool too: under a pool the geometry
  // counter stops growing by construction (the decrement lives only in
  // onGeometryDispose), that is, the old guard will go red on a CORRECT edit —
  // it must be replaced by this one, and not weakened in its threshold.
  shardShapes(){
    const out = [];
    for (const f of fx){
      const o = f.obj;
      if (!o || !o.userData || !o.userData.shard) continue;
      const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (!p) continue;
      // the signature: the sum and the sum of the squares of the coordinates + the first tint. Two different
      // chips with a matching pair of sums practically do not happen, while comparing
      // whole arrays across the bridge into the test is expensive and noisy.
      let s = 0, q = 0;
      for (let i = 0; i < p.array.length; i++){ s += p.array[i]; q += p.array[i]*p.array[i]; }
      out.push({ n: p.array.length, s: +s.toFixed(6), q: +q.toFixed(6),
        tint: c ? +c.array[0].toFixed(4) : null });
    }
    return out;
  },
  // STAR CALIBRATION: the screen coordinates of the BEST accessible group
  // (findHintGroup — the same search as the hint's). It is needed by bots that
  // walk with REAL taps: findByTex hands out any item of a pack, often without
  // a pair within the radius, and such a tap is penalized as a miss (the measurement showed 85%
  // misses) — whereas a human hits a visible group. For tests only.
  // mode 'any' — a RANDOM valid group (the model of an ordinary player: he hits
  // the first pair he notices, and does not scan the bowl looking for the maximum);
  // without an argument — the BEST group (the model of an attentive player). The spread
  // between these two models is exactly the corridor the star thresholds live in.
  // quality handles for the tests and the measurements
  perfTier(){ return { tier: CFG.perfTier, dpr: renderer.getPixelRatio(), fx: CFG.fxScale,
    shadows: renderer.shadowMap.enabled, decided: perfDecided }; },
  setPerfTier(t){ if (t !== 'low') return false;
    const ok = applyPerfTier('low'); if (ok) resize(); return ok; },  // resize — see tickPerfTier
  bestTapTarget(mode){
    refreshAccessibility();
    const acc = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && i.accessible);
    // ⚠️ THE GROUP IS COMPUTED AROUND A CONCRETE ANCHOR — exactly the way
    // handleTap will reassemble it, INCLUDING the cap. pairMatch is PROXIMITY (a gap <=
    // matchRadius), and NOT an equivalence class: a neighbour along the chain has its own set
    // of neighbours. That is why «n from one item, the pixel from another» lies —
    // the review v157 measured: 9 taps out of 14 took away a number other than the promised one.
    const groupAround = (it) => {
      let g = acc.filter(o => o !== it && o.key === it.key && pairMatch(o, it));
      const raw = g.length + 1;
      if (g.length > MATCH_MAX_N - 1){
        g = g.map(o => ({ o, d: pairDist(o, it) })).sort((a, b) => a.d - b.d)
             .slice(0, MATCH_MAX_N - 1).map(v => v.o);
      }
      return { n: g.length + 1, raw };
    };
    const cands = [];
    for (const it of acc){ const g = groupAround(it); if (g.n > 1) cands.push({ it, n: g.n, raw: g.raw }); }
    if (!cands.length) return null;
    // mode 'any' — a RANDOM order (the model of an ordinary player: he hits the first
    // pair he notices); without an argument — the BIGGEST groups first (the model of
    // an attentive player). The spread of the two models is exactly the corridor of the star thresholds.
    if (mode === 'any') for (let i = cands.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t;
    } else cands.sort((a, b) => b.raw - a.raw);
    // ⚠️ WE GO THROUGH ALL THE CANDIDATES, and not one group: accessibility is computed
    // by rays INTO THE SKY, while the pixel is by a ray FROM THE CAMERA, and an item is sometimes accessible
    // but covered by a neighbour. The first version of v157 gave up on the very first covered
    // group and returned null with a hundred live pairs (the review measurement: the default mode
    // returned null at lv.5/10/20, although 31-40 of 60 groups were visible), and
    // the cap assert silently went into «skipped». Like findByTex — we go to the end.
    const ctx = pickCtx();
    for (const c of cands){
      const px = visiblePixel(c.it, ctx);
      // n — the size of the match that will REALLY assemble around the returned
      // pixel (with the cap); raw — the same match BEFORE the cap, by it one can see whether
      // the cap worked at all (needed by the suite assert, otherwise it checks emptiness).
      if (px) return Object.assign({ n: c.n, raw: c.raw, name: c.it.type.name }, px);
    }
    return { n: 0, occluded: true };   // there are groups, but all of them are hidden from the camera
  },
  // multiplier test: match a pair of a SPECIFIC type (accessible and within the radius)
  matchType(name){
    refreshAccessibility();
    const arr = items.filter(i => i.alive && i.accessible && !i.animating && !i.surprise && !i.bomb && !i.frozen && i.type.name === name);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (pairMatch(arr[i], arr[j])){ doMatch([arr[i], arr[j]]); return true; }
    return false;
  },
  // the index of a live item of a type — for the addressed handles (ignite and the like)
  indexByType(name){
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      if (it.alive && !it.animating && it.type && it.type.name === name) return i;
    }
    return -1;
  },
  // live ones by type (an independent check of the par score in the tests)
  aliveByType(){
    const m = {};
    for (const it of items) if (it.alive && !it.surprise && !it.bomb) m[it.type.name] = (m[it.type.name] || 0) + 1;
    return m;
  },
  // diagnostics of stuck removals (found by the probe v218: doMatch did its work,
  // while removeItem did not happen — see the analysis in the journal)
  isPaused(){ return paused; },
  animCount(){ let k = 0; for (const it of items) if (it.alive && it.animating) k++; return k; },
  // THE TEMPO PACKAGE — the API for the Interface's eyes (the owner's spec: the tempo is shown
  // ONLY by the eyes, there is no bar). mult reads THE SAME seriesMult as the money does.
  series(){
    const n = performance.now();
    const active = comboUntil > n;
    return { len: active ? comboCount : 0, mult: active ? seriesMult(n) : 1,
             leftMs: Math.max(0, Math.round(comboUntil - n)),
             winMs: seriesWindowMs(comboCount) };
  },
  combo(){
    const n = performance.now();
    let top = 0, airborne = 0;
    for (const it of items) if (it.alive){ if (it.p.y < FUNNEL.H) top = Math.max(top, it.p.y + it.r); else airborne++; }
    return { hot: comboUntil > n, count: comboCount, level: comboLevel, chain: chainUntil > n, series: chainSeries, radius: +CFG.matchRadius.toFixed(2),
      top: +top.toFixed(2), airborne, nextDropIn: chainUntil ? Math.round(chainNextDrop - n) : null };
  },
  // GRAPHICS DEBUG (lightning density, 2026-07-28): continuously pour discharges between
  // the top items for ms milliseconds. It is needed because a lightning lives 0.16 s —
  // a random screenshot catches it as luck has it, and «has it become denser» cannot be checked by eye.
  // A bridge to boltFX (70-fx), it does not touch the chain/turbo behaviour. Like shardBurst for the shards.
  boltProbe(ms){
    const top = items.filter(i => i.alive && !i.animating).sort((a,b) => b.p.y - a.p.y).slice(0, 24);
    if (top.length < 4) return 0;
    const t = setInterval(() => {
      for (let n = 0; n < BOLT_PER_TICK; n++)
        for (let a = 0; a < 3; a++){
          const x = top[Math.floor(Math.random()*top.length)], y = top[Math.floor(Math.random()*top.length)];
          if (x !== y && x.p.distanceTo(y.p) < BOLT_MAX_D){ boltFX(x.p, y.p); break; }
        }
    }, 45);
    setTimeout(() => clearInterval(t), ms || 1500);
    return top.length;
  },
  psLog(){ return psLog.slice(); },
  // ⚙️ THE EFFECTS OF THE OWNER'S CHOICE 2026-08-01 — debug and guards.
  // ⚠️ THE FIRE HAS NO GAME TRIGGER YET: the owner approved the LOOK («show how it
  // can really burn»), but exactly when an item catches fire is a separate spec,
  // and there is none. Until then the fire lives as a function and this handle, not as a mechanic.
  // ⚙️ THE BURNING ITEM: the seam for the bonus (the dispatcher's zone) and the handles for the guards
  burning(){ return burningName(); },
  // ⚠️ THE INDEX OF THE BURNING ONE — FOR THE GUARD «the choice of the victim really changes». Before, it
  // measured the variety of TYPES, but what breaks is THE CHOICE OF THE ITEM (extinguishAll did not
  // clear burningItem — the scheduler kept one and the same). After the owner's
  // edit LEVEL_TYPES_MIN 9→3 there are three times fewer types on a level, and a repeat of
  // the TYPE started happening by itself: the guard went red on a healthy build. The index does not depend on
  // the number of types.
  // ⚠️ THE INDEX OF THE BURNING ONE — FOR THE GUARD «the choice of the victim really changes». Before, it
  // measured the variety of TYPES, but what breaks is THE CHOICE OF THE ITEM (extinguishAll did not
  // clear burningItem — the scheduler kept one and the same). After the owner's
  // edit LEVEL_TYPES_MIN 9→3 there are three times fewer types on a level, and a repeat of
  // the TYPE started happening by itself: the guard went red on a healthy build. The index does not depend on
  // the number of types. We take the reference FROM 70-fx, and do not guess by the mesh's signs.
  burningIndex(){ const it = burningItemRef(); return it ? items.indexOf(it) : -1; },
  fireSoon(){ fireNextMs = performance.now() + 120; }, // test: do not wait for FIRE_EVERY_MS
  faceState(){ return faceHold || faceState; }, // test: which face is HELD (a reaction on top of the state)
  refreshAcc(){ refreshAccessibility(); }, // test: a fresh recomputation of accessibility (the cache lives only while there is movement)
  // THE BOWL SHATTER (v2 prototype): the bench and the guards
  bowl(){ return bowlState(); },
  bowlCrack(){ bowlCrackAdd(); return bowlState(); },   // the same entry point as turbo's
  bowlShatterNow(){ if (level && !level.over){ level.bowlCracks = bowlN(); shatterBowl(); } return bowlState(); },
  bowlSetN(n){ bowlNRuntime = Math.max(0, n|0); return bowlN(); },
  walls(){ return wallsCount(); },
  slowmoLeft(){ return Math.max(0, Math.round(slowmoUntil - performance.now())); },
  fireDue(ms){ if (ms != null) fireNextMs = performance.now() + ms; return fireNextMs; },
  ignite(i){
    // without an index — the TOPMOST live one: number zero is the surprise at the bottom, and the fire
    // is not visible on it at all (caught by the very first screenshot during the port)
    let it = i != null ? items[i] : null;
    if (!it){
      for (const c of items) if (c.alive && !c.surprise && (!it || c.p.y > it.p.y)) it = c;
    }
    if (!it || !it.alive) return null;
    // ⚠️ THROUGH THE MECHANIC, not with a bare effect (caught by the bonus guard v232): the handle
    // was left over from the effects port and called fireSilhouetteFX directly —
    // burningItem was not set, the bonus and «exactly one burns» did not see it.
    igniteItem(it);
    return { type: it.type && it.type.name, fires: fires.length };
  },
  extinguish(){ extinguishAll(); return fires.length; },
  firesN(){ return fires.length; },
  // the knobs of the red-hot crust: contour, glow, grain, speed, scale plus the
  // three gradient colours. Two presets, two knobs — `heatTune` is the flame one
  // (it hangs on a burning item), `chillTune` the ice one (on a frozen one).
  heatTune(o){ return heatKnobs(HEAT, o); },
  chillTune(o){ return heatKnobs(COLD, o); },
  // a slice for the port guards: is the SHARED geometry of the type alive after the cut and
  // has the item grown somebody else's children (the fire must be an overlay child,
  // and not an edit of the material — otherwise it will seep into the collection portraits)
  fxProbe(){
    // ⚠️ THE CHILDREN ARE COUNTED BY ITEMS, AND THE GEOMETRY — BY TYPES, AND THESE ARE DIFFERENT
    // SAMPLES. The first version put everything into a map keyed by the type name — and the item
    // with the fire overlay WAS OVERWRITTEN by another item of the same type: the guard honestly
    // printed «items with children 0» while an item was burning. A classic «the metric
    // is plausible, but measures the wrong thing».
    const byType = {};
    let kidsTotal = 0, kidsMax = 0;
    for (const it of items){
      if (!it.alive || !it.mesh) continue;
      const k = it.mesh.children.length;
      kidsTotal += k; if (k > kidsMax) kidsMax = k;
      if (!it.type) continue;
      const g = it.mesh.geometry, a = g && g.attributes && g.attributes.position;
      const v = a ? a.count : 0;
      // per type we keep the WORST: if the geometry of even one item of the type
      // has died, the type must be counted as dead
      if (!(it.type.name in byType) || v < byType[it.type.name]) byType[it.type.name] = v;
    }
    // ⚠️ WE COUNT THE HALVES THEMSELVES BY THE MARKER, AND NOT AN INDIRECT TOTAL. The guard «the number of scene
    // objects has not grown» turned out to be tautological twice: under a sabotage test
    // (the halves are not removed) the number accidentally matched the healthy one, because
    // ground-up items were leaving at the same time. The keepGeo marker exists ONLY on
    // the halves of the cut — and it is them that we count by name.
    let halves = 0;
    for (const o of scene.children) if (o.userData && o.userData.keepGeo) halves++;
    return { types: Object.keys(byType).length, byType, kidsTotal, kidsMax, halves,
             fires: fires.length, chills: chills.length, fxN: fx.length };
  },
  // ⚠️⚠️ A PROBE FOR THE IMPELLER'S CLEARANCE (2026-08-23-a: «make the distance from the
  // objects to the blades smaller»). Before this batch NOTHING in the suite read the blade
  // geometry at all — grep confirmed the only blade hits were matcap-texture guards — so a
  // wrong number would have shipped green.
  // ⚠️ THE WORLD-SPACE TOP IS COMPUTED, not the group's y: the raise was done by growing the
  // hub and moving the blades UP THE SHAFT precisely so that the group's y could stay put,
  // and a probe reading `mixerBlades.position.y` would therefore report «nothing changed»
  // on a correct build. It walks the real boxes instead.
  // ⚠️ `floor` IS RETURNED BESIDE IT so the guard can state the CLEARANCE rather than an
  // absolute height — the clearance is the quantity he asked about, and it moves if either
  // side moves.
  bladeProbe(){
    const box = new THREE.Box3();
    let top = -Infinity, hubTop = -Infinity;
    for (const o of mixerBlades.children){
      o.updateWorldMatrix(true, true);
      box.setFromObject(o);
      if (!isFinite(box.max.y)) continue;
      if (o.geometry && o.geometry.type === 'CylinderGeometry') hubTop = Math.max(hubTop, box.max.y);
      else top = Math.max(top, box.max.y);
    }
    return { bladeTop: +top.toFixed(3), hubTop: +hubTop.toFixed(3),
             groupY: +mixerBlades.position.y.toFixed(3), floor: FLOOR_REST,
             gap: +(FLOOR_REST - top).toFixed(3) };
  },
  // ⚠️⚠️ A PROBE FOR THE THREAD OF LIGHTNING (2026-08-23-a). Without it the item «a click on
  // the bonus thing draws a bolt through all the copies» is INVISIBLE TO EVERY AUTOMATED
  // CHECK: a build that draws nothing throws nothing, logs nothing and passes the whole
  // suite — the single most likely way to ship this feature without shipping it.
  // ⚠️ THE VERTEX COUNT IS RETURNED, NOT ONLY THE MESH COUNT, and that is the load-bearing
  // half. Two meshes appear whether the thread has fifteen hops or one degenerate segment;
  // only the vertex count grows with the number of victims, so only it can tell a real
  // thread from a stub. The guard compares two detonations of different sizes.
  // ⛔⛔ THE NAME IS `chainBoltProbe`, NOT `boltProbe`, AND THAT IS NOT COSMETIC. This object is
  // an OBJECT LITERAL: a second key of the same name silently WINS, and `boltProbe(ms)` fifty
  // lines above is GRAPHICS's live debug hook that pours discharges for a screenshot. Naming
  // this one `boltProbe` did not error, did not warn and passed the build — it simply deleted
  // that hook. Caught in review, not by a run. ⚠️ Before adding any hook here, grep the file
  // for the name; the file already carries one scar of exactly this shape (`itemsBrief`).
  chainBoltProbe(){
    let meshes = 0, verts = 0;
    for (const o of scene.children){
      if (!(o.userData && o.userData.poolBolt)) continue;
      meshes++;
      const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (a) verts += a.count;
    }
    return { meshes, verts };
  },
  grindNow(){ mixerGrind(); return true; },
  // stones: the number of live ones (spawn ramp tests) and the index of the first one (setting up scenes)
  // bomb: the index of the live bomb (-1 if there is none) and a forced detonation
  bombIndex(){ return items.findIndex(i => i.alive && i.bomb); },
  // REGRESSION #2 (the owner's spec 2026-07-23 «an iridescent bomb»): the bomb's material
  // is a rainbow MeshMatcapMaterial (bombMatcap), NOT a flat MeshBasicMaterial.
  // The suite asserts type==='MeshMatcapMaterial' && hasMatcap.
  bombMatKind(){ const b = items.find(i => i.alive && i.bomb); if (!b) return null;
    const m = b.mesh.material; return { type: m.type, hasMatcap: !!m.matcap }; },
  detonate(){
    const b = items.find(i => i.alive && i.bomb && !i.animating);
    if (!b) return false;
    detonateBomb(b);
    return true;
  },
  // screenshot probes of the effects: a VISIBLE point of the first accessible item of a pack
  // (for a real mouse.click in headless). v2 after the dispatcher's flake report
  // (v76): the projection of the CENTRE sometimes landed on an OCCLUDING front item
  // (the click matched somebody else's group: «−20» turned into «+120»). Now the point
  // is found by a raycast from the camera — the centre + 8 offsets along the screen axes within
  // the extent; only a pixel where the item is the FIRST intersection is handed out.
  // All points covered on all candidates -> {occluded:true}:
  // the caller does a shake and repeats.
  findByTex(tex){
    const ctx = pickCtx();
    let firstHidden = null;
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      if (!it.alive || !it.accessible || it.animating || it.type.tex !== tex) continue;
      const px = visiblePixel(it, ctx);
      if (px) return Object.assign({ i, name: it.type.name }, px);
      if (!firstHidden) firstHidden = { i, name: it.type.name, occluded: true };
    }
    return firstHidden;
  },
  // the weight during a shake: the average |v| of the live bodies by pack (car/animal/food/...)
  // — a measurement of the response right after shake(); for the owner's tuning of SHAKE_RESP
  // the pile's response BY HEIGHT (the measurement «the explosion is like a shake», 2026-07-27):
  // the average |v| and the share of those that moved in three bands — bottom/middle/TOP.
  // The top one is the key one: until the second wave layer it stood rooted to the spot.
  velByHeight(){
    const alive = items.filter(i => i.alive && i.body && !i.animating);
    if (!alive.length) return {};
    const ys = alive.map(i => i.p.y).sort((a,b) => a-b);
    const q1 = ys[Math.floor(ys.length/3)], q2 = ys[Math.floor(ys.length*2/3)];
    const band = { low: [], mid: [], top: [] };
    for (const it of alive){
      const v = it.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      (it.p.y <= q1 ? band['low'] : it.p.y <= q2 ? band['mid'] : band['top']).push(s);
    }
    const out = {};
    for (const k in band){
      const a = band[k];
      out[k] = a.length ? { n: a.length, avg: +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2),
        max: +Math.max(...a).toFixed(2), movingPct: Math.round(a.filter(v=>v>0.5).length/a.length*100) } : null;
    }
    return out;
  },
  velByTex(){
    const m = {};
    for (const it of items){
      if (!it.alive || !it.body) continue;
      const v = it.body.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      const k = it.type.tex || it.type.name;
      (m[k] = m[k] || { n: 0, sum: 0 }).n++; m[k].sum += s;
    }
    for (const k in m) m[k] = +(m[k].sum / m[k].n).toFixed(2);
    return m;
  },
  sfx(){ return Sound.loaded(); }, // which audio samples are decoded
  // a perf slice for the soak test and for measurements on devices (see soak.js):
  // frame/physics-step times over the last ~10 s + resource counters
  // by which leaks are caught (bodies/colliders/meshes/geometries/DOM/heap)
  // Zero the perf meter rings: profiling measures THE WINDOW OF A SCENARIO (an explosion,
  // a collapse), and not the whole session — otherwise the startup and skipIntro frames drag
  // the statistics and «the explosion» comes out more expensive than it is.
  // A profiling test hook: put the quality down BY HAND. The live automation
  // decides once per session by the frame median and DOES NOT WORK IN THE INTRO (see
  // tickPerfTier) — while the «weak» tier has to be profiled on a collapse.
  perfTierSet(t){ const ok = applyPerfTier(t); if (ok) resize(); return CFG.perfTier; },
  // ⚠️ FOR A SENSITIVITY MEASUREMENT ONLY, NOT FOR THE LIVE GAME. It turns the solver's numeric
  // knobs on a live world, in order to understand THE PRICE of each one before changing anything.
  // They must not be changed for real without the owner's word: the iterations and the substeps keep
  // a dense pile from falling through itself, that is, this is BEHAVIOUR and not
  // picture quality (see the comment at applyPerfTier).
  // A census of the COMPLEXITY of the physics scene: how many bodies and colliders the
  // container costs against the items, and from how many vertices the convex
  // hulls are built. The price of the narrow phase grows with the vertices, the price of the broad one with the number
  // of proxies, while the gameplay depends on neither.
  colliderCensus(){
    let itemBodies = 0, itemCols = 0, hullVerts = [], compounds = 0;
    for (const it of items){
      if (!it.alive || !it.body) continue;
      itemBodies++;
      const n = it.body.numColliders(); itemCols += n;
      if (n > 1) compounds++;
      const g = it.geo || (it.mesh && it.mesh.geometry);
      if (g && g.attributes && g.attributes.position) hullVerts.push(g.attributes.position.count);
    }
    hullVerts.sort((a, b) => b - a);
    const total = world.bodies.len ? world.bodies.len() : -1;
    return { total, itemBodies, itemCols, staticBodies: total - itemBodies,
      compounds, hullMax: hullVerts[0] || 0,
      hullMed: hullVerts[hullVerts.length >> 1] || 0,
      hullSum: hullVerts.reduce((s, v) => s + v, 0) };
  },
  // A breakdown of world.step() into phases (the Rapier profiler). MEASUREMENT ONLY, not the live game.
  stepProfOn: (on) => profEnable(on),
  stepProf: () => profTake(),
  shapeCensus: () => shapeCensus(),
  waveInfo: () => waveInfo(),
  ccdSel: (on, vOn, vOff) => (on === undefined ? ccdSelInfo() : setCcdSel(on, vOn, vOff)),
  physKnobs(o){
    o = o || {};
    if (o.iters != null) try { world.numSolverIterations = o.iters; } catch(e){}
    if (o.ccdSub != null) try { world.maxCcdSubsteps = o.ccdSub; } catch(e){}
    if (o.ccd != null) for (const it of items) if (it.alive && it.body) it.body.enableCcd(!!o.ccd);
    if (o.ccdDefault != null) setCcdDefault(o.ccdDefault);
    if (o.wallTol != null) setRescueWallTol(o.wallTol === 'off' ? 1e9 : o.wallTol);
    if (o.waves != null) setWaves(o.waves, o.waveMs);
    if (o.maxSub != null) setMaxSubsteps(o.maxSub);
    return { iters: world.numSolverIterations, ccdSub: world.maxCcdSubsteps,
      maxSub: maxSubsteps(), ccdDefault: getCcdDefault(), wallTol: getRescueWallTol(),
      waves: getWaves() };
  },
  fpsCapInfo(){ return { cap: CFG.fpsCap, thresholdMs: CFG.fpsCap > 0 ? +(840 / CFG.fpsCap).toFixed(1) : 0 }; },
  fpsBadge(v){ fpsBadgeOn = !!v; if (!fpsBadgeOn && fpsBadgeEl){ fpsBadgeEl.remove(); fpsBadgeEl = null; } return fpsBadgeOn; },
  // the minimum of the frame ring: a deterministic sign that the cap IS BINDING —
  // load makes the frames LONGER, a minimum below the threshold will not appear from it
  frameMin(){ return frameRing.length ? +Math.min.apply(null, frameRing).toFixed(1) : null; },
  perfReset(){ frameRing.length = 0; stepRing.length = 0; solveRing.length = 0; syncRing.length = 0; subRing.length = 0; buildRing.length = 0; tapRing.length = 0;
    fxRing.length = 0; renRing.length = 0; uiRing.length = 0; perfWorstMs = 0;
    _worstFrame = null; _wfRaw = 0; _worstBuildFrame = null; _wbBuild = 0; },
  perfStats(){
    const q = a => {
      if (!a.length) return { avg: 0, p95: 0, max: 0 };
      const s = a.slice().sort((x, y) => x - y);
      return { avg: +(s.reduce((t, v) => t + v, 0)/s.length).toFixed(2),
        p95: +s[Math.min(s.length-1, Math.floor(s.length*0.95))].toFixed(2),
        max: +s[s.length-1].toFixed(2) };
    };
    return { frame: q(frameRing), step: q(stepRing),
      fx: q(fxRing), ren: q(renRing), ui: q(uiRing), parts: fxParticleCount(),
      solve: q(solveRing), sync: q(syncRing), sub: q(subRing), build: q(buildRing), tap: q(tapRing), tapPh: _tapPh,
      // ⚠️ JANK IS A DISTRIBUTION, AND NOT ONE WORST FRAME. «The worst over the window» is
      // ONE sample per run, and by the project's rule a rare event is not
      // certified by it. The complaint «it lags a bit» is about HOW MANY frames
      // dropped, so we count them: 33 ms = a frame skipped at 30 fps,
      // 50 ms = a visible jerk.
      jank33: frameRing.reduce((n, v) => n + (v > 33 ? 1 : 0), 0),
      jank50: frameRing.reduce((n, v) => n + (v > 50 ? 1 : 0), 0),
      frames: perfFrames, worstMs: +perfWorstMs.toFixed(1), worstFrame: _worstFrame, worstBuildFrame: _worstBuildFrame,
      bodies: world.bodies && world.bodies.len ? world.bodies.len() : -1,
      colliders: world.colliders && world.colliders.len ? world.colliders.len() : -1,
      sceneChildren: scene.children.length, fxN: fx.length,
      geoms: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      domNodes: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : -1 };
  },
  // The build of the effects BY KIND (A2): the constructor's own time and the number of
  // calls. `build` in perfStats gives only the total, and it is made up of
  // very different line items (a cloud of dust against 15 shards), and by the total one cannot
  // say where to aim a pool. reset=true zeroes it — the measurement runs as a window around
  // an event. ⚠️ Kinds that are not in the list of 70-fx wrappers WILL NOT APPEAR here:
  // silence means «not wrapped», and not «free».
  fxBreak(reset){ return fxBuildBreak(reset); },
  // ⚠️ A LOAD-BEARING HOOK: on it stands the only guard «the impact grows with the group» (the ring,
  // the arrows and the flash must be bigger for a large group than for a pair).
  lastImpact(){ return lastImpact; },
  // ⚠️ A LOAD-BEARING HOOK: on it stands the guard «a fire burst is ONLY for the burning kind».
  // It hands out a timestamp, in order to tell a fresh burst from an old one: without it
  // the guard would read one and the same snapshot twice and «two out of two» would mean one.
  lastFireBurst(){ return lastFireBurst; },
  // ⚠️ A LOAD-BEARING HOOK: on it stand the bowl shatter guards — «there is no silhouette», «one object»,
  // «the geometry is baked in advance and reused», «the pieces are of DIFFERENT sizes».
  // The last one is directly on the owner's complaint («the mesh is sterile and even»):
  // without it a return to a regular lattice would pass silently.
  // ⚠️ THE STAR PULSE HANDLE — both a tuning knob («1 in 10» may become «1 in 20») and
  // the ONLY honest way to check the mechanism: 10% of pulsing ones against a background of
  // ALL of them blinking is not distinguished by a pixel measurement (a swing of 0.41 against a base of 0.41),
  // while at a fraction of 1.0 the difference is visible at once (0.93). The guard runs exactly the fraction.
  starPulse(frac, amp){
    const u = skyMat && skyMat.uniforms;
    if (!u || !u.uStarPulseFrac) return null;
    if (frac != null) u.uStarPulseFrac.value = frac;
    if (amp != null) u.uStarPulseAmp.value = amp;
    return { frac: u.uStarPulseFrac.value, amp: u.uStarPulseAmp.value };
  },
  bowlShardsInfo(){
    return { broken: bowlBroken, pieces: _shatterN, baked: !!_shatterGeo,
             geoId: _shatterGeo ? _shatterGeo.id : null,
             sizes: _shatterSizes, glassVisible: !!(bowlMesh && bowlMesh.visible),
             // ⚠️ THE RADIUS BY MESHES, AND NOT BY BODIES. The convergence to the centre moves
             // mesh.position (the bodies are destroyed by that moment), while itemsGeo
             // hands out it.p — it freezes at the place of the explosion, and the guard would measure
             // the scatter instead of the convergence. Exactly «the metric is plausible, but
             // counts the wrong thing».
             meshRadius: (() => { let m = 0;
               for (const it of items) if (it.alive && it.mesh)
                 m = Math.max(m, Math.hypot(it.mesh.position.x, it.mesh.position.z));
               return +m.toFixed(2); })(),
             aliveMeshes: items.filter(i => i.alive).length,
             // ⚠️ THE TREASURE SEPARATELY: it lies at the BOTTOM, and the common «pile radius» does not
             // see it — the maximum is taken by the items at the edges. Without its own number the guard
             // «the treasure flies with everybody» would be blind to exactly what it checks.
             treasureToCenter: (() => {
               const s = items.find(i => i.alive && i.surprise && i.mesh);
               if (!s) return null;
               const p = s.mesh.position;
               return +Math.hypot(p.x, p.y - BOWL_MERGE_AT_Y, p.z).toFixed(2);
             })() };
  },
  // ⚠️ A LOAD-BEARING HOOK: on it stands the guard «all three ring families are alive and deterministic».
  // It hands out THE LAYOUT OVER THE WHOLE POOL, and not over the current level: the family is computed
  // from the dimensions of the type's geometry, and it must be checked on all of them, not on the nine.
  // ⚠️ A LOAD-BEARING HOOK: on it stands the guard «the pop outline separates the white digit» over the WHOLE
  // pool. It counts with THE SAME function as the live game (popOutlineColor), and not with a copy of
  // the formula — a copy would drift apart from the live game at the first edit of the thresholds.
  // THE MATCAP EDITOR (the owner's word 2026-08-17): paint with a brush or drop
  // a ready PNG — the material is applied to the LIVE scene, it is seen exactly as in the game.
  matcapEdit(){ return matcapEdit(); },
  // ⚠️⚠️ WITHOUT THIS HANDLE THE DEFECT «THE RESET FOR THE BLADES AND THE BOMB» IS UNOBSERVABLE. For these
  // targets the texture is a `THREE.Texture` over an `HTMLImageElement`, and the corruption/restoration
  // are visible only by WHAT `image` is: the owner's picture or the editor's canvas.
  // Not a single existing hook gave this out.
  // ⚠️ It reads THE SAME `mceTexOf` as the editor itself: my own walk over the caches
  // would check my representation of the target, and not the target.
  mceTexInfo(id){
    let t = null; try { t = mceTexOf(id); } catch (e) {}
    const im = t && t.image;
    return { has: !!t, source: im ? (im.nodeName || 'data') : null,
             w: im ? (im.width | 0) : 0, h: im ? (im.height | 0) : 0,
             bytes: !!(im && im.data) };
  },
  popOutlines(){ return { palette: POP_OTL_PALETTE.slice(),
    // the sample is taken by the live function — the guard checks WHAT the game draws
    sample: Array.from({ length: 60 }, () => popOutlineColor()) }; },
  ringFams(){
    // ⚠️ The keys MIRROR the `fam` string values from 70-fx — renamed there in
    //    lockstep (circle / polygon / oval), and test.js reads them by these names.
    const out = { circle: [], polygon: [], oval: [] };
    for (const t of TYPES){
      if (!geoCache.has(t.name)) { try { geoCache.set(t.name, t.geo()); } catch(e){ continue; } }
      const f = ringFamFor(t, geoCache.get(t.name));
      (out[f.fam] || (out[f.fam] = [])).push({ name: t.name, w: +(1 - f.w).toFixed(2), elong: f.elong });
    }
    return out;
  },
  // The kind labels: the list of registered ones + the first collision, if there is one.
  // ⚠️ A label collision is NOT cosmetics: `fxBuildBy` is keyed by the label, and two
  // different functions under one name are added into a single report row. Exactly
  // this happened with `'spark'` (caught by GRAPHICS): the number was the sum of two
  // effects and turned out correct only because one of them is dead.
  fxKinds(){ return { kinds: Object.keys(fxKindOwner).sort(), dup: fxKindDup }; },
  // A REPORT FOR A MEASUREMENT ON A LIVE PHONE (the dispatcher's order): everything needed to
  // analyse the lag, as ONE object — the owner only has to press a button.
  // ⚠️ The counters are NOT reset: worstFrame accumulates from the page load, and that is
  // exactly what is needed — «the worst moment of the session», and not of the last second.
  perfReport(){
    const p = this.perfStats();
    return {
      at: new Date().toISOString(),
      build: (document.getElementById('buildVer') || {}).textContent || '?',
      device: {
        ua: navigator.userAgent,
        screen: screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1),
        window: innerWidth + '×' + innerHeight,
        cores: navigator.hardwareConcurrency || '?',
        memoryGB: navigator.deviceMemory || '?',
      },
      session: { level: levelNum, alive: items.filter(i => i.alive).length,
        difficulty: CFG.hard ? 'Hard' : 'Easy', tier: CFG.perfTier,
        dpr: renderer.getPixelRatio(), fxScale: CFG.fxScale, sub: maxSubsteps() },
      // ⚠️ THE POURING GOES AS A SEPARATE FIELD AND FIRST: the complaint is precisely about it, while
      // the general `frame`/`phases` by the moment the button is pressed already describe a calm game.
      filling: _introPerf,
      frame: { p95: p.frame.p95, max: p.frame.max, frames: p.frames },
      phasesP95: { step: p.step.p95, solve: p.solve.p95, sync: p.sync.p95,
        build: p.build.p95, tap: p.tap.p95, fx: p.fx.p95, ui: p.ui.p95, ren: p.ren.p95 },
      worstFrame: p.worstFrame,
      worstBuildFrame: p.worstBuildFrame,
      fxByKind: fxBuildBreak(false),
      scene: { bodies: p.bodies, colliders: p.colliders, geoms: p.geoms,
        drawCalls: p.drawCalls, tris: p.tris, parts: p.parts, heapMB: p.heapMB },
    };
  },
  // debug: teleporting an item (setting up accessibility scenes in the tests)
  place(i, x, y, z){
    const it = items[i];
    if (!it || !it.body) return false;
    it.body.setTranslation({ x, y, z }, true);
    it.body.setLinvel({ x:0, y:0, z:0 }, true);
    it.body.setAngvel({ x:0, y:0, z:0 }, true);
    // A Rapier RAKE: the query pipeline (castRay) sees the teleport only after
    // world.step() or an explicit propagation — otherwise the rays hit a phantom
    if (world.propagateModifiedBodyPositionsToColliders) world.propagateModifiedBodyPositionsToColliders();
    syncMeshes();
    renderer.shadowMap.needsUpdate = true; // autoUpdate=false: a teleport without waking physics left the shadow at the old place
    return true;
  },
  // Diagnostics of the «hole» (the owner's complaint 2026-07-30): a brief slice of all live
  // bodies — name/height/lowest point/sleep/contacts. floaters() catches a gap UNDER
  // an item, but does not catch a FALL THROUGH THE FLOOR (the one that fell through lies on the blades
  // with contacts and without a gap) — for it exactly a y below FLOOR_REST is needed.
  itemsBrief(){
    return items.filter(i => i.alive && i.body).map(i => ({
      name: i.type ? i.type.name : '?', y: +i.p.y.toFixed(2),
      bottom: +(i.p.y - i.r).toFixed(2), r: +i.r.toFixed(2),
      // low — the lowest point by the oriented box (bottom by the bounding
      // sphere lies twofold for flat ones). ⚠️ AN UPPER ESTIMATE, not suitable for thresholds;
      // pen — the TRUE penetration into the floor slab by the manifold (null = no
      // contact with the floor), that one is the ground truth.
      low: +lowestPoint(i).toFixed(3), pen: floorPenetration(i),
      // the sag threshold of EXACTLY THIS item (see floorPenLimit): for a thin
      // plate it is below the absolute one, for thick ones it equals it
      penLim: +floorPenLimit(i).toFixed(4),
      d: +Math.hypot(i.p.x, i.p.z).toFixed(2),
      sleeping: i.body.isSleeping(), bomb: !!i.bomb
    }));
  },
  // fall-through diagnostics: who sits with its CENTRE below the floor. For a convex item
  // lying on the floor the centre is ALWAYS above FLOOR_REST by its own half-extent —
  // so a centre below the floor = a penetration or already a fall right through.
  // the rescuer's ceiling (50-physics): above it an item is considered to have flown away.
  // The top-up guard needs it — it compares the SPAWN PEAK with this number, and not with
  // a literal: otherwise the guard and the code would drift apart at the first edit of the ceiling.
  rescueCeil(){ return RESCUE_CEIL; },
  // ⚠️⚠️ A REACH PROBE: HOW MUCH THE WALL METRIC OVERESTIMATES THE SHAPE. `radialReach`
  // takes min(bounding sphere, oriented box) — both are honest UPPER
  // estimates, but for curved and elongated models the box can be noticeably
  // wider than the real silhouette, and then «the wall excess» will show squeezing through
  // where the item does not touch the wall. We compare the estimate with the TRUTH: a support
  // function over the geometry's vertices in the same direction.
  // ⚠️ We set the rotation OURSELVES and enumerate it — otherwise the number dances by pose (the same
  // rake as with the sag threshold). The item lives outside the pile and is demolished.
  reachProbe(name, n){
    const idx = TYPES.findIndex(t => t.name === name);
    if (idx < 0) return null;
    const N = n || 24, out = [];
    for (let k = 0; k < N; k++){
      const it = makeItem(idx, 1);
      it.p.set(0, 500, 0); it.mesh.position.copy(it.p);
      // a deterministic enumeration of poses: three angles from the index, without Math.random
      it.mesh.rotation.set(k * 0.7, k * 1.3, k * 2.1); it.mesh.updateMatrixWorld();
      createItemBody(it, TYPES[idx].name, it.geo);
      const ux = 1, uz = 0;                      // the radial direction — along X, the item is in the centre
      const estimate = radialReach(it, ux, uz);
      // truth: the maximum projection of the vertices onto the same axis, with the rotation and the scale taken into account
      const P = it.geo.attributes.position.array, q = it.mesh.quaternion;
      const v = new THREE.Vector3(); let truth = 0;
      for (let i = 0; i < P.length; i += 3){
        // ⚠️ ONLY `it.scl` — it ALREADY includes MESH_SCALE (40-items: scl = s·MESH_SCALE),
        // exactly as in radialReach. The first version multiplied by it once more, and «the truth»
        // came out 0.62 smaller: for the orange 0.381 instead of 0.62, that is, the probe
        // credited the metric with a margin it does not have. It is caught by comparison with the r of a round
        // model — for it the estimate and the truth must coincide.
        v.set(P[i], P[i+1], P[i+2]).applyQuaternion(q).multiplyScalar(it.scl);
        const pr = v.x * ux + v.z * uz;
        if (pr > truth) truth = pr;
      }
      out.push({ estimate: +estimate.toFixed(3), truth: +truth.toFixed(3),
                 margin: +(estimate - truth).toFixed(3) });
      destroyItemBody(it);
      if (it.mesh && it.mesh.parent) it.mesh.parent.remove(it.mesh);
    }
    const z = out.map(x => x.margin).sort((a, b) => a - b);
    return { poses: N, marginMed: z[Math.floor(N/2)], marginMax: z[N-1],
             estimateMax: Math.max(...out.map(x => x.estimate)),
             truthMax: Math.max(...out.map(x => x.truth)) };
  },
  // ⚠️⚠️ A SAG THRESHOLD PROBE. The rescuer's threshold is relative — a fraction of the
  // VERTICAL thickness of the item in its current pose, — and on a live pile it dances:
  // `makeItem` turns the mesh by `Math.random()` around three axes (40-items), while the body
  // takes the quaternion from exactly there (50-physics). That is why a guard on the pile is red
  // every other time ON A HEALTHY BUILD — I have already been burned by this.
  // ⚠️ THE KEY LINE IS ZEROING THE ROTATION before creating the body: then
  // downReach = scl · half.y, without a single random number. The item lives outside
  // the pile (y=500) and is demolished at once, it does not affect the level — the holeProbe pattern.
  // ⚠️ The threshold is taken from `floorPenLimit`, THE SAME function the rescuer uses:
  // a guard must not recompute the formula at home, otherwise it guards
  // its own copy and not the live game.
  penProbe(name){
    const idx = TYPES.findIndex(t => t.name === name);
    if (idx < 0) return null;
    const it = makeItem(idx, 1);
    it.p.set(0, 500, 0); it.mesh.position.copy(it.p);
    it.mesh.rotation.set(0, 0, 0); it.mesh.updateMatrixWorld();
    createItemBody(it, TYPES[idx].name, it.geo);
    const out = { limit: +floorPenLimit(it).toFixed(4), thickness: +downReach(it).toFixed(4),
                  absolute: FLOOR_PEN_MAX };
    destroyItemBody(it);
    if (it.mesh && it.mesh.parent) it.mesh.parent.remove(it.mesh);
    return out;
  },
  // ⚠️⚠️ A HOLE PROBE: IS THE CENTRE of the item free — we ask the SHAPE itself
  // (`containsPoint`), there is NO raycast here on purpose (see below, why).
  // The only honest way to ask «is the hole real or has it been filled in»:
  // counting the colliders is not enough — their number tells which BRANCH ran, and not
  // whether the centre is passable. The body is built aside (y=500), demolished at once, it does not
  // affect the level.
  // ⚠️ We shoot the ray ALONG THE AXIS found by the same logic that builds the ring
  // (the plane with the greatest rmin/rmax ratio) — otherwise the probe would measure the wrong thing.
  holeProbe(name){
    const idx = TYPES.findIndex(t => t.name === name);
    if (idx < 0) return null;
    const it = makeItem(idx, 1);
    it.p.set(0, 500, 0); it.mesh.position.copy(it.p);
    createItemBody(it, TYPES[idx].name, it.geo);
    if (world.propagateModifiedBodyPositionsToColliders) world.propagateModifiedBodyPositionsToColliders();
    // the hole axis — the same as in ringFromGeometry: we look by the vertices
    const P = it.geo.attributes.position.array, n = P.length / 3;
    const axes = [[0, 2, 1], [0, 1, 2], [1, 2, 0]];
    let best = null;
    for (const [u, v, ax] of axes){
      let rmin = 1e9, rmax = 0;
      for (let i = 0; i < n; i++){ const r = Math.hypot(P[i*3+u], P[i*3+v]);
        if (r < rmin) rmin = r; if (r > rmax) rmax = r; }
      if (rmax > 1e-4 && (!best || rmin/rmax > best.ratio)) best = { ax, ratio: rmin/rmax };
    }
    // ⚠️⚠️ NOT BY A RAYCAST. The first version of the probe shot a ray along the axis and declared
    // «there is a hole» IN ALL of them, including knowingly solid models: a freshly created
    // collider had not yet got into Rapier's query pipeline (it is updated by a world
    // step), and the ray met NOBODY. A classic green-on-everything probe.
    // `containsPoint` asks the SHAPE itself and does not require the pipeline.
    const colliders = it.body ? it.body.numColliders() : 0;
    let inside = false;
    for (let i = 0; i < colliders; i++){
      const c = it.body.collider(i);
      if (c.containsPoint({ x: it.p.x, y: it.p.y, z: it.p.z })){ inside = true; break; }
    }
    destroyItemBody(it);
    if (it.mesh && it.mesh.parent) it.mesh.parent.remove(it.mesh);
    return { hole: !inside, colliders: colliders, axis: ['x','y','z'][best.ax],
             ratio: +best.ratio.toFixed(3) };
  },
  underFloor(){
    return items.filter(i => i.alive && i.body && i.p.y < FLOOR_REST)
      .map(i => ({ name: i.type.name, y: +i.p.y.toFixed(3),
        low: +lowestPoint(i).toFixed(3), pen: floorPenetration(i),
        d: +Math.hypot(i.p.x, i.p.z).toFixed(2), sleeping: i.body.isSleeping(),
        touching: this.contacts(items.indexOf(i)).touching,
        bomb: !!i.bomb }));
  },
  // A RESCUER TEST HOOK, LOAD-BEARING: run the sweep SYNCHRONOUSLY. Without it the floor
  // guard would be a race — place() does NOT wake physics, and on a sleeping pile the sweep is
  // called by nobody (stepPhysics is not called at all), and a «green» would mean nothing.
  // ⚠️ syncMeshes IS MANDATORY: the rescuer moves the BODIES, while item.p is updated
  // only by synchronization. In the live game this does not matter (the next frame synchronizes
  // anyway), but here without it the hook would hand out old coordinates and
  // the guard «after the lift there is nobody under the floor» would fail on an empty spot.
  rescueNow(){ const n = rescueSweep(); syncMeshes(); return n; },
  // the type charge: state/grant/detonation (suite guards)
  charge(){ return chargeState(); },
  chargeGrant(name, ms){ chargeName = name; chargeUntil = performance.now() + (ms || CHARGE_TTL_MS); updateHUD(); return chargeState(); },
  detonateCharge(){ return detonateCharge(); },
  chainAt(){ return chainComboAt(); },
  // ⚠️⚠️ THE FOUR NUMBERS OF THE POUR, AS LIVE VALUES (2026-08-23-a «speed up their pouring»).
  // The suite cannot state «the tick got denser» by watching the clock: `combo().nextDropIn` is
  // the REMAINING time to the next tick, so catching a fresh one needs sampling faster than the
  // tick itself — and the sampler that fast is heavy enough to slow the game it is measuring
  // (measured: 23 samples in 3 s instead of 375, and the delivery read back as the OLD build's
  // number on a fixed build). The deciding values are these constants; the guard reads them from
  // here and pins them as twins of the spec, the same way the turbo ladder is pinned.
  // ⚠️ `airCap` is the ceiling inside chainRefill (40-items) and is duplicated here BY HAND —
  // it is a literal in a hot loop and there is nowhere else to read it from. If that loop's
  // number moves, move this one with it; the guard on it exists to make the pair notice.
  chainPour(){ return { tickMs: CHAIN_DROP_MS, perTick: CHAIN_DROP_N,
                        windowMs: CHAIN_DROP_WINDOW_MS, airCap: 10 }; },
  floaters(){
    // an item «hangs» if under its lowest point there is more than 0.35 of emptiness.
    // ⚠️ A single ray from the centre lies about «bridges»: a flat item (a steak) lies with its
    // ENDS on the neighbours, the centre is above a cavity, while near the wall the ray goes past
    // the floor disc through the wedge slits of the outer edges of the stepped panels
    // (soak 2026-07-20, seed 101). The honest support is Rapier's contact pairs:
    // a hanger = gap>0.35 AND contacts===0. contacts>0 with gap>0.35 is a «bridge», normal.
    const ray = new RAPIER.Ray({ x:0, y:0, z:0 }, { x:0, y:-1, z:0 });
    const out = [];
    for (const it of items){
      if (!it.alive || !it.body) continue;
      ray.origin.x = it.p.x; ray.origin.y = it.p.y - it.r - 0.02; ray.origin.z = it.p.z;
      if (ray.origin.y <= FLOOR_REST + 0.05) continue; // lies on the bottom
      // ⚠️ SENSORS ARE NOT SUPPORT: a phantom bottom (an inactive container, the bowl shatter)
      // would otherwise be counted as support and would HIDE the hangers — see the same
      // analysis at the accessibility ray in 60-access.
      const hit = world.castRay(ray, 30, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, null, null, it.body);
      // Rapier 0.12+ renamed toi -> timeOfImpact: with hit.toi the gap was
      // undefined, and floaters saw ONLY the cases «the ray did not hit at all»
      // (gap=30) — finite hangs stayed silent (found by the soak 2026-07-20)
      const gap = hit ? (hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi) : 30;
      if (gap > 0.35) out.push({ name: it.type.name, y: +it.p.y.toFixed(2),
        d: +Math.hypot(it.p.x, it.p.z).toFixed(2), gap: +gap.toFixed(2),
        contacts: this.contacts(items.indexOf(it)).touching, sleeping: it.body.isSleeping() });
    }
    return out;
  },
  // the narrow-phase contact pairs of item i: pairs — neighbours by AABB,
  // touching — those with real contact points. The pairs live on a sleeping pile too
  // (our global sleep does not call world.step, the graph stays from the last step);
  // -1 = the API is unavailable (insurance against a change of the Rapier version)
  contacts(i){
    const it = items[i];
    if (!it || !it.body || !world.contactPairsWith) return { pairs: -1, touching: -1 };
    let pairs = 0, touching = 0;
    try {
      for (let c = 0; c < it.body.numColliders(); c++){
        const col = it.body.collider(c);
        world.contactPairsWith(col, other => {
          pairs++;
          world.contactPair(col, other, m => { if (m.numContacts() > 0) touching++; });
        });
      }
    } catch (e){ return { pairs: -1, touching: -1 }; }
    return { pairs, touching };
  },
  accessibleList(){
    const out = [];
    items.forEach((it, i) => { if (it.alive && it.accessible) out.push(i); });
    return out;
  },
  // a snapshot by type: how many are alive and how many of them are accessible
  typesSnapshot(){
    const m = {};
    items.forEach(it => {
      if (!it.alive) return;
      const n = it.type.name;
      (m[n] = m[n] || { alive: 0, acc: 0 }).alive++;
      if (it.accessible) m[n].acc++;
    });
    return m;
  },
  // ⚠️ `shake` IN THE CAMERA SNAPSHOT IS A LOAD-BEARING FIELD (2026-08-11): without it «there is no shaking
  // during a match» would be checked by the tremor of the camera's TARGET, while what shakes is
  // the POSITION — the guard would measure a neighbouring property and would be green at any strength.
  cam(){ return { az: +camAz.toFixed(3), phi: +camPhi.toFixed(3), r: +camR.toFixed(2), ty: +camTarget.y.toFixed(2), shake: +camShake.toFixed(3), intro: !!intro, fly: !!hintFly }; },
  // debug: setting the camera distance (zoom tests: the bowl glass, the showcase)
  setCamR(v){ camR = Math.max(6, Math.min(24, +v || camR)); updateCamera(); },
  // THE PRIMITIVES FOR ADS (the contract with the INTEGRATION 2026-07-23). The live
  // consumer is 78-ads: pause(true) when entering the display, resume() on ALL
  // exits, but ONLY if pause returned true (otherwise we would lift somebody else's pause
  // from visibilitychange, which the player is obliged to lift with the Continue button).
  pause(silent){ return pauseGame(silent); },
  resume(){ resumeGame(); },
  sound: Sound, // setMuted/isMuted — the external mute, independent of CFG.sound
  // debug: the pause state, the popup visibility and the EXTERNAL mute
  pauseState(){ return { paused: paused,
    overlay: $('pauseOverlay').style.display === 'flex',
    muted: Sound.isMuted() }; },
  // debug: searching for NaN in the items' state
  scanNaN(){
    const bad = [];
    items.forEach((it, i) => {
      const ok = isFinite(it.p.x + it.p.y + it.p.z)
        && isFinite(it.mesh.position.x + it.mesh.position.y + it.mesh.position.z);
      if (!ok) bad.push({ i, name: it.type.name, alive: it.alive, p: [it.p.x, it.p.y, it.p.z] });
    });
    return bad;
  },
  topY(){ let m = 0; for (const it of items) if (it.alive) m = Math.max(m, it.p.y + it.r); return m; },
  // debug/tests: the unique size multipliers of the live items (the spec
  // «the first 15 levels are one size»: up to and including lv.15 exactly [1])
  sizes(){
    const s = new Set();
    for (const it of items) if (it.alive && !it.surprise) s.add(+((it.scl || 0) / MESH_SCALE).toFixed(3));
    return [...s].sort((a, b) => a - b);
  },
  // the maximum EXCESS of an item's edge beyond the inner surface of the glass
  // (>0 — the item is visually inside the glass/outside; the tolerance is ~0.0 thanks to WALL_GAP)
  // ⚠️ A DISTRIBUTION, AND NOT A MAXIMUM. `maxWallExcess` hands out ONE sample per
  // run, and on it one can neither set a norm nor compare variants: the measurement
  // of 2026-07-31 showed that rare events over 8-16 runs give
  // the opposite ordering of the variants. Here — the excess of EVERY live item,
  // that is, close to two hundred samples in a single snapshot.
  wallExcessAll(){
    const out = [];
    for (const it of items){
      if (!it.alive) continue;
      const d = Math.hypot(it.p.x, it.p.z);
      // the EXACT reach: for elongated models the upper estimate overshoots more than
      // the alarm threshold itself (see radialReachExact in 50-physics)
      out.push(+((d + (d > 1e-3 ? radialReachExact(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r))) - wallDistAt(it.p.y, d > 1e-3 ? it.p.x/d : 1, d > 1e-3 ? it.p.z/d : 0)).toFixed(3));
    }
    return out;
  },
  // ⚠️⚠️ THE HEIGHT AND «IS THERE A WALL THERE» ARE LOAD-BEARING FIELDS, AND NOT DECORATION.
  // `radiusAt(y)` above the rim returns R1 FOREVER, while the physical walls
  // end at `WALL_TOP_Y`: the cone up to 9.2, the belt of the upper walls up to 13.3, above that —
  // open air. That is why «the wall excess» of an item at y=17 compares
  // it with a non-existent wall: it is not squeezing through the glass, it is simply
  // FLYING above the bowl (a top-up, a chain refill, an explosion).
  // ⚠️ THE MEASUREMENT this was started for: out of 19 soak alarms across all journals
  // ELEVEN came with y > 13.3 and ZERO from the wall belt itself. That is,
  // more than half of the invariant's signal was metric noise.
  // ⛔ THE RESCUER IS NOT CURED BY THIS AND IS NOT TOUCHED: for it the same formula means
  // something else — an item above the bowl and outside R1 will fall PAST the bowl, and returning it
  // inside is correct. The blind spot is in the DIAGNOSTICS, not in the mechanic.
  maxWallExcess(){
    let worst = -99, who = '', wy = 0;
    for (const it of items){
      if (!it.alive) continue;
      const d = Math.hypot(it.p.x, it.p.z);
      const ex = (d + (d > 1e-3 ? radialReachExact(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r))) - wallDistAt(it.p.y, d > 1e-3 ? it.p.x/d : 1, d > 1e-3 ? it.p.z/d : 0);
      if (ex > worst){ worst = ex; wy = it.p.y; who = it.type.name + ' y=' + it.p.y.toFixed(2) + ' d=' + d.toFixed(2)
        + ' wall=' + wallDistAt(it.p.y, d > 1e-3 ? it.p.x/d : 1, d > 1e-3 ? it.p.z/d : 0).toFixed(2) + ' r=' + it.r.toFixed(2); }
    }
    return { excess: +worst.toFixed(3), who, y: +wy.toFixed(2), walled: wy <= WALL_TOP_Y };
  },
  topItem(){ let best = null; for (const it of items) if (it.alive && (!best || it.p.y + it.r > best.p.y + best.r)) best = it;
    return best ? { name: best.type.name, y: +(best.p.y + best.r).toFixed(2), meshY: +best.mesh.position.y.toFixed(2), sleeping: best.body ? best.body.isSleeping() : null } : null; },
  // debug: leave one item of each type (for the mixer finale test)
  // ⚠️ A TEST LEVER: remove EXACTLY n ordinary items, without touching the treasure, the bomb and
  // the stones and without launching the effects. It was started because the window of the soft endgame
  // step is ONE VALUE of the counter (9), while a match removes a PAIR: «playing up to
  // the window» skips past it every other time, and during the attempts to play on the finale manages
  // to eat up the pile (measured three times, every time we arrived at zero). The scene
  // must be set up directly, and not by trying to hit it by playing.
  cull(n){
    let k = 0;
    for (const it of items){
      if (k >= n) break;
      if (!it.alive || it.surprise || it.bomb || it.frozen || it.animating) continue;
      removeItem(it); k++;
    }
    refreshAccessibility(); updateHUD();
    return k;
  },
  leaveSingles(){
    const seen = new Set();
    for (const it of items){
      if (!it.alive) continue;
      if (seen.has(it.key)){ removeItem(it); }
      else seen.add(it.key);
    }
    wakePhysics('leaveSingles');
    refreshAccessibility(); updateHUD();
  },
};

// The start is asynchronous: first the WASM initialization of Rapier
if (!window.RAPIER){
  window.__fatal && window.__fatal('Physics engine (Rapier) failed to load.');
} else {
  RAPIER.init().then(() => {
    initPhysicsWorld();
    resize(); updateCamera(); Ads.init(); genLevel(); loop();
    // ⚙️ THE TUNING PANEL BY URL (the owner's request 2026-08-02: «by address»).
    // `?matcap=1` opens matcapTuner right away — the browser console is not needed.
    // ⚠️ AFTER loop(), and not before: the panel reads the live values of the materials, and before
    // the first frame some of them have not been created yet.
    // ⚠️ Exactly the same trick as with `?hour=N` — a force hook in the query string, so that
    // the owner can look for himself without touching the code and without opening devtools.
    try { if (/[?&]matcap=1/.test(location.search)) matcapTuner(); } catch(e){}
    grabKeyFocus(); // Space works from the first frame, without a click on the bowl
    // ⚠️ THE «THE GAME HAS COME UP» FLAG — by it window.onerror (shell.html) stops
    // burying the session with a fatal screen. Before this line an error really
    // means «it did not start», after it the game is already running, and a crash of somebody else's
    // script is no reason to kill the session (the owner's complaint 2026-07-29 from a screenshot:
    // «Failed to start 3D — Script error.» on a working game).
    window.__booted = true;
  }).catch(e => { window.__fatal && window.__fatal('Physics init failed: ' + e.message); });
}

// ⚠️ THE SERVICE INTERFACE IS REMOVED IN THE LIVE BUILD (the owner's spec 2026-07-29).
// It is not cut out but closed off: the whole suite stands on it, and by cutting it out we would be testing
// something other than what we ship. In the live build window.__game is simply absent —
// together with it starGrant (hand out currency), buyBundle (a $19.99 bundle for
// free), setLevel and boostSetClock (move the timestamp on which
// the protection against clock tampering rests) are closed off. To open it on the live site: ?dev=1.
if (!DEV){ try { delete window.__game; } catch(e){ window.__game = undefined; } }
