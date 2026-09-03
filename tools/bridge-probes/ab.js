// Live A/B of two Playgama Bridge bundles INSIDE the real game: serves the repo root over http,
// hands out the given bundle as /playgama-bridge.js per run, waits for bridge.initialize() to
// settle, then reads the bridge state and the method census of every module.
// usage: node tools/bridge-probes/ab.js <old-bundle.js> <new-bundle.js> [platform_id]
//        node tools/bridge-probes/ab.js --live=https://ikorzun.github.io/Blender/   (one run, the live site)
// Mind: with platform_id=playgama initialize() never settles on a bench (no portal parent frame) —
// that is a bench property; compare the two runs, do not read one alone.
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wasm':'application/wasm','.glb':'model/gltf-binary','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.ogg':'audio/ogg'};
const MODULES = ['platform','player','storage','advertisement','payments','leaderboards','social','device','remoteConfig','analytics','notifications','achievements','clipboard'];
const args = process.argv.slice(2); const live = (args.find(a => a.startsWith('--live=')) || '').slice(7);
const files = args.filter(a => !a.startsWith('--')); const platform = files[2] || '';
async function probe(url, bundleFile, port) {
  let server = null;
  if (bundleFile) {
    server = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
      if (u === '/playgama-bridge.js') { res.writeHead(200, {'Content-Type': 'text/javascript'}); return res.end(fs.readFileSync(bundleFile)); }
      const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
    await new Promise(r => server.listen(port, r));
  }
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [], cons = [], ext = new Set();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') cons.push(m.text().slice(0, 120)); });
  p.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost')) { try { const x = new URL(u); ext.add(x.host + x.pathname.slice(0, 40)); } catch (e) {} } });
  await p.goto(url, { waitUntil: 'load', timeout: 90000 });
  const t0 = Date.now();
  await p.waitForFunction(() => window.bridge && window.bridge.isInitialized === true, null, { timeout: 30000 }).catch(() => {});
  const initMs = Date.now() - t0;
  await p.waitForTimeout(4000);
  const st = await p.evaluate((MODULES) => { const B = window.bridge; const g = f => { try { return f(); } catch (e) { return 'ERR:' + String(e).slice(0, 60); } };
    const census = o => { const r = new Set(); let x = o; while (x && x !== Object.prototype) { for (const k of Object.getOwnPropertyNames(x)) if (k !== 'constructor' && !k.startsWith('_') && !k.startsWith('#')) r.add(k); x = Object.getPrototypeOf(x); } return [...r].sort(); };
    const mods = {}; for (const m of MODULES) { const v = g(() => B[m]); mods[m] = v && typeof v === 'object' ? census(v) : null; }
    return { version: B && B.version, initialized: g(() => B.isInitialized), platformId: g(() => B.platform.id), lang: g(() => B.platform.language),
      isAudioEnabled: g(() => B.platform.isAudioEnabled), isPaused: g(() => B.platform.isPaused),
      player: g(() => ({ auth: B.player.isAuthorized, hasId: !!B.player.id, authSupported: B.player.isAuthorizationSupported })),
      ads: g(() => ({ inter: B.advertisement.isInterstitialSupported, rew: B.advertisement.isRewardedSupported, banner: B.advertisement.isBannerSupported, interState: B.advertisement.interstitialState, rewState: B.advertisement.rewardedState, minDelay: B.advertisement.minimumDelayBetweenInterstitial })),
      pay: g(() => ({ sup: B.payments.isSupported })), lb: g(() => ({ type: B.leaderboards.type })), device: g(() => B.device.type),
      mainScreenOpen: g(() => !!document.querySelector('#mainScreen.open')), loaderLeft: g(() => !!document.getElementById('loading-overlay')),
      mods }; }, MODULES);
  await b.close(); if (server) server.close();
  return { st, initMs, errs, cons: cons.filter(t => !/GL Driver|ReadPixels/.test(t)).slice(0, 8), ext: [...ext].sort() };
}
(async () => {
  if (live) { const R = await probe(live, null, 0); console.log(JSON.stringify(R, null, 1)); return; }
  if (files.length < 2) { console.error('usage: ab.js <old-bundle.js> <new-bundle.js> [platform_id]'); process.exit(2); }
  const q = platform ? `?platform_id=${platform}` : '';
  const A = await probe(`http://localhost:8797/index.html${q}`, files[0], 8797);
  const C = await probe(`http://localhost:8798/index.html${q}`, files[1], 8798);
  for (const k of Object.keys(C.st)) { if (k === 'mods') continue; const a = JSON.stringify(A.st[k]), c = JSON.stringify(C.st[k]); console.log((a === c ? '  = ' : '  ! ') + k + ': ' + (a === c ? c : a + '  ->  ' + c)); }
  for (const m of MODULES) { const x = A.st.mods[m] || [], y = C.st.mods[m] || []; const rm = x.filter(k => !y.includes(k)), add = y.filter(k => !x.includes(k));
    if (!A.st.mods[m] && !C.st.mods[m]) console.log(`  ? bridge.${m}: absent in both`); else if (rm.length || add.length) console.log(`  ! bridge.${m}: removed ${JSON.stringify(rm)} added ${JSON.stringify(add)}`); else console.log(`  = bridge.${m}: ${y.length} members identical`); }
  console.log('initMs', A.initMs, C.initMs); console.log('pageerrors old', A.errs, '| new', C.errs); console.log('console old', A.cons, '| new', C.cons); console.log('external old', A.ext, '| new', C.ext);
})();
