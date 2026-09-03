// ===== 40-items: item creation, surprise, level generation =====

const geoCache = new Map();
let items = [];
let stats, level;
// level number — survives a reload
let levelNum = 1;
// Cap on «hint for an ad» videos, tied to the level NUMBER (not to the level
// object): it survives a Restart of the same run, and is zeroed only on a NEW
// level. The details and why it is so — at the point of use in genLevel.
let adHintLevelNo = -1, adHintCarry = AD_HINTS_PER_LEVEL;
// ⛔⛔ LEVEL RESTORATION MOVED FROM HERE INTO 77-save (AFTER loadSave).
// Here it was BROKEN BY CONSTRUCTION: the concatenation sorts modules by name,
// 40 < 77, and «typeof Save» at the top level threw a ReferenceError (const has
// a TDZ — typeof is safe only for UNDECLARED names), an empty catch swallowed
// it, and the localStorage branch died along with it — it stood in the same try
// above the throwing line. Since 2026-08-07 a cold start LOST the saved level:
// every restart began from level 1. Found by an external review 2026-08-13,
// reproduced (mixer_level=11 -> alive 80). Do NOT move reading Save back into a
// module numbered lower than 77.

// size — a CONTINUOUS multiplier (the spread starts from level 20: ±10% at the
// start, up to ±30% with levels — the numbers were revised 2026-08-15, see
// 00-config). The geometry does not depend on the size (the scale sits on the
// mesh) — the cache is by type.
// The item material by type — EXTRACTED from makeItem (2026-07-24) so that the
// collection portraits (thumbItemForKey in 85-hud) build THE SAME material
// (matcap patch, veil, texTune) without duplication and drift from the live one.
// Depends only on t.
function itemMaterial(t){
  let mat;
  if (CFG.matcap){
    // «Baked light» (makeMatcap in 10-stage): the item colour and the grey veil
    // work as before — the shader MULTIPLIES the matcap by material.color.
    mat = new THREE.MeshMatcapMaterial({
      // t.tex — the model's «native» colouring from the shared palette atlas
      // (36-models). The material colour is then WHITE: the shader multiplies map
      // by color, and any tint here would spoil the colouring the author intended.
      // The grey inaccessibility veil keeps working — it lerps that same color
      // from white to grey, that is, it simply darkens the texture.
      // the graphite is lightened to 0xb8c0cc: the metal character is carried by
      // the matcap itself, while the dark 0x424a56 under the multiply gave black
      // cubes (see MATCAP_PRESETS)
      // t.paint (BRICKS, the owner's decision 2026-07-22 «paint the bricks»): the
      // Brick pack's atlas is WHITE (measurement by UV: #f9f9fc), telling 11 white
      // rectangles apart from above is impossible — so the palette gives them
      // their colour, as it does for the procedural ones. The shader multiplies
      // the white atlas by color, the tone comes out clean, and the debris matches
      // the brick itself — literally, since 2026-09-01-o: `fxColor` below calls THIS
      // expression for a painted type instead of reading the raw `t.color`, which is
      // what this line used to claim while the two silently differed.
      color: t.mat === 'chrome' ? 0xb8c0cc
           : t.paint ? candyColor(t.color, t.dl)
           : (t.tex || t.mat === 'model') ? 0xffffff
           : candyColor(t.color, t.dl),
      map: t.tex ? modelColormap(t.tex) : null,
      // for the textured ones — an almost white matcap, otherwise it crushes the
      // author's colours. The PAINTED ones do not need it: their colour is carried
      // by material.color and not by the atlas, so the ordinary 'soft' suits them —
      // with it the shape reads more three-dimensionally.
      // ⚠️ FOR THE TEXTURED ONES THE MATCAP IS TAKEN PER PACK (the owner's word
      // 2026-08-17-k), and the pack images themselves — the owner's word
      // 2026-08-18 «we take the pictures».
      // ⚠️⚠️ THREE TIERS, AND THE ORDER IS LOAD-BEARING, WHILE THE ENGINE IS ONE.
      // The EDITOR's override (the `packMatcaps` registry, 10-stage) beats the
      // PACK IMAGE (`packMatcapTex`, 08-matcap-packs), and that one beats the
      // shared almost white 'tex' preset. To a pack without an image
      // `packMatcapTex` honestly returns `null` (08:151) and NEVER throws —
      // neither on an unknown pack nor when `t.tex === undefined`; to a pack
      // without an editor override the registry returns what it was handed as the
      // second argument. That is, by default nothing changes at all, and each tier
      // switches on only where there is data for it.
      // ⛔ THIS WAS THE FORK POINT OF TWO PARALLEL IMPLEMENTATIONS (the
      // dispatcher's registry and the Graphics layer were made at the same time,
      // each without the other). They turned out NOT TO BE COMPETITORS: the
      // registry is a runtime substitution for the editor, the layer is content
      // with the owner's numbers. Spliced together here, in ONE line; there is no
      // second engine in the game.
      // ⚠️ `typeof packMatcapTex === 'function'` from the branch's edition was
      // REMOVED deliberately: it is a function declaration, it never lands in the
      // TDZ, and the check would only mask a real breakage of the module order.
      // ⛔ SINCE 2026-08-25-b THE SELECTION IS NOT WRITTEN OUT HERE — it lives in ONE function,
      // `itemMatcapAim` (10-stage), shared with both repoints. The three tiers described above
      // are unchanged; a FOURTH was added on top of them, the editor's PER-TYPE override, and a
      // second copy of this expression would have diverged from the repoints at the first edit.
      matcap: itemMatcapAim(t),
      vertexColors: t.mat === 'model',
    });
    // the brightness/contrast knobs are calibrated for the AUTHORS' atlases; the
    // painted ones have no use for them — there the colour is already ours
    if (t.tex && !t.paint) mat.userData.texTune = 1;
    addMatcapEmissive(mat);          // without this the Hint highlight breaks
    mat.onBeforeCompile = matcapSpecPatch;
    // ⚠️ The 'fade' mode is paid for ALWAYS and BY EVERYONE: three puts an item
    // into the transparent queue by the material.transparent flag and not by
    // opacity — the accessible ones (opacity 1) go there too and lose the early
    // Z. That is why the flag is set ONCE here: it must not be toggled per
    // frame, changing transparent means a shader recompile.
    // ⚠️ THE FLAG ONLY IN HARD: in Easy there is no veil at all (isAccessible
    // returns true for everyone), so the transparent queue and the loss of the
    // early Z in the default mode are of no use to anybody. Previously the flag
    // was always on and Easy paid for nothing.
    if (VEIL_MODE === 'fade' && CFG.hard) mat.transparent = true;
  } else if (t.mat === 'chrome'){
    // Cycle v4: white chrome on a white background blended in («the cubes are
    // barely distinguishable») — now a dark GRAPHITE metallic: it reads on white
    // and the highlights are stable
    mat = new THREE.MeshStandardMaterial({ color: 0x424a56, metalness: 1, roughness: 0.3 });
    mat.envMapIntensity = 0.9;
  } else if (t.mat === 'model'){
    // an imported model with its OWN vertex colours (the steak):
    // material.color is white — the inaccessibility veil works by lerping to grey
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0, roughness: 0.18 });
    mat.envMapIntensity = 0.5;
  } else {
    // Cycle v4: a soft gloss instead of a mirror (roughness 0 gave jumping
    // highlights when the camera turned) — the colour dominates, the highlight is
    // blurred and stable
    mat = new THREE.MeshStandardMaterial({
      color: (t.tex && !t.paint) ? 0xffffff : candyColor(t.color, t.dl), // paint — see the matcap branch
      map: t.tex ? modelColormap(t.tex) : null,
      metalness: 0, roughness: 0.18,
    });
    mat.envMapIntensity = 0.5;
  }
  return mat;
}
function makeItem(typeIdx, size){
  const t = TYPES[typeIdx], sz = { s: size || 1 };
  const gkey = String(typeIdx);
  if (!geoCache.has(gkey)) geoCache.set(gkey, t.geo());
  const mat = itemMaterial(t);
  const geo = geoCache.get(gkey);
  // half-sizes in LOCAL units — for an honest wall test by the oriented box
  // (radialReach in 50-physics). Computed ONCE per type: the geometry is shared
  // via geoCache, the scale is substituted separately.
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const half = { x: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)),
                 y: Math.max(Math.abs(bb.min.y), Math.abs(bb.max.y)),
                 z: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.scale.setScalar(sz.s * MESH_SCALE);
  const item = {
    key: 'T' + typeIdx, // match by TYPE: the size does not matter
    type: t, baseColor: mat.color.clone(),
    // debris colour: for models with a texture and vertex colours baseColor is
    // WHITE, and without this white dust would fly on breakup instead of coloured
    // ⛔⛔ A PAINTED TYPE TAKES `candyColor`, THE VERY EXPRESSION ITS MATERIAL TAKES (audit
    // 2026-09-01-o). Its atlas is white and the palette gives it its colour, so the mesh wears
    // `candyColor(t.color, t.dl)` — saturation forced to 0.75, lightness clamped near 0.55 —
    // while `t.color` is the RAW palette hex. Reading the raw one here made the debris and the
    // shards of a brick a different colour from the brick, and the comment above (line ~48) said
    // in as many words that they match. One expression now serves both, so they cannot drift.
    // ⚠️ `candyColor` RETURNS A LINEAR COLOUR ALREADY (it ends in `convertSRGBToLinear`) — a
    // second conversion here would wash it out. The other branch converts because `t.color` is a
    // bare sRGB hex.
    fxColor: t.paint ? candyColor(t.color, t.dl)
           : (t.tex || t.mat === 'model') ? new THREE.Color(t.color).convertSRGBToLinear() : null,
    r: t.rc * sz.s * MESH_SCALE, p: new THREE.Vector3(),
    wallR: (t.wr || t.rc) * sz.s * MESH_SCALE, // fallback extent (if half is absent)
    half, // half-sizes in local units — the wall test by OBB
    scl: sz.s * MESH_SCALE,
    geo: geoCache.get(gkey), // for the convex hull in physics
    body: null,
    mesh, alive: true, animating: false, accessible: false,
    veilK: 0, veilTarget: 0,
  };
  mesh.userData.item = item;
  mesh.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
  scene.add(mesh);
  return item;
}

