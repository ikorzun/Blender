// ===== 70-fx: visual effects and floating text =====

const fx = [];
// Census of LIVE particles: how many points are in the effect clouds right now.
// Needed by mobile-tier profiling — "fx: 12 objects" says nothing when a single
// dissolveFX is 1280 points whose positions are rewritten and uploaded to the
// GPU EVERY frame. Called only from perfStats, not from the tick.
function fxParticleCount(){
  let pts = 0, clouds = 0;
  for (const f of fx){
    const g = f.obj && f.obj.geometry, p = g && g.attributes && g.attributes.position;
    if (p && f.obj.isPoints){ pts += p.count; clouds++; }
  }
  return { pts, clouds };
}
// ⚠️ THE COST OF CREATING AN EFFECT IS SEPARATE FROM THE COST OF THE TICK, and
// in the mobile-tier profile it was exactly that which turned out to be the peak:
// on the tap frame ~40 ms were explained NEITHER by physics, nor by stepFX, nor
// by the render. Here the construction time accumulates (Float32Array for 1280
// points, BufferGeometry, material, possible shader compilation); the loop takes
// it and zeroes it once per frame.
// ⚠️⚠️ FIXED AFTER A CATCH BY GRAPHICS (2026-07-31). THE FIRST VERSION COUNTED
// ONLY DUST CLOUDS — the single accumulation point sat inside dustCloud, while
// the report column was named "effect build". It was blind to exactly the
// direction the Graphics redesign was moving in: with SHARDS every piece is its
// own geometry and its own material (9-23 per burst), and in the counter they
// gave ZERO. A classic "the metric is plausible, but it measures something other
// than what it is called out loud".
// Now the WHOLE effect build is counted. The in/out pair is RESILIENT TO NESTING
// (dissolveFX calls dustCloud three times): only the outer pair accumulates,
// otherwise one cloud would be counted twice.
// ⚠️⚠️ BREAKDOWN BY EFFECT KIND (A2, 2026-08-01) — AND THIS IS THE THIRD RUN
// INTO THE VERY SAME RAKE. The first version of the counter saw only dust clouds;
// Graphics caught that shards gave ZERO in it. Now the same thing has happened
// AGAIN: with the port of the owner's set (collapse/saw/fire/ricochet/wheel)
// seven new constructors arrived, and NOT ONE of them made it into the counter —
// "effect build" was again measuring less than it claimed.
// ⛔ THE RULE FROM HERE ON: A NEW EFFECT CONSTRUCTOR MUST BE WRAPPED. A counter
// that stays silent about a newcomer is worse than a missing one — it looks like
// a measurement.
// The total is counted at the TOP level (no double counting), while per kind the
// OWN time accumulates: nested constructors (sparkRicochetFX -> wheelFX,
// sparkRicochetFX -> wheelFX, dissolveFX -> dustCloud×3) are subtracted from the
// parent. Otherwise "sparks 6 ms" would be hiding the cost of the wheel inside
// itself, and the pool would go off treating the wrong line item.
let fxBuildMs = 0;
const fxBuildBy = {};         // kind -> { ms: own time, n: calls }
const _fxBStack = [];         // { kind, t0, child }
function fxBuildIn(kind){
  _fxBStack.push({ kind: kind || 'other', t0: performance.now(), child: 0 });
}
function fxBuildOut(){
  const f = _fxBStack.pop();
  if (!f) return;
  const d = performance.now() - f.t0;
  const parent = _fxBStack[_fxBStack.length - 1];
  if (parent) parent.child += d; else fxBuildMs += d;
  const b = fxBuildBy[f.kind] || (fxBuildBy[f.kind] = { ms: 0, n: 0 });
  b.ms += d - f.child; b.n++;
}
// constructor wrapper: the kind label + the function itself. try/finally is
// mandatory — an exception inside an effect must not leave the stack skewed
// forever.
// ⚠️⚠️ THE LABEL REGISTRY CATCHES A COLLISION — CAUGHT BY GRAPHICS ON A LIVE CASE.
// The label `'spark'` was taken TWICE (the old sparkFX and the new
// sparkRicochetFX), while `fxBuildBy` is keyed by the label — two different
// functions were adding up into ONE report row, and the number "sparks 0.62" was
// a sum of who knows what. The only thing that saved it was that the old effect
// is dead (zero calls), i.e. it was correct BY ACCIDENT. A collision is exactly
// "the metric is plausible, but it measures the wrong thing", and one cannot rely
// on attentiveness here: the registry remembers the first kind taken, and the
// guard in the suite requires that there be no duplicates.
const fxKindOwner = {};
let fxKindDup = null;
function fxBuilt(kind, fn){
  const k = kind || 'other';
  if (fxKindOwner[k] && !fxKindDup) fxKindDup = k;
  fxKindOwner[k] = true;
  return function(){ fxBuildIn(k); try { return fn.apply(null, arguments); } finally { fxBuildOut(); } };
}
const fxBuildTake = () => { const v = fxBuildMs; fxBuildMs = 0; return v; };
// ⚠️ ALL effect constructors IN ONE LIST, so that "is this one counted?" is a
// one-glance question and not a search through the file. `_x_impl` are function
// declarations, they hoist, which is why the list stands here and not at the end.
// Added an effect — add a line here, otherwise it is invisible to the profile.
// ⚠️ THE FIRST VERSION OF THIS LIST DID NOT KEEP ITS OWN PROMISE (caught by
// GRAPHICS): eleven wrappers stood here and four were scattered around the file.
// Everything was wrapped, but "at one glance" did not work, and the rule rests on
// exactly that.
// The list is complete: the number of wrappers below must match the number of
// `_name_impl` functions in the file (today there are 14). The guard checks this
// itself.
// ⚠️ THE LABELS MUST BE DIFFERENT — their collision is caught by the registry
// above and by the suite's guard.
const starPopFX        = fxBuilt('star',     _starPopFX_impl);
const shardFX          = fxBuilt('shard',    _shardFX_impl);
const popFX            = fxBuilt('pop',      _popFX_impl);
const markerFX         = fxBuilt('marker',   _markerFX_impl);
const lineFX           = fxBuilt('line',     _lineFX_impl);
const collapseFX       = fxBuilt('collapse', _collapseFX_impl);
const impactFX         = fxBuilt('impact',   _impactFX_impl);
const fireBurstFX      = fxBuilt('fireBurst', _fireBurstFX_impl);
const juiceBigFX       = fxBuilt('juiceBig', _juiceBigFX_impl);
const sparkRicochetFX  = fxBuilt('sparkRico', _sparkRicochetFX_impl);
const wheelFX          = fxBuilt('wheel',    _wheelFX_impl);
const sawFX            = fxBuilt('saw',      _sawFX_impl);
const fireSilhouetteFX = fxBuilt('fire',     _fireSilhouetteFX_impl);
const heatShellFX      = fxBuilt('heat',     _heatShellFX_impl);
const chillShellFX     = fxBuilt('chill',    it => _heatShellFX_impl(it, COLD, 2));
const boltFX           = fxBuilt('bolt',     _boltFX_impl);
function fxBuildBreak(reset){
  const out = {};
  for (const k in fxBuildBy) out[k] = { ms: +fxBuildBy[k].ms.toFixed(2), n: fxBuildBy[k].n };
  if (reset) for (const k in fxBuildBy) delete fxBuildBy[k];
  return out;
}
// ⚠️ THE MATCH-HIT FLASH (the owner's word 2026-08-30, flashyfeather vol2 — see 37-hitfx).
// A billboarding sprite walking a packed sheet; its own texture CLONE per instance (the image
// is shared, only offset/repeat differ), disposed with the sprite. Normal blending on purpose:
// the source is authored additive-on-dark, but our sky is light — the alpha carries the shape.
// Skipped on the low perf tier together with the rest of the heavy fx (fxScale gate).
// ⚠️ A PLANE OF OUR OWN, NOT THREE.Sprite, and that is ownership hygiene: r149 Sprites SHARE
// one module-level geometry, and stepFX disposes `obj.geometry` at end of life — it would be
// disposing three's shared buffer on every hit (a re-upload per the measured note, and someone
// else's property either way). A personal PlaneGeometry dies with its own effect; the
// billboard is one quaternion copy per tick.
// ⚠️ The tick's second argument is k = age/life (0..1) — NOT seconds; the frame is k·n.
// ⚠️ The texture clone dies through the material's 'dispose' event: stepFX disposes the
// material itself, and materials do not own their maps.
// ⚠️⚠️ THE FLASH IS CHOSEN BY THE ITEM'S MATERIAL (the owner 2026-08-30: «mne nravyatsya vse
// effekty, mozhesh raspredelit ikh na gruppy po tipam veshchey ili ostavit randomno»).
// ⛔ NOT BY PACK, and that is a measurement and not a preference: all five effects are the SAME
// warm orange (hue 17-28°, measured) — they differ in DENSITY and SATURATION, not in colour, so
// a per-pack palette would have been a distinction nobody can see. What they can read is
// «a dense thing hits densely»:
//   metal, glass -> 13 (the thinnest and most saturated — a sharp ting)
//   plastic, wood -> 4  (the densest burst — a solid knock)
//   juicy        -> 11 ⚡ THE ONLY GREEN ONE IN THE PACK (hue 123° against everyone else's
//                       13-28°, measured) — and fruit and veg are the one family where a green
//                       flash is not decoration but recognition. This is the single mapping
//                       the player can name out loud.
//   meat         -> 12 (the deep red-orange, hue 13° — the warmest of the warm)
//   dough, paper -> 14 (medium warm)
//   cream        -> 16 (soft and broad)
//   plush        -> 17 (the softest)
// ⚠️ `materialOf` lives in 73-material — LATER in the concatenation — and is reachable here only
// because it is a hoisted FUNCTION DECLARATION called at run time. Do not touch it at module
// top level from this file, and do not convert it to a const arrow in 73.
// ⚠️ A type with no voice (and the bomb/surprise, which have no type name here) falls back to
// a random pick — never to a fixed one, or those hits would all look alike.
// ⚠️ THE VALUES ARE INDICES INTO HITFX_SET, WHOSE ORDER IS THE TOOL'S ARGUMENT ORDER
// (4, 11, 12, 13, 14, 16, 17). Repacking with a different order or a shorter list SILENTLY
// re-points every material — rerun `tools/hitfx-pack.py 4 11 12 13 14 16 17` and re-read this
// table together. The suite pins that every material voice has an entry, not that the entry is
// the right one; that half is taste and lives here in prose.
const HITFX_BY_MATERIAL = { metal:3, glass:3, plastic:0, wood:0, juicy:1, meat:2,
                            dough:4, paper:4, cream:5, plush:6 };
