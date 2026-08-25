// ===== 12-matcap-edit: MATCAP EDITOR IN DEVELOPER MODE =====
// The owner's word 2026-08-17: «a good thing for editing a matcap. How could we
// add it in developer mode, so that I could quickly put different
// material on objects and check how it looks in battle?» (reference —
// jverneaut/laboratoire/src/matcap-editor: a canvas with a brush, blur, export).
//
// ⚠️⚠️ THE MAIN DIFFERENCE FROM THE REFERENCE — APPLYING TO THE LIVE SCENE, NOT A PREVIEW
// ON A SPHERE. Our matcaps live in the cache AS ONE TEXTURE OBJECT PER PRESET, and
// materials only reference it — which means it is enough to rewrite the PIXELS and
// set `needsUpdate`, and the whole pile changes in the same frame. The materials
// are not touched (no shader recompilation is needed here) — the same trick as
// in `retuneMatcap`.
//
// ⚠️ MODULE 12 — AFTER 10-stage (`makeMatcap`, `matcapCache`, `MATCAP_SIZE` live there)
// and BEFORE 20-arena. Functions are hoisted, but CONSTANTS of higher modules are in the
// TDZ for top-level code of lower ones; here there is no top-level code at all, only declarations.
//
// ⚠️ OPENS BY HAND ONLY: `__game.matcapEdit()` or the button in the developer
// panel. The panel itself ships in the build, same as `matcapTuner`.
const MCE_CANVAS = 512;                 // the source canvas — same as the reference
// ⛔ THE BACKGROUND USED TO BE A COLOUR PICKER; since 2026-08-25-b («remove the top part with
// the drawing of the material») it is this constant — the picker's own former default.
const MCE_BASE = '#8a8f98';
// ⛔ `mceDrawing`/`mceLast` DIED WITH THE BRUSH (2026-08-25-b). They are NOT removed: `mceCtx`
// beside them is still the picture layer's context and is written by the PNG drop, so the line
// stays as one declaration; a reader looking for the brush must find its tombstone, not silence.
let mcePanel = null, mceCtx = null, mcePost = null, mceDrawing = false, mceLast = null;
// saved procedural pixels of the presets — so that «Reset» returns exactly what
// was there instead of recomputing it (the recompute depends on the tuner's live sliders)
const mceBackup = new Map();

// TARGETS: our four independent matcap carriers. The names are the same keys as
// in `makeMatcap`, plus the blades (they have their own texture from the owner's PNG).
// ⚠️⚠️ PACKS ARE TAKEN FROM THE LIVE POOL, NOT FROM A LIST. The owner cuts and adds
// types (120 → 88 in a single session), and a hand-written list would have diverged from
// the game at the very first batch of models — the canonical rake «a copy of an attribute
// next to the working value». The pack name is the `tex` field of a type, and it is also the atlas key.
function mcePacks(){
  const packNames = new Set();
  try { for (const t of TYPES) if (t && t.tex) packNames.add(t.tex); } catch (e) {}
  return [...packNames].sort();
}
// RUSSIAN PACK LABELS — for the panel; an unknown pack is shown as is
// instead of dropping out of the list (a new batch arrives — it is visible at once).
// ⛔ THESE LABELS, AND THE TARGET LABELS IN `mceTargets` BELOW, STAY RUSSIAN ON
// PURPOSE: test.js matches them by regex (~9339-9533, the animal-pack label among
// them). Translate them ONLY in lockstep with test.js — otherwise the guard that
// walks the owner's path through this panel goes silently blind.
const MCE_PACK_LABEL = { food:'food', animal:'animals', car:'cars', brick:'bricks',
  pirate:'pirate', holiday:'holiday', toycar:'toy cars', factory:'factory',
  survival:'survival', forest:'forest' };
