// THE PAYMENT WORKER — pay.blendo.monster (2026-09-10-d). Four jobs, and the third one is the
// reason the worker exists at all:
//   1. /v1/checkout — turn «this player wants the boost» into a Stripe Checkout Session and hand
//      back its URL. ⛔ THE PRICE IS OURS, NOT THE CLIENT'S: the request names the product, never
//      the amount — a browser that could name its own price would name zero.
//   2. /v1/webhook — Stripe tells US that the money arrived. THIS is the only place that may write
//      an entitlement: a browser never sees a payment, it only sees a redirect it could fake.
//   3. /v1/mine  — what this player has bought and not yet taken. It is what makes a purchase
//      survive a cleared browser and reach a second device (the hole of 2026-09-04-a).
//   4. /v1/claim — the player took it; mark the row so the next start does not grant it twice.
//
// ⚠️ THE IDENTITY IS THE ONE THE LEADERBOARD ALREADY USES: `Save.gid` plus the HMAC key `Save.lk`,
// trust-on-first-use. Deliberately its OWN copy of the key table (`pk`) rather than a shared one —
// two services must not be able to lock each other out of a player's identity.
// ⚠️ THE RESPONSE IS ALWAYS NON-EMPTY JSON and success is a BODY FIELD, not a status: the same
// rule the leaderboard is written to, for the same reason (a transport that does
// `fetch().then(r=>r.json())` without checking `res.ok` reads an empty body as a failure).

const SKEW_SEC = 300;          // client clock tolerance, and the webhook's own timestamp window
// ⚠️ THE PRODUCT ID IS ONE STRING IN ONE PLACE: `createSession` writes it into the session's
// metadata and the webhook REFUSES anything else (below). Two copies would drift, and a drift here
// means either every payment ignored or every payment on the account granting our boost.
const PID = 'bundle5';
const MINE_MAX = 20;           // rows a player can be holding unclaimed; a sane ceiling, not a rule
const nowSec = () => Math.floor(Date.now() / 1000);
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isGid = (v) => typeof v === 'string' && /^[a-z0-9]{6,40}$/.test(v);

