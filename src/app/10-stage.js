// ===== 10-stage: renderer, camera, light, IBL environment, sky =====
// The owner's reference: threejs.org webgl_batch_lod_bvh (RoomEnvironment + ACES 0.8)
// + webgl_loader_ldraw (RoomEnvironment as the only source of "studio" light).

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
// SAWING IN HALVES (the owner's choice 2026-08-01, sawFX in 70-fx) cuts the model
// WITH A CLIPPING PLANE — without this flag three ignores the material's planes
// and the halves come out as whole items.
renderer.localClippingEnabled = true;
// ⚠️ CONTEXT LOSS = A "CRASH" WITHOUT AN ERROR (docs/METRICS.md §6): on mobile
// the system takes the GPU context away (backgrounding, memory, overheating) — the game
// does not crash, but the screen goes BLACK, and in the stats that would look like an ordinary player exit.
// We catch it with a separate event, otherwise the most frequent 3D failure is invisible.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                       // without this the context will not be restored
  try { Telemetry.err('webgl', 'context lost', '', ''); } catch(_){}
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  try { Telemetry.ev('webgl_restored', {}); } catch(_){}
}, false);
// on phones the DPR cap is 1.5: a frame at DPR2 is ~1.8 times more expensive (audit measurement),
// the HUD is DOM and stays sharp; on desktop we keep 2
const DPR_CAP_TOUCH = 1.5, DPR_CAP_DESK = 2;
function dprCap(){
  if (CFG.perfTier === 'low') return PERF_LOW_DPR;
  return matchMedia('(pointer:coarse)').matches ? DPR_CAP_TOUCH : DPR_CAP_DESK;
}
renderer.setPixelRatio(Math.min(devicePixelRatio||1, dprCap()));
// ⚠️ SWITCHING TO "WEAK" — WITH A SINGLE FUNCTION AND ONLY DOWNWARDS (see 00-config).
// What we reduce and why exactly this:
//  • PIXEL DENSITY 1.5 -> 1.0. The biggest win on a phone and the most
//    honest one: fill grows as the SQUARE of the density, 1.5 against 1.0 is 2.25×
//    the pixels for the same screen. The gameplay does not change at all, only the sharpness.
//  • THREE TIMES FEWER PARTICLES (CFG.fxScale). The match debris is 1280 pieces, this is the
//    heaviest single burst in the game.
// ⚠️ SHADOWS ARE DELIBERATELY ABSENT FROM THE LIST: the measurement showed that in matcap mode
// the shadow pass is ALREADY off (renderer.shadowMap.enabled=false even on a "strong"
// device). Turning off what is already off is a dummy knob, and such knobs already
// had to be thrown out of the project once.
// ⚠️ WE DO NOT TOUCH THE PHYSICS. The number of solver iterations and substeps keeps a dense pile
// from sinking into itself; weakening them would change the BEHAVIOUR of the pile, that
// is the gameplay — on a weak phone the game would become a different game. This is a separate
// decision of the owner, not a silent optimization.
function applyPerfTier(tier){
  if (tier !== 'low' || CFG.perfTier === 'low') return false;
  CFG.perfTier = 'low';
  CFG.fxScale = PERF_LOW_FX;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, dprCap()));
  try { const el = renderer.domElement;   // the canvas's CSS size = the layout viewport (shell.html `#c`)
    renderer.setSize(el.clientWidth || innerWidth, el.clientHeight || innerHeight, false); } catch(e){}
  try { Telemetry.ev('perf_low', { dpr: renderer.getPixelRatio() }); } catch(e){}
  return true;
}
// ⚠️ THE DEVICE HINT — ONLY AS A STARTING HYPOTHESIS, the measurement decides
// anyway. Two cores or 2 GB of memory is a knowingly weak machine, and there is no point
// waiting 3 seconds for proof while dropping frames. Both fields are not available everywhere
// (deviceMemory is missing in Safari) — absence is treated as "we do not know", not as "weak".
function deviceLooksWeak(){
  try {
    const cores = navigator.hardwareConcurrency || 0;
    const mem = navigator.deviceMemory || 0;
    return (cores > 0 && cores <= 2) || (mem > 0 && mem <= 2);
  } catch(e){ return false; }
}
if (deviceLooksWeak()) applyPerfTier('low');
renderer.setClearColor(0xffffff);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8; // as in the webgl_batch_lod_bvh reference
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// the shadow map is redrawn ONLY when something moves (gate in loop):
// the light is static, in a calm scene ~150 shadow draw calls every frame go to waste
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
const scene = new THREE.Scene();
// fog towards "super white" (a colour >1 compensates the ACES darkening) — the edges of the ground melt into white
scene.fog = new THREE.Fog(new THREE.Color(1.5, 1.52, 1.55), 24, 44);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
const camTarget = new THREE.Vector3(0, 4.2, 0);
let camAz = 0.0, camPhi = 0.45, camR = 16.2; // the bowl ×1.15 — the camera is further away
function updateCamera(){
  camera.position.set(
    camTarget.x + camR*Math.sin(camPhi)*Math.sin(camAz),
    camTarget.y + camR*Math.cos(camPhi),
    camTarget.z + camR*Math.sin(camPhi)*Math.cos(camAz)
  );
  camera.lookAt(camTarget);
}

// Lighting: almost everything is done by the IBL environment (RoomEnvironment), the directional
// light is weak and is needed only for the shadows and the relief on the black field
const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(6,14,4);
dl.castShadow = true;
dl.shadow.mapSize.set(1024,1024);
dl.shadow.camera.left = -8; dl.shadow.camera.right = 8;
dl.shadow.camera.top = 13; dl.shadow.camera.bottom = -8;
dl.shadow.camera.near = 2; dl.shadow.camera.far = 38;
dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.03;
scene.add(dl);

