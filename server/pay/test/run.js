// Guards of the payment worker. Run: `node server/pay/test/run.js`
// Assertion-based, like the game's test.js and the leaderboard's: any FAIL gives exit code 1.
// ⚠️ Every guard is verified BOTH WAYS (see the sibling file break.js): red on a broken
// build, green on a healthy one. A one-way run does not protect against a tautology.
//
// ⚠️⚠️ THIS IS THE MONEY PATH, so the arms are written against the three questions that
// decide whether a payment reaches the player exactly once:
//   1. WHO NAMES THE PRICE — the server, never the browser;
//   2. WHO MAY GRANT — the signed webhook, never a redirect;
//   3. WHOSE ROW IS IT — the gid whose key the row was registered under, and no other.
const fs = require('fs');
const path = require('path');
const { makeDB } = require('./d1.js');

const DIR = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
// The three files the cross-file arm reads, each substitutable so break.js can patch a COPY:
// a guard whose inputs cannot be moved has half its sabotages unwritable.
const SRC_PATH = process.env.PAY_SRC || path.join(DIR, 'src', 'index.js');
const TOML_PATH = process.env.PAY_TOML || path.join(DIR, 'wrangler.toml');
const CFG_PATH = process.env.PAY_CFG || path.join(DIR, '..', '..', 'src', 'app', '00-config.js');

let pass = 0; const fails = [];
function expect(cond, name) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fails.push(name); console.log('FAIL: ' + name); }
}

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmac(rawKey, msg) {
  const k = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
// The player's key is HEX (it is `Save.lk`); Stripe's whsec is a STRING. Two key kinds, and
// mixing them up is the single most likely way to write a signature that never verifies.
const keyHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const keyStr = (s) => new TextEncoder().encode(s);

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const WHSEC = 'whsec_test_secret';
const now = () => Math.floor(Date.now() / 1000);

// The signed string is always `gid.what.t` — the worker's own rule.
const sigFor = (keyH, gid, what, t) => hmac(keyHex(keyH), gid + '.' + what + '.' + t);
// Stripe signs `${t}.${raw}` with the whsec STRING itself. `JSON.parse` then `JSON.stringify`
// gives different bytes and every signature fails — which is why the raw text is what travels.
const stripeSig = async (secret, t, raw) => 't=' + t + ',v1=' + await hmac(keyStr(secret), t + '.' + raw);

// ===== A REAL RS256 TOKEN, SIGNED HERE =====
// ⚠️⚠️ THE TOKEN IS GENUINELY SIGNED AND GENUINELY VERIFIED — no branch of the worker is stubbed.
// A guard that handed the worker a token it had been told to trust would be measuring the stub.
const b64u = (b) => Buffer.from(b).toString('base64url');
let GKEY = null;               // { priv, jwk } — filled once at the start of the run
const CLIENT_ID = '111.apps.googleusercontent.com';
async function mint(over) {
  const o = over || {};
  const head = { alg: o.alg || 'RS256', kid: o.kid || 'k1', typ: 'JWT' };
  const body = Object.assign({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-default',
    exp: now() + 3600,
    iat: now(),
    name: 'Иван Игрок',
  }, o.claims || {});
  const h = b64u(JSON.stringify(head)), pl = b64u(JSON.stringify(body));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', o.priv || GKEY.priv,
    new TextEncoder().encode(h + '.' + pl));
  return h + '.' + pl + '.' + b64u(Buffer.from(new Uint8Array(sig)));
}
const sha256Hex = async (str) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
// The signed string of `/v1/auth` carries the token's HASH: a captured signature cannot be
// replayed with a different token.
async function authCall(worker, e, gid, keyH, tok, over) {
  const t = (over && over.t) || now();
  const what = 'auth.' + await sha256Hex(tok);
  return call(worker, e, '/v1/auth', { body: Object.assign({
    id: gid, t, sig: await sigFor(keyH, gid, what, t), k: keyH, tok }, (over && over.body) || {}) });
}

function env(over) {
  return Object.assign({
    DB: makeDB(SCHEMA),
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: WHSEC,
    PRICE_CENTS: '199',           // a wrangler var is a STRING, as it will be in production
    CURRENCY: 'eur',
    PRODUCT_NAME: 'Blendo x5 Boost',
    SITE: 'https://blendo.monster',
    GOOGLE_CLIENT_ID: CLIENT_ID,
  }, over || {});
}

