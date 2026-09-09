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
  // 4, not 3, since 2026-09-09-g: the crawler section reads og.jpg's day of cache as well
  ['the cache policy dropped', "res.headers.set('Cache-Control', STATIC_DAY.test(url.pathname) ? 'public, max-age=86400' : 'no-cache');", "", 4],
  ['the redirect loses the path', "url.hostname = APEX; url.protocol = 'https:'; url.port = '';", "url.hostname = APEX; url.protocol = 'https:'; url.port = ''; url.pathname = '/'; url.search = '';", 2],
  // the crawler card (2026-09-09-g): four ways to get it wrong, each reddening its own arms
  ['the crawler shortcut dropped (Telegram swallows the build again)', "if (DOC.test(url.pathname) && PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {", "if (false) {", 3],
  ['the shortcut ignores the path (the picture becomes the card too)', "DOC.test(url.pathname) && ", "", 2],
  ['the shortcut ignores the user-agent (a player is served the card)', "PREVIEW_BOT.test(request.headers.get('user-agent') || '')", "true", 5],
  ['Vary: User-Agent dropped (a shared cache would mix the two documents)', "        r.headers.set('Vary', 'User-Agent');   // one URL, two documents: the shared cache must not mix them\n", "", 1],
  ['a missing card answered instead of falling through to the build', "if (card.status === 200) {", "if (true) {", 1],
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
