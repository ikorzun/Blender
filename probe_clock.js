// ADVERSARIAL PROBE: sub-slack clock ratchet against boostNow() guard (77-save.js)
const { chromium } = require('playwright');
const path = '/Users/ikorzyn/Desktop/Claude/Blender/.claude/worktrees/meta-booster/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Device-clock model: Date.now() = realNow + window.__off. Player edits __off.
  await page.addInitScript(() => {
    window.__off = 0;
    const real = Date.now.bind(Date);
    Date.now = () => real() + window.__off;
  });
  page.on('console', m => { if (m.type() === 'error') console.log('PAGEERR', m.text()); });
  await page.goto('file://' + path);
  await page.waitForFunction(() => window.__game && window.__game.scoreBoostMult, null, { timeout: 60000 });

  const out = await page.evaluate(async () => {
    const g = window.__game;
    g.boostSetClock(0); g.boostClear();
    const buy = g.grantScoreBoost('boost30m');           // x5 / 30 min / $1.99
    const t0 = { mult: g.scoreBoostMult(), left: g.scoreBoostLeftMs(), raw: g.boostRaw() };

    const STEP = 4 * 60000 + 59000;                       // 4:59 — one second under the 5-min slack
    const log = [];
    let realElapsed = 0;
    for (let i = 1; i <= 24; i++){
      window.__off += STEP;                               // 4:59 of genuine play elapses
      g.scoreBoostMult();                                 // game ticks the guard during play
      const mid = { mult: g.scoreBoostMult(), left: g.scoreBoostLeftMs() };
      window.__off -= STEP;                               // player winds device clock back 4:59
      const after = { mult: g.scoreBoostMult(), left: g.scoreBoostLeftMs() };
      realElapsed += STEP;
      if (i <= 3 || i === 12 || i === 24)
        log.push({ cycle: i, realMin: +(realElapsed/60000).toFixed(1),
                   midLeftMin: +(mid.left/60000).toFixed(2), midMult: mid.mult,
                   afterLeftMin: +(after.left/60000).toFixed(2), afterMult: after.mult });
    }
    const end = { mult: g.scoreBoostMult(), left: g.scoreBoostLeftMs(), raw: g.boostRaw() };

    // CONTROL: same amount of real time, no clock tampering -> must expire.
    g.boostSetClock(0); g.boostClear(); window.__off = 0;
    g.grantScoreBoost('boost30m');
    window.__off += 24 * STEP;                            // same ~2h of play, honest clock
    const honest = { mult: g.scoreBoostMult(), left: g.scoreBoostLeftMs() };

    return { buy, t0, log, end, realPlayMin: +(realElapsed/60000).toFixed(1), honest };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