// The surprise from the bottom («archaeology» from the concept): a golden FISH,
// it does not match, it glows through the gaps; a tap on the dug-out one gives the
// SURPRISE_BONUS bonus. The model instead of the teapot — the owner's spec
// 2026-07-20. The material stays MeshStandard (matcap cannot do emissive), and
// that is for the better: the real gleam of gold among the «baked» items singles
// out the treasure by itself.
// ⚠️ RAKE (we got burned 2026-07-21): the geometry of the surprise DEPENDS RIGIDLY
// on the contents of the «3d assets» folder. Previously present01Geo stood here;
// the owner replaced the whole batch of models — the function vanished, genLevel
// threw a ReferenceError EVEN BEFORE the items were created, the game came up with
// an empty bowl and WITHOUT an error in the console. That is why there is now a
// check and a fallback to the built-in teapot, which does not depend on the
// folder. If you change the model — take the one that actually exists.
const surpriseGeoFn = typeof animalfishGeo === 'function' ? animalfishGeo : gemGeo; // fallback WITHOUT the teapot (deleted): the procedural crystal does not depend on the assets folder
function makeSurprise(spawn){
  // if the fish is in TYPES as well — we take the geometry from the shared type
  // cache instead of breeding a second copy of the same BufferGeometry under the
  // key 'S'
  if (!geoCache.has('S')){
    const ti = TYPES.findIndex(t => t.geo === surpriseGeoFn);
    if (ti >= 0){
      const gkey = String(ti);
      if (!geoCache.has(gkey)) geoCache.set(gkey, TYPES[ti].geo());
      geoCache.set('S', geoCache.get(gkey)); // shared object: dispose by 'S' is done nowhere
    } else {
      geoCache.set('S', surpriseGeoFn());
    }
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffc84a, metalness: 1, roughness: 0.18 });
  mat.envMapIntensity = 1.1;
  mat.emissive = new THREE.Color(0x6b4a00);
  mat.emissiveIntensity = 0.5;
  const mesh = new THREE.Mesh(geoCache.get('S'), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  // scale 1.2 (was 1.5): the model has a reach of 1.0 against the teapot's 0.78 —
  // this way the physical size of the treasure stays the same
  mesh.scale.setScalar(1.2 * MESH_SCALE);
  const item = {
    key: 'SURPRISE', surprise: true, type: { name:'surprise', mat:'gold' }, baseColor: mat.color.clone(),
    r: 1.0 * 1.2 * MESH_SCALE, p: (spawn ? spawn.clone() : new THREE.Vector3(0, FLOOR_REST + 0.8, 0)),
    scl: 1.2 * MESH_SCALE,
    body: null,
    mesh, alive: true, animating: false, accessible: false,
  };
  mesh.userData.item = item;
  mesh.rotation.set(0, Math.random()*6.28, 0);
  mesh.position.copy(item.p);
  scene.add(mesh);
  // ⚠️ The name is 'surprisehull', and NOT 'surprise': the 'surprise' branch in
  // 50-physics is a compound of three spheres shaped for the TEAPOT (body + spout
  // + handle), and for the present it is wrong. An unknown name falls through to
  // default -> a convex hull from the real geometry, and the accessibility samples
  // fall into their own default branch. The density of gold is taken from the
  // item.surprise flag and does not depend on the name.
  // The teapot branch in 50-physics became dead — it was left in place, that is
  // someone else's zone.
  createItemBody(item, 'surprisehull', geoCache.get('S'));
  // for the duration of the settling/shake-down the surprise is NAILED to the
  // bottom (fixed): the vibration of the whole mass pushes large bodies upwards
  // (the Brazil nut effect) — the teapot floated up and stuck out above the rim.
  // It is released in finishIntro.
  // ⚠️ ONLY FOR THE OLD «lies on the bottom» PATH. With the THROW-IN FROM ABOVE
  // (the owner's word 2026-08-04) nailing it down would mean «hangs in the air
  // forever» — which is exactly what the A/B probe caught: topY 12.04 against the
  // baseline 7.14, the pile did not settle, the fish did not fall. A thrown-in
  // golden one is an ordinary live body.
  if (!spawn) item.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  return item;
}

