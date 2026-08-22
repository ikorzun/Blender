// Guards of the leaderboard worker. Run: `node server/leaderboard/test/run.js`
// Assertion-based, like the game's test.js: any FAIL gives exit code 1.
// ⚠️ Every guard is verified BOTH WAYS (see the sibling file break.js):
// red on a broken build, green on a healthy one.
const fs = require('fs');
const path = require('path');
const { makeDB } = require('./d1.js');

const DIR = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');

let pass = 0; const fails = [];
function expect(cond, name) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fails.push(name); console.log('FAIL: ' + name); }
}

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sign(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
const KEY = 'a'.repeat(64);
const now = () => Math.floor(Date.now() / 1000);

async function post(worker, env, body) {
  const req = new Request('https://x/v1/score', { method: 'POST', body: JSON.stringify(body) });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, res };
}
async function score(worker, env, id, s, q, opts) {
  const t = (opts && opts.t) || now();
  const key = (opts && opts.key) || KEY;
  const sig = (opts && opts.sig) || await sign(key, id + '.' + s + '.' + q + '.' + t);
  const body = { id, n: (opts && opts.n) || 'Kingfisher', a: 7, s, q, t, sig };
  if (!opts || opts.withKey !== false) body.k = key;
  if (opts && opts.noKey) delete body.k;
  return post(worker, env, body);
}