// ⚠️ INDEX 7 = effect 3, the pack's ONLY COOL ONE (hue 197° cyan against everyone else's
// 13-123°) — the owner 2026-08-30 asked for it on the chain lightning specifically, and it is
// the one effect that belongs to an ELECTRIC event rather than to a material. It is deliberately
// APPENDED to the packer's argument list so every material index above stays put.
const HITFX_BOLT = 7;
// ⚠️ INDEX 2 = effect 12, the golden starburst-with-a-ring. It marks an ARRIVAL, not a hit:
// the treasure being thrown into the bowl (40-items) and the New Object screen (85-hud). The
// owner 2026-08-31 asked for ONE of the existing effects on both, and the whole point is that
// it is one of the existing ones: the sheet is already in the bundle and already resident, so
// both uses cost 0 B of download and 0 MB of VRAM. Adding a ninth effect would have cost
// ~94 KB gzipped and 3.4 MB of VRAM — measured, see the canon batch of this date.
// ⚠️ IT IS ALSO `meat`'s MATCH FLASH (the table above). That is not a clash: nothing reads the
// index back, and a treasure is not a match — but if the material table is ever repacked, this
// constant moves with it, exactly like HITFX_BOLT.
const HITFX_SPAWN = 2;
function spawnHitFx(pos, r, typeName, forceIdx){
  if (CFG.fxScale < 1 || typeof HITFX_SET === 'undefined' || !HITFX_SET.length) return;
  let idx = (forceIdx != null && forceIdx >= 0 && forceIdx < HITFX_SET.length) ? forceIdx : -1;
  if (idx < 0) try {
    const m = typeName && typeof materialOf === 'function' ? materialOf(typeName) : null;
    if (m != null && HITFX_BY_MATERIAL[m] != null) idx = HITFX_BY_MATERIAL[m];
  } catch(e){}
  if (idx < 0 || idx >= HITFX_SET.length) idx = (Math.random() * HITFX_SET.length) | 0;
  const F = HITFX_SET[idx];
  // ⛔⛔ THE TEXTURE IS SHARED, NOT CLONED — MEASURED, NOT ASSUMED. `texture.clone()` copies the
  // Texture OBJECT while sharing its image, and WebGLRenderer allocates per Texture instance:
  // renderer.info.memory.textures climbed 8 -> 9 -> 10 across three matches, i.e. EVERY match
  // uploaded a fresh 3.4 MB sheet to the GPU and threw it away 0.6 s later. Harmless-looking at
  // one flash per match; at up to eight simultaneous bolt flashes it would have been ~27 MB of
  // uploads inside a single frame. The frame now comes from the PLANE'S OWN UV attribute — the
  // geometry is per-instance already, so instances cannot fight over it the way they would over
  // a shared texture's offset.
  // ⚠️ AND THEREFORE NOTHING DISPOSES THIS TEXTURE: stepFX disposes obj.material (three does not
  // dispose a material's map), and the sheet must outlive every flash that uses it.
  const tex = hitFxTexture(idx);
  // ⚠️⚠️ depthTest:false IS THE WHOLE REASON IT IS VISIBLE. The flash is born AT THE MERGE
  // POINT — i.e. INSIDE the pile — so with depth testing on, the items in front of it occlude
  // almost the entire sprite (measured: the first cut read as a faint wash and nothing else).
  // A hit flash belongs on top of the frame; renderOrder keeps it under the HUD pops.
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  const uv = mesh.geometry.attributes.uv;
  const s = Math.max(2.6, r * 3.4);
  mesh.scale.set(s, s, 1);
  mesh.position.copy(pos);
  mesh.renderOrder = 8;                      // over the pile, under the HUD pops
  let lastFrame = -1;
  addFX(mesh, F.n / F.fps, (o, k) => {
    o.quaternion.copy(camera.quaternion);    // billboard
    const f = Math.min(F.n - 1, Math.floor(k * F.n));
    if (f === lastFrame) return;             // the UV write is skipped on repeated frames
    lastFrame = f;
    const c = f % F.cols, rw = (f / F.cols) | 0;
    const u0 = c / F.cols, u1 = (c + 1) / F.cols;
    const v1 = 1 - rw / F.rows, v0 = 1 - (rw + 1) / F.rows;
    // PlaneGeometry's vertex order is TL, TR, BL, BR
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  });
}
function addFX(obj, life, tick){
  scene.add(obj); fx.push({ obj, life, age:0, tick });
}
function stepFX(dt){
  // ⚠️ SLOWING DOWN THE EFFECT CLOCK (`CFG.fxSlow`, production value 1) IS A DEBUG
  // KNOB, and it is load-bearing for showing things to the owner: a production
  // effect lives 150-600 ms, while a headless screenshot costs about a second —
  // it is not on the frame AT ALL. Stretching the life with a constant is not an
  // option: the motion is parametric in t=k·life, and with a longer life the
  // pieces fly off to a different point (distorting exactly what we are showing).
  // Dividing the CLOCK preserves the trajectories bit-for-bit: the same t — the
  // same position.
  if (CFG.fxSlow > 1) dt /= CFG.fxSlow;
  for (let i=fx.length-1;i>=0;i--){
    const f = fx[i]; f.age += dt;
    const k = f.age / f.life;
    if (k >= 1){
      scene.remove(f.obj);
      // GPU leak: effects have personal geometry/material — they must be freed.
      // The compiled PROGRAMS do not die along with them: they are held by the
      // eternal fxProgramAnchors (bottom of the file) — without them three would
      // rebuild the shader on every first tap/bolt after an idle period (jank on
      // weak devices)
      // ⚠️ keepGeo — for the saw halves and for the fire overlay the geometry is
      // SHARED with the item (per-type cache in 30-shapes). Disposing of someone
      // else's is not allowed: the owner of the geometry is whoever created it.
      // ⛔ THE HONEST COST OF THE MISTAKE, MEASURED BY A SABOTAGE TEST AND NOT
      // DERIVED: I wrote here "otherwise all items of the type will go dark" —
      // THAT IS WRONG. A run with keepGeo removed produced a frame differing from
      // the healthy one by those same 6.2%: three does not erase the attributes on
      // dispose and simply re-uploads the buffer. The cost is an EXTRA UPLOAD TO
      // THE GPU, not the disappearance of items. The flag is kept as ownership
      // hygiene, but there is no need to scare anyone with it.
      // ⚠️ TWO DIFFERENT FLAGS, AND THAT IS DELIBERATE. `keepGeo` is the mark of
      // the SAW HALVES; the suite's guard counts the halves by name through it,
      // and hanging it on anything else means quietly spoiling someone else's
      // counter. `sharedFx` means "the geometry and material live LONGER than the
      // effect" (the bowl scatter cache: baked once, run many times).
      const shared = f.obj.userData && (f.obj.userData.keepGeo || f.obj.userData.sharedFx);
      if (f.obj.geometry && !shared) f.obj.geometry.dispose();
      // bolts hand their material back to a free-list (boltMat) — in turbo there
      // are many of them, and there is no point recreating identical
      // MeshBasicMaterials for every discharge;
      // ALL the other effects free their material as before
      if (f.obj.material && !(f.obj.userData && f.obj.userData.sharedFx)){
        if (f.obj.userData && f.obj.userData.poolBolt && boltMatPool.length < BOLT_POOL_MAX) boltMatPool.push(f.obj.material);
        else f.obj.material.dispose();
      }
      fx.splice(i,1); continue;
    }
    f.tick && f.tick(f.obj, k);
  }
}
// Fresnel "ghost": a transparent sphere, denser at the silhouette (a shared
// material for the radius sphere and the markers — no wireframe, it read as an
// artifact)
function fresnelGhostMat(color, base, edge, fpow){
  const p = (fpow || 1.8); // a lower power — a wider and softer edge ("blurred faces")
  return new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false,
    uniforms:{ c:{ value:new THREE.Color(color).convertSRGBToLinear() }, op:{ value:1 } },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV;',
      'void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=mv.xyz; gl_Position=projectionMatrix*mv; }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vN; varying vec3 vV; uniform vec3 c; uniform float op;',
      'void main(){ float ndv=abs(dot(normalize(vN),normalize(-vV))); float fres=pow(1.0-ndv,' + p.toFixed(2) + ');',
      '  float a = op*(' + base.toFixed(3) + ' + smoothstep(0.0, 1.0, fres)*' + edge.toFixed(3) + ');',
      '  gl_FragColor = vec4(c, a); }',
    ].join('\n'),
  });
}
function _popFX_impl(pos){
  const g = new THREE.SphereGeometry(0.2, 10, 8);
  const m = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos);
  addFX(mesh, 0.35, (o,k)=>{ o.scale.setScalar(1+k*6); o.material.opacity = 0.9*(1-k); });
}
function _markerFX_impl(pos, color){
  // a soft pulsing ghost sphere — points at the hidden pair
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), fresnelGhostMat(color, 0.1, 0.5));
  mesh.position.copy(pos); mesh.renderOrder = 11;
  addFX(mesh, 1.1, (o,k)=>{
    o.scale.setScalar(1 + Math.sin(k*Math.PI*4)*0.22);
    o.material.uniforms.op.value = 1-k;
  });
}
function _lineFX_impl(a, b, color){
  const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const m = new THREE.LineDashedMaterial({ color, transparent:true, opacity:0.95, depthTest:false, dashSize:0.3, gapSize:0.15 });
  const line = new THREE.Line(g, m); line.computeLineDistances(); line.renderOrder = 11;
  addFX(line, 1.0, (o,k)=>{ o.material.opacity = 0.95*(1-k); });
}
// Breakdown "INTO DUST": a dense dust cloud in the item's color, THREE size
// fractions (fine/medium/coarse) and a per-vertex spread of shades.
// The owner's iteration history: 70 coarse -> 320 fine -> 640 varied
// -> 1280 "half the size, twice the count" (spec 2026-07-22).
// The dust is SHARED between the match and the grind (bladeDustFX) — it all
// changes together.
// radial=true — a flat ring-shaped scatter (dust from under the mixer blades).
const DUST_FRACTIONS = [
  // ⚠️ THE COUNT IS MULTIPLIED BY CFG.fxScale AT EFFECT TIME (not here): on a
  // weak device the dust is cut threefold, on a normal one it goes at full.
  // ⚡ COARSER AND DENSER (testers' task 2026-08-06, verbatim "coarser and denser
  // particles"). The owner's spec of 2026-07-22 asked for the OPPOSITE ("half the
  // size, twice the count"), and this is not a contradiction: back then the dust
  // was 70 CLUMPS and read as furniture debris, now it is dust, and dust reads as
  // smoke. There is nowhere finer to go, so we grow both the size and the count,
  // adding a fourth fraction — CHUNKS. It is the one that carries "coarser":
  // 0.115 against the previous ceiling of 0.05.
  // ⚠️ A FRACTION = ONE Points (one geometry, one material, one draw call), so
  // +1 line here costs ONE build, not 90 objects.
  { n: 640, size: 0.028 },  // flour
  { n: 520, size: 0.048 },  // crumbs
  { n: 320, size: 0.075 },  // debris
  { n: 90,  size: 0.115 },  // CHUNKS — the new fraction, for the sake of "coarser"
];
const _dustC = new THREE.Color();
function dustCloud(item, radial, COUNT, size, base){
  fxBuildIn('dust');
  const life = 1.0;
  const start = new Float32Array(COUNT*3), vel = new Float32Array(COUNT*3), cols = new Float32Array(COUNT*3);
  for (let i=0;i<COUNT;i++){
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), rr = Math.cbrt(Math.random())*item.r*0.95;
    const ox = Math.sin(ph)*Math.cos(th)*rr, oy = Math.cos(ph)*rr, oz = Math.sin(ph)*Math.sin(th)*rr;
    start[i*3]   = item.p.x + ox; start[i*3+1] = item.p.y + oy; start[i*3+2] = item.p.z + oz;
    const sp = 1.5 + Math.random()*3.0;
    if (radial){ // the blades fling the dust outwards
      vel[i*3]   = ox/(rr||1)*sp*1.7;
      vel[i*3+1] = 0.5 + Math.random()*2.4;
      vel[i*3+2] = oz/(rr||1)*sp*1.7;
    } else {
      vel[i*3]   = ox/(rr||1)*sp;
      vel[i*3+1] = Math.abs(oy/(rr||1))*sp + 1.2;
      vel[i*3+2] = oz/(rr||1)*sp;
    }
    // spread of shades: a touch lighter/darker and a slight hue shift
    _dustC.copy(base).offsetHSL((Math.random()-0.5)*0.04, 0, (Math.random()-0.5)*0.22);
    cols[i*3] = _dustC.r; cols[i*3+1] = _dustC.g; cols[i*3+2] = _dustC.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
  const pts = new THREE.Points(geo, m);
  fxBuildOut();   // the cost of constructing the cloud (see fxBuildMs)
  addFX(pts, life, (o,k)=>{
    const t = k*life, a = o.geometry.attributes.position.array;
    for (let i=0;i<COUNT;i++){
      a[i*3]   = start[i*3]   + vel[i*3]*t;
      a[i*3+1] = start[i*3+1] + vel[i*3+1]*t - 0.5*G*0.35*t*t;
      a[i*3+2] = start[i*3+2] + vel[i*3+2]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1-k;
  });
}
function dissolveFX(item, radial){
  const base = (item.fxColor || item.baseColor);
  // ⚠️ fxScale is read HERE and not in the table: the quality step can change in
  // the middle of a round, and the very next effect must already follow the new one.
  for (const f of DUST_FRACTIONS) dustCloud(item, radial, Math.max(24, Math.round(f.n * CFG.fxScale)), f.size, base);
}
// Dust explosion at the blades: the item has finished grinding — the dust flies
// out from under the knives
function bladeDustFX(pos, baseColor){
  dissolveFX({ p: pos, r: 0.55, baseColor }, true);
}
// ===== PACK EFFECTS FOR POPPING GROUPS (ported from 80-gameplay at PHYSICS'
// request, WORKSTREAMS 2026-07-22). ONLY THE VISUALS live here: the selection
// rule (burstFX, BURST_MIN_N) stayed in 80-gameplay, the physics wave blastWave —
// in 50-physics.
//
// What was polished against the starting version:
// 1) the points became ROUND: with a PointsMaterial without a map a point is
//    drawn as a SQUARE — juice and sparks read as pixels rather than as
//    drops/sparks;
// 2) the stars are not meshes but points with a star map: a point always faces
//    the camera, while a flat mesh caught its edge at the gameplay angle and
//    almost disappeared. As a bonus 5 meshes (5 draw calls, 5 geometries)
//    collapsed into ONE Points.
//    ⚠️ NOT THREE.Sprite: in r149 ALL sprites share ONE geometry, and stepFX
//    disposes the geometry of a burnt-out effect — the very first one would kill
//    all future ones.
// 3) the maps are SHARED and lazy, they live forever. stepFX disposes the
//    material, but NOT its map (three does not touch a material's textures) —
//    a shared cache is safe.
//    ⚠️ DataTexture only: a canvas premultiplies RGB by alpha (the matcap rake).
let _fxDot = null, _fxStar = null;
function fxDotTex(){
  if (_fxDot) return _fxDot;
  const S = 64, d = new Uint8Array(S*S*4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const i = (y*S + x)*4;
    const r = Math.hypot((x + 0.5)/S*2 - 1, (y + 0.5)/S*2 - 1);
    // a dense core + a narrow soft rim: a drop, not a blurred blob
    const a = r >= 1 ? 0 : (r <= 0.72 ? 1 : 1 - (r - 0.72)/0.28);
    d[i] = d[i+1] = d[i+2] = 255; d[i+3] = Math.round(255*a);
  }
  _fxDot = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  _fxDot.needsUpdate = true;
  return _fxDot;
}
function fxStarTex(){
  if (_fxStar) return _fxStar;
  const S = 64, d = new Uint8Array(S*S*4), IN = 0.46, SEG = Math.PI*2/5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const i = (y*S + x)*4;
    const dx = (x + 0.5)/S*2 - 1, dy = (y + 0.5)/S*2 - 1, r = Math.hypot(dx, dy);
    // the star radius by angle: IN in the valley of a sector, 1 on a ray
    let t = Math.atan2(dy, dx) + Math.PI/2;
    t = ((t % SEG) + SEG) % SEG;
    const R = IN + (1 - IN)*Math.abs(t - SEG/2)/(SEG/2);
    const a = Math.max(0, Math.min(1, (R - r)/0.05)); // soft edge
    d[i] = d[i+1] = d[i+2] = 255; d[i+3] = Math.round(255*a);
  }
  _fxStar = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  _fxStar.needsUpdate = true;
  return _fxStar;
}
// ⛔ THE OLD juiceFX (juice) AND sparkFX (sparks) WERE DELETED 2026-08-01 — they
// were replaced by juiceBigFX and sparkRicochetFX at the owner's choice (large
// drops + drops on the screen glass; sparks ricocheting off the walls + a wheel
// rolling away).
// Not a single call to them was left — this was MY garbage after the port, and
// one of them also held the label 'spark', into which the live ricochet was
// writing: the report row was glued together out of two functions and was correct
// only because the old effect is dead. The label registry (fxKindDup) now catches
// that on a run.
// To bring them back if needed: git show <before 2026-08-01>:src/app/70-fx.js.
// cartoon pop (animal): little stars in a fan upwards, always facing the camera
function _starPopFX_impl(it){
  const N = 7, LIFE = 0.7, S0 = 0.34;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = i/N*Math.PI*2 + Math.random()*0.7, sp = 1 + Math.random()*1.6;
    ox.push(it.p.x); oy.push(it.p.y + 0.3); oz.push(it.p.z);
    vx.push(Math.cos(a)*sp); vy.push(3.2 + Math.random()*2.2); vz.push(Math.sin(a)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffd24a, map: fxStarTex(), size: S0,
    transparent: true, opacity: 0.98, depthWrite: false, alphaTest: 0.02 });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 9*t*t;
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.size = S0*(1 - k*0.55);
    o.material.opacity = 0.98*(1 - k*k);
  });
}

