// TWO-WAY GUARD CHECK: `node server/pay/test/break.js`
// ⚠️ By the project canon a guard is NOT DELIVERED until it has been shown to GO RED on a
// broken build and to be GREEN on a healthy one. A one-way run «green on the healthy one»
// does not protect against a tautology, «red on the broken one» — against a flake.
//
// Every sabotage hits ONE property and must bring down EXACTLY the assert that states it.
// If a sabotage brings down someone else's assert, the guard measures not what it names.
//
// ⚠️ The patch is checked for APPLICABILITY (the line is found): sabotages go stale together
// with the production line, and a silently diverged anchor gives a run over the HEALTHY build
// — that is, a page of confident greens about nothing.
//
// ⛔ ONE PROPERTY HERE CANNOT BE SABOTAGED FROM THIS SIDE, AND IT IS SAID RATHER THAN HIDDEN:
// «one signature, one endpoint». The endpoint's name is part of the SIGNED STRING, so a build
// that drops it has a different signing contract — every call in the suite would fail its
// signature and every arm would go red, which proves nothing about that one arm. The arm stands
// as a positive statement (a /v1/mine signature is refused at /v1/checkout) with no red twin.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const RUN = path.join(__dirname, 'run.js');
// ⚠️ A SABOTAGE MAY LIVE IN ANY OF THE THREE FILES THE GUARDS READ, and each is patched into a COPY
// under the system temp dir — the tree's own files are never touched (a run that edits the live
// artefact lies about itself: its own death then looks like somebody else's stale line).
const FILES = {
  src: { path: path.join(DIR, 'src', 'index.js'), env: 'PAY_SRC', name: 'index.js' },
  toml: { path: path.join(DIR, 'wrangler.toml'), env: 'PAY_TOML', name: 'wrangler.toml' },
  cfg: { path: path.join(DIR, '..', '..', 'src', 'app', '00-config.js'), env: 'PAY_CFG', name: '00-config.js' },
};
for (const k of Object.keys(FILES)) FILES[k].text = fs.readFileSync(FILES[k].path, 'utf8');
const SRC = FILES.src.text;

