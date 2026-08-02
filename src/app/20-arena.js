// ===== 20-arena: стеклянная чаша блендера, лопасти =====
let bowlMesh = null, bowlMat = null; // стекло: тает при приближении камеры (99-main)

// Стекло ВОЗВРАЩЕНО (запрос владельца) в последнем утверждённом виде —
// «практически незаметное»: transmission 1, ior 1.0 (не гнёт лучи),
// блики почти в ноль. Проникновение предметов В СТЕКЛО починено на стороне
// физики: стены Rapier стоят ВНУТРИ стекла с зазором WALL_GAP (50-physics) —
// предметы останавливаются, не доходя до стеклянной поверхности.
const GLASS_T = 0.26; // толщина стекла
(function buildFunnel(){
  const pts = [];
  const N = 12;
  for (let i=0;i<=N;i++){ const y = FUNNEL.H*i/N; pts.push(new THREE.Vector2(FUNNEL.R0 + SLOPE*y, y)); }
  pts.push(new THREE.Vector2(FUNNEL.R1 + GLASS_T*0.5, FUNNEL.H + 0.10)); // скруглённая губа
  for (let i=N;i>=0;i--){ const y = FUNNEL.H*i/N; pts.push(new THREE.Vector2(FUNNEL.R0 + SLOPE*y + GLASS_T, y)); }
  pts.push(new THREE.Vector2(FUNNEL.R0, 0));  // торец дна
  pts.push(new THREE.Vector2(0.02, 0));       // стеклянное дно (чаша парит в белом)
  const lathe = new THREE.LatheGeometry(pts, 64);
  // ⚠️ БЕЗ transmission: любой видимый transmission>0 заставляет three
  // рендерить ВЕСЬ мир второй раз в FBO (замер аудита: ~55% КАЖДОГО кадра).
  // При ior 1.0 стекло и так ничего не преломляло — прозрачность даёт тот же
  // «практически незаметный» вид за долю цены. transmission НЕ возвращать.
  // ПОЛНОСТЬЮ ПРОЗРАЧНОЕ СТЕКЛО (спека владельца 2026-07-21, обведено красным):
  // в лоб чаша не видна ВООБЩЕ, проступает только мягкий край по касательной.
  // Прежняя равномерная opacity 0.08 затягивала белёсой плёнкой всю площадь
  // и глушила предметы; здесь плёнки нет — альфа берётся из ФРЕНЕЛЯ, то есть
  // растёт лишь там, где поверхность уходит от взгляда ребром.
  // GLASS_POW правит мягкость перехода: больше — уже и резче кромка.
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uEdge: { value: GLASS_EDGE },   // яркость кромки
      uPow:  { value: GLASS_POW },    // мягкость перехода
      uFade: { value: 1 },            // растворение при зуме (99-main)
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
      // abs() — чтобы кромка читалась и на гранях, отвёрнутых от камеры
      '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
      '  f = pow(clamp(f, 0.0, 1.0), uPow);',
      '  gl_FragColor = vec4(1.0, 1.0, 1.0, f * uEdge * uFade);',
      '}',
    ].join('\n'),
  });
  const bowl = new THREE.Mesh(lathe, mat); scene.add(bowl);
  bowlMesh = bowl; bowlMat = mat; // для растворения стекла при зуме (99-main)
  // Подставки, воротника и земли НЕТ — чаша парит в белом пространстве.
})();

// Лопасти миксера на дне (визуальные; предметы лежат выше FLOOR_REST)
const mixerBlades = new THREE.Group();
(function buildBlades(){
  const metal = new THREE.MeshStandardMaterial({ color:0x6f7884, metalness:1, roughness:0.25 });
  const dark = new THREE.MeshStandardMaterial({ color:0x2c313a, metalness:0.6, roughness:0.5 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.42, 16), dark);
  hub.position.y = 0.21; mixerBlades.add(hub);
  for (let i=0;i<4;i++){
    const arm = new THREE.Group();
    arm.rotation.y = i*Math.PI/2;
    const g = new THREE.BoxGeometry(2.1, 0.09, 0.44);
    g.translate(1.08, 0, 0); // размах 2.13 при дне 2.4 — почти во всю ширину
    const blade = new THREE.Mesh(g, metal);
    blade.position.y = 0.24;
    blade.rotation.x = (i % 2 ? 0.5 : -0.4); // пара лопастей вверх, пара вниз
    arm.add(blade);
    mixerBlades.add(arm);
  }
  // у САМОГО дна (спека владельца: «не видно винт — ближе к нижнему краю
  // и больше»); верх лопастей ~0.6 — предметы на FLOOR_REST=1.15 не задевают
  mixerBlades.position.y = 0.28;
  scene.add(mixerBlades);
})();
let mixerSpeed = 0; // рад/с; лопасти крутятся ТОЛЬКО когда миксер работает (в покое нервируют)

function radiusAt(y){
  const yy = Math.max(0, Math.min(y, FUNNEL.H)); // над кромкой — цилиндр R1
  return FUNNEL.R0 + SLOPE*yy;
}