// Environment v4 — the "SOFTBOX" (a materials cycle following the owner's complaint: the light
// jumped when the camera rotated). The reason for the jumps: mirror-like materials
// reflected RoomEnvironment — a dark room with BRIGHT rectangular
// "windows"; the reflection slides across the faces and flares up and dies down.
// The softbox is a sphere with a SMOOTH vertical gradient without sharp spots:
// the highlights are stable at any angle. Do NOT bring RoomEnvironment back.
(function buildEnvironment(){
  const env = new THREE.Scene();
  const geo = new THREE.IcosahedronGeometry(30, 4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++){
    const ny = pos.getY(i) / 30; // -1..1
    // bottom — mid grey, horizon — light, zenith — bright (soft overhead light)
    let b;
    if (ny < 0) b = 0.55 + 0.45*(1 + ny);   // -1 -> 0.55, 0 -> 1.0
    else b = 1.0 + 1.6*ny*ny;               // 0 -> 1.0, 1 -> 2.6
    colors[i*3] = b; colors[i*3+1] = b; colors[i*3+2] = b*1.02; // barely cold
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  env.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  geo.dispose(); mat.dispose(); // the softbox is baked into the PMREM — the GPU sources are no longer needed
})();

// ===== MATCAP — "baked light" (A/B prototype, the owner's spec 2026-07-20) =====
// The normal in VIEW space -> a texture pixel: the light and the finish of the material
// are baked in advance. The highlight physically CANNOT jump when the camera rotates
// (a historical complaint of the owner) — there is nothing left to jump.
// RGB is the diffuse: the shader MULTIPLIES it by material.color, so candyColor and
// the grey veil of unavailability keep working without a single edit.
// ALPHA is the white highlight, it is added ON TOP (see matcapSpecPatch): a purely
// multiplicative matcap paints the highlight in the colour of the item, and the plastic goes matte.
// ⚠️ DataTexture, and NOT CanvasTexture: the canvas premultiplies RGB by alpha, and
// the diffuse would go out everywhere except the highlight spot.
// ⚠️ CALIBRATION (iteration 2 from the screenshots): the texture is marked sRGBEncoding, and
// the middle of the scale goes into linear TWICE as dark (0.5 sRGB ≈ 0.21 linear) —
// the first tuning (amb 0.34) gave a dark heavy pile, and a wide highlight (shin 20,
// spec 0.60) sat on the balls as a white blob. We keep the body in 0.66-0.94 sRGB,
// the highlight narrow and weak (a spark, not a spot).
const MATCAP_PRESETS = {
  // soft gloss — the character of the v4 materials (metalness 0, roughness 0.18)
  soft:  { amb: 0.66, sky: 0.28, diff: 0.20, shin: 60, spec: 0.22, rim: 0.14, rimP: 3 },
  // metal for the cubes: a lower body, a wider highlight, a strong rim. The colour of the item in
  // the matcap branch is LIGHTENED (40-items): with MeshStandard the cubes were held by the reflection
  // of the environment (metalness 1), and a multiplier of dark graphite would have gone to black.
  metal: { amb: 0.44, sky: 0.34, diff: 0.30, shin: 34, spec: 0.50, rim: 0.42, rimP: 3 },
  // ⚠️ FOR MODELS WITH A NATIVE TEXTURE — an almost white body. The shader MULTIPLIES
  // the matcap by the texture, so the usual preset (body 0.66-0.94) darkened
  // the authored colours: next to the reference GLTFLoader the tiger came out dark ginger
  // instead of fawn, the pig crimson instead of pale pink. Here the matcap
  // is responsible only for a soft shaping of the form, the colour is entirely up to the atlas.
  // ⚠️ THERE WAS an additive lift of 0.20 — REJECTED by the owner ("everything is far too
  // light"). It added white TO EVERYTHING, including the dark places: the tiger's black
  // stripes and the panda's fur became grey, the contrast died. The brightness of the
  // textured models is now raised by MULTIPLICATION (TEX_GAIN) — it
  // preserves the ratio of dark to light. Do not bring the additive back.
  tex:   { amb: 0.88, sky: 0.08, diff: 0.10, shin: 60, spec: 0.12, rim: 0.10, rimP: 3 },
};
const matcapCache = new Map();
// the key light; the view is along +Z, the half vector for Blinn.
// AN OBJECT, and not three consts: the tuner (matcapTuner) edits it on the fly, and the light
// is SHARED by all presets — changing the direction re-bakes all of them.
// ⚙️ Lx 0 — THE OWNER'S CHOICE 2026-08-03 (he turned the knobs in the panel himself and sent it
// as a screenshot: "take these matcap parameters"). The light was from above-LEFT-front,
// it became from above-IN THE CENTRE-front.
// ⚠️⚠️ THIS IS THE ONLY SOURCE OF THE KEY LIGHT DIRECTION IN THE GAME.
// The shards (70-fx) NO LONGER keep their own copy — they read from here through
// syncShardLight(). There used to be two copies, and an edit by the owner in the panel
// silently split the lighting in two: the pile was lit the new way, its own debris
// the old way. You change the light — you change it HERE, the rest follows on its own.
const MATCAP_LIGHT = { x: 0, y: 0.60, z: 0.72 };
const MATCAP_SIZE = 128;
// Baking the pixels of a preset into a ready buffer. Extracted from makeMatcap so that
// the tuner can re-bake a preset INTO THE SAME DataTexture: the materials hold a reference to
// the texture, its object must not be swapped — only the contents + needsUpdate.
function bakeMatcap(P, data){
  const S = MATCAP_SIZE;
  const Lx = MATCAP_LIGHT.x, Ly = MATCAP_LIGHT.y, Lz = MATCAP_LIGHT.z;
  const hl = Math.hypot(Lx, Ly, Lz + 1);
  const Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl;
  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      let nx = (x + 0.5) / S * 2 - 1;
      // ⚠️ The review of 2026-07-21 found the sign of ny debatable (a V inversion against
      // the matcap convention is possible). Do NOT "fix" it in passing: all the presets are CALIBRATED
      // by the owner for the current sign (the light from above looks right) — change it
      // only together with a re-bake of the presets and A/B screenshots.
      let ny = 1 - (y + 0.5) / S * 2;          // the texture's v grows downwards
      const r2 = nx * nx + ny * ny;
      // beyond the circle we keep the value of the edge — filtering does not drag the black in
      if (r2 > 1){ const k = 1 / Math.sqrt(r2); nx *= k; ny *= k; }
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
      // the environment = our own softbox: duller at the bottom, brighter towards the zenith
      const amb = P.amb + P.sky * (ny * 0.5 + 0.5);
      const lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      // the fresnel rim: the silhouette is lighter — the items do not stick together in a dense pile
      const rim = P.rim * Math.pow(1 - nz, P.rimP);
      const v = Math.min(1, amb + P.diff * lam + rim);
      const sp = Math.min(1, Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), P.shin) * P.spec);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = (v * 255) | 0;
      data[i + 3] = (sp * 255) | 0;
    }
  }
}
function makeMatcap(kind){
  if (matcapCache.has(kind)) return matcapCache.get(kind);
  const S = MATCAP_SIZE, data = new Uint8Array(S * S * 4);
  bakeMatcap(MATCAP_PRESETS[kind] || MATCAP_PRESETS.soft, data);
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = tex.minFilter = THREE.LinearFilter; // mips are not needed — the texture is screen sized
  tex.needsUpdate = true;
  matcapCache.set(kind, tex);
  return tex;
}
// ═══ MATCAP PER PACK (the owner's word 2026-08-17-k: "matcaps per pack") ═══
// ⚠️⚠️ COPYING ON DEMAND, AND THIS IS LOAD-BEARING. As long as a pack has not been given ITS OWN
// image, it returns the SHARED texture of the preset — the same object as
// before. That means by default not a single pixel changes, not a single byte
// of the build and not a single draw call: the split costs exactly as much as the number of
// images the owner actually brings.
// ⚠️ WHY THIS IS CHEAP: the material of an item is created PER TYPE anyway
// (`itemMaterial`), and every type has its own geometry — that is, the pairs
// "geometry+material" differed even without us, and a per-pack matcap adds no extra
// draw calls. Verified by measurement, not by reasoning.
const packMatcaps = new Map();   // pack name → its own texture
function packMatcap(pack, base){
  const own = pack && packMatcaps.get(pack);
  return own || base;
}
// Registering a pack's own image + a LIVE switch of the already created
// materials: they hold a REFERENCE to the texture, so a mere pixel swap
// (the `retuneMatcap` trick) is not enough here — a new object is needed in the `matcap` field.
function setPackMatcap(pack, tex){
  if (!pack) return false;
  if (tex) packMatcaps.set(pack, tex); else packMatcaps.delete(pack);
  // ⚠️⚠️ A PACK'S DEFAULT IS ITS OWN IMAGE, NOT THE SHARED PRESET, AND THIS IS NOT COSMETICS.
  // The RESET from the editor (`mceReset`) also arrives here, and since 2026-08-18 the vehicles and
  // the food have their OWN matcap (08-matcap-packs). Had we given them the shared preset — the live
  // items would have gone back to it, while newly spawned ones would take the image
  // from `itemMaterial`: ONE PACK WOULD HAVE SPLIT IN TWO WITHIN A SINGLE SCENE.
  // A measurement on a merged build WITHOUT this line: after a reset 0 vehicles out of 14 matched a fresh
  // spawn; with it — 14 out of 14 on all three measurements.
  // ⚠️ A merge-only state: neither the registry nor the image layer could create it on their own —
  // that is exactly why it was absent from both implementations.
  return packMatcapRepoint(pack);
}
// ⚠️⚠️ THE ONLY PLACE WHERE THE RULE "WHAT A PACK WEARS" LIVES. The selection used to be
// written out in two loops, and the analysis of 2026-08-19 showed the price: in the live loop
// `paint` was forgotten, and "Apply" on the target "pack: bricks" moved the matcap onto
// live bricks, which `itemMaterial` NEVER gave it to (40-items: painted ones have matcap 'soft',
// their atlas is white and the colour is carried by `material.color`) —
// the old bricks ended up on the drawn canvas, and a fresh spawn on 'soft'.
// One selection for both lists: there is nothing left to diverge.
// ⚠️ THE TIERS ARE THE SAME AS IN `itemMaterial`: an editor edit (the registry) overrides
// the pack's image, and that overrides the shared preset. Giving the shared preset to a pack WITH AN IMAGE
// means splitting it in two within a single scene (measurement 2026-08-18: 0 vehicles out of 14).
function packMatcapAim(pack){
  return packMatcaps.get(pack) || packMatcapTex(pack) || makeMatcap('tex');
}
// Move a pack onto the texture it is obliged to wear RIGHT NOW, and
// drop the portrait snapshots. Called from everywhere the texture OBJECT ITSELF has
// CHANGED: `setPackMatcap` (the editor's registry) and `packMatcapLoad` (the birth of an
// image for a pack that did not have one built in).
// ⚠️⚠️ PORTRAITS ARE SEPARATE ITEMS WITH THEIR OWN MATERIAL, and without them dropping the
// snapshots is pointless: `thumbItemForKey` (85-hud) holds the portrait item
// forever, it is not in `items`. We would have re-shot with the same old material — the collection
// card would lie until a reload (the defect "stale portraits", the owner's word
// 2026-08-19 "fix it").
function packMatcapRepoint(pack){
  if (!pack) return 0;
  const aim = packMatcapAim(pack);
  const lists = [];
  try { if (typeof items !== 'undefined' && items) lists.push(items); } catch (e) {}
  try { if (typeof thumbItemsOfPack === 'function') lists.push(thumbItemsOfPack(pack)); } catch (e) {}
  let touched = 0;
  for (const list of lists){
    for (const it of list){
      // ⚠️ `paint` is the rule of `itemMaterial` (40-items:72), not a nitpick:
      // painted ones are not entitled to a pack matcap at all
      if (!it || !it.type || it.type.tex !== pack || it.type.paint || !it.mesh) continue;
      const m = it.mesh.material;
      if (!m || !('matcap' in m)) continue;
      // ⚠️ THROUGH THE SINGLE RULE, NOT THROUGH `aim`: since 2026-08-25-b a TYPE may carry its
      // own override, and it beats the pack's. Reading `aim` here would have wiped a per-object
      // matcap the moment anything touched its pack — the classic «two writers of one field».
      m.matcap = itemMatcapAim(it.type); touched++;
    }
  }
  // ⚠️⚠️ THE PORTRAIT SNAPSHOTS WENT STALE. The previous line called `thumbCache.clear()`, but
  // `thumbCache` is an OBJECT (`const thumbCache = {}` in 85-hud), not a Map: the call
  // threw a TypeError, which its own `try/catch` swallowed, and the editor NEVER reset the
  // portraits. Found by the analysis of the merge on 2026-08-18.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
  return touched;   // ⚠️ we count BOTH the live ones AND the portraits: both are items of the pack
}
// ═══ THE PER-OBJECT TIER (the owner's word 2026-08-25-b: «show a list of objects, so that I
// could add its own matcap not to a GROUP but to EACH one») ═══
// ⚠️⚠️ IT IS A FOURTH TIER ON TOP OF THE THREE THAT ALREADY EXISTED, AND IT IS EMPTY BY DEFAULT —
// so by default not a single byte of the picture changes. The order is: TYPE override → pack
// override (the editor's registry) → the pack's own image → the shared preset.
// ⚠️ THE KEY IS `type.name` (`foodbanana`, `animalcrab`) and NOT the item's `key`: the latter is
// `'T' + typeIdx`, an index into the pool that MOVES the moment the owner adds or cuts a model —
// an override pinned to it would silently land on a different object after the next batch.
const typeMatcaps = new Map();   // type name → its own texture
// ⛔⛔ THE ONLY PLACE WHERE THE RULE «WHAT AN ITEM WEARS» LIVES. It used to be written out inside
// `itemMaterial` (40-items) and read back through `packMatcapAim` in the repoints — two copies of
// one selection, and this project has already paid for exactly that shape once (2026-08-19: the
// live loop forgot `paint`, and «Apply» moved a matcap onto bricks that `itemMaterial` never gave
// it to). Both callers go through here now.
function itemMatcapAim(t){
  if (!t) return makeMatcap('soft');
  const own = t.name && typeMatcaps.get(t.name);
  if (own) return own;
  // ⚠️⚠️ t.mk — A PER-TYPE MATCAP DECLARED IN SOURCE, AND IT EXISTS BECAUSE THE TIER ABOVE IT
  // DOES NOT SHIP. `typeMatcaps` is filled only by `setTypeMatcap`, i.e. by the matcap editor,
  // and it is a runtime Map: whatever is picked there is gone on reload. A type that must wear
  // its own matcap in the BUILD had nowhere to say so.
  // ⚠️ It sits BELOW the editor's override on purpose — the editor must still win while the
  // owner is picking — and ABOVE the pack, because it is the narrower statement.
  if (t.mk) return makeMatcap(t.mk);
  return (t.tex && !t.paint)
       ? packMatcap(t.tex, packMatcapTex(t.tex) || makeMatcap('tex'))
       : makeMatcap(t.mat === 'chrome' ? 'metal' : 'soft');
}
// Registering ONE type's own texture + a live repoint. Same contract as `setPackMatcap`:
// `tex === null` removes the override and the type falls back to its pack's rule.
function setTypeMatcap(name, tex){
  if (!name) return 0;
  if (tex) typeMatcaps.set(name, tex); else typeMatcaps.delete(name);
  return typeMatcapRepoint(name);
}
function typeMatcapRepoint(name){
  if (!name) return 0;
  const lists = [];
  try { if (typeof items !== 'undefined' && items) lists.push(items); } catch (e) {}
  try { if (typeof thumbItemsOfType === 'function') lists.push(thumbItemsOfType(name)); } catch (e) {}
  let touched = 0;
  for (const list of lists){
    for (const it of list){
      if (!it || !it.type || it.type.name !== name || !it.mesh) continue;
      const m = it.mesh.material;
      if (!m || !('matcap' in m)) continue;
      m.matcap = itemMatcapAim(it.type); touched++;
    }
  }
  // ⚠️ The portraits are separate items and `itemThumb` holds the finished PNG forever — the same
  // reason the pack repoint drops the snapshots. Without this the collection card lies until a reload.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
  return touched;   // live items AND portraits of this type
}
// Re-baking the already handed out textures (the tuner). kind not given — all at once: the light
// is shared, moving it changes every preset. The materials do NOT need to be touched — they
// reference the same texture object, needsUpdate uploads the new pixels
// to the GPU. (material.needsUpdate is a shader recompile, superfluous here.)
function retuneMatcap(kind){
  matcapCache.forEach((tex, k) => {
    if (kind && k !== kind) return;
    bakeMatcap(MATCAP_PRESETS[k] || MATCAP_PRESETS.soft, tex.image.data);
    tex.needsUpdate = true;
  });
  // ⚠️⚠️ THE FIFTH WRITER OF PIXELS — AND IT TOO IS OBLIGED TO DROP THE SNAPSHOTS. The materials
  // do NOT need to be moved here (the object is the same), but `itemThumb` (85-hud) holds the
  // ready PNG forever: the live pile changes in the same frame, while the collection cards
  // stay on the old snapshots until a reload. The preset-based types suffer —
  // painted ('soft'), chrome ('metal') and packs WITHOUT their own image ('tex').
  // Found by the analysis of 2026-08-19; the paths here are the tuner sliders (`matcapTuner`
  // below) and `mceReset`.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
}
// ── DEBUG TUNER OF THE PRESETS (the owner's request 2026-07-22: "I want to tune
// the values visually with sliders"). It opens ONLY from the console —
// __game.matcapTuner(); a repeated call closes it. It writes nothing into the code or the save:
// the owner takes the values with the Copy button and sends them to us.
// ⚠️ The tuner changes ONLY the numbers of the presets and the direction of the light within the current
// convention. It does not touch the sign of ny (see the warning in bakeMatcap).
const MATCAP_TUNE = [                    // name, min, max, step (0 = log scale)
  ['amb',  0,   1,    0.01],
  ['sky',  0,   0.8,  0.01],
  ['diff', 0,   1,    0.01],
  ['shin', 2,   256,  0],
  ['spec', 0,   1.5,  0.01],
  ['rim',  0,   1,    0.01],
  ['rimP', 1,   8,    0.1],
];
const MATCAP_KINDS = ['soft', 'metal', 'tex'];
let matcapPanel = null;
function matcapTuner(){
  if (matcapPanel){ matcapPanel.remove(); matcapPanel = null; return 'matcap tuner: closed'; }
  const p = matcapPanel = document.createElement('div');
  p.id = 'matcapTuner';
  // z 21 — ABOVE the overlays (20): a debug panel must not become unreachable
  // if the pause opens on top of it. Below fatal (99).
  p.style.cssText = 'position:fixed; right:10px; top:10px; z-index:21; width:274px;'
    + ' max-height:calc(100vh - 20px); overflow:auto; pointer-events:auto;'
    + ' background:rgba(15,20,30,.96); color:#dfe6f2; border-radius:10px; padding:10px 12px;'
    + ' font:12px/1.35 ui-monospace,Menlo,monospace; box-shadow:0 6px 24px rgba(0,0,0,.45);';
  // 90-input listens for keydown ON THE WINDOW (Space = shake): without this the arrows and
  // the space bar on a focused slider would fly off into the game.
  p.addEventListener('keydown', e => e.stopPropagation());

  // the re-bake is gated by the frame: dragging a slider gives dozens of
  // input events, while one bake per frame is enough for us (3 presets ≈ 1-2 ms)
  const pending = new Set(); let raf = 0;
  const queue = kind => {
    pending.add(kind);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pending.has(null)) retuneMatcap(null);
      else pending.forEach(k => retuneMatcap(k));
      pending.clear();
    });
  };
  const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(2);
  const head = (t, sub) => {
    const h = document.createElement('div');
    h.style.cssText = 'margin:9px 0 3px; color:#7fd1ff; letter-spacing:.04em;';
    h.textContent = t + (sub ? '  ' + sub : '');
    p.appendChild(h);
  };
  const row = (label, o) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:grid; grid-template-columns:36px 1fr 40px; gap:6px; align-items:center; margin:2px 0;';
    const lab = document.createElement('span'); lab.textContent = label; lab.style.opacity = '.7';
    const inp = document.createElement('input');
    inp.dataset.mc = o.id;               // the slider's address for the suite
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step;
    inp.value = o.get(); inp.style.cssText = 'width:100%; accent-color:#7fd1ff;';
    const out = document.createElement('span'); out.style.textAlign = 'right';
    const show = () => { out.textContent = fmt(o.txt()); };
    show();
    inp.addEventListener('input', () => { o.set(parseFloat(inp.value)); show(); });
    r.append(lab, inp, out); p.appendChild(r);
  };

  const title = document.createElement('div');
  title.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  title.innerHTML = '<b>matcap tuner</b>';
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none; border:0; color:#dfe6f2; font-size:18px; cursor:pointer; line-height:1;';
  close.onclick = () => matcapTuner();
  title.appendChild(close); p.appendChild(title);

  head('light', '(shared by all presets)');
  ['x', 'y', 'z'].forEach(ax => row('L' + ax, {
    id: 'light.' + ax, min: -1, max: 1, step: 0.01,
    get: () => MATCAP_LIGHT[ax], txt: () => MATCAP_LIGHT[ax],
    set: v => { MATCAP_LIGHT[ax] = Math.round(v * 100) / 100; queue(null); },
  }));

  // THE VEIL OF THE UNAVAILABLE (Hard). The sliders are needed exactly live: "how much to dim"
  // is a matter of taste, and it cannot be decided on a static screenshot. The checkbox shows the
  // veil ON THE WHOLE PILE, otherwise the effect is barely visible: the unavailable ones are exactly
  // those who do NOT see the sky, that is they are covered by an upper layer from the camera itself.
  head('veil', '(the unavailable ones in Hard)');
  row('light', { id: 'veil.light', min: 0, max: 1, step: 0.01,
    get: () => uVeilTune.value.x, txt: () => uVeilTune.value.x,
    set: v => { uVeilTune.value.x = Math.round(v * 100) / 100; } });
  row('lift', { id: 'veil.lift', min: 0, max: 1, step: 0.01,
    get: () => uVeilTune.value.y, txt: () => uVeilTune.value.y,
    set: v => { uVeilTune.value.y = Math.round(v * 100) / 100; } });
  const prev = document.createElement('label');
  prev.style.cssText = 'display:flex; gap:6px; align-items:center; margin:2px 0 0; opacity:.75; cursor:pointer;';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.mc = 'veil.preview';
  cb.onchange = () => veilAllItems(cb.checked ? 1 : null);
  prev.append(cb, document.createTextNode('show on all'));
  p.appendChild(prev);

  // THE BRIGHTNESS AND CONTRAST OF THE TEXTURED MODELS + THE DEPTH OF THE PILE (the owner's request
  // 2026-08-02 "make the objects a bit lighter"). ⚠️ THESE ARE THE MAIN BRIGHTNESS KNOBS,
  // and until now they were NOT in the panel: the owner would have been turning presets, which have
  // a completely different role. `tex.amb` must not be raised above ~0.9 — the shader MULTIPLIES
  // the matcap by the atlas, and the authored colours wash out; the brightness is raised
  // by MULTIPLICATION through gain, it preserves the ratio of dark to light
  // (the additive lift has already been rejected by the owner: "everything is far too light").
  // ⚠️ uTune is a PER-MATERIAL uniform (every item has its own), so the
  // slider walks the live materials rather than writing into a shared object. We edit only
  // those whose gain differs from 1: those are exactly the textured models.
  head('brightness', '(textured models + depth)');
  const eachTune = (fn) => {
    for (const it of items){
      const sh = it.mesh && it.mesh.material && it.mesh.material.userData
        && it.mesh.material.userData.shader;
      if (sh && sh.uniforms && sh.uniforms.uTune) fn(sh.uniforms.uTune.value);
    }
  };
  let texGain = TEX_GAIN, texContrast = TEX_CONTRAST;
  row('gain', { id: 'tex.gain', min: 0.85, max: 1.30, step: 0.01,
    get: () => texGain, txt: () => texGain,
    set: v => { texGain = Math.round(v * 100) / 100;
      eachTune(t => { if (t.x !== 1) t.x = texGain; }); } });
  row('contr', { id: 'tex.contrast', min: 1.00, max: 1.30, step: 0.01,
    get: () => texContrast, txt: () => texContrast,
    set: v => { texContrast = Math.round(v * 100) / 100;
      eachTune(t => { if (t.y !== 1) t.y = texContrast; }); } });
  row('bottom', { id: 'depth.min', min: 0.40, max: 1.00, step: 0.01,
    get: () => uDepthTint.value.x, txt: () => uDepthTint.value.x,
    set: v => { uDepthTint.value.x = Math.round(v * 100) / 100; } });

  for (const kind of MATCAP_KINDS){
    const tex = matcapCache.get(kind);
    let used = 0;
    if (tex) scene.traverse(o => { if (o.material && o.material.matcap === tex) used++; });
    // the counter honestly says what the slider will move: 'metal' currently has no
    // consumers (the chrome primitives were removed from the pool) — otherwise the owner would
    // move it and think the tool is broken
    head(kind, used ? '— ' + used + ' objects' : '— NOT used right now');
    const P = MATCAP_PRESETS[kind];
    for (const [name, min, max, step] of MATCAP_TUNE){
      if (step) row(name, {
        id: kind + '.' + name, min, max, step,
        get: () => P[name], txt: () => P[name],
        set: v => { P[name] = Math.round(v * 100) / 100; queue(kind); },
      });
      // shin is the Blinn exponent: on a linear scale the whole useful part
      // (2..60) sits in the first quarter of the slider, further along nothing
      // visually changes. That is why the slider walks along a logarithm.
      else row(name, {
        id: kind + '.' + name, min: Math.log(min), max: Math.log(max), step: 0.001,
        get: () => Math.log(P[name]), txt: () => P[name],
        set: v => { P[name] = Math.round(Math.exp(v)); queue(kind); },
      });
    }
  }

  const foot = document.createElement('div');
  foot.style.cssText = 'margin-top:10px; display:flex; gap:8px; align-items:center;';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText = 'background:#2b6ea8; border:0; color:#fff; padding:5px 12px; border-radius:6px; cursor:pointer; font:inherit;';
  const note = document.createElement('span'); note.style.opacity = '.65';
  note.textContent = 'reload = rollback';
  copy.onclick = () => {
    const s = '{\n  "light": ' + JSON.stringify(MATCAP_LIGHT)
      + ',\n  "veil": { "light": ' + uVeilTune.value.x + ', "lift": ' + uVeilTune.value.y + ' }'
      + ',\n  "tex": { "gain": ' + texGain + ', "contrast": ' + texContrast
        + ' }, "depthMin": ' + uDepthTint.value.x
      + ',\n  "presets": {\n'
      + MATCAP_KINDS.map(k => '    "' + k + '": ' + JSON.stringify(MATCAP_PRESETS[k])).join(',\n')
      + '\n  }\n}';
    console.log('[matcap]\n' + s);
    const done = t => { note.textContent = t; };
    // the clipboard may be unavailable (file://, permission denied) — the console is always there
    if (navigator.clipboard) navigator.clipboard.writeText(s).then(() => done('copied'), () => done('console only'));
    else done('console only');
  };
  foot.append(copy, note); p.appendChild(foot);
  document.body.appendChild(p);
  return 'matcap tuner: opened (a repeated call will close it)';
}
// ⚠️ MeshMatcapMaterial has NO emissive, while the highlight of the hint (hintPulse) and
// of the "scope" (scopePulse) in 80-gameplay write mat.emissive/emissiveIntensity
// directly — without these stubs the Hint button crashed with a TypeError on setHex.
// (test.js does NOT COVER the hint — caught by a separate probe; if you are going to
// edit this branch, check Hint by hand.)
// Nothing needs to be computed: as soon as a material gets .emissive, three
// itself writes emissive × emissiveIntensity into the `emissive` uniform
// (refreshUniformsCommon). Our job is to DECLARE that uniform in the matcap shader,
// otherwise three crashes on undefined.value in the very first frame (and it did).
function addMatcapEmissive(mat){
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 0;
}
// The highlight from the alpha + emissive — on top of the multiplication. The function is ONE for all materials,
// so the program cache (keyed by onBeforeCompile.toString()) gives ONE
// compiled shader for all 181, not 181 of them.
const matcapSpecPatch = function (sh) {
  sh.uniforms.emissive = { value: new THREE.Color(0x000000) };
  // BRIGHTNESS and CONTRAST are the owner's knobs, they live in 00-config. The uniform is per
  // material (three stores uniforms per-material), but the shader SOURCE is
  // identical, so the program is still compiled ONCE for all of them.
  // Ordinary items get (1,1) — that is the identity transform.
  const tune = this.userData && this.userData.texTune;
  sh.uniforms.uTune = { value: new THREE.Vector2(
    tune ? TEX_GAIN : 1.0, tune ? TEX_CONTRAST : 1.0) };
  // THE VEIL OF UNAVAILABILITY — its own uniform per material, tickVeil turns it.
  // ⚠️ We put the reference to the shader into userData: onBeforeCompile is called ONCE,
  // while the veil changes every frame — otherwise the uniform would be out of reach.
  sh.uniforms.uVeil = { value: 0 };
  this.userData.shader = sh;
  // THE DEPTH OF THE PILE instead of shadows (step 2 of the package). The shadows are off — matcap does not
  // receive them — and the volume still has to be shown somehow. World height is more honest here
  // than a screen shadow: it coincides with the gameplay notion of "how deeply an item is buried",
  // that is it works for the game, not only for the picture. Two instructions in
  // the shader, zero work in JS per frame.
  // The constants are baked in as LITERALS, not as uniforms: the source comes out
  // identical for all materials -> the program cache keyed by onBeforeCompile.toString()
  // still gives ONE compiled shader for all 181.
  const n = (x) => x.toFixed(3);
  sh.uniforms.uPileTop = uPileTop;   // ONE object for all materials
  sh.uniforms.uDepth = uDepthTint;
  sh.uniforms.uVeilTune = uVeilTune;
  sh.uniforms.uVeilCol = uVeilCol;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
    .replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>',
      '#include <common>\nuniform vec3 emissive;\nuniform float uPileTop;\nuniform vec2 uTune;\nuniform vec2 uDepth;\nuniform float uVeil;\nuniform vec2 uVeilTune;\nuniform vec3 uVeilCol;\nvarying float vWorldY;')
    .replace(
      'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',
      'float dk = clamp( ( vWorldY - uPileTop + uDepth.y ) / uDepth.y, 0.0, 1.0 );\n'
      + '\tdk = uDepth.x + ( 1.0 - uDepth.x ) * dk;\n'
      // ⚠️ Only the diffuse is dimmed by the depth. We do not touch the highlight and the hint
      // glow: otherwise the bottom of the pile turns into a black mush where neither
      // the silhouettes nor what is highlighted can be made out.
      + '\tvec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb * dk'
        + ' + vec3( matcapColor.a ) + emissive;\n'
      // brightness — by MULTIPLICATION (the contrast is intact), then the contrast around the midpoint
      + '\toutgoingLight *= uTune.x;\n'
      + '\toutgoingLight = ( outgoingLight - ' + n(TEX_PIVOT) + ' ) * uTune.y + ' + n(TEX_PIVOT) + ';\n'
      // the veil — VERY LAST, over the already finished colour: we desaturate it into
      // luminance and lift it towards a light grey. Three instructions and without
      // branching — at uVeil=0 this is the identity, the available ones pay nothing.
      + '\tfloat vLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );\n'
      // ⚠️ IT WAS: desaturation into GREY and a lift towards the same grey. It BECAME: the desaturated
      // luminance is TINTED into uVeilCol and lifted towards a light tone of the same colour.
      // The shape of the expression is the same — at uVeil=0 it is still the identity, the available
      // items pay nothing.
      // ⚠️ THE COMMENT MUST STAND ABOVE THE "+", AND NOT AFTER IT: `X + // …` gives
      // `X + (+'string')`, a unary plus on a string is NaN, and instead of code
      // the string "NaN" travels into the shader. The items then simply stop being drawn, and the
      // console stays silent — I lost two runs on this.
      + '\toutgoingLight = mix( outgoingLight, mix( vec3( vLum ) * uVeilCol, uVeilCol * uVeilTune.x, uVeilTune.y ), uVeil );'
    );
  // a guard for the anchor string: a replace on a non-existent anchor SILENTLY does
  // nothing (a change of the three version) — the depth/highlight/hint would have fallen off quietly
  if (sh.fragmentShader.indexOf('uPileTop') < 0)
    console.warn('the matcap patch was NOT applied: the three anchor string has changed (10-stage matcapSpecPatch)');
};
// The top of the pile for the tinting. ONE shared uniform object: we updated .value —
// all 181 materials updated at once, without traversing the scene.
const uPileTop = { value: FUNNEL.H };
// Depth: x — how many times darker the bottom gets, y — how far below the top of the pile
// that minimum is reached. ONE object for all materials, which is why it can be turned
// on the fly (both in the game and in comparison runs) without a rebuild.
const uDepthTint = { value: new THREE.Vector2(DEPTH_TINT_MIN, DEPTH_TINT_RANGE) };
// The strength of the veil — ONE shared object for all materials (like uPileTop/uDepth):
// the shader source does not change because of it, the program is still compiled
// once for all 183. x = the target light grey, y = the fraction of the lift towards it.
const uVeilTune = { value: new THREE.Vector2(VEIL_LIGHT, VEIL_LIFT) };
// ⚠️ THE COLOUR OF THE VEIL IS IN LINEAR SPACE: the patch edits outgoingLight BEFORE
// the tone mapping, so raw sRGB here would give an over-lightened tone.
const uVeilCol = { value: new THREE.Color(VEIL_TINT).convertSRGBToLinear() };
// The depth tick: the top of the pile creeps down as it is dismantled, so we drive it
// SMOOTHLY (a lerp) — a jump in height would repaint the whole pile at once.
// Called from loop in 99-main (WORKSTREAMS allows adding your own tick).
function tickDepthTint(dt){
  if (!CFG.matcap || !items) return;
  let top = 0;
  // ⚠️ ONLY OVER THE PILE BELOW THE RIM — the ones flying above are NOT COUNTED.
  // The owner's bug 2026-07-21: "in turbo the lighting changes, the models get darker".
  // In turbo (the fever) chainRefill tops the pile up with items from a height of ~13, and the maximum
  // over ALL the live ones jumped up there too — the whole settled mass fell
  // below the tinting range and went out to DEPTH_TINT_MIN all at once. The same thing
  // hit in the intro too, where the entire column falls from above.
  // The same guard stands in chainRefill for the same reason (it was choking the refill pace).
  // ⚠️ NOT THE MAXIMUM, BUT A PERCENTILE. The maximum is a fragile quantity: a single item
  // that bounced higher than the rest (a refill in turbo, a shake, a freshly fallen one) dragged
  // the REFERENCE up, and the whole pile went out to DEPTH_TINT_MIN at once. The 85th percentile
  // does not react to a couple of stragglers, yet it genuinely catches the growth of the pile.
  const tops = [];
  for (const it of items){
    if (it.alive && !it.surprise && it.p.y < FUNNEL.H) tops.push(it.p.y + it.r);
  }
  if (!tops.length) return;
  tops.sort((a, b) => a - b);
  top = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.85))];
  // THE LERP IS SLOW (~1.2 s, it was 0.25): a short burst of refilling must not
  // manage to repaint the pile — over a level the reference will get where it needs to anyway.
  const k = Math.min(1, dt * 0.8);
  uPileTop.value += (top - uPileTop.value) * k;
}
// matcap items do NOT RECEIVE shadows (the material is unlit) — which means the shadow
// pass would draw a map with nobody to show it to. Measurement: the pass DOUBLES the
// draw calls (136 -> 265 on level 1), so in this mode it is off.
if (CFG.matcap) renderer.shadowMap.enabled = false;

