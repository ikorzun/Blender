// ===== 50-physics: Rapier (WASM) — honest rigid-body physics =====
// Decision per docs/ADR-001: convex hull / primitives / compounds instead of
// sphere clusters, mass from the material's DENSITY (chrome heavy, plastic
// light), honest rotation and friction, stable stacks without jitter.
// Rapier is inlined into index.html (src/vendor/rapier.js, window.RAPIER).
// The global sleep stays OURS (99-main): Rapier's auto-sleep is slow because
// round shapes keep rolling out; in the calm world.step() is not called at all.

let world = null;
const DENSITY = { chrome: 7.8, gold: 5.0, plastic: 1.2 }; // ⛔ the rock key was removed along with the stones (2026-08-17)
const FRICTION = 0.5, RESTIT = 0.12;
// Inner inset of the physical walls from the GLASS: items come to rest before
// reaching the glass surface — there is no visual penetration
const WALL_GAP = 0.12;
const WALL_SEG = 32;
// Belt of slippery walls ABOVE THE RIM: centre offset and half-height. Pulled
// out into constants because TWO parties use them — building the colliders and
// the "where the walls end" metric.
const BELT_DY = 2.0, BELT_HALF_H = 2.1;
// Top of the PHYSICAL walls. Above it is open air, and there is nothing there
// to compare "excess past the wall" against (see maxWallExcess in 99-main).
// ⚠️⚠️ COMPUTED FROM THE SAME QUANTITIES THAT BUILD THE BELT, not from copies of
// them. The first version was `9.2 + 2.0 + 2.1` — three literals, of which 9.2
// is `FUNNEL.H`. The owner has ALREADY changed the bowl geometry (the current
// radii are ×1.15 per his spec "the blender is bigger"); had he touched the
// height, the walls would have moved while the metric stayed at 13.3, and the
// blind spot would have come back silently — and with a comment claiming the
// opposite, at that. The same rule as for the sinking threshold: read THE SAME
// quantity the live code uses, not the number it was derived from.
const WALL_TOP_Y = FUNNEL.H + BELT_DY + BELT_HALF_H;
// ⚠️⚠️ ROOT OF THE FAILURE, MEASUREMENT 2026-07-30: the solver TOLERATES DEEP
// PENETRATION OF FLAT SHAPES under the load of the pile, while our global sleep
// switches the integrator off — and whatever has sunk by the moment of sleep
// stays sunk UNTIL THE END OF THE LEVEL.
// The victims are almost always FLAT models, and an explosion is NOT needed for
// this: the worst measured case fell on plain settling, without a single shake.
// ⚠️ THE NAMES OF THE VICTIMS CHANGED, THE CLASS DID NOT. The threshold was
// derived on a pool that had the steak (13 cases out of 17) and the lollipop;
// both were REMOVED from the game in v1-test-187.
// Re-measured on TYPES=120: first in line is now `brickbar`, behind it the
// gingerbread man. Do not read the list of types as current — read "flat under
// the load of the pile"; a new flat model appears — it will be the next one.
// ⚠️ THE THRESHOLD IS TAKEN FROM THE DISTRIBUTION, NOT BY EYE, and the
// distribution is BIMODAL. 60 snapshots of a SLEEPING pile (only that one is
// ever "forever"): p50 0.024, p90 0.061, p95 0.071, then 0.083 — and an EMPTY
// CORRIDOR up to 0.224, where exactly one case sits, that very bug. 0.12 stands
// in the middle of the corridor: 1.45× above the healthy maximum and 1.87×
// below the defect.
// ⚠️ RE-MEASURED ON TYPES=120 (v1-test-187, after the steak and the lollipop
// were removed), 66 snapshots: p95 0.086, maximum 0.088, above 0.10 — ZERO. The
// threshold stays valid with a 1.36× margin. ⚠️ RE-MEASURE ON THE NEXT CHANGE
// OF THE MODEL BATCH: the number is derived from the shape of the items, not
// from physics in general.
// ⚠️ ON A FLYING PILE THESE NUMBERS ARE DIFFERENT (p95 0.13, max 0.28) and are
// NOT a threshold — there the sinking resolves itself, see the calm gate in
// rescueSweep.
const FLOOR_PEN_MAX = 0.12;
// ⚠️⚠️ …BUT FOR THIN MODELS AN ABSOLUTE THRESHOLD IS MEANINGLESS, AND THE SOAK
// OF 2026-08-07 FOUND THIS. `brickbar` is a slab with half-thickness 0.121: at
// a sinking of 0.103 it is buried in the plate BY 85% and holds that way for
// longer than 5 s, yet it NEVER reaches 0.12 — that is, the rescuer never comes
// for it BY CONSTRUCTION. The same defect the rescuer started from ("a hole in
// the objects"), just for a model that is thinner than the threshold itself.
// Hence threshold = the MINIMUM of the absolute one and a fraction of the
// item's own half-thickness.
// ⚠️ THE FRACTION WAS CHOSEN BY A STAIRCASE, NOT BY EYE (859 samples, lvl 20,
// 8 seeds, settling + 3 shakes). brickbar's own distribution: p50 0.002,
// p75 0.02, p90 0.061, max 0.091 — that is, normally it lies well, it is the
// top tenth that goes deep.
// How many of its INSTANTANEOUS samples would fall under the threshold:
// fraction 0.3 -> 17%, 0.4 -> 13%, 0.5 -> 12%, 0.6 -> 6%, 0.8 -> 0%.
// ⚠️⚠️ THE FRACTION IS 0.9, AND THE STAIRCASE ABOVE WAS COMPUTED ON THE WRONG
// THICKNESS — naming it so the next person does not repeat it. The percentages
// above are derived from the GEOMETRIC half-thickness 0.121, whereas the
// rescuer takes `downReach` = min(bounding r, box projection), and for the slab
// that is 0.1085. At fraction 0.8 the effective threshold came out at 0.0868 —
// BELOW the slab's own healthy maximum (0.091), and the rescuer started lifting
// items lying NORMALLY: the guard "on a settled pile the rescuer has nothing to
// do" went red. 0.9 gives 0.0977: above the healthy tail (0.091) and below the
// observed defect (0.103). The window is narrow, but that is exactly the
// physical state of affairs for a model as thick as the threshold itself.
// ⚠️⚠️ THE FIRST TWO ATTEMPTS WERE WORSE THAN THE BASELINE — soak on seed 101:
//   baseline (absolute 0.12)         lifts  24, sinkings 3
//   fraction 0.6 on the MINIMAL axis lifts 115 (storm), sinkings 0
//   fraction 0.6 on the vertical     lifts  36, sinkings 0
//   fraction 0.8 on the vertical     lifts   8, sinkings 0   <- taken
// That is, 0.8 beats the baseline ON BOTH axes at once, it does not trade one
// for the other.
// ⚠️ "A sample under the threshold" != a teleport: the calm gate and the
// FLOOR_SUNK_TICKS counter still require the sinking to HOLD; therefore a
// fraction that cuts off 0% of instantaneous samples still catches the STUCK
// case (observed 0.103 against the slab's threshold of 0.097).
// ⚠️ THE EDIT IS SURGICAL: for models with half-thickness >= 0.2 the fraction
// yields >= 0.12, i.e. for them the threshold does not change at all. There is
// almost nobody in the pool thinner than 0.2.
const FLOOR_PEN_FRAC = 0.9;
// "almost motionless" for the calm gate (see rescueSweep). The reference is our
// own sleep thresholds: pile calm maxV<0.25, forced sleep maxV<2.0.
const FLOOR_CALM_V = 0.5;
// how many checks in a row (every 0.5 s) the sinking must hold for it to be
// lifted even on a MOVING item. 3 = ~1.5 s: a transient from a shake does not
// live that long, while the milling vibration keeps an item sunk for tens of
// seconds (soak measurement: 30 s in a row).
const FLOOR_SUNK_TICKS = 3;
// ⚠️⚠️ THE RESCUER'S CEILING: above it an item counts as "flown away". It was
// 60 — and that turned out to be TOO LITTLE for the final top-up of pairs: it
// spawns a partner for every orphan on a staircase `FUNNEL.H + 2 + k*1.2` with
// no cap on k, and on lvl 40 (55 orphans) the spawn peak is 67.4 — ABOVE THE
// CEILING. The rescuer was teleporting what had just been topped up:
// 23 teleports measured over 4 runs, with the walls intact
// (wallExcess max 0.176 against a norm of 0.20) and zero falls through the floor.
// ⛔ CURING IT FROM THE TOP-UP SIDE WAS TRIED AND REJECTED BY MEASUREMENT — it
// gets WORSE: a clamped staircase thickens the spawn, and what decides it is
// exactly the DENSITY, not the height.
// Rescues on lvl 40: no cap 23, cap of 30 layers — 37, cap of 10 layers — 102.
// Therefore it is the CEILING that is edited (physics' territory), and the
// top-up stays as it is. 90 = the peak 67.4 plus a margin for seed spread; a
// "flown away" item is still caught — out of a bowl 9.2 high no impulse throws
// anything up to 90.
const RESCUE_CEIL = 90;
let floorCol = null, baseFloorCol = null;
let tmpWallBody = null;  // tall temporary wall for the duration of the genLevel settling (ONE body, A1)

const _pq = new THREE.Quaternion();
const _pe = new THREE.Euler();

