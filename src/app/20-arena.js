// ===== 20-arena: the blender's glass bowl, the blades =====
let bowlMesh = null, bowlMat = null; // glass: melts away as the camera comes close (99-main)

// The glass is BACK (the owner's request) in its last approved form —
// "practically invisible": transmission 1, ior 1.0 (does not bend rays),
// highlights almost down to zero. Items penetrating INTO THE GLASS was fixed on
// the physics side: the Rapier walls stand INSIDE the glass with a WALL_GAP
// clearance (50-physics) — items stop short of the glass surface.
const GLASS_T = 0.26; // glass thickness
(function buildFunnel(){
  const pts = [];
  const N = 12;
  for (let i=0;i<=N;i++){ const y = FUNNEL.H*i/N; pts.push(new THREE.Vector2(FUNNEL.R0 + SLOPE*y, y)); }
  pts.push(new THREE.Vector2(FUNNEL.R1 + GLASS_T*0.5, FUNNEL.H + 0.10)); // rounded lip
  for (let i=N;i>=0;i--){ const y = FUNNEL.H*i/N; pts.push(new THREE.Vector2(FUNNEL.R0 + SLOPE*y + GLASS_T, y)); }
  pts.push(new THREE.Vector2(FUNNEL.R0, 0));  // end face of the bottom
  pts.push(new THREE.Vector2(0.02, 0));       // glass bottom (the bowl floats in white)
  const lathe = new THREE.LatheGeometry(pts, 64);
  // ⚠️ NO transmission: any visible transmission>0 makes three render the WHOLE
  // world a second time into an FBO (audit measurement: ~55% of EVERY frame).
  // At ior 1.0 the glass refracted nothing anyway — plain transparency gives the
  // same "practically invisible" look for a fraction of the price. Do NOT bring
  // transmission back.
  // FULLY TRANSPARENT GLASS (the owner's spec 2026-07-21, circled in red):
  // head-on the bowl is not visible AT ALL, only a soft edge shows at a tangent.
  // The previous uniform opacity 0.08 draped a whitish film over the whole area
  // and muffled the items; here there is no film — the alpha is taken from the
  // FRESNEL term, that is, it rises only where the surface turns edge-on to the
  // viewer.
  // GLASS_POW governs the softness of the transition: larger — a narrower and
  // sharper rim.
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uEdge: { value: GLASS_EDGE },   // rim brightness
      uPow:  { value: GLASS_POW },    // transition softness
      uFade: { value: 1 },            // dissolving on zoom (99-main)
    },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vN = normalize(normalMatrix * normal);',
      '  vV = normalize(-mv.xyz);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform float uEdge; uniform float uPow; uniform float uFade;',
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      // abs() — so that the rim reads on faces turned away from the camera too
      '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
      '  f = pow(clamp(f, 0.0, 1.0), uPow);',
      '  gl_FragColor = vec4(1.0, 1.0, 1.0, f * uEdge * uFade);',
      '}',
    ].join('\n'),
  });
  const bowl = new THREE.Mesh(lathe, mat); scene.add(bowl);
  bowlMesh = bowl; bowlMat = mat; // for dissolving the glass on zoom (99-main)
  // There is NO stand, NO collar and NO ground — the bowl floats in white space.
})();

