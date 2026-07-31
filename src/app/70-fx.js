// ===== 70-fx: визуальные эффекты и всплывающий текст =====

const fx = [];
// Перепись ЖИВЫХ частиц: сколько точек сейчас в облаках эффектов. Нужна
// профилировке мобильного тира — «fx: 12 объектов» ничего не говорит, когда
// один dissolveFX это 1280 точек, чьи позиции переписываются и заливаются в
// GPU КАЖДЫЙ кадр. Зовётся только из perfStats, не из тика.
function fxParticleCount(){
  let pts = 0, clouds = 0;
  for (const f of fx){
    const g = f.obj && f.obj.geometry, p = g && g.attributes && g.attributes.position;
    if (p && f.obj.isPoints){ pts += p.count; clouds++; }
  }
  return { pts, clouds };
}
// ⚠️ ЦЕНА СОЗДАНИЯ ЭФФЕКТА — ОТДЕЛЬНАЯ ОТ ЦЕНЫ ТИКА, и в профиле мобильного
// тира именно она оказалась пиком: на кадре тапа ~40 мс не объяснялись НИ
// физикой, ни stepFX, ни рендером. Здесь копится время конструирования
// (Float32Array на 1280 точек, BufferGeometry, материал, возможная компиляция
// шейдера); loop забирает и обнуляет раз в кадр.
// ⚠️⚠️ ИСПРАВЛЕНО ПО ЛОВЛЕ ГРАФИКИ (2026-07-31). ПЕРВАЯ ВЕРСИЯ СЧИТАЛА ТОЛЬКО
// ПЫЛЕВЫЕ ОБЛАКА — единственная точка прибавки сидела внутри dustCloud, а
// колонка в отчёте называлась «постройка эффекта». Слепа она была ровно к
// тому, куда едет редизайн Графики: у ОСКОЛКОВ каждый кусок это своя
// геометрия и свой материал (9-23 за бурст), и в счётчике они давали НОЛЬ.
// Классика «метрика правдоподобна, но меряет не то, что названо вслух».
// Теперь считается ВСЯ постройка эффектов. Пара in/out УСТОЙЧИВА К ВЛОЖЕННОСТИ
// (dissolveFX зовёт dustCloud трижды): копит только внешняя пара, иначе одно
// облако считалось бы дважды.
let fxBuildMs = 0;
const _fxBStack = [];
function fxBuildIn(){ _fxBStack.push(performance.now()); }
function fxBuildOut(){
  const t0 = _fxBStack.pop();
  if (t0 !== undefined && _fxBStack.length === 0) fxBuildMs += performance.now() - t0;
}
const fxBuildTake = () => { const v = fxBuildMs; fxBuildMs = 0; return v; };
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
      // ⚠️ keepGeo — у половин распила и у накладки огня геометрия ОБЩАЯ с
      // предметом (кэш типа в 30-shapes). Диспозить чужое нельзя: владелец
      // геометрии — тот, кто её создал.
      // ⛔ ЧЕСТНАЯ ЦЕНА ОШИБКИ, ЗАМЕРЕНА ДИВЕРСИЕЙ, А НЕ ВЫВЕДЕНА: я написала
      // здесь «иначе погаснут все предметы типа» — ЭТО НЕВЕРНО. Прогон со снятым
      // keepGeo дал кадр, отличающийся от исправного на те же 6.2%: three не
      // стирает атрибуты при dispose и просто перезаливает буфер. Цена — ЛИШНЯЯ
      // ПЕРЕЗАЛИВКА В GPU, а не исчезновение предметов. Флаг оставлен как
      // гигиена владения, но пугать им не надо.
      if (f.obj.geometry && !(f.obj.userData && f.obj.userData.keepGeo)) f.obj.geometry.dispose();
      // молнии отдают материал в free-list (boltMat) — в турбо их много, и
      // пересоздавать одинаковые MeshBasicMaterial на каждый разряд незачем;
      // ВСЕ остальные эффекты освобождают материал как раньше
      if (f.obj.material){
        if (f.obj.userData && f.obj.userData.poolBolt && boltMatPool.length < BOLT_POOL_MAX) boltMatPool.push(f.obj.material);
        else f.obj.material.dispose();
      }
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
  // ⚠️ ЧИСЛО УМНОЖАЕТСЯ НА CFG.fxScale В МОМЕНТ ЭФФЕКТА (не здесь): на слабом
  // устройстве труха режется втрое, на обычном идёт полной. Размеры фракций
  // НЕ трогаем — мельче спека владельца уже не просила.
  { n: 640, size: 0.0225 }, // мука
  { n: 400, size: 0.035 },  // крошка
  { n: 240, size: 0.05 },   // крупные обломки
];
const _dustC = new THREE.Color();
function dustCloud(item, radial, COUNT, size, base){
  fxBuildIn();
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
  fxBuildOut();   // цена конструирования облака (см. fxBuildMs)
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
  // ⚠️ fxScale читается ЗДЕСЬ, а не в таблице: ступень качества может смениться
  // посреди партии, и следующий же эффект обязан пойти уже по новой.
  for (const f of DUST_FRACTIONS) dustCloud(item, radial, Math.max(24, Math.round(f.n * CFG.fxScale)), f.size, base);
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
function juiceFX(it){ fxBuildIn(); try { return _juiceFX_impl(it) } finally { fxBuildOut(); } }
function _juiceFX_impl(it){
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
function sparkFX(it){ fxBuildIn(); try { return _sparkFX_impl(it) } finally { fxBuildOut(); } }
function _sparkFX_impl(it){
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
function starPopFX(it){ fxBuildIn(); try { return _starPopFX_impl(it) } finally { fxBuildOut(); } }
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
function shardFX(pos, color, opts){ fxBuildIn(); try { return _shardFX_impl(pos, color, opts) } finally { fxBuildOut(); } }
function _shardFX_impl(pos, color, opts){
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

// ===== ЭФФЕКТЫ ВЫБОРА ВЛАДЕЛЬЦА 2026-08-01 (перенос со стенда) =====
// Стенд из девяти вариантов показан владельцу, выбраны три: СХЛОПЫВАНИЕ группы
// в точку тапа, РАСПИЛ предмета на половины под ножами, огонь ЯЗЫКАМИ ПО
// СИЛУЭТУ; сила ×1.7 вшита в константы (00-config), отдельной ручки в бою нет.
// Правило выбора живёт в 80-gameplay (doMatch/grindShred) — здесь только визуал.

// СХЛОПЫВАНИЕ: группа слетается в точку тапа за COLLAPSE_MS, сжимаясь по ходу.
// Смысл правки — дать матчу АДРЕСАТА: раньше предметы просто уменьшались на
// месте, и пыль читалась как «эффект вместо предмета», а не как следствие удара.
// ⚠️ ХЛОПОК ЗДЕСЬ НЕ ЖИВЁТ. Он вешается вызывающим на ТЕ ЖЕ РЕАЛЬНЫЕ ЧАСЫ, что
// и removeItem (setTimeout в doMatch): анимация идёт по ИГРОВОМУ времени, и на
// просевшем FPS тик до конца не доходит — хлопок бы не наступил вовсе. Одни
// часы на «предметы исчезли» и «бабахнуло» — единственный устойчивый вариант.
// ⚠️ Тела к этому моменту УЖЕ снесены (destroyItemBody в начале doMatch), так
// что анимации мешей не с кем спорить; глушить нечего.
function collapseFX(list, at){
  const P = at.clone();
  const src = [];
  for (const it of list){
    if (!it.mesh) continue;
    src.push({ mesh: it.mesh, p0: it.mesh.position.clone(), s0: it.mesh.scale.x });
  }
  if (!src.length) return;
  addFX(new THREE.Object3D(), COLLAPSE_MS / 1000, (o, k) => {
    const e = k * k * (3 - 2 * k);        // плавный старт, резкий приход
    for (const s of src){
      s.mesh.position.lerpVectors(s.p0, P, e);
      const sq = s.s0 * (1 - COLLAPSE_SQUASH * e);
      s.mesh.scale.set(sq * (1 + 0.5 * e), sq, sq * (1 + 0.5 * e));
      s.mesh.rotation.y += 0.25 * (1 + e);
    }
  });
}

// ЕДА: меньше капель, но КРУПНЫХ, плюс несколько попадают «на стекло экрана».
// Именно это читается как сочность: игрок видит, что брызнуло В НЕГО.
function juiceBigFX(it){
  const N = Math.max(8, Math.round(JUICE_N * CFG.fxScale)), LIFE = 0.85;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, sp = 1.2 + Math.random()*3.2;
    ox.push(it.p.x); oy.push(it.p.y + 0.2); oz.push(it.p.z);
    vx.push(Math.cos(a)*sp); vy.push(2.4 + Math.random()*4.2); vz.push(Math.sin(a)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = (it.fxColor || it.baseColor || new THREE.Color(0xff5a6e)).clone()
    .lerp(new THREE.Color(1, 1, 1), 0.14);
  const m = new THREE.PointsMaterial({ color: c, map: fxDotTex(), size: JUICE_SIZE,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.02 });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 11*t*t;   // ½·G·t², G=22
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k*k;
    o.material.size = JUICE_SIZE*(1 - k*0.25);  // капля почти не мельчает
  });
  screenDripsFX(c, JUICE_DRIPS);
}
// Капли на «стекле экрана»: DOM поверх канваса, сползают и тают.
// ⚠️ ИМЕННО DOM, а не спрайты сцены: капля обязана жить в ЭКРАННЫХ координатах
// и не зависеть от камеры — иначе при повороте она «прилипнет» к миру.
// ⚠️⚠️ КОНТЕЙНЕР НЕ ПОЛНОЭКРАННЫЙ, И ЭТО НЕ КОСМЕТИКА: по рецепту iOS Safari 26
// каждый fixed-элемент красит бары браузера своим фоном, а `transparent` там
// трактуется как прозрачный ЧЁРНЫЙ. Полоса капель на весь экран отравила бы
// тинт кромок. Держим её в СРЕДНЕЙ трети, кромок кадра она не касается.
let _dripBox = null;
function screenDripsFX(color, n){
  if (!_dripBox){
    _dripBox = document.createElement('div');
    _dripBox.id = 'juiceDrips';
    _dripBox.style.cssText = 'position:fixed;left:0;right:0;top:18%;height:52%;' +
      'pointer-events:none;z-index:6;overflow:hidden';
    document.body.appendChild(_dripBox);
  }
  const hex = '#' + new THREE.Color(color).getHexString();
  for (let i = 0; i < n; i++){
    const d = document.createElement('div');
    const w = 14 + Math.random()*22, h = w * (1.1 + Math.random()*0.7);
    d.style.cssText = 'position:absolute;left:' + (10 + Math.random()*78) + '%;' +
      'top:' + (6 + Math.random()*54) + '%;width:' + w + 'px;height:' + h + 'px;' +
      'background:' + hex + ';opacity:.55;filter:blur(.4px);' +
      'border-radius:48% 52% 44% 56% / 60% 58% 42% 40%;' +
      'transition:transform .75s cubic-bezier(.3,.1,.6,1),opacity .75s ease-in';
    _dripBox.appendChild(d);
    requestAnimationFrame(() => {
      d.style.transform = 'translateY(' + (40 + Math.random()*70) + 'px) scaleY(1.5)';
      d.style.opacity = '0';
    });
    setTimeout(() => d.remove(), 900);
  }
}

// МАШИНЫ: искры ОТСКАКИВАЮТ от стенок чаши + отлетает колесо-деталька.
// Рикошет — то, чего не было: искры просто улетали, и глаз не считал их частью
// мира. Отскок привязывает эффект к чаше.
// ⚠️ ОТСКОК АНАЛИТИЧЕСКИЙ, по radiusAt(y) — никаких коллайдеров и тел:
// правило пакета «куски эффектов остаются анимацией» (00-config).
function sparkRicochetFX(it){
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
      const R = radiusAt(s.y) - 0.15, d = Math.hypot(s.x, s.z);
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
// Колесо: отлетает, падает, ложится и УКАТЫВАЕТСЯ, теряя ход. Мелочь, которая
// превращает «искры» в «что-то отвалилось».
function wheelFX(it){
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

// РАСПИЛ: предмет разваливается НА ДВЕ ПОЛОВИНЫ по плоскости реза, каждая
// съезжает со среза и падает под ножи. Половины НАСТОЯЩИЕ — режем плоскостью
// отсечения по той же модели, поэтому срез честный и приём работает на ЛЮБОМ
// предмете пула без препроцессинга геометрии.
// ⚠️ ТРЕБУЕТ renderer.localClippingEnabled (ставится в 10-stage при старте).
// ⚠️ НИ mesh.clone(), НИ material.clone(): three копирует userData через
// JSON.parse(JSON.stringify), а у предметов там ссылки на тело Rapier и на
// объект шейдера matcap-патча — «Converting circular structure to JSON», и
// эффект падал целиком. Собираем половину напрямую.
// ⚠️ ГЕОМЕТРИЯ ОБЩАЯ С ПРЕДМЕТОМ, половины помечены keepGeo — stepFX диспозит
// geometry догоревшего эффекта, а у предметов она общая НА ТИП (кэш 30-shapes).
// Цена ошибки — лишняя перезаливка буфера в GPU (замерено диверсией; предметы
// НЕ исчезают, three держит атрибуты и заливает заново).
// ⚠️⚠️ КЛОНА ГЕОМЕТРИИ ЗДЕСЬ НЕТ, И ЭТО НЕ УПУЩЕНИЕ. На стенде половины
// клонировали геометрию предмета — это стоило 3.20 мс под CPU ×4 и было самой
// дорогой конструкцией набора; под неё планировался кэш по типу. При переносе
// оказалось, что клон не нужен ВООБЩЕ: флаг keepGeo (см. stepFX) уже запрещает
// диспозить чужую геометрию, а больше клон ни для чего не был нужен —
// плоскость реза живёт в МАТЕРИАЛЕ, он у каждой половины свой.
// Итог: 3.20 мс -> 0, кэш и его память не понадобились.
// ⛔ Не «оптимизировать» это обратно в clone(): диспоз общей геометрии типа
// погасил бы все предметы этого типа в куче.
function sawVisualMat(src){
  const o = { color: src.color ? src.color.clone() : undefined, map: src.map || null,
              vertexColors: !!src.vertexColors, transparent: true, opacity: 1,
              side: THREE.DoubleSide };   // срез не должен быть дырой
  if (src.isMeshMatcapMaterial){ o.matcap = src.matcap || null; return new THREE.MeshMatcapMaterial(o); }
  return new THREE.MeshBasicMaterial(o);
}
function sawFX(item){
  const mesh = item.mesh, p0 = mesh.position.clone();
  const a = Math.random()*Math.PI;
  const nrm = new THREE.Vector3(Math.cos(a), SAW_TILT, Math.sin(a)).normalize();
  const geo = mesh.geometry;          // ОБЩАЯ с предметом — половины помечены keepGeo
  Sound.play('crunch', 6);
  for (const sgn of [1, -1]){
    // ⚠️ геометрия ОБЩАЯ с предметом и с другой половиной — помечаем keepGeo,
    // иначе stepFX диспознет её и погасит все предметы этого типа.
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
      o.material.clippingPlanes[0].constant = nrm.dot(o.position)*sgn; // срез едет с половиной
      if (k > 0.7) o.material.opacity = (1-k)/0.3;
    });
  }
}

// ОГОНЬ ПО СИЛУЭТУ: раздутая копия меша с френель-шейдером — пламя облизывает
// форму предмета и живёт по его силуэту, а не рядом с ним. Родня ореолу-призраку
// доступности, поэтому в стиль ложится по построению.
// ⚠️⚠️ МАТЕРИАЛ ПРЕДМЕТА НЕ ТРОГАЕМ НИ НА КАДР: портреты коллекции рендерятся
// тем же классом материала, и «горячее» просочилось бы в музей — тот же класс
// граблей, что у двух потребителей uVeil. Огонь только НАКЛАДКОЙ поверх меша.
// ⚠️ ЖИВЁТ НЕОПРЕДЕЛЁННО ДОЛГО, поэтому не через addFX (тот про конечную жизнь):
// свой список fires и свой тик из 99-main. Возвращает функцию тушения.
const fires = [];
function fireSilhouetteFX(item){
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
  m.userData.keepGeo = true;         // геометрия ОБЩАЯ с предметом — не диспозить
  m.renderOrder = 9;
  item.mesh.add(m);                  // едет вместе с предметом
  const st = { item, obj: m, mat, t0: performance.now(), dying: 0 };
  fires.push(st);
  return () => { if (!st.dying) st.dying = performance.now(); };
}
function tickFires(){
  if (!fires.length) return;
  const now = performance.now();
  for (let i = fires.length - 1; i >= 0; i--){
    const f = fires[i];
    f.mat.uniforms.t.value = (now - f.t0)/1000;
    // предмет исчез (совмещён/перемолот) — гасим вместе с ним
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
function extinguishAll(){ for (const f of fires) if (!f.dying) f.dying = performance.now(); }

// Молния (цепная реакция): ломаная с дрожанием, два слоя — насыщенное ядро
// + светлый ореол со сдвигом. ⚠️ Фон БЕЛЫЙ: только normal blending и
// насыщенный цвет (additive-свечение на белом невидимо).
//
// ⚠️ «БОЛЬШЕ МЕЛКИХ МОЛНИЙ» (спека владельца 2026-07-28): разряд теперь не
// одна дуга, а дуга + BOLT_FORKS коротких ОТВЕТВЛЕНИЙ, и всё ТОНЬШЕ прежнего —
// куча выглядит наэлектризованной, а не прошитой двумя толстыми жилами.
// ⚠️ ЦЕНА ДЕРЖИТСЯ ПОСТОЯННОЙ: все филаменты слоя сливаются в ОДНУ геометрию,
// поэтому на разряд по-прежнему РОВНО 2 объекта / 2 материала / 2 draw call —
// столько же, сколько было у одиночной дуги. Наивный путь «звать boltFX в 6
// раз чаще» дал бы ×6 объектов и мешей в кадре.
const BOLT_SEG = 9;          // узлов основной дуги
const BOLT_FORKS = 5;        // ответвлений на разряд
const BOLT_LIFE = 0.16;
// ⚠️ Общих временных векторов у молний БОЛЬШЕ НЕТ: boltPath заводит свой базис
// на каждый вызов, иначе генерация ответвлений затирала бы базис основной дуги
// (ветки ушли бы не в ту сторону). _bUp — константа, её переиспользовать можно.
const _bUp = new THREE.Vector3(0,1,0);
// Ломаная с поперечным дрожанием между двумя точками -> кусочно-линейный путь
// (CatmullRom сгладил бы изломы — молния перестала бы быть молнией).
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
      const amp = len*jitter*Math.sin(Math.PI*t); // максимум дрожания посередине
      p.addScaledVector(n1, (Math.random()-0.5)*2*amp).addScaledVector(n2, (Math.random()-0.5)*2*amp);
    }
    pts.push(p);
  }
  const path = new THREE.CurvePath();
  for (let i=0;i<seg;i++) path.add(new THREE.LineCurve3(pts[i], pts[i+1]));
  return { path, pts, len, n1, n2, dir };
}
// ⚠️ РУЧНОЕ СЛИЯНИЕ: в UMD-сборке r149 BufferGeometryUtils НЕТ (в бандле от
// него только строка в тексте ошибки BufferGeometry.merge). Материал молний —
// MeshBasicMaterial без света и текстур, поэтому копируем ТОЛЬКО position
// и index: normal/uv шейдером не читаются, их перенос был бы чистой тратой
// (втрое меньше данных в GPU и меньше работы на слияние).
function mergeTubeGeos(list){
  let vc = 0, ic = 0;
  for (const g of list){ vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc*3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list){
    const src = g.attributes.position.array, n = g.attributes.position.count, gi = g.index.array;
    pos.set(src, vo*3);
    for (let i=0;i<gi.length;i++) idx[io+i] = gi[i] + vo; // индексы съезжают на уже уложенные вершины
    vo += n; io += gi.length;
    g.dispose(); // временная геометрия филамента: в GPU не уезжала, но освобождаем честно
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// ПУЛ МАТЕРИАЛОВ (просьба диспетчера: не плодить материалы на каждый разряд).
// ⚠️ Это FREE-LIST, а НЕ общий материал: у каждого ЖИВОГО разряда opacity
// мерцает индивидуально, поэтому шарить один материал между одновременными
// молниями нельзя — переиспользуем только ОСВОБОДИВШИЕСЯ (stepFX кладёт сюда
// вместо dispose по флагу userData.poolBolt).
const boltMatPool = [];
const BOLT_POOL_MAX = 24;
function boltMat(color, opacity){
  const m = boltMatPool.pop();
  // setHex повторяет поведение конструктора (в r149 без ColorManagement hex
  // кладётся как есть) — тон переиспользованного материала бит-в-бит прежний
  if (m){ m.color.setHex(color); m.opacity = opacity; return m; }
  return new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthTest:false });
}
function boltFX(a, b){
  // ⚠️ СКРЫТО ФЛАГОМ, НЕ УДАЛЕНО (спека владельца 2026-07-28): вход в турбо
  // теперь отмечается ПОДБРОСОМ кучи, а не разрядами. Весь механизм молний
  // (ветвление, слияние филаментов, free-list материалов) остаётся рабочим —
  // TURBO_BOLTS=true в 00-config включает обратно одним значением.
  if (!TURBO_BOLTS) return;
  const main = boltPath(a, b, BOLT_SEG, 0.13);
  if (!main || main.len < 0.2) return;
  // ОТВЕТВЛЕНИЯ: короткие ветки от случайных узлов основной дуги, вбок и
  // немного вдоль. Базис берём ИЗ main (boltPath заводит свой на каждый вызов —
  // общие _bN1/_bN2 затёрлись бы при генерации веток).
  const forks = [];
  const axis = main.dir.clone().normalize();
  for (let i=0;i<BOLT_FORKS;i++){
    const j = 1 + Math.floor(Math.random()*(BOLT_SEG-1)); // не от самых концов
    const from = main.pts[j];
    const to = from.clone()
      .addScaledVector(main.n1, (Math.random()-0.5)*2)
      .addScaledVector(main.n2, (Math.random()-0.5)*2)
      .addScaledVector(axis, (Math.random()-0.5)*0.8);
    // нормируем смещение к доле длины основной дуги -> ветка всегда «мелкая»
    to.sub(from).normalize().multiplyScalar(main.len*(0.12+Math.random()*0.20)).add(from);
    const f = boltPath(from, to, 3, 0.22);
    if (f) forks.push(f);
  }
  const layer = (color, rMain, rFork, opacity) => {
    const geos = [ new THREE.TubeGeometry(main.path, BOLT_SEG*2, rMain, 4, false) ];
    // у веток грубее тесселяция: они мелкие, разницы не видно, а вершин втрое меньше
    for (const f of forks) geos.push(new THREE.TubeGeometry(f.path, 6, rFork, 3, false));
    const mesh = new THREE.Mesh(mergeTubeGeos(geos), boltMat(color, opacity));
    mesh.renderOrder = 12;
    mesh.userData.poolBolt = true; // stepFX вернёт материал в пул вместо dispose
    addFX(mesh, BOLT_LIFE, (o,k)=>{ o.material.opacity = opacity*(1-k)*(0.55+0.45*Math.random()); }); // мерцание
  };
  // ⚠️ ПРОПОРЦИЯ ОБОЛОЧКА:ЯДРО ~3:1, А НЕ 2.3:1 КАК У ТОЛСТОЙ ВЕРСИИ. При
  // утоньшении филамента синий ореол первым уходит в субпиксель: на крупном
  // плане проба дала БЕЛЫЕ нитки вместо электрических (ядро почти догнало
  // оболочку по экранной ширине). Ореолу нужна доля ШИРЕ, чем при толстой дуге.
  layer(0x2f6bff, 0.075, 0.038, 0.6);  // оболочка (было 0.09 — всё равно «мельче»)
  layer(0xdceeff, 0.024, 0.012, 1.0);  // ядро (было 0.035)
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
  const before = stats.score;
  const charged = scorePenalty(MISS_PENALTY);
  const shown = scoreShownDelta(stats.score, before); // деноминир. падение чипа (#10)
  // ⚠️ ПРОМАХ ОБНУЛЯЕТ НАБОР ТУРБО (спека владельца 2026-07-27: «если при
  // наборе турборежима игрок ошибается — счётчик режима сбрасывается»).
  // ⚠️ ЭТО РАЗВОРОТ ЕГО ЖЕ ПРЕЖНЕГО ТЮНИНГА: раньше здесь стояло −2 шага
  // вместо сброса, потому что он говорил «слишком резко сбрасываем power
  // chain». Новая спека прямая и новее — берём её; РАДИУС-ЛЕСЕНКА (comboLevel)
  // при этом по-прежнему теряет COMBO_MISS_DROP=2, а не обнуляется: владелец
  // назвал «счётчик РЕЖИМА», это заряд цепи (comboCount), лесенка — отдельная
  // механика, её он не трогал.
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = 0; // набор турбо — с нуля
    updateMatchRadius(); updateHUD();
  }
  if (charged && shown > 0){
    if (worldPos) scorePop('-' + shown, worldPos, '#e5484d', false);
    else scorePopScreen('-' + shown, sx, sy, '#e5484d', false);
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
  [ fresnelGhostMat(0xffffff, 0.05, 0.32),      // (запас: вариант удалённой sphereFX; массив НЕ трогаем — прогрев шейдеров)
    fresnelGhostMat(0xffffff, 0.1, 0.5),        // markerFX
    fresnelGhostMat(0xffffff, 0.02, 0.16, 1.1), // reachGhostFX (ореол тапа/подсказки)
  ].forEach(m => { m.uniforms.op.value = 0; g.add(new THREE.Mesh(tiny, m)); });
  g.add(new THREE.Mesh(tiny, new THREE.MeshBasicMaterial({ transparent:true, opacity:0 }))); // popFX/boltFX
  const pg = new THREE.BufferGeometry(); // dustCloud: Points + vertexColors
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size:0.001, vertexColors:true, transparent:true, opacity:0, depthWrite:false })));
  // ⚠️ ДОБАВЛЕНО ПО РЕВЬЮ main: этих программ в якорях не было, а эффекты
  // появились позже. После полного дренажа fx первый сок/искра/звёздочка/скол
  // компилировали шейдер ПРЯМО В КАДРЕ — ровно тот джанк, ради которого якоря
  // и заведены. Ключ программы у Points с картой и alphaTest свой, у
  // MeshBasicMaterial с вершинными цветами — тоже свой.
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(dg, new THREE.PointsMaterial({ size:0.001, map: fxDotTex(),
    transparent:true, opacity:0, depthWrite:false, alphaTest:0.02 })));  // juiceFX/sparkFX/starPopFX
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors:true,
    transparent:true, opacity:0, depthWrite:false })));                  // shardFX
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.001, 0)]);
  const ln = new THREE.Line(lg, new THREE.LineDashedMaterial({ transparent:true, opacity:0, dashSize:0.3, gapSize:0.15 })); // lineFX
  ln.computeLineDistances();
  g.add(ln);
  g.position.set(0, 0, -0.5); // всегда в кадре перед камерой, глазу невидим
  camera.add(g);
  scene.add(camera); // дети камеры рендерятся, только когда камера в графе сцены
})();
