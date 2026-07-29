const { chromium } = require('playwright');
const path = require('path');

// ⚠️ РЕВЬЮ 2026-07-21: сьют раньше только ПЕЧАТАЛ значения и всегда выходил
// с кодом 0 — «зелёный» ничего не гарантировал. Теперь каждое ожидание — через
// expect(): FAIL копится в failures, процесс завершается exitCode=1.
// «PASS/FAIL» в логе — человеку, exitCode — конвейеру (build && node test.js).
(async () => {
  const failures = [];
  const expect = (cond, msg) => {
    console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg);
    if (!cond) failures.push(msg);
  };

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, 'index.html'));
  // не слепые 2.5 с, а честное ожидание: RAPIER.init асинхронный, __game
  // появляется после старта игры (флейк на холодной машине)
  await page.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });

  // ⚠️ ЗАНАВЕС ЗАГРУЗКИ — ЕДИНСТВЕННОЕ ОКНО, ГДЕ ЕГО ВИДНО: дальше сьют зовёт
  // skipIntro, тот ставит introdone и защёлка uiready открывается навсегда.
  // Спека владельца 2026-07-30 «во время загрузки бриджа не должно быть никаких
  // элементов интерфейса» — без этого ассерта фичу не проверяет ничто.
  // ⚠️ Ассерт УСЛОВНЫЙ, и это НЕ слабость: страховочный таймаут (8 с в 85-hud)
  // на медленной машине может успеть открыть занавес до этой строки, и
  // безусловная проверка стала бы флейком. Регрессию (снесли CSS-правило) он
  // ловит всё равно — при живой защёлке узлы обязаны быть скрыты.
  const curtain = await page.evaluate(() => {
    const ids = ['topBar', 'bottomBar', 'face', 'toast', 'tierToast', 'vitrine'];
    const shown = ids.filter(id => getComputedStyle(document.getElementById(id)).visibility !== 'hidden');
    const btn = document.getElementById('shakeBtn').getBoundingClientRect();
    const under = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
    return { latched: document.documentElement.classList.contains('uiready'), shown,
             tapReaches: !!(under && under.closest && under.closest('#bottomBar')) };
  });
  if (curtain.latched) console.log('SKIP: занавес уже открыт страховкой — окно проверки упущено');
  else {
    expect(curtain.shown.length === 0, 'ЗАНАВЕС: до introdone интерфейса нет (видимых узлов: ' +
      (curtain.shown.join(',') || 'ноль') + ')');
    expect(!curtain.tapReaches, 'ЗАНАВЕС: тап по месту Shake не доходит до кнопки');
  }

  await page.evaluate(() => window.__game.skipIntro());
  const latchedAfter = await page.evaluate(() => document.documentElement.classList.contains('uiready'));
  expect(latchedAfter, 'ЗАНАВЕС: introdone открыл защёлку uiready');

  const t0 = await page.evaluate(() => ({
    alive: window.__game.alive(),
    pairsAvail: window.__game.availablePairs(),
  }));
  console.log('start:', JSON.stringify(t0));
  // уровень 1: 64 пары + рыбка + бомба = 130; трим на рыхлом сиде может тихо изъять пары
  expect(t0.alive >= 111 && t0.alive <= 130, 'старт: предметов 111-130 (' + t0.alive + ')');
  expect(t0.pairsAvail > 0, 'старт: есть доступные пары (' + t0.pairsAvail + ')');
  // первые 15 уровней — предметы одного размера (спека владельца 2026-07-21)
  const sizes0 = await page.evaluate(() => window.__game.sizes());
  expect(sizes0.length === 1 && sizes0[0] === 1, 'уровень <=15: все предметы одного размера (' + JSON.stringify(sizes0) + ')');

  // КАП ГРУППЫ (спека владельца 2026-07-27 «поставь кап на 8»): ур.1 — 9 типов,
  // до капа тап уносил до 16 штук разом. Бьём РЕАЛЬНЫМ тапом по лучшей группе
  // и смотрим, сколько предметов ушло (кап считает и тапнутый).
  const capBefore = await page.evaluate(() => {
    const t = window.__game.bestTapTarget();
    return t ? { alive: window.__game.alive(), n: t.n, raw: t.raw, px: t.px, py: t.py } : null;
  });
  if (capBefore && capBefore.px != null){
    await page.mouse.click(capBefore.px, capBefore.py);
    await page.waitForTimeout(400);
    const gone = capBefore.alive - await page.evaluate(() => window.__game.alive());
    expect(gone <= 8, 'кап группы: за тап ушло не больше 8 (' + gone + ', цель обещала ' + capBefore.n + ')');
    expect(capBefore.n <= 8, 'цель тапа не обещает больше капа (' + capBefore.n + ')');
    // ⚠️ БЕЗ ЭТОГО АССЕРТ МОЖЕТ ПРОВЕРЯТЬ ПУСТОТУ: если самая крупная группа
    // сама меньше 8, «ушло <= 8» верно тривиально и кап не тронут. raw —
    // размер ДО капа, поэтому видно, сработал он или нет (ревью v157).
    console.log('кап группы (естественный): raw ' + capBefore.raw + ' -> n ' + capBefore.n + ', ушло ' + gone);
  } else console.log('кап группы: цели не нашлось (' + JSON.stringify(capBefore) + ') — пропуск');

  // ⚠️ ДЕТЕРМИНИРОВАННЫЙ СТРАЖ КАПА. Естественная крупнейшая группа на свежей
  // куче до 8 почти не дотягивает (замер 10 сидов: ни разу), поэтому «ушло <=8»
  // сверху проверяет ПУСТОТУ — ревью v157 поймало это как единственную дыру в
  // защите капа. Тут радиус ВРЕМЕННО раздувается: группа заведомо больше капа,
  // и срез виден. Радиус возвращается сразу же — ниже по сьюту он боевой.
  const radSave = await page.evaluate(() => window.__game.cfg.baseRadius);
  await page.evaluate(() => { window.__game.cfg.baseRadius = 3.0; });
  await page.waitForTimeout(500);           // updateMatchRadius тикает раз в 300 мс
  const capBig = await page.evaluate(() => {
    const t = window.__game.bestTapTarget();
    return t ? { alive: window.__game.alive(), n: t.n, raw: t.raw, px: t.px, py: t.py } : null;
  });
  if (capBig && capBig.px != null){
    expect(capBig.raw > 8, 'раздутый радиус даёт группу больше капа (raw ' + capBig.raw + ')');
    expect(capBig.n === 8, 'кап срезал группу до 8 (raw ' + capBig.raw + ' -> n ' + capBig.n + ')');
    await page.mouse.click(capBig.px, capBig.py);
    await page.waitForTimeout(500);
    const goneBig = capBig.alive - await page.evaluate(() => window.__game.alive());
    expect(goneBig === 8, 'за тап по раздутой группе ушло РОВНО 8 (' + goneBig + ' при raw ' + capBig.raw + ')');
  } else console.log('кап группы (форс): цели не нашлось — пропуск');
  await page.evaluate((r) => { window.__game.cfg.baseRadius = r; }, radSave);
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'shot_start.png' });

  // 5 авто-матчей
  for (let i = 0; i < 5; i++) {
    const ok = await page.evaluate(() => window.__game.autoMatch());
    console.log('autoMatch', i, ok);
    await page.waitForTimeout(450);
  }
  const t1 = await page.evaluate(() => window.__game.alive());
  expect(t1 <= t0.alive - 10, '5 матчей сняли >=10 предметов (' + t0.alive + ' -> ' + t1 + ')');

  // встряска
  await page.evaluate(() => window.__game.shake());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shot_after.png' });
  const t2 = await page.evaluate(() => ({ alive: window.__game.alive(), ap: window.__game.availablePairs() }));
  console.log('after shake:', JSON.stringify(t2));
  expect(t2.alive === t1, 'встряска не уничтожает предметы (' + t1 + ' -> ' + t2.alive + ')');

  // ЧЁРНЫЙ ШАР-БОМБА (спека владельца 2026-07-22): тап/детонация взрывает
  // ближайших соседей — не более BOMB_MAX (7), без очков; бомба расходуется
  const b0 = await page.evaluate(() => ({ alive: window.__game.alive(),
    score: window.__game.stats().score, idx: window.__game.bombIndex() }));
  expect(b0.idx >= 0, 'бомба заспавнена в кучу (index ' + b0.idx + ')');
  // #2 ПЕРЕЛИВАЮЩАЯСЯ БОМБА (спека владельца 2026-07-23): материал — радужный
  // matcap, НЕ плоский MeshBasicMaterial (проверяем на живой бомбе до детонации)
  const bombMat = await page.evaluate(() => window.__game.bombMatKind());
  expect(bombMat && bombMat.type === 'MeshMatcapMaterial' && bombMat.hasMatcap,
    'бомба переливается: MeshMatcapMaterial с matcap (' + JSON.stringify(bombMat) + ')');
  const det = await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const b1 = await page.evaluate(() => ({ alive: window.__game.alive(),
    score: window.__game.stats().score, idx: window.__game.bombIndex() }));
  expect(det === true, 'детонация сработала');
  expect(b1.idx === -1, 'бомба израсходована взрывом');
  const bombKilled = b0.alive - b1.alive - 1;
  expect(bombKilled >= 1 && bombKilled <= 7, 'взрыв снял 1..7 соседей (' + bombKilled + ')');
  expect(b1.score === b0.score, 'взрыв без очков (' + b0.score + ' -> ' + b1.score + ')');

  // ПОРТРЕТЫ КОЛЛЕКЦИИ (спека владельца 2026-07-24): #3 размер при hover/спине =
  // размер статики; #4 tap=hover одним toggle. thumbFrames не рендерит (только
  // фрустумы) — работает и до декода атласов.
  const key0 = await page.evaluate(() => window.__game.accSnapshot()[0].key); // .key = TYPES.name
  const frm = await page.evaluate((k) => window.__game.thumbFrames(k), key0);
  expect(frm && frm.equal, '#3 статика и спин кадрируют одинаково (thumbW ' + (frm && frm.thumbW)
    + ' = spinW ' + (frm && frm.spinW) + ')');
  const tog = await page.evaluate((k) => {
    let h = document.getElementById('tsHost');
    if (!h){ h = document.createElement('div'); h.id = 'tsHost';
      h.style.cssText = 'position:fixed;left:-999px;top:0;width:120px;height:120px'; document.body.appendChild(h); }
    const on = window.__game.thumbSpinToggleKey(k, '#tsHost');   // тап 1 -> завести
    const a1 = window.__game.spinState().active;
    const off = window.__game.thumbSpinToggleKey(k, '#tsHost');  // тап 2 по той же -> снять
    const a2 = window.__game.spinState().active;
    window.__game.thumbSpinStop();
    return { on, a1, off, a2 };
  }, key0);
  expect(tog.on === true && tog.a1 === true, '#4 тап заводит спин (' + JSON.stringify(tog) + ')');
  expect(tog.off === false && tog.a2 === false, '#4 повторный тап по той же карточке снимает спин (' + JSON.stringify(tog) + ')');

  // доиграть до конца автоматом (с встрясками при тупике); по пути ловим
  // эндшпиль: при <=8 живых радиус обязан сняться (∞=99) — и он ПРИОРИТЕТНЕЕ
  // цепной реакции (фикс ревью: цепь глушила ∞ потолком 1.1)
  let guard = 0, shakes = 0, endgameRadius = null, endgameTy = null, sinceRest = 0, midTyMin = 99;
  while (guard++ < 600) {
    const st = await page.evaluate(() => ({ alive: window.__game.alive(), r: window.__game.cfg.matchRadius, ty: window.__game.cam().ty }));
    if (st.alive === 0) break;
    if (st.alive > 45 && st.ty < midTyMin) midTyMin = st.ty; // до порога 20% камера обязана СТОЯТЬ
    if (st.alive <= 9 && endgameRadius === null){ // 8 живых + рыбка
      // ⚠️ не сэмплить мгновенно: радиус пересчитывает refresh-тик (до 300 мс
      // после матча) — мгновенное чтение ловило старый 1.1 (флейк)
      await page.waitForFunction(() => window.__game.cfg.matchRadius > 10, null, { timeout: 900 }).catch(() => {});
      endgameRadius = await page.evaluate(() => window.__game.cfg.matchRadius);
    }
    if (st.alive <= 20 && endgameTy === null) endgameTy = st.ty; // защёлка уже щёлкнула — камера в пути вниз
    const ok = await page.evaluate(() => window.__game.autoMatch());
    if (!ok) {
      shakes++;
      await page.evaluate(() => window.__game.shake());
      await page.waitForTimeout(1200);
    } else {
      // передышка раз в 10 матчей: непрерывный бот-темп держал бы СЕРИЮ ТУРБО
      // вечно (перезапуск цепи + досыпка 2.6/417мс = чаша не пустеет) —
      // человек так не может, а прогон должен доигрывать уровень. Пауза
      // >COMBO_MS гасит серию, текущая цепь дотикает и гаснет сама.
      if (++sinceRest >= 10){ sinceRest = 0; await page.waitForTimeout(4300); }
      else await page.waitForTimeout(300);
    }
  }
  const fin = await page.evaluate(() => window.__game.alive());
  const winShown = await page.evaluate(() => document.getElementById('winOverlay').style.display);
  console.log('final alive:', fin, '| deadlock shakes needed:', shakes, '| win overlay:', winShown, '| endgame radius:', endgameRadius);
  expect(fin === 0, 'полный прогон разобрал уровень до нуля');
  expect(winShown === 'flex', 'экран победы показан');
  expect(shakes <= 12, 'встрясок тупика в разумном бюджете (' + shakes + ' <= 12)');
  expect(endgameRadius !== null && endgameRadius > 10, 'эндшпиль <=8 живых снимает радиус (∞), даже поверх цепи (' + endgameRadius + ')');
  expect(midTyMin >= 4.19, 'до порога 20% камера по вертикали НЕ плавает (min ty ' + midTyMin + ')');
  expect(endgameTy !== null && endgameTy < 4.19, 'защёлка 20% сработала — камера пошла вниз (ty ' + endgameTy + ')');
  const finalTy = await page.evaluate(() => window.__game.cam().ty); // лерп доехал — финальная отметка
  expect(finalTy <= 3.3 && finalTy >= 3.1, 'автопан остановился ровно на поле трети хода 3.2 (' + finalTy + ')');
  await page.screenshot({ path: 'shot_win.png' });

  // тап по кнопке встряски после рестарта — мгновенно, без подтверждения
  await page.click('#againBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForTimeout(300);
  await page.click('#shakeBtn');
  await page.waitForTimeout(400);
  // ⚠️ БАЗА НЕ ФИКСИРОВАННАЯ 3: встряски растут с уровнем (3 + ⌊ур/10⌋,
  // решение владельца 2026-07-27) — сверяем со СТАРТОВЫМ значением уровня,
  // а не с константой, иначе ассерт врал бы на ур.10+.
  const shakeSpend = await page.evaluate(() => ({ left: window.__game.level().shakes,
    expect: window.__game.freeShakes(window.__game.levelNum()) - 1, lv: window.__game.levelNum() }));
  expect(shakeSpend.left === shakeSpend.expect,
    'встряска мгновенная и списала заряд (ур.' + shakeSpend.lv + ': ' +
    (shakeSpend.expect + 1) + ' -> ' + shakeSpend.left + ')');
  // ФЛЭТ 3 НА ЛЮБОМ УРОВНЕ (окончательное решение владельца 2026-07-27-в:
  // «8 бесплатных много, мы же продаём их за рекламу»). Лесенка 3+⌊ур/10⌋ была
  // введена и тут же отменена — стережём именно ПОСТОЯНСТВО запаса.
  const shakeFlat = await page.evaluate(() => {
    const g = window.__game, was = g.levelNum(), out = [];
    for (const lv of [1, 10, 20, 50]){
      g.setLevel(lv); g.regen(); g.skipIntro();
      out.push({ lv, n: g.level().shakes });
    }
    g.setLevel(was); g.regen(); g.skipIntro();
    return out;
  });
  await page.waitForTimeout(400);
  expect(shakeFlat.every(x => x.n === 3),
    'бесплатных встрясок ВЕЗДЕ 3, лесенки нет (' +
    shakeFlat.map(x => 'ур.' + x.lv + '→' + x.n).join(', ') + ')');

  // ТУПИК (пар нет достижимых + встрясок нет) -> ПОМОЛ-ВЫРУЧАЛКА, НЕ поражение
  // (решение владельца 2026-07-27 «помол = штраф, не смерть»): помол разбирает
  // кучу, пока не появится достижимая пара; экран поражения из тупика не всплывает.
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  // ⚠️ Ждём УСТОЙЧИВОГО штиля, а не фиксированной паузы: пока куча движется,
  // updateMatchRadius каждый тик перезаписывает форсированный ниже matchRadius,
  // и тупик не наступает вовсе. Сразу после skipIntro бывает КРАТКИЙ ложный
  // штиль (~150 мс), поэтому требуем серию подряд идущих спокойных опросов.
  await page.waitForFunction(() => {
    if (window.__game.awake().physAwake) { window.__calm = 0; return false; }
    window.__calm = (window.__calm || 0) + 1;
    return window.__calm >= 8;
  }, null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => {
    window.__game.cfg.baseRadius = -9; // радиус динамический — правим базу (метрика v3: 0.001 матчил бы касающиеся)
    window.__game.cfg.matchRadius = -9; // зазор не бывает отрицательным настолько — гарантированный тупик
    const lv = window.__game.level();
    // ⚠️ adShakes НЕ трогаем — он безлимитный (Infinity). Тупик обязан
    // сработать ИМЕННО ПРИ ЖИВОЙ рекламе: иначе игрок, не смотрящий ролики,
    // завис бы навсегда. Обнуляем только СВОИ ресурсы.
    lv.shakes = 0;
  });
  const aliveBeforeMill = await page.evaluate(() => window.__game.alive());
  // тупик подтверждается 2 стабильными тиками (~1.2с) -> level.deadlock
  await page.waitForFunction(() => window.__game.level().deadlock === true, null, { timeout: 8000, polling: 100 });
  await page.waitForTimeout(3000); // дать помолу-выручалке отработать пару оборотов
  const dl = await page.evaluate(() => ({
    lose: document.getElementById('loseOverlay').style.display,
    deadlock: window.__game.level().deadlock,
    over: window.__game.level().over,
    grinding: document.getElementById('mixerTimer').textContent,
    alive: window.__game.alive(),
    adShakesInfinite: !Number.isFinite(window.__game.level().adShakes),
  }));
  console.log('тупик→помол:', JSON.stringify(dl), '| было живых', aliveBeforeMill);
  expect(dl.lose !== 'flex', 'тупик НЕ показывает экран поражения (помол-выручалка)');
  expect(dl.over === false, 'уровень НЕ проигран в тупике (помол вместо смерти)');
  expect(dl.deadlock === true, 'тупик выставил level.deadlock');
  expect(dl.alive < aliveBeforeMill, 'помол-выручалка разбирает кучу (' + aliveBeforeMill + ' -> ' + dl.alive + ')');
  await page.screenshot({ path: 'shot_deadlock_mill.png' });

  // восстановление агентности (вернули встряски) -> тупик снят, помол встал
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; window.__game.cfg.matchRadius = 2.0; window.__game.level().shakes = 3; });
  await page.waitForTimeout(1200);
  const clr = await page.evaluate(() => ({ deadlock: window.__game.level().deadlock,
    grinding: document.getElementById('mixerTimer').textContent }));
  expect(clr.deadlock === false, 'вернулась агентность -> тупик снят');
  // ⚠️ БЕЗЛИМИТ AD-ВСТРЯСОК НЕ ДОЛЖЕН УБИТЬ ВЫРУЧАЛКУ. Раньше тупик требовал
  // adShakes===0 — с Infinity это условие НИКОГДА не наступит, и игрок, НЕ
  // смотрящий рекламу, завис бы навсегда (ни помола, ни поражения). Поэтому
  // тупик считается по СВОИМ ресурсам; ассерт стережёт именно это.
  expect(dl.adShakesInfinite === true,
    'тупик сработал ПРИ БЕЗЛИМИТНОЙ рекламе — ролики не блокируют выручалку');
  // ФИКС ревью v116: сброс lastAction на снятии тупика -> idle-помол НЕ догрызает
  // после появления пары (помол встал РОВНО со снятием, не крутится по инерции)
  expect(clr.grinding !== 'Grinding', 'помол-выручалка встала со снятием тупика (не догрызает по инерции)');

  // рестарт уровня штатным regen (экран поражения больше не участвует)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  const aliveAfterRestart = await page.evaluate(() => window.__game.alive());
  expect(aliveAfterRestart > 0, 'regen пересоздал уровень (' + aliveAfterRestart + ')');

  // заполнение доверху + очки за групповой матч + миксер за простой
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(1000);
  const fill = await page.evaluate(() => ({ topY: window.__game.topY(), alive: window.__game.alive() }));
  console.log('fill: topY', fill.topY.toFixed(2), '(rim 9.2) | alive:', fill.alive);
  expect(fill.topY > 5.5 && fill.topY <= 9.21, 'заполнение у красной линии (topY ' + fill.topY.toFixed(2) + ')');

  await page.evaluate(() => window.__game.autoMatch());
  await page.waitForTimeout(400);
  const sc = await page.evaluate(() => window.__game.stats().score);
  expect(sc === 20, 'пара даёт 20 очков (' + sc + ')');

  const preMixerAlive = await page.evaluate(() => window.__game.alive());
  // ТАЙМЕР ПОМОЛА (спека владельца 2026-07-27, перетюн): easy idleLimit=15
  const idleDef = await page.evaluate(() => window.__game.level().idleLimit);
  expect(idleDef === 15, 'таймер помола Easy = 15с (спека владельца 2026-07-27) (' + idleDef + ')');
  await page.evaluate(() => { window.__game.level().idleLimit = 5; window.__game.stats().lastAction = performance.now() - 20000; }); // укорачиваем лимит до 5 для скорости теста
  await page.waitForTimeout(1000);
  // огонь — эскалация помола (правка владельца 2026-07-22): на 1-й секунде
  // Grinding его ещё НЕТ, появляется вместе со спуском глаз после 3 с
  const fireEarly = await page.evaluate(() => ({
    fire: document.getElementById('fFire').classList.contains('on'),
    dropped: document.getElementById('face').classList.contains('dropped') }));
  expect(!fireEarly.fire && !fireEarly.dropped, 'на 1-й секунде помола огня и спуска глаз ещё нет');
  await page.waitForTimeout(2600);
  const mixer = await page.evaluate(() => ({ alive: window.__game.alive(), score: window.__game.stats().score,
    mt: document.getElementById('mixerTimer').textContent,
    fire: document.getElementById('fFire').classList.contains('on'),
    dropped: document.getElementById('face').classList.contains('dropped') }));
  console.log('after idle: alive', mixer.alive, '| score', mixer.score, '| таймер-чип:', mixer.mt);
  expect(mixer.alive < preMixerAlive, 'миксер за простой съел предметы (' + preMixerAlive + ' -> ' + mixer.alive + ')');
  expect(mixer.score < sc, 'миксер снял очки за пару (' + sc + ' -> ' + mixer.score + ')');
  expect(mixer.fire && mixer.dropped, 'после 3 с помола огонь горит и глаза опустились');

  // БАЛАНС-ТАБЛИЦА (спека владельца 2026-07-22): промах −10; уровень 1 —
  // БЕЗ очковых штрафов вовсе; уровни 2-5 — кламп счёта снизу нулём;
  // с уровня 6 — полный минус. Точка (25, 540) — слева от чаши, вне HUD.
  await page.evaluate(() => { window.__game.setLevel(1); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL1 = await page.evaluate(() => { const s = window.__game.stats();
    return { score: s.score, misses: s.misses }; });
  console.log('miss L1:', JSON.stringify(missL1));
  expect(missL1.misses === 1 && missL1.score === 0, 'ур.1 без штрафов: промах не снял очков (score ' + missL1.score + ', misses ' + missL1.misses + ')');
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL3 = await page.evaluate(() => window.__game.stats().score);
  expect(missL3 === 0, 'ур.3: кламп нулём — промах с нуля держит 0 (' + missL3 + ')');
  await page.evaluate(() => { window.__game.setLevel(8); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL8 = await page.evaluate(() => window.__game.stats().score);
  expect(missL8 === -10, 'ур.8: полный штраф промаха −10 (' + missL8 + ')');

  // ПРОМАХ ОБНУЛЯЕТ НАБОР ТУРБО (спека владельца 2026-07-27; РАЗВОРОТ его же
  // прежнего тюнинга «слишком резко сбрасываем power chain», где было −2).
  // Радиус-лесенка (combo.level) при этом теряет ровно COMBO_MISS_DROP=2, а не
  // обнуляется — владелец назвал «счётчик РЕЖИМА», лесенку не трогал.
  const turboReset = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < 4; i++){ g.autoMatch(); await new Promise(r => setTimeout(r, 130)); }
    const hot = g.combo();                       // серия набрана, лихорадка горит
    g.tapEmpty ? g.tapEmpty() : null;            // промах, если есть ручка
    return { hot };
  });
  {
    // промах кликом в пустоту (та же дорога, что у ассертов штрафа выше)
    const before = await page.evaluate(() => window.__game.combo());
    await page.mouse.click(25, 540);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__game.combo());
    if (before.hot && before.count > 0){
      expect(after.count === 0,
        'промах ОБНУЛЯЕТ набор турбо (' + before.count + ' -> ' + after.count + ')');
      expect(after.level === Math.max(0, before.level - 2),
        'радиус-лесенка теряет ровно 2 шага, а не обнуляется (' + before.level + ' -> ' + after.level + ')');
    } else {
      expect(after.count === 0, 'набор турбо не копится вне лихорадки (' + after.count + ')');
    }
    void turboReset;
  }

  // #10 ДЕНОМИНАЦИЯ В ПРОЦЕССЕ (спека владельца 2026-07-27): всплывающие
  // поп-числа матча = деноминир. прирост чипа (÷10), «понятно и в процессе».
  const denomShownProbe = await page.evaluate(() => window.__game.scoreShownDenom(1234)
    + ',' + window.__game.scoreShownDenom(6400) + ',' + window.__game.scoreShownDenom(5));
  expect(denomShownProbe === '123,640,0', 'scoreShownDenom деноминирует ÷10 floor (' + denomShownProbe + ')');
  // end-to-end: поп на экране = изменение liveBalance-чипа (одна шкала)
  const popProbe = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    document.querySelectorAll('.pop').forEach(p => p.remove()); // чистим прежние
    const chip0 = g.liveBalance();
    const ok = g.autoMatch();
    await new Promise(r => setTimeout(r, 120));
    const chip1 = g.liveBalance();
    // поп-очки — тот, что начинается с +цифра (не ярлык «×N»)
    const texts = [...document.querySelectorAll('.pop text')].map(t => t.textContent);
    const scorePop = texts.find(s => /^\+\d/.test(s));
    return { ok, chip0, chip1, scorePop, texts };
  });
  expect(popProbe.ok && popProbe.scorePop != null, 'матч создал поп-число (' + JSON.stringify(popProbe.texts) + ')');
  expect(parseInt(popProbe.scorePop, 10) === popProbe.chip1 - popProbe.chip0,
    'поп на экране = прирост чипа (' + popProbe.scorePop + ' = ' + popProbe.chip0 + '→' + popProbe.chip1 + ')');

  // финал: остались одиночки без пар — миксер зачищает их, собирает сюрприз (+150)
  // и наступает победа с апом уровня
  const lvlBefore = await page.evaluate(() => window.__game.levelNum());
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); window.__game.leaveSingles(); });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  await page.waitForTimeout(600);
  const fin2 = await page.evaluate(() => ({
    win: document.getElementById('winOverlay').style.display,
    score: window.__game.stats().score,
    lvl: window.__game.levelNum(),
    timeOnWin: document.getElementById('winStats').textContent.includes('Time:'),
    hudTimerHidden: getComputedStyle(document.getElementById('tmSvg')).display === 'none',
    starChip: document.getElementById('score').textContent,
    liveBal: window.__game.liveBalance() }));
  expect(fin2.win === 'flex', 'финальная зачистка доводит до победы');
  expect(fin2.score === 150 + 5 * lvlBefore, 'финал: очки не тратятся/не начисляются, только рыбка 150+5×ур (' + fin2.score + ' при ур.' + lvlBefore + ')');
  expect(fin2.lvl === lvlBefore + 1, 'победа апает уровень (' + lvlBefore + ' -> ' + fin2.lvl + ')');
  expect(fin2.hudTimerHidden && fin2.timeOnWin, 'время уровня скрыто из HUD, но есть на экране победы (спека 2026-07-22)');
  // чип теперь показывает ЕДИНЫЙ БАЛАНС (liveBalance), а НЕ per-level score
  // (финализация владельца 2026-07-24 «очки=звёзды=баланс», запрос МЕТА):
  // на победе счёт забанкован в se → чип = баланс = liveBalance.
  expect(fin2.starChip === '★ ' + fin2.liveBal, 'чип показывает единый баланс liveBalance (' + fin2.starChip + ' = ★ ' + fin2.liveBal + ')');
  // дальше уровни пересоздаются через evaluate-regen (мимо кнопки «Дальше») —
  // победный оверлей надо спрятать руками, иначе он перехватит реальные клики
  await page.evaluate(() => { document.getElementById('winOverlay').style.display = 'none'; });

  // сложность: по умолчанию (easy) доступно всё живое, кроме сюрприза;
  // Hard включает перекрытия (веер лучей + вуаль)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  const diff = await page.evaluate(() => {
    window.__game.forceRefresh();
    const easy = { alive: window.__game.alive(), acc: window.__game.accessibleList().length };
    window.__game.cfg.hard = true; window.__game.forceRefresh();
    const hard = { alive: window.__game.alive(), acc: window.__game.accessibleList().length };
    window.__game.cfg.hard = false; window.__game.forceRefresh();
    return { easy, hard };
  });
  expect(diff.easy.acc === diff.easy.alive - 1, 'easy: доступно всё, кроме закопанной рыбки (' + diff.easy.acc + '/' + diff.easy.alive + ')');
  expect(diff.hard.acc < diff.hard.alive, 'hard: перекрытия прячут часть кучи (' + diff.hard.acc + '/' + diff.hard.alive + ')');

  // комбо-лесенка только ВВЕРХ (фикс ревью): при слайдере выше потолка 1.1
  // серия не должна ПОНИЖАТЬ радиус к потолку
  await page.evaluate(() => { window.__game.cfg.baseRadius = 1.6; });
  await page.evaluate(() => { window.__game.autoMatch(); window.__game.autoMatch(); }); // вторая склейка мгновенно — серия горит
  const comboProbe = await page.evaluate(() => {
    window.__game.forceRefresh();
    return { hot: window.__game.combo().hot, r: window.__game.cfg.matchRadius };
  });
  expect(comboProbe.hot, 'две быстрые склейки зажгли серию');
  expect(comboProbe.r >= 1.5, 'серия не понижает радиус при базе 1.6 выше потолка (' + comboProbe.r.toFixed(2) + ')');
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; });

  // подсказка: числимый ресурс списывается, подсветка не роняет matcap-ветку
  // (у MeshMatcapMaterial нет emissive — регрессия ловилась только руками)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  const hintProbe = await page.evaluate(() => {
    const before = window.__game.wallet().hints;
    document.getElementById('hintBtn').click();
    return { before, after: window.__game.wallet().hints };
  });
  expect(hintProbe.after === hintProbe.before - 1, 'подсказка списывает 1 заряд (' + hintProbe.before + ' -> ' + hintProbe.after + ')');

  // пауза: МЕНЮ (главный экран заменил карточку pauseOverlay — спека владельца
  // «это и главный экран и пауза»), стоп-кадр и СДВИГ ЧАСОВ — пауза не съедает
  // простой миксера. Кнопка меню Resume и снимает паузу.
  await page.evaluate(() => { document.getElementById('pauseBtn').click(); });
  await page.waitForTimeout(1200);
  const pausedState = await page.evaluate(() => ({
    overlay: document.getElementById('mainScreen').classList.contains('open'),
    paused: window.__game.pauseState().paused,
    idle: performance.now() - window.__game.stats().lastAction,
  }));
  await page.evaluate(() => { document.getElementById('msPlayBtn').click(); });
  const idleAfter = await page.evaluate(() => performance.now() - window.__game.stats().lastAction);
  expect(pausedState.overlay && pausedState.paused, 'пауза открывает меню и морозит игру');
  expect(idleAfter < pausedState.idle, 'резюме сдвинуло якоря часов (простой ' + Math.round(pausedState.idle) + ' -> ' + Math.round(idleAfter) + ' мс)');

  // смена уровня под идущей рекламой: genLevel гасит показ (Ads.cancel) —
  // награда НЕ должна прилететь новому уровню (фикс ревью: протухший rewardCb)
  await page.evaluate(() => {
    const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 1;
  });
  await page.click('#shakeBtn');   // ad-состояние: ролик СРАЗУ, без подтверждения
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); }); // уровень сменился ПОД роликом
  await page.waitForTimeout(3600); // стаб бы уже дозрел
  const adProbe = await page.evaluate(() => ({
    overlay: document.getElementById('adOverlay').style.display,
    adShakes: Number.isFinite(window.__game.level().adShakes) ? window.__game.level().adShakes : null,
    shakes: window.__game.level().shakes,
    used: window.__game.stats().adShakesUsed,
  }));
  expect(adProbe.overlay === 'none', 'reген спрятал оверлей рекламы');
  // ⚠️ ЛИМИТА AD-ВСТРЯСОК БОЛЬШЕ НЕТ (спека владельца 2026-07-28: «каждая
  // следующая только за показ рекламы») — прежняя сверка «adShakes === 2»
  // потеряла смысл. Стережём то же САМОЕ по существу: протухшая награда не
  // должна ни списаться в статистику, ни подарить встряску новому уровню.
  expect(adProbe.used === 0 && adProbe.shakes === 3,
    'награда старого показа не прилетела новому уровню (used ' + adProbe.used +
    ', бесплатных ' + adProbe.shakes + ' — как у свежего уровня)');
  expect(adProbe.adShakes === null,
    'ad-встряски БЕЗ лимита (' + adProbe.adShakes + ' = Infinity)');

  // вертикальный пан взгляда (спека владельца: «приподнять и рассмотреть
  // остатки»): Shift+колесо двигает target по Y с клампами, обычное колесо
  // по-прежнему только зумит
  const cam0 = await page.evaluate(() => window.__game.cam());
  await page.keyboard.down('Shift');
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 300);   // Shift+скролл вниз = смотреть ниже
  await page.keyboard.up('Shift');
  const cam1 = await page.evaluate(() => window.__game.cam());
  expect(cam1.ty < cam0.ty, 'Shift+колесо опустило взгляд (' + cam0.ty + ' -> ' + cam1.ty + ')');
  expect(cam1.r === cam0.r, 'Shift+колесо не тронуло зум (' + cam0.r + ' -> ' + cam1.r + ')');
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -9999); // кламп сверху
  await page.keyboard.up('Shift');
  const cam2 = await page.evaluate(() => window.__game.cam());
  expect(cam2.ty <= 5.2 && cam2.ty >= 5.19, 'пан ограничен потолком 5.2 (' + cam2.ty + ')');
  await page.mouse.wheel(0, 120);   // обычное колесо — зум работает как раньше
  const cam3 = await page.evaluate(() => window.__game.cam());
  expect(cam3.r > cam2.r && cam3.ty === cam2.ty, 'обычное колесо зумит и не панит (r ' + cam2.r + ' -> ' + cam3.r + ')');
  // рестарт уровня сбрасывает пан (resetPointers на границах интро);
  // автопан на свежей куче стоит у дефолта, допуск на первый лерп-тик
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  const cam4 = await page.evaluate(() => window.__game.cam());
  expect(cam4.ty > 3.6 && cam4.ty <= 4.2, 'новый уровень вернул взгляд к дефолту (' + cam4.ty + ')');

  // СЕРИЯ ТУРБО (спека владельца): вторая цепь, собранная ВНУТРИ активной,
  // перезапускает окно и растит chainSeries (>=2 — сигнал глазам eyes-5)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  const chainProbe = await page.evaluate(async () => {
    const g = window.__game, out = { chainAt: -1, seriesAt: -1 };
    for (let i = 0; i < 30; i++){
      if (!g.autoMatch()) break;
      const c = g.combo();
      if (c.chain && out.chainAt < 0) out.chainAt = i;
      if (c.series >= 2 && out.seriesAt < 0){ out.seriesAt = i; break; }
      await new Promise(r => setTimeout(r, 60));
    }
    out.final = g.combo();
    return out;
  });
  expect(chainProbe.chainAt >= 0, 'серия матчей зажгла цепь (матч #' + chainProbe.chainAt + ')');
  expect(chainProbe.seriesAt > chainProbe.chainAt && chainProbe.final.series >= 2,
    'второе турбо внутри первого = серия турбо (матч #' + chainProbe.seriesAt + ', series ' + chainProbe.final.series + ')');

  // НАКОПЛЕНИЕ ПО ТИПАМ (спека владельца 2026-07-22): пороги 100·(2^n−1),
  // множитель 1+0.25×ступень, событие апа в момент пересечения, множитель
  // в очках матча и в пар-скоре
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(500);
  const accProbe = await page.evaluate(() => {
    const g = window.__game;
    const snap0 = g.accSnapshot()[0]; // TYPES[0] всегда в пуле уровня
    window.__accEvents = [];
    g.onAccTierUp(e => window.__accEvents.push({ key: e.key, name: e.name, tier: e.tier, mult: e.mult }));
    const t1 = g.accGrant(snap0.key, 100 - snap0.count); // ровно порог ступени 1
    const t2 = g.accGrant(snap0.key, 300 - t1.count);    // порог ступени 2
    return { key: snap0.key, label: snap0.name, t1, t2, events: window.__accEvents };
  });
  expect(accProbe.t1.tier === 1 && accProbe.t1.mult === 1.25 && accProbe.t1.next === 300,
    'ступень 1 на 100 шт: множитель 1.25, следующий порог 300 (' + JSON.stringify(accProbe.t1) + ')');
  expect(accProbe.t2.tier === 2 && accProbe.t2.mult === 1.5 && accProbe.t2.next === 700,
    'ступень 2 на 300 шт: множитель 1.5, следующий порог 700 (' + JSON.stringify(accProbe.t2) + ')');
  expect(accProbe.events.length === 2 && accProbe.events[0].tier === 1 && accProbe.events[1].tier === 2,
    'onAccTierUp сработал на каждом пересечении порога (' + JSON.stringify(accProbe.events) + ')');
  expect(accProbe.label !== accProbe.key && /^[A-Z]/.test(accProbe.label) && accProbe.events[0].name === accProbe.label,
    'снапшот и событие несут человеческий ярлык, ключ отдельно (' + accProbe.key + ' -> ' + accProbe.label + ')');
  // множитель в очках: пара типа со ступенью 2 = round(20 × 1.5) = 30
  // (радиус временно широкий — пары типа могут лежать далеко друг от друга)
  const multProbe = await page.evaluate(() => {
    const g = window.__game;
    g.cfg.baseRadius = 6; g.cfg.matchRadius = 6;
    const before = g.stats().score;
    const ok = g.matchType(g.accSnapshot()[0].key);
    g.cfg.baseRadius = 0.9;
    return { ok, delta: g.stats().score - before };
  });
  expect(multProbe.ok, 'нашлась пара прокачанного типа для матча');
  expect(multProbe.delta === 30, 'пара типа со ступенью 2 даёт 20×1.5=30 очков (' + multProbe.delta + ')');
  // пар-скор с множителями: независимый пересчёт по aliveByType × accMult
  const parProbe = await page.evaluate(() => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    const alive = g.aliveByType();
    const mult = {};
    for (const s of g.accSnapshot()) mult[s.key] = s.mult;
    let exp = 0;
    for (const k in alive) exp += Math.floor(alive[k] / 2) * 20 * (mult[k] || 1);
    return { par: g.level().parBase, exp: Math.round(exp) };
  });
  expect(parProbe.par === parProbe.exp && parProbe.par > 0,
    'пар-скор учитывает множители накопления (' + parProbe.par + ' = ' + parProbe.exp + ')');

  // ===== ЕДИНЫЙ БАЛАНС + BOOST + ОТКРЫТИЕ (финализация владельца 2026-07-24) =====
  // starAward остался ТОЛЬКО для grandfather-миграции (валюту за победу
  // больше не считает — её несёт bankLevelScore); проверяем как чистую функцию
  const awardProbe = await page.evaluate(() => {
    const g = window.__game;
    return { a1: g.starAward(1, 1), a3at1: g.starAward(1, 3), a3at10: g.starAward(10, 3), a0: g.starAward(5, 0) };
  });
  expect(awardProbe.a1 === 110 && awardProbe.a3at1 === 510,
    'миграция-номинал: 1★ на ур.1 = 110, 3★ = 510 (' + JSON.stringify(awardProbe) + ')');
  expect(awardProbe.a3at10 === 600 && awardProbe.a0 === 0,
    'миграция-номинал: надбавка за уровень и 0 за непройденный (' + JSON.stringify(awardProbe) + ')');

  // ЕДИНОЕ ЧИСЛО: банк счёта уровня деноминируется ×10 в кошелёк; чип
  // (liveBalance) = баланс + незабанкованный счёт текущего уровня
  const balProbe = await page.evaluate(() => {
    const g = window.__game;
    const b0 = g.starBalance();
    const banked = g.bankScore(6400);           // деноминация ÷10 -> +640
    const b1 = g.starBalance();
    // liveBalance = баланс + floor(score/10) во время уровня
    g.regen(); g.skipIntro();
    const st = g.stats(); st.score = 1230;
    const live = g.liveBalance(), bal = g.starBalance();
    return { b0, banked, b1, live, bal, lb: g.leaderboardScore() };
  });
  expect(balProbe.banked === 640 && balProbe.b1 === balProbe.b0 + 640,
    'банк счёта деноминирован ×10: 6400 -> +640 (' + balProbe.banked + ')');
  expect(balProbe.live === balProbe.bal + 123,
    'чип (liveBalance) = баланс + незабанкованный счёт/10 (' + balProbe.bal + '+123 -> ' + balProbe.live + ')');
  expect(balProbe.lb === balProbe.bal, 'лидерборд-число = баланс (' + balProbe.lb + ')');
  // ЕДИНОЕ ЧИСЛО ВЕЗДЕ (жалоба владельца 2026-07-27 «во время игры одно число,
  // а на пузе второе»): игровой чип и кошелёк меню обязаны показывать ОДНО И ТО
  // ЖЕ. Раньше чип читал liveBalance, а меню — starBalance, и открытие меню
  // посреди уровня «съедало» заработанное за партию.
  const oneNumber = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    g.starGrant(500);
    for (let i = 0; i < 6; i++) g.autoMatch();   // копим НЕзабанкованный счёт уровня
    await new Promise(r => setTimeout(r, 500));   // дать updateHUD отработать
    const chip = document.getElementById('score').textContent;
    window.showMainScreen();                      // открыть меню поверх партии
    await new Promise(r => setTimeout(r, 400));
    const wallet = document.getElementById('msStars').textContent;
    const unbanked = Math.floor(Math.max(0, g.stats().score) / 10);
    window.hideMainScreen && window.hideMainScreen();
    const d = s => String(s).replace(/[^0-9]/g, '');
    return { chip: d(chip), wallet: d(wallet), unbanked, live: g.liveBalance() };
  });
  expect(oneNumber.chip === oneNumber.wallet,
    'ЕДИНОЕ ЧИСЛО: чип в игре = кошелёк меню (' + oneNumber.chip + ' = ' + oneNumber.wallet + ')');
  expect(oneNumber.unbanked > 0 && Number(oneNumber.wallet) === oneNumber.live,
    'кошелёк меню включает незабанкованный счёт уровня (+' + oneNumber.unbanked + ', live ' + oneNumber.live + ')');

  // ЧИП НЕ ВЫЛЕЗАЕТ ЗА ЭКРАН (регрессия v140→v148, жалоба владельца «отступы
  // поломались»): fitStat ужимал viewBox, но НЕ двигал якорь end-текста —
  // тот оставался на x=102 от исходной рамки 104 и рисовался ЗА ней (.otext
  // overflow:visible), уезжая за вьюпорт. Меряем ПРАВЫЙ край текста против
  // ширины окна на всех балансах: и коротком, и сжатом до «12.5M».
  // ⚠️ ДЛИНУ ЧИСЛА НАБИРАЕМ СЧЁТОМ УРОВНЯ, А НЕ ВЫДАЧЕЙ ЗВЁЗД: starGrant
  // необратим (se/tu монотонные) и 12М в кошельке ломали соседний ассерт
  // «списание сверх баланса отклонено». stats.score — величина УРОВНЯ, её
  // снимает regen в конце пробы, состояние кошелька не трогаем вовсе.
  const chipFit = await page.evaluate(async () => {
    const g = window.__game, out = [];
    const keep = g.stats().score;
    for (const sc of [0, 16790, 1234560, 123456780]){
      g.stats().score = sc;
      g.autoMatch();                                   // любой матч дёргает updateHUD
      await new Promise(r => setTimeout(r, 220));
      const t = document.getElementById('score'), svg = document.getElementById('scSvg');
      const tr = t.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      out.push({ text: t.textContent, over: Math.round(tr.right - innerWidth),
                 outOfBox: Math.round(tr.right - sr.right) });
    }
    g.stats().score = keep;                            // счёт уровня вернули
    g.regen(); g.skipIntro();                          // и уровень с чистого листа
    return out;
  });
  {
    const worstScreen = Math.max(...chipFit.map(o => o.over));
    const worstBox = Math.max(...chipFit.map(o => o.outOfBox));
    expect(worstScreen < 0,
      'чип НЕ вылезает за экран ни на одном балансе (худший край ' + worstScreen + 'px, ' +
      chipFit.map(o => o.text.trim()).join(' / ') + ')');
    expect(worstBox <= 0,
      'текст чипа НЕ выходит за свою рамку — якорь едет за viewBox (' + worstBox + 'px)');
  }

  // Кошелёк и рейтинг РАЗДЕЛЕНЫ: трата не отнимает звёзды уровней
  const walletProbe = await page.evaluate(() => {
    const g = window.__game;
    g.starGrant(5000);
    const before = { bal: g.starBalance(), stars: Object.assign({}, g.wallet().stars) };
    const ok = g.spendStars(2000);
    const after = { bal: g.starBalance(), stars: Object.assign({}, g.wallet().stars) };
    const tooMuch = g.spendStars(999999);
    return { before, after, ok, tooMuch, balAfterFail: g.starBalance() };
  });
  expect(walletProbe.ok && walletProbe.after.bal === walletProbe.before.bal - 2000,
    'списание уменьшает баланс (' + walletProbe.before.bal + ' -> ' + walletProbe.after.bal + ')');
  expect(JSON.stringify(walletProbe.before.stars) === JSON.stringify(walletProbe.after.stars),
    'трата валюты НЕ трогает рейтинг уровней (' + JSON.stringify(walletProbe.after.stars) + ')');
  expect(walletProbe.tooMuch === false && walletProbe.balAfterFail === walletProbe.after.bal,
    'списание сверх баланса отклонено и баланс не изменён (' + walletProbe.balAfterFail + ')');

  // ⚠️ ГЛАВНЫЙ РИСК: потратил -> синхронизация с ОТСТАВШЕЙ облачной копией
  // НЕ должна вернуть потраченное (наивный max по балансу дюпил бы валюту)
  const dupProbe = await page.evaluate(() => {
    const g = window.__game;
    const stale = g.saveRaw();            // копия ДО траты — как в облаке
    const before = g.starBalance();
    g.spendStars(1000);
    const afterSpend = g.starBalance();
    const afterMerge = g.mergeRaw(stale); // «облако» отдаёт устаревшее состояние
    return { before, afterSpend, afterMerge };
  });
  expect(dupProbe.afterSpend === dupProbe.before - 1000, 'трата прошла (' + dupProbe.before + ' -> ' + dupProbe.afterSpend + ')');
  expect(dupProbe.afterMerge === dupProbe.afterSpend,
    '⚠️ ДЮП: мерж со старой облачной копией НЕ вернул потраченное (' + dupProbe.afterSpend + ' -> ' + dupProbe.afterMerge + ')');

  // BOOST: цена по ступени, покупка растит множитель, списывает баланс
  const boostProbe = await page.evaluate(() => {
    const g = window.__game;
    const key = g.accSnapshot()[0].key;
    g.starGrant(60000);
    const p0 = g.boostPrice(key), t0 = g.accSnapshot()[0].tier, bt0 = g.boostTier(key), m0 = g.accSnapshot()[0].mult;
    const bal0 = g.starBalance();
    const buy = g.buyBoost(key);
    const s1 = g.accSnapshot()[0];
    const p1 = g.boostPrice(key);
    return { key, p0, t0, bt0, m0, bal0, buy, t1: s1.tier, m1: s1.mult, boost: s1.boost,
      count0: s1.count, bal1: g.starBalance(), p1 };
  });
  // фикс B: цена от КУПЛЕННЫХ ступеней (boostTier), НЕ суммарных (accTier).
  // snap0 имеет заработанные ступени, но первая КУПЛЕННАЯ стоит base·2^0=2000
  expect(boostProbe.p0 === 2000 * Math.pow(2, boostProbe.bt0),
    'цена буста от boughtTier (не accTier): base 2000 (boughtTier ' + boostProbe.bt0 + ' -> ' + boostProbe.p0 + ')');
  expect(boostProbe.buy.ok && boostProbe.t1 === boostProbe.t0 + 1,
    'покупка подняла ступень (' + boostProbe.t0 + ' -> ' + boostProbe.t1 + ')');
  expect(Math.abs(boostProbe.m1 - (boostProbe.m0 + 0.25)) < 1e-9,
    'множитель типа вырос на ACC_MULT_STEP (' + boostProbe.m0 + ' -> ' + boostProbe.m1 + ')');
  expect(boostProbe.bal1 === boostProbe.bal0 - boostProbe.p0,
    'баланс списан ровно на цену (' + boostProbe.bal0 + ' -> ' + boostProbe.bal1 + ')');
  expect(boostProbe.p1 === boostProbe.p0 * 2, 'следующая ступень дороже вдвое (' + boostProbe.p1 + ')');
  expect(boostProbe.boost === 1, 'купленные ступени учтены отдельно от спасённых (boost ' + boostProbe.boost + ')');

  // Недостаточно средств — отказ без списания
  const denyProbe = await page.evaluate(() => {
    const g = window.__game;
    const key = g.accSnapshot()[1].key;
    while (g.starBalance() > 0) g.spendStars(g.starBalance());
    const r = g.buyBoost(key);
    return { r, bal: g.starBalance(), tier: g.accSnapshot()[1].tier };
  });
  expect(denyProbe.r.ok === false && denyProbe.r.reason === 'insufficient',
    'буст без денег отклонён (' + JSON.stringify(denyProbe.r) + ')');
  expect(denyProbe.bal === 0, 'отказ не списал баланс (' + denyProbe.bal + ')');

  // Миграция старого сейва: накопленный РЕЙТИНГ даёт стартовый баланс, разово
  const migProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // «старый» сейв из БОЛЕЕ НОВОГО поколения: рейтинг есть, кошелька нет
    g.mergeRaw({ gen: (cur.gen || 0) + 1, stars: { 1: 3, 2: 2, 3: 1 }, se: 0, ss: 0, sm: 0, ac: {}, bo: {} });
    const before = g.starBalance();
    const got = g.starMigrate();
    const after = g.starBalance();
    const again = g.starMigrate(); // повторный вызов не должен начислить
    return { before, got, after, again, balFinal: g.starBalance() };
  });
  const migExpect = (500 + 10) + (250 + 20) + (100 + 30); // 3★ур1 + 2★ур2 + 1★ур3
  expect(migProbe.before === 0 && migProbe.got === migExpect,
    'миграция начислила стартовый баланс по рейтингу (' + migProbe.got + ' = ' + migExpect + ')');
  expect(migProbe.again === 0 && migProbe.balFinal === migProbe.after,
    'миграция разовая — повтор ничего не добавил (' + migProbe.balFinal + ')');

  // ОТКРЫТИЕ ТИПА ЗА БАЛАНС (финализация владельца): закрытый тип, трата,
  // становится открытым (bought), лидерборд/баланс падают на цену
  const unlockBuyProbe = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.regen(); g.skipIntro();
    // берём заведомо ЗАКРЫТЫЙ тип (индекс 40 > 9 открытых на ур.1)
    const snap = g.accSnapshot();
    const closed = snap.find((r, i) => i >= 20 && !r.unlocked);
    g.starGrant(10000);
    const price = g.typeUnlockPrice(closed.key);
    const wasUnlocked = g.isTypeUnlocked(closed.key);
    const w0 = g.starBalance();
    const buy = g.purchaseUnlock(closed.key);
    const nowUnlocked = g.isTypeUnlocked(closed.key);
    const s2 = g.accSnapshot().find(r => r.key === closed.key);
    const w1 = g.starBalance();
    const buyAgain = g.purchaseUnlock(closed.key); // уже открыт -> отказ
    return { key: closed.key, price, wasUnlocked, buy, nowUnlocked,
      bought: s2.bought, snapUnlocked: s2.unlocked, w0, w1, buyAgain };
  });
  expect(unlockBuyProbe.wasUnlocked === false && unlockBuyProbe.price === 1000,
    'ур.1: цена открытия 1000 = BASE 800 + PER_LEVEL 200·1 (' + unlockBuyProbe.price + ')');
  // #9 МАТРИЦА: цена ЗАВИСИТ от уровня (не флэт). Проверяем L1/L10/L50.
  const unlockMatrixProbe = await page.evaluate(() => {
    const g = window.__game;
    const pick = () => { const s = g.accSnapshot(); const c = s.find((r, i) => i >= 20 && !r.unlocked); return c ? c.key : null; };
    g.setLevel(1);  g.regen(); g.skipIntro(); const p1  = g.typeUnlockPrice(pick());
    g.setLevel(10); g.regen(); g.skipIntro(); const p10 = g.typeUnlockPrice(pick());
    g.setLevel(50); g.regen(); g.skipIntro(); const p50 = g.typeUnlockPrice(pick());
    return { p1, p10, p50 };
  });
  expect(unlockMatrixProbe.p1 === 1000 && unlockMatrixProbe.p10 === 2800 && unlockMatrixProbe.p50 === 10800,
    'матрица цены по уровню: L1=1000 L10=2800 L50=10800 (' + JSON.stringify(unlockMatrixProbe) + ')');
  expect(unlockBuyProbe.buy.ok && unlockBuyProbe.nowUnlocked === true,
    'покупка открыла тип (' + unlockBuyProbe.key + ')');
  expect(unlockBuyProbe.bought === true && unlockBuyProbe.snapUnlocked === true,
    'снапшот: bought=true и unlocked=true после покупки');
  expect(unlockBuyProbe.w1 === unlockBuyProbe.w0 - unlockBuyProbe.price,
    'трата на открытие списала кошелёк на цену (' + unlockBuyProbe.w0 + ' -> ' + unlockBuyProbe.w1 + ')');
  expect(unlockBuyProbe.buyAgain.ok === false && unlockBuyProbe.buyAgain.reason === 'already',
    'повторная покупка открытого типа отклонена (' + JSON.stringify(unlockBuyProbe.buyAgain) + ')');

  // ФИКС A — ЧЕСТНЫЙ ЛИДЕРБОРД (таблица №2): пополнение (реклама/IAP) растит
  // КОШЕЛЁК, но НЕ ранг; трата сперва ест пополнение, ранг падает лишь при
  // трате СВЕРХ пополнения. Чистый старт через мерж нового поколения.
  const ldbProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // gen-bump берёт копию ЦЕЛИКОМ — сбрасываем только se/ss/tu, остальное
    // (накопление/рейтинг/бусты/разлоки) переносим из текущего сейва
    g.mergeRaw({ gen: (cur.gen || 0) + 1, se: 5000, ss: 0, tu: 0, sm: 1,
      stars: cur.stars, ac: cur.ac, bo: cur.bo, uk: cur.uk });
    const lb0 = g.leaderboardScore(), w0 = g.starBalance();  // se=5000 -> оба 5000
    g.starGrant(3000);                                        // пополнение -> tu
    const lb1 = g.leaderboardScore(), w1 = g.starBalance();  // кошелёк 8000, ранг 5000
    g.spendStars(2000);                                       // в пределах пополнения (3000)
    const lb2 = g.leaderboardScore();                         // ранг цел
    g.spendStars(2000);                                       // ss=4000 > tu=3000 на 1000 -> ранг 4000
    const lb3 = g.leaderboardScore();
    return { lb0, w0, lb1, w1, lb2, lb3 };
  });
  expect(ldbProbe.w0 === 5000 && ldbProbe.lb0 === 5000, 'ФИКС A: чистый старт se=5000 (кошелёк=ранг=5000)');
  expect(ldbProbe.w1 === 8000 && ldbProbe.lb1 === 5000,
    'ФИКС A: пополнение растит КОШЕЛЁК (8000), но НЕ лидерборд (5000) — не pay-to-win');
  expect(ldbProbe.lb2 === 5000, 'ФИКС A: трата в пределах пополнения не роняет ранг (' + ldbProbe.lb2 + ')');
  expect(ldbProbe.lb3 === 4000, 'ФИКС A: трата сверх пополнения роняет сыгранный ранг (5000 -> ' + ldbProbe.lb3 + ')');

  // КАП БУСТА (фикс код-ревью): макс купленных ступеней ЛЮБОГО типа = 5 =
  // 2000·(2^5−1) = 62000 = пак-анкор Mega, универсально. Незалоченный
  // несыгранный тип НЕ должен буститься на ~1M.
  const boostCapProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // чистый старт: гора баланса, НОЛЬ накопления и бустов у всех типов
    g.mergeRaw({ gen: (cur.gen || 0) + 1, se: 2000000, ss: 0, tu: 0, sm: 1, stars: cur.stars, ac: {}, bo: {}, uk: {} });
    const key = g.accSnapshot().find(r => r.unlocked).key; // открытый прогрессией, 0 заработанных
    let spent = 0, steps = 0; const prices = [];
    while (g.boostPrice(key) != null && steps < 20){
      const p = g.boostPrice(key); prices.push(p); g.buyBoost(key); spent += p; steps++;
    }
    return { key, steps, spent, prices, finalPrice: g.boostPrice(key), boughtTier: g.boostTier(key) };
  });
  expect(boostCapProbe.steps === 5 && boostCapProbe.spent === 62000,
    'макс буст любого типа = 5 ступеней = 62000 (Mega-анкор), не ~1M (' + boostCapProbe.steps + '/' + boostCapProbe.spent + ')');
  expect(boostCapProbe.finalPrice === null && boostCapProbe.boughtTier === 5,
    'после 5 купленных boostPrice=null — кап boostTier (' + boostCapProbe.boughtTier + ')');
  expect(JSON.stringify(boostCapProbe.prices) === JSON.stringify([2000, 4000, 8000, 16000, 32000]),
    'лестница цен буста 2000/4000/8000/16000/32000 (' + JSON.stringify(boostCapProbe.prices) + ')');

  // закрытый тип НЕЛЬЗЯ бустить (сначала открыть) — boostPrice null, buyBoost 'locked'
  const lockBoost = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.clearBought(); g.regen(); g.skipIntro();
    const closed = g.accSnapshot().find((r, i) => i >= 20 && !r.unlocked);
    g.starGrant(100000);
    return { key: closed.key, price: g.boostPrice(closed.key), can: g.canBoost(closed.key), buy: g.buyBoost(closed.key) };
  });
  expect(lockBoost.price === null && lockBoost.can === false && lockBoost.buy.reason === 'locked',
    'закрытый тип нельзя забустить, сначала открыть (' + JSON.stringify(lockBoost.buy) + ')');

  // открытие без средств — отказ без списания
  const unlockDeny = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.regen(); g.skipIntro();
    const closed = g.accSnapshot().find((r, i) => i >= 20 && !r.unlocked);
    while (g.starBalance() > 0) g.spendStars(g.starBalance());
    const r = g.purchaseUnlock(closed.key);
    return { r, bal: g.starBalance(), unlocked: g.isTypeUnlocked(closed.key) };
  });
  expect(unlockDeny.r.ok === false && unlockDeny.r.reason === 'insufficient' && unlockDeny.unlocked === false,
    'открытие без средств отклонено, тип закрыт (' + JSON.stringify(unlockDeny.r) + ')');

  // ОТКРЫТОСТЬ ТИПОВ прогрессией (ручка для ГРАФИКИ: портрет только открытым)
  // ⚠️ сбрасываем купленные разлоки — иначе тест покупки выше засчитался бы
  // как прогрессия (эта проверка про ЧИСТУЮ прогрессионную открытость)
  const unlockProbe = await page.evaluate(() => {
    const g = window.__game;
    g.clearBought();
    g.setLevel(1);
    const snap1 = g.accSnapshot();
    const u1 = g.unlockedTypes();
    const first = snap1[0].key, at20 = snap1[20] ? snap1[20].key : null;
    g.setLevel(15);
    const u15 = g.unlockedTypes().length;
    g.setLevel(1);
    return { n1: u1.length, snapUnlocked1: snap1.filter(r => r.unlocked).length,
      firstUnlocked: g.isTypeUnlocked(first), at20Unlocked: at20 ? g.isTypeUnlocked(at20) : null,
      n15: u15, bogus: g.isTypeUnlocked('nope') };
  });
  expect(unlockProbe.n1 === 9 && unlockProbe.snapUnlocked1 === 9,
    'ур.1: открыто ровно 9 типов, поле unlocked согласовано (' + unlockProbe.n1 + '/' + unlockProbe.snapUnlocked1 + ')');
  expect(unlockProbe.firstUnlocked === true && unlockProbe.at20Unlocked === false,
    'TYPES[0] открыт, TYPES[20] закрыт на ур.1 (' + unlockProbe.firstUnlocked + '/' + unlockProbe.at20Unlocked + ')');
  expect(unlockProbe.n15 === 23, 'ур.15: открыто 9+14=23 типа (' + unlockProbe.n15 + ')');
  expect(unlockProbe.bogus === false, 'несуществующий тип не открыт (' + unlockProbe.bogus + ')');

  // адаптер рекламы: на file:// SDK не грузится — режим заглушки
  const adsMode = await page.evaluate(() => window.__game.adsMode());
  expect(adsMode === 'stub', 'ads mode на file:// — stub (' + adsMode + ')');


  // ⚠️ синтетический креш секции МЕТРИК — ожидаемый, он и есть предмет
  // проверки; иначе собственный тест ловли ошибок валил бы сьют как «ошибка
  // страницы» и маскировал настоящие
  const realErrors = errors.filter(e => !/reading 'boom'/.test(e));
  if (realErrors.length) failures.push('runtime errors: ' + realErrors.join(' | '));
  // ВИТРИНА: ПРАВИЛО 2/3 (спека владельца 2026-07-27, ОТМЕНЯЕТ camnear):
  // панель видна на десктопе И планшетах (@media min-width:813 = 3×271px
  // полосы, pointer:fine снят), прячется ТОЛЬКО по ширине; приближение
  // камеры её больше НЕ гасит.
  const vitDisp = () => page.evaluate(() =>
    getComputedStyle(document.getElementById('vitrine')).display);
  expect(await vitDisp() === 'none',
    'витрина: мобайл-вьюпорт (390 < 813) — панели нет');
  await page.setViewportSize({ width: 1024, height: 768 }); // планшет-ландшафт
  await page.waitForTimeout(500); // тик витрины 150мс — дать построиться
  expect(await vitDisp() === 'block',
    'витрина: планшет 1024 ≥ 813 — панель ВИДНА (pointer:fine снят)');
  const vitZoom = await (async () => {
    await page.evaluate(() => window.__game.setCamR(9)); // максимальный зум
    await page.waitForTimeout(400);
    return { disp: await vitDisp(),
      cls: await page.evaluate(() => document.documentElement.classList.contains('camnear')) };
  })();
  expect(vitZoom.disp === 'block' && vitZoom.cls === false,
    'витрина: при СИЛЬНОМ зуме панель СТОИТ (camnear отменён) (' + JSON.stringify(vitZoom) + ')');
  await page.setViewportSize({ width: 800, height: 768 }); // уже порога 813
  await page.waitForTimeout(250);
  expect(await vitDisp() === 'none',
    'витрина: 800 < 813 (панель заняла бы >1/3) — скрыта');
  await page.setViewportSize({ width: 390, height: 780 }); // вернуть сьюту мобайл
  await page.evaluate(() => window.__game.setCamR(16.2));
  await page.waitForTimeout(250);
  // ПРИМИТИВЫ ПОД РЕКЛАМУ (контракт с ИНТЕГРАЦИЕЙ 2026-07-23): тихая пауза
  // без попапа + владение резюмом через boolean + внешний мьют, независимый
  // от тумблера игрока CFG.sound
  const adPrim = await page.evaluate(() => {
    const g = window.__game;
    const first = g.pause(true);                 // тихая пауза: поставил я
    const s1 = g.pauseState();
    const second = g.pause(true);                // повторный вызов: НЕ моя
    g.sound.setMuted(true);
    const s2 = g.pauseState();
    g.resume(); g.sound.setMuted(false);
    const s3 = g.pauseState();
    return { first, second, s1, s2, s3, cfg: window.__game.cfg.sound };
  });
  expect(adPrim.first === true && adPrim.second === false,
    'пауза под рекламу: первый вызов владеет паузой, повторный отдаёт false (' + adPrim.first + '/' + adPrim.second + ')');
  expect(adPrim.s1.paused === true && adPrim.s1.overlay === false,
    'тихая пауза НЕ показывает попап настроек (' + JSON.stringify(adPrim.s1) + ')');
  expect(adPrim.s2.muted === true && adPrim.cfg === true,
    'внешний мьют глушит звук, НЕ трогая тумблер игрока CFG.sound (' + JSON.stringify(adPrim.s2) + ')');
  expect(adPrim.s3.paused === false && adPrim.s3.muted === false,
    'после ролика пауза и мьют сняты (' + JSON.stringify(adPrim.s3) + ')');

  // КОНТРАКТ INTRODONE (витрина разворачивается после облёта, спека владельца):
  // класса нет пока идёт интро, появляется по его завершении (в т.ч. skipIntro)
  const introCls = await page.evaluate(() => {
    const was = document.documentElement.classList.contains('introdone');
    window.__game.regen(); // новый уровень — интро стартует, класс обязан слететь
    const during = document.documentElement.classList.contains('introdone');
    window.__game.skipIntro();
    return { was, during, after: document.documentElement.classList.contains('introdone') };
  });
  expect(introCls.during === false && introCls.after === true,
    'introdone: во время интро класса нет, после завершения есть (' + JSON.stringify(introCls) + ')');
  await page.evaluate(() => window.__game.setCamR(16.2)); // вернуть камеру сценарию

  // === НЕСОВМЕЩАЕМЫЕ КАМНИ: блок В КОНЦЕ сьюта НАМЕРЕННО — секции меняют
  // уровень (setLevel 15/16 + regen), и в середине они ломали контекст
  // «полного прогона» (он рассчитан на ур.1: бюджет встрясок, камера) ===
  // НЕСОВМЕЩАЕМЫЕ КАМНИ (спека владельца 2026-07-22): рампа спавна,
  // двойной штраф тапа, съём бомбой, ∞-порог эндшпиля без учёта камней
  await page.evaluate(() => { window.__game.setLevel(15); window.__game.regen(); window.__game.skipIntro(); });
  const r15 = await page.evaluate(() => window.__game.rocks());
  expect(r15 === 0, 'ур.15: камней нет (' + r15 + ')');
  await page.evaluate(() => { window.__game.setLevel(16); window.__game.regen(); window.__game.skipIntro(); });
  const r16 = await page.evaluate(() => window.__game.rocks());
  expect(r16 === 1, 'ур.16: один камень (' + r16 + ')');
  // тап по камню: −2×MISS_PENALTY (на ур.16 штрафы полные), misses растёт.
  // findByTex v2 отдаёт ВИДИМУЮ точку (рейкаст с камеры) — если камень
  // целиком закрыт кучей, {occluded:true}: встряхиваем и повторяем (флейк
  // v76: клик по проекции центра попадал в загораживающий предмет, +120)
  let rockT = null;
  for (let att = 0; att < 5; att++){
    rockT = await page.evaluate(() => window.__game.findByTex('rock'));
    if (rockT && !rockT.occluded) break;
    await page.evaluate(() => window.__game.shake());
    await page.waitForTimeout(1700);
  }
  expect(!!rockT && !rockT.occluded, 'камень имеет видимую точку (' + JSON.stringify(rockT) + ')');
  const rockTap0 = await page.evaluate(() => ({ score: window.__game.stats().score,
    misses: window.__game.stats().misses }));
  await page.mouse.click(rockT.px, rockT.py);
  await page.waitForTimeout(300);
  const rockTap1 = await page.evaluate(() => ({ score: window.__game.stats().score,
    misses: window.__game.stats().misses, rocks: window.__game.rocks() }));
  expect(rockTap1.score === rockTap0.score - 20, 'тап по камню: −20 (' + rockTap0.score + ' -> ' + rockTap1.score + ')');
  expect(rockTap1.misses === rockTap0.misses + 1, 'тап по камню засчитан промахом');

  // ── МЕТРИКИ (docs/METRICS.md) — СЕКЦИЯ В КОНЦЕ НАМЕРЕННО:
  // она регенерит уровень и бросает синтетический креш, т.е. портит контекст
  // соседям (поймал на себе: следующий тест ждал ур.1 и промах, а получил 0).
  // ⚠️ Буфер телеметрии копится ДАЖЕ при выключенной отправке (URL пуст) —
  // иначе «работает ли сбор» выяснялось бы только на проде.
  const tm = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 700));
    const scrInGame = g.telemetryScreen();
    setTimeout(() => { null.boom(); }, 0);          // синтетический креш
    await new Promise(r => setTimeout(r, 300));
    return { scrInGame, evs: g.telemetry(60) };
  });
  {
    const err = tm.evs.filter(e => e.n === 'err').pop();
    expect(tm.scrInGame === 'game', 'экран партии помечен как game (' + tm.scrInGame + ')');
    expect(!!err && /boom/.test(err.m) && !!err.st,
      'креш пойман с сообщением и стеком (' + (err ? err.m.slice(0, 40) : 'нет') + ')');
    expect(!!err && err.v === 'game' && err.lv >= 1,
      'у креша есть контекст: экран и уровень (' + (err ? err.v + '/' + err.lv : '—') + ')');
  }
  // тап пишет СЕКТОР и ИСХОД (а не координаты — см. METRICS §4)
  // ⚠️ кликаем по ЭКРАННОЙ позиции живого предмета, а не в наугад выбранную
  // точку: первая версия била в пустоту мимо кучи и ассерт «нет тапа» врал
  const pt = await page.evaluate(() => {
    const g = window.__game, t = g.topItem();
    if (!t) return null;
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (pt) await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const tap = await page.evaluate(() => window.__game.telemetry(20).filter(e => e.n === 'tap').pop());
  expect(!!tap && /^(t|m|b)(l|c|r)$/.test(tap.z) && !!tap.r,
    'тап записан сектором и исходом (' + (tap ? tap.z + '/' + tap.r : 'нет') + ')');
  // экран закрывается с длительностью
  const scr = await page.evaluate(() => window.__game.telemetry(60).filter(e => e.n === 'screen').pop());
  expect(!!scr && scr.ms > 0 && !!scr.v,
    'экран закрыт с длительностью (' + (scr ? scr.v + ' ' + scr.ms + 'мс' : 'нет') + ')');


  expect(rockTap1.rocks === 1, 'камень тапом не убирается');
  // бомба убирает камень: телепортируем обоих в воздух рядом и детонируем —
  // камень в радиусе, прочая куча далеко внизу (кап не мешает)
  // ⚠️ БОМБУ ПРОВЕРЯЕМ ЯВНО (флейк 2026-07-29 «1 -> 1»): если её израсходовала
  // предыдущая секция, bombIndex()=-1, place(-1,…) молча ничего не делает и
  // detonate() тоже — камень остаётся, а сообщение винит бомбу в том, что её
  // просто нет. Теперь индекс попадает в текст ассерта: следующий отказ сразу
  // назовёт настоящую причину, а не заставит гадать.
  const bombPre = await page.evaluate(() => {
    const g = window.__game;
    const bi = g.bombIndex();
    if (bi >= 0) g.place(bi, 0, 13, 0);
    g.place(g.rockIndex(), 0.9, 13.2, 0);
    return { rocks: g.rocks(), bomb: bi };
  });
  await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const rocksAfterBomb = await page.evaluate(() => window.__game.rocks());
  expect(bombPre.rocks === 1 && bombPre.bomb >= 0 && rocksAfterBomb === 0,
    'бомба убирает камень (камней ' + bombPre.rocks + ' -> ' + rocksAfterBomb +
    ', бомба index ' + bombPre.bomb + ')');
  // ∞-порог эндшпиля: камни не в счёте — при <=8 совмещаемых радиус 99
  await page.evaluate(() => { window.__game.setLevel(16); window.__game.regen(); window.__game.skipIntro(); });
  let guardR = 0, sinceRestR = 0;
  while (guardR++ < 500){
    const st = await page.evaluate(() => ({ alive: window.__game.alive(), r: window.__game.cfg.matchRadius, rocks: window.__game.rocks(),
      over: window.__game.level().over }));
    if (st.over || st.alive === 0){ // финал доел всё раньше сэмпла ≤8 — тоже валидный исход
      console.log('эндшпиль-с-камнем: уровень закрыт до сэмпла ≤8 (валидно)');
      break;
    }
    if (st.alive - st.rocks - 1 <= 8){ // −сюрприз −камни
      // ждём refresh-тик — мгновенное чтение радиуса ловит старое значение
      await page.waitForFunction(() => window.__game.cfg.matchRadius > 10, null, { timeout: 900 }).catch(() => {});
      const rFin = await page.evaluate(() => window.__game.cfg.matchRadius);
      expect(rFin > 10, '∞-радиус при <=8 совмещаемых, камни не мешают (r=' + rFin + ', rocks=' + st.rocks + ')');
      break;
    }
    const ok = await page.evaluate(() => window.__game.autoMatch());
    if (!ok){ await page.evaluate(() => window.__game.shake()); await page.waitForTimeout(1100); }
    // та же передышка, что в полном прогоне: непрерывный темп держит серию
    // турбо вечно (досыпка не даёт чаше опустеть до ∞-порога)
    else if (++sinceRestR >= 10){ sinceRestR = 0; await page.waitForTimeout(4300); }
    else await page.waitForTimeout(120);
  }
  expect(guardR < 500, 'эндшпиль с камнем достигнут ботом');

  // matcap-тюнер (дебаг-инструмент владельца): открывается из консоли, живьём
  // пересматривает пресет, закрывается повторным вызовом. Секция В КОНЦЕ и
  // САМОВОССТАНАВЛИВАЮЩАЯСЯ — пресеты глобальны, испорченный matcap утёк бы
  // в любые последующие проверки.
  const tuner = await page.evaluate(() => {
    const g = window.__game;
    const was = g.matcapPresets().soft.amb, sum0 = g.matcapSum('soft');
    g.matcapTuner();
    const sliders = document.querySelectorAll('#matcapTuner input[type=range]').length;
    const el = document.querySelector('#matcapTuner input[data-mc="soft.amb"]');
    const drag = v => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    drag(0.05);
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const moved = g.matcapPresets().soft.amb, sum1 = g.matcapSum('soft');
      drag(was);                                        // вернуть как было
      requestAnimationFrame(() => requestAnimationFrame(() => {
        g.matcapTuner();                                // и закрыть
        res({ sliders, was, moved, sum0, sum1, back: g.matcapPresets().soft.amb,
              sumBack: g.matcapSum('soft'), closed: !document.getElementById('matcapTuner') });
      }));
    })));
  });
  expect(tuner.sliders === 26, 'тюнер: 26 ползунков (3 света + 2 вуали + 3×7 пресетов)');
  expect(tuner.moved === 0.05, 'тюнер меняет пресет (soft.amb ' + tuner.was + ' -> ' + tuner.moved + ')');
  expect(tuner.sum1 !== tuner.sum0, 'тюнер ПЕРЕСНИМАЕТ текстуру (сумма ' + tuner.sum0 + ' -> ' + tuner.sum1 + ')');
  expect(tuner.back === tuner.was && tuner.sumBack === tuner.sum0, 'тюнер откатывается ровно назад');
  expect(tuner.closed, 'тюнер закрывается повторным вызовом');

  // ── BRIDGE: облачный сейв НЕ зависит от поддержки rewarded ───────────────
  // Регрессия 2026-07-23: bridgeSyncSave() стоял ПОСЛЕ гейта isRewardedSupported,
  // а commitSave (77-save) пишет в bridge.storage всегда, когда storage есть.
  // На площадке со storage, но без rewarded прогресс уезжал в облако в один
  // конец и не поднимался никогда. Проверять приходится на http: на file://
  // SDK не грузится вовсе (ранний return по протоколу), поэтому поднимаем
  // локальный сервер и подсовываем ПОДДЕЛЬНЫЙ SDK с rewarded=false, который
  // считает обращения к storage. Отдельная страница — состояние основного
  // прогона не трогаем.
  const http = require('http'), fs = require('fs');
  const MOCK_SDK = `
window.__probe = { initialized:false, gameReady:false, storageGet:0, storageSet:0 };
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY: 'game_ready' },
  EVENT_NAME: { REWARDED_STATE_CHANGED: 'rewarded_state_changed' },
  REWARDED_STATE: { REWARDED:'rewarded', FAILED:'failed', CLOSED:'closed' },
  platform: { id:'mocktest', language:'en', sendMessage(){ window.__probe.gameReady = true; } },
  advertisement: { isRewardedSupported:false, isInterstitialSupported:false,
                   on(){}, showRewarded(){}, showInterstitial(){} },
  storage: { get(k){ window.__probe.storageGet++; return Promise.resolve(null); },
             set(k,v){ window.__probe.storageSet++; return Promise.resolve(); } },
  initialize(){ window.__probe.initialized = true; return Promise.resolve(); },
};
`;
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK_SDK); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const bport = srv.address().port;
  const bpage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const bErrors = [];
  bpage.on('pageerror', e => bErrors.push('PAGEERROR: ' + e.message));
  bpage.on('console', m => { if (m.type() === 'error') bErrors.push('CONSOLE: ' + m.text()); });
  await bpage.goto('http://127.0.0.1:' + bport + '/index.html');
  await bpage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  await bpage.waitForFunction(() => window.__probe && window.__probe.initialized, null, { timeout: 20000 });
  await bpage.evaluate(() => window.__game.grant(1)); // любое изменение сейва -> commitSave -> запись в облако
  await bpage.waitForTimeout(1000);                   // промисы sync/записи
  const bp = await bpage.evaluate(() => ({ ...window.__probe, mode: window.__game.adsMode() }));
  await bpage.close();
  await new Promise(r => srv.close(r));
  expect(bp.initialized && bp.gameReady, 'bridge: SDK инициализирован, GAME_READY отправлен');
  expect(bp.storageGet >= 1, 'bridge: облако ЧИТАЕТСЯ и без rewarded (storage.get ' + bp.storageGet + ')');
  expect(bp.storageSet >= 1, 'bridge: облако пишется (storage.set ' + bp.storageSet + ') — симметрия чтения/записи');
  expect(bp.mode === 'stub', 'bridge: без rewarded режим остаётся stub (' + bp.mode + ')');
  if (bErrors.length) failures.push('bridge-проба: ' + bErrors.join(' | '));

  // ВУАЛЬ НЕДОСТУПНЫХ В HARD (спека владельца 2026-07-23): обесцвечивание
  // идёт ЧЕРЕЗ ШЕЙДЕР — у текстурных моделей material.color белый, и старый
  // лерп к серому их не обесцвечивал вовсе. Секция самовосстанавливающаяся:
  // пин вуали глобальный, оставленный включённым, испортил бы всё дальнейшее.
  const veil = await page.evaluate(async () => {
    const g = window.__game;
    g.cfg.hard = true; g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 1200));
    g.forceRefresh();
    await new Promise(r => setTimeout(r, 700));   // лерп вуали 0.25 с + запас
    const hard = g.veilStats();
    const pinned = (g.veilAll(1), await new Promise(r => setTimeout(() => r(g.veilStats()), 350)));
    g.veilAll(null);
    // ⚠️ НЕ фиксированная пауза (флейк 2026-07-24, флагнул интерфейс «181→181»):
    // снятие пина возвращает вуаль под доступность ЧЕРЕЗ ЛЕРП (0.25с) +
    // refresh-тик — на медленном прогоне 700мс не всегда хватало, veiled
    // оставался на пине. Ждём УСЛОВИЯ (обесценилось меньше пиковых), потолок
    // 3с — как чинили флейки осколков и эндшпильного радиуса.
    const relDeadline = Date.now() + 3000;
    while (g.veilStats().veiled >= pinned.veiled && Date.now() < relDeadline)
      await new Promise(r => setTimeout(r, 100));
    const released = g.veilStats();
    g.cfg.hard = false;
    return { hard, pinned, released, alive: g.alive() };
  });
  expect(veil.hard.withShader > 50, 'вуаль: шейдерный патч на всех предметах (' + veil.hard.withShader + ')');
  expect(veil.hard.veiled > 0 && veil.hard.max > 0.5,
    'Hard: недоступные реально обесцвечены через uVeil (' + veil.hard.veiled + ' шт, max ' + veil.hard.max + ')');
  expect(veil.pinned.veiled === veil.pinned.withShader,
    'пин тюнера накрывает всю кучу (' + veil.pinned.veiled + '/' + veil.pinned.withShader + ')');
  expect(veil.released.veiled < veil.pinned.veiled,
    'снятие пина возвращает вуаль под управление доступности (' + veil.pinned.veiled + ' -> ' + veil.released.veiled + ')');
  // ── РЕКЛАМА: игра СТОИТ и МОЛЧИТ на время ролика ─────────────────────────
  // Требование Poki и CrazyGames; Bridge его не закрывает (проверено по его
  // адаптерам). Мок объявляет rewarded поддержанным — тогда режим 'bridge' —
  // и даёт из теста слать состояния. Показ запускаем БОЕВЫМ путём: клик по
  // кнопке «Watch» -> startAd -> Ads.showRewarded.
  const MOCK_RW = `
window.__mock = { h:{}, emit(ev,st){ (this.h[ev]||[]).forEach(f=>{ try{ f(st); }catch(e){} }); }, rwShown:0, interShown:0 };
function reg(ev,cb){ (window.__mock.h[ev] = window.__mock.h[ev] || []).push(cb); }
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY:'game_ready' },
  EVENT_NAME: { REWARDED_STATE_CHANGED:'rw', INTERSTITIAL_STATE_CHANGED:'inter', AUDIO_STATE_CHANGED:'audio' },
  REWARDED_STATE: { REWARDED:'rewarded', FAILED:'failed', CLOSED:'closed' },
  INTERSTITIAL_STATE: { LOADING:'loading', OPENED:'opened', CLOSED:'closed', FAILED:'failed' },
  platform: { id:'mocktest', language:'en', isAudioEnabled:true, sendMessage(){}, on:reg },
  advertisement: { isRewardedSupported:true, isInterstitialSupported:true, on:reg,
                   showRewarded(){ window.__mock.rwShown++; }, showInterstitial(){ window.__mock.interShown++; } },
  storage: { get(){ return Promise.resolve(null); }, set(){ return Promise.resolve(); } },
  initialize(){ return Promise.resolve(); },
};
`;
  const srv2 = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK_RW); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv2.listen(0, '127.0.0.1', r));
  const apage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const aErrors = [];
  apage.on('pageerror', e => aErrors.push('PAGEERROR: ' + e.message));
  await apage.goto('http://127.0.0.1:' + srv2.address().port + '/index.html');
  await apage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  await apage.evaluate(() => window.__game.skipIntro()); // пауза не встаёт во время интро
  await apage.waitForFunction(() => window.__game.adsMode() === 'bridge', null, { timeout: 20000 });
  expect(true, 'реклама: мок с rewarded даёт режим bridge');

  const adState = async () => apage.evaluate(() => window.__game.pauseState());
  const emit = async (ev, st) => { await apage.evaluate(([e,s]) => window.__mock.emit(e,s), [ev,st]); await apage.waitForTimeout(250); };

  // 1. НАГРАДА: показ -> игра замерла и заглохла -> награда -> всё вернулось
  await apage.evaluate(() => { const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 2;            // ad-состояние Shake
    document.getElementById('shakeBtn').click(); });  // тап = ролик сразу (оверлей снесён)
  await apage.waitForTimeout(250);
  const during = await adState();
  expect(during.paused && during.muted, 'реклама: во время ролика игра на паузе и звук заглушен (' + JSON.stringify(during) + ')');
  expect(!during.overlay, 'реклама: пауза ТИХАЯ — попап не показан (игрок не закрывает его руками)');
  await emit('rw', 'rewarded');
  const afterRw = await adState();
  expect(!afterRw.paused && !afterRw.muted, 'реклама: после награды пауза и звук восстановлены (' + JSON.stringify(afterRw) + ')');

  // 2. ПРОВАЛ: развязка обязана снимать паузу так же, иначе игра замёрзнет
  await apage.evaluate(() => { const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 2;            // ad-состояние Shake
    document.getElementById('shakeBtn').click(); });  // тап = ролик сразу (оверлей снесён)
  await apage.waitForTimeout(250);
  const during2 = await adState();
  await emit('rw', 'failed');
  const afterFail = await adState();
  expect(during2.paused && !afterFail.paused && !afterFail.muted,
    'реклама: при ПРОВАЛЕ показа игра тоже размораживается (' + JSON.stringify(afterFail) + ')');

  // 3. МЕЖСТРАНИЧНАЯ: идёт без наших колбэков — пауза висит на состояниях
  await emit('inter', 'opened');
  const interOn = await adState();
  await emit('inter', 'closed');
  const interOff = await adState();
  expect(interOn.paused && interOn.muted && !interOn.overlay,
    'межстраничная: игра на паузе и без звука, попапа нет (' + JSON.stringify(interOn) + ')');
  expect(!interOff.paused && !interOff.muted, 'межстраничная: после закрытия всё восстановлено');

  // ГЛАВНЫЙ ЭКРАН НЕ ЛЕЗЕТ ПОВЕРХ ЧУЖОЙ ПАУЗЫ (интерфейс честно сообщил, что
  // сам эту ветку не покрыл — нужен именно этот bridge-мок). Сценарий: идёт
  // межстраничная (пауза рекламная), игрок жмёт ⏸ — меню НЕ должно открыться
  // и НЕ должно снять чужую паузу; после закрытия ролика игра размораживается
  // сама. Без этого игрок вернулся бы в живую игру, которую не возобновлял.
  await emit('inter', 'opened');
  const menuTry = await apage.evaluate(() => {
    window.showMainScreen();                       // попытка открыть поверх рекламы
    return { open: document.getElementById('mainScreen').classList.contains('open'),
             st: window.__game.pauseState() };
  });
  await emit('inter', 'closed');
  const afterAd = await apage.evaluate(() => ({
    open: document.getElementById('mainScreen').classList.contains('open'),
    st: window.__game.pauseState() }));
  expect(menuTry.open === false && menuTry.st.paused === true,
    'меню НЕ открывается поверх рекламной паузы (' + JSON.stringify(menuTry) + ')');
  expect(afterAd.st.paused === false && afterAd.open === false,
    'после ролика игра разморожена, меню так и не открылось (' + JSON.stringify(afterAd) + ')');

  // 4. ЗВУК ПЛОЩАДКИ (AUDIO_STATE_CHANGED): глушит БЕЗ паузы и не залипает
  await emit('audio', false);
  const audOff = await adState();
  await emit('audio', true);
  const audOn = await adState();
  expect(audOff.muted && !audOff.paused, 'звук площадки: выключение глушит игру, но не ставит её на паузу');
  expect(!audOn.muted, 'звук площадки: включение возвращает звук');

  // 5. КАДЕНЦИЯ «каждый 5 уровень» (спека владельца 2026-07-23). Копим победы
  // через публичные noteWin/maybeInterstitial (window.__ads), считаем реальные
  // вызовы showInterstitial у мока. Полный прогон 5 побед был бы медленным и
  // флейкозависимым — каденция это чистая функция счётчика, тестируем её.
  const cad = await apage.evaluate(() => {
    const A = window.__ads, M = window.__mock, every = 5;
    const seq = [];
    const base = M.interShown;
    // 4 победы — ролика ещё нет
    for (let i = 0; i < every - 1; i++){ A.noteWin(); A.maybeInterstitial(); }
    seq.push(M.interShown - base);                 // 0
    // 5-я победа — ролик показан ровно один раз
    A.noteWin(); A.maybeInterstitial();
    seq.push(M.interShown - base);                 // 1
    // повторный переход без новой победы (напр. поражение+повтор) — не дублит
    A.maybeInterstitial();
    seq.push(M.interShown - base);                 // 1
    // ещё 5 побед — следующий ролик
    for (let i = 0; i < every; i++){ A.noteWin(); A.maybeInterstitial(); }
    seq.push(M.interShown - base);                 // 2
    // ОТЛОЖЕННЫЙ показ: уровень можно сменить МИМО maybeInterstitial
    // (msPlayBtn «Play Game»/pauseRestart — genLevel без сброса счётчика).
    // Тогда накопленный за 5 побед ролик выстрелит на БЛИЖАЙШЕМ ПОБЕДНОМ
    // переходе (againBtn) — единственный, кто теперь зовёт гейт. Здесь
    // прямой вызов maybeInterstitial моделирует именно этот победный Next.
    const preDef = M.interShown;
    for (let i = 0; i < every; i++) A.noteWin();    // 5 побед, ни одного maybeInterstitial
    const deferredNoShow = M.interShown - preDef;   // 0 — пока не показан
    A.maybeInterstitial();                          // ближайший победный Next
    const deferredFired = M.interShown - preDef;    // 1 — отложенный ролик вышел
    return { seq, winsLeft: A._winsSinceInter, deferredNoShow, deferredFired };
  });
  expect(cad.seq[0] === 0, 'каденция: 4 победы — ролика нет (' + cad.seq[0] + ')');
  expect(cad.seq[1] === 1, 'каденция: на 5-й победе ровно один ролик (' + cad.seq[1] + ')');
  expect(cad.seq[2] === 1, 'каденция: переход без победы не дублирует ролик (' + cad.seq[2] + ')');
  expect(cad.seq[3] === 2, 'каденция: следующие 5 побед дают ещё один ролик (' + cad.seq[3] + ')');
  expect(cad.winsLeft === 0, 'каденция: окно сброшено после показа (' + cad.winsLeft + ')');
  expect(cad.deferredNoShow === 0 && cad.deferredFired === 1,
    'каденция: показ, отложенный не-рекламным выходом, выходит на ПОБЕДНОМ переходе (' +
    cad.deferredNoShow + '->' + cad.deferredFired + ')');

  // ⚠️ СЧЁТЧИК ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ (находка матрицы №3): пока он был
  // переменной замыкания, INTER_EVERY_LEVELS побед надо было набрать в ОДНОЙ
  // сессии страницы — три захода по 20 минут давали НОЛЬ показов всегда, и
  // «месяц без рекламы» из бандла гасил то, чего игрок и так не получал.
  await apage.evaluate(() => { window.__ads.noteWin(); window.__ads.noteWin(); window.__ads.noteWin(); });
  const cadBefore = await apage.evaluate(() => window.__ads._winsSinceInter);
  await apage.reload({ waitUntil: 'domcontentloaded' });
  await apage.waitForFunction(() => window.__ads && window.__game, null, { timeout: 20000 });
  const cadAfter = await apage.evaluate(() => window.__ads._winsSinceInter);
  expect(cadBefore === 3 && cadAfter === 3,
    '⚠️ КАДЕНЦИЯ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ: ' + cadBefore + ' побед до, ' + cadAfter + ' после');
  // и порог по-прежнему срабатывает — накопленное через перезагрузку не потеряно
  const cadFire = await apage.evaluate(() => {
    const A = window.__ads, M = window.__mock;
    const base = M.interShown;
    A.noteWin(); A.maybeInterstitial();   // 4-я
    const at4 = M.interShown - base;
    A.noteWin(); A.maybeInterstitial();   // 5-я — ролик
    return { at4, at5: M.interShown - base, left: A._winsSinceInter };
  });
  expect(cadFire.at4 === 0 && cadFire.at5 === 1 && cadFire.left === 0,
    'порог считает победы ЧЕРЕЗ перезагрузку (4→0 показов, 5→1, счётчик сброшен)');

  // ПРОВОДКА (спека 2026-07-24): РЕАЛЬНЫЙ Retry НЕ показывает межстраничную,
  // даже когда счётчик у порога — вызов убран из loseAgainBtn. ⚠️ С 2026-07-27
  // экран поражения из ТУПИКА больше не всплывает (помол-выручалка, «помол =
  // штраф, не смерть»), но UI поражения жив и проводка кнопки Retry остаётся
  // валидной — показываем оверлей НАПРЯМУЮ (не через тупик) и жмём реальную
  // кнопку. До правки её обработчик звал maybeInterstitial и при счётчике 5
  // показал бы ролик — ассерт бы упал.
  await apage.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await apage.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__ads.noteWin(); // счётчик у порога
    window.__game.level().over = true;
    document.getElementById('loseOverlay').style.display = 'flex'; // показать UI поражения напрямую
  });
  const retry = await apage.evaluate(() => {
    const before = window.__mock.interShown;
    document.getElementById('loseAgainBtn').click(); // РЕАЛЬНЫЙ Retry
    return { before, after: window.__mock.interShown, winsLeft: window.__ads._winsSinceInter };
  });
  expect(retry.after === retry.before,
    'проводка: РЕАЛЬНЫЙ Retry из тупика при счётчике у порога НЕ показывает межстраничную ('
    + retry.before + '->' + retry.after + ')');
  expect(retry.winsLeft === 5,
    'проводка: Retry счётчик побед не тронул (остался у порога ' + retry.winsLeft + ')');
  await apage.evaluate(() => window.__game.skipIntro()); // loseAgainBtn запустил genLevel/интро

  await apage.close();
  await new Promise(r => srv2.close(r));
  if (aErrors.length) failures.push('реклама-проба: ' + aErrors.join(' | '));

  // ОСКОЛКИ (полировка ГРАФИКИ 2026-07-23): shardFX переехал в 70-fx —
  // нерегулярная форма + фасеточный тинт + звук «хруст». Проверяем, что
  // залп создаёт fx и ПОЛНОСТЬЮ дренажит геометрии в базу (каждый осколок —
  // своя геометрия+материал, stepFX обязан диспозить). Заодно путь Sound
  // 'crunch' исполняется без ошибок (pageerror слушается сверху).
  // свежий уровень + штиль: на СПЯЩЕЙ куче geoms стабилен, и base==after
  // ловит именно осколочную утечку, а не фоновую досыпку цепи/миксера
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => !window.__game.awake().physAwake, null, { timeout: 4000 }).catch(() => {});
  const shard = await page.evaluate(async () => {
    const g = window.__game;
    const geoms = () => g.perfStats().geoms;
    // ⚠️ ФЛЕЙК «96 → 95» (репорт диспетчера 2026-07-28): база бралась МГНОВЕННО,
    // и если в этот момент ещё дренажились геометрии ПРЕДЫДУЩЕЙ секции, за два
    // кадра их уходило больше, чем осколки успевали добавить, — «после»
    // оказывалось МЕНЬШЕ «до». Разброс базы в репорте (96 / 74 / 71) — это она
    // и есть. Лечение, как у флейков вуали и радиуса: не мгновенное чтение, а
    // (1) СТАБИЛИЗАЦИЯ базы — ждём, пока счётчик перестанет меняться...
    let prev = -1, still = 0;
    const settle = Date.now() + 4000;
    while (still < 3 && Date.now() < settle){
      await new Promise(r => setTimeout(r, 80));
      const v = geoms();
      if (v === prev) still++; else { still = 0; prev = v; }
    }
    const base = geoms();
    // ⚠️ N — ЯВНЫЙ размер залпа: shardBurst возвращает fx.length (ВСЕ живые
    // эффекты, не только осколки), и опираться на него как на «сколько кусков
    // прилетело» нельзя — порог раннего выхода мог бы стать недостижимым.
    const N = 12;
    const created = g.shardBurst(N);
    // ...и (2) ПИК ЗА ОКНО, а не одна выборка: осколки регистрируются в
    // renderer.info на РЕНДЕРЕ, и один кадр мог прийтись на провал между
    // дренажом чужих и появлением своих. Ранний выход, как только рост доказан.
    let peak = base;
    const peakDl = Date.now() + 2000;
    while (Date.now() < peakDl){
      await new Promise(r => requestAnimationFrame(r));
      const v = geoms();
      if (v > peak) peak = v;
      if (peak >= base + N / 2) break;
    }
    // ⚠️ НЕ фиксированная пауза (флейк 2026-07-24, ловился и метой, и мной:
    // «48 → 48», «52 → 54»). Осколки догорают по СВОИМ часам, а сьют к этой
    // секции приходит с разной загрузкой машины — 900мс хватало не всегда, и
    // тест обвинял продукт в утечке, которой нет: проба показала честный
    // дренаж 33 → 21 к ~2с. Ждём УСЛОВИЯ с потолком, как чинили флейк радиуса.
    const deadline = Date.now() + 6000;
    while (g.perfStats().geoms > base && Date.now() < deadline)
      await new Promise(r => setTimeout(r, 100));
    // ⚠️ settled=false — база взята ПО ПОТОЛКУ, посреди дренажа. Сейчас
    // недостижимо (нужен >4 с монотонного падения), но без этого флага такой
    // провал выглядел бы КАК ИСХОДНЫЙ ФЛЕЙК, и следующий диагностировал бы
    // всё заново. Флаг только в сообщении — на вердикт не влияет.
    return { base, created, peak, N, settled: still >= 3, after: g.perfStats().geoms };
  });
  expect(shard.created >= 12, 'осколки: залп создал fx (' + shard.created + ')');
  // ⚠️ ПОРОГ N/2, А НЕ «БОЛЬШЕ БАЗЫ НА 1» (усиление 2026-07-28 вместе с фиксом
  // флейка). Смысл секции — стеречь инвариант 70-fx «КАЖДЫЙ осколок несёт СВОЮ
  // геометрию, общий кэш отдавать нельзя». При `peak > base` регрессия «все
  // осколки на одной кэшированной геометрии» даёт +1 и проходит ЗЕЛЁНОЙ. После
  // стабилизации базы прирост стал детерминированным ровно +N (замер: 71 -> 83
  // в полном сьюте, 21 -> 33 в изоляции), так что требовать хотя бы половину
  // залпа безопасно — запас на случайный дренаж соседей остаётся.
  expect(shard.peak >= shard.base + shard.N / 2,
    'осколки: КАЖДЫЙ несёт свою геометрию (' + shard.base + ' -> ' + shard.peak
    + ', +' + (shard.peak - shard.base) + ' при залпе ' + shard.N
    + (shard.settled ? '' : '; ⚠️ база НЕ устоялась — взята по потолку 4с') + ')');
  // ⚠️ ПОРОГ, А НЕ ТОЧНОЕ РАВЕНСТВО (разбор флейка 2026-07-24). geoms —
  // счётчик ВСЕЙ сцены, а между base и after тикают соседние системы
  // (витрина печёт портреты, догорают чужие эффекты) — ловилось стабильное
  // +2 при 12 осколках, и ассерт обвинял осколки в чужом шуме. Настоящая
  // утечка shardFX дала бы +12 и больше (по числу кусков), поэтому мерим
  // «вернулось ли БОЛЬШИНСТВО»: остаток меньше половины залпа = дренаж есть.
  // Изолированная проба подтвердила чистый дренаж 33 → 21 (диспетчер).
  const shardLeak = shard.after - shard.base;
  expect(shardLeak < shard.created / 2,
    'осколки: геометрии дренажат в базу без утечки (пик ' + shard.peak + ' → остаток +' + shardLeak + ' при ' + shard.created + ' осколках)');

  // ВРАЩЕНИЕ ПОРТРЕТА (спека владельца 2026-07-24): портрет-меш по ключу
  // типа (вариант B) + живой спин при hover. Секция самодостаточная —
  // создаёт свой host, гасит спин в конце.
  const spin = await page.evaluate(async () => {
    const g = window.__game;
    // портрет для типа, которого может не быть в текущей партии (хвост списка)
    const rows = g.accSnapshot();
    const tailKey = rows[rows.length - 1].key;
    const it = g.thumbItemForKey(tailKey);
    const built = !!(it && it.mesh);
    // хост + старт спина
    const host = document.createElement('div');
    host.id = '__spinHost';
    host.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:120px;';
    document.body.appendChild(host);
    g.thumbSpinKey(rows[0].key, '#__spinHost');
    const s0 = g.spinState();
    const a0 = s0.angle, camW0 = s0.camW;
    await new Promise(r => setTimeout(r, 500));           // крутится
    const s1 = g.spinState();
    // вариант B: построить портреты всех открытых типов
    const all = g.buildAllThumbs();
    g.thumbSpinStop();
    const sStop = g.spinState();
    host.remove();
    return { built, tailKey, mounted: s0.mounted, rafOn: s0.rafOn,
      angleGrew: s1.angle > a0, camConst: s1.camW === camW0,
      allBuilt: all.built === all.total && all.total > 0, allTotal: all.total,
      stopped: !sStop.rafOn && !sStop.mounted && !sStop.active };
  });
  expect(spin.built, 'портрет-меш строится по ключу типа вне партии (' + spin.tailKey + ')');
  expect(spin.mounted && spin.rafOn, 'спин: канвас смонтирован и rAF идёт');
  expect(spin.angleGrew, 'спин: угол растёт (модель крутится)');
  expect(spin.camConst, 'спин: Y-рамка константна за оборот (не «дышит»)');
  expect(spin.allBuilt, 'вариант B: портреты построены для всех открытых типов (' + spin.allTotal + ')');
  expect(spin.stopped, 'стоп: rAF погашен, канвас снят, ноль стоимости вне hover');

  // ГХОСТ ЗАКРЫТЫХ + ЕДИНАЯ ПОЗА (спека владельца 2026-07-24-в). Гхост —
  // полупрозрачный+обесцвеченный силуэт закрытого типа. Поза статики И спина
  // из ОДНОГО источника (PORTRAIT_*) — иначе скачок при наведении.
  const ghostPose = await page.evaluate(() => {
    const g = window.__game, key = g.accSnapshot()[0].key;
    // гхост строится и ОТЛИЧАЕТСЯ от цветного; item.ghost + материал transparent
    const full = g.thumbURL(key, false), gh = g.thumbURL(key, true);
    const gItem = g.thumbItemForKey(key, true);
    const ghost = { built: !!gh, differ: full !== gh,
      flag: !!(gItem && gItem.ghost), transp: !!(gItem && gItem.mesh.material.transparent) };
    // ⚠️ ЕДИНЫЙ ИСТОЧНИК ПОЗЫ — МУТАЦИЯ ЗДЕСЬ НЕСУЩАЯ, НЕ ОСТАТОК ТЮНИНГА.
    // Меняем позу — спин обязан стартовать С НЕЁ (== PORTRAIT_YAW0). Заменить
    // на getter НЕЛЬЗЯ: статика и спин читают ОДНУ переменную, сверка
    // «getter против getter» пуста и зелена всегда. Проверено симуляцией
    // 2026-07-27: дали спину свою копию yaw → упало (−0.6 вместо 0.2).
    g.setPortraitPose(0.1, 0.2);
    const host = document.createElement('div'); host.id = '__ph';
    host.style.cssText = 'position:fixed;left:0;top:0;width:80px;height:80px'; document.body.appendChild(host);
    g.thumbSpinKey(g.accSnapshot()[0].key, '#__ph');
    const startAngle = g.spinState().angle;
    g.thumbSpinStop(); host.remove();
    g.setPortraitPose(-0.15, -0.6);   // вернуть боевую позу
    return { ghost, startAngle };
  });
  expect(ghostPose.ghost.built && ghostPose.ghost.differ, 'гхост: закрытый портрет строится и отличается от цветного');
  expect(ghostPose.ghost.flag && ghostPose.ghost.transp, 'гхост: item.ghost + материал transparent');
  expect(Math.abs(ghostPose.startAngle - 0.2) < 0.05, 'поза статики и спина — ОДИН источник (спин стартует с PORTRAIT_YAW0, angle=' + ghostPose.startAngle + ')');

  // ── ПОДСКАЗКА ЗА РЕКЛАМУ (спека владельца 2026-07-28) ────────────────────
  // Секция В КОНЦЕ намеренно (setLevel/regen меняют контекст — см. камни).
  // Зеркало ad-встряски: заряды кончились → ролик → +1 заряд, кап на уровень.
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  // 1. ГЕЙТ: пока заряды есть — ad-состояния НЕТ (ролик не предлагаем зря)
  const hintGate = await page.evaluate(() => {
    const g = window.__game;
    const withCharges = { hints: g.wallet().hints, ad: g.adHintAvailable() };
    let guard = 200;
    while (g.wallet().hints > 0 && guard-- > 0) g.spendHint();
    return { withCharges, empty: { hints: g.wallet().hints, ad: g.adHintAvailable(), cap: g.level().adHints } };
  });
  {
    expect(hintGate.withCharges.hints > 0 && hintGate.withCharges.ad === false,
      'ad-подсказка НЕ предлагается, пока заряды есть (' + JSON.stringify(hintGate.withCharges) + ')');
    expect(hintGate.empty.hints === 0 && hintGate.empty.ad === true && hintGate.empty.cap === 2,
      'заряды кончились → ad-состояние доступно, кап 2 (' + JSON.stringify(hintGate.empty) + ')');
    // 2. РОЛИК ДАЁТ ЗАРЯД: stub 3 с, награда после досмотра
    const before = await page.evaluate(() => ({ hints: window.__game.wallet().hints,
      he: window.__game.saveRaw().he, cap: window.__game.level().adHints,
      used: window.__game.stats().adHintsUsed, started: window.__game.requestAdHint() }));
    await page.waitForTimeout(3600);
    const after = await page.evaluate(() => ({ hints: window.__game.wallet().hints,
      he: window.__game.saveRaw().he, cap: window.__game.level().adHints,
      used: window.__game.stats().adHintsUsed }));
    expect(before.started === true && after.cap === before.cap - 1 && after.used === 1,
      'ролик списал кап и посчитан в stats (' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) + ')');
    // ⚠️ Заряд проверяем по МОНОТОННОМУ he, а не по остатку hints: свежий заряд
    // сразу уходит на показ подсказки (hints 0->0 ничего не доказал бы).
    expect(after.he === before.he + 1,
      'ролик начислил РОВНО один заряд в he (' + before.he + ' -> ' + after.he + ')');
    // 2б. RESTART НЕ ВОЗВРАЩАЕТ КАП (дыра: заряд подсказки ПОЖИЗНЕННЫЙ, поэтому
    // refill капа на каждый genLevel давал бы бесконечные подсказки за рекламу —
    // «Restart» в паузе делает ровно genLevel). Кап привязан к НОМЕРУ уровня.
    const restartProbe = await page.evaluate(() => {
      const g = window.__game; const capBefore = g.level().adHints; const lv = g.levelNum();
      g.regen(); g.skipIntro();                    // = pauseRestart той же партии
      const capAfterRestart = g.level().adHints;
      g.setLevel(lv + 1); g.regen(); g.skipIntro(); // новый уровень — кап обязан вернуться
      return { capBefore, capAfterRestart, capNewLevel: g.level().adHints };
    });
    expect(restartProbe.capAfterRestart === restartProbe.capBefore,
      'Restart той же партии НЕ вернул кап роликов (' + restartProbe.capBefore + ' -> ' + restartProbe.capAfterRestart + ')');
    expect(restartProbe.capNewLevel === 2,
      'на НОВОМ уровне кап роликов восстановлен (' + restartProbe.capNewLevel + ')');
    await page.evaluate(() => { const g = window.__game; let n = 200; while (g.wallet().hints > 0 && n-- > 0) g.spendHint(); });
    // 3. КАП ИСЧЕРПАН → ad-состояние гаснет (бесконечных роликов нет)
    const capOut = await page.evaluate(() => {
      const g = window.__game; g.level().adHints = 0;
      return { ad: g.adHintAvailable(), started: g.requestAdHint() };
    });
    expect(capOut.ad === false && capOut.started === false,
      'кап исчерпан → ролик больше не предлагается и не стартует (' + JSON.stringify(capOut) + ')');
    // 4. АНТИ-ДЮП: кап НЕ в сейве (иначе max-мерж вернул бы просмотренный ролик)
    const dup = await page.evaluate(() => {
      const g = window.__game; const raw = g.saveRaw();
      const keys = Object.keys(raw).join(',');
      const stale = JSON.parse(JSON.stringify(raw)); // «облако» ДО траты
      g.level().adHints = 0;                          // ролик просмотрен, кап съеден
      g.mergeRaw(stale);                              // облако отдаёт устаревшую копию
      return { keys, capAfterMerge: g.level().adHints };
    });
    expect(/adHint|adhint/i.test(dup.keys) === false,
      'кап роликов НЕ хранится в сейве — мержу нечего возвращать (поля: ' + dup.keys + ')');
    expect(dup.capAfterMerge === 0,
      'мерж со старой облачной копией НЕ вернул просмотренный ролик (' + dup.capAfterMerge + ')');
  }
  // ── БАНДЛЫ «More Stars» (макеты владельца 2026-07-28) ────────────────────
  // Секция В КОНЦЕ намеренно (setLevel/regen меняют контекст — см. камни).
  const sbProbe = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear();
    const tiers = g.bundles();
    const idle = { mult: g.scoreBoostMult(), noAd: g.noAdActive(), shakes: g.purchasedShakes() };
    const hints0 = g.wallet().hints;
    const buy = g.buyBundle('bundle2');            // $19.99: x2/сутки + 50 встрясок + 30 подсказок + месяц без рекламы
    const st = g.bundleState();
    return { tiers, idle, hints0, buy, st, hints1: g.wallet().hints };
  });
  expect(sbProbe.tiers.length === 3 && sbProbe.tiers[0].usd === 4.99 && sbProbe.tiers[2].shakes === 50,
    'тиры бандлов по макету ($4.99 x5, ... $19.99 = 50 встрясок) (' + JSON.stringify(sbProbe.tiers.map(t=>t.usd)) + ')');
  expect(sbProbe.idle.mult === 1 && sbProbe.idle.noAd === false,
    'без бандла: множитель 1, реклама не отключена (' + JSON.stringify(sbProbe.idle) + ')');
  expect(sbProbe.buy.ok && sbProbe.st.mult === 2 && sbProbe.st.shakes === 50 &&
         sbProbe.hints1 === sbProbe.hints0 + 30 && sbProbe.st.noAdLeftMs > 29 * 24 * 3600 * 1000,
    'бандл выдал ВСЁ разом: x2 + 50 встрясок + 30 подсказок + месяц без рекламы (' + JSON.stringify(sbProbe.st) + ')');

  // ⚠️ ОЧЕРЕДЬ ТИРОВ: множители НЕ стекуются — играет сильнейший, время копится
  // СВОЕМУ тиру. Отклонять покупку нельзя: в бандле едут расходники.
  const sbQueue = await page.evaluate(() => {
    const g = window.__game;
    const before = g.bundleState();
    const buy = g.buyBundle('bundle5');            // x5/30мин поверх активного x2/сутки
    const after = g.bundleState();
    const t2 = after.tiers.find(t => t.mult === 2), t5 = after.tiers.find(t => t.mult === 5);
    return { before, buy, mult: after.mult, left2: t2.leftMs, left5: t5.leftMs,
             shakes: after.shakes, wasLeft2: before.tiers.find(t => t.mult === 2).leftMs };
  });
  expect(sbQueue.buy.ok && sbQueue.mult === 5,
    'сильнейший тир играет: x5 поверх x2 (' + sbQueue.mult + ')');
  expect(sbQueue.left5 > 29 * 60 * 1000 && sbQueue.left5 <= 30 * 60 * 1000,
    'x5 получил СВОИ 30 минут (' + Math.round(sbQueue.left5/60000) + ' мин)');
  expect(Math.abs(sbQueue.left2 - sbQueue.wasLeft2) < 5000,
    '⚠️ ОЧЕРЕДЬ: время x2 НЕ сгорело под x5 — вернётся после (' + Math.round(sbQueue.left2/3600000) + ' ч)');
  expect(sbQueue.shakes === 60, 'расходники бандлов просто суммируются (50+10=' + sbQueue.shakes + ')');

  // ⚠️ ЭКСПЛОЙТ «ОТКАТ ПОД ЛЮФТ» (найден адверс-прогоном матрицы №3, был в
  // проде v131-v135): откат РОВНО в пределах прежнего люфта не детектился, а
  // окна хранятся абсолютной меткой → остаток РОС. Откат по 5 мин каждые
  // 5 мин = вечный x5 за $4.99. Теперь амнистия — ПОЖИЗНЕННЫЙ БЮДЖЕТ.
  const sbExploit = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0); // чистый сейв
    g.buyBundle('bundle5');                                   // x5 на 30 минут
    const left = [g.scoreBoostLeftMs()];
    for (let i = 0; i < 6; i++){
      g.boostSetClock(Date.now() + 5 * 60 * 1000);            // «часы отмотаны на 5 минут назад»
      left.push(g.scoreBoostLeftMs());
    }
    return { minutes: left.map(ms => +(ms / 60000).toFixed(1)), mult: g.scoreBoostMult() };
  });
  expect(sbExploit.minutes[1] === 25 && sbExploit.minutes[2] === 20,
    '⚠️ ЭКСПЛОЙТ ЗАКРЫТ: откат под прежний люфт больше НЕ добавляет времени (' + sbExploit.minutes + ')');
  expect(sbExploit.minutes[6] === 0,
    'окно сгорает ровно за своё время при ЛЮБОЙ каденции отката (' + sbExploit.minutes + ')');

  // ЧАСЫ: разовый большой скачок НЕ сжигает оплаченное (кап списания), брика нет
  const sbClock = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.buyBundle('bundle2');                                   // x2 на сутки + месяц no-Ad
    const before = { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
    g.boostSetClock(Date.now() + 60 * 60 * 1000);             // скачок часов на час
    const after = { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
    const lsGap = g.boostRaw().ls - Date.now();
    return { before, after, lsGap, lostMin: +((before.noAd - after.noAd) / 60000).toFixed(1) };
  });
  expect(sbClock.after.mult === 2 && sbClock.after.noAd > 0,
    '⚠️ ЧАСЫ: разовый скачок НЕ сжёг оплаченные окна (mult ' + sbClock.after.mult + ')');
  expect(sbClock.lostMin > 55 && sbClock.lostMin < 65,
    'часы: скачок стоит РОВНО себя, ни секунды сверх (' + sbClock.lostMin + ' мин)');
  expect(Math.abs(sbClock.lsGap) < 10000,
    '⚠️ ЧАСЫ: метка ресинхронизирована — вечного залипания нет (' + sbClock.lsGap + ' мс)');
  const sbAfterIncident = await page.evaluate(() => {
    const g = window.__game;
    g.boostSetClock(Date.now() + 2 * 60 * 60 * 1000);
    g.scoreBoostMult();
    g.buyBundle('bundle2');
    return { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
  });
  expect(sbAfterIncident.noAd > 20 * 24 * 3600 * 1000,
    '⚠️ НЕТ БРИКА: бандл, купленный ПОСЛЕ скачка часов, работает (' + Math.round(sbAfterIncident.noAd/86400000) + ' д)');

  // МЕРЖ: окна мержатся max ПО КЛЮЧУ-МНОЖИТЕЛЮ — чужой короткий x5 не апгрейдит
  const sbMerge = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.buyBundle('bundle2');        // свой: x2 на сутки
    const mine = g.bundleState().tiers.find(t => t.mult === 2).leftMs;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, bx: { 5: Date.now() + 10 * 60 * 1000 } });
    const withCloud5 = g.bundleState();
    const still2 = withCloud5.tiers.find(t => t.mult === 2).leftMs;
    return { mine, mult: withCloud5.mult, left5: withCloud5.tiers.find(t => t.mult === 5).leftMs, still2 };
  });
  expect(sbMerge.mult === 5 && sbMerge.left5 > 0 && Math.abs(sbMerge.still2 - sbMerge.mine) < 5000,
    '⚠️ МЕРЖ: чужой x5 лёг в СВОЙ ключ, не тронув x2 (' + JSON.stringify(sbMerge) + ')');

  // КУПЛЕННЫЕ ВСТРЯСКИ: порядок расхода и анти-дюп
  const sbShakes = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    const lv = g.level(); const free0 = lv.shakes, bought0 = g.purchasedShakes();
    g.requestShake();                              // РЕАЛЬНЫЙ путь: должен съесть БЕСПЛАТНУЮ
    const afterFree = { free: g.level().shakes, bought: g.purchasedShakes() };
    g.level().shakes = 0;                          // бесплатные кончились
    g.requestShake();                              // теперь — купленную
    const afterBought = { free: g.level().shakes, bought: g.purchasedShakes() };
    const stale = g.saveRaw();                     // «облако» ДО траты
    g.mergeRaw(stale);
    return { free0, bought0, afterFree, afterBought, afterMerge: g.purchasedShakes() };
  });
  expect(sbShakes.afterFree.free === sbShakes.free0 - 1 && sbShakes.afterFree.bought === sbShakes.bought0,
    'порядок расхода: сперва БЕСПЛАТНЫЕ (' + JSON.stringify(sbShakes.afterFree) + ')');
  expect(sbShakes.afterBought.bought === sbShakes.bought0 - 1,
    'бесплатные кончились → тратится КУПЛЕННЫЙ запас (' + JSON.stringify(sbShakes.afterBought) + ')');
  expect(sbShakes.afterMerge === sbShakes.afterBought.bought,
    '⚠️ ДЮП: мерж со старой облачной копией НЕ вернул потраченную встряску (' + sbShakes.afterMerge + ')');

  // ⚠️ ТУПИК-ВЫРУЧАЛКА: пока есть купленный запас, помол за игрока НЕ включается
  const sbDeadlock = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    const lv = g.level(); lv.shakes = 0; lv.adShakes = 0;
    g.cfg.baseRadius = -9;                         // форсим «нет достижимых пар» (cfg — объект, не функция)
    await new Promise(r => setTimeout(r, 2200));
    const withStock = g.level().deadlock;          // запас есть → тупика быть не должно
    const raw = g.boostRaw(); const before = g.purchasedShakes();
    await page_drain();                            // сливаем запас
    await new Promise(r => setTimeout(r, 2200));
    const noStock = g.level().deadlock;
    return { withStock: !!withStock, noStock: !!noStock, before, after: g.purchasedShakes() };
    function page_drain(){ let n = 500; while (g.purchasedShakes() > 0 && n-- > 0) g.requestShake(); return Promise.resolve(); }
  });
  expect(sbDeadlock.withStock === false,
    '⚠️ ТУПИК: с купленным запасом помол-выручалка НЕ включается — у игрока есть чем ходить');
  expect(sbDeadlock.noStock === true,
    'запас кончился → тупик признан, помол выручает (' + JSON.stringify(sbDeadlock) + ')');
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.35; });

  // НАЧИСЛЕНИЕ, ТОЧНО: бонус клада — единственный ДЕТЕРМИНИРОВАННЫЙ путь очков
  // (150 + 5×уровень, без комбо и без накопления). Финал сам собирает рыбку,
  // очки за зачистку не начисляются — значит весь счёт партии это ровно бонус.
  // ⚠️ Через матчи точную проверку сделать нельзя: autoMatch берёт ПАРУ, но
  // комбо ×2 зажигается от темпа, а accMult зависит от типа — первая версия
  // этого теста гуляла 1.24…3.33 и была флейком, а не проверкой.
  const sbExact = await page.evaluate(async () => {
    const g = window.__game;
    g.boostSetClock(0); g.boostClear();
    g.regen(); g.skipIntro(); g.leaveSingles();
    return { lv: g.levelNum() };
  });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  const sbPlainFinale = await page.evaluate(() => window.__game.stats().score);
  expect(sbPlainFinale === 150 + 5 * sbExact.lv,
    'контроль: без бандла клад даёт ровно 150+5×ур (' + sbPlainFinale + ' при ур.' + sbExact.lv + ')');
  const sbBoosted = await page.evaluate(async () => {
    const g = window.__game;
    g.buyBundle('bundle2');                        // x2
    g.regen(); g.skipIntro(); g.leaveSingles();
    return { lv: g.levelNum(), mult: g.scoreBoostMult() };
  });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  const sbBoostedFinale = await page.evaluate(() => window.__game.stats().score);
  expect(sbBoosted.mult === 2 && sbBoostedFinale === 2 * (150 + 5 * sbBoosted.lv),
    '⚠️ БАНДЛ x2 УМНОЖАЕТ ТОЧНО: клад ' + sbBoostedFinale + ' = 2×(150+5×' + sbBoosted.lv + ')');
  await page.evaluate(() => { window.__game.boostClear(); });

  // ── ШТРАФЫ ПОД БУСТЕРОМ (решение владельца 2026-07-28) ───────────────────
  // Симметрия: бустер множит и награду, и наказание. Плоские −10/−20 на фоне
  // «+700» делали карательную сторону шумом ровно в оплаченном окне.
  const penSym = await page.evaluate(async () => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.setLevel(8); g.regen(); g.skipIntro();          // ур.>5: клампа нет, минус честный
    await new Promise(r => setTimeout(r, 400));
    const s0 = g.stats().score;
    g.penalizeTest();                                  // промах без бустера
    const plain = s0 - g.stats().score;
    g.buyBundle('bundle2');                            // x2
    const s1 = g.stats().score;
    g.penalizeTest();
    const boosted = s1 - g.stats().score;
    return { plain, boosted, mult: g.scoreBoostMult() };
  });
  expect(penSym.plain === 10 && penSym.boosted === 20 && penSym.mult === 2,
    '⚠️ СИММЕТРИЯ: под x2 промах стоит ×2 (−' + penSym.plain + ' -> −' + penSym.boosted + ')');

  // КЛАМП ЖИВ ПОСЛЕ УМНОЖЕНИЯ: новичок под x5 не улетает в минус быстрее
  const penClamp = await page.evaluate(async () => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.setLevel(3); g.regen(); g.skipIntro();          // ур.<=5 — кламп нулём
    await new Promise(r => setTimeout(r, 400));
    g.buyBundle('bundle5');                            // x5
    for (let i = 0; i < 5; i++) g.penalizeTest();
    const clamped = g.stats().score;
    g.setLevel(1); g.regen(); g.skipIntro();          // ур.1 — штрафов нет вовсе
    await new Promise(r => setTimeout(r, 400));
    g.penalizeTest();
    return { clamped, lv1: g.stats().score, mult: g.scoreBoostMult() };
  });
  expect(penClamp.mult === 5 && penClamp.clamped === 0,
    'кламп нулём применён ПОСЛЕ умножения — новичок под x5 не в минусе (' + penClamp.clamped + ')');
  expect(penClamp.lv1 === 0,
    'ур.1 без штрафов вовсе — бустер этого не меняет (' + penClamp.lv1 + ')');

  // ⚠️ ЗАМЕР ДЛЯ ВЛАДЕЛЬЦА: цена помол-выручалки под бустером. Под x5 налог
  // −100 за оборот вместо −20 — насколько глубоко уходит застрявший игрок.
  // ⚠️ Запас встрясок из бандла приходится СЛИВАТЬ: собственный гвард не
  // признаёт тупик, пока у игрока есть чем ходить (это и проверяется выше).
  const stuckRun = async (withBoost) => {
    await page.evaluate(async (boost) => {
      const g = window.__game;
      g.boostClear(); g.boostSetClock(0);
      g.setLevel(8); g.regen(); g.skipIntro();        // ур.>5 — минус честный, без клампа
      if (boost) g.buyBundle('bundle5');              // x5 — худший случай
      // ⚠️ Слив запаса ОБЯЗАТЕЛЕН В ОБОИХ прогонах: купленные встряски копятся
      // в сейве от прежних секций, а собственный гвард не признаёт тупик, пока
      // игроку есть чем ходить (см. ассерт «ТУПИК: с купленным запасом…»).
      const lv0 = g.level(); lv0.shakes = 0; lv0.adShakes = 0;
      let n = 500; while (g.purchasedShakes() > 0 && n-- > 0) g.requestShake();
    }, withBoost);
    // ⚠️ ЖДЁМ ШТИЛЬ, УДЕРЖИВАЯ МИКСЕР (репорт ИНТЕРФЕЙСА и ГРАФИКИ 2026-07-29:
    // TimeoutError ровно здесь на чистой базе). Механизм гонки, подтверждённый
    // кодом: слив запаса циклом requestShake разогревает кучу (замер коллег:
    // maxV 42.9, остывает ~15 с), а на 10-й секунде простоя (MIXER_IDLE_EASY)
    // просыпается миксер-наказание и КАЖДЫЙ помол будит физику — условие
    // «8 тихих опросов подряд» становится недостижимым В ПРИНЦИПЕ, и ждать
    // можно вечно. Срабатывает не всегда: беда включается, когда предыдущие
    // секции оставили большой купленный запас (у них было 219 встрясок) —
    // поэтому у меня 4 прогона подряд, в том числе два параллельных под
    // нагрузкой, были зелёными, а у них падало.
    // ⚠️ ЛЕЧИМ ПРИЧИНУ, А НЕ ТАЙМАУТ: на каждом опросе двигаем метку последнего
    // действия, то есть миксер просто не успевает проснуться, пока куча стынет.
    // Поднимать таймаут было бы лечением симптома — при чуть большем запасе
    // встрясок он бы снова не хватил.
    // ⚠️ Тупик ниже форсится ЯВНО (radius −9), так что подавленный здесь миксер
    // проверке не нужен — она от него не зависит.
    await page.waitForFunction(() => {
      const g = window.__game;
      g.stats().lastAction = performance.now();       // миксеру не дать проснуться
      if (g.awake().physAwake){ window.__calm = 0; return false; }
      window.__calm = (window.__calm || 0) + 1;
      return window.__calm >= 8;
    }, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => {
      const g = window.__game;
      g.cfg.baseRadius = -9; g.cfg.matchRadius = -9;  // гарантированный тупик (рецепт сьюта)
      const lv = g.level(); lv.shakes = 0; lv.adShakes = 0;
    });
    await page.waitForFunction(() => window.__game.level().deadlock === true, null, { timeout: 10000, polling: 100 });
    await page.evaluate(() => { window.__s0 = window.__game.stats().score; }); // отсчёт С МОМЕНТА тупика
    await page.waitForTimeout(10000);                 // 10 с выручалки
    return page.evaluate(() => {
      const g = window.__game;
      const r = { drop: window.__s0 - g.stats().score, deadlock: !!g.level().deadlock, mult: g.scoreBoostMult() };
      g.cfg.baseRadius = 0.35; g.boostClear();
      return r;
    });
  };
  const stuckPlain = await stuckRun(false);
  const stuckBoost = await stuckRun(true);
  console.log('ЗАМЕР выручалки за 10 с: без бустера −' + stuckPlain.drop +
              ', под x' + stuckBoost.mult + ' −' + stuckBoost.drop);
  expect(stuckPlain.deadlock && stuckBoost.deadlock,
    'выручалка запустилась в обоих прогонах');
  expect(stuckBoost.drop > stuckPlain.drop * 2,
    '⚠️ ЦЕНА ВЫРУЧАЛКИ под бустером кратно выше — число для владельца (−' + stuckPlain.drop + ' -> −' + stuckBoost.drop + ')');

  await page.evaluate(() => { window.__game.boostClear(); });
  // ── ПОКАЗАННОЕ = ТРАТИМОЕ (спека владельца 2026-07-28) ───────────────────
  // Кошелёк показывает liveBalance (забанкованное + счёт текущего уровня ÷10),
  // а траты проверяли starBalance (только забанкованное) → «вижу 2003, но
  // Boost за 2000 не покупается». Лечение — банк по требованию.
  const liveSpend = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    g.saveRaw();                                     // прогрев
    // ставим ровно ту вилку из репорта: показано >= цены, забанковано < цены
    const price = 2000;
    g.starGrant(0);
    const need = price - g.starBalance();
    if (need > 0) g.addScore(need * 10 + 30);        // +живой счёт с запасом 3 ед.
    const shown0 = g.liveBalance(), banked0 = g.starBalance();
    const gap = shown0 >= price && banked0 < price;  // та самая вилка
    const before = { shown: shown0, banked: banked0 };
    const ok = g.spendStars(price);
    const after = { shown: g.liveBalance(), banked: g.starBalance() };
    return { gap, before, after, ok, price };
  });
  expect(liveSpend.gap === true,
    'воспроизведена вилка репорта: показано ' + liveSpend.before.shown + ' >= 2000 > забанковано ' + liveSpend.before.banked);
  expect(liveSpend.ok === true,
    '⚠️ (а) покупка на ВИДИМЫЕ деньги проходит (было «вижу, но не куплю»)');
  expect(liveSpend.after.shown === liveSpend.before.shown - liveSpend.price,
    '⚠️ (в) баланс после покупки = показанному минус цена (' + liveSpend.before.shown + ' − ' + liveSpend.price + ' = ' + liveSpend.after.shown + ')');

  // (б) сумма банка за уровень = floor(score/10) РОВНО, сколько бы досрочных
  // банков ни случилось: ни дюпа, ни потери.
  const bankSum = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    const w0 = g.starBalance();
    g.addScore(5000);                                // 500 единиц живого счёта
    g.spendStars(100); g.spendStars(150); g.spendStars(70); // три досрочных банка
    const spent = 320;
    const scoreNow = g.stats().score;
    g.bankScore(scoreNow);                           // «победа»
    const w1 = g.starBalance();
    return { w0, w1, spent, expected: Math.floor(scoreNow / 10) };
  });
  expect(bankSum.w1 === bankSum.w0 + bankSum.expected - bankSum.spent,
    '⚠️ (б) банк за уровень РОВНО floor(score/10) при трёх досрочных банках (' +
    bankSum.w0 + ' + ' + bankSum.expected + ' − ' + bankSum.spent + ' = ' + bankSum.w1 + ')');

  // ⚠️ МОЙ СЛУЧАЙ, которого не было в постановке: счёт УПАЛ после досрочного
  // банка (штрафы/помол). se монотонный — уменьшать нельзя, коррекция в ss.
  const bankDrop = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(8); g.regen(); g.skipIntro();          // ур.>5 — минус честный
    await new Promise(r => setTimeout(r, 400));
    const w0 = g.starBalance(), rank0 = g.leaderboardScore();
    g.addScore(3000);                                 // 300 единиц
    g.spendStars(250);                                // досрочный банк на 300
    g.addScore(-1500);                                // счёт упал до 150 единиц
    const scoreNow = g.stats().score;
    g.bankScore(scoreNow);                            // победа: банк ОСТАТКА (он отрицательный)
    return { w0, w1: g.starBalance(), rank0, rank1: g.leaderboardScore(),
             expected: Math.floor(scoreNow / 10), spent: 250 };
  });
  expect(bankDrop.w1 === bankDrop.w0 + bankDrop.expected - bankDrop.spent,
    '⚠️ СЧЁТ УПАЛ ПОСЛЕ БАНКА: кошелёк всё равно ровно floor(score/10) − траты (' +
    bankDrop.w0 + ' + ' + bankDrop.expected + ' − ' + bankDrop.spent + ' = ' + bankDrop.w1 + ')');
  // ⚠️ Ранг двигается ТАК ЖЕ, как кошелёк: заработок поднимает, трата опускает
  // (утверждённый размен владельца). Проверяем ГЛАВНОЕ — что досрочный банк не
  // РАЗДУЛ ранг по пику счёта: без коррекции в ss вышло бы rank0+300−250.
  const rankHonest = bankDrop.rank0 + bankDrop.expected - bankDrop.spent;
  const rankInflated = bankDrop.rank0 + 300 - bankDrop.spent; // если бы банк по пику остался
  expect(bankDrop.rank1 === rankHonest && bankDrop.rank1 !== rankInflated,
    '⚠️ ЛИДЕРБОРД не раздут пиком: ' + bankDrop.rank1 + ' (честно ' + rankHonest +
    ', по пику было бы ' + rankInflated + ')');

  // ⚠️ ЭТА СЕКЦИЯ СТОИТ В САМОМ КОНЦЕ НАМЕРЕННО — по той же причине, что и
  // секция камней: она делает setLevel/regen, а это меняет контекст следующим
  // проверкам. Когда я поставил её в середину, она сломала «5 матчей сняли
  // >=10 предметов» (уровень стал больше, живых 172 вместо 130) и секцию
  // бомбы. Проект эту граблю уже документировал — я на неё наступил повторно.

  // ⚠️ ТАП ПО ДОСТУПНОМУ БЕЗ ПАРЫ НЕ ШТРАФУЕТСЯ (спека владельца 2026-07-29).
  // Стережём ЯВНО: снятие штрафа — это одна строка, и вернуть её случайной
  // правкой в handleTap проще простого, а игрок заметит не сразу.
  // Радиус загоняем в −9 (документированный приём форса «пар нет»), уровень
  // берём 10-й: на 1-м штрафов нет вовсе, на 2-5 счёт клампится нулём — там
  // ассерт был бы зелёным по чужой причине.
  await page.evaluate(() => { window.__game.setLevel(10); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => !window.__game.awake().physAwake, null, { timeout: 5000 }).catch(()=>{});
  const npRad = await page.evaluate(() => window.__game.cfg.baseRadius);
  await page.evaluate(() => { window.__game.cfg.baseRadius = -9; });
  await page.waitForTimeout(500);                       // updateMatchRadius тикает раз в 300 мс
  const npTarget = await page.evaluate(() => {
    const g = window.__game; g.forceRefresh();
    return g.findByTex('food') || g.findByTex('animal');
  });
  if (npTarget && npTarget.px != null){
    const npBefore = await page.evaluate(() => ({ score: window.__game.stats().score, misses: window.__game.stats().misses }));
    await page.mouse.click(npTarget.px, npTarget.py);
    await page.waitForTimeout(400);
    const npAfter = await page.evaluate(() => ({ score: window.__game.stats().score, misses: window.__game.stats().misses }));
    expect(npAfter.score === npBefore.score,
      'тап по доступному без пары НЕ снял очки (' + npBefore.score + ' -> ' + npAfter.score + ')');
    expect(npAfter.misses === npBefore.misses,
      'тап по доступному без пары НЕ засчитан промахом (' + npBefore.misses + ' -> ' + npAfter.misses + ')');
  } else console.log('тап без пары: доступной цели не нашлось — пропуск');
  await page.evaluate((r) => { window.__game.cfg.baseRadius = r; }, npRad);
  await page.waitForTimeout(400);

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  console.log(failures.length ? 'SUITE: FAIL (' + failures.length + '): ' + failures.join(' || ') : 'SUITE: PASS');
  process.exitCode = failures.length ? 1 : 0;
  await browser.close();
})();
