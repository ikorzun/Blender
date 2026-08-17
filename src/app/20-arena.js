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
  // ⚠️ ЛОПАСТИ — МАТЧЕП ВЛАДЕЛЬЦА «metall.png» (слово 2026-08-17 «примерь этот
  // материал на лопасти миксера»). Прежний MeshStandard c metalness:1 отражал
  // софтбокс-окружение и на светлом фоне читался плоско-серым; матчеп даёт
  // металл, не зависящий ни от света, ни от ракурса, — тот же довод, по
  // которому на матчепы переведены все предметы (решение владельца 2026-07-20).
  // ⚠️ СТУПИЦА ОСТАЛАСЬ ТЁМНОЙ (`dark`): владелец сказал «на лопасти».
  const metal = new THREE.MeshMatcapMaterial({ color:0xffffff, matcap: metalMatcapTex() });
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

// ═══ ГЕОМЕТРИЯ ВИТРИНЫ: ЯЩИК = ВЬЮПОРТ ═══
// ⚠️⚠️ ШИРИНА ЗАМОРОЖЕНА НА УРОВЕНЬ, КАМЕРА ЖИВАЯ. Это несущее решение, а не
// оптимизация: физические стены ставятся ОДИН РАЗ на genLevel, и если бы
// потребители ширины (спасатель, спавн, метрика, зонд) читали ЖИВОЙ аспект,
// ресайз посреди партии развёл бы формулу с фактическими стенами — спасатель
// начал бы телепортировать здоровую кучу. Ровно этот класс дефекта в витрине
// ловился уже дважды. Поэтому: `bonusFreezeBox()` на genLevel, все читают
// `bonusHalfX()`, а на ресайз реагирует ТОЛЬКО камера (`bonusCamR`).
let _bonusHX = 3.7;
function bonusHalfX(){ return _bonusHX; }
// только для пробы безопасности мутации коллайдеров (см. хук boxProbe)
function setBonusHalfXForProbe(v){ _bonusHX = v; }
// tan половины ВЕРТИКАЛЬНОГО fov × аспект = tan половины горизонтального
function bonusFitK(){ return Math.tan(camera.fov * Math.PI / 360) * camera.aspect; }
function bonusFreezeBox(){
  const hz = BONUS_D/2;
  // ширина, при которой ЗАДНЯЯ грань (самая дальняя, а значит самая широкая в
  // кадре) проецируется ровно на кромку экрана
  const хочу = (BONUS_CAM_R_NOM + hz) * bonusFitK() * BONUS_EDGE_MARGIN;
  _bonusHX = Math.max(BONUS_HX_MIN, Math.min(BONUS_HX_MAX, хочу));
  return _bonusHX;
}
// ЖИВАЯ дистанция камеры: обратная к той же формуле. При неклампнутой ширине
// возвращает ровно BONUS_CAM_R_NOM; при упёршейся в кап — подтягивает камеру
// ближе, чтобы кадр всё равно был закрыт ящиком целиком.
function bonusCamR(){
  const k = bonusFitK();
  if (!(k > 1e-4)) return BONUS_CAM_R_NOM;
  return Math.max(3.0, _bonusHX / (k * BONUS_EDGE_MARGIN) - BONUS_D/2);
}
function bonusVisHalfH(){ return (bonusCamR() + BONUS_D/2) * Math.tan(camera.fov * Math.PI / 360); }
// взгляд ставится так, чтобы ДНО ящика село на нижнюю кромку кадра
function bonusCamTY(){ return BONUS_FLOOR - 0.5 + bonusVisHalfH(); }
// ВЕРХ СТОЛБА — ДОЛЯ ВЬЮПОРТА ОТ ЕГО НИЗА (слово владельца: «на 2/3 по высоте»).
// ⚠️ Считаем от НИЖНЕЙ КРОМКИ КАДРА, а не от взгляда: «две трети экрана» — это
// про то, что видит игрок, и привязка к `ty` дала бы другую долю при смене
// пропорций окна.
function bonusPileTop(){
  const низКадра = bonusCamTY() - bonusVisHalfH();
  return Math.min(BONUS_H - 2, низКадра + 2 * bonusVisHalfH() * BONUS_FILL_VIEW);
}
// число пар — ИЗ ОБЪЁМА, который надо заполнить, а не константой: иначе на
// широком кадре столб не дорос бы до глаз, а на узком перелился бы через верх
function bonusPairs(){
  const объём = (2*bonusHalfX()) * BONUS_D * Math.max(1, bonusPileTop() - BONUS_FLOOR);
  const пар = Math.round(объём * BONUS_DENSITY / 2);
  return Math.max(BONUS_PAIRS_MIN, Math.min(BONUS_PAIRS_MAX, пар));
}
// ⚠️⚠️ ЕДИНАЯ ТОЧКА ШИРИНЫ СТЕНЫ ПО НАПРАВЛЕНИЮ. Обобщение `radiusAt` с тела
// вращения на любой контейнер: сколько от оси до стены в сторону (nx, nz).
// Для чаши это тот же радиус (направление не важно), для ящика — ближайшая из
// двух пар граней. Через неё ОБЯЗАНЫ ходить все, кто спрашивает «где стена»:
// спасатель, метрика выступа, отскок искр. Раздельные формулы у них гарантируют
// расхождение — спасатель считал бы вылетом то, что стена держит.
function wallDistAt(y, nx, nz){
  if (typeof levelNum !== 'undefined' && isBonusLevel(levelNum)){
    const ax = Math.abs(nx), az = Math.abs(nz);
    // расстояние до границы прямоугольника вдоль единичного направления
    const dx = ax > 1e-6 ? bonusHalfX() / ax : Infinity;
    const dz = az > 1e-6 ? (BONUS_D/2) / az : Infinity;
    return Math.min(dx, dz);
  }
  return radiusAt(y);
}
// Прижать точку внутрь контейнера (спасатель ставит предмет обратно).
// Для ящика — по каждой оси отдельно: радиальная посадка вернула бы предмет
// ЗА тонкую грань, и спасатель зациклился бы на нём.
function clampIntoContainer(x, z, margin){
  if (typeof levelNum !== 'undefined' && isBonusLevel(levelNum)){
    const hx = Math.max(0.1, bonusHalfX() - margin), hz = Math.max(0.1, BONUS_D/2 - margin);
    return { x: Math.max(-hx, Math.min(hx, x)), z: Math.max(-hz, Math.min(hz, z)) };
  }
  return null; // чаша — радиальная посадка на месте вызова
}
function radiusAt(y){
  // ⚠️⚠️ НА БОНУСЕ КОНТЕЙНЕР — ЯЩИК-ВИТРИНА, У НЕГО РАДИУСА НЕТ. Отдаём
  // ОПИСАННУЮ окружность (половина диагонали): она заведомо БОЛЬШЕ настоящей
  // стены, поэтому ни один потребитель не решит, что предмет вылетел, когда он
  // внутри. ⛔ Мерить стену этим числом НЕЛЬЗЯ — для этого есть `wallDistAt`.
  // Кто читает `radiusAt` на бонусе сегодня: отношение сжатия радиуса совпадения
  // (60-access — там важна ПОСТОЯННОСТЬ, ящик по высоте не сужается, отношение
  // выходит 1) и выпечка стекла чаши (её на бонусе не видно).
  if (typeof levelNum !== 'undefined' && isBonusLevel(levelNum))
    return Math.hypot(2*bonusHalfX(), BONUS_D) / 2;
  const yy = Math.max(0, Math.min(y, FUNNEL.H)); // над кромкой — цилиндр R1
  return FUNNEL.R0 + SLOPE*yy;
}

