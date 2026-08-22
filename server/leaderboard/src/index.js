// ===== OUR OWN LEADERBOARD — Cloudflare Worker + D1 =====
// Spec: docs/LEADERBOARD-OWN.md. Only the server lives here; the client is
// a separate game module (src/app/82-lb.js), the game core is not touched.
//
// ⚠️⚠️ THE MAIN DIFFERENCE FROM THE PLATFORM: we write the LAST value, not the maximum.
// That is the whole reason the table is our own — the Playgama server stores the maximum and
// cannot lower it, while the owner needs the "Forbes" model: spent points — dropped in the list.
//
// ⛔⛔ THERE IS NO ANTI-CHEAT PROTECTION HERE — THIS IS THE OWNER'S DECISION 2026-08-09.
// Verbatim: "let's not overthink things and build anti-cheat protection right now. For now
// make a good simple foundation for the leaderboard". The age-based ceiling
// (`GROW_BASE`/`GROW_PER_S`), score clamping and automatic hiding are REMOVED
// entirely rather than disabled by a flag — the history is in git, restore with `git revert`.
// ⚠️ THE PRICE WAS NAMED TO THE OWNER AND ACCEPTED: the score is computed by the CLIENT, the server cannot
// verify it, so anyone who wishes will send any number and take first place
// without playing. This is a conscious trade of "simplicity now" against "fairness of the
// table", not an oversight.
//
// ⚠️⚠️ WHAT REMAINS AND WHY IT IS NOT "ANTI-CHEAT PROTECTION" (removing it along the way is
// a typical mistake, hence the explicit list):
//   • `sig` — OWNERSHIP of the row. Without the signature an outsider
//     would overwrite someone else's result and delete someone else's data. We protect the player from an
//     OUTSIDER, not from himself.
//   • `RATE_SEC` — protects OUR free plan (the database request limit), not
//     fairness. Remove it — and the very first cycle of submissions eats the daily quota.
//   • `/admin/hide` and the `f` flag — manual moderation. Now it is the ONLY one:
//     the automation that hid a row by itself is gone.

const RATE_SEC   = 20;      // no more than one write per 20 s per player
const SKEW_SEC   = 300;     // client clock tolerance
const TOP_N      = 100;     // how many rows we keep in the snapshot
const PAGE_N     = 50;      // rows per /top page
const NEAR_N     = 5;       // neighbours above and below in /me
const LADDER_STEP= 100;     // ladder: the score at every hundredth place
const KEEP_DAYS  = 180;     // retention of silent rows

// ⚠️ THE RESPONSE IS ALWAYS NON-EMPTY JSON, and success is encoded by a BODY FIELD, not by the status.
// The reason is written down in the spec: if we ever go through the bridge
// transport, it does `fetch().then(r=>r.json())` WITHOUT checking `res.ok` —
// an empty body arrives as a failure, and a 500 with a body as a success.
// ⚠️ CORS is "simple": a text/plain body, no custom headers — otherwise
// every request would cost TWO (preflight), and the worker's daily limit is counted per request.
function reply(obj, status, extraHeaders) {
  const h = {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
  };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}

// ⚠️ Preflight is needed by EXACTLY ONE endpoint — DELETE /v1/me: the DELETE method is not
// among the "simple" ones per the CORS specification and the preflight request is unavoidable.
// This is deliberate: deleting one's own data happens once in a player's lifetime and does not
// lie on the hot path, unlike submitting the score.
function preflight() {
  return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }});
}

const nowSec = () => Math.floor(Date.now() / 1000);
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const intOr = (v, d) => (Number.isFinite(v) ? Math.floor(v) : d);

