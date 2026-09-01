// ===== 80-gameplay: matches, tap, mixer, shake, win/lose =====

// THE SINGLE POINT OF SCORE PENALTIES (the owner's balance table 2026-07-22).
// Level 1 — no penalties at all (returns false: we don't draw the «−N» pop, so as
// not to lie); levels 2..SCORE_CLAMP_LEVELS — the score is clamped at zero from
// below (the penalty is shown, but it doesn't take you negative); beyond that —
// the full minus.
// The mixer's mechanic (eating items) does NOT depend on the level — only the score does.
function scorePenalty(n){
  if (levelNum <= SCORE_NO_PENALTY_LEVELS) return false;
  // ⚠️ THE BOOSTER MULTIPLIES THE PUNISHMENT TOO (the owner's decision 2026-07-28):
  // under x5 a miss is −50, a grind −100. Symmetry with the reward: flat −10/−20
  // against a «+700» backdrop turned the punitive side into noise exactly inside
  // the paid window.
  // The zero clamp is applied AFTER the multiplication — a newcomer
  // (lv.<=SCORE_CLAMP_LEVELS) under the booster does not fly into the minus faster
  // than without it.
  stats.score -= Math.round(n * scoreBoostMult());
  if (levelNum <= SCORE_CLAMP_LEVELS && stats.score < 0) stats.score = 0;
  return true;
}

