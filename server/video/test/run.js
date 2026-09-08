// Guards of the video worker. Run: `node server/video/test/run.js`
// Assertion-based, like the leaderboard's run.js: any FAIL gives exit code 1.
// ⚠️ Every guard is verified BOTH WAYS (see the sibling file break.js): red on a broken build,
// green on a healthy one. The store is a FAKE `ASSETS` binding over a known body, so the tests
// state the slicing and the headers, not Cloudflare.
const path = require('path');

let pass = 0; const fails = [];
function expect(cond, name) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fails.push(name); console.log('FAIL: ' + name); }
}

// a 5000-byte body whose byte i is (i * 7) % 256 — any slice is checkable by arithmetic
const SIZE = 5000;
const BODY = new Uint8Array(SIZE);
for (let i = 0; i < SIZE; i++) BODY[i] = (i * 7) & 255;
const ETAG = '"abc123"';

function fakeAssets(log) {
  return {
    fetch(req) {
      const r = req instanceof Request ? req : new Request(req);
      log.push({ method: r.method, range: r.headers.get('range'), url: r.url });
      const u = new URL(r.url);
      if (u.pathname !== '/blendo-intro.webm') {
        return Promise.resolve(new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
      }
      if (r.headers.get('if-none-match') === ETAG) return Promise.resolve(new Response(null, { status: 304, headers: { etag: ETAG } }));
      return Promise.resolve(new Response(BODY.slice(), {
        status: 200,
        headers: { 'content-type': 'video/webm', etag: ETAG, 'content-length': String(SIZE), 'last-modified': 'Tue, 08 Sep 2026 10:00:00 GMT' }
      }));
    }
  };
}

function sliceOk(bytes, start) {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] !== ((start + i) * 7 & 255)) return false;
  return true;
}

