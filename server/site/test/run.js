// Guards of the site worker. Run: `node server/site/test/run.js` (or `npm run test:site`).
// Assertion-based, like the video worker's run.js: any FAIL gives exit code 1. The store is a FAKE
// `ASSETS` binding over four known files, so the tests state the routing, the slicing and the cache
// policy, not Cloudflare. ⚠️ Every guard is verified BOTH WAYS by the sibling break.js.
const path = require('path');
let pass = 0; const fails = [];
function expect(cond, name) { if (cond) { pass++; console.log('PASS: ' + name); } else { fails.push(name); console.log('FAIL: ' + name); } }

const HTML = '<!doctype html><html><body>blendo</body></html>';
const JS = 'window.bridge={};';
const SIZE = 5000; const MP3 = new Uint8Array(SIZE); for (let i = 0; i < SIZE; i++) MP3[i] = (i * 7) & 255;
const PNG = new Uint8Array(300).fill(9);
// The card is what tools/site-pack.py writes beside the build: the head metas and nothing else.
const CARD = '<!doctype html><html lang="en"><head><title>BLENDO</title>'
  + '<meta property="og:image" content="https://blendo.monster/og.jpg">'
  + '<meta name="twitter:card" content="summary_large_image"></head><body>Blendo</body></html>';
