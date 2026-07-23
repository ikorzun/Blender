// ===== 10-stage: рендерер, камера, свет, IBL-окружение, небо =====
// Эталон владельца: threejs.org webgl_batch_lod_bvh (RoomEnvironment + ACES 0.8)
// + webgl_loader_ldraw (RoomEnvironment как единственный источник «студийного» света).

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
// на телефонах DPR-кап 1.5: кадр на DPR2 в ~1.8 раза дороже (замер аудита),
// HUD — DOM и остаётся резким; на десктопе оставляем 2
renderer.setPixelRatio(Math.min(devicePixelRatio||1, matchMedia('(pointer:coarse)').matches ? 1.5 : 2));
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
function makeMatcap(kind){
  if (matcapCache.has(kind)) return matcapCache.get(kind);
  const P = MATCAP_PRESETS[kind] || MATCAP_PRESETS.soft;
  const S = 128, data = new Uint8Array(S * S * 4);
  // ключевой свет сверху-слева-спереди; взгляд по +Z, полувектор для Блинна
  const Lx = -0.36, Ly = 0.60, Lz = 0.72;
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
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = tex.minFilter = THREE.LinearFilter; // мипы не нужны — текстура экранного размера
  tex.needsUpdate = true;
  matcapCache.set(kind, tex);
  return tex;
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
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
    .replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>',
      '#include <common>\nuniform vec3 emissive;\nuniform float uPileTop;\nuniform vec2 uTune;\nuniform vec2 uDepth;\nvarying float vWorldY;')
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
      + '\toutgoingLight = ( outgoingLight - ' + n(TEX_PIVOT) + ' ) * uTune.y + ' + n(TEX_PIVOT) + ';'
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

// ПАНОРАМА НЕБА (спека владельца 2026-07-21: «используй дневное небо, может
// стоит ориентироваться на время на компьютере игрока»). Отменяет прежний
// инвариант «поле БЕЛОЕ» — он держался до появления скайбоксов в ассетах.
// ⚠️ encoding = LinearEncoding НАМЕРЕННО: шейдер неба минует конвертацию
// рендерера, поэтому сырые sRGB-байты панорамы идут на экран как есть —
// ровно так же, как раньше сюда клали сырые sRGB-цвета градиента.
// ⚠️ Мипы выключены: сфера неба огромная, панорама всегда УВЕЛИЧЕНА, а мипы
// сожрали бы 33% лишней памяти на текстуру, которая ими не пользуется.
// ВРЕМЯ СУТОК — единая точка (границы те же, что были у панорам в 05-sky).
// Дублирование часа в 85-hud (isNightSky, тема кнопки Shake) оставлено
// сознательно и отмечено там же.
function skyTimeNow(){
  let h = 12; try { h = new Date().getHours(); } catch(e){}
  return (h >= 5 && h < 11) ? 'morning' : (h >= 11 && h < 18) ? 'day' : 'night';
}
// Небо БЕЗ КАРТИНКИ (спека владельца 2026-07-22): три опорных цвета текущего
// времени суток. Считается РАЗ при загрузке — как раньше выбор панорамы.
const skyGrad = SKY_GRAD[skyTimeNow()];
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
// ⚠️ ИСТОЧНИК ТОНА ХРОМА: tintChrome (99-main) красит html/body и
// meta[theme-color] ВЕРХНИМ цветом градиента. Раньше он сэмплил полосу
// картинки — картинки больше нет, читает это значение напрямую.
const skyChromeCSS = 'rgb(' + skyGrad.top.map(c => Math.round(c*255)).join(',') + ')';

