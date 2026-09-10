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

function env(over) {
  return Object.assign({
    DB: makeDB(SCHEMA),
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: WHSEC,
    PRICE_CENTS: '199',           // a wrangler var is a STRING, as it will be in production
    CURRENCY: 'eur',
    PRODUCT_NAME: 'Blendo x5 Boost',
    SITE: 'https://blendo.monster',
  }, over || {});
}

// ===== THE STRIPE STUB =====
// It records what we SENT, which is the whole point: «a session was opened» says nothing
// about the amount that will be charged, and the amount is the thing the client must not own.
let stripeCalls = [];
let stripeReply = null;
globalThis.fetch = async (u, init) => {
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

  console.log('\nTOTAL PASS: ' + pass + (fails.length ? ' | FAIL: ' + fails.length : ''));
  if (fails.length) { console.log('SUITE: FAIL — ' + fails.join(' || ')); process.exit(1); }
  console.log('SUITE: PASS');
})().catch((e) => { console.error('THE RUN FAILED:', e && e.stack || e); process.exit(1); });
