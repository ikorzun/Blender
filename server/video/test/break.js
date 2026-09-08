// TWO-WAY GUARD CHECK: `node server/video/test/break.js`
// ⚠️ By the project canon a guard is NOT DELIVERED until it has been shown to GO RED on a broken
// build and to be GREEN on a healthy one. Every sabotage here hits ONE property and must bring down
// EXACTLY the assert(s) named — a sabotage that reddens somebody else's assert measures the wrong thing.
// ⚠️ The patch is checked for APPLICABILITY (the line is found exactly once): a stale sabotage would run
// over the HEALTHY build and give confident greens about nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(DIR, 'src', 'index.js'), 'utf8');
const RUN = path.join(__dirname, 'run.js');

const SABOTAGE = [
  { name: 'the end is not clamped to the file',
    find: "end = b === '' ? size - 1 : Math.min(parseInt(b, 10), size - 1);",
    repl: "end = b === '' ? size - 1 : parseInt(b, 10);",
    expect: ['GRAMMAR', 'RANGE 4990-99999'] },
  { name: 'a 206 is answered as 200 with the slice',
    find: "{ status: 206, headers });",
    repl: "{ status: 200, headers });",
    expect: ['RANGE 0-1', 'RANGE 1000-', 'RANGE 4990-99999', 'RANGE -100', 'HEAD 0-99', 'If-Range'] },
  { name: 'the client\'s Range is forwarded to the store',
    find: "for (const k of ['if-none-match', 'if-modified-since']) {",
    repl: "for (const k of ['if-none-match', 'if-modified-since', 'range']) {",
    expect: ['THE STORE IS ASKED ONCE'] },
  { name: 'a start past the file is served as a suffix instead of 416',
    find: "if (start >= size || start > end) return { invalid: true };",
    repl: "if (start >= size) start = size - 1; if (start > end) return { invalid: true };",
    expect: ['GRAMMAR', 'RANGE 5000-'] },
  { name: 'Accept-Ranges is not announced',
    find: "headers.set('Accept-Ranges', 'bytes');",
    repl: "",
    expect: ['PLAIN GET', 'RANGE 0-1', 'MULTI-RANGE', 'HEAD 0-99'] },
  { name: 'SELF-CHECK: a comment edit changes nothing',
    find: "// the store is asked for the WHOLE file, never with the client's Range (see the header);",
    repl: "// the store is asked for the whole file;",
    expect: [] },
];

function runWith(srcPath) {
  let out;
  try {
    out = execFileSync('node', [RUN], { env: Object.assign({}, process.env, srcPath ? { VIDEO_SRC: srcPath } : {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL: ')).map((l) => l.slice(6));
  const crashed = /CRASH:|SyntaxError/.test(out);
  return { fails, crashed, out };
}

let ok = true;
const healthy = runWith(null);
if (healthy.fails.length || healthy.crashed) { console.log('HEALTHY BUILD IS RED — fix run.js first:\n' + healthy.out); process.exit(1); }
console.log('healthy: green');
for (const sb of SABOTAGE) {
  const n = SRC.split(sb.find).length - 1;
  if (n !== 1) { console.log('STALE SABOTAGE (' + n + ' matches): ' + sb.name); ok = false; continue; }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vid-')), 'index.js');
  fs.writeFileSync(tmp, SRC.replace(sb.find, sb.repl));
  const r = runWith(tmp);
  if (r.crashed) { console.log('WRECKED THE BUILD: ' + sb.name); ok = false; continue; }
  const hit = sb.expect.filter((e) => r.fails.some((f) => f.startsWith(e)));
  const extra = r.fails.filter((f) => !sb.expect.some((e) => f.startsWith(e)));
  const missed = sb.expect.filter((e) => !r.fails.some((f) => f.startsWith(e)));
  const good = missed.length === 0 && extra.length === 0;
  console.log((good ? 'OK   ' : 'BAD  ') + sb.name + ' → red: [' + r.fails.map((f) => f.split(':')[0]).join(', ') + ']' + (missed.length ? ' MISSED ' + missed.join(', ') : '') + (extra.length ? ' EXTRA ' + extra.map((f) => f.split(':')[0]).join(', ') : ''));
  if (!good) ok = false;
}
console.log(ok ? '\nBREAK: every sabotage reddens exactly its own asserts' : '\nBREAK: FAILED');
process.exit(ok ? 0 : 1);