// ===== SIGNATURE =====
// HMAC-SHA256 over the string `id.s.q.t`. The client sends the key ONCE, when
// the row is created (trust-on-first-use over TLS).
// ⚠️⚠️ THE KEY IS ACCEPTED ONLY ON CREATION. If we allowed sending `k` for
// an existing row, anyone who wished would overwrite someone else's key with their own and take
// the row for themselves — that would be a hole the size of the whole protection.
async function hmacHex(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Constant-time comparison: a plain `===` on strings exits early at the
// first mismatch and, through the response time, hints at byte-by-byte guessing.
function sameSig(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ===== RANK LADDER =====
// An array of scores at places 100, 200, 300… (descending). Estimating the place costs
// ZERO D1 rows — and that is exactly what makes the budget add up: an exact
// `COUNT(*) WHERE s > ?` for a player at place 30,000 would cost 30,000
// rows read on EVERY submission.
// ⚠️⚠️ IT RETURNS THE BOUND "NO BETTER THAN N", NOT THE PLACE, AND `null` IS A LEGITIMATE ANSWER.
// There used to be `return 1` here, and that was not a typo but a LIE OF CONFIDENCE, and
// exactly during the period when the table is going to be looked at:
//   • the ladder is built from every HUNDREDTH place, so with a base of fewer than a hundred
//     players it is EMPTY — and EVERYONE got "place 1", for all the first weeks after
//     launch (caught by a live run of the client, the dispatcher's diagnosis 2026-08-09);
//   • the same defect lived one step deeper and would have survived fixing the first one: a player ABOVE
//     the first rung (`lo === 0`) also got a one, although all that is known about him
//     is "somewhere in the first hundred".
// Formally the contract was honest — `exact: 0` travels alongside. But the field is called
// `rank`, and a live consumer read it as the real place on the very first day.
// ⚠️ A VALUE THAT CANNOT BE CONFUSED IS BETTER THAN A MARKER THAT CAN BE
// OVERLOOKED: where there is no bound we return `null`, and the screen itself decides what to show.
// ⛔ THE EXACT PLACE LIVES ONLY IN `/v1/me` (`exact: 1`). The estimate is a hint, and
// it costs ZERO D1 rows; that is what the ladder was created for.
function estimateRank(ladder, score) {
  if (!ladder || !ladder.length) return null;   // fewer than a hundred players — nothing to say
  let lo = 0, hi = ladder.length;
  while (lo < hi) {                       // look for the first rung BELOW our score
    const mid = (lo + hi) >> 1;
    if (ladder[mid] >= score) lo = mid + 1; else hi = mid;
  }
  // we passed lo rungs -> we are below lo*100. When lo === 0 we are above the first rung,
  // that is, in the first hundred, but HOW FAR — the ladder does not know: that is `null` too.
  return lo === 0 ? null : lo * LADDER_STEP;
}

async function readSnap(env, key) {
  const row = await env.DB.prepare('SELECT v, t FROM snap WHERE k = ?').bind(key).first();
  if (!row) return null;
  try { return { v: JSON.parse(row.v), t: row.t }; } catch (e) { return null; }
}

// ===== POST /v1/score =====
async function postScore(req, env) {
  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return reply({ err: 'form' }, 400); }
  const id = body && body.id, n = body && body.n;
  const s = intOr(body && body.s, NaN), q = intOr(body && body.q, NaN);
  const t = intOr(body && body.t, NaN), a = intOr(body && body.a, 1);
  if (typeof id !== 'string' || id.length < 6 || id.length > 40) return reply({ err: 'form' }, 400);
  if (typeof n !== 'string' || !n.length || n.length > 40)      return reply({ err: 'form' }, 400);
  if (!Number.isFinite(s) || s < 0 || s > 1e12)                 return reply({ err: 'form' }, 400);
  if (!Number.isFinite(q) || q < 0)                             return reply({ err: 'form' }, 400);
  if (!Number.isFinite(t))                                      return reply({ err: 'form' }, 400);
  if (!isHex64(body.sig))                                       return reply({ err: 'form' }, 400);

  const now = nowSec();
  if (Math.abs(t - now) > SKEW_SEC) return reply({ err: 'skew' }, 400);

  const row = await env.DB.prepare(
    'SELECT id,k,n,a,s,u,q,c,f FROM p WHERE id = ?').bind(id).first();

  const msg = id + '.' + s + '.' + q + '.' + t;
  if (!row) {
    // The FIRST submission: the key arrives in the clear (TOFU). The row is created here,
    // that is, on the FIRST WIN — a guest who dropped in for ten seconds does not
    // spawn a row.
    if (!isHex64(body.k)) return reply({ err: 'nokey' }, 400);
    if (!sameSig(await hmacHex(body.k, msg), body.sig)) return reply({ err: 'sig' }, 401);
    // ⚠️ `c` (when the row was created) IS WRITTEN, but the mechanics NO LONGER READ it: the
    // age ceiling rested on it, and it has been removed. Kept for manual moderation —
    // there is no other way to tell a fresh row from an old one, and it costs one INTEGER.
    const born = now;
    await env.DB.prepare(
      'INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
      .bind(id, body.k, n, Math.min(49, Math.max(1, a)), s, now, q, born).run();
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 1, s: s, rank: estimateRank(snap && snap.v, s), exact: 0, n: n });
  }

  if (!sameSig(await hmacHex(row.k, msg), body.sig)) return reply({ err: 'sig' }, 401);

  // ⚠️ AN IDEMPOTENT RETRY, NOT AN ERROR: the client sends an ABSOLUTE value,
  // so a retry is safe by construction — we return the stored state.
  if (q <= row.q) {
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 1, dup: 1, s: row.s, rank: estimateRank(snap && snap.v, row.s), exact: 0, n: row.n }, 409);
  }
  if (now - row.u < RATE_SEC) {
    // ⚠️⚠️ `retry` — HOW MANY SECONDS TO WAIT, AND IT IS A LOAD-BEARING FIELD, NOT A CONVENIENCE.
    // Without it the client is forced to KNOW our `RATE_SEC`, that is, to keep a copy
    // of the server constant on its side — and a copy matches at the moment it is written and
    // diverges later (during the 2026-08-07/09 session the project caught this law
    // four times). Here the value travels FROM WHOEVER OWNS IT.
    // ⚠️ Why wait at all instead of discarding: the owner's typical path is
    // a win, and right after it a multiplier purchase on the win screen. The second
    // submission falls inside the window, and if it is lost, "spending drops you in
    // the table immediately" will not happen in exactly the scenario for which all this
    // was built.
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 0, err: 'rate', retry: RATE_SEC - (now - row.u),
      s: row.s, rank: estimateRank(snap && snap.v, row.s), n: row.n }, 429);
  }

  // ===== THE SCORE IS WRITTEN AS SENT =====
  // There used to be an age ceiling here: growth was clamped "by trust", and a row that
  // exceeded it was hidden from the public table. Removed entirely by the owner's decision
  // 2026-08-09 (see the file header) — the server no longer argues with the client about the number.
  // ⚠️ WE DO NOT TOUCH THE `f` FLAG HERE AT ALL, IN EITHER DIRECTION. It now
  // belongs ONLY to manual moderation (`/admin/hide`): there is no longer anyone to set it,
  // and clearing it by a submission would mean letting someone hidden by hand bring himself
  // back with the very first win. The only owner of the flag is the admin.
  await env.DB.prepare('UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?')
    .bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();

  const snap = await readSnap(env, 'ladder');
  // ⚠️ We STILL return the place to someone hidden by hand: on learning about the hiding, he will simply
  // create a new id. From the PUBLIC table he has disappeared anyway — the queries filter
  // by `f = 0`.
  return reply({ ok: 1, s: s, rank: estimateRank(snap && snap.v, s), exact: 0, n: n });
}

