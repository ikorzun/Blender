// TWO-WAY CHECK OF THE LEADERBOARD ENTRY POINT GUARDS (dispatcher, 2026-08-10)
//
// ⚠️ WHY A SEPARATE TOOL AND NOT THE FULL SUITE FOR EVERY SABOTAGE TEST: the suite takes
// 13 minutes, there are six sabotage tests. Here we take EXACTLY THE SAME quantities that
// the guards in test.js read — that is, the observability of the defect is checked with the
// same ruler. A green full run separately proves that the guards are wired in.
//
// ⚠️ THE THREE SIGNS OF A SABOTAGE TEST THAT DID NOT FIRE (project law, 2026-08-09) are covered:
//   • WENT STALE  — the substring was not found, we print it explicitly and exit;
//   • MISSED / DID NOT FIRE — we compare the MEASUREMENT, not the fact of substitution:
//     if the taken numbers matched the base ones bit-for-bit, the sabotage test is called empty.
// ⚠️ THE TOOL'S SELF-CHECK as a permanent entry in the list: a comment edit
// knowingly changes nothing, and the run MUST call it empty. Without it the
// behavior check would have stayed unchecked.
//
// ⚠️ THE ORIGINALS ARE RESTORED IN `finally` AND VERIFIED BYTE-FOR-BYTE AT THE END:
// last time a sabotage-test run killed by SIGPIPE left the live build
// mutilated, and the next sabotage test reported that as somebody else's error.
// For the same reason do NOT pipe the output through `| head` — a closed pipe kills
// the writer with a signal, and the cleanup never happens.
//
// Run: NODE_PATH=<...>/node_modules node tools/lb-entry-break.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = (f) => path.join(ROOT, f);

// ⚠️ We do not bring up a rig: the network is stubbed BEFORE the page loads, as in the suite.
// `/v1/me` answers the same way the live server answers a newcomer: 404 `{"err":"none"}`.
// ⚠️ THE TOP ROWS ARE ARRAYS `[name, avatar, score]`: that is how the live server sends them and
// how `lbRow` parses them. A mock made of objects would give `null` per row and ZERO
// avatars — the rig would lie in favor of "everything fits" (caught on ourselves).
const MOCK = () => {
  try { localStorage.clear(); localStorage.setItem('mixer_lb_url', 'http://lb.test'); } catch (e) {}
  const of = window.fetch;
  window.fetch = function (u) {
    if (String(u).indexOf('/v1/me') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ err: 'none' }), { status: 404 }));
    if (String(u).indexOf('/v1/top') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ t: 1, n: 3, p: 1,
        r: [['Otter', 5, 900], ['Perch', 12, 800], ['Tanuki', 46, 700]] }), { status: 200 }));
    return of.apply(this, arguments);
  };
};

// ROW GEOMETRY: the title's ink against its box and the gap up to the right group.
// ⚠️ Ink via `Range`, not `scrollWidth` — the latter lies for overflowing text.
const GEOM = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('pauseBtn').click();
  await sleep(500);
  const t = document.querySelector('.ms-lbe-title');
  const rg = document.createRange(); rg.selectNodeContents(t);
  const ink = rg.getBoundingClientRect(), box = t.getBoundingClientRect();
  const txt = document.querySelector('.ms-lbe-txt').getBoundingClientRect();
  const right = document.querySelector('.ms-lbe-right').getBoundingClientRect();
  const out = { ink: Math.round(ink.width), box: Math.round(box.width),
    gap: Math.round(right.left - txt.right),
    avatars: Array.prototype.filter.call(document.querySelectorAll('#msLbeAvs img'),
      (i) => i.getBoundingClientRect().width > 0).length };
  { const p = document.querySelector('.ms-play'); if (p) p.click(); }
  await sleep(250);
  return out;
};

