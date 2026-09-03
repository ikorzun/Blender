// Surface diff of two Playgama Bridge bundles on a bare page in a real Chromium:
// top-level members, the method census of every module, the constant dictionaries.
// usage: node tools/bridge-probes/surface.js <old-bundle.js> <new-bundle.js>
// A module printed as ABSENT is not created before initialize() — use ab.js for those.
const { chromium } = require('playwright'); const fs = require('fs');
const [oldFile, newFile] = process.argv.slice(2);
if (!oldFile || !newFile) { console.error('usage: surface.js <old-bundle.js> <new-bundle.js>'); process.exit(2); }
const MODULES = ['platform','player','storage','advertisement','payments','leaderboards','social','device','remoteConfig','analytics','notifications','achievements','clipboard'];
const DICTS = ['PLATFORM_MESSAGE','REWARDED_STATE','INTERSTITIAL_STATE','BANNER_STATE','STORAGE_TYPE','PLATFORM_ID','MODULE_NAME','EVENT_NAME','LEADERBOARD_TYPE','DEVICE_TYPE','DEVICE_ORIENTATION','ACTION_NAME','PAYMENTS','LAUNCH_SOURCE'];
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const [tag, file] of [['old', oldFile], ['new', newFile]]) {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.setContent('<html><body></body></html>');
    await p.addScriptTag({ content: fs.readFileSync(file, 'utf8') });
    await p.waitForTimeout(300);
    out[tag] = await p.evaluate(([MODULES, DICTS]) => {
      const B = window.bridge; if (!B) return { noBridge: true };
      const census = o => { const r = new Set(); let x = o; while (x && x !== Object.prototype) { for (const k of Object.getOwnPropertyNames(x)) if (k !== 'constructor' && !k.startsWith('_') && !k.startsWith('#')) r.add(k); x = Object.getPrototypeOf(x); } return [...r].sort(); };
      const mods = {}; for (const m of MODULES) { let v; try { v = B[m]; } catch (e) { v = null; } mods[m] = v ? census(v) : null; }
      const consts = {}; for (const k of DICTS) consts[k] = B[k] ? Object.keys(B[k]).sort() : null;
      return { version: B.version, top: census(B), mods, consts };
    }, [MODULES, DICTS]);
    out[tag].errs = errs; await p.close();
  }
  await b.close();
  const a = out.old, c = out.new;
  console.log('versions:', a.version, '->', c.version, '| page errors:', a.errs.length, c.errs.length);
  const diff = (x, y, label) => {
    if (!x && !y) { console.log(`  ${label}: ABSENT on the bare page in both`); return; }
    x = x || []; y = y || []; const rm = x.filter(k => !y.includes(k)), add = y.filter(k => !x.includes(k));
    if (rm.length || add.length) console.log(`  ${label}: removed ${JSON.stringify(rm)} added ${JSON.stringify(add)}`); };
  diff(a.top, c.top, 'bridge.*');
  for (const m of MODULES) diff(a.mods[m], c.mods[m], 'bridge.' + m);
  for (const k of DICTS) diff(a.consts[k], c.consts[k], k);
  console.log('(a line missing above = identical)');
})();