function initPhysicsWorld(){
  world = new RAPIER.World({ x: 0, y: -G, z: 0 });
  world.timestep = 1/60;
  // per Rapier's docs/issues: dense stacks are more stable with more iterations
  try { world.numSolverIterations = 8; } catch(e){}
  try { world.maxCcdSubsteps = 4; } catch(e){}
  // Container: a STEPPED cone of 12 rings of vertical segments.
  // History: one long inclined panel with a quaternion rotation did not stand
  // along the cone (near the bottom its face drifted ~0.3 outwards — items
  // "inside the glass", the rescuer stormed). Rings without a tilt: the face =
  // radiusAt(midY)-WALL_GAP is trivially correct. The step between the rings is
  // 0.12 — it does not protrude inwards.
  // ⚠️ A1 (mobile-tier perf 2026-07-31): THE WHOLE CONTAINER IS ONE fixed body
  // with many colliders. There used to be 417 separate bodies (12 rings × 32 +
  // 32 upper ones + the floor) against 182 items. The geometry does not change:
  // previously the body carried the offset and the collider the rotation; now
  // the collider carries both, and the body stands at the origin.
  // ⛔⛔ THIS GAVE NO GAIN, AND I NAME THE REASON HONESTLY — I OPTIMIZED THE
  // WRONG COUNTER. Measurement: solver p95 at CPU ×4 37.0 -> 35.7 (noise),
  // without throttling 6.7 -> 6.7. BODIES went 599 -> 183, while COLLIDERS
  // stayed at 599 just as they were — RAPIER'S BROAD PHASE WORKS ON COLLIDERS
  // (proxies), not on bodies. The 417 wall proxies went nowhere.
  // ⚠️ CONSEQUENCE FOR A FUTURE WALL EDIT: the real lever is the NUMBER OF WALL
  // COLLIDERS (fewer segments / one shape for the whole bowl), not the number
  // of bodies.
  // ⚠️ And a caveat about the word "identical": the geometry — yes, the
  // BEHAVIOUR — no. The order of contacts in the solver changes, a pile of 182
  // bodies is chaotic, the trajectories diverge. The statistics hold (alive
  // 182/182, top 7.65 -> 7.54, below the floor 0).
  const shellB = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  shellBody = shellB; // SHATTERING BOWL (v2 prototype): access for wall rebuilds
  const RINGS = 12, LOW = 0.5;
  for (let ring = 0; ring < RINGS; ring++){
    const y0 = LOW + (FUNNEL.H - LOW)*ring/RINGS;
    const y1 = LOW + (FUNNEL.H - LOW)*(ring + 1)/RINGS;
    const midY = (y0 + y1)/2;
    // ⚠️ A RING'S FACE GOES BY ITS LOWER EDGE, NOT BY ITS MIDDLE (measurement
    // 2026-07-31). A ring's step is 0.725 in height, and the cone widens by
    // 0.134 across it. With the face at midY the wall at the BOTTOM of the ring
    // turns out WIDER than the cone at that height — an item lying on it
    // honestly sticks out past radiusAt(its y), and the rescuer counts that as
    // an escape: after π/2 was removed the number of teleports doubled
    // (24 -> 47 on lvl 40). Taken at y0 the wall is ALWAYS inside the cone.
    // ⛔⛔ `radiusAt` MUST NOT BE CALLED HERE — THAT WAS THE INCIDENT OF
    // 2026-08-17. `initPhysicsWorld` builds PERMANENT geometry and runs EXACTLY
    // ONCE PER LOAD. Back then `radiusAt` was made to depend on the level
    // number, and on a start at a special level the bowl was assembled as a
    // CYLINDER r≈3.96 instead of the cone 2.4→4.1 and stayed that way UNTIL THE
    // END OF THE SESSION, on all the ordinary levels.
    // Measurement: start on the 200th → on the 201st 33 items outside the bowl,
    // 6 below the floor; start on the 201st → zero and zero.
    // ⚠️ RULE: the inputs of a one-shot initialization must be CONSTANTS.
    // The cone is written explicitly as a formula out of FUNNEL — by definition
    // it does not depend on the level. Should a container of a different shape
    // be needed, it is entitled to ITS OWN set of colliders alongside, not to a
    // branch here.
    const faceR = (FUNNEL.R0 + SLOPE * Math.max(0, Math.min(y0, FUNNEL.H))) - WALL_GAP;
    const chord = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    for (let i = 0; i < WALL_SEG; i++){
      const a = (i + 0.5)/WALL_SEG*Math.PI*2;
      const cd = RAPIER.ColliderDesc.cuboid(0.30, (y1 - y0)/2 + 0.09, chord/2)
        .setFriction(FRICTION).setRestitution(RESTIT)
        .setTranslation(Math.cos(a)*(faceR + 0.30), midY, Math.sin(a)*(faceR + 0.30));
      _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ NO +π/2: the local X must go RADIAL (see the WALL_SEG header)
      cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
      wallColliders.push(world.createCollider(cd, shellB)); // detachable (bowl shatter)
    }
  }
  // vertical continuation above the rim: slippery, WITHOUT a tilt (the tilt was
  // a source of geometric error too)
  for (let i = 0; i < WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const faceR = FUNNEL.R1 - WALL_GAP;
    const chord2 = 2*faceR*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const cd2 = RAPIER.ColliderDesc.cuboid(0.30, BELT_HALF_H, chord2/2)
      .setFriction(0.02).setRestitution(RESTIT)
      .setTranslation(Math.cos(a)*(faceR + 0.30), FUNNEL.H + BELT_DY, Math.sin(a)*(faceR + 0.30));
    _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ NO +π/2: the local X must go RADIAL (see the WALL_SEG header)
    cd2.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    wallColliders.push(world.createCollider(cd2, shellB)); // detachable (bowl shatter)
  }
  // ⚠️ THE PLATE IS THIN (half-thickness 0.3, i.e. [0.55..1.15]) AND THERE IS
  // NOTHING UNDER IT. Measurement 2026-07-30: the maximum sinking on a flying
  // pile is 0.28 — 7% is left to the middle of the plate, where the narrow
  // phase would give a DOWNWARD normal and the item would be squeezed out into
  // the void onto the blades. Thickening downwards (half-thickness 2.4) WAS
  // TRIED: it affects neither the distribution of the sinkings nor the perf
  // (physics step on an explosion p95 7.9-10.9 against 7.7-9.1), REJECTED by
  // the owner on 2026-07-30 — "roll back the plate thickness, keep only the
  // rescuer". Bringing it back = two numbers in these lines.
  // the plate sits on the same container body; floorCol is needed by the floor
  // rescuer (the TRUE penetration is taken through it), and it stays a separate
  // COLLIDER
  baseFloorCol = world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.3, FUNNEL.R0 + SLOPE*FLOOR_REST + 0.2)
      .setFriction(FRICTION).setTranslation(0, FLOOR_REST - 0.3, 0), shellB);
  floorCol = baseFloorCol;
}

// ===== SHATTERING BOWL (v2 prototype): ghost walls =====
// ⚠️ NOT removeCollider: the first version removed and re-created the walls on
// genLevel — WASM Rapier crashed with "unreachable" on the very first step
// after the re-creation (the crash was caught by the reset guard). A sensor is
// the canonically safe path: the collider stays in the world but stops pushing;
// restoring it = one flag, zero creations/removals.
let wallColliders = [], shellBody = null;
// ⚠️⚠️ "THE BOWL IS OPEN" IS PHYSICS' LOCAL SOURCE OF TRUTH, NOT AN IMPORT FROM
// GAMEPLAY. It is raised and cleared EXACTLY WHERE the walls and the floor are
// switched to sensors, therefore "the walls are ghosts" and "the rescuer is
// off" physically cannot drift apart. Dragging `bowlShattering` here from
// 80-gameplay would be a second piece of state about the same fact — and two
// sources of truth diverge sooner or later.
let bowlOpen = false;
function bowlIsOpen(){ return bowlOpen; }
function dropWalls(){
  bowlOpen = true;   // and the rescuer falls silent (see the gate in rescueSweep)
  for (const c of wallColliders){ try { c.setSensor(true); } catch(e){} }
  // AND THE FLOOR PLATE TOO (the owner's word 2026-08-03: "if the bowl breaks,
  // then none of its silhouette should remain") — the solid plate held the pile
  // on an invisible disc shaped like the floor, items "lay along the bowl".
  // A ghost floor: on the shatter everything honestly spills into the white
  // void (the slow-mo holds it back), and the collect wave catches up with the
  // items in flight.
  try { floorCol.setSensor(true); } catch(e){}
}
// ⚠️ ensureWalls IS CALLED FROM genLevel — the walls and the floor return to
// the solid state after the bowl shatter. What is solid is decided by EXACTLY
// this function.
function ensureWalls(){
  bowlOpen = false;  // walls are solid again — the rescuer has something to guard
  floorCol = baseFloorCol;
  for (const c of wallColliders){ try { c.setSensor(false); } catch(e){} }
  try { baseFloorCol.setSensor(false); } catch(e){}
}
function wallsCount(){ // number of SOLID wall colliders (for the guards)
  let n = 0;
  for (const c of wallColliders){ try { if (!c.isSensor()) n++; } catch(e){} }
  return n;
}

// the temporary wall is ONE body too (A1): it is built and torn down EVERY
// level, i.e. the former 32 bodies were created and destroyed on every genLevel
function buildTempTallWall(){
  removeTempTallWall();
  tmpWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // ⚠️ THE RADIUS IS TAKEN FROM `radiusAt` — THE SINGLE POINT OF WIDTH
  // (20-arena), not as the literal `FUNNEL.R1`. Today they are identically
  // equal (radiusAt(FUNNEL.H) ≡ R1), so this is not an optimization but a guard
  // against divergence: change the bowl geometry and the settling wall will
  // follow it by itself, without a second edit here.
  const R = radiusAt(FUNNEL.H);
  for (let i=0; i<WALL_SEG; i++){
    const a = (i + 0.5)/WALL_SEG*Math.PI*2;
    const chord = 2*(R - WALL_GAP)*Math.tan(Math.PI/WALL_SEG) + 0.08;
    const cd = RAPIER.ColliderDesc.cuboid(0.15, 24, chord/2).setFriction(0.02)
      .setTranslation(Math.cos(a)*(R - WALL_GAP + 0.15), 24, Math.sin(a)*(R - WALL_GAP + 0.15));
    _pq.setFromEuler(_pe.set(0, -a, 0));   // ⚠️ NO +π/2: the local X must go RADIAL (see the WALL_SEG header)
    cd.setRotation({ x:_pq.x, y:_pq.y, z:_pq.z, w:_pq.w });
    world.createCollider(cd, tmpWallBody);
  }
}
function removeTempTallWall(){
  if (tmpWallBody) world.removeRigidBody(tmpWallBody);
  tmpWallBody = null;
}