// ===== ЧАША-РАЗЛЁТ (прототип v2): трещины + черепки =====
// Трещины — ПРОТОТИПНЫЙ визуал (ломаные линии по поверхности конуса + лёгкое
// беление стекла); боевой шейдерный вариант — Графике при переносе в процесс.
let bowlCrackGroup = null, bowlCrackN = 0, bowlBaseOpacity = null;
// ⛔ ВИЗУАЛ ТРЕЩИН УБРАН СОВСЕМ (слово владельца 2026-08-02 дословно:
// «давай трещины уберем совсем — они выглядят неестественно и некрасиво»).
// Пробовано и отвергнуто им: 1px-линии → трубки с бликом → белые 1px по
// поверхности с ветвлением. МЕХАНИКА ЖИВА (счёт бустов + разлёт на N) —
// прогресс к разлёту сейчас НЕВИДИМ; индикатор другим способом (глаза?
// счётчик?) — только по его слову, не изобретать.
function setBowlCracks(k, total){
  bowlCrackN = k;
  if (bowlCrackGroup){ scene.remove(bowlCrackGroup);
    bowlCrackGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    bowlCrackGroup = null; }
}
function tickBowlCracks(){ /* пульс ушёл вместе с визуалом */ }
// ⚠️ ТИНТ ПО ВЕРШИННЫМ НОРМАЛЯМ, А НЕ ПО ГРАНЯМ — и это отличие от shardFX
// осознанное: у осколков предмета грани плоские и резкие, там объём даёт
// ⛔ bakeShardTint и _bshN вырезаны уборкой 2026-08-12: пофасеточный тинт
// осколков чаши остался от редакции ДО GPU-разлёта (aCen в вершинах) — его
// не звал никто, включая тесты. Возврат — из истории git.
// ⚡ РАЗЛЁТ ЧАШИ — ОДИН МЕШ, ДВИЖЕНИЕ В ВЕРШИННОМ ШЕЙДЕРЕ.
// Техника из akella/ExplodingObjects (репозиторий показан владельцем 2026-08-06):
// куски слиты в ОДНУ геометрию, а принадлежность к куску записана прямо в
// вершины — центр куска, ось вращения, скорость, темп кувырка. Разлёт гонит
// шейдер по одной юниформе времени.
// ⚠️ ЧЕМ ЭТО ЛУЧШЕ ПРЕЖНЕГО (30 отдельных мешей с тиком на каждом): цена
// перестаёт зависеть от числа кусков — один объект, один материал, один тик,
// ноль работы процессора на кусок. Поэтому кусков стало 8×26 вместо 3×10.
// ⚠️ ГЕОМЕТРИЯ ПЕЧЁТСЯ ОДИН РАЗ: чаша неизменна, поэтому расколотую версию
// держим в кэше и переиспользуем — сам взрыв больше НИЧЕГО не строит (раньше
// строил 30 геометрий и 30 материалов синхронно, в одном кадре).
let _shatterGeo = null, _shatterMat = null, _shatterN = 0;
// ⚠️⚠️ ФЛАГ «ЧАША РАЗБИТА» НУЖЕН ПОТОМУ, ЧТО ВИДИМОСТЬЮ СТЕКЛА ВЛАДЕЕТ ЦИКЛ.
// В loop (99-main) каждый кадр стоит `bowlMesh.visible = k > 0.02` — растворение
// стекла при приближении камеры. Наше `visible=false` в разлёте жило ровно ОДИН
// кадр, и силуэт возвращался (жалоба владельца 2026-08-06: «после взрыва не
// должно быть силуэта, только осколки»). Снимать чужое состояние руками нельзя —
// его надо ГЕЙТИТЬ у владельца.
let bowlBroken = false, _shatterSizes = null;
// ⚠️⚠️ КУСКИ — ЯЧЕЙКИ ВОРОНОГО, А НЕ СЕТКА. Первая версия резала оболочку
// правильной решёткой ряды×секторы, и владелец забраковал её ровно за это:
// «сетка слишком стерильная и равномерная, в жизни стекло так не трескается».
// В обоих его примерах (bobbyroe, akella) модель расколота ЗАРАНЕЕ в редакторе
// ячейками Вороного — мы того же добиваемся процедурно, потому что чаша у нас
// не модель, а поверхность вращения, и лишний GLB в однофайловую сборку не
// потащишь.
// Считаем в развёртке (u = длина дуги, v = высота): ячейка = домен, обрезанный
// полуплоскостями-биссектрисами до всех прочих центров (Сазерленд-Ходжмен).
// Шов по кругу закрыт копиями центров на ±2πR — иначе ячейки у стыка выходят
// прямоугольными и шов видно.
function clipHalf(poly, ax, ay, bx, by){
  // оставляем часть многоугольника, которая БЛИЖЕ к a, чем к b
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
  const R = (radiusAt(0) + radiusAt(FUNNEL.H)) / 2;   // средний радиус для развёртки
  const U = 2*Math.PI*R, V = FUNNEL.H;
  const seeds = [];
  // ПЛАСТИНЫ: немного и врозь — отбрасываем центр, если он ближе
  // BOWL_PLATE_MIN_D к уже поставленному. Крупный кусок получается там, где
  // рядом нет других центров, поэтому разрежённость и есть «пластина».
  const dist2 = (au, av, bu, bv) => {
    let du = Math.abs(au - bu); if (du > U/2) du = U - du;   // шов по кругу
    const dv = av - bv; return du*du + dv*dv;
  };
  const minD2 = (BOWL_PLATE_MIN_D*U)*(BOWL_PLATE_MIN_D*U);
  for (let попыток = 0, i = 0; i < BOWL_PLATE_N && попыток < BOWL_PLATE_N*60; попыток++){
    const u = Math.random()*U, v = Math.random()*V;
    let ок = true;
    for (const [su, sv] of seeds) if (dist2(u, v, su, sv) < minD2){ ок = false; break; }
    if (ок){ seeds.push([u, v]); i++; }
  }
  // ОБЛАКО КРОШКИ: плотность падает от точки удара. Радиус берём степенью
  // ⚠️ 0.35 — это НЕ «просто число»: при 1.0 крошка легла бы кольцом по краю
  // облака, а не сгустилась у центра, и «облако» читалось бы бубликом.
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
      // шов: соседом считается и копия центра через край развёртки
      for (const d of [-U, 0, U]){
        poly = clipHalf(poly, su, sv, qu + d, qv);
        if (poly.length < 6) break;
      }
    }
    if (poly.length >= 6){
      // площадь по шнуровке — она и есть «крупная пластина против крошки»
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
  for (const c of cells) vTotal += (c.poly.length/2) * 3;   // веер от центра ячейки
  const pos = new Float32Array(vTotal*3), col = new Float32Array(vTotal*3);
  const cen = new Float32Array(vTotal*3), axs = new Float32Array(vTotal*3);
  const vel = new Float32Array(vTotal*3), spn = new Float32Array(vTotal);
  const P = new THREE.Vector3(), NRM = new THREE.Vector3(), C = new THREE.Vector3();
  const A = new THREE.Vector3(), D = new THREE.Vector3();
  const toXYZ = (u, v, out) => {                            // развёртка -> поверхность вращения
    const th = u / R, y = Math.max(0, Math.min(FUNNEL.H, v)), r = radiusAt(y);
    out.set(Math.cos(th)*r, y, Math.sin(th)*r);
  };
  let o = 0;
  for (const c of cells){
    const n = c.poly.length/2;
    let cu = 0, cv = 0;
    for (let i = 0; i < n; i++){ cu += c.poly[i*2]; cv += c.poly[i*2+1]; }
    cu /= n; cv /= n;
    toXYZ(cu, cv, C);                                       // центр куска: вокруг него кувырок
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
        NRM.set(P.x, 0, P.z).normalize();                   // наружу по радиусу — на тинт хватает
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
      // ⚠️ ИМЯ aCen, А НЕ centroid: `centroid` — ЗАРЕЗЕРВИРОВАННОЕ СЛОВО GLSL
      // (квалификатор интерполяции). Шейдер с ним не собирается вовсе, а three
      // печатает это как «syntax error» в чужой строке префикса — искать долго.
      'attribute vec3 aCen; attribute vec3 axis; attribute vec3 vel; attribute float spin;',
      'varying vec3 vCol;',
      // поворот вокруг произвольной оси — тот же приём, что в референсе
      'vec3 rot(vec3 v, vec3 ax, float ang){',
      '  float s = sin(ang), c = cos(ang);',
      '  return v*c + cross(ax, v)*s + ax*dot(ax, v)*(1.0 - c); }',
      'void main(){',
      '  vCol = color;',
      // ⚠️ разброс НА КАЖДЫЙ ВЗРЫВ, а не на кусок: геометрия одна и печётся
      // единожды, без этого каждый разлёт был бы покадрово одинаковым
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
  _shatterMat.vertexColors = true;      // атрибут `color` в шейдере
  return _shatterMat;
}
function shatterBowlVis(){
  bowlBroken = true;
  if (bowlMesh) bowlMesh.visible = false;
  setBowlCracks(0);
  const mesh = new THREE.Mesh(buildShatterGeo(), shatterMat());
  mesh.frustumCulled = false;           // куски уезжают далеко за исходный bbox
  mesh.userData.sharedFx = true;        // геометрия и материал живут в кэше
  const mat = mesh.material, life = BOWL_FLY_MS/1000;
  mat.uniforms.uSeed.value = Math.random()*100;
  addFX(mesh, life, (o, k) => {
    o.material.uniforms.uT.value = k*life;
    o.material.uniforms.uOp.value = 0.5*(1 - k);
  });
}
// восстановление к новому уровню
function restoreBowlVis(){
  bowlBroken = false;
  // ⚠️ ПЕЧЁМ РАСКОЛОТУЮ ЧАШУ ЗАРАНЕЕ, НА СТАРТЕ УРОВНЯ. Выпечка стоит ~15 мс
  // (208 кусков), и на кадре взрыва это была бы запинка ровно в самый эффектный
  // момент. Здесь она невидима: уровень и так строится, а физика в фазе 'wait'
  // ещё не шагает. Кэш вечный — чаша неизменна.
  try { buildShatterGeo(); } catch(e){}
  if (bowlMesh) bowlMesh.visible = true;
  if (bowlMat && bowlBaseOpacity != null) bowlMat.opacity = bowlBaseOpacity;
  setBowlCracks(0);
}
