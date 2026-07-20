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
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03,
    transparent: true, opacity: 0.08, depthWrite: false,
    envMapIntensity: 0.06, specularIntensity: 0.25,
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
