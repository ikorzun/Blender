// THE FLOW-MODE BENCH (2026-09-08-a): renders the pause menu, the leaderboard and the ×5 screen at the
// owner's phone geometry (402×654 layout viewport inside an 874 screen, DPR 2) with the flow mode FORCED
// (?flow=1), the leaderboard stubbed and the guest identity pinned, and takes full-page screenshots clipped
// to the band the phone shows — 61 px above the viewport (the status zone), the 654 viewport, 159 px below
// (the address-bar zone) — with the two edges ruled. This is the «picture first» of the canon: run it after
// any edit of the three screens and LOOK before writing a guard.
// Run:  NODE_PATH=<repo>/node_modules node tools/flow-band.js <out-dir>
// Needs the repo's Playwright Chromium; never while node test.js runs.


const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || process.cwd();
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html') + '?dev=1&flow=1';
const stub = () => {
  const rows = Array.from({ length: 50 }, (_, i) => ['Player' + (i + 1), (i % 24) + 1, 10000 - i * 100]);
  const of = window.fetch;
  window.fetch = function (u, o) { const s = String(u);
    if (s.indexOf('/v1/top') >= 0) return new Promise(res => setTimeout(() => res(new Response(JSON.stringify({ t: 1, n: 900, p: 1, r: rows }), { status: 200, headers: { 'content-type': 'application/json' } })), 400));
    if (s.indexOf('/v1/me') >= 0) return new Promise(res => setTimeout(() => res(new Response(JSON.stringify({ ok: 1, s: 0, n: 'Stoat', a: 5, rank: 7, exact: 1, t: 1, up: [], dn: [] }), { status: 200, headers: { 'content-type': 'application/json' } })), 400));
    return of.apply(this, arguments); };
  localStorage.setItem('mixer_lb_url', 'http://lb.stub');
  localStorage.setItem('mixer_save_v1', JSON.stringify({ gn: 'Stoat', gid: 'g-bench-0001' }));
};
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=metal'] });
  const ctx = await br.newContext({ viewport: { width: 402, height: 654 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pg.addInitScript(stub);
  await pg.goto(PAGE); await pg.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await pg.evaluate(() => window.__game.skipIntro()); await pg.waitForTimeout(400);
  const mark = async (label) => pg.evaluate((label) => {   // page-coordinate rules at the two zone boundaries + labels
    document.querySelectorAll('.bench-mark').forEach(e => e.remove());
    const y0 = scrollY, mk = (top, text, color) => { const d = document.createElement('div'); d.className = 'bench-mark';
      d.style.cssText = `position:absolute;left:0;right:0;top:${top}px;height:0;border-top:2px dashed ${color};z-index:2147483646;pointer-events:none;font:700 12px sans-serif;color:${color}`;
      d.innerHTML = `<span style="background:#fff;padding:1px 4px">${text}</span>`; document.body.appendChild(d); };
    mk(y0, 'viewport top (y=' + y0 + ')', '#e00'); mk(y0 + innerHeight, 'viewport bottom — the address bar zone below', '#e00');
    const t = document.createElement('div'); t.className = 'bench-mark';
    t.style.cssText = `position:absolute;left:8px;top:${y0 + 8}px;z-index:2147483646;background:#000;color:#fff;font:700 13px sans-serif;padding:2px 6px;pointer-events:none`;
    t.textContent = label + ' · ' + JSON.stringify(window.__game.flowState()); document.body.appendChild(t);
    return { y0, docH: document.documentElement.scrollHeight, vh: innerHeight };
  }, label);
  const shot = async (name, label) => {
    const g = await mark(label);
    const clipY = Math.max(0, g.y0 - 61), clipH = Math.min(g.docH - clipY, 61 + g.vh + 159);
    await pg.screenshot({ path: path.join(OUT, name), fullPage: true, clip: { x: 0, y: clipY, width: 402, height: clipH } });
    await pg.evaluate(() => document.querySelectorAll('.bench-mark').forEach(e => e.remove()));
    console.log(name, JSON.stringify(g), 'clip', clipY, clipH);
  };
  // 1. the pause menu, at rest and scrolled
  await pg.click('#pauseBtn'); await pg.waitForTimeout(600);
  console.log('menu state', JSON.stringify(await pg.evaluate(() => window.__game.flowState())));
  await shot('menu-top.png', 'MENU scroll 0');
  await pg.evaluate(() => scrollTo(0, 420)); await pg.waitForTimeout(400);
  await shot('menu-scrolled.png', 'MENU scrolled');
  console.log('header on?', await pg.evaluate(() => document.getElementById('msSticky').classList.contains('on')), 'sticky box', JSON.stringify(await pg.evaluate(() => { const r = document.getElementById('msSticky').getBoundingClientRect(); return [r.left, r.width, innerWidth]; })));
  // 2. the leaderboard on top of the (scrolled) menu
  await pg.click('#msLbEntry'); await pg.waitForTimeout(900);
  console.log('lb state', JSON.stringify(await pg.evaluate(() => window.__game.flowState())), 'menu display', await pg.evaluate(() => getComputedStyle(document.getElementById('mainScreen')).display), 'rows', await pg.evaluate(() => document.querySelectorAll('#lbList .lb-row').length));
  await shot('lb-top.png', 'LEADERBOARD scroll 0');
  await pg.evaluate(() => scrollTo(0, 500)); await pg.waitForTimeout(400);
  await shot('lb-scrolled.png', 'LEADERBOARD scrolled');
  await pg.click('#lbClose'); await pg.waitForTimeout(500);
  console.log('after lb close', JSON.stringify(await pg.evaluate(() => window.__game.flowState())), 'menu display', await pg.evaluate(() => getComputedStyle(document.getElementById('mainScreen')).display), 'header on?', await pg.evaluate(() => document.getElementById('msSticky').classList.contains('on')));
  await shot('menu-after-lb.png', 'MENU after the leaderboard closed');
  // 3. the ×5 screen from the HUD float (the menu closed first)
  await pg.click('.ms-play'); await pg.waitForTimeout(500);
  console.log('after resume', JSON.stringify(await pg.evaluate(() => window.__game.flowState())), 'paused', JSON.stringify(await pg.evaluate(() => window.__game.pauseState())));
  await pg.screenshot({ path: path.join(OUT, 'game-after.png') });
  await pg.click('#x5Float'); await pg.waitForTimeout(600);
  console.log('x5 state', JSON.stringify(await pg.evaluate(() => window.__game.flowState())), 'block', JSON.stringify(await pg.evaluate(() => { const b = document.querySelector('#starsOverlay .st-block').getBoundingClientRect(), c = document.querySelector('#starsOverlay .st-close').getBoundingClientRect(); return { bx: (b.left + b.right) / 2, by: (b.top + b.bottom) / 2, bh: b.height, vw: innerWidth, vh: innerHeight, cross: [c.left, c.top, getComputedStyle(document.querySelector('#starsOverlay .st-close')).position] }; })));
  await shot('x5.png', '×5 screen');
  await pg.click('#starsOverlay .st-close'); await pg.waitForTimeout(400);
  console.log('after x5 close', JSON.stringify(await pg.evaluate(() => window.__game.flowState())), JSON.stringify(await pg.evaluate(() => window.__game.pauseState())));
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