// A group of N>=2 items identical by TYPE: all of them split into pixels;
// score 10*N*(N-1) × combo × the type's ACCUMULATION MULTIPLIER (the owner's spec
// 2026-07-22: accumulated merges grow the type's price, accMult in 77-save)
function doMatch(list){
  if (level) level.stuck = 0; // a successful move burns the «Look around» grace period
  // ⛔⛔ ONE COLLECTED PAIR RESETS THE PRICE OF A MISTAKE TO THE BASE (the owner's word
  // 2026-08-24-b). The reset sits HERE and nowhere else, deliberately: `doMatch` is called only
  // with a CONFIRMED merge list, from all three merge paths (a live tap, autoMatch, matchType) —
  // a rejected tap never reaches this line. ⚠️ The type charge, the bomb, the bowl-shatter
  // collection and the ice break do NOT reset: none of them is «collecting a pair» — they are
  // rescues and bonuses with their own paths. A dispatcher's default, named to the owner.
  // ⚠️ `stats.misses` is NOT touched — the turbo rules read it as a delta, and
  // `chainStartMisses = stats.misses` a few lines below is one of them.
  stats.missRun = 0;
  // COMBO: a group of 3+ at once, or a second merge within COMBO_CHAIN_MS, or a match
  // while the boost is already burning — radius up to COMBO_RADIUS and SCORE
  // ×COMBO_SCORE_MULT for COMBO_MS (the window is extended by every match — the fever
  // lives as long as the player is fast; the first match of the chain goes at the
  // ordinary price)
  const nowMs = performance.now();
  const comboHot = list.length >= 3 || nowMs - lastMatchMs < COMBO_CHAIN_MS || comboUntil > nowMs;
  // (the tempo ladder — seriesMult is declared below doMatch, functions are hoisted)
  {
    const wasHot = comboUntil > nowMs;
    lastMatchMs = nowMs;
    if (comboHot){
      // THE TEMPO PACKAGE (the owner's spec 2026-07-31): a NEW ignition starts the
      // series count at 1 — comboCount used to survive a stale window and pile up
      // across pauses (turbo got assembled out of several sluggish series, and the
      // ×3 ladder would have started instantly). Now a series = continuous tempo.
      comboCount = wasHot ? comboCount + 1 : 1;
      // BOWL SHATTER, the combat unit «series collected» (5-7 per level — the
      // owner's word): every BOWL_SERIES_LEN CONTINUOUS matches of the chain =
      // 1 credit. We take it at the moment comboCount grows — entering turbo further
      // down the file «spends» the series (comboCount = 0) without touching the
      // credits already earned.
      // The credit is LOUD (no silent): a rare event (5-7 times per level),
      // crunch+vibro — «a blow to the bowl»; the eyes will take the subtle indication.
      if (BOWL_CRACK_ON === 'series' && comboCount > 0 && comboCount % BOWL_SERIES_LEN === 0) bowlCrackAdd();
      // historical bench mode: 'peak' — the chain record (cancelled by the owner)
      else if (BOWL_CRACK_ON === 'peak' && comboCount > ((level && level.bowlCracks) || 0)) bowlCrackAdd(true);
      // the window LEAKS AWAY and shrinks with the series length (it used to be a flat COMBO_MS)
      comboUntil = nowMs + seriesWindowMs(comboCount);
      comboLevel = Math.min(COMBO_STEPS, comboLevel + 1); // +one radius tier per match of the series
      if (!wasHot){
        const mid0 = new THREE.Vector3();
        list.forEach(it => mid0.add(it.p));
        mid0.multiplyScalar(1/list.length).y += 0.9;
        // the owner's spec: no emoji; «Combo ×2» melts away — and IMMEDIATELY from
        // the same place, with the same effect, «Radius Up» flies out
        scorePop('Combo ×' + COMBO_SCORE_MULT, mid0, '#ff9d2e', true);
        // BOWL SHATTER: mode 'combo' — a crack on EVERY ignition of a series
        if (BOWL_CRACK_ON === 'combo') bowlCrackAdd();
        const mid1 = mid0.clone();
        setTimeout(()=>{ scorePop('Radius Up', mid1, '#ff9d2e', true); }, 800);
        Sound.play('combo');
        vibrate([20, 40, 30]); // a double pulse — distinguishable from the single 15/40 ms ones
      }
      // the tempo ladder: crossing the ×3 threshold — a short pop in the same style
      // (this is NOT a gauge — a one-off moment, like «Combo ×2»; the permanent
      // display of tempo is carried by the EYES, the Interface zone)
      if (comboCount === SERIES_X3_AT){
        const mid3 = new THREE.Vector3();
        list.forEach(it => mid3.add(it.p));
        mid3.multiplyScalar(1/list.length).y += 0.9;
        scorePop('×' + SERIES_MULT_X3 + '!', mid3, '#ff9d2e', true);
      }
      // the series has been pushed all the way to the chain reaction. A SECOND turbo
      // assembled INSIDE an active one is a «TURBO SERIES» (the owner's spec
      // 2026-07-21): the window restarts, chainSeries grows (the interface hangs
      // eyes-5 on >=2). The !chainUntil gate used to make this impossible — the
      // review question «comboCount piles up, but the next one cannot be ignited»
      // is closed by this decision of the owner's.
      if (comboCount >= chainComboAt() && !level.over){ // the turbo entry threshold grows with the level
        const again = chainUntil > nowMs; // assembled a turbo without leaving turbo
        chainSeries = again ? chainSeries + 1 : 1;
        chainUntil = nowMs + CHAIN_MS;
        chainStartMisses = stats.misses;
        if (!again) chainNextDrop = nowMs + 600; // an active chain's refill is already ticking
        comboCount = 0; // the series is «spent» on the launch — the next one piles up anew
        // THE «TYPE CHARGE» DROP (the owner's spec 2026-07-31, 00-config):
        // 1/level (level.chargeGiven) and only into an empty slot. The type is random
        // among the LIVE ones with >= CHARGE_MIN_COPIES copies: below that threshold
        // the charge would blow up 1-2 items and disappoint (measurement: median
        // copies 14 early / 6 at lv.25).
        tryGiveCharge();
        const mid1 = new THREE.Vector3();
        list.forEach(it => mid1.add(it.p));
        mid1.multiplyScalar(1/list.length).y += 1.6;
        scorePop(again ? ('Power chain ×' + chainSeries + '!') : 'Power chain!', mid1, '#ff5a3c', true);
        // BOWL SHATTER: mode 'chain' — a crack on entering turbo (the original
        // design; a turbo series, again, is a boost too). In mode 'combo' we do
        // NOT add here — otherwise one series would be counted twice.
        if (BOWL_CRACK_ON === 'chain') bowlCrackAdd();
        // ⚠️ TOSSING THE PILE UP ON ENTERING TURBO (the owner's spec 2026-07-28
        // «toss all the things up, as if it were a shake at the start») — it replaced
        // the lightning as the entry marker. performShake() does NOT deduct charges
        // (the deduction lives at the callers: useFreeShake and others), so this is
        // a pure effect, not a free shake-resource.
        if (TURBO_SHAKE) performShake();
        Sound.play('chain');
        vibrate([30, 50, 30, 50, 60]);
        updateMatchRadius();
      }
    }
  }
  // chain-reaction lightning: a discharge from the tapped item to every item of the group
  if (chainUntil > performance.now() && list.length > 1){
    for (let i = 1; i < Math.min(list.length, 9); i++){
      boltFX(list[0].p, list[i].p);
      // ⚡ AND A FLASH WHERE EACH BOLT LANDS (the owner 2026-08-30). Effect 3 by his choice —
      // the pack's only COOL one (cyan, hue 197°), so the discharge reads as electric rather
      // than as another warm burst; it is forced by index, bypassing the material map, because
      // it belongs to the EVENT and not to what was hit.
      // ⚠️ Up to EIGHT of these land in one frame, which is why the shared-texture fix in
      // spawnHitFx had to come first: with the old per-instance clone this loop alone would
      // have uploaded ~27 MB to the GPU in that frame.
      spawnHitFx(list[i].p, list[i].r, null, HITFX_BOLT);
    }
  }
  // ⚠️ MEASUREMENT OF THE doMatch TAIL (handed over by Graphics: they measured the pops
  // and the save, 0.34 ms out of 4.1). Tearing down the bodies is their prime suspect:
  // removing a collider rebuilds the broad phase, and we have 599 proxies.
  const _td0 = performance.now();
  list.forEach(it => { it.animating = true; it.animStartMs = nowMs; destroyItemBody(it); }); // bodies leave the world at once; the mark is for the rescuer of stuck deletions (99-main)
  tapDestroyMs += performance.now() - _td0;
  wakePhysics('gameplay:L7'); // the neighbours start to settle
  stats.matches++;
  stats.lastAction = performance.now();
  const n = list.length;
  const mid = new THREE.Vector3();
  list.forEach(it => mid.add(it.p)); mid.multiplyScalar(1/n);
  // ACCUMULATION: the type's counter is incremented BY the group's N items BEFORE the
  // score is computed — a match that crossed a tier threshold already goes at the new
  // multiplier (the tier-up and the fat score arrive as one moment); the toast event
  // (onAccTierUp) throws accAdd at the moment of the crossing (the owner's spec).
  const typeName = list[0].type.name;
  const _ta0 = performance.now();
  accAdd(typeName, n, list[0]);
  frozenCredit(typeName, n);                 // credit of pairs into the ice blocks of this type
  tapAccMs += performance.now() - _ta0;      // the type's accumulation + writing the save
  // ⚠️ The purchased booster is the LAST multiplier of the stack (combo ×2 × accumulation
  // up to ×3.25 × booster up to ×5). ⚠️ IT MULTIPLIES THE PENALTIES TOO (the owner's
  // decision 2026-07-28, the single point scorePenalty above) — the former caveat «the
  // punishment is not touched» is CANCELLED: flat −10/−20 against a «+700» backdrop made
  // the punitive side noise exactly inside the paid window.
  // THE TEMPO LADDER instead of a flat ×2 (the owner's spec 2026-07-31): ×2 from the
  // ignition, ×3 from the SERIES_X3_AT-th match of the series, ×4 in turbo. The single
  // point is seriesMult; by this line comboCount is already incremented (a match that
  // crossed the threshold goes at the new multiplier — as with the accumulation tiers).
  // 🔥 THE FIRE BONUS (the «hot item» mechanic, the owner's word 2026-08-01):
  // collect a group of the BURNING type while it burns — the group's score ×FIRE_BONUS_MULT.
  // The check is by TYPE via burningName (the seam with Graphics); collecting PUTS OUT the
  // fire — the bonus is one-off, the next flare-up goes by its own schedule
  // (tickFireSpawn counts from the moment of the flare-up, not from the extinguishing).
  const fireHot = typeName === burningName();
  if (fireHot) extinguishAll();
  // A pair from the FINAL TOP-UP (the refill mark, 40-items): base price only — the series
  // and fire multipliers do not work (a promise to the owner); the type's upgrade and the
  // purchased booster stay — they are not series-based.
  const hasRefill = list.some(i => i.refill);
  const gained = Math.round(MATCH_SCORE * n * (n-1) * ((comboHot && !hasRefill) ? seriesMult(nowMs) : 1) * accMult(typeName) * scoreBoostMult() * ((fireHot && !hasRefill) ? FIRE_BONUS_MULT : 1));
  // the multiplier toast under the eyes (node 829:1242): only for upgraded types
  // ⚠️ ONLY WHEN THE MULTIPLIER GREW DURING THIS RUN (the owner's word 2026-08-05:
  // «the toast under the eyes is shown only if the item's multiplier was increased
  // during play»). It used to pop up on EVERY collection of an upgraded kind — that
  // is, on an upgrade bought long ago as well, and it turned into noise. The growth
  // event comes from accAdd (a tier being raised) and from buying the booster —
  // both go through showTierUp -> showMultToast(..., true).
  // ⛔⛔ THE PER-COLLECTION TOAST IS REMOVED ENTIRELY (the owner's word 2026-08-23-a; asked
  // and answered — «only the level-up, once per level»). ⛔ THIS CANCELS HIS OWN SPEC OF
  // 2026-08-05 quoted just above: «the toast under the eyes is shown only if the item's
  // multiplier was increased during play». That spec had already narrowed the trigger once
  // (it used to fire on EVERY collection of an upgraded kind); this batch closes the
  // remaining half.
  // ⚠️ WHY REMOVED AND NOT ALSO GATED: his complaint is that the thing is on screen too
  // often. Keeping this call and gating only the rarer tier-up would have left the pill
  // popping on every collection of a kind that grew this run, i.e. the complaint would have
  // survived the fix untouched. The tier-up path (showTierUp → showMultToast) is now the
  // ONLY producer, and it is gated to once per level.
  // ⚠️ `level.multAtStart` STAYS ALIVE — it is a snapshot the win screen and the meta read;
  // it is not this toast's private state, and deleting it here would break other readers.
  const scoreBefore = stats.score;
  stats.score += gained;
  const shownGain = scoreShownDelta(scoreBefore, stats.score); // denom. gain of the chip (#10)
  const _tf0 = performance.now();
  popFX(mid);
  // «POINT 5» (the owner's spec 2026-07-21): variety of effects BY RULE.
  // A pair/triple — crumble as before; a group >= BURST_MIN_N BURSTS with the effect of
  // its own pack (burstFX) + a physical wave makes the neighbours flinch, starting from
  // the tapped one (list[0]); in a combo/chain the lightning stays on top — as it was.
  // ⚙️ THE COLLAPSE (the owner's choice 2026-08-01): the group FLIES TOGETHER into the tap
  // point and bursts with ONE event from there. Before, every item shrank in place and gave
  // out its own little cloud — the effect read as «a replacement for the item», not as a blow.
  // ⚠️ THE PACK RULE (BURST_MIN_N) IS PRESERVED as it was: a group >= 4 bursts with the
  // effect of its own pack, a pair/triple — with crumble. Only the PLACE changed (the tap
  // point instead of N positions) and the COUNT (one event instead of N).
  const burst = n >= BURST_MIN_N;
  const boomAt = list[0].p.clone();   // the tap point: list[0] is the tapped item
  const boomGhost = { p: boomAt, r: list[0].r * 1.25, type: list[0].type,
                      // geo — for the SHAPE of the impact ring: it is taken from the item's
                      // own bounds (ringFamFor in 70-fx), and not from a hash of the name
                      geo: list[0].geo,
                      fxColor: list[0].fxColor, baseColor: list[0].baseColor };
  collapseFX(list, boomAt);
  // the match-hit flash (the owner's word 2026-08-30, flashyfeather vol2 — 37-hitfx/70-fx)
  spawnHitFx(boomAt, list[0].r, list[0].type && list[0].type.name);
  if (burst){ const _tw0 = performance.now(); blastWave(boomAt, BURST_WAVE_R, BURST_WAVE_V);
    tapWaveMs += performance.now() - _tw0; }
  // the number is the denominated gain of the chip (#10: «clear while it happens»);
  // the ×(n−1) multiplier stays as a label (not score)
  // ⚠️⚠️ THE NUMBER'S OUTLINE IS ALWAYS FROM THE PALETTE, NO EXCEPTIONS (the owner's word
  // 2026-08-17-d: «the outline on the score is still orange, and it needs to be multi-coloured
  // with contrast against white»).
  // ⛔ WHAT STOOD HERE WAS `comboHot ? '#ff9d2e' : …`, and that was MY UNFINISHED WORK, and
  // not a «still»: I left the orange as a «state signal» without reckoning THAT the player
  // plays INSIDE a combo almost all of the time (it ignites on a group of three or on a
  // second match within 1.5 s). That is, the exception ate the rule: only the rare single
  // matches came out coloured, and in combat the colour was one.
  // ⚠️ THE COMBO SIGNAL IS NOT LOST: it is carried by SEPARATE captions — «Combo ×2»,
  // «Radius Up», «Power chain!» — they stay orange higher up in the function.
  scorePop('+' + shownGain, mid, popOutlineColor(), false);
  if (n > 2) scorePop('×' + (n-1), mid.clone().add(new THREE.Vector3(0, 1.2, 0)), '#f5a623', true);
  if (fireHot) scorePop('Fire ×' + FIRE_BONUS_MULT + '!', mid.clone().add(new THREE.Vector3(0, 1.8, 0)), '#ff5a3c', true);
  tapFxMs += performance.now() - _tf0;       // popFX + the collapse + the wave + two score pops
  // the pitch of the «bloop» grows with the series length (the tempo package) — an audio ladder
  const _ts0 = performance.now();
  // ⚠️ THE MATERIAL IS TAKEN BY THE TYPE'S NAME (`typeName` above — the very thing that
  // decides the match), and not by the pack `tex`: a pack is an atlas of pictures, and one
  // `food` pack holds juicy fruit, and baked goods, and ice cream — they must not sound
  // the same. The breakdown is docs/MATERIAL-SOUND-MAP.md.
  // ⚠️ SIZE AND PANNING ARE ONLY FOR THE RECORDED VOICES OF THE MATERIAL (the owner's
  // word 2026-08-10 «make web audio varied only for the 3 new sounds»). The procedural
  // «bloop» ignores them — it is further down the branch in 75-audio.
  // ⚠️ PANNING IS COMPUTED AS A SCREEN PROJECTION, and not as world X: the bowl gets
  // rotated, and on a camera turn the world coordinate would give sound from the LEFT for
  // an item the player sees on the RIGHT. The same trick as with picking a pixel for the
  // tests (`visiblePixel`) and with the score pops — the camera is already there, there is
  // nothing to invent.
  // ⚠️ 0.6 IS NOT THE FULL SWING: the bowl occupies the middle of the screen, and hard
  // panning in headphones reads as «the sound drove out of the game». A hint is enough.
  const _pan = (function (){
    try { const s = boomAt.clone().project(camera);
      return Math.max(-1, Math.min(1, s.x)) * 0.6; } catch (e) { return null; }
  })();
  // ⚠️ `p` IS THE PACK, AND IT IS TRIED BEFORE THE MATERIAL (his word 2026-09-01-b, «pack beats
  // material»). Read off the live item rather than looked up by name: `list[0].type.tex` is the
  // same field the atlas and the matcap tiers key on, so the three cannot drift apart.
  Sound.play('match', { n, k: comboHot ? comboCount : 0, m: materialOf(typeName),
                        p: (list[0].type && list[0].type.tex) || null,
                        r: list[0].r, pan: _pan });
  vibrate(15);
  tapSndMs += performance.now() - _ts0;      // synthesis of the «bloop» + vibro
  if (MATCH_CAM_SHAKE && n > 2) camShake = Math.max(camShake, 0.12); // juice for the big groups
  setTimeout(()=>afterPause(()=>{
    // ⚠️ THE BANG IS HERE, ON THE SAME CLOCK AS THE DELETION. The drawing-together runs on
    // GAME time (the addFX tick), the deletion — on REAL time (this setTimeout).
    // On a sagging FPS the tick does not run to the end, and the bang, hung on it, would
    // not have come at all. One clock for «the items disappeared» and «it went boom».
    // ⚡ THE IMPACT (the testers' task 2026-08-06 «more drive when connecting»):
    // a ring + a flash + arrows on top of the previous carrier. It stands HERE, on the same
    // clock as the bang and the deletion — for the same reason as the paragraph above. The
    // pack effect goes only to groups >= BURST_MIN_N, while the impact goes to EVERY
    // connection; its size grows with n (a pair's is the most modest).
    impactFX(boomAt, n, boomGhost.fxColor || boomGhost.baseColor, boomGhost, fireHot);
    // 🔥 THE FIRE SPLASH (the owner's word 2026-08-06 «when a fiery object is merged, on
    // the merge make a visual splash of fire»). The layer is ADDITIONAL: the impact, the
    // ring and the crumble stay, the fire lies on top — otherwise the moment of the ×2
    // bonus would not visually differ from an ordinary match.
    if (fireHot) fireBurstFX(boomAt, n);
    if (burst) burstFX(boomGhost); else dissolveFX(boomGhost);
    popFX(boomAt);
    // the camera kick grows with the group too: a pair's is as before, a group at the cap — double
    if (MATCH_CAM_SHAKE) camShake = Math.max(camShake, COLLAPSE_SHAKE * (1 + Math.min(1, (n - 2) / Math.max(1, MATCH_MAX_N - 2))));
    list.forEach(removeItem);
    wakePhysics('gameplay:L28'); // the mass above the deleted ones must settle
    // ⚠️ LOCALLY AROUND THE COLLAPSE POINT (79-86 ms of a full pass used to land on EVERY
    // match; the background will finish the rest within 0.8 s) — see 60-access
    refreshAccessibilityNear(boomAt); updateHUD(); checkEnd();
  }), 150);
}
// ===== Burst effects by pack («point 5», the owner's spec 2026-07-21).
// The STARTING implementations of the PHYSICS zone via the public addFX — 70-fx is not
// touched (sphereFX-style life cycle: material/geometry are personal, stepFX disposes
// of them itself). Polishing/moving into 70-fx is up to GRAPHICS
// (a cross-zone request in WORKSTREAMS). The ballistics are PARAMETRIC
// (position from t=k·life, not per frame) — FPS-independent.
// A tap on a STONE (the owner's spec 2026-07-22): a DOUBLE miss penalty as teaching
// that «stones do not merge». The mechanic mirrors penalize (70-fx) with a sum of
// 2×MISS_PENALTY: «level 1 without penalties» and the zero clamp for lv.2..5 are
// carried by the single point scorePenalty; misses and the cut of combo tiers are as
// with a standard miss.