// SHARDS (the owner's spec 2026-07-23 "make it shards"): the hard brick/pirate
// packs on a burst and the item under the knives during grinding SPLIT into
// angular pieces. Ported from 80-gameplay + polish (PHYSICS' request,
// WORKSTREAMS 2026-07-23). The selection rule (burstFX) and the grindShred
// timings stay in 80-gameplay — that is their behavior zone.
//
// What was polished against the starting version (a regular TetrahedronGeometry +
// a flat MeshBasicMaterial of a single color):
// 1) THE SHAPE — an IRREGULAR piece: the 4 corners of a regular tetrahedron are
//    shifted in different directions, every chip is unique and reads as debris
//    and not as a "d4 die";
// 2) PER-FACE TINT — a MeshBasicMaterial has no lighting, so we bake the volume
//    into the VERTEX COLORS: a face is lighter/darker according to its normal
//    relative to the key light (the same one as the matcap's:
//    above-left-in-front). A flat piece stops being a silhouette blob — faces of
//    differing brightness give relief;
// 3) SOUND — the "crunch" of the split (75-audio 'crunch', a spectrum above the
//    rumble of grind).
// ⚠️ EVERY shard has ITS OWN geometry+material: stepFX disposes of both, and a
// shared cache cannot be handed out (the first one to burn out would kill the
// buffer for the rest — the Sprite/star rake). The ballistics are parametric in
// t=k·life — FPS-independent.
// ⚠️⚠️ THE SHARD LIGHT IS DERIVED FROM MATCAP_LIGHT (10-stage), NOT A COPY OF IT.
// A shard carries volume through a tint BAKED along that direction, while the
// item itself carries a matcap along MATCAP_LIGHT. As long as these were two
// constants, they were kept equal BY HAND — and the owner's very first edit
// through the panel (it edits only MATCAP_LIGHT) would have split the lighting in
// two: the pile under one light, its debris under another, and in the explosion
// frame they are right next to each other.
// ⚠️ Recomputed FOR EVERY SHARD, not once at load: the tuner turns MATCAP_LIGHT
// ON A LIVE SCENE, and a snapshot of the value taken at startup would lag behind
// the slider. The cost is three multiplications and a square root per chip, which
// is nothing next to generating the geometry.
const SHARD_LIGHT = new THREE.Vector3();
function syncShardLight(){
  SHARD_LIGHT.set(MATCAP_LIGHT.x, MATCAP_LIGHT.y, MATCAP_LIGHT.z).normalize();
}
const _shA = new THREE.Vector3(), _shB = new THREE.Vector3(), _shC = new THREE.Vector3(), _shN = new THREE.Vector3();
// the 4 corners of a regular tetrahedron — we tint and jitter them in place
const SHARD_CORNERS = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
const SHARD_FACES = [[0,1,2],[0,3,1],[0,2,3],[1,3,2]]; // faces outward (CCW from outside)
function makeShardGeo(size){
  syncShardLight();            // the light comes from the single source (10-stage)
  // a corner = unit, shifted by ±38% — an irregular fragment
  const c = SHARD_CORNERS.map(v => new THREE.Vector3(
    v[0] + (Math.random()-0.5)*0.75, v[1] + (Math.random()-0.5)*0.75, v[2] + (Math.random()-0.5)*0.75
  ).multiplyScalar(size*0.6));
  const pos = new Float32Array(36), col = new Float32Array(36);
  for (let f = 0; f < 4; f++){
    const [i0, i1, i2] = SHARD_FACES[f];
    _shA.copy(c[i0]); _shB.copy(c[i1]); _shC.copy(c[i2]);
    // face normal -> brightness by the key light (0.62 shadow … 1.30 highlight)
    _shN.copy(_shB).sub(_shA).cross(_shC.clone().sub(_shA)).normalize();
    const tint = Math.max(0.55, Math.min(1.32, 0.9 + 0.42*_shN.dot(SHARD_LIGHT)));
    for (let v = 0; v < 3; v++){
      const src = v === 0 ? _shA : v === 1 ? _shB : _shC, o = (f*3 + v)*3;
      pos[o] = src.x; pos[o+1] = src.y; pos[o+2] = src.z;
      col[o] = col[o+1] = col[o+2] = tint;   // a gray multiplier — the color is carried by material.color
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function _shardFX_impl(pos, color, opts){
  opts = opts || {};
  const N = opts.count || 8, LIFE = opts.life || 0.6, up = opts.up || 3.2;
  const spread = opts.spread || 3.2, sz = opts.size || 0.15;
  const col = color || new THREE.Color(0x9aa0a8);
  if (opts.sound !== false) Sound.play('crunch', N);
  for (let i = 0; i < N; i++){
    const geo = makeShardGeo(sz*(0.7 + Math.random()*0.7));
    // vertexColors: there is no matcap light, the volume is carried by the face tint baked into the vertices
    const mat = new THREE.MeshBasicMaterial({ color: col, vertexColors: true,
      transparent: true, opacity: 1, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.userData.shard = true;   // mark for the shape-uniqueness guard (__game.shardShapes)
    const a = Math.random()*Math.PI*2, e = (0.15 + Math.random()*0.6)*Math.PI*0.5, sp = spread*(0.5 + Math.random());
    const vx = Math.cos(a)*Math.cos(e)*sp, vy = up*(0.5 + Math.random()*0.7) + Math.sin(e)*sp*0.3, vz = Math.sin(a)*Math.cos(e)*sp;
    const rx = (Math.random()-0.5)*16, ry = (Math.random()-0.5)*16, rz = (Math.random()-0.5)*16;
    const o0 = pos.clone(); o0.y += 0.12;
    addFX(m, LIFE, (o, k) => {
      const t = k*LIFE;
      o.position.set(o0.x + vx*t, o0.y + vy*t - 11*t*t, o0.z + vz*t); // ½·G·t², G=22
      o.rotation.set(rx*t, ry*t, rz*t);
      o.scale.setScalar(Math.max(0.001, 1 - k*0.3));
      o.material.opacity = 1 - k*k;
    });
  }
}

// ===== THE OWNER'S CHOICE OF EFFECTS 2026-08-01 (ported from the test bench) =====
// A bench of nine variants was shown to the owner, three were chosen: the
// COLLAPSE of a group into the tap point, the SAWING of an item into halves under
// the knives, fire in TONGUES ALONG THE SILHOUETTE; the ×1.7 strength is wired
// into the constants (00-config), there is no separate knob in the game.
// The selection rule lives in 80-gameplay (doMatch/grindShred) — only the visuals
// are here.

// COLLAPSE: the group flies together into the tap point over COLLAPSE_MS,
// shrinking on the way. The point of the change is to give the match an
// ADDRESSEE: previously the items simply shrank in place, and the dust read as
// "an effect instead of an item" rather than as the consequence of a blow.
// ⚠️ THE POP DOES NOT LIVE HERE. It is hung by the caller on THE SAME REAL CLOCK
// as removeItem (setTimeout in doMatch): the animation runs on GAME time, and on
// a sagging FPS the tick does not reach the end — the pop would never arrive at
// all. One clock for "the items disappeared" and "it banged" is the only stable
// option.
// ⚠️ By this moment the bodies have ALREADY been torn down (destroyItemBody at the
// start of doMatch), so the mesh animations have nobody to argue with; there is
// nothing to silence.
// ⚡ AN IMPACT AT THE COLLAPSE POINT (testers' task 2026-08-06 "more drive when
// objects are joined, more effects"). THREE LAYERS on top of the previous carrier:
//   (1) the shockwave RING — billboarded to the camera, it expands and fades;
//   (2) the FLASH core — short, twice as short as the ring: this is a blow, not a
//       glow;
//   (3) the ARROWS — large sparks radially, size 0.13 (the "chunks" class, not
//       dust).
// ⚠️ WHY A COMMON LAYER AND NOT A REINFORCEMENT OF THE PACKS: the pack effects
// (juice/sparks/stars/shards) only go to groups >= BURST_MIN_N, while the testers
// see "not enough drive" on PAIRS too — and there until now there was only dust.
// The impact is given to EVERY join, and its size grows with the group.
// ⚠️ BILLBOARDING THROUGH camera.quaternion IN THE TICK, and not once at build
// time: the player rotates the camera by dragging, and a ring oriented at the
// start would show its edge (the same rake because of which the pack stars are
// points and not meshes).
// ⚠️ NOT additive: on a bright daytime sky an additive glow is invisible (the
// bolt-pack rule, 2026-07-21).
// ⚠️⚠️ WITHOUT A DEPTH TEST (depthTest:false + renderOrder) — OTHERWISE THE
// IMPACT IS NOT VISIBLE AT ALL. The pop happens at the TAP point, i.e. INSIDE the
// dense pile, and a ring with a radius of up to 2.5 is entirely covered by the
// items in front of it. Caught by filming with a ×10 slowdown: the `lastImpact`
// snapshot honestly showed the ring that had been built, yet there was nothing in
// the frame. The pack effects do not suffer from this — their particles fly out
// of the pile within tens of milliseconds. Punching through the depth is not
// "cheating" but the essence of the blow: it must read through the mass, like a
// flash.
// 🔵 THE RING FAMILY BY THE CHARACTER OF THE ITEM (the owner's word 2026-08-06
// "try a different width and shape of ring for different objects").
// ⚠️⚠️ DETERMINISTIC FROM THE TYPE, NOT RANDOM: one and the same item must give
// ONE AND THE SAME ring — then it reads as a PROPERTY of the item. A random shape
// would read as a glitch (the same principle as with fxColor).
// ⚠️ AND NOT FROM A HASH OF THE NAME: the shape is taken from the ITEM ITSELF —
// from the bounds of its geometry and from the pack. A hash would give variety
// but not meaning: an elongated banana would end up with a round ring, and a
// brick with an oval.
// There are THREE families, no more are needed (and the owner asked to "try", not
// for "all 120").
// 🔥 THE FIRE PALETTE IS ONE FOR THE FLAME AND FOR THE BURST. The numbers are
// taken from the fireSilhouetteFX shader: yellow / deep orange / almost-white
// highlight. Keep them together: the burst must read as "the same fire flared up"
// and not as a new effect (the same logic as with SHARD_LIGHT — a shared source
// instead of copies).
const FIRE_HOT  = new THREE.Color(1.0, 0.85, 0.25);
const FIRE_DEEP = new THREE.Color(1.0, 0.28, 0.06);
const FIRE_CORE = new THREE.Color(1.0, 0.97, 0.80);
// A TORN ring for a burning match: the outer radius dances in tongues. The
// profile is DETERMINISTIC (sines of the index, no Math.random) — otherwise the
// ring would flicker in shape from match to match, and that reads as a glitch.
function makeTornRingGeo(inner, seg){
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++){
    const a = i / seg * Math.PI * 2;
    const tongue = 1.0 + 0.20 * Math.sin(i * 2.7) + 0.12 * Math.sin(i * 5.3 + 1.1);
    pos.push(Math.cos(a) * inner, Math.sin(a) * inner, 0);
    pos.push(Math.cos(a) * tongue,  Math.sin(a) * tongue,  0);
  }
  for (let i = 0; i < seg; i++){
    const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
    idx.push(a0, b0, b1, a0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const RING_FAM = new Map();      // type name -> {fam, w, seg, kx}
function ringFamFor(type, geo){
  const key = (type && type.name) || 'none';
  if (RING_FAM.has(key)) return RING_FAM.get(key);
  let elong = 1;
  const g = geo || (type && type.geo);
  if (g){
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox, d = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
      .map(v => Math.abs(v)).sort((a, c) => c - a);
    if (d[2] > 1e-4) elong = d[0] / ((d[1] + d[2]) / 2);
  }
  const tex = type && type.tex;
  const hard = tex === 'brick' || tex === 'pirate'; // ⛔ 'rock' taken off the stones (2026-08-17)
  let fam;
  if (elong >= IMPACT_ELONG_AT) fam = 'oval';      // elongated ones — an oval along the silhouette
  else if (hard) fam = 'polygon';            // the same packs that split into shards
  else fam = 'circle';
  const v = fam === 'oval'
      ? { fam, w: IMPACT_W_OVAL, seg: 44, kx: IMPACT_OVAL_K, elong: +elong.toFixed(2) }
    : fam === 'polygon'
      ? { fam, w: IMPACT_W_POLY, seg: IMPACT_POLY_SEG, kx: 1, elong: +elong.toFixed(2) }
      : { fam, w: IMPACT_W_ROUND, seg: 48, kx: 1, elong: +elong.toFixed(2) };
  RING_FAM.set(key, v);
  return v;
}
// 🔥 A FIRE BURST when a BURNING kind is joined (the owner's word 2026-08-06).
// Two carriers, both Points (the cost lives in the object, not in the particle):
//   THE PLUME — tongues, they rise WITH UPWARD ACCELERATION and cool from white
//          into deep orange (the dust and the arrows move the opposite way — they
//          fall);
//   THE EMBERS — rare bright sparks on ballistics, they live longer than the plume
//          and go out in flight.
// ⚠️ WITHOUT A DEPTH TEST, just like the impact: the burst is born at the tap
// point, INSIDE the dense pile — with depthTest it would be covered by the items
// entirely (my lesson of 2026-08-06, it cost a measurement with a ×10 slowdown).
let lastFireBurst = null;   // ⚠️ LOAD-BEARING: the guard "a burst only on a burning one" stands on this
function _fireBurstFX_impl(pos, n){
  const k = Math.min(1, Math.max(0, (n - 2) / Math.max(1, MATCH_MAX_N - 2)));
  const N = Math.max(24, Math.round(FIREB_PLUME_N * (0.75 + 0.5 * k) * CFG.fxScale));
  const M = Math.max(10, Math.round(FIREB_EMBER_N * (0.75 + 0.5 * k) * CFG.fxScale));
  // --- THE PLUME
  const pp = new Float32Array(N * 3), pc = new Float32Array(N * 3);
  const vx = [], vy = [], vz = [], ph = [];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++){
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    vx.push(Math.cos(a) * r * FIREB_PLUME_SPREAD);
    vz.push(Math.sin(a) * r * FIREB_PLUME_SPREAD);
    vy.push(FIREB_PLUME_UP * (0.55 + Math.random() * 0.8));
    ph.push(Math.random() * 6.28);
    c.copy(FIRE_CORE).lerp(FIRE_HOT, Math.random());
    pc[i*3] = c.r; pc[i*3+1] = c.g; pc[i*3+2] = c.b;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const pm = new THREE.PointsMaterial({ vertexColors: true, map: fxDotTex(),
    size: FIREB_PLUME_SIZE * (0.85 + 0.4 * k), transparent: true, opacity: 1,
    depthWrite: false, depthTest: false, alphaTest: 0.02 });
  const plume = new THREE.Points(pg, pm); plume.renderOrder = IMPACT_ORDER;
  const psize = pm.size;
  addFX(plume, FIREB_PLUME_LIFE, (o, t) => {
    const arr = o.geometry.attributes.position.array;
    const col = o.geometry.attributes.color.array;
    const tt = t * FIREB_PLUME_LIFE;
    for (let i = 0; i < N; i++){
      // ⚠️ acceleration UPWARDS: fire rises. Plus a sideways sway — a tongue, not a column
      arr[i*3]   = pos.x + vx[i] * tt + Math.sin(ph[i] + tt * 7) * 0.18 * tt;
      arr[i*3+1] = pos.y + vy[i] * tt + 0.5 * FIREB_PLUME_ACC * tt * tt;
      arr[i*3+2] = pos.z + vz[i] * tt + Math.cos(ph[i] + tt * 6) * 0.18 * tt;
      // cooling: white core -> yellow -> deep orange
      c.copy(FIRE_HOT).lerp(FIRE_DEEP, Math.min(1, t * 1.4));
      col[i*3] = col[i*3] * 0.72 + c.r * 0.28;
      col[i*3+1] = col[i*3+1] * 0.72 + c.g * 0.28;
      col[i*3+2] = col[i*3+2] * 0.72 + c.b * 0.28;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.geometry.attributes.color.needsUpdate = true;
    o.material.opacity = 1 - t * t;
    o.material.size = psize * (1 + 0.55 * t);   // the tongue swells as it rises
  });
  // --- THE EMBERS
  const ep = new Float32Array(M * 3), evx = [], evy = [], evz = [];
  for (let i = 0; i < M; i++){
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * Math.PI * 0.6;
    const sp = FIREB_EMBER_V * (0.5 + Math.random() * 0.8);
    evx.push(Math.cos(a) * Math.cos(e) * sp);
    evy.push(Math.sin(e) * sp + 2.6);
    evz.push(Math.sin(a) * Math.cos(e) * sp);
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const em = new THREE.PointsMaterial({ color: FIRE_CORE, map: fxDotTex(),
    size: FIREB_EMBER_SIZE, transparent: true, opacity: 1,
    depthWrite: false, depthTest: false, alphaTest: 0.02 });
  const embers = new THREE.Points(eg, em); embers.renderOrder = IMPACT_ORDER;
  addFX(embers, FIREB_EMBER_LIFE, (o, t) => {
    const arr = o.geometry.attributes.position.array, tt = t * FIREB_EMBER_LIFE;
    for (let i = 0; i < M; i++){
      arr[i*3]   = pos.x + evx[i] * tt;
      arr[i*3+1] = pos.y + evy[i] * tt - 11 * tt * tt;   // ½·G·t², G=22
      arr[i*3+2] = pos.z + evz[i] * tt;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - t * t * t;
    o.material.size = FIREB_EMBER_SIZE * (1 - t * 0.5);
  });
  lastFireBurst = { n, k: +k.toFixed(3), plume: N, embers: M,
                    over: pm.depthTest === false && em.depthTest === false,
                    ms: performance.now() };
}
let lastImpact = null;      // ⚠️ LOAD-BEARING: the guard "the impact grows with the group" stands on this
function _impactFX_impl(pos, n, tint, ghost, hot){
  const k = Math.min(1, Math.max(0, (n - 2) / Math.max(1, MATCH_MAX_N - 2)));
  const base = (tint || new THREE.Color(0xffffff)).clone();
  // ⚠️ THE IMPACT COLOR IS SATURATED, NOT WHITISH. The first version pulled the
  // hue 55% towards white, and on a light pile under a light sky the ring
  // DISAPPEARED altogether (caught by ×10 filming: the diagnostic red ring was in
  // the frame, the production one was not).
  // The same law as with the bolts: on a light background it is the SATURATED
  // that reads, not the bright.
  // 🔥 A BURNING MATCH GETS A FIERY AND TORN RING (the owner's word 2026-08-06):
  // the hue is taken from the flame palette, the profile is in tongues. This is a
  // FOURTH family, but by STATE and not by type: today one item burns, tomorrow
  // another, and the ring must belong to the EVENT. The determinism is intact —
  // the profile of the torn ring is computed with sines of the index, without
  // randomness.
  const hotCol = hot ? FIRE_HOT.clone().lerp(FIRE_CORE, 0.25)
                     : base.clone().offsetHSL(0, 0.35, 0.02).lerp(new THREE.Color(1, 1, 1), 0.12);
  // (1) THE RING
  const R = IMPACT_R0 * (1 + IMPACT_R_K * k);
  // ⚠️ THE WIDTH AND SHAPE COME FROM THE CHARACTER OF THE ITEM (ringFamFor above),
  // the transparency is common, IMPACT_ALPHA. The former "the ring must be thin"
  // is CANCELLED by the owner's word: he saw the thin one and asked for mass. The
  // condition lives on in another form — mass is gained through WIDTH at a REDUCED
  // density, and not through white.
  const fam = ringFamFor(ghost && ghost.type, ghost && ghost.geo);
  const ring = new THREE.Mesh(
    hot ? makeTornRingGeo(fam.w, FIREB_RING_SEG) : new THREE.RingGeometry(fam.w, 1.0, fam.seg),
    new THREE.MeshBasicMaterial({ color: hotCol, transparent: true, opacity: IMPACT_ALPHA,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  ring.renderOrder = IMPACT_ORDER;
  ring.position.copy(pos);
  addFX(ring, IMPACT_MS / 1000, (o, t) => {
    o.quaternion.copy(camera.quaternion);
    const e = 1 - (1 - t) * (1 - t);             // sharp start, soft exit
    const sc = 0.22 + (R - 0.22) * e;
    o.scale.set(sc * (hot ? 1 : fam.kx), sc, sc); // kx>1 for the oval; the torn one has no stretch
    o.material.opacity = IMPACT_ALPHA * (1 - t * t);
  });
  // (2) THE FLASH CORE
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([pos.x, pos.y, pos.z]), 3));
  const fm = new THREE.PointsMaterial({ color: hotCol, map: fxDotTex(),
    size: IMPACT_FLASH_SIZE * (0.7 + 0.6 * k), transparent: true, opacity: 1,
    depthWrite: false, depthTest: false, alphaTest: 0.02 });
  const flashSize = fm.size;
  const flash = new THREE.Points(fg, fm); flash.renderOrder = IMPACT_ORDER;
  addFX(flash, IMPACT_FLASH_MS / 1000, (o, t) => {
    o.material.size = flashSize * (1 + 0.9 * t);
    o.material.opacity = 1 - t * t;
  });
  // (3) THE ARROWS
  const N = Math.max(8, Math.round(IMPACT_ARROW_N * (1 + k) * CFG.fxScale));
  const ap = new Float32Array(N * 3), vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.35) * Math.PI * 0.7;
    const sp = IMPACT_ARROW_V * (0.55 + Math.random() * 0.75) * (0.8 + 0.5 * k);
    vx.push(Math.cos(a) * Math.cos(e) * sp);
    vy.push(Math.sin(e) * sp + 1.4);
    vz.push(Math.sin(a) * Math.cos(e) * sp);
  }
  const am = new THREE.PointsMaterial({ color: base.clone().lerp(new THREE.Color(1,1,1), 0.25),
    map: fxDotTex(), size: IMPACT_ARROW_SIZE, transparent: true, opacity: 1,
    depthWrite: false, depthTest: false, alphaTest: 0.02 });
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
  const arrows = new THREE.Points(ag, am); arrows.renderOrder = IMPACT_ORDER;
  addFX(arrows, 0.42, (o, t) => {
    const arr = o.geometry.attributes.position.array, tt = t * 0.42;
    for (let i = 0; i < N; i++){
      arr[i*3]   = pos.x + vx[i] * tt;
      arr[i*3+1] = pos.y + vy[i] * tt - 11 * tt * tt;   // ½·G·t², G=22
      arr[i*3+2] = pos.z + vz[i] * tt;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - t * t;
    o.material.size = IMPACT_ARROW_SIZE * (1 - t * 0.45);
  });
  // a snapshot of the LAST impact for the guard: the group size, the target ring
  // radius, the number of arrows. Read right after the match — all three grow
  // with n.
  // ⚠️ `over` is NOT report cosmetics: the impact is born inside the pile, and
  // without punching through the depth it is not visible AT ALL (see the big
  // comment above). The guard reads exactly this flag, because the defect was
  // silent.
  lastImpact = { n, k: +k.toFixed(3), ringR: +R.toFixed(3), arrows: N,
                 flash: +fm.size.toFixed(3),
                 fam: hot ? 'torn' : fam.fam, w: +(1 - fam.w).toFixed(3),
                 seg: hot ? FIREB_RING_SEG : fam.seg, kx: hot ? 1 : fam.kx, hot: !!hot,
                 elong: fam.elong, alpha: IMPACT_ALPHA,
                 over: ring.material.depthTest === false && fm.depthTest === false };
}
// ⚠️ THE DURATION IS A PARAMETER (COLLAPSE_MS by default): a match pulls a
// handful together in 150 ms, while the bowl scatter pulls the WHOLE pile to the
// center, and over such a distance 150 ms reads as a teleport and not as a
// flying-together.
// ⚠️⚠️ THE REAL-CLOCK MODE (`real`) IS NOT DECORATION BUT A REPAIR. The addFX tick
// runs on GAME time, while the removal of the items after they fly together runs
// on setTimeout, i.e. on the REAL one. Over the 150 ms of a match the difference
// is unnoticeable, but over the 620 ms of the gathering after a scatter the clocks
// diverge: under load the pile DOES NOT MANAGE to reach the center and disappears
// halfway. Caught by a guard in the suite (the radius settled at 1.73 instead of
// 0, five samples instead of eighteen), it did not reproduce in isolation.
// This is the same law by which the match pop hangs on removeItem's clock.
function _collapseFX_impl(list, at, ms, real){
  const P = at.clone();
  const src = [];
  for (const it of list){
    if (!it.mesh) continue;
    src.push({ mesh: it.mesh, p0: it.mesh.position.clone(), s0: it.mesh.scale.x });
  }
  if (!src.length) return;
  const LIFE = ms || COLLAPSE_MS, t0 = performance.now();
  addFX(new THREE.Object3D(), LIFE / 1000, (o, k) => {
    if (real) k = Math.min(1, (performance.now() - t0) / LIFE);
    const e = k * k * (3 - 2 * k);        // smooth start, sharp arrival
    for (const s of src){
      s.mesh.position.lerpVectors(s.p0, P, e);
      const sq = s.s0 * (1 - COLLAPSE_SQUASH * e);
      s.mesh.scale.set(sq * (1 + 0.5 * e), sq, sq * (1 + 0.5 * e));
      s.mesh.rotation.y += 0.25 * (1 + e);
    }
  });
}

// FOOD: fewer drops, but LARGE ones, plus a few land "on the screen glass".
// That is exactly what reads as juiciness: the player sees that it splashed AT HIM.
function _juiceBigFX_impl(it){
  // FINE SPLASHES (the owner's edit 2026-08-02): a spray in the plane of the
  // scene — many small points in a short fan from the collapse point, they fade
  // fast.
  // ⚠️ MORE IN NUMBER, SMALLER IN SIZE — and this is NOT a rollback to the old
  // juiceFX: that one poured 46 points of size 0.40 in a column upwards. Here the
  // size is of the crumb class (0.075 against the dust's 0.0225-0.05), the scatter
  // is a FAN and the life is twice as short.
  // ⚠️ Perf canon: the particle tick is cheap, it is the BUILD that is expensive —
  // for the juice it was 0.62 ms, and growing the number of points barely moves it
  // (one geometry, one material regardless of N).
  const N = Math.max(12, Math.round(JUICE_N * CFG.fxScale));
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    // fan: the azimuth is uniform, the elevation is LOW — the splashes spread outwards
    const a = Math.random()*Math.PI*2;
    const e = Math.random()*Math.PI*0.42;            // up to ~38° above the horizon
    const sp = JUICE_SPREAD*(0.45 + Math.random()*0.75);
    ox.push(it.p.x); oy.push(it.p.y + 0.15); oz.push(it.p.z);
    vx.push(Math.cos(a)*Math.cos(e)*sp);
    vy.push(Math.sin(e)*sp + 0.8);
    vz.push(Math.sin(a)*Math.cos(e)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = (it.fxColor || it.baseColor || new THREE.Color(0xff5a6e)).clone()
    .lerp(new THREE.Color(1, 1, 1), 0.14);
  const m = new THREE.PointsMaterial({ color: c, map: fxDotTex(), size: JUICE_SIZE,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02 });
  addFX(new THREE.Points(g, m), JUICE_LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*JUICE_LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 11*t*t;   // ½·G·t², G=22
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k;
    o.material.size = JUICE_SIZE*(1 - k*0.35);
  });
}
// ⛔ THE DROPS "ON THE SCREEN GLASS" (screenDripsFX) WERE DELETED 2026-08-02 at
// the owner's word: "they are not in the plane of the blender". This was a DOM
// layer on top of the canvas — the drops lived in SCREEN coordinates and did not
// depend on the camera, which is what made them alien in a game where everything
// happens inside the bowl. The #juiceDrips container and the note about the Safari
// stripes recipe (the background of a fixed element) went away together with them.
// To bring back = git show <before 2026-08-02>:src/app/70-fx.js.

// VEHICLES: the sparks BOUNCE off the bowl walls + a wheel part flies off.
// The ricochet is what was missing: the sparks simply flew away, and the eye did
// not count them as part of the world. The bounce ties the effect to the bowl.
// ⚠️ THE BOUNCE IS ANALYTICAL, by radiusAt(y) — no colliders and no bodies:
// the pack's rule "effect pieces stay animation" (00-config).
function _sparkRicochetFX_impl(it){
  const N = Math.max(10, Math.round(SPARK_N * CFG.fxScale)), LIFE = 0.6, S0 = 0.24;
  const pos = new Float32Array(N*3), st = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, e = Math.random()*Math.PI*0.5, sp = 5 + Math.random()*6;
    st.push({ x: it.p.x, y: it.p.y + 0.2, z: it.p.z, bounced: 0,
              vx: Math.cos(a)*Math.cos(e)*sp, vy: Math.sin(e)*sp, vz: Math.sin(a)*Math.cos(e)*sp });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffe08a, map: fxDotTex(), size: S0,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02 });
  let prev = 0;
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const t = k*LIFE, dt = Math.max(0.0001, t - prev); prev = t;
    const p = o.geometry.attributes.position.array;
    for (let i = 0; i < N; i++){
      const s = st[i];
      s.vy -= 9*dt;
      s.x += s.vx*dt; s.y += s.vy*dt; s.z += s.vz*dt;
      // ⚠️ the width comes from the DIRECTION (`wallDistAt`) and not from an own
      // formula: where the wall is, is answered by ONE point for the whole game
      // (20-arena), otherwise the sparks and the rescuer would drift apart
      const d = Math.hypot(s.x, s.z);
      const R = wallDistAt(s.y, d > 1e-3 ? s.x/d : 1, d > 1e-3 ? s.z/d : 0) - 0.15;
      if (d > R && s.bounced < SPARK_BOUNCE_MAX){
        const nx = s.x/d, nz = s.z/d, vn = s.vx*nx + s.vz*nz;
        s.vx -= 2*vn*nx*SPARK_BOUNCE; s.vz -= 2*vn*nz*SPARK_BOUNCE;
        s.x = nx*R; s.z = nz*R; s.bounced++;
      }
      p[i*3] = s.x; p[i*3+1] = s.y; p[i*3+2] = s.z;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k;
    o.material.size = S0*(1 - k*0.25);
  });
  wheelFX(it);
}
// The wheel: it flies off, falls, settles and ROLLS AWAY, losing momentum. A
// small thing that turns "sparks" into "something fell off".
function _wheelFX_impl(it){
  const R = 0.13, LIFE = 1.5;
  const w = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R*0.55, 14),
    new THREE.MeshBasicMaterial({ color: 0x2c3038, transparent: true, opacity: 1 }));
  const a = Math.random()*Math.PI*2, sp = 2.2 + Math.random()*1.6;
  const vx = Math.cos(a)*sp, vz = Math.sin(a)*sp, o0 = it.p.clone();
  const floor = FLOOR_REST + R*0.3;
  addFX(w, LIFE, (o, k) => {
    const t = k*LIFE;
    let y = o0.y + 3.0*t - 11*t*t;
    const rolling = y <= floor;
    if (rolling) y = floor;
    const damp = rolling ? Math.max(0, 1 - (t - 0.35)*0.8) : 1;
    o.position.set(o0.x + vx*t*damp, y, o0.z + vz*t*damp);
    o.rotation.set(Math.PI/2, -a, 0);
    o.rotateY(rolling ? -t*sp/R*damp : t*7);
    if (k > 0.8) o.material.opacity = (1 - k)/0.2;
  });
}

// SAWING: the item falls apart INTO TWO HALVES along the cut plane, each one
// slides off the cut and falls under the knives. The halves are REAL — we cut with
// a clipping plane along the same model, so the cut is honest and the trick works
// on ANY item in the pool without preprocessing the geometry.
// ⚠️ REQUIRES renderer.localClippingEnabled (set in 10-stage at startup).
// ⚠️ NEITHER mesh.clone() NOR material.clone(): three copies userData through
// JSON.parse(JSON.stringify), and the items have references there to the Rapier
// body and to the matcap patch's shader object — "Converting circular structure to
// JSON", and the effect fell over entirely. We assemble the half directly.
// ⚠️ THE GEOMETRY IS SHARED WITH THE ITEM, the halves are marked keepGeo — stepFX
// disposes the geometry of a burnt-out effect, while for items it is shared PER
// TYPE (the 30-shapes cache).
// The cost of the mistake is an extra re-upload of the buffer to the GPU (measured
// by a sabotage test; the items DO NOT disappear, three keeps the attributes and
// uploads them again).
// ⚠️⚠️ THERE IS NO GEOMETRY CLONE HERE, AND THAT IS NOT AN OVERSIGHT. On the bench
// the halves cloned the item's geometry — that cost 3.20 ms under CPU ×4 and was
// the most expensive construction of the set; a per-type cache was planned for it.
// During the port it turned out that the clone is not needed AT ALL: the keepGeo
// flag (see stepFX) already forbids disposing of someone else's geometry, and the
// clone was not needed for anything else — the cut plane lives in the MATERIAL,
// and each half has its own.
// Result: 3.20 ms -> 0, the cache and its memory were not needed.
// ⛔ Do not "optimize" this back into clone(): disposing of the type's shared
// geometry would black out every item of that type in the pile.
function sawVisualMat(src){
  const o = { color: src.color ? src.color.clone() : undefined, map: src.map || null,
              vertexColors: !!src.vertexColors, transparent: true, opacity: 1,
              side: THREE.DoubleSide };   // the cut must not be a hole
  if (src.isMeshMatcapMaterial){ o.matcap = src.matcap || null; return new THREE.MeshMatcapMaterial(o); }
  return new THREE.MeshBasicMaterial(o);
}
function _sawFX_impl(item){
  const mesh = item.mesh, p0 = mesh.position.clone();
  const a = Math.random()*Math.PI;
  const nrm = new THREE.Vector3(Math.cos(a), SAW_TILT, Math.sin(a)).normalize();
  const geo = mesh.geometry;          // SHARED with the item — the halves are marked keepGeo
  Sound.play('crunch', 6);
  for (const sgn of [1, -1]){
    // ⚠️ the geometry is SHARED with the item and with the other half — we mark it
    // keepGeo, otherwise stepFX would dispose it and black out every item of this type.
    const m = new THREE.Mesh(geo, sawVisualMat(mesh.material));
    m.position.copy(p0); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    m.userData.keepGeo = true;
    m.material.clippingPlanes = [new THREE.Plane(nrm.clone().multiplyScalar(-sgn), nrm.dot(p0)*sgn)];
    const off = nrm.clone().multiplyScalar(sgn);
    const spin = (Math.random()-0.5)*6 + sgn*3;
    addFX(m, SAW_LIFE, (o, k) => {
      const t = k*SAW_LIFE;
      o.position.set(p0.x + off.x*t*1.6, p0.y + off.y*t*0.6 - 9*t*t, p0.z + off.z*t*1.6);
      o.rotation.z = spin*t*0.5; o.rotation.x = spin*t*0.3;
      o.material.clippingPlanes[0].constant = nrm.dot(o.position)*sgn; // the cut travels with the half
      if (k > 0.7) o.material.opacity = (1-k)/0.3;
    });
  }
}

// FIRE ALONG THE SILHOUETTE: an inflated copy of the mesh with a Fresnel shader —
// the flame licks the item's shape and lives along its silhouette rather than next
// to it. A relative of the reachability ghost halo, so it fits the style by
// construction.
// ⚠️⚠️ WE DO NOT TOUCH THE ITEM'S MATERIAL FOR EVEN ONE FRAME: the collection
// portraits are rendered by the same material class, and "hot" would leak into the
// museum — the same class of rake as with the two consumers of uVeil. Fire is only
// an OVERLAY on top of the mesh.
// ⚠️ IT LIVES INDEFINITELY LONG, which is why it does not go through addFX (that
// one is about a finite life): its own fires list and its own tick from 99-main.
// Returns an extinguishing function.
// ⚠️⚠️ THE ICE CRUST LIVES IN ITS OWN LIST, AND THAT IS LOAD-BEARING: the flame
// is put out by `extinguishAll` on the burn timer, and had the cold crust landed
// in `fires` it would have died together with somebody else's fire. Its own end is
// different: the ice was smashed or the item is gone.
const fires = [], chills = [];
// THE BURNING ITEM: mechanics state. We keep it HERE, next to the fire, and not in
// the gameplay — burning is what exactly this module knows how to do. Outwards we
// hand out only the type name: on it the dispatcher hangs the bonus for collecting
// a group (a seam, his zone).
let burningItem = null, burnUntil = 0;
function burningItemRef(){ return (burningItem && burningItem.alive) ? burningItem : null; }
function burningName(){
  return (burningItem && burningItem.alive && burningItem.type) ? burningItem.type.name : null;
}
function igniteItem(it, ms){
  if (!it || !it.alive) return null;
  extinguishAll();                       // no more than one burns at a time
  fireSilhouetteFX(it);
  heatShellFX(it);                       // the red-hot crust UNDER the flame
  burningItem = it;
  burnUntil = performance.now() + (ms || FIRE_BURN_MS);
  return it;
}
function _fireSilhouetteFX_impl(item){
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { t: { value: 0 }, op: { value: 1 } },
    vertexShader: [
      'uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      '  vN = normalize(normalMatrix*normal); vP = position;',
      '  float puff = ' + FIRE_PUFF.toFixed(3) + ' + 0.10*sin(t*7.0 + position.y*9.0) + 0.07*sin(t*11.0 + position.x*7.0);',
      '  vec3 p = position + normal*puff;',
      '  p.y += 0.16 + 0.12*sin(t*6.0 + position.x*5.0);',
      '  vec4 mv = modelViewMatrix*vec4(p,1.0); vV = mv.xyz;',
      '  gl_Position = projectionMatrix*mv; }',
    ].join('\n'),
    fragmentShader: [
      'uniform float t; uniform float op; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      '  float ndv = abs(dot(normalize(vN), normalize(-vV)));',
      '  float fres = pow(1.0 - ndv, 1.35);',
      '  float tongue = 0.55 + 0.45*sin(vP.y*16.0 - t*13.0 + sin(vP.x*11.0)*2.0);',
      '  float a = op*(0.30 + 0.70*fres)*tongue*1.9;',
      '  if (a < 0.02) discard;',
      '  vec3 c = mix(vec3(1.0,0.85,0.25), vec3(1.0,0.28,0.06), clamp(tongue*0.9, 0.0, 1.0));',
      '  c = mix(c, vec3(1.0,0.97,0.8), pow(fres,3.0)*0.6);',
      '  gl_FragColor = vec4(c, a); }',
    ].join('\n'),
  });
  const m = new THREE.Mesh(item.mesh.geometry, mat);
  m.userData.keepGeo = true;         // the geometry is SHARED with the item — do not dispose
  m.renderOrder = 9;
  item.mesh.add(m);                  // it travels together with the item
  const st = { item, obj: m, mat, t0: performance.now(), dying: 0 };
  fires.push(st);
  return () => { if (!st.dying) st.dying = performance.now(); };
}
// ===== THE RED-HOT CRUST ON A BURNING ITEM (the owner's word 2026-08-19) =====
// A port of the «heatmap» look from thrine.app.
// ⚠️⚠️ THERE IT IS AN IMAGE-SPACE EFFECT: the model is rendered into an offscreen
// target, its edge is blurred, a FULL-SCREEN shader paints it, and the mesh itself
// is excluded from the frame (`replacesGeometry`). That pipeline does not suit us:
// they have ONE model in the frame, we have 130-180 items, and image-space work
// covers the WHOLE frame — per item that means a render target per item, which the
// mobile budget will not take. We cut `transmission` for exactly this reason: a
// second pass of the scene ate 55% of the frame.
// ⚠️ WHAT IS PORTED IS THE QUANTITY, NOT THE PIPELINE. Their «heat» is the distance
// to the silhouette's edge; in 3D that is exactly `dot(normal, view)`: the front is
// hot, the grazing edge is cold. The isolines, the glow, the grain and the running
// band are all computed from it, inside the overlay's own material — without a
// single extra pass.
// ⚠️⚠️ THIS IS AN OVERLAY-CHILD, NOT AN EDIT OF THE ITEM'S MATERIAL. The canon
// forbids touching the material: the collection portraits are rendered by the same
// material class, and «hot» would leak into the museum.
// ⚠️ The default palette is SHARED WITH THE FLAME (FIRE_*) — the owner's choice
// («the crust in the flame palette»): the crust must read as «this item got
// red-hot», and not as a separate effect.
const HEAT = { contour: 0.40, inner: 0.45, grain: 0.20, speed: 0.40, scale: 1.0,
               cool: FIRE_DEEP.clone(), mid: FIRE_HOT.clone(), hot: FIRE_CORE.clone() };
// ⚠️ THE COLD SET — THE COLOURS OF THE ORIGINAL thrine PRESET, the owner's word
// 2026-08-19 «the frozen object inside with the crust as it was in the preset».
// The numbers come from there as well: contour 40, innerGlow 45, grain 20,
// speed 40, scale 100.
const COLD = { contour: 0.40, inner: 0.45, grain: 0.20, speed: 0.40, scale: 1.0,
               cool: new THREE.Color('#0b3a6b'), mid: new THREE.Color('#2fb8ff'),
               hot: new THREE.Color('#eafcff') };
function _heatShellFX_impl(item, set, order){
  set = set || HEAT;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: {
      t: { value: 0 }, op: { value: 1 },
      uContour: { value: set.contour }, uInner: { value: set.inner },
      uGrain: { value: set.grain }, uSpeed: { value: set.speed },
      uScale: { value: set.scale },
      uCool: { value: set.cool.clone() }, uMid: { value: set.mid.clone() },
      uHot: { value: set.hot.clone() },
    },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      // the crust SITS on the item, it is not puffed up: the 0.012 is only so that
      // it does not argue with the item's own surface over depth
      '  vN = normalize(normalMatrix*normal); vP = position;',
      '  vec4 mv = modelViewMatrix*vec4(position + normal*0.012, 1.0); vV = mv.xyz;',
      '  gl_Position = projectionMatrix*mv; }',
    ].join('\n'),
    fragmentShader: [
      'uniform float t; uniform float op; uniform float uContour; uniform float uInner;',
      'uniform float uGrain; uniform float uSpeed; uniform float uScale;',
      'uniform vec3 uCool; uniform vec3 uMid; uniform vec3 uHot;',
      'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      // THIS IS THEIR «distance to the edge»: 1 in the centre, 0 at the grazing edge
      '  float ndv = clamp(dot(normalize(vN), normalize(-vV)), 0.0, 1.0);',
      '  float heat = pow(ndv, 1.0/max(0.15, uInner));',
      // the running dark patches — the analogue of their shadowShape, in OBJECT
      // coordinates, so that the band rides across the item and not across the screen
      '  float band = sin(vP.y*uScale*6.0 - t*uSpeed*4.0 + sin(vP.x*uScale*4.0)*1.5);',
      '  heat *= 0.78 + 0.22*band;',
      // the contour isolines of the same quantity
      '  float bands = 4.0 + 16.0*uContour;',
      '  float ln = abs(fract(heat*bands) - 0.5)*2.0;',
      '  heat += (1.0 - smoothstep(0.72, 1.0, ln))*0.30*step(0.01, uContour);',
      '  heat += uGrain*(fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453) - 0.5);',
      '  heat = clamp(heat, 0.0, 1.0);',
      '  vec3 c = heat < 0.5 ? mix(uCool, uMid, heat*2.0) : mix(uMid, uHot, (heat - 0.5)*2.0);',
      // the cold edges are DELIBERATELY transparent — the silhouette and the colour of
      // the item stay readable, it is the middle that gets red-hot. Otherwise the
      // player would stop recognising the type, and it is by type that he looks for a pair.
      '  float a = op*smoothstep(0.06, 0.38, heat);',
      '  if (a < 0.02) discard;',
      '  gl_FragColor = vec4(c, a); }',
    ].join('\n'),
  });
  const m = new THREE.Mesh(item.mesh.geometry, mat);
  m.userData.keepGeo = true;         // the geometry is SHARED with the item — do not dispose
  m.renderOrder = order != null ? order : 8;   // UNDER the flame (9) / UNDER the ice (3)
  item.mesh.add(m);
  const st = { item, obj: m, mat, t0: performance.now(), dying: 0, set };
  (set === COLD ? chills : fires).push(st);
  return () => { if (!st.dying) st.dying = performance.now(); };
}
// The knobs of one preset. ⚠️ A no-argument call READS, a call with an object
// WRITES and applies to the crusts that are ALREADY alive — otherwise picking the
// look would require a fresh flare-up once every 30 seconds.
function heatKnobs(set, o){
  if (!o) return { contour: set.contour, inner: set.inner, grain: set.grain,
                   speed: set.speed, scale: set.scale,
                   cool: '#' + set.cool.getHexString(), mid: '#' + set.mid.getHexString(),
                   hot: '#' + set.hot.getHexString() };
  for (const k of ['contour','inner','grain','speed','scale']) if (o[k] != null) set[k] = o[k];
  for (const k of ['cool','mid','hot']) if (o[k] != null) set[k].set(o[k]);
  return heatApplyLive();
}
function heatApplyLive(){
  let n = 0;
  for (const f of fires.concat(chills)){
    const u = f.mat && f.mat.uniforms;
    if (!u || !u.uContour) continue;
    const s = f.set || HEAT;         // the ice has its own set, the flame its own
    u.uContour.value = s.contour; u.uInner.value = s.inner;
    u.uGrain.value = s.grain; u.uSpeed.value = s.speed; u.uScale.value = s.scale;
    u.uCool.value.copy(s.cool); u.uMid.value.copy(s.mid); u.uHot.value.copy(s.hot);
    n++;
  }
  return n;
}
// THE ICE CRUST: it lives as long as the item is frozen. The end is the ice being
// smashed (`it.frozen` is cleared in 80-gameplay) or the item disappearing.
function tickChills(){
  if (!chills.length) return;
  const now = performance.now();
  for (let i = chills.length - 1; i >= 0; i--){
    const c = chills[i];
    c.mat.uniforms.t.value = (now - c.t0)/1000;
    if ((!c.item.alive || !c.item.frozen) && !c.dying) c.dying = now;
    if (c.dying){
      const k = (now - c.dying)/FIRE_FADE_MS;
      c.mat.uniforms.op.value = Math.max(0, 1 - k);
      if (k >= 1){
        if (c.obj.parent) c.obj.parent.remove(c.obj);
        c.mat.dispose();
        chills.splice(i, 1);
      }
    }
  }
}
function tickFires(){
  tickChills();
  const now = performance.now();
  // burnt out by time OR the item has already been collected/ground — extinguish and release
  if (burningItem && (!burningItem.alive || now > burnUntil)){
    burningItem = null; burnUntil = 0;
    extinguishAll();
  }
  if (!fires.length) return;
  for (let i = fires.length - 1; i >= 0; i--){
    const f = fires[i];
    f.mat.uniforms.t.value = (now - f.t0)/1000;
    // the item is gone (joined/ground) — we extinguish along with it
    if (!f.item.alive && !f.dying) f.dying = now;
    if (f.dying){
      const k = (now - f.dying)/FIRE_FADE_MS;
      f.mat.uniforms.op.value = Math.max(0, 1 - k);
      if (k >= 1){
        if (f.obj.parent) f.obj.parent.remove(f.obj);
        f.mat.dispose();
        fires.splice(i, 1);
      }
    }
  }
}
// ⚠️ IT EXTINGUISHES THE STATE TOO, NOT ONLY THE FLAME. The first version touched
// only fires and left burningItem alive — and the flare scheduler, which checks
// "is something already burning?", NEVER again set a new item on fire. From the
// outside this looked like "the fire works" (the first flare did happen), and the
// guard "special items do not burn" honestly printed five hits while reading ONE
// AND THE SAME name five times.
// Caught by a diversity measurement: 14 flares — 1 type out of 129 available.
function extinguishAll(){
  for (const f of fires) if (!f.dying) f.dying = performance.now();
  burningItem = null; burnUntil = 0;
}