const JPG = new Uint8Array(400).fill(7);
const FILES = {
  '/index.html': { type: 'text/html; charset=utf-8', body: HTML, etag: '"h1"' },
  '/card.html': { type: 'text/html; charset=utf-8', body: CARD, etag: '"c1"' },
  '/playgama-bridge.js': { type: 'text/javascript', body: JS, etag: '"j1"' },
  '/music.mp3': { type: 'audio/mpeg', body: MP3, etag: '"m1"' },
  '/og.jpg': { type: 'image/jpeg', body: JPG, etag: '"o1"' },
  '/avatars/Avatar01.png': { type: 'image/png', body: PNG, etag: '"p1"' },
  // ⚠️ THE MANIFEST IS DELIBERATELY GIVEN THE WRONG TYPE BY THE FAKE STORE: an assets store need not know
  // `.webmanifest`, and a manifest served as octet-stream is a warning in Chrome and a refusal elsewhere —
  // i.e. exactly «the browser does not understand that the game can be installed». The worker forces it.
  '/manifest.webmanifest': { type: 'application/octet-stream', body: '{"name":"Blendo"}', etag: '"w1"' },
  '/sw.js': { type: 'text/javascript', body: 'self.addEventListener("fetch",function(){});', etag: '"s1"' },
};
// `drop` removes one file from the store — the only way to state what happens to a `site/` packed before
// the card existed (the worker must fall through to the build, not answer the crawler with a 404).
function fakeAssets(log, drop) {
  return { fetch(req) {
    const r = req instanceof Request ? req : new Request(req);
    const u = new URL(r.url); const p = u.pathname === '/' ? '/index.html' : u.pathname;
    log.push({ method: r.method, path: p, range: r.headers.get('range') });
    const f = p === drop ? null : FILES[p];
    if (!f) return Promise.resolve(new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    if (r.headers.get('if-none-match') === f.etag) return Promise.resolve(new Response(null, { status: 304, headers: { etag: f.etag } }));
    const body = typeof f.body === 'string' ? f.body : f.body.slice();
    return Promise.resolve(new Response(r.method === 'HEAD' ? null : body, { status: 200, headers: { 'content-type': f.type, etag: f.etag, 'content-length': String(typeof f.body === 'string' ? f.body.length : f.body.length) } }));
  } };
}
function sliceOk(bytes, start) { for (let i = 0; i < bytes.length; i++) if (bytes[i] !== ((start + i) * 7 & 255)) return false; return true; }

(async () => {
  const mod = await import(process.env.SITE_WORKER ? path.resolve(process.env.SITE_WORKER) : path.join(__dirname, '..', 'src', 'index.js'));
  const worker = mod.default;
  const go = (url, init, drop) => { const log = []; return worker.fetch(new Request(url, init), { ASSETS: fakeAssets(log, drop) }).then(res => ({ res, log })); };
  const TG = 'TelegramBot (like TwitterBot)';
  const HUMAN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

  // 1. the html at the apex over https: 200, the store's type, revalidate-every-time
  { const { res, log } = await go('https://blendo.monster/');
    const body = await res.text();
    expect(res.status === 200 && /text\/html/.test(res.headers.get('content-type')) && body === HTML && res.headers.get('cache-control') === 'no-cache' && log.length === 1 && log[0].path === '/index.html',
      'HTML: https://blendo.monster/ is the index from the store, 200 text/html, Cache-Control no-cache (a release reaches the next load by ETag)'); }
  // 2. www → apex, 301, the path and the query survive
  { const { res, log } = await go('https://www.blendo.monster/menu/?x=1&y=2');
    expect(res.status === 301 && res.headers.get('location') === 'https://blendo.monster/menu/?x=1&y=2' && log.length === 0,
      'WWW: www.blendo.monster → 301 https://blendo.monster with the path and the query, the store not asked (' + res.status + ' ' + res.headers.get('location') + ')'); }
  // 3. http → https at the apex
  { const { res } = await go('http://blendo.monster/');
    expect(res.status === 301 && res.headers.get('location') === 'https://blendo.monster/', 'HTTP: http://blendo.monster/ → 301 https (' + res.headers.get('location') + ')'); }
  // 4. http www → https apex in one hop
  { const { res } = await go('http://www.blendo.monster/a');
    expect(res.status === 301 && res.headers.get('location') === 'https://blendo.monster/a', 'HTTP WWW: one hop to https://blendo.monster/a (' + res.headers.get('location') + ')'); }
  // 5. wrangler dev / a preview host is served, never redirected
  { const { res } = await go('http://localhost:8791/');
    expect(res.status === 200 && (await res.text()) === HTML, 'LOCAL: http://localhost:8791/ is served as is (the smoke needs it), no redirect (' + res.status + ')'); }
  // 6. the music with a Range: the video worker's slicer — 206, Content-Range, the bytes, a day of cache, the store asked WITHOUT the Range
  { const { res, log } = await go('https://blendo.monster/music.mp3', { headers: { range: 'bytes=0-99' } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(res.status === 206 && res.headers.get('content-range') === 'bytes 0-99/' + SIZE && res.headers.get('accept-ranges') === 'bytes' && bytes.length === 100 && sliceOk(bytes, 0) && res.headers.get('cache-control') === 'public, max-age=86400' && log.length === 1 && log[0].range === null,
      'MUSIC: Range 0-99 → 206 bytes 0-99/' + SIZE + ', the right 100 bytes, Accept-Ranges, a day of cache, the store asked without the Range (' + res.status + ' ' + res.headers.get('content-range') + ' store-range=' + log[0].range + ')'); }
  // 7. the music without a Range: 200 with Accept-Ranges (Safari's probe of the next play)
  { const { res } = await go('https://blendo.monster/music.mp3');
    expect(res.status === 200 && res.headers.get('accept-ranges') === 'bytes' && res.headers.get('content-length') === String(SIZE), 'MUSIC: no Range → 200 with Accept-Ranges and the full length (' + res.status + ')'); }
  // 8. HEAD with a Range: 206 headers, no body
  { const { res } = await go('https://blendo.monster/music.mp3', { method: 'HEAD', headers: { range: 'bytes=0-99' } });
    expect(res.status === 206 && res.headers.get('content-range') === 'bytes 0-99/' + SIZE && (await res.arrayBuffer()).byteLength === 0, 'MUSIC HEAD: 206 with the headers and no body (the smoke uses -I)'); }
  // 9. a past-the-end Range → 416
  { const { res } = await go('https://blendo.monster/music.mp3', { headers: { range: 'bytes=9000-' } });
    expect(res.status === 416 && res.headers.get('content-range') === 'bytes */' + SIZE, 'MUSIC: a Range past the end → 416 bytes */' + SIZE + ' (' + res.status + ')'); }
  // 10. an image: a day of cache
  { const { res } = await go('https://blendo.monster/avatars/Avatar01.png');
    expect(res.status === 200 && res.headers.get('cache-control') === 'public, max-age=86400' && /image\/png/.test(res.headers.get('content-type')), 'IMAGE: an avatar is served with a day of cache (' + res.headers.get('cache-control') + ')'); }
  // 11. the bridge script: revalidate every time
  { const { res } = await go('https://blendo.monster/playgama-bridge.js');
    expect(res.status === 200 && res.headers.get('cache-control') === 'no-cache' && (await res.text()) === JS, 'BRIDGE: playgama-bridge.js is served with no-cache (an SDK bump reaches the next load)'); }
  // 12. a conditional reload of the html: the store's 304 passes through
  { const { res } = await go('https://blendo.monster/', { headers: { 'if-none-match': '"h1"' } });
    expect(res.status === 304, 'HTML 304: If-None-Match with the current ETag → 304 from the store, passed through (' + res.status + ')'); }
  // 13. a missing path: the store's 404 passes through
  { const { res } = await go('https://blendo.monster/nope.txt');
    expect(res.status === 404, 'MISSING: /nope.txt → 404 from the store (' + res.status + ')'); }

  // ===== THE CRAWLER CARD (2026-09-09-g): a link-preview bot gets 1 KB of metas, everyone else the build.
  // 14. Telegram on the document: the card, not the 12.7 MB index — and the store was asked for /card.html
  { const { res, log } = await go('https://blendo.monster/', { headers: { 'user-agent': TG } });
    const body = await res.text();
    expect(res.status === 200 && body === CARD && /og:image/.test(body) && body.length < 4096
      && res.headers.get('cache-control') === 'no-cache' && /user-agent/i.test(res.headers.get('vary') || '')
      && log.length === 1 && log[0].path === '/card.html',
      'CRAWLER: TelegramBot on / gets card.html — the same og:image under 4 KB, no-cache, Vary: User-Agent, the build never read ('
      + res.status + ' bytes=' + body.length + ' asked=' + log.map(l => l.path).join(',') + ')'); }
  // 15. the same for /index.html spelled out (a crawler follows what the link says)
  { const { res, log } = await go('https://blendo.monster/index.html', { headers: { 'user-agent': TG } });
    expect((await res.text()) === CARD && log[0].path === '/card.html', 'CRAWLER: /index.html spelled out is the card too (' + log[0].path + ')'); }
  // 16. A PLAYER IS NOT A CRAWLER: an ordinary browser gets the game
  { const { res, log } = await go('https://blendo.monster/', { headers: { 'user-agent': HUMAN } });
    expect((await res.text()) === HTML && log[0].path === '/index.html', 'CRAWLER: a Safari user-agent still gets the build, never the card (' + log[0].path + ')'); }
  // 17. ⛔ NO CLOAKING: a search engine ranks the page, so it must see exactly what the player sees
  { const { res, log } = await go('https://blendo.monster/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } });
    expect((await res.text()) === HTML && log[0].path === '/index.html', 'CRAWLER: Googlebot gets the build — the swap is for preview bots only, ranking crawlers are never cloaked (' + log[0].path + ')'); }
  // 18. THE PICTURE ITSELF is the crawler's second request and must pass through untouched
  { const { res, log } = await go('https://blendo.monster/og.jpg', { headers: { 'user-agent': TG } });
    const b = new Uint8Array(await res.arrayBuffer());
    expect(res.status === 200 && b.length === 400 && /image\/jpeg/.test(res.headers.get('content-type')) && res.headers.get('cache-control') === 'public, max-age=86400' && log[0].path === '/og.jpg',
      'CRAWLER: og.jpg is served to the bot as the image, a day of cache, not the card (' + res.status + ' ' + b.length + 'B ' + log[0].path + ')'); }
  // 19. media keep the slicer even for a bot user-agent (a preview of a link to the music must not 200 a Range)
  { const { res } = await go('https://blendo.monster/music.mp3', { headers: { 'user-agent': TG, range: 'bytes=0-99' } });
    expect(res.status === 206 && res.headers.get('content-range') === 'bytes 0-99/' + SIZE, 'CRAWLER: a bot asking the music with a Range still gets the slicer (' + res.status + ')'); }
  // 20. an old site/ with no card: fall through to the build rather than answer 404
  { const { res, log } = await go('https://blendo.monster/', { headers: { 'user-agent': TG } }, '/card.html');
    expect(res.status === 200 && (await res.text()) === HTML && log.length === 2 && log[1].path === '/index.html',
      'CRAWLER: a store packed before the card falls through to the build, never a 404 (' + res.status + ' asked=' + log.map(l => l.path).join(',') + ')'); }

  // 21. THE MANIFEST (2026-09-09-h): the type is forced, and it revalidates every time — a manifest cached for a
  //     day would keep a renamed icon or a changed scope out of the installed app for a day.
  { const { res } = await go('https://blendo.monster/manifest.webmanifest');
    expect(res.status === 200 && res.headers.get('content-type') === 'application/manifest+json' && res.headers.get('cache-control') === 'no-cache',
      'PWA: manifest.webmanifest is forced to application/manifest+json and revalidates (' + res.status + ' ' + res.headers.get('content-type') + ' ' + res.headers.get('cache-control') + ')'); }
  // 22. THE WORKER SCRIPT: `no-cache`. ⛔ A DAY OF CACHE HERE IS THE WORST BUG THIS FILE CAN SHIP: sw.js carries
  //     the build's hash, so a stale copy pins every installed player to the PREVIOUS release, and nothing on
  //     screen says so. It must never fall into the STATIC_DAY branch.
  { const { res } = await go('https://blendo.monster/sw.js');
    expect(res.status === 200 && res.headers.get('cache-control') === 'no-cache' && /javascript/.test(res.headers.get('content-type') || ''),
      'PWA: sw.js revalidates every time and keeps its JavaScript type — a worker script with a wrong MIME fails registration with a SecurityError (' + res.status + ' ' + res.headers.get('content-type') + ' ' + res.headers.get('cache-control') + ')'); }

  console.log('\nSITE WORKER: ' + pass + ' PASS, ' + fails.length + ' FAIL');
  if (fails.length) { console.log('SITE WORKER: FAIL'); process.exit(1); } else console.log('SITE WORKER: PASS');
})().catch(e => { console.error('RUN ERROR', e); process.exit(2); });
