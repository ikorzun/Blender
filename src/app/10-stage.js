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
