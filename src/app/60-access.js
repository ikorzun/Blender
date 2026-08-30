// ===== 60-access: physical accessibility, pair counting =====

const DIM_GREY = new THREE.Color(0xb6bcc6).convertSRGBToLinear(); // veil of the inaccessible: a light neutral against the white field
const raycaster = new THREE.Raycaster();
function aliveMeshes(){ return items.filter(i=>i.alive).map(i=>i.mesh); }

// Accessibility is judged STRICTLY FROM ABOVE and BY SHAPE, independently of the camera.
// The story of the two bugs this fixes (the owner recorded them as the root causes):
// 1) a ray into the CENTER of an item: a torus/knot has a HOLE in the center — the ray flew
//    straight through, and a fully visible donut counted as "occluded" from the angles where
//    the hole faces the observer (a match worked from one angle and did not work from another);
// 2) rays FROM THE CAMERA: accessibility (and the grey veil) changed as the camera rotated —
//    items "dimmed depending on the angle".
// Now: a FAN of rays "toward the sky" over samples of the item's PHYSICAL shape (below).
// The camera has nothing to do with it. The mechanic is switched on by the Hard difficulty (CFG.hard);
// by default everything alive is accessible except the surprise — it is always honest.
const _apt = new THREE.Vector3();
// We shoot the rays THROUGH RAPIER (native BVH, microseconds per ray; three-raycast
// over meshes cost 86-106 ms per refresh). The samples come from item.samples,
// built over the PHYSICAL colliders (50-physics buildAccessSamples).
//
// THE FAN "TOWARD THE SKY": the vertical + 6 slanted ones (~35°). A purely vertical ray
// buried visually open items under an OVERHANGING neighbour (the owner's case:
// two open dodecahedrons side by side did not match — a cone overhung one of them).
// An item is accessible if at least one point of its physical shape sees the sky within a
// ~35° cone. The walls of the bowl honestly block the ray (you cannot reach through glass with a finger).
const SKY_DIRS = [{ x:0, y:1, z:0 }];
for (let a = 0; a < 6; a++){
  const th = a/6 * Math.PI*2, s = Math.sin(0.6), c = Math.cos(0.6); // 0.6 rad ≈ 34°
  SKY_DIRS.push({ x: Math.cos(th)*s, y: c, z: Math.sin(th)*s });
}
let _rapierRay = null;
// ⚠️⚠️ THE SINGLE POINT OF THE "TOWARD THE SKY" CAST — AND THIS IS NOT COSMETICS, IT IS A
// CONDITION OF VERIFIABILITY. The EXCLUDE_SENSORS flag must live here (otherwise a ghost
// wall "holds up the sky" — the breakdown is at the guard below), but a guard casting ITS OWN ray
// with ITS OWN flag would be checking Rapier, not us. By pulling the cast out into a function we let
// the probe walk the LIVE path: remove the flag from here and both the game and the guard turn red.
function skyCast(ray, maxToi, excludeBody){
  return world.castRay(ray, maxToi, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, null, null, excludeBody);
}
function isAccessible(item){
  // easy difficulty: any pair is accessible. The exception is the SURPRISE: it is always
  // "honestly" occluded (otherwise +150 would be taken with a tap from the very first second)
  if (!CFG.hard && !item.surprise) return true;
  if (!item.samples || !item.samples.length) return false;
  if (!_rapierRay) _rapierRay = new RAPIER.Ray({ x:0, y:0, z:0 }, { x:0, y:1, z:0 });
  const q = item.mesh.quaternion;
  const n = item.samples.length / 3;
  for (let k = 0; k < n; k++){
    _apt.set(item.samples[k*3], item.samples[k*3+1], item.samples[k*3+2])
      .applyQuaternion(q).add(item.p);
    _rapierRay.origin.x = _apt.x; _rapierRay.origin.y = _apt.y; _rapierRay.origin.z = _apt.z;
    for (let d = 0; d < SKY_DIRS.length; d++){
      _rapierRay.dir = SKY_DIRS[d];
      // the start is INSIDE our own collider — we exclude our own body from the cast
      // ⚠️⚠️ AND WE EXCLUDE SENSORS TOO — WITHOUT THIS A GHOST WALL "HOLDS UP
      // THE SKY". By default Rapier reports hits on sensors, and for us the BOWL BECOMES A
      // SENSOR DURING THE SCATTER: `dropWalls` (50-physics) turns both the wall rings
      // and the floor slab into sensors. Without the flag every accessibility ray
      // would run into a ghost, `isAccessible` would return false for EVERYTHING, and on
      // Hard the whole pile would go under the veil (that is exactly how it looked when
      // an extra container was a sensor: lvl.3 — 100 inaccessible out of 100 against 55).
      // The semantics are correct on their own too: the sky is visible through a ghost.
      const hit = skyCast(_rapierRay, 40, item.body);
      if (!hit) return true; // the ray reached the sky
    }
  }
  return false;
}
// Dynamic match radius: it shrinks together with the surface of the pile
// (see the comment in 00-config). The floor is MATCH_R_MIN, but a manual baseRadius
// below the floor (debug/tests) is respected as is.
// How many items COUNT for the endgame. Stones and the treasure are not included (the spec of
// 2026-07-22): they are not pairs, and the ∞ radius must not wait until they are cleared away.
// ⚠️ A FUNCTION, NOT A REPEATED LOOP: BOTH endgame stages and the suite's guard rest on this
// number. A copy of the count of its own inside the guard would mean it checks its own
// notion of the rule rather than the rule (a law of this project, caught five times).
function aliveCountForRadius(){
  let n = 0;
  for (const it of items) if (it.alive && !it.surprise && !it.frozen) n++;
  return n;
}
function updateMatchRadius(){
  if (!level) return;
  let top = 0;
  const aliveCnt = aliveCountForRadius();
  for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
  // ENDGAME: the leftovers lie on the bottom farther from each other than the radius
  // clamped to the floor. Bot audit: 100% of endgame shakes are because of distance, not one
  // because of burial. At <=8 alive the radius check is lifted.
  // ⚠️ This check comes FIRST, ahead of the chain: the owner's invariant "the endgame ∞ is
  // PRESERVED" — the chain reaction (the 1.1 ceiling) has no right to strangle it,
  // otherwise the last pairs in the chain again fail to combine (anti-frustration).
  if (aliveCnt <= 8){ CFG.matchRadius = 99; return; }
  // THE SOFT STAGE: fewer than ten items AND almost no shakes — we lift the
  // radius check exactly as in the hard stage (the owner's word of
  // 2026-08-11). It stands IMMEDIATELY after it and before all the other branches for the same reason:
  // this is anti-frustration, and neither the shrinking of the pile nor the miss penalty may strangle it.
  if (aliveCnt < ENDGAME_SOFT_ALIVE &&
      (level.shakes + (typeof purchasedShakes === 'function' ? purchasedShakes() : 0)) <= ENDGAME_SOFT_SHAKES){
    CFG.matchRadius = 99; return;
  }
  const k = level.topY0 > 0 ? radiusAt(top) / radiusAt(level.topY0) : 1;
  const base = CFG.baseRadius;
  let r = Math.max(Math.min(MATCH_R_MIN, base), Math.min(base, base * k));
  // chain reaction: the radius is NO LONGER "the whole bowl" — the gap ceiling is 1.1
  // (the owner's spec of 2026-07-21: "not more than 1.1 even in turbo mode");
  // the chain's perks remain: the top-up, the lightning, the ×2, the extension of the streak.
  // The boost is only UPWARD: a manual slider above the ceiling is not cut down by the chain
  // ⚠️ THE CHAIN BRANCH NO LONGER RETURNS EARLY (2026-08-11): below it stands THE CEILING
  // OF THE MISS PENALTY, and it must cover turbo as well — otherwise "a miss
  // resets a lot" would not hold exactly where the player has picked up speed.
  // The value of the branch has not changed: the same `Math.max(r, COMBO_RADIUS)`.
  if (chainUntil > performance.now()){
    r = Math.max(r, COMBO_RADIUS);
  } else if (comboUntil > performance.now() && comboLevel > 0){
    // combo fever: the radius grows as a STAIRCASE along the steps of the streak (not straight
    // to the maximum — the owner rejected "an instant 3.5" as too easy).
    // Also only UPWARD: with a base above the ceiling the staircase does not lower the radius
    const t = Math.min(1, comboLevel / COMBO_STEPS);
    r = Math.max(r, r + (COMBO_RADIUS - r) * t);
  }
  // THE MISS PENALTY IS A CEILING ON TOP OF EVERYTHING except the endgame ∞ (that one returned
  // earlier). Precisely a ceiling, not an assignment: the shrinking of the pile and the staircase of
  // the streak go on living their own lives, the penalty merely does not let the result rise above it.
  const cap = missRadiusCap();
  if (cap !== null) r = Math.min(r, cap);
  CFG.matchRadius = r;
}
// ===== RADIUS PENALTY FOR A MISS (the owner's spec of 2026-08-11) =====
// "on a mistake drop it hard down to 0.3 for some time, but bring it back after a few
// seconds" — the moment of the miss, 0 = no penalty.
let missRadiusAt = 0;
function noteMissRadius(){ missRadiusAt = performance.now(); updateMatchRadius(); }
function missRadiusClear(){ missRadiusAt = 0; }
function missRadiusActive(now){
  return missRadiusAt > 0 && ((now || performance.now()) - missRadiusAt) < MATCH_R_MISS_MS;
}
// The ceiling of the penalty: `MATCH_R_MISS` at the moment of the miss, linearly back to the base over
// `MATCH_R_MISS_MS`. ⚠️ It returns null when there is no penalty, and NOT the base: a ceiling
// "equal to the base" differs from "no ceiling at all" on exactly the day when the base
// drifts lower (via the slider in the panel), and then the penalty would silently become a BOOST.
function missRadiusCap(now){
  if (!missRadiusAt) return null;
  const t = ((now || performance.now()) - missRadiusAt) / MATCH_R_MISS_MS;
  if (t >= 1) return null;
  return MATCH_R_MISS + (CFG.baseRadius - MATCH_R_MISS) * Math.max(0, t);
}
// ⚠️⚠️ THE RECOVERY RUNS ON THE REAL CLOCK, SO IT HAS TO BE TICKED FROM THE LOOP.
// `refreshAccessibility` (and with it `updateMatchRadius`) does NOT tick at all when things
// are calm — the pile is asleep. The player missed, froze for five seconds and tapped: without
// this tick the radius would stay at 0.3 forever. The same class as "the combo boost
// must go out on a SLEEPING pile too" in 99-main.
// Returns true EXACTLY on the last tick — so that the caller updates the HUD once.
function missRadiusTick(now){
  if (!missRadiusAt) return false;
  const expired = !missRadiusActive(now);
  if (expired) missRadiusAt = 0;
  updateMatchRadius();
  return expired;
}
// Combo state: until what moment the boost is lit, the time of the last match,
// the length of the streak; the chain reaction: until what moment, the misses at the start, the top-up tick
let comboUntil = 0, lastMatchMs = 0, comboCount = 0, comboLevel = 0;
let chainUntil = 0, chainStartMisses = 0, chainNextDrop = 0, chainNextBolt = 0;
// THE TURBO SERIES (the owner's spec of 2026-07-21): the number of the chain within a continuous
// bundle — 1 for an ordinary one, 2+ when the next turbo is collected INSIDE an active one (the window
// is restarted in doMatch). >=2 is the signal to the interface for the eyes-5 eyes. chainCarry is
// the fractional accumulator of the top-up (2.6 items/tick do not spawn whole at once).
let chainSeries = 0, chainCarry = 0;
let veilPinned = false; // the tuner holds the veil on everyone — refresh does not override it
let accFlips = 0; // diagnostics: how many items changed accessibility during the last refresh
// ⚠️⚠️ THE PARTIAL SWEEP IS THE CURE FOR JANK ON HARD (measurement of 2026-08-14, a revision prompted by
// the owner's complaint "it started lagging more"). ONE call of the ray fan over the whole pile
// costs 79-86 ms (CPU ×4, lvl.11/20), and the tick ran EVERY 300 ms while the pile
// is awake — that is, every 300 ms the frame stalled for almost 0.1 s. Frame
// measurement: Easy p95 33.5/33.8 against HARD 93.0/104.6, worst frame 76 against 180.
// ⛔ THE MECHANIC IS UNTOUCHED: the same fan, the same rays, the same result per item.
// Only the DISTRIBUTION of the work changes: the periodic tick sweeps 1/ACC_SLICES
// of the pile in a round robin, a full cycle is 8 ticks. Events (a match, a shake, regens, the finale)
// still call the FULL sweep, so the reaction to the player's action is instant,
// as it was; the partial one is only the background re-evaluation of a settled pile.
// ⛔ REVISED 2026-08-30: the SHAKE's deferred (+900 ms) sweep is no longer a one-frame full
// fan — it drains as a burst of partial slices (see accSweepBurst above); the match has been
// LOCAL (refreshAccessibilityNear) since 2026-08-14 itself. Regens and the finale keep the
// full one-shot sweep — their piles are empty or nearly so.
// ⚠️ The cursor LIVES BETWEEN CALLS and sweeps over the alive ones: removing items does not
// break it (the index is taken modulo the alive length at every step).
const ACC_SLICES = 8;
let accCursor = 0;
// ⚠️⚠️ THE SHAKE'S DEFERRED SWEEP IS A BURST OF SLICES, NOT ONE FULL FAN (2026-08-30, a
// REVISION of the 2026-08-14 decision below — recorded, not silently rewritten). The owner's
// 60fps phone recording showed the +900 ms full sweep landing mid-eruption as the worst frame
// (36 ms): all ~110 items x up to 56 casts in ONE frame, exactly when the base frame is most
// loaded. performShake now arms `accSweepBurst = ACC_SLICES`, and the main loop drains ONE
// partial slice per frame (~130 ms total) — the same total work, the same result per item,
// full coverage still completes by ~+1.05 s, below the ~1.2 s two-tick deadlock window.
let accSweepBurst = 0;
// ⚠️⚠️ LOCAL RECALCULATION AROUND AN EVENT (2026-08-14, the owner confirmed: he has
// HARD switched on, that is, the fan runs at full strength). The full sweep costs
// 79-86 ms (CPU ×4) and was called AFTER EVERY COMBINATION — that is, the hitch
// settled onto the player's most frequent action.
// THE PHYSICAL JUSTIFICATION OF LOCALITY: the rays go UPWARD, toward the sky. Removing a group
// opens the sky to those who lay UNDER it and next to it — that is, inside the column above
// the point of the event. A distant item does not change its accessibility because of that.
// ⚠️ THE RADIUS IS GENEROUS (ACC_NEAR_R) rather than "by the size of the group": the cost of an error
// is asymmetric — a superfluous item in the selection costs a fraction of a millisecond, while
// a missed one lives with a stale veil until the background round.
// ⚠️ AND THE MAIN SAFETY NET: the background portioned sweep still goes through the WHOLE pile
// in ~0.8 s, so any slip of locality heals itself — accuracy
// is held by the background, speed is held by locality.
// ⛔ A CYLINDER, NOT A SPHERE: we compare by XZ and take everyone who is ABOVE the point minus
// a margin. An item strictly above the removed one can be far away in height, and a sphere
// would not have caught it — and it is exactly the one that now sees the sky.
const ACC_NEAR_R = 4.2;
function refreshAccessibilityNear(p, extra){
  updateMatchRadius();
  accFlips = 0;
  const R = ACC_NEAR_R + (extra || 0), R2 = R * R;
  for (const it of items){
    if (!it.alive) continue;
    const dx = it.p.x - p.x, dz = it.p.z - p.z;
    if (dx*dx + dz*dz > R2) continue;
    if (it.p.y < p.y - 2.0) continue;          // strictly below the event — not affected
    const was = it.accessible;
    it.accessible = !it.animating && isAccessible(it);
    if (it.accessible !== was) accFlips++;
    if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
  }
}
function refreshAccessibility(partial){
  updateMatchRadius();
  accFlips = 0;
  if (partial){
    const aliveList = [];
    for (const it of items) if (it.alive) aliveList.push(it);
    if (!aliveList.length) return;
    const sliceSize = Math.max(1, Math.ceil(aliveList.length / ACC_SLICES));
    for (let k = 0; k < sliceSize; k++){
      const it = aliveList[(accCursor + k) % aliveList.length];
      const was = it.accessible;
      it.accessible = !it.animating && isAccessible(it);
      if (it.accessible !== was) accFlips++;
      if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
    }
    accCursor = (accCursor + sliceSize) % aliveList.length;
    return;
  }
  accCursor = 0;
  for (const it of items){
    if (!it.alive) continue;
    const was = it.accessible;
    // an animating one (body removed, dissolving) does not block rays — without the guard
    // it "resurrected" in the counter of accessible pairs and made the HUD digit flicker
    it.accessible = !it.animating && isAccessible(it);
    if (it.accessible !== was) accFlips++;
    // the veil is applied SMOOTHLY in tickVeil (instant colour jumps across the whole pile
    // on recalculation read as "the colours are jumping" — the owner's complaint);
    // for an animating one we do not touch the veil — let it smoulder out as it is
    // stones do not flicker with the veil (the spec of 2026-07-22: their "different nature" reads
    // through the texture); their bodies honestly block the rays all the same — the burial is real
    // ⚠️ THE TUNER'S PIN outranks accessibility: without it the "veil on everyone" preview lived
    // at most until the next refresh tick (300 ms) and silently dissolved —
    // the veil-strength sliders would be untweakable.
    if (!it.animating && !veilPinned) it.veilTarget = (CFG.highlight && !it.surprise && !it.frozen && !it.accessible) ? VEIL_TARGET : 0;
  }
}
// Smooth fade-in/removal of the veil (~0.25 s), from the main loop every frame.
// The inaccessible ones get a grey veil (a lerp toward the neutral), NOT a multiplication of the colour
// (multiplication produced a "dirty" dark green and brown). The surprise is not
// veiled — it must gleam gold through the gaps.
// ⚠️ THE 'desat' MODE (the owner's spec of 2026-07-23) veils IN THE SHADER — otherwise
// the textured models (114 out of 130 in the frame) CANNOT be desaturated: their material.color
// is white, the colour is carried by the atlas, and a lerp of color toward grey merely darkened it.
// The lerp over color is left as a LIVE fallback for materials without our patch
// (the bomb on MeshBasicMaterial, the emergency rollback CFG.matcap=false) — without it
// they would silently stop being veiled altogether.
function applyVeil(it, k){
  const mat = it.mesh.material;
  const sh = mat.userData && mat.userData.shader;
  if (VEIL_MODE !== 'tint' && sh){
    sh.uniforms.uVeil.value = k;
    // 'fade': transparency on top of the desaturation. transparent is set ONCE
    // at material creation (switching it on the fly = a recompile).
    if (VEIL_MODE === 'fade') mat.opacity = 1 - k * (1 - VEIL_ALPHA);
    return;
  }
  mat.color.copy(it.baseColor).lerp(DIM_GREY, k);
}
// The veil on ALL the alive ones at once: the preview in the tuner and the isolation of measurements (the share
// of inaccessible ones wanders from seed to seed, and a delta measurement drowns in that noise).
// k = a number: PIN the veil on everyone at this value; k = null: release it,
// after which accessibility drives the veil again.
function veilAllItems(k){
  if (k === null){ veilPinned = false; refreshAccessibility(); return 0; }
  veilPinned = true;
  let n = 0;
  for (const it of items) if (it.alive){ it.veilK = k; it.veilTarget = k; applyVeil(it, k); n++; }
  return n;
}
function tickVeil(dt){
  const step = dt / 0.25;
  for (const it of items){
    if (!it.alive) continue;
    const target = it.veilTarget || 0, cur = it.veilK || 0;
    if (cur === target) continue;
    const next = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    it.veilK = next;
    applyVeil(it, next);
  }
}
// The distance of a pair = the GAP between the surfaces (bounding radii); it can be
// slightly negative on contact/overlap — that is "flush", always a match
function pairDist(a, b){ return a.p.distanceTo(b.p) - a.r - b.r; }
// The ONLY match rule (tap/bot/hint/aim/pair counter/
// dead-end detection — all of them come here; new checks are to be written ONLY through
// pairMatch). METRIC v3 (the owner's spec of 2026-07-20): the TRUE gap
// between the physical surfaces via Rapier's GJK — the bounding spheres
// were anisotropically generous to elongated shapes (a steak lying flat "matched through thin air":
// visible gap 1.0 = bounding −0.46). The bounding gap remains the FILTER of
// the broad phase: it is a LOWER bound on the true one, so the cut-off is honest. Compounds
// (torus/knot/spiral/teapot) are a scan over pairs of colliders with an early exit;
// the hole of the torus is "real" in the process (the distance to the tube, not to a disc).
function trueGapWithin(a, b, r){
  const na = a.body.numColliders(), nb = b.body.numColliders();
  for (let i = 0; i < na; i++){
    const ca = a.body.collider(i);
    for (let j = 0; j < nb; j++){
      const sc = ca.contactCollider(b.body.collider(j), r);
      if (sc && sc.distance <= r) return true;
    }
  }
  return false;
}
function pairMatch(a, b){
  if (!CFG.radiusOn) return true;
  const r = CFG.matchRadius;
  if (r >= 9) return true;                 // endgame (<=8 alive): the whole bowl
  if (pairDist(a, b) > r) return false;    // broad phase (no GJK)
  // the body has already been removed (animating/deleted): the item physically is not there — NOT a match.
  // The former bounding verdict "true" quietly rolled metric v3 back to the old
  // generous sphere exactly in the race with the dissolve
  if (!a.body || !b.body) return false;
  return trueGapWithin(a, b, r);
}
function availablePairs(){
  const byKey = {};
  // we cut off animating here too: between refreshes a tapped item is still listed as
  // accessible while its body has already been removed — pairs with it are phantom
  for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key] = byKey[it.key]||[]).push(it);
  let cnt = 0;
  for (const k in byKey){
    const arr = byKey[k];
    for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
      if (pairMatch(arr[i], arr[j])) cnt++;
    }
  }
  return cnt;
}
// Whether any possible match exists at all (two alive items of the same type), anywhere
function hasAnyPair(){
  const cnt = {};
  for (const it of items){
    if (!it.alive) continue;
    cnt[it.key] = (cnt[it.key]||0) + 1;
    if (cnt[it.key] >= 2) return true;
  }
  return false;
}
