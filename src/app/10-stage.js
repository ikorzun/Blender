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
  // lift — ПОСТОЯННАЯ аддитивная добавка в альфу (она прибавляется белым
  // поверх умножения). Без неё догнать эталон невозможно в принципе: matcap
  // множится на текстуру и не бывает ярче 1, то есть умеет только ЗАТЕМНЯТЬ,
  // а у эталонного рендера свет ярче единицы. Белая добавка заодно чуть
  // разбеливает цвет — ровно тот пастельный характер, что у оригинала.
  tex:   { amb: 0.80, sky: 0.10, diff: 0.12, shin: 60, spec: 0.12, rim: 0.10, rimP: 3, lift: 0.20 },
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
      const sp = Math.min(1, Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), P.shin) * P.spec
                             + (P.lift || 0));
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
const matcapSpecPatch = (sh) => {
  sh.uniforms.emissive = { value: new THREE.Color(0x000000) };
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
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
    .replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>',
      '#include <common>\nuniform vec3 emissive;\nuniform float uPileTop;\nvarying float vWorldY;')
    .replace(
      'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',
      'float dk = clamp( ( vWorldY - uPileTop + ' + n(DEPTH_TINT_RANGE) + ' ) / '
        + n(DEPTH_TINT_RANGE) + ', 0.0, 1.0 );\n'
      + '\tdk = ' + n(DEPTH_TINT_MIN) + ' + ' + n(1 - DEPTH_TINT_MIN) + ' * dk;\n'
      // ⚠️ Глубиной гасится ТОЛЬКО диффуз. Блик и подсветку подсказки не
      // трогаем: иначе низ кучи превращается в чёрную кашу, где не разобрать
      // ни силуэтов, ни того, что подсвечено.
      + '\tvec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb * dk'
        + ' + vec3( matcapColor.a ) + emissive;'
    );
};
// Верх кучи для тонировки. ОДИН общий объект-юниформа: обновили .value —
// обновились все 181 материал разом, без обхода сцены.
const uPileTop = { value: FUNNEL.H };
// Тик глубины: верх кучи ползёт вниз по мере разбора, поэтому ведём его
// ПЛАВНО (лерп) — скачок высоты перекрашивал бы всю кучу разом.
// Вызывается из loop в 99-main (WORKSTREAMS разрешает добавлять свой тик).
function tickDepthTint(dt){
  if (!CFG.matcap || !items) return;
  let top = 0;
  for (const it of items) if (it.alive && !it.surprise) top = Math.max(top, it.p.y + it.r);
  if (top <= 0) return;
  const k = Math.min(1, dt * 4);
  uPileTop.value += (top - uPileTop.value) * k;
}
// matcap-предметы тени НЕ ПРИНИМАЮТ (материал неосвещаемый) — значит теневой
// пасс рисовал бы карту, которую некому показать. Замер: пасс УДВАИВАЕТ
// draw calls (136 -> 265 на ур.1), поэтому в этом режиме он выключен.
if (CFG.matcap) renderer.shadowMap.enabled = false;

// Небо: БЕЛОЕ поле (по требованию владельца). ShaderMaterial минует
// тонмаппинг и sRGB-конвертацию рендерера, поэтому цвета задаются КАК ЕСТЬ
// (без convertSRGBToLinear) — #ffffff даёт настоящий белый на экране.
let skyMat = null; // фон-лихорадка: uCombo подкрашивает низ красным (99-main)
(function buildSky(){
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uCombo: { value: 0 }, // 0 — обычное небо, 0.55 — комбо, 1 — цепная реакция
      uResY:  { value: 1 },  // высота канваса в device px (для экранного градиента)
      cTop:  { value: new THREE.Color(0xffffff) },
      cMid:  { value: new THREE.Color(0xf8fafc) },
      cBot:  { value: new THREE.Color(0xf0f2f6) },
      cGlow: { value: new THREE.Color(0xf3f6fd) },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot; uniform vec3 cGlow; uniform float uCombo; uniform float uResY;',
      'void main(){',
      '  float h = vDir.y;',
      '  vec3 col = mix(cBot, cMid, smoothstep(-0.35, 0.10, h));',
      '  col = mix(col, cTop, smoothstep(0.10, 0.75, h));',
      '  float band = exp(-pow((h - 0.16) / 0.16, 2.0));',
      '  col = mix(col, cGlow, band * 0.5);',
      // лихорадка: ЭКРАННЫЙ градиент — снизу красный, кверху белый (спека
      // владельца). Мировой (по vDir.y) из камеры сверху заливал ВСЁ красным.
      '  float sy = gl_FragCoord.y / uResY;',
      '  vec3 hot = mix(vec3(0.30, 0.87, 0.50), vec3(1.0), smoothstep(0.1, 0.8, sy));', // ЗЕЛЁНАЯ (спека владельца; была красная)
      '  col = mix(col, hot, uCombo);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyM);
  scene.add(sky);
  skyMat = skyM;
})();