const SABOTAGE = [
  // ===== the price and the session =====
  { name: 'the CLIENT names the price (the amount comes out of the request body)',
    find: 'const s = await createSession(env, gid, chk.ts);',
    repl: 'const s = await createSession(Object.assign({}, env, { PRICE_CENTS: (b && b.cents) || env.PRICE_CENTS }), gid, chk.ts);',
    expect: 'THE PRICE IS OURS' },
  { name: 'VAT is ADDED ON TOP instead of living inside the price',
    find: "body.set('line_items[0][price_data][tax_behavior]', 'inclusive');",
    repl: "body.set('line_items[0][price_data][tax_behavior]', 'exclusive');",
    expect: 'VAT IS INSIDE THE PRICE' },
  { name: 'the payment methods are frozen in code (the dashboard stops deciding)',
    find: "body.set('automatic_tax[enabled]', 'true');",
    repl: "body.set('automatic_tax[enabled]', 'true');\n  body.set('payment_method_types[0]', 'card');",
    expect: 'THE DASHBOARD DECIDES THE METHODS' },
  { name: 'the idempotency key is a wall-clock minute again (a paid session handed back)',
    find: "'idempotency-key': gid + '-' + ts,",
    repl: "'idempotency-key': gid + '-' + Math.floor(nowSec() / 60),",
    expect: 'THE IDEMPOTENCY KEY IS THE SIGNED SECOND' },
  { name: 'Stripe is called even with no secret configured',
    find: "      if (!env.STRIPE_SECRET_KEY) return reply({ err: 'nokeyserver' }, 503);",
    repl: '      if (false) return reply({ err: 0 }, 503);',
    expect: 'NO STRIPE KEY' },

  // ===== the identity =====
  { name: 'the offered key is accepted for a KNOWN gid (anyone takes over the row)',
    find: 'if (row && row.k) return row.k;',
    repl: 'if (row && row.k) return isHex64(offered) ? offered : row.k;',
    expect: 'THE KEY IS NEVER OVERWRITTEN' },
  { name: "the client's clock window is removed (a captured request replays for ever)",
    find: "if (!Number.isFinite(ts) || Math.abs(nowSec() - ts) > SKEW_SEC) return { err: 'skew' };",
    repl: "if (!Number.isFinite(ts)) return { err: 'skew' };",
    expect: 'THE CLOCK WINDOW' },

  // ===== the webhook: the only place that may grant =====
  { name: 'an unconfigured webhook is not refused (it throws on a zero-length key instead)',
    find: "  if (!env.STRIPE_WEBHOOK_SECRET) return reply({ err: 'nosecret' }, 503);",
    repl: '  if (false) return reply({ err: 0 }, 503);',
    expect: 'AN UNCONFIGURED WEBHOOK REFUSES CLEANLY' },
  { name: "the webhook's own timestamp window is removed (a captured delivery replays)",
    find: "if (Math.abs(nowSec() - s.t) > SKEW_SEC) return reply({ err: 'skew' }, 400);",
    repl: "if (false) return reply({ err: 'skew' }, 400);",
    expect: 'A CAPTURED DELIVERY CANNOT BE REPLAYED' },
  { name: 'an UNPAID completed session grants (a delayed method pays the boost in advance)',
    find: "if (ses.payment_status !== 'paid') return reply({ ok: 1, pending: 1 });",
    repl: "if (false) return reply({ ok: 1, pending: 1 });",
    expect: 'AN UNPAID SESSION GRANTS NOTHING' },
  { name: 'any product on the account grants (a dashboard payment link is enough)',
    find: "if (pid !== PID) return reply({ ok: 1, ignored: 'pid' });",
    repl: "if (false) return reply({ ok: 1, ignored: 'pid' });",
    expect: 'THE PRODUCT MUST BE NAMED BY US' },
  { name: 'a paid session with no player writes a row anyway',
    find: '  if (!isGid(gid) || !ses.id) {',
    repl: '  if (false) {',
    expect: 'A PAID SESSION WITH NO PLAYER' },
  // ⚠️ THE IDEMPOTENCE IS KEYED BY THE SESSION, AND THE ONLY WAY TO BREAK IT IS TO KEY IT BY THE
  // DELIVERY — which is exactly the defect: Stripe retries until it gets a 2xx, so a row per
  // event id is two boosts for one payment. It legitimately also moves the sid the neighbouring
  // arm prints, and that collateral is honest: the row IS keyed by the wrong thing.
  { name: 'the row is keyed by the EVENT and not by the session (a retry grants twice)',
    find: '.bind(ses.id, gid, pid,',
    repl: '.bind(ev.id, gid, pid,',
    expect: 'ONE PAYMENT, ONE ROW' },

  // ===== what the player owns, and taking it =====
  { name: '/v1/mine shows every player the purchases of his neighbours',
    find: "'SELECT sid, pid, amt, cur, c FROM ent WHERE gid = ? AND cl = 0 ORDER BY c ASC LIMIT ?')",
    repl: "'SELECT sid, pid, amt, cur, c FROM ent WHERE (gid = ? OR 1) AND cl = 0 ORDER BY c ASC LIMIT ?')",
    expect: 'MINE IS MINE' },
  { name: '/v1/mine keeps handing back rows that were already taken',
    find: "FROM ent WHERE gid = ? AND cl = 0 ORDER BY c ASC",
    repl: "FROM ent WHERE gid = ? AND cl >= 0 ORDER BY c ASC",
    expect: 'A CLAIM TAKES EXACTLY THE ROWS NAMED' },
  { name: 'a claim can close the row of ANOTHER player',
    find: "'UPDATE ent SET cl = ? WHERE gid = ? AND cl = 0 AND sid IN ('",
    repl: "'UPDATE ent SET cl = ? WHERE (gid = ? OR 1) AND cl = 0 AND sid IN ('",
    expect: 'A CLAIM CANNOT REACH ANOTHER PLAYER' },
  { name: 'a repeated claim reports the rows as taken a second time',
    find: 'SET cl = ? WHERE gid = ? AND cl = 0 AND sid IN (',
    repl: 'SET cl = ? WHERE gid = ? AND cl >= 0 AND sid IN (',
    expect: 'A REPEATED CLAIM IS A NO-OP' },
  // ⚠️ D1 answers `{success, meta:{changes}}` and node:sqlite `{changes}`. Reading the wrong shape
  // reports 0 taken while the rows are honestly marked — a client trusting that number shows the
  // player nothing. This is the trap the test adapter exists to reproduce.
  { name: 'the claim count is read in the node:sqlite shape instead of the D1 one',
    find: 'claimed: (res && res.meta && res.meta.changes) || 0',
    repl: 'claimed: (res && res.changes) || 0',
    expect: 'A CLAIM TAKES EXACTLY THE ROWS NAMED' },
  { name: '/v1/mine is served on GET too (the key travels in a query string)',
    find: "if (p === '/v1/mine' && req.method === 'POST') return mine(req, env);",
    repl: "if (p === '/v1/mine') return mine(req, env);",
    expect: 'THE KEY NEVER RIDES IN A URL' },
  { name: 'a refusal answers with an empty body (a client reading res.json() sees a failure)',
    find: 'return reply({ err: \'route\' }, 404);',
    repl: 'return new Response(null, { status: 404 });',
    expect: 'CORS AND A NON-EMPTY BODY' },

  // ⚠️⚠️ A SELF-CHECK OF THE TOOL ITSELF, NOT OF THE PRODUCTION CODE. Editing a COMMENT knowingly
  // changes no behaviour — so the run must say «the sabotage did not fire», and not «the guard is
  // blind». Without this entry the behaviour check itself would stay unchecked: it too can fall silent.
  // ===== the price and the product across three files =====
  { name: 'the worker grants a product the game never offers (a rename on one side only)',
    find: "const PID = 'bundle5';",
    repl: "const PID = 'bundle_5';",
    expect: 'ONE PRICE, ONE PRODUCT' },
  { name: 'the price is raised in the worker and not on the button', file: 'toml',
    find: 'PRICE_CENTS = "199"',
    repl: 'PRICE_CENTS = "299"',
    expect: 'ONE PRICE, ONE PRODUCT' },
  { name: 'the price is raised on the button and not in the worker', file: 'cfg',
    find: "{ id: 'bundle5', usd: 1.99,",
    repl: "{ id: 'bundle5', usd: 2.99,",
    expect: 'ONE PRICE, ONE PRODUCT' },

  { name: 'the worker returns the player to an origin the client does not serve', file: 'toml',
    find: 'SITE = "https://blendo.monster"',
    repl: 'SITE = "https://www.blendo.monster"',
    expect: 'ONE RETURN ORIGIN' },
  { name: 'the client calls an address the worker does not answer on', file: 'cfg',
    find: "const PAY_URL = 'https://pay.blendo.monster';",
    repl: "const PAY_URL = 'https://pay2.blendo.monster';",
    expect: 'ONE RETURN ORIGIN' },

  // ===== google sign-in: the account → identity mapping =====
  // ⛔⛔ THE FIRST ONE IS THE EXPLOIT ITSELF. Unsigned, `/v1/auth` hands a stranger the victim's
  // real key — the shape the design started from, before the advisor named it.
  { name: '/v1/auth is unsigned again (a stranger claims a gid he merely knows)',
    find: "  const chk = await checkSig(env, gid, 'auth.' + await sha256Hex(tok), b && b.t, (b && b.sig) || '', (b && b.k) || '');",
    repl: "  const chk = { ok: true, k: (await ownerKey(env, gid, (b && b.k) || '')) || '' };",
    expect: 'A FOREIGN GID CANNOT BE CLAIMED' },
  // ⚠️⚠️ TWO HOLDERS, ONE SABOTAGE — the canon's own rule. «One identity, one account» is held by
  // the explicit check AND by the UNIQUE index; removing only the check leaves the index refusing
  // the insert, so the arm would stay green and the run would call the guard blind. `OR REPLACE`
  // defeats both at once, and it is the plausible mistake: it is what someone reaches for when the
  // insert «mysteriously does nothing».
  { name: 'the fresh path overwrites whoever held the gid (both holders broken at once)',
    find: "  if (taken && taken.sub) return reply({ err: 'bound' }, 409);",
    repl: "  await env.DB.prepare('DELETE FROM acc WHERE gid = ?').bind(gid).run();",
    expect: 'ONE IDENTITY, ONE ACCOUNT' },
  { name: "the account stores the key that was SENT, not the one the signature was verified with",
    find: '.bind(v.sub, gid, chk.k, nowSec()).run();',
    repl: ".bind(v.sub, gid, (b && b.k) || '', nowSec()).run();",
    expect: 'THE KEY STORED IS THE ONE VERIFIED' },
  { name: "the token's `aud` is not checked (any Google token from any site signs a player in)",
    find: "  if (body.aud !== clientId) return { err: 'aud' };",
    repl: '  if (false) return { err: 0 };',
    expect: 'THE TOKEN IS VERIFIED' },
  { name: 'the RSA signature is not verified (a forged token is accepted)',
    find: "  if (!ok) return { err: 'token' };",
    repl: '  if (false) return { err: 0 };',
    expect: 'THE TOKEN IS VERIFIED' },
  { name: 'only one form of `iss` is accepted (a sign-in that works until it does not)',
    find: "  if (GOOGLE_ISS.indexOf(String(body.iss)) < 0) return { err: 'iss' };",
    repl: "  if (String(body.iss) !== GOOGLE_ISS[0]) return { err: 'iss' };",
    expect: 'BOTH ISSUER FORMS PASS' },
  { name: 'an unknown `kid` is treated as a forgery (a rotation locks everyone out)',
    find: '  if (!jwk) { keys = await jwksGet(true); jwk = keys && keys.find((k) => k.kid === head.kid); }',
    repl: '  if (false) { keys = await jwksGet(true); }',
    expect: 'AN UNKNOWN kid IS A ROTATION' },
  { name: 'a missing client id is not refused (the token is verified without an audience)',
    find: "  if (!env.GOOGLE_CLIENT_ID) return reply({ err: 'noclient' }, 503);",
    repl: '  if (false) return reply({ err: 0 }, 503);',
    expect: 'ONE CLIENT ID' },

  { name: 'SELF-CHECK: editing a comment does not change behaviour',
    find: '// ===== 2. THE WEBHOOK =====',
    repl: '// ===== 2. THE WEBHOOK (self-check marker) =====',
    expect: 'ONE PAYMENT, ONE ROW', noop: true },
];