// The black bomb ball (the owner's spec 2026-07-22, via the dispatcher): it does
// not match (its key is unique — hasAnyPair/the hint/the aim do not count it as a
// pair), a tap on an accessible one blows up the nearest neighbours (detonateBomb
// in 80-gameplay; the behaviour is the PHYSICS zone by rule 9, here there is only
// the factory). The body is the live 'ball' branch in 50-physics (the same way the
// surprise goes through 'surprisehull').
// THE IRIDESCENT BOMB (the owner's spec 2026-07-23 «make it iridescent»).
// ⛔⛔ HERE THE PROCEDURAL RAINBOW MATCAP OF THE BOMB WAS BAKED (`bombMatcap`, ~40
// lines: fresnel + a thin-film hue by radius and angle + a narrow spark). REMOVED
// 2026-08-17 by the owner's word «take it for the bomb» together with his picture —
// then the matcap arrived from `07-matcap-bomb.js` (`bombMatcapTex`).
// ⛔⛔ AND THAT IS STALE SINCE 2026-08-28: the bomb became the DYNAMITE (the owner's word
// «replace the bomb with the dynamite»), and the dynamite is a textured model — it takes the
// sport pack's colormap and the shared `itemMatcapAim` selector, see the material below.
// ⛔⛔ AND `07-matcap-bomb.js` IS GONE (his word 2026-09-01-p, «delete it»). It had painted
// nothing since 2026-08-28 and shipped 168 KB of his PNG in base64 to do it; what kept it alive
// was reachability, not use — the matcap editor still offered a 'bomb' row and `bombMatcapInfo`
// still answered — i.e. a target that edited a texture nobody renders. All of it went in one pass.
// ⚠️ THE POINTER THIS PARAGRAPH USED TO CARRY WAS ITSELF STALE («the hook at 99-main.js:1340» —
// it was at 1465), which is why the removal was censused BY CONTENT and not by these line numbers.
// ⚠️ THE REASON IT EXISTED AT ALL HAS NOT DISAPPEARED: three r149 cannot do
// `MeshPhysicalMaterial.iridescence` (r150+, and the UMD build cannot be raised
// above r160), and the iridescence still lives in a TEXTURE, not in the material.
// If you want the procedural one back — `git revert`, the code is intact in the
// history.
// ⚠️ The technique itself has not changed: a matcap = a lookup by the normal IN
// CAMERA SPACE, so when the ball rolls the picture «flows» by itself, without
// light and without a patch.
// ⛔⛔ THE BOMB IS NO LONGER A BALL — THE OWNER'S WORD 2026-08-28: «replace the bomb with
// dynamite», answering the fork raised with his own batch of new models. It CANCELS his spec of
// 2026-07-22 «add a black ball of medium size» and, with it, the visual half of 2026-07-23 «make
// it iridescent»: what an iridescent matcap was FOR was to make a featureless black sphere read as
// dangerous, and a stick of dynamite says that by itself.
// ⛔⛔ +50% AND THE SHADING PATCH, THE OWNER 2026-09-01-zh: «increase the size of the dynamite by
// 50%, add a matcap on it like on the box». BOTH PARAGRAPHS THAT USED TO STAND HERE ARE CANCELLED
// BY THAT ONE LINE, and each is worth reading before anything here moves again:
// ⚠️ (1) THE SIZE. 0.95 → 1.425·MESH_SCALE, applied to the mesh, to `r` AND to `scl` together —
// they are one quantity wearing three names (the geometry is normalised to rc = 1.0, so the mesh
// scale IS the enclosing radius, and `createItemBody` builds the hull collider from `scl`).
// Growing only the mesh would have left a bomb that looks big and collides small.
// ⚠️⚠️ (2) WHAT THAT DOES TO THE BLAST, MEASURED RATHER THAN REASONED. `detonateBomb` picks
// victims by `pairDist` = centre distance − both radii, so a bigger `r` shrinks EVERY gap by the
// same 0.29, i.e. the blast reaches slightly further. It changes nothing in practice, and the
// reason is written at BOMB_RADIUS itself: «the cap BOMB_MAX=7 is really what decides, the radius
// now covers almost the whole bottom». A uniform shrink cannot reorder the victims by distance,
// so the same nearest 7 are taken. ⛔ THE ICE IS THE EXCEPTION and it is a real change:
// FROZEN_BOMB_RADIUS = 2.86 is a genuine threshold, so point-blank ice-breaking gains ~0.29 of
// reach (~10%). Named to him; one number if he wants it back.
// ⚠️ (3) THE MATERIAL NOW TAKES `matcapSpecPatch`, which is exactly what «like on the box» means:
// every other item gets it through `itemMaterial` and the dynamite did not, so it was the one
// object in the bowl with no specular relief at all.
// ⛔ THE PRICE, WHICH THE OLD COMMENT CORRECTLY REFUSED TO PAY WHEN NOBODY HAD ASKED: the bomb was
// the last carrier of the OLD veil path (`applyVeil` lerps material.color toward DIM_GREY when a
// material has no patched shader — «a buried bomb only dims by ~30%, the hue is intact»). With the
// patch it joins `uVeil` like everything else, i.e. a buried bomb now DESATURATES fully. That is a
// documented behaviour changing, and it changes because he asked for the thing that causes it.
// ✅ THE CONSEQUENCE NAMED HERE ON 2026-08-28 WAS CLOSED ON 2026-09-01-p BY HIS WORD: the 168 KB
// of PNG, the editor's 'bomb' row, `__game.bombMatcapInfo()` and both suite places are gone. The
// paragraph is kept because it is the record of a defect that was NAMED rather than discovered —
// the «silent no-op» was reported to him at the moment it was created, and he decided it.
function makeBomb(){
  // the dynamite from «3d assets/models/sport» (39-sport). It has NO line in TYPES — it is not a
  // collectable type, only the bomb's body, so the pool stays at 93.
  if (!geoCache.has('B')) geoCache.set('B', sportdynamiteGeo());
  // the model's own palette (the sport atlas = the animals' one, aliased in 39-sport) + the same
  // almost-white pack matcap every textured model gets, through the shared four-tier selector.
  const mat = new THREE.MeshMatcapMaterial({
    color: 0xffffff,                       // white: the shader multiplies map by color
    map: modelColormap('sport'),
    matcap: itemMatcapAim({ name: 'bomb', tex: 'sport', mat: 'soft' }),
  });
  // «a matcap like on the box»: the same treatment `itemMaterial` gives every textured model —
  // the specular patch and the brightness/contrast knobs that are calibrated for the authors'
  // atlases. Without these two lines the matcap was still SELECTED (the four-tier aim above
  // already returned the same preset the matchbox wears) but never got its relief, which is why
  // one preset read as two different materials.
  mat.userData.texTune = 1;
  mat.onBeforeCompile = matcapSpecPatch;
  const mesh = new THREE.Mesh(geoCache.get('B'), mat);
  mesh.scale.setScalar(BOMB_SCALE * MESH_SCALE);   // the mesh scale IS the enclosing radius (rc = 1.0)
  // ⛔⛔ THE BOMB NEEDS ITS OWN `half`, EXACTLY AS makeItem BUILDS ONE (audit 2026-09-01-o,
  // reproduced). Without it `radialReach` (50-physics) falls through to `it.r` and reads the
  // dynamite as a SPHERE of 0.8835 in every pose, while its collider is a tight convex hull whose
  // true reach measures 0.32-0.41. The rescuer then teleports a bomb that is legally resting: at
  // y = 2.0 it fires from d > 2.066 where the ring face allows 2.319 — a 0.25-wide band. Measured:
  // placed at d = 2.19 -> «[rescue] bomb d=2.19 y=2.00 r=0.88», velocities zeroed, the whole pile
  // woken; at d = 2.016 no rescue. And the DIAGNOSTICS disagreed with the behaviour, because
  // `maxWallExcess` uses the exact reach — the very divergence the OBB work existed to end.
  // ⚠️ The boundingBox guard is not decoration: this geometry comes out of the type cache and may
  // not have been measured yet at this point.
  { const bg = geoCache.get('B');
    if (!bg.boundingBox) bg.computeBoundingBox();
    const bb = bg.boundingBox, sc = BOMB_SCALE * MESH_SCALE;
    var bombHalf = { x: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) * sc,
                     y: Math.max(Math.abs(bb.min.y), Math.abs(bb.max.y)) * sc,
                     z: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) * sc }; }
  const item = {
    key: 'BOMB', bomb: true, type: { name: 'bomb', mat: 'plain' },
    baseColor: mat.color.clone(),
    fxColor: new THREE.Color(0x3a3f4a).convertSRGBToLinear(), // dark debris of the explosion
    r: BOMB_SCALE * MESH_SCALE, scl: BOMB_SCALE * MESH_SCALE,   // one quantity, three names
    half: bombHalf,                                             // the wall test by OBB, as for any item
    p: new THREE.Vector3(), body: null, geo: geoCache.get('B'),
    mesh, alive: true, animating: false, accessible: false,
  };
  mesh.userData.item = item;
  scene.add(mesh);
  return item;
}

