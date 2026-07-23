// ===== 85-hud: DOM-хелперы и обновление интерфейса =====

function $(id){ return document.getElementById(id); }
function show(id){ $(id).style.display = 'flex'; }
function hide(id){ $(id).style.display = 'none'; }
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.opacity = 0; }, 1600);
}
function fmtTime(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
// ===== Персонаж: 7 эмоций + живая анимация (ассеты владельца, Figma 741:1420) =====
// Четыре НЕЗАВИСИМЫХ слоя: ЭМОЦИЯ (какая форма) + ВЗГЛЯД (куда смотрят
// зрачки) + РЕАКЦИЯ (короткий всплеск) + МОРГАНИЕ. Круглая пара
// параметрическая: зрачок ездит ±24 и меняет размер 15..50 в единицах
// viewBox — этим покрыты семейства eyes-0 (взгляд/размер), eyes-2 (хитрые)
// и eyes-5 (подмигивание). Несводимые формы — отдельными слоями SVG.
// Дуги eyes-4-4 УДАЛЕНЫ (спека владельца 2026-07-21): «добрые» показываем
// не формой, а РАЗМЕРОМ зрачков — асимметрией eyes-5 (741:1357).
const FACE_LAYER = { calm:'fRound', surprised:'fRound', sly:'fRound', rolled:'fRound',
  closed:'fRound', kind:'fRound', angry:'fAngry', lose:'fX', sad:'fSad' };
// Геометрия из ассетов (viewBox 240×120): белок r60, зрачок r29.
const EYE_R = 60, PUP_MIN = 15, PUP_WIDE = 50;
// eyes-5 (асимметрия из ассета: левый зрачок 40 в белке 60; правый белок 44
// со зрачком 12) — СЕРИЯ ТУРБО (решение владельца 2026-07-21: второе турбо,
// собранное внутри активного, = серия; ядро считает chainSeries в 60-access)
const EYE5_PL = 40, EYE5_PR = 12, EYE5_WR = 44;
const FACE_GAZE = {                    // смещения зрачков [левый, правый]
  rolled: [[0,-24],[0,-24]],           // eyes-0-5: закатились вверх
  sly:    [[-16,-16],[16,16]],         // eyes-2: один вверх-влево, другой вниз-вправо
};
const PUP_BASE = 29;                   // радиус зрачка в покое (eyes-0)
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0, faceHoldFrom = 0;
let lookVec = null, lookUntil = 0, wander = [0,0], wanderAt = 0, dart = [0,0], dartAt = 0;
let pupPulseUntil = 0, lastScoreSeen = null;
// Приоритет сверху вниз. Лесенка угрозы: спокойные -> закатанные -> хитрые -> злые
function eyesMood(now, grinding){
  if (!level || intro) return 'calm';
  if (level.over) return items.every(i => !i.alive) ? 'kind' : 'lose'; // ✕✕ из набора
  if (chainUntil > now) return 'surprised';       // турбо
  if (grinding) return 'angry';                   // лопасти едят вещи
  const idle = (now - stats.lastAction)/1000;
  if (level.idleLimit - idle <= 3) return 'sly';  // предвкушение: ≤3 с до перемолки
  if (comboUntil > now) return 'kind';            // горит серия
  if (idle > 8) return 'rolled';                  // заскучал
  return 'calm';
}
// Диск заряда у курсора (tickChainBar) УДАЛЁН: индикатор турбо теперь
// РАЗМЕР ЗРАЧКА персонажа (спека владельца в чате ИНТЕРФЕЙСА: «полоски
// нет, копит глаз») — см. eyeSizes ниже. CHAIN_RING_ENABLED в 00-config
// остался мёртвым флагом истории.
// короткая реакция поверх состояния (тап по глазам, промах, сюрприз)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; faceHoldFrom = 0; }
// зрачки поворачиваются к точке экрана (тап игрока) на 1.4 с
function faceLook(x, y){
  const r = $('face').getBoundingClientRect();
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const k = 24 * Math.min(1, d / 260);          // чем дальше тап, тем сильнее косит
  lookVec = [dx / d * k, dy / d * k];
  lookUntil = performance.now() + 1400;
}
function facePulse(){ pupPulseUntil = performance.now() + 180; } // «ах!» на матче
// РАЗМЕРЫ ЗРАЧКОВ И БЕЛКОВ, отдельно для левого и правого глаза.
// Драматургия буста (спека владельца): копится — зрачки РАСТУТ 29->50;
// как только буст набран — резко СЖИМАЮТСЯ до 15 (eyes-0-1) и катаются.
function eyeSizes(now, state){
  const s = { pl: PUP_BASE, pr: PUP_BASE, wl: EYE_R, wr: EYE_R };
  if (chainUntil > now){
    if (chainSeries >= 2){                       // СЕРИЯ турбо: асимметрия eyes-5
      s.pl = EYE5_PL; s.pr = EYE5_PR; s.wr = EYE5_WR; return s;
    }
    s.pl = s.pr = PUP_MIN; return s;             // обычное турбо: сжались, катаются
  }
  if (state === 'surprised'){ s.pl = s.pr = PUP_WIDE; return s; }
  if (state === 'kind'){
    // НАБОР БУСТА: зрачки растут 29 -> 50 по мере серии (спека владельца).
    // Дуги eyes-4-4 этим и заменены — размером, а не формой.
    const t = Math.min(1, comboCount / CHAIN_COMBO_AT);
    s.pl = s.pr = PUP_BASE + (PUP_WIDE - PUP_BASE) * t;
    return s;
  }
  if (pupPulseUntil > now){ s.pl = s.pr = PUP_BASE * 1.25; }   // «ах!» на матче
  return s;
}
// КУДА СМОТРЯТ. Вектор задаётся с запасом — реальную амплитуду обрежет
// clampGaze по свободному месту внутри белка.
function gazeFor(now, state){
  if (chainUntil > now){
    // ТУРБО: зрачки КАТАЮТСЯ в РАЗНЫЕ стороны (спека владельца) — один по
    // часовой, другой против, оборот примерно за 1.2 с
    const th = now / 1000 * 5.2;
    const c = Math.cos(th) * 99, sn = Math.sin(th) * 99;       // 99 = «до упора»
    return [[c, sn], [-c, -sn]];
  }
  if (FACE_GAZE[state]) return FACE_GAZE[state];
  if (lookUntil > now && lookVec) return [lookVec, lookVec];
  if (now > wanderAt){ wanderAt = now + 1500 + Math.random() * 1500;
    wander = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 8]; }
  return [wander, wander];
}
// ⚠️ ГЛАВНОЕ ПРАВИЛО (спека владельца): чёрный зрачок НИКОГДА не выходит за
// белок. Свободный ход = радиус белка − радиус зрачка − 1 (запас, чтобы не
// касался края). Без этого распахнутый зрачок при взгляде вбок вылезал наружу.
function clampGaze(vec, pupR, eyeR){
  const room = Math.max(0, eyeR - pupR - 1);
  const d = Math.hypot(vec[0], vec[1]);
  if (d <= room || d === 0) return vec;
  return [vec[0] / d * room, vec[1] / d * room];
}
// тик всей конструкции — каждый кадр (моргание требует мельче 600 мс)
function tickFace(now){
  tickVitrine(now); // витрина сама гейтится медиазапросом и 150 мс
  // РЕАКЦИИ без правок в чужой зоне: следим за счётом. Вырос — зрачок
  // «ахнул», упал (промах −7) — ГРУСТНО смотрят вниз (eyes-1-6, спека
  // владельца). ⚠️ ВО ВРЕМЯ ПОМОЛА реакции ГЛУШАТСЯ: штраф −20 капает
  // каждый помол, и грусть перебивала бы злые глаза — владелец требует
  // «при работе блендера всегда злые».
  if (level && !intro && !lastGrind){
    if (lastScoreSeen === null) lastScoreSeen = stats.score;
    else if (stats.score > lastScoreSeen) facePulse();
    else if (stats.score < lastScoreSeen){
      // естественный вход в грусть: зрачки НЫРЯЮТ вниз (80 мс на круглой
      // паре), затем выезжают веки; после грусти взгляд ещё висит внизу
      lookVec = [0, 18]; lookUntil = performance.now() + 1900;
      faceHold = 'sad'; faceHoldUntil = performance.now() + 780;
      faceHoldFrom = performance.now() + 80; // 80 мс — нырок зрачков до век
    }
    lastScoreSeen = stats.score;
  } else lastScoreSeen = null;
  // время меняет ширину раз в секунду — обжимаем рамку по факту смены
  const tmStr = $('timer').textContent;
  if (tmStr !== tmStrLast){ tmStrLast = tmStr; fitStat('timer'); }
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // моргание 120 мс раз в 4-7 с; в турбо и на помоле не моргаем
  const canBlink = faceState === 'calm' || faceState === 'kind' || faceState === 'rolled';
  if (now > nextBlinkAt && canBlink){
    blinkUntil = now + 120;
    nextBlinkAt = now + 4000 + Math.random() * 3000;
  }
  // помол перебивает всё, включая короткие реакции и моргание;
  // faceHoldFrom задерживает включение hold-состояния (нырок зрачков)
  const holdOn = faceHoldUntil > now && now >= faceHoldFrom;
  const st = lastGrind ? 'angry' : (holdOn ? faceHold : faceState);
  setFace(st, now, blinkUntil > now && st !== 'lose' && !lastGrind);
}
function setFace(state, now, blinking){
  const svg = $('eyes'), layer = FACE_LAYER[state] || 'fRound';
  for (const id of ['fRound','fAngry','fX','fSad'])
    $(id).classList.toggle('on', id === layer);
  svg.classList.toggle('blink', !!blinking);
  if (layer === 'fAngry'){
    // злые СЛЕДЯТ ЗА ЧАШЕЙ (спека владельца): влево -> вправо -> вниз,
    // шаг ~0.8 с; CSS-переход на .p сглаживает; клип держит внутри белка
    const seq = [[-11, 5], [11, 5], [0, 11]];
    const g2 = seq[Math.floor((now || performance.now()) / 800) % 3];
    $('pupAL').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    $('pupAR').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    return;
  }
  if (layer !== 'fRound') return;                 // у прочих слоёв зрачков нет
  const t = now || performance.now();
  const sz = eyeSizes(t, state), g = gazeFor(t, state);
  const gl = clampGaze(g[0], sz.pl, sz.wl), gr = clampGaze(g[1], sz.pr, sz.wr);
  $('pupL').style.transform = 'translate(' + gl[0].toFixed(1) + 'px,' + gl[1].toFixed(1) +
    'px) scale(' + (sz.pl / PUP_BASE).toFixed(3) + ')';
  $('pupR').style.transform = 'translate(' + gr[0].toFixed(1) + 'px,' + gr[1].toFixed(1) +
    'px) scale(' + (sz.pr / PUP_BASE).toFixed(3) + ')';
  $('wL').style.transform = 'scale(' + (sz.wl / EYE_R).toFixed(3) + ')';
  $('wR').style.transform = 'scale(' + (sz.wr / EYE_R).toFixed(3) + ')';
}
let lastGrind = false;
function updateEyes(now, grinding){ lastGrind = !!grinding; faceState = eyesMood(now, grinding); } // мод — раз в 600 мс
// Ночь по тем же границам, что выбор панорамы в 05-sky (skyForNow):
// 18..5. Дублируем сознательно: 05-sky сгенерирован тулзой и руками не
// правится, а ошибка тут стоит лишь оттенка кнопки.
function isNightSky(){
  let h = 12; try { h = new Date().getHours(); } catch(e){}
  return h >= 18 || h < 5;
}
// Обжать svg-рамку по тексту: ширина = длина текста в юнитах viewBox ×
// текущий масштаб (высота/27). Без этого фиксированные рамки давали дыру
// между LV и временем и наезд времени на глаза (скрин владельца).
function fitStat(id){
  const t = $(id), svg = t.ownerSVGElement;
  const u = t.getComputedTextLength() + 3;          // ширина в юнитах viewBox
  // ⚠️ менять надо И viewBox, И css-ширину: svg держит пропорции viewBox
  // (meet) — одна лишь ширина при высоте 42 УМЕНЬШАЛА контент (LV мельче
  // времени на скрине владельца)
  svg.setAttribute('viewBox', '0 0 ' + u.toFixed(1) + ' 27');
  const k = (svg.getBoundingClientRect().height || 27) / 27;
  svg.style.width = (u * k) + 'px';
}
let tmStrLast = '';
function updateHUD(){
  document.documentElement.classList.toggle('night', isNightSky());
  $('lvlNum').textContent = 'LV ' + levelNum; // виден на десктопе/планшете
  fitStat('lvlNum');
  // мобильный макет 741:1738: справа стек «предметов / время / очки».
  // Номера уровня на игровом экране нет, монет тоже (кошелёк — в меню).
  $('pairsLeft').textContent = items.filter(i=>i.alive).length;
  // СПРАВА — ОЧКИ УРОВНЯ под иконкой звезды (спека владельца 2026-07-22-б:
  // «звезды справа это не звезды, а очки. Иконка звезды остается, но подсчет
  // очков идет так же от совмещения или ошибок»). Отменяет короткоживущую
  // спеку «общие звёзды в чипе»: САМИ звёзды теперь только на экране
  // завершения (winStars) и на будущем главном экране (макет владелец
  // покажет позже) — totalStars() в HUD не выводить.
  $('score').textContent = '★ ' + stats.score;
  const btn = $('shakeBtn');
  if (level.shakes > 0){ btn.classList.remove('ad','off'); $('shakeLbl').textContent = 'Shake ×' + level.shakes; }
  else if (level.adShakes > 0){ btn.classList.add('ad'); btn.classList.remove('off'); $('shakeLbl').textContent = '📺 Shake'; }
  else { btn.classList.add('off'); btn.classList.remove('ad'); $('shakeLbl').textContent = 'No shakes'; }
  // чипа монет и счётчика подсказок в макете 741:1738 НЕТ (монеты к тому же
  // скрыты COINS_ENABLED; кошелёк уедет в меню). Заряды подсказок живут в
  // сейве — кнопка просто гаснет при нуле
  $('hintCnt').textContent = hints(); // остаток зарядов бейджем на кнопке
  $('hintBtn').classList.toggle('off', hints() < 1);
  // «Прицел» доступен при деньгах; «Металлоискатель» — пока сюрприз жив и не использован
  $('scopeBtn').style.display = SCOPE_ENABLED ? '' : 'none';
  $('scopeBtn').classList.toggle('off', coins() < PRICE_SCOPE || level.over);
  const sp = items.find(i => i.surprise && i.alive);
  $('magnetBtn').style.display = (MAGNET_ENABLED && sp && !level.detectorUsed && !level.over) ? '' : 'none';
  $('apCount').textContent = availablePairs();
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // динамический; ∞ = эндшпиль
}


