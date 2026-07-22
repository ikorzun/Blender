// ===== 99-main: главный цикл, отладочный API, старт =====

let camShake = 0, lastT = performance.now(), lastAccMs = 0, lastHudMs = 0;
let lastMtText = null; // кэш отсчёта до помола — DOM трогаем только при смене
let lastFireOn = null; // кэш огня угрозы — класс тоже только при смене
let grindStartMs = 0;  // якорь начала помола: огонь после FIRE_AFTER_GRIND_MS непрерывного Grinding
if (FIRE_DROP_MODE === 'always') $('face').classList.add('dropped');

// Перф-метр (соак-тест и замеры на устройствах, потребитель — soak.js):
// кольца последних 600 кадров — сырое время кадра и время шага физики
const frameRing = [], stepRing = [];
let perfFrames = 0, perfWorstMs = 0;

// ===== Интро уровня (по мокапу владельца): вид сбоку -> предметы сыплются
// в пустую чашу (~2 с живой физики) -> 2-секундный облёт вокруг чаши
// с плавным переходом на игровой вид сверху. Ввод и миксер заблокированы.
let intro = null; // { phase:'drop'|'orbit', t, shakes }
let pendingTrim = false; // трим и база радиуса ждут ОСЕВШЕЙ кучи (см. finalizeFill)
function startIntro(){
  intro = { phase:'drop', t: 0, shakes: 0 };
  resetPointers();
  setFallCap(11); // мягче терминальная скорость на время досыпки
  camAz = 0.35; camPhi = 1.25; camR = 17.8;
  updateCamera();
}
// Страховка от рыхлых сидов: всё, что торчит выше линии заполнения после
// утряски, тихо изымается ПАРАМИ (верхний + его близнец) — чётность типов
// цела, переполнения не бывает никогда
function trimOverfill(){
  let removed = 0;
  for (let guard=0; guard<8; guard++){
    let top = null;
    for (const it of items){
      if (it.alive && !it.surprise && (!top || it.p.y + it.r > top.p.y + top.r)) top = it;
    }
    if (!top || top.p.y + top.r <= FUNNEL.H - 0.2) return removed;
    const twin = items.find(i => i !== top && i.alive && i.key === top.key);
    [top, twin].forEach(it => { if (it) { removeItem(it); removed++; } });
  }
  return removed;
}
function finishIntro(){
  intro = null;
  resetPointers();
  setFallCap(); // вернуть боевую терминальную скорость
  // отпустить сюрприз (был прибит ко дну на время осадки)
  const sp = items.find(i => i.surprise && i.body);
  if (sp) sp.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
  camAz = 0; camPhi = 0.45; camR = 16.2;
  updateCamera();
  stats.t0 = performance.now();
  stats.lastAction = performance.now();
  // свежий 3-секундный бюджет форс-сна ПОСЛЕ интро: wakeAtMs стоял с genLevel,
  // и бюджет истекал к концу интро — форс-сон бил на первом же кадре игры
  wakeAtMs = performance.now(); calmT = 0;
  // ⚠️ ТРИМ И БАЗУ РАДИУСА ЗДЕСЬ НЕ СЧИТАТЬ: куча к концу облёта может ещё
  // падать (на слабых машинах — сильно); трим по летящему столбу тихо удалял
  // до 16 предметов, а topY0 по нему ломал динамический радиус. Ждём штиля.
  pendingTrim = true;
  refreshAccessibility(); updateHUD();
}
// Финализация заполнения — СТРОГО по осевшей куче (из loop при штиле)
function finalizeFill(){
  // после изъятия пар куча ОБЯЗАНА доосесть: трим по спящей куче оставлял
  // замороженные полости (предметы висели над дырами от изъятых близнецов)
  if (trimOverfill() > 0) wakePhysics('trim');
  let top0 = 0, aliveN = 0;
  for (const it of items) if (it.alive){ top0 = Math.max(top0, it.p.y + it.r); if (!it.surprise) aliveN++; }
  level.topY0 = top0;
  level.aliveN0 = aliveN; // стартовая загрузка — порог 20% для автопана камеры
  // пар-скор (звёзды v1): база = «всё сматчено парами без комбо» по факту
  // ПОСЛЕ трима; 2★ = ×1.3 (нужны комбо), 3★ = ×1.7 (нужны серии)
  level.parBase = Math.floor(aliveN / 2) * MATCH_SCORE * 2;
  refreshAccessibility(); updateHUD();
}
function tickIntro(dt){
  intro.t += dt;
  if (intro.phase === 'drop'){
    // К ОБЛЁТУ ПОРАНЬШЕ (спека владельца: «ускорь переход»): не ждём
    // почти-штиля — куча доседает уже во время облёта (утряска в орбите
    // гейтится maxV<3, трим всё равно ждёт штиля через pendingTrim)
    if ((intro.t > 0.8 && maxBodySpeed() < 3.5) || intro.t > 1.4){
      removeTempTallWall();
      intro.phase = 'orbit'; intro.t = 0;
    }
  } else {
    // живая вибро-утряска ВСЕЙ массы во время облёта (арки-мосты рыхлят кучу);
    // только по УЖЕ осевшей массе — бить по летящему столбу опасно (вылеты)
    if (intro.shakes < 3 && intro.t > 0.1 + intro.shakes*0.3 && maxBodySpeed() < 3){
      intro.shakes++;
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top > FUNNEL.H - 0.4){
        for (const it of items){
          if (it.alive && it.body)
            impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
        }
      }
    }
    const k = Math.min(1, intro.t / 1); // облёт за 1 секунду (требование владельца)
    const e = k*k*(3 - 2*k); // smoothstep
    // финиш РОВНО в 2π (≡ 0): раньше облёт кончался на 0.35+2π, а finishIntro
    // ставил 0 — скачок ~20° в последний кадр («дёргается» — баг владельца)
    camAz = 0.35 + e*(Math.PI*2 - 0.35);
    camPhi = 1.25 + (0.45 - 1.25)*e; // сбоку -> сверху
    camR = 17.8 + (16.2 - 17.8)*e;
    updateCamera();
    if (k >= 1) finishIntro();
  }
}