// Bolt (chain reaction): a jagged polyline, two layers — a saturated core
// + a light halo with an offset. ⚠️ The background is WHITE: normal blending only
// and a saturated color (an additive glow on white is invisible).
//
// ⚠️ "MORE SMALL BOLTS" (the owner's spec 2026-07-28): a discharge is now not a
// single arc but an arc + BOLT_FORKS short BRANCHES, and everything is THINNER
// than before — the pile looks electrified rather than stitched with two thick
// strands.
// ⚠️ THE COST IS KEPT CONSTANT: all the filaments of a layer are merged into ONE
// geometry, so a discharge still costs EXACTLY 2 objects / 2 materials / 2 draw
// calls — the same as a single arc did. The naive path "call boltFX 6 times more
// often" would have given ×6 objects and meshes in the frame.
const BOLT_SEG = 9;          // nodes of the main arc
const BOLT_FORKS = 5;        // branches per discharge
const BOLT_LIFE = 0.16;
// ⚠️ The bolts NO LONGER HAVE shared temporary vectors: boltPath sets up its own
// basis on every call, otherwise generating the branches would overwrite the basis
// of the main arc (the branches would go the wrong way). _bUp is a constant, it can
// be reused.
const _bUp = new THREE.Vector3(0,1,0);
// A polyline with transverse jitter between two points -> a piecewise-linear path
// (CatmullRom would smooth the kinks — the bolt would stop being a bolt).
function boltPath(p0, p1, seg, jitter){
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  if (len < 1e-4) return null;
  const n1 = new THREE.Vector3().crossVectors(dir, _bUp);
  if (n1.lengthSq() < 1e-4) n1.set(1,0,0); else n1.normalize();
  const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
  const pts = [];
  for (let i=0;i<=seg;i++){
    const t = i/seg;
    const p = p0.clone().lerp(p1, t);
    if (i>0 && i<seg){
      const amp = len*jitter*Math.sin(Math.PI*t); // the jitter peaks in the middle
      p.addScaledVector(n1, (Math.random()-0.5)*2*amp).addScaledVector(n2, (Math.random()-0.5)*2*amp);
    }
    pts.push(p);
  }
  const path = new THREE.CurvePath();
  for (let i=0;i<seg;i++) path.add(new THREE.LineCurve3(pts[i], pts[i+1]));
  return { path, pts, len, n1, n2, dir };
}
// ⚠️ MANUAL MERGING: in the r149 UMD build there IS NO BufferGeometryUtils (all
// that is left of it in the bundle is a string in the text of the
// BufferGeometry.merge error). The bolt material is a MeshBasicMaterial without
// lighting and textures, so we copy ONLY position and index: normal/uv are not
// read by the shader, transferring them would be pure waste (three times less data
// in the GPU and less work for the merge).
function mergeTubeGeos(list){
  let vc = 0, ic = 0;
  for (const g of list){ vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc*3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list){
    const src = g.attributes.position.array, n = g.attributes.position.count, gi = g.index.array;
    pos.set(src, vo*3);
    for (let i=0;i<gi.length;i++) idx[io+i] = gi[i] + vo; // the indices shift by the vertices already laid down
    vo += n; io += gi.length;
    g.dispose(); // temporary filament geometry: it never went to the GPU, but we free it honestly
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// MATERIAL POOL (the dispatcher's request: do not breed materials for every
// discharge).
// ⚠️ This is a FREE-LIST and NOT a shared material: every LIVE discharge flickers
// its opacity individually, so sharing one material between simultaneous bolts is
// not allowed — we reuse only the ONES THAT HAVE BEEN FREED (stepFX puts them here
// instead of dispose, by the userData.poolBolt flag).
const boltMatPool = [];
const BOLT_POOL_MAX = 24;
function boltMat(color, opacity){
  const m = boltMatPool.pop();
  // setHex repeats the constructor's behavior (in r149, without ColorManagement, a
  // hex is stored as is) — the hue of a reused material is bit-for-bit the same
  if (m){ m.color.setHex(color); m.opacity = opacity; return m; }
  return new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthTest:false });
}
function _boltFX_impl(a, b){
  // ⚠️ HIDDEN BEHIND A FLAG, NOT DELETED (the owner's spec 2026-07-28): entering
  // turbo is now marked by TOSSING the pile up, not by discharges. The whole bolt
  // machinery (branching, filament merging, the material free-list) stays
  // working — TURBO_BOLTS=true in 00-config turns it back on with a single value.
  if (!TURBO_BOLTS) return;
  const main = boltPath(a, b, BOLT_SEG, 0.13);
  if (!main || main.len < 0.2) return;
  // BRANCHES: short branches from random nodes of the main arc, sideways and a
  // little along it. The basis is taken FROM main (boltPath sets up its own on
  // every call — shared _bN1/_bN2 would be overwritten while generating branches).
  const forks = [];
  const axis = main.dir.clone().normalize();
  for (let i=0;i<BOLT_FORKS;i++){
    const j = 1 + Math.floor(Math.random()*(BOLT_SEG-1)); // not from the very ends
    const from = main.pts[j];
    const to = from.clone()
      .addScaledVector(main.n1, (Math.random()-0.5)*2)
      .addScaledVector(main.n2, (Math.random()-0.5)*2)
      .addScaledVector(axis, (Math.random()-0.5)*0.8);
    // we normalize the offset to a fraction of the main arc's length -> the branch is always "small"
    to.sub(from).normalize().multiplyScalar(main.len*(0.12+Math.random()*0.20)).add(from);
    const f = boltPath(from, to, 3, 0.22);
    if (f) forks.push(f);
  }
  const layer = (color, rMain, rFork, opacity) => {
    const geos = [ new THREE.TubeGeometry(main.path, BOLT_SEG*2, rMain, 4, false) ];
    // the branches have coarser tessellation: they are small, the difference is invisible, and there are three times fewer vertices
    for (const f of forks) geos.push(new THREE.TubeGeometry(f.path, 6, rFork, 3, false));
    const mesh = new THREE.Mesh(mergeTubeGeos(geos), boltMat(color, opacity));
    mesh.renderOrder = 12;
    mesh.userData.poolBolt = true; // stepFX will return the material to the pool instead of dispose
    addFX(mesh, BOLT_LIFE, (o,k)=>{ o.material.opacity = opacity*(1-k)*(0.55+0.45*Math.random()); }); // flicker
  };
  // ⚠️ THE SHEATH:CORE PROPORTION IS ~3:1, AND NOT 2.3:1 AS IN THE THICK VERSION.
  // As the filament is thinned, the blue halo is the first to go subpixel: in a
  // close-up a test gave WHITE threads instead of electric ones (the core had
  // almost caught up with the sheath in screen width). The halo needs a WIDER share
  // than with a thick arc.
  layer(0x2f6bff, 0.075, 0.038, 0.6);  // the sheath (was 0.09 — still "smaller")
  layer(0xdceeff, 0.024, 0.012, 1.0);  // the core (was 0.035)
}
// ═══ THE THREAD OF LIGHTNING THROUGH THE VICTIMS OF THE CHARGE (the owner's word
// 2026-08-23-a: «a click on the bonus item destroys all similar items by way of a lightning
// bolt that threads through them all, from centre to centre») ═══
// ⚠️⚠️ ONE CONTINUOUS THREAD, NOT A STAR OF SEPARATE BOLTS, AND THE DIFFERENCE IS HIS
// WORDING. «Пронизывает их все… от центра к центру» is a traversal — centre to centre to
// centre — not a radiation from one point. A fan already existed in this codebase (the
// per-match star at the turbo line) and it is NOT what was asked for; a fan would have been
// «от центра ко всем».
// ⛔⛔ THIS DOES **NOT** GO THROUGH `boltFX`, AND MUST NOT BE «SIMPLIFIED» INTO IT. That one
// begins with `if (!TURBO_BOLTS) return;`, and TURBO_BOLTS is false by the owner's own spec
// of 2026-07-28 (entering turbo is marked by tossing the pile, not by discharges). Calling
// boltFX here would draw NOTHING while throwing no error and failing no assert — the single
// most likely way to «ship» this item without shipping it. Flipping the flag instead would
// be worse still: it would simultaneously resurrect the ambient crackle across the whole
// bowl and the star on every match in turbo, i.e. cancel his 2026-07-28 word in three places
// to satisfy one request.
// ⚠️ THE ORDER OF THE VICTIMS IS A GREEDY NEAREST-NEIGHBOUR WALK FROM THE TOPMOST ONE. The
// items arrive in `items` order, which is spawn order — a thread through that would jump
// across the bowl and read as a scribble rather than as one bolt. Starting from the topmost
// victim makes the visible end of the thread the one the player is looking at.
// ⚠️ THE LIFE IS LONGER THAN AN ORDINARY DISCHARGE (0.24 s against BOLT_LIFE 0.16): this is a
// single event the player asked for and must see, not ambient crackle. The items themselves
// still die in the same frame — he has twice pushed for instantness on this exact button,
// which is also why its handler is `pointerdown`.
// ⚠️ TWO MESHES TOTAL, WHATEVER N IS: every hop and every fork is merged into one geometry
// per layer. A per-hop mesh at N=16 would mean 30 materials against a BOLT_POOL_MAX of 24,
// on top of the 16 dissolve clouds already firing.
// ⚠️ `poolBolt` IS SET AND THAT IS CORRECT HERE — the material comes from `boltMat`, so it
// belongs in the bolt pool. The canon's warning about this flag is about OTHER effects
// borrowing it, which would push foreign materials into that pool.
const CHAIN_BOLT_LIFE = 0.24, CHAIN_BOLT_SEG = 5;
function chainBoltFX(points){
  if (!Array.isArray(points) || points.length < 2) return;
  const left = points.map(p => p.clone());
  let cur = left[0];
  for (const p of left) if (p.y > cur.y) cur = p;      // start at the topmost victim
  left.splice(left.indexOf(cur), 1);
  const order = [cur];
  while (left.length){
    let bi = 0, bd = Infinity;
    for (let i = 0; i < left.length; i++){
      const d = cur.distanceToSquared(left[i]);
      if (d < bd){ bd = d; bi = i; }
    }
    cur = left[bi]; left.splice(bi, 1); order.push(cur);
  }
  const hops = [];
  for (let i = 0; i < order.length - 1; i++){
    const h = boltPath(order[i], order[i+1], CHAIN_BOLT_SEG, 0.16);
    if (h) hops.push(h);
  }
  if (!hops.length) return;
  // the forks are spread over the WHOLE thread and capped at BOLT_FORKS — one set per hop
  // would give 75 branches at N=16 and turn the thread into a bush
  const forks = [];
  for (let i = 0; i < BOLT_FORKS; i++){
    const h = hops[Math.floor(Math.random()*hops.length)];
    const j = 1 + Math.floor(Math.random()*(CHAIN_BOLT_SEG-1));
    const from = h.pts[j];
    const to = from.clone()
      .addScaledVector(h.n1, (Math.random()-0.5)*2)
      .addScaledVector(h.n2, (Math.random()-0.5)*2);
    to.sub(from).normalize().multiplyScalar(h.len*(0.18+Math.random()*0.25)).add(from);
    const f = boltPath(from, to, 3, 0.22);
    if (f) forks.push(f);
  }
  const layer = (color, rMain, rFork, opacity) => {
    const geos = [];
    for (const h of hops) geos.push(new THREE.TubeGeometry(h.path, CHAIN_BOLT_SEG*2, rMain, 4, false));
    for (const f of forks) geos.push(new THREE.TubeGeometry(f.path, 6, rFork, 3, false));
    const mesh = new THREE.Mesh(mergeTubeGeos(geos), boltMat(color, opacity));
    mesh.renderOrder = 12;
    mesh.userData.poolBolt = true;
    addFX(mesh, CHAIN_BOLT_LIFE, (o,k)=>{ o.material.opacity = opacity*(1-k)*(0.6+0.4*Math.random()); });
  };
  layer(0x2f6bff, 0.075, 0.038, 0.6);  // the sheath — the same proportion as a single bolt
  layer(0xdceeff, 0.024, 0.012, 1.0);  // the core
}
// Floating text (+points, ×multiplier, penalties)
function scorePopScreen(text, px, py, color, big){
  const el = document.createElement('div');
  el.className = 'pop' + (big ? ' big' : '');
  el.style.left = px + 'px';
  el.style.top  = py + 'px';
  // A SINGLE OUTLINE MECHANISM (an INTERFACE edit on the owner's direct
  // instruction 2026-07-21-v): the text is an SVG <text> of class .otext, like all
  // the outlined text of the HUD; the div stays for the sake of the position and
  // the flight animation.
  // ⚠️⚠️ THE `color` PARAMETER WORKS AGAIN (the owner's word 2026-08-17: "give the
  // points on a join different bright outlines, not just the black one"). ⛔ THIS
  // CANCELS the spec of 2026-07-19 "pops are always white with a BLACK outline":
  // the fill stayed white, only the DEFAULT outline in the CSS stayed black.
  // ⚠️ The wiring was not set up anew — the colors were already being passed by
  // EVERY call and were already chosen by the meaning of the event (combo orange,
  // fire scarlet, penalty red); all that time they simply were not reaching the
  // pixels.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'otext');
  // ⚠️ THE CANVAS WAS DOUBLED TOGETHER WITH THE TYPE SIZE (the owner's word
  // 2026-08-17 "×2"): with the previous 260×40 the text at 38-56px would have been
  // clipped by the SVG frame at the top and at the sides.
  // We do not touch the centering — the div is positioned by translate(-50%,-50%).
  svg.setAttribute('width', '520'); svg.setAttribute('height', '80');
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', '260'); t.setAttribute('y', '60');
  t.setAttribute('text-anchor', 'middle');
  if (color) t.style.setProperty('--otl-color', color);
  t.textContent = text;
  svg.appendChild(t); el.appendChild(svg);
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('fly'));
  setTimeout(()=>el.remove(), 1100);
}
// THE POP OUTLINE COLOR FROM THE ITEM ITSELF (the owner's word "different bright
// ones").
// ⚠️⚠️ DETERMINISTIC FROM THE TYPE, NOT RANDOM — the rule of the canon: one item
// must give ONE outline, then it reads as its PROPERTY; a random color reads as a
// glitch (we have already been burned by this with the impact ring families).
// We take `fxColor` — the same color in which the dust of this type pours.
// ⚠️⚠️ SEVEN COLORS, AT RANDOM, WITHOUT YELLOW (the owner's word 2026-08-17-v:
// "yellow should not be used, use bright colors but ones that contrast well with
// white. Use them AT RANDOM, without any kind of system, I think 7 colors will
// definitely be enough, like a rainbow").
// ⛔⛔ THIS CANCELS TWO OF MY PREVIOUS EDITIONS AND ONE OF MY RULES.
//   (1) "darken the item's color down to a threshold" — it gave muddy half-tones;
//   (2) "pick the sector BY THE HUE of the item" — a deterministic binding;
//   (3) the rule of the canon "the color must be derived from the item, a random
//       one reads as a glitch" — it was derived BY ME for the impact ring families
//       and remains true FOR THEM; here the owner directly asks for randomness.
//       Not to be "fixed".
// ⚠️ THERE IS NO YELLOW SECTOR AT ALL, AND THAT IS NOT AN OMISSION: with the
// luminance weights 0.2126/0.7152/0.0722 yellow is never bright and contrasting
// against white at the same time — its limit is a dark olive, which is exactly
// what the owner rejected.
// THE PALETTE IS COMPUTED: in each sector the LIGHTEST saturated hue with a
// contrast against white >= 4.5:1 (AA). The spread across the palette is
// 4.50..5.30:1.
const POP_OTL_PALETTE = ['#eb0000', '#c75300', '#168500', '#008573',
                         '#056dff', '#8833ff', '#e00096'];
