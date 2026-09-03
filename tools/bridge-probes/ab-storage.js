// Storage A/B of two Playgama Bridge bundles inside the real game: set/get through
// bridge.storage (default type, then each explicit type) and where the key lands.
// usage: node tools/bridge-probes/ab-storage.js <old-bundle.js> <new-bundle.js> [platform_id]
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const [oldFile, newFile, platform] = process.argv.slice(2);
if (!oldFile || !newFile) { console.error('usage: ab-storage.js <old-bundle.js> <new-bundle.js> [platform_id]'); process.exit(2); }
async function run(bundleFile, port) {
  const server = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    if (u === '/playgama-bridge.js') { res.writeHead(200, {'Content-Type': 'text/javascript'}); return res.end(fs.readFileSync(bundleFile)); }
    const f = path.join(ROOT, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
  await new Promise(r => server.listen(port, r));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://localhost:${port}/index.html${platform ? '?platform_id=' + platform : ''}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(6000);
  const st = await p.evaluate(async () => { const S = window.bridge.storage; const race = pr => Promise.race([pr.then(x => 'resolved:' + JSON.stringify(x), e => 'rejected:' + String(e).slice(0, 80)), new Promise(r => setTimeout(() => r('pending>4s'), 4000))]);
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(S)).filter(k => k !== 'constructor');
    const set = await race(S.set('bridgeProbeKey', 'probeValue123'));
    const get = await race(S.get('bridgeProbeKey'));
    const getLocal = await race(S.get('bridgeProbeKey', 'local_storage'));
    const getPlat = await race(S.get('bridgeProbeKey', 'platform_internal'));
    const landed = Object.keys(localStorage).filter(k => /probe/i.test(k)).map(k => k + '=' + String(localStorage.getItem(k)).slice(0, 40));
    await race(S.delete('bridgeProbeKey'));
    return { names, set, get, getLocal, getPlat, landed }; });
  await b.close(); server.close(); return st;
}
(async () => { const A = await run(oldFile, 8797); const C = await run(newFile, 8798);
  for (const k of Object.keys(C)) { const a = JSON.stringify(A[k]), c = JSON.stringify(C[k]); console.log((a === c ? '  = ' : '  ! ') + k + ': ' + (a === c ? c : a + '  ->  ' + c)); } })();