function reply(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

async function hmacHex(keyRaw, msg) {
  const key = await crypto.subtle.importKey('raw', keyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const hexKey = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
const strKey = (s) => new TextEncoder().encode(s);
// Constant-time compare: `===` on strings exits at the first mismatch and leaks a byte at a time
// through the response time. The leaderboard's own helper, copied deliberately — this worker must
// not import from that one, they are deployed apart.
function sameSig(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ===== THE PLAYER'S KEY, TRUST-ON-FIRST-USE =====
// ⚠️ THE KEY IS ACCEPTED ONLY WHEN THERE IS NO ROW YET. Letting `k` through for a known gid would
// mean anyone could overwrite somebody else's key and take their purchases — a hole the size of
// the whole protection. The leaderboard says the same thing about its own table.
async function ownerKey(env, gid, offered) {
  const row = await env.DB.prepare('SELECT k FROM pk WHERE gid = ?').bind(gid).first();
  if (row && row.k) return row.k;
  if (!isHex64(offered)) return null;
  await env.DB.prepare('INSERT OR IGNORE INTO pk (gid, k, c) VALUES (?, ?, ?)')
    .bind(gid, offered, nowSec()).run();
  const again = await env.DB.prepare('SELECT k FROM pk WHERE gid = ?').bind(gid).first();
  return again ? again.k : null;
}
// The signed string is always `gid.what.t` — `what` is the endpoint's own payload, so a signature
// for one call can never be replayed on another.
async function checkSig(env, gid, what, t, sig, offeredKey) {
  if (!isGid(gid) || !isHex64(sig)) return { err: 'bad' };
  const ts = Math.floor(Number(t));
  if (!Number.isFinite(ts) || Math.abs(nowSec() - ts) > SKEW_SEC) return { err: 'skew' };
  const k = await ownerKey(env, gid, offeredKey);
  if (!k) return { err: 'nokey' };
  const want = await hmacHex(hexKey(k), gid + '.' + what + '.' + ts);
  // ⚠️ THE ANCHORED KEY TRAVELS BACK WITH THE VERDICT: `/v1/auth` stores it in the mapping, so
  // `acc.k === pk.k` holds BY CONSTRUCTION instead of by a second read that could see another row.
  return sameSig(want, sig) ? { ok: true, ts, k } : { err: 'sig' };
}

// ===== GOOGLE SIGN-IN — THE TOKEN, AND THE FOUR DETAILS THAT ONLY BITE IN PRODUCTION =====
// The design and every trap it answers: docs/GOOGLE-AUTH.md.
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
// ⚠️ `iss` COMES IN TWO LEGITIMATE FORMS. Accepting one is a sign-in that works until it does not.
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
// ⚠️ The key set is cached in THIS ISOLATE and nowhere else — a Worker isolate is not a shared
// cache, and Google rotates these keys on its own schedule.
let jwks = { keys: null, exp: 0 };

function b64uBytes(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + (t.length % 4 ? '='.repeat(4 - (t.length % 4)) : ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function jwksGet(force) {
  if (!force && jwks.keys && jwks.exp > nowSec()) return jwks.keys;
  const r = await fetch(GOOGLE_JWKS).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || !Array.isArray(j.keys)) return null;
  // The TTL is Google's own, clamped: a one-second max-age would make every sign-in a round trip,
  // and an enormous one would outlive a rotation.
  let ttl = 3600;
  const m = String(r.headers.get('cache-control') || '').match(/max-age=(\d+)/);
  if (m) ttl = Math.min(86400, Math.max(60, parseInt(m[1], 10)));
  jwks = { keys: j.keys, exp: nowSec() + ttl };
  return j.keys;
}
// ⚠️ RS256 ONLY, AND THE ALGORITHM IS READ FROM OUR RULE RATHER THAN FROM THE TOKEN'S OWN HEADER:
// honouring `alg` from the header is the classic JWT forgery (`alg: none`, or HS256 signed with the
// public key). The header is used for `kid` and for nothing else.
async function verifyGoogleToken(tok, clientId) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3) return { err: 'token' };
  let head = null, body = null;
  try {
    head = JSON.parse(new TextDecoder().decode(b64uBytes(parts[0])));
    body = JSON.parse(new TextDecoder().decode(b64uBytes(parts[1])));
  } catch (e) { return { err: 'token' }; }
  if (!head || head.alg !== 'RS256' || !head.kid || !body) return { err: 'token' };
  // ⚠️ AN UNKNOWN `kid` IS A ROTATION, NOT A FORGERY: re-fetch ONCE and retry before refusing —
  // otherwise every player signing in during a rotation is told his account is invalid.
  let keys = await jwksGet(false);
  let jwk = keys && keys.find((k) => k.kid === head.kid);
  if (!jwk) { keys = await jwksGet(true); jwk = keys && keys.find((k) => k.kid === head.kid); }
  if (!jwk) return { err: 'jwks' };
  let key = null;
  try {
    key = await crypto.subtle.importKey('jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch (e) { return { err: 'jwks' }; }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])).catch(() => false);
  if (!ok) return { err: 'token' };
  if (GOOGLE_ISS.indexOf(String(body.iss)) < 0) return { err: 'iss' };
  // ⛔ `aud` IS THE WHOLE POINT OF HAVING A CLIENT ID HERE: without it any valid Google token, from
  // any site in the world, signs a player in to this game.
  if (body.aud !== clientId) return { err: 'aud' };
  const exp = Math.floor(Number(body.exp));
  if (!Number.isFinite(exp) || exp + SKEW_SEC < nowSec()) return { err: 'expired' };
  const sub = String(body.sub || '');
  if (!sub || sub.length > 64) return { err: 'token' };
  const name = typeof body.name === 'string' ? body.name
    : (typeof body.given_name === 'string' ? body.given_name : '');
  // ⛔ NOTHING ELSE LEAVES THIS FUNCTION. `email` is deliberately not read, so it cannot be stored
  // by accident by whoever edits the caller next.
  return { ok: true, sub, name: name.slice(0, 80) };
}

// ===== THE MAPPING: ACCOUNT → IDENTITY =====
// ⛔⛔ IT IS A SIGNED CALL LIKE EVERY OTHER ENDPOINT HERE, AND THAT IS TRAP 4 OF THE DESIGN. The
// obvious shape — «send your token plus any {gid, k} and we will anchor them» — has a working
// exploit: a gid is semi-public, so an attacker sends `{victim_gid, any k}` with his OWN Google
// account, `ownerKey` returns the victim's REAL key (he has bought something), and the mapping
// hands the attacker a working key for BOTH services. Signed, a foreign key fails on `sig`.
async function auth(req, env) {
  // The client id is not a secret (it ships in the page) but without it `aud` cannot be checked,
  // and an unchecked `aud` is the hole above. 503, not 400: nothing the client sent is wrong.
  if (!env.GOOGLE_CLIENT_ID) return reply({ err: 'noclient' }, 503);
  let b = null;
  try { b = await req.json(); } catch (e) { return reply({ err: 'json' }, 400); }
  const gid = (b && b.id) || '';
  const tok = (b && b.tok) || '';
  if (typeof tok !== 'string' || tok.length < 20 || tok.length > 8192) return reply({ err: 'token' }, 400);
  // ⚠️ THE TOKEN IS INSIDE THE SIGNED STRING (as its hash — the token itself is far too long for a
  // signing payload), so a captured signature cannot be replayed with a DIFFERENT token.
  const chk = await checkSig(env, gid, 'auth.' + await sha256Hex(tok), b && b.t, (b && b.sig) || '', (b && b.k) || '');
  if (chk.err) return reply({ err: chk.err }, chk.err === 'nokey' ? 400 : 401);
  const v = await verifyGoogleToken(tok, env.GOOGLE_CLIENT_ID);
  // ⚠️ A JWKS FAILURE IS OURS, NOT THE PLAYER'S: 503 so the client may retry, while a bad token is
  // a flat 401.
  if (v.err) return reply({ err: v.err }, v.err === 'jwks' ? 503 : 401);

  const row = await env.DB.prepare('SELECT gid, k FROM acc WHERE sub = ?').bind(v.sub).first();
  if (row && row.gid) return reply({ ok: 1, gid: row.gid, k: row.k, fresh: 0, name: v.name });

  // ⛔⛔ TRAP 5: ONE IDENTITY, ONE ACCOUNT. Without this the shared phone binds the child's Google
  // account to the parent's identity for ever, and the child's own phone then receives the parent's
  // purchases and the parent's leaderboard row.
  const taken = await env.DB.prepare('SELECT sub FROM acc WHERE gid = ?').bind(gid).first();
  if (taken && taken.sub) return reply({ err: 'bound' }, 409);
  // ⚠️ THE KEY IS THE ONE `checkSig` ANCHORED, never a second read of `pk`: the pair stored here is
  // the pair the two services will accept.
  await env.DB.prepare('INSERT OR IGNORE INTO acc (sub, gid, k, c) VALUES (?,?,?,?)')
    .bind(v.sub, gid, chk.k, nowSec()).run();
  // ⚠️ READ BACK RATHER THAN ASSUME: `OR IGNORE` plus the UNIQUE index on `gid` is what settles a
  // race between two sign-ins, and the loser must learn that it lost instead of reporting success.
  const back = await env.DB.prepare('SELECT gid, k FROM acc WHERE sub = ?').bind(v.sub).first();
  if (!back || !back.gid) return reply({ err: 'bound' }, 409);
  return reply({ ok: 1, gid: back.gid, k: back.k, fresh: back.gid === gid ? 1 : 0, name: v.name });
}

// ===== 1. THE CHECKOUT SESSION =====
// ⚠️ FORM-ENCODED, because that is the only body Stripe's REST API takes; `URLSearchParams` writes
// the bracket syntax Stripe expects for nested fields.
// ⚠️ NO `payment_method_types`: leaving it out means Stripe offers what the DASHBOARD has enabled —
// cards, Link, Apple Pay, Google Pay, MB WAY. Naming them here would freeze that list in code and
// silently switch off whatever he turns on later.
// ⚠️ `automatic_tax` + `tax_behavior=inclusive`: Stripe Tax is active on the account since
// 2026-09-10-d, and the price the player sees is the price he pays — VAT lives INSIDE the 1.99.
async function createSession(env, gid, ts) {
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', env.CURRENCY || 'eur');
  body.set('line_items[0][price_data][unit_amount]', String(env.PRICE_CENTS || '199'));
  body.set('line_items[0][price_data][tax_behavior]', 'inclusive');
  body.set('line_items[0][price_data][product_data][name]', env.PRODUCT_NAME || 'Blendo x5 Boost');
  body.set('automatic_tax[enabled]', 'true');
  // ⚠️ THE GID TRAVELS IN THE METADATA AND COMES BACK IN THE WEBHOOK. It is the whole link between
  // a payment and a player: `client_reference_id` carries it too, so a human reading the dashboard
  // sees the same string the ledger is keyed by.
  body.set('client_reference_id', gid);
  body.set('metadata[gid]', gid);
  body.set('metadata[pid]', PID);
  body.set('success_url', (env.SITE || '') + '/?paid={CHECKOUT_SESSION_ID}');
  body.set('cancel_url', (env.SITE || '') + '/?paid=cancel');
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'content-type': 'application/x-www-form-urlencoded',
      // ⚠️⚠️ THE KEY IS THE CLIENT'S OWN SIGNED SECOND, NOT A WALL-CLOCK MINUTE. Stripe replays the
      // cached response for 24h on a repeated key: with a minute bucket a player who paid at :30 and
      // clicked again at :50 would be handed the URL of the session he has ALREADY PAID. One tap is
      // one `t`, so a double-click is deduped and a real second attempt gets a real session.
      'idempotency-key': gid + '-' + ts,
    },
    body: body.toString(),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.url) return { err: 'stripe', detail: (j && j.error && j.error.message) || r.status };
  return { url: j.url, sid: j.id };
}

// ===== 2. THE WEBHOOK =====
// ⚠️⚠️ THE SIGNATURE IS CHECKED ON THE RAW BODY, and the body must be read as TEXT before anything
// parses it: `JSON.parse` then `JSON.stringify` gives a different byte string and every signature
// fails. The signed payload is `${t}.${raw}` and the key is the whsec STRING itself, not hex.
function parseStripeSig(h) {
  const out = { t: 0, v1: [] };
  for (const part of String(h || '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') out.t = Math.floor(Number(v));
    else if (k === 'v1') out.v1.push(v);
  }
  return out;
}
async function webhook(req, env) {
  // ⛔⛔ NO SECRET, NO VERDICT — AND THE REASON IS MEASURED, NOT ASSUMED. With the secret unset the
  // verification below imports a ZERO-LENGTH HMAC key, and WebCrypto REFUSES that by spec
  // (`DataError: Zero-length key is not supported`) — so without this line the worker does not
  // fool itself, it THROWS: an unhandled exception, a 500 with a stack and no word about the cause,
  // on every delivery. The worker is deployed BEFORE `wrangler secret put` runs, so that is a state
  // it really passes through. Here it says what is wrong instead.
  // ⚠️ WHAT THIS DOES NOT COVER, NAMED HONESTLY: a secret that is present but WRONG — a placeholder,
  // a stray space, a copied example — verifies happily, and whoever knows that string can forge a
  // grant. Nothing in a worker can tell a real whsec from a plausible one; only the dashboard can.
  // 503 and not 400 on purpose: Stripe retries a 5xx for days, so an event that arrived during that
  // window is delivered again once the secret is in place and the player still gets his boost.
  if (!env.STRIPE_WEBHOOK_SECRET) return reply({ err: 'nosecret' }, 503);
  const raw = await req.text();
  const s = parseStripeSig(req.headers.get('stripe-signature'));
  if (!s.t || !s.v1.length) return reply({ err: 'sig' }, 400);
  // ⚠️ THE TIMESTAMP WINDOW IS PART OF THE CHECK: without it a captured delivery could be replayed
  // for ever. Stripe's own guidance, and the same 5 minutes the client's signature uses.
  if (Math.abs(nowSec() - s.t) > SKEW_SEC) return reply({ err: 'skew' }, 400);
  const want = await hmacHex(strKey(env.STRIPE_WEBHOOK_SECRET), s.t + '.' + raw);
  if (!s.v1.some((v) => sameSig(want, v))) return reply({ err: 'sig' }, 400);
  let ev = null;
  try { ev = JSON.parse(raw); } catch (e) { return reply({ err: 'json' }, 400); }
  const type = ev && ev.type;
  // ⚠️ TWO EVENT TYPES, NOT ONE: a card pays inside `checkout.session.completed`, while a delayed
  // method (MB WAY, a bank debit) completes the session UNPAID and pays later in
  // `async_payment_succeeded`. Granting on `completed` alone would hand the boost to somebody whose
  // payment can still fail; ignoring the async event would never grant a real one.
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded')
    return reply({ ok: 1, ignored: type || '' });
  const ses = (ev.data && ev.data.object) || {};
  if (ses.payment_status !== 'paid') return reply({ ok: 1, pending: 1 });
  const gid = (ses.metadata && ses.metadata.gid) || ses.client_reference_id || '';
  const pid = (ses.metadata && ses.metadata.pid) || '';
  // ⛔⛔ THE PRODUCT MUST BE NAMED BY US. Without this a payment link made by hand in the dashboard
  // — or any other Checkout Session on this account — would grant the boost merely by carrying a
  // `client_reference_id` that looks like a gid. A fallback to the product name is the same hole.
  if (pid !== PID) return reply({ ok: 1, ignored: 'pid' });
  // ⚠️ A PAID SESSION WITH NO PLAYER IS MONEY TAKEN AND NOTHING GRANTED, so it is logged loudly.
  // The status stays 2xx deliberately: a retry cannot conjure a gid, and a 5xx would make Stripe
  // hammer this endpoint for three days over a payment nobody can attribute.
  if (!isGid(gid) || !ses.id) {
    console.error('pay: paid session without a usable gid', ses.id || '(no id)');
    return reply({ ok: 1, nogid: 1 });
  }
  // ⚠️⚠️ `INSERT OR IGNORE` KEYED BY THE SESSION IS THE WHOLE IDEMPOTENCE: Stripe retries until it
  // gets a 2xx and may deliver the same event twice at any time. A row per DELIVERY would be two
  // boosts for one payment.
  await env.DB.prepare('INSERT OR IGNORE INTO ent (sid, gid, pid, amt, cur, c, cl) VALUES (?,?,?,?,?,?,0)')
    .bind(ses.id, gid, pid, Math.floor(ses.amount_total || 0), String(ses.currency || 'eur'), nowSec())
    .run();
  return reply({ ok: 1, granted: 1 });
}

// ===== 3 and 4. WHAT THE PLAYER OWNS, AND TAKING IT =====
// ⚠️⚠️ A POST AND NOT A GET, THOUGH IT ONLY READS: on the FIRST contact the request carries `k`,
// the player's HMAC key, and a query string is written into edge logs, `wrangler tail` and the
// browser's own history. The leaderboard sends its key in a POST body for the same reason.
async function mine(req, env) {
  let b = null;
  try { b = await req.json(); } catch (e) { return reply({ err: 'json' }, 400); }
  const gid = (b && b.id) || '';
  const chk = await checkSig(env, gid, 'mine', b && b.t, (b && b.sig) || '', (b && b.k) || '');
  if (chk.err) return reply({ err: chk.err }, chk.err === 'nokey' ? 400 : 401);
  const rs = await env.DB.prepare(
    'SELECT sid, pid, amt, cur, c FROM ent WHERE gid = ? AND cl = 0 ORDER BY c ASC LIMIT ?')
    .bind(gid, MINE_MAX).all();
  return reply({ ok: 1, items: (rs && rs.results) || [] });
}
async function claim(req, env) {
  let b = null;
  try { b = await req.json(); } catch (e) { return reply({ err: 'json' }, 400); }
  const gid = (b && b.id) || '';
  const sids = Array.isArray(b && b.sids) ? b.sids.filter((s) => typeof s === 'string' && s.length <= 80).slice(0, MINE_MAX) : [];
  if (!sids.length) return reply({ err: 'empty' }, 400);
  // ⚠️ THE SIGNED STRING CARRIES THE SESSIONS THEMSELVES, sorted: a signature for one claim cannot
  // be replayed to close somebody else's row, and the order of a JSON array is not a contract.
  const chk = await checkSig(env, gid, 'claim.' + sids.slice().sort().join(','), b.t, b.sig || '', b.k || '');
  if (chk.err) return reply({ err: chk.err }, chk.err === 'nokey' ? 400 : 401);
  const marks = sids.map(() => '?').join(',');
  // ⚠️ `AND cl = 0` and `AND gid = ?` are both load-bearing: the first makes a repeated claim a
  // no-op, the second stops a claim signed by one player from touching another's row.
  const res = await env.DB.prepare(
    'UPDATE ent SET cl = ? WHERE gid = ? AND cl = 0 AND sid IN (' + marks + ')')
    .bind(nowSec(), gid, ...sids).run();
  return reply({ ok: 1, claimed: (res && res.meta && res.meta.changes) || 0 });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400' } });
    }
    // ⚠️ THE PRICE IS ANSWERED, NOT ASSUMED BY THE CLIENT: the game shows what it is told, so the
    // label on the button and the amount on the card cannot drift apart.
    if (p === '/v1/price' && req.method === 'GET')
      return reply({ ok: 1, cents: Math.floor(Number(env.PRICE_CENTS || 199)),
                     currency: (env.CURRENCY || 'eur'), name: env.PRODUCT_NAME || '' });
    if (p === '/v1/checkout' && req.method === 'POST') {
      let b = null;
      try { b = await req.json(); } catch (e) { return reply({ err: 'json' }, 400); }
      const gid = (b && b.id) || '';
      const chk = await checkSig(env, gid, 'checkout.bundle5', b && b.t, (b && b.sig) || '', (b && b.k) || '');
      if (chk.err) return reply({ err: chk.err }, chk.err === 'nokey' ? 400 : 401);
      if (!env.STRIPE_SECRET_KEY) return reply({ err: 'nokeyserver' }, 503);
      const s = await createSession(env, gid, chk.ts);
      if (s.err) return reply({ err: s.err, detail: s.detail || '' }, 502);
      return reply({ ok: 1, url: s.url, sid: s.sid });
    }
    // ⚠️ ONE COPY OF THE CLIENT ID, AND THE CLIENT READS IT FROM HERE. It is needed twice — by the
    // Google library in the page and as `aud` on this worker — and two copies are the drift this
    // project has already paid for with the PID, the price and the material map.
    if (p === '/v1/auth/cfg' && req.method === 'GET')
      return reply({ ok: 1, cid: env.GOOGLE_CLIENT_ID || '' });
    if (p === '/v1/auth' && req.method === 'POST') return auth(req, env);
    if (p === '/v1/webhook' && req.method === 'POST') return webhook(req, env);
    if (p === '/v1/mine' && req.method === 'POST') return mine(req, env);
    if (p === '/v1/claim' && req.method === 'POST') return claim(req, env);
    return reply({ err: 'route' }, 404);
  },
};