// ===== НАКОПЛЕНИЕ ОБЪЕКТОВ: всплывашка апа ступени + музей (каркас) =====
// Контракт с МЕТОЙ (WORKSTREAMS): accSnapshot() -> [{name,count,tier,mult,
// next}], хук onAccTierUp(cb) с {name,tier,mult,item}. Пока меты нет —
// демо-данные с бейджем DEMO; стыковка ниже подхватит настоящие функции
// автоматически, править ничего не придётся.

// --- миниатюра предмета: однокадровый рендер НАСТОЯЩЕГО меша в офскрин-
// канвас. Matcap не зависит от света — портрет честный без ламп. Кэш по
// типу; второй WebGL-контекст один и переиспользуется.
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbCache = {};
// РАЗМЕР БУФЕРА: 132 = 3×44 (витрина/музей) и 2.4×56 (тост) — хватает
// ретине; 96 давало мыло, 176 — лишние 50% веса кэша. Буфер СТРОГО
// КВАДРАТНЫЙ: у потребителей img 100%/100% без object-fit, неквадрат
// сплющит портрет. MARGIN 4% — меньше нельзя: у боксов радиус 10-12,
// углы круглых моделей срезало бы.
const THUMB_PX = 132, THUMB_MARGIN = 0.04, THUMB_Y = 100;
const _thv = new THREE.Vector3(), _thm = new THREE.Matrix4();
function itemThumb(item){
  if (!item || !item.mesh) return null;
  const key = String(item.key);
  if (thumbCache[key]) return thumbCache[key];
  try {
    if (!thumbR){
      thumbR = new THREE.WebGLRenderer({ alpha:true, antialias:true });
      thumbR.setSize(THUMB_PX, THUMB_PX, false);
      thumbR.outputEncoding = renderer.outputEncoding; // без неё цвета уезжают
      thumbScene = new THREE.Scene();
      // ОРТОГРАФИЯ (а не перспектива): проекция аффинная, поэтому кадр
      // считается АНАЛИТИЧЕСКИ за один проход — без чтения пикселей,
      // без второго рендера и без стойла GPU->CPU на readPixels.
      thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
      thumbCam.position.set(1.7, THUMB_Y + 1.35, 2.3);
      thumbCam.lookAt(0, THUMB_Y, 0);
      // на случай CFG.matcap=false (аварийный MeshStandard) — мягкий свет
      thumbScene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5);
      dl.position.set(2, 3, 2); thumbScene.add(dl);
    }
    // ⚠️ НЕ mesh.clone(): three r149 копирует userData через JSON.stringify,
    // а в userData.item лежит тело Rapier — циклическая структура, throw.
    const m = new THREE.Mesh(item.mesh.geometry, item.mesh.material);
    m.scale.copy(item.mesh.scale);
    m.rotation.set(0.42, 0.65, 0);
    // ⚠️ ВЫСОКО НАД СЦЕНОЙ: matcap-патч гасит диффуз по МИРОВОЙ высоте
    // (vWorldY против uPileTop, 10-stage) — портрет на y=0 всегда выходил
    // самым тёмным тоном кучи (замер: до −0.83 по каналу R).
    m.position.set(0, THUMB_Y, 0);
    thumbScene.add(m);
    m.updateMatrixWorld(true);
    thumbCam.updateMatrixWorld(true);
    // КАДР ПО СИЛУЭТУ: bbox проекций ВЕРШИН = bbox силуэта (проекция
    // выпуклой оболочки = оболочка проекций). Прежний код нормировал по
    // ОПИСАННОЙ СФЕРЕ вокруг УЖЕ ПОВЁРНУТОГО AABB — двойная переоценка,
    // силуэт занимал ~55% кадра, вокруг воздух.
    _thm.multiplyMatrices(thumbCam.matrixWorldInverse, m.matrixWorld);
    const pos = m.geometry.attributes.position;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++){
      _thv.fromBufferAttribute(pos, i).applyMatrix4(_thm);
      if (_thv.x < x0) x0 = _thv.x; if (_thv.x > x1) x1 = _thv.x;
      if (_thv.y < y0) y0 = _thv.y; if (_thv.y > y1) y1 = _thv.y;
    }
    // ОДНА полурамка на обе оси — пропорции целы, вытянутое не растянется
    const half = Math.max(Math.max(x1 - x0, y1 - y0) / 2 * (1 + 2 * THUMB_MARGIN), 1e-4);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    thumbCam.left = cx - half; thumbCam.right = cx + half;
    thumbCam.top = cy + half;  thumbCam.bottom = cy - half;
    thumbCam.updateProjectionMatrix();
    // ⚠️ ВУАЛЬ НЕДОСТУПНОСТИ красит material.color лерпом к серому
    // (tickVeil, 60-access): снимок в этот момент лёг бы в кэш СЕРЫМ
    // НАВСЕГДА. На время рендера возвращаем исходный цвет типа.
    // ⚠️ С 2026-07-23 вуаль живёт ещё и В ШЕЙДЕРЕ (uVeil, режим 'desat'):
    // одного восстановления color МАЛО — обесцвеченный портрет так же
    // осел бы в кэше навсегда. Гасим обе ручки на время снимка.
    const col = m.material.color, saved = (item.baseColor && col) ? col.clone() : null;
    if (saved) col.copy(item.baseColor);
    const sh = m.material.userData && m.material.userData.shader;
    const savedVeil = sh ? sh.uniforms.uVeil.value : 0;
    if (sh) sh.uniforms.uVeil.value = 0;
    const savedOp = m.material.opacity;
    m.material.opacity = 1;
    thumbR.render(thumbScene, thumbCam);
    m.material.opacity = savedOp;
    if (sh) sh.uniforms.uVeil.value = savedVeil;
    if (saved) col.copy(saved);
    const url = thumbR.domElement.toDataURL();
    thumbScene.remove(m);
    thumbCache[key] = url;
    return url;
  } catch(e){ console.warn('itemThumb:', e && e.message); return null; }
}

