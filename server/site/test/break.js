// TWO-SIDED PROOF of the site worker's guards (the video worker's pattern): each sabotage is applied to a
// COPY of src/index.js under the system temp dir (the tree never carries a sabotage), the anchor must
// match exactly once (a stale sabotage is reported, never skipped), run.js is run against the copy, and
// the guard(s) that go red are printed. A self-check (a comment edit) must redden nothing.
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const SRC = path.join(__dirname, '..', 'src', 'index.js');
const RUN = path.join(__dirname, 'run.js');
const CASES = [
  ['self-check: a comment edit', "// THE SITE WORKER — blendo.monster (2026-09-09-c, the crawler card 2026-09-09-g).", "// THE SITE WORKER — blendo.monster (2026-09-09-c, the crawler card 2026-09-09-g). (an empty sabotage)", 0],
  ['the www/http redirect dropped', "if (url.hostname === WWW || (url.hostname === APEX && url.protocol === 'http:')) {", "if (false) {", 3],
  // 5, not 4, since 2026-09-09-g: the crawler section asks the music with a Range under a bot user-agent too
  ['the media not delegated to the slicer (200 to a Range)', "if (MEDIA.test(url.pathname)) return film.fetch(request, env);", "", 5],
  // 5, not 6, since 2026-09-09-k: the DOCUMENT no longer passes through this line — its shortcut sets its
  // own `no-cache` beside the ETag — so the html arm stays green and the image, the bridge, the crawler and
  // the two PWA arms go red. (It was 4 before the PWA files existed, and 6 before the document's validator.)
  ['the cache policy dropped', "res.headers.set('Cache-Control', STATIC_DAY.test(url.pathname) ? 'public, max-age=86400' : 'no-cache');", "", 5],
  // the document's validator (2026-09-09-k): three ways to get it wrong, each reddening its own arms
  // 4, not 3: without the shortcut the STALE-tag arm goes red too — the client's If-None-Match reaches the
  // store, its 304 is passed through, and that empty body is what a browser would render as the game.
  ['the document validator dropped (every load re-downloads 4.5 MB)', "if (DOC.test(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {", "if (false) {", 4],
  ["the client's If-None-Match forwarded to the store (an empty page for a stale tag)", "const up = await env.ASSETS.fetch(new Request(url.toString(), { method: request.method }));", "const up = await env.ASSETS.fetch(request);", 1],
  ['the weak-ETag comparison dropped (a compressed edge weakens the tag and the 304 stops matching)', "t.trim().replace(/^W\\//, '')", "t.trim()", 1],
  ['the redirect loses the path', "url.hostname = APEX; url.protocol = 'https:'; url.port = '';", "url.hostname = APEX; url.protocol = 'https:'; url.port = ''; url.pathname = '/'; url.search = '';", 2],
  // the crawler card (2026-09-09-g): four ways to get it wrong, each reddening its own arms
  ['the crawler shortcut dropped (Telegram swallows the build again)', "if (DOC.test(url.pathname) && PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {", "if (false) {", 3],
  // ⚠️ THE ANCHOR CARRIES `PREVIEW_BOT` SINCE 2026-09-09-k: two shortcuts test DOC now (the card's and the
  // document's validator), and the bare `DOC.test(url.pathname) && ` matched both — the tool said STALE
  // rather than patching one at random, which is what it is for.
  ['the shortcut ignores the path (the picture becomes the card too)', "DOC.test(url.pathname) && PREVIEW_BOT", "PREVIEW_BOT", 2],
  // 10, not 5, since 2026-09-09-k: the card shortcut stands BEFORE the document's validator, so «everyone is
  // a bot» replaces the document everywhere — 2 arms that expect the build at `/`, 3 crawler arms that expect
  // a NON-bot to get the build, and all 5 DOC-ETAG arms.
  ['the shortcut ignores the user-agent (a player is served the card)', "PREVIEW_BOT.test(request.headers.get('user-agent') || '')", "true", 10],
  ['Vary: User-Agent dropped (a shared cache would mix the two documents)', "        r.headers.set('Vary', 'User-Agent');   // one URL, two documents: the shared cache must not mix them\n", "", 1],
  ['a missing card answered instead of falling through to the build', "if (card.status === 200) {", "if (true) {", 1],
  // the manifest's type (2026-09-09-h): forced here because the assets store need not know `.webmanifest`
  ["the manifest's type not forced (a browser gets octet-stream)", "if (url.pathname.endsWith('.webmanifest')) res.headers.set('Content-Type', 'application/manifest+json');", "", 1],
];
const base = fs.readFileSync(SRC, 'utf8');
let bad = 0;
for (const [name, find, repl, expectRed] of CASES) {
  const n = base.split(find).length - 1;
  if (n !== 1) { console.log('STALE SABOTAGE (' + n + ' anchors): ' + name); bad++; continue; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blendo-site-break-'));
  // the copy must keep its RELATIVE import of the video worker: rebuild the same folder shape beside it
  const copySrc = path.join(dir, 'server', 'site', 'src'); fs.mkdirSync(copySrc, { recursive: true });
  fs.cpSync(path.join(__dirname, '..', '..', 'video', 'src'), path.join(dir, 'server', 'video', 'src'), { recursive: true });
  fs.writeFileSync(path.join(copySrc, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(copySrc, 'index.js'), base.replace(find, repl));
  const r = spawnSync(process.execPath, [RUN], { env: { ...process.env, SITE_WORKER: path.join(copySrc, 'index.js') }, encoding: 'utf8' });
  const red = (r.stdout.match(/^FAIL: /gm) || []).length;
  const ok = red === expectRed;
  console.log((ok ? 'OK  ' : 'BAD ') + name + ': ' + red + ' red (expected ' + expectRed + ')' + (red ? ' — ' + (r.stdout.match(/^FAIL: [^:(]*/gm) || []).map(s => s.slice(6).trim()).join(' | ') : ''));
  if (!ok) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(bad ? 'SITE BREAK: FAIL (' + bad + ')' : 'SITE BREAK: PASS');
process.exit(bad ? 1 : 0);
