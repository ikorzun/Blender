// PERMANENT LOCAL TEST STAND for the leaderboard — for developing the client and the
// screen, while the production worker is not deployed yet.
//
//   node server/leaderboard/test/dev-serve.js
//   node server/leaderboard/test/dev-serve.js --port=8788 --seed=24
//
// The same `src/index.js` on top of `node:sqlite`, lives until Ctrl-C. On start it
// seeds the database and BUILDS A SNAPSHOT, so `/v1/top` returns a non-empty list
// right away — there is something to check the list layout on from the first second.
//
// ⚠️⚠️ THE SERVICE ROUTES `/_dev/*` LIVE HERE, AND NOT IN `src/index.js`.
// We do not touch the production worker on the eve of a one-off visit to someone
// else's account — for the same reason `/admin/snap` was postponed. The stand
// intercepts them BEFORE the worker is reached, the product knows nothing of them at all.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { makeDB } = require('./d1.js');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
};
const PORT = Number(opt('port', 8788));          // 8779 — the game preview, 8787 — wrangler
const SEED_N = args.includes('--no-seed') ? 0 : Number(opt('seed', 24));

const DIR = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
const KEY = 'a'.repeat(64);                       // shared key of the seed rows, see below
const nowSec = () => Math.floor(Date.now() / 1000);

// Names from the same series as `GUEST_NAMES` in the game: the list must look
// real, otherwise the layout is checked against "P1/P2/P3" and breaks on live
// long names.
const NAMES = ['Kingfisher', 'Otter', 'Aquamarine Guppy', 'Peregrine', 'Marmot',
  'Puffin', 'Ocelot', 'Snowy Owl', 'Axolotl', 'Ibis', 'Capybara', 'Lynx',
  'Hummingbird', 'Pangolin', 'Narwhal', 'Meerkat', 'Quokka', 'Tapir',
  'Wolverine', 'Sandpiper', 'Fennec', 'Manatee', 'Osprey', 'Jerboa'];

function seed(env, n) {
  const t0 = nowSec() - 200000;
  const st = env.DB._raw.prepare(
    'INSERT OR REPLACE INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,?)');
  env.DB._raw.exec('BEGIN');
  for (let i = 0; i < n; i++) {
    // a score with a spread of orders of magnitude — the list must have both 5 digits and 2:
    // on an even row it is not visible how the layout holds long numbers
    const s = Math.round(90000 / Math.pow(1.35, i)) + (i * 7 % 13);
    st.run('gidseed' + String(i).padStart(6, '0'), KEY, NAMES[i % NAMES.length],
      (i % 49) + 1, s, t0 + i * 60, 1, t0, 0);
  }
  // ⚠️ One HIDDEN row: the screen must not show it, and that can be checked
  // only if it is present in the database.
  st.run('gidseedhidden', KEY, 'ShouldNotAppear', 1, 999999, t0, 1, t0, 2);  // 2 = exactly what /admin/hide writes
  env.DB._raw.exec('COMMIT');
}