// A DOUBLE PENALTY FOR A TAP ON SOMETHING NON-MERGEABLE (2×MISS_PENALTY).
// ⚠️⚠️ IT COMES FROM THE STONES (`penalizeRock`), but THE STONES WERE DELETED 2026-08-17
// while the function is ALIVE — the ICE BLOCK calls it on an early tap: the owner's spec
// on the ice says verbatim «the penalty is LIKE THE STONE'S». Tearing it down together with
// the stones would have quietly changed the ice mechanic, so it was renamed, not deleted.
function penalizeDouble(item){
  stats.misses++;
  stats.missRun = (stats.missRun | 0) + 1;
  const before = stats.score;
  // ⛔ DOUBLE OF THE **CURRENT** RUNG, NOT OF THE FIRST ONE (2026-08-24). The ice spec says
  // «the penalty is LIKE THE STONE'S», i.e. twice a miss — and once the price of a miss
  // climbs, «twice a miss» climbs with it. Pinning it to 2×MISS_PENALTY would have quietly
  // turned the ice into the CHEAPEST mistake of a long level.
  // ⚠️ Since 2026-08-24-b the ordinal is `missRun` (mistakes since the last merge), zeroed at
  // the head of `doMatch` — the same rule as in `penalize`, incremented above the charge.
  const charged = scorePenalty(2 * missPenaltyFor(stats.missRun, levelNum));
  const shown = scoreShownDelta(stats.score, before); // the positive magnitude of the chip's drop (#10)
  // a tap on something non-mergeable is a miss too: the turbo build-up is zeroed (the owner's
  // spec 2026-07-27), the radius ladder loses its 2 steps. Symmetrical to registerMiss.
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = 0; // the turbo build-up — from zero
    updateMatchRadius(); updateHUD();
  }
  try { bowlStreakReset(); } catch(e){} // the bowl streak: a miss on something non-mergeable = a mistake
  try { noteMissRadius(); } catch(e){} // the radius penalty — as with an ordinary miss (2026-08-11)
  // ⚠️ THE SAME PAIR AS IN `penalize` — the red pop and the reddening chip, under one gate.
  if (charged && shown > 0){
    scorePop('-' + shown, item.p.clone().setY(item.p.y + 0.6), MISS_COLOR, false);
    scoreFlashMiss();
  }
  Sound.play('miss');
  vibrate(20);
  wiggle(item);
  updateHUD();
}