// THE «TYPE CHARGE» GRANT. 1/level (level.chargeGiven) and only into an empty slot. The type is
// random among the LIVE ones with >= CHARGE_MIN_COPIES copies: below that threshold the charge
// would blow up 1-2 items and disappoint (measurement: median copies 14 early / 6 at lv.25).
// ⚠️ EXTRACTED 2026-09-01-i BECAUSE IT NOW HAS TWO CALLERS - turbo ignition, as before, and the
// schedule (`tickChargeSchedule`). Two copies of a grant would have drifted at the first edit of
// the copies threshold, and the `chargeGiven` watermark only works if BOTH paths respect it.
function tryGiveCharge(){
  if (level.chargeGiven || chargeName) return false;
  const cnt = {};
  for (const it of items)
    if (it.alive && !it.surprise && !it.bomb && !it.frozen && it.type)
      cnt[it.type.name] = (cnt[it.type.name] || 0) + 1;
  const pool = Object.keys(cnt).filter(k => cnt[k] >= CHARGE_MIN_COPIES);
  if (!pool.length) return false;
  level.chargeGiven = true;
  chargeName = pool[Math.floor(Math.random() * pool.length)];
  chargeUntil = performance.now() + CHARGE_TTL_MS;
  try { updateHUD(); } catch(e){}
  return true;
}
// The scheduled arrival. ⚠️ The moment is drawn ONCE at level start and stored on `level`, not
// re-rolled per frame: a per-frame chance would make the arrival depend on the frame rate.
function tickChargeSchedule(now){
  // ⛔⛔ THE GUARD USED TO READ `level.intro`, AND NOTHING IN THE PROJECT EVER SET IT (audit
  // 2026-09-01-o, verified by grep): the flag was inert from the day the feature shipped. The
  // intro is the module-level `intro` of 99-main, and reading it here is safe — this function is
  // only ever called from `loop`, i.e. long after every top-level initialisation.
  // ⚠️ IT PAIRS WITH THE `chargeAt` ANCHOR FIX IN `resumeGame`: pausing during the intro is
  // allowed (his word 2026-08-12), so an unshifted anchor plus a dead guard meant a long pause
  // there dropped the charge into the intro's remaining frames. Two lines, one hole.
  if (!level || level.over || intro) return;
  if (!level.chargeAt || now < level.chargeAt) return;
  level.chargeAt = 0;              // one attempt, whether or not the pile can supply a type
  tryGiveCharge();
}
// WHEN (if at all) the scheduled charge lands on this level. 0 = never.
function chargeAtFor(lv){
  if (!(lv > CHARGE_SCHED_FROM) || (lv % CHARGE_SCHED_EVERY) !== 0) return 0;
  if (Math.random() >= CHARGE_SCHED_CHANCE) return 0;     // his «sometimes»
  // somewhere in the working middle of a round - late enough that the pile has been played into,
  // early enough that the charge's own 10 s TTL is not racing the end of the level
  return performance.now() + 12000 + Math.random() * 25000;
}
// The chain reaction: a top-up of CHAIN_DROP_N RANDOM items per tick — NOT in
// pairs (the owner's spec; orphans are legal, the finale eats them). The types are
// independent, taken from the ones active on the level. Stop at a full bowl or at
// the limit of 141.
function chainRefill(){
  // the fill level — by the pile BELOW the rim: the freshly poured ones flying
  // from above must not block the next tick (they choked the pace down to ~1 pc/s);
  // the limit on how many fly at once insures against an endless column
  let aliveCnt = 0, top = 0, airborne = 0;
  for (const it of items) if (it.alive){
    aliveCnt++;
    if (it.p.y < FUNNEL.H) top = Math.max(top, it.p.y + it.r); else airborne++;
  }
  // ⛔ THE AIR CEILING 8 → 10 (2026-08-23-a, together with the denser tick). Measured on
  // the live build BEFORE the edit: at a tick of 125 ms the air held at most 6 of the 8
  // allowed, i.e. the ceiling was not the wall — but at 80 ms it becomes one, and a tick
  // that returns here delivers nothing at all. The raise is deliberately small: this
  // ceiling is what keeps the pour from becoming an endless column, and the frame cost of
  // items in flight is exactly what he complained about two days ago. Re-measure the worst
  // frame before raising it again.
  if (top > FUNNEL.H - 1 || airborne >= 10) return;
  // the fractional volume of a tick (2.6 = +30%, the owner's spec): the integer
  // part is spawned, the remainder piles up in chainCarry until the next tick
  chainCarry += CHAIN_DROP_N;
  const want = Math.floor(chainCarry);
  chainCarry -= want;
  let dropped = 0;
  for (let k = 0; k < want; k++){
    if (aliveCnt + dropped >= PAIRS*2 + 1) break;
    dropOneFromSky(k);
    dropped++;
  }
  if (dropped){ wakePhysics('chainDrop'); updateHUD(); }
}
// ═══ THE BOMB: WHEN THERE IS ONE (the owner's spec 2026-08-12) ═══
// The gap lives IN THE SESSION'S MEMORY and not in the save: it is not progress
// and not currency, it is the rhythm of delivery. A save field would demand a
// merge between devices (the checklist in 77-save), and two devices would argue
// about whose gap is the right one.
let bombNextLevel = BOMB_FROM_LEVEL;
function bombAlive(){ for (const it of items) if (it.alive && it.bomb) return true; return false; }
function bombDueThisLevel(){
  if (levelNum < BOMB_FROM_LEVEL) return false;
  return levelNum >= bombNextLevel;
}
// The gap is assigned ONLY when a bomb has actually been handed out — otherwise a
// skipped level would shift the queue silently.
function bombNoteGiven(){
  const gap = BOMB_GAP_MIN + Math.floor(Math.random() * (BOMB_GAP_MAX - BOMB_GAP_MIN + 1));
  bombNextLevel = levelNum + gap;
}
// REWARD FOR SERIES: the bomb falls from the sky by the same path as the turbo
// top-up.
// ⚠️ Guards: not earlier than the fifth level, not in the finale/at the end, and
// NOT A SECOND ONE — if a bomb is already in the bowl the reward is skipped (the
// «one bomb» invariant stays intact).
function bombDropReward(){
  if (!level || level.over || levelNum < BOMB_FROM_LEVEL) return false;
  if (level.bombReward || bombAlive()) return false;
  level.bombReward = true;
  const b = makeBomb();
  const maxD = Math.max(0.1, radiusAt(FUNNEL.H) * 0.7 - b.r);
  const th = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxD;
  b.p.set(Math.cos(th) * d, FUNNEL.H + 2, Math.sin(th) * d);
  b.mesh.position.copy(b.p);
  createItemBody(b, 'bombhull', geoCache.get('B')); // not 'ball' any more — see makeBomb
  items.push(b);
  wakePhysics('bombReward'); updateHUD();
  return true;
}
// The spawn of one RANDOM item above the bowl (a live fall)
function dropOneFromSky(k, forcedTypeIdx){
  // ⛔⛔ FROM THE BOWL'S OWN DEALT SET, NOT FROM EVERY UNLOCKED TYPE (2026-09-01-i). With a cap on
  // distinct types the two are different, and drawing from the unlocked range would drop items
  // with NO partner anywhere in the bowl - which the player is then punished a full mistake for
  // tapping. The fallback keeps the old behaviour for any call before a level exists.
  const dealt = level && level.dealtTypes;
  const typeIdx = (forcedTypeIdx == null)
    ? (dealt && dealt.length
        ? dealt[Math.floor(Math.random() * dealt.length)]
        : Math.floor(Math.random() * (level.typesCount || LEVEL_TYPES_MIN)))
    : forcedTypeIdx;
  const it = makeItem(typeIdx, levelSize());
  const maxD = Math.max(0.1, radiusAt(FUNNEL.H) * 0.7 - it.r);
  const th = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxD;
  it.p.set(Math.cos(th) * d, FUNNEL.H + 2 + (k || 0) * 1.2, Math.sin(th) * d);
  it.mesh.position.copy(it.p);
  createItemBody(it, TYPES[typeIdx].name, it.geo);
  // ⚠️⚠️ THE INITIAL DOWNWARD VELOCITY — THE CURE FOR THE «FEELING OF DROPPED
  // FRAMES» (the owner's word 2026-08-21-d). It is NOT cosmetic: the measurement
  // showed that the frame sags 34.7 -> 64.3 ms exactly when up to nine items hang
  // in the air at once. A flight half as long removes both the time and the
  // overlap.
  // ⛔ «NINE IN THE AIR» IS HISTORY, NOT A LIVE BOUND (2026-08-30 census): the chain path is
  // gated at 10 airborne (measured 8), while finalPairsRefill (~47 at lvl 40+) and continueRun
  // (10) have NO air gate at all. Do NOT add one to finalPairsRefill — it must deliver ALL
  // partners; an early return would strand orphans for the grind.
  // ⚠️ ONE POINT FOR ALL THREE TOP-UPS (turbo, the final pairs, continue) — they
  // all come through here; a separate velocity in each would drift apart at the
  // first edit.
  // ⚠️ Below the terminal `MAX_FALL` (16) — the anti-tunnelling limit is untouched.
  if (CFG.dropV0) it.body.setLinvel({ x: 0, y: -CFG.dropV0, z: 0 }, true);
  items.push(it);
  return it;
}
// THE FINAL TOP-UP OF PAIRS (a request from the testers, the owner's «Do it»
// 2026-08-02: «people want a happy end and a finish with satisfaction and a
// victory. Right now they watch the blender grinding up the remaining things»):
// at the moment of «only orphans are left» (finale) every live ORDINARY item gets
// a partner of ITS type thrown in — the level ends with everything collected into
// pairs and not with a spectacle of grinding. Stones/bombs/surprises do not count
// and are not topped up (the owner's word: «stones and bombs we grind»). Once per
// level. The refill mark on the topped-up ones: by it doMatch gives only the BASE
// price of a match (the promise to the owner «without series multipliers, so that
// it is not profitable to leave orphans on purpose»; the type upgrade and the
// bought score booster stay — they are not series-based).
function finalPairsRefill(){
  if (level.finalRefillDone) return false;
  level.finalRefillDone = true; // and we do not check «stones only» a second time
  const orphans = [];
  for (const it of items)
    if (it.alive && !it.bomb && !it.surprise && !it.frozen) orphans.push(it);
  if (!orphans.length) return false; // stones/bombs are left — we grind them as garbage
  let k = 0;
  for (const o of orphans){
    const idx = parseInt(String(o.key).slice(1), 10); // the key of the ordinary ones = 'T'+typeIdx
    if (!(idx >= 0)) continue;
    const p = dropOneFromSky(k++, idx);
    p.refill = true;
  }
  if (k){
    wakePhysics('finalRefill');
    toast('Final pairs');
    stats.lastAction = performance.now(); // the grind is postponed — let them be collected
    level.stuck = -4;                     // a head start for the detectors while the top-up settles
    Telemetry.ev('final_refill', { lv: levelNum, n: k });
    setTimeout(()=>{ refreshAccessibility(); updateHUD(); }, 900);
  }
  return k > 0;
}
// Continue after a loss: a top-up of n items (without the fullness guard — a lost
// level is partly empty, the task is to bring the game back to life)
function dropExtra(n){
  let aliveCnt = 0;
  for (const it of items) if (it.alive) aliveCnt++;
  for (let k = 0; k < n && aliveCnt + k < PAIRS*2 + 1; k++) dropOneFromSky(k % 5);
  wakePhysics('continueDrop');
  updateHUD();
}