function mceTargets(){
  const packs = mcePacks().map(p => ({ id:'pack:' + p, label:'pack: ' + (MCE_PACK_LABEL[p] || p) }));
  return [
    { id:'tex',   label:'all textured at once' },
    ...packs,
    { id:'soft',  label:'painted items' },
    { id:'metal', label:'chrome' },
    { id:'blades',label:'mixer blades' },
    { id:'bomb',  label:'bomb' },
  ];
}
// ⚠️ A PACK GETS ITS TEXTURE ONLY AT THE MOMENT OF APPLYING (copy on
// demand): before that it shares the common one with the rest, and `mceTexOf` honestly
// returns `null` — «it has none of its own yet». `mceApply` is what creates it.
function mcePackOf(id){ return (id && id.indexOf('pack:') === 0) ? id.slice(5) : null; }
// ⛔⛔ PER-OBJECT TARGETS (the owner's word 2026-08-25-b: «show a list of objects, so that I
// could add its own matcap not to a GROUP but to EACH one»).
// ⚠️ THE POOL IS LIVE, exactly as with the packs — a hand-written list of 80+ names would have
// diverged from the game at the first batch of models. The id is `type:<name>` and the name is
// `type.name`, the same key `typeMatcaps` (10-stage) is registered under.
function mceTypeOf(id){ return (id && id.indexOf('type:') === 0) ? id.slice(5) : null; }
function mceTypeDef(name){
  try { for (const t of TYPES) if (t && t.name === name) return t; } catch (e) {}
  return null;
}
function mceTypeTargets(){
  const out = [];
  try {
    for (const t of TYPES){
      if (!t || !t.name) continue;
      const grp = t.tex ? (MCE_PACK_LABEL[t.tex] || t.tex)
                        : (t.paint ? 'painted' : (t.mat === 'chrome' ? 'chrome' : 'plain'));
      out.push({ id: 'type:' + t.name, name: t.name, grp,
                 label: (typeof accLabel === 'function' ? accLabel(t.name) : t.name) });
    }
  } catch (e) {}
  out.sort((a, b) => a.grp.localeCompare(b.grp) || a.label.localeCompare(b.label));
  return out;
}
// Everything Apply/Reset/live have to walk. ⚠️ `mceTargets()` is left UNTOUCHED as the group
// list: the suite finds the pack rows by their labels through it, and widening it would have
// changed what those guards count.
function mceAllTargets(){ return mceTargets().concat(mceTypeTargets()); }
function mceTexOf(id){
  if (id === 'blades') return (typeof metalMatcapTex === 'function') ? metalMatcapTex() : null;
  if (id === 'bomb')   return (typeof bombMatcapTex  === 'function') ? bombMatcapTex()  : null;
  const pack = mcePackOf(id);
  if (pack) return (typeof packMatcaps !== 'undefined') ? (packMatcaps.get(pack) || null) : null;
  return makeMatcap(id);
}
// ⚠️⚠️ APPLYING GOES THROUGH DOWNSCALING TO THE SIZE OF THE LIVE TEXTURE, NOT
// THROUGH SWAPPING THE OBJECT: our procedural matcaps are 128×128 (`MATCAP_SIZE`), and
// showing 512 in the game would mean showing NOT WHAT will be in battle. The export
// meanwhile stays 512 — the full resolution is what has to be baked into the build.
// ⚠️⚠️ THE MATCAP'S ALPHA IS THE SPECULAR HIGHLIGHT, AND THE ENGINE OWNS IT, NOT THE CANVAS.
// In `matcapSpecPatch` (10-stage) there is `... + vec3( matcapColor.a )`, that is, the
// alpha is ADDED to the surface; in the procedural presets the highlight is baked exactly
// into it (`data[i+3] = (sp*255)|0`). The canvas, however, is OPAQUE inside the round mask
// (filled with a six-digit hex), so copying RGBA «as is» set
// the alpha to 255 EVERYWHERE and added one to the whole surface.
// ⛔ MEASUREMENT OF THE DEFECT (A/B on an EMPTY canvas, without a single stroke, the
// `animalbee` portrait): brightness 144.9 → 255.0, saturation 0.400 → 0. That is, a single
// apply in the editor silently whitened the target — including the pack matcaps
// accepted by the owner by the numbers (2026-08-18).
// ⚠️ THE RULE IS ONE AND IT WAS ALREADY IN THE PROJECT, I only extended it to the
// editor: in Graphics' `08-matcap-packs` the library picture is laid down with
// `d[i+3] = 0` — «alpha = highlight, and the library one has none». Here it is the same,
// only we PRESERVE the TARGET's highlight instead of zeroing it: the editor edits the COLOR.
// ⛔ Zeroing the alpha IN THE CANVAS is still forbidden (the canvas is premultiplied, at
// alpha 0 the browser returns zero RGB) — we touch only the raw bytes of the
// DataTexture, and they know nothing about premultiplication.
function mceAlphaFromEngine(data, S, base){
  const b = base && base.image && base.image.data;
  if (!b){                      // the base has no highlight (or it is a PNG without an array)
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
    return 'none';
  }
  // ⚠️⚠️ WE TAKE THE BASE'S GEOMETRY ALONG BOTH AXES, NOT FROM THE WIDTH ALONE.
  // `packMatcapLoad` (08-matcap-packs) accepts ANY PNG and stores `{width,
  // height}` as is — nobody checks squareness. The previous version considered
  // the base square by its width: for a 128×64 picture at S=128 the «one-to-one» branch
  // stopped at half of the buffer (`i < b.length`), and for the lower half of the
  // texels the alpha stayed 255 from the opaque canvas — THE WHITENING
  // CAME BACK on half of the sphere. Found by adversarial review 2026-08-19.
  const BW = (base.image.width  || S)  | 0;
  const BH = (base.image.height || BW) | 0;
  if (b.length !== BW * BH * 4){
    // the buffer does not match the declared geometry — reading it blindly is not allowed;
    // the safe outcome is the same as «there is no highlight»
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
    return 'mismatch ' + BW + '×' + BH + ' vs ' + b.length;
  }
  if (BW === S && BH === S){
    for (let i = 3; i < data.length; i += 4) data[i] = b[i];
    return 'one-to-one';
  }
  // ⚠️ THE SIZES DIVERGE (presets 128, pack pictures 256) — we take the nearest
  // pixel. Our highlight is a large soft blob, it does not need interpolation.
  for (let y = 0; y < S; y++){
    const by = Math.min(BH - 1, (y * BH / S) | 0);
    for (let x = 0; x < S; x++){
      const bx = Math.min(BW - 1, (x * BW / S) | 0);
      data[(y * S + x) * 4 + 3] = b[(by * BW + bx) * 4 + 3];
    }
  }
  return 'nearest ' + BW + '×' + BH + '->' + S;
}
function mceApply(id){
  // ⛔ THE PER-OBJECT BRANCH COMES FIRST AND ALWAYS MAKES ITS OWN TEXTURE: a type has no
  // «shared» texture of its own to write into — it wears its pack's, and writing into that is
  // exactly the group edit he asked to stop doing.
  const tname = mceTypeOf(id);
  if (tname){
    const S = MATCAP_SIZE;
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
    const g0 = tmp.getContext('2d'); g0.imageSmoothingEnabled = true;
    g0.drawImage(mcePost, 0, 0, S, S);
    const data = new Uint8Array(g0.getImageData(0, 0, S, S).data);
    // ⚠️ THE HIGHLIGHT COMES FROM WHATEVER THIS TYPE WEARS RIGHT NOW — through the single rule
    // `itemMatcapAim`, not through a second copy of the tier order.
    const def = mceTypeDef(tname);
    const base = (typeof itemMatcapAim === 'function' && def) ? itemMatcapAim(def) : makeMatcap('tex');
    mceAlphaFromEngine(data, S, base);
    const ownTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    ownTex.encoding = THREE.sRGBEncoding;
    ownTex.magFilter = ownTex.minFilter = THREE.LinearFilter;
    ownTex.needsUpdate = true;
    const n = setTypeMatcap(tname, ownTex);
    mceBackup.set(id, null);          // «Reset» drops the override and the type returns to its pack
    return 'type ' + tname + ': own texture ' + S + '×' + S + ', items ' + n;
  }
  const pack = mcePackOf(id);
  if (pack && !mceTexOf(id)){
    // ⚠️ THE FIRST APPLY TO A PACK = THE BIRTH OF ITS OWN TEXTURE. Before it
    // the pack shared the common one, and the edit would have spread over ALL textured items —
    // exactly what the owner asked to avoid («per pack»).
    const S = MATCAP_SIZE;
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
    const g0 = tmp.getContext('2d'); g0.imageSmoothingEnabled = true;
    g0.drawImage(mcePost, 0, 0, S, S);
    const data = new Uint8Array(g0.getImageData(0,0,S,S).data);
    // we take the highlight from THAT texture which the pack carried before the edit: for a pack
    // with a picture it is its alpha (Graphics keeps it at 0), for the rest — the `tex` preset
    const packBase = ((typeof packMatcapTex === 'function' && packMatcapTex(pack)) || makeMatcap('tex'));
    mceAlphaFromEngine(data, S, packBase);
    const ownTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    ownTex.encoding = THREE.sRGBEncoding;
    ownTex.magFilter = ownTex.minFilter = THREE.LinearFilter;
    ownTex.needsUpdate = true;
    const n = setPackMatcap(pack, ownTex);
    mceBackup.set(id, null);          // «Reset» will return the pack to the common texture
    return 'pack ' + pack + ': own texture ' + S + '×' + S + ', items ' + n;
  }
  const tex = mceTexOf(id);
  if (!tex) return 'no such target';
  const S = (tex.image && tex.image.width) ? tex.image.width : MATCAP_SIZE;
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
  const g = tmp.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(mcePost, 0, 0, S, S);
  const src = g.getImageData(0, 0, S, S).data;
  if (!mceBackup.has(id)){
    // a copy BEFORE the first edit — «Reset» returns exactly it
    // ⚠️⚠️ THE PICTURE TARGETS (blades, bomb) HAVE NO BYTES AT ALL: their texture is
    // a `THREE.Texture` on top of an `HTMLImageElement` (06-matcap-metal / 07-matcap-bomb,
    // the owner's PNG), and its `image.data === undefined`. The previous line put
    // `null` into their backup, and below `tex.image = tmp` overwrote the ONLY reference to
    // the decoded PNG — and «Reset» became a SILENT NO-OP: both of its branches
    // fell through, there was nothing to return, and it was cured only by reloading the page.
    // Found by adversarial review 2026-08-19, lifted by the owner's word
    // 2026-08-20 («fix the rest»).
    // THE CURE: whoever has bytes — we keep A COPY OF THE BYTES (as before), whoever has none —
    // we keep THE SOURCE OBJECT ITSELF. It does not go anywhere: we only detach it
    // from the texture rather than spoil it.
    const d = tex.image && tex.image.data;
    mceBackup.set(id, d ? new Uint8Array(d) : (tex.image || null));
  }
  const dst = tex.image && tex.image.data;
  if (dst && dst.length === src.length){
    // ⚠️ RGB ONLY: the target's alpha is its own highlight, it stays as it was
    for (let i = 0; i < src.length; i += 4){
      dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2];
    }
  }
  else {
    // the blades' PNG matcap has no data array — there we swap the source itself
    tex.image = tmp;
  }
  tex.needsUpdate = true;
  // ⚠️⚠️ AN EDIT IN PLACE — AND THE PORTRAIT SNAPSHOTS WENT STALE. The texture object is the same,
  // nothing has to be re-assigned to the materials, but `itemThumb` (85-hud) keeps
  // the FINISHED PNG forever. `setPackMatcap` does not come here — it is about SWAPPING the object,
  // and here we write into the existing bytes, — so we drop the cache ourselves. Without this
  // a brush stroke did not move the collection card AT ALL (measurement: 67.6/0.730 before and
  // after the stroke, one to one). The «stale portraits» defect, 2026-08-19.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
  return 'applied: ' + id + ' (' + S + '×' + S + ')';
}
function mceReset(id){
  const tname = mceTypeOf(id);
  if (tname){ setTypeMatcap(tname, null); mceBackup.delete(id); return; }
  const pack = mcePackOf(id);
  if (pack){ setPackMatcap(pack, null); mceBackup.delete(id); return; }
  const tex = mceTexOf(id); if (!tex) return;
  const b = mceBackup.get(id);
  if (b instanceof Uint8Array){
    // procedural presets and pack textures: we put the bytes back in place
    if (tex.image && tex.image.data && tex.image.data.length === b.length){
      tex.image.data.set(b); tex.needsUpdate = true;
    }
  } else if (b && (b.width || b.nodeName)){
    // ⚠️ A PICTURE TARGET (blades, bomb): we swap the SOURCE back. This is exactly
    // the inverse operation to `tex.image = tmp` in `mceApply` — by the same means as
    // the damage itself, otherwise the restore would lie about its own coverage.
    tex.image = b; tex.needsUpdate = true;
  } else if (typeof retuneMatcap === 'function' && id !== 'blades' && id !== 'bomb'){
    // ⚠️ The `blades`/`bomb` gate STAYS even after the fix: `retuneMatcap` walks
    // `matcapCache` (keys soft/metal/tex) and does not reach these two at all —
    // the call would be empty while looking like a fallback path.
    retuneMatcap(id);   // also an edit IN PLACE: `bakeMatcap` writes into `tex.image.data`
  }
  // ⚠️ BOTH branches above are an edit in place, so the portrait snapshots have to be dropped
  // exactly as in `mceApply`. The pack branch returned earlier via
  // `setPackMatcap`, and that one does it itself.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
}