// ===== ЧАША-РАЗЛЁТ (прототип v2): трещины + черепки =====
// Трещины — ПРОТОТИПНЫЙ визуал (ломаные линии по поверхности конуса + лёгкое
// беление стекла); боевой шейдерный вариант — Графике при переносе в процесс.
let bowlCrackGroup = null, bowlCrackN = 0, bowlBaseOpacity = null;
function setBowlCracks(k, total){
  bowlCrackN = k;
  if (bowlBaseOpacity == null && bowlMat) bowlBaseOpacity = bowlMat.opacity;
  if (bowlCrackGroup){ scene.remove(bowlCrackGroup);
    bowlCrackGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    bowlCrackGroup = null; }
  if (bowlMat && bowlBaseOpacity != null)
    bowlMat.opacity = Math.min(0.30, bowlBaseOpacity + 0.035*k); // стекло мутнеет
  if (k <= 0) return;
  bowlCrackGroup = new THREE.Group();
  // СПЕКА ВЛАДЕЛЬЦА (2026-08-02, дословно): «трещины должны соответствовать
  // поверхности чаши, повторять её поверхность; белого цвета и толщиной 1px».
  // Реализация: БЕЛЫЕ Line (WebGL и рисует их в 1px — тут это спека, а не
  // грабля), путь — МЕЛКИМИ шагами строго по конусу: каждая точка на
  // radiusAt(y)+0.012, шаг ~0.12 по высоте — хорды прилегают к кривизне,
  // линия ЛЕЖИТ на стекле (прежние редкие точки давали хорды, парящие над
  // поверхностью — «проволока рядом с чашей», поправка владельца).
  // Заметность при 1px берётся РИСУНКОМ: ствол + ветки + паутинка удара.
  const lineMat = () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const onCone = (a, y) => new THREE.Vector3(
    Math.cos(a)*(radiusAt(y) + 0.012), y, Math.sin(a)*(radiusAt(y) + 0.012));
  const rng = (seed) => { let x = seed; return () => (x = (x*16807) % 2147483647) / 2147483647; };
  const addPath = (a0, y0, len, kink, seed) => {
    const r = rng(seed*2654435761 % 2147483647 + 1);
    const pts = []; let a = a0, y = y0;
    const step = 0.12;
    for (let i = 0; i <= len; i++){
      pts.push(onCone(a, y));
      y -= step*(0.7 + 0.6*r());
      a += (r() - 0.5)*kink;
      if (y < 0.3) break;
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    bowlCrackGroup.add(new THREE.Line(g, lineMat()));
    return pts;
  };
  for (let c = 0; c < k; c++){
    const a0 = (c*2.399963) % (Math.PI*2);            // золотой угол — без решётки
    const prog = Math.min(1, (c+1)/Math.max(1, total||5));
    const yTop = FUNNEL.H*0.97;
    // ствол: вниз по конусу мелким изломом; длиннее с номером трещины
    const trunk = addPath(a0, yTop, Math.round(28 + 30*prog), 0.16, c*7 + 1);
    // ветки: 2-4 форка из точек ствола, короче и с сильнее изломом
    const forks = 2 + (c % 3);
    for (let f = 0; f < forks; f++){
      const at = trunk[Math.min(trunk.length - 1, 4 + f*Math.floor(trunk.length/(forks+1)))];
      const aAt = Math.atan2(at.z, at.x);
      addPath(aAt, at.y, 8 + f*4, 0.34, c*31 + f*13 + 5);
    }
    // паутинка удара у кромки: 5 коротких лучей тем же 1px-белым
    for (let rN = 0; rN < 5; rN++){
      addPath(a0 + (rN - 2)*0.16, yTop, 3 + (rN % 3)*2, 0.4, c*57 + rN*3 + 2);
    }
  }
  bowlCrackGroup.userData.telegraph = (total != null && k >= total - 1); // пульс при N-1
  scene.add(bowlCrackGroup);
}
// пульс телеграфа (зовёт loop): мигание трещин при k = N-1
function tickBowlCracks(nowMs){
  if (!bowlCrackGroup || !bowlCrackGroup.userData.telegraph) return;
  const o = 0.5 + 0.45*(0.5 + 0.5*Math.sin(nowMs*0.012));
  bowlCrackGroup.children.forEach(l => { l.material.opacity = o; });
}
// разлёт: чаша скрывается, 2x7 черепков-секторов конуса уходят баллистикой
function shatterBowlVis(){
  if (bowlMesh) bowlMesh.visible = false;
  setBowlCracks(0);
  const rows = BOWL_SHARD_ROWS, seg = BOWL_SHARD_SEG;
  for (let r = 0; r < rows; r++){
    const y0 = FUNNEL.H*r/rows, y1 = FUNNEL.H*(r+1)/rows;
    for (let i = 0; i < seg; i++){
      const th0 = i/seg*Math.PI*2, dth = Math.PI*2/seg*0.92;
      const g = new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), y1-y0, 5, 1, true, th0, dth);
      g.translate(0, (y0+y1)/2, 0);
      const m = new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true,
        opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(g, m);
      const midA = th0 + dth/2;
      const dir = new THREE.Vector3(Math.cos(midA), 0.55 + Math.random()*0.4, Math.sin(midA)).normalize();
      const spin = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(6);
      const v0 = 7 + Math.random()*4;
      const p0 = mesh.position.clone();
      addFX(mesh, 1.4, (o, k) => {
        // параметрическая баллистика (канон: позиция от t, FPS-независимо)
        const t = k*1.4;
        o.position.set(p0.x + dir.x*v0*t, p0.y + dir.y*v0*t - 0.5*9.5*t*t, p0.z + dir.z*v0*t);
        o.rotation.set(spin.x*t, spin.y*t, spin.z*t);
        o.material.opacity = 0.5*(1 - k);
      });
    }
  }
}
// восстановление к новому уровню
function restoreBowlVis(){
  if (bowlMesh) bowlMesh.visible = true;
  if (bowlMat && bowlBaseOpacity != null) bowlMat.opacity = bowlBaseOpacity;
  setBowlCracks(0);
}