// The single point of item removal: the body, the mesh, the MATERIAL (item
// materials are personal because of the veil — without dispose they piled up in
// GPU memory level after level). Do NOT touch the geometry — it is shared via
// geoCache.
function removeItem(it){
  it.alive = false;
  destroyItemBody(it);
  scene.remove(it.mesh);
  it.mesh.material.dispose();
}

// a random item size according to the spread of the current level (the twins of a
// pair get ONE size — size is generated per pair)
function levelSize(){
  // the first SIZE_UNIFORM_LEVELS levels — all items of ONE size; after that the
  // ramp of the spread. ⚠️ THE NUMBERS WERE REVISED 2026-08-15 from the owner's
  // live play («because of the size collecting becomes uncomfortable»): the start
  // from level 20, a step of 2%/level, a ceiling of ±30% — that is, an item is
  // NEVER smaller than 70% of the base one. The details and his quote — at the
  // constants in 00-config.
  if (levelNum <= SIZE_UNIFORM_LEVELS) return 1;
  const spread = Math.min(SIZE_SPREAD_MAX, SIZE_SPREAD_MIN + (levelNum - SIZE_UNIFORM_LEVELS - 1) * SIZE_SPREAD_STEP);
  return 1 + (Math.random() * 2 - 1) * spread;
}