// ⚠️ THE SAME ONE DOES NOT COME UP TWICE IN A ROW: pure Math.random gives
// repeats, and two identical pops in a row read as "the color means something" —
// exactly the false system the owner asked to avoid.
let _popOtlPrev = -1;
function popOutlineColor(){
  let i = (Math.random() * POP_OTL_PALETTE.length) | 0;
  if (i === _popOtlPrev) i = (i + 1) % POP_OTL_PALETTE.length;
  _popOtlPrev = i;
  return POP_OTL_PALETTE[i];
}
function scorePop(text, worldPos, color, big){
  const rect = canvas.getBoundingClientRect();
  const sp = worldPos.clone().project(camera);
  scorePopScreen(text, (sp.x+1)/2*rect.width + rect.left, (-sp.y+1)/2*rect.height + rect.top, color, big);
}
// A miss: −MISS_PENALTY through the single penalty point scorePenalty
// (80-gameplay, balance table 2026-07-22: lvl.1 without penalties — then we do not
// draw the "−10" pop either; lvl.<=5 clamped at zero). The miss IS ALWAYS COUNTED
// (stats.misses is needed by the chain rules), the sanction is points only.
function penalize(worldPos, sx, sy){
  stats.misses++;
  stats.missRun = (stats.missRun | 0) + 1;
  const before = stats.score;
  // ⛔ THE PRICE CLIMBS WITH THE RUN, NOT WITH THE LEVEL TOTAL (2026-08-24-b): `missRun` counts
  // mistakes since the last merge and is zeroed at the head of `doMatch`, so one collected pair
  // puts the price back to the base. Both counters are incremented above, BEFORE the charge, so
  // each already holds the 1-based ordinal. ⚠️ `misses` keeps its old meaning — the turbo rules
  // read it as a delta, and a merge must not launder those.
  const charged = scorePenalty(missPenaltyFor(stats.missRun, levelNum));
  const shown = scoreShownDelta(stats.score, before); // denominated drop of the chip (#10)
  // ⚠️ A MISS ZEROES THE TURBO CHARGE (the owner's spec 2026-07-27: "if the player
  // makes a mistake while charging turbo mode — the mode's counter is reset").
  // ⚠️ THIS IS A REVERSAL OF HIS OWN EARLIER TUNING: previously −2 steps stood here
  // instead of a reset, because he said "we reset the power chain too abruptly".
  // The new spec is direct and newer — we take it; the RADIUS LADDER (comboLevel)
  // still loses COMBO_MISS_DROP=2 rather than being zeroed: the owner said "the
  // MODE's counter", that is the chain charge (comboCount), while the ladder is a
  // separate mechanic which he did not touch.
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = 0; // the turbo charge — from zero
    updateMatchRadius(); updateHUD();
  }
  try { bowlStreakReset(); } catch(e){} // the bowl streak: a miss = a mistake (the owner's word)
  // ⚠️⚠️ THE RADIUS PENALTY (the owner's spec 2026-08-11) IS OUTSIDE the
  // `comboUntil` gate above: it must fire on EVERY miss, not only during a burning
  // streak. The place was chosen next to the bowl streak deliberately — it is the
  // only line of the function that already stands "on every miss".
  try { noteMissRadius(); } catch(e){}
  if (charged && shown > 0){
    if (worldPos) scorePop('-' + shown, worldPos, MISS_COLOR, false);
    else scorePopScreen('-' + shown, sx, sy, MISS_COLOR, false);
    // ⛔⛔ AND THE SCORE CHIP REDDENS WITH IT (the owner's word 2026-08-25). It stands INSIDE
    // the `charged && shown > 0` gate on purpose, next to the pop it echoes: on level 1 nothing
    // is taken (his beginner grace) and there is no pop either — a chip that reddened there
    // would be colouring a number that did not move.
    scoreFlashMiss();
  }
  Sound.play('miss'); // the error sound stays even on lvl.1 — the "wrong place" feedback
  updateHUD();
}
function wiggle(item){
  const startX = item.mesh.rotation.z;
  addFX(new THREE.Object3D(), 0.3, (o,k)=>{ item.mesh.rotation.z = startX + Math.sin(k*Math.PI*4)*0.2*(1-k); });
}