// ===== GET /v1/top =====
// Read FROM THE SNAPSHOT, not from `p`: zero scans of the live table and caching at the edge.
async function getTop(env, url) {
  const page = Math.max(1, Math.min(2, intOr(Number(url.searchParams.get('p')), 1)));
  // ⚠️ The spec, section DEGRADATION: "if D1 does not respond, /top returns
  // the last snapshot". A database outage must NOT turn into a 503 — the table is
  // decoration and never blocks the game.
  let snap = null;
  try { snap = await readSnap(env, 'top'); }
  catch (e) { snap = null; }
  if (!snap) return reply({ t: 0, n: 0, p: page, r: [], stale: 1 }, 200,
    { 'cache-control': 'public, max-age=30' });
  const from = (page - 1) * PAGE_N;
  return reply({ t: snap.t, n: snap.v.n || 0, p: page, r: (snap.v.r || []).slice(from, from + PAGE_N) },
    200, { 'cache-control': 'public, max-age=60' });
}

// ===== GET /v1/me =====
// The exact place: the base from the ladder + a recount INSIDE the bucket (<=100 rows),
// plus the neighbours via keyset queries. We do not use OFFSET anywhere — it scans
// everything it jumps over, and in D1 those are billed rows.
async function getMe(env, url) {
  const id = url.searchParams.get('id');
  const t = intOr(Number(url.searchParams.get('t')), NaN);
  const sig = url.searchParams.get('sig');
  if (!id || !Number.isFinite(t) || !isHex64(sig)) return reply({ err: 'form' }, 400);
  if (Math.abs(t - nowSec()) > SKEW_SEC) return reply({ err: 'skew' }, 400);

  const row = await env.DB.prepare('SELECT id,k,n,a,s,u,f FROM p WHERE id = ?').bind(id).first();
  if (!row) return reply({ err: 'none' }, 404);
  if (!sameSig(await hmacHex(row.k, id + '.me.' + t), sig)) return reply({ err: 'sig' }, 401);

  const snap = await readSnap(env, 'ladder');
  const ladder = (snap && snap.v) || [];
  let base = 0, bound = null;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i] >= row.s) { base = (i + 1) * LADDER_STEP; bound = ladder[i]; } else break;
  }
  // Those who are above me but not above the bucket boundary — by construction there are <= ~100 of them.
  const cnt = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM p WHERE f=0 AND s>0 AND (s > ? OR (s = ? AND u < ?))'
    + (bound === null ? '' : ' AND s <= ?'))
    .bind(...(bound === null ? [row.s, row.s, row.u] : [row.s, row.s, row.u, bound])).first();
  // ⚠️⚠️ THE MINUS ONE IS NOT COSMETIC. A player standing EXACTLY on the bucket
  // boundary (place (i+1)·100) is counted TWICE: he is already included in `base`
  // and passes the `s <= bound` condition again. Without the subtraction everyone below
  // the hundredth place saw a place one worse than the real one.
  const exactRank = base + 1 + ((cnt && cnt.c) || 0) - (bound === null ? 0 : 1);

  const above = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 AND (s > ? OR (s = ? AND u < ?)) ORDER BY s ASC, u DESC LIMIT ?')
    .bind(row.s, row.s, row.u, NEAR_N).all();
  const below = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 AND (s < ? OR (s = ? AND u > ?)) ORDER BY s DESC, u ASC LIMIT ?')
    .bind(row.s, row.s, row.u, NEAR_N).all();

  return reply({
    ok: 1, s: row.s, n: row.n, a: row.a, rank: exactRank, exact: 1,
    up: ((above.results || []).map((r) => [r.n, r.a, r.s])).reverse(),
    dn: (below.results || []).map((r) => [r.n, r.a, r.s]),
  });
}

