// ===== 12-matcap-edit: РЕДАКТОР МАТЧЕПОВ В РЕЖИМЕ РАЗРАБОТЧИКА =====
// Слово владельца 2026-08-17: «хорошая штука для редактирования маткапа. Как бы
// нам её добавить в режиме разработчика, чтобы я мог быстро добавлять разный
// материал на объекты и проверять как выглядит на бою?» (референс —
// jverneaut/laboratoire/src/matcap-editor: холст с кистью, размытие, экспорт).
//
// ⚠️⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ РЕФЕРЕНСА — ПРИМЕНЕНИЕ В ЖИВУЮ СЦЕНУ, А НЕ ПРЕВЬЮ НА
// СФЕРЕ. У нас матчепы лежат в кэше ПО ОДНОМУ ОБЪЕКТУ ТЕКСТУРЫ НА ПРЕСЕТ, и
// материалы только ссылаются на него — значит достаточно переписать ПИКСЕЛИ и
// поставить `needsUpdate`, и вся куча меняется в тот же кадр. Материалы при
// этом не трогаются (перекомпиляция шейдера тут не нужна) — тот же приём, что
// у `retuneMatcap`.
//
// ⚠️ МОДУЛЬ 12 — ПОСЛЕ 10-stage (там `makeMatcap`, `matcapCache`, `MATCAP_SIZE`)
// и ДО 20-arena. Функции хойстятся, но КОНСТАНТЫ старших модулей для top-level
// кода младших в TDZ; здесь top-level кода нет вовсе, только объявления.
//
// ⚠️ ОТКРЫВАЕТСЯ ТОЛЬКО РУКАМИ: `__game.matcapEdit()` или кнопка в панели
// разработчика. Сама панель едет в сборке, как и `matcapTuner`.
const MCE_CANVAS = 512;                 // холст рисования — как у референса
let mcePanel = null, mceCtx = null, mcePost = null, mceDrawing = false, mceLast = null;
// сохранённые процедурные пиксели пресетов — чтобы «Сброс» возвращал точно то,
// что было, а не пересчитывал заново (пересчёт зависит от живых ползунков тюнера)
const mceBackup = new Map();

// ЦЕЛИ: наши четыре независимых носителя матчепа. Имена — те же ключи, что
// у `makeMatcap`, плюс лопасти (у них своя текстура из PNG владельца).
// ⚠️⚠️ ПАЧКИ БЕРУТСЯ ИЗ ЖИВОГО ПУЛА, А НЕ СПИСКОМ. Владелец режет и добавляет
// типы (120 → 88 за одну сессию), и переписанный от руки список разошёлся бы с
// игрой при первой же партии моделей — канонная грабля «копия признака рядом с
// рабочей величиной». Имя пачки это поле `tex` у типа, оно же ключ атласа.
function mcePacks(){
  const из = new Set();
  try { for (const t of TYPES) if (t && t.tex) из.add(t.tex); } catch (e) {}
  return [...из].sort();
}
// РУССКИЕ ЯРЛЫКИ ПАЧЕК — для панели; незнакомая пачка показывается как есть,
// а не выпадает из списка (появится новая партия — она сразу видна).
const MCE_PACK_RU = { food:'еда', animal:'звери', car:'машины', brick:'кирпичи',
  pirate:'пиратское', holiday:'праздник', toycar:'машинки', factory:'завод',
  survival:'выживание', forest:'лес' };
