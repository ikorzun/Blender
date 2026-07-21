const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.skipIntro());

  const t0 = await page.evaluate(() => ({
    alive: window.__game ? window.__game.alive() : -1,
    pairsAvail: window.__game ? window.__game.availablePairs() : -1,
  }));
  console.log('start:', JSON.stringify(t0));

  await page.screenshot({ path: 'shot_start.png' });

  // 5 авто-матчей
  for (let i = 0; i < 5; i++) {
    const ok = await page.evaluate(() => window.__game.autoMatch());
    console.log('autoMatch', i, ok);
    await page.waitForTimeout(450);
  }
  const t1 = await page.evaluate(() => window.__game.alive());
  console.log('after 5 matches alive:', t1);

  // встряска
  await page.evaluate(() => window.__game.shake());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shot_after.png' });
  const t2 = await page.evaluate(() => ({ alive: window.__game.alive(), ap: window.__game.availablePairs() }));
  console.log('after shake:', JSON.stringify(t2));

  // доиграть до конца автоматом (с встрясками при тупике)
  let guard = 0, shakes = 0;
  while (guard++ < 400) {
    const alive = await page.evaluate(() => window.__game.alive());
    if (alive === 0) break;
    const ok = await page.evaluate(() => window.__game.autoMatch());
    if (!ok) {
      shakes++;
      await page.evaluate(() => window.__game.shake());
      await page.waitForTimeout(1200);
    } else {
      await page.waitForTimeout(300);
    }
  }
  const fin = await page.evaluate(() => window.__game.alive());
  const winShown = await page.evaluate(() => document.getElementById('winOverlay').style.display);
  console.log('final alive:', fin, '| deadlock shakes needed:', shakes, '| win overlay:', winShown);
  await page.screenshot({ path: 'shot_win.png' });

  // тап по кнопке встряски после рестарта — мгновенно, без подтверждения
  await page.click('#againBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForTimeout(300);
  await page.click('#shakeBtn');
  await page.waitForTimeout(400);
  const shakeState = await page.evaluate(() => ({
    shakes: window.__game.level().shakes,
    confirmGone: document.getElementById('confirmOverlay') === null,
  }));
  console.log('instant shake (expect shakes 2, confirmGone true):', JSON.stringify(shakeState));

  // тупик: пар нет + встрясок нет -> экран поражения
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__game.cfg.baseRadius = -9; // радиус динамический — правим базу (метрика v3: 0.001 матчил бы касающиеся)
    window.__game.cfg.matchRadius = -9; // зазор не бывает отрицательным настолько — гарантированный тупик
    const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 0;
  });
  await page.waitForTimeout(2500);
  const loseShown = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  const loseStats = await page.evaluate(() => document.getElementById('loseStats').textContent);
  console.log('lose overlay on deadlock:', loseShown, '|', loseStats);
  await page.screenshot({ path: 'shot_lose.png' });

  // «Оглядеться» закрывает оверлей и даёт фору, потом тупик показывается снова
  await page.click('#loseContinue');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  await page.waitForTimeout(9500);
  const reShown = await page.evaluate(() => document.getElementById('loseOverlay').style.display);
  console.log('continue closes:', closed, '| re-shown after grace:', reShown);

  // «Начать заново» перезапускает уровень
  await page.evaluate(() => { window.__game.cfg.matchRadius = 1.2; });
  await page.click('#loseAgainBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForTimeout(300);
  const aliveAfterRestart = await page.evaluate(() => window.__game.alive());
  console.log('alive after lose-restart:', aliveAfterRestart);

  // заполнение доверху + очки за групповой матч + миксер за простой
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(1000);
  const fill = await page.evaluate(() => ({ topY: window.__game.topY(), alive: window.__game.alive() }));
  console.log('fill: topY', fill.topY.toFixed(2), '(rim 9.2) | alive:', fill.alive);

  await page.evaluate(() => window.__game.autoMatch());
  await page.waitForTimeout(400);
  const sc = await page.evaluate(() => window.__game.stats().score);
  console.log('score after pair match (expect 20):', sc);

  await page.evaluate(() => { window.__game.level().idleLimit = 5; window.__game.stats().lastAction = performance.now() - 20000; }); // easy=30с — для теста лимит укорачиваем
  await page.waitForTimeout(3500);
  const mixer = await page.evaluate(() => ({ alive: window.__game.alive(), score: window.__game.stats().score,
    mt: document.getElementById('mixerTimer').textContent,
    mtBg: document.getElementById('mixerTimer').style.background }));
  console.log('after 16s idle: alive', mixer.alive, '| score', mixer.score, '| таймер-чип:', mixer.mt, '|', mixer.mtBg);

  // штраф за промах: тап в пустоту -> -7
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(380, 120); // верхний правый угол, заведомо вне кучи
  await page.waitForTimeout(300);
  const missScore = await page.evaluate(() => { const s = window.__game.stats();
    return { score: s.score, taps: s.taps, misses: s.misses, over: window.__game.level().over }; });
  console.log('score after miss (expect -7):', JSON.stringify(missScore));

  // финал: остались одиночки без пар — миксер зачищает их, собирает сюрприз (+150)
  // и наступает победа с апом уровня
  const lvlBefore = await page.evaluate(() => window.__game.levelNum());
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); window.__game.leaveSingles(); });
  await page.waitForTimeout(11000);
  const fin2 = await page.evaluate(() => ({ alive: window.__game.alive(),
    win: document.getElementById('winOverlay').style.display,
    score: window.__game.stats().score,
    lvl: window.__game.levelNum(),
    title: document.getElementById('winTitle').textContent }));
  console.log('finale cleanup: alive', fin2.alive, '| win:', fin2.win, '| score (expect 150):', fin2.score,
    '| level', lvlBefore, '->', fin2.lvl, '|', fin2.title);

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
  console.log('difficulty: easy acc==alive-1(сюрприз):', diff.easy.acc === diff.easy.alive - 1,
    '| hard acc<alive:', diff.hard.acc < diff.hard.alive,
    '(easy ' + diff.easy.acc + '/' + diff.easy.alive + ', hard ' + diff.hard.acc + '/' + diff.hard.alive + ')');

  // адаптер рекламы: на file:// SDK не грузится — режим заглушки
  const adsMode = await page.evaluate(() => window.__game.adsMode());
  console.log('ads mode on file:// (expect stub):', adsMode);

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