// the queue of ice blocks — IN THE SESSION'S MEMORY, as with the bomb: this is
// the rhythm of delivery, not progress
let frozenNextLevel = FROZEN_FROM_LEVEL;
function freezeItem(it){
  it.frozen = true; it.frozenReady = false;
  it.frozenKey = it.key;              // for the RETURN into the pairing mechanics
  // ⚠️ THE KEY ≠ THE TYPE NAME (the keys look like «T5», while the credit goes by
  // type.name from doMatch) — the first version compared different namespaces, and
  // the credit stayed silent. Caught by a probe, not by reading. We store the type
  // SEPARATELY.
  it.frozenType = it.type.name;
  it.key = 'FROZEN#' + Math.floor(Math.random() * 1e9);   // unique — outside the pairing mechanics
  it.frozenNeedItems = FROZEN_PAIRS_N * 2;                // the credit is counted IN PIECES: 2 pieces = a pair
  it.frozenGotItems = 0;
  // ⚠️ THE PRESET CRUST — ON THE ITEM ITSELF, UNDER THE ICE (renderOrder 2 against
  // 3): the owner asked for «the frozen object INSIDE with the crust as it was in
  // the preset», i.e. the glow belongs to the object, not to the ice block.
  chillShellFX(it);
  makeIceShell(it);
}
// THE ICE BLOCK — TWO LOW-POLY LAYERS ON TOP OF THE MESH (the fire overlay
// technique: the material of the item itself is NOT touched for a single frame —
// the collection portraits are rendered by the same material class, and the
// «frosty» look would leak into the museum). The semi-transparency is opacity,
// transmission is forbidden by the canon. The cracks are the GROWTH OF VERTEX
// NOISE by the steps of the credit (the base positions are stored).
// ⚠️⚠️ THE ICE = A «FROST CRUST», THE OWNER'S CHOICE 2026-08-13 out of a bench of
// five variants + his own refinements: «a bit thicker (a larger offset from the
// object)», «a little inner glow, as if it were ice», «it cracks and breaks like
// the bowl — into different pieces». ⛔ THE BENCH (?ice=N, __game.iceStyle) WAS CUT
// — the winner became the single live look; the variants are in the git history
// (commit 358fb4c).
// HOW IT WORKS: an inflated copy of the ITEM'S MESH (the fire overlay technique —
// the item's material is not touched), cut into Voronoi CHUNKS by triangles — the
// bowl scatter technique: the membership in a chunk is written INTO THE VERTICES
// (aCen/aDir/aSpin), and the gaps and the scatter are driven by the vertex shader
// from uniforms. One mesh, one draw call per ice block; ⚠️ the attribute name is
// aCen, NOT centroid (reserved by GLSL).
const ICE_SCALE = 1.14;     // «a bit thicker»: on the bench it was 1.07
const ICE_CHUNKS = 12;      // chunks of the crust
const ICE_BOOM_MS = 700;    // the scatter runs on the REAL clock (tickIceBooms in 99-main)
function iceCrustMat(){
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uCol:  { value: new THREE.Color(0x8fd4ff) },   // the body of the frost
      uRim:  { value: new THREE.Color(0xdff4ff) },   // the rim along the edge
      uGlow: { value: new THREE.Color(0xbfeaff) },   // the inner glow
      uGlowK:{ value: 0.38 },
      uGap:  { value: 0 },   // the gaps between chunks — the steps of the cracks
      uBoom: { value: 0 },   // the scatter 0..1
    },
    vertexShader: [
      'attribute vec3 aCen; attribute vec3 aDir; attribute vec3 aSpin;',
      'uniform float uGap; uniform float uBoom;',
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  vec3 p = position + normalize(aCen + vec3(1e-4)) * uGap;',
      '  vec3 n = normal;',
      '  if (uBoom > 0.0){',
      '    vec3 lp = p - aCen;',
      '    float a = uBoom * (2.0 + aSpin.y * 3.0);',
      '    vec3 ax = normalize(aSpin);',
      '    lp = lp*cos(a) + cross(ax, lp)*sin(a) + ax*dot(ax, lp)*(1.0-cos(a));',
      '    n  = n*cos(a)  + cross(ax, n)*sin(a)  + ax*dot(ax, n)*(1.0-cos(a));',
      '    p = aCen + lp + aDir * uBoom * 1.6;',
      '    p.y -= uBoom * uBoom * 1.1;',
      '  }',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  vN = normalMatrix * n; vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'].join('\n'),
    fragmentShader: [
      'varying vec3 vN; varying vec3 vV;',
      'uniform vec3 uCol; uniform vec3 uRim; uniform vec3 uGlow;',
      'uniform float uGlowK; uniform float uBoom;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
      '  float d = abs(dot(N, V));',
      '  float f = pow(1.0 - d, 1.6);',
      // the glow — STRAIGHT AT the camera (anti-fresnel): the middle of the crust
      // glows softly and cold, «as if it were ice»; NOT additive — on a light sky
      // additive drowns
      '  vec3 c = mix(uCol, uRim, f) + uGlow * (pow(d, 2.0) * uGlowK);',
      '  float a = mix(0.18, 0.9, f) * (1.0 - uBoom * 0.85);',
      '  gl_FragColor = vec4(c, a);',
      '}'].join('\n'),
  });
}
// Baking the crust: a copy of the item's geometry -> non-indexed, every TRIANGLE
// is assigned to the nearest of the ICE_CHUNKS seeds (Voronoi over the surface),
// the centroid of a chunk and its flight go into vertex attributes. Everything is
// deterministic through the hash (Math.sin(i*127.1)*43758.5453 — the same
// technique as with the former cracks): one ice block always has one pattern, the
// chunks do not flicker between frames.
function bakeIceCrust(g0){
  const src = g0.index ? g0.toNonIndexed() : g0.clone();
  const pos = src.attributes.position;
  const triN = Math.floor(pos.count / 3);
  const h01 = (i) => { const h = Math.sin(i * 127.1) * 43758.5453; return h - Math.floor(h); };
  const seeds = [];
  for (let s = 0; s < ICE_CHUNKS; s++){
    const vi = Math.floor(Math.abs(h01(s + 7)) * pos.count);
    seeds.push(new THREE.Vector3().fromBufferAttribute(pos, Math.min(vi, pos.count - 1)));
  }
  const chunkOf = new Int32Array(triN);
  const csum = []; const ccnt = new Int32Array(ICE_CHUNKS);
  for (let s = 0; s < ICE_CHUNKS; s++) csum.push(new THREE.Vector3());
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < triN; t++){
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++){ v.fromBufferAttribute(pos, t * 3 + k); c.add(v); }
    c.multiplyScalar(1 / 3);
    let best = 0, bd = Infinity;
    for (let s = 0; s < ICE_CHUNKS; s++){
      const d = c.distanceToSquared(seeds[s]);
      if (d < bd){ bd = d; best = s; }
    }
    chunkOf[t] = best;
    csum[best].add(c); ccnt[best]++;
  }
  const cen = csum.map((sm, s) => ccnt[s] ? sm.multiplyScalar(1 / ccnt[s]) : sm.set(0, 0, 0));
  const aCen = new Float32Array(pos.count * 3);
  const aDir = new Float32Array(pos.count * 3);
  const aSpin = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3(), ax = new THREE.Vector3();
  for (let t = 0; t < triN; t++){
    const s = chunkOf[t], cc = cen[s];
    // the flight: outwards from the item's centre + an upward toss + the chunk's jitter
    dir.copy(cc).normalize();
    dir.x += (h01(s * 3 + 1) - 0.5) * 0.7;
    dir.z += (h01(s * 3 + 2) - 0.5) * 0.7;
    dir.y = Math.abs(dir.y) * 0.4 + 0.55;
    dir.normalize();
    ax.set(h01(s * 5 + 1) - 0.5, h01(s * 5 + 2) - 0.5, h01(s * 5 + 3) - 0.5).normalize();
    for (let k = 0; k < 3; k++){
      const i = t * 3 + k;
      aCen[i * 3] = cc.x; aCen[i * 3 + 1] = cc.y; aCen[i * 3 + 2] = cc.z;
      aDir[i * 3] = dir.x; aDir[i * 3 + 1] = dir.y; aDir[i * 3 + 2] = dir.z;
      aSpin[i * 3] = ax.x; aSpin[i * 3 + 1] = ax.y; aSpin[i * 3 + 2] = ax.z;
    }
  }
  src.setAttribute('aCen', new THREE.BufferAttribute(aCen, 3));
  src.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
  src.setAttribute('aSpin', new THREE.BufferAttribute(aSpin, 3));
  return src;
}
function makeIceShell(it){
  const shell = new THREE.Group();
  const crust = new THREE.Mesh(bakeIceCrust(it.mesh.geometry), iceCrustMat());
  crust.scale.setScalar(ICE_SCALE);
  crust.renderOrder = 3;
  shell.add(crust);
  shell.userData.iceMat = crust.material;
  shell.renderOrder = 3;
  it.mesh.add(shell);
  it.iceShell = shell;
  iceCracks(it); // step zero: hairline seams — the crust is «cracked» from the very start
}
// The steps of the cracks = the gaps between the chunks: a uniform, the vertices
// are not touched. The pattern is determined by the baking — the cracks DEEPEN,
// they do not flicker.
function iceCracks(it){
  const shell = it.iceShell; if (!shell || !shell.userData.iceMat) return;
  const k = Math.min(1, it.frozenGotItems / it.frozenNeedItems);
  shell.userData.iceMat.uniforms.uGap.value = 0.012 + 0.06 * k;
}
// The scatter of the crust «like the bowl»: the shell is detached from the item
// INTO THE WORLD (the item goes on living and moving), the chunks fly by the
// shader on the REAL clock — the tickIceBooms tick is called from loop (99-main).
const iceBooms = [];
function iceBoomStart(it){
  const shell = it.iceShell; if (!shell) return;
  it.iceShell = null;
  try { scene.attach(shell); } catch (e) { it.mesh.remove(shell); return; }
  iceBooms.push({ shell, mat: shell.userData.iceMat, t0: performance.now() });
}
function tickIceBooms(now){
  for (let i = iceBooms.length - 1; i >= 0; i--){
    const b = iceBooms[i];
    const k = (now - b.t0) / ICE_BOOM_MS;
    if (k >= 1){
      scene.remove(b.shell);
      for (const m of b.shell.children){ m.geometry.dispose(); m.material.dispose(); }
      iceBooms.splice(i, 1);
      continue;
    }
    if (b.mat) b.mat.uniforms.uBoom.value = k;
  }
}
// ⛔ removeIceShell WAS CUT together with the bench: its only caller (breakIce)
// switched to iceBoomStart (the scatter into chunks). To bring it back — from the
// git history.