// Сон физики: в покое интегратор ВЫКЛЮЧЕН — предметы лежат абсолютно
// неподвижно (микродрожь от вечной борьбы гравитации с коррекцией
// нервировала владельца). Будим на любое событие, меняющее массу.
let physAwake = true, calmT = 0, wakeAtMs = 0, vibT = 0;
const psLog = []; // диагностика: журнал сна/пробуждений {t, ev, src, v}
function wakePhysics(src){
  psLog.push({ t: Math.round(performance.now()), ev: 'wake', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  if (!physAwake) wakeAllBodies();
  physAwake = true; calmT = 0; wakeAtMs = performance.now();
}
function sleepPhysics(src){
  // спасённый (телепортированный из стены) должен ДООСЕСТЬ — сон отменяется,
  // иначе замораживали предмет в воздухе на новом месте; уснём на след. штиле
  if (rescueSweep() > 0){ calmT = 0; return; }
  psLog.push({ t: Math.round(performance.now()), ev: 'sleep', src: src || '?', v: +maxBodySpeed().toFixed(1) });
  if (psLog.length > 200) psLog.shift();
  physAwake = false; calmT = 0;
  sleepAllBodies();
  if (level) refreshAccessibility(); // финальный срез по уснувшей куче
}
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  if (skyMat) skyMat.uniforms.uResY.value = renderer.domElement.height; // экранный градиент лихорадки
}
addEventListener('resize', resize);

// ПАУЗА: замораживаем игру целиком; все якоря НА ЧАСАХ (таймер миксера,
// окна комбо/цепи, t0, форс-сон) на резюме сдвигаются на длительность паузы —
// пауза не «съедает» простой и не гасит серию
let paused = false, pausedAt = 0;
// setTimeout-хвосты игровых цепочек (удаление матча, помол, финал) НЕ замирают
// с паузой: колбэк, созревший под паузой, доделал бы removeItem/checkEnd —
// вплоть до победы на застывшем экране. Такие колбэки оборачиваются в
// afterPause: под паузой откладываются в очередь, resumeGame их дренирует.
const pausedQueue = [];
function afterPause(fn){ if (paused) pausedQueue.push(fn); else fn(); }
function pauseGame(){
  if (paused || intro || !level || level.over) return;
  paused = true; pausedAt = performance.now();
  // ⚠️ НЕ писать textContent в #eyes: это SVG-конструкция персонажа
  // (85-hud) — текст уничтожил бы слои. Лицо просто застывает стоп-кадром.
  show('pauseOverlay');
}
function resumeGame(){
  if (!paused) return;
  const d = performance.now() - pausedAt;
  stats.t0 += d; stats.lastAction += d;
  if (level.nextGrind) level.nextGrind += d;
  wakeAtMs += d;
  if (comboUntil) comboUntil += d;
  if (chainUntil){ chainUntil += d; chainNextDrop += d; chainNextBolt += d; }
  if (lastMatchMs) lastMatchMs += d;
  if (grindStartMs) grindStartMs += d; // огонь помола — тоже якорь на часах
  lastT = performance.now(); // без гигантского dt на первом кадре
  paused = false;
  // дренаж отложенных цепочек СТРОГО после paused=false (иначе afterPause
  // вернул бы их в очередь) и после сдвига якорей — колбэки читают часы
  pausedQueue.splice(0).forEach(fn => { try { fn(); } catch(e){} });
  hide('pauseOverlay');
  updateHUD();
}
function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  const rawMs = now - lastT;
  let dt = Math.min(0.033, rawMs/1000); lastT = now;
  if (paused){ renderer.render(scene, camera); return; } // стоп-кадр (до перф-метра — пауза не портит статистику кадров)
  perfFrames++;
  if (perfFrames > 5){ // первые кадры — прогрев страницы, в статистику не идут
    frameRing.push(rawMs); if (frameRing.length > 600) frameRing.shift();
    if (rawMs > perfWorstMs) perfWorstMs = rawMs;
  }
  if (intro) tickIntro(dt);
  if (physAwake){
    // в интро физика ускорена: заполнение чаши на 30% быстрее (спека
    // владельца), камера при этом идёт по реальному времени — облёт прежний
    stepPhysics(intro ? dt * INTRO_TIME_SCALE : dt);
    if (perfFrames > 5){ stepRing.push(stepMsLast); if (stepRing.length > 600) stepRing.shift(); }
    const maxV = maxBodySpeed();
    const noAnim = !items.some(i=>i.alive && i.animating);
    // штиль: скорости тел малы, анимаций нет — замораживаем до следующего
    // события. НЕ в интро: мгновение тишины между слоями сыплющегося столба —
    // ещё не штиль, сон заморозил бы осадку (и интро-утряска не будит физику)
    if (!intro && maxV < 0.25 && noAnim){
      calmT += dt;
      if (calmT > 0.4) sleepPhysics('calm');
    } else calmT = 0;
    // медленное докатывание круглых форм может длиться долго — через 3 с
    // бодрствования усыпляем принудительно. ⚠️ ТОЛЬКО ПРИ ПОЧТИ-ШТИЛЕ и НЕ в
    // интро: форс-сон по чистым часам замораживал столб, падающий на v≈17
    // (зависшие в воздухе предметы — баг владельца); докатывание — это v<2
    if (!intro && maxV < 2.0 && noAnim && now - wakeAtMs > 3000) sleepPhysics('force3s');
  }
  // отложенная финализация заполнения: как только куча после интро осела
  if (pendingTrim && !intro && (!physAwake || maxBodySpeed() < 1.0)){
    pendingTrim = false;
    finalizeFill();
  }
  stepFX(dt);
  tickVeil(dt);
  tickDepthTint(dt); // ГРАФИКА: верх кучи для тонировки по глубине (10-stage)
  tickFace(now); // ИНТЕРФЕЙС: персонаж-глаза (эмоция+взгляд+зрачок-индикатор турбо); заменил tickChainBar
  tickCamFollow(dt); // камера сама опускается за кучей по мере разбора (90-input, спека владельца)
  // комбо-буст обязан погаснуть и на СПЯЩЕЙ куче (refresh в штиле не тикает,
  // а тап читает CFG.matchRadius напрямую — залипший буст был бы читом)
  if (comboUntil && now > comboUntil){
    comboUntil = 0; comboCount = 0; comboLevel = 0;
    updateMatchRadius(); updateHUD();
  }
  // цепная реакция: досыпка по тику; гаснет по таймеру / CHAIN_MISSES=2
  // промахам / финалу-концу (досыпать пары в финал миксера нельзя — он бы прервался)
  if (chainUntil){
    if (level.over || now > chainUntil || stats.misses - chainStartMisses >= CHAIN_MISSES || !hasAnyPair()){
      chainUntil = 0; comboCount = 0; chainSeries = 0; chainCarry = 0;
      updateMatchRadius(); updateHUD();
    } else if (now >= chainNextDrop){
      chainNextDrop = now + CHAIN_DROP_MS;
      chainRefill();
    }
    // амбиентный треск: короткие дуги между верхними предметами
    if (chainUntil && now >= chainNextBolt){
      chainNextBolt = now + 200 + Math.random()*160;
      const topmost = items.filter(i => i.alive && !i.animating).sort((a,b) => b.p.y - a.p.y).slice(0, 24);
      if (topmost.length > 3){
        const a0 = topmost[Math.floor(Math.random()*topmost.length)];
        const b0 = topmost[Math.floor(Math.random()*topmost.length)];
        if (a0 !== b0 && a0.p.distanceTo(b0.p) < 5.5) boltFX(a0.p, b0.p);
      }
    }
  }
  // фон-лихорадка: низ неба наливается красным (сильнее в цепной реакции)
  if (skyMat){
    // подогрев фона растёт с длиной серии: чем ближе цепь — тем гуще зелень
    const target = chainUntil ? 1 : (comboUntil > now ? 0.3 + 0.5 * Math.min(1, comboCount / CHAIN_COMBO_AT) : 0);
    const cur = skyMat.uniforms.uCombo.value, stepK = dt / 0.35;
    skyMat.uniforms.uCombo.value = cur < target ? Math.min(target, cur + stepK) : Math.max(target, cur - stepK);
  }
  // тики по реальным часам (не по dt): при низком FPS детект тупика/миксера
  // не растягивается. В ШТИЛЕ доступность не пересчитывается вовсе —
  // предметы неподвижны, она не может измениться (перф: refresh ~десятки мс)
  if (physAwake && now - lastAccMs > 300){ lastAccMs = now; refreshAccessibility(); }
  // миксер: финальная зачистка остатков без пар; иначе — наказание за простой
  let grinding = false;
  if (!level.over && !intro){
    const anyAlive = items.some(i=>i.alive);
    const idle = (now - stats.lastAction)/1000;
    if (anyAlive && !hasAnyPair()){
      grinding = true;
      if (now >= level.nextGrind){ level.nextGrind = now + 500; finaleGrind(); }
    } else if (idle > level.idleLimit && anyAlive){
      grinding = true;
      if (now >= level.nextGrind){
        level.nextGrind = now + MIXER_PERIOD*1000;
        mixerGrind();
      }
    }
  }
  // фон-помол: ВЕРХ неба наливается красным — ЛЕСЕНКА УГРОЗЫ (спека владельца
  // 2026-07-21-г). Работают лопасти -> цель 1.0; иначе за <GRIND_LEAD с до помола
  // цель растёт САМА по таймеру (GRIND_LEAD−left)/GRIND_LEAD «медленно»; матч
  // сбрасывает lastAction -> left подскакивает до idleLimit -> цель 0. Гаснет
  // БЫСТРЕЕ, чем растёт (вниз GRIND_FADE_DN ~0.2 с, вверх GRIND_FADE_UP ~0.35 с).
  // Гейты intro/over и сигнал grinding — те же, что у миксера выше. Правка в
  // 99-main санкционирована диспетчером (спека 2026-07-21-в/г): таймер живёт тут.
  if (skyMat){
    let gTgt = 0;
    if (grinding) gTgt = 1;
    else if (!level.over && !intro && items.some(i=>i.alive)){
      const left = level.idleLimit - (now - stats.lastAction)/1000; // сек до помола
      if (left < GRIND_LEAD) gTgt = Math.min(1, Math.max(0, (GRIND_LEAD - left)/GRIND_LEAD));
    }
    const gCur = skyMat.uniforms.uGrind.value;
    const gStep = dt / (gTgt < gCur ? GRIND_FADE_DN : GRIND_FADE_UP); // вниз быстрее подъёма
    skyMat.uniforms.uGrind.value = gCur < gTgt ? Math.min(gTgt, gCur + gStep) : Math.max(gTgt, gCur - gStep);
  }
  // лопасти: стоят, пока миксер не работает (владельца нервировало холостое вращение)
  mixerSpeed += ((grinding ? 14 : 0) - mixerSpeed) * Math.min(1, dt*3);
  mixerBlades.rotation.y += mixerSpeed * dt;
  // работающий миксер ВИБРИРУЕТ массу: нижним слоям лёгкие импульсы
  if (grinding){
    if (!physAwake) wakePhysics('grind');
    wakeAtMs = now; // при перемалывании не засыпаем принудительно
    vibT += dt;
    if (vibT > 0.12){
      vibT = 0;
      for (const it of items){
        if (!it.alive || it.animating || !it.body) continue;
        if (it.p.y < FLOOR_REST + 2.2){
          impulseBody(it, (Math.random()-0.5)*0.4, Math.random()*0.3, (Math.random()-0.5)*0.4);
        }
      }
    }
  }
  // ОТСЧЁТ ДО ПОМОЛА — КАЖДЫЙ КАДР (жалоба владельца: «таймер под глазами
  // запаздывает и дёргается»): в 600-мс HUD-тике граница секунды проскакивала
  // и число меняло значение неравномерно. grinding уже посчитан выше; DOM
  // трогаем только при СМЕНЕ текста — перерисовка SVG-обводки не бесплатна.
  {
    let txt = '', fireOn = false;
    if (!intro && !level.over && items.some(i => i.alive)){
      const idleS = (now - stats.lastAction) / 1000;
      // при работе лопастей вместо красного «0» — слово Grinding (спека
      // владельца); и число, и слово всегда чёрные с белой обводкой (CSS)
      txt = grinding ? 'Grinding' : String(Math.max(0, Math.ceil(level.idleLimit - idleS)));
      // ОГОНЬ у глаз (правка владельца 2026-07-22): ТОЛЬКО после 3 с
      // непрерывного помола — эскалация уже идущего Grinding, а не телеграф
      // приближения (тот несёт красная лесенка неба). Матч рвёт помол ->
      // якорь сбрасывается, огонь гаснет.
      if (grinding){
        if (!grindStartMs) grindStartMs = now;
        fireOn = now - grindStartMs >= FIRE_AFTER_GRIND_MS;
      } else grindStartMs = 0;
    } else grindStartMs = 0;
    if (fireOn !== lastFireOn){
      lastFireOn = fireOn;
      $('fFire').classList.toggle('on', fireOn);
      // конструкция опускается под корону (решение владельца; подрежим —
      // FIRE_DROP_MODE в 00-config): 'fire' — вместе с огнём, 'always' —
      // класс ставится один раз ниже и не снимается
      if (FIRE_DROP_MODE === 'fire') $('face').classList.toggle('dropped', fireOn);
    }
    if (txt !== lastMtText){
      lastMtText = txt;
      if (!txt){
        $('mixerTimerSvg').style.display = 'none';
      } else {
        const mt = $('mixerTimer');
        mt.textContent = txt;
        mt.classList.toggle('grind', txt === 'Grinding');
        $('mixerTimerSvg').style.display = 'block';
      }
    }
  }
  if (now - lastHudMs > 600){
    lastHudMs = now;
    updateEyes(now, grinding);
    const ap = availablePairs();
    $('apCount').textContent = ap;
    const alive = items.some(i=>i.alive);
    const noMoves = alive && ap === 0 && !level.over;
    const idle = (now - stats.lastAction)/1000;
    // Красный баннер УДАЛЁН (спека владельца 2026-07-19): всю коммуникацию
    // несёт таймер-чип в левой верхней группе — подложка плывёт из зелёной
    // в красную по мере истечения времени; при помоле — красный «0 с»
    const finale = alive && !hasAnyPair();
    // (отсчёт до помола ПЕРЕЕХАЛ в каждокадровый блок ниже — в 600-мс тике
    // секунды обновлялись то через 0.6 с, то через 1.2 с: «таймер запаздывает
    // и дёргается», жалоба владельца 2026-07-21)
    // тупик: пары в принципе есть, но недоступны, и встрясок нет — ждём 2 стабильных
    // проверки (~1.2 c), чтобы масса доосела; во время финала миксера не срабатывает
    if (noMoves && !finale && level.shakes === 0 && level.adShakes === 0 && !items.some(i=>i.alive && i.animating)){
      level.stuck++;
      if (level.stuck >= 2) showLose();
    } else level.stuck = Math.min(level.stuck, 0);
    // время партии (ЧЁРНОЕ — спека владельца 2026-07-21, был зелёный макета);
    // отсчёт до перемолки — отдельное число под глазами
    if (LEVEL_TIME_IN_HUD && !level.over) $('timer').textContent = fmtTime(Math.round((now-stats.t0)/1000)); // скрытому таймеру и fitStat не нужен
  }
  // стекло РАСТВОРЯЕТСЯ при приближении камеры (спека владельца: вблизи
  // чаша не нужна и мешает совмещать): полная плотность при camR>=13.5,
  // полностью тает к camR<=10 (smoothstep)
  if (bowlMat){
    const gk = Math.max(0, Math.min(1, (camR - 10) / 3.5));
    const k = gk * gk * (3 - 2 * gk);
    bowlMat.uniforms.uFade.value = k;   // стекло — ShaderMaterial (20-arena)
    bowlMesh.visible = k > 0.02;
  }
  // тени перерисовываем только когда что-то движется (свет статичен; в штиле
  // экономим ~150 теневых draw calls каждый кадр)
  renderer.shadowMap.needsUpdate = physAwake || !!intro || mixerSpeed > 0.01 || fx.length > 0;
  if (camShake > 0){
    camShake -= dt;
    updateCamera();
    camera.position.x += (Math.random()-0.5)*camShake*0.8;
    camera.position.y += (Math.random()-0.5)*camShake*0.8;
  }
  renderer.render(scene, camera);
}

