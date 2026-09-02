// ===== 30-shapes: type geometries, palette, item materials =====
// The owner's references: webgl_geometries, webgl_geometry_shapes,
// webgl_geometry_teapot (shapes); webgl_batch_lod_bvh (pastel colors
// in linear HSL); webgl_loader_ldraw (the LEGO-plastic finish).

// Simple new shapes (the owner's spec 2026-07-20): all CONVEX — physics
// and the accessibility samples work through a convex hull with no hand-made compounds
function gemGeo(){ // crystal: two 8-sided pyramids base to base
  const up = new THREE.ConeGeometry(0.7, 0.8, 8);
  const down = new THREE.ConeGeometry(0.7, 0.8, 8);
  const mUp = new THREE.Matrix4().makeTranslation(0, 0.4, 0);
  const mDown = new THREE.Matrix4().makeRotationX(Math.PI).setPosition(0, -0.4, 0);
  return mergeGeos([[up, mUp], [down, mDown]]);
}
function mergeGeos(parts){ // [geometry, Matrix4] -> one non-indexed geometry
  const pos = [], norm = [];
  for (const [g, m] of parts){
    const ng = g.toNonIndexed();
    ng.applyMatrix4(m);
    pos.push.apply(pos, ng.attributes.position.array);
    norm.push.apply(norm, ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  return out;
}
// teapotGeo DELETED 2026-07-20 (the owner's spec: «remove the teapot model»);
// the archaeology surprise will come back with a real model from the 3D assets

// rc — the effective radius of the UNscaled geometry (between the inradius and
// the bounding sphere): collider = rc * s * MESH_SCALE, so that the items
// visually touch the floor and each other instead of hanging on invisible spheres.
// The palette is friendly pastel (dark green and brown are excluded);
// ⚠️ REMOVED BY THE OWNER'S DIRECT SPEC 2026-07-30: `holidaycandycanered`
// (the candy cane — «remove it completely», on the screenshot it read as a thick striped pipe)
// and `steak` («remove the steak entirely»). ⚠️ ABOUT THE STEAK: this is a CANCELLATION of his own spec
// from the same day — that morning the model was moved TO INDEX 9 with the wording «do NOT
// move it to the tail, the owner's model must be in the game», and a suite
// assert stood on that. The owner changed his mind; the assert was removed together with the type. The model's
// data (35-steak.js) was deleted too — «entirely». To bring it back = restore the file
// from git history + the TYPES line.
// mat: soft (polished colored lacquer), chrome (mirror chrome) —
// the reference is webgl_materials_envmaps_fasthdr (spheres #5 and #3).
// ⚠️ THE ORDER MATTERS: progression UNLOCKS the first typesCount types (9 on the 1st
// level, +1 per level). ⚠️ Since 2026-07-30 genLevel takes a RANDOM
// sample of the needed size from the unlocked range, and NOT the first ones in a row — before that everything
// that stood past index PAIRS-1 (89) never spawned at all (see genLevel).
// The order still decides WHEN a type unlocks,
// +1 per level up to 15). The owner's models are placed AT THE START deliberately —
// otherwise they cannot be seen on the first levels (the 2026-07-20 request «I want to take a look»).
// To bring the primitives back to the front = just swap the blocks around.
// The 'teapot' type was removed at the owner's request; the teapotGeo function is KEPT —
// the golden surprise from the bottom rests on it (makeSurprise).
const TYPES = [
  // ⚠️ THE POOL IS THE OWNER'S MODELS ONLY (the owner's decision 2026-07-21:
  // «delete the procedural shapes entirely»). The cube, sphere, torus, cone and the other
  // primitives are REMOVED FROM THE POOL. Their factories in this file are KEPT alive
  // deliberately: the surprise geometry fallback hangs on gemGeo (makeSurprise
  // in 40-items), and gemGeo leans on mergeGeos — tearing that chain apart for
  // cosmetics is not worth it. To bring a primitive back into the game = add a line here.
  //
  // 30 fruits-and-vegetables + 24 animals + 8 cars + 7 bricks + 8 pirates,
  // MIX 3:3:1:1:1 (the owner's decision 2026-07-22), plus the steak
  // (35-steak — also the owner's model, not a primitive; vertex colors,
  // no atlas). Each pack has ITS OWN atlas (tex:'animal'/'food'/'car'/
  // 'brick'/'pirate'), the material color is WHITE; `color` paints NOT the model but the DEBRIS.
  //
  // ⚠️ THE EXCEPTION IS THE BRICKS (`paint:1`, the owner's decision «paint the bricks»):
  // the Brick pack's atlas is WHITE (measurement over the UVs: #f9f9fc on 152 models out of 185), and
  // from above they are merely rectangles of different proportions — telling them apart
  // while white is impossible. So their color is given by THE PALETTE (candyColor from `color`),
  // like the procedural ones, and `color` here paints BOTH the model AND the debris. The implementation is
  // the t.paint branch in makeItem (40-items).
  // ⚠️ Out of the 185 Brick files 7 were taken: the rest are the same shapes in 8 edge
  // variants (bevel/none/round/square × hq/lq), indistinguishable from above, plus
  // length duplicates (1x4/1x6/1x8 — one and the same bar). Out of the 19 Pirate ones 8 were taken:
  // THE SHIPS WERE NOT TAKEN (five twins from above, extent 5.0-6.5 against 1.0 and
  // fill 0.15-0.18 — a convex hull would lie crudely), the flags and the palm-
  // flagpole are flat. We do not touch the rocks-* stones — the owner's reserve.
  //
// ⚠️ ORDER = PROGRESSION: types in a level are 9+level−1, they unlock in the order of the
// array. The most distinguishable ones come first — the match goes BY TYPE, confusing them at the start is not allowed.
// ⚠️ THE 2026-07-30 LAYOUT (the owner's spec «shuffle the types»):
//   • indices 0..8 — the base nine of lvl.1, DO NOT TOUCH;
//   • index 9 — THE STEAK, the owner's model, we keep it close to the start (his spec);
//   • the Kenney batch is mixed in EVENLY further on (~every 4th), and not in the tail:
//     in the tail it did not unlock before lvl.86 and did not exist for the player;
//   • the survivalfish FISH is shifted NOT into the first insertions — the newcomer must first
//     learn «a goldfish at the bottom = treasure» (the Graphics workstream's objection was taken into account);
//   • THE DONUT stays in the tail, DO NOT MOVE IT FORWARD: its convex hull has no hole,
//     a compound collider is a Physics task after launch;
//   • forestplant is LAST DELIBERATELY: the sentinel for the tail guards in test.js.
  { name:'foodwatermelon',        color:0xff5a6e, rc:1.0, tex:'food', mat:'soft', geo:foodwatermelonGeo },
  { name:'foodbanana',            color:0xffe14d, rc:1.4, tex:'food', mat:'soft', geo:()=>foodbananaGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodorange',            color:0xff9a2b, rc:1.0, tex:'food', mat:'soft', geo:foodorangeGeo },
  { name:'animalbee',             color:0xffd633, rc:1.0, tex:'animal', mat:'soft', geo:animalbeeGeo },
  { name:'animalcrab',            color:0xff5a2b, rc:1.0, tex:'animal', mat:'soft', geo:animalcrabGeo },
  { name:'animalpig',             color:0xff9ec4, rc:1.0, tex:'animal', mat:'soft', geo:animalpigGeo },
  { name:'carpolice',             color:0x3a6ee0, rc:1.4, tex:'car', mat:'soft', geo:()=>carpoliceGeo().clone().scale(1.4, 1.4, 1.4) },
  // ===== THE OWNER'S BATCH OF 2026-08-28: five balls and the fries =====
  // His word: «check the new 3d objects and add them to the game on levels after 5, every 3
  // levels», confirmed as 6/9/12/15/18/21.
  // ⚠️⚠️ THE INDEX IS DERIVED FROM THE PROGRESSION, NOT PICKED: typesCount = LEVEL_TYPES_MIN +
  // (level-1) = level+2, and index i is open while i < typesCount, so a type at index i first
  // appears at level i-1 — hence index = level+1, i.e. 7/10/13/16/19/22. My first pass wrote
  // index = level-1 and silently landed everything on levels 4/7/10; caught by printing the
  // index->level table, not by reading. PRINT THE TABLE if you ever move these.
  // ⚠️⚠️ THE PRICE OF AN INSERTION INTO THE MIDDLE, NAMED TO THE OWNER AND ACCEPTED: every
  // existing type after index 7 is pushed 1..6 levels LATER, and the whole pool now opens at
  // level ~92 instead of ~86. Appending at the tail would have avoided that and would have
  // ignored his spec — the order of this array IS the difficulty lever, and he set it.
  // ⚠️ The heaviest two (golf 4416 tris, football 5580) stand LAST on purpose: the early levels,
  // where a first-time player meets the game, stay as light as they are today.
  // ⚠️ tex:'sport' is FORCED, not chosen: the atlas embedded in all seven .glb is byte for byte
  // the ANIMALS colormap, so these models can only be coloured by that palette. 39-sport aliases
  // it instead of shipping a second copy.
  // ⚠️ `color` here is the DEBRIS tint (fxColor), not the model's paint — for a textured type
  // material.color stays white. It is MEASURED, not picked: the area-weighted mean of the body
  // colours the model's own UV actually samples out of the atlas, with the black outline band
  // excluded. Re-measure it if the artist re-maps a model.
  // ⚠️ phys:'ball' on the five balls is NOT cosmetics — see the branch in 50-physics.
// ⛔⛔ THE SIX SPORT TYPES LEFT THE POOL 2026-08-30 (the owner: «uberi poslednie modeli ot
// 3d, kotorye tormozyat igru»). They entered 2026-08-28 at levels 6/9/12/15/18/21, lagged the
// frame in proportion to their triangles (measured), got machine LODs (variant 3, 2026-08-29),
// which the owner judged not good enough — the 3D artist is remaking them under
// docs/MODEL-BUDGET.md. THEY RETURN when the remakes land: same names, same slots, and the
// geoHi/geo machinery (portraitPick, the 'h' thumb key) is still in place, inert.
// ⚠️ The dynamite is NOT a TYPES entry and STAYS — it is the bomb's mesh (his own «zameni
// bombu dinamitom») and does not lag (804 tris, one item per level).
// ⚠️ MATERIAL_OF / ACC_LABELS keep their sport entries: harmless without the types, needed again
// with the remakes. Orphan sport rows in players' saves are inert — the collection is built
// from TYPES.map, unknown save keys are simply never displayed.
  // ⚠️⚠️ `mk:'soft'` — THE ONE TYPE IN THE GAME THAT WEARS ITS OWN MATCAP (the owner's word
  // 2026-08-31-g «the toilet paper is very light, it needs a darker tone or a matcap»).
  // MEASURED CAUSE, not taste: this model samples PURE WHITE 255,255,255 out of the shared
  // atlas — the ONLY one of the 99 live types that does (next is animalpolar at 219.9, the
  // pool median is 129.1). The textured-model matcap is deliberately almost white too
  // ('tex', amb 0.88) so that it does not crush the authors' colours — but this model HAS no
  // authored colour to crush, so nothing shaded it at all and it read as a flat white blob.
  // ⚠️ THE 'tex' PRESET'S OWN JUSTIFICATION DOES NOT APPLY HERE, AND THAT IS THE WHOLE
  // ARGUMENT: 'soft' (amb 0.66 + diff/spec/rim) darkens the body by a quarter AND gives the
  // roll form — the tube and the curl become visible. A tone alone was rendered too and only
  // made it a flat GREY blob; that is why the matcap won of the two he offered.
  { name:'propstoiletpaper', color:0xe8e8f2, mk:'soft', rc:1.0, tex:'props', mat:'soft', geo:propstoiletpaperGeo },
  { name:'brickround', color:0x35b8e0, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickroundGeo },
  { name:'piratebarrel', color:0xea9168, rc:1.0, tex:'pirate', mat:'soft', geo:piratebarrelGeo },
  { name:'propsdumbbell', color:0x3f3f46, rc:1.0, tex:'props', mat:'soft', geo:propsdumbbellGeo },
  { name:'foodstrawberry',        color:0xe83a4a, rc:1.0, tex:'food', mat:'soft', geo:foodstrawberryGeo },
  { name:'foodbroccoli',          color:0x4caf50, rc:1.0, tex:'food', mat:'soft', geo:foodbroccoliGeo },
  { name:'propswater', color:0xc4d9f2, rc:1.0, wr:0.35, tex:'props', mat:'soft', geo:propswaterGeo },
  { name:'foodgrapes',            color:0x9a5ac4, rc:1.0, tex:'food', mat:'soft', geo:foodgrapesGeo },
  // ===== THE KENNEY BATCH 2026-07-30: 28 items from 7 kits (the 38-kenney.js module,
  // separate from 36-models — see WORKSTREAMS, and there too why 36-models was NOT regenerated).
// ⚠️ THE BATCH IS SHUFFLED ALONG THE PROGRESSION (the owner's spec 2026-07-30
// «shuffle the types») — the former «appended to the tail» is CANCELLED: in the tail
// they did not unlock before lvl.86 and the owner did not see them at all.
  // color paints NOT the model (the atlas paints that) but the DEBRIS on decay — picked by
  // the item's dominant tone. wr is there where the converter marked a flat shape.
  { name:'animalpenguin',         color:0x3a4048, rc:1.0, tex:'animal', mat:'soft', geo:animalpenguinGeo },
  { name:'propsbook', color:0x5c68c5, rc:1.0, wr:0.78, tex:'props', mat:'soft', geo:propsbookGeo },
  { name:'animalcaterpillar',     color:0x5ac44a, rc:1.0, tex:'animal', mat:'soft', geo:animalcaterpillarGeo },
  { name:'animalfish',            color:0xff8c3a, rc:1.0, tex:'animal', mat:'soft', geo:animalfishGeo },
  { name:'propshat', color:0x6078cc, rc:1.0, tex:'props', mat:'soft', geo:propshatGeo },
  { name:'holidaygingerbreadman', color:0xc08a50, rc:1.0, wr:0.83, tex:'holiday', mat:'soft', geo:holidaygingerbreadmanGeo },
  { name:'cartaxi',               color:0xffc21a, rc:1.4, tex:'car', mat:'soft', geo:()=>cartaxiGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'propsplunger', color:0xcf534f, rc:1.0, tex:'props', mat:'soft', geo:propsplungerGeo },
  { name:'brickbar', color:0xe8433a, rc:1.0, wr:0.98, tex:'brick', paint:1, mat:'soft', geo:brickbarGeo },
  { name:'piratepalm', color:0xc87551, rc:1.0, tex:'pirate', mat:'soft', geo:piratepalmGeo },
  { name:'propsmatchbox', color:0xcd8962, rc:1.0, wr:0.86, tex:'props', mat:'soft', geo:propsmatchboxGeo },
  { name:'foodcorn',              color:0xffd54a, rc:1.0, tex:'food', mat:'soft', geo:foodcornGeo },
  { name:'foodeggplant',          color:0x7a4a9e, rc:1.0, tex:'food', mat:'soft', geo:foodeggplantGeo },
  { name:'propsketchup', color:0xb8453d, rc:1.0, wr:0.42, tex:'props', mat:'soft', geo:propsketchupGeo },
  { name:'foodlemon',             color:0xffe83a, rc:1.0, tex:'food', mat:'soft', geo:foodlemonGeo },
  { name:'holidaynutcracker', color:0xd6483f, rc:1.0, wr:0.49, tex:'holiday', mat:'soft', geo:holidaynutcrackerGeo },
  { name:'propsvolleyball', color:0x595ec0, rc:1.0, tex:'props', mat:'soft', phys:'ball', geo:propsvolleyballGeo },
  { name:'animalelephant',        color:0x9aa6b4, rc:1.0, tex:'animal', mat:'soft', geo:animalelephantGeo },
  { name:'animalpolar',           color:0xe8eef4, rc:1.0, tex:'animal', mat:'soft', geo:animalpolarGeo },
  { name:'propsfries', color:0xee7f48, rc:1.0, wr:0.63, tex:'props', mat:'soft', geo:propsfriesGeo },
  { name:'animaltiger',           color:0xff8a2b, rc:1.0, tex:'animal', mat:'soft', geo:animaltigerGeo },
  // ⚠️ THE FISH WAS ADDED BY THE OWNER'S DIRECT REQUEST 2026-07-30 («add a fish,
  // there are too few objects»). I was warding it off as a risk of confusion with the golden
  // SURPRISE FISH — the owner decided otherwise. The risk is moderate: the surprise has
  // its own golden emissive material (MeshStandard even in matcap mode),
  // while this one comes with the survival atlas — the tone and the gloss are different.
  { name:'survivalfish', color:0x7fa8c4, rc:1.0, wr:0.89, tex:'survival', mat:'soft', geo:survivalfishGeo },
  { name:'propsghost', color:0xc8c8dc, rc:1.0, tex:'props', mat:'soft', geo:propsghostGeo },
  { name:'carfiretruck',          color:0xe03a2e, rc:1.4, tex:'car', mat:'soft', geo:()=>carfiretruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'holidaypresentacube', color:0xe0574f, rc:1.0, tex:'holiday', mat:'soft', geo:holidaypresentacubeGeo },
  { name:'propslifebuoy', color:0xff7844, rc:1.0, tex:'props', mat:'soft', phys:'ring', geo:propslifebuoyGeo },
  { name:'foodtomato',            color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodtomatoGeo },
  { name:'foodcarrot',            color:0xff8c2b, rc:1.0, tex:'food', mat:'soft', geo:foodcarrotGeo },
  // ⚠️ THE PROPS PACK CONTINUES ITS EVERY-3 CADENCE HERE (the owner 2026-08-31: «from the
  // 6th, every 3 levels»). Indices 7..76 = levels 6..75, unbroken. The three models he had
  // deleted - cart, soup, water bottle - were REPLACED IN PLACE rather than cut out, so that
  // every pre-existing type keeps the level it already had; only the 12 entries below this
  // line push their successors later.
  // ⛔ TWO MORE ARRIVED AND WERE RETURNED, NOT SHIPPED: basketball 1732 and revolver 1564
  // triangles, over the 1500 policy ceiling of docs/MODEL-BUDGET.md - the same ceiling that
  // sent the artist's robot back at 1624 with «flexing is how a ceiling dies». Accepting a
  // model 15% over one week after rejecting one 8% over is how the ceiling stops existing.
  { name:'propswineglass', color:0x6794d9, rc:1.0, wr:0.56, tex:'props', mat:'soft', geo:propswineglassGeo },
  { name:'foodpineapple',         color:0xf0c040, rc:1.0, tex:'food', mat:'soft', geo:foodpineappleGeo },
  { name:'animalpanda',           color:0xd8dce2, rc:1.0, tex:'animal', mat:'soft', geo:animalpandaGeo },
  { name:'propscamera', color:0x767a8d, rc:1.0, wr:0.79, tex:'props', mat:'soft', geo:propscameraGeo },
  { name:'animalcow',             color:0xe6ddd0, rc:1.0, tex:'animal', mat:'soft', geo:animalcowGeo },
  { name:'animalparrot',          color:0xe2453a, rc:1.0, tex:'animal', mat:'soft', geo:animalparrotGeo },
  { name:'propsmicrowave', color:0x67636a, rc:1.0, wr:0.73, tex:'props', mat:'soft', geo:propsmicrowaveGeo },
  { name:'holidayreindeer', color:0x9a6b45, rc:1.0, tex:'holiday', mat:'soft', geo:holidayreindeerGeo },
  { name:'carambulance',          color:0xeef2f6, rc:1.4, tex:'car', mat:'soft', geo:()=>carambulanceGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'propswasher', color:0xeeecec, rc:1.0, wr:0.54, tex:'props', mat:'soft', geo:propswasherGeo },
  // ⛔ `piratechest` DELETED 2026-08-20 (the owner's word: «delete the chest, both
  // the open one and the closed one»). The artist sent an OPEN variant instead of the previous
  // closed one — the owner wanted neither. The model was removed both from
  // the source and from the module: the pool now holds 87 types.
  { name:'holidaysnowman', color:0xeef4fb, rc:1.0, tex:'holiday', mat:'soft', geo:holidaysnowmanGeo },
  { name:'foodcherries',          color:0xd93a4a, rc:1.0, tex:'food', mat:'soft', geo:foodcherriesGeo },
  { name:'propsgrenade', color:0x58a078, rc:1.0, wr:0.76, tex:'props', mat:'soft', geo:propsgrenadeGeo },
  { name:'foodavocado',           color:0x6b8f3a, rc:1.0, tex:'food', mat:'soft', geo:foodavocadoGeo },
  { name:'foodapple',             color:0xe83a3a, rc:1.0, tex:'food', mat:'soft', geo:foodappleGeo },
  { name:'propsbeachball', color:0xcf9796, rc:1.0, tex:'props', mat:'soft', phys:'ball', geo:propsbeachballGeo },
  { name:'animalkoala',           color:0x9ba3ad, rc:1.0, tex:'animal', mat:'soft', geo:animalkoalaGeo },
  { name:'animalcat',             color:0x6b7280, rc:1.0, tex:'animal', mat:'soft', geo:animalcatGeo },
  { name:'propspistol', color:0x4f5260, rc:1.0, wr:0.82, tex:'props', mat:'soft', geo:propspistolGeo },
  { name:'animalgiraffe',         color:0xe0b23a, rc:1.0, tex:'animal', mat:'soft', geo:animalgiraffeGeo },
  { name:'cargarbagetruck',       color:0x4a9e5c, rc:1.4, tex:'car', mat:'soft', geo:()=>cargarbagetruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'brickclassic', color:0x5ac44a, rc:1.0, tex:'brick', paint:1, mat:'soft', geo:brickclassicGeo },
  { name:'foodpear',              color:0xc8d94a, rc:1.0, tex:'food', mat:'soft', geo:foodpearGeo },
  { name:'foodpumpkin',           color:0xff8a2b, rc:1.0, tex:'food', mat:'soft', geo:foodpumpkinGeo },
  { name:'foodpaprika',           color:0xe8402e, rc:1.0, tex:'food', mat:'soft', geo:foodpaprikaGeo },
  { name:'animalchick',           color:0xffd84a, rc:1.0, tex:'animal', mat:'soft', geo:animalchickGeo },
  { name:'animalfox',             color:0xf07a34, rc:1.0, tex:'animal', mat:'soft', geo:animalfoxGeo },
  { name:'animallion',            color:0xd9a05b, rc:1.0, tex:'animal', mat:'soft', geo:animallionGeo },
  { name:'carrace',               color:0xff5a2b, rc:1.4, tex:'car', mat:'soft', geo:()=>carraceGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'animalmonkey',          color:0xa9713f, rc:1.0, tex:'animal', mat:'soft', geo:animalmonkeyGeo },
  { name:'animaldog',             color:0xc98f5a, rc:1.0, tex:'animal', mat:'soft', geo:animaldogGeo },
  { name:'animalbeaver',          color:0x9c6b42, rc:1.0, tex:'animal', mat:'soft', geo:animalbeaverGeo },
  { name:'cartractor',            color:0x4caf50, rc:1.4, tex:'car', mat:'soft', geo:()=>cartractorGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodmushroom',          color:0xe8ddc8, rc:1.0, tex:'food', mat:'soft', geo:foodmushroomGeo },
  { name:'foodonion',             color:0xd9c0a8, rc:1.0, tex:'food', mat:'soft', geo:foodonionGeo },
  { name:'foodcauliflower',       color:0xeee6d0, rc:1.0, tex:'food', mat:'soft', geo:foodcauliflowerGeo },
  { name:'toycarvehiclemonstertruck', color:0x6f7ad0, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclemonstertruckGeo },
  { name:'animaldeer',            color:0xb07a4a, rc:1.0, tex:'animal', mat:'soft', geo:animaldeerGeo },
  { name:'animalbunny',           color:0xd8b895, rc:1.0, tex:'animal', mat:'soft', geo:animalbunnyGeo },
  { name:'animalhog',             color:0x8d6144, rc:1.0, tex:'animal', mat:'soft', geo:animalhogGeo },
  { name:'toycarvehiclespeedster', color:0xe8574a, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclespeedsterGeo },
  { name:'carvan',                color:0xe0a04a, rc:1.4, tex:'car', mat:'soft', geo:()=>carvanGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodcupcake',           color:0xffa8c8, rc:1.0, tex:'food', mat:'soft', geo:foodcupcakeGeo },
  { name:'toycarvehiclevintageracer', color:0x4aa3c9, rc:1.0, tex:'toycar', mat:'soft', geo:toycarvehiclevintageracerGeo },
  { name:'foodicecream',          color:0xffd9b8, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamGeo },
  { name:'foodburger',            color:0xc98a4b, rc:1.0, tex:'food', mat:'soft', geo:foodburgerGeo },
  { name:'carcone', color:0xff9944, rc:1.4, tex:'car', mat:'soft', geo:()=>carconeGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodcroissant',         color:0xe0b070, rc:1.0, tex:'food', mat:'soft', geo:foodcroissantGeo },
  { name:'factorycoga', color:0x8d949e, rc:1.0, wr:0.96, tex:'factory', mat:'soft', geo:factorycogaGeo },
  { name:'carbox', color:0xb86847, rc:1.4, tex:'car', mat:'soft', geo:()=>carboxGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodfish', color:0x626880, rc:1.0, wr:0.89, tex:'food', mat:'soft', geo:foodfishGeo },
  { name:'foodturkey', color:0x945841, rc:1.0, tex:'food', mat:'soft', geo:foodturkeyGeo },
  { name:'foodcheese', color:0xffc759, rc:1.0, wr:0.98, tex:'food', mat:'soft', geo:foodcheeseGeo },
  { name:'cartruck', color:0x4a9e5c, rc:1.4, tex:'car', mat:'soft', geo:()=>cartruckGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodsundae', color:0xe45e48, rc:1.0, wr:0.37, tex:'food', mat:'soft', geo:foodsundaeGeo },
  { name:'foodchinese', color:0xebebf2, rc:1.0, tex:'food', mat:'soft', geo:foodchineseGeo },
  { name:'foodwholeham', color:0xdc9e76, rc:1.0, tex:'food', mat:'soft', geo:foodwholehamGeo },
  { name:'carkartoobi', color:0x8a6ec8, rc:1.4, tex:'car', mat:'soft', geo:()=>carkartoobiGeo().clone().scale(1.4, 1.4, 1.4) },
  { name:'foodhotdog', color:0xeb9268, rc:1.0, wr:0.99, tex:'food', mat:'soft', geo:foodhotdogGeo },
  { name:'foodcakebirthday', color:0xffc044, rc:1.0, tex:'food', mat:'soft', geo:foodcakebirthdayGeo },
  { name:'foodicecreamscoopmint', color:0x2b9571, rc:1.0, tex:'food', mat:'soft', geo:foodicecreamscoopmintGeo },
  // phys:'ring' — the hole is REAL: physics builds a ring of capsules along the geometry,
  // otherwise the convex hull pulls the middle shut with an invisible membrane (see 50-physics)
  { name:'fooddonutsprinkles',    color:0xffb3d1, rc:1.0, tex:'food', mat:'soft', phys:'ring', geo:fooddonutsprinklesGeo },
];

// Juicy caramel: HSL is normalized in sRGB (s=0.75) and converted to linear.
// History: linear pastel L=0.5 (as in batch_lod_bvh) was «too
// vanilla» in the owner's judgement — do not bring it back.
//
// SPREAD-OUT LIGHTNESS (the owner's spec 2026-07-20): earlier the lightness was
// fixed at 0.55 on ALL types, and only the hue told them apart. At 15 types
// the circle still divided, at 24 (after the models) it ran out: the pile read as
// neon ripple, and in shades of grey (and for the color-blind, ~8% of men) the types
// merged completely, even though matching BY TYPE is the core of the mechanic.
//
// ⚠️ THE HISTORY OF TWO APPROACHES (the first was rejected by the owner — do not bring it back):
// AT FIRST we aimed at ABSOLUTE brightness (relative luminance) — each type got
// its own step, and a bisection drove the lightness until the hue landed on it. The separation
// came out, the color did not: hues have different natural brightness, and yellow/lime, which
// got a low step, drifted into a swamp, while blue/violet on a high one
// bleached out into pastel. The pile turned dusty pink with olive. The caramel,
// accepted by the owner as the third iteration, was killed.
// NOW the shift is RELATIVE: the hue stays at its own natural lightness 0.55 and
// only moves by ±0.20. Neighbors diverge by value — that is enough
// to keep the pile from merging — but no hue is squeezed past the edges, where
// HSL saturation stops producing chroma.
function candyColor(hex, dl){
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, 0.75, Math.max(0.30, Math.min(0.78, 0.55 + (dl || 0))));
  return c.convertSRGBToLinear();
}
// The offsets are laid out IN THE ORDER of the types, so neighbors in the list are guaranteed
// to diverge in lightness. The models' hues are also scattered around the circle in 168° steps,
// so neighbors cannot coincide in both hue and lightness.
const LIGHT_OFFSETS = [0.00, -0.15, 0.12, -0.08, 0.18, -0.20];
TYPES.forEach((t, i) => { if (t.mat === 'soft') t.dl = LIGHT_OFFSETS[i % LIGHT_OFFSETS.length]; });
const MESH_SCALE = 0.62;