// A SNAPSHOT OF THE SAME QUANTITIES THE GUARDS READ. The menu is opened by the REAL path.
const SNAP = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('pauseBtn').click();
  await sleep(400);
  const H = () => { const e = document.getElementById('msLbEntry');
    return e ? Math.round(e.getBoundingClientRect().height) : -1; };
  const lbModule = window.__lb;
  let off = -1;
  try { window.__lb = undefined; window.__game.lbEntryRefresh(); await sleep(60); off = H(); }
  finally { window.__lb = lbModule; window.__game.lbEntryRefresh(); }
  await sleep(400);
  const e = document.getElementById('msLbEntry');
  const r = e.getBoundingClientRect();
  return {
    off, on: H(),
    place: (document.getElementById('msLbeSub') || {}).textContent || '',
    dot: (document.getElementById('msLbeDot') || {}).textContent || '',
    buttons: document.querySelectorAll('#msLbEntry button').length,
    underProfile: r.top >= document.querySelector('.ms-head').getBoundingClientRect().bottom,
    aboveGame: r.bottom <= document.querySelector('.ms-play').getBoundingClientRect().top,
  };
};

// ⚠️ THE ADDRESS IS READ FROM THE BUILD WITH THE SAME PARSING AS IN THE SUITE — otherwise the
// "remove the gate" sabotage test would be checked by a different ruler than the guard.
function delivery() {
  const s = fs.readFileSync(P('index.html'), 'utf8');
  const m = /const LB_URL\s*=\s*([^;]+);/.exec(s);
  const expression = m ? m[1].replace(/\s+/g, ' ').trim() : '';
  return { expression, address: (/'(https:\/\/[^']+)'/.exec(expression) || [])[1] || '',
           gate: /file:/.test(expression) };
}

const SABOTAGES = [
  { name: 'SELF-CHECK: comment edit', file: 'src/app/85-hud.js',
    before: '// ─── LEADERBOARD ENTRY POINT', after: '// --- LEADERBOARD ENTRY POINT',
    expect: 'nothing (the tool MUST call the sabotage test EMPTY)' },
  { name: 'the block is always shown, bypassing base()', file: 'src/app/85-hud.js',
    before: '  box.hidden = !on;', after: '  box.hidden = false;',
    expect: 'the "feature off" guard (off becomes > 0)' },
  { name: 'the place is shown WITHOUT the exact flag', file: 'src/app/85-hud.js',
    before: "    const ok = !!(m && m.state === 'ok' && m.exact && m.rank > 0);",
    after: "    const ok = true;",
    expect: 'the newcomer guard (a number appears out of nowhere)' },
  { name: 'the block moved BELOW the Play card', file: 'src/shell.html',
    before: '    .ms-lbentry { order:1; }', after: '    .ms-lbentry { order:3; }',
    expect: 'the layout-position guard (aboveGame becomes false)' },
  { name: 'a second focusable node in the row', file: 'src/shell.html',
    before: '          <span class="ms-lbe-open">Open</span>',
    after: '          <button class="ms-lbe-open">Open</button>',
    expect: 'the "exactly one button" guard (buttons becomes 2)' },
  { name: 'the avatars do NOT yield to the text on a narrow screen', file: 'src/shell.html',
    before: '  @media (max-width:389px){ .ms-lbe-avs img:nth-child(3){ display:none; } }\n  @media (max-width:359px){ .ms-lbe-avs img:nth-child(2){ display:none; } }',
    after: '  /* yielding removed by the sabotage test */',
    expect: 'the narrow-width guards (at 320 the title ink overflows its box)' },
  { name: 'the file:// gate removed — runs write into the LIVE leaderboard', file: 'src/app/00-config.js',
    before: "const LB_URL = (typeof location !== 'undefined' && location.protocol === 'file:')\n  ? '' : 'https://lb.blendo.monster';",
    after: "const LB_URL = 'https://lb.blendo.monster';",
    expect: 'the delivery guard (the gate disappears from the expression)' },
  { name: 'the address diverted to the disabled workers.dev', file: 'src/app/00-config.js',
    before: "? '' : 'https://lb.blendo.monster';", after: "? '' : 'https://blendo-lb.workers.dev';",
    expect: 'the delivery guard (the address becomes workers.dev)' },
];

