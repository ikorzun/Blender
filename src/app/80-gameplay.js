// ===== 80-gameplay: матчи, тап, миксер, встряска, победа/поражение =====

// Группа из N>=2 одинаковых по ТИПУ: все расщепляются на пиксели;
// очки 10*N*(N-1), при N>2 показывается множитель
function doMatch(list){
  if (level) level.stuck = 0; // успешный ход сжигает фору «Оглядеться»
  // КОМБО: группа 3+ сразу, или вторая склейка за COMBO_CHAIN_MS, или матч
  // при уже горящем бусте — радиус до COMBO_RADIUS и ОЧКИ ×COMBO_SCORE_MULT
  // на COMBO_MS (окно продлевается каждым матчем — лихорадка живёт, пока
  // игрок быстр; первый матч цепочки идёт по обычной цене)
  const nowMs = performance.now();
  const comboHot = list.length >= 3 || nowMs - lastMatchMs < COMBO_CHAIN_MS || comboUntil > nowMs;
  {
    const wasHot = comboUntil > nowMs;
    lastMatchMs = nowMs;
    if (comboHot){
      comboUntil = nowMs + COMBO_MS;
      comboCount++;
      comboLevel = Math.min(COMBO_STEPS, comboLevel + 1); // +ступень радиуса за матч серии
      if (!wasHot){
        const mid0 = new THREE.Vector3();
        list.forEach(it => mid0.add(it.p));
        mid0.multiplyScalar(1/list.length).y += 0.9;
        // спека владельца: без эмодзи; «Combo ×2» тает — и СРАЗУ с того же
        // места тем же эффектом вылетает «Radius Up»
        scorePop('Combo ×' + COMBO_SCORE_MULT, mid0, '#ff9d2e', true);
        const mid1 = mid0.clone();
        setTimeout(()=>{ scorePop('Radius Up', mid1, '#ff9d2e', true); }, 800);
        Sound.play('combo');
        vibrate([20, 40, 30]); // двойной пульс — отличим от одиночных 15/40 мс
      }
      // серия дожата до цепной реакции. ВТОРОЕ турбо, собранное ВНУТРИ
      // активного, — «СЕРИЯ ТУРБО» (спека владельца 2026-07-21): окно
      // перезапускается, chainSeries растёт (интерфейс вешает на >=2
      // глаза eyes-5). Раньше гейт !chainUntil делал это невозможным —
      // вопрос ревью «comboCount копится, а зажечь следующую нельзя»
      // закрыт этим решением владельца.
      if (comboCount >= CHAIN_COMBO_AT && !level.over){
        const again = chainUntil > nowMs; // собрал турбо, не выходя из турбо
        chainSeries = again ? chainSeries + 1 : 1;
        chainUntil = nowMs + CHAIN_MS;
        chainStartMisses = stats.misses;
        if (!again) chainNextDrop = nowMs + 600; // у активной цепи досыпка уже тикает
        comboCount = 0; // серия «потрачена» на запуск — следующая копится заново
        const mid1 = new THREE.Vector3();
        list.forEach(it => mid1.add(it.p));
        mid1.multiplyScalar(1/list.length).y += 1.6;
        scorePop(again ? ('Power chain ×' + chainSeries + '!') : 'Power chain!', mid1, '#ff5a3c', true);
        Sound.play('chain');
        vibrate([30, 50, 30, 50, 60]);
        updateMatchRadius();
      }
    }
  }
  // молнии цепной реакции: разряд от тапнутого к каждому предмету группы
  if (chainUntil > performance.now() && list.length > 1){
    for (let i = 1; i < Math.min(list.length, 9); i++) boltFX(list[0].p, list[i].p);
  }
  list.forEach(it => { it.animating = true; destroyItemBody(it); }); // тела сразу из мира
  wakePhysics('gameplay:L7'); // соседи начинают оседать
  stats.matches++;
  stats.lastAction = performance.now();
  const n = list.length;
  const mid = new THREE.Vector3();
  list.forEach(it => mid.add(it.p)); mid.multiplyScalar(1/n);
  const gained = MATCH_SCORE * n * (n-1) * (comboHot ? COMBO_SCORE_MULT : 1);
  stats.score += gained;
  popFX(mid);
  // «ПУНКТ 5» (спека владельца 2026-07-21): разнообразие эффектов ПРАВИЛОМ.
  // Пара/тройка — труха как раньше; группа >= BURST_MIN_N ЛОПАЕТСЯ эффектом
  // своей пачки (burstFX) + физическая волна вздрагивает соседей от
  // тапнутого (list[0]); в комбо/цепи поверх остаются молнии — как были.
  const burst = n >= BURST_MIN_N;
  if (burst){
    list.forEach(it => burstFX(it));
    blastWave(list[0].p, BURST_WAVE_R, BURST_WAVE_V);
  } else {
    list.forEach(it => dissolveFX(it));
  }
  // цифра — сразу РЕЗУЛЬТАТ умножения (спека владельца: «+80», не «+40 ×2»)
  scorePop('+' + gained, mid, comboHot ? '#ff9d2e' : '#3e63dd', false);
  if (n > 2) scorePop('×' + (n-1), mid.clone().add(new THREE.Vector3(0, 1.2, 0)), '#f5a623', true);
  Sound.play('match', n);
  vibrate(15);
  if (n > 2) camShake = Math.max(camShake, 0.12); // джус на большие группы
  const scales = list.map(it => it.mesh.scale.x);
  // бурст: короткое НАДУВАНИЕ (до ×1.22 к 45% времени), потом схлопывание —
  // читается как «лопнул»; обычный матч — прежнее плавное исчезновение
  addFX(new THREE.Object3D(), burst ? 0.16 : 0.14, (o,k)=>{
    const s = burst ? (k < 0.45 ? 1 + 0.5*k : 1.22 * (1 - (k - 0.45)/0.55)) : (1 - k);
    list.forEach((it,i) => { it.mesh.scale.setScalar(scales[i]*Math.max(0, s)); });
  });
  setTimeout(()=>afterPause(()=>{
    list.forEach(removeItem);
    wakePhysics('gameplay:L28'); // масса над удалёнными должна осесть
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 150);
}
// ===== Эффекты лопанья по пачкам («пункт 5», спека владельца 2026-07-21).
// СТАРТОВЫЕ реализации зоны ФИЗИКИ через публичный addFX — 70-fx не тронут
// (sphereFX-стиль жизненного цикла: материал/геометрия персональные,
// stepFX сам их диспозит). Полировка/перенос в 70-fx — за ГРАФИКОЙ
// (междузонный запрос в WORKSTREAMS). Баллистика ПАРАМЕТРИЧЕСКАЯ
// (позиция от t=k·life, не по кадрам) — FPS-независимо.
function burstFX(it){
  const tex = it.type.tex;
  if (tex === 'food') juiceFX(it);
  else if (tex === 'car') sparkFX(it);
  else if (tex === 'animal') starPopFX(it);
  else dissolveFX(it); // стейк/без пачки — прежняя труха
}
// сок: крупные капли цвета типа, «мокрый» баллистический разлёт
function juiceFX(it){
  const N = 46, LIFE = 0.8;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, sp = 1.5 + Math.random()*3.5;
    ox.push(it.p.x); oy.push(it.p.y + 0.2); oz.push(it.p.z);
    vx.push(Math.cos(a)*sp); vy.push(2 + Math.random()*4.5); vz.push(Math.sin(a)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: (it.fxColor || it.baseColor || new THREE.Color(0xff5a6e)),
    size: 0.34, transparent: true, opacity: 0.95, depthWrite: false });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 11*t*t; // ½·G·t², G=22
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 0.95*(1 - k);
    o.material.size = 0.34*(1 - k*0.4);
  });
}
// искры + «детальки»: яркие точки веером + 3 тёмных кубика-осколка кувырком
function sparkFX(it){
  const N = 36, LIFE = 0.45;
  const pos = new Float32Array(N*3), ox = [], oy = [], oz = [], vx = [], vy = [], vz = [];
  for (let i = 0; i < N; i++){
    const a = Math.random()*Math.PI*2, e = Math.random()*Math.PI*0.5, sp = 4 + Math.random()*5;
    ox.push(it.p.x); oy.push(it.p.y + 0.2); oz.push(it.p.z);
    vx.push(Math.cos(a)*Math.cos(e)*sp); vy.push(Math.sin(e)*sp); vz.push(Math.sin(a)*Math.cos(e)*sp);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // ⚠️ normal blending: additive на светлой панораме невидим (грабля ГРАФИКИ)
  const m = new THREE.PointsMaterial({ color: 0xffdf6b, size: 0.16, transparent: true, opacity: 1, depthWrite: false });
  addFX(new THREE.Points(g, m), LIFE, (o, k) => {
    const p = o.geometry.attributes.position.array, t = k*LIFE;
    for (let i = 0; i < N; i++){
      p[i*3]   = ox[i] + vx[i]*t;
      p[i*3+1] = oy[i] + vy[i]*t - 6*t*t; // искры почти не падают
      p[i*3+2] = oz[i] + vz[i]*t;
    }
    o.geometry.attributes.position.needsUpdate = true;
    o.material.opacity = 1 - k*k;
  });
  for (let j = 0; j < 3; j++){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x3a4048, transparent: true, opacity: 1 }));
    const a = Math.random()*Math.PI*2, sp = 1.2 + Math.random()*2;
    const bvx = Math.cos(a)*sp, bvy = 3 + Math.random()*2.5, bvz = Math.sin(a)*sp;
    const rx = (Math.random()-0.5)*14, rz = (Math.random()-0.5)*14;
    const o0 = it.p.clone();
    addFX(box, 0.7, (o, k) => {
      const t = k*0.7;
      o.position.set(o0.x + bvx*t, o0.y + bvy*t - 11*t*t, o0.z + bvz*t);
      o.rotation.x = rx*t; o.rotation.z = rz*t;
      o.material.opacity = 1 - k;
    });
  }
}
// мультяшный pop: 5 звёздочек веером вверх с кувырком, тают в полёте
function starPopFX(it){
  for (let j = 0; j < 5; j++){
    const star = new THREE.Mesh(starGeo(),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95, depthWrite: false }));
    const a = j/5*Math.PI*2 + Math.random()*0.8, sp = 1 + Math.random()*1.6;
    const svx = Math.cos(a)*sp, svy = 3.2 + Math.random()*2.2, svz = Math.sin(a)*sp;
    const rx = (Math.random()-0.5)*10, ry = (Math.random()-0.5)*10;
    const o0 = it.p.clone(), s0 = 0.16 + Math.random()*0.07;
    addFX(star, 0.7, (o, k) => {
      const t = k*0.7;
      o.position.set(o0.x + svx*t, o0.y + 0.3 + svy*t - 9*t*t, o0.z + svz*t);
      o.rotation.x = rx*t; o.rotation.y = ry*t;
      o.scale.setScalar(s0*(1 - k*0.8));
      o.material.opacity = 0.95*(1 - k*k);
    });
  }
}

