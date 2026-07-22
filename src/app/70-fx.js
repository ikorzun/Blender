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
// Ошибка: −1/3 стоимости пары
function penalize(worldPos, sx, sy){
  stats.misses++;
  stats.score -= MISS_PENALTY;
  // промах в лихорадке срезает COMBO_MISS_DROP=2 УСПЕШНЫХ ШАГА — и у
  // радиус-лесенки, и у заряда цепи — но серию НЕ гасит (тюнинг владельца:
  // «слишком резко сбрасываем power chain»); серию убивает только пауза
  // без матчей > COMBO_MS
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = Math.max(0, comboCount - COMBO_MISS_DROP);
    updateMatchRadius(); updateHUD();
  }
  if (worldPos) scorePop('-' + MISS_PENALTY, worldPos, '#e5484d', false);
  else scorePopScreen('-' + MISS_PENALTY, sx, sy, '#e5484d', false);
  Sound.play('miss');
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