(async () => {
  const src = process.env.VIDEO_SRC
    ? require('url').pathToFileURL(process.env.VIDEO_SRC).href : '../src/index.js';
  const mod = await import(src);
  const worker = mod.default, parseRange = mod.parseRange;
  const URL_ = 'https://video.blendo.monster/blendo-intro.webm';
  const call = async (headers, method) => {
    const log = [];
    const res = await worker.fetch(new Request(URL_, { method: method || 'GET', headers: headers || {} }), { ASSETS: fakeAssets(log) });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { res, buf, log, h: (k) => res.headers.get(k) };
  };

  // THE GRAMMAR (the pure function, so a table can be run without a request)
  const T = [
    ['bytes=0-1', { start: 0, end: 1 }], ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=1000-', { start: 1000, end: 4999 }], ['bytes=-100', { start: 4900, end: 4999 }],
    ['bytes=0-99999', { start: 0, end: 4999 }], ['bytes=4999-4999', { start: 4999, end: 4999 }],
    ['bytes=5000-', 'invalid'], ['bytes=6-3', 'invalid'], ['bytes=-', 'invalid'], ['bytes=-0', 'invalid'],
    ['bytes=abc', 'invalid'], ['bytes=0-1,5-9', null], ['items=0-1', null], [null, null], ['', null],
  ];
  let gramOk = 0;
  for (const [h, want] of T) {
    const got = parseRange(h, SIZE);
    const ok = want === null ? got === null : want === 'invalid' ? !!(got && got.invalid) : !!(got && got.start === want.start && got.end === want.end);
    if (ok) gramOk++; else console.log('  grammar miss: ' + JSON.stringify(h) + ' → ' + JSON.stringify(got) + ' (want ' + JSON.stringify(want) + ')');
  }
  expect(gramOk === T.length, 'GRAMMAR: ' + gramOk + ' of ' + T.length + ' range forms parse as the RFC says (a-b, a-, -n; 416 forms; multi-range and foreign units → full)');

  // A PLAIN GET IS THE WHOLE FILE WITH Accept-Ranges
  { const { res, buf, h } = await call();
    expect(res.status === 200 && buf.length === SIZE && sliceOk(buf, 0) && h('accept-ranges') === 'bytes' && h('content-length') === String(SIZE) && h('content-type') === 'video/webm' && h('etag') === ETAG,
      'PLAIN GET: 200, the whole ' + buf.length + ' bytes, Accept-Ranges bytes, type and ETag copied (status ' + res.status + ', ar ' + h('accept-ranges') + ')'); }

  // THE SAFARI PROBE — TWO BYTES
  { const { res, buf, h } = await call({ range: 'bytes=0-1' });
    expect(res.status === 206 && buf.length === 2 && sliceOk(buf, 0) && h('content-range') === 'bytes 0-1/' + SIZE && h('content-length') === '2' && h('accept-ranges') === 'bytes' && h('content-type') === 'video/webm' && h('etag') === ETAG,
      'RANGE 0-1: 206, 2 bytes, Content-Range bytes 0-1/' + SIZE + ' (status ' + res.status + ', cr ' + h('content-range') + ', len ' + buf.length + ')'); }

  // AN OPEN-ENDED TAIL, CLAMPED TO THE END
  { const { res, buf, h } = await call({ range: 'bytes=1000-' });
    expect(res.status === 206 && buf.length === SIZE - 1000 && sliceOk(buf, 1000) && h('content-range') === 'bytes 1000-4999/' + SIZE && h('content-length') === String(SIZE - 1000),
      'RANGE 1000-: 206, the tail of ' + buf.length + ' bytes from byte 1000 (cr ' + h('content-range') + ')'); }

  // AN END PAST THE FILE IS CLAMPED, NOT REFUSED
  { const { res, buf, h } = await call({ range: 'bytes=4990-99999' });
    expect(res.status === 206 && buf.length === 10 && sliceOk(buf, 4990) && h('content-range') === 'bytes 4990-4999/' + SIZE,
      'RANGE 4990-99999: 206, clamped to 4990-4999 (cr ' + h('content-range') + ', len ' + buf.length + ')'); }

  // A SUFFIX RANGE
  { const { res, buf, h } = await call({ range: 'bytes=-100' });
    expect(res.status === 206 && buf.length === 100 && sliceOk(buf, 4900) && h('content-range') === 'bytes 4900-4999/' + SIZE,
      'RANGE -100: 206, the last 100 bytes (cr ' + h('content-range') + ')'); }

  // A START PAST THE FILE IS 416
  { const { res, buf, h } = await call({ range: 'bytes=5000-' });
    expect(res.status === 416 && buf.length === 0 && h('content-range') === 'bytes */' + SIZE,
      'RANGE 5000-: 416 with Content-Range bytes */' + SIZE + ' (status ' + res.status + ', cr ' + h('content-range') + ')'); }

  // A MULTI-RANGE IS ANSWERED IN FULL (permitted; Safari never sends one)
  { const { res, buf, h } = await call({ range: 'bytes=0-1,10-11' });
    expect(res.status === 200 && buf.length === SIZE && h('accept-ranges') === 'bytes' && !h('content-range'),
      'MULTI-RANGE: 200 with the whole file, no Content-Range (status ' + res.status + ', len ' + buf.length + ')'); }

  // HEAD WITH A RANGE: THE 206 HEADERS, NO BODY
  { const { res, buf, h } = await call({ range: 'bytes=0-99' }, 'HEAD');
    expect(res.status === 206 && buf.length === 0 && h('content-range') === 'bytes 0-99/' + SIZE && h('content-length') === '100' && h('accept-ranges') === 'bytes',
      'HEAD 0-99: 206, Content-Range bytes 0-99/' + SIZE + ', Content-Length 100, no body (status ' + res.status + ', body ' + buf.length + ')'); }

  // THE CLIENT'S RANGE NEVER REACHES THE STORE
  { const { log } = await call({ range: 'bytes=0-1' });
    expect(log.length === 1 && log[0].method === 'GET' && log[0].range === null,
      'THE STORE IS ASKED ONCE, BY GET, WITHOUT THE CLIENT\'S RANGE (calls ' + log.length + ', range ' + JSON.stringify(log[0] && log[0].range) + ')'); }

  // A STALE If-Range TURNS THE REQUEST INTO A PLAIN GET; A MATCHING ONE KEEPS THE 206
  { const a = await call({ range: 'bytes=0-1', 'if-range': '"old"' });
    const b = await call({ range: 'bytes=0-1', 'if-range': ETAG });
    expect(a.res.status === 200 && a.buf.length === SIZE && b.res.status === 206 && b.buf.length === 2,
      'If-Range: a stale validator → 200 full (' + a.res.status + '/' + a.buf.length + '), the current ETag → 206 (' + b.res.status + '/' + b.buf.length + ')'); }

  // A MISS PASSES THROUGH
  { const log = [];
    const res = await worker.fetch(new Request('https://video.blendo.monster/nope.webm', { headers: { range: 'bytes=0-1' } }), { ASSETS: fakeAssets(log) });
    expect(res.status === 404, '404 FROM THE STORE PASSES THROUGH UNCHANGED (status ' + res.status + ')'); }

  // A CONDITIONAL RELOAD STILL GETS ITS 304
  { const { res, buf } = await call({ 'if-none-match': ETAG });
    expect(res.status === 304 && buf.length === 0, 'If-None-Match with the current ETag → 304 (status ' + res.status + ')'); }

  // A Cache-Control IS SET ON A 206 (the store omits it on Range requests)
  { const { h } = await call({ range: 'bytes=0-1' });
    expect(/max-age=\d+/.test(h('cache-control') || ''), 'A 206 CARRIES A Cache-Control (' + h('cache-control') + ')'); }

  console.log('\n' + pass + ' PASS, ' + fails.length + ' FAIL');
  if (fails.length) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('CRASH: ' + (e && e.stack || e)); process.exit(2); });
