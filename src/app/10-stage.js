// ===== 10-stage: рендерер, камера, свет, IBL-окружение, небо =====
// Эталон владельца: threejs.org webgl_batch_lod_bvh (RoomEnvironment + ACES 0.8)
// + webgl_loader_ldraw (RoomEnvironment как единственный источник «студийного» света).

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
// ⚠️ ПОТЕРЯ КОНТЕКСТА = «КРЕШ» БЕЗ ОШИБКИ (docs/METRICS.md §6): на мобильных
// система отбирает GPU-контекст (фон, память, перегрев) — игра не падает, но
// экран ЧЕРНЕЕТ, и в статистике это выглядело бы обычным уходом игрока.
// Ловим отдельным событием, иначе самый частый 3D-сбой невидим.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                       // без этого контекст не восстановят
  try { Telemetry.err('webgl', 'context lost', '', ''); } catch(_){}
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  try { Telemetry.ev('webgl_restored', {}); } catch(_){}
}, false);
// на телефонах DPR-кап 1.5: кадр на DPR2 в ~1.8 раза дороже (замер аудита),
// HUD — DOM и остаётся резким; на десктопе оставляем 2
const DPR_CAP_TOUCH = 1.5, DPR_CAP_DESK = 2;
function dprCap(){
  if (CFG.perfTier === 'low') return PERF_LOW_DPR;
  return matchMedia('(pointer:coarse)').matches ? DPR_CAP_TOUCH : DPR_CAP_DESK;
}
renderer.setPixelRatio(Math.min(devicePixelRatio||1, dprCap()));
// ⚠️ ПЕРЕХОД НА «СЛАБЫЙ» — ОДНОЙ ФУНКЦИЕЙ И ТОЛЬКО ВНИЗ (см. 00-config).
// Что уменьшаем и почему именно это:
//  • ПЛОТНОСТЬ ПИКСЕЛЕЙ 1.5 -> 1.0. Самый большой выигрыш на телефоне и самый
//    честный: заливка растёт КВАДРАТОМ плотности, 1.5 против 1.0 — это 2.25×
//    пикселей на тот же экран. Геймплей не меняется вовсе, только чёткость.
//  • ЧАСТИЦ ВТРОЕ МЕНЬШЕ (CFG.fxScale). Труха матча — 1280 штук, это самый
//    тяжёлый разовый всплеск в игре.
// ⚠️ ТЕНИ В СПИСКЕ НЕ ЗНАЧАТСЯ НАМЕРЕННО: замер показал, что в matcap-режиме
// теневой проход УЖЕ выключен (renderer.shadowMap.enabled=false и на «сильном»
// устройстве). Выключать выключённое — ручка-пустышка, а такие однажды уже
// пришлось выкидывать из проекта.
// ⚠️ ФИЗИКУ НЕ ТРОГАЕМ. Число итераций солвера и подшагов держит плотную кучу
// от проваливания друг в друга; ослабив их, мы поменяли бы ПОВЕДЕНИЕ кучи, то
// есть геймплей — на слабом телефоне игра стала бы другой игрой. Это отдельное
// решение владельца, а не тихая оптимизация.
function applyPerfTier(tier){
  if (tier !== 'low' || CFG.perfTier === 'low') return false;
  CFG.perfTier = 'low';
  CFG.fxScale = PERF_LOW_FX;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, dprCap()));
  try { renderer.setSize(innerWidth, innerHeight, false); } catch(e){}
  try { Telemetry.ev('perf_low', { dpr: renderer.getPixelRatio() }); } catch(e){}
  return true;
}
// ⚠️ ПОДСКАЗКА УСТРОЙСТВА — ТОЛЬКО КАК СТАРТОВАЯ ГИПОТЕЗА, решает всё равно
// замер. Два ядра или 2 ГБ памяти — это заведомо слабая машина, и ждать
// доказательств 3 секунды, роняя кадры, незачем. Оба поля есть не везде
// (deviceMemory нет в Safari) — отсутствие трактуем как «не знаем», не как «слабый».
function deviceLooksWeak(){
  try {
    const cores = navigator.hardwareConcurrency || 0;
    const mem = navigator.deviceMemory || 0;
    return (cores > 0 && cores <= 2) || (mem > 0 && mem <= 2);
  } catch(e){ return false; }
}
if (deviceLooksWeak()) applyPerfTier('low');
renderer.setClearColor(0xffffff);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8; // как в референсе webgl_batch_lod_bvh
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// карта теней перерисовывается ТОЛЬКО когда что-то движется (гейт в loop):
// свет статичен, в штиле ~150 теневых draw calls каждый кадр — впустую
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
const scene = new THREE.Scene();
// туман к «сверхбелому» (цвет >1 компенсирует ACES-затемнение) — края земли тают в белом
scene.fog = new THREE.Fog(new THREE.Color(1.5, 1.52, 1.55), 24, 44);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
const camTarget = new THREE.Vector3(0, 4.2, 0);
let camAz = 0.0, camPhi = 0.45, camR = 16.2; // чаша ×1.15 — камера дальше
function updateCamera(){
  camera.position.set(
    camTarget.x + camR*Math.sin(camPhi)*Math.sin(camAz),
    camTarget.y + camR*Math.cos(camPhi),
    camTarget.z + camR*Math.sin(camPhi)*Math.cos(camAz)
  );
  camera.lookAt(camTarget);
}

// Освещение: почти всё делает IBL-окружение (RoomEnvironment), направленный
// свет слабый и нужен только ради теней и рельефа на чёрном поле
const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(6,14,4);
dl.castShadow = true;
dl.shadow.mapSize.set(1024,1024);
dl.shadow.camera.left = -8; dl.shadow.camera.right = 8;
dl.shadow.camera.top = 13; dl.shadow.camera.bottom = -8;
dl.shadow.camera.near = 2; dl.shadow.camera.far = 38;
dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.03;
scene.add(dl);