function checkEnd(){
  if (level.over) return;
  if (items.every(i=>!i.alive)){
    level.over = true;
    Sound.play('win');
    const secs = Math.round((performance.now()-stats.t0)/1000);
    // ЗВЁЗДЫ: 1★ пройден, 2★ очки >= пар-скор×1.3, 3★ >= ×1.7 (скилл в очках,
    // НЕ в спецусловиях — «цепная реакция обязательна» отвергнута аудитом плана)
    const base = level.parBase || 0;
    const stars = 1 + (base > 0 && stats.score >= base * STAR2_K ? 1 : 0)
                    + (base > 0 && stats.score >= base * STAR3_K ? 1 : 0);
    // МОНЕТЫ: база + конверсия очков (комбо наконец экономически выгодны)
    level.coinsWon = COIN_BASE + Math.floor(Math.max(0, stats.score) / COIN_PER_SCORE);
    addCoins(level.coinsWon);
    setStars(levelNum, stars);
    addHints(1); // +1 подсказка за успешный уровень (спека владельца)
    Telemetry.ev('win', { lv: levelNum, st: stars, c: level.coinsWon, sc: stats.score, sec: secs });
    $('winTitle').textContent = '🎉 Level ' + levelNum + ' cleared!';
    $('winStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('winStats').textContent =
      'Score: ' + stats.score + (base ? ' / goal ' + Math.round(base * STAR2_K) : '') + '  ·  Time: ' + fmtTime(secs);
    // монеты скрыты: награда уровня на экране — звёзды + подсказка;
    // начисление выше живёт (вернётся вместе с COINS_ENABLED)
    $('winCoins').textContent = COINS_ENABLED ? ('+' + level.coinsWon + ' 🪙  ·  +1 💡') : '+1 💡';
    $('winX2Btn').style.display = COINS_ENABLED ? '' : 'none';
    levelNum++;
    try { localStorage.setItem('mixer_level', String(levelNum)); } catch(e){}
    Ads.noteWin();
    show('winOverlay');
    updateHUD();
  }
}
function showLose(){
  level.over = true;
  hide('adAskOverlay'); // тупик мог созреть, пока открыт вопрос о встряске — не копим оверлеи
  Sound.play('lose');
  Telemetry.ev('lose', { lv: levelNum, alive: items.filter(i=>i.alive).length });
  const secs = Math.round((performance.now()-stats.t0)/1000);
  $('loseStats').textContent = 'No pairs available and no shakes left. Items left: '
    + items.filter(i=>i.alive).length + '  ·  Time: ' + fmtTime(secs);
  // Continue за рекламу — 1 раз за уровень (самый конвертящий плейсмент жанра)
  $('loseAdContinue').style.display = level.continueUsed ? 'none' : '';
  show('loseOverlay');
}
// Continue: реклама досмотрена — вернуть игру к жизни
function continueRun(){
  level.continueUsed = true;
  level.over = false;
  hide('loseOverlay');
  level.shakes++;                 // +1 встряска
  dropExtra(CONTINUE_DROP);       // +предметы сверху (появляются новые пары)
  stats.lastAction = performance.now();
  level.stuck = -4;               // фора детектору тупика, пока досыпка оседает
  Telemetry.ev('continue', { lv: levelNum });
  refreshAccessibility(); updateHUD();
}
// «Прицел» (магазин): подсветить ВСЕ доступные пары на 5 с
function scopeHighlight(){
  const byKey = {};
  for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key] = byKey[it.key]||[]).push(it);
  let lit = 0;
  for (const k in byKey){
    const arr = byKey[k];
    for (const a0 of arr){
      const paired = arr.some(o => o !== a0 && pairMatch(o, a0));
      if (paired){ scopePulse(a0, 5); lit++; }
    }
  }
  if (!lit) toast('No pairs available right now');
}
function scopePulse(item, dur){
  const mat = item.mesh.material;
  mat.emissive.setHex(0x35c46a);
  mat.emissiveIntensity = 0;
  addFX(new THREE.Object3D(), dur, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*10)) * 0.7 * (1-k*0.5);
  });
}
// «Металлоискатель» (rewarded): показать, ГДЕ копать до сюрприза
function detectorHighlight(){
  const sp = items.find(i => i.surprise && i.alive);
  if (!sp) return;
  level.detectorUsed = true;
  markerFX(sp.p, 0xffc84a);
  for (const it of items){
    if (!it.alive || it.surprise || it.animating) continue;
    const dx = it.p.x - sp.p.x, dz = it.p.z - sp.p.z;
    if (dx*dx + dz*dz < 1.7 && it.p.y > sp.p.y) scopePulse(it, 10);
  }
  Telemetry.ev('rw', { p: 'detector' });
  updateHUD();
}
// Сюрприз раскопан и затапан: бонус и золотое расщепление
function collectSurprise(it){
  it.animating = true;
  destroyItemBody(it);
  wakePhysics('gameplay:L58');
  faceEvent('surprised', 1000); // матрица эмоций ИНТЕРФЕЙСА: клад — «удивлённые» глаза (EYES-CHARACTER-SPEC §5)
  stats.lastAction = performance.now();
  stats.score += SURPRISE_BONUS;
  scorePop('+' + SURPRISE_BONUS, it.p.clone().setY(it.p.y + 0.6), '#ffc84a', true);
  popFX(it.p);
  dissolveFX(it);
  Sound.play('surprise');
  vibrate(30);
  const s0 = it.mesh.scale.x;
  addFX(new THREE.Object3D(), 0.2, (o,k)=>{ it.mesh.scale.setScalar(s0*(1-k)); });
  setTimeout(()=>afterPause(()=>{
    removeItem(it);
    wakePhysics('gameplay:L70');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 200);
}

// Ореол-призрак досягаемости (метрика v3): САМА ФОРМА предмета, раздутая
// на matchRadius по каждой локальной оси — честный образ зоны «истинный
// зазор <= R» (сфера при неохватной метрике врала бы в обе стороны: у
// стейка зона — плита, не шар). Геометрия ОБЯЗАТЕЛЬНО клонируется:
// stepFX по завершении зовёт dispose — общий кэш геометрий типов трогать
// нельзя (иначе все предметы типа теряют GPU-буферы).
function reachGhostFX(item, color){
  if (!CFG.radiusOn) return;
  const geo = item.mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, s = item.mesh.scale.x;
  const R = Math.min(CFG.matchRadius, 3.6); // в цепи/эндшпиле не больше чаши
  // воздушный вариант (спека владельца): прозрачнее втрое, кромка мягкая и широкая
  const ghost = new THREE.Mesh(geo.clone(), fresnelGhostMat(color, 0.02, 0.16, 1.1));
  ghost.position.copy(item.mesh.position);
  ghost.quaternion.copy(item.mesh.quaternion);
  ghost.scale.set(
    s + R / Math.max(0.05, (bb.max.x - bb.min.x) / 2),
    s + R / Math.max(0.05, (bb.max.y - bb.min.y) / 2),
    s + R / Math.max(0.05, (bb.max.z - bb.min.z) / 2));
  ghost.renderOrder = 10;
  addFX(ghost, 0.9, (o, k) => { o.material.uniforms.op.value = 1 - k; });
}

function handleTap(x, y){
  if (level.over) return;
  // финал миксера (пар по типам не осталось): очки не тратятся и не
  // начисляются — промахи по сиротам/пустоте БЕЗ штрафа (спека владельца);
  // тап по раскопанному сюрпризу остаётся рабочим
  const finale = !hasAnyPair();
  stats.taps++;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x-rect.left)/rect.width)*2-1, -((y-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = aliveMeshes();
  let hits = raycaster.intersectObjects(meshes, false);
  let item = hits.length ? hits[0].object.userData.item : null;
  if (!item){
    // мягкий подбор: ближайший к точке тапа в экранных координатах
    let best = null, bestD = 34; // px
    for (const it of items){
      if (!it.alive || it.animating) continue;
      const sp = it.p.clone().project(camera);
      const px = (sp.x+1)/2*rect.width + rect.left, py = (-sp.y+1)/2*rect.height + rect.top;
      const d = Math.hypot(px-x, py-y);
      if (d < bestD){ bestD = d; best = it; }
    }
    item = best;
  }
  if (!item){ if (!finale) penalize(null, x, y); return; }
  if (item.animating) return; // растворяющийся: двойной тап давал двойные очки (+300 за сюрприз)

  if (!isAccessible(item)){
    wiggle(item);
    toast(item.surprise ? 'The treasure is still buried' : 'Item is covered from above');
    if (!finale) penalize(item.p);
    return;
  }
  if (item.surprise){ collectSurprise(item); return; } // раскопанный сюрприз собирается тапом
  const copies = items.filter(i => i.alive && !i.animating && i !== item && i.key === item.key);
  const accessible = copies.filter(i => isAccessible(i));
  const eligible = accessible.filter(i => pairMatch(i, item));

  // ореол досягаемости: белый — матч есть, красный — промах
  reachGhostFX(item, eligible.length ? 0xffffff : 0xff5a64);

  if (eligible.length){
    // все одинаковые (тип, любой размер) в сфере — разом, даже нечётным числом;
    // оставшихся без пары в конце уничтожит миксер
    doMatch([item].concat(eligible));
    return;
  }
  if (finale){ wiggle(item); return; }
  penalize(item.p);
  const nearBuried = copies.filter(i => pairMatch(i, item));
  if (accessible.length){
    accessible.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    lineFX(item.p, accessible[0].p, 0xffb224);
    toast('Pair is too far — shake!');
  } else if (nearBuried.length){
    nearBuried.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(nearBuried[0].p, 0xffb224);
    toast('Pair is near but covered');
  } else if (copies.length){
    copies.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(copies[0].p, 0xff6369);
    toast('Pair is deeper and farther');
  }
  wiggle(item);
}

// ---------- Подсказка ----------
// Находит лучшую доступную группу (максимум одинаковых в радиусе) и подсвечивает
function findHintGroup(){
  refreshAccessibility();
  const acc = items.filter(i => i.alive && !i.animating && !i.surprise && i.accessible);
  let best = null;
  for (const it of acc){
    const grp = acc.filter(o => o !== it && o.key === it.key && pairMatch(o, it));
    if (grp.length && (!best || grp.length + 1 > best.length)) best = [it].concat(grp);
  }
  return best;
}
function showHint(){
  if (level.over || intro) return;
  if (hints() < 1){ toast('No hints left'); return; }
  const grp = findHintGroup();
  if (!grp){
    toast('Доступных пар нет — встряхните!'); // группа не найдена — подсказку НЕ тратим
    return;
  }
  spendHint(); // числимый ресурс (спека владельца: старт 3, +1 за уровень)
  Telemetry.ev('spend', { item: 'hint' });
  reachGhostFX(grp[0], 0xffe066);
  grp.forEach(it => hintPulse(it));
  updateHUD();
}
function hintPulse(item){
  const mat = item.mesh.material;
  mat.emissive.setHex(0xffb020);
  mat.emissiveIntensity = 0;
  addFX(new THREE.Object3D(), 2.2, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*6)) * 0.8 * (1-k);
  });
}