// THE BLACK BOMB-BALL (the owner's spec 2026-07-22): a tap = an explosion of the NEAREST
// neighbours (the gap between the enclosing spheres <= BOMB_RADIUS, cap BOMB_MAX), no score.
// The object's behaviour is the PHYSICS zone (rule 9). The victims leave with the pack
// effects of «point 5» (juice/sparks/stars — an explosion is varied for free), the bomb
// itself — with a dark crumble; the wave is stronger than the burst one (BOMB_WAVE_V) —
// the pile flinches.
// The explosion does NOT touch combos/series (it is not a match); it does not affect the
// surprise or the other bombs.
// THE CREDIT OF PAIRS INTO ICE BLOCKS IS THE ONLY POINT (a copy of a count next to the
// working one is the canonical source of divergences). We count in PIECES: 2 collected
// pieces of a type = a pair; odd groups do not lose the half. Readiness is given by the
// pulse (the tick in 99-main), the breaking is up to the player (the owner's word «a tap
// is needed»).
function frozenCredit(typeName, n){
  for (const it of items){
    if (!it.alive || !it.frozen || it.frozenReady || it.frozenType !== typeName) continue;
    it.frozenGotItems = Math.min(it.frozenNeedItems, it.frozenGotItems + n);
    iceCracks(it);                                   // the cracks deepen
    try { Sound.play && Sound.play('crunch'); } catch(e){}
    if (it.frozenGotItems >= it.frozenNeedItems){ it.frozenReady = true; }
  }
}
function breakIce(it, byBomb){
  wakePhysics('frozen');
  stats.lastAction = performance.now();
  try { Sound.play && Sound.play('crunch'); } catch(e){}
  // THE BREAK-UP «LIKE THE BOWL» (the owner's word 2026-08-13): the crust detaches into the
  // world and flies apart in its OWN Voronoi pieces (iceBoomStart, a vertex shader);
  // the shardFX shards stay as fine crumb ON TOP of the pieces, as with the bowl
  iceBoomStart(it);
  try { shardFX(it.p.clone(), 0xbfe8ff, { count: 12, size: 0.07, life: 0.6 }); } catch(e){}
  it.frozen = false; it.frozenReady = false;
  it.key = it.frozenKey;                             // the item is PAIRABLE again
  // «the item's clean score ×3» — MATCH_SCORE × 3 × the type's multiplier × the booster.
  // ⚠️ BY BOMB — NO SCORE (the default, stated to the owner): an early thaw without the
  // condition being fulfilled is not paid for.
  if (!byBomb){
    const before = stats.score;
    const gained = Math.round(MATCH_SCORE * FROZEN_BREAK_MULT * accMult(it.key) * scoreBoostMult());
    stats.score += gained;
    const shown = scoreShownDelta(before, stats.score);
    try { scorePop('+' + shown, it.p.clone().setY(it.p.y + 0.6), '#bfe8ff', true); } catch(e){}
  }
  try { popFX(it.p); } catch(e){}
  try { refreshAccessibility(); } catch(e){}
  try { updateHUD(); } catch(e){}
}
function detonateBomb(bomb){
  bomb.animating = true;
  destroyItemBody(bomb);
  wakePhysics('bomb');
  stats.lastAction = performance.now(); // a tap = an action, the mixer is postponed
  // ⚠️ ICE BLOCKS: the bomb breaks the ice only POINT-BLANK (FROZEN_BOMB_RADIUS = the old
  // zone 2.86; the owner's choice «2», 2026-08-13). On the full zone 5.72 with a bowl of
  // ~8 the bomb reached an ice block from anywhere (measurement 10/10) and devalued the
  // condition of collecting pairs with a single tap. The item stays alive — we exclude it
  // from the victims, thaw it separately and WITHOUT the ×3 score.
  items.filter(i => i.alive && i.frozen && pairDist(i, bomb) <= FROZEN_BOMB_RADIUS)
       .forEach(i => { try { breakIce(i, true); } catch(e){} });
  const victims = items
    .filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && !i.frozen)
    .map(i => ({ i, d: pairDist(i, bomb) }))
    .filter(v => v.d <= BOMB_RADIUS)
    .sort((a, b) => a.d - b.d)
    .slice(0, BOMB_MAX)
    .map(v => v.i);
  victims.forEach(it => { it.animating = true; destroyItemBody(it); });
  popFX(bomb.p);
  dissolveFX(bomb);
  victims.forEach(it => burstFX(it));
  // «THE EXPLOSION LOOKS LIKE THE SHAKE EFFECT» (the owner's spec 2026-07-27-b): the wave
  // goes in TWO layers — a radial PUNCH inside the blast zone (the character of an explosion,
  // so that it does not become indistinguishable from a shake) + a JOLT across the WHOLE
  // pile, including the top (the entire mixer flinches — that very «like shake»). The punch
  // radius rides on BOMB_RADIUS via BOMB_WAVE_R_K, without hardcoding: the owner has already
  // changed that zone once.
  blastWave(bomb.p, BOMB_RADIUS + BOMB_WAVE_PAD, CFG.bombWaveV, CFG.bombJolt);
  // camShake is the DURATION of the shaking: we keep it BELOW the shake's (0.42), otherwise
  // the explosion would shake longer than it does at a four times smaller push (review 2026-07-27)
  camShake = Math.max(camShake, BOMB_CAM_SHAKE);
  Sound.play('shake');
  vibrate([40, 80, 50]); // the tactile force of the explosion to match the strengthened wave (the spec «strengthen the force», 2026-07-27)
  scorePop('BOOM', bomb.p.clone().setY(bomb.p.y + 0.9), '#1d1c26', true);
  const all = [bomb].concat(victims);
  const scales = all.map(it => it.mesh.scale.x);
  addFX(new THREE.Object3D(), 0.16, (o, k) => {
    const s = k < 0.45 ? 1 + 0.5*k : 1.22 * (1 - (k - 0.45)/0.55);
    all.forEach((it, i) => { it.mesh.scale.setScalar(scales[i]*Math.max(0, s)); });
  });
  setTimeout(() => afterPause(() => {
    all.forEach(removeItem);   // ⚠️ after the bang: BOWL_MERGE_MS + the pause
    wakePhysics('gameplay:L28'); // the mass above the explosion crater must settle
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 150);
}

// ===== DETONATION OF THE «TYPE CHARGE» (the owner's spec 2026-07-31; 00-config) =====
// A RESCUE, not a destruction (the owner's decision): accAdd keeps accumulating, the museum
// and the story milestones are honest, and the mixer IS ANGRY — the player has insolently
// rescued a whole type at once.
// It takes ALL the live ones of this type, INCLUDING the inaccessible ones — that is the
// charge's power: digging without a shake. Score: the group formula with the MATCH_MAX_N cap,
// ×the type's multiplier, WITHOUT the combo ×2 (the rationale is at CHARGE_MIN_COPIES). The
// deletion pattern is detonateBomb: animating → effects → afterPause → removeItem.
// The charge's state is RUNTIME, not the save (the owner's correction «it must not live
// longer than 7 seconds»): chargeName/chargeUntil; the expiry is checked by chargeTick from the loop.
let chargeName = '', chargeUntil = 0;
// THE TEMPO LADDER — the single point of the series multiplier (the tempo package 2026-07-31):
// ×4 in turbo, ×3 from the SERIES_X3_AT-th match of the series, otherwise the base ×2. Consumers:
// the crediting in doMatch and __game.series() (the Interface's eyes read the very same one —
// the display and the money cannot diverge by construction).
function seriesMult(nowMs){
  if (chainUntil > nowMs) return SERIES_MULT_CHAIN;
  return comboCount >= SERIES_X3_AT ? SERIES_MULT_X3 : COMBO_SCORE_MULT;
}
// ===== BOWL SHATTER (prototype v2) — the mechanic =====
// The single point of the crack: it is called BOTH by entering turbo AND by the bench/test
// handle — the behaviour is one (the lesson «a handle that bypasses the mechanic» from the fire in v232).
let bowlShattering = false;
let bowlNRuntime = 0; // 0 = take BOWL_SHATTER_N; the setN handle for the bench
function bowlN(){
  // the difficulty ladder (the owner's word 2026-08-04): +1 turbo every ten levels
  return bowlNRuntime || (BOWL_SHATTER_N + Math.floor((levelNum || 1) / 10));
}
// «WITHOUT MISTAKES» (the owner's word 2026-08-03): any miss zeroes the accumulated
// turbo credits of the bowl. It is called by penalize (70-fx) —
// ALWAYS, not only during a hot window. The bomb does not come in here (it is not a mistake).
// The eyes will play the reset themselves: bowlLeft() reads cracks every tick.
function bowlStreakReset(){
  if (BOWL_CRACK_ON !== 'chain') return;
  if (!level || level.over || bowlShattering) return;
  if (!level.bowlCracks) return;
  level.bowlCracks = 0;
  try { setBowlCracks(0, bowlN()); } catch(e){}
}
function bowlCrackAdd(silent){
  if (!level || level.over || bowlShattering) return;
  level.bowlCracks = (level.bowlCracks || 0) + 1;
  // ⚠️⚠️ THE REWARD FOR SERIES (the owner's spec 2026-08-12: «and also if the player knocks
  // out 3 series»). We count HIS OWN unit — `bowlCracks`, the very one with which he measured
  // «5-7 series per level» when the bowl shatter was introduced; a second counter next to a
  // working one would breed a divergence at the first edit.
  // ⚠️ Exactly ON THE THIRD (`===`), and not «>= 3»: otherwise a bomb would rain down on
  // every following series. The other guards are inside `bombDropReward`.
  if (level.bowlCracks === BOMB_SERIES_REWARD){ try { bombDropReward(); } catch(e){} }
  try { setBowlCracks(level.bowlCracks, bowlN()); } catch(e){}
  if (!silent){
    Sound.play('crunch', 9); vibrate([15, 30, 25]);
    camShake = Math.max(camShake, 0.18);
  }
  if (level.bowlCracks >= bowlN()){
    // deferred on the REAL clock: to let the Power chain pop and the toss-up live out
    setTimeout(shatterBowl, 650);
  }
}
function shatterBowl(){
  if (!level || level.over || bowlShattering || intro) return;
  bowlShattering = true;
  // THE SHATTER PUTS THE CHAIN OUT (the owner's bug 2026-08-04, the screenshot «the bowl broke
  // during a series, everything went wrong»): a live turbo kept TOPPING UP items for all 900 ms
  // until the collection — those late for the collector's snapshot fell through the GHOST floor
  // into an eternal fall, alive never reached zero, the win never came, the level hung. We put
  // the chain out at once: the series has played its part.
  chainUntil = 0;
  slowmoUntil = performance.now() + BOWL_SLOWMO_MS; // the owner's «yes!»: slow-mo
  try { dropWalls(); } catch(e){}
  try { shatterBowlVis(); } catch(e){}
  wakePhysics('bowl:shatter');
  blastWave(new THREE.Vector3(0, 3.5, 0), 9, 3.2, 2.0); // the pile goes outwards, spectacularly
  Sound.play('chain'); Sound.play('crunch', 12);
  vibrate([40, 60, 40, 60, 80]);
  camShake = Math.max(camShake, 0.6);
  stats.lastAction = performance.now(); // the mixer stays silent during the celebration
  // the collection wave comes after the shatter, the REAL clock (the canonical grindShred pattern)
  setTimeout(bowlCollectAll, BOWL_COLLECT_DELAY);
}
function bowlCollectAll(){
  if (!level || level.over) { bowlShattering = false; return; }
  // «they count as connected»: for each type with k live ones — the group score with the cap,
  // ×accumulation ×the paid booster, WITHOUT the series multipliers (otherwise it would stack
  // with turbo); accAdd for all k — this is a RESCUE, the museum is honest.
  const byType = {};
  const extras = []; // stones/bomb — are carried away without score (the owner's decision No.2)
  let surprise = null;
  for (const it of items){
    if (!it.alive || it.animating) continue;
    if (it.surprise){ surprise = it; continue; }
    if (it.bomb || it.frozen){ extras.push(it); continue; }
    if (!it.type) continue;
    (byType[it.type.name] = byType[it.type.name] || []).push(it);
  }
  let gainedTotal = 0;
  const scoreBefore = stats.score;
  for (const [name, list] of Object.entries(byType)){
    const k = list.length;
    const kk = Math.min(k, MATCH_MAX_N);
    gainedTotal += Math.round(MATCH_SCORE * kk * (kk - 1) * accMult(name) * scoreBoostMult());
    accAdd(name, k, list[0]);
  }
  stats.score += gainedTotal;
  const shown = scoreShownDelta(scoreBefore, stats.score);
  // ⚠️ THE TREASURE IS NO LONGER COLLECTED HERE: it flies to the centre TOGETHER WITH
  // EVERYONE (the owner's word — «ALL the objects that were in the bowl»), while the
  // crediting and its effects go off at the moment of the bang, already at the collection
  // point. Before, it burst in place while the others were still flying — and the promise
  // «everyone merges» broke on exactly the most noticeable item.
  // ⚙️ THE FLIGHT INTO THE CENTRE AND THE BANG (the owner's word 2026-08-06: «all the objects
  // that were in the bowl at the moment of the explosion merge with each other in the centre
  // and disappear, the way the merging of objects is done now»). It used to be: each one melted
  // in place in a wave from the centre — that read as «they dissolved», and not as «they gathered».
  // ⚠️ The same collapseFX as with an ordinary match, only longer: it has to fly across the whole
  // bowl. The bang is on the REAL clock, as in doMatch (on a sagging FPS the animation tick does
  // not run to the end, and the bang would never come).
  const all = Object.values(byType).flat().concat(extras);
  const centerPos = new THREE.Vector3(0, BOWL_MERGE_AT_Y, 0);
  for (const it of all){
    it.animating = true; it.animStartMs = performance.now();
    destroyItemBody(it);   // there is no body — the animation drives the mesh, physics does not argue
  }
  // ⚠️ THE REAL CLOCK (the 4th argument): the deletion below hangs on a setTimeout, and on a
  // sagging FPS the game tick lagged — the pile disappeared before reaching the centre.
  const flying = surprise ? all.concat([surprise]) : all;
  if (surprise){ surprise.animating = true; destroyItemBody(surprise); }
  collapseFX(flying, centerPos, BOWL_MERGE_MS, true);
  const tint = (all[0] && (all[0].fxColor || all[0].baseColor)) || null;
  setTimeout(() => {
    if (!level) return;
    impactFX(centerPos, MATCH_MAX_N, tint, all[0] || null);   // the impact as with a big group
    dissolveFX({ p: centerPos, r: 1.6, fxColor: tint, baseColor: tint });
    popFX(centerPos);          // ⚠️ it was in the ordinary match and was not here — the language of the bang is one
    // the treasure is taken HERE, at the collection point: we shift its effects anchor to the
    // centre, otherwise its pop and crumble would go to where it lay before the flight
    // ⚠️ WE MOVE ONLY THE EFFECTS ANCHOR (`p`), AND NOT THE MESH. By this moment the mesh has
    // ITSELF flown into the centre together with everyone — that is the whole fix. The first
    // version copied mesh.position too, that is, it TELEPORTED the treasure, and the guard «the
    // treasure flies with everyone» passed green even when the treasure was taken out of the
    // flight: it measured the teleport, not the flight (the sabotage test showed exactly that).
    if (surprise && surprise.alive){ surprise.p.copy(centerPos);
      try { collectSurprise(surprise); } catch(e){} }
    camShake = Math.max(camShake, COLLAPSE_SHAKE * 2);
    Sound.play('match', { n: Math.min(all.length, MATCH_MAX_N), k: 0 });
  }, BOWL_MERGE_MS);
  scorePop('Bowl Shatter! +' + shown, new THREE.Vector3(0, 5.5, 0), '#ff5a3c', true);
  Sound.play('win');
  setTimeout(() => afterPause(() => {
    all.forEach(removeItem);
    // THE SWEEP-UP SAFETY NET (the owner's bug 2026-08-04): everything that spawned AFTER the
    // collector's snapshot (the top-up of a live turbo and any future spawn) is quietly removed
    // without score — otherwise the «latecomer» fell forever under the ghost floor, alive never
    // reached zero and the level hung without a win.
    for (const it of items){ if (it.alive){ try { removeItem(it); } catch(e){} } }
    bowlShattering = false;
    refreshAccessibility(); updateHUD(); checkEnd(); // no live ones -> the win
  }), BOWL_MERGE_MS + 260);
}
function bowlState(){
  return { cracks: (level && level.bowlCracks) || 0, n: bowlN(),
           len: BOWL_SERIES_LEN, shattering: bowlShattering,
           floorGhost: (() => { try { return floorCol.isSensor(); } catch(e){ return false; } })(),
           rescuerOff: bowlIsOpen() };
}
function chargeState(){
  return { name: chargeName, leftMs: chargeName ? Math.max(0, chargeUntil - performance.now()) : 0 };
}
function chargeTick(){
  if (chargeName && performance.now() > chargeUntil){
    chargeName = ''; chargeUntil = 0;              // dissolved — the moment is missed
    try { updateHUD(); } catch(e){}
  }
}
function detonateCharge(){
  if (intro || paused || !level || level.over) return false;
  if (!chargeName || performance.now() > chargeUntil) return false;
  const name = chargeName;
  // ⚠️ !i.frozen: the charge strikes by the TYPE'S NAME (not by the key), and without the
  // exception it would take an ice block past its condition; the collected pieces, however, DO go into the credit (the owner).
  const victims = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb
                                    && !i.frozen && i.type && i.type.name === name);
  chargeName = ''; chargeUntil = 0;
  if (!victims.length){ try { updateHUD(); } catch(e){} return false; } // the type ran out before the click
  wakePhysics('charge');
  stats.lastAction = performance.now();          // a click = an action, the mixer is postponed
  const n = victims.length;
  const N = Math.min(n, MATCH_MAX_N);            // the price cap — as with a group
  // ⚠️ THE BOOSTER MULTIPLIES THE CHARGE TOO (the owner's word 2026-08-01: «it multiplies») —
  // like all the score points; the combo ×2 still does NOT take part (the rationale is at the formula).
  const gained = Math.round(MATCH_SCORE * N * (N - 1) * accMult(name) * scoreBoostMult());
  stats.score += gained;
  accAdd(name, n, victims[0]);                   // A RESCUE: it accumulates for all n
  frozenCredit(name, n);                         // the charge's pairs go into the ice blocks' credit (the owner: «they do»)
  lastMatchMs = performance.now();               // the series window is extended (an action),
                                                 // comboCount is NOT touched — the charge does not accumulate a series
  // ⚠️⚠️ THE THREAD OF LIGHTNING IS FIRED BEFORE THE BODIES DIE (the owner's word
  // 2026-08-23-a). The positions are SNAPSHOTTED here on purpose: `it.p` is the live vector
  // the physics writes into, and `destroyItemBody` on the next line stops it being updated —
  // reading it later would thread the bolt through wherever the items happened to stop.
  // ⚠️ It draws through victims the player CANNOT SEE as well (the charge takes buried copies
  // by design) and the bolt carries `depthTest:false`, so the thread reads over the pile.
  // That is deliberate: it is what shows him the strike really did take every copy.
  try { chainBoltFX(victims.map(v => v.p.clone())); } catch(e){}
  victims.forEach(it => { it.animating = true; destroyItemBody(it); });
  // DISSOLVING, and not a pack burst (the owner's spec 2026-07-31: «they should fly apart harder,
  // or simply dissolve, otherwise it is not clear what happened»): dissolving was chosen — the
  // dissolveFX crumble on EACH of the 6-16 items reads as a simultaneous disappearance of the
  // type, a burst at that number looked petty.
  victims.forEach(it => dissolveFX(it));
  const mid = new THREE.Vector3();
  victims.forEach(it => mid.add(it.p)); mid.multiplyScalar(1/n).y += 1.2;
  scorePop('+' + gained, mid, '#ffffff', true);
  // ⛔ THE EYES' REACTION TO THE CHARGE IS REMOVED (the owner's word 2026-08-07: «a click on a
  // bonus thing must not knock down the turbo counter, right now it does, the eyes change at the
  // very least»). The measurement showed: THE COUNTER IS INTACT (4 -> 4, 0 misses) — it was
  // precisely the EYES that were knocked down: 'angry' for 1.4 s overrode the wide-open pupils of
  // a burning series, and that read as a loss of turbo. The charge is a reward, and not an
  // incident: let the eyes keep showing the series.
  // (The sound and the vibro stay: feedback about the collection itself is needed.)
  Sound.play('match', N); vibrate([30, 60, 40]);
  // ⚠️ WITHOUT the 150 ms wait (the complaint «a delay on the destruction»): the crumble already
  // hides the meshes, the deletion is immediate — the bomb's pattern held the pause for the sake
  // of the inflation, which the charge no longer has.
  afterPause(() => {
    victims.forEach(removeItem);
    wakePhysics('charge:settle');
    refreshAccessibility(); updateHUD(); checkEnd();
  });
  return true;
}

