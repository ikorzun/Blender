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
// ⚠️⚠️ РАЗБОРКА ПО ВИДАМ ЭФФЕКТА (A2, 2026-08-01) — И ЭТО ТРЕТИЙ ЗАХОД НА ОДНИ
// И ТЕ ЖЕ ГРАБЛИ. Первая версия счётчика видела только пылевые облака; Графика
// поймала, что осколки дают в нём НОЛЬ. Теперь то же самое случилось СНОВА:
// с переносом набора владельца (схлопывание/распил/огонь/рикошет/колесо)
// приехало семь новых конструкторов, и НИ ОДИН из них в счётчик не попал —
// «постройка эффектов» опять мерила меньше, чем называла.
// ⛔ ПРАВИЛО ОТСЮДА: НОВЫЙ КОНСТРУКТОР ЭФФЕКТА ОБЯЗАН БЫТЬ ОБЁРНУТ. Счётчик,
// который молчит про новичка, хуже отсутствующего — он выглядит как измерение.
// Тотал считается по ВЕРХНЕМУ уровню (двойного счёта нет), а по видам копится
// СОБСТВЕННОЕ время: вложенные конструкторы (sparkRicochetFX -> wheelFX,
// sparkRicochetFX -> wheelFX, dissolveFX -> dustCloud×3) вычитаются из
// родителя. Иначе «искры 6 мс» прятали бы внутри себя цену колеса, и пул
// поехал бы лечить не ту статью.
let fxBuildMs = 0;
const fxBuildBy = {};         // вид -> { ms: собственное время, n: вызовов }
const _fxBStack = [];         // { kind, t0, child }
function fxBuildIn(kind){
  _fxBStack.push({ kind: kind || 'прочее', t0: performance.now(), child: 0 });
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
// обёртка конструктора: имя вида + сама функция. try/finally обязателен —
// исключение внутри эффекта не должно оставить стек перекошенным навсегда.
// ⚠️⚠️ РЕЕСТР МЕТОК ЛОВИТ КОЛЛИЗИЮ — ПОЙМАНО ГРАФИКОЙ НА ЖИВОМ ПРИМЕРЕ.
// Метка `'spark'` была занята ДВАЖДЫ (старый sparkFX и новый sparkRicochetFX),
// а `fxBuildBy` ключуется меткой — две разные функции складывались в ОДНУ
// строку отчёта, и число «искры 0.62» было суммой непонятно чего. Спасло
// только то, что старый эффект мёртв (вызовов ноль), то есть верным оно было
// СЛУЧАЙНО. Коллизия — это ровно «метрика правдоподобна, но меряет не то»,
// и полагаться на внимательность тут нельзя: реестр запоминает первый занятый
// вид, а страж в сьюте требует, чтобы дублей не было.
const fxKindOwner = {};
let fxKindDup = null;
function fxBuilt(kind, fn){
  const k = kind || 'прочее';
  if (fxKindOwner[k] && !fxKindDup) fxKindDup = k;
  fxKindOwner[k] = true;
  return function(){ fxBuildIn(k); try { return fn.apply(null, arguments); } finally { fxBuildOut(); } };
}
const fxBuildTake = () => { const v = fxBuildMs; fxBuildMs = 0; return v; };
// ⚠️ ВСЕ конструкторы эффектов — ОДНИМ СПИСКОМ, чтобы «а этот посчитан?» был
// вопросом на один взгляд, а не поиском по файлу. `_x_impl` — объявления
// функций, они хойстятся, поэтому список стоит здесь, а не в конце.
// Добавил эффект — добавь строку сюда, иначе он невидим для профиля.
// ⚠️ ПЕРВАЯ ВЕРСИЯ ЭТОГО СПИСКА СВОЁ ЖЕ ОБЕЩАНИЕ НЕ ДЕРЖАЛА (поймала ГРАФИКА):
// одиннадцать обёрток стояли здесь, а четыре — врассыпную по файлу. Всё было
// обёрнуто, но «на один взгляд» не работало, а правило держится ровно на этом.
// Список полный: число обёрток ниже обязано совпадать с числом функций
// `_имя_impl` в файле (сегодня их 14). Страж сверяет это сам.
// ⚠️ МЕТКИ ОБЯЗАНЫ БЫТЬ РАЗНЫМИ — их коллизию ловит реестр выше и страж сьюта.
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
const boltFX           = fxBuilt('bolt',     _boltFX_impl);
function fxBuildBreak(reset){
  const out = {};
  for (const k in fxBuildBy) out[k] = { ms: +fxBuildBy[k].ms.toFixed(2), n: fxBuildBy[k].n };
  if (reset) for (const k in fxBuildBy) delete fxBuildBy[k];
  return out;
}
function addFX(obj, life, tick){
  scene.add(obj); fx.push({ obj, life, age:0, tick });
}
function stepFX(dt){
  // ⚠️ ЗАМЕДЛЕНИЕ ЧАСОВ ЭФФЕКТОВ (`CFG.fxSlow`, боевое значение 1) — ОТЛАДОЧНАЯ
  // РУЧКА, и она несущая для показа владельцу: боевой эффект живёт 150-600 мс,
  // а headless-скриншот стоит около секунды — на кадре его нет ВООБЩЕ. Растянуть
  // жизнь константой нельзя: движение параметрическое от t=k·life, и при большей
  // жизни куски улетают в другую точку (искажается ровно то, что показываем).
  // Деление ЧАСОВ сохраняет траектории бит-в-бит: та же t — та же позиция.
  if (CFG.fxSlow > 1) dt /= CFG.fxSlow;
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
      // ⚠️ ДВА РАЗНЫХ ФЛАГА, И ЭТО НАМЕРЕННО. `keepGeo` — метка ПОЛОВИН РАСПИЛА,
      // по ней страж сьюта считает половины поимённо; вешать её на что-то ещё
      // значит тихо испортить чужой счётчик. `sharedFx` — «геометрия и материал
      // живут ДОЛЬШЕ эффекта» (кэш разлёта чаши: печём один раз, гоняем много).
      const общее = f.obj.userData && (f.obj.userData.keepGeo || f.obj.userData.sharedFx);
      if (f.obj.geometry && !общее) f.obj.geometry.dispose();
      // молнии отдают материал в free-list (boltMat) — в турбо их много, и
      // пересоздавать одинаковые MeshBasicMaterial на каждый разряд незачем;
      // ВСЕ остальные эффекты освобождают материал как раньше
      if (f.obj.material && !(f.obj.userData && f.obj.userData.sharedFx)){
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
function _popFX_impl(pos){
  const g = new THREE.SphereGeometry(0.2, 10, 8);
  const m = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos);
  addFX(mesh, 0.35, (o,k)=>{ o.scale.setScalar(1+k*6); o.material.opacity = 0.9*(1-k); });
}
function _markerFX_impl(pos, color){
  // мягкая пульсирующая сфера-призрак — указывает на скрытую пару
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
// Расщепление «В ТРУХУ»: плотное облако пыли цвета предмета, ТРИ фракции
// размеров (мелкая/средняя/крупная) и вершинный разброс оттенков.
// История итераций владельца: 70 крупных -> 320 мелких -> 640 разнообразных
// -> 1280 «размер вдвое меньше, количество вдвое больше» (спека 2026-07-22).
// Труха ОБЩАЯ для матча и помола (bladeDustFX) — меняется вся.
// radial=true — плоский разлёт кольцом (пыль из-под лопастей миксера).
const DUST_FRACTIONS = [
  // ⚠️ ЧИСЛО УМНОЖАЕТСЯ НА CFG.fxScale В МОМЕНТ ЭФФЕКТА (не здесь): на слабом
  // устройстве труха режется втрое, на обычном идёт полной.
  // ⚡ КРУПНЕЕ И ГУЩЕ (задача тестеров 2026-08-06, дословно «крупнее и гуще
  // частицы»). Спека владельца 2026-07-22 просила ОБРАТНОГО («вдвое мельче,
  // вдвое больше»), и это не противоречие: тогда труха была из 70 КОМЬЕВ и
  // читалась как обломки мебели, сейчас — из пыли, и пыль читается как дым.
  // Мельчить дальше некуда, поэтому растим и размер, и число, добавляя
  // четвёртую фракцию — КУСКИ. Она и несёт «крупнее»: 0.115 против прежнего
  // потолка 0.05.
  // ⚠️ ФРАКЦИЯ = ОДИН Points (одна геометрия, один материал, один draw call),
  // поэтому +1 строка тут стоит ОДНУ постройку, а не 90 объектов.
  { n: 640, size: 0.028 },  // мука
  { n: 520, size: 0.048 },  // крошка
  { n: 320, size: 0.075 },  // обломки
  { n: 90,  size: 0.115 },  // КУСКИ — новая фракция, ради «крупнее»
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
// ⛔ СТАРЫЕ juiceFX (сок) И sparkFX (искры) УДАЛЕНЫ 2026-08-01 — их заменили
// juiceBigFX и sparkRicochetFX по выбору владельца (крупные капли + капли на
// стекле экрана; искры с рикошетом от стенок + укатывающееся колесо).
// Вызовов у них не осталось ни одного — это был МОЙ мусор после переноса, и
// один из них ещё и держал метку 'spark', в которую писался живой рикошет:
// строка отчёта склеивалась из двух функций и была верна лишь потому, что
// старый эффект мёртв. Реестр меток (fxKindDup) теперь такое ловит прогоном.
// Вернуть при надобности: git show <до 2026-08-01>:src/app/70-fx.js.
// мультяшный pop (animal): звёздочки веером вверх, всегда лицом к камере
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
// brick/pirate при бурсте и предмет под ножами при помоле КОЛЮТСЯ на
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
// ⚠️⚠️ СВЕТ ОСКОЛКОВ — ПРОИЗВОДНАЯ ОТ MATCAP_LIGHT (10-stage), А НЕ КОПИЯ.
// Осколок несёт объём тинтом, ЗАПЕЧЁННЫМ по этому направлению, а сам предмет —
// matcap по MATCAP_LIGHT. Пока это были две константы, их держали равными
// РУКАМИ — и первая же правка владельца через панель (она правит только
// MATCAP_LIGHT) развела бы освещение надвое: куча по одному свету, её обломки
// по другому, причём в кадре взрыва они рядом.
// ⚠️ Пересчёт НА КАЖДЫЙ ОСКОЛОК, а не один раз при загрузке: тюнер крутит
// MATCAP_LIGHT НА ЖИВОЙ СЦЕНЕ, и снимок значения на старте отставал бы от
// ползунка. Цена — три умножения и корень на скол, на фоне генерации геометрии
// это ничто.
const SHARD_LIGHT = new THREE.Vector3();
function syncShardLight(){
  SHARD_LIGHT.set(MATCAP_LIGHT.x, MATCAP_LIGHT.y, MATCAP_LIGHT.z).normalize();
}
const _shA = new THREE.Vector3(), _shB = new THREE.Vector3(), _shC = new THREE.Vector3(), _shN = new THREE.Vector3();
// 4 угла правильного тетраэдра — тинтуем и джиттерим на месте
const SHARD_CORNERS = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
const SHARD_FACES = [[0,1,2],[0,3,1],[0,2,3],[1,3,2]]; // грани наружу (CCW снаружи)
function makeShardGeo(size){
  syncShardLight();            // свет берём из единственного источника (10-stage)
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
    m.userData.shard = true;   // метка для стража уникальности формы (__game.shardShapes)
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
// ⚡ УДАР В ТОЧКЕ СХЛОПЫВАНИЯ (задача тестеров 2026-08-06 «больше драйва при
// соединении объектов, больше эффектов»). ТРИ СЛОЯ поверх прежнего носителя:
//   (1) КОЛЬЦО ударной волны — билборд к камере, разлетается и гаснет;
//   (2) ВСПЫШКА-ядро — короткая, вдвое короче кольца: это удар, не свечение;
//   (3) СТРЕЛЫ — крупные искры радиально, размер 0.13 (класс «кусков», не пыли).
// ⚠️ ПОЧЕМУ ОБЩИЙ СЛОЙ, А НЕ УСИЛЕНИЕ ПАЧЕК: пачечные эффекты (сок/искры/
// звёзды/осколки) достаются только группам >= BURST_MIN_N, а «мало драйва»
// тестеры видят и на ПАРАХ — там до сих пор была одна труха. Удар даётся
// КАЖДОМУ соединению, а его размер растёт с группой.
// ⚠️ БИЛБОРД ЧЕРЕЗ camera.quaternion В ТИКЕ, а не единожды при постройке:
// игрок крутит камеру драгом, и кольцо, ориентированное на старте, показало бы
// ребро (та же грабля, из-за которой звёзды пачки — точки, а не меши).
// ⚠️ НЕ additive: на светлом дневном небе аддитивное свечение невидимо
// (правило пакета молний, 2026-07-21).
// ⚠️⚠️ БЕЗ ТЕСТА ГЛУБИНЫ (depthTest:false + renderOrder) — ИНАЧЕ УДАРА НЕ ВИДНО
// ВОВСЕ. Хлопок происходит в точке ТАПА, то есть ВНУТРИ плотной кучи, и кольцо
// радиусом до 2.5 целиком закрыто предметами перед ним. Поймано съёмкой
// с замедлением ×10: снимок `lastImpact` честно показывал построенное кольцо,
// а в кадре не было ничего. Пачечные эффекты этим не болеют — их частицы
// вылетают из кучи за десятки миллисекунд. Пробить глубину — не «читерство»,
// а суть удара: он должен читаться сквозь массу, как вспышка.
// 🔵 СЕМЕЙСТВО КОЛЬЦА ПО ХАРАКТЕРУ ПРЕДМЕТА (слово владельца 2026-08-06
// «попробуй для разных объектов разную ширину и форму кольца»).
// ⚠️⚠️ ДЕТЕРМИНИРОВАННО ОТ ТИПА, А НЕ СЛУЧАЙНО: один и тот же предмет обязан
// давать ОДНО И ТО ЖЕ кольцо — тогда это читается как СВОЙСТВО предмета.
// Случайная форма читалась бы как глитч (тот же принцип, что у fxColor).
// ⚠️ И НЕ ОТ ХЕША ИМЕНИ: форма взята из САМОГО предмета — из габаритов его
// геометрии и из пачки. Хеш дал бы разнообразие, но не смысл: у вытянутого
// банана оказалось бы круглое кольцо, а у кирпича — овал.
// Семейств ТРИ, больше не нужно (и владелец просил «попробуй», а не «все 120»).
// 🔥 ПАЛИТРА ОГНЯ — ОДНА НА ПЛАМЯ И НА ВСПЛЕСК. Числа взяты из шейдера
// fireSilhouetteFX: жёлтый / глубокий оранжевый / почти-белый подсвет. Держать
// вместе: всплеск обязан читаться как «тот же огонь рванул», а не как новый
// эффект (та же логика, что у SHARD_LIGHT — общий источник вместо копий).
const FIRE_HOT  = new THREE.Color(1.0, 0.85, 0.25);
const FIRE_DEEP = new THREE.Color(1.0, 0.28, 0.06);
const FIRE_CORE = new THREE.Color(1.0, 0.97, 0.80);
// РВАНОЕ кольцо для горящего матча: внешний радиус пляшет языками. Профиль
// ДЕТЕРМИНИРОВАННЫЙ (синусы от индекса, без Math.random) — иначе кольцо
// мерцало бы формой от матча к матчу, а это читается как глитч.
function makeTornRingGeo(inner, seg){
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++){
    const a = i / seg * Math.PI * 2;
    const язык = 1.0 + 0.20 * Math.sin(i * 2.7) + 0.12 * Math.sin(i * 5.3 + 1.1);
    pos.push(Math.cos(a) * inner, Math.sin(a) * inner, 0);
    pos.push(Math.cos(a) * язык,  Math.sin(a) * язык,  0);
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
const RING_FAM = new Map();      // имя типа -> {fam, w, seg, kx}
function ringFamFor(type, geo){
  const key = (type && type.name) || 'нет';
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
  const hard = tex === 'brick' || tex === 'pirate'; // ⛔ 'rock' снят с камнями (2026-08-17)
  let fam;
  if (elong >= IMPACT_ELONG_AT) fam = 'овал';      // вытянутые — овал по силуэту
  else if (hard) fam = 'многоугольник';            // те же пачки, что колются осколками
  else fam = 'круг';
  const v = fam === 'овал'
      ? { fam, w: IMPACT_W_OVAL, seg: 44, kx: IMPACT_OVAL_K, elong: +elong.toFixed(2) }
    : fam === 'многоугольник'
      ? { fam, w: IMPACT_W_POLY, seg: IMPACT_POLY_SEG, kx: 1, elong: +elong.toFixed(2) }
      : { fam, w: IMPACT_W_ROUND, seg: 48, kx: 1, elong: +elong.toFixed(2) };
  RING_FAM.set(key, v);
  return v;
}
// 🔥 ВСПЛЕСК ОГНЯ при совмещении ГОРЯЩЕГО вида (слово владельца 2026-08-06).
// Два носителя, оба — Points (цена живёт в объекте, не в частице):
//   ПЛЮМ — языки, всплывают С УСКОРЕНИЕМ ВВЕРХ и остывают из белого в глубокий
//          оранжевый (у трухи и стрел движение противоположное — падение);
//   УГЛИ — редкие яркие искры баллистикой, живут дольше плюма и гаснут в полёте.
// ⚠️ БЕЗ ТЕСТА ГЛУБИНЫ, как и удар: всплеск рождается в точке тапа, ВНУТРИ
// плотной кучи — с depthTest он был бы закрыт предметами целиком (мой урок
// 2026-08-06, стоил замера с замедлением ×10).
let lastFireBurst = null;   // ⚠️ НЕСУЩЕЕ: на этом страж «всплеск только у горящего»
function _fireBurstFX_impl(pos, n){
  const k = Math.min(1, Math.max(0, (n - 2) / Math.max(1, MATCH_MAX_N - 2)));
  const N = Math.max(24, Math.round(FIREB_PLUME_N * (0.75 + 0.5 * k) * CFG.fxScale));
  const M = Math.max(10, Math.round(FIREB_EMBER_N * (0.75 + 0.5 * k) * CFG.fxScale));
  // --- ПЛЮМ
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
      // ⚠️ ускорение ВВЕРХ: огонь всплывает. Плюс боковое качание — язык, а не столб
      arr[i*3]   = pos.x + vx[i] * tt + Math.sin(ph[i] + tt * 7) * 0.18 * tt;
      arr[i*3+1] = pos.y + vy[i] * tt + 0.5 * FIREB_PLUME_ACC * tt * tt;
      arr[i*3+2] = pos.z + vz[i] * tt + Math.cos(ph[i] + tt * 6) * 0.18 * tt;
      // остывание: белое ядро -> жёлтый -> глубокий оранжевый
      c.copy(FIRE_HOT).lerp(FIRE_DEEP, Math.min(1, t * 1.4));
      col[i*3] = col[i*3] * 0.72 + c.r * 0.28;
      col[i*3+1] = col[i*3+1] * 0.72 + c.g * 0.28;
      col[i*3+2] = col[i*3+2] * 0.72 + c.b * 0.28;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.geometry.attributes.color.needsUpdate = true;
    o.material.opacity = 1 - t * t;
    o.material.size = psize * (1 + 0.55 * t);   // язык раздувается, поднимаясь
  });
  // --- УГЛИ
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
  lastFireBurst = { n, k: +k.toFixed(3), плюм: N, угли: M,
                    over: pm.depthTest === false && em.depthTest === false,
                    ms: performance.now() };
}
let lastImpact = null;      // ⚠️ НЕСУЩЕЕ: на этом стоит страж «удар растёт с группой»
function _impactFX_impl(pos, n, tint, ghost, hot){
  const k = Math.min(1, Math.max(0, (n - 2) / Math.max(1, MATCH_MAX_N - 2)));
  const base = (tint || new THREE.Color(0xffffff)).clone();
  // ⚠️ ЦВЕТ УДАРА — НАСЫЩЕННЫЙ, А НЕ БЕЛЁСЫЙ. Первая версия уводила тон к белому
  // на 55%, и на светлой куче под светлым небом кольцо ПРОПАДАЛО вовсе (поймано
  // съёмкой ×10: диагностическое красное кольцо в кадре было, боевое — нет).
  // Тот же закон, что у молний: на светлом фоне читается НАСЫЩЕННОЕ, а не яркое.
  // 🔥 У ГОРЯЩЕГО МАТЧА КОЛЬЦО ОГНЕННОЕ И РВАНОЕ (слово владельца 2026-08-06):
  // тон берётся из палитры пламени, профиль — языками. Это ЧЕТВЁРТОЕ семейство,
  // но по СОСТОЯНИЮ, а не по типу: горит сегодня один предмет, завтра другой,
  // и кольцо обязано принадлежать СОБЫТИЮ. Детерминизм цел — профиль рваного
  // кольца считается синусами от индекса, без случайности.
  const hotCol = hot ? FIRE_HOT.clone().lerp(FIRE_CORE, 0.25)
                     : base.clone().offsetHSL(0, 0.35, 0.02).lerp(new THREE.Color(1, 1, 1), 0.12);
  // (1) КОЛЬЦО
  const R = IMPACT_R0 * (1 + IMPACT_R_K * k);
  // ⚠️ ШИРИНА И ФОРМА — ПО ХАРАКТЕРУ ПРЕДМЕТА (ringFamFor выше), прозрачность
  // общая IMPACT_ALPHA. Прежнее «кольцо обязано быть тонким» ОТМЕНЕНО словом
  // владельца: тонкое он увидел и попросил массы. Условие живо в другой форме —
  // масса добирается ШИРИНОЙ при СНИЖЕННОЙ плотности, а не белым.
  const fam = ringFamFor(ghost && ghost.type, ghost && ghost.geo);
  const ring = new THREE.Mesh(
    hot ? makeTornRingGeo(fam.w, FIREB_RING_SEG) : new THREE.RingGeometry(fam.w, 1.0, fam.seg),
    new THREE.MeshBasicMaterial({ color: hotCol, transparent: true, opacity: IMPACT_ALPHA,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  ring.renderOrder = IMPACT_ORDER;
  ring.position.copy(pos);
  addFX(ring, IMPACT_MS / 1000, (o, t) => {
    o.quaternion.copy(camera.quaternion);
    const e = 1 - (1 - t) * (1 - t);             // резкий старт, мягкий выход
    const sc = 0.22 + (R - 0.22) * e;
    o.scale.set(sc * (hot ? 1 : fam.kx), sc, sc); // kx>1 у овала; у рваного растяжки нет
    o.material.opacity = IMPACT_ALPHA * (1 - t * t);
  });
  // (2) ВСПЫШКА-ЯДРО
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
  // (3) СТРЕЛЫ
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
  // снимок ПОСЛЕДНЕГО удара для стража: размер группы, целевой радиус кольца,
  // число стрел. Читается сразу после матча — все три растут с n.
  // ⚠️ `over` — НЕ косметика отчёта: удар рождается внутри кучи, и без пробоя
  // глубины его не видно ВООБЩЕ (см. большой комментарий выше). Страж читает
  // именно этот флаг, потому что дефект был бесшумным.
  lastImpact = { n, k: +k.toFixed(3), ringR: +R.toFixed(3), arrows: N,
                 flash: +fm.size.toFixed(3),
                 fam: hot ? 'рваное' : fam.fam, w: +(1 - fam.w).toFixed(3),
                 seg: hot ? FIREB_RING_SEG : fam.seg, kx: hot ? 1 : fam.kx, hot: !!hot,
                 elong: fam.elong, alpha: IMPACT_ALPHA,
                 over: ring.material.depthTest === false && fm.depthTest === false };
}
// ⚠️ ДЛИТЕЛЬНОСТЬ — ПАРАМЕТР (по умолчанию COLLAPSE_MS): матч стягивает
// горстку за 150 мс, а разлёт чаши — ВСЮ кучу к центру, и на таком расстоянии
// 150 мс читаются как телепорт, а не как слёт.
// ⚠️⚠️ РЕЖИМ РЕАЛЬНЫХ ЧАСОВ (`real`) — НЕ УКРАШЕНИЕ, А ПОЧИНКА. Тик addFX идёт
// по ИГРОВОМУ времени, а удаление предметов после слёта — по setTimeout, то
// есть по РЕАЛЬНОМУ. На 150 мс матча разница незаметна, а на 620 мс сбора после
// разлёта часы расходятся: под нагрузкой куча НЕ УСПЕВАЕТ долететь до центра и
// исчезает на полпути. Поймано стражем в сьюте (радиус встал на 1.73 вместо 0,
// пять сэмплов вместо восемнадцати), в изоляции не воспроизводилось.
// Это тот же закон, по которому хлопок матча висит на часах removeItem.
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
function _juiceBigFX_impl(it){
  // МЕЛКИЕ БРЫЗГИ (правка владельца 2026-08-02): спрей в плоскости сцены —
  // много мелких точек коротким веером от точки схлопывания, гаснут быстро.
  // ⚠️ БОЛЬШЕ ЧИСЛОМ, МЕНЬШЕ РАЗМЕРОМ — и это НЕ откат к старому juiceFX:
  // тот сыпал 46 точек размером 0.40 столбом вверх. Здесь размер класса крошки
  // (0.075 против 0.0225-0.05 у трухи), разлёт ВЕЕРОМ и вдвое короче жизнь.
  // ⚠️ Перф-канон: тик частиц дёшев, дорога ПОСТРОЙКА — у сока она была
  // 0.62 мс, и рост числа точек её почти не двигает (одна геометрия, один
  // материал независимо от N).
  const N = Math.max(12, Math.round(JUICE_N * CFG.fxScale));
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    // веер: азимут равномерно, подъём НИЗКИЙ — брызги расходятся вширь
    const a = Math.random()*Math.PI*2;
    const e = Math.random()*Math.PI*0.42;            // до ~38° над горизонтом
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
// ⛔ КАПЛИ «НА СТЕКЛЕ ЭКРАНА» (screenDripsFX) УДАЛЕНЫ 2026-08-02 по слову
// владельца: «они не в плоскости блендера». Это был DOM-слой поверх канваса —
// капли жили в ЭКРАННЫХ координатах и не зависели от камеры, что и делало их
// чужеродными в игре, где всё происходит внутри чаши. Вместе с ними ушли
// контейнер #juiceDrips и оговорка про рецепт полос Safari (фон fixed-элемента).
// Вернуть = git show <до 2026-08-02>:src/app/70-fx.js.

// МАШИНЫ: искры ОТСКАКИВАЮТ от стенок чаши + отлетает колесо-деталька.
// Рикошет — то, чего не было: искры просто улетали, и глаз не считал их частью
// мира. Отскок привязывает эффект к чаше.
// ⚠️ ОТСКОК АНАЛИТИЧЕСКИЙ, по radiusAt(y) — никаких коллайдеров и тел:
// правило пакета «куски эффектов остаются анимацией» (00-config).
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
      // ⚠️ ширина по НАПРАВЛЕНИЮ (`wallDistAt`), а не своя формула: где стена —
      // отвечает ОДНА точка на всю игру (20-arena), иначе искры и спасатель
      // разъедутся между собой
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
// Колесо: отлетает, падает, ложится и УКАТЫВАЕТСЯ, теряя ход. Мелочь, которая
// превращает «искры» в «что-то отвалилось».
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
function _sawFX_impl(item){
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
// ГОРЯЩИЙ ПРЕДМЕТ: состояние механики. Держим ЗДЕСЬ, рядом с огнём, а не в
// геймплее — гореть умеет ровно этот модуль. Наружу отдаём только имя типа:
// на нём диспетчер вешает бонус за сбор группы (стык, зона его).
let burningItem = null, burnUntil = 0;
function burningItemRef(){ return (burningItem && burningItem.alive) ? burningItem : null; }
function burningName(){
  return (burningItem && burningItem.alive && burningItem.type) ? burningItem.type.name : null;
}
function igniteItem(it, ms){
  if (!it || !it.alive) return null;
  extinguishAll();                       // одновременно горит не больше одного
  fireSilhouetteFX(it);
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
  m.userData.keepGeo = true;         // геометрия ОБЩАЯ с предметом — не диспозить
  m.renderOrder = 9;
  item.mesh.add(m);                  // едет вместе с предметом
  const st = { item, obj: m, mat, t0: performance.now(), dying: 0 };
  fires.push(st);
  return () => { if (!st.dying) st.dying = performance.now(); };
}
function tickFires(){
  const now = performance.now();
  // догорел по времени ИЛИ предмет уже собрали/перемололи — гасим и отпускаем
  if (burningItem && (!burningItem.alive || now > burnUntil)){
    burningItem = null; burnUntil = 0;
    extinguishAll();
  }
  if (!fires.length) return;
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
// ⚠️ ГАСИТ И СОСТОЯНИЕ, А НЕ ТОЛЬКО ПЛАМЯ. Первая версия трогала только fires,
// а burningItem оставляла жить — и планировщик вспышек, который проверяет
// «уже горит?», больше НИКОГДА не поджигал новый предмет. Наружу это выглядело
// как «огонь работает» (первая вспышка была), и страж «спецпредметы не горят»
// честно печатал пять срабатываний, читая ОДНО И ТО ЖЕ имя пять раз.
// Поймано замером разнообразия: 14 вспышек — 1 тип при 129 доступных.
function extinguishAll(){
  for (const f of fires) if (!f.dying) f.dying = performance.now();
  burningItem = null; burnUntil = 0;
}

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
function _boltFX_impl(a, b){
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
  // ⚠️⚠️ ПАРАМЕТР `color` СНОВА РАБОТАЕТ (слово владельца 2026-08-17: «сделай у
  // очков при совмещении разные яркие обводки, а не только чёрную»). ⛔ ЭТО
  // ОТМЕНЯЕТ спеку 2026-07-19 «попы всегда белые с ЧЁРНОЙ обводкой»: заливка
  // осталась белой, чёрной осталась только ДЕФОЛТНАЯ обводка в CSS.
  // ⚠️ Проводка не заводилась заново — цвета уже передавались КАЖДЫМ вызовом и
  // уже подобраны по смыслу события (комбо оранжевый, огонь алый, штраф
  // красный); всё это время они просто не доезжали до пикселей.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'otext');
  // ⚠️ ХОЛСТ УДВОЕН ВМЕСТЕ С КЕГЛЕМ (слово владельца 2026-08-17 «×2»): при
  // прежних 260×40 текст в 38-56px обрезался бы рамкой SVG сверху и по бокам.
  // Центрирование не трогаем — див позиционируется translate(-50%,-50%).
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
// ЦВЕТ ОБВОДКИ ПОПА ИЗ САМОГО ПРЕДМЕТА (слово владельца «разные яркие»).
// ⚠️⚠️ ДЕТЕРМИНИРОВАННО ОТ ТИПА, А НЕ СЛУЧАЙНО — правило канона: один предмет
// обязан давать ОДНУ обводку, тогда это читается его СВОЙСТВОМ; случайный цвет
// читается глитчем (на этом уже обжигались с семейством кольца удара).
// Берём `fxColor` — тот же цвет, которым сыплется труха этого типа.
// ⚠️⚠️ СЕМЬ ЦВЕТОВ, СЛУЧАЙНО, БЕЗ ЖЁЛТОГО (слово владельца 2026-08-17-в:
// «жёлтый не нужно использовать, используй яркие, но хорошо контрастные с
// белым цвета. Используй РАНДОМНО, без какой либо системы, думаю 7 цветов
// точно хватит, как радуга»).
// ⛔⛔ ЭТО ОТМЕНЯЕТ ДВЕ МОИ ПРЕЖНИЕ РЕДАКЦИИ И ОДНО МОЁ ПРАВИЛО.
//   (1) «затемнять цвет предмета до порога» — давало мутные полутона;
//   (2) «выбирать сектор ПО ОТТЕНКУ предмета» — детерминированная привязка;
//   (3) правило канона «цвет обязан выводиться из предмета, случайный читается
//       глитчем» — оно выведено МНОЙ для семейств кольца удара и остаётся
//       верным ДЛЯ НИХ; здесь владелец прямо просит случайность. Не «чинить».
// ⚠️ ЖЁЛТОГО СЕКТОРА НЕТ СОВСЕМ, И ЭТО НЕ ПРОПУСК: при весах яркости
// 0.2126/0.7152/0.0722 жёлтый не бывает одновременно ярким и контрастным к
// белому — его предел это тёмно-оливковый, который владелец и забраковал.
// ПАЛИТРА ПОСЧИТАНА: в каждом секторе самый СВЕТЛЫЙ насыщенный тон с
// контрастом к белому >= 4.5:1 (AA). Разброс по палитре 4.50..5.30:1.
const POP_OTL_PALETTE = ['#eb0000', '#c75300', '#168500', '#008573',
                         '#056dff', '#8833ff', '#e00096'];
// ⚠️ ПОДРЯД ОДИН И ТОТ ЖЕ НЕ ВЫПАДАЕТ: чистый Math.random даёт повторы, и два
// одинаковых попа подряд читаются как «цвет что-то значит» — ровно та ложная
// система, которой владелец просил избежать.
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
  try { bowlStreakReset(); } catch(e){} // стрик чаши: промах = ошибка (слово владельца)
  // ⚠️⚠️ ШТРАФ РАДИУСА (спека владельца 2026-08-11) — ВНЕ гейта `comboUntil`
  // выше: он обязан срабатывать на КАЖДОМ промахе, а не только в горящей
  // серии. Место выбрано рядом со стриком чаши намеренно — это единственная
  // строка функции, которая уже стоит «на каждый промах».
  try { noteMissRadius(); } catch(e){}
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
    transparent:true, opacity:0, depthWrite:false, alphaTest:0.02 })));  // juiceBigFX/sparkRicochetFX/starPopFX
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors:true,
    transparent:true, opacity:0, depthWrite:false })));                  // shardFX
  // ⚠️⚠️ КОЛЬЦО УДАРА И ЕГО ВСПЫШКА — ДОБАВЛЕНЫ ПО РЕВИЗИИ 2026-08-14. Их
  // якорей здесь НЕ БЫЛО, а `impactFX` создаёт материалы с ключом программы,
  // которого нет ни у одного соседа: `depthTest:false` + `side:DoubleSide`
  // (кольцо) и Points с картой + `depthTest:false` (вспышка). Ключ уникален,
  // значит после дренажа fx первая же СБОРКА ПАРЫ компилировала шейдер прямо
  // в кадре — а удар даётся КАЖДОМУ совмещению, то есть джанк ловил игрок на
  // самом частом действии в игре. Ровно та болезнь, ради которой якоря заведены.
  g.add(new THREE.Mesh(tiny, new THREE.MeshBasicMaterial({ transparent:true, opacity:0,
    depthWrite:false, depthTest:false, side: THREE.DoubleSide })));       // impactFX: кольцо
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.add(new THREE.Points(ig, new THREE.PointsMaterial({ size:0.001, map: fxDotTex(),
    transparent:true, opacity:0, depthWrite:false, depthTest:false, alphaTest:0.02 }))); // impactFX: вспышка
  // ⚠️ ЛЕДЯНАЯ КОРКА — свой ShaderMaterial (`iceCrustMat`, 40-items), то есть
  // ключ программы у неё уникален по построению. Без якоря первая глыба уровня
  // компилировала шейдер В КАДРЕ старта уровня (найдено ревизией 2026-08-14).
  // ⚠️ Материал якоря — ТОТ ЖЕ вызов, что в бою: копия рядом с рабочей разошлась
  // бы при первой правке шейдера, и якорь молча перестал бы прогревать нужное.
  try { const im = iceCrustMat(); im.uniforms.uGlowK.value = 0; im.opacity = 0;
        g.add(new THREE.Mesh(tiny, im)); } catch (e) {}
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.001, 0)]);
  const ln = new THREE.Line(lg, new THREE.LineDashedMaterial({ transparent:true, opacity:0, dashSize:0.3, gapSize:0.15 })); // lineFX
  ln.computeLineDistances();
  g.add(ln);
  g.position.set(0, 0, -0.5); // всегда в кадре перед камерой, глазу невидим
  camera.add(g);
  scene.add(camera); // дети камеры рендерятся, только когда камера в графе сцены
})();
