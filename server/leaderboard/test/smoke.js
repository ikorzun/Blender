// LIVE SMOKE TEST of the deployed leaderboard worker.
//
//   node server/leaderboard/test/smoke.js --local          — against a local copy
//   node server/leaderboard/test/smoke.js https://lb.…/    — against the production worker
//
// Exit codes: 0 — all green; 1 — the contract is violated; 2 — a YELLOW outcome,
// the snapshot has not been built yet, a REPEAT run after the hourly tick is needed.
//
// ⚠️ WHY A SCRIPT AND NOT A LIST IN THE DOCS: nobody executes a prose checklist, and
// on the day access is granted it turns out that half the steps are not executable. `--local`
// brings the worker up on top of `node:sqlite` and runs THE SAME scenario.
//
// ⚠️⚠️ THE SMOKE TEST WRITES INTO THE PRODUCTION TABLE. It cleans up after itself in three ways (the normal
// finish, `finally`, catching SIGINT/SIGTERM), but THERE IS NO GUARANTEE: `finally` does not
// run on a hard kill of the process, on a power loss, or on a network failure
// on the DELETE itself. That is why the id is printed as the FIRST line BEFORE the row is created —
// so that there is something to clean it up with by hand (the command is in the README).
const http = require('http');
const path = require('path');

const arg = process.argv[2] || '--local';
const LOCAL = arg === '--local';
const TIMEOUT_MS = 10000;      // ⚠️ without it undici waits up to 300 s
const SNAP_MAX_AGE = 7200;     // the snapshot is built by cron once an hour; two hours — the margin
const RATE_WAIT_MS = 21000;    // the rate window of 20 s + a second for the road

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sign(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

let pass = 0; const fails = []; const warns = [];
function check(ok, name, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fails.push(name); console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
}
function yellow(name, detail) {
  warns.push(name); console.log('  🟡 ' + name + (detail ? '  — ' + detail : ''));
}

// ===== the local stand: the same worker on top of node:sqlite =====
async function startLocal() {
  const fs = require('fs');
  const { makeDB } = require('./d1.js');
  const dir = path.join(__dirname, '..');
  // The path to the worker is substituted in the sabotage tests (break.js, phase 2).
  const srcFile = process.env.LB_SRC || path.join(dir, 'src', 'index.js');
  const worker = (await import(require('url').pathToFileURL(srcFile).href)).default;
  const env = { DB: makeDB(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')), ADMIN_TOKEN: 'smoke' };
  const srv = http.createServer(async (rq, rs) => {
    const chunks = []; for await (const c of rq) chunks.push(c);
    const req = new Request('http://local' + rq.url, {
      method: rq.method, headers: rq.headers,
      body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks),
    });
    const res = await worker.fetch(req, env);
    rs.writeHead(res.status, Object.fromEntries(res.headers));
    rs.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise((r) => srv.listen(0, r));
  // ⚠️ WE DELIBERATELY DO NOT BUILD THE SNAPSHOT HERE: the local run must pass through
  // the YELLOW state «there is no snapshot yet» — otherwise the new freshness check
  // is not executed locally at all and is delivered not as a guard, but as a description.
  return { base: 'http://127.0.0.1:' + srv.address().port, worker, env, stop: () => srv.close() };
}

const withTimeout = (opts) => Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, opts || {});
const jget = async (u) => {
  const r = await fetch(u, withTimeout());
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t, headers: r.headers };
};
const jpost = async (u, body) => {
  const r = await fetch(u, withTimeout({ method: 'POST', body: JSON.stringify(body) }));
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t };
};

// ===== the cleanup: three paths, and none of them gives a guarantee — that is why the id is visible right away =====
let cleanup = null, cleaned = false;
async function doCleanup(reason) {
  if (cleaned || !cleanup) return; cleaned = true;
  try { await cleanup(); console.log('\n[cleanup: the row is deleted, ' + reason + ']'); }
  catch (e) { console.log('\n⚠️ THE CLEANUP FAILED (' + reason + '): ' + (e && e.message)
    + ' — delete the row by hand, the id is printed above'); }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await doCleanup(sig); process.exit(130); });
}