// Physical shape by type: primitive / convex hull from the render geometry /
// compound
// ⚠️⚠️ THE RING COMES FROM THE GEOMETRY ITSELF (the doughnut, 2026-08-07). The
// doughnut model used to go into the `default` branch — convex hull, and that
// CLOSES THE HOLE: physically an invisible membrane appears in the middle of
// the doughnut, and an item comes to rest on empty space.
// ⚠️ THE NUMBERS ARE NOT TYPED IN BY HAND, they are measured off the vertices:
// change the model or its scale and the ring moves along by itself. The plane
// is determined by where the HOLE is: for our doughnut that is XZ (the Y axis),
// and NOT XY as for three's procedural torus (that case is `torus` below, and
// the two must not be confused: a compound standing perpendicular to the mesh
// "welds" items into the visible ring — the rake of 2026-07).
// Returns false if there is no hole — then the caller honestly falls into hull.
// ⚠️⚠️ THE MEASUREMENT IS SPLIT OUT OF THE BUILDER (2026-09-02, his word «fix the ring samples»),
// AND THAT SPLIT IS THE FIX ITSELF — not a tidy-up. Before it, `ringFromGeometry` both measured and
// built, so the accessibility samples had NO WAY to ask where the ring is: they fell to the hull
// default and put 6 of 8 origins for the lifebuoy INTO THE DOUGHNUT HOLE, i.e. outside the very
// collider they are required to be inside. The collider and the samples disagreed BY CONSTRUCTION.
// ⛔ THE TWO CONSUMERS MUST KEEP READING THIS ONE FUNCTION. A copy of the derivation beside the
// working one is this project's single most repeated defect, and here it would be invisible: both
// sides would look right in isolation and only their DISAGREEMENT is the bug.
// Returns null when there is no usable ring — and then BOTH callers fall through to the hull, which
// is what keeps them in step even in the failure case.
function ringMeasure(geo, s){
  // ⚠️⚠️ THE VERTEX WALK IS CACHED PER GEOMETRY, AND THAT IS CORRECT RATHER THAN MERELY CHEAP:
  // every quantity it derives is SCALE-FREE. `ratio` is a quotient; `tube > 0.12*R` divides out;
  // and `tube > 0.02*s` is `(rmax-rmin)/2 > 0.02` once `s` is cancelled. So the whole decision —
  // including both refusals — depends on the geometry alone, and only R and tube carry `s`.
  // ⚠️ WITHOUT THIS THE FIX WOULD HAVE COST WHAT IT SAVES: two consumers now ask, so a ring item
  // would walk its 1471 vertices TWICE per body creation where the old code walked once, on a path
  // the turbo top-up drives every ~125 ms. Cached, it is walked ONCE PER TYPE for the session —
  // strictly cheaper than before the change.
  // ⚠️ The geometry comes from the shared per-type cache, so `_ringRaw` is a per-type answer; the
  // `false` sentinel is stored too, or a refusal would be re-walked on every call.
  let raw = geo.userData ? geo.userData._ringRaw : undefined;
  if (raw === undefined){
    raw = ringMeasureRaw(geo);
    if (!geo.userData) geo.userData = {};
    geo.userData._ringRaw = raw;
  }
  if (!raw) return null;
  const R = (raw.rmin + raw.rmax) / 2 * s, tube = (raw.rmax - raw.rmin) / 2 * s;
  return { u: raw.u, v: raw.v, ax: raw.ax, R, tube, ratio: raw.ratio };
}
function ringMeasureRaw(geo){
  const P = geo.attributes.position.array, n = P.length / 3;
  if (!n) return false;
  // radius about each of the three axes; the hole is where the MINIMUM is >> 0
  const axes = [[0, 2, 1], [0, 1, 2], [1, 2, 0]];   // [u, v, axis]
  let best = null;
  for (const [u, v, ax] of axes){
    let rmin = 1e9, rmax = 0;
    for (let i = 0; i < n; i++){
      const r = Math.hypot(P[i*3+u], P[i*3+v]);
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    }
    if (rmax > 1e-4 && (!best || rmin / rmax > best.ratio)) best = { u, v, ax, rmin, rmax, ratio: rmin / rmax };
  }
  // ⚠️⚠️ THE rmin/rmax RATIO IS NOT AN AUTO-DETECTOR OF A HOLE, and the
  // counterexample turned up in the guard's own control: for the SOLID pig
  // `animalpig` it is 0.393, that is ABOVE this threshold. A high ratio also
  // comes from the model being NARROW along an axis, not from a hole. That is
  // why the branch is switched on by the EXPLICIT flag `phys:'ring'`, and the
  // threshold here is only the lower cut-off "on this axis there is certainly
  // no hole".
  if (!best || best.ratio < 0.25) return false;
  const R = (best.rmin + best.rmax) / 2;            // the tube's centre line, at s = 1
  const tube = (best.rmax - best.rmin) / 2;         // its radius, at s = 1
  // ⚠️ INSURANCE AGAINST A DEGENERATE RING (the dispatcher's remark): were
  // someone to set the flag on a narrow model, the tube would come out almost
  // zero and items would travel THROUGH it. An honest fallback to the hull is
  // better than a ring made of thread.
  if (!(tube > 0.12 * R) || !(tube > 0.02)) return false;
  return { u: best.u, v: best.v, ax: best.ax, rmin: best.rmin, rmax: best.rmax, ratio: best.ratio };
}
// ⛔⛔ THE SEGMENT COUNT CARRIES THE SAMPLES' SAFETY, AND THE BOUND IS **RING_SEG >= 7**. The
// samples sit on the circle while the chain is chords, so the worst gap is the sagitta
// `R*(1 - cos(pi/RING_SEG))`, and it must stay under the `tube > 0.12*R` gate that `ringMeasure`
// enforces: 1-cos(pi/7) = 0.099 < 0.12 passes, 1-cos(pi/6) = 0.134 > 0.12 FAILS. At 12 it is
// 0.0341, a 3.5x margin.
// ⚠️⚠️ AND NEITHER SHIPPED RING COULD DETECT THE VIOLATION: their tube/R is 0.26 and 0.50, two to
// four times the gate, so at RING_SEG = 6 they would still measure fine while a future thin ring
// sitting near the gate would put four of its eight origins outside its own collider — exactly the
// defect this branch exists to remove. 6 is the obvious «cheaper collider» value; the bound is
// written here so that edit cannot be made silently. There is a guard on the margin itself.
const RING_SEG = 12;
function ringFromGeometry(add, geo, s){
  const m = ringMeasure(geo, s);
  if (!m) return false;
  const pts = [];
  for (let k = 0; k <= RING_SEG; k++){
    const a = k / RING_SEG * Math.PI * 2, p = { x: 0, y: 0, z: 0 };
    p[['x','y','z'][m.u]] = Math.cos(a) * m.R;
    p[['x','y','z'][m.v]] = Math.sin(a) * m.R;
    pts.push(p);
  }
  addCapsuleChain(add, pts, m.tube);
  return true;
}
function hullFromGeometry(geo, s){
  const src = geo.attributes.position.array;
  const pts = new Float32Array(src.length);
  for (let i=0; i<src.length; i++) pts[i] = src[i]*s;
  return RAPIER.ColliderDesc.convexHull(pts);
}
// "Rolly" shapes get heavier angular damping — Rapier has no rolling friction
const ROLLY = { ball:1, torus:1, cyl:1, knot:1, spiral:1, pill:1, egg:1 };

