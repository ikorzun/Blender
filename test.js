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
  await page.evaluate(() => window.__game.skipIntro());

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
  const det = await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const b1 = await page.evaluate(() => ({ alive: window.__game.alive(),
    score: window.__game.stats().score, idx: window.__game.bombIndex() }));
  expect(det === true, 'детонация сработала');
  expect(b1.idx === -1, 'бомба израсходована взрывом');
  const bombKilled = b0.alive - b1.alive - 1;
  expect(bombKilled >= 1 && bombKilled <= 7, 'взрыв снял 1..7 соседей (' + bombKilled + ')');
  expect(b1.score === b0.score, 'взрыв без очков (' + b0.score + ' -> ' + b1.score + ')');
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
  const shakesLeft = await page.evaluate(() => window.__game.level().shakes);
  expect(shakesLeft === 2, 'встряска мгновенная и списала заряд (3 -> ' + shakesLeft + ')');

  // тупик: пар нет + встрясок нет -> экран поражения
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
    lv.shakes = 0; lv.adShakes = 0;
  });
  await page.waitForTimeout(2500);
  const loseShown = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  const loseStats = await page.evaluate(() => document.getElementById('loseStats').textContent);
  console.log('lose stats:', loseStats);
  expect(loseShown === 'flex', 'тупик без встрясок показывает экран поражения');
  await page.screenshot({ path: 'shot_lose.png' });

  // «Оглядеться» закрывает оверлей и даёт фору, потом тупик показывается снова
  await page.click('#loseContinue');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  await page.waitForTimeout(9500);
  const reShown = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  expect(closed === 'none', '«Оглядеться» закрывает экран поражения');
  expect(reShown === 'flex', 'после форы тупик показан снова');

  // «Начать заново» перезапускает уровень
  await page.evaluate(() => { window.__game.cfg.matchRadius = 1.2; });
  await page.click('#loseAgainBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForTimeout(300);
  const aliveAfterRestart = await page.evaluate(() => window.__game.alive());
  expect(aliveAfterRestart > 0, 'рестарт после поражения пересоздал уровень (' + aliveAfterRestart + ')');

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
  await page.evaluate(() => { window.__game.level().idleLimit = 5; window.__game.stats().lastAction = performance.now() - 20000; }); // easy=30с — для теста лимит укорачиваем
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
    starChip: document.getElementById('score').textContent }));
  expect(fin2.win === 'flex', 'финальная зачистка доводит до победы');
  expect(fin2.score === 150 + 5 * lvlBefore, 'финал: очки не тратятся/не начисляются, только рыбка 150+5×ур (' + fin2.score + ' при ур.' + lvlBefore + ')');
  expect(fin2.lvl === lvlBefore + 1, 'победа апает уровень (' + lvlBefore + ' -> ' + fin2.lvl + ')');
  expect(fin2.hudTimerHidden && fin2.timeOnWin, 'время уровня скрыто из HUD, но есть на экране победы (спека 2026-07-22)');
  expect(fin2.starChip === '★ ' + fin2.score, 'чип справа показывает ОЧКИ уровня под иконкой звезды, спека 2026-07-22-б (' + fin2.starChip + ' при score ' + fin2.score + ')');
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
  await page.click('#shakeBtn');   // вопрос «смотреть рекламу?»
  await page.waitForTimeout(200);
  await page.click('#adYes');      // пошёл 3-секундный стаб
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); }); // уровень сменился ПОД роликом
  await page.waitForTimeout(3600); // стаб бы уже дозрел
  const adProbe = await page.evaluate(() => ({
    overlay: document.getElementById('adOverlay').style.display,
    adShakes: window.__game.level().adShakes,
    used: window.__game.stats().adShakesUsed,
  }));
  expect(adProbe.overlay === 'none', 'reген спрятал оверлей рекламы');
  expect(adProbe.adShakes === 2 && adProbe.used === 0, 'награда старого показа не прилетела новому уровню (adShakes ' + adProbe.adShakes + ', used ' + adProbe.used + ')');

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

  // ===== ЗВЁЗДЫ-ВАЛЮТА + BOOST (решение владельца 2026-07-23) =====
  // Номинал победы и анти-ферма: дельта рейтинга, а не полная выплата
  const awardProbe = await page.evaluate(() => {
    const g = window.__game;
    return { a1: g.starAward(1, 1), a3at1: g.starAward(1, 3), a3at10: g.starAward(10, 3), a0: g.starAward(5, 0) };
  });
  expect(awardProbe.a1 === 110 && awardProbe.a3at1 === 510,
    'номинал: 1★ на ур.1 = 110, 3★ = 510 (' + JSON.stringify(awardProbe) + ')');
  expect(awardProbe.a3at10 === 600, 'надбавка за уровень: 3★ на ур.10 = 600 (' + awardProbe.a3at10 + ')');
  expect(awardProbe.a0 === 0, 'непройденный уровень номинала не имеет (' + awardProbe.a0 + ')');

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
    g.starGrant(20000);
    const p0 = g.boostPrice(key), t0 = g.accSnapshot()[0].tier, m0 = g.accSnapshot()[0].mult;
    const bal0 = g.starBalance();
    const buy = g.buyBoost(key);
    const s1 = g.accSnapshot()[0];
    const p1 = g.boostPrice(key);
    return { key, p0, t0, m0, bal0, buy, t1: s1.tier, m1: s1.mult, boost: s1.boost,
      count0: s1.count, bal1: g.starBalance(), p1 };
  });
  expect(boostProbe.p0 === 1500 * Math.pow(2, boostProbe.t0),
    'цена буста удваивается со ступенью (ступень ' + boostProbe.t0 + ' -> ' + boostProbe.p0 + ')');
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

  // ОТКРЫТОСТЬ ТИПОВ прогрессией (ручка для ГРАФИКИ: портрет только открытым)
  const unlockProbe = await page.evaluate(() => {
    const g = window.__game;
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

  if (errors.length) failures.push('runtime errors: ' + errors.join(' | '));
  // КОНТРАКТ CAMNEAR v2 (спека владельца: «скрывать за 200px до вещей»):
  // критерий — ЭКРАННЫЙ зазор панель↔куча (<200 скрыть, >240 показать).
  // Вьюпорт сьюта мобильный → панели нет → vitrineGap null и класса нет;
  // экранную геометрию проверяем постановкой камеры и чтением gap.
  const camnearAt = async (r) => {
    await page.evaluate(v => window.__game.setCamR(v), r);
    await page.waitForTimeout(400); // ≥2 тика по 150мс
    return page.evaluate(() => ({ cls: document.documentElement.classList.contains('camnear'),
      gap: window.__game.vitrineGap() }));
  };
  const cnDef = await camnearAt(16.2);
  expect(cnDef.gap === null && cnDef.cls === false,
    'camnear v2: без панели (мобайл-вьюпорт) зазор null и класса нет (' + JSON.stringify(cnDef) + ')');
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
  expect(rockTap1.rocks === 1, 'камень тапом не убирается');
  // бомба убирает камень: телепортируем обоих в воздух рядом и детонируем —
  // камень в радиусе, прочая куча далеко внизу (кап не мешает)
  const rocksBeforeBomb = await page.evaluate(() => {
    const g = window.__game;
    g.place(g.bombIndex(), 0, 13, 0);
    g.place(g.rockIndex(), 0.9, 13.2, 0);
    return g.rocks();
  });
  await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const rocksAfterBomb = await page.evaluate(() => window.__game.rocks());
  expect(rocksBeforeBomb === 1 && rocksAfterBomb === 0,
    'бомба убирает камень (' + rocksBeforeBomb + ' -> ' + rocksAfterBomb + ')');
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
    await new Promise(r => setTimeout(r, 700));
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
  await apage.evaluate(() => document.getElementById('adYes').click());
  await apage.waitForTimeout(250);
  const during = await adState();
  expect(during.paused && during.muted, 'реклама: во время ролика игра на паузе и звук заглушен (' + JSON.stringify(during) + ')');
  expect(!during.overlay, 'реклама: пауза ТИХАЯ — попап не показан (игрок не закрывает его руками)');
  await emit('rw', 'rewarded');
  const afterRw = await adState();
  expect(!afterRw.paused && !afterRw.muted, 'реклама: после награды пауза и звук восстановлены (' + JSON.stringify(afterRw) + ')');

  // 2. ПРОВАЛ: развязка обязана снимать паузу так же, иначе игра замёрзнет
  await apage.evaluate(() => document.getElementById('adYes').click());
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

  // ПРОВОДКА (спека 2026-07-24): РЕАЛЬНЫЙ Retry из тупика НЕ показывает
  // межстраничную, даже когда счётчик у порога — вызов убран из loseAgainBtn.
  // Форсим настоящий тупик (нет совпадений + нет встрясок), ждём loseOverlay,
  // ставим счётчик на порог, кликаем РЕАЛЬНУЮ кнопку Retry. До правки её
  // обработчик звал maybeInterstitial и при счётчике 5 показал бы ролик —
  // ассерт бы упал. Тупик считаем от чистого уровня (regen + skipIntro).
  await apage.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await apage.waitForFunction(() => {
    if (window.__game.awake().physAwake) { window.__calm = 0; return false; }
    window.__calm = (window.__calm || 0) + 1;
    return window.__calm >= 8;
  }, null, { timeout: 30000, polling: 100 });
  await apage.evaluate(() => {
    window.__game.cfg.baseRadius = -9; window.__game.cfg.matchRadius = -9;
    const lv = window.__game.level(); lv.shakes = 0; lv.adShakes = 0;
    for (let i = 0; i < 5; i++) window.__ads.noteWin(); // счётчик у порога
  });
  await apage.waitForFunction(() => document.getElementById('loseOverlay').style.display === 'flex',
    null, { timeout: 8000 });
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
    const base = g.perfStats().geoms;
    const created = g.shardBurst(12);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const peak = g.perfStats().geoms;
    // ⚠️ НЕ фиксированная пауза (флейк 2026-07-24, ловился и метой, и мной:
    // «48 → 48», «52 → 54»). Осколки догорают по СВОИМ часам, а сьют к этой
    // секции приходит с разной загрузкой машины — 900мс хватало не всегда, и
    // тест обвинял продукт в утечке, которой нет: проба показала честный
    // дренаж 33 → 21 к ~2с. Ждём УСЛОВИЯ с потолком, как чинили флейк радиуса.
    const deadline = Date.now() + 6000;
    while (g.perfStats().geoms > base && Date.now() < deadline)
      await new Promise(r => setTimeout(r, 100));
    return { base, created, peak, after: g.perfStats().geoms };
  });
  expect(shard.created >= 12, 'осколки: залп создал fx (' + shard.created + ')');
  expect(shard.peak > shard.base, 'осколки: свои геометрии на кадре (' + shard.base + ' -> ' + shard.peak + ')');
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

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  console.log(failures.length ? 'SUITE: FAIL (' + failures.length + '): ' + failures.join(' || ') : 'SUITE: PASS');
  process.exitCode = failures.length ? 1 : 0;
  await browser.close();
})();