function burstFX(it){
  const tex = it.type && it.type.tex;
  // ⚙️ THE BIG VARIANTS (the owner's choice 2026-08-01): for food and cars the effects have been
  // replaced — fewer particles, but fatter, and the pieces have behaviour (sparks ricocheting off
  // the walls, a wheel rolling away, drops of juice on the screen's glass). The animals and the
  // solid packs are left as they were: the owner accepted the stars as is, the shards only had
  // their count raised (SHARD_BURST_N).
  if (tex === 'food') juiceBigFX(it);
  else if (tex === 'car') sparkRicochetFX(it);
  else if (tex === 'animal') starPopFX(it);
  // SHARDS (the owner's spec 2026-07-23 «make it shards»): the solid packs —
  // brickwork/pirate/stones — do not go into crumble, but SPLIT into angular pieces
  else if (tex === 'brick' || tex === 'pirate')
    shardFX(it.p, it.fxColor || it.baseColor, { count: SHARD_BURST_N, size: 0.2, up: 4.2 });
  else dissolveFX(it); // without a pack — the former crumble
}
// ⚠️ THE VISUALS of the pack effects HAVE MOVED INTO 70-fx (the juice and the sparks have since
// been REPLACED by juiceBigFX/sparkRicochetFX by the owner's choice 2026-08-01, the old ones deleted)
// (a request from PHYSICS in WORKSTREAMS, done by GRAPHICS 2026-07-22): there they are
// polished — round dots instead of square ones, stars as billboards.
// Only the RULE of the choice remains here (burstFX above) — that one is yours.

// ⚠️ THE SHARD VISUALS (shardFX + makeShardGeo) HAVE MOVED INTO 70-fx (polished by
// GRAPHICS 2026-07-23 at the request of PHYSICS): an irregular chip shape, a tint
// across the facets (volume on a flat MeshBasicMaterial), the «crunch» sound. The signature
// is the same — (pos, color, opts{count,life,up,spread,size}); what remains here is
// only the CALLS (the burstFX rule above and the grindShred shredding below) — your zone.

// «GRIND IT SPECTACULARLY» (the owner's spec 2026-07-23): a two-phase grinding animation,
// a shared helper for mixerGrind and finaleGrind (so that they do not drift apart).
// Phase 1 (the grab): the item is dragged towards the plane of the blades with a JERK and
// acceleration, it SHAKES and is FLATTENED (compression along Y, spread along XZ) — «it got
// pulled under the blades».
// Phase 2 (the shredding): the mesh goes out, shards beat out from under the blades in a
// FOUNTAIN + a dust explosion (+ camera shake to taste). The deletion of the item stays in
// the caller's afterPause (the guards are intact), the mesh is hidden by scale.
// ⚠️ THE SHREDDING IS ON THE REAL CLOCK (setTimeout), and NOT in the addFX tick: the tick grows
// on a CLAMPED dt (99-main), and at <~20 FPS the shredding by the FX clock came LATER than
// removeItem by the real one (560/410 ms) — the fountain tore away from a mesh that had already
// vanished. The real clock keeps the order «shredding -> removeItem» at any FPS.
// shake is the amplitude of the shaking (the mixerGrind punishment is brighter; the finale is calmer).
function grindShred(item, dur, shake){
  const p0 = item.p.clone(), s0 = item.mesh.scale.x, mesh = item.mesh;
  const drop = Math.max(0.6, p0.y - FLOOR_REST + 0.25); // reach down to the blades
  const grab = dur * 0.7; // the duration of the grab phase
  // phase 1 — per-frame flattening (cosmetics, safe at any FPS)
  addFX(new THREE.Object3D(), grab, (o, k) => {
    const e = k*k;                                // acceleration downwards — «it sucks it in»
    const jud = Math.sin(k*49)*0.05*k;            // the tremor of the grab
    mesh.position.set(p0.x + jud, p0.y - e*drop, p0.z - jud);
    mesh.rotation.y += 0.7;
    const sq = s0*Math.max(0.05, 1 - 0.6*k);      // flattening
    mesh.scale.set(s0*(1 + 0.4*k), sq, s0*(1 + 0.4*k));
  });
  // phase 2 — the shredding on the real clock, BEFORE the caller's removeItem
  setTimeout(() => {
    if (!item.alive) return;                      // extra caution: do not fire at a corpse
    const gp = mesh.position.clone();
    // ⚙️ THE SAWING (the owner's choice 2026-08-01): the item does not scatter in a fountain of
    // shards but FALLS APART INTO TWO HALVES along the cut plane — the cross-section of the real
    // model is visible. The grab phase (the flattening) stayed as it was.
    sawFX(item);
    mesh.scale.setScalar(0.0001);                 // the original is gone — from here on, the halves
    bladeDustFX(gp, item.fxColor || item.baseColor);
    if (shake) camShake = Math.max(camShake, shake);
  }, grab * 1000);
}