// ===== DELETE /v1/me =====
// The only physically possible "delete my data": we have no email.
async function deleteMe(env, url) {
  const id = url.searchParams.get('id');
  const t = intOr(Number(url.searchParams.get('t')), NaN);
  const sig = url.searchParams.get('sig');
  if (!id || !Number.isFinite(t) || !isHex64(sig)) return reply({ err: 'form' }, 400);
  if (Math.abs(t - nowSec()) > SKEW_SEC) return reply({ err: 'skew' }, 400);
  const row = await env.DB.prepare('SELECT k FROM p WHERE id = ?').bind(id).first();
  if (!row) return reply({ ok: 1, gone: 1 });         // already gone — that is a success
  if (!sameSig(await hmacHex(row.k, id + '.del.' + t), sig)) return reply({ err: 'sig' }, 401);
  await env.DB.prepare('DELETE FROM p WHERE id = ?').bind(id).run();
  return reply({ ok: 1, gone: 1 });
}

// ===== POST /admin/hide =====
async function adminHide(req, env) {
  const auth = req.headers.get('authorization') || '';
  if (!env.ADMIN_TOKEN || auth !== 'Bearer ' + env.ADMIN_TOKEN) return reply({ err: 'auth' }, 401);
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return reply({ err: 'form' }, 400); }
  if (!b || typeof b.id !== 'string') return reply({ err: 'form' }, 400);
  const f = b.show ? 0 : 2;   // 2 = MANUAL, not cleared by a plain submission
  await env.DB.prepare('UPDATE p SET f=? WHERE id=?').bind(f, b.id).run();
  return reply({ ok: 1, id: b.id, f: f });
}