// A chain of capsules along a polyline (exact physics for tubular shapes:
// torus, knot, spiral). IMPORTANT: three builds the torus/knot in the XY
// plane — the former compounds of balls stood in XZ, perpendicular to the
// mesh, hence the "weldings".
const _capQ = new THREE.Quaternion(), _capUp = new THREE.Vector3(0,1,0), _capDir = new THREE.Vector3();
function addCapsuleChain(add, pts, r){
  for (let i=0; i<pts.length-1; i++){
    const a = pts[i], b = pts[i+1];
    _capDir.set(b.x-a.x, b.y-a.y, b.z-a.z);
    const len = _capDir.length();
    if (len < 1e-6) continue;
    _capDir.multiplyScalar(1/len);
    _capQ.setFromUnitVectors(_capUp, _capDir);
    const cd = RAPIER.ColliderDesc.capsule(len/2, r)
      .setRotation({ x:_capQ.x, y:_capQ.y, z:_capQ.z, w:_capQ.w });
    add(cd, (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
  }
}

// The accessibility samples are built FROM THE PHYSICAL shapes (points strictly
// inside the colliders): a vertical column through an interior point is
// guaranteed to cross its own collider — a false miss is impossible. Samples
// taken off the render meshes gave a rare desync with physics (spiral/knot:
// 1 out of ~70 singles).
function buildAccessSamples(item, typeName, geo){
  const s = item.scl;
  const pts = [];
  const push = (x, y, z) => pts.push(x, y, z);
  // ⚠️ phys:'ball' is answered BEFORE the switch: the switch is keyed by typeName, and a model
  // type's name is its own ('sportgolfball'), so it would fall into the hull default — 8 face
  // centroids of a sphere instead of the 5 exact points, i.e. 56 raycasts per item instead of 35
  // on Hard, for no extra information. The five points are byte for byte the 'ball' case below.
  if (item.type && item.type.phys === 'ball'){
    push(0, 0, 0); push(0.5*s, 0, 0); push(-0.5*s, 0, 0); push(0, 0, 0.5*s); push(0, 0, -0.5*s);
    item.samples = new Float32Array(pts);
    return;
  }
  // ⛔⛔ phys:'ring' IS ANSWERED HERE FOR THE SAME REASON phys:'ball' IS — and its absence was a
  // REAL defect, not an inefficiency (his word 2026-09-02, «fix the ring samples»). The switch is
  // keyed by typeName, so a ring model fell to the hull default, whose 0.6-shrink is only safe for
  // a SOLID shape: for a torus, 60% of a point on the tube lands in the HOLE. Measured on the
  // shipped vertex arrays: `propslifebuoy` got 6 of 8 origins in the hole, `fooddonutsprinkles` 7
  // of 8 off the body. And the hole is not merely empty — it is FREE SPACE A NEIGHBOUR OCCUPIES, so
  // `castRay(solid=true)` returns toi=0 from such an origin. ⚠️ THE SYMPTOM IS STATED AS THE CODE
  // SUPPORTS IT, NOT AS THE WORST STORY: `isAccessible` is an OR over origins, so a ring read
  // inaccessible only when the hole origins were blocked AND the one or two that did land on the
  // body were roofed as well. That is a NARROWED chance of being seen, not a guaranteed veil — and
  // when it happened the player got the grey veil plus, on tap, a real score penalty for something
  // plainly reachable. The mirror case is as real: a covered ring whose hole column is clear read
  // ACCESSIBLE.
  // ⚠️⚠️ THE SAMPLES ARE THE TUBE'S OWN CENTRE LINE, from the SAME measurement the collider is
  // built from — one derivation, two consumers, so their NUMBERS cannot drift apart.
  // ⛔ BUT THE AGREEMENT IS NOT YET STRUCTURAL, AND THE CLAIM MUST NOT BE OVERSTATED: this branch
  // answers `phys:'ring'` BEFORE the switch, while `createItemBody` answers it INSIDE the switch's
  // `default:` arm. They are in step because every ring-flagged type carries a MODEL name that
  // misses every primitive case — by naming, not by construction. Give a type named 'torus' or
  // 'cyl' the ring flag and it takes a hard-coded primitive collider against measured origins, i.e.
  // this very defect in the opposite direction. Unreachable today (TYPES holds model names only).
  // ⚠️⚠️ AND THEY ARE INSIDE BY THE EXISTING GATE, NOT BY THESE TWO MODELS' NUMBERS: the chain
  // approximates the circle with chords, so a point on the circle stands at most
  // R*(1 - cos(pi/RING_SEG)) = 0.0341*R off a chord, while `ringMeasure` REFUSES to return a ring
  // at all unless `tube > 0.12*R`. That is a guaranteed 3.5x margin for any model that reaches
  // this branch. ⚠️ THE FIGURES THAT FOLLOW ARE AT s = 1 AND THE HOOK REPORTS AT s = MESH_SCALE
  // (0.62): buoy 0.027 against a tube of 0.209, donut 0.023 against 0.331 — lift them into an
  // assert unscaled and it goes red on a healthy build.
  // ⚠️ EIGHT, matching the hull default, so the per-item raycast cost on Hard does not move.
  // ⛔ AND NEVER A SAMPLE AT THE CENTRE: for a ring that IS the hole — the origin this fix exists
  // to remove.
  if (item.type && item.type.phys === 'ring'){
    const m = ringMeasure(geo, s);
    if (m){
      const RING_ACC_N = 8;
      for (let k = 0; k < RING_ACC_N; k++){
        const a = k / RING_ACC_N * Math.PI * 2, c = [0, 0, 0];
        c[m.u] = Math.cos(a) * m.R;
        c[m.v] = Math.sin(a) * m.R;
        push(c[0], c[1], c[2]);
      }
      item.samples = new Float32Array(pts);
      return;
    }
    // ⚠️ NO MEASUREMENT -> FALL THROUGH TO THE HULL, which is EXACTLY what the collider does one
    // function away. The failure case has to stay in step too, or the disagreement simply moves.
  }
  switch (typeName){
    case 'cube':
      push(0, 0, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) push(sx*0.45*s, 0.45*s, sz*0.45*s);
      break;
    case 'ball':
      push(0, 0, 0); push(0.5*s, 0, 0); push(-0.5*s, 0, 0); push(0, 0, 0.5*s); push(0, 0, -0.5*s);
      break;
    case 'cyl':  push(0, 0, 0); push(0, 0.5*s, 0); push(0, -0.5*s, 0); push(0.35*s, 0, 0); push(-0.35*s, 0, 0); break;
    case 'pill': push(0, 0, 0); push(0, 0.4*s, 0); push(0, -0.4*s, 0); break;
    case 'torus':
      for (let k = 0; k < 8; k++){ const a = k/8*Math.PI*2; push(Math.cos(a)*0.68*s, Math.sin(a)*0.68*s, 0); }
      break;
    case 'knot': {
      const R = 0.58*s;
      for (let k = 0; k < 10; k++){
        const u = k/10 * Math.PI*4, cs = Math.cos(1.5*u);
        push(R*(2+cs)*0.5*Math.cos(u), R*(2+cs)*0.5*Math.sin(u), R*Math.sin(1.5*u)*0.5);
      }
      break;
    }
    case 'spiral':
      for (let k = 0; k < 8; k++){
        const t = k/7, th = t*Math.PI*2*2.2;
        push(Math.cos(th)*0.46*s, (t-0.5)*1.5*s, Math.sin(th)*0.46*s);
      }
      break;
    case 'teapot':
    case 'surprise':
      push(0, 0, 0); push(0, 0.3*s, 0); push(0.62*s, 0.15*s, 0); push(-0.7*s, 0.05*s, 0);
      break;
    default: { // hull types: render face centroids pulled towards the centre —
               // a convex combination of vertices => strictly inside the hull
      const pos = geo.attributes.position;
      const idx = geo.index ? geo.index.array : null;
      const triCount = Math.floor((idx ? idx.length : pos.count) / 3);
      const K = 8, step = Math.max(1, Math.floor(triCount / K));
      for (let k = 0; k < K; k++){
        const t = Math.min(triCount - 1, k*step);
        const i0 = idx ? idx[t*3] : t*3, i1 = idx ? idx[t*3+1] : t*3+1, i2 = idx ? idx[t*3+2] : t*3+2;
        const cx = (pos.getX(i0)+pos.getX(i1)+pos.getX(i2))/3;
        const cy = (pos.getY(i0)+pos.getY(i1)+pos.getY(i2))/3;
        const cz = (pos.getZ(i0)+pos.getZ(i1)+pos.getZ(i2))/3;
        push(cx*0.6*s, cy*0.6*s, cz*0.6*s);
      }
    }
  }
  item.samples = new Float32Array(pts);
}
function createItemBody(item, typeName, geo){
  const s = item.scl;
  const density = item.surprise ? DENSITY.gold : (item.type.mat === 'chrome' ? DENSITY.chrome : DENSITY.plastic);
  // shake weight (variant 1): the response to loosening, per the model's pack;
  // absent from the map (surprise/bomb/a type without tex) = 1.0. The steak used
  // to be the example — the type was removed by the owner in v187, the rule has
  // not changed because of that
  item.shakeK = SHAKE_RESP[item.type.tex] || 1;
  item.mesh.updateMatrixWorld();
  const q = item.mesh.quaternion;
  const bd = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(item.p.x, item.p.y, item.p.z)
    .setRotation({ x:q.x, y:q.y, z:q.z, w:q.w })
    // ⚠️ A DEFAULT, NOT A LITERAL: the knob `physKnobs({ccd:…})` paints only the
    // ALREADY created bodies, while regen() makes new ones — a "without CCD"
    // measurement arm would silently be measuring the live configuration. The
    // live value is true, it has not been changed.
    .setCcdEnabled(ccdDefault) // against tunnelling at speed (intro/shake)
    .setLinearDamping(0.3)
    // ⚠️⚠️ `phys:'ball'` COUNTS AS ROLLY, AND THAT IS THE WHOLE POINT OF THE FLAG. ROLLY is keyed
    // by the SHAPE name ('ball', 'torus', …), and a model type's typeName is its own name
    // ('sportbasketball'), so the five balls of the 2026-08-28 batch would silently have taken the
    // 1.2 of a box. Rapier has no rolling friction: in a cone-shaped bowl that is a sphere that
    // never stops, i.e. maxBodySpeed never falls under 0.25 for 0.4 s, the pile never sleeps, and
    // on Hard the accessibility fan keeps ticking — the very cost measured on 2026-08-14.
    .setAngularDamping((ROLLY[typeName] || (item.type && item.type.phys === 'ball')) ? 2.5 : 1.2);
  const body = world.createRigidBody(bd);
  const add = (cd, ox, oy, oz) => {
    cd.setDensity(density).setFriction(FRICTION).setRestitution(RESTIT);
    if (ox !== undefined) cd.setTranslation(ox, oy, oz);
    world.createCollider(cd, body);
  };
  switch (typeName){
    case 'cube':   add(RAPIER.ColliderDesc.cuboid(0.75*s, 0.75*s, 0.75*s)); break;
    case 'ball':   add(RAPIER.ColliderDesc.ball(0.95*s)); break;
    case 'cyl':    add(RAPIER.ColliderDesc.cylinder(0.8*s, 0.7*s)); break;
    case 'pill':   add(RAPIER.ColliderDesc.capsule(0.35*s, 0.5*s)); break;
    case 'torus': { // a ring in XY (like TorusGeometry), 12 capsules round it
      const pts = [];
      for (let k=0;k<=12;k++){ const a = k/12*Math.PI*2;
        pts.push({ x: Math.cos(a)*0.68*s, y: Math.sin(a)*0.68*s, z: 0 }); }
      addCapsuleChain(add, pts, 0.32*s);
      break;
    }
    case 'knot': { // three's TorusKnot(p=2,q=3) parametrics, 18 segments
      const R = 0.58*s, pts = [];
      for (let k=0;k<=18;k++){
        const u = k/18 * Math.PI*4; // p=2 -> period 4π
        const cs = Math.cos(1.5*u);
        pts.push({
          x: R*(2+cs)*0.5*Math.cos(u),
          y: R*(2+cs)*0.5*Math.sin(u),
          z: R*Math.sin(1.5*u)*0.5,
        });
      }
      addCapsuleChain(add, pts, 0.2*s);
      break;
    }
    case 'spiral': { // a helix as in spiralGeo, 12 segments
      const pts = [];
      for (let k=0;k<=12;k++){
        const t = k/12, th = t*Math.PI*2*2.2;
        pts.push({ x: Math.cos(th)*0.46*s, y: (t-0.5)*1.5*s, z: Math.sin(th)*0.46*s });
      }
      addCapsuleChain(add, pts, 0.19*s);
      break;
    }
    case 'teapot':
    case 'surprise':
      add(RAPIER.ColliderDesc.ball(0.58*s), 0, 0, 0);
      add(RAPIER.ColliderDesc.ball(0.24*s), 0.62*s, 0.15*s, 0);
      add(RAPIER.ColliderDesc.ball(0.28*s), -0.7*s, 0.05*s, 0);
      break;
    default: { // cone, octa, dode, tetra, star, heart — convex hull from real geometry
      // ⚠️ RING MODELS COME BEFORE hull: their hole is real, and hull closes it
      // ⚠️⚠️ BALL MODELS COME BEFORE hull, for the same reason the ring does: the hull is not
      // WRONG here, it is EXPENSIVE and pointless. The five balls of the 2026-08-28 batch carry
      // 942..4437 vertices each; hullFromGeometry would build a polyhedron out of them per item
      // per level, when the exact shape is one number. item.r is the enclosing radius
      // (t.rc * size * MESH_SCALE) and the models are normalised to rc = 1.0, so for a sphere the
      // enclosing sphere IS the sphere — this is exact, not an approximation.
      if (item.type && item.type.phys === 'ball'){ add(RAPIER.ColliderDesc.ball(item.r)); break; }
      if (item.type && item.type.phys === 'ring' && ringFromGeometry(add, geo, s)) break;
      const cd = hullFromGeometry(geo, s);
      if (cd) add(cd);
      else add(RAPIER.ColliderDesc.ball(item.r)); // insurance for a degenerate hull
    }
  }
  item.body = body;
  buildAccessSamples(item, typeName, geo);
}

function destroyItemBody(item){
  if (item.body){
    world.removeRigidBody(item.body);
    item.body = null;
  }
}

// Synchronization: the position AND ROTATION of the meshes now come from the
// bodies (the rotation is honest)
function syncMeshes(){
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const t = it.body.translation();
    it.p.set(t.x, t.y, t.z);
    it.mesh.position.set(t.x, t.y, t.z);
    const r = it.body.rotation();
    it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

// Stepper with a fixed-step accumulator (up to SUBSTEP_CAP substeps per frame)
let physAcc = 0, rescueMs = 0, stepMsLast = 0; // stepMsLast — perf meter (soak.js)
const MAX_FALL = 16; // terminal velocity of a fall: CCD is unreliable on the
                     // small spheres of compounds at v>20 (rapier.js issue #302)
// in the intro the column falls from 30+ units and at 16-18 it punched through
// the walls (3-4 rescues per intro) — during the top-up the terminal velocity
// is lower (energy ∝ v²)
let fallCap = MAX_FALL;
function setFallCap(v){ fallCap = v || MAX_FALL; }
function currentFallCap(){ return fallCap; }   // the suite's reader (2026-09-05, the flight cap)
// STEP BREAKDOWN (mobile-tier profiling 2026-07-31): four different jobs sit
// inside a single stepMsLast, and on a weak CPU they are not in equal shares.
// substeps matters especially: on a SLOW frame the fixed-step accumulator runs
// world.step several times — that is, the cost grows exactly where the frame is
// already not keeping up. The numbers are served by __game.physBreak().
let stepSolveMs = 0, stepSyncMs = 0, stepCapMs = 0, stepRescueMs = 0, stepSubsteps = 0;
// ⚠️⚠️ THE CAP ON SUBSTEPS PER FRAME = 2 (A3, mobile-tier perf 2026-08-01, the
// dispatcher's decision on the measurements). It was 3.
// WHY: the fixed-step accumulator is an AMPLIFIER, not merely a cost.
// A slow frame -> a bigger dt -> more world.step calls -> an even slower frame.
// On the pour-down the p95 of substeps hit exactly the cap.
// WHAT IT GIVES (pour-down, CPU ×4, 6 seeds, re-measured on a baseline WITH THE
// WALLS ALREADY FIXED and A1): solver p95 36.7 -> 22.5, i.e. −39%; frame p95
// 41.4 -> 27.9.
// WHAT IT COSTS: the middle of the flight lags a little, by 2.6 s it converges
// (top of the pile 8.65 -> 10.79 at the 2000 ms mark, but 7.70 -> 7.96 at
// 2600 ms). The DURATION of the pour-down by the wall clock did NOT grow (to
// sleep 5538 -> 5391 ms, −3% = noise): the accumulator's clamp throws time away,
// but the frames run more often as a result.
// ⚠️ THE FILL RESULT WAS VERIFIED SEPARATELY (8 seeds): the intro ends by the
// CAMERA's clock, not by "the pile has settled", so a different cap could have
// caught the settling at a different stage and the trim would have cut a
// different number of pairs. It did not: alive 182/182 in both, top 7.73 ->
// 7.72, wallExcess max 0.141 -> 0.098, falls through the floor 0, rescues 1.
// ⛔ WHY GLOBALLY AND NOT AS A TIER STEP — THE ARGUMENT IS STRUCTURAL:
// `tickPerfTier` SKIPS THE INTRO (`if (intro …) return`), that is, the step
// physically cannot fire before the end of the FIRST pour-down — exactly the
// moment the owner complained about. A tier step here is not an optimization
// but a hole.
// ⚠️ And "on a fast machine the cap will not bind" — CHECKED AND WRONG: without
// throttling the p95 of substeps is 3 as well, because in the intro dt is
// multiplied by INTRO_TIME_SCALE (it was 1.7, since 2026-08-11 — 1.3; the
// conclusion has not changed, the substep cap binds anyway)
// (16.7×1.7 = 28 ms). The pour-down changes THE SAME WAY on all devices, and
// that is a deliberate choice: a uniform feel is better than two different ones.
// ⛔ ≤1 WAS TRIED AND REJECTED: −78% of the solver, but by 2.6 s the pile is
// still in the air (top 16.2 against 7.7) — visible slow-motion cinema. This is
// a spec of feel, to be brought back only by the owner's word.
// ⚠️⚠️ A FALSE ALARM, WRITTEN DOWN SO THAT IT IS NOT REPEATED: the A3 soak gave
// 41 rescuer teleports against 6 in the control run — and that is NOT a
// regression but a DIFFERENT AMOUNT OF WORK. The A3 run went through THREE
// levels and 2 wins, while the control sat on the first one for all 12 minutes
// with zero wins; totals over different amounts of play were being compared.
// Normalization separated them: clean intros 0/0 (32 runs), level changes 0
// against 1 (48 changes), while the DISTRIBUTION of the excess past the wall
// (8710/8856 samples, lvl 10+40, settling + 3 shakes) matched — p99 0.078/0.076,
// max 0.173/0.180, above the norm of 0.20 ZERO for both; rescues at equal work
// 66 (≤3) against 42 (≤2). ⛔ RULE: the total of rare events per run is
// comparable ONLY at an equal amount of play — otherwise what gets measured is
// the bot's progress, not the physics.
// ⚠️⚠️ RAPIER'S PROFILER IS THE ONLY WAY TO BREAK `world.step()` INTO PHASES.
// From the outside the physics step is ONE column, and any conversation about
// "it is expensive in the solver" runs into it. Our build has the profiler
// (`world.profilerEnabled`) and it serves broad/narrow/islands/solver (4
// sub-phases) + CCD SEPARATELY (4 sub-phases).
// ⛔ BY THE KNOB ONLY, NEVER IN THE LIVE BUILD: about twenty WASM↔JS crossings
// per step.
// ⚠️ THE COUNTERS ARE RESET BY EVERY `step()`, while the stepper does up to
// SUBSTEP_CAP steps per frame — they MUST BE READ INSIDE THE LOOP, otherwise
// only the last substep is visible, and during the pour there are exactly two
// of them (that is, half the work would be lost).
const PROF_KEYS = ['step','collision_detection','broad_phase','narrow_phase',
  'island_construction','solver','velocity_assembly','velocity_resolution',
  'velocity_update','velocity_writeback','ccd','ccd_broad_phase',
  'ccd_narrow_phase','ccd_solver','ccd_toi_computation','user_changes'];
let profOn = false, profAcc = null, profWallMs = 0, profSteps = 0;
// WAVES OF BODIES DURING THE POUR (dispatcher's task #51 at the owner's order).
// ⚠️ WHY: genLevel creates ~180 bodies at once, and the whole column is
// simulated from the FIRST step, even though the upper layers are not touching
// anyone yet. A wave = the body is created but DISABLED (`setEnabled(false)` —
// it leaves the simulation entirely, it does not "sleep"), and is enabled when
// the turn reaches its layer. The number of simultaneously active falling
// bodies becomes smaller, and the picture is a "pouring in", not a "dump".
// ⚠️ THE CLOCK IS REAL, NOT IN-GAME: the owner's spec is stated in milliseconds
// ("a layer every 50-80 ms"), while in-game time in the intro is multiplied by
// INTRO_TIME_SCALE on top of that. On a stalled frame the game clock would
// stretch the pouring out.
// ⚠️ 80 IS THE TOP of the owner's spec corridor (50-80), chosen BY MEASUREMENT:
// the perf grows monotonically as the feed slows down (step p95 11.3 / 9.6 /
// 8.5 at 50 / 65 / 80), while the number of rescues does NOT depend on the pace
// at all (20 / 20 / 17) — which means we take the best perf inside the spec. We
// do not go past 80: that is already outside the owner's word.
// ⚠️⚠️ 20 MS — "SIMPLIFY THE POUR, DO NOT STRETCH IT OUT LIKE THAT" (the
// owner's word 2026-08-13, it CANCELS his own 50-80 corridor from the first
// spec). The measurement the decision is built on (lvl 20, CPU ×4, GPU metal,
// 2 passes):
//   arm         physics step in intro p95   FRAME in intro p95   to the calm
//   no waves          17.8 / 19.2               33.6 / 33.2      5.5 / 6.2 s
//   20 ms             16.6 / 15.9               34.4 / 35.1      5.5 / 5.5 s
//   35 ms             12.5 / 13.5               33.1 / 32.8      5.7 / 6.7 s
//   55 ms             12.1 / 12.9               33.2 / 34.6      5.7 / 5.6 s
// ⛔⛔ THE MAIN THING FROM THIS TABLE, AND IT MATTERS MORE THAN THE PACE ITSELF:
// THE FRAME DOES NOT CHANGE IN ANY ARM (33-35 ms everywhere), even though the
// physics step drops from 18 to 12. That means the frame's load during the pour
// is NOT held by PHYSICS, and the "saved" 6 ms of the solver are not visible to
// the player at all. Any future attempt at "speeding the pour up through
// physics" is obliged to begin from this line: first prove that the frame
// follows the step at all.
// ⚠️ Why the waves stay then instead of being switched off entirely: at 20 ms
// the pour is visually instantaneous (23 layers × 20 ms = 0.46 s), the time to
// the calm is EXACTLY as without the waves (5.5), yet the solver peak is still
// lower (16 against 18) — that is, it is free insurance for weak devices that
// does not change the feel.
// ⚠️ A switch for checking on a live phone: `?wave=0` turns the waves off,
// `?wave=N` sets the pace to N ms (the owner compares it himself, no build).
let WAVE_MS = 20;
let wavesOn = true;
try {
  const _w = new URLSearchParams(location.search).get('wave');
  if (_w != null){ const n = +_w; if (n > 0) WAVE_MS = n; else wavesOn = false; }
} catch (e) {}                    // live; the knob is only for A/B measurement
let waveNext = 0, waveAcc = 0, waveLast = 0;
function setWaves(v, ms){ wavesOn = !!v; if (ms != null) WAVE_MS = +ms; }
function getWaves(){ return wavesOn; }
// ⚠️ THE SURPRISE IS NOT WAVED: it is pinned to the floor by a fixed body until
// finishIntro (otherwise the vibro-shaking pushes it up — the Brazil nut
// effect). A wave would "enable" it and release the pinning at the wrong time.
function waveHold(it){
  if (!wavesOn || !it || !it.body || it.surprise) return;
  it.body.setEnabled(false);
}
function waveArm(){ waveNext = 0; waveAcc = 0; waveLast = 0; }
// ⚠️ Opens wave 0 synchronously at beginDrop (2026-08-30): without it the first waveTick is
// anchor-only and the accumulator still owes WAVE_MS — layer 0 started falling ~3 frames
// (~33-50 ms) after beginDrop, all rendered as stillness. Mirrors waveTick's release body for
// exactly one layer; waves 1+ keep their cadence (the anchor is set here, so the next tick
// accumulates real dt instead of anchoring again).
function waveKick(){
  if (!wavesOn || waveNext !== 0) return 0;
  waveLast = performance.now();
  let opened = 0;
  for (const it of items){
    if (!it.body || (it.wave | 0) !== 0) continue;
    if (!it.body.isEnabled()){ it.body.setEnabled(true); opened++; }
  }
  waveNext = 1;
  return opened;
}
function waveReleaseAll(){
  for (const it of items) if (it.body && !it.body.isEnabled()) it.body.setEnabled(true);
  waveNext = 1e9;
}
// ⚠️ THE CLOCK IS OUR OWN, INTERNAL: the intro tick receives the IN-GAME dt (it
// is multiplied by INTRO_TIME_SCALE on top of that), while the waves are
// obliged to run on real milliseconds.
function waveTick(){
  if (!wavesOn || waveNext >= 1e9) return 0;
  const now = performance.now();
  if (!waveLast){ waveLast = now; return 0; }   // the first tick is only an anchor
  // ⚠️ THE CLAMP: without it the whole column would spill out at once after a
  // stalled frame — exactly the "pouring in" the waves were made for would be
  // lost on the very weakest device, where it is needed most.
  const dtMs = Math.min(now - waveLast, WAVE_MS * 4);
  waveLast = now;
  waveAcc += dtMs;
  let opened = 0;
  while (waveAcc >= WAVE_MS){
    waveAcc -= WAVE_MS;
    let found = false;
    for (const it of items){
      if (!it.body || (it.wave | 0) !== waveNext) continue;
      found = true;
      if (!it.body.isEnabled()){ it.body.setEnabled(true); opened++; }
    }
    waveNext++;
    // the queue has run out — no more waves, from here the tick is free
    if (!found && waveNext > 64){ waveNext = 1e9; break; }
  }
  return opened;
}
function waveInfo(){
  let offCount = 0, total = 0;
  for (const it of items){ if (!it.body) continue; total++; if (!it.body.isEnabled()) offCount++; }
  return { waves: wavesOn, stepMs: WAVE_MS, next: waveNext, disabled: offCount, bodies: total };
}

const RESCUE_WALL_TOL = 0.18;          // LIVE. The knob below is measurement only.
let rescueWallTol = RESCUE_WALL_TOL;
function setRescueWallTol(v){ rescueWallTol = (v == null ? RESCUE_WALL_TOL : +v); }
function getRescueWallTol(){ return rescueWallTol; }
let ccdDefault = true;                 // live; turned ONLY by a measurement
// SELECTIVE CCD: switch the anti-tunnelling protection on for FAST bodies ONLY.
// ⚠️ THE GROUNDS ARE A MEASUREMENT, NOT AN IDEA: breaking `world.step()` down
// with Rapier's profiler showed that CCD costs 41% of the step during the pour,
// and ALL bodies pay for it — even an almost settled pile gives up 12.6%
// (measured on a settled pile after a shake). That is, the cost is NOT gated by
// the engine on speed, and it can be reclaimed.
// ⛔ THE LIVE VALUE IS OFF: switching it on changes BEHAVIOUR (anti-tunnel),
// and behaviour is the owner's word, not mine.
// ⛔⛔ TOMBSTONE 2026-08-14, AFTER THE MOVE TO RAPIER 0.20: THIS INSTRUMENT NO
// LONGER MEASURES WHAT IT PROMISES. In 0.20 the semantics of CCD are INVERTED:
// against FIXED colliders (our walls and floor!) it now works UNCONDITIONALLY,
// while `enableCcd(true)` means "bullet" (a sweep against kinematic and dynamic
// bodies too); the only full off-switch is `maxCcdSubsteps = 0`.
// The consequences the next person is obliged to know:
//   • switching `setCcdSel` on NO LONGER removes the CCD cost from slow bodies —
//     the knob turns, but the behaviour does not change;
//   • the recorded measurement "CCD off -> solver 15.8" (2026-08-11) DOES NOT
//     REPRODUCE on 0.20 and is dead as a support;
//   • `physKnobs({ccd:false})` in 0.20 is not a full off-switch either.
// ⚠️ By itself this is NOT a regression of the game: the live value is off, and
// against the walls CCD was needed before too. The danger is in the instrument
// itself — do not measure with it.
let ccdSelOn = false, CCD_V_ON = 8, CCD_V_OFF = 4;
let ccdSelFlips = 0;                   // how many times it was flipped (knob cost)
function setCcdSel(on, vOn, vOff){
  ccdSelOn = !!on;
  if (vOn != null) CCD_V_ON = +vOn;
  if (vOff != null) CCD_V_OFF = +vOff;
  ccdSelFlips = 0;
  // on switching off we hand the default back to everyone — otherwise some
  // bodies would be left without protection and the next measurement would be
  // measuring a mix of two configurations
  if (!ccdSelOn) for (const it of items) if (it.alive && it.body){
    it._ccd = ccdDefault; it.body.enableCcd(ccdDefault);
  }
  return { ccdSel: ccdSelOn, vOn: CCD_V_ON, vOff: CCD_V_OFF };
}
// ⚠️ HYSTERESIS IS MANDATORY: without it a body sitting at the threshold would
// jerk the flag every step, and the enableCcd call itself wakes the neighbours
// and costs more than the check does.
function tickCcdSel(){
  if (!ccdSelOn) return;
  const on2 = CCD_V_ON * CCD_V_ON, off2 = CCD_V_OFF * CCD_V_OFF;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel();
    const s2 = v.x*v.x + v.y*v.y + v.z*v.z;
    const was = it._ccd === undefined ? ccdDefault : !!it._ccd;
    const want = was ? (s2 > off2) : (s2 > on2);
    if (want !== was){ it._ccd = want; it.body.enableCcd(want); ccdSelFlips++; }
  }
}
function ccdSelInfo(){
  let withCcd = 0, alive = 0;
  for (const it of items){ if (!it.alive || !it.body) continue; alive++;
    if (it._ccd === undefined ? ccdDefault : it._ccd) withCcd++; }
  return { mode: ccdSelOn, vOn: CCD_V_ON, vOff: CCD_V_OFF, alive, withCcd,
    share: alive ? +(withCcd / alive).toFixed(3) : 0, flips: ccdSelFlips };
}
function setCcdDefault(v){ ccdDefault = !!v; }
function getCcdDefault(){ return ccdDefault; }
function profReset(){ profAcc = {}; for (const k of PROF_KEYS) profAcc[k] = 0;
  profWallMs = 0; profSteps = 0; }
function profEnable(on){
  profOn = !!on; profReset();
  try { world.profilerEnabled = profOn; } catch(e){ return { ok:false, why:String(e) }; }
  let has = false;
  try { has = typeof world.physicsPipeline.raw.timing_step === 'function'; } catch(e){}
  return { ok: has, profiler: profOn };
}
function profActive(){ return profOn; }
function profTake(){
  const o = { steps: profSteps, jsClock: +profWallMs.toFixed(2) };
  if (!profSteps) return o;
  for (const k of PROF_KEYS) o[k] = +profAcc[k].toFixed(4);
  // ⚠️⚠️ THE REMAINDER IS MANDATORY (the rule about named phases): without it a
  // new expensive line would silently be attributed to someone already in the
  // table — that is exactly how `blastWave` was a suspect for half a year.
  o.remainder = +(o.step - (o.collision_detection + o.island_construction
    + o.solver + o.ccd + o.user_changes)).toFixed(4);
  // ⚠️ THE SECOND SEAM: `timing_step` itself against OUR clock around
  // `world.step()`. It also calibrates the UNITS: we do not know the units of
  // Rapier's counters in advance and do NOT take them for milliseconds — we
  // check them against the clock.
  o.clockSeam = +(profWallMs - o.step).toFixed(2);
  return o;
}

// A CENSUS OF THE SHAPES IN THE LIVE PILE — what the narrow phase is really
// busy with.
// ⚠️ It is needed because "the compounds are what costs" is a HYPOTHESIS about
// the composition of the pool, and the composition kept changing: the
// procedural primitives (torus/knot/spiral) were removed from the pool on
// 2026-07-21, and the doughnut's ring only opens from lvl 110. The census
// answers the question BY MEASUREMENT, not by retelling the canon.
function shapeCensus(){
  const T = ['Ball','Cuboid','Capsule','Segment','Polyline','Triangle','TriMesh',
    'HeightField','?8','ConvexPolyhedron','Cylinder','Cone','RoundCuboid',
    'RoundTriangle','RoundCylinder','RoundCone','RoundConvexPolyhedron',
    'HalfSpace','Voxels'];
  const byShape = {}, byPack = {}, compounds = [];
  let bodies = 0, colliders = 0, vertsTotal = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    bodies++;
    const n = it.body.numColliders();
    colliders += n;
    const kinds = {};
    for (let i = 0; i < n; i++){
      const c = it.body.collider(i);
      let t = -1; try { t = c.shapeType(); } catch(e){}
      const name = T[t] || ('type' + t);
      kinds[name] = (kinds[name] || 0) + 1;
      byShape[name] = (byShape[name] || 0) + 1;
      if (name === 'ConvexPolyhedron'){
        try { const v = c.vertices(); if (v) vertsTotal += v.length / 3; } catch(e){}
      }
    }
    const pack = (it.type && it.type.tex) || ((it.surprise ? 'surprise'
      : (it.bomb ? 'bomb' : 'other')));
    byPack[pack] = (byPack[pack] || 0) + 1;
    // a compound = more than one collider on a body (capsule chains, the ring)
    if (n > 1) compounds.push({ name: (it.type && it.type.name) || pack, colliders: n, kinds });
  }
  return { bodies, colliders, perBody: bodies ? +(colliders / bodies).toFixed(2) : 0,
    byShape, byPack, compoundBodies: compounds.length,
    compounds: compounds.slice(0, 12),
    hullVerts: vertsTotal, vertsPerHull: byShape.ConvexPolyhedron
      ? +(vertsTotal / byShape.ConvexPolyhedron).toFixed(1) : 0 };
}

let SUBSTEP_CAP = 2;
function setMaxSubsteps(n){ SUBSTEP_CAP = Math.max(1, n | 0); }
function maxSubsteps(){ return SUBSTEP_CAP; }
function stepPhysics(dt){
  const _t0 = performance.now();
  tickCcdSel();                       // measurement knob; in live mode it exits at once
  physAcc = Math.min(physAcc + dt, SUBSTEP_CAP/60);
  let n = 0;
  while (physAcc >= 1/60){
    if (profOn){
      const w0 = performance.now();
      world.step();
      profWallMs += performance.now() - w0;
      const raw = world.physicsPipeline.raw;
      for (const k of PROF_KEYS) profAcc[k] += raw['timing_' + k]();
      profSteps++;
    } else world.step();
    physAcc -= 1/60;
    n++;
  }
  stepSubsteps = n;
  const _t1 = performance.now(); stepSolveMs = _t1 - _t0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel();
    if (v.y < -fallCap) it.body.setLinvel({ x: v.x, y: -fallCap, z: v.z }, false);
  }
  const _t2 = performance.now(); stepCapMs = _t2 - _t1;
  syncMeshes();
  const _t3 = performance.now(); stepSyncMs = _t3 - _t2;
  // insurance (once per 0.5 s): an item outside the bowl is returned inside
  const now = performance.now();
  if (now - rescueMs > 500){
    rescueMs = now;
    rescueSweep();
  }
  stepRescueMs = performance.now() - _t3;
  stepMsLast = performance.now() - _t0;
}
// Returning the "escapees": the edge of an item deeper than 0.18 into the glass
// (pressed into the wall / outside) or below the floor — a teleport inside. IT
// IS MANDATORY to call this before sleep: the global sleep used to freeze
// bodies that had not been fully pushed out of the walls.
// The HORIZONTAL PROTRUSION of an item TOWARDS THE WALL, with the CURRENT
// ROTATION taken into account.
// ⚠️ The former wallR was ONE number per type, i.e. the item was treated as a
// ball. For flat models that lies by a factor of two: the pizza's reach is 1.0
// at any tilt, although on its edge it takes up a fraction of that
// horizontally. Hence the storm of false rescues (8 per intro against a norm of
// 0) — and a rescue is a TELEPORT, the player sees a jerk.
// Here an oriented box is taken: the projection of its half-extents onto the
// radial direction. For a ball the result is the same, for a flat one — honest.
const _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();
// ⚠️⚠️ THE EXACT RADIAL REACH — a reference function over the vertices, WITHOUT
// upper estimates. It was made for DIAGNOSTICS, and here is why: `radialReach`
// takes min(sphere, box), both of which are honest upper bounds, but on curved
// and elongated models the slack reaches a value LARGER than the alarm
// threshold itself. Measurement (24 poses, the +X axis, slack = estimate −
// truth): banana median 0.087 / maximum 0.360, palm 0.109 / 0.328, pig
// 0.062 / 0.193, watermelon 0.051 / 0.071, slab 0.001 / 0.035.
// At a threshold of 0.20 this means: an alarm of 0.22-0.29 on the banana MAY BE
// ENTIRELY the metric's slack, and it cannot tell "pressed into the wall" from
// "that is just its shape".
// ⛔ THE RESCUER IS DELIBERATELY LEFT ON THE UPPER ESTIMATE: conservatism is
// useful there (better to return one that did not escape than to miss one that
// did), and the cost matters more — it walks the whole pile twice a second,
// while iterating vertices is ~90 thousand rotations per sweep. The diagnostics
// are called once per 5 seconds, they can afford to be exact.
const _rrV = new THREE.Vector3();
function radialReachExact(it, ux, uz){
  const g = it.geo, P = g && g.attributes && g.attributes.position && g.attributes.position.array;
  if (!P || !it.body) return radialReach(it, ux, uz);
  const r = it.body.rotation();
  _rq.set(r.x, r.y, r.z, r.w);
  let best = 0;
  for (let i = 0; i < P.length; i += 3){
    _rrV.set(P[i], P[i+1], P[i+2]).applyQuaternion(_rq);
    const pr = (_rrV.x * ux + _rrV.z * uz) * it.scl;
    if (pr > best) best = pr;
  }
  return best;
}
function radialReach(it, ux, uz){
  const h = it.half;
  if (!h || !it.body) return it.wallR || it.r;
  const r = it.body.rotation();
  _rq.set(r.x, r.y, r.z, r.w);
  _rm.makeRotationFromQuaternion(_rq);
  const m = _rm.elements; // the columns are the item's axes in world space
  const obb = it.scl * (h.x * Math.abs(ux * m[0] + uz * m[2])
                      + h.y * Math.abs(ux * m[4] + uz * m[6])
                      + h.z * Math.abs(ux * m[8] + uz * m[10]));
  // ⚠️ THE MINIMUM of the box and the BOUNDING SPHERE. The box is tight for the
  // flat ones, but for the ROUND ones it is WORSE than the sphere: along the
  // diagonal it gives up to 1.73 radii, and the watermelon started being falsely
  // rescued where it used to pass. Both estimates are honest upper bounds, so
  // their minimum is honest too and is always no worse than either of them.
  return Math.min(it.r, obb);
}
// THE DOWNWARD VERTICAL PROTRUSION with the CURRENT ROTATION taken into
// account — the same oriented box as in radialReach, only projected onto the
// world vertical. It is exactly this that is needed and not the bounding
// sphere: a flat model's reach is close to half a metre, while lying flat it
// takes up mere hundredths downwards. ⚠️ min(r, obb) — for the same reason as
// in radialReach.
// ⚠️ THIS IS AN UPPER BOUND, not an exact extent: for a convex hull the box is
// generous (measurement: for a pile lying on the floor the "lowest point" goes
// under the floor by up to 0.39 by pure arithmetic, without any penetration at
// all). Therefore THE RESCUER'S THRESHOLD MUST NOT BE BUILT ON IT (it stands on
// the true penetration, see rescueSweep) — here it is only for diagnostics
// (itemsBrief.low).
function downReach(it){
  const h = it.half;
  if (!h || !it.body) return it.r;
  const r = it.body.rotation();
  _rq.set(r.x, r.y, r.z, r.w);
  _rm.makeRotationFromQuaternion(_rq);
  const m = _rm.elements; // columns are the item's axes in world; vertical: m[1], m[5], m[9]
  const obb = it.scl * (h.x * Math.abs(m[1]) + h.y * Math.abs(m[5]) + h.z * Math.abs(m[9]));
  return Math.min(it.r, obb);
}
function lowestPoint(it){ return it.p.y - downReach(it); }
// The TRUE penetration into the floor plate, taken from Rapier's contact
// manifold (contactDist < 0 = an overlap) — ground truth for measurements, as
// opposed to the sphere/box estimates. null = there is no floor contact at all.
function floorPenetration(it){
  if (!floorCol || !it.body || !world.contactPair) return null;
  let deepest = null;
  try {
    for (let c = 0; c < it.body.numColliders(); c++){
      world.contactPair(it.body.collider(c), floorCol, m => {
        for (let k = 0; k < m.numContacts(); k++){
          const d = m.contactDist(k);
          if (deepest === null || d < deepest) deepest = d;
        }
      });
    }
  } catch (e){ return null; }
  return deepest;
}
// beforeSleep — the call FROM sleepPhysics, right before the world is frozen.
// The calm gate is then lifted: "the item is still moving, it will get out by
// itself" is only true while physics keeps stepping, and here it is about to
// stop altogether in an instant.
// The sinking threshold FOR A SPECIFIC ITEM. It is pulled out into its own
// function not for beauty: the guard is obliged to read THE SAME quantity the
// rescuer uses — otherwise it checks its own copy of the formula and will drift
// apart from the live code at the first edit.
function floorPenLimit(it){
  return Math.min(FLOOR_PEN_MAX, FLOOR_PEN_FRAC * downReach(it));
}
function rescueSweep(beforeSleep){
  // ⚠️⚠️ ON A BOWL SHATTER THE RESCUER STAYS SILENT. It judges an item to have
  // "escaped" by `radiusAt(y)` — the radius of a bowl that AT THAT MOMENT NO
  // LONGER EXISTS — and would return the scattering items inside, zeroing their
  // velocities. Concretely: the window from the shatter to the collect wave is
  // 900 ms and the sweep runs once per 500 — a hit is GUARANTEED, while
  // `blastWave(centre, R=9)` in shatterBowl deliberately throws the pile
  // outwards. The player would see the items jump back and freeze IN THE SHAPE
  // OF THE BOWL — exactly the silhouette the floor was made ghostly to remove;
  // plus the collect wave would have nobody left to catch up with in flight.
  // ⚠️ THE GATE IS INSIDE THE FUNCTION, NOT AT THE CALLERS: there are already
  // two of them (the physics step once per 0.5 s and the pre-sleep one from
  // 99-main), and a third will appear silently.
  if (bowlOpen) return 0;
  let rescued = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    // ⚠️⚠️ A BODY WAITING FOR ITS WAVE HAS NOTHING TO BE RESCUED FROM (the
    // dispatcher, acceptance of the waves #51, 2026-08-13). It is DISABLED from
    // the simulation and stands where genLevel put it — by construction it
    // cannot "drift away" on its own.
    // THE MEASUREMENT THAT FOUND THIS: all the surplus intro rescues under the
    // waves fell at the heights 22.9 and 26.07 (lvl 11 and 20) — plainly above
    // the rim of 9.2 and above the top of the enabled column; without the waves
    // there are EXACTLY ZERO of them. The reason: the spawn is scattered over
    // the full width of the rim, above the rim `radiusAt` returns R1, and a body
    // standing at the edge satisfies the escape condition as soon as the
    // temporary wall is removed (without the waves everybody managed to fall
    // earlier — which is why there was no defect).
    // ⛔ THE PRICE WAS NOT COSMETIC: a teleport clamps the height to `FUNNEL.H`,
    // that is, a waiting body was dropped into the bowl OUT OF TURN — exactly
    // the "pouring in" the waves were made for was broken for those bodies.
    // ⚠️ This is precisely the "LIVE condition at the moment of firing" that the
    // rejected gate on the temporary wall lacked (tombstone below): the body's
    // state is read NOW, it is not inferred from the phase of the intro.
    if (!it.body.isEnabled()) continue;
    const d = Math.hypot(it.p.x, it.p.z);
    // while the temporary spawn wall stands, the legal radius is R1 at any
    // height (items falling near the edge were teleported RIGHT IN FLIGHT in
    // front of the player); the horizontal extent is wallR: for FLAT models the
    // bounding r badly overestimates the width and produced a storm of false
    // rescues (the rake was found on the steak — the type was removed in v187,
    // but the rule about the CLASS of flat ones is alive: wr in TYPES is
    // mandatory for any model with one axis much smaller than the others)
    const nx = d > 1e-3 ? it.p.x / d : 1, nz = d > 1e-3 ? it.p.z / d : 0;
    const legalR = tmpWallBody ? Math.max(wallDistAt(it.p.y, nx, nz), FUNNEL.R1)
                               : wallDistAt(it.p.y, nx, nz);
    const reach = d > 1e-3 ? radialReach(it, nx, nz) : (it.wallR || it.r);
    // ⚠️ THE TOLERANCE IS EXPOSED AS A KNOB FOR THE SAKE OF MEASUREMENT (the
    // live value 0.18 has not changed): the `wallExcess` norm in the soak was
    // missing a DEFECTIVE SUPPORT, and one cannot wait for it — a real jam may
    // never happen at all if the mechanics are healthy. Loosening THIS tolerance
    // gives a graduated defect without touching the supporting geometry: the
    // walls and `radiusAt` are the same, it is just that a genuine protrusion
    // survives until the sample. ⛔ The FLOOR and CEILING branches deliberately
    // do not obey the knob — otherwise the defect would move the alarm for floor
    // lifts along with it, and there would be nothing to attribute the
    // observation to (a sabotage test strikes at a PROPERTY, not at its
    // neighbour).
    // ⛔ TRIED AND REJECTED BY MEASUREMENT (2026-08-13, task #51): a gate "do
    // not touch items above the rim while the temporary wall stands" — against
    // the growth of rescues caused by the waves. IT DID NOT HELP: 20 against 18,
    // above the rim the same 18. The reason lies in a mistaken assumption, not
    // in the idea: the temporary wall is removed at the drop -> orbit
    // transition, while the rescues happen LATER, when it is already gone — so
    // the gate is almost never true. The idea can be brought back, but the
    // condition MUST be something live at the moment of firing, not the wall.
    // Do not reinvent it in its former shape.
    const bottom = FLOOR_REST;
    const out = (d + reach) > legalR + rescueWallTol
      || it.p.y < bottom - 0.8 || it.p.y > RESCUE_CEIL;
    if (out){
      rescued++;
      console.warn('[rescue]', it.type.name, 'd=' + d.toFixed(2), 'y=' + it.p.y.toFixed(2), 'r=' + it.r.toFixed(2));
      // LOCALLY inwards at the same height: a teleport to the top of the bowl
      // was visible to the player as a "jump" and dragged the settling out (the
      // item fell all over again)
      const zoneTop = FUNNEL.H;
      const ry = Math.min(Math.max(it.p.y, bottom + 0.6), zoneTop);
      const fit = Math.max(0, radiusAt(ry) - it.r - 0.25);
      const len = Math.hypot(it.p.x, it.p.z) || 1;
      it.body.setTranslation({ x: it.p.x/len*fit, y: ry, z: it.p.z/len*fit }, true);
      it.body.setLinvel({ x:0, y:0, z:0 }, true);
      it.body.setAngvel({ x:0, y:0, z:0 }, true);
      wakePhysics('rescue'); // let it finish settling
      continue;
    }
    // THE FLOOR (the owner's complaint 2026-07-30 "a hole in the objects"): an
    // item pressed INTO the floor PLATE stayed there forever — the global sleep
    // switches the integrator off, and a sunken item hung under the pile until
    // the end of the level.
    // ⚠️⚠️ THE CALM GATE — WITHOUT IT THIS IS A STORM, NOT A PROTECTION. On a
    // FLYING pile (a shake, an explosion) a sinking of 0.05..0.28 is the NORM:
    // the distribution measurement gave p95 0.13 at a maximum of 0.28, and it
    // resolves itself within fractions of a second. It becomes eternal, that is
    // visible to the player, exactly when the pile freezes at that moment. That
    // is why we lift only the ALMOST MOTIONLESS ones, while the pre-sleep call
    // of rescueSweep from sleepPhysics catches precisely the moment when the
    // sinking is about to become eternal.
    // ⚠️⚠️ AND THAT IS EXACTLY WHY THE GATE IS LIFTED BEFORE SLEEP. The forced
    // sleep fires at maxV<2.0, i.e. while the pile is still creeping: with the
    // gate a sunken item slipped past the check, and an instant later
    // sleepAllBodies zeroed the velocities and froze it for good. By measurement
    // this cost one "fall-through" per 28 cycles AFTER the rescuer was
    // introduced — the hole was found only by stress, not by reasoning.
    const pen = floorPenetration(it);
    // the threshold by the item's OWN thickness (see FLOOR_PEN_FRAC): for the
    // slab the absolute 0.12 is unreachable, and it would sit in the plate for
    // ever
    // ⚠️⚠️ THE THICKNESS IS TAKEN ALONG THE VERTICAL IN THE CURRENT POSE
    // (`downReach` — the projection of the oriented box onto the world
    // vertical), and NOT as the minimal half-extent. The first version took the
    // minimum across the axes — and that gave a STORM: 115 lifts per 12 minutes
    // against 24 for the baseline. The minimum understates the threshold for ANY
    // item with one thin axis, even when it lies on a thick side and is sunk by
    // tenths of its own height. What matters physically is how deep the item is
    // sunk RELATIVE TO WHAT it stands on the plate with: the slab lying flat
    // -> 0.121, the same slab on its edge -> 0.977.
    const penLim = floorPenLimit(it);
    const deep = pen !== null && pen < -penLim;
    // ⚠️⚠️ THE SECOND HOLE, FOUND BY THE SOAK: "sleep" is not the only way to
    // get stuck for a long time. DURING MILLING the pile does not fall asleep at
    // all (wakeAtMs is pushed forward every frame), while the lower layers
    // VIBRATE constantly under the mixer's impulses — an item is never "calm",
    // the gate cut it off, and a flat model sat in the plate for 30 s in front
    // of the player (pen reached 0.248). Hence there is a second key as well: a
    // sinking that HOLDS for FLOOR_SUNK_TICKS checks in a row (~1.5 s) is lifted
    // regardless of the speed. A transient from a shake does not live that long.
    // ⚠️ THE COUNTER DECREASES, IT IS NOT ZEROED: under the milling vibration
    // the sinking TREMBLES around the threshold, and a single tick of "a touch
    // above 0.12" would reset the clock all over again — the item would sit in
    // the floor endlessly, never once collecting three in a row. Decreasing
    // demands a REAL exit, not a flicker.
    it.sunkN = Math.max(0, (it.sunkN || 0) + (deep ? 1 : -1));
    const lv = it.body.linvel();
    const calm = lv.x*lv.x + lv.y*lv.y + lv.z*lv.z < FLOOR_CALM_V*FLOOR_CALM_V;
    if (!beforeSleep && !calm && it.sunkN < FLOOR_SUNK_TICKS) continue;
    // TWO INDEPENDENT SIGNS of "in the plate", and the second is not for beauty:
    // (1) the depth from the manifold — ground truth, the threshold rests on it;
    // (2) the CENTRE below the top of the plate — for a convex item lying on the
    //     floor the centre is ALWAYS higher by its own half-extent, so this is
    //     already a fall-through.
    // ⚠️ (1) ALONE IS NOT ENOUGH: the narrow phase is updated only inside
    // world.step(), and right after a teleport (place, the wall rescuer) the
    // manifold is still from the old position. On pen alone the suite's
    // deterministic guard went silently green — caught by that same guard.
    // ⚠️ AND DO NOT BUILD the threshold on the "lowest point" from the box: for
    // a healthy pile lying down it goes under the floor by up to 0.39 without
    // any penetration at all (the same rake wallR used to have).
    if (!deep && it.p.y >= FLOOR_REST) continue;
    rescued++;
    console.warn('[floor]', it.type.name, 'y=' + it.p.y.toFixed(2),
      'pen=' + (pen === null ? 'none' : pen.toFixed(3)));
    // A LIFT BY EXACTLY THE DEPTH OF THE IMMERSION — along XZ the item is
    // already in its place, all it needs is to get out of the plate. A full
    // teleport like the wall one would be seen as a jerk where millimetres are
    // enough. The second addend is a guarantee of progress when there is no
    // manifold yet: otherwise the lift would be zero and the rescuer would keep
    // calling itself on every sweep.
    const lift = Math.max(pen !== null && pen < 0 ? -pen : 0, FLOOR_REST + 0.02 - it.p.y);
    it.body.setTranslation({ x: it.p.x, y: it.p.y + lift, z: it.p.z }, true);
    // we damp ONLY the downward fall: the horizontal and the rotation are left
    // alone, otherwise the lift would read as the item being frozen
    if (lv.y < 0) it.body.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    wakePhysics('floor'); // let the neighbour above settle into the freed space
  }
  return rescued;
}