(async () => {
  // The worker path can be substituted (the sabotage tests in break.js run a PATCHED copy).
  const src = process.env.LB_SRC
    ? require('url').pathToFileURL(process.env.LB_SRC).href : '../src/index.js';
  const worker = (await import(src)).default;
  const env = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };

  // ===== 1. THE LATEST VALUE, NOT THE MAXIMUM — this is why the table is our own =====
  // The owner: «spent your points — you dropped down the list». The platform's server cannot do that.
  await score(worker, env, 'gid1aaaaaa01', 500, 1);
  const row0 = await env.DB.prepare('SELECT s FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  // shift the rate window back so that the second write goes through
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const down = await score(worker, env, 'gid1aaaaaa01', 300, 2);
  const row1 = await env.DB.prepare('SELECT s FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  expect(row1.s === 300 && down.json.ok === 1,
    'DROP PRESERVED: we write the LATEST, not the maximum (' + row0.s + ' -> ' + row1.s + ')');

  // ===== 2. THE SCORE IS WRITTEN AS SENT, THE ROW STAYS VISIBLE =====
  // ⚠️ There used to be the opposite guard here («growth above the ceiling is clamped silently»).
  // The ceiling was removed by the owner's decision on 2026-08-09, and this assert states the NEW
  // behaviour: the server does not argue with the client about the number and hides nobody itself.
  // ⚠️ TWO SIGNS, NOT ONE: «the value is stored» catches the return of clamping,
  // «f === 0» — the return of auto-hiding. These are different mechanisms, and they died
  // separately: either one of them can be brought back on its own.
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const grow = await score(worker, env, 'gid1aaaaaa01', 999999999, 3);
  const row2 = await env.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  expect(grow.json.ok === 1 && row2.s === 999999999 && grow.json.s === 999999999 && row2.f === 0,
    'SCORE AS IS: the billion is stored without clamping and the row is not hidden (s '
    + row2.s + ', f ' + row2.f + ')');

  // ===== 3. The key of an existing row is NOT overwritten =====
  // Otherwise anyone could send their own k and take over someone else's row.
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const evil = 'b'.repeat(64);
  const t3 = now();
  const stolen = await post(worker, env, { id: 'gid1aaaaaa01', n: 'Hacker', a: 1, s: 100, q: 99, t: t3,
    k: evil, sig: await sign(evil, 'gid1aaaaaa01.100.99.' + t3) });
  expect(stolen.status === 401,
    'FOREIGN KEY REJECTED: the signature is checked against the STORED key (' + stolen.status + ')');

  // ===== 4. Idempotent repeat: q did not grow =====
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const dup = await score(worker, env, 'gid1aaaaaa01', 777, 1);
  expect(dup.status === 409 && dup.json && dup.json.dup === 1 && typeof dup.json.s === 'number',
    'REPEATED q — 409 with the STORED state, not an error (' + dup.status + ')');

  // ===== 5. Rate =====
  // ⚠️ First a SUCCESSFUL write (it is the one that sets `u = now`), and only then
  // the second one. The first version of the guard came right after the «repeated q», and that one
  // does not touch `u` — the window stayed open, and the assert measured not the rate but my own
  // setup (it got 200 and would have been green with the limit removed).
  const okWrite = await score(worker, env, 'gid1aaaaaa01', 800, 4);
  const rate = await score(worker, env, 'gid1aaaaaa01', 810, 5);
  expect(okWrite.status === 200, 'RATE: the preparatory write went through (sanity check)');
  expect(rate.status === 429 && rate.json && typeof rate.json.s === 'number',
    'RATE: more often than 20 s — 429, the body is non-empty (' + rate.status + ')');
  // ⚠️ `retry` is LOAD-BEARING: by it the client postpones its submission and does NOT keep a copy
  // of our `RATE_SEC` on its own side. We assert BOUNDS, not a number: the preparatory
  // write went through a moment earlier, so almost the whole window is left to wait, but
  // comparing against the literal 20 is not allowed — that would be the same copy of the constant,
  // only inside the guard (a law this project got burned by four times in one session).
  expect(typeof rate.json.retry === 'number' && rate.json.retry > 0
    && rate.json.retry <= worker._internals.RATE_SEC
    && rate.json.retry >= worker._internals.RATE_SEC - 2,
    'RATE: the 429 says HOW LONG to wait (retry ' + rate.json.retry
    + ' with a window of ' + worker._internals.RATE_SEC + ')');

  // ===== 6. The client's clock =====
  const skew = await score(worker, env, 'gid1aaaaaa02', 100, 1, { t: now() - 4000 });
  expect(skew.status === 400 && skew.json.err === 'skew', 'CLOCK: a skew of >300 s is rejected');

  // ===== 7. First submission without a key =====
  const t7 = now();
  const nokey = await post(worker, env, { id: 'gid1aaaaaa03', n: 'Otter', a: 2, s: 10, q: 1, t: t7,
    sig: await sign(KEY, 'gid1aaaaaa03.10.1.' + t7) });
  expect(nokey.status === 400 && nokey.json.err === 'nokey',
    'A NEW ROW WITHOUT A KEY is not created');

  // ===== 8-9. A row hidden BY HAND does not get into the public table =====
  // ⚠️ There is no automatic hiding any more — the only source of the `f` flag
  // is `/admin/hide` (the owner's decision of 2026-08-09). That is why we hide the row
  // the REAL way, through the endpoint, instead of slipping `f` straight into the INSERT:
  // otherwise the guard would be checking the snapshot's selection, not the hiding mechanics.
  const env3 = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };
  const ins = (id, name, sc, ageSec, lastSec) => env3.DB._raw
    .prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
    .run(id, KEY, name, 1, sc, now() - lastSec, 1, now() - ageSec);
  ins('gid1honest01', 'Honest', 5000, 100000, 100);   // has been playing for a long time, the row is old
  ins('gid1cheat001', 'Cheater', 1000, 30, 30);       // a moderator will hide him
  const hidReq = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1cheat001' }) }), env3);
  const ch = await env3.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1cheat001').first();
  expect(hidReq.status === 200 && ch.f > 0,
    'MANUAL HIDE flagged the row (HTTP ' + hidReq.status + ', f=' + ch.f + ')');

  await worker._internals.buildSnapshot(env3);
  const top3 = JSON.parse((await env3.DB.prepare('SELECT v FROM snap WHERE k=?').bind('top').first()).v);
  const names3 = (top3.r || []).map((r) => r[0]);
  // ⚠️ SANITY CHECK: the hidden one's name must SURVIVE until the snapshot. Once the guard below
  // was already a tautology for this very reason — the test itself renamed the row with its own
  // submission (the UPDATE writes the name that was sent), and «Cheater» would never have been found.
  // There is no submission before the snapshot any more, but the sanity check is kept: it guards the assert
  // from turning into an empty one again.
  expect((await env3.DB.prepare('SELECT n FROM p WHERE id=?').bind('gid1cheat001').first()).n === 'Cheater',
    'SANITY CHECK: the cheater\'s row is still called Cheater');
  expect(names3.includes('Honest') && !names3.includes('Cheater'),
    'THE HONEST ONE IS IN THE TABLE, THE HIDDEN ONE IS NOT (' + JSON.stringify(names3) + ')');

  env3.DB._raw.exec("UPDATE p SET u = u - 60 WHERE id='gid1cheat001'");
  const seen = await score(worker, env3, 'gid1cheat001', 900, 3, { n: 'Cheater' });
  // ⚠️ We assert the SHAPE, not the type of `rank`: on a base of fewer than a hundred players the honest
  // estimate is `null` (see estimateRank), and «typeof number» would go red on
  // a HEALTHY build. The property here is a different one: the hidden one is answered exactly like everyone.
  expect(seen.status === 200 && seen.json && seen.json.ok === 1
    && 'rank' in seen.json && seen.json.exact === 0,
    'THE HIDDEN ONE IS ANSWERED LIKE EVERYONE (he must not learn that he was caught; rank '
    + JSON.stringify(seen.json.rank) + ')');

  // ⚠️ THE «HONEST RETURNER» GUARD WAS DELETED TOGETHER WITH THE MECHANIC, not weakened.
  // It checked that a clean submission CLEARS the automatic flag: the age
  // ceiling measured the age of the ROW, not of the player, and someone who came back after clearing the cache
  // got hidden for nothing. The whole path was removed — both the disease and the cure.
  // ⛔ Do not restore it «to fit the new behaviour»: clearing the flag by a submission would now
  // mean that someone hidden BY HAND brings himself back with his very first win.

  // ===== 10. The ladder and the rank estimate =====
  // ⚠️⚠️ THE ESTIMATE IS THE BOUND «NO BETTER THAN N», NOT A RANK, and `null` is a legitimate answer here.
  // TWO cases where there is no bound, and BOTH used to return a confident one:
  //   • the ladder is empty (fewer than a hundred players in the table — that is, the first weeks
  //     after launch, exactly when the table is being looked at);
  //   • the score is above the first step: all that is known is «somewhere in the first hundred».
  // The first was found by a live run of the client, the second would have survived a fix of the first.
  const est = worker._internals.estimateRank;
  expect(est([], 1000) === null && est(null, 1000) === null,
    'ESTIMATE: an empty ladder answers null, not «rank 1» to everyone');
  expect(est([900, 800, 700], 1000) === null && est([900, 800, 700], 850) === 100
      && est([900, 800, 700], 650) === 300,
    'ESTIMATE: above the first step — null, below it — a monotone bound (100/300)');
  // ⚠️ AND A LIVE MEASUREMENT, not only the pure function: the server's real answer on
  // a small base must carry `null`. Without it the guard would be checking the formula, and
  // not what actually goes out to the client.
  expect(grow.json.rank === null && grow.json.exact === 0,
    'LIVE ANSWER on a base of fewer than a hundred: rank ' + JSON.stringify(grow.json.rank)
    + ' with exact ' + grow.json.exact);

  // ===== 11. /top — from the snapshot, with a cache =====
  const topRes = await worker.fetch(new Request('https://x/v1/top?p=1'), env3);
  const topJson = JSON.parse(await topRes.text());
  expect(topRes.headers.get('cache-control') === 'public, max-age=60' && topJson.r.length > 0,
    '/top: served from the snapshot with a cache header (rows ' + topJson.r.length + ')');
  // There is no snapshot yet (cron has not run) — we return an empty but HONESTLY marked
  // answer, and with a short cache, rather than a 500: the table never breaks the game.
  const coldRes = await worker.fetch(new Request('https://x/v1/top?p=1'), { DB: makeDB(SCHEMA) });
  const cold = JSON.parse(await coldRes.text());
  expect(coldRes.status === 200 && cold.stale === 1 && cold.r.length === 0,
    '/top WITHOUT a snapshot: an empty answer with a marker, not an error');

  // ===== 12. /me: the exact rank and the neighbours =====
  const env2 = { DB: makeDB(SCHEMA) };
  const base = now() - 10000;
  for (let i = 1; i <= 12; i++) {
    env2.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
      .run('gid1user' + String(i).padStart(4,'0'), KEY, 'N' + i, 1, 1000 - i * 10, base + i, 1, base);
  }
  // ⚠️⚠️ WE BUILD THE SNAPSHOT WITH THE REAL BUILDER instead of slipping in an empty array:
  // the dispatcher asked to confirm BY MEASUREMENT that with a base of fewer than a hundred players
  // the ladder comes out EMPTY (it takes every hundredth rank), and that the exact rank
  // in this branch (`bound === null`, a full recount over the live table) is computed
  // correctly. The order is as in production: first cron assembled the snapshot, then the player came.
  await worker._internals.buildSnapshot(env2);
  const ladSteps = JSON.parse((await env2.DB.prepare('SELECT v FROM snap WHERE k=?')
    .bind('ladder').first()).v);
  const tMe = now();
  const meRes = await worker.fetch(new Request('https://x/v1/me?id=gid1user0005&t=' + tMe
    + '&sig=' + await sign(KEY, 'gid1user0005.me.' + tMe)), env2);
  const me = JSON.parse(await meRes.text());
  expect(me.ok === 1 && me.rank === 5 && me.exact === 1 && ladSteps.length === 0
    && me.up.length === 4 + 1 - 1 + 1 - 1,
    '/me: the exact rank is correct WITH AN EMPTY LADDER — 12 players give 0 steps '
    + '(rank ' + me.rank + ', steps ' + ladSteps.length + ')');
  expect(me.up.length === 4 && me.dn.length === 5,
    '/me: neighbours above/below (' + me.up.length + ' / ' + me.dn.length + ')');
  expect(me.up[me.up.length - 1][2] === 1000 - 4 * 10,
    '/me: the nearest one above is exactly the previous rank (' + me.up[me.up.length - 1][2] + ')');

  // ===== 13. Deleting one's own row =====
  const tD = now();
  const delRes = await worker.fetch(new Request('https://x/v1/me?id=gid1user0005&t=' + tD
    + '&sig=' + await sign(KEY, 'gid1user0005.del.' + tD), { method: 'DELETE' }), env2);
  const gone = await env2.DB.prepare('SELECT id FROM p WHERE id=?').bind('gid1user0005').first();
  expect(delRes.status === 200 && gone === null, 'DELETE /me: the row is deleted');
  const badDel = await worker.fetch(new Request('https://x/v1/me?id=gid1user0006&t=' + tD
    + '&sig=' + 'c'.repeat(64), { method: 'DELETE' }), env2);
  expect(badDel.status === 401, 'DELETE /me: without a valid signature — 401');

  // ===== 14. The response body is ALWAYS non-empty JSON =====
  // The bridge's transport reads r.json() without checking r.ok — an empty body
  // arrives as a failure, which is why we never have empty responses anywhere.
  const r404 = await worker.fetch(new Request('https://x/nope'), env);
  const t404 = await r404.text();
  const rOpt = await worker.fetch(new Request('https://x/v1/me', { method: 'OPTIONS' }), env);
  expect(r404.status === 404 && t404.length > 2 && JSON.parse(t404).err === 'route',
    'ANY answer is non-empty JSON (the 404 too)');
  expect(rOpt.status === 204 && rOpt.headers.get('access-control-allow-methods'),
    'OPTIONS: the preflight is served (needed only for DELETE)');

  // ===== 15. CORS: a simple request, without custom headers =====
  expect(topRes.headers.get('access-control-allow-origin') === '*'
      && (topRes.headers.get('content-type') || '').startsWith('text/plain'),
    'CORS: text/plain + ACAO:* — the request is «simple», no preflight needed');

  // ===== 16. MANUAL HIDING SURVIVES A CLEAN SUBMISSION =====
  // The manual tier is the last step and the only remedy against griefing
  // (the name comes from the client). If a clean submission cleared it too, someone hidden
  // by hand would bring himself back with his very first win.
  const envA = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };
  envA.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
    .run('gid1grief001', KEY, 'Grief', 1, 5000, now() - 600, 1, now() - 100000);
  const hid = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1grief001' }) }), envA);
  const afterHide = await envA.DB.prepare('SELECT f FROM p WHERE id=?').bind('gid1grief001').first();
  await score(worker, envA, 'gid1grief001', 5200, 2, { n: 'Grief' });   // ordinary growth
  const afterClean = await envA.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1grief001').first();
  expect(hid.status === 200 && afterHide.f > 0 && afterClean.f > 0 && afterClean.s === 5200,
    'MANUAL HIDE survives a clean submission (f ' + afterHide.f + ' -> ' + afterClean.f + ')');
  await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1grief001', show: 1 }) }), envA);
  const back = await envA.DB.prepare('SELECT f FROM p WHERE id=?').bind('gid1grief001').first();
  expect(back.f === 0, 'MANUAL RESTORE works (f=' + back.f + ')');
  const noAuth = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    body: JSON.stringify({ id: 'gid1grief001' }) }), envA);
  expect(noAuth.status === 401, 'admin/hide without a token — 401');

  // ===== 17. A DEEP RANK ON 50 000 ROWS =====
  // ⚠️ The seed from the spec, and it is also the ONLY guard of the ladder: the path «through
  // the bucket» is not executed at all on a small base (there is no snapshot, bound=null),
  // and it is exactly there that the off-by-one lived — a player exactly on the bucket boundary
  // was counted twice, and everyone below the hundredth rank saw a rank 1 worse.
  const envB = { DB: makeDB(SCHEMA) };
  const N = 50000, base0 = now() - 200000;
  envB.DB._raw.exec('BEGIN');
  const st = envB.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)');
  for (let i = 0; i < N; i++) st.run('gidseed' + String(i).padStart(6, '0'), KEY, 'P' + i, 1,
    N - i, base0 + i, 1, base0);          // the score is unique: the true rank = i+1
  envB.DB._raw.exec('COMMIT');
  const t0 = Date.now();
  const snapB = await worker._internals.buildSnapshot(envB);
  const ladderB = JSON.parse((await envB.DB.prepare('SELECT v FROM snap WHERE k=?').bind('ladder').first()).v);
  expect(ladderB.length === N / 100 && snapB.top === 100,
    'LADDER on 50 000: ' + ladderB.length + ' steps, top ' + snapB.top
    + ', snapshot in ' + (Date.now() - t0) + ' ms');

  const probes = [1, 100, 101, 25037, 49999];
  const got = [];
  for (const rank of probes) {
    const id = 'gidseed' + String(rank - 1).padStart(6, '0');
    const tq = now();
    const r = await worker.fetch(new Request('https://x/v1/me?id=' + id + '&t=' + tq
      + '&sig=' + await sign(KEY, id + '.me.' + tq)), envB);
    got.push(JSON.parse(await r.text()).rank);
  }
  expect(JSON.stringify(got) === JSON.stringify(probes),
    'THE EXACT RANK matches the true one at every depth (' + got.join(',') + ' against '
    + probes.join(',') + ')');

  // ===== 18. /top DOES NOT FALL OVER WHEN THE DATABASE GOES SILENT =====
  // Rule number one of the spec: the table is decoration, it does not block the game.
  const envDead = { DB: { prepare() { throw new Error('D1 unavailable'); } } };
  const deadRes = await worker.fetch(new Request('https://x/v1/top?p=1'), envDead);
  const dead = JSON.parse(await deadRes.text());
  expect(deadRes.status === 200 && dead.stale === 1,
    '/top with the database down: 200 with a marker, not 503 (' + deadRes.status + ')');

  console.log('\nTOTAL PASS: ' + pass + (fails.length ? ' | FAIL: ' + fails.length : ''));
  if (fails.length) { console.log('SUITE: FAIL — ' + fails.join(' || ')); process.exit(1); }
  console.log('SUITE: PASS');
})().catch((e) => { console.error('THE RUN FAILED:', e && e.stack || e); process.exit(1); });