// Окружение v4 — «СОФТБОКС» (цикл материалов по жалобе владельца: свет
// скакал при повороте камеры). Причина скачков: зеркальные материалы
// отражали RoomEnvironment — тёмную комнату с ЯРКИМИ прямоугольными
// «окнами»; отражение скользит по граням и то вспыхивает, то гаснет.
// Софтбокс — сфера с ПЛАВНЫМ вертикальным градиентом без резких пятен:
// блики стабильны под любым углом. RoomEnvironment НЕ возвращать.
(function buildEnvironment(){
  const env = new THREE.Scene();
  const geo = new THREE.IcosahedronGeometry(30, 4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++){
    const ny = pos.getY(i) / 30; // -1..1
    // низ — средне-серый, горизонт — светлый, зенит — яркий (мягкий верхний свет)
    let b;
    if (ny < 0) b = 0.55 + 0.45*(1 + ny);   // -1 -> 0.55, 0 -> 1.0
    else b = 1.0 + 1.6*ny*ny;               // 0 -> 1.0, 1 -> 2.6
    colors[i*3] = b; colors[i*3+1] = b; colors[i*3+2] = b*1.02; // едва холодный
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  env.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  geo.dispose(); mat.dispose(); // софтбокс запечён в PMREM — исходники GPU больше не нужны
})();

// ===== MATCAP — «запечённый свет» (прототип A/B, спека владельца 2026-07-20) =====
// Нормаль во ВЬЮ-пространстве -> пиксель текстуры: свет и финиш материала
// запечены заранее. Блик физически НЕ МОЖЕТ скакать при повороте камеры
// (историческая жалоба владельца) — скакать больше нечему.
// RGB — диффуз: шейдер УМНОЖАЕТ его на material.color, поэтому candyColor и
// серая вуаль недоступности продолжают работать без единой правки.
// ALPHA — белый блик, добавляется ПОВЕРХ (см. matcapSpecPatch): чисто
// мультипликативный matcap красит блик в цвет предмета, и пластик матовеет.
// ⚠️ DataTexture, а НЕ CanvasTexture: канвас премножает RGB на альфу, и
// диффуз погас бы везде, кроме пятна блика.
// ⚠️ КАЛИБРОВКА (итерация 2 по скринам): текстура помечена sRGBEncoding, и
// середина шкалы уходит в linear ВДВОЕ темнее (0.5 sRGB ≈ 0.21 linear) —
// первый подбор (amb 0.34) дал тёмную тяжёлую кучу, а широкий блик (shin 20,
// spec 0.60) сидел на шарах белой кляксой. Тело держим в 0.66-0.94 sRGB,
// блик — узкий и слабый (искра, не пятно).
const MATCAP_PRESETS = {
  // мягкий глянец — характер v4-материалов (metalness 0, roughness 0.18)
  soft:  { amb: 0.66, sky: 0.28, diff: 0.20, shin: 60, spec: 0.22, rim: 0.14, rimP: 3 },
  // металл для кубов: ниже тело, шире блик, сильный ободок. Цвет предмета в
  // matcap-ветке ОСВЕТЛЁН (40-items): у MeshStandard кубы держались отражением
  // окружения (metalness 1), а множитель тёмного графита ушёл бы в чёрный.
  metal: { amb: 0.44, sky: 0.34, diff: 0.30, shin: 34, spec: 0.50, rim: 0.42, rimP: 3 },
  // ⚠️ ДЛЯ МОДЕЛЕЙ С РОДНОЙ ТЕКСТУРОЙ — почти белое тело. Шейдер МНОЖИТ
  // matcap на текстуру, поэтому обычный пресет (тело 0.66-0.94) сажал
  // авторские цвета: рядом с эталонным GLTFLoader тигр выходил тёмно-рыжим
  // вместо палевого, свинья — малиновой вместо бледно-розовой. Здесь matcap
  // отвечает только за мягкую подсветку формы, цвет полностью за атласом.
  // ⚠️ БЫЛ аддитивный lift 0.20 — ЗАБРАКОВАН владельцем («всё сильно
  // светлое»). Он прибавлял белое КО ВСЕМУ, включая тёмные места: чёрные
  // полосы тигра и мех панды становились серыми, контраст умирал. Яркость
  // текстурных моделей теперь поднимается УМНОЖЕНИЕМ (TEX_GAIN) — оно
  // сохраняет отношение тёмного к светлому. Аддитив не возвращать.
  tex:   { amb: 0.88, sky: 0.08, diff: 0.10, shin: 60, spec: 0.12, rim: 0.10, rimP: 3 },
};
const matcapCache = new Map();
// ключевой свет сверху-слева-спереди; взгляд по +Z, полувектор для Блинна.
// ОБЪЕКТ, а не три const: тюнер (matcapTuner) правит его на лету, и свет
// ОБЩИЙ для всех пресетов — смена направления пересматривает их все.
const MATCAP_LIGHT = { x: -0.36, y: 0.60, z: 0.72 };
const MATCAP_SIZE = 128;
// Съёмка пикселей пресета в готовый буфер. Вынесена из makeMatcap, чтобы
// тюнер мог переснять пресет В ТУ ЖЕ DataTexture: материалы держат ссылку на
// текстуру, менять её объект нельзя — только содержимое + needsUpdate.
function bakeMatcap(P, data){
  const S = MATCAP_SIZE;
  const Lx = MATCAP_LIGHT.x, Ly = MATCAP_LIGHT.y, Lz = MATCAP_LIGHT.z;
  const hl = Math.hypot(Lx, Ly, Lz + 1);
  const Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl;
  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      let nx = (x + 0.5) / S * 2 - 1;
      // ⚠️ Ревью 2026-07-21 сочло знак ny спорным (возможна V-инверсия против
      // конвенции matcap). НЕ «исправлять» мимоходом: все пресеты ОТКАЛИБРОВАНЫ
      // владельцем под текущий знак (свет сверху выглядит правильно) — менять
      // только вместе с пересъёмкой пресетов и A/B-скринами.
      let ny = 1 - (y + 0.5) / S * 2;          // v текстуры растёт вниз
      const r2 = nx * nx + ny * ny;
      // за кругом держим значение кромки — фильтрация не затягивает чёрное
      if (r2 > 1){ const k = 1 / Math.sqrt(r2); nx *= k; ny *= k; }
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
      // окружение = наш же софтбокс: снизу глуше, к зениту ярче
      const amb = P.amb + P.sky * (ny * 0.5 + 0.5);
      const lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      // френель-ободок: силуэт светлее — предметы не слипаются в плотной куче
      const rim = P.rim * Math.pow(1 - nz, P.rimP);
      const v = Math.min(1, amb + P.diff * lam + rim);
      const sp = Math.min(1, Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), P.shin) * P.spec);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = (v * 255) | 0;
      data[i + 3] = (sp * 255) | 0;
    }
  }
}
function makeMatcap(kind){
  if (matcapCache.has(kind)) return matcapCache.get(kind);
  const S = MATCAP_SIZE, data = new Uint8Array(S * S * 4);
  bakeMatcap(MATCAP_PRESETS[kind] || MATCAP_PRESETS.soft, data);
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = tex.minFilter = THREE.LinearFilter; // мипы не нужны — текстура экранного размера
  tex.needsUpdate = true;
  matcapCache.set(kind, tex);
  return tex;
}
// Пересъёмка уже выданных текстур (тюнер). kind не задан — все сразу: свет
// общий, его сдвиг меняет каждый пресет. Материалы трогать НЕ НАДО — они
// ссылаются на тот же объект текстуры, needsUpdate заливает новые пиксели
// в GPU. (material.needsUpdate — это перекомпиляция шейдера, здесь лишняя.)
function retuneMatcap(kind){
  matcapCache.forEach((tex, k) => {
    if (kind && k !== kind) return;
    bakeMatcap(MATCAP_PRESETS[k] || MATCAP_PRESETS.soft, tex.image.data);
    tex.needsUpdate = true;
  });
}
// ── ДЕБАГ-ТЮНЕР ПРЕСЕТОВ (запрос владельца 2026-07-22: «хочу ползунками
// настроить значения визуально»). Открывается ТОЛЬКО из консоли —
// __game.matcapTuner(); повторный вызов закрывает. В код и сейв не пишет
// ничего: значения владелец забирает кнопкой Copy и присылает нам.
// ⚠️ Тюнер меняет ТОЛЬКО числа пресетов и направление света в рамках текущей
// конвенции. Знак ny (см. предупреждение в bakeMatcap) он не трогает.
const MATCAP_TUNE = [                    // имя, min, max, шаг (0 = лог-шкала)
  ['amb',  0,   1,    0.01],
  ['sky',  0,   0.8,  0.01],
  ['diff', 0,   1,    0.01],
  ['shin', 2,   256,  0],
  ['spec', 0,   1.5,  0.01],
  ['rim',  0,   1,    0.01],
  ['rimP', 1,   8,    0.1],
];
const MATCAP_KINDS = ['soft', 'metal', 'tex'];
let matcapPanel = null;
function matcapTuner(){
  if (matcapPanel){ matcapPanel.remove(); matcapPanel = null; return 'matcap tuner: closed'; }
  const p = matcapPanel = document.createElement('div');
  p.id = 'matcapTuner';
  // z 21 — ВЫШЕ оверлеев (20): дебаг-панель не должна становиться недоступной,
  // если поверх открылась пауза. Ниже fatal (99).
  p.style.cssText = 'position:fixed; right:10px; top:10px; z-index:21; width:274px;'
    + ' max-height:calc(100vh - 20px); overflow:auto; pointer-events:auto;'
    + ' background:rgba(15,20,30,.96); color:#dfe6f2; border-radius:10px; padding:10px 12px;'
    + ' font:12px/1.35 ui-monospace,Menlo,monospace; box-shadow:0 6px 24px rgba(0,0,0,.45);';
  // 90-input слушает keydown НА ОКНЕ (Space = встряска): без этого стрелки и
  // пробел на сфокусированном ползунке улетали бы в игру.
  p.addEventListener('keydown', e => e.stopPropagation());

  // пересъёмка гейтована кадром: перетаскивание ползунка даёт десятки
  // input-событий, а нам хватает одной съёмки на кадр (3 пресета ≈ 1-2 мс)
  const pending = new Set(); let raf = 0;
  const queue = kind => {
    pending.add(kind);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pending.has(null)) retuneMatcap(null);
      else pending.forEach(k => retuneMatcap(k));
      pending.clear();
    });
  };
  const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(2);
  const head = (t, sub) => {
    const h = document.createElement('div');
    h.style.cssText = 'margin:9px 0 3px; color:#7fd1ff; letter-spacing:.04em;';
    h.textContent = t + (sub ? '  ' + sub : '');
    p.appendChild(h);
  };
  const row = (label, o) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:grid; grid-template-columns:36px 1fr 40px; gap:6px; align-items:center; margin:2px 0;';
    const lab = document.createElement('span'); lab.textContent = label; lab.style.opacity = '.7';
    const inp = document.createElement('input');
    inp.dataset.mc = o.id;               // адрес ползунка для сьюта
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step;
    inp.value = o.get(); inp.style.cssText = 'width:100%; accent-color:#7fd1ff;';
    const out = document.createElement('span'); out.style.textAlign = 'right';
    const show = () => { out.textContent = fmt(o.txt()); };
    show();
    inp.addEventListener('input', () => { o.set(parseFloat(inp.value)); show(); });
    r.append(lab, inp, out); p.appendChild(r);
  };

  const title = document.createElement('div');
  title.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  title.innerHTML = '<b>matcap tuner</b>';
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'background:none; border:0; color:#dfe6f2; font-size:18px; cursor:pointer; line-height:1;';
  close.onclick = () => matcapTuner();
  title.appendChild(close); p.appendChild(title);

  head('light', '(общий для всех пресетов)');
  ['x', 'y', 'z'].forEach(ax => row('L' + ax, {
    id: 'light.' + ax, min: -1, max: 1, step: 0.01,
    get: () => MATCAP_LIGHT[ax], txt: () => MATCAP_LIGHT[ax],
    set: v => { MATCAP_LIGHT[ax] = Math.round(v * 100) / 100; queue(null); },
  }));

  // ВУАЛЬ НЕДОСТУПНЫХ (Hard). Ползунки нужны именно живыми: «насколько гасить»
  // — вопрос вкуса, а на статичном скрине его не решить. Галка показывает
  // вуаль НА ВСЕЙ куче, иначе эффекта почти не видно: недоступные — это ровно
  // те, кто НЕ видит небо, то есть они закрыты верхним слоем от самой камеры.
  head('veil', '(недоступные в Hard)');
  row('light', { id: 'veil.light', min: 0, max: 1, step: 0.01,
    get: () => uVeilTune.value.x, txt: () => uVeilTune.value.x,
    set: v => { uVeilTune.value.x = Math.round(v * 100) / 100; } });
  row('lift', { id: 'veil.lift', min: 0, max: 1, step: 0.01,
    get: () => uVeilTune.value.y, txt: () => uVeilTune.value.y,
    set: v => { uVeilTune.value.y = Math.round(v * 100) / 100; } });
  const prev = document.createElement('label');
  prev.style.cssText = 'display:flex; gap:6px; align-items:center; margin:2px 0 0; opacity:.75; cursor:pointer;';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.mc = 'veil.preview';
  cb.onchange = () => veilAllItems(cb.checked ? 1 : null);
  prev.append(cb, document.createTextNode('показать на всех'));
  p.appendChild(prev);

  for (const kind of MATCAP_KINDS){
    const tex = matcapCache.get(kind);
    let used = 0;
    if (tex) scene.traverse(o => { if (o.material && o.material.matcap === tex) used++; });
    // счётчик честно говорит, что ползунок сдвинет: 'metal' сейчас без
    // потребителей (хром-примитивы удалены из пула) — иначе владелец будет
    // двигать его и думать, что инструмент сломан
    head(kind, used ? '— ' + used + ' объектов' : '— НЕ используется сейчас');
    const P = MATCAP_PRESETS[kind];
    for (const [name, min, max, step] of MATCAP_TUNE){
      if (step) row(name, {
        id: kind + '.' + name, min, max, step,
        get: () => P[name], txt: () => P[name],
        set: v => { P[name] = Math.round(v * 100) / 100; queue(kind); },
      });
      // shin — показатель Блинна: на линейной шкале вся полезная часть
      // (2..60) сидит в первой четверти ползунка, дальше визуально ничего
      // не меняется. Поэтому ползунок ходит по логарифму.
      else row(name, {
        id: kind + '.' + name, min: Math.log(min), max: Math.log(max), step: 0.001,
        get: () => Math.log(P[name]), txt: () => P[name],
        set: v => { P[name] = Math.round(Math.exp(v)); queue(kind); },
      });
    }
  }

  const foot = document.createElement('div');
  foot.style.cssText = 'margin-top:10px; display:flex; gap:8px; align-items:center;';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText = 'background:#2b6ea8; border:0; color:#fff; padding:5px 12px; border-radius:6px; cursor:pointer; font:inherit;';
  const note = document.createElement('span'); note.style.opacity = '.65';
  note.textContent = 'reload = откат';
  copy.onclick = () => {
    const s = '{\n  "light": ' + JSON.stringify(MATCAP_LIGHT)
      + ',\n  "veil": { "light": ' + uVeilTune.value.x + ', "lift": ' + uVeilTune.value.y + ' }'
      + ',\n  "presets": {\n'
      + MATCAP_KINDS.map(k => '    "' + k + '": ' + JSON.stringify(MATCAP_PRESETS[k])).join(',\n')
      + '\n  }\n}';
    console.log('[matcap]\n' + s);
    const done = t => { note.textContent = t; };
    // clipboard может быть недоступен (file://, отказ в правах) — консоль есть всегда
    if (navigator.clipboard) navigator.clipboard.writeText(s).then(() => done('скопировано'), () => done('только в консоли'));
    else done('только в консоли');
  };
  foot.append(copy, note); p.appendChild(foot);
  document.body.appendChild(p);
  return 'matcap tuner: открыт (повторный вызов закроет)';
}
// ⚠️ У MeshMatcapMaterial НЕТ emissive, а подсветка подсказки (hintPulse) и
// «прицела» (scopePulse) в 80-gameplay пишут mat.emissive/emissiveIntensity
// напрямую — без этих заглушек кнопка Hint падала с TypeError на setHex.
// (test.js подсказку НЕ ПОКРЫВАЕТ — поймано отдельной пробой; если будете
// править эту ветку, проверяйте Hint руками.)
// Считать ничего не надо: как только у материала появляется .emissive, three
// сам пишет emissive × emissiveIntensity в юниформу `emissive`
// (refreshUniformsCommon). Наша задача — ЗАВЕСТИ эту юниформу в matcap-шейдере,
// иначе three падает на undefined.value в первом же кадре (так и было).
function addMatcapEmissive(mat){
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 0;
}
// Блик из альфы + emissive — поверх умножения. Функция ОДНА на все материалы,
// поэтому кэш программ (по onBeforeCompile.toString()) даёт ОДИН
// скомпилированный шейдер на все 181, а не 181.
const matcapSpecPatch = function (sh) {
  sh.uniforms.emissive = { value: new THREE.Color(0x000000) };
  // ЯРКОСТЬ и КОНТРАСТ — ручки владельца, живут в 00-config. Юниформа своя
  // на материал (three хранит uniforms per-material), но ИСХОДНИК шейдера
  // одинаков, поэтому программа по-прежнему компилируется ОДНА на все.
  // Обычные предметы получают (1,1) — это тождественное преобразование.
  const tune = this.userData && this.userData.texTune;
  sh.uniforms.uTune = { value: new THREE.Vector2(
    tune ? TEX_GAIN : 1.0, tune ? TEX_CONTRAST : 1.0) };
  // ВУАЛЬ НЕДОСТУПНОСТИ — своя юниформа на материал, её крутит tickVeil.
  // ⚠️ Ссылку на шейдер кладём в userData: onBeforeCompile зовётся ОДИН раз,
  // а вуаль меняется каждый кадр — иначе до юниформы не дотянуться.
  sh.uniforms.uVeil = { value: 0 };
  this.userData.shader = sh;
  // ГЛУБИНА КУЧИ вместо теней (шаг 2 пакета). Тени выключены — matcap их не
  // принимает, — а объём чем-то показывать надо. Мировая высота здесь честнее
  // экранной тени: она совпадает с геймплейным «насколько предмет закопан»,
  // то есть работает на игру, а не только на картинку. Две инструкции в
  // шейдере, ноль работы в JS за кадр.
  // Константы вшиваются ЛИТЕРАЛАМИ, а не юниформами: исходник получается
  // одинаковый для всех материалов -> кэш программ по onBeforeCompile.toString()
  // по-прежнему даёт ОДИН скомпилированный шейдер на все 181.
  const n = (x) => x.toFixed(3);
  sh.uniforms.uPileTop = uPileTop;   // ОДИН объект на все материалы
  sh.uniforms.uDepth = uDepthTint;
  sh.uniforms.uVeilTune = uVeilTune;
  sh.uniforms.uVeilCol = uVeilCol;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
    .replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>',
      '#include <common>\nuniform vec3 emissive;\nuniform float uPileTop;\nuniform vec2 uTune;\nuniform vec2 uDepth;\nuniform float uVeil;\nuniform vec2 uVeilTune;\nuniform vec3 uVeilCol;\nvarying float vWorldY;')
    .replace(
      'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',
      'float dk = clamp( ( vWorldY - uPileTop + uDepth.y ) / uDepth.y, 0.0, 1.0 );\n'
      + '\tdk = uDepth.x + ( 1.0 - uDepth.x ) * dk;\n'
      // ⚠️ Глубиной гасится ТОЛЬКО диффуз. Блик и подсветку подсказки не
      // трогаем: иначе низ кучи превращается в чёрную кашу, где не разобрать
      // ни силуэтов, ни того, что подсвечено.
      + '\tvec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb * dk'
        + ' + vec3( matcapColor.a ) + emissive;\n'
      // яркость — УМНОЖЕНИЕМ (контраст цел), затем контраст вокруг середины
      + '\toutgoingLight *= uTune.x;\n'
      + '\toutgoingLight = ( outgoingLight - ' + n(TEX_PIVOT) + ' ) * uTune.y + ' + n(TEX_PIVOT) + ';\n'
      // вуаль — САМОЙ ПОСЛЕДНЕЙ, по уже готовому цвету: обесцвечиваем в
      // яркость и поднимаем к светло-серому. Тремя инструкциями и без
      // ветвления — при uVeil=0 это тождество, доступные ничего не платят.
      + '\tfloat vLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );\n'
      // ⚠️ БЫЛО: обесцвечивание в СЕРЫЙ и подъём к серому же. Стало: обесцвеченная
      // яркость КРАСИТСЯ в uVeilCol и поднимается к светлому тону того же цвета.
      // Форма выражения та же — при uVeil=0 это по-прежнему тождество, доступные
      // предметы не платят ничего.
      // ⚠️ КОММЕНТАРИЙ ОБЯЗАН СТОЯТЬ НАД «+», А НЕ ПОСЛЕ НЕГО: `X + // …` даёт
      // `X + (+'строка')`, унарный плюс на строке — это NaN, и в шейдер вместо
      // кода уезжает «NaN». Предметы тогда просто перестают рисоваться, а
      // консоль молчит — я на этом потерял два прогона.
      + '\toutgoingLight = mix( outgoingLight, mix( vec3( vLum ) * uVeilCol, uVeilCol * uVeilTune.x, uVeilTune.y ), uVeil );'
    );
  // страж якорной строки: replace по несуществующему якорю МОЛЧА ничего не
  // делает (смена версии three) — глубина/блик/подсказка отвалились бы тихо
  if (sh.fragmentShader.indexOf('uPileTop') < 0)
    console.warn('matcap-патч НЕ применился: строка-якорь three изменилась (10-stage matcapSpecPatch)');
};
// Верх кучи для тонировки. ОДИН общий объект-юниформа: обновили .value —
// обновились все 181 материал разом, без обхода сцены.
const uPileTop = { value: FUNNEL.H };
// Глубина: x — во сколько раз темнеет дно, y — на сколько ниже верха кучи
// достигается этот минимум. ОДИН объект на все материалы, поэтому крутится
// на лету (и в игре, и в сравнительных прогонах) без пересборки.
const uDepthTint = { value: new THREE.Vector2(DEPTH_TINT_MIN, DEPTH_TINT_RANGE) };
// Сила вуали — ОДИН общий объект на все материалы (как uPileTop/uDepth):
// исходник шейдера от этого не меняется, программа по-прежнему компилируется
// одна на все 183. x = целевой светло-серый, y = доля подъёма к нему.
const uVeilTune = { value: new THREE.Vector2(VEIL_LIGHT, VEIL_LIFT) };
// ⚠️ ЦВЕТ ВУАЛИ — В ЛИНЕЙНОМ ПРОСТРАНСТВЕ: патч правит outgoingLight ДО
// тонмаппинга, поэтому сырой sRGB здесь дал бы пересветлённый тон.
const uVeilCol = { value: new THREE.Color(VEIL_TINT).convertSRGBToLinear() };
// Тик глубины: верх кучи ползёт вниз по мере разбора, поэтому ведём его
// ПЛАВНО (лерп) — скачок высоты перекрашивал бы всю кучу разом.
// Вызывается из loop в 99-main (WORKSTREAMS разрешает добавлять свой тик).
function tickDepthTint(dt){
  if (!CFG.matcap || !items) return;
  let top = 0;
  // ⚠️ ТОЛЬКО ПО КУЧЕ НИЖЕ КРОМКИ — летящие сверху НЕ СЧИТАЮТСЯ.
  // Баг владельца 2026-07-21: «в турбо меняется освещение, модели темнеют».
  // В турбо (лихорадке) chainRefill досыпает предметы с высоты ~13, и максимум
  // по ВСЕМ живым скачком уезжал туда же — вся осевшая масса проваливалась
  // ниже диапазона тонировки и гасла до DEPTH_TINT_MIN разом. То же самое
  // било и в интро, где сверху падает весь столб.
  // Тот же гвард стоит в chainRefill по той же причине (душил темп досыпки).
  // ⚠️ НЕ МАКСИМУМ, А ПЕРЦЕНТИЛЬ. Максимум — величина хрупкая: один предмет,
  // подскочивший выше прочих (досыпка в турбо, встряска, свежеупавший), уводил
  // ОПОРУ вверх, и вся куча разом гасла до DEPTH_TINT_MIN. 85-й перцентиль
  // на пару-тройку выскочивших не реагирует, а рост кучи по-настоящему ловит.
  const tops = [];
  for (const it of items){
    if (it.alive && !it.surprise && it.p.y < FUNNEL.H) tops.push(it.p.y + it.r);
  }
  if (!tops.length) return;
  tops.sort((a, b) => a - b);
  top = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.85))];
  // ЛЕРП МЕДЛЕННЫЙ (~1.2 с, было 0.25): короткая вспышка досыпки не должна
  // успевать перекрасить кучу — за уровень опора всё равно доедет куда надо.
  const k = Math.min(1, dt * 0.8);
  uPileTop.value += (top - uPileTop.value) * k;
}
// matcap-предметы тени НЕ ПРИНИМАЮТ (материал неосвещаемый) — значит теневой
// пасс рисовал бы карту, которую некому показать. Замер: пасс УДВАИВАЕТ
// draw calls (136 -> 265 на ур.1), поэтому в этом режиме он выключен.
if (CFG.matcap) renderer.shadowMap.enabled = false;