// Mixer blades at the bottom (visual only; the items lie above FLOOR_REST)
const mixerBlades = new THREE.Group();
(function buildBlades(){
  // ⚠️ THE BLADES USE THE OWNER'S MATCAP "metall.png" (his word 2026-08-17: "try
  // this material on the mixer blades"). The previous MeshStandard with
  // metalness:1 reflected the softbox environment and read as flat grey against a
  // light background; a matcap gives metal that depends neither on the light nor
  // on the viewing angle — the same argument by which all the items were moved to
  // matcaps (the owner's decision 2026-07-20).
  // ⚠️ THE HUB STAYED DARK (`dark`): the owner said "on the blades".
  const metal = new THREE.MeshMatcapMaterial({ color:0xffffff, matcap: metalMatcapTex() });
  // ⚠️ THE HUB — THE SAME MATCAP (the owner's word 2026-08-17-v, "cover it"),
  // but DARKENED by a multiplier: it was darker than the blades before as well,
  // and without the difference in tone the impeller would read as one solid lump
  // of metal with no centre.
  const dark = new THREE.MeshMatcapMaterial({ color:0x8b93a0, matcap: metalMatcapTex() });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.42, 16), dark);
  hub.position.y = 0.21; mixerBlades.add(hub);
  for (let i=0;i<4;i++){
    const arm = new THREE.Group();
    arm.rotation.y = i*Math.PI/2;
    const g = new THREE.BoxGeometry(2.1, 0.09, 0.44);
    g.translate(1.08, 0, 0); // span 2.13 with a bottom of 2.4 — nearly the full width
    const blade = new THREE.Mesh(g, metal);
    blade.position.y = 0.24;
    blade.rotation.x = (i % 2 ? 0.5 : -0.4); // one pair of blades up, one pair down
    arm.add(blade);
    mixerBlades.add(arm);
  }
  // at the VERY bottom (the owner's spec: "the impeller isn't visible — closer to
  // the lower edge and bigger"); the blade tops are at ~0.6 — items at
  // FLOOR_REST=1.15 do not touch them
  mixerBlades.position.y = 0.28;
  scene.add(mixerBlades);
})();
let mixerSpeed = 0; // rad/s; the blades spin ONLY while the mixer runs (at rest they are unnerving)

// ⚠️⚠️ THE SINGLE SOURCE OF WALL WIDTH ALONG A DIRECTION: how far it is from the
// axis to the wall in the direction (nx, nz). For the bowl this is the same
// radius — the direction does not matter; the signature with a direction is left
// over from a container of a different shape and is kept deliberately (see the
// function body). Everyone who asks "where is the wall" is OBLIGED to go through
// it: the rescuer, the overhang metric, the spark bounce. Separate formulas in
// each of them would guarantee divergence — the rescuer would count as an escape
// what the wall actually holds.
function wallDistAt(y, nx, nz){
  // ⚠️ The function STAYED even though there is a single container again: the
  // rescuer, the overhang metric and the spark bounce all go through it, and its
  // being the only one was the whole point (two formulas would diverge). The
  // rectangular-box branch moved away into a separate build together with the
  // bonus level.
  return radiusAt(y);
}
// ⚠️⚠️ THE PURE BOWL GEOMETRY — WITHOUT A SINGLE PER-LEVEL BRANCH. It is called by
// everything that is built ONCE and lives until the end of the session.
// ⛔ And `radiusAt` below is ALSO WITHOUT BRANCHES RIGHT NOW — do not treat it as
// "the gameplay one, which is allowed a branch": the previous revision of this
// header said exactly that and contradicted the tombstone fifteen lines below. If
// a level-dependent container is ever needed, it is entitled to ITS OWN set of
// colliders, not to a branch inside the shared function.
// ⛔⛔ THE SPLIT APPEARED BECAUSE THE 2026-08-17 INCIDENT WAS EXACTLY HERE:
// `radiusAt` started answering differently on a special level, while a one-time
// initialization was reading it — the bowl was assembled as a CYLINDER and stayed
// that way until the end of the session, on all the subsequent ordinary levels.
// Back then `initPhysicsWorld` was cured pointwise; when the period was switched
// on, TWO MORE such consumers turned up (baking the Voronoi cells and the bowl's
// shatter geometry — they are cached and outlive the level). The canon's rule "a
// function read by a one-time construction has no right to depend on mutable
// state" is now honoured in substance, and not by a patch on a single caller.
function funnelRadiusAt(y){
  const yy = Math.max(0, Math.min(y, FUNNEL.H)); // above the rim — cylinder R1
  return FUNNEL.R0 + SLOPE*yy;
}
function radiusAt(y){
  // ⚠️ THE SPLIT FROM `funnelRadiusAt` IS KEPT DELIBERATELY, even though the
  // per-level branch has been removed: it is precisely the cure for the
  // 2026-08-17 incident — a one-time construction must read a function that NEVER
  // depends on state. Merge them back into one and you bring back the same mine
  // for the next feature.
  return funnelRadiusAt(y);
}