// SHADER PROGRAM ANCHORS. stepFX disposes the effects' materials, and three throws
// away the COMPILED PROGRAM as soon as its last material dies — the next
// tap/marker/bolt would compile the shader anew right inside the frame (a hitch
// noticeable on weak devices). We keep one eternal subpixel instance of every FX
// recipe on the camera — the programs live for the whole session. ⚠️ The numbers of
// the Fresnel recipes must match the production calls (they are baked into the
// TEXT of the shader — different numbers = a different program):
// sphereFX (0.05, 0.32), markerFX (0.1, 0.5), reachGhostFX (0.01, 0.08, 1.1 — halved 2026-08-30).
// ===== THE CHARGE'S ELECTRIC SHELL — «Surge band», COLD (the owner's pick 2026-09-01-l) =====
// He chose it off the six-variant bench (electric-variants/, published as an artifact) with one
// amendment: «variant 6 Surge Band, but take it from warm to cold». The bench's palette was a
// green-to-yellow-green; this one runs electric violet -> electric cyan -> white.
// ⛔⛔ IT MUST NOT DRIFT INTO ICE, AND THAT IS A MEASURED CONSTRAINT RATHER THAN TASTE: the frozen
// block owns 0x8fd4ff / 0xdff4ff / 0xbfeaff (iceCrustMat, 40-items) — PALE and low-saturation. A
// pale blue-white here would read as frost on a charged object, which is the one reading the
// effect must not have. The separation is saturation and the violet end, not hue alone.
// ⚠️⚠️ IT IS A CHILD OVERLAY AND NEVER AN EDIT OF THE ITEM'S MATERIAL — the fire's rule, and for
// the fire's reason: the collection portraits are rendered by the same material class, so a
// «charged» look written into the material would leak into the museum.
// ⚠️⚠️ AND IT RENDERS INTO `spinR`, WHICH IS `alpha:true` — SO THE OUTPUT IS PREMULTIPLIED.
// three's default `premultipliedAlpha:true` makes NormalBlending `blendFuncSeparate(ONE,
// ONE_MINUS_SRC_ALPHA, ...)`, i.e. the shader is expected to hand over colour ALREADY multiplied
// by alpha. The game's other shells (fireSilhouetteFX, the heat crust) write a bare `vec4(c, a)`
// and get away with it because they draw into the MAIN canvas, which is `alpha:false` — there the
// framebuffer alpha is discarded and the difference never shows. Copy one of them into an
// offscreen renderer without this line and the shell comes out washed and haloed at low alpha.
const CHARGE_SURGE_PUFF = 0.030;   // the shell sits just off the surface; below THUMB_MARGIN so
                                   // frameCylinder's padding still contains it