// ---------- Отладочный API ----------
window.__game = {
  alive(){ return items.filter(i=>i.alive).length; },
  availablePairs,
  autoMatch(){
    refreshAccessibility();
    const byKey = {};
    for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key]=byKey[it.key]||[]).push(it);
    for (const k in byKey){
      const arr = byKey[k];
      for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
        if (pairMatch(arr[i], arr[j])){ doMatch([arr[i], arr[j]]); return true; }
      }
    }
    return false;
  },
  shake: performShake,
  cfg: CFG,
  regen: genLevel,
  // мгновенно завершить интро (для тестов): синхронная осадка + утряска
  skipIntro(){
    if (!intro) return;
    intro = null;
    for (let s=0; s<300; s++){
      world.step();
      // терминальная скорость и тут: столб падает с ~40 юнитов, v>20
      // пробивала компаунды (латентный источник флейков тестов)
      if (s % 3 === 0) for (const it of items){
        if (!it.alive || !it.body) continue;
        const v = it.body.linvel();
        if (v.y < -16) it.body.setLinvel({ x: v.x, y: -16, z: v.z }, false);
      }
    }
    syncMeshes();
    // вибро-утряска ВСЕЙ массы: свежая куча рыхлая (арки-мосты в конусе),
    // импульсы только верхним мосты не рушат
    for (let round=0; round<8; round++){
      let top = 0;
      for (const it of items) if (it.alive) top = Math.max(top, it.p.y + it.r);
      if (top <= FUNNEL.H - 0.4) break;
      for (const it of items){
        if (it.alive && it.body)
          impulseBody(it, (Math.random()-0.5)*1.4, -0.5 - Math.random()*0.4, (Math.random()-0.5)*1.4);
      }
      for (let s=0; s<70; s++) world.step();
      syncMeshes();
    }
    removeTempTallWall();
    finishIntro();
    pendingTrim = false;
    finalizeFill(); // синхронно: тесты читают topY0/трим сразу после skipIntro
    sleepPhysics('skipIntro');
    renderer.shadowMap.needsUpdate = true; // осадка прошла мимо loop-гейта — тень по финальной куче
  },
  level(){ return level; },
  stats(){ return stats; },
  levelNum(){ return levelNum; },
  adsMode(){ return Ads.mode; },
  // отладка/тесты: принудительный пересчёт доступности и её слепок
  forceRefresh(){ refreshAccessibility(); },
  // диагностика регрессии: сон физики, мигание вуали, «висуны» в воздухе
  awake(){ return { physAwake, sinceWakeMs: physAwake ? Math.round(performance.now() - wakeAtMs) : 0, maxV: +maxBodySpeed().toFixed(2) }; },
  accFlips(){ return accFlips; },
  // v1: кошелёк и звёзды (тесты экономики)
  wallet(){ return { coins: coins(), ce: Save.ce, cs: Save.cs, hints: hints(), stars: Object.assign({}, Save.stars), total: totalStars() }; },
  grant(n){ addCoins(n); updateHUD(); },
  combo(){
    const n = performance.now();
    let top = 0, airborne = 0;
    for (const it of items) if (it.alive){ if (it.p.y < FUNNEL.H) top = Math.max(top, it.p.y + it.r); else airborne++; }
    return { hot: comboUntil > n, count: comboCount, level: comboLevel, chain: chainUntil > n, series: chainSeries, radius: +CFG.matchRadius.toFixed(2),
      top: +top.toFixed(2), airborne, nextDropIn: chainUntil ? Math.round(chainNextDrop - n) : null };
  },
  psLog(){ return psLog.slice(); },
  sfx(){ return Sound.loaded(); }, // какие аудио-сэмплы декодированы
  // перф-срез для соак-теста и замеров на устройствах (см. soak.js):
  // времена кадра/шага физики за последние ~10 с + счётчики ресурсов,
  // по которым ловятся утечки (тела/коллайдеры/меши/геометрии/DOM/куча)
  perfStats(){
    const q = a => {
      if (!a.length) return { avg: 0, p95: 0, max: 0 };
      const s = a.slice().sort((x, y) => x - y);
      return { avg: +(s.reduce((t, v) => t + v, 0)/s.length).toFixed(2),
        p95: +s[Math.min(s.length-1, Math.floor(s.length*0.95))].toFixed(2),
        max: +s[s.length-1].toFixed(2) };
    };
    return { frame: q(frameRing), step: q(stepRing), frames: perfFrames, worstMs: +perfWorstMs.toFixed(1),
      bodies: world.bodies && world.bodies.len ? world.bodies.len() : -1,
      colliders: world.colliders && world.colliders.len ? world.colliders.len() : -1,
      sceneChildren: scene.children.length, fxN: fx.length,
      geoms: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      domNodes: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : -1 };
  },
  // отладка: телепорт предмета (постановка сцен доступности в тестах)
  place(i, x, y, z){
    const it = items[i];
    if (!it || !it.body) return false;
    it.body.setTranslation({ x, y, z }, true);
    it.body.setLinvel({ x:0, y:0, z:0 }, true);
    it.body.setAngvel({ x:0, y:0, z:0 }, true);
    // ГРАБЛЯ Rapier: query pipeline (castRay) видит телепорт только после
    // world.step() или явной прокачки — иначе лучи бьют по фантому
    if (world.propagateModifiedBodyPositionsToColliders) world.propagateModifiedBodyPositionsToColliders();
    syncMeshes();
    renderer.shadowMap.needsUpdate = true; // autoUpdate=false: телепорт без пробуждения физики оставлял тень на старом месте
    return true;
  },
  floaters(){
    // предмет «висит», если под его нижней точкой пусто больше 0.35.
    // ⚠️ Один луч из центра лжёт про «мосты»: плоский предмет (стейк) лежит
    // КОНЦАМИ на соседях, центр — над полостью, а у стены луч уходит мимо
    // диска пола сквозь клиновые щели внешних краёв ступенчатых панелей
    // (соак 2026-07-20, сид 101). Честная опора — контактные пары Rapier:
    // висун = gap>0.35 И contacts===0. contacts>0 при gap>0.35 — «мост», норма.
    const ray = new RAPIER.Ray({ x:0, y:0, z:0 }, { x:0, y:-1, z:0 });
    const out = [];
    for (const it of items){
      if (!it.alive || !it.body) continue;
      ray.origin.x = it.p.x; ray.origin.y = it.p.y - it.r - 0.02; ray.origin.z = it.p.z;
      if (ray.origin.y <= FLOOR_REST + 0.05) continue; // лежит на дне
      const hit = world.castRay(ray, 30, true, null, null, null, it.body);
      // Rapier 0.12+ переименовал toi -> timeOfImpact: с hit.toi зазор был
      // undefined, и floaters видел ТОЛЬКО случаи «луч не попал вовсе»
      // (gap=30) — конечные зависания молчали (нашлось соаком 2026-07-20)
      const gap = hit ? (hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi) : 30;
      if (gap > 0.35) out.push({ name: it.type.name, y: +it.p.y.toFixed(2),
        d: +Math.hypot(it.p.x, it.p.z).toFixed(2), gap: +gap.toFixed(2),
        contacts: this.contacts(items.indexOf(it)).touching, sleeping: it.body.isSleeping() });
    }
    return out;
  },
  // контактные пары нарровой фазы предмета i: pairs — соседи по AABB,
  // touching — с реальными точками контакта. Пары живут и на спящей куче
  // (наш глобальный сон не зовёт world.step, граф остаётся от последнего шага);
  // -1 = API недоступен (страховка на смену версии Rapier)
  contacts(i){
    const it = items[i];
    if (!it || !it.body || !world.contactPairsWith) return { pairs: -1, touching: -1 };
    let pairs = 0, touching = 0;
    try {
      for (let c = 0; c < it.body.numColliders(); c++){
        const col = it.body.collider(c);
        world.contactPairsWith(col, other => {
          pairs++;
          world.contactPair(col, other, m => { if (m.numContacts() > 0) touching++; });
        });
      }
    } catch (e){ return { pairs: -1, touching: -1 }; }
    return { pairs, touching };
  },
  accessibleList(){
    const out = [];
    items.forEach((it, i) => { if (it.alive && it.accessible) out.push(i); });
    return out;
  },
  // слепок по типам: сколько живых и сколько из них доступно
  typesSnapshot(){
    const m = {};
    items.forEach(it => {
      if (!it.alive) return;
      const n = it.type.name;
      (m[n] = m[n] || { alive: 0, acc: 0 }).alive++;
      if (it.accessible) m[n].acc++;
    });
    return m;
  },
  cam(){ return { az: +camAz.toFixed(3), phi: +camPhi.toFixed(3), r: +camR.toFixed(2), ty: +camTarget.y.toFixed(2), intro: !!intro }; },
  // отладка: поиск NaN в состоянии предметов
  scanNaN(){
    const bad = [];
    items.forEach((it, i) => {
      const ok = isFinite(it.p.x + it.p.y + it.p.z)
        && isFinite(it.mesh.position.x + it.mesh.position.y + it.mesh.position.z);
      if (!ok) bad.push({ i, name: it.type.name, alive: it.alive, p: [it.p.x, it.p.y, it.p.z] });
    });
    return bad;
  },
  topY(){ let m = 0; for (const it of items) if (it.alive) m = Math.max(m, it.p.y + it.r); return m; },
  // отладка/тесты: уникальные множители размера живых предметов (спека
  // «первые 15 уровней — один размер»: до ур.15 включительно ровно [1])
  sizes(){
    const s = new Set();
    for (const it of items) if (it.alive && !it.surprise) s.add(+((it.scl || 0) / MESH_SCALE).toFixed(3));
    return [...s].sort((a, b) => a - b);
  },
  // максимальный ВЫСТУП края предмета за внутреннюю поверхность стекла
  // (>0 — предмет визуально в стекле/снаружи; допуск ~0.0 благодаря WALL_GAP)
  maxWallExcess(){
    let worst = -99, who = '';
    for (const it of items){
      if (!it.alive) continue;
      const d = Math.hypot(it.p.x, it.p.z);
      const ex = (d + (d > 1e-3 ? radialReach(it, it.p.x / d, it.p.z / d) : (it.wallR || it.r))) - radiusAt(it.p.y);
      if (ex > worst){ worst = ex; who = it.type.name + ' y=' + it.p.y.toFixed(2) + ' d=' + d.toFixed(2)
        + ' wall=' + radiusAt(it.p.y).toFixed(2) + ' r=' + it.r.toFixed(2); }
    }
    return { excess: +worst.toFixed(3), who };
  },
  topItem(){ let best = null; for (const it of items) if (it.alive && (!best || it.p.y + it.r > best.p.y + best.r)) best = it;
    return best ? { name: best.type.name, y: +(best.p.y + best.r).toFixed(2), meshY: +best.mesh.position.y.toFixed(2), sleeping: best.body ? best.body.isSleeping() : null } : null; },
  // отладка: оставить по одному предмету каждого типа (для теста финала миксера)
  leaveSingles(){
    const seen = new Set();
    for (const it of items){
      if (!it.alive) continue;
      if (seen.has(it.key)){ removeItem(it); }
      else seen.add(it.key);
    }
    wakePhysics('leaveSingles');
    refreshAccessibility(); updateHUD();
  },
};

// Старт асинхронный: сперва WASM-инициализация Rapier
if (!window.RAPIER){
  window.__fatal && window.__fatal('Physics engine (Rapier) failed to load.');
} else {
  RAPIER.init().then(() => {
    initPhysicsWorld();
    resize(); updateCamera(); Ads.init(); genLevel(); loop();
    grabKeyFocus(); // Space работает с первого кадра, без клика по чаше
  }).catch(e => { window.__fatal && window.__fatal('Physics init failed: ' + e.message); });
}