// The pop wave (item 5, the owner's spec 2026-07-21): a light radial flinch of
// the neighbours on a burst of a group >= BURST_MIN_N. Cosmetics, not
// loosening: the velocity delta is small and decays quadratically towards the
// edge of the radius; light packs (shakeK) flinch harder — consistent with the
// weight used for a shake.
// jolt (optional, the owner's spec 2026-07-27-b "a bomb explosion is like the
// shake effect"): a SECOND layer of the wave — a light push for the WHOLE pile,
// including those outside the radius R. The near ones get a radial PUNCH (the
// character of an explosion), the far ones a flinch in the spirit of a shake (a
// toss up + a random spread), which makes it feel as if "the whole mixer was
// shaken", not just the epicentre. ⚠️ jolt is deliberately far smaller than a
// real shake (which has ~9 along XZ and 5.4-11.4 of toss): the goal is the
// FEELING of a shake, not its mechanics; otherwise the bomb would become a free
// shake and would break the economy of budget 5 (see the measurement in the
// hand-off).
function blastWave(pos, R, vmax, jolt){
  for (const it of items){
    if (!it.alive || !it.body || it.animating) continue;
    const dx = it.p.x - pos.x, dz = it.p.z - pos.z;
    const d = Math.hypot(dx, it.p.y - pos.y, dz);
    if (d < 1e-3) continue;
    const wk = it.shakeK || 1;
    let ix = 0, iy = 0, iz = 0;
    if (d <= R){ // PUNCH: sharp radial, quadratic decay towards the zone's edge
      const f = vmax * (1 - d/R) * (1 - d/R) * wk;
      const inv = 1 / Math.max(Math.hypot(dx, dz), 0.3);
      ix += dx*inv*f; iy += f*0.3; iz += dz*inv*f;
    }
    if (jolt){ // JOLT: the whole pile flinches; soft falloff (not zero far out)
      // ⚠️ the falloff is measured from the HEIGHT OF THE BOWL, not from the
      // damage zone R: "the whole mixer flinches" is a property of the bowl.
      // With an R binding, returning BOMB_RADIUS to its former 2.2 would have
      // silently made the effect local at the very same force constant
      // (review 2026-07-27).
      const j = jolt * wk / (1 + d/FUNNEL.H);
      // ⚠️ the horizontal is DELIBERATELY four times weaker than the vertical
      // (measurement 2026-07-27): with a symmetric spread of ±0.5j the jolt
      // pressed items into the walls and DOUBLED the rescuer's work (4 teleports
      // against 2 on the baseline). A toss upwards gives the same feeling of a
      // shake and does not push them into the walls.
      ix += (Math.random()-0.5)*0.5*j;
      iy += (0.6 + Math.random()*0.5)*j; // the toss dominates — it reads as a shake
      iz += (Math.random()-0.5)*0.5*j;
    }
    if (ix || iy || iz) impulseBody(it, ix, iy, iz);
  }
  wakePhysics('burst');
}

// The maximum speed among the live bodies — for the global calm
function maxBodySpeed(){
  let m = 0;
  for (const it of items){
    if (!it.alive || !it.body) continue;
    const v = it.body.linvel(), w = it.body.angvel();
    const s = v.x*v.x + v.y*v.y + v.z*v.z + 0.2*(w.x*w.x + w.y*w.y + w.z*w.z);
    if (s > m) m = s;
  }
  return Math.sqrt(m);
}
function sleepAllBodies(){
  for (const it of items){
    if (!it.alive || !it.body) continue;
    it.body.setLinvel({ x:0, y:0, z:0 }, false);
    it.body.setAngvel({ x:0, y:0, z:0 }, false);
    it.body.sleep();
  }
}
function wakeAllBodies(){
  for (const it of items){
    if (it.alive && it.body) it.body.wakeUp();
  }
}
function impulseBody(item, ix, iy, iz){
  if (!item.body) return;
  const m = item.body.mass();
  item.body.applyImpulse({ x: ix*m, y: iy*m, z: iz*m }, true);
}
function spinBody(item, wx, wy, wz){
  if (!item.body) return;
  item.body.setAngvel({ x: wx, y: wy, z: wz }, true);
}