function mceTargets(){
  const пачки = mcePacks().map(p => ({ id:'pack:' + p, имя:'пачка: ' + (MCE_PACK_RU[p] || p) }));
  return [
    { id:'tex',   имя:'все текстурные разом' },
    ...пачки,
    { id:'soft',  имя:'крашеные предметы' },
    { id:'metal', имя:'хром' },
    { id:'blades',имя:'лопасти миксера' },
    { id:'bomb',  имя:'бомба' },
  ];
}
// ⚠️ У ПАЧКИ ТЕКСТУРА ПОЯВЛЯЕТСЯ ТОЛЬКО В МОМЕНТ ПРИМЕНЕНИЯ (копирование по
// требованию): до этого она делит общую с остальными, и `mceTexOf` честно
// отдаёт `null` — «своей ещё нет». Создаёт её `mceApply`.
function mcePackOf(id){ return (id && id.indexOf('pack:') === 0) ? id.slice(5) : null; }
function mceTexOf(id){
  if (id === 'blades') return (typeof metalMatcapTex === 'function') ? metalMatcapTex() : null;
  if (id === 'bomb')   return (typeof bombMatcapTex  === 'function') ? bombMatcapTex()  : null;
  const пачка = mcePackOf(id);
  if (пачка) return (typeof packMatcaps !== 'undefined') ? (packMatcaps.get(пачка) || null) : null;
  return makeMatcap(id);
}
// ⚠️⚠️ ПРИМЕНЕНИЕ ИДЁТ ЧЕРЕЗ УМЕНЬШЕНИЕ ДО РАЗМЕРА ЖИВОЙ ТЕКСТУРЫ, А НЕ
// ПОДМЕНОЙ ОБЪЕКТА: процедурные матчепы у нас 128×128 (`MATCAP_SIZE`), и
// показать в игре 512 значило бы показать НЕ ТО, что будет в бою. Экспорт при
// этом остаётся 512 — вшивать в сборку надо полное разрешение.
// ⚠️⚠️ АЛЬФА МАТЧЕПА — ЭТО БЛИК, И ВЛАДЕЕТ ЕЮ ДВИЖОК, А НЕ ХОЛСТ.
// В `matcapSpecPatch` (10-stage) стоит `... + vec3( matcapColor.a )`, то есть
// альфа ПРИБАВЛЯЕТСЯ к поверхности; у процедурных пресетов блик запечён именно
// в неё (`data[i+3] = (sp*255)|0`). Холст же внутри круглой маски НЕПРОЗРАЧЕН
// (заливка шестизначным hex), поэтому копирование RGBA «как есть» ставило
// альфу 255 ВЕЗДЕ и прибавляло единицу ко всей поверхности.
// ⛔ ЗАМЕР ДЕФЕКТА (A/B на ПУСТОМ холсте, без единого мазка, портрет
// `animalbee`): яркость 144.9 → 255.0, насыщенность 0.400 → 0. То есть одно
// применение в редакторе молча выбеливало цель — включая матчепы пачек,
// принятые владельцем по числам (2026-08-18).
// ⚠️ ПРАВИЛО ОДНО И ОНО УЖЕ БЫЛО В ПРОЕКТЕ, я лишь распространил его на
// редактор: у Графики в `08-matcap-packs` библиотечная картинка кладётся с
// `d[i+3] = 0` — «альфа = блик, у библиотечного его нет». Здесь то же самое,
// только сохраняем блик ЦЕЛИ, а не обнуляем: редактор правит ЦВЕТ.
// ⛔ Обнулять альфу В КАНВАСЕ по-прежнему нельзя (канвас premultiplied, при
// альфе 0 браузер отдаёт нулевой RGB) — мы трогаем только сырые байты
// DataTexture, а они про премножение не знают.
function mceAlphaИзДвижка(данные, S, база){
  const b = база && база.image && база.image.data;
  if (!b){                      // блика у базы нет (или это PNG без массива)
    for (let i = 3; i < данные.length; i += 4) данные[i] = 0;
    return 'нет';
  }
  // ⚠️⚠️ ГЕОМЕТРИЮ БАЗЫ БЕРЁМ ПО ОБЕИМ ОСЯМ, А НЕ ПО ОДНОЙ ШИРИНЕ.
  // `packMatcapLoad` (08-matcap-packs) принимает ЛЮБОЙ PNG и кладёт `{width,
  // height}` как есть — квадратность не проверяет никто. Прежняя версия считала
  // базу квадратной по ширине: у картинки 128×64 при S=128 ветка «один-в-один»
  // останавливалась на половине буфера (`i < b.length`), и у нижней половины
  // текселей альфа оставалась 255 с непрозрачного холста — ВЫБЕЛИВАНИЕ
  // ВОЗВРАЩАЛОСЬ на половине сферы. Найдено состязательным разбором 2026-08-19.
  const BW = (база.image.width  || S)  | 0;
  const BH = (база.image.height || BW) | 0;
  if (b.length !== BW * BH * 4){
    // буфер не сходится с заявленной геометрией — читать его вслепую нельзя;
    // безопасный исход тот же, что «блика нет»
    for (let i = 3; i < данные.length; i += 4) данные[i] = 0;
    return 'несходство ' + BW + '×' + BH + ' при ' + b.length;
  }
  if (BW === S && BH === S){
    for (let i = 3; i < данные.length; i += 4) данные[i] = b[i];
    return 'один-в-один';
  }
  // ⚠️ РАЗМЕРЫ РАСХОДЯТСЯ (пресеты 128, картинки пачек 256) — берём ближайший
  // пиксель. Блик у нас крупное мягкое пятно, интерполяция ему не нужна.
  for (let y = 0; y < S; y++){
    const by = Math.min(BH - 1, (y * BH / S) | 0);
    for (let x = 0; x < S; x++){
      const bx = Math.min(BW - 1, (x * BW / S) | 0);
      данные[(y * S + x) * 4 + 3] = b[(by * BW + bx) * 4 + 3];
    }
  }
  return 'ближайший ' + BW + '×' + BH + '->' + S;
}
function mceApply(id){
  const пачка = mcePackOf(id);
  if (пачка && !mceTexOf(id)){
    // ⚠️ ПЕРВОЕ ПРИМЕНЕНИЕ К ПАЧКЕ = РОЖДЕНИЕ ЕЁ СОБСТВЕННОЙ ТЕКСТУРЫ. До него
    // пачка делила общую, и правка растеклась бы на ВСЕ текстурные предметы —
    // ровно то, чего владелец и просил избежать («по пачке»).
    const S = MATCAP_SIZE;
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
    const g0 = tmp.getContext('2d'); g0.imageSmoothingEnabled = true;
    g0.drawImage(mcePost, 0, 0, S, S);
    const данные = new Uint8Array(g0.getImageData(0,0,S,S).data);
    // блик берём у ТОЙ текстуры, которую пачка носила до правки: у пачки с
    // картинкой это её альфа (у Графики она 0), у прочих — пресет `tex`
    const базаПачки = ((typeof packMatcapTex === 'function' && packMatcapTex(пачка)) || makeMatcap('tex'));
    mceAlphaИзДвижка(данные, S, базаПачки);
    const свой = new THREE.DataTexture(данные, S, S, THREE.RGBAFormat);
    свой.encoding = THREE.sRGBEncoding;
    свой.magFilter = свой.minFilter = THREE.LinearFilter;
    свой.needsUpdate = true;
    const n = setPackMatcap(пачка, свой);
    mceBackup.set(id, null);          // «Сброс» вернёт пачку на общую текстуру
    return 'пачка ' + пачка + ': своя текстура ' + S + '×' + S + ', предметов ' + n;
  }
  const tex = mceTexOf(id);
  if (!tex) return 'нет такой цели';
  const S = (tex.image && tex.image.width) ? tex.image.width : MATCAP_SIZE;
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
  const g = tmp.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(mcePost, 0, 0, S, S);
  const src = g.getImageData(0, 0, S, S).data;
  if (!mceBackup.has(id)){
    // копия ДО первой правки — «Сброс» возвращает ровно её
    const d = tex.image && tex.image.data;
    mceBackup.set(id, d ? new Uint8Array(d) : null);
  }
  const dst = tex.image && tex.image.data;
  if (dst && dst.length === src.length){
    // ⚠️ ТОЛЬКО RGB: альфа цели — её собственный блик, он остаётся как был
    for (let i = 0; i < src.length; i += 4){
      dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2];
    }
  }
  else {
    // у PNG-матчепа лопастей data-массива нет — там подменяем сам источник
    tex.image = tmp;
  }
  tex.needsUpdate = true;
  // ⚠️⚠️ ПРАВКА НА МЕСТЕ — И СНИМКИ ПОРТРЕТОВ ПРОТУХЛИ. Объект текстуры тот же,
  // переставлять материалам ничего не надо, но `itemThumb` (85-hud) держит
  // ГОТОВЫЙ PNG вечно. `setPackMatcap` сюда не заходит — он про СМЕНУ объекта,
  // а здесь мы пишем в существующие байты, — поэтому сбрасываем сами. Без этого
  // мазок кистью не двигал карточку коллекции ВООБЩЕ (замер: 67.6/0.730 до и
  // после мазка, один в один). Дефект «протухающие портреты», 2026-08-19.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
  return 'применено: ' + id + ' (' + S + '×' + S + ')';
}
function mceReset(id){
  const пачка = mcePackOf(id);
  if (пачка){ setPackMatcap(пачка, null); mceBackup.delete(id); return; }
  const tex = mceTexOf(id); if (!tex) return;
  const b = mceBackup.get(id);
  if (b && tex.image && tex.image.data && tex.image.data.length === b.length){
    tex.image.data.set(b); tex.needsUpdate = true;
  } else if (typeof retuneMatcap === 'function' && id !== 'blades' && id !== 'bomb'){
    retuneMatcap(id);   // тоже правка НА МЕСТЕ: `bakeMatcap` пишет в `tex.image.data`
  }
  // ⚠️ ОБЕ ветки выше — правка на месте, поэтому снимки портретов надо сбросить
  // ровно так же, как в `mceApply`. Пачечная ветка вышла раньше через
  // `setPackMatcap`, он это делает сам.
  try { if (typeof thumbCacheDrop === 'function') thumbCacheDrop(); } catch (e) {}
}