// ═══ THE PANEL ═══ The style and the techniques are taken from `matcapTuner` (10-stage): a fixed
// panel, z-index ABOVE the overlays, keydown is NOT let through into the game (otherwise space on
// a slider would go into a shake).
// ⚠️⚠️ THE «IS OPEN» ATTRIBUTE IS A SEPARATE FUNCTION, NOT A FLAG NEXT TO IT: the panel
// is created and torn down by a SINGLE variable `mcePanel`, and a second flag next to it
// would have diverged at the very first way of closing that it does not learn about (the law
// «a copy of an attribute diverges from its source», caught five times in this project).
// The main loop reads it — for the sake of freezing the mixer's clock (the owner's word
// 2026-08-17-e «if the matcap editor is open, we freeze the mixer timer»).
function mceIsOpen(){ return !!mcePanel; }
function matcapEdit(){
  if (mcePanel){ mcePanel.remove(); mcePanel = null; return 'matcap editor: closed'; }
  const p = mcePanel = document.createElement('div');
  p.id = 'matcapEdit';
  p.style.cssText = 'position:fixed; left:10px; top:10px; z-index:21; width:300px;'
    + ' max-height:calc(100vh - 20px); overflow:auto; pointer-events:auto;'
    + ' background:rgba(15,20,30,.96); color:#dfe6f2; border-radius:10px; padding:10px 12px;'
    + ' font:12px/1.35 ui-monospace,Menlo,monospace; box-shadow:0 6px 24px rgba(0,0,0,.45);';
  p.addEventListener('keydown', e => e.stopPropagation());
  const h = document.createElement('div');
  h.textContent = 'MATCAP EDITOR';
  h.style.cssText = 'font-weight:700; letter-spacing:.06em; margin-bottom:8px;';
  p.appendChild(h);

  // ⛔⛔ THE DRAWING HALF IS GONE (the owner's word 2026-08-25-b: «remove the top part with the
  // drawing of the material»). What went with it: the visible 276px canvas, the four controls
  // (background / brush / size / blur), the pointer handlers and the brush itself. THE SOURCE OF
  // A MATCAP IS NOW A PNG — the drop zone below, which had always been the faster of the two
  // paths («ready-made ones come in bundles»).
  // ⚠️ `mcePost` IS KEPT AND STAYS OFFSCREEN, NOT APPENDED: it is the canvas `mceApply` reads
  // the pixels from, and every target branch downsamples it into the live texture. Deleting it
  // would mean rewriting the whole apply tract for no reason.
  // ⚠️ `draw` IS KEPT TOO — it is the PICTURE layer, the thing a dropped PNG lands in and the
  // thing «Clear» empties. It simply has no brush strokes reaching it any more.
  // ⚠️ THE BACKGROUND IS A CONSTANT NOW, and it is the former control's own default: with no
  // picture loaded the source is a flat fill, exactly as it was when the panel opened.
  const draw = document.createElement('canvas'); draw.width = draw.height = MCE_CANVAS;
  mcePost = document.createElement('canvas'); mcePost.width = mcePost.height = MCE_CANVAS;
  mceCtx = draw.getContext('2d');

  // ⚠️ THE POST-PROCESSING DRAWS FROM SCRATCH EVERY TIME: the background, then the blurred brush layer.
  // The reference applies the blur ONTO ITSELF and accumulates it from frame to frame — for us that
  // would give «creeping» at every movement of a slider.
  // ⚠️⚠️ `silent` IS NOT A CONVENIENCE, IT IS A BAN ON APPLYING WITHOUT BEING ASKED.
  // The panel is built with the apply-immediately checkbox TURNED ON and with target #0, the
  // all-textured-at-once one (`cb.checked = (i === 0)`), while the canvas at start is a flat fill of
  // `ctrl.base`. Without this flag the final `renderPost()` at the end of the build laid the grey
  // fill onto the common `tex` preset AT THE MOMENT THE EDITOR WAS OPENED: the owner saw
  // the damage without having made a single click. MEASUREMENT (the `animalcow` portrait, a build with the
  // alpha already fixed): without the panel 209.4/0.106 → after merely opening it
  // 114.3/0.239. The second half of the «whitening» defect (2026-08-19).
  // ⚠️ It is silent ONLY on opening: a stroke, a slider, «Clear» and a dropped PNG
  // call `renderPost()` without an argument and are applied at once — this is what the owner asked for.
  function renderPost(silent){
    const g = mcePost.getContext('2d');
    g.setTransform(1,0,0,1,0,0); g.filter = 'none';
    g.fillStyle = MCE_BASE; g.fillRect(0,0,MCE_CANVAS,MCE_CANVAS);
    g.drawImage(draw, 0, 0);
    // ⚠️ THE ROUND MASK: a matcap is sampled by the normal, the corners of the square do not
    // get into the sampling at all — but if they are not cut off, the blur drags the edge colour
    // inside the sphere and dirt runs along the rim.
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(MCE_CANVAS/2, MCE_CANVAS/2, MCE_CANVAS/2, 0, Math.PI*2); g.fill();
    g.globalCompositeOperation = 'source-over';
    // ⚠️ THE LIVE APPLY WALKS **ALL** THE TARGETS, groups and single objects alike — otherwise
    // ticking an object and dropping a PNG would do nothing until «Apply» was pressed by hand.
    if (autoApply.checked && !silent) mceAllTargets().forEach(t => {
      const cb = targetChecks[t.id]; if (cb && cb.checked) mceApply(t.id); });
  }

  // ── TARGETS: what to try it on. Without a choice it is unclear what exactly you are seeing: we have
  // four independent carriers, and the items are split between them by packs.
  const targetsHead = document.createElement('div');
  targetsHead.textContent = 'apply to';
  targetsHead.style.cssText = 'margin-top:10px; opacity:.65;';
  p.appendChild(targetsHead);
  const targetChecks = {};
  mceTargets().forEach((t, i) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:3px;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = (i === 0);
    const s = document.createElement('span'); s.textContent = t.label; s.style.cssText = 'opacity:.85;';
    row.appendChild(cb); row.appendChild(s); p.appendChild(row);
    targetChecks[t.id] = cb;
  });
  // ── ⛔⛔ AND THE LIST OF SINGLE OBJECTS (the owner's word 2026-08-25-b: «show a list of
  //    objects, so that I could add its own matcap not to a GROUP but to EACH one»).
  //    ⚠️ IT IS A SECOND LIST, NOT AN EXTENSION OF THE ONE ABOVE, and the split is deliberate:
  //    the groups are six-to-sixteen rows a human reads at a glance, the objects are ~90 and
  //    need a filter and a scroller. Mixing them would have buried «all textured at once».
  //    ⚠️ ONE `targetChecks` MAP FOR BOTH, so Apply/Reset/live have a single place to look.
  //    ⚠️ A TYPE OVERRIDE BEATS ITS PACK (the tier order in `itemMatcapAim`, 10-stage), so
  //    ticking both a pack and one of its objects is not a conflict — the object wins, which is
  //    exactly what «not to a group but to each» asks for.
  const objHead = document.createElement('div');
  objHead.textContent = 'objects (each its own)';
  objHead.style.cssText = 'margin-top:12px; opacity:.65;';
  p.appendChild(objHead);
  const objFilter = document.createElement('input');
  objFilter.type = 'search'; objFilter.placeholder = 'filter…';
  objFilter.style.cssText = 'width:100%; margin-top:4px; padding:4px 6px; border-radius:6px;'
    + ' border:1px solid rgba(223,230,242,.25); background:rgba(255,255,255,.06); color:inherit; font:inherit;';
  p.appendChild(objFilter);
  const objBox = document.createElement('div');
  objBox.style.cssText = 'max-height:180px; overflow:auto; margin-top:4px;'
    + ' border:1px solid rgba(223,230,242,.15); border-radius:6px; padding:4px 6px;';
  p.appendChild(objBox);
  // ⚠️ THE ROWS ARE BUILT ONCE AND ONLY HIDDEN BY THE FILTER — rebuilding them would throw away
  // the checkboxes together with everything the owner had ticked, which is the one thing a
  // filter must never do.
  const objRows = [];
  mceTypeTargets().forEach(t => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:3px;';
    // ⚠️ THE ROW CARRIES ITS TYPE NAME. The visible label is `accLabel` («Banana»), and a guard
    // that had to tick a row would otherwise have to reproduce that mapping — a copy of a
    // translation table beside the working one, which is how the labels drifted last time.
    row.dataset.type = t.name;
    const cb = document.createElement('input'); cb.type = 'checkbox';
    const s1 = document.createElement('span'); s1.textContent = t.label; s1.style.cssText = 'opacity:.9;';
    const s2 = document.createElement('span'); s2.textContent = t.grp;
    s2.style.cssText = 'margin-left:auto; opacity:.45; font-size:11px;';
    row.appendChild(cb); row.appendChild(s1); row.appendChild(s2);
    objBox.appendChild(row);
    targetChecks[t.id] = cb;
    objRows.push({ row, hay: (t.label + ' ' + t.grp + ' ' + t.name).toLowerCase() });
  });
  objFilter.addEventListener('input', () => {
    const q = objFilter.value.trim().toLowerCase();
    objRows.forEach(r => { r.row.style.display = (!q || r.hay.indexOf(q) >= 0) ? '' : 'none'; });
  });
  const objNote = document.createElement('div');
  objNote.style.cssText = 'margin-top:4px; opacity:.5; font-size:11px;';
  objNote.textContent = objRows.length + ' objects — an object beats its pack';
  p.appendChild(objNote);

  const autoApply = document.createElement('input'); autoApply.type = 'checkbox'; autoApply.checked = true;
  { const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:6px;';
    const s = document.createElement('span'); s.textContent = 'apply immediately (live)';
    row.appendChild(autoApply); row.appendChild(s); p.appendChild(row); }

  // ── BUTTONS
  const btnBar = document.createElement('div');
  btnBar.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;';
  const mkBtn = (text, bg, action) => {
    const b = document.createElement('button'); b.textContent = text;
    b.style.cssText = 'flex:1 1 auto; padding:6px 8px; border:0; border-radius:6px; cursor:pointer;'
      + ' font:inherit; background:' + bg + '; color:#0d1420;';
    b.addEventListener('click', action); btnBar.appendChild(b); return b;
  };
  mkBtn('Apply', '#9ce52e', () => { const r = mceAllTargets()
    .filter(t => targetChecks[t.id] && targetChecks[t.id].checked).map(t => mceApply(t.id));
    console.log(r.join('\n')); });
  mkBtn('Reset', '#e5484d', () => { mceAllTargets().forEach(t => {
    const cb = targetChecks[t.id]; if (cb && cb.checked) mceReset(t.id); }); });
  mkBtn('Clear', '#8b93a0', () => { mceCtx.clearRect(0,0,MCE_CANVAS,MCE_CANVAS); renderPost(); });
  p.appendChild(btnBar);

  // ⚠️⚠️ LOADING A READY-MADE PNG — THE REFERENCE DOES NOT HAVE THIS, WHILE THE OWNER'S TASK
  // READS «QUICKLY ADD DIFFERENT material». Drawing a matcap from scratch takes long,
  // while ready-made ones come in bundles; you drop a file — and it is on the items in the same frame.
  const dropZone = document.createElement('div');
  dropZone.textContent = 'drop a PNG here (or click)';
  dropZone.style.cssText = 'margin-top:8px; padding:10px; border:1px dashed rgba(223,230,242,.35);'
    + ' border-radius:8px; text-align:center; opacity:.7; cursor:pointer;';
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  const takeFile = f => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const im = new Image();
      im.onload = () => {
        // we put it into the BRUSH LAYER, not into the post: then one can draw on top of the picture
        mceCtx.clearRect(0,0,MCE_CANVAS,MCE_CANVAS);
        mceCtx.drawImage(im, 0, 0, MCE_CANVAS, MCE_CANVAS);
        // ⚠️ THE PANEL HAS NO PREVIEW ANY MORE, so the drop zone itself reports what is loaded —
        // without it the only feedback would be the pile changing, and on an unticked target
        // there would be none at all.
        dropZone.textContent = 'loaded: ' + (f.name || 'PNG') + ' — press Apply';
        renderPost();
      };
      im.src = rd.result; };
    rd.readAsDataURL(f);
  };
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => takeFile(fileInput.files && fileInput.files[0]));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.opacity = '1'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.opacity = '.7'; });
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.style.opacity = '.7';
    takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  p.appendChild(dropZone); p.appendChild(fileInput);

  // ── EXPORT: a PNG in full resolution (512 is what has to be baked in, not the in-game 128)
  const bottomRow = document.createElement('div');
  bottomRow.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
  { const b = document.createElement('button'); b.textContent = 'Download PNG';
    b.style.cssText = 'flex:1; padding:6px 8px; border:0; border-radius:6px; cursor:pointer;'
      + ' font:inherit; background:#dfe6f2; color:#0d1420;';
    b.addEventListener('click', () => mcePost.toBlob(bl => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(bl);
      a.download = 'matcap.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png'));
    bottomRow.appendChild(b); }
  p.appendChild(bottomRow);
  const footNote = document.createElement('div');
  footNote.style.cssText = 'margin-top:8px; opacity:.55; font-size:11px;';
  footNote.textContent = 'canvas 512, in game ' + MATCAP_SIZE + ' — exactly what ships';
  p.appendChild(footNote);

  document.body.appendChild(p);
  renderPost(true);          // OPENING APPLIES NOTHING (see `silent` above)
  return 'matcap editor: open';
}