// Небо. ShaderMaterial минует
// тонмаппинг и sRGB-конвертацию рендерера, поэтому цвета задаются КАК ЕСТЬ
// (без convertSRGBToLinear) — #ffffff даёт настоящий белый на экране.
// Цвет ЛИХОРАДКИ комбо по времени суток (спека владельца 2026-07-21-г): голубой
// в тёмное время (ночь 18..5 — та же граница, что у градиента неба), зелёный днём.
// Считается РАЗ при загрузке — согласованно с панорамой (обе от new Date()).
function feverColorNow(){
  // час НЕ пересчитываем — берём ту же точку, что выбирает градиент неба
  return v3(skyTimeNow() === 'night' ? FEVER_NIGHT : FEVER_DAY);
}
let skyMat = null; // экранные градиенты: uCombo красит НИЗ (голубой/зелёный по времени), uGrind — ВЕРХ красным (оба из 99-main)
(function buildSky(){
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uCombo: { value: 0 }, // 0 — обычное небо, 0.3..0.8 — комбо, 1 — цепная реакция
      uGrind: { value: 0 }, // 0 — покой, 1 — работают лопасти (помол)
      uResY:  { value: 1 },  // высота канваса в device px (для экранного градиента)
      uSkyTop: { value: v3(skyGrad.top) }, // зенит
      uSkyHor: { value: v3(skyGrad.hor) }, // горизонт
      uSkyBot: { value: v3(skyGrad.bot) }, // надир
      uStars:  { value: skyTimeNow() === 'night' ? 1 : 0 }, // звёзды только ночью
      uFeverCol: { value: feverColorNow() }, // голубой ночью / зелёный днём
      uGrindCol: { value: new THREE.Vector3(GRIND_COLOR[0], GRIND_COLOR[1], GRIND_COLOR[2]) },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform float uCombo; uniform float uGrind; uniform float uResY;',
      'uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSkyBot; uniform float uStars;',
      'uniform vec3 uFeverCol; uniform vec3 uGrindCol;',
      'float hs(vec3 v){ return fract(sin(dot(v, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }',
      'void main(){',
      // БАЗА — ГРАДИЕНТ, не панорама (спека владельца 2026-07-22). Два отрезка
      // от горизонта: вверх к зениту, вниз к надиру, ЛИНЕЙНО по высоте взгляда.
      // Линейно, а не smoothstep: профиль прежних панорам почти линеен, и
      // smoothstep выдал бы у горизонта видимую полосу.
      '  vec3 d = normalize(vDir);',
      '  float e = clamp(d.y, -1.0, 1.0);', // 1 зенит, 0 горизонт, −1 надир
      '  vec3 col = e >= 0.0 ? mix(uSkyHor, uSkyTop, e) : mix(uSkyHor, uSkyBot, -e);',
      // ЗВЁЗДЫ — только ночью (uStars). У ночной ПАНОРАМЫ они были, и чистый
      // градиент их терял: тон совпадал, а небо становилось «пустым».
      // Процедурно и без картинки: хеш по ячейке равнопромежуточной сетки —
      // точки НЕПОДВИЖНЫ относительно мира и не плывут при повороте камеры.
      // ⚠️ Сетка ТРЁХМЕРНАЯ по направлению, НЕ по равнопромежуточным UV:
      // на UV ячейки вырождаются у полюсов — под чашей звёзды растягивало
      // в штрихи, а сверху ячейка крупнее пикселя давала КВАДРАТЫ.
      // Точка рисуется по расстоянию до центра ячейки — круглая и мелкая.
      // ЗВЁЗДЫ: сетка ТРЁХМЕРНАЯ по направлению — на сфере она равномерна,
      // полюсов у неё нет вовсе. Звезда = случайное НАПРАВЛЕНИЕ внутри ячейки,
      // точка рисуется по УГЛУ между ним и взглядом => всегда круглая.
      // ⚠️ История трёх неудач (не повторять): (1) сетка по равнопромежуточным
      // UV давала у надира ШТРИХИ, а сверху КВАДРАТЫ; (2) 3D-расстояние до
      // центра ячейки почти всегда мимо — центры лежат вне тонкой сферы;
      // (3) отсечка звёзд ниже горизонта убрала ИМЕННО ВИДИМОЕ небо: камера
      // смотрит сверху вниз, и за чашей мы видим НИЖНЮЮ часть сферы.
      '  if (uStars > 0.0){',
      '    vec3 ip = floor(d * 60.0);',
      '    vec3 sdir = normalize(ip + vec3(hs(ip + 1.7), hs(ip + 3.3), hs(ip + 5.9)));',
      '    float ang = 1.0 - dot(d, sdir);',
      '    col += uStars * step(0.9915, hs(ip)) * smoothstep(8.0e-6, 0.0, ang) * 0.6;',
      '  }',
      '  float sy = gl_FragCoord.y / uResY;', // 0 — низ экрана, 1 — верх
      // ЛИХОРАДКА КОМБО: мягкое свечение у нижней кромки (голубое ночью /
      // зелёное днём — uFeverCol), гаснущее кверху и ограниченное потолком
      // FEVER_MAX — панорама НЕ выбеливается (спека владельца 2026-07-21-в).
      '  float fever = uCombo * (1.0 - smoothstep(0.0, ' + FEVER_SPAN.toFixed(3) + ', sy)) * ' + FEVER_MAX.toFixed(3) + ';',
      '  col = mix(col, uFeverCol, fever);',
      // ПОМОЛ: зеркальный красный у ВЕРХНЕЙ кромки (координата 1−sy). uGrind —
      // лесенка угрозы: растёт за 10 с до помола, максимум при работе лопастей
      // (драйв в 99-main).
      '  float grind = uGrind * (1.0 - smoothstep(0.0, ' + GRIND_SPAN.toFixed(3) + ', 1.0 - sy)) * ' + GRIND_MAX.toFixed(3) + ';',
      '  col = mix(col, uGrindCol, grind);',
      // ⚠️ СТАТИЧНОГО затемнения верхней полосы НЕТ — УБРАНО приказом
      // владельца 2026-07-22 («градиент сверху/снизу только при турбо или
      // злости миксера»). НЕ возвращать ради контраста HUD: владелец знает,
      // что белые глаза на светлом дневном небе дают ~1.6:1 (замер графики).
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyM);
  scene.add(sky);
  skyMat = skyM;
})();