// ===== THE SHATTERING BOWL (v2 prototype): cracks + shards =====
// The cracks are a PROTOTYPE visual (polylines across the surface of the cone +
// slight whitening of the glass); the production shader variant goes to Graphics
// when this moves into the process.
let bowlCrackGroup = null, bowlCrackN = 0, bowlBaseOpacity = null;
// ⛔ THE CRACK VISUAL IS REMOVED COMPLETELY (the owner's word 2026-08-02,
// verbatim: "let's remove the cracks completely — they look unnatural and ugly").
// Tried and rejected by him: 1px lines → tubes with a highlight → white 1px lines
// across the surface with branching. THE MECHANIC IS ALIVE (boost count + shatter
// at N) — the progress toward the shatter is currently INVISIBLE; an indicator by
// some other means (eyes? a counter?) — only on his word, do not invent one.
function setBowlCracks(k, total){
  bowlCrackN = k;
  if (bowlCrackGroup){ scene.remove(bowlCrackGroup);
    bowlCrackGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    bowlCrackGroup = null; }
}
function tickBowlCracks(){ /* the pulse left together with the visual */ }
// ⚠️ TINT BY VERTEX NORMALS, AND NOT BY FACES — and this difference from shardFX
// is deliberate: an item's shards have flat and sharp faces, there the volume is
// ⛔ bakeShardTint and _bshN were cut by the 2026-08-12 cleanup: the per-facet
// tint of the bowl's shards was left over from the revision BEFORE the GPU
// shatter (aCen in the vertices) — nobody called it, tests included. To bring it
// back, take it from the git history.
// ⚡ THE BOWL SHATTER — ONE MESH, THE MOTION LIVES IN THE VERTEX SHADER.
// The technique comes from akella/ExplodingObjects (the repository was shown by
// the owner 2026-08-06): the pieces are merged into ONE geometry, and the
// membership of a piece is written straight into the vertices — the piece's
// centre, rotation axis, velocity, tumble rate. The shader drives the shatter off
// a single time uniform.
// ⚠️ WHY THIS IS BETTER THAN THE PREVIOUS APPROACH (30 separate meshes with a
// tick on each): the price stops depending on the number of pieces — one object,
// one material, one tick, zero CPU work per piece. That is why there are now 8×26
// pieces instead of 3×10.
// ⚠️ THE GEOMETRY IS BAKED ONCE: the bowl never changes, so we keep the shattered
// version in a cache and reuse it — the explosion itself builds NOTHING any more
// (it used to build 30 geometries and 30 materials synchronously, in one frame).
let _shatterGeo = null, _shatterMat = null, _shatterN = 0;
// ⚠️⚠️ THE "BOWL IS BROKEN" FLAG IS NEEDED BECAUSE THE LOOP OWNS THE VISIBILITY
// OF THE GLASS. In loop (99-main) every frame runs `bowlMesh.visible = k > 0.02` —
// the glass dissolving as the camera comes close. Our `visible=false` in the
// shatter lived for exactly ONE frame, and the silhouette came back (the owner's
// complaint 2026-08-06: "after the explosion there must be no silhouette, only
// shards"). You may not clear someone else's state by hand — it has to be GATED
// at its owner.
let bowlBroken = false, _shatterSizes = null;
// ⚠️⚠️ THE PIECES ARE VORONOI CELLS, AND NOT A GRID. The first version cut the
// shell with a regular rows×sectors lattice, and the owner rejected it for
// exactly that: "the grid is too sterile and even, in real life glass doesn't
// crack like that". In both of his examples (bobbyroe, akella) the model is split
// IN ADVANCE in an editor with Voronoi cells — we achieve the same procedurally,
// because our bowl is not a model but a surface of revolution, and you can't drag
// an extra GLB into a single-file build.
// We compute in the unwrap (u = arc length, v = height): a cell = the domain
// clipped by bisector half-planes toward every other seed (Sutherland-Hodgman).
// The seam around the circle is closed with copies of the seeds at ±2πR —
// otherwise the cells at the joint come out rectangular and the seam is visible.
function clipHalf(poly, ax, ay, bx, by){
  // keep the part of the polygon that is CLOSER to a than to b
  const mx = (ax+bx)/2, my = (ay+by)/2, nx = bx-ax, ny = by-ay;
  const inside = (px, py) => (px-mx)*nx + (py-my)*ny <= 0;
  const out = [];
  for (let i = 0; i < poly.length; i += 2){
    const cx = poly[i], cy = poly[i+1];
    const px = poly[(i+2) % poly.length], py = poly[(i+3) % poly.length];
    const ci = inside(cx, cy), pi = inside(px, py);
    if (ci) out.push(cx, cy);
    if (ci !== pi){
      const d1 = (cx-mx)*nx + (cy-my)*ny, d2 = (px-mx)*nx + (py-my)*ny;
      const t = d1 / (d1 - d2);
      out.push(cx + (px-cx)*t, cy + (py-cy)*t);
    }
  }
  return out;
}
function bowlVoronoiCells(){
  const R = (funnelRadiusAt(0) + funnelRadiusAt(FUNNEL.H)) / 2; // mean radius of the unwrap
  // ⚠️ THE PURE ONE, NOT THE GAMEPLAY ONE: the cells are cached and outlive the level (see the tombstone above)
  const U = 2*Math.PI*R, V = FUNNEL.H;
  const seeds = [];
  // PLATES: few and far apart — we discard a seed if it is closer than
  // BOWL_PLATE_MIN_D to one already placed. A large piece comes out where there
  // are no other seeds nearby, so sparseness is exactly what makes a "plate".
  const dist2 = (au, av, bu, bv) => {
    let du = Math.abs(au - bu); if (du > U/2) du = U - du;   // the seam around the circle
    const dv = av - bv; return du*du + dv*dv;
  };
  const minD2 = (BOWL_PLATE_MIN_D*U)*(BOWL_PLATE_MIN_D*U);
  for (let attempts = 0, i = 0; i < BOWL_PLATE_N && attempts < BOWL_PLATE_N*60; attempts++){
    const u = Math.random()*U, v = Math.random()*V;
    let ok = true;
    for (const [su, sv] of seeds) if (dist2(u, v, su, sv) < minD2){ ok = false; break; }
    if (ok){ seeds.push([u, v]); i++; }
  }
  // THE CLOUD OF CRUMBS: the density falls off from the point of impact. We take
  // the radius as a power
  // ⚠️ 0.35 is NOT "just a number": at 1.0 the crumbs would lie in a ring along
  // the edge of the cloud instead of clustering at the centre, and the "cloud"
  // would read as a doughnut.
  for (let o = 0; o < BOWL_IMPACTS; o++){
    const cu = Math.random()*U, cv = 0.2*V + Math.random()*0.6*V;
    for (let i = 0; i < BOWL_FINE_N/BOWL_IMPACTS; i++){
      const a = Math.random()*Math.PI*2;
      const r = Math.pow(Math.random(), 0.35)*BOWL_FINE_R*U;
      let u = cu + Math.cos(a)*r; u = ((u % U) + U) % U;
      const v = Math.max(0, Math.min(V, cv + Math.sin(a)*r*0.55));
      seeds.push([u, v]);
    }
  }
  const cells = [];
  for (let i = 0; i < seeds.length; i++){
    let poly = [0,0, U,0, U,V, 0,V];
    const [su, sv] = seeds[i];
    for (let j = 0; j < seeds.length && poly.length >= 6; j++){
      if (j === i) continue;
      const [qu, qv] = seeds[j];
      // seam: a copy of a seed across the edge of the unwrap also counts as a neighbour
      for (const d of [-U, 0, U]){
        poly = clipHalf(poly, su, sv, qu + d, qv);
        if (poly.length < 6) break;
      }
    }
    if (poly.length >= 6){
      // the shoelace area — it is exactly what tells "a large plate" from "a crumb"
      let A = 0;
      for (let k = 0, n = poly.length/2; k < n; k++){
        const k2 = (k+1) % n;
        A += poly[k*2]*poly[k2*2+1] - poly[k2*2]*poly[k*2+1];
      }
      cells.push({ poly, su, sv, area: Math.abs(A)/2 });
    }
  }
  return { cells, R, U };
}
function buildShatterGeo(){
  if (_shatterGeo) return _shatterGeo;
  const { cells, R } = bowlVoronoiCells();
  let vTotal = 0;
  for (const c of cells) vTotal += (c.poly.length/2) * 3;   // a fan from the cell centre
  const pos = new Float32Array(vTotal*3), col = new Float32Array(vTotal*3);
  const cen = new Float32Array(vTotal*3), axs = new Float32Array(vTotal*3);
  const vel = new Float32Array(vTotal*3), spn = new Float32Array(vTotal);
  const P = new THREE.Vector3(), NRM = new THREE.Vector3(), C = new THREE.Vector3();
  const A = new THREE.Vector3(), D = new THREE.Vector3();
  const toXYZ = (u, v, out) => {                            // unwrap -> surface of revolution
    const th = u / R, y = Math.max(0, Math.min(FUNNEL.H, v)), r = funnelRadiusAt(y); // THE PURE ONE
    out.set(Math.cos(th)*r, y, Math.sin(th)*r);
  };
  let o = 0;
  for (const c of cells){
    const n = c.poly.length/2;
    let cu = 0, cv = 0;
    for (let i = 0; i < n; i++){ cu += c.poly[i*2]; cv += c.poly[i*2+1]; }
    cu /= n; cv /= n;
    toXYZ(cu, cv, C);                                       // the piece's centre: it tumbles around it
    const th = cu / R;
    D.set(Math.cos(th), 0.55 + Math.random()*0.4, Math.sin(th)).normalize()
     .multiplyScalar(6.5 + Math.random()*4.5);
    A.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
    const spin = (Math.random()-0.5)*13;
    for (let i = 0; i < n; i++){
      const i2 = (i+1) % n;
      const tri = [[cu, cv], [c.poly[i*2], c.poly[i*2+1]], [c.poly[i2*2], c.poly[i2*2+1]]];
      for (let t = 0; t < 3; t++){
        toXYZ(tri[t][0], tri[t][1], P);
        NRM.set(P.x, 0, P.z).normalize();                   // outward along the radius — enough for the tint
        const tint = Math.max(BOWL_SHARD_TINT_LO,
                     Math.min(BOWL_SHARD_TINT_HI, 0.9 + 0.42*NRM.dot(SHARD_LIGHT)));
        const k = o*3;
        pos[k] = P.x; pos[k+1] = P.y; pos[k+2] = P.z;
        col[k] = col[k+1] = col[k+2] = tint;
        cen[k] = C.x; cen[k+1] = C.y; cen[k+2] = C.z;
        axs[k] = A.x; axs[k+1] = A.y; axs[k+2] = A.z;
        vel[k] = D.x; vel[k+1] = D.y; vel[k+2] = D.z;
        spn[o] = spin;
        o++;
      }
    }
  }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  G.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  G.setAttribute('aCen',     new THREE.BufferAttribute(cen, 3));
  G.setAttribute('axis',     new THREE.BufferAttribute(axs, 3));
  G.setAttribute('vel',      new THREE.BufferAttribute(vel, 3));
  G.setAttribute('spin',     new THREE.BufferAttribute(spn, 1));
  let aMin = Infinity, aMax = 0;
  for (const c of cells){ if (c.area < aMin) aMin = c.area; if (c.area > aMax) aMax = c.area; }
  _shatterGeo = G; _shatterN = cells.length;
  _shatterSizes = { min: +aMin.toFixed(3), max: +aMax.toFixed(3),
                    ratio: +(aMax / Math.max(1e-6, aMin)).toFixed(1) };
  return G;
}
function shatterMat(){
  if (_shatterMat) return _shatterMat;
  _shatterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uOp: { value: 0.5 }, uG: { value: BOWL_FLY_G },
                uSeed: { value: 0 } },
    vertexShader: [
      'uniform float uT; uniform float uG; uniform float uSeed;',
      // ⚠️ THE NAME IS aCen, AND NOT centroid: `centroid` is a RESERVED GLSL WORD
      // (an interpolation qualifier). A shader with it does not compile at all,
      // and three prints this as a "syntax error" on someone else's prefix line —
      // it takes a long time to hunt down.
      'attribute vec3 aCen; attribute vec3 axis; attribute vec3 vel; attribute float spin;',
      'varying vec3 vCol;',
      // rotation around an arbitrary axis — the same trick as in the reference
      'vec3 rot(vec3 v, vec3 ax, float ang){',
      '  float s = sin(ang), c = cos(ang);',
      '  return v*c + cross(ax, v)*s + ax*dot(ax, v)*(1.0 - c); }',
      'void main(){',
      '  vCol = color;',
      // ⚠️ the scatter is PER EXPLOSION, and not per piece: the geometry is a
      // single one and is baked once, without this every shatter would be
      // frame-for-frame identical
      '  float j = 0.85 + 0.3*fract(sin(dot(aCen.xz, vec2(12.99, 78.23)) + uSeed)*43758.55);',
      '  vec3 local = rot(position - aCen, normalize(axis), spin*uT*j);',
      '  vec3 p = aCen + local + vel*uT*j;',
      '  p.y -= 0.5*uG*uT*uT;',
      '  gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'uniform float uOp; varying vec3 vCol;',
      'void main(){ gl_FragColor = vec4(vCol*vec3(0.874,0.918,1.0), uOp); }',
    ].join('\n'),
  });
  _shatterMat.vertexColors = true;      // the `color` attribute in the shader
  return _shatterMat;
}
function shatterBowlVis(){
  bowlBroken = true;
  if (bowlMesh) bowlMesh.visible = false;
  setBowlCracks(0);
  const mesh = new THREE.Mesh(buildShatterGeo(), shatterMat());
  mesh.frustumCulled = false;           // the pieces travel far beyond the original bbox
  mesh.userData.sharedFx = true;        // the geometry and the material live in the cache
  const mat = mesh.material, life = BOWL_FLY_MS/1000;
  mat.uniforms.uSeed.value = Math.random()*100;
  addFX(mesh, life, (o, k) => {
    o.material.uniforms.uT.value = k*life;
    o.material.uniforms.uOp.value = 0.5*(1 - k);
  });
}
// restoration for a new level
function restoreBowlVis(){
  bowlBroken = false;
  // ⚠️ WE BAKE THE SHATTERED BOWL IN ADVANCE, AT THE START OF THE LEVEL. The bake
  // costs ~15 ms (208 pieces), and on the frame of the explosion that would be a
  // stutter at exactly the most spectacular moment. Here it is invisible: the
  // level is being built anyway, and the physics in the 'wait' phase is not
  // stepping yet. The cache is eternal — the bowl never changes.
  try { buildShatterGeo(); } catch(e){}
  if (bowlMesh) bowlMesh.visible = true;
  if (bowlMat && bowlBaseOpacity != null) bowlMat.opacity = bowlBaseOpacity;
  setBowlCracks(0);
}
