const { chromium } = require('playwright');
const FILE = 'file:///Users/ikorzyn/Desktop/Claude/Blender/index.html';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  for (const lv of process.argv.slice(2).map(Number)) {
    await page.goto(FILE);
    await page.waitForFunction(() => window.__game && window.__game.level && window.__game.level(), null, { timeout: 40000 });
    await page.evaluate((n) => { localStorage.clear(); window.__game.setLevel(n); window.__game.regen(); }, lv);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__game.skipIntro());
    await page.waitForTimeout(300);
    const start = await page.evaluate(() => ({ alive: window.__game.alive(),
      types: window.__game.level().typesCount, par: window.__game.level().parBase,
      ap: window.__game.availablePairs() }));
    let taps = 0, shakes = 0, groups = [], deadMs = 0;
    const t0 = Date.now();
    for (let i = 0; i < 3000; i++) {
      const st = await page.evaluate(() => {
        const l = window.__game.level();
        const t = window.__game.bestTapTarget();
        return { over: l.over, alive: window.__game.alive(), shakesLeft: l.shakes,
                 t: t ? { n: t.n, px: t.px, py: t.py } : null };
      });
      if (st.over || st.alive === 0) break;
      if (st.t && st.t.px != null) {
        await page.mouse.click(st.t.px, st.t.py);
        taps++; groups.push(st.t.n);
        await page.waitForTimeout(240);
        continue;
      }
      if (st.shakesLeft > 0) { await page.evaluate(() => window.__game.requestShake()); shakes++; await page.waitForTimeout(900); continue; }
      const d0 = Date.now(); await page.waitForTimeout(350); deadMs += Date.now() - d0;
      if (deadMs > 400000) break;
    }
    const end = await page.evaluate(() => ({ over: window.__game.level().over,
      score: window.__game.stats().score, alive: window.__game.alive(),
      matches: window.__game.stats().matches }));
    const avg = groups.length ? +(groups.reduce((a,b)=>a+b,0)/groups.length).toFixed(2) : null;
    const wall = Date.now()-t0;
    console.log(JSON.stringify({ lv, startAlive: start.alive, types: start.types, par: start.par,
      taps, shakes, avgGroupTapped: avg,
      wallSec: Math.round(wall/1000), deadSec: Math.round(deadMs/1000),
      deadShare: +(deadMs/wall).toFixed(2),
      score: end.score, shownStarsOnWin: Math.floor(Math.max(0,end.score)/10),
      matches: end.matches, ratioToPar: +(end.score/start.par).toFixed(2) }));
  }
  await browser.close();
})();
