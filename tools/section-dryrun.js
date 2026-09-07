// DRY-RUN ONE SUITE SECTION ALONE (2026-09-06-e). The suite costs ~20 minutes; a new section costs a
// minute here — and the two drafts that went red in the batch that added this tool were caught here,
// not in the suite. The section is lifted VERBATIM out of test.js between its markers
// `// ⟦NAME-SECTION-BEGIN⟧` … `// ⟦NAME-SECTION-END⟧` and run with the helpers the suite provides
// (browser, expect, httpStand, hideBotFlag, chromium, PAGE_FILE, fs, path, require, errors).
// Sections marked today: LBKEY (the signing key), EDGES (the iOS 26 zones and the edge cards).
// Run:  NODE_PATH=<repo>/node_modules SECTION=LBKEY node tools/section-dryrun.js
//       MIXER_PAGE=<a sabotaged index.html from tools/build-variant.py> SECTION=EDGES node tools/section-dryrun.js
// ⚠️ NOT while `node test.js` is running — a second browser aborts the suite (canon 2026-09-06-a).
// ⚠️ httpStand and hideBotFlag are COPIES of the suite's; a section that needs a helper this harness does
// not provide throws a ReferenceError — add it here AND keep it byte-equal to test.js's.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGE_FILE = process.env.MIXER_PAGE || path.join(ROOT, 'index.html');
const src = fs.readFileSync(path.join(ROOT, 'test.js'), 'utf8');
const SEC = process.env.SECTION || 'LBKEY';
const a = src.indexOf('// ⟦' + SEC + '-SECTION-BEGIN⟧'), b = src.indexOf('// ⟦' + SEC + '-SECTION-END⟧');
if (a < 0 || b < 0) { console.log('markers not found'); process.exit(2); }
const body = src.slice(a, b);
const fails = []; let pass = 0; const errors = [];
const expect = (c, name) => { if (c) { pass++; console.log('PASS: ' + name.slice(0, 110)); } else { fails.push(name); console.log('FAIL: ' + name); } };
const httpStand = async () => {
  const http = require('http');
  const srv = http.createServer((req, res) => {
    if (String(req.url).split('?')[0] !== '/index.html'){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(PAGE_FILE));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + srv.address().port + '/index.html', close(){ try { srv.close(); } catch (e) {} } };
};
const hideBotFlag = () => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch (e) {}
};
(async () => {
  const browser = await chromium.launch();
  // Page errors and console errors of every page the section opens are printed here — a silent
  // exception inside the page is otherwise indistinguishable from a missing submission.
  const _np = browser.newPage.bind(browser);
  browser.newPage = async function (...a) {
    const pg = await _np(...a);
    pg.on('pageerror', (e) => console.log('PAGEERROR: ' + (e && e.message || e)));
    pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE.' + m.type() + ': ' + m.text().slice(0, 300)); });
    return pg;
  };
  const fn = new Function('browser', 'expect', 'httpStand', 'hideBotFlag', 'chromium', 'PAGE_FILE', 'fs', 'path', 'require', 'errors',
    'return (async () => {' + body + '})();');
  try { await fn(browser, expect, httpStand, hideBotFlag, chromium, PAGE_FILE, fs, path, require, errors); }
  catch (e) { console.log('RUN ERROR: ' + (e && e.stack || e)); fails.push('run error'); }
  if (errors.length) console.log('ERRORS: ' + errors.join(' | '));
  await browser.close();
  console.log('DRYRUN ' + (fails.length ? 'FAIL ' + fails.length : 'PASS') + ' (' + pass + ' green) page=' + PAGE_FILE);
  process.exit(fails.length ? 1 : 0);
})();
