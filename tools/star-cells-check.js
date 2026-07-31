// tools/star-cells-check.js — ЕДИНСТВЕННЫЙ НАСТОЯЩИЙ ГАРАНТ ЗВЁЗДНЫХ ЯЧЕЕК.
//
// ЗАЧЕМ. Звезда рисуется только там, где floor(d*STAR_GRID) равен ЕЁ ячейке.
// Значит вокруг центра звезды нужен запас до границы УГЛОВОГО ПЯТНА ячейки, а
// оно зависит от того, КАК сфера пересекает ячейку: задетая углом ячейка видна
// на сфере крошечным лоскутом. Арифметическая формула бюджета в 00-config
// этого члена не содержит и УЖЕ ОДИН РАЗ ДАЛА ЛОЖНУЮ ГАРАНТИЮ (правка
// «конец срезам» оставила 9.3% срезанных ядер и 21.1% вовсе пропавших звёзд —
// нашло ревью по main, подтверждено этим перебором).
//
// КАК ЗАПУСКАТЬ:  node tools/star-cells-check.js            (числа из 00-config)
//                 node tools/star-cells-check.js BAND JIT DENS   (перебрать вариант)
// ⚠️ В zsh аргументы передавать ЯВНО: `$vars` он не разбивает на слова.
//
// ЧТО ЖДЁМ НА ИСПРАВНОЙ СБОРКЕ: «ЯДРО ЦЕЛОЕ 100%», «ЯДРО СРЕЗАНО 0%»,
// «вне своей ячейки 0%», «ореол/лучи задеты 0%». Любая правка STAR_* обязана
// это подтвердить — комментарию в конфиге верить нельзя, он не считает.
//
// ⚠️ ЧИСЛА ЗДЕСЬ ДУБЛИРУЮТ 00-config СОЗНАТЕЛЬНО: скрипт не парсит сборку,
// чтобы оставаться простым. Разошлись — сверить руками (это две строки).
const AV = process.argv.slice(2).map(Number);
const BAND = isFinite(AV[0]) ? AV[0] : 0.30;   // = STAR_BAND в 00-config
const JIT  = isFinite(AV[1]) ? AV[1] : 0.26;   // = STAR_JIT
const DENS = isFinite(AV[2]) ? AV[2] : 0.9295; // = STAR_DENS
const GRID = 34, R = 0.0038, HALO = 2.4;
const hs = (x,y,z) => { const s = Math.sin(x*12.9898 + y*78.233 + z*37.719)*43758.5453; return s - Math.floor(s); };
const cellOf = d => [Math.floor(d[0]*GRID), Math.floor(d[1]*GRID), Math.floor(d[2]*GRID)];
const norm = v => { const l = Math.hypot(v[0],v[1],v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };

// все ячейки, задетые сферой радиуса GRID
const cells = [];
const K = GRID + 2;
for (let x = -K; x < K; x++) for (let y = -K; y < K; y++) for (let z = -K; z < K; z++){
  // ближайшая и дальняя точки куба [x,x+1]³ от начала
  let near = 0, far = 0;
  for (const [lo, hi] of [[x,x+1],[y,y+1],[z,z+1]]){
    const a = Math.min(Math.abs(lo), Math.abs(hi)), b = Math.max(Math.abs(lo), Math.abs(hi));
    near += (lo <= 0 && hi >= 0) ? 0 : a*a; far += b*b;
  }
  if (Math.sqrt(near) <= GRID && Math.sqrt(far) >= GRID) cells.push([x,y,z]);
}


// ортобазис вокруг направления
function basis(n){
  const up = Math.abs(n[1]) < 0.9 ? [0,1,0] : [1,0,0];
  const t1 = norm([n[1]*up[2]-n[2]*up[1], n[2]*up[0]-n[0]*up[2], n[0]*up[1]-n[1]*up[0]]);
  const t2 = [n[1]*t1[2]-n[2]*t1[1], n[2]*t1[0]-n[0]*t1[2], n[0]*t1[1]-n[1]*t1[0]];
  return [t1, t2];
}
const RAYS = 32, RINGS = 10;
const outer = HALO * R;
let coreOK = 0, coreCut = 0, gone = 0, haloCut = 0, withStar = 0;
const margins = [];
for (const ip of cells){
  if (hs(ip[0], ip[1], ip[2]) <= DENS) continue;   // нет звезды в ячейке
  if (Math.abs(Math.hypot(ip[0]+0.5, ip[1]+0.5, ip[2]+0.5) - GRID) > BAND) continue;  // ячейка задета краем
  withStar++;
  const j = [hs(ip[0]+1.7,ip[1]+1.7,ip[2]+1.7)-0.5, hs(ip[0]+3.3,ip[1]+3.3,ip[2]+3.3)-0.5, hs(ip[0]+5.9,ip[1]+5.9,ip[2]+5.9)-0.5];
  const sdir = norm([ip[0]+0.5+j[0]*JIT, ip[1]+0.5+j[1]*JIT, ip[2]+0.5+j[2]*JIT]);
  const c0 = cellOf(sdir);
  if (c0[0]!==ip[0] || c0[1]!==ip[1] || c0[2]!==ip[2]){ gone++; continue; }  // центр вне своей ячейки
  const [t1,t2] = basis(sdir);
  let minMargin = Infinity;
  for (let a = 0; a < RAYS; a++){
    const ang = 2*Math.PI*a/RAYS, ca = Math.cos(ang), sa = Math.sin(ang);
    let lim = outer * 1.5;
    for (let k = 1; k <= RINGS; k++){
      const th = outer*1.5 * k/RINGS;
      const p = norm([sdir[0]+ (t1[0]*ca+t2[0]*sa)*Math.tan(th),
                      sdir[1]+ (t1[1]*ca+t2[1]*sa)*Math.tan(th),
                      sdir[2]+ (t1[2]*ca+t2[2]*sa)*Math.tan(th)]);
      const c = cellOf(p);
      if (c[0]!==ip[0]||c[1]!==ip[1]||c[2]!==ip[2]){ lim = th; break; }
    }
    minMargin = Math.min(minMargin, lim);
  }
  margins.push(minMargin);
  if (minMargin >= R) coreOK++; else coreCut++;
  if (minMargin < outer) haloCut++;
}
const pc = n => (100*n/withStar).toFixed(1)+'%';
console.log(`GRID=${GRID} JIT=${JIT} BAND=${BAND} DENS=${DENS} -> звёзд ${withStar}`);
console.log('  центр вне своей ячейки (звезды нет вовсе):', gone, pc(gone));
console.log('  ЯДРО ЦЕЛОЕ:', coreOK, pc(coreOK));
console.log('  ЯДРО СРЕЗАНО:', coreCut, pc(coreCut));
console.log('  ореол/лучи задеты:', haloCut, pc(haloCut));
margins.sort((a,b)=>a-b);
console.log('запас до границы, рад: мин', margins[0].toFixed(5), 'медиана', margins[margins.length>>1].toFixed(5),
  '| нужно ядру', R, ', ореолу', outer.toFixed(5));