(async () => {
  const build = () => execFileSync('python3', [P('build.py')], { cwd: ROOT }).toString().trim();
  const originals = new Map();
  for (const d of SABOTAGES) if (!originals.has(d.file)) originals.set(d.file, fs.readFileSync(P(d.file), 'utf8'));

  const browser = await chromium.launch();
  const capture = async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(MOCK);
    await page.goto('file://' + P('index.html'));
    await page.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    await page.evaluate(() => window.__game.skipIntro());
    await new Promise((r) => setTimeout(r, 1200));
    const out = await page.evaluate(SNAP);
    const w390 = await page.evaluate(GEOM);
    await page.setViewportSize({ width: 320, height: 780 });
    await page.waitForTimeout(250);
    const w320 = await page.evaluate(GEOM);
    await page.close();
    return Object.assign(out, delivery(), { w390, w320 });
  };

  let blind = 0, empty = 0, buildBefore = null;
  try {
    console.log(build());
    buildBefore = fs.readFileSync(P('index.html'), 'utf8');
    const base = await capture();
    console.log('BASE (healthy build):', JSON.stringify(base));
    console.log('');

    for (const d of SABOTAGES) {
      const original = originals.get(d.file);
      if (original.indexOf(d.before) < 0) {
        console.log('⛔ SABOTAGE TEST WENT STALE (string not found): ' + d.name);
        blind++; continue;
      }
      try {
        fs.writeFileSync(P(d.file), original.replace(d.before, d.after));
        build();
        const snapshot = await capture();
        const identical = JSON.stringify(snapshot) === JSON.stringify(base);
        const selfCheck = d.name.indexOf('SELF-CHECK') === 0;
        if (identical) {
          empty++;
          console.log((selfCheck ? '✅ ' : '⛔ ') + 'SABOTAGE TEST EMPTY (the measurement did not change): ' + d.name);
          if (!selfCheck) blind++;
        } else if (selfCheck) {
          blind++;
          console.log('⛔ THE TOOL IS LYING: an empty edit changed the measurement — ' + JSON.stringify(snapshot));
        } else {
          console.log('✅ CAUGHT: ' + d.name);
          console.log('   expected: ' + d.expect);
          // ⚠️ WE PRINT THE MEASURED VALUES, NOT THE FACT OF A DIVERGENCE: on nested objects
          // concatenation gave `[object Object] -> [object Object]`, and from such a
          // line you cannot tell "moved in the expected direction" from "moved
          // somewhere else". The project rule "print the numbers in the message" is
          // load-bearing here — the distinction between the three signs of a sabotage test rests on it.
          const diff = [];
          for (const k of Object.keys(base)) if (JSON.stringify(base[k]) !== JSON.stringify(snapshot[k]))
            diff.push(k + ': ' + JSON.stringify(base[k]) + ' -> ' + JSON.stringify(snapshot[k]));
          console.log('   diverged: ' + diff.join('; '));
        }
      } finally {
        fs.writeFileSync(P(d.file), original);
      }
    }
  } finally {
    await browser.close();
    for (const [f, s] of originals) fs.writeFileSync(P(f), s);
    console.log('\nrestoration: ' + build());
    // ⚠️ THE BYTE-FOR-BYTE VERIFICATION IS A MANDATORY PART, not a courtesy: a mutilated
    // live build looks from the outside like somebody else's error.
    // ⛔ WE COMPARE AGAINST OUR OWN SNAPSHOT, NOT AGAINST `git status`: this branch's edits
    // are not committed yet, and git would honestly show "dirty" with perfect cleanup —
    // that is, the check would be green/red for the wrong reason.
    let intact = true;
    for (const [f, s] of originals) if (fs.readFileSync(P(f), 'utf8') !== s) { intact = false; console.log('⛔ NOT RESTORED: ' + f); }
    if (buildBefore !== null && fs.readFileSync(P('index.html'), 'utf8') !== buildBefore) { intact = false; console.log('⛔ THE BUILD DIVERGED FROM THE ORIGINAL'); }
    console.log(intact ? '✅ the sources and the build are restored byte-for-byte' : '⛔ THE CLEANUP IS NOT COMPLETE');
  }
  console.log(blind ? ('\n⛔ NOT ACCEPTED: blind/did-not-fire ' + blind) :
    '\n✅ ALL GUARDS ARE TWO-WAY (empty by plan: ' + empty + ')');
  process.exit(blind ? 1 : 0);
})();