function genLevel(){

  Ads.cancel(); // a hanging rewarded impression is bound to the OLD level — we mute the reward
  // A BURNING ITEM: we put it out and zero the window — the items of the old level
  // are about to go, and the fire overlay hangs ON THE MESH and would ride away
  // with it into nowhere
  extinguishAll();
  // shadows exist only in the MeshStandard branch: a runtime flip of CFG.matcap in
  // ⚙️ without this left a half-state (a shadow pass on materials that do not see it)
  renderer.shadowMap.enabled = !CFG.matcap;
  items.forEach(removeItem);
  items = [];
  buildTempTallWall(); // the spawn column is above the rim — we hold it with a tall wall
  const typesCount = Math.min(TYPES.length, LEVEL_TYPES_MIN + (levelNum - 1));
  const idleLimit = CFG.hard ? MIXER_IDLE_HARD : MIXER_IDLE_EASY; // the mixer's patience by difficulty
  const pairsCnt = pairsForLevel(levelNum);   // the progression 40 -> 90 pairs (00-config)

  // the pairs: type + size; the small ones go down, the large ones go up
  const pairs = [];
  // ⚠️⚠️ UNTANGLING TWO PARALLEL FIXES OF ONE LINE (2026-07-30, v181).
  // The dead tail of TYPES was fixed TWICE, without either knowing about the
  // other: the dispatcher in v178 (a deterministic uniform sweep
  // `round(i·(N−1)/(pairs−1))`) and GRAPHICS by the owner's direct word «change the
  // type-selection line so that everything comes alive» (Fisher-Yates + round-robin,
  // below). THE GRAPHICS VERSION WON, and the reason is not political but
  // gameplay-based: on levels with typesCount > pairsCnt my sweep took THE VERY
  // SAME subset of types in every layout, while their sampling takes a RANDOM 90
  // out of the unlocked ones, and every layout is different. For the late game this
  // variety is free. Both versions keep the curve 1..82 untouched (while
  // typesCount <= pairsCnt, ALL the unlocked types are taken) — this was verified
  // in both.
  // ⚠️ CONSEQUENCE FOR THE TESTS: on high levels the composition of the pile is
  // NON-DETERMINISTIC. An assert «type X is in the pile on level Y» must collect the
  // UNION over several regens once `typesCount > pairsCnt` — a single regen flakes.
  // ⚠️⚠️ THE BOUNDARY IS DERIVED, NOT A LITERAL, AND IT MOVES WITH THE POOL. It is the
  // level where typesCount (level + LEVEL_TYPES_MIN - 1) first exceeds the pairs ceiling
  // of 90 — i.e. `TYPES.length > 90` is what makes the branch reachable at all.
  // ⛔ THE «82» THAT STOOD HERE WAS THE VALUE FOR A POOL OF 120 and had been dead since
  // the pool was cut to 87 (2026-08-20): with 87 types the branch was UNREACHABLE and the
  // sampling only shuffled the ORDER. The props pack took the pool to 99 on 2026-08-31,
  // so it is live again — from level 89, and every future edit of TYPES moves that number.
  // Recompute it, never quote it.
  // ⚠️⚠️ THE SELECTION OF THE LEVEL'S TYPES (the owner's spec 2026-07-30 «change
  // the type-selection line so that everything comes alive»). IT WAS:
  // `type: i % typesCount` — a circular walk FROM ZERO, so with pairsCnt=90 ONLY
  // the indices 0..89 were spawned, and the whole tail of TYPES was STRUCTURALLY
  // DEAD at any level. Our own ones were dead too: foodicecreamscoopmint (90),
  // fooddonutsprinkles (91) and steak (92) — the owner's own model NEVER made it
  // into the game. Hence also the lie in the docs «the ceiling of the progression =
  // TYPES.length»: the real ceiling was PAIRS.
  // IT BECAME: the same number of DIFFERENT types, but chosen OUT OF THE WHOLE
  // unlocked range.
  // ⚠️ The NUMBER of types is UNTOUCHED — it is the main lever of difficulty, and it
  // stays min(typesCount, pairsCnt), as it was. Only WHICH ones exactly changes.
  // ⚠️ THE CURVE 1..82 IS UNAFFECTED BIT FOR BIT: while typesCount <= pairsCnt,
  // distinct equals typesCount, that is, ALL the unlocked types are taken — THE
  // VERY SAME SET as before (only the order in the pairs array changes, and it is
  // sorted by size below anyway). The sampling starts cutting something off only
  // from typesCount > pairsCnt, that is, exactly where the dead zone used to be.
  // ⛔⛔ AND SINCE 2026-09-01-i THERE IS A THIRD LIMIT: how many DIFFERENT types one bowl may hold
  // (`levelDistinctCap`, a ramp - 24 at lv20, 25 at lv30, 27 at lv50). Unlocking is untouched;
  // this caps only the deal. It is the fix for the measured post-30 collapse: copies-per-type had
  // been falling 60 -> 5.6 -> 3.5, taking the group size and with it the QUADRATIC merge score.
  const distinct = Math.min(typesCount, pairsCnt, levelDistinctCap(levelNum));
  const pool = [];
  for (let i = 0; i < typesCount; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--){          // Fisher-Yates over the unlocked range
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  // ⚠️⚠️ TWO KINDS OF TYPE ARE PINNED INTO THE DEAL, AND THE SECOND ONE IS A TRUST BUG IF MISSED.
  // (1) THE NEWEST UNLOCK. The game promises a new thing every level; with a cap it would
  //     otherwise be absent from the very bowl that unlocked it about half the time.
  // (2) EVERY TYPE THE PLAYER HAS PAID A BOOST ON. A boost is bought on a NAMED type and does
  //     nothing in a bowl that type is not dealt into - i.e. without this the cap would silently
  //     make purchased content stop working roughly half the time. That is not balance, it is
  //     trust, and it is why this loop exists at all.
  // ⚠️ Pinning preserves the shuffled order of everything else, and cannot exceed the deal: if a
  // player has boosted more types than fit, the surplus simply misses out like any other type.
  {
    const pin = [];
    if (typesCount > 0) pin.push(typesCount - 1);                 // the model this level unlocked
    for (let i = 0; i < typesCount; i++){
      const nm = TYPES[i] && TYPES[i].name;
      if (nm && boostTier(nm) > 0 && pin.indexOf(i) < 0) pin.push(i);
    }
    if (pin.length){
      const rest = pool.filter(i => pin.indexOf(i) < 0);
      pool.length = 0;
      for (const i of pin) pool.push(i);
      for (const i of rest) pool.push(i);
    }
  }
  // the set this bowl was actually dealt. ⛔ LOAD-BEARING BEYOND genLevel: `dropOneFromSky` MUST
  // draw from it. Drawing from all unlocked types - which is what it did until 2026-09-01-i -
  // would rain items whose partner is nowhere in the bowl, and by the owner's own rule a tap on a
  // pairless item is a FULL mistake. The turbo reward would have become a trap.
  const dealtTypes = pool.slice(0, distinct);
  // round-robin over the SELECTED ones — the distribution of copies across types is
  // just as even as it was with `i % typesCount` (otherwise rare types would
  // produce orphans)
  for (let i=0;i<pairsCnt;i++) pairs.push({ type: pool[i % distinct], size: levelSize() });  pairs.sort((a,b)=>a.size - b.size); // the small ones first (they will lie lower)
  let n = 0;
  for (const pr of pairs){
    for (let k=0;k<2;k++){
      const it = makeItem(pr.type, pr.size);
      // the column ABOVE the bowl IN LAYERS (8 each — the bowl is wider, the step
      // is 1.35): without start overlaps — they blew the column up and threw items
      // onto the top edges of the walls
      const perLayer = 8;
      const layer = Math.floor(n/perLayer);
      const bottom = FUNNEL.H;
      const y = bottom + 1.6 + layer*1.35 + Math.random()*0.25;
      const maxD = Math.max(0.1, radiusAt(bottom)*0.85 - it.r);
      const th = Math.random()*Math.PI*2, d = Math.sqrt(Math.random())*maxD;
      it.p.set(Math.cos(th)*d, y, Math.sin(th)*d);
      
      it.mesh.position.copy(it.p);
      createItemBody(it, TYPES[pr.type].name, it.geo);
      it.wave = layer; waveHold(it);
      items.push(it); n++;
      if (n === pairsCnt && bombDueThisLevel()){
        bombNoteGiven();
        const b = makeBomb();
        b.p.set((Math.random()-0.5)*2, FUNNEL.H + 1.6 + Math.floor(n/8)*1.35 + 0.7, (Math.random()-0.5)*2);
        b.mesh.position.copy(b.p);
        createItemBody(b, 'bombhull', geoCache.get('B')); // not 'ball' any more — see makeBomb
        b.wave = Math.floor(n/8); waveHold(b);
        items.push(b);
      }
    }
  }
  // ⛔ THE SPAWN OF STONES WAS CUT 2026-08-17 together with the stones themselves
  // (the owner's word).
  // THE GOLDEN OBJECT IS THROWN IN WITH EVERYONE ELSE (the owner's word 2026-08-04:
  // «initially this object is not there and it is thrown in with the other objects
  // while the bowl is being filled»; the previous spec «it lies down on the bottom
  // first» was cancelled by him as well). ⚠️ WE CREATE IT RIGHT AT THE THROW-IN
  // POINT rather than moving a ready body: the first version put the body near the
  // bottom and moved it with setTranslation — the body HUNG in the air (the A/B
  // probe: topY 12.04 against the baseline 7.14, the pile did not settle). A Rapier
  // body must be born where it is meant to fall.
  {
    // ⚠️ THE FIRST LAYER OF THE COLUMN (two runs of the suite: from the middle of
    // the column the golden one landed ON TOP of the pile — it stopped being
    // «buried» (the accessibility guard) and pushed the fill height above the rim).
    // The owner's word is fulfilled this way too: it IS THROWN IN together with the
    // rest and is visible in flight, it simply flies in the first wave and honestly
    // ends up deep inside, as before.
    // the first wave of the column: it is visible in flight together with the rest
    // and honestly goes deep into the pile (the «buried fish» guard and the fill
    // height are intact)
    // ⚠️⚠️ THE GATE (the owner's spec 2026-08-12): from level 10 AND only if at
    // least one step of the boost has been bought. Below that — there is no
    // treasure in the bowl at all.
    // ⚠️ ALL THE CONSUMERS OF THE SURPRISE ALREADY TOLERATE ITS ABSENCE BY
    // CONSTRUCTION: they either filter by `!it.surprise` or look it up with
    // `find(...)` and exit through `if (!sp) return`. Verified by enumerating all
    // 20 places before the edit — not one of them relies on the treasure BEING
    // there.
    if (levelNum >= SURPRISE_FROM_LEVEL &&
        (typeof anyBoostBought !== 'function' || anyBoostBought())){
      const th = Math.random() * Math.PI * 2, d = Math.random() * 1.8;
      const spawn = new THREE.Vector3(Math.cos(th) * d, FUNNEL.H + 1.6 + 0.5, Math.sin(th) * d);
      items.push(makeSurprise(spawn));
      // ⛔⛔ THE TREASURE'S SPAWN FLASH IS GONE (the owner's word 2026-09-03: «when the items pour
      // into the bowl there is some parasitic animation, an explosion or something, at the very
      // top — check it and remove it»). It was `spawnHitFx(spawn, 1.6, null, HITFX_SPAWN)` here —
      // «the treasure announces itself» (2026-08-31): a hit flash AT THE SPAWN POINT above the rim
      // while the pile pours. It shows only from SURPRISE_FROM_LEVEL with a bought boost, which is
      // exactly what he had just bought — hence «now». The fish itself, its digging and its bonus
      // are untouched; `HITFX_SPAWN` stays in 70-fx as the kind id of that fx branch.
    }

  // ═══ THE FROZEN ICE BLOCKS (the owner's spec 2026-08-13; the constants are in
  // 00-config). We freeze ONE OF A PAIR of an already created type: the composition
  // of the level and the parity are not touched at all. The key is substituted (the
  // stones technique) — all the pairing mechanics, the hint, the top-up and the
  // charge exclude the ice block AUTOMATICALLY; the original key is stored in
  // frozenKey and is returned when it is broken.
  if (levelNum >= FROZEN_FROM_LEVEL && levelNum >= frozenNextLevel){
    if (items.some(i => i.surprise)){
      // «spread them out over the following levels»: it does not live in the same
      // pile as the treasure
      frozenNextLevel = levelNum + 1;
    } else {
      const byType = {};
      for (const it of items)
        if (it.alive !== false && !it.surprise && !it.bomb && it.type)
          (byType[it.type.name] = byType[it.type.name] || []).push(it);
      // a type is eligible if there are enough copies for N free pairs + the ice block's partner
      const eligible = Object.keys(byType).filter(k => byType[k].length >= FROZEN_PAIRS_N * 2 + 2);
      if (eligible.length){
        const howMany = Math.min(FROZEN_MAX_PER_LEVEL, 1 + (Math.random() < 0.5 ? 1 : 0), eligible.length);
        for (let g = 0; g < howMany; g++){
          const k = eligible.splice(Math.floor(Math.random() * eligible.length), 1)[0];
          const victims = byType[k];
          freezeItem(victims[Math.floor(Math.random() * victims.length)]);
        }
        frozenNextLevel = levelNum +
          (FROZEN_GAP_MIN + Math.floor(Math.random() * (FROZEN_GAP_MAX - FROZEN_GAP_MIN + 1)));
      } else {
        frozenNextLevel = levelNum + 1;  // the pool was not enough — we try the next one
      }
    }
  }
  }
  // WITHOUT a preliminary settling: the fall happens LIVE on the screen
  // (the intro: side view -> fly-around -> top view); the shake-down and the trim
  // are in the intro (tickIntro/finishIntro) or in __game.skipIntro() for tests
  stats = { taps:0, matches:0, misses:0, missRun:0, // missRun: mistakes since the last merge — drives the price ladder (2026-08-24-b)
            shakesUsed:0, adShakesUsed:0, adHintsUsed:0, score:0,
            t0: performance.now(), lastAction: performance.now() };
  // ⚠️ adHints (the cap of videos per hint) is NOT written into the save — this is
  // an anti-dupe: the remainder in Save would be merged by max and the cloud would
  // GIVE BACK an already watched video. The reward (+1 charge) goes into the
  // monotonic pair he/hs — that one is dupe-safe.
  // ⚠️ And it is NOT zeroed on EVERY genLevel, it is tied to the level NUMBER:
  // otherwise «Restart» in the pause (pauseRestart -> genLevel) would refill the
  // cap, and hints for ads would become ENDLESS. The shake does not have this hole
  // — its reward is spent inside the level, and the hint charge is FOR LIFE (he).
  if (adHintLevelNo !== levelNum){ adHintLevelNo = levelNum; adHintCarry = AD_HINTS_PER_LEVEL; }
  // the shakes grow with the level (freeShakesFor in 00-config; the staircase was
  // brought back by the owner's spec 2026-07-30 «raise the shakes»),
  // it used to be a flat 3 and from ~level 15 the stock was not enough for the
  // «dry» episodes
  level = { shakes: freeShakesFor(levelNum), adShakes: AD_SHAKES_PER_LEVEL, adHints: adHintCarry, over:false, stuck:0, autoShakeUsed:false, autoStuck:0, finalRefillDone:false, nextGrind:0, chargeGiven:false, chargeAt:chargeAtFor(levelNum), idleLimit, typesCount, dealtTypes, banked:0, // banked — the level's units banked ahead of time (the watermark)
            topY0: 0, parBase: 0, coinsWon: 0, detectorUsed: false, /* continueUsed gone 2026-09-03 with the ad Continue */
            aliveN0: 0, camFollowOn: false, deadlock: false, // deadlock: a dead end → the rescue grind (99-main)
};
  comboUntil = 0; lastMatchMs = 0; comboCount = 0; comboLevel = 0; chainUntil = 0; chainSeries = 0; chainCarry = 0; // the combo/chain reaction do not survive the level
  missRadiusClear();   // and the miss penalty: a new level starts with the full radius
  chargeName = ''; chargeUntil = 0; // review v212: the type charge does not survive either
  // THE SCATTERING BOWL (prototype v2): the bowl is NEW every level (the owner's
  // decision no. 1) — the cracks are back to zero, the glass and the walls are
  // restored
  // a snapshot of the multipliers at the start of the level — by it the toast
  // decides whether the multiplier HAS GROWN during this run (the owner's word
  // 2026-08-05)
  level.multAtStart = {};
  try { for (const t of TYPES) level.multAtStart[t.name] = accMult(t.name); } catch(e){}
  level.bowlCracks = 0; bowlShattering = false;
  try { restoreBowlVis(); } catch(e){}
  try { ensureWalls(); } catch(e){}
  // the level — otherwise a chip of a foreign type in the new level, a detonation
  // over the new pile after a quick restart and a SECOND charge on top (the level's
  // chargeGiven is fresh)
  Telemetry.ev('level_start', { lv: levelNum });
  wakePhysics('genLevel');
  startIntro();
  // ⛔ refreshAccessibility() STOOD HERE and was removed 2026-08-30: at this point every body
  // is freshly created AND disabled by the wave hold, and Rapier's query pipeline does not see
  // fresh colliders until world.step (the project's own canonical trap at place()) — on Hard
  // every first skyCast hit nothing and the whole result was garbage that happened to be
  // neutral. The honest recomputes stand: finishIntro, finalizeFill and sleepPhysics each run
  // their own full refresh.
  updateHUD();
}