// --- всплывашка: очередь, показываем по одной ~2.2 с ---
const tierQueue = [];
let tierBusy = false;
function fmtMult(m){ return '×' + (+m).toFixed(2).replace(/\.?0+$/, ''); }
function showTierUp(ev){ tierQueue.push(ev); if (!tierBusy) nextTierToast(); }
function nextTierToast(){
  const ev = tierQueue.shift();
  if (!ev){ tierBusy = false; return; }
  tierBusy = true;
  const t = $('tierToast');
  // СОСЕДСТВО С ВИТРИНОЙ (десктоп, витрина теперь СЛЕВА, v1-test-74):
  // при видимой витрине всплывашка ПОДНИМАЕТСЯ над её верхом — читается
  // как «выпрыгнула из карточки». Глушить тост не стали: он прямая спека
  // владельца («красивый эффект»), а витрина показывает ап лишь тихой
  // полоской. При camnear-скрытой витрине и на мобайле — прежний угол.
  const vit = $('vitrine');
  // панель считается видимой, только если она НЕ погашена ни одним из
  // своих состояний: camnear (камера близко) и vempty (всё собрано)
  const vitShown = vit && getComputedStyle(vit).display !== 'none' &&
    !document.documentElement.classList.contains('camnear') &&
    !vit.classList.contains('vempty');
  if (vitShown){
    t.style.bottom = (innerHeight - vit.getBoundingClientRect().top + 12) + 'px';
    t.style.left = '8px'; // в ЛИНИЮ с витриной и кнопкой подсказки (обе на 8)
  } else { t.style.bottom = ''; t.style.left = ''; }
  const url = itemThumb(ev.item);
  $('ttImg').style.display = url ? '' : 'none';
  if (url) $('ttImg').src = url;
  // имени предмета в макете 769:56 нет — показываем портрет и множитель
  $('ttMult').textContent = fmtMult(ev.mult || 1);
  t.classList.remove('bye'); void t.offsetWidth;
  t.classList.add('show');
  Sound.play('surprise', 0.6); vibrate([15, 30, 15]);
  setTimeout(()=>{ t.classList.remove('show'); t.classList.add('bye'); }, 1900);
  setTimeout(()=>{ t.classList.remove('bye'); nextTierToast(); }, 2250);
}