(async () => {
  const worker = (await import(require('url').pathToFileURL(
    path.join(DIR, 'src', 'index.js')).href)).default;
  const env = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'dev' };

  const snap = async () => worker._internals.buildSnapshot(env);
  const count = () => env.DB._raw.prepare('SELECT COUNT(*) c FROM p').get().c;

  if (SEED_N > 0) { seed(env, SEED_N); await snap(); }

  const json = (rs, obj, status) => {
    rs.writeHead(status || 200, {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    rs.end(JSON.stringify(obj));
  };

  const srv = http.createServer(async (rq, rs) => {
    const u = new URL(rq.url, 'http://local');

    // ===== service routes of the STAND (they do not exist in the product) =====
    if (u.pathname.startsWith('/_dev/')) {
      if (rq.method === 'OPTIONS') {
        rs.writeHead(204, { 'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type' });
        return rs.end();
      }
      try {
        if (u.pathname === '/_dev/snap') {
          // ⚠️ WITHOUT THIS THE STAND IS USELESS: in production the snapshot is baked by cron once an hour,
          // locally there is no cron at all — the screen would forever see the yellow empty
          // state, and that would read as "the client is broken".
          const r = await snap();
          return json(rs, { ok: 1, top: r.top, ladder: r.ladder });
        }
        if (u.pathname === '/_dev/seed') {
          const n = Number(u.searchParams.get('n') || SEED_N || 24);
          seed(env, n); await snap();
          return json(rs, { ok: 1, seeded: n, rows: count() });
        }
        if (u.pathname === '/_dev/rewind') {
          // ⚠️ WHY: the rate window is 20 s — every second submit from one id
          // gives a 429, and screen development stalls out of nowhere.
          // ⛔ THE SECOND REASON DIED TOGETHER WITH THE MECHANIC. Here stood a
          // warning about the age ceiling ("a fresh row is allowed
          // ~2000, above that we hide it from the common table"), and it was the most valuable
          // text of the file: from the outside it looked like "the row is gone, the client
          // is broken". The ceiling was removed by the owner's decision 2026-08-09 — I remove
          // the warning too, so that the next one does not hunt a non-existent illness.
          // `c` is still rewound: let the row look grown-up.
          const sec = Math.max(60, Number(u.searchParams.get('sec') || 3600));
          env.DB._raw.prepare('UPDATE p SET u = u - ?, c = c - ?').run(sec, sec);
          return json(rs, { ok: 1, sec,
            note: 'row clocks rewound: opens the rate window (20 s) ahead of time' });
        }
        if (u.pathname === '/_dev/reset') {
          env.DB._raw.exec('DELETE FROM p; DELETE FROM snap;');
          return json(rs, { ok: 1, rows: 0 });
        }
        if (u.pathname === '/_dev/state') {
          const top = await worker.fetch(new Request('http://local/v1/top?p=1'), env);
          return json(rs, { rows: count(), top: JSON.parse(await top.text()) });
        }
      } catch (e) { return json(rs, { err: String(e && e.message || e) }, 500); }
      return json(rs, { err: 'no such service route' }, 404);
    }

    // ===== everything else — the PRODUCTION worker, without a single concession =====
    const chunks = []; for await (const c of rq) chunks.push(c);
    const req = new Request('http://local' + rq.url, {
      method: rq.method, headers: rq.headers,
      body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks),
    });
    const res = await worker.fetch(req, env);
    rs.writeHead(res.status, Object.fromEntries(res.headers));
    rs.end(Buffer.from(await res.arrayBuffer()));
  });

  srv.listen(PORT, () => {
    const base = 'http://127.0.0.1:' + PORT;
    console.log('LEADERBOARD TEST STAND: ' + base);
    console.log('rows in the database: ' + count() + ' (one of them is HIDDEN — it must not be in the top)');
    console.log('');
    console.log('  prod:      POST ' + base + '/v1/score');
    console.log('             GET  ' + base + '/v1/top?p=1');
    console.log('             GET  ' + base + '/v1/me?id=…&t=…&sig=…');
    console.log('             DEL  ' + base + '/v1/me?id=…&t=…&sig=…');
    console.log('  stand:     POST ' + base + '/_dev/snap     — build the snapshot (in production this is cron once an hour)');
    console.log('             POST ' + base + '/_dev/seed?n=24 — reseed the list');
    console.log('             POST ' + base + '/_dev/rewind?sec=3600 — age the rows: it also lifts the rate');
  console.log('                                            window ahead of time');
    console.log('             POST ' + base + '/_dev/reset     — clear');
    console.log('             GET  ' + base + '/_dev/state     — what is now in the database and in the top');
    console.log('');
    console.log('⚠️ The database is IN MEMORY: restarting the stand = a fresh seed. Ctrl-C — stop.');
    console.log('⚠️ The /_dev/* routes are NOT in the production worker and never will be — this is the stand.');
  console.log('');
  console.log('⚠️ THE SCORE IS ACCEPTED AS SENT: the trust ceiling and the auto-hiding are');
  console.log('     GONE (decision of the owner 2026-08-09). A row disappears from the common table');
  console.log('     only through a manual /admin/hide — there is one such in the seed, ShouldNotAppear');
  console.log('     with the score 999999: if you saw it in the top, the f = 0 filter is broken.');
  console.log('⚠️ The only 429 response that is left is the 20 s rate window.');
  });
})();
