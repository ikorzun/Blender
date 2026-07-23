// ===== 70-fx: визуальные эффекты и всплывающий текст =====

const fx = [];
function addFX(obj, life, tick){
  scene.add(obj); fx.push({ obj, life, age:0, tick });
}
function stepFX(dt){
  for (let i=fx.length-1;i>=0;i--){
    const f = fx[i]; f.age += dt;
    const k = f.age / f.life;
    if (k >= 1){
      scene.remove(f.obj);
      // GPU-утечка: у эффектов геометрия/материал персональные — освобождать.
      // Скомпилированные ПРОГРАММЫ при этом не умирают: их держат вечные
      // якоря fxProgramAnchors (низ файла) — без них three пересобирал шейдер
      // на каждом первом тапе/молнии после простоя (джанк на слабых)
      if (f.obj.geometry) f.obj.geometry.dispose();
      if (f.obj.material) f.obj.material.dispose();
      fx.splice(i,1); continue;
    }
    f.tick && f.tick(f.obj, k);
  }
}
// Френель-«призрак»: прозрачная сфера, плотнее у силуэта (общий материал
// для сферы радиуса и маркеров — никакого wireframe, он читался как артефакт)
function fresnelGhostMat(color, base, edge, fpow){
  const p = (fpow || 1.8); // меньше степень — шире и мягче кромка («размытые грани»)
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
// Поле совпадения: еле видная прозрачная сфера радиуса matchRadius.
// Белая — матч состоялся, красная — промах.
function sphereFX(pos, radius, color){
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), fresnelGhostMat(color, 0.05, 0.32));
  mesh.position.copy(pos); mesh.renderOrder = 10;
  addFX(mesh, 0.9, (o,k)=>{ o.material.uniforms.op.value = 1-k; });
}
function popFX(pos){
  const g = new THREE.SphereGeometry(0.2, 10, 8);
  const m = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos);
  addFX(mesh, 0.35, (o,k)=>{ o.scale.setScalar(1+k*6); o.material.opacity = 0.9*(1-k); });
}
function markerFX(pos, color){
  // мягкая пульсирующая сфера-призрак — указывает на скрытую пару
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), fresnelGhostMat(color, 0.1, 0.5));
  mesh.position.copy(pos); mesh.renderOrder = 11;
  addFX(mesh, 1.1, (o,k)=>{
    o.scale.setScalar(1 + Math.sin(k*Math.PI*4)*0.22);
    o.material.uniforms.op.value = 1-k;
  });
}
function lineFX(a, b, color){
  const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const m = new THREE.LineDashedMaterial({ color, transparent:true, opacity:0.95, depthTest:false, dashSize:0.3, gapSize:0.15 });
  const line = new THREE.Line(g, m); line.computeLineDistances(); line.renderOrder = 11;
  addFX(line, 1.0, (o,k)=>{ o.material.opacity = 0.95*(1-k); });
}
// Расщепление «В ТРУХУ»: плотное облако пыли цвета предмета, ТРИ фракции
// размеров (мелкая/средняя/крупная) и вершинный разброс оттенков.
// История итераций владельца: 70 крупных -> 320 мелких -> 640 разнообразных
// -> 1280 «размер вдвое меньше, количество вдвое больше» (спека 2026-07-22).
// Труха ОБЩАЯ для матча и помола (bladeDustFX) — меняется вся.
// radial=true — плоский разлёт кольцом (пыль из-под лопастей миксера).
const DUST_FRACTIONS = [
  { n: 640, size: 0.0225 }, // мука
  { n: 400, size: 0.035 },  // крошка
  { n: 240, size: 0.05 },   // крупные обломки
];
const _dustC = new THREE.Color();
function dustCloud(item, radial, COUNT, size, base){
  const life = 1.0;
  const start = new Float32Array(COUNT*3), vel = new Float32Array(COUNT*3), cols = new Float32Array(COUNT*3);
  for (let i=0;i<COUNT;i++){
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), rr = Math.cbrt(Math.random())*item.r*0.95;
    const ox = Math.sin(ph)*Math.cos(th)*rr, oy = Math.cos(ph)*rr, oz = Math.sin(ph)*Math.sin(th)*rr;
    start[i*3]   = item.p.x + ox; start[i*3+1] = item.p.y + oy; start[i*3+2] = item.p.z + oz;
    const sp = 1.5 + Math.random()*3.0;
    if (radial){ // лопасти швыряют труху вширь
      vel[i*3]   = ox/(rr||1)*sp*1.7;
      vel[i*3+1] = 0.5 + Math.random()*2.4;
      vel[i*3+2] = oz/(rr||1)*sp*1.7;
    } else {
      vel[i*3]   = ox/(rr||1)*sp;
      vel[i*3+1] = Math.abs(oy/(rr||1))*sp + 1.2;
      vel[i*3+2] = oz/(rr||1)*sp;
    }
    // разброс оттенков: чуть светлее/темнее и лёгкий сдвиг тона
    _dustC.copy(base).offsetHSL((Math.random()-0.5)*0.04, 0, (Math.random()-0.5)*0.22);
    cols[i*3] = _dustC.r; cols[i*3+1] = _dustC.g; cols[i*3+2] = _dustC.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
  const pts = new THREE.Points(geo, m);
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
  for (const f of DUST_FRACTIONS) dustCloud(item, radial, f.n, f.size, base);
}
// Пылевой взрыв у лопастей: predмет домололся — труха летит из-под ножей
function bladeDustFX(pos, baseColor){
  dissolveFX({ p: pos, r: 0.55, baseColor }, true);
}
// ===== ПАК-ЭФФЕКТЫ ЛОПАНЬЯ ГРУПП (перенос из 80-gameplay по просьбе ФИЗИКИ,
// WORKSTREAMS 2026-07-22). Здесь ТОЛЬКО ВИЗУАЛ: правило выбора (burstFX,
// BURST_MIN_N) осталось в 80-gameplay, физволна blastWave — в 50-physics.
//
// Что полировано против стартовой версии:
// 1) точки стали КРУГЛЫМИ: у PointsMaterial без карты точка рисуется
//    КВАДРАТОМ — сок и искры читались как пиксели, а не как капли/искры;
// 2) звёзды — не меши, а точки со звёздной картой: точка всегда лицом к
//    камере, а плоский меш с игрового ракурса ловил ребро и почти пропадал.
//    Бонусом 5 мешей (5 draw calls, 5 геометрий) свернулись в ОДИН Points.
//    ⚠️ НЕ THREE.Sprite: в r149 ВСЕ спрайты делят ОДНУ геометрию, а stepFX
//    диспозит geometry догоревшего эффекта — первый же убил бы все будущие.
// 3) карты ОБЩИЕ и ленивые, живут вечно. stepFX диспозит material, но НЕ
//    его map (three текстуры материала не трогает) — общий кэш безопасен.
//    ⚠️ Только DataTexture: канвас премножает RGB на альфу (грабля matcap).
let _fxDot = null, _fxStar = null;
function fxDotTex(){
  if (_fxDot) return _fxDot;
  const S = 64, d = new Uint8Array(S*S*4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const i = (y*S + x)*4;
    const r = Math.hypot((x + 0.5)/S*2 - 1, (y + 0.5)/S*2 - 1);
    // плотное ядро + узкий мягкий ободок: капля, а не размытое пятно
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
    // радиус звезды по углу: во впадине сектора IN, на луче 1
    let t = Math.atan2(dy, dx) + Math.PI/2;
    t = ((t % SEG) + SEG) % SEG;
    const R = IN + (1 - IN)*Math.abs(t - SEG/2)/(SEG/2);
    const a = Math.max(0, Math.min(1, (R - r)/0.05)); // мягкая кромка
    d[i] = d[i+1] = d[i+2] = 255; d[i+3] = Math.round(255*a);
  }
  _fxStar = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  _fxStar.needsUpdate = true;
  return _fxStar;
}
// сок (food): крупные круглые капли цвета типа, «мокрый» баллистический разлёт.
// ⚠️ Баллистика ПАРАМЕТРИЧЕСКАЯ от t=k·life — не зависит от FPS.
function juiceFX(it){
  const N = 46, LIFE = 0.8, S0 = 0.40;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, sp = 1.5 + Math.random()*3.5;
    ox.push(it.p.x); oy.push(it.p.y + 0.2); oz.push(it.p.z);
    vx.push(Math.cos(a)*sp); vy.push(2 + Math.random()*4.5); vz.push(Math.sin(a)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // цвет типа, чуть высветленный: сок читается сочнее самого предмета
  const c = (it.fxColor || it.baseColor || new THREE.Color(0xff5a6e)).clone()
    .lerp(new THREE.Color(1, 1, 1), 0.18);
  const m = new THREE.PointsMaterial({ color: c, map: fxDotTex(), size: S0,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02 });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 11*t*t; // ½·G·t², G=22
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k;         // держится дольше, гаснет резче
    o.material.size = S0*(1 - k*0.45);
  });
}
// искры (car): круглые яркие точки веером + 3 тёмных кубика-детальки кувырком
function sparkFX(it){
  const N = 36, LIFE = 0.45, S0 = 0.20;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, e = Math.random()*Math.PI*0.5, sp = 4 + Math.random()*5;
    ox.push(it.p.x); oy.push(it.p.y + 0.2); oz.push(it.p.z);
    vx.push(Math.cos(a)*Math.cos(e)*sp); vy.push(Math.sin(e)*sp); vz.push(Math.sin(a)*Math.cos(e)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // ⚠️ normal blending: additive на светлой панораме невидим (грабля ГРАФИКИ)
  const m = new THREE.PointsMaterial({ color: 0xffe08a, map: fxDotTex(), size: S0,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02 });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 6*t*t; // искры почти не падают
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k;
    o.material.size = S0*(1 - k*0.3);
  });
  for (let j = 0; j < 3; j++){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x3a4048, transparent: true, opacity: 1 }));
    const a = Math.random()*Math.PI*2, sp = 1.2 + Math.random()*2;
    const bvx = Math.cos(a)*sp, bvy = 3 + Math.random()*2.5, bvz = Math.sin(a)*sp;
    const rx = (Math.random()-0.5)*14, rz = (Math.random()-0.5)*14;
    const o0 = it.p.clone();
    addFX(box, 0.7, (o, k) => {
      const t = k*0.7;
      o.position.set(o0.x + bvx*t, o0.y + bvy*t - 11*t*t, o0.z + bvz*t);
      o.rotation.x = rx*t; o.rotation.z = rz*t;
      o.material.opacity = 1 - k;
    });
  }
}
// мультяшный pop (animal): звёздочки веером вверх, всегда лицом к камере
function starPopFX(it){
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

// ОСКОЛКИ (спека владельца 2026-07-23 «сделай осколками»): твёрдые пачки
// brick/pirate/rock при бурсте и предмет под ножами при помоле КОЛЮТСЯ на
// угловатые куски. Перенос из 80-gameplay + полировка (запрос ФИЗИКИ,
// WORKSTREAMS 2026-07-23). Правило выбора (burstFX) и тайминги grindShred
// остаются в 80-gameplay — их зона поведения.
//
// Что полировано против стартовой версии (регулярный TetrahedronGeometry +
// плоский MeshBasicMaterial одного цвета):
// 1) ФОРМА — НЕРЕГУЛЯРНЫЙ кусок: 4 угла правильного тетра сдвинуты в разные
//    стороны, каждый скол уникален и читается как обломок, а не «кубик д4»;
// 2) ТИНТ ПО ГРАНЯМ — на MeshBasicMaterial нет света, поэтому объём печём
//    в ВЕРШИННЫЕ ЦВЕТА: грань светлее/темнее по своей нормали к ключевому
//    свету (тому же, что у matcap: сверху-слева-спереди). Плоский кусок
//    перестаёт быть силуэтом-пятном — грани разной яркости дают рельеф;
// 3) ЗВУК — «хруст» раскола (75-audio 'crunch', спектр выше рокота grind).
// ⚠️ КАЖДЫЙ осколок — СВОЯ геометрия+материал: stepFX диспозит и то и другое,
// общий кэш отдавать нельзя (первый догоревший убил бы буфер остальным —
// грабля Sprite/star). Баллистика параметрическая от t=k·life — FPS-независима.
const SHARD_LIGHT = new THREE.Vector3(-0.36, 0.60, 0.72).normalize();
const _shA = new THREE.Vector3(), _shB = new THREE.Vector3(), _shC = new THREE.Vector3(), _shN = new THREE.Vector3();
// 4 угла правильного тетраэдра — тинтуем и джиттерим на месте
const SHARD_CORNERS = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
const SHARD_FACES = [[0,1,2],[0,3,1],[0,2,3],[1,3,2]]; // грани наружу (CCW снаружи)
function makeShardGeo(size){
  // угол = единичный, сдвинут на ±38% — нерегулярный обломок
  const c = SHARD_CORNERS.map(v => new THREE.Vector3(
    v[0] + (Math.random()-0.5)*0.75, v[1] + (Math.random()-0.5)*0.75, v[2] + (Math.random()-0.5)*0.75
  ).multiplyScalar(size*0.6));
  const pos = new Float32Array(36), col = new Float32Array(36);
  for (let f = 0; f < 4; f++){
    const [i0, i1, i2] = SHARD_FACES[f];
    _shA.copy(c[i0]); _shB.copy(c[i1]); _shC.copy(c[i2]);
    // нормаль грани -> яркость по ключевому свету (0.62 тень … 1.30 блик)
    _shN.copy(_shB).sub(_shA).cross(_shC.clone().sub(_shA)).normalize();
    const tint = Math.max(0.55, Math.min(1.32, 0.9 + 0.42*_shN.dot(SHARD_LIGHT)));
    for (let v = 0; v < 3; v++){
      const src = v === 0 ? _shA : v === 1 ? _shB : _shC, o = (f*3 + v)*3;
      pos[o] = src.x; pos[o+1] = src.y; pos[o+2] = src.z;
      col[o] = col[o+1] = col[o+2] = tint;   // серый множитель — цвет несёт material.color
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function shardFX(pos, color, opts){
  opts = opts || {};
  const N = opts.count || 8, LIFE = opts.life || 0.6, up = opts.up || 3.2;
  const spread = opts.spread || 3.2, sz = opts.size || 0.15;
  const col = color || new THREE.Color(0x9aa0a8);
  if (opts.sound !== false) Sound.play('crunch', N);
  for (let i = 0; i < N; i++){
    const geo = makeShardGeo(sz*(0.7 + Math.random()*0.7));
    // vertexColors: matcap-света нет, объём несёт запечённый в вершины тинт граней
    const mat = new THREE.MeshBasicMaterial({ color: col, vertexColors: true,
      transparent: true, opacity: 1, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
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

// Молния (цепная реакция): ломаная с дрожанием, два слоя — насыщенное ядро
// + светлый ореол со сдвигом. ⚠️ Фон БЕЛЫЙ: только normal blending и
// насыщенный цвет (additive-свечение на белом невидимо).
const _bN1 = new THREE.Vector3(), _bN2 = new THREE.Vector3(), _bDir = new THREE.Vector3();
function boltFX(a, b){
  _bDir.copy(b).sub(a);
  const len = _bDir.length();
  if (len < 0.2) return;
  _bN1.crossVectors(_bDir, new THREE.Vector3(0,1,0));
  if (_bN1.lengthSq() < 1e-4) _bN1.set(1,0,0); else _bN1.normalize();
  _bN2.crossVectors(_bDir, _bN1).normalize();
  const SEG = 9, pts = [];
  for (let i=0;i<=SEG;i++){
    const t = i/SEG;
    const p = a.clone().lerp(b, t);
    if (i>0 && i<SEG){
      const amp = len*0.13*Math.sin(Math.PI*t);
      p.addScaledVector(_bN1, (Math.random()-0.5)*2*amp).addScaledVector(_bN2, (Math.random()-0.5)*2*amp);
    }
    pts.push(p);
  }
  // ТРУБКИ, не линии: WebGL рисует линии в 1px — молния была еле видна.
  // Зигзаг держим кусочно-линейным путём (CatmullRom сгладил бы изломы).
  const path = new THREE.CurvePath();
  for (let i=0;i<SEG;i++) path.add(new THREE.LineCurve3(pts[i], pts[i+1]));
  const layer = (color, radius, opacity) => {
    const g = new THREE.TubeGeometry(path, SEG*2, radius, 4, false);
    const m = new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthTest:false });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 12;
    addFX(mesh, 0.18, (o,k)=>{ o.material.opacity = opacity*(1-k)*(0.55+0.45*Math.random()); }); // мерцание
  };
  layer(0x2f6bff, 0.09, 0.6);  // оболочка
  layer(0xdceeff, 0.035, 1.0); // ядро
}
// Всплывающий текст (+очки, ×множитель, штрафы)
function scorePopScreen(text, px, py, color, big){
  const el = document.createElement('div');
  el.className = 'pop' + (big ? ' big' : '');
  el.style.left = px + 'px';
  el.style.top  = py + 'px';
  // ЕДИНЫЙ МЕХАНИЗМ КОНТУРА (правка ИНТЕРФЕЙСА по прямому указанию
  // владельца 2026-07-21-в): текст — SVG-<text> класса .otext, как весь
  // обведённый текст HUD; div остаётся ради позиции и анимации полёта.
  // Параметр color сохранён в API, но не применяется: попы всегда белые
  // с чёрной обводкой (спека владельца).
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'otext');
  svg.setAttribute('width', '260'); svg.setAttribute('height', '40');
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', '130'); t.setAttribute('y', '30');
  t.setAttribute('text-anchor', 'middle');
  t.textContent = text;
  svg.appendChild(t); el.appendChild(svg);
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('fly'));
  setTimeout(()=>el.remove(), 1100);
}
function scorePop(text, worldPos, color, big){
  const rect = canvas.getBoundingClientRect();
  const sp = worldPos.clone().project(camera);
  scorePopScreen(text, (sp.x+1)/2*rect.width + rect.left, (-sp.y+1)/2*rect.height + rect.top, color, big);
}
// Ошибка: −MISS_PENALTY через единую точку штрафов scorePenalty
// (80-gameplay, баланс-таблица 2026-07-22: ур.1 без штрафов — тогда и поп
// «−10» не рисуем; ур.<=5 кламп нулём). Промах СЧИТАЕТСЯ всегда
// (stats.misses нужен цепным правилам), санкция — только очковая.
function penalize(worldPos, sx, sy){
  stats.misses++;
  const charged = scorePenalty(MISS_PENALTY);
  // промах в лихорадке срезает COMBO_MISS_DROP=2 УСПЕШНЫХ ШАГА — и у
  // радиус-лесенки, и у заряда цепи — но серию НЕ гасит (тюнинг владельца:
  // «слишком резко сбрасываем power chain»); серию убивает только пауза
  // без матчей > COMBO_MS
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = Math.max(0, comboCount - COMBO_MISS_DROP);
    updateMatchRadius(); updateHUD();
  }
  if (charged){
    if (worldPos) scorePop('-' + MISS_PENALTY, worldPos, '#e5484d', false);
    else scorePopScreen('-' + MISS_PENALTY, sx, sy, '#e5484d', false);
  }
  Sound.play('miss'); // звук ошибки остаётся и на ур.1 — фидбек «не туда»
  updateHUD();
}
function wiggle(item){
  const startX = item.mesh.rotation.z;
  addFX(new THREE.Object3D(), 0.3, (o,k)=>{ item.mesh.rotation.z = startX + Math.sin(k*Math.PI*4)*0.2*(1-k); });
}

// ЯКОРЯ ШЕЙДЕРНЫХ ПРОГРАММ. stepFX диспозит материалы эффектов, а three
// выбрасывает СКОМПИЛИРОВАННУЮ ПРОГРАММУ, как только умирает её последний
// материал — следующий тап/маркер/молния компилировали шейдер заново прямо
// в кадре (рывок, заметный на слабых устройствах). Держим по одному вечному
// субпиксельному экземпляру каждого FX-рецепта на камере — программы живут
// всю сессию. ⚠️ Числа френель-рецептов обязаны совпадать с боевыми вызовами
// (они вшиваются в ТЕКСТ шейдера — другие числа = другая программа):
// sphereFX (0.05, 0.32), markerFX (0.1, 0.5), reachGhostFX (0.02, 0.16, 1.1).
(function fxProgramAnchors(){
  const g = new THREE.Group();
  const tiny = new THREE.SphereGeometry(0.001, 4, 3);
  [ fresnelGhostMat(0xffffff, 0.05, 0.32),      // sphereFX
    fresnelGhostMat(0xffffff, 0.1, 0.5),        // markerFX
    fresnelGhostMat(0xffffff, 0.02, 0.16, 1.1), // reachGhostFX (ореол тапа/подсказки)
  ].forEach(m => { m.uniforms.op.value = 0; g.add(new THREE.Mesh(tiny, m)); });
  g.add(new THREE.Mesh(tiny, new THREE.MeshBasicMaterial({ transparent:true, opacity:0 }))); // popFX/boltFX
  const pg = new THREE.BufferGeometry(); // dustCloud: Points + vertexColors
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size:0.001, vertexColors:true, transparent:true, opacity:0, depthWrite:false })));
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.001, 0)]);
  const ln = new THREE.Line(lg, new THREE.LineDashedMaterial({ transparent:true, opacity:0, dashSize:0.3, gapSize:0.15 })); // lineFX
  ln.computeLineDistances();
  g.add(ln);
  g.position.set(0, 0, -0.5); // всегда в кадре перед камерой, глазу невидим
  camera.add(g);
  scene.add(camera); // дети камеры рендерятся, только когда камера в графе сцены
})();