function chargeSurgeMat(y0, y1){
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { t: { value: 0 }, uY0: { value: y0 }, uY1: { value: y1 } },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      '  vN = normalize(normalMatrix*normal); vP = position;',
      '  vec3 p = position + normal*' + CHARGE_SURGE_PUFF.toFixed(3) + ';',
      '  vec4 mv = modelViewMatrix*vec4(p,1.0); vV = mv.xyz;',
      '  gl_Position = projectionMatrix*mv; }',
    ].join('\n'),
    fragmentShader: [
      'uniform float t; uniform float uY0; uniform float uY1;',
      'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }',
      'float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
      '  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),',
      '             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }',
      'void main(){',
      '  float ndv = abs(dot(normalize(vN), normalize(-vV)));',
      '  float fres = pow(1.0 - ndv, 2.0);',
      '  float u = (vP.y - uY0) / max(0.0001, uY1 - uY0);',
      '  float head = fract(t*0.55);',
      '  float d = u - (head*1.35 - 0.18);',
      '  float band = exp(-d*d*90.0);',
      '  float crk = n3(vP*17.0 + vec3(t*3.0));',
      '  band *= 0.55 + 0.75*smoothstep(0.35, 0.9, crk);',
      '  float a = 0.22*fres + band*(0.45 + 0.55*fres);',
      '  a = clamp(a, 0.0, 1.0);',
      '  if (a < 0.02) discard;',
      // ⚠️⚠️ COLD, AND THE PEAK IS A COLD WHITE RATHER THAN A WHITE. First render of the port
      // whitened the core with `mix(c, vec3(1.0), pow(band,3.0)*0.80)` - the bench's own line,
      // where a saturated GREEN base survived it. Against violet and cyan it did not: on the
      // frames the band read as a grey-white crackle on the model, i.e. the one thing «cold» must
      // not turn into. The white is now (0.75,0.95,1.0) and reaches 0.55, so the hottest part of
      // the band still leans blue instead of going neutral.
      '  vec3 c = mix(vec3(0.20,0.12,0.85), vec3(0.10,0.78,1.00), band);',
      '  c = mix(c, vec3(0.75,0.95,1.00), pow(band,3.0)*0.55);',
      '  gl_FragColor = vec4(c*a, a); }',   // PREMULTIPLIED - see the note above
    ].join('\n'),
  });
}
// Builds the shell as a CHILD of the portrait mesh, so it inherits the spin's rotation and scale
// for free. The geometry is SHARED with the item (the type cache) - `keepGeo` says so out loud,
// though nothing in this path disposes it.
function chargeSurgeMake(mesh){
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  const m = new THREE.Mesh(geo, chargeSurgeMat(b.min.y, b.max.y));
  m.userData.keepGeo = true;
  m.renderOrder = 9;
  mesh.add(m);
  return m;
}
// ⚠️ NO PROGRAM ANCHOR FOR THIS ONE, AND THAT IS DELIBERATE RATHER THAN AN OVERSIGHT.
// `fxProgramAnchors` below warms the MAIN renderer's program cache; this material only ever
// compiles inside `spinR`, a second WebGLRenderer with a cache of its own, so an anchor there
// would warm the wrong one. The compile happens in an offscreen 256px render at the moment a
// charge first appears - not inside a game frame.