// ---------- Миксер ----------
// Режим наказания (простой > level.idleLimit): раз в MIXER_PERIOD нижний предмет
// затягивает в лопасти (тонет с вращением), его пара расщепляется вместе с ним,
// за пару отнимаются очки.
function mixerGrind(){
  const cand = items.filter(i => i.alive && !i.animating && !i.surprise); // сюрприз миксер не ест
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  const twin = cand.find(i => i !== low && i.key === low.key);
  const group = twin ? [low, twin] : [low];
  group.forEach(it => { it.animating = true; destroyItemBody(it); });
  wakePhysics('gameplay:L182');
  stats.score -= MIXER_PENALTY;
  scorePop('-' + MIXER_PENALTY, low.p.clone().setY(low.p.y + 0.8), '#e5484d', true);
  Sound.play('grind');
  vibrate(40);
  const p0 = low.p.clone(), s0 = low.mesh.scale.x;
  addFX(new THREE.Object3D(), 0.55, (o,k)=>{
    low.mesh.position.set(p0.x, p0.y - k*1.6, p0.z);
    low.mesh.rotation.y += 0.5;
    low.mesh.scale.setScalar(s0*(1-k*0.9));
  });
  if (twin) dissolveFX(twin);
  camShake = Math.max(camShake, 0.22);
  setTimeout(()=>afterPause(()=>{
    bladeDustFX(low.mesh.position.clone(), low.fxColor || low.baseColor); // домололся — труха из-под ножей
    group.forEach(removeItem);
    wakePhysics('gameplay:L198');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 560);
}
// Финальная зачистка: парных не осталось — миксер уничтожает остатки (без штрафа)
function finaleGrind(){
  const cand = items.filter(i => i.alive && !i.animating);
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  if (low.surprise){ collectSurprise(low); return; } // сюрприз финал бережно собирает с бонусом
  low.animating = true;
  destroyItemBody(low);
  wakePhysics('gameplay:L211');
  Sound.play('grind');
  const p0 = low.p.clone(), s0 = low.mesh.scale.x;
  addFX(new THREE.Object3D(), 0.4, (o,k)=>{
    low.mesh.position.set(p0.x, p0.y - k*1.4, p0.z);
    low.mesh.rotation.y += 0.45;
    low.mesh.scale.setScalar(s0*(1-k*0.9));
  });
  setTimeout(()=>afterPause(()=>{
    bladeDustFX(low.mesh.position.clone(), low.fxColor || low.baseColor);
    removeItem(low);
    wakePhysics('gameplay:L222');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 410);
}

// ---------- Встряска ----------
function performShake(){
  wakePhysics('shake');
  // К концу уровня встряска ПРИТЯГИВАЕТ пары друг к другу (спека владельца:
  // «иначе игрок не может совместить последние пары и злится»). Доля
  // притяжения растёт по мере опустошения: >=40 живых — чистое рыхление,
  // <=12 — почти чистое притяжение к ближайшему близнецу по типу.
  let aliveCnt = 0;
  for (const it of items) if (it.alive && !it.surprise) aliveCnt++;
  const pullK = Math.max(0, Math.min(1, (40 - aliveCnt) / 28));
  for (const it of items){
    if (!it.alive || !it.body) continue;
    let ax = 0, az = 0;
    if (pullK > 0 && !it.surprise){
      let twin = null, bd = 1e9;
      for (const ot of items){
        if (ot === it || !ot.alive || ot.animating || ot.key !== it.key) continue;
        const d = ot.p.distanceToSquared(it.p);
        if (d < bd){ bd = d; twin = ot; }
      }
      if (twin){
        const dx = twin.p.x - it.p.x, dz = twin.p.z - it.p.z;
        const len = Math.hypot(dx, dz) || 1;
        ax = dx/len; az = dz/len;
      }
    }
    // сила ×1.2 (спека владельца: «усиль эффект встряхивания на 20%»)
    const pull = 7.8 * pullK, rnd = 1 - 0.75*pullK;
    // вес (вариант 1, спека владельца 2026-07-21): множитель пачки ТОЛЬКО
    // на случайное рыхление/подброс/вращение; притяжение к близнецу (pull)
    // остаётся нормированным — оно функциональное, не «ощущенческое»
    const wk = it.shakeK || 1;
    impulseBody(it, (Math.random()-0.5)*9*rnd*wk + ax*pull, (5.4 + Math.random()*6)*wk, (Math.random()-0.5)*9*rnd*wk + az*pull);
    spinBody(it, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk);
  }
  camShake = 0.42; // +20% и на камеру
  stats.lastAction = performance.now(); // встряска — тоже действие, миксер откладывается
  Sound.play('shake');
  setTimeout(()=>{ refreshAccessibility(); updateHUD(); }, 900);
}
function requestShake(){
  if (level.over || intro) return;
  if (level.shakes > 0){
    useFreeShake(); // без подтверждения — сразу (по требованию владельца)
  } else if (level.adShakes > 0 || (COINS_ENABLED && coins() >= PRICE_SHAKE)){
    // корректировка аудита: монеты НЕ конкурируют с бесплатной рекламой —
    // покупка за 25 открывается только после исчерпания rewarded-капа
    // (при скрытых монетах покупной ветки нет вовсе)
    $('adYes').style.display = level.adShakes > 0 ? '' : 'none';
    $('coinShakeBtn').style.display = (COINS_ENABLED && level.adShakes === 0 && coins() >= PRICE_SHAKE) ? '' : 'none';
    show('adAskOverlay');
  } else {
    toast('No shakes left');
  }
}
function buyCoinShake(){
  hide('adAskOverlay');
  if (level.over || intro) return; // уровень успел кончиться — монеты не списываем
  if (!spendCoins(PRICE_SHAKE)){ toast('Not enough coins'); return; }
  Telemetry.ev('spend', { item: 'shake' });
  performShake(); updateHUD();
}
function useFreeShake(){
  level.shakes--; stats.shakesUsed++;
  performShake(); updateHUD();
}
function startAd(){
  hide('adAskOverlay');
  Ads.showRewarded(()=>{ // награда только после досмотра (см. 78-ads)
    // смену уровня закрывает Ads.cancel() в genLevel; здесь — конец ТОГО ЖЕ
    // уровня, наставший за время ролика (встряске некого трясти)
    if (level.over) return;
    level.adShakes--; stats.adShakesUsed++;
    Telemetry.ev('rw', { p: 'shake' });
    performShake(); updateHUD();
  });
}