// ===== THE STRIPE STUB =====
// It records what we SENT, which is the whole point: «a session was opened» says nothing
// about the amount that will be charged, and the amount is the thing the client must not own.
let stripeCalls = [];
let stripeReply = null;
let jwksCalls = 0;
let jwksServe = null;          // the key set Google is pretending to publish right now
globalThis.fetch = async (u, init) => {
  // ⚠️ GOOGLE'S KEY SET IS SERVED FROM HERE, AND THE CALLS ARE COUNTED: «an unknown kid re-fetches
  // ONCE» is a statement about how many times we ask, and nothing else can observe it.
  if (String(u).indexOf('googleapis.com') >= 0) {
    jwksCalls++;
    return new Response(JSON.stringify({ keys: jwksServe || [] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const body = String((init && init.body) || '');
  stripeCalls.push({
    url: String(u),
    headers: Object.assign({}, (init && init.headers) || {}),
    body,
    p: new URLSearchParams(body),
  });
  if (stripeReply) return stripeReply();
  const n = stripeCalls.length;
  return new Response(JSON.stringify({ id: 'cs_test_' + n, url: 'https://checkout.stripe.com/c/pay/cs_test_' + n }),
    { status: 200, headers: { 'content-type': 'application/json' } });
};

async function call(worker, e, p, opts) {
  const o = opts || {};
  const init = { method: o.method || 'POST' };
  if (o.raw !== undefined) { init.body = o.raw; }
  else if (o.body !== undefined) { init.body = JSON.stringify(o.body); init.headers = { 'content-type': 'application/json' }; }
  if (o.headers) init.headers = Object.assign(init.headers || {}, o.headers);
  const res = await worker.fetch(new Request('https://pay.test' + p, init), e);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (err) {}
  return { status: res.status, json, text, res };
}

// A whole webhook delivery, signed the way Stripe signs one.
async function deliver(worker, e, ev, opts) {
  const o = opts || {};
  const raw = o.raw !== undefined ? o.raw : JSON.stringify(ev);
  const t = o.t || now();
  const header = o.header !== undefined ? o.header : await stripeSig(o.secret || WHSEC, t, o.signOver !== undefined ? o.signOver : raw);
  return call(worker, e, '/v1/webhook', { raw, headers: { 'stripe-signature': header } });
}
let sesN = 0, evtN = 0;
const session = (over) => Object.assign({
  id: 'cs_live_' + (++sesN),
  payment_status: 'paid',
  amount_total: 199,
  currency: 'eur',
  client_reference_id: 'gidpay000001',
  metadata: { gid: 'gidpay000001', pid: 'bundle5' },
}, over || {});
const evt = (type, ses, id) => ({ id: id || 'evt_' + (++evtN), type, data: { object: ses } });
const rows = (e, gid) => e.DB._raw.prepare('SELECT * FROM ent WHERE gid = ? ORDER BY rowid').all(gid);

(async () => {
  // The worker path can be substituted (break.js runs a PATCHED copy).
  const src = process.env.PAY_SRC
    ? require('url').pathToFileURL(process.env.PAY_SRC).href : '../src/index.js';
  const worker = (await import(src)).default;

  // One RSA pair for the whole run; `jwksServe` is what Google is publishing at this moment.
  {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    GKEY = { priv: pair.privateKey, jwk };
    jwksServe = [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }];
  }

  // ===== 1. THE PRICE IS THE SERVER'S =====
  // A browser that could name its own amount would name zero. The request names the PRODUCT.
  {
    const e = env(); stripeCalls = [];
    const gid = 'gidprice0001', t = now();
    const r = await call(worker, e, '/v1/checkout',
      { body: { id: gid, t, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t), k: KEY_A, cents: 1, amount: 1, unit_amount: 1 } });
    const c = stripeCalls[0];
    expect(r.json && r.json.ok === 1 && !!r.json.url && c
      && c.p.get('line_items[0][price_data][unit_amount]') === '199',
      'THE PRICE IS OURS: the client sent cents:1, the session charges '
      + (c && c.p.get('line_items[0][price_data][unit_amount]')) + ' ' + (c && c.p.get('line_items[0][price_data][currency]')));

    // The gid is the ONLY link between a payment and a player, and it must survive the round trip.
    expect(c && c.p.get('metadata[gid]') === gid && c.p.get('client_reference_id') === gid
      && c.p.get('metadata[pid]') === 'bundle5',
      'THE PLAYER TRAVELS IN THE METADATA: gid ' + (c && c.p.get('metadata[gid]'))
      + ', pid ' + (c && c.p.get('metadata[pid]')) + ', client_reference_id ' + (c && c.p.get('client_reference_id')));

    // VAT lives INSIDE the price he set — his own decision, and Stripe Tax is on the account.
    expect(c && c.p.get('automatic_tax[enabled]') === 'true'
      && c.p.get('line_items[0][price_data][tax_behavior]') === 'inclusive',
      'VAT IS INSIDE THE PRICE: automatic_tax ' + (c && c.p.get('automatic_tax[enabled]'))
      + ', tax_behavior ' + (c && c.p.get('line_items[0][price_data][tax_behavior]')));

    // ⚠️ Naming the methods here would FREEZE the list in code and silently switch off
    // whatever he turns on in the dashboard later (MB WAY, Klarna, Revolut Pay are on today).
    const named = [...c.p.keys()].filter((k) => k.indexOf('payment_method_types') === 0);
    expect(named.length === 0,
      'THE DASHBOARD DECIDES THE METHODS: payment_method_types sent ' + named.length + ' times');

    // The label on the button and the amount on the card are one number, answered by one place.
    const price = await call(worker, e, '/v1/price', { method: 'GET' });
    expect(price.json && price.json.ok === 1
      && String(price.json.cents) === c.p.get('line_items[0][price_data][unit_amount]')
      && price.json.currency === c.p.get('line_items[0][price_data][currency]'),
      'THE LABEL AND THE CHARGE CANNOT DRIFT: /v1/price says ' + (price.json && price.json.cents)
      + ' ' + (price.json && price.json.currency) + ', the session charges '
      + c.p.get('line_items[0][price_data][unit_amount]') + ' '
      + c.p.get('line_items[0][price_data][currency]'));
  }

  // ===== 2. THE IDEMPOTENCY KEY IS THE CLIENT'S OWN SIGNED SECOND =====
  // Stripe replays the cached response for 24h on a repeated key. With a wall-clock MINUTE
  // bucket a player who paid at :30 and clicked again at :50 is handed the URL of the session
  // he has ALREADY PAID. One tap is one `t`.
  {
    const e = env(); stripeCalls = [];
    const gid = 'gididem00001', t1 = now(), t2 = t1 - 45;
    await call(worker, e, '/v1/checkout', { body: { id: gid, t: t1, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t1), k: KEY_A } });
    await call(worker, e, '/v1/checkout', { body: { id: gid, t: t1, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t1) } });
    await call(worker, e, '/v1/checkout', { body: { id: gid, t: t2, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t2) } });
    const k = stripeCalls.map((c) => c.headers['idempotency-key']);
    expect(k.length === 3 && k[0] === k[1] && k[1] !== k[2] && k[0] === gid + '-' + t1,
      'THE IDEMPOTENCY KEY IS THE SIGNED SECOND: same tap -> same key, a tap 45 s later -> a new one ('
      + k.join(' | ') + ')');
  }

  // ===== 3. THE IDENTITY: TRUST ON FIRST USE, AND NEVER OVERWRITTEN =====
  {
    const e = env(); stripeCalls = [];
    const gid = 'gidkey000001';
    const t1 = now();
    const first = await call(worker, e, '/v1/checkout', { body: { id: gid, t: t1, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t1), k: KEY_A } });
    expect(first.json && first.json.ok === 1,
      'TOFU: the first contact registers the key and the call goes through (ok '
      + (first.json && first.json.ok) + ')');

    // ⛔⛔ THE HOLE THE SIZE OF THE WHOLE PROTECTION: if a second key were accepted for a known
    // gid, anyone could overwrite somebody else's key and take their purchases.
    const t2 = now();
    const stolen = await call(worker, e, '/v1/checkout', { body: { id: gid, t: t2, sig: await sigFor(KEY_B, gid, 'checkout.bundle5', t2), k: KEY_B } });
    const still = await call(worker, e, '/v1/checkout', { body: { id: gid, t: t2, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t2) } });
    expect(stolen.status === 401 && stolen.json && stolen.json.err === 'sig'
      && still.json && still.json.ok === 1,
      'THE KEY IS NEVER OVERWRITTEN: a foreign key is refused (' + stolen.status + ' '
      + (stolen.json && stolen.json.err) + ') while the real one still works (ok '
      + (still.json && still.json.ok) + ')');

    // A signature for one endpoint must never be replayable on another: `what` is in the string.
    const t3 = now();
    const replay = await call(worker, e, '/v1/checkout', { body: { id: gid, t: t3, sig: await sigFor(KEY_A, gid, 'mine', t3) } });
    expect(replay.status === 401 && replay.json && replay.json.err === 'sig',
      'ONE SIGNATURE, ONE ENDPOINT: a /v1/mine signature sent to /v1/checkout -> '
      + replay.status + ' ' + (replay.json && replay.json.err));

    // The window is what stops a captured request being replayed for ever.
    const old = now() - 4000;
    const stale = await call(worker, e, '/v1/checkout', { body: { id: gid, t: old, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', old) } });
    expect(stale.json && stale.json.err === 'skew',
      'THE CLOCK WINDOW: a signature an hour old -> ' + (stale.json && stale.json.err));

    // An unknown gid with no key offered cannot be answered at all — and it is a 400, not a 401:
    // the client's own cure is to send `k`, and it must be able to tell the two apart.
    const t4 = now();
    const nokey = await call(worker, e, '/v1/checkout', { body: { id: 'gidunknown01', t: t4, sig: await sigFor(KEY_A, 'gidunknown01', 'checkout.bundle5', t4) } });
    expect(nokey.status === 400 && nokey.json && nokey.json.err === 'nokey',
      'NO KEY, NO ANSWER: an unknown gid with no k -> ' + nokey.status + ' ' + (nokey.json && nokey.json.err));
  }

  // ===== 4. A CHECKOUT WITHOUT A SECRET IS NOT ATTEMPTED =====
  {
    const e = env({ STRIPE_SECRET_KEY: '' }); stripeCalls = [];
    const gid = 'gidnosk00001', t = now();
    const r = await call(worker, e, '/v1/checkout', { body: { id: gid, t, sig: await sigFor(KEY_A, gid, 'checkout.bundle5', t), k: KEY_A } });
    expect(r.status === 503 && r.json && r.json.err === 'nokeyserver' && stripeCalls.length === 0,
      'NO STRIPE KEY: 503 and Stripe is not called at all (' + r.status + ' '
      + (r.json && r.json.err) + ', calls ' + stripeCalls.length + ')');
  }

  // ===== 5. THE WEBHOOK IS THE ONLY PLACE THAT MAY GRANT =====
  {
    const e = env();
    const ses = session();
    const r = await deliver(worker, e, evt('checkout.session.completed', ses));
    const got = rows(e, 'gidpay000001');
    expect(r.json && r.json.granted === 1 && got.length === 1 && got[0].sid === ses.id
      && got[0].amt === 199 && got[0].cur === 'eur' && got[0].cl === 0,
      'A PAID SESSION GRANTS: 1 row, sid ' + (got[0] && got[0].sid) + ', amt '
      + (got[0] && got[0].amt) + ' ' + (got[0] && got[0].cur) + ', unclaimed');
  }
  {
    // ⚠️ A DELAYED METHOD (MB WAY, a bank debit) COMPLETES THE SESSION *UNPAID*. Granting on
    // `completed` alone would hand the boost to somebody whose payment can still fail.
    const e = env();
    const ses = session({ payment_status: 'unpaid' });
    const r = await deliver(worker, e, evt('checkout.session.completed', ses));
    expect(r.json && r.json.pending === 1 && rows(e, 'gidpay000001').length === 0,
      'AN UNPAID SESSION GRANTS NOTHING: ' + JSON.stringify(r.json) + ', rows ' + rows(e, 'gidpay000001').length);

    // ...and the money that arrives later DOES grant — ignoring this event would never pay a real one.
    const r2 = await deliver(worker, e, evt('checkout.session.async_payment_succeeded', session({ id: ses.id })));
    expect(r2.json && r2.json.granted === 1 && rows(e, 'gidpay000001').length === 1,
      'THE DELAYED MONEY GRANTS: async_payment_succeeded -> rows ' + rows(e, 'gidpay000001').length);
  }
  {
    // ⚠️⚠️ THE WHOLE IDEMPOTENCE: Stripe retries until it gets a 2xx and may deliver the same
    // event twice at any time. A row per DELIVERY would be two boosts for one payment.
    const e = env();
    const ses = session();
    await deliver(worker, e, evt('checkout.session.completed', ses, 'evt_1'));
    await deliver(worker, e, evt('checkout.session.completed', ses, 'evt_2'));
    await deliver(worker, e, evt('checkout.session.async_payment_succeeded', ses, 'evt_3'));
    expect(rows(e, 'gidpay000001').length === 1,
      'ONE PAYMENT, ONE ROW: three deliveries of one session -> rows ' + rows(e, 'gidpay000001').length);
  }
  {
    const e = env();
    const ses = session();
    const raw = JSON.stringify(evt('checkout.session.completed', ses));
    const tampered = raw.replace('"amount_total":199', '"amount_total":1');
    const r = await deliver(worker, e, null, { raw: tampered, signOver: raw });
    expect(r.status === 400 && r.json && r.json.err === 'sig' && rows(e, 'gidpay000001').length === 0,
      'THE SIGNATURE IS OVER THE RAW BODY: a tampered amount -> ' + r.status + ' '
      + (r.json && r.json.err) + ', rows ' + rows(e, 'gidpay000001').length);
  }
  {
    const e = env();
    const r = await deliver(worker, e, evt('checkout.session.completed', session()), { t: now() - 4000 });
    expect(r.status === 400 && r.json && r.json.err === 'skew' && rows(e, 'gidpay000001').length === 0,
      'A CAPTURED DELIVERY CANNOT BE REPLAYED: an hour-old signature -> ' + r.status + ' '
      + (r.json && r.json.err) + ', rows ' + rows(e, 'gidpay000001').length);
  }
  {
    // ⛔⛔ AN UNCONFIGURED WORKER MUST REFUSE *CLEANLY*, AND THE WORD «cleanly» IS THE PROPERTY.
    // Measured: with the secret unset the verification imports a zero-length HMAC key, and
    // WebCrypto refuses that by spec — so without the guard the worker does not fool itself, it
    // THROWS on every delivery (a 500 with a stack and no word about the cause). The arm therefore
    // catches the exception and demands the STATED refusal: «rows 0» alone is also true of a crash.
    const e = env({ STRIPE_WEBHOOK_SECRET: '' });
    let r = null, threw = '';
    try { r = await deliver(worker, e, evt('checkout.session.completed', session()), { secret: '' }); }
    catch (err) { threw = (err && err.name) || 'throw'; }
    expect(!threw && r && r.status === 503 && r.json && r.json.err === 'nosecret'
      && rows(e, 'gidpay000001').length === 0,
      'AN UNCONFIGURED WEBHOOK REFUSES CLEANLY: ' + (threw ? 'THREW ' + threw : (r.status + ' ' + (r.json && r.json.err)))
      + ', rows ' + rows(e, 'gidpay000001').length);
  }
  {
    // ⛔ A payment link made by hand in the dashboard — or any other session on this account —
    // must not grant our boost merely by carrying a client_reference_id that looks like a gid.
    const e = env();
    const r = await deliver(worker, e, evt('checkout.session.completed', session({ metadata: { gid: 'gidpay000001' } })));
    const r2 = await deliver(worker, e, evt('checkout.session.completed', session({ metadata: { gid: 'gidpay000001', pid: 'something_else' } })));
    expect(r.json && r.json.ignored === 'pid' && r2.json && r2.json.ignored === 'pid'
      && rows(e, 'gidpay000001').length === 0,
      'THE PRODUCT MUST BE NAMED BY US: no pid and a foreign pid both ignored ('
      + (r.json && r.json.ignored) + ', ' + (r2.json && r2.json.ignored) + '), rows '
      + rows(e, 'gidpay000001').length);
  }
  {
    // Money taken and nobody to give it to. 2xx on purpose: a retry cannot conjure a gid, and a
    // 5xx would make Stripe hammer this endpoint for three days over an unattributable payment.
    const e = env();
    const r = await deliver(worker, e, evt('checkout.session.completed',
      session({ client_reference_id: '', metadata: { pid: 'bundle5' } })));
    const all = e.DB._raw.prepare('SELECT COUNT(*) c FROM ent').get();
    expect(r.status === 200 && r.json && r.json.nogid === 1 && all.c === 0,
      'A PAID SESSION WITH NO PLAYER: ' + r.status + ' ' + JSON.stringify(r.json)
      + ', rows in the whole table ' + all.c);
  }
  {
    const e = env();
    const r = await deliver(worker, e, evt('payment_intent.succeeded', session()));
    expect(r.json && r.json.ok === 1 && typeof r.json.ignored === 'string'
      && e.DB._raw.prepare('SELECT COUNT(*) c FROM ent').get().c === 0,
      'A FOREIGN EVENT TYPE IS ANSWERED 2xx AND IGNORED: ' + JSON.stringify(r.json));
  }

  // ===== 6. WHAT THE PLAYER OWNS, AND TAKING IT =====
  const mineOf = async (worker, e, gid, key, opts) => {
    const t = (opts && opts.t) || now();
    const body = { id: gid, t, sig: await sigFor(key, gid, 'mine', t) };
    if (!opts || opts.k !== false) body.k = key;
    return call(worker, e, '/v1/mine', { body });
  };
  const claimOf = async (worker, e, gid, key, sids, opts) => {
    const t = (opts && opts.t) || now();
    const what = 'claim.' + sids.slice().sort().join(',');
    const body = { id: gid, t, sids: (opts && opts.send) || sids, sig: await sigFor(key, gid, what, t) };
    if (!opts || opts.k !== false) body.k = key;
    return call(worker, e, '/v1/claim', { body });
  };
  {
    const e = env();
    const A = 'gidownera001', B = 'gidownerb001';
    for (const [gid, sid, c] of [[A, 'cs_a1', 100], [A, 'cs_a2', 200], [A, 'cs_a3', 300], [B, 'cs_b1', 100]]) {
      e.DB._raw.prepare('INSERT INTO ent (sid,gid,pid,amt,cur,c,cl) VALUES (?,?,?,?,?,?,0)')
        .run(sid, gid, 'bundle5', 199, 'eur', c);
    }
    const m = await mineOf(worker, e, A, KEY_A);
    const got = (m.json && m.json.items) || [];
    expect(m.json && m.json.ok === 1 && got.length === 3
      && got.map((x) => x.sid).join(',') === 'cs_a1,cs_a2,cs_a3',
      'MINE IS MINE: ' + got.length + ' rows, [' + got.map((x) => x.sid).join(',')
      + '], the other player is not in them');

    // ⚠️⚠️ A POST AND NOT A GET, THOUGH IT ONLY READS: on the first contact the request carries
    // `k`, the player's HMAC key, and a query string is written into edge logs, `wrangler tail`
    // and the browser's history. A GET must not be served at all, or a client falls back to it.
    const asGet = await call(worker, e, '/v1/mine?id=' + A + '&t=' + now() + '&k=' + KEY_A, { method: 'GET' });
    expect(asGet.status === 404 && asGet.json && asGet.json.err === 'route',
      'THE KEY NEVER RIDES IN A URL: GET /v1/mine -> ' + asGet.status + ' ' + (asGet.json && asGet.json.err));

    // The count is what the client shows the player, and it comes from D1's `meta.changes`.
    const c1 = await claimOf(worker, e, A, KEY_A, ['cs_a1', 'cs_a2'], { send: ['cs_a2', 'cs_a1'] });
    const left = ((await mineOf(worker, e, A, KEY_A)).json || {}).items || [];
    expect(c1.json && c1.json.claimed === 2 && left.length === 1 && left[0].sid === 'cs_a3',
      'A CLAIM TAKES EXACTLY THE ROWS NAMED: claimed ' + (c1.json && c1.json.claimed)
      + ', left ' + left.length + ' [' + left.map((x) => x.sid).join(',')
      + '] — and the sids were sent in a different order than they were signed');

    // A repeated claim must be a no-op: the network can deliver one twice.
    const c2 = await claimOf(worker, e, A, KEY_A, ['cs_a1', 'cs_a2']);
    expect(c2.json && c2.json.claimed === 0,
      'A REPEATED CLAIM IS A NO-OP: claimed ' + (c2.json && c2.json.claimed));

    // ⛔ `AND gid = ?` is load-bearing: B signs honestly with B's own key, and still cannot
    // close A's row. Without that term a stranger could burn every purchase in the table.
    const c3 = await claimOf(worker, e, B, KEY_B, ['cs_a3']);
    const stillMine = ((await mineOf(worker, e, A, KEY_A)).json || {}).items || [];
    expect(c3.json && c3.json.claimed === 0 && stillMine.length === 1 && stillMine[0].sid === 'cs_a3',
      "A CLAIM CANNOT REACH ANOTHER PLAYER'S ROW: B claimed " + (c3.json && c3.json.claimed)
      + ", A still holds " + stillMine.length + ' [' + stillMine.map((x) => x.sid).join(',') + ']');

    // An unsigned or wrongly signed claim takes nothing.
    const t = now();
    const forged = await call(worker, e, '/v1/claim',
      { body: { id: A, t, sids: ['cs_a3'], sig: await sigFor(KEY_B, A, 'claim.cs_a3', t) } });
    expect(forged.status === 401 && forged.json && forged.json.err === 'sig'
      && ((await mineOf(worker, e, A, KEY_A)).json || {}).items.length === 1,
      'A FORGED CLAIM TAKES NOTHING: ' + forged.status + ' ' + (forged.json && forged.json.err));
  }

  // ===== 7. THE TRANSPORT CONVENTION =====
  // Success is a BODY FIELD and never a status, and the body is never empty — the same rule the
  // leaderboard is written to, for the same reason (a client doing `fetch().then(r=>r.json())`
  // without checking `res.ok` reads an empty body as a failure).
  {
    const e = env();
    const bad = await call(worker, e, '/v1/nope', { method: 'GET' });
    const opt = await call(worker, e, '/v1/mine', { method: 'OPTIONS' });
    expect(bad.text.length > 2 && bad.json && bad.json.err === 'route'
      && bad.res.headers.get('access-control-allow-origin') === '*'
      && opt.status === 204 && opt.res.headers.get('access-control-allow-methods').indexOf('POST') >= 0,
      'CORS AND A NON-EMPTY BODY: 404 body ' + bad.text + ', preflight ' + opt.status
      + ' [' + opt.res.headers.get('access-control-allow-methods') + ']');
  }

  // ===== 8. ONE PRICE, ONE PRODUCT — ACROSS THREE FILES =====
  // ⚠️⚠️ THE BUTTON, THE CONFIG AND THE WEBHOOK ARE THREE COPIES OF TWO NUMBERS, AND THIS PROJECT
  // HAS PAID FOR THAT SHAPE REPEATEDLY (the trim table, the manifest colour, the menu insets). Here
  // the price the player is SHOWN lives in the game (`STAR_BUNDLES`), the price he is CHARGED in the
  // worker's vars, and the product the webhook agrees to grant in the worker's own `PID`. A drift
  // between the first two shows the wrong number on the card; between the last two it silently
  // ignores every real payment. The arm is node-side: it reads the three files as they ship.
  {
    const cfg = fs.readFileSync(CFG_PATH, 'utf8');
    const toml = fs.readFileSync(TOML_PATH, 'utf8');
    const srcTxt = fs.readFileSync(SRC_PATH, 'utf8');
    const bundle = cfg.match(/\{\s*id:\s*'([^']+)',\s*usd:\s*([0-9.]+)/);
    const site = toml.match(/^SITE\s*=\s*"([^"]+)"/m);
    const paySite = cfg.match(/const PAY_SITE = '([^']+)'/);
    const payUrl = cfg.match(/const PAY_URL = '([^']+)'/);
    const route = toml.match(/^pattern = "([^"]+)"/m);
    const cents = toml.match(/^PRICE_CENTS\s*=\s*"([^"]+)"/m);
    const cur = toml.match(/^CURRENCY\s*=\s*"([^"]+)"/m);
    const pid = srcTxt.match(/const PID = '([^']+)'/);
    const ok = bundle && cents && cur && pid
      && bundle[1] === pid[1]
      && Math.round(Number(bundle[2]) * 100) === Number(cents[1]);
    expect(ok, 'ONE PRICE, ONE PRODUCT: the game offers ' + (bundle && bundle[1]) + ' at '
      + (bundle && bundle[2]) + ', the worker charges ' + (cents && cents[1]) + ' '
      + (cur && cur[1]) + ' and grants only ' + (pid && pid[1])
      // ⚠️ NAMED AND NOT ASSERTED: the game's field is called `usd` while the account charges EUR.
      // The web provider is not written yet; when it is, the label must take the currency from the
      // provider's own catalogue (/v1/price answers it) instead of a dollar sign in the markup.
      + '  [the label still says USD — the web provider must read the currency from /v1/price]');

    // ⚠️⚠️ THE RETURN ORIGIN IS A GATE IN TWO FILES. The worker sends the player to its `SITE`
    // after Stripe; the client offers the web provider ONLY on `PAY_SITE` (83-pay), because a
    // purchase that returns to another origin lands in another localStorage under another
    // `Save.gid` — money taken, grant unreachable. Two strings, one meaning, and nothing else in
    // the project compares them. The address is the same kind of pair: the client calls
    // `PAY_URL`, the worker answers on its route.
    const sameSite = site && paySite && site[1] === paySite[1];
    const sameHost = payUrl && route && payUrl[1] === 'https://' + route[1];
    expect(sameSite && sameHost,
      'ONE RETURN ORIGIN, ONE ADDRESS: the worker returns to ' + (site && site[1])
      + ' and the client offers itself on ' + (paySite && paySite[1])
      + '; the client calls ' + (payUrl && payUrl[1]) + ' and the worker answers on '
      + (route && route[1]));
  }

  // ===== 9. GOOGLE SIGN-IN — THE ACCOUNT → IDENTITY MAPPING =====
  // The design and every trap: docs/GOOGLE-AUTH.md. The three questions these arms are written
  // against: can a stranger claim somebody else's identity; can two accounts share one; and does
  // the KEY travel with the id (without it the second device is locked out of both services).
  {
    const e = env();

    // --- the honest first sign-in: the account is created and the pair is this device's ---
    const gidA = 'gidauth00001', subA = 'sub-alice';
    const okTok = await mint({ claims: { sub: subA } });
    const r1 = await authCall(worker, e, gidA, KEY_A, okTok);
    const accA = e.DB._raw.prepare('SELECT * FROM acc WHERE sub = ?').get(subA);
    const pkA = e.DB._raw.prepare('SELECT * FROM pk WHERE gid = ?').get(gidA);
    expect(r1.json && r1.json.ok === 1 && r1.json.fresh === 1 && r1.json.gid === gidA
      && r1.json.k === KEY_A && r1.json.name === 'Иван Игрок'
      && accA && accA.gid === gidA && accA.k === KEY_A
      // ⚠️ THE PAIR, NOT THE ID: `acc.k` must equal what the key table anchored, or the second
      // device generates a fresh key and both services answer 401 for ever.
      && pkA && pkA.k === accA.k,
      'A FRESH ACCOUNT KEEPS THIS DEVICE: fresh ' + (r1.json && r1.json.fresh)
      + ', acc {' + (accA && accA.gid) + ', ' + (accA && accA.k.slice(0, 6)) + '…}'
      + ', pk ' + (pkA && pkA.k.slice(0, 6)) + '…  [acc.k === pk.k: '
      + !!(accA && pkA && accA.k === pkA.k) + ']');

    // --- THE PHOTO PASSES THROUGH AND IS NEVER STORED (his word 2026-09-12) ---
    // ⚡ The circle in the menu shows the account's photo; the URL reaches the device through this
    // reply. ⛔⛔ TWO PROPERTIES, AND THE SECOND IS A SECURITY ONE: an `aud`-valid token still
    // carries whatever `picture` its issuer put in it, and that string goes straight into an
    // `<img src>` on our own page — so only Google's own CDN is passed on. And `acc` must NOT grow
    // a column for it: the device needs it, this table does not.
    {
      const picTok = await mint({ claims: { sub: 'sub-pic', picture: 'https://lh3.googleusercontent.com/a/REAL=s96-c' } });
      const rp = await authCall(worker, e, 'gidauthpic01', KEY_A, picTok);
      const evilTok = await mint({ claims: { sub: 'sub-evil', picture: 'https://evil.example/track.gif' } });
      const re = await authCall(worker, e, 'gidauthevil1', KEY_A, evilTok);
      const rowP = e.DB._raw.prepare('SELECT * FROM acc WHERE sub = ?').get('sub-pic');
      const cols = Object.keys(rowP || {});
      expect(rp.json && rp.json.pic === 'https://lh3.googleusercontent.com/a/REAL=s96-c'
        && re.json && re.json.ok === 1 && !re.json.pic
        && cols.length > 0 && cols.indexOf('pic') < 0 && cols.indexOf('picture') < 0,
        'THE PHOTO PASSES THROUGH GOOGLE-ONLY AND IS NEVER STORED: ours ' + (rp.json && rp.json.pic)
        + ', a foreign host ' + JSON.stringify(re.json && re.json.pic) + ', acc columns ['
        + cols.join(', ') + ']');
    }

    // --- the second device: the SAME account, a fresh gid and a fresh key of its own ---
    const gidB = 'gidauth00002';
    const r2 = await authCall(worker, e, gidB, KEY_B, await mint({ claims: { sub: subA } }));
    expect(r2.json && r2.json.ok === 1 && r2.json.fresh === 0
      && r2.json.gid === gidA && r2.json.k === KEY_A,
      'A SECOND DEVICE IS HANDED THE PAIR: it asked as ' + gidB + ' and was answered '
      + (r2.json && r2.json.gid) + ' with the key ' + (r2.json && String(r2.json.k).slice(0, 6))
      + '… (fresh ' + (r2.json && r2.json.fresh) + ')');

    // --- ⛔⛔ TRAP 4: A STRANGER CANNOT CLAIM A GID, AND THE VICTIM IS THE REALISTIC ONE ---
    // ⚠️⚠️ THE VICTIM HAS BOUGHT SOMETHING AND NEVER SIGNED IN — that is the state most players are
    // in, and the one where trap 5's `bound` check cannot help, because there is no account row to
    // collide with. Unsigned, `ownerKey` hands the attacker the victim's REAL key (it is already in
    // `pk`) and the mapping binds it to the attacker's `sub`: a working key for BOTH services.
    // Staged through the PRODUCTION path — a signed `/v1/mine` is how a purchasing client anchors
    // its key — because a row inserted by hand would prove the exploit against a fixture.
    const victim = 'gidvictim001', vKey = KEY_B;
    {
      const t = now();
      await call(worker, e, '/v1/mine', { body: { id: victim, t, sig: await sigFor(vKey, victim, 'mine', t), k: vKey } });
    }
    const anchored = e.DB._raw.prepare('SELECT k FROM pk WHERE gid = ?').get(victim);
    const evilKey = 'c'.repeat(64);
    const bad = await authCall(worker, e, victim, evilKey, await mint({ claims: { sub: 'sub-mallory' } }));
    const stole = e.DB._raw.prepare('SELECT * FROM acc WHERE sub = ?').get('sub-mallory');
    const pkIntact = e.DB._raw.prepare('SELECT k FROM pk WHERE gid = ?').get(victim);
    expect(anchored && anchored.k === vKey && bad.status === 401 && bad.json && bad.json.err === 'sig'
      // ⚠️ THE PAYLOAD OF THE EXPLOIT IS THE KEY IN THE ANSWER, so its absence is asserted by name
      // and not merely inferred from the status.
      && !bad.json.k && !stole && pkIntact && pkIntact.k === vKey,
      'A FOREIGN GID CANNOT BE CLAIMED: the victim had bought (pk ' + (anchored && anchored.k.slice(0, 6))
      + '…), the stranger got ' + bad.status + ' ' + (bad.json && bad.json.err)
      + ' with no key in the answer, rows for him: ' + (stole ? 1 : 0)
      + ', the victim\'s key still ' + (pkIntact && pkIntact.k.slice(0, 6)) + '…');

    // --- ⛔⛔ TRAP 5: TWO GOOGLE ACCOUNTS, ONE IDENTITY — the shared phone ---
    // The child signs in on the parent's phone. Without the refusal his account binds to the
    // parent's identity for ever and his own phone then receives the parent's purchases.
    const child = await authCall(worker, e, gidA, KEY_A, await mint({ claims: { sub: 'sub-child' } }));
    const stillA = e.DB._raw.prepare('SELECT * FROM acc WHERE gid = ?').all(gidA);
    expect(child.status === 409 && child.json && child.json.err === 'bound'
      && stillA.length === 1 && stillA[0].sub === subA,
      'ONE IDENTITY, ONE ACCOUNT: ' + child.status + ' ' + (child.json && child.json.err)
      + ', rows on that gid: ' + stillA.length + ' (owner ' + (stillA[0] && stillA[0].sub) + ')');

    // --- the token's own three refusals, each on a REAL signature over a wrong claim ---
    const g3 = 'gidauth00003';
    const wrongAud = await authCall(worker, e, g3, KEY_A, await mint({ claims: { sub: 's3', aud: 'someone-else.apps.googleusercontent.com' } }));
    const wrongIss = await authCall(worker, e, g3, KEY_A, await mint({ claims: { sub: 's3', iss: 'https://evil.example' } }));
    const expired  = await authCall(worker, e, g3, KEY_A, await mint({ claims: { sub: 's3', exp: now() - 3600 } }));
    // A token signed by a DIFFERENT RSA key, i.e. an outright forgery with a valid shape.
    const other = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']);
    const forged = await authCall(worker, e, g3, KEY_A, await mint({ claims: { sub: 's3' }, priv: other.privateKey }));
    const none = e.DB._raw.prepare('SELECT COUNT(*) c FROM acc WHERE gid = ?').get(g3);
    expect(wrongAud.json && wrongAud.json.err === 'aud' && wrongIss.json && wrongIss.json.err === 'iss'
      && expired.json && expired.json.err === 'expired' && forged.json && forged.json.err === 'token'
      && none.c === 0,
      'THE TOKEN IS VERIFIED, NOT TRUSTED: aud ' + (wrongAud.json && wrongAud.json.err)
      + ', iss ' + (wrongIss.json && wrongIss.json.err) + ', exp ' + (expired.json && expired.json.err)
      + ', forged ' + (forged.json && forged.json.err) + ', rows written ' + none.c);

    // --- BOTH forms of `iss` are legitimate, and accepting one is a sign-in that works until it doesn't ---
    const g4 = 'gidauth00004';
    const shortIss = await authCall(worker, e, g4, KEY_A, await mint({ claims: { sub: 's4', iss: 'accounts.google.com' } }));
    expect(shortIss.json && shortIss.json.ok === 1 && shortIss.json.gid === g4,
      'BOTH ISSUER FORMS PASS: `accounts.google.com` → ' + (shortIss.json && (shortIss.json.err || 'ok')));

    // --- a key ROTATION is not a forgery: one re-fetch, then the sign-in goes through ---
    const before = jwksCalls;
    const rot = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']);
    const rotJwk = await crypto.subtle.exportKey('jwk', rot.publicKey);
    jwksServe = jwksServe.concat([{ kid: 'k2', kty: 'RSA', alg: 'RS256', use: 'sig', n: rotJwk.n, e: rotJwk.e }]);
    const g5 = 'gidauth00005';
    const rotated = await authCall(worker, e, g5, KEY_A,
      await mint({ kid: 'k2', priv: rot.privateKey, claims: { sub: 's5' } }));
    expect(rotated.json && rotated.json.ok === 1 && jwksCalls === before + 1,
      'AN UNKNOWN kid IS A ROTATION: ' + (rotated.json && (rotated.json.err || 'ok'))
      + ' after ' + (jwksCalls - before) + ' extra fetch(es) of the key set');

    // --- ⚠️⚠️ THE COMMON PRODUCTION PATH: A DEVICE THAT IS ALREADY REGISTERED SENDS NO KEY ---
    // A player who has bought something anchored his key long ago, so the client stops sending it
    // (a secret on the wire is a secret on the wire). The mapping must still store the key the
    // signature was VERIFIED with — take it from the request body and a registered device writes an
    // EMPTY key into the account, and every later device is handed nothing.
    const g7 = 'gidauth00007';
    {
      const t = now();
      await call(worker, e, '/v1/mine', { body: { id: g7, t, sig: await sigFor(KEY_B, g7, 'mine', t), k: KEY_B } });
    }
    const silent = await authCall(worker, e, g7, KEY_B, await mint({ claims: { sub: 's7' } }), { body: { k: undefined } });
    const acc7 = e.DB._raw.prepare('SELECT * FROM acc WHERE sub = ?').get('s7');
    expect(silent.json && silent.json.ok === 1 && silent.json.k === KEY_B
      && acc7 && acc7.k === KEY_B,
      'THE KEY STORED IS THE ONE VERIFIED, NOT THE ONE SENT: the device sent none, the account holds '
      + (acc7 && String(acc7.k).slice(0, 6)) + '… and the answer carried '
      + (silent.json && String(silent.json.k || '(empty)').slice(0, 6)) + '…');

    // --- the client id is answered, in exactly one copy, and its absence is a clean refusal ---
    const cfg = await call(worker, e, '/v1/auth/cfg', { method: 'GET' });
    const blind = env({ GOOGLE_CLIENT_ID: '' });
    const noCid = await authCall(worker, blind, 'gidauth00006', KEY_A, await mint({ claims: { sub: 's6' } }));
    expect(cfg.json && cfg.json.cid === CLIENT_ID && noCid.status === 503
      && noCid.json && noCid.json.err === 'noclient',
      'ONE CLIENT ID, ANSWERED BY THE SERVER: /v1/auth/cfg → ' + (cfg.json && cfg.json.cid)
      + '; unset → ' + noCid.status + ' ' + (noCid.json && noCid.json.err));
  }

  console.log('\nTOTAL PASS: ' + pass + (fails.length ? ' | FAIL: ' + fails.length : ''));
  if (fails.length) { console.log('SUITE: FAIL — ' + fails.join(' || ')); process.exit(1); }
  console.log('SUITE: PASS');
})().catch((e) => { console.error('THE RUN FAILED:', e && e.stack || e); process.exit(1); });