// ===== CRON =====
// ⚠️ Aggregation is done IN SQL, not by iterating in JS: D1 query time does not count
// towards the worker's CPU, while iterating over 50,000 elements can eat the free
// 10 ms of CPU entirely.
async function buildSnapshot(env) {
  const now = nowSec();
  const top = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 ORDER BY s DESC, u ASC LIMIT ?').bind(TOP_N).all();
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM p WHERE f=0 AND s>0').first();
  const lad = await env.DB.prepare(
    'SELECT s FROM (SELECT s, ROW_NUMBER() OVER (ORDER BY s DESC, u ASC) rn'
    + ' FROM p WHERE f=0 AND s>0) WHERE rn % ? = 0').bind(LADDER_STEP).all();
  const topJson = JSON.stringify({ n: (cnt && cnt.c) || 0, r: (top.results || []).map((r) => [r.n, r.a, r.s]) });
  const ladJson = JSON.stringify((lad.results || []).map((r) => r.s));
  await env.DB.prepare('INSERT INTO snap (k,v,t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, t=excluded.t')
    .bind('top', topJson, now).run();
  await env.DB.prepare('INSERT INTO snap (k,v,t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, t=excluded.t')
    .bind('ladder', ladJson, now).run();
  return { top: (top.results || []).length, ladder: (lad.results || []).length };
}

async function retention(env) {
  const cut = nowSec() - KEEP_DAYS * 86400;
  const r = await env.DB.prepare('DELETE FROM p WHERE u < ?').bind(cut).run();
  return r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return preflight();
    try {
      if (url.pathname === '/v1/score'  && req.method === 'POST')   return await postScore(req, env);
      if (url.pathname === '/v1/top'    && req.method === 'GET')    return await getTop(env, url);
      if (url.pathname === '/v1/me'     && req.method === 'GET')    return await getMe(env, url);
      if (url.pathname === '/v1/me'     && req.method === 'DELETE') return await deleteMe(env, url);
      if (url.pathname === '/admin/hide'&& req.method === 'POST')   return await adminHide(req, env);
      return reply({ err: 'route' }, 404);
    } catch (e) {
      // ⚠️ Even on a failure the body is non-empty and this is NOT 200: the client will keep the number in
      // its slot and retry at the next natural point, instead of deciding that
      // it "was saved".
      return reply({ err: 'srv' }, 503);
    }
  },
  async scheduled(event, env) {
    if (event.cron === '0 4 * * *') return void await retention(env);
    await buildSnapshot(env);
  },
  // export for tests — the production path does not use them
  _internals: { estimateRank, hmacHex, buildSnapshot, retention, sameSig, RATE_SEC },
};