function checkEnd(){
  if (level.over) return;
  if (items.every(i=>!i.alive)){
    level.over = true;
    Sound.play('win');
    const secs = Math.round((performance.now()-stats.t0)/1000);
    // ⛔⛔ THE STAR RATING IS GONE (the owner 2026-09-01-i: «we have no concept of stars, only
    // points, remember this»). Nothing computes a 1..3 rating, nothing writes one, and nothing
    // draws one. ⚠️ THE ★ GLYPH ELSEWHERE IS NOT A RATING — it is the ICON for points/balance in
    // the HUD, the menu and `winCoins`; those stay.
    // ⚠️ THE GOAL SURVIVES AND IS NOW A POINTS STATEMENT, which is what it always was on screen:
    // «Score: X / goal Y». It used to be derived from the 2★ threshold, so it needed a name of its
    // own once the stars left. The number is unchanged, so nothing on screen moves except the
    // three icons disappearing.
    const base = level.parBase || 0;
    // COINS: the base + the conversion of score (combos are finally economically worthwhile)
    level.coinsWon = COIN_BASE + Math.floor(Math.max(0, stats.score) / COIN_PER_SCORE);
    addCoins(level.coinsWon);
    // A SINGLE BALANCE (the owner's finalisation 2026-07-24: «everything earned in the
    // level = the balance»): we bank the level's ACCUMULATED SCORE (denom. ×10) into the
    // wallet — the same number in the chip, in the menu and in the leaderboard. The stars[lv]
    // rating is gone entirely (2026-09-01-i); the score is the only measure of a run.
    // +1 SHAKE. It used to be every 5th level only (his word 2026-08-04); since 2026-09-01-i it is
    // EVERY level once past SHAKE_EVERY_FROM: «after level 10 give not only +1 hint but also +1
    // shake». The old rule is kept BELOW that line rather than deleted, so levels 5 and 10 still
    // pay — dropping it would have made the early game quietly poorer while answering a request
    // that was only about the late game.
    // ⚠️ It goes into the PERMANENT stock (the pe/ps pair — the same one the bundles use): it
    // survives the level and the device, and is dup-safe by the monotonic pair.
    if (levelNum > SHAKE_EVERY_FROM || levelNum % 5 === 0){
      try { Save.pe = (Save.pe || 0) + 1; commitSave(); level.shakeBonus = 1; } catch(e){}
    }
    level.starsWon = bankLevelScore(stats.score);
    addHints(1); // +1 hint for a successful level (the owner's spec)
    level.hintBonus = 1;
    // ⛔ THE «+1 Shake» TOAST WAS REMOVED WITH THIS BATCH, NOT LOST: from level 11 it would fire on
    // EVERY win, i.e. it stops being news and starts being noise — and the win screen now shows
    // both rewards as icons with counts (his two Figma nodes), which is a better place to read
    // them than a toast that fades.
    Telemetry.ev('win', { lv: levelNum, sw: level.starsWon, c: level.coinsWon, sc: stats.score, sec: secs });
    $('winTitle').textContent = '🎉 Level ' + levelNum + ' cleared!';
    // ⛔ THE THREE VICTORY STARS WERE DRAWN HERE (his Star.svg geometry, an unearned one at 28%
    // opacity). Removed with the rating itself; the markup node went with them.
$('winStats').textContent =
      'Score: ' + stats.score + (base ? ' / goal ' + Math.round(base * LEVEL_GOAL_K) : '') + '  ·  Time: ' + fmtTime(secs);
    // the coins are hidden: the level's on-screen reward is the stars + a hint;
    // the crediting above lives on (it will come back together with COINS_ENABLED)
    // the level's reward: the earned star-currency + a hint (the coins are hidden by a
    // flag; their crediting above lives on and will come back together with COINS_ENABLED)
    // THE TWO REWARD PILLS (his Figma nodes 933:1515 / 933:1531). The pictures are COPIED from the
    // bar buttons rather than inlined a second time — see the markup comment.
    // ⛔ THE COUNTS ARE GONE FROM HERE AND THAT IS THE POINT OF THE NEW NODES: the badge is a
    // static «+1» in the markup, i.e. what THIS win paid, not what the wallet now holds. Nothing
    // computes it, so nothing can drift; the totals live on the bar badges, which updateHUD owns.
    // ⚠️ The shake slot is hidden when this level paid no shake: past level 10 it always does, but
    // below that the every-5th rule still applies, and an icon that silently never changes reads
    // as a broken counter rather than as «not this time».
    try {
      const barTip = document.querySelector('#hintBtn img');
      const barShake = document.querySelector('#shakeBtn img');
      const tip = $('winRwTip'), shk = $('winRwShake');
      if (tip && barTip) tip.querySelector('img').src = barTip.src;
      if (shk){
        if (level.shakeBonus && barShake){
          shk.style.display = '';
          shk.querySelector('img').src = barShake.src;
        } else shk.style.display = 'none';
      }
    } catch(e){}
    $('winCoins').textContent = (level.starsWon > 0 ? '+' + level.starsWon + ' ★  ·  ' : '')
      + (COINS_ENABLED ? ('+' + level.coinsWon + ' 🪙  ·  ') : '') + '+1 💡';
    $('winX2Btn').style.display = COINS_ENABLED ? '' : 'none';
    levelNum++;
    try { localStorage.setItem('mixer_level', String(levelNum)); } catch(e){}
    try { Save.lv = Math.max(Save.lv || 1, levelNum); commitSave(); } catch(e){} // the progress goes to the cloud
    Ads.noteWin();
    // to the platform: the level is cleared (on Poki/CrazyGames it is the native gameplayStop,
    // the natural point where the platform is entitled to show its own ad)
    try { Ads.msg('LEVEL_COMPLETED', { level: String(levelNum - 1) }); } catch(_){}
    show('winOverlay');
    // ⚠️ THE FRAMES OF THE TOP ROW ARE FITTED AFTER THE SHOW, AND NOT ONLY WHERE THE TEXT
    // IS WRITTEN: `getComputedTextLength()` returns 0 on a hidden node, so a fit done
    // while the overlay was still `display:none` would silently do nothing and leave the
    // fixed frames — that is, the very hole the owner asked to remove.
    try { fitWinTopRow(); } catch (e) {}
    // ⚠️ THERE IS NO storyOnWin() HERE ANY MORE — the owner's word 2026-08-06: the announcement
    // of a new item goes AFTER the statistics, and not on top of them. It is called by the
    // «Next» button (90-input), and the level starts from that button's callback already.
    updateHUD();
  }
}
function showLose(){
  level.over = true;
  Sound.play('lose');
  Telemetry.ev('lose', { lv: levelNum, alive: items.filter(i=>i.alive).length });
  const secs = Math.round((performance.now()-stats.t0)/1000);
  $('loseStats').textContent = 'No pairs available and no shakes left. Items left: '
    + items.filter(i=>i.alive).length + '  ·  Time: ' + fmtTime(secs);
  // Continue for an ad — 1 time per level (the highest-converting placement of the genre)
  $('loseAdContinue').style.display = level.continueUsed ? 'none' : '';
  show('loseOverlay');
}
// Continue: the ad has been watched to the end — bring the game back to life
function continueRun(){
  level.continueUsed = true;
  level.over = false;
  hide('loseOverlay');
  level.shakes++;                 // +1 shake
  dropExtra(CONTINUE_DROP);       // +items from above (new pairs appear)
  stats.lastAction = performance.now();
  level.stuck = -4;               // a grace period for the deadlock detector while the top-up settles
  Telemetry.ev('continue', { lv: levelNum });
  refreshAccessibility(); updateHUD();
}
// The «Scope» (the shop): highlight ALL the available pairs for 5 s
function scopeHighlight(){
  const byKey = {};
  for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key] = byKey[it.key]||[]).push(it);
  let lit = 0;
  for (const k in byKey){
    const arr = byKey[k];
    for (const a0 of arr){
      const paired = arr.some(o => o !== a0 && pairMatch(o, a0));
      if (paired){ scopePulse(a0, 5); lit++; }
    }
  }
  if (!lit) toast('No pairs available right now');
}
function scopePulse(item, dur){
  const mat = item.mesh.material;
  mat.emissive.setHex(0x35c46a);
  mat.emissiveIntensity = 0;
  addFX(new THREE.Object3D(), dur, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*10)) * 0.7 * (1-k*0.5);
  });
}
// The «Metal detector» (rewarded): show WHERE to dig down to the surprise
function detectorHighlight(){
  const sp = items.find(i => i.surprise && i.alive);
  if (!sp) return;
  level.detectorUsed = true;
  markerFX(sp.p, 0xffc84a);
  for (const it of items){
    if (!it.alive || it.surprise || it.animating) continue;
    const dx = it.p.x - sp.p.x, dz = it.p.z - sp.p.z;
    if (dx*dx + dz*dz < 1.7 && it.p.y > sp.p.y) scopePulse(it, 10);
  }
  Telemetry.ev('rw', { p: 'detector' });
  updateHUD();
}
// The surprise is dug out and tapped: a bonus and a golden split
function collectSurprise(it){
  it.animating = true;
  destroyItemBody(it);
  wakePhysics('gameplay:L58');
  faceEvent('surprised', 1000); // the INTERFACE's emotion matrix: the treasure — «surprised» eyes (EYES-CHARACTER-SPEC §5)
  stats.lastAction = performance.now();
  // the little fish gets dearer with the level: +150 + 5×level (the balance table 2026-07-22)
  const bonus = Math.round((SURPRISE_BONUS + SURPRISE_LEVEL_BONUS * levelNum) * scoreBoostMult()); // the booster works on the treasure too
  const before = stats.score;
  stats.score += bonus;
  const shown = scoreShownDelta(before, stats.score); // denom. gain (#10)
  scorePop('+' + shown, it.p.clone().setY(it.p.y + 0.6), '#ffc84a', true);
  popFX(it.p);
  dissolveFX(it);
  Sound.play('surprise');
  vibrate(30);
  const s0 = it.mesh.scale.x;
  addFX(new THREE.Object3D(), 0.2, (o,k)=>{ it.mesh.scale.setScalar(s0*(1-k)); });
  setTimeout(()=>afterPause(()=>{
    removeItem(it);
    wakePhysics('gameplay:L70');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 200);
}

// The reach ghost-halo (metric v3): THE ITEM'S OWN SHAPE, inflated by matchRadius along
// each local axis — an honest image of the zone «the true gap <= R» (a sphere, under a
// non-enclosing metric, would lie in both directions: for a steak the zone is a slab, not
// a ball). The geometry is cloned WITHOUT FAIL: on completion stepFX calls dispose — the
// shared cache of type geometries must not be touched (otherwise all the items of the type
// lose their GPU buffers).
function reachGhostFX(item, color){
  if (!CFG.radiusOn) return;
  const geo = item.mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, s = item.mesh.scale.x;
  const R = Math.min(CFG.matchRadius, 3.6); // in a chain/endgame no bigger than the bowl
  // the airy variant (the owner's spec): three times more transparent, the edge soft and wide
  // ⚠️ 0.02/0.16 -> 0.01/0.08 (the owner 2026-08-30: «uvelich prozrachnost u konturov obyektov
  // posle sovmeshcheniya»). Both halved so the SHAPE of the falloff is unchanged — only its
  // strength; changing the ratio would have altered how the edge reads, which he did not ask for.
  // ⛔⛔ THE ANCHOR IN 70-fx MOVES WITH THESE NUMBERS, ALWAYS. They are baked into the shader
  // TEXT, so a different pair is a different PROGRAM: leaving the anchor behind would let the
  // program die with the last ghost and recompile inside the frame of the next tap — the exact
  // hitch fxProgramAnchors exists to prevent, and it would show up on weak devices only.
  const ghost = new THREE.Mesh(geo.clone(), fresnelGhostMat(color, 0.01, 0.08, 1.1));
  ghost.position.copy(item.mesh.position);
  ghost.quaternion.copy(item.mesh.quaternion);
  ghost.scale.set(
    s + R / Math.max(0.05, (bb.max.x - bb.min.x) / 2),
    s + R / Math.max(0.05, (bb.max.y - bb.min.y) / 2),
    s + R / Math.max(0.05, (bb.max.z - bb.min.z) / 2));
  ghost.renderOrder = 10;
  addFX(ghost, 0.9, (o, k) => { o.material.uniforms.op.value = 1 - k; });
}

// ⚠️ PROFILING (2026-07-31): all the tap's work happens in the EVENT HANDLER, that is,
// OUTSIDE the frame cycle — the loop's rings do not see it, and on the tap's frame ~40 ms
// of «nobody's» time hung in the profile. We accumulate it here, the loop takes it once a frame.
let tapMs = 0;
const tapMsTake = () => { const v = tapMs; tapMs = 0; return v; };
// ⚠️ THE BREAKDOWN OF THE TAP ITSELF (2026-07-31). An argument with GRAPHICS: their hypothesis
// was «the 9.6 ms is the logic (raycast/GJK/accessibility)», my first version said
// «allocations». NEITHER WAS MEASURED: my construction counter only saw the dust clouds,
// and the tap's path also has the ghost's `geo.clone()`.
// Three phases: picking the item with the ray, selecting the candidates (that is where the GJK
// in pairMatch lives), the ghost-halo (a clone of the geometry). The tap's remainder = the tail of doMatch.
let tapPickMs = 0, tapCandMs = 0, tapGhostMs = 0, tapDestroyMs = 0, tapWaveMs = 0;
let tapAccMs = 0, tapFxMs = 0, tapSndMs = 0;
// ⚠️ `rest` IS COMPUTED, AND NOT MEASURED, and that is not laziness: it catches EVERYTHING that
// is not in the named phases (the score, the sound, the vibro, the accumulation, the save, the
// pops). While it is small there is nothing to look for there; when it grows it means a new item
// has appeared, and that is exactly when to break it down. Named phases without a remainder
// always lie on new code.
// ⚠️ THE TOTAL IS PASSED AS AN ARGUMENT, AND NOT READ FROM tapMs: in the loop `tapMsTake()`
// comes first, and it ZEROES tapMs — reading it here, the remainder would always have come out
// zero. Exactly that class where a guard is green because it measures emptiness.
const tapPhasesTake = (total) => { const v = { pick: tapPickMs, cand: tapCandMs, ghost: tapGhostMs,
    destroy: tapDestroyMs, wave: tapWaveMs, acc: tapAccMs, fx: tapFxMs, snd: tapSndMs };
  v.rest = +Math.max(0, (total || 0) - (tapPickMs + tapCandMs + tapGhostMs + tapDestroyMs
    + tapWaveMs + tapAccMs + tapFxMs + tapSndMs)).toFixed(2);
  for (const k in v) v[k] = +(+v[k]).toFixed(2);
  tapPickMs = tapCandMs = tapGhostMs = tapDestroyMs = tapWaveMs = 0;
  tapAccMs = tapFxMs = tapSndMs = 0; return v; };
function handleTap(x, y){
  const _tap0 = performance.now();
  try { return handleTapInner(x, y); } finally { tapMs += performance.now() - _tap0; }
}
function handleTapInner(x, y){
  if (level.over) return;
  // the mixer's finale (no pairs by type are left): the score is neither spent nor
  // credited — misses on orphans/empty space carry NO penalty (the owner's spec);
  // a tap on a dug-out surprise stays working
  const finale = !hasAnyPair();
  stats.taps++;
  const _tp0 = performance.now();
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x-rect.left)/rect.width)*2-1, -((y-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = aliveMeshes();
  let hits = raycaster.intersectObjects(meshes, false);
  let item = hits.length ? hits[0].object.userData.item : null;
  if (!item){
    // soft picking: the nearest one to the tap point in screen coordinates
    let best = null, bestD = 34; // px
    for (const it of items){
      if (!it.alive || it.animating) continue;
      const sp = it.p.clone().project(camera);
      const px = (sp.x+1)/2*rect.width + rect.left, py = (-sp.y+1)/2*rect.height + rect.top;
      const d = Math.hypot(px-x, py-y);
      if (d < bestD){ bestD = d; best = it; }
    }
    item = best;
  }
  tapPickMs += performance.now() - _tp0;   // picking the item with the ray + the fallback projection
  if (!item){ Telemetry.tap(x, y, 'dead'); if (!finale) penalize(null, x, y); return; }
  if (item.animating) return; // one that is dissolving: a double tap used to give double score (+300 for the surprise)

  if (!isAccessible(item)){
    wiggle(item);
    toast(item.surprise ? 'The treasure is still buried' : 'Item is covered from above');
    if (!finale) penalize(item.p);
    return;
  }
  if (item.surprise){ Telemetry.tap(x, y, 'surprise'); collectSurprise(item); return; } // a dug-out surprise is collected by a tap
  if (item.bomb){ detonateBomb(item); return; } // the bomb: an explosion instead of a match, no score
  if (item.frozen){
    // THE ICE BLOCK (the spec 2026-08-13): ready — the tap BREAKS it; too early — a penalty
    // LIKE THE STONE'S (the owner's word) + a hint about how many pairs are left.
    Telemetry.tap(x, y, 'frozen');
    if (item.frozenReady){ breakIce(item); }
    else {
      penalizeDouble(item);
      const remaining = Math.ceil((item.frozenNeedItems - item.frozenGotItems) / 2);
      try { toast('Frozen! Collect ' + remaining + ' more pair' + (remaining > 1 ? 's' : '') + ' of this item'); } catch(e){}
    }
    return;
  }
  const _tc0 = performance.now();
  const copies = items.filter(i => i.alive && !i.animating && i !== item && i.key === item.key);
  const accessible = copies.filter(i => isAccessible(i));
  let eligible = accessible.filter(i => pairMatch(i, item));
  // THE GROUP CAP (the owner's spec 2026-07-27 «put a cap at 8»): no more than MATCH_MAX_N
  // items IN TOTAL go into a match, including the tapped one. The extras are cut off by
  // DISTANCE — the nearest ones by the true gap remain (the same metric as with the bomb's
  // victims): visually «it collapsed around the finger».
  // The cut-off ones stay alive and get matched by the next tap.
  if (eligible.length > MATCH_MAX_N - 1){
    eligible = eligible
      .map(i => ({ i, d: pairDist(i, item) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MATCH_MAX_N - 1)
      .map(v => v.i);
  }

  // the reach halo: white — there is a match, red — a miss
  tapCandMs += performance.now() - _tc0;   // selecting the candidates, with the GJK inside pairMatch
  const _tg0 = performance.now();
  reachGhostFX(item, eligible.length ? 0xffffff : 0xff5a64);
  tapGhostMs += performance.now() - _tg0;   // the ghost-halo: a CLONE of the item's geometry

  if (eligible.length){
    // all the identical ones (type, any size) inside the sphere go at once, even in an odd
    // number; the ones left without a pair will be destroyed by the mixer at the end
    Telemetry.tap(x, y, 'match');
    doMatch([item].concat(eligible));
    return;
  }
  if (finale){ wiggle(item); return; }
  // ⛔⛔ A TAP ON AN ACCESSIBLE ITEM WITHOUT A PAIR IS A MISTAKE AGAIN (the owner's word
  // 2026-08-23-a: «any click past an object or INTO AN OBJECT WITHOUT A PAIR gives −10
  // points»; asked and answered — «a full-blown mistake», i.e. the whole package and not
  // the points alone).
  // ⛔ THIS CANCELS HIS OWN SPEC OF 2026-07-29, and the reasoning behind that spec is worth
  // keeping because it is the cost he is now paying: he poked at the colourful items near
  // the bottom of the bowl and got punished; the measurement explained why he was right at
  // the time — on lv.20 Hard there are 50 accessible items but only 11 accessible PAIRS, so
  // more than half of the «colourful» ones have nothing to be connected with. The veil
  // answers «CAN I REACH IT», the player reads it as «CAN I USE IT», and the gap between
  // those two sets is enormous. That gap has not gone anywhere — the owner has simply
  // decided that searching should cost. He was shown this paragraph before answering.
  // ⚠️⚠️ THE WHOLE PACKAGE, THROUGH THE SINGLE PENALTY POINT: `penalize` is what makes this
  // a mistake rather than a fine — it counts stats.misses (which kills a LIVE turbo), zeroes
  // the turbo build-up, drops the radius ladder by two, resets the bowl streak and starts
  // the 3-second radius penalty. Routing the case anywhere else would have invented a THIRD
  // kind of tap — «a mistake for points but not for the boost» — which nothing in this game
  // could explain in one sentence.
  // ⚠️ HIS THREE EXEMPTIONS SURVIVE FOR FREE, because they live inside `scorePenalty`, below
  // this call: level 1 has no point penalty at all (and then no «−N» pop is drawn either),
  // levels 2-5 are clamped at zero, and the finale never reaches this line — it returns one
  // branch above, where by definition nothing has a pair left.
  // ⚠️ WE STILL DO NOT TOUCH stats.lastAction: otherwise taps on a lonely item could
  // postpone the grinding forever. That would be a hole, not an indulgence.
  // ⚠️ THE SEARCH HINTS BELOW ARE NOW PAID, and that is the visible half of his decision:
  // the yellow «Pair is near but covered» and the red «Pair is deeper and farther» markers
  // only ever appear after this line, so every use of the game's own search tool costs 10.
  // ⚠️ AND ONE HOLE HE INHERITS: `noteMissRadius` suppresses the deadlock detector for 3 s
  // (99-main, «under the radius penalty ‘there are no pairs’ means nothing»). A player who
  // keeps poking pairless items faster than once per 3 s therefore keeps deferring his own
  // rescue grinding. It self-heals the moment he stops, and the rescue costs points anyway,
  // so it is left as is — but it is a consequence of this batch, not a pre-existing bug.
  Telemetry.tap(x, y, 'nopair');   // separate from 'miss' — in the map of misses this is a different case
  penalize(item.p);
  wiggle(item);
  const nearBuried = copies.filter(i => pairMatch(i, item));
  if (accessible.length){
    accessible.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    // ⛔ THE DASHED LINE TO A DISTANT PAIR IS REMOVED (the owner's word 2026-08-07:
    // «remove the dashed line from object to object that points out the distance»).
    // Together with it the toast «Pair is too far» had already been removed earlier — that
    // is, the hint about an unreachable pair is now completely silent; it will come back if
    // he asks for a new form. The lineFX function is alive (70-fx) and may be needed by
    // other mechanics — it must not be deleted.
    // ⛔ THE TOAST IS REMOVED (the owner's word 2026-08-05: «remove the bottom toast message
    // that says the pairs are too far. It needs to be visually redone and its position
    // changed, we will get to that later»). The hint IS CARRIED BY THE LINE above — it shows
    // WHERE to reach, and it stays. The text will come back with a new form and place at his
    // word; the string is not to be invented anew.
  } else if (nearBuried.length){
    nearBuried.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(nearBuried[0].p, 0xffb224);
    toast('Pair is near but covered');
  } else if (copies.length){
    copies.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(copies[0].p, 0xff6369);
    toast('Pair is deeper and farther');
  }
  wiggle(item);
}

// ---------- The hint ----------
// Finds the best accessible group (the maximum of identical ones within the radius) and highlights it
function findHintGroup(){
  refreshAccessibility();
  const acc = items.filter(i => i.alive && !i.animating && !i.surprise && i.accessible);
  // the top of the pile is taken over the NON-flying ones, so that a fresh top-up does not raise the bar
  let pileTop = 0;
  for (const it of items) if (it.alive && it.p.y < FUNNEL.H) pileTop = Math.max(pileTop, it.p.y);
  const surfaceY = pileTop - HINT_SURFACE_DEPTH;
  let best = null, bestScore = null;
  for (const it of acc){
    let grp = acc.filter(o => o !== it && o.key === it.key && pairMatch(o, it));
    // the same cap as in the tap (the owner's spec 2026-07-27): the hint must not
    // promise a group bigger than the one that will actually connect
    if (grp.length > MATCH_MAX_N - 1){
      grp = grp.map(o => ({ o, d: pairDist(o, it) })).sort((a, b) => a.d - b.d)
               .slice(0, MATCH_MAX_N - 1).map(v => v.o);
    }
    if (!grp.length) continue;
    const full = [it].concat(grp);
    // THE SURFACE ECHELON (the testers' request, the owner's word 2026-08-03):
    // groups lying entirely in the pile's upper layer always beat the deep ones —
    // depth is «only as a last resort». Inside the echelon — the former order:
    // the bigger group, and on a tie the closer pair.
    const surface = full.every(o => o.p.y >= surfaceY) ? 1 : 0;
    const score = { surface, len: full.length, d: pairDist(grp[0], it) };
    if (!bestScore ||
        score.surface > bestScore.surface ||
        (score.surface === bestScore.surface && (score.len > bestScore.len ||
         (score.len === bestScore.len && score.d < bestScore.d)))){
      best = full; bestScore = score;
    }
  }
  hintLastPick = best ? { keys: best.map(o => String(o.key)), anchorY: +best[0].p.y.toFixed(2),
                          pileTop: +pileTop.toFixed(2), surface: bestScore.surface === 1 } : null;
  return best;
}
let hintLastPick = null; // a self-report of the LAST pick — only for the guards/bench
// A HINT FOR AN AD (the owner's spec 2026-07-28) — a mirror of the ad shake:
// the charges have run out → we offer a video → +1 charge. Available ONLY at zero
// charges (just as the ad shake only opens up after the free ones) and within the
// per-level cap. The contract for the INTERFACE: with this handle they decide whether
// to show the lime «Ad» badge on the button.
function adHintAvailable(){
  return !!(level && !level.over && !intro && hints() < 1 && level.adHints > 0);
}
// A video for a charge. There is deliberately NO confirmation overlay: the button itself
// carries the «Ad» badge, so a tap on it is already a conscious choice (the shake's overlay
// stayed for historical reasons, I am not touching its flow).
function requestAdHint(){
  if (!adHintAvailable()) return false;
  Ads.showRewarded(()=>{ // the reward only after watching to the end (78-ads)
    // ⚠️ WE ALWAYS GIVE THE CHARGE, even if the level ended while the video was playing:
    // the player WATCHED the video to the end, and the charge is lifelong (he) and does not
    // go to waste — unlike the shake, which on a dead level has nothing to shake.
    addHints(1);
    if (level) level.adHints--;
    adHintCarry = Math.max(0, adHintCarry - 1); // the cap survives a Restart of the same run
    stats.adHintsUsed++;
    Telemetry.ev('rw', { p: 'hint' });
    updateHUD();
    if (!level.over && !intro) showHint(); // we spend the fresh charge at once — the player pressed «hint»
  }, (reason) => {
    if (reason !== 'unavailable') return;              // he closed it himself — no hint
    // no video was matched: we DO give out the charge (the owner's word 2026-08-05), but we
    // do not touch the per-level cap of ad hints — it is about impressions
    addHints(1);
    stats.adHintsUsed++;
    Telemetry.ev('rw_nofill', { p: 'hint' });
    updateHUD();
    if (level && !level.over && !intro) showHint();
  });
  return true;
}
function showHint(){
  if (level.over || intro) return;
  if (hints() < 1){
    if (adHintAvailable()){ requestAdHint(); return; } // a video instead of a refusal
    toast('No hints left'); return;
  }
  const grp = findHintGroup();
  if (!grp){
    toast('No pairs available — shake!'); // no group found — we do NOT spend the hint
    return;
  }
  spendHint(); // a countable resource (the owner's spec: start with 3, +1 per level)
  Telemetry.ev('spend', { item: 'hint' });
  reachGhostFX(grp[0], 0xffe066);
  grp.forEach(it => hintPulse(it));
  // THE CAMERA DRIVES UP to the hint's anchor (the testers' request, the owner's word
  // 2026-08-03) — a soft flight, any gesture of the player cuts it short (90-input)
  try { hintCamFly(grp[0]); } catch(e){}
  updateHUD();
}
function hintPulse(item){
  const mat = item.mesh.material;
  mat.emissive.setHex(0xffb020);
  mat.emissiveIntensity = 0;
  // 3.2 s and a multiplier of 9 (the owner's word 2026-08-04 «increase the hint's blinking
  // by 1 second»; it was 2.2/6 — the frequency of the half-waves is preserved)
  addFX(new THREE.Object3D(), 3.2, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*9)) * 0.8 * (1-k);
  });
}

// ---------- The mixer ----------
// The punishment mode (idling > level.idleLimit): once every MIXER_PERIOD it drags the lowest
// item into the blades (it sinks while spinning), its pair splits along with it, and score is
// taken away for the pair.
function mixerGrind(){
  const cand = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && !i.frozen); // the punishment mixer does not eat the surprise or the bomb (the finale finishes those off)
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  const twin = cand.find(i => i !== low && i.key === low.key);
  const group = twin ? [low, twin] : [low];
  group.forEach(it => { it.animating = true; destroyItemBody(it); });
  wakePhysics('gameplay:L182');
  const grindBefore = stats.score;
  if (scorePenalty(MIXER_PENALTY)){ // lv.1 without penalties; lv.<=5 clamped at zero (the balance table 2026-07-22)
    const shown = scoreShownDelta(stats.score, grindBefore); // denom. drop of the chip (#10)
    // ⛔ THE GRINDER TAKES THE COLOUR AND **NOT** THE REDDENING CHIP: it is not a mistake —
    // his own standing position, held through the ladder of 2026-08-24 as well, where
    // `MIXER_PENALTY` deliberately did not climb. He said «if the player MISSES».
    if (shown > 0) scorePop('-' + shown, low.p.clone().setY(low.p.y + 0.8), MISS_COLOR, true);
  }
  Sound.play('grind');
  vibrate(40);
  grindShred(low, 0.5, 0.28); // a two-phase grind: the grab -> shredding into shards (a punishment — the shaking is brighter)
  if (twin) dissolveFX(twin); // the twin is not under the blades — it leaves as crumble (pairing)
  camShake = Math.max(camShake, 0.22);
  setTimeout(()=>afterPause(()=>{
    group.forEach(removeItem); // the shards/dust are spawned by grindShred at the shredding
    wakePhysics('gameplay:L198');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 560);
}
// The final clean-up: no pairable ones are left — the mixer destroys the remainder (without penalty)
function finaleGrind(){
  const cand = items.filter(i => i.alive && !i.animating);
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  if (low.surprise){ collectSurprise(low); return; } // the finale carefully collects the surprise with a bonus
  low.animating = true;
  destroyItemBody(low);
  wakePhysics('gameplay:L211');
  Sound.play('grind');
  // by the canon the finale is CALM (auto-collection without score) — we make the grind's
  // shaking light (0.1), and not the punitive 0.28: otherwise the camera would twitch every
  // 0.5 s for the whole finale (~8-10 s). Review 2026-07-23.
  grindShred(low, 0.4, 0.1); // the same grind, a bit shorter (the finale's cadence is 0.5 s) + soft shaking
  setTimeout(()=>afterPause(()=>{
    removeItem(low);
    wakePhysics('gameplay:L222');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 410);
}

// ---------- The shake ----------
function performShake(){
  wakePhysics('shake');
  // Towards the end of the level the shake PULLS the pairs towards each other (the owner's
  // spec: «otherwise the player cannot merge the last pairs and gets angry»). The share of
  // the pull grows as things empty out: >=40 alive — pure loosening,
  // <=12 — almost pure pull towards the nearest twin by type.
  let aliveCnt = 0;
  for (const it of items) if (it.alive && !it.surprise) aliveCnt++;
  const pullK = Math.max(0, Math.min(1, (40 - aliveCnt) / 28));
  for (const it of items){
    if (!it.alive || !it.body) continue;
    let ax = 0, az = 0;
    if (pullK > 0 && !it.surprise){
      let twin = null, bd = 1e9;
      for (const ot of items){
        if (ot === it || !ot.alive || ot.animating || ot.key !== it.key) continue;
        const d = ot.p.distanceToSquared(it.p);
        if (d < bd){ bd = d; twin = ot; }
      }
      if (twin){
        const dx = twin.p.x - it.p.x, dz = twin.p.z - it.p.z;
        const len = Math.hypot(dx, dz) || 1;
        ax = dx/len; az = dz/len;
      }
    }
    // the force ×1.2 (the owner's spec: «strengthen the shaking effect by 20%»)
    const pull = 7.8 * pullK, rnd = 1 - 0.75*pullK;
    // the weight (variant 1, the owner's spec 2026-07-21): the pack's multiplier applies ONLY
    // to the random loosening/toss-up/spin; the pull towards the twin (pull) stays
    // normalised — it is functional, and not «about the feel»
    const wk = it.shakeK || 1;
    // ⚠️ THE VERTICAL IS x1.5 SINCE 2026-08-30 (the owner: «podkidyvanie v 1,5 raza bystree i
    // chut silnee») — was (5.4 + rnd*6). Together with G 22->26 the arc is both quicker and a
    // touch higher; the horizontal loosening and the twin pull are deliberately untouched —
    // they are function, not feel.
    impulseBody(it, (Math.random()-0.5)*9*rnd*wk + ax*pull, (8.1 + Math.random()*9)*wk, (Math.random()-0.5)*9*rnd*wk + az*pull);
    spinBody(it, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk);
  }
  camShake = 0.42; // +20% on the camera too
  stats.lastAction = performance.now(); // a shake is an action too, the mixer is postponed
  Sound.play('shake');
  // ⛔ NOT the one-shot full fan any more (2026-08-30): at +900 ms the pile is still
  // tumbling (the eruption lasts ~1.4 s), and the full ~110x56-cast sweep in one frame WAS the
  // recording's 36 ms worst frame. The burst spreads the same work over ACC_SLICES loop frames.
  setTimeout(()=>{ accSweepBurst = ACC_SLICES; updateHUD(); }, 900);
}
function requestShake(){
  if (level.over || intro) return;
  if (level.shakes > 0){
    useFreeShake(); // without confirmation — immediately (at the owner's demand)
  } else if (purchasedShakes() > 0){
    // THE PURCHASED STOCK (a bundle) — between the free ones and the ad: it is already paid
    // for, so it is spent just as silently, without a confirmation overlay.
    spendPurchasedShake(); stats.shakesUsed++;
    performShake(); updateHUD();
  } else if (level.adShakes > 0){
    // THE VIDEO IMMEDIATELY, WITHOUT CONFIRMATION (the owner's spec 2026-07-28: «Shake with
    // an ad works on the principle of the hint — a single decision, it starts the ad right
    // away»). The adAskOverlay overlay (Cancel/Watch) IS DELETED: the hint does not have
    // one, and the «Ad» on the button itself makes the tap a conscious one.
    // ⚠️ Since 2026-08-21 this is a LIME BADGE on the brush icon, and not a word inside the
    // caption: the button stopped being a pill (the mockups 886:3949 / 886:4017).
    // The argument is intact — the state is still visible BEFORE the tap, the carrier changed.
    // ⚠️⚠️ AND THIS IS TRUE NOT ONLY FOR THE EYE: the button's accessible name IS ASSEMBLED
    // FROM ITS CONTENTS (the hidden word + the badge), so a screen reader reads
    // «Shake Ad» and the tap stays conscious. The first edition of the icon set
    // `aria-label="Shake"` — and it nullified this argument for a blind player
    // SILENTLY; caught by a review, the cure is in shell.html at the button itself.
    startAd();
  } else {
    toast('No shakes left');
  }
}
function buyCoinShake(){
  if (level.over || intro) return; // the level managed to end — we do not deduct the coins
  if (!spendCoins(PRICE_SHAKE)){ toast('Not enough coins'); return; }
  Telemetry.ev('spend', { item: 'shake' });
  performShake(); updateHUD();
}
function useFreeShake(){
  level.shakes--; stats.shakesUsed++;
  performShake(); updateHUD();
}
function startAd(){
  // ⚠️ THE CANCELLATION OF MY OWN SPEC 2026-07-29 «no video — no reward» (the owner's word
  // 2026-08-05: «if no ad was matched, still allow the shake and the tips»). This is NOT an
  // economy hole: the hole was in the FAKE ad screen that pretended a video was playing.
  // Here there was no impression at all, the player sees an honest toast, and the action is
  // given to him anyway — the platform simply did not match a video, and the owner does not
  // want the player to be punished for that.
  // ⚠️ Only on 'unavailable': if he closed the video himself — there is no reward (78-ads).
  Ads.showRewarded(()=>{ // the reward only after watching to the end (see 78-ads)
    // the level change is closed by Ads.cancel() in genLevel; here it is the end of THE SAME
    // level that came while the video was playing (the shake has nothing to shake)
    if (level.over) return;
    level.adShakes--; stats.adShakesUsed++;
    Telemetry.ev('rw', { p: 'shake' });
    performShake(); updateHUD();
  }, (reason) => {
    if (reason !== 'unavailable') return;              // he closed it himself — no shake
    if (!level || level.over || intro) return;
    stats.adShakesUsed++;
    Telemetry.ev('rw_nofill', { p: 'shake' });
    toast('Free shake');
    performShake(); updateHUD();
  });
}