(async () => {
  let local = null, base = arg;
  if (LOCAL) { local = await startLocal(); base = local.base; }
  base = base.replace(/\/+$/, '');

  const id = 'smoke' + rnd(5);            // 15 characters — the format of the production Save.gid
  const key = rnd(32);
  // ⚠️ AS THE FIRST LINE AND BEFORE THE ROW IS CREATED: if the run is killed hard, this is
  // the only thing left to clean up after ourselves with.
  console.log('LEADERBOARD SMOKE TEST: ' + base);
  console.log('the id of this run: ' + id + '   (if it breaks off — see the manual cleanup in the README)\n');

  const send = async (s, q, opts) => {
    const t = (opts && opts.t) || nowSec();
    const sig = (opts && opts.badSig) ? rnd(32) : await sign(key, id + '.' + s + '.' + q + '.' + t);
    const body = { id, n: 'SMOKE', a: 1, s, q, t, sig };
    if (!(opts && opts.noKey)) body.k = key;
    return jpost(base + '/v1/score', body);
  };
  const me = async () => {
    const t = nowSec();
    return jget(base + '/v1/me?id=' + id + '&t=' + t + '&sig=' + await sign(key, id + '.me.' + t));
  };
  cleanup = async () => {
    const t = nowSec();
    await fetch(base + '/v1/me?id=' + id + '&t=' + t + '&sig=' + await sign(key, id + '.del.' + t),
      withTimeout({ method: 'DELETE' }));
  };

  let snapshotYellow = false;
  try {
    // 1. THE FIRST SUBMIT — the row is created, the key is accepted once (TOFU).
    // ⚠️ We also verify the STORED SCORE: without this the sabotage test «we write 0 instead of the score»
    // passes green, while a row with s=0 drops out of the partial index —
    // the player is neither in the top nor among the neighbours, yet their own screen draws «place 1».
    const r1 = await send(100, 1);
    // ⚠️ `rank` here is an ESTIMATE, and `null` is a legitimate answer (on a base with fewer than a hundred
    // players there is no boundary). We check not the type, but the ABSENCE OF A LIE: a fresh row
    // with a score of 100 cannot stand first. The condition holds both on an empty base
    // (null) and on the production one with thousands of players (a number, knowingly not one).
    check(r1.status === 200 && r1.j && r1.j.ok === 1 && r1.j.s === 100
      && (r1.j.rank === null || r1.j.rank >= 100),
      'submitting a result creates a row', 'HTTP ' + r1.status + ', score ' + (r1.j && r1.j.s)
      + ', place ' + (r1.j && r1.j.rank));

    // 2. A REPEAT of the same q — idempotent, 409 with the STORED state.
    const r2 = await send(100, 1);
    check(r2.status === 409 && r2.j && r2.j.dup === 1 && r2.j.s === 100,
      'a repeat does not create a second record', 'HTTP ' + r2.status + ', score ' + (r2.j && r2.j.s));

    // 3. THE RATE — a second write earlier than 20 s is rejected.
    const r3 = await send(150, 2);
    check(r3.status === 429 && r3.j && typeof r3.j.s === 'number',
      'more often than 20 s — a rate refusal', 'HTTP ' + r3.status);

    // 4. THE SIGNATURE — someone else's / a broken one is not accepted.
    const r4 = await send(999999, 3, { badSig: true });
    check(r4.status === 401, 'a broken signature is rejected', 'HTTP ' + r4.status);

    // 5. READING THE TOP — THREE OUTCOMES, and the yellow one is load-bearing here.
    // ⚠️ The previous version checked only «200 and an array» and was GREEN on
    // a dead snapshot: the server honestly returns stale:1 and t:0, while the script threw both
    // fields away. If cron did not register, the top is empty FOREVER — and that is
    // indistinguishable from «cron has not made it yet» until you look at `t`.
    const r5 = await jget(base + '/v1/top?p=1');
    const fresh = r5.j && !r5.j.stale && r5.j.t > nowSec() - SNAP_MAX_AGE;
    const never = r5.j && (r5.j.stale === 1 || r5.j.t === 0);
    const age = r5.j && r5.j.t ? Math.round((nowSec() - r5.j.t) / 60) + ' min ago' : 'was not built';
    if (r5.status !== 200 || !r5.j || !Array.isArray(r5.j.r)) {
      check(false, 'reading the top', 'HTTP ' + r5.status);
    } else if (fresh) {
      // ⚠️ We do NOT assert the number of rows: on the day of the deploy there are zero players, and an empty
      // fresh snapshot is a healthy answer.
      check(true, 'reading the top: the snapshot is fresh', 'rows ' + r5.j.r.length + ', taken ' + age
        + ', cache ' + (r5.headers.get('cache-control') || 'none'));
    } else if (never) {
      snapshotYellow = true;
      yellow('the snapshot has NOT BEEN BUILT yet (stale)', 'cron bakes it once an hour — wait for the tick and'
        + ' run the smoke test AGAIN; if it is stale the second time too — cron is not working');
    } else {
      check(false, 'the snapshot IS STALE', 'taken ' + age + ' against a norm of up to 2 h — cron has stopped');
    }

    // 6. OWN PLACE — exact, with the neighbours, and with the same score.
    const r6 = await me();
    check(r6.status === 200 && r6.j && r6.j.exact === 1 && Array.isArray(r6.j.dn) && r6.j.s === 100,
      'own place and neighbours', 'HTTP ' + r6.status + ', score ' + (r6.j && r6.j.s)
      + ', place ' + (r6.j && r6.j.rank));

    // 7. The ACAO header on a READ (the game lives in an iframe of someone else's domain).
    check((r5.headers.get('access-control-allow-origin') || '') === '*',
      'the ACAO header on a read', r5.headers.get('access-control-allow-origin') || 'no header');

    // 8. THE PREFLIGHT — the only endpoint that needs it: DELETE.
    // ⚠️ We do NOT assert ACAO here: it hangs on EVERY response, including a 404 —
    // such an assert would be a tautology and would pass on «OPTIONS → 404».
    const pre = await fetch(base + '/v1/me', withTimeout({ method: 'OPTIONS',
      headers: { 'access-control-request-method': 'DELETE', origin: 'https://games.playgama.com' } }));
    const allow = pre.headers.get('access-control-allow-methods') || '';
    check(pre.status === 204 && allow.indexOf('DELETE') >= 0,
      'preflight for DELETE is served', 'HTTP ' + pre.status + ', methods: ' + (allow || 'none'));

    // 9. THE SECOND SUCCESSFUL SUBMIT — the UPDATE path, for the sake of which the table is our own.
    // ⚠️ Steps 2-4 are rejected BEFORE the write, that is, they only checked INSERT:
    // the sabotage test «a non-existent column in UPDATE» passed green, while the player
    // is frozen on their first result forever — there is no «Forbes» model.
    process.stdout.write('  … waiting for the rate window (' + (RATE_WAIT_MS / 1000) + ' s)\r');
    await sleep(RATE_WAIT_MS);
    const r9 = await send(50, 4);                      // A SMALLER score: a drop is legitimate
    const after = await me();
    // ⚠️ We verify by A RE-READ, not by the POST response: `reply()` computes the number in JS,
    // while a substitution like `s=MAX(s,?)` lives in SQL — the response would have returned 50 with 100 in the base.
    check(r9.status === 200 && after.status === 200 && after.j && after.j.s === 50,
      'the second submit changes the score (the drop is stored)', 'HTTP ' + r9.status
      + ', in the base ' + (after.j && after.j.s));

    // 10. LOCALLY: show the yellow -> green transition. By this the new
    // freshness check is delivered AS A GUARD (red on a broken build, green on
    // a sound one), and not merely described in the docs.
    if (LOCAL) {
      check(snapshotYellow, 'locally: without a snapshot honestly YELLOW (the broken state is shown)');
      await local.worker._internals.buildSnapshot(local.env);
      const r10 = await jget(base + '/v1/top?p=1');
      const ok10 = r10.j && !r10.j.stale && r10.j.t > nowSec() - SNAP_MAX_AGE
        && (r10.j.r || []).some((row) => row[0] === 'SMOKE');
      check(ok10, 'locally: after the snapshot is built GREEN and own row in the top',
        'rows ' + (r10.j && r10.j.r ? r10.j.r.length : '?'));
      snapshotYellow = false;                          // the yellow was presented deliberately
    }
  } catch (e) {
    check(false, 'the smoke test reached the end without exceptions', String(e && e.message || e));
  } finally {
    // 11. DELETING OWN DATA — and the cleanup after the smoke test.
    try {
      const t = nowSec();
      const rd = await fetch(base + '/v1/me?id=' + id + '&t=' + t
        + '&sig=' + await sign(key, id + '.del.' + t), withTimeout({ method: 'DELETE' }));
      const jd = JSON.parse(await rd.text());
      cleaned = true;
      check(rd.status === 200 && jd.gone === 1, 'deleting own data (and the cleanup after the smoke test)',
        'HTTP ' + rd.status);
      const r12 = await me();
      check(r12.status === 404, 'after the deletion there is no row', 'HTTP ' + r12.status);
    } catch (e) {
      check(false, 'the cleanup after the smoke test', String(e && e.message || e)
        + ' — delete the row by hand, id: ' + id);
    }
    if (local) local.stop();
  }

  console.log('\nTOTAL: ' + pass + ' green'
    + (warns.length ? ', yellow ' + warns.length : '')
    + (fails.length ? ', RED ' + fails.length + ': ' + fails.join(' | ') : ''));
  if (fails.length) process.exit(1);
  if (snapshotYellow) {
    console.log('⚠️ NOT GREEN, BUT YELLOW: the snapshot has not been built yet. Wait for the hourly tick'
      + ' and run the smoke test A SECOND TIME — a shifted `t` proves that cron is alive.');
    process.exit(2);
  }
  console.log(LOCAL
    ? 'Locally the scenario is executable, the yellow->green transition is shown — on production go by this same list.'
    : 'The production worker responds according to the contract.');
})();