// --- музей: открывается ИЗ ПАУЗЫ (paused держится), закрытие — обратно ---
const ACC_TIERS_DEMO = [100, 300, 700, 1500, 3100]; // пороги контракта (×2+100)
function demoAccSnapshot(){
  // демо: живые типы уровня с правдоподобными накоплениями — только чтобы
  // владелец видел каркас; НЕ настоящие данные (бейдж DEMO в шапке)
  const byKey = {};
  for (const it of items) if (it.alive && !it.surprise) (byKey[it.key] = byKey[it.key] || { it, n: 0 }).n++;
  return Object.keys(byKey).slice(0, 12).map((k, i) => {
    const count = 40 + i * 97 % 900 + byKey[k].n * 7;
    let tier = 0; while (tier < ACC_TIERS_DEMO.length && count >= ACC_TIERS_DEMO[tier]) tier++;
    return { name: k, count, tier, mult: 1 + 0.25 * tier,
      next: ACC_TIERS_DEMO[tier] || null, _item: byKey[k].it };
  });
}
function renderMuseum(rows, demo){
  $('museumDemo').style.display = demo ? '' : 'none';
  const list = $('museumList');
  list.innerHTML = '';
  for (const r of rows){
    const row = document.createElement('div');
    row.className = 'mrow';
    const th = document.createElement('div');
    th.className = 'mthumb';
    // ⚠️ фолбэк по КЛЮЧУ типа, не по имени: r.name — человеческий ярлык
    // («Watermelon»), а item.key — 'T{индекс}'; сравнение с name не могло
    // совпасть никогда, и строки без _item молча теряли портрет
    const url = itemThumb(r._item || (items && items.find(i =>
      i.alive && i.type && String(i.type.name) === String(r.key))));
    if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
    else th.textContent = String(r.name || '?').slice(0, 1).toUpperCase();
    const mid = document.createElement('div');
    mid.style.flex = '1'; mid.style.minWidth = '0';
    const frac = r.next ? Math.min(1, r.count / r.next) : 1;
    mid.innerHTML = '<div class="mname"></div><div class="mprog"><i style="width:' +
      (frac * 100).toFixed(0) + '%"></i></div><div class="mcnt">' + r.count +
      (r.next ? ' / ' + r.next : ' · max') + '</div>';
    mid.firstChild.textContent = String(r.name).replace(/[-_]/g, ' ');
    const right = document.createElement('div');
    right.className = 'mmult';
    right.innerHTML = '<b>' + fmtMult(r.mult) + '</b><span>tier ' + r.tier + '</span>';
    row.appendChild(th); row.appendChild(mid); row.appendChild(right);
    list.appendChild(row);
  }
}
function openMuseum(){
  hide('pauseOverlay');
  show('museumOverlay');
  const real = typeof accSnapshot === 'function';
  renderMuseum(real ? accSnapshot() : demoAccSnapshot(), !real);
}
function closeMuseum(){ hide('museumOverlay'); show('pauseOverlay'); }
// стыковка с метой: хук подключаем, как только он появится в сборке
if (typeof onAccTierUp === 'function') onAccTierUp(showTierUp);