// TIME OF DAY — a single point for the sky and the fever.
// ⚠️ THE BOUNDARIES FOLLOW THE OWNER'S SPEC 2026-07-31: "day until 20:00, night from 20:00".
// He did not touch the morning boundary — the result is DAY 5–20, NIGHT 20–5. The number is moved
// into SKY_NIGHT_FROM (00-config): isNightSky in 85-hud is OBLIGED to read it too, otherwise
// from 20 to 5 the sky and the theme of the buttons will diverge.
// ⚠️ THE FORCE HOOK `?hour=N` (a request from the INTERFACE through the dispatcher): without it THREE
// theme features (the theme of the showcase, ⛔ the Shake inversion — REMOVED 2026-08-21 together with
// the button's backplate, see the tombstone in 85-hud, the rule for the colour of the buttons) are
// unverifiable in the suite — they had to be tested by substituting Date. The hook reads
// location.search BEFORE the first frame, because both the sky and the ramp are computed ONCE
// at load. Garbage and values outside 0..23 are ignored silently — this is a debug
// knob, the game must not crash because of it.
function skyHourNow(){
  let h = 12; try { h = new Date().getHours(); } catch(e){}
  try {
    const q = new URLSearchParams(location.search).get('hour');
    if (q !== null && q !== ''){ const f = Number(q); if (Number.isFinite(f) && f >= 0 && f <= 23) h = Math.floor(f); }
  } catch(e){}
  return h;
}
// ⛔⛔ DAY ONLY, ALWAYS — THE OWNER'S WORD 2026-08-20 ("leave only the day
// theme always"). The hour is still computed honestly (`skyHourNow` and the force hook
// `?hour=N` are alive — there is a guard on them), but the DECISION here is a single one.
// ⚠️ The night palette `SKY_STOPS.night`, `FEVER_NIGHT` and all the `html.night` rules
// ARE LEFT IN PLACE and not deleted: this is a matter of the owner's taste, and he comes back
// to such things. Unreachable — yes; broken — no.
// ⚠️ THE SECOND HALF OF THE RULE IS `isNightSky` (85-hud). If those two diverge —
// the sky will become the day one while the buttons are on the night theme; the guard
// "DAY ONLY" stands on their agreement (it is the former boundary guard, which moved together with the rule).
function skyTimeNow(){
  return 'day';
}
// The sky WITHOUT A PICTURE: the multi-stop palette of the current time of day (SKY_STOPS).
// Computed ONCE at load — as the choice of the panorama used to be.
// ⚠️⚠️ THE PARSING OF THE STOPS IS ONE FOR ALL CONSUMERS. A stop arrives either as a bare
// hex (`'#ccfff8'`), or WITH A POSITION in the owner's form (`'#85dcff 0%'`).
// Outwards we hand them over SEPARATELY: `hex` — the pure colours (a dozen places read them, from
// `hexRGB` to the tint of the Safari bars, and they have no need to know about positions) and `pos` —
// the fractions 0..1 (exactly two read them: the shader ramp and the CSS string).
// ⛔ THE RULE "ALL OR NONE" (see 00-config): a mixture is a loud warn and an
// EVEN layout. We do not undertake to complete partial positions "the way CSS does":
// diverging from the browser silently is worse than refusing out loud.
// ⚠️⚠️ THE LIGHTENING WITH WHITE IS HERE, IN THE SINGLE PARSING POINT (the owner's word
// 2026-08-22-g "throw a fade of 40% white over the whole area of the gradient"). BOTH paths
// go through the parsing — the load and the live substitution `setSkyStops` — therefore the
// lightening cannot fall to only one of them. What is handed outwards is ALREADY the displayed
// colour: the shader, `--sky-grad` and the Safari edges all see one and the same thing.
// ⛔ NOT AS A SEPARATE LAYER: the pixel is the same, but the edges would diverge from
//    the variables (the analysis is in 00-config at `SKY_FADE_WHITE`).
const fadeToWhite = (hex, k) => {
  const n = parseInt(String(hex).slice(1), 16);
  const toWhite = c => Math.round(c + (255 - c) * k);
  const r = toWhite(n >> 16 & 255), g = toWhite(n >> 8 & 255), b = toWhite(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};
// ⛔⛔⛔ OKLCH → sRGB HEX (the owner's word 2026-08-23-zh: «update the gradient, bring its
// values to OKLCH»). A stop may now be written either as `oklch(L% C H)` or as a plain hex —
// both parse, and everything downstream still receives a hex, so no consumer moved.
// ⚠️⚠️ WHY BOTH FORMS AND NOT A CLEAN SWITCH: the canon at SKY_STOPS says, in as many words,
// that colours are stored as CSS strings because the owner pastes them from Figma and «triples
// would force a manual recalculation and would lie on a typo». That reasoning did not stop
// being true — his OWN message carrying this request has a Figma panel full of HEXES in it. So
// the source of truth is OKLCH, as he asked, and a hex pasted straight from Figma still works.
// ⚠️ THE MATH IS THE STANDARD OKLab PIPELINE (Björn Ottosson): LCh → Lab → LMS' → cube → linear
// sRGB → the sRGB transfer curve → 8 bit. VERIFIED ON HIS OWN FIVE COLOURS: every one of them
// round-trips back to the exact hex he sent, so writing the palette in OKLCH changed no pixel.
// ⚠️ THE CHANNELS ARE CLAMPED AT THE END, and that is not cosmetic: OKLCH can address colours
// OUTSIDE the sRGB gamut, and an unclamped value would wrap through the byte and produce a
// wildly wrong hue rather than the nearest legal colour.
const _oklchHex = (L, C, H) => {
  const hr = H * Math.PI / 180, a = C * Math.cos(hr), b2 = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b2;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b2;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b2;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s2 = s_ * s_ * s_;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s2,
  ];
  const b8 = lin.map(v => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  });
  return '#' + ((1 << 24) | (b8[0] << 16) | (b8[1] << 8) | b8[2]).toString(16).slice(1);
};
// one stop: `oklch(L% C H)` or `#rrggbb`, optionally followed by a position `NN%`
const _stopRe = /^(oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)|#[0-9a-fA-F]{6})(?:\s+([\d.]+)%)?$/;
function parseSkyStops(list){
  const hex = [], raw = [];
  const k = (typeof SKY_FADE_WHITE === 'number') ? SKY_FADE_WHITE : 0;
  for (const it of list){
    const t = String(it).trim();
    const q = _stopRe.exec(t);
    // ⚠️ A STOP THAT DOES NOT PARSE IS LOUD, NOT SILENT: falling back to the raw string would
    // hand a non-hex to `fadeToWhite`/`hexRGB` and paint the sky black with no explanation.
    if (!q){ console.warn('[sky] a stop was not understood, skipped: ' + t); continue; }
    const col = q[2] !== undefined ? _oklchHex(parseFloat(q[2]) / 100, parseFloat(q[3]), parseFloat(q[4]))
                                   : q[1];
    hex.push(k > 0 ? fadeToWhite(col, k) : col);
    raw.push(q[5] !== undefined ? parseFloat(q[5]) / 100 : null);
  }
  const count = raw.filter(v => v !== null).length;
  const ownPos = count === raw.length;
  if (count && !ownPos) console.warn('[sky] positions are not set on all the stops (' +
    count + ' out of ' + raw.length + ') — the layout is even, see SKY_STOPS');
  const last = hex.length - 1;
  const pos = ownPos ? raw : hex.map((_, i) => last ? i / last : 0);
  return { hex, pos, ownPos };
}
const skyParsed = parseSkyStops(SKY_STOPS[skyTimeNow()]);
// ⚠️ `skyStops` REMAINS A LIST OF PURE HEXES — that way all the previous consumers
// (including `skyStops[0]` for the tint of the top bar) work without edits.
const skyStops = skyParsed.hex;
const skyPos = skyParsed.pos;
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
// '#rrggbb' -> [0..1, 0..1, 0..1] of RAW sRGB. No convertSRGBToLinear:
// the sky shader bypasses the renderer's conversion (see 00-config at SKY_STOPS).
const hexRGB = s => { const n = parseInt(s.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const skyRGB = skyStops.map(hexRGB);
// ⚠️ THE SAME GRADIENT — IN CSS (the owner's spec 2026-07-28: "the fill of this block is
// the gradients of the time of day"). A single source together with the sky: the consumer and the game's
// background cannot diverge BY CONSTRUCTION.
// ⛔ THE CONSUMER CHANGED ON 2026-08-20: this is NO LONGER the Play card (it has
// `background:transparent` by the owner's word), but the PAUSE SCREEN ITSELF
// (`#mainScreen::before`). The variable and the rule are the same — the addressee changed. It is computed once at load, like the
// sky — the time of day does not change within a session, and the updateHUD tick would set one and
// the same string in vain. The string comes out LITERALLY the way the owner gave it.
// ⚠️ THE POSITIONS GET INTO THE CSS LITERALLY, if they are set: otherwise the browser would lay the
// stops out evenly while the shader would use the positions, and one gradient would become two.
const skyGradList = (hex, pos, ownPos) => hex
  .map((c, i) => ownPos ? c + ' ' + +(pos[i] * 100).toFixed(4) + '%' : c).join(',');
const skyGradCSS = 'linear-gradient(180deg,' +
  skyGradList(skyStops, skyPos, skyParsed.ownPos) + ')';
// ⚠️ THE COLOURS OF THE TOP AND BOTTOM EDGES ARE SEPARATE VARIABLES (the Safari 26 recipe,
// see CLAUDE.md "iOS chrome"): Safari 26 IGNORES theme-color and takes the tint of its
// bars from the background-color of html/body themselves, while a fixed element with a TRANSPARENT background
// poisons the tint — transparent is read as "transparent BLACK". Our #topBar and
// #bottomBar are exactly like that, hence the black fields at the top and the bottom on an iPhone.
// The cure according to the recipe: give every bar a background of the colour of ITS OWN edge with an alpha of 0.01 —
// invisible to the eye, but the tint is taken correctly. The top and the bottom are different, because
// the sky is a gradient.
const rgbTriple = a => a.map(c => Math.round(c*255)).join(',');
try {
  const d = document.documentElement.style;
  d.setProperty('--sky-grad', skyGradCSS);
  d.setProperty('--sky-top-rgb', rgbTriple(skyRGB[0]));
  d.setProperty('--sky-bot-rgb', rgbTriple(skyRGB[skyRGB.length - 1]));
} catch(e){}

// The sky. A ShaderMaterial bypasses
// the renderer's tone mapping and sRGB conversion, so the colours are given AS THEY ARE
// (without convertSRGBToLinear) — #ffffff gives a true white on the screen.
// The colour of the combo FEVER by the time of day (the owner's spec 2026-07-21-g): light blue
// in the dark hours (night 20..5 — the same boundary as the sky gradient's), green during the day.
// Computed ONCE at load — in agreement with the panorama (both come from new Date()).
function feverColorNow(){
  // we do NOT recompute the hour — we take the same point that the sky gradient picks
  return v3(skyTimeNow() === 'night' ? FEVER_NIGHT : FEVER_DAY);
}
// A GRADIENT EVERYWHERE (the owner's spec 2026-07-30: "remove the picture in the background on
// desktop, make it the same as on mobile: always the gradient by the time of day").
// ⛔ THIS CANCELS the decision of 2026-07-22 "a panorama on desktop, a gradient on mobile":
// the SKY_PANORAMA flag (the pointer:coarse criterion), the skyPanorama function and the branch of
// the equirectangular unwrap in the shader ARE DELETED, and with them the module
// 05-sky (three base64 JPEGs 1536×768). One base for all devices.
// THE RAMP OF THE GRADIENT is a 1D texture built from the owner's stops (spec 2026-07-31).
// ⚠️ WHY A TEXTURE AND NOT UNIFORMS: there are 12 stops (night) and 7 (day), and the owner
// edits their list — with uniforms this would have to be declared for a fixed
// number and the shader rebuilt on every edit. The ramp reads an array of any
// length and does not touch the shader at all.
// ⚠️ THE WIDTH IS 256 (a power of two), and NOT "by the number of stops": NPOT textures in
// WebGL1 are legal only with CLAMP_TO_EDGE without mips, and we have been burned on this
// on the web more than once — rule 9 tells us to take the well-tried option. 1 KB of memory, and the interpolation
// between the stops we bake OURSELVES (see below), so as not to depend on the hardware's filter.
// ⚠️ The interpolation is in RAW sRGB — exactly what CSS linear-gradient does:
// otherwise the on-screen gradient of the Play card and the sky would diverge in the middle.
// ⚠️ encoding = LinearEncoding DELIBERATELY (a legacy of the panorama): the sky shader
// bypasses the renderer's conversion, the bytes go to the screen as they are.
const SKY_RAMP_W = 256;
// ⚠️⚠️ THE LERP GOES BY THE POSITIONS OF THE STOPS, AND NOT BY THEIR INDICES. The previous edition
// computed `t = last * i / (W-1)`, that is it silently laid the stops out EVENLY —
// with the owner's palette of 2026-08-20-b (0/36/65/100) that would have shifted the middle
// stops by 2.7% and 1.7% of the frame height, and the sky in the game would have diverged from the same
// string in the CSS, where the browser respects the positions. The divergence is small and therefore
// especially nasty: invisible to the eye, while the edges and the measurements are already lying.
// THE CLOUD TILE, BAKED ONCE (the owner's word 2026-08-31). Value-noise FBM on the CPU, into a
// wrapping single-channel tile - so the shader pays ONE texture fetch instead of an FBM per
// fragment. That is the entire reason his «THEY MUST NOT AFFECT PERFORMANCE» is answerable.
// ⚠️ THE NOISE IS PERIODIC BY CONSTRUCTION: the lattice wraps at the tile's edge (`& (N-1)`),
// so the drift can run forever without a seam appearing. A non-wrapping tile would show a hard
// line crossing the sky every time it repeated - the same class of defect as an angular noise
// domain torn by atan, which cost a whole render to find.
function buildCloudTex(){
  const N = CLOUD_TEX, px = new Uint8Array(N * N);
  const h = (x, y) => {                 // a stable hash on the WRAPPED lattice
    const s = Math.sin((x & (N - 1)) * 127.1 + (y & (N - 1)) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const sm = (a, b, f) => a + (b - a) * f * f * (3 - 2 * f);
  const noise = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const m = (v) => ((v % per) + per) % per;
    const a = h(m(xi), m(yi)),     b = h(m(xi + 1), m(yi));
    const c = h(m(xi), m(yi + 1)), d = h(m(xi + 1), m(yi + 1));
    return sm(sm(a, b, xf), sm(c, d, xf), yf);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    // four octaves, each on its own PERIOD so every one of them wraps too
    // ⚠️ THE BASE PERIOD IS 2, NOT 4: at 4 the tile came out as fine MOTTLING, which reads as
    // haze rather than as cloud. Two large cells with three octaves of detail on top give
    // shapes big enough to be recognised even at an amplitude that is barely visible at all.
    let v = 0, amp = 0.5, per = 2;
    for (let o = 0; o < 4; o++){
      v += amp * noise(x / N * per, y / N * per, per);
      amp *= 0.5; per *= 2;
    }
    // ⚠️⚠️ THE KNEE DECIDES WHETHER THERE ARE CLOUDS AT ALL, AND THE FIRST ONE WAS TOO HARD.
    // At (v-0.42)/0.58 followed by a smoothstep the tile came out mean 30 of 255 - i.e. mostly
    // EMPTY - and a profile through any single column read exactly zero, which looked like the
    // whole layer was broken. It was not: rendering `cl` to the screen showed the envelope
    // perfect and the tile simply blank where it was sampled. Softened so most of the sky
    // carries a little and the peaks still stand out.
    v = Math.max(0, Math.min(1, (v - 0.30) / 0.34));
    px[y * N + x] = Math.round(255 * v * v * (3 - 2 * v));
  }
  // ⛔⛔ RGBA AND NOT LuminanceFormat. On a WebGL2 context - which is what three r149 picks
  // whenever it can, i.e. essentially always here - LuminanceFormat is NOT supported and the
  // sampler silently reads ZERO. Measured: with it the cloud layer had literally no effect,
  // every profiled row identical to the arm with the clouds off, and no warning in the console.
  // The extra three bytes per texel are 256 KB of VRAM once, which is nothing next to a layer
  // that quietly does not exist.
  const rgba = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++){ rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = px[i]; rgba[i*4+3] = 255; }
  const tex = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
function buildSkyRamp(rgb, pos){
  const px = new Uint8Array(SKY_RAMP_W * 4), last = rgb.length - 1;
  const p = (pos && pos.length === rgb.length)
    ? pos : rgb.map((_, i) => last ? i / last : 0);
  for (let i = 0; i < SKY_RAMP_W; i++){
    const t = i / (SKY_RAMP_W - 1);            // the fraction of the ramp's height: 0..1
    let k = 0; while (k < last - 1 && t >= p[k + 1]) k++;
    const step = p[k + 1] - p[k];
    const f = last ? Math.max(0, Math.min(1, step > 0 ? (t - p[k]) / step : 0)) : 0;
    const a = rgb[last ? k : 0], b = rgb[last ? k + 1 : 0];
    for (let c = 0; c < 3; c++) px[i*4 + c] = Math.round((a[c] + (b[c] - a[c]) * f) * 255);
    px[i*4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(px, SKY_RAMP_W, 1, THREE.RGBAFormat);
  tex.encoding = THREE.LinearEncoding;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
// ⚠️ A SELF-CHECK OF THE STAR CELL BUDGET (see 00-config): everything that goes beyond
// the half-cell is cut off by the face of the neighbouring one. The first version of the v2 stars broke this
// with a halo and gave a light RECTANGLE around every star. It is cheaper to shout
// into the console at load than to catch this with a screenshot once a month.
(function checkStarBudget(){
  const sum = STAR_JIT / 2 + STAR_HALO * STAR_R * STAR_GRID;
  if (sum >= 0.5) console.warn('[stars] the cell budget is exceeded: ' + sum.toFixed(3) +
    ' >= 0.5 — the halo will be cut off by the cell face (see STAR_* in 00-config)');
})();
let skyMat = null; // the screen layer: uCombo paints the BOTTOM (the combo fever, from 99-main)
// ⛔ The uGrind layer (a red top when the mixer is angry) was removed on 2026-08-20 by the owner's word.
(function buildSky(){
  // The fever, the grind ladder and the darkening of the top go ON TOP of the base.
  const baseUni =
      { uRamp: { value: buildSkyRamp(skyRGB, skyPos) },
        uSkyMap: { value: SKY_MAP === 'view' ? 0 : 1 },
        uStars: { value: skyTimeNow() === 'night' ? 1 : 0 },
        // THE DENSITY IS A UNIFORM, not a literal: the "Living environment" package plans
        // "the sky accumulates stars" (the density from the share of unlocked types). That way the feature will land
        // on top without reworking the shader — it is enough to move the threshold.
        uStarDens: { value: STAR_DENS },
        uStarSpark: { value: STAR_SPARK },
        // ⚠️ THE PULSE IS UNIFORMS, AND NOT HARD-WIRED NUMBERS. Two reasons: (1) a knob for live
        // tuning (the owner may want to turn "1 in 10" into "1 in 20");
        // (2) the ONLY honest way to verify the mechanism — a pixel measurement
        // does not tell 10% pulsing apart from ALL of them blinking (measurement: a swing
        // of 0.41 against 0.41 for the base), while with a share of 1.0 the difference is visible at once (0.93).
        uStarPulseFrac: { value: STAR_PULSE_FRAC },
        uStarPulseAmp:  { value: STAR_PULSE_AMP },
        uTime: { value: 0 },
        uCloud:    { value: buildCloudTex() },
        uCloudAmt: { value: CLOUD_ON ? CLOUD_AMT : 0 },
        uResX:     { value: 1 } };
  const baseDecl =
      ['uniform sampler2D uRamp; uniform float uStars; uniform float uSkyMap;',
       'uniform float uStarDens; uniform float uStarSpark; uniform float uTime;',
       'uniform float uStarPulseFrac; uniform float uStarPulseAmp;',
       'uniform sampler2D uCloud; uniform float uCloudAmt; uniform float uResX;',
       'float hs(vec3 v){ return fract(sin(dot(v, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }'];
  const baseCol = [
      '  vec3 d = normalize(vDir);',
      // TWO WAYS TO LAY THE STOPS OUT — the SKY_MAP switch (00-config).
      // (1) BY THE VIEW: the zenith (d.y=+1) is the first stop, the nadir (d.y=−1) is
      //     the last, the horizon exactly in the middle. The sky behaves like a sphere.
      // (2) BY THE SCREEN: like the owner's CSS `linear-gradient(180deg,…)` — the top
      //     of the frame is the first stop, the bottom the last. The screen coordinate is already
      //     used here by a neighbouring layer (the uCombo fever), so the trick is not new
      //     in this shader. ⛔ The second such neighbour — the grind threat
      //     `uGrind` — was removed on 2026-08-20 by the owner's word, do not look for it.
      // ⚠️ THE MEASUREMENT BECAUSE OF WHICH THE SWITCH APPEARED: the camera looks FROM ABOVE
      // INTO THE BOWL, so by the view only the TAIL of the ramp gets onto the screen —
      // positions 70.6%..100% (day) and 70.5%..97.8% (night). The first ~70% of the owner's
      // stops are NEVER visible. By the screen all 100% are visible.
      // ⚠️ AND THE SECOND THING, NOT COSMETIC: --sky-top-rgb/--sky-bot-rgb (the tint of the Safari
      // bars) equal the first/last stop. By the view they DIVERGE
      // from the real edge of the frame (measurement: the variable 110,134,255 against the pixel
      // 132,227,248) — the bar on an iPhone would get a foreign colour. By the screen the
      // agreement is exact BY CONSTRUCTION.
      '  float tView = clamp((1.0 - d.y) * 0.5, 0.0, 1.0);',
      '  float tScreen = clamp(1.0 - gl_FragCoord.y / uResY, 0.0, 1.0);',
      '  float t = mix(tView, tScreen, uSkyMap);',
      // ⛔⛔ THE RAMP SHIFT IS CANCELLED (the owner 2026-09-01: «the clouds are lilac and look
      // like dirt, let's make them white»). Pulling `t` toward 0 sampled the palette's TOP stop,
      // and on his day palette that stop is #8C86FF - blue-violet. It could not have come out
      // any other colour: reading a gradient backwards is reading the colour above you.
      // ⚠️ A cloud is now a WHITE MIX applied to the FINISHED ramp colour, below.
      // ⚠️⚠️ AND IT LIGHTENS, i.e. it argues with the canon's «shift any day decor INTO THE
      // MINUS» - a rule that exists because a lighter top of the frame drops the contrast of
      // the white eyes. The envelope is what keeps the peace, and it is measured, not assumed:
      // see the HUD-contrast guard, which reads the eyes against the sky on this very build.
      // ⚠️ THE ENVELOPE IS ZERO AT t=0 AND AGAIN BY CLOUD_FADE_OUT, AND THE FIRST ZERO IS
      // LOAD-BEARING: the top pixel row IS what --sky-top-rgb promises the Safari chrome zone,
      // and a cloud touching it would make that variable lie about the frame's edge.
      // ⚠️ Since 2026-09-01-zh this envelope no longer SHAPES anything - it is a guard rail, and
      // the shape is the three placed blobs below. That is why it is deliberately wide.
      '  float sx = gl_FragCoord.x / max(uResX, 1.0);',
      '  float cenv = smoothstep(' + CLOUD_FADE_IN[0].toFixed(3) + ', ' + CLOUD_FADE_IN[1].toFixed(3) + ', t)'
        + ' * (1.0 - smoothstep(' + CLOUD_FADE_OUT[0].toFixed(3) + ', ' + CLOUD_FADE_OUT[1].toFixed(3) + ', t));',
      '  float cl = 0.0;'].concat(CLOUDS.map(function (c, i) {
        // one placed blob: an ellipse in frame fractions, its edge broken up by the baked tile.
        // ⚠️ `dx -= floor(dx + 0.5)` is the toroidal distance - it wraps the horizontal drift with
        // no seam and no branch, so a cloud leaving the right edge re-enters on the left.
        // ⚠️ `max` and not `+`: two overlapping clouds must not add up to a bright patch.
        return [
        '  { float cx' + i + ' = fract(' + c.x.toFixed(3) + ' + uTime * ' + c.drift.toFixed(5) + ');',
        '    float dx' + i + ' = sx - cx' + i + '; dx' + i + ' -= floor(dx' + i + ' + 0.5);',
        '    float dy' + i + ' = t - ' + c.y.toFixed(3) + ';',
        '    float q' + i + ' = dx' + i + '*dx' + i + '/' + (c.rx * c.rx).toFixed(6) +
          ' + dy' + i + '*dy' + i + '/' + (c.ry * c.ry).toFixed(6) + ';',
        '    float b' + i + ' = 1.0 - smoothstep(0.25, 1.0, q' + i + ');',
        '    float n' + i + ' = texture2D(uCloud, vec2(sx * ' + c.warp.toFixed(2) + ' + ' +
          c.y.toFixed(3) + ', t * ' + (c.warp * 2.0).toFixed(2) + ' + ' + c.x.toFixed(3) + ')).r;',
        '    cl = max(cl, b' + i + ' * (0.35 + 0.85 * n' + i + ')); }'].join('\n');
      })).concat([
      // half a texel inwards: otherwise the edge of the ramp is blurred by the filter against ClampToEdge
      '  float u = t * ' + ((SKY_RAMP_W - 1) / SKY_RAMP_W).toFixed(8) +
        ' + ' + (0.5 / SKY_RAMP_W).toFixed(8) + ';',
      '  vec3 col = texture2D(uRamp, vec2(u, 0.5)).rgb;',
      // THE CLOUD ITSELF: white, mixed into the finished ramp colour. `cenv` is unchanged and
      // is still exactly zero at t=0 and again by CLOUD_FADE_OUT, so the first and last pixel rows
      // of the frame are untouched BYTE FOR BYTE - which is what --sky-top-rgb/--sky-bot-rgb
      // promise the iOS chrome zones, and Safari 26 paints those zones by stretching those
      // very rows. A cloud that reached an edge would put a colour there that is on no screen.
      '  col = mix(col, vec3(1.0), clamp(cl * cenv * uCloudAmt, 0.0, 1.0));',
      // THE STARS (only at night): the night PANORAMA had them, a pure gradient
      // lost them — the tone matched, but the sky became empty. The grid is THREE-DIMENSIONAL by
      // direction: it is even on a sphere, there are no poles. A star is a random
      // DIRECTION within a cell, the dot is by the ANGLE to the view => always round.
      // ⚠️ Three failed approaches (do not repeat): (1) a grid over equirectangular
      // UVs — DASHES at the nadir, SQUARES above; (2) the 3D distance to the centre of the
      // cell — the centres lie outside the thin sphere, there are almost no stars; (3) a cutoff
      // below the horizon removed EXACTLY the visible sky: the camera looks from above downwards.
      // THE STARS v2 (the owner's spec 2026-07-31 "make it vector-based + a weak twinkle").
      // The frame is the previous one and DELIBERATELY so: a 3D grid by DIRECTION — it is even on a sphere,
      // there are no poles, the dots are round and do not swim when the camera rotates. The three failed
      // approaches (a UV grid, the distance to the cell centre, a cutoff below the horizon)
      // remain rejected, see the canon.
      '  if (uStars > 0.0){',
      '    vec3 ip = floor(d * ' + STAR_GRID.toFixed(1) + ');',
      '    float has = step(uStarDens, hs(ip));',
      // ⚠️ A RADIAL BAND: a star only in a cell that the sphere crosses
      // CLOSE TO THE CENTRE. A cell merely clipped by the corner is seen on the sphere as a tiny spot —
      // the star in it was cut off by a face or disappeared entirely (measurement: 9.3% and 21.1%).
      '    has *= step(abs(length(ip + 0.5) - ' + STAR_GRID.toFixed(1) + '), ' +
        STAR_BAND.toFixed(3) + ');',
      // ⚠️ THE JITTER IS SQUEEZED TOWARDS THE CENTRE OF THE CELL — and this is exactly the cure for "the shape gets cut":
      // an offset <= JIT/2 plus the radius stays inside the half-cell, so the disc
      // never reaches a face and is not cut off by the neighbouring cell.
      '    vec3 jit = vec3(hs(ip + 1.7), hs(ip + 3.3), hs(ip + 5.9)) - 0.5;',
      '    vec3 sdir = normalize(ip + 0.5 + jit * ' + STAR_JIT.toFixed(3) + ');',
      // ⚠️ THE METRIC IS the sin of the angle (|cross|), and NOT 1−cos: the latter is QUADRATIC near the centre,
      // because of which the edge blurred the more the smaller the star was ("blobs").
      // |cross| is linear in the angle, so it behaves like an ordinary radius on a plane.
      '    float s = length(cross(d, sdir));',
      // ⚠️ THE POWER IS ON THE HASH, AND NOT ANOTHER HASH: the same hs(ip+9.1) remains the source,
      // only the SHAPE of the distribution changes — pow(h, BIAS) with BIAS>1 shifts
      // the sampling towards the lower bound. That way there are more small ones, while the NUMBER of stars does not
      // change at all (uStarDens is responsible for that, and it has not been touched).
      '    float sz = mix(' + STAR_SIZE_MIN.toFixed(2) + ', 1.0, pow(hs(ip + 9.1), ' +
        STAR_SIZE_BIAS.toFixed(2) + '));',
      '    float R = ' + STAR_R.toFixed(5) + ' * sz;',
      // A VECTOR EDGE: the width of the antialiasing = THE SIZE OF A PIXEL (fwidth), so
      // the edge is exactly one pixel at any DPR — it neither blurs nor aliases.
      // ⚠️ A CLAMP FROM ABOVE BY THE RADIUS: s is discontinuous at the cell boundary, and in the quads on a face
      // fwidth jumps up to the size of a cell — smoothstep lit up weak
      // flickering dots along the faces (a minor from the review on main).
      '    float w = clamp(fwidth(s), 1.0e-8, R);',
      '    float core = smoothstep(R + w, R - w, s);',
      '    float glow = ' + STAR_GLOW.toFixed(3) + ' * smoothstep(R * ' + STAR_HALO.toFixed(2) + ', R * 0.6, s);',
      // A FOUR-RAY SPARK: the coordinates are in the tangent plane of the star.
      // The basis is chosen from the least collinear axis — it does not degenerate at the poles.
      '    vec3 up = abs(sdir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
      '    vec3 t1 = normalize(cross(sdir, up));',
      '    vec3 t2 = cross(sdir, t1);',
      '    vec2 q = vec2(dot(d, t1), dot(d, t2)) / (R * ' + STAR_HALO.toFixed(2) + ');',
      '    float ray = uStarSpark * (smoothstep(1.0, 0.0, abs(q.x) + abs(q.y) * 7.0)',
      '                            + smoothstep(1.0, 0.0, abs(q.y) + abs(q.x) * 7.0)) * 0.5;',
      // THE TWINKLE: the phase and the speed are THEIR OWN for every star (the hash of the cell), so the sky
      // does not pulse in chorus. Slowly and weakly — the rule "the periphery does not fuss".
      '    float ph = hs(ip + 13.7) * 6.2832;',
      '    float spd = ' + STAR_TW_SPD.toFixed(3) + ' * (0.6 + 0.8 * hs(ip + 17.3));',
      '    float tw = 1.0 - ' + STAR_TW_AMP.toFixed(3) + ' * (0.5 + 0.5 * sin(uTime * spd + ph));',
      // THE PULSE OF A MINORITY: its own phase and its own, three times slower wave on top of
      // the twinkle. The selection is a separate hash of the cell, so a "pulsing" star
      // is always the same one, rather than blinking at random from frame to frame.
      '    float pls = step(1.0 - uStarPulseFrac, hs(ip + 23.1));',
      '    float ph2 = hs(ip + 29.3) * 6.2832;',
      '    float pl = 1.0 - pls * uStarPulseAmp' +
        ' * (0.5 + 0.5 * sin(uTime * ' + STAR_PULSE_SPD.toFixed(3) + ' + ph2));',
      '    col += uStars * has * tw * pl * (core + glow + ray) * 0.6;',
      '  }',
    ]);   // ⚠️ closes the .concat([ … opened at the cloud blobs above
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    // ⚠️ fwidth IN WebGL1 REQUIRES AN EXTENSION — without this line the shader will not
    // compile on WebGL1 devices (in WebGL2 the derivatives are in the core and the flag is
    // ignored). GL_OES_standard_derivatives is supported everywhere; this is
    // the regular three path, not an exotic one (rule 9: we take the well-tried option).
    extensions: { derivatives: true },
    uniforms: Object.assign({
      uCombo: { value: 0 }, // 0 — the ordinary sky, 0.3..0.8 — a combo, 1 — a chain reaction
      uResY:  { value: 1 },  // the height of the canvas in device px (for the screen gradient)
      uFeverCol: { value: feverColorNow() }, // light blue at night / green during the day
    }, baseUni),
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform float uCombo; uniform float uResY;',
      'uniform vec3 uFeverCol;',
    ].concat(baseDecl, ['void main(){'], baseCol, [
      '  float sy = gl_FragCoord.y / uResY;', // 0 — the bottom of the screen, 1 — the top
      // THE COMBO FEVER: a soft glow near the bottom edge (light blue at night /
      // green during the day), it fades upwards and is limited by the FEVER_MAX ceiling.
      '  float fever = uCombo * (1.0 - smoothstep(0.0, ' + FEVER_SPAN.toFixed(3) + ', sy)) * ' + FEVER_MAX.toFixed(3) + ';',
      '  col = mix(col, uFeverCol, fever);',
      // ⛔⛔ THE RED GRIND LAYER HAS BEEN REMOVED (the owner's word 2026-08-20: "remove the
      // change of the background at the top (the reddening) when the mixer gets angry"). Here a
      // mirrored red was poured in at the TOP edge along the `uGrind` threat ladder.
      // ⚠️ THIS ALSO REMOVES A WHOLE CAVEAT OF THE SAFARI BARS RECIPE: the top of the frame
      // NEVER diverges from the first stop of the palette any more, whereas it used to
      // diverge by up to Δ152 over seven seconds of idling, and the edge had to be measured
      // "in the first second after an action".
      // ⚠️ The threat signal has not been orphaned: it is carried by the ANGRY EYES and the blades themselves.
      // ⚠️ THERE IS NO STATIC darkening of the top bar — IT WAS REMOVED by the owner's
      // order 2026-07-22 ("a gradient at the top/bottom only during turbo or when the
      // mixer is angry"); it applies to BOTH bases of the hybrid (the panorama and the
      // gradient). Do NOT bring it back for the sake of HUD contrast: the owner knows that
      // white eyes on a light day sky give ~1.6:1 (a graphics measurement).
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ]).join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyM);
  scene.add(sky);
  skyMat = skyM;
})();

// A LIVE SUBSTITUTION OF THE SKY PALETTE — for the owner to pick colours without a rebuild
// (the same meaning as veilTune: the tone is a matter of taste, and the owner comes back
// to it; a contact sheet of variants is shot in ONE run).
// ⚠️ The old ramp IS DISPOSED: otherwise a contact sheet of a dozen variants
// would leave a dozen textures behind in the GPU.
// ⚠️ The CSS variables are updated right here — otherwise the Safari bar would stay
// on the previous palette, and its colour is half of the question when picking the bottom.
// The tone of the chrome (html/body) is taken from the TOP stop once at load and
// is not moved by the live substitution: the spec does not touch the top of the night.
function setSkyStops(list){
  if (!skyMat || !Array.isArray(list) || list.length < 2) return null;
  // ⚠️ THE LIVE SUBSTITUTION GOES THROUGH THE SAME PARSING as the load: a parsing of its own
  // next to a working one would diverge from it at the very first edit of the stop form.
  const parsed = parseSkyStops(list);
  const rgb = parsed.hex.map(hexRGB);
  const old = skyMat.uniforms.uRamp.value;
  skyMat.uniforms.uRamp.value = buildSkyRamp(rgb, parsed.pos);
  if (old && old.dispose) old.dispose();
  try {
    const d = document.documentElement.style;
    d.setProperty('--sky-grad', 'linear-gradient(180deg,' +
      skyGradList(parsed.hex, parsed.pos, parsed.ownPos) + ')');
    d.setProperty('--sky-top-rgb', rgbTriple(rgb[0]));
    d.setProperty('--sky-bot-rgb', rgbTriple(rgb[rgb.length - 1]));
  } catch(e){}
  return list.slice();
}