function runSuite(over) {
  try {
    const out = execFileSync('node', [RUN], {
      env: Object.assign({}, process.env, over || {}),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}
const failedNames = (out) => out.split('\n').filter((l) => l.startsWith('FAIL: ')).map((l) => l.slice(6));

let bad = 0;

// 1) The HEALTHY build must be green — otherwise everything below is meaningless.
const base = runSuite(null);
const baseFails = failedNames(base.out);
if (!base.ok || baseFails.length) {
  console.log('⛔ THE HEALTHY BUILD IS NOT GREEN — the sabotages make no sense:');
  console.log(baseFails.join('\n') || base.out.slice(-800));
  process.exit(1);
}
const baseCount = (base.out.match(/^PASS:/gm) || []).length;

// ⚠️⚠️ THE SECOND RUN OF THE HEALTHY BUILD IS THE NOISE RULER, not over-insurance. Some numbers in
// the messages depend on the clock (the idempotency key carries the client's own second), and
// between two healthy runs they legitimately diverge. Without the ruler any divergence would read
// as «the behaviour changed», and the check below would lie in the other direction.
const base2 = runSuite(null);
const noisyLines = (function () {
  const a = base.out.split('\n'), b = base2.out.split('\n'), n = new Set();
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n.add(i);
  return n;
})();

// ⚠️⚠️ THE MAIN THING: TO TELL «THE GUARD IS BLIND» FROM «THE SABOTAGE DID NOT FIRE». A stale
// sabotage is visible at once («the line is not found»). One that WAS substituted in yet changed
// nothing is visible by NOTHING: the suite is green, the report writes «the guard is blind», and
// the conclusion comes out false. The sign is the guard's OWN line: every assert prints what it
// measured (a project rule), so a bit-for-bit match of that line means the sabotage went past the
// observable and we have learned nothing about the guard.
function guardLine(out, name) {
  return out.split('\n').filter((l) => l.indexOf(name) >= 0).join(' ¦ ');
}
function behaviourChanged(out) {
  const a = base.out.split('\n'), b = out.split('\n');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i] && !noisyLines.has(i)) return true;
  return false;
}
console.log('healthy build: ' + baseCount + ' PASS, 0 FAIL (noisy lines ' + noisyLines.size + ')\n');

// 2) Every sabotage — its own assert red, the neighbours intact.
for (const sb of SABOTAGE) {
  const f = FILES[sb.file || 'src'];
  if (f.text.indexOf(sb.find) < 0) {
    console.log('⛔ THE SABOTAGE WENT STALE (the line is not found in ' + f.name + '): ' + sb.name);
    bad++; continue;
  }
  if (f.text.split(sb.find).length - 1 > 1) {
    console.log('⛔ THE ANCHOR IS NOT UNIQUE (' + (f.text.split(sb.find).length - 1) + ' places in '
      + f.name + '): ' + sb.name);
    bad++; continue;
  }
  const patched = f.text.replace(sb.find, sb.repl);
  if (patched === f.text) { console.log('⛔ THE PATCH DID NOT CHANGE THE FILE: ' + sb.name); bad++; continue; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-'));
  const tmp = path.join(dir, f.name);
  fs.writeFileSync(tmp, patched);

  const res = runSuite({ [f.env]: tmp });
  const fails = failedNames(res.out);
  const hit = fails.filter((f) => f.indexOf(sb.expect) >= 0);
  const collateral = fails.filter((f) => f.indexOf(sb.expect) < 0);

  if (!hit.length && !fails.length && !res.ok) {
    console.log('⛔ THE SABOTAGE BROKE THE BUILD (this is NOT a blind guard): ' + sb.name);
    console.log('   ' + res.out.trim().split('\n').slice(-2).join(' / '));
    bad++;
  } else if (!hit.length && guardLine(res.out, sb.expect) === guardLine(base.out, sb.expect)) {
    if (sb.noop) {
      console.log('✅ «' + sb.name + '»\n   -> the tool correctly called the empty sabotage empty');
    } else {
      console.log('⛔ THE SABOTAGE WENT PAST (this is NOT a blind guard): «' + sb.name + '»');
      console.log('   the guard measured THE SAME as on the healthy build: '
        + guardLine(base.out, sb.expect).slice(0, 140));
      console.log('   the rest of the build ' + (behaviourChanged(res.out)
        ? 'changed — which means the patch applied, but hits the wrong place'
        : 'did not change at all — the patch fired nowhere'));
      console.log('   fix the SABOTAGE, and not the guard.');
      bad++;
    }
  } else if (sb.noop) {
    console.log('⛔ THE SELF-CHECK FAILED: the empty sabotage was not recognised as empty'); bad++;
  } else if (!hit.length) {
    console.log('⛔ THE GUARD IS BLIND: «' + sb.name + '» did not bring down «' + sb.expect + '»');
    console.log('   (the behaviour of the build changed — which means the sabotage happened)');
    console.log('   fell: ' + (fails.join(' | ') || 'nothing'));
    bad++;
  } else {
    console.log('✅ «' + sb.name + '»\n   -> red: ' + hit.join(' | ')
      + (collateral.length ? '\n   ⚠️ hit the neighbours: ' + collateral.join(' | ') : ''));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + (bad ? 'TWO-WAY CHECK: FAILED (' + bad + ')'
  : 'TWO-WAY CHECK: PASSED — all ' + SABOTAGE.length + ' sabotages caught, both builds green'));
process.exit(bad ? 1 : 0);