// ═══ ПАНЕЛЬ ═══ Стиль и приёмы взяты у `matcapTuner` (10-stage): фиксированная
// панель, z-index ВЫШЕ оверлеев, keydown НЕ пускаем в игру (иначе пробел на
// ползунке ушёл бы во встряску).
// ⚠️⚠️ ПРИЗНАК ОТКРЫТОСТИ — ОТДЕЛЬНОЙ ФУНКЦИЕЙ, А НЕ ФЛАГОМ РЯДОМ: панель
// создаётся и сносится ОДНОЙ переменной `mcePanel`, и второй флаг рядом с ней
// разошёлся бы при первом же способе закрытия, о котором он не узнает (закон
// «копия признака расходится с источником», пойман в проекте пятикратно).
// Читает её главный цикл — ради заморозки часов миксера (слово владельца
// 2026-08-17-е «если открыт маткап редактор, то фризим таймер миксера»).
function mceIsOpen(){ return !!mcePanel; }
function matcapEdit(){
  if (mcePanel){ mcePanel.remove(); mcePanel = null; return 'matcap editor: closed'; }
  const p = mcePanel = document.createElement('div');
  p.id = 'matcapEdit';
  p.style.cssText = 'position:fixed; left:10px; top:10px; z-index:21; width:300px;'
    + ' max-height:calc(100vh - 20px); overflow:auto; pointer-events:auto;'
    + ' background:rgba(15,20,30,.96); color:#dfe6f2; border-radius:10px; padding:10px 12px;'
    + ' font:12px/1.35 ui-monospace,Menlo,monospace; box-shadow:0 6px 24px rgba(0,0,0,.45);';
  p.addEventListener('keydown', e => e.stopPropagation());
  const h = document.createElement('div');
  h.textContent = 'MATCAP EDITOR';
  h.style.cssText = 'font-weight:700; letter-spacing:.06em; margin-bottom:8px;';
  p.appendChild(h);

  // ── холст рисования (как у референса) + пост-обработка (база + размытие)
  const draw = document.createElement('canvas'); draw.width = draw.height = MCE_CANVAS;
  mcePost = document.createElement('canvas'); mcePost.width = mcePost.height = MCE_CANVAS;
  mceCtx = draw.getContext('2d');
  mcePost.style.cssText = 'width:276px; height:276px; display:block; border-radius:8px;'
    + ' background:#111; cursor:crosshair; touch-action:none;';
  p.appendChild(mcePost);

  const ctrl = {};
  const мк = (имя, тип, знач, доп) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:6px;';
    const t = document.createElement('span'); t.textContent = имя;
    t.style.cssText = 'flex:0 0 92px; opacity:.8;';
    const el = document.createElement('input'); el.type = тип; el.value = знач;
    if (доп) Object.assign(el, доп);
    el.style.cssText = тип === 'color' ? 'width:38px; height:22px; padding:0; border:0; background:none;'
                                       : 'flex:1 1 auto;';
    row.appendChild(t); row.appendChild(el);
    const vv = document.createElement('span');
    if (тип === 'range'){ vv.style.cssText='width:34px; text-align:right; opacity:.7;';
      vv.textContent = знач; el.addEventListener('input', () => { vv.textContent = el.value; репост(); });
      row.appendChild(vv); }
    // ⚠️ ОБЁРТКА ОБЯЗАТЕЛЬНА: `репост` принимает `тихо`, и голым обработчиком
    // сюда прилетал бы Event — истинный, то есть цвета фона и кисти перестали
    // бы применяться сразу, молча
    else el.addEventListener('input', () => репост());
    p.appendChild(row); return el;
  };
  ctrl.base  = мк('фон',     'color', '#8a8f98');
  ctrl.brush = мк('кисть',   'color', '#ffffff');
  ctrl.size  = мк('размер',  'range', 60,  { min:1, max:256, step:1 });
  ctrl.blur  = мк('размытие','range', 12,  { min:0, max:64,  step:1 });

  // ⚠️ ПОСТ-ОБРАБОТКА КАЖДЫЙ РАЗ РИСУЕТ С НУЛЯ: фон, затем размытый слой кисти.
  // Референс накладывает блюр НА СЕБЯ и копит его от кадра к кадру — у нас это
  // давало бы «расползание» при каждом движении ползунка.
  // ⚠️⚠️ `тихо` — ЭТО НЕ УДОБСТВО, А ЗАПРЕТ ПРИМЕНЯТЬ БЕЗ ПРОСЬБЫ.
  // Панель строится с ВКЛЮЧЁННЫМИ «применять сразу» и целью №0 «все текстурные
  // разом» (`cb.checked = (i === 0)`), а холст на старте — плоская заливка
  // `ctrl.base`. Без этого флага финальный `репост()` в конце сборки клал серую
  // заливку на общий пресет `tex` В МОМЕНТ ОТКРЫТИЯ РЕДАКТОРА: владелец видел
  // порчу, не сделав ни одного клика. ЗАМЕР (портрет `animalcow`, сборка с уже
  // починенной альфой): без панели 209.4/0.106 → после одного лишь открытия
  // 114.3/0.239. Вторая половина дефекта «выбеливание» (2026-08-19).
  // ⚠️ Тихий он ТОЛЬКО на открытии: мазок, ползунок, «Очистить» и брошенный PNG
  // зовут `репост()` без аргумента и применяются сразу — это просил владелец.
  function репост(тихо){
    const g = mcePost.getContext('2d');
    g.setTransform(1,0,0,1,0,0); g.filter = 'none';
    g.fillStyle = ctrl.base.value; g.fillRect(0,0,MCE_CANVAS,MCE_CANVAS);
    g.filter = 'blur(' + ctrl.blur.value + 'px)';
    g.drawImage(draw, 0, 0);
    g.filter = 'none';
    // ⚠️ КРУГЛАЯ МАСКА: матчеп читается по нормали, углы квадрата в выборку не
    // попадают вовсе — но если их не срезать, размытие тащит краевой цвет
    // внутрь сферы и по ободку идёт грязь.
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(MCE_CANVAS/2, MCE_CANVAS/2, MCE_CANVAS/2, 0, Math.PI*2); g.fill();
    g.globalCompositeOperation = 'source-over';
    if (авто.checked && !тихо) mceTargets().forEach(t => { if (цели[t.id].checked) mceApply(t.id); });
  }
  // ── рисование
  const точка = e => { const r = mcePost.getBoundingClientRect();
    return { x:(e.clientX - r.left) / r.width * MCE_CANVAS, y:(e.clientY - r.top) / r.height * MCE_CANVAS }; };
  const штрих = (a, b) => {
    mceCtx.strokeStyle = mceCtx.fillStyle = ctrl.brush.value;
    mceCtx.lineWidth = +ctrl.size.value; mceCtx.lineCap = 'round';
    if (a){ mceCtx.beginPath(); mceCtx.moveTo(a.x,a.y); mceCtx.lineTo(b.x,b.y); mceCtx.stroke(); }
    mceCtx.beginPath(); mceCtx.arc(b.x, b.y, +ctrl.size.value/2, 0, Math.PI*2); mceCtx.fill();
  };
  mcePost.addEventListener('pointerdown', e => { mceDrawing = true; mceLast = точка(e);
    штрих(null, mceLast); репост(); mcePost.setPointerCapture(e.pointerId); });
  mcePost.addEventListener('pointermove', e => { if (!mceDrawing) return;
    const t = точка(e); штрих(mceLast, t); mceLast = t; репост(); });
  mcePost.addEventListener('pointerup', () => { mceDrawing = false; mceLast = null; });

  // ── ЦЕЛИ: на что примерять. Без выбора непонятно, что именно видишь: у нас
  // четыре независимых носителя, и предметы делятся между ними по пачкам.
  const шапка = document.createElement('div');
  шапка.textContent = 'на что примерять';
  шапка.style.cssText = 'margin-top:10px; opacity:.65;';
  p.appendChild(шапка);
  const цели = {};
  mceTargets().forEach((t, i) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:3px;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = (i === 0);
    const s = document.createElement('span'); s.textContent = t.имя; s.style.cssText = 'opacity:.85;';
    row.appendChild(cb); row.appendChild(s); p.appendChild(row);
    цели[t.id] = cb;
  });
  const авто = document.createElement('input'); авто.type = 'checkbox'; авто.checked = true;
  { const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:6px;';
    const s = document.createElement('span'); s.textContent = 'применять сразу (в бою)';
    row.appendChild(авто); row.appendChild(s); p.appendChild(row); }

  // ── КНОПКИ
  const бар = document.createElement('div');
  бар.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;';
  const кн = (текст, фон, действие) => {
    const b = document.createElement('button'); b.textContent = текст;
    b.style.cssText = 'flex:1 1 auto; padding:6px 8px; border:0; border-radius:6px; cursor:pointer;'
      + ' font:inherit; background:' + фон + '; color:#0d1420;';
    b.addEventListener('click', действие); бар.appendChild(b); return b;
  };
  кн('Применить', '#9ce52e', () => { const r = mceTargets()
    .filter(t => цели[t.id].checked).map(t => mceApply(t.id)); console.log(r.join('\n')); });
  кн('Сброс', '#e5484d', () => { mceTargets().forEach(t => { if (цели[t.id].checked) mceReset(t.id); }); });
  кн('Очистить', '#8b93a0', () => { mceCtx.clearRect(0,0,MCE_CANVAS,MCE_CANVAS); репост(); });
  p.appendChild(бар);

  // ⚠️⚠️ ЗАГРУЗКА ГОТОВОГО PNG — ЭТОГО У РЕФЕРЕНСА НЕТ, А ЗАДАЧА ВЛАДЕЛЬЦА
  // ЗВУЧИТ «БЫСТРО ДОБАВЛЯТЬ РАЗНЫЙ материал». Рисовать матчеп с нуля долго,
  // а готовых пачки; перетащил файл — и он на предметах в тот же кадр.
  const дроп = document.createElement('div');
  дроп.textContent = 'перетащи PNG сюда (или кликни)';
  дроп.style.cssText = 'margin-top:8px; padding:10px; border:1px dashed rgba(223,230,242,.35);'
    + ' border-radius:8px; text-align:center; opacity:.7; cursor:pointer;';
  const файл = document.createElement('input'); файл.type = 'file'; файл.accept = 'image/*';
  файл.style.display = 'none';
  const взять = f => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const im = new Image();
      im.onload = () => {
        // кладём в СЛОЙ КИСТИ, а не в пост: тогда поверх картинки можно дорисовать
        mceCtx.clearRect(0,0,MCE_CANVAS,MCE_CANVAS);
        mceCtx.drawImage(im, 0, 0, MCE_CANVAS, MCE_CANVAS);
        // фон под картинкой не виден — гасим размытие, иначе PNG сразу мылится
        ctrl.blur.value = 0; ctrl.blur.dispatchEvent(new Event('input'));
        репост();
      };
      im.src = rd.result; };
    rd.readAsDataURL(f);
  };
  дроп.addEventListener('click', () => файл.click());
  файл.addEventListener('change', () => взять(файл.files && файл.files[0]));
  дроп.addEventListener('dragover', e => { e.preventDefault(); дроп.style.opacity = '1'; });
  дроп.addEventListener('dragleave', () => { дроп.style.opacity = '.7'; });
  дроп.addEventListener('drop', e => { e.preventDefault(); дроп.style.opacity = '.7';
    взять(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  p.appendChild(дроп); p.appendChild(файл);

  // ── ЭКСПОРТ: PNG в полном разрешении (вшивать надо 512, а не игровые 128)
  const низ = document.createElement('div');
  низ.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
  { const b = document.createElement('button'); b.textContent = 'Скачать PNG';
    b.style.cssText = 'flex:1; padding:6px 8px; border:0; border-radius:6px; cursor:pointer;'
      + ' font:inherit; background:#dfe6f2; color:#0d1420;';
    b.addEventListener('click', () => mcePost.toBlob(bl => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(bl);
      a.download = 'matcap.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png'));
    низ.appendChild(b); }
  p.appendChild(низ);
  const хвост = document.createElement('div');
  хвост.style.cssText = 'margin-top:8px; opacity:.55; font-size:11px;';
  хвост.textContent = 'холст 512, в игре ' + MATCAP_SIZE + ' — видно ровно то, что в бою';
  p.appendChild(хвост);

  document.body.appendChild(p);
  репост(true);          // ОТКРЫТИЕ НИЧЕГО НЕ ПРИМЕНЯЕТ (см. `тихо` выше)
  return 'matcap editor: open';
}