// ===== ВИТРИНА УРОВНЯ — макет Figma 768:1061 =====
// ВСЕ типы замеса уровня строкой (спека владельца 2026-07-23 «в блоке нужны
// все объекты уровня»; прежние «5 слотов + авторотация» отменены). Ручной
// скролл невозможен (pointer-events:none, «не мешать игре»). Реалтайм-полоски:
// точечный accCount строк раз в 150 мс. Собранный тип уезжает влево и
// исчезает (vitRotate; очереди на замену больше нет — показаны все).
const VIT_TICK_MS = 150;
let vitLevelRef = null, vitAt = 0, vitSlots = null, vitQueue = null, vitRotating = false;
function vitrineOn(){
  return window.matchMedia && matchMedia('(min-width:1160px) and (pointer:fine)').matches;
}
// ТРИГГЕР РОТАЦИИ — одна функция-предикат (дефолт диспетчера: тип
// ПОЛНОСТЬЮ разобран на уровне; владельцу задан уточняющий вопрос —
// альтернатива «полоска множителя набрана» меняется только здесь)
function vitDone(k, aliveSet){ return !aliveSet.has(k); }
function vitAliveSet(){
  const a = new Set();
  for (const it of items)
    if (it.alive && !it.surprise && !it.bomb && !it.rock && it.type) a.add(String(it.type.name));
  return a;
}
function vitFillCell(cell, entry){
  cell.dataset.key = entry.k;
  const th = cell.querySelector('.vthumb');
  th.innerHTML = '';
  const url = itemThumb(entry.it);
  if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
  else th.textContent = entry.k.slice(0, 1).toUpperCase();
  cell.querySelector('.vname').textContent =
    (typeof accLabel === 'function' ? accLabel(entry.k) : entry.k);
  cell._acc = { last: -1 };
  vitUpdateCell(cell);
}
function vitUpdateCell(cell){
  const k = cell.dataset.key, n = accCount(k);
  if (n === cell._acc.last) return;
  // рост счётчика = я СОВМЕСТИЛ этот тип (first-set с last=-1 не считаем)
  const grew = cell._acc.last >= 0 && n > cell._acc.last;
  cell._acc.last = n;
  const next = accNext(k), tier = accTier(k);
  const prev = tier > 0 ? 100 * (Math.pow(2, tier) - 1) : 0;
  const frac = next ? Math.max(0, Math.min(1, (n - prev) / (next - prev))) : 1;
  cell.querySelector('.vbar i').style.width = (frac * 100).toFixed(1) + '%';
  cell.querySelector('.vmult').textContent = fmtMult(accMult(k));
  if (grew) vitPulse(cell); // ненавязчивая реакция на моё совмещение
}
// короткий подскок портрета + вспышка полоски; рестарт через reflow, чтобы
// частые совмещения подряд перезапускали анимацию, а не глотали её.
// ⚠️ СНИМАЕМ ПРЕДЫДУЩИЙ ТАЙМЕР: без этого при двух матчах одного типа за
// <460 мс (цепь/эндшпиль-∞) старый таймер срывал .hit посреди новой
// анимации — скачок scale (найдено адверс-ревью 2026-07-23)
function vitPulse(cell){
  if (cell._hitT) clearTimeout(cell._hitT);
  cell.classList.remove('hit'); void cell.offsetWidth;
  cell.classList.add('hit');
  cell._hitT = setTimeout(()=>{ cell.classList.remove('hit'); cell._hitT = 0; }, 460);
}
function buildVitrine(){
  vitLevelRef = level;
  const grid = $('vGrid'); grid.innerHTML = '';
  $('vitrine').classList.remove('vempty');
  // очередь — порядок появления типов в замесе уровня
  const seen = new Set(); vitQueue = [];
  for (const it of items){
    if (it.surprise || it.bomb || it.rock || !it.type) continue;
    const k = String(it.type.name);
    if (!seen.has(k)){ seen.add(k); vitQueue.push({ k, it }); }
  }
  vitSlots = [];
  // ВСЕ типы уровня (спека владельца 2026-07-23 «в блоке нужны все объекты
  // уровня»): раньше показывали 5 с авторотацией — теперь строим весь замес.
  // count фиксируем ДО цикла (vitQueue.shift сокращает длину по ходу).
  const count = vitQueue.length;
  // шаг каскада капим, чтобы разворот не тянулся при многих строках (~0.45 с)
  const step = Math.min(0.07, 0.45 / Math.max(1, count));
  for (let i = 0; i < count; i++){
    const cell = document.createElement('div');
    cell.className = 'vcell';
    cell.innerHTML = '<div class="vthumb"></div><div class="vbody">' +
      '<div class="vname"></div><div class="vbar"><i></i></div></div>' +
      '<div class="vmult"></div>';
    vitFillCell(cell, vitQueue.shift());
    // КАСКАД РАЗВОРОТА: строки приезжают справа по очереди (i·step); .rin
    // снимаем по завершении, чтобы остаточный animation-delay не задержал
    // будущие .hit/.in на этой же ячейке
    cell.style.animationDelay = (i * step) + 's';
    cell.classList.add('rin');
    setTimeout(()=>{ cell.classList.remove('rin'); cell.style.animationDelay = ''; }, 520 + i * step * 1000);
    grid.appendChild(cell);
    vitSlots.push(cell);
  }
}
function vitRotate(aliveSet){
  // одна ротация за раз — уезд 0.28 с, потом замена контента и въезд
  for (const cell of vitSlots){
    if (cell.classList.contains('out') || !cell.dataset.key) continue;
    if (!vitDone(cell.dataset.key, aliveSet)) continue;
    vitRotating = true;
    cell.classList.add('out');
    setTimeout(()=>{
      // из очереди — следующий НЕсобранный (собранные пропускаем насквозь)
      let nxt = null;
      const live = vitAliveSet();
      while (vitQueue.length){ const c = vitQueue.shift();
        if (!vitDone(c.k, live)){ nxt = c; break; } }
      if (nxt){
        vitFillCell(cell, nxt);
        cell.classList.remove('out'); void cell.offsetWidth;
        cell.classList.add('in');
        setTimeout(()=>cell.classList.remove('in'), 360);
      } else {
        cell.dataset.key = ''; cell.style.display = 'none';
        if (vitSlots.every(c => !c.dataset.key))
          $('vitrine').classList.add('vempty'); // все собраны — панель ушла
      }
      vitRotating = false;
    }, 300);
    return; // по одной карточке за тик — очередь уездов не накапливаем
  }
}
function tickVitrine(now){
  if (!vitrineOn()) return;
  // строим ПОСЛЕ интро: на первых кадрах палитровые атласы моделей ещё
  // декодируются (грабля 36-models) — портреты выходили чёрными и
  // навсегда оседали в кэше превью
  if (level && level !== vitLevelRef && !intro) buildVitrine();
  if (!vitSlots || now - vitAt < VIT_TICK_MS) return;
  vitAt = now;
  for (const cell of vitSlots) if (cell.dataset.key) vitUpdateCell(cell);
  if (!vitRotating && !intro && level && !level.over) vitRotate(vitAliveSet());
}