(function fxProgramAnchors(){
  const g = new THREE.Group();
  const tiny = new THREE.SphereGeometry(0.001, 4, 3);
  [ fresnelGhostMat(0xffffff, 0.05, 0.32),      // (spare: the variant of the deleted sphereFX; do NOT touch the array — shader warm-up)
    fresnelGhostMat(0xffffff, 0.1, 0.5),        // markerFX
    fresnelGhostMat(0xffffff, 0.01, 0.08, 1.1), // reachGhostFX (the tap/hint halo)
  ].forEach(m => { m.uniforms.op.value = 0; g.add(new THREE.Mesh(tiny, m)); });
  g.add(new THREE.Mesh(tiny, new THREE.MeshBasicMaterial({ transparent:true, opacity:0 }))); // popFX/boltFX
  const pg = new THREE.BufferGeometry(); // dustCloud: Points + vertexColors
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size:0.001, vertexColors:true, transparent:true, opacity:0, depthWrite:false })));
  // ⚠️ ADDED AFTER THE main REVIEW: these programs were not among the anchors,
  // while the effects appeared later. After a full drain of fx the first
  // juice/spark/star/chip would compile the shader RIGHT INSIDE THE FRAME — exactly
  // the jank the anchors were set up for. Points with a map and alphaTest has its
  // own program key, and MeshBasicMaterial with vertex colors has its own too.
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(dg, new THREE.PointsMaterial({ size:0.001, map: fxDotTex(),
    transparent:true, opacity:0, depthWrite:false, alphaTest:0.02 })));  // juiceBigFX/sparkRicochetFX/starPopFX
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors:true,
    transparent:true, opacity:0, depthWrite:false })));                  // shardFX
  // ⚠️⚠️ THE IMPACT RING AND ITS FLASH WERE ADDED IN THE 2026-08-14 REVISION. Their
  // anchors WERE NOT HERE, while `impactFX` creates materials with a program key
  // that none of the neighbours has: `depthTest:false` + `side:DoubleSide` (the
  // ring) and Points with a map + `depthTest:false` (the flash). The key is unique,
  // which means that after a drain of fx the very first JOINING OF A PAIR compiled
  // the shader right inside the frame — and the impact is given to EVERY join, i.e.
  // the player caught the jank on the most frequent action in the game. Exactly the
  // ailment the anchors were set up for.
  g.add(new THREE.Mesh(tiny, new THREE.MeshBasicMaterial({ transparent:true, opacity:0,
    depthWrite:false, depthTest:false, side: THREE.DoubleSide })));       // impactFX: the ring
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(ig, new THREE.PointsMaterial({ size:0.001, map: fxDotTex(),
    transparent:true, opacity:0, depthWrite:false, depthTest:false, alphaTest:0.02 }))); // impactFX: the flash
  // ⚠️ THE ICE CRUST has its own ShaderMaterial (`iceCrustMat`, 40-items), i.e. its
  // program key is unique by construction. Without an anchor the first block of a
  // level compiled the shader IN THE FRAME of the level start (found by the
  // 2026-08-14 revision).
  // ⚠️ The anchor's material is THE SAME call as in the game: a copy standing next
  // to the working one would diverge on the first shader edit, and the anchor would
  // silently stop warming up the right thing.
  // ⚠️⚠️ THERE WAS A DOT IN THE CENTER OF THE SCREEN HERE (the owner's complaint
  // 2026-08-20 "there is no dot in the center of the bowl"). `im.opacity = 0` DOES
  // NOTHING: for a `ShaderMaterial` three does not substitute `opacity` into the
  // shader — `iceCrustMat` (40-items) computes the alpha itself
  // (`a = mix(0.18, 0.9, f)`), and the anchor was honestly being drawn. The diameter
  // is subpixel, but the Fresnel gives a bright rim — on screen that is a gray
  // ringlet EXACTLY in the center of the frame (the whole group hangs on the
  // camera).
  // ⛔ The neighbours are quenched with `uniforms.op.value = 0` — they DO HAVE such
  // a uniform; adding it here is NOT ALLOWED: uniforms are baked into the text of
  // the shader, different text = a different program, and the anchor would start
  // warming up THE WRONG ONE.
  // ⛔ And `visible = false` is not allowed either: an invisible mesh is not drawn,
  // the program is not compiled — the anchor would stop being an anchor.
  // THE CURE: `colorWrite = false` — the draw happens, the program is compiled and
  // warmed up, and nothing is written into the color buffer. This property is not
  // part of the program key (three applies it with gl.colorMask), which means that
  // EXACTLY the production program gets warmed up.
  try { const im = iceCrustMat(); im.uniforms.uGlowK.value = 0; im.colorWrite = false;
        g.add(new THREE.Mesh(tiny, im)); } catch (e) {}
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.001, 0)]);
  const ln = new THREE.Line(lg, new THREE.LineDashedMaterial({ transparent:true, opacity:0, dashSize:0.3, gapSize:0.15 })); // lineFX
  ln.computeLineDistances();
  g.add(ln);
  g.position.set(0, 0, -0.5); // always in frame in front of the camera, invisible to the eye
  camera.add(g);
  scene.add(camera); // the camera's children are rendered only when the camera is in the scene graph
})();