// ВРЕМЯ СУТОК — единая точка для неба и лихорадки.
// ⚠️ ГРАНИЦЫ ПО СПЕКЕ ВЛАДЕЛЬЦА 2026-07-31: «день до 20:00, ночь с 20:00».
// Утреннюю границу он не трогал — итог ДЕНЬ 5–20, НОЧЬ 20–5. Число вынесено
// в SKY_NIGHT_FROM (00-config): его ОБЯЗАН читать и isNightSky в 85-hud, иначе
// с 20 до 5 небо и тема кнопок разъедутся.
// ⚠️ ФОРС-ХУК `?hour=N` (запрос ИНТЕРФЕЙСА через диспетчера): без него ТРИ
// темовые фичи (тема витрины, инверсия Shake, правило цвета кнопок) в сьюте
// непроверяемы — их приходилось тестировать подменой Date. Хук читает
// location.search ДО первого кадра, потому что и небо, и рампа считаются РАЗ
// при загрузке. Мусор и значения вне 0..23 игнорируются молча — это отладочная
// ручка, падать из-за неё игра не должна.
function skyHourNow(){
  let h = 12; try { h = new Date().getHours(); } catch(e){}
  try {
    const q = new URLSearchParams(location.search).get('hour');
    if (q !== null && q !== ''){ const f = Number(q); if (Number.isFinite(f) && f >= 0 && f <= 23) h = Math.floor(f); }
  } catch(e){}
  return h;
}
function skyTimeNow(){
  const h = skyHourNow();
  return (h >= SKY_DAY_FROM && h < SKY_NIGHT_FROM) ? 'day' : 'night'; // утро отменено владельцем 2026-07-29
}
// Небо БЕЗ КАРТИНКИ: многостопная палитра текущего времени суток (SKY_STOPS).
// Считается РАЗ при загрузке — как раньше выбор панорамы.
const skyStops = SKY_STOPS[skyTimeNow()];
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
// '#rrggbb' -> [0..1, 0..1, 0..1] СЫРОГО sRGB. Никакого convertSRGBToLinear:
// шейдер неба минует конвертацию рендерера (см. 00-config у SKY_STOPS).
const hexRGB = s => { const n = parseInt(s.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const skyRGB = skyStops.map(hexRGB);
// ⚠️ ИСТОЧНИК ТОНА ХРОМА: tintChrome (99-main) красит html/body и
// meta[theme-color] ВЕРХНИМ цветом градиента (первый стоп = зенит).
const skyChromeCSS = skyStops[0];
// ⚠️ ТОТ ЖЕ ГРАДИЕНТ — В CSS (спека владельца 2026-07-28: «заливка этого блока —
// градиенты времени суток»). Один источник с небом: карточка Play и фон игры
// разъехаться не могут ПО ПОСТРОЕНИЮ. Считается раз при загрузке, как и небо —
// время суток в пределах сессии не меняется, а тик updateHUD ставил бы одну и
// ту же строку впустую. Строка выходит ДОСЛОВНО такой, какую дал владелец.
const skyGradCSS = 'linear-gradient(180deg,' + skyStops.join(',') + ')';
// ⚠️ ЦВЕТА ВЕРХНЕЙ И НИЖНЕЙ КРОМКИ — ОТДЕЛЬНЫМИ ПЕРЕМЕННЫМИ (рецепт Safari 26,
// см. CLAUDE.md «хром iOS»): Safari 26 ИГНОРИРУЕТ theme-color и берёт тинт своих
// баров из background-color самих html/body, а fixed-элемент с ПРОЗРАЧНЫМ фоном
// отравляет тинт — прозрачный читается как «прозрачный ЧЁРНЫЙ». Наши #topBar и
// #bottomBar ровно такие, отсюда чёрные поля сверху и снизу на iPhone.
// Лечение по рецепту: дать каждому бару фон цвета СВОЕЙ кромки с альфой 0.01 —
// невидимо глазу, но тинт берётся правильный. Верх и низ разные, потому что
// небо градиентное.
const rgbTriple = a => a.map(c => Math.round(c*255)).join(',');
try {
  const d = document.documentElement.style;
  d.setProperty('--sky-grad', skyGradCSS);
  d.setProperty('--sky-top-rgb', rgbTriple(skyRGB[0]));
  d.setProperty('--sky-bot-rgb', rgbTriple(skyRGB[skyRGB.length - 1]));
} catch(e){}

// Небо. ShaderMaterial минует
// тонмаппинг и sRGB-конвертацию рендерера, поэтому цвета задаются КАК ЕСТЬ
// (без convertSRGBToLinear) — #ffffff даёт настоящий белый на экране.
// Цвет ЛИХОРАДКИ комбо по времени суток (спека владельца 2026-07-21-г): голубой
// в тёмное время (ночь 20..5 — та же граница, что у градиента неба), зелёный днём.
// Считается РАЗ при загрузке — согласованно с панорамой (обе от new Date()).
function feverColorNow(){
  // час НЕ пересчитываем — берём ту же точку, что выбирает градиент неба
  return v3(skyTimeNow() === 'night' ? FEVER_NIGHT : FEVER_DAY);
}
// ГРАДИЕНТ ВЕЗДЕ (спека владельца 2026-07-30: «убери в десктопе на фоне
// картинку, сделай так же как в мобиле: всегда градиент по времени суток»).
// ⛔ ОТМЕНЯЕТ решение 2026-07-22 «панорама на десктопе, градиент на мобиле»:
// флаг SKY_PANORAMA (критерий pointer:coarse), функция skyPanorama и ветка
// равнопромежуточной развёртки в шейдере УДАЛЕНЫ, вместе с ними — модуль
// 05-sky (три base64-JPEG 1536×768). Одна база на все устройства.
// РАМПА ГРАДИЕНТА — 1D-текстура из стопов владельца (спека 2026-07-31).
// ⚠️ ПОЧЕМУ ТЕКСТУРА, А НЕ ЮНИФОРМЫ: стопов 12 (ночь) и 7 (день), и владелец
// правит их список — юниформами это пришлось бы объявлять под фиксированное
// число и пересобирать шейдер при каждой правке. Рампа читает массив любой
// длины и не трогает шейдер вовсе.
// ⚠️ ШИРИНА 256 (степень двойки), а НЕ «по числу стопов»: NPOT-текстуры в
// WebGL1 легальны только с CLAMP_TO_EDGE без мипов, и на этом уже обжигались
// в вебе не раз — правило 9 велит брать обкатанное. 1 КБ памяти, интерполяцию
// между стопами печём САМИ (см. ниже), чтобы не зависеть от фильтра железа.
// ⚠️ Интерполяция в СЫРОМ sRGB — ровно то, что делает CSS linear-gradient:
// иначе экранный градиент карточки Play и небо разъедутся по середине.
// ⚠️ encoding = LinearEncoding НАМЕРЕННО (наследие панорамы): шейдер неба
// минует конвертацию рендерера, байты идут на экран как есть.
const SKY_RAMP_W = 256;
function buildSkyRamp(rgb){
  const px = new Uint8Array(SKY_RAMP_W * 4), last = rgb.length - 1;
  for (let i = 0; i < SKY_RAMP_W; i++){
    const t = last * i / (SKY_RAMP_W - 1);     // позиция в стопах: 0..last
    const k = Math.min(last - 1, Math.floor(t)), f = last ? t - k : 0;
    const a = rgb[last ? k : 0], b = rgb[last ? k + 1 : 0];
    for (let c = 0; c < 3; c++) px[i*4 + c] = Math.round((a[c] + (b[c] - a[c]) * f) * 255);
    px[i*4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(px, SKY_RAMP_W, 1, THREE.RGBAFormat);
  tex.encoding = THREE.LinearEncoding;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
let skyMat = null; // экранные слои: uCombo красит НИЗ, uGrind — ВЕРХ (оба из 99-main)
(function buildSky(){
  // Лихорадка, лесенка помола и затемнение верха идут ПОВЕРХ базы.
  const baseUni =
      { uRamp: { value: buildSkyRamp(skyRGB) },
        uSkyMap: { value: SKY_MAP === 'view' ? 0 : 1 },
        uStars: { value: skyTimeNow() === 'night' ? 1 : 0 } };
  const baseDecl =
      ['uniform sampler2D uRamp; uniform float uStars; uniform float uSkyMap;',
       'float hs(vec3 v){ return fract(sin(dot(v, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }'];
  const baseCol = [
      '  vec3 d = normalize(vDir);',
      // ДВА СПОСОБА РАЗЛОЖИТЬ СТОПЫ — переключатель SKY_MAP (00-config).
      // (1) ПО ВЗГЛЯДУ: зенит (d.y=+1) — первый стоп, надир (d.y=−1) —
      //     последний, горизонт ровно в середине. Небо ведёт себя как сфера.
      // (2) ПО ЭКРАНУ: как CSS `linear-gradient(180deg,…)` владельца — верх
      //     кадра первый стоп, низ последний. Экранная координата тут уже
      //     используется соседними слоями (лихорадка uCombo, угроза uGrind),
      //     так что приём в этом шейдере не новый.
      // ⚠️ ЗАМЕР, ИЗ-ЗА КОТОРОГО ПОЯВИЛСЯ ПЕРЕКЛЮЧАТЕЛЬ: камера смотрит СВЕРХУ
      // В ЧАШУ, поэтому по взгляду на экран попадает лишь ХВОСТ рампы —
      // позиции 70.6%..100% (день) и 70.5%..97.8% (ночь). Первые ~70% стопов
      // владельца не видно НИКОГДА. По экрану видно все 100%.
      // ⚠️ И ВТОРОЕ, НЕ КОСМЕТИЧЕСКОЕ: --sky-top-rgb/--sky-bot-rgb (тинт полос
      // Safari) равны первому/последнему стопу. По взгляду они РАСХОДЯТСЯ
      // с реальной кромкой кадра (замер: переменная 110,134,255 против пикселя
      // 132,227,248) — полоса на айфоне получила бы чужой цвет. По экрану
      // совпадение точное ПО ПОСТРОЕНИЮ.
      '  float tView = clamp((1.0 - d.y) * 0.5, 0.0, 1.0);',
      '  float tScreen = clamp(1.0 - gl_FragCoord.y / uResY, 0.0, 1.0);',
      '  float t = mix(tView, tScreen, uSkyMap);',
      // полтекселя внутрь: край рампы иначе размывается фильтром о ClampToEdge
      '  float u = t * ' + ((SKY_RAMP_W - 1) / SKY_RAMP_W).toFixed(8) +
        ' + ' + (0.5 / SKY_RAMP_W).toFixed(8) + ';',
      '  vec3 col = texture2D(uRamp, vec2(u, 0.5)).rgb;',
      // ЗВЁЗДЫ (только ночью): у ночной ПАНОРАМЫ они были, чистый градиент их
      // терял — тон совпадал, а небо становилось пустым. Сетка ТРЁХМЕРНАЯ по
      // направлению: на сфере равномерна, полюсов нет. Звезда = случайное
      // НАПРАВЛЕНИЕ в ячейке, точка по УГЛУ до взгляда => всегда круглая.
      // ⚠️ Три неудачных подхода (не повторять): (1) сетка по равнопромежуточным
      // UV — у надира ШТРИХИ, сверху КВАДРАТЫ; (2) 3D-расстояние до центра
      // ячейки — центры лежат вне тонкой сферы, звёзд почти нет; (3) отсечка
      // ниже горизонта убрала ИМЕННО видимое небо: камера смотрит сверху вниз.
      '  if (uStars > 0.0){',
      '    vec3 ip = floor(d * 60.0);',
      '    vec3 sdir = normalize(ip + vec3(hs(ip + 1.7), hs(ip + 3.3), hs(ip + 5.9)));',
      '    float ang = 1.0 - dot(d, sdir);',
      '    col += uStars * step(0.9915, hs(ip)) * smoothstep(8.0e-6, 0.0, ang) * 0.6;',
      '  }',
    ];
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: Object.assign({
      uCombo: { value: 0 }, // 0 — обычное небо, 0.3..0.8 — комбо, 1 — цепная реакция
      uGrind: { value: 0 }, // 0 — покой, 1 — работают лопасти (помол)
      uResY:  { value: 1 },  // высота канваса в device px (для экранного градиента)
      uFeverCol: { value: feverColorNow() }, // голубой ночью / зелёный днём
      uGrindCol: { value: new THREE.Vector3(GRIND_COLOR[0], GRIND_COLOR[1], GRIND_COLOR[2]) },
    }, baseUni),
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform float uCombo; uniform float uGrind; uniform float uResY;',
      'uniform vec3 uFeverCol; uniform vec3 uGrindCol;',
    ].concat(baseDecl, ['void main(){'], baseCol, [
      '  float sy = gl_FragCoord.y / uResY;', // 0 — низ экрана, 1 — верх
      // ЛИХОРАДКА КОМБО: мягкое свечение у нижней кромки (голубое ночью /
      // зелёное днём), гаснет кверху и ограничено потолком FEVER_MAX.
      '  float fever = uCombo * (1.0 - smoothstep(0.0, ' + FEVER_SPAN.toFixed(3) + ', sy)) * ' + FEVER_MAX.toFixed(3) + ';',
      '  col = mix(col, uFeverCol, fever);',
      // ПОМОЛ: зеркальный красный у ВЕРХНЕЙ кромки (координата 1−sy). uGrind —
      // лесенка угрозы: растёт за 10 с до помола, максимум при работе лопастей
      // (драйв в 99-main).
      '  float grind = uGrind * (1.0 - smoothstep(0.0, ' + GRIND_SPAN.toFixed(3) + ', 1.0 - sy)) * ' + GRIND_MAX.toFixed(3) + ';',
      '  col = mix(col, uGrindCol, grind);',
      // ⚠️ СТАТИЧНОГО затемнения верхней полосы НЕТ — УБРАНО приказом
      // владельца 2026-07-22 («градиент сверху/снизу только при турбо или
      // злости миксера»); действует для ОБЕИХ баз гибрида (панорама и
      // градиент). НЕ возвращать ради контраста HUD: владелец знает, что
      // белые глаза на светлом дневном небе дают ~1.6:1 (замер графики).
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ]).join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyM);
  scene.add(sky);
  skyMat = skyM;
})();
