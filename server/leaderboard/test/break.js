// TWO-WAY GUARD CHECK: `node server/leaderboard/test/break.js`
// ⚠️ By the project canon a guard is NOT DELIVERED until it has been shown to GO RED on
// a broken build and to be GREEN on a healthy one. A one-way run «green on the
// healthy one» does not protect against tautology, «red on the broken one» — against a flake.
//
// Here every sabotage test hits ONE property and must bring down EXACTLY that
// assert which states this property. If a sabotage test brings down someone
// else's assert — the guard measures not what it names.
//
// ⚠️ The patch is checked for APPLICABILITY (the line is found): sabotage tests go stale
// together with the production line, and a silently diverged regex would give a run over
// the HEALTHY build — that is, five confident greens about nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(DIR, 'src', 'index.js'), 'utf8');
const RUN = path.join(__dirname, 'run.js');

const SABOTAGE = [
  { name: 'the server stores the MAXIMUM (as on the platform)',
    find: 'UPDATE p SET n=?, a=?, s=?, u=?',
    repl: 'UPDATE p SET n=?, a=?, s=MAX(s,?), u=?',
    expect: 'DROP PRESERVED' },
  { name: 'we accept the submitted key on an existing row',
    find: 'if (!sameSig(await hmacHex(row.k, msg), body.sig))',
    repl: 'if (!sameSig(await hmacHex(body.k || row.k, msg), body.sig))',
    expect: 'FOREIGN KEY REJECTED' },
  { name: 'the rate limit has been removed',
    find: 'if (now - row.u < RATE_SEC)',
    repl: 'if (false)',
    expect: 'RATE: more often than 20 s' },
  { name: 'the q monotonicity check has been removed',
    find: 'if (q <= row.q)',
    repl: 'if (false)',
    expect: 'REPEATED q' },
  { name: 'the snapshot does not filter out the hidden ones',
    find: "'SELECT n,a,s FROM p WHERE f=0 AND s>0 ORDER BY s DESC, u ASC LIMIT ?'",
    repl: "'SELECT n,a,s FROM p WHERE s>0 ORDER BY s DESC, u ASC LIMIT ?'",
    expect: 'THE HIDDEN ONE IS NOT' },
  { name: 'the empty ladder answers «rank 1» again',
    find: 'if (!ladder || !ladder.length) return null;',
    repl: 'if (!ladder || !ladder.length) return 1;',
    expect: 'ESTIMATE: an empty ladder' },
  { name: 'above the first step it is «rank 1» again',
    find: 'return lo === 0 ? null : lo * LADDER_STEP;',
    repl: 'return lo === 0 ? 1 : lo * LADDER_STEP;',
    expect: 'ESTIMATE: above the first step' },
  { name: '429 keeps silent about how long to wait (the client is forced to guess)',
    find: "return reply({ ok: 0, err: 'rate', retry: RATE_SEC - (now - row.u),",
    repl: "return reply({ ok: 0, err: 'rate',",
    expect: 'RATE: the 429 says HOW LONG to wait' },
  { name: 'the bucket boundary is counted twice (the rank is shifted by 1)',
    find: '- (bound === null ? 0 : 1)',
    repl: '- (bound === null ? 0 : 0)',
    expect: 'THE EXACT RANK' },
  { name: 'a submit clears the MANUAL hiding (the hidden one brought himself back)',
    find: "'UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?'",
    repl: "'UPDATE p SET n=?, a=?, s=?, u=?, q=?, f=0 WHERE id=?'",
    expect: 'MANUAL HIDE' },
  // ⚠️ TWO SABOTAGE TESTS FOR THE REMOVED CEILING — ONE PER EACH DEAD MECHANISM.
  // The clamping and the auto-hiding went away together, but they can be brought back
  // SEPARATELY, and the guard «score as is» states both signs — which means each one has
  // to be brought down separately, otherwise one of the two asserts stays unchecked.
  { name: 'the CLAMPING of the submitted score is back',
    find: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();',
    repl: '.bind(n, Math.min(49, Math.max(1, a)), Math.min(s, 2000), now, q, id).run();',
    expect: 'SCORE AS IS' },
  { name: 'the AUTO-HIDING by the size of the score is back',
    find: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();',
    repl: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();'
        + " if (s > 2000) await env.DB.prepare('UPDATE p SET f=1 WHERE id=?').bind(id).run();",
    expect: 'SCORE AS IS' },
  // ⚠️⚠️ A SELF-CHECK OF THE TOOL ITSELF, NOT OF THE PRODUCTION CODE. Editing a COMMENT
  // knowingly does not change behavior — which means the run must say «THE SABOTAGE TEST
  // DID NOT FIRE», and not «the guard is blind». Without this entry the behavior check
  // itself would stay unchecked: it too can fall silent.
  { name: 'SELF-CHECK: editing a comment does not change behavior',
    find: '// ===== RANK LADDER =====',
    repl: '// ===== RANK LADDER (self-check marker) =====',
    expect: 'ESTIMATE: an empty ladder', noop: true },
  { name: '/top falls together with the database',
    find: 'catch (e) { snap = null; }',
    repl: 'catch (e) { throw e; }',
    expect: '/top with the database down' },
];

function runSuite(srcPath) {
  try {
    const out = execFileSync('node', [RUN], {
      env: Object.assign({}, process.env, srcPath ? { LB_SRC: srcPath } : {}),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}
const failedNames = (out) => out.split('\n').filter((l) => l.startsWith('FAIL: '))
  .map((l) => l.slice(6));

let bad = 0;

// 1) The HEALTHY build must be green — otherwise everything below is meaningless.
const base = runSuite(null);
const baseFails = failedNames(base.out);
if (!base.ok || baseFails.length) {
  console.log('⛔ THE HEALTHY BUILD IS NOT GREEN — the sabotage tests make no sense:');
  console.log(baseFails.join('\n') || base.out.slice(-800));
  process.exit(1);
}
const baseCount = (base.out.match(/^PASS:/gm) || []).length;

// ⚠️⚠️ THE SECOND RUN OF THE HEALTHY BUILD IS NOT OVER-INSURANCE, IT IS THE NOISE RULER.
// Some of the numbers in the messages depend on the clock (for example `retry` on 429), and
// between two HEALTHY runs they legitimately diverge. Without this ruler any
// divergence would read as «the behavior changed», and the check below would lie
// in the other direction.
const base2 = runSuite(null);
const noisyLines = (function () {
  const a = base.out.split('\n'), b = base2.out.split('\n'), n = new Set();
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n.add(i);
  return n;
})();

// ⚠️⚠️ THE MAIN THING: TO TELL «THE GUARD IS BLIND» FROM «THE SABOTAGE TEST DID NOT FIRE».
// A stale sabotage test is visible at once — «the line is not found». But a sabotage test that
// WAS SUBSTITUTED IN yet changed nothing is visible by NOTHING: the suite is green, the report
// writes «the guard is blind», and the conclusion comes out false. A live case (2026-08-09): the
// patch `f = (s > 2000)` in the SET expression reads the OLD value of the column, and not the
// submitted one, and never fired — a healthy guard was counted as blind for an hour.
// The behavior sign: the suite output on the patched build must DIFFER from the output on the
// healthy one by at least something outside the noisy lines. It matched word for word —
// which means the sabotage test did not happen, and we have learned NOTHING about the guard.
function behaviorChanged(out) {
  const a = base.out.split('\n'), b = out.split('\n');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i] && !noisyLines.has(i)) return true;
  return false;
}

// ⚠️⚠️ THE EXACT SIGN, AND IT IS STRONGER THAN THE PREVIOUS ONE. «The behavior changed at least
// somewhere» catches only a COMPLETELY empty sabotage test. The real case of 2026-08-09 was
// trickier: the patch `f = (s > 2000)` changed the flag on SOMEONE ELSE'S rows (their numbers in
// the report moved), and did not touch the row watched by the guard «SCORE AS IS»
// at all — and the report again wrote «the guard is blind».
// We ask exactly what is needed: has WHAT THIS GUARD SEES changed.
// The assert line prints its own measured numbers (a project rule), therefore
// a bit-for-bit match of its text means: the sabotage test went PAST the observable.
function guardLine(out, name) {
  return out.split('\n').filter((l) => l.indexOf(name) >= 0).join(' ¦ ');
}
console.log('healthy build: ' + baseCount + ' PASS, 0 FAIL (noisy lines '
  + noisyLines.size + ')\n');

// 2) Every sabotage test — its own assert red, the neighbours intact.
for (let i = 0; i < SABOTAGE.length; i++) {
  const sb = SABOTAGE[i];
  if (SRC.indexOf(sb.find) < 0) {
    console.log('⛔ THE SABOTAGE TEST WENT STALE (the line is not found): ' + sb.name);
    bad++; continue;
  }
  const patched = SRC.replace(sb.find, sb.repl);
  if (patched === SRC) { console.log('⛔ THE PATCH DID NOT CHANGE THE FILE: ' + sb.name); bad++; continue; }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lb-')), 'index.js');
  fs.writeFileSync(tmp, patched);

  const res = runSuite(tmp);
  const fails = failedNames(res.out);
  const hit = fails.filter((f) => f.indexOf(sb.expect) >= 0);
  const collateral = fails.filter((f) => f.indexOf(sb.expect) < 0);

  if (!hit.length && !fails.length && !res.ok) {
    console.log('⛔ THE SABOTAGE TEST BROKE THE BUILD (this is NOT a blind guard): ' + sb.name);
    console.log('   ' + res.out.trim().split('\n').slice(-2).join(' / '));
    bad++;
  } else if (!hit.length && guardLine(res.out, sb.expect) === guardLine(base.out, sb.expect)) {
    // The guard line matched word for word: it measured THE VERY SAME thing, that is, the
    // sabotage test went past the observable. About the guard itself we have learned nothing.
    if (sb.noop) {
      console.log('✅ «' + sb.name + '»\n   -> the tool correctly called the empty sabotage test empty');
    } else {
      console.log('⛔ THE SABOTAGE TEST WENT PAST (this is NOT a blind guard): «' + sb.name + '»');
      console.log('   the guard measured THE SAME as on the healthy build: '
        + guardLine(base.out, sb.expect).slice(0, 120));
      console.log('   the rest of the build ' + (behaviorChanged(res.out)
        ? 'changed — which means the patch applied, but hits the wrong place'
        : 'did not change at all — the patch fired nowhere'));
      console.log('   fix the SABOTAGE TEST, and not the guard.');
      bad++;
    }
  } else if (sb.noop) {
    console.log('⛔ THE SELF-CHECK FAILED: the empty sabotage test was not recognized as empty');
    bad++;
  } else if (!hit.length) {
    console.log('⛔ THE GUARD IS BLIND: «' + sb.name + '» did not bring down «' + sb.expect + '»');
    console.log('   (the behavior of the build changed — which means the sabotage test happened)');
    console.log('   fell: ' + (fails.join(' | ') || 'nothing'));
    bad++;
  } else {
    console.log('✅ «' + sb.name + '»\n   -> red: ' + hit.join(' | ')
      + (collateral.length ? '\n   ⚠️ hit the neighbours: ' + collateral.join(' | ') : ''));
  }
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

// ===== PHASE 2: THE SMOKE TEST IS ALSO DELIVERED AS A GUARD =====
// ⚠️ Its new checks (the saved score, the UPDATE path, the preflight, the freshness of the
// snapshot) must go red on a broken build — otherwise they are not guards but a
// description. The run goes through `--local`, each one ~25 s (inside there is an honest
// wait for the 21 s rate window — without it the UPDATE path is not executed).
const SMOKE = path.join(__dirname, 'smoke.js');
const SMOKE_SABOTAGE = [
  { name: 'a 0 is written to the database instead of the score',
    find: '.bind(id, body.k, n, Math.min(49, Math.max(1, a)), s, now, q, born).run();',
    repl: '.bind(id, body.k, n, Math.min(49, Math.max(1, a)), 0, now, q, born).run();',
    expect: 'own place and neighbours' },
  { name: 'the UPDATE path is broken (a nonexistent column)',
    find: "'UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?'",
    repl: "'UPDATE p SET n=?, a=?, s=?, u=?, zz=? WHERE id=?'",
    expect: 'the second submit changes the score' },
  { name: 'the preflight is not served',
    find: "if (req.method === 'OPTIONS') return preflight();",
    repl: "if (false) return preflight();",
    expect: 'preflight for DELETE' },
  { name: 'an empty snapshot passes itself off as a fresh one',
    find: "return reply({ t: 0, n: 0, p: page, r: [], stale: 1 }, 200,",
    repl: "return reply({ t: nowSec(), n: 0, p: page, r: [] }, 200,",
    expect: 'locally: without a snapshot honestly YELLOW' },
];

function runSmoke(srcPath) {
  try {
    const out = execFileSync('node', [SMOKE, '--local'], {
      env: Object.assign({}, process.env, srcPath ? { LB_SRC: srcPath } : {}),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}
const smokeFails = (out) => out.split('\n').filter((l) => l.indexOf('❌') >= 0)
  .map((l) => l.replace(/^\s*❌\s*/, '').split('  —')[0].trim());

console.log('\n--- phase 2: the smoke test ---');
const sBase = runSmoke(null);
if (!sBase.ok || smokeFails(sBase.out).length) {
  console.log('⛔ THE SMOKE TEST IS NOT GREEN ON THE HEALTHY BUILD:');
  console.log(smokeFails(sBase.out).join(' | ') || sBase.out.slice(-600));
  bad++;
} else {
  console.log('healthy build: the smoke test is green\n');
  for (const sb of SMOKE_SABOTAGE) {
    if (SRC.indexOf(sb.find) < 0) {
      console.log('⛔ THE SABOTAGE TEST WENT STALE (the line is not found): ' + sb.name); bad++; continue;
    }
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-')), 'index.js');
    fs.writeFileSync(tmp, SRC.replace(sb.find, sb.repl));
    const res = runSmoke(tmp);
    const f = smokeFails(res.out);
    const hit = f.filter((x) => x.indexOf(sb.expect) >= 0);
    if (!hit.length && !f.length && !res.ok) {
      console.log('⛔ THE SABOTAGE TEST BROKE THE BUILD (this is NOT a blind guard): ' + sb.name); bad++;
    } else if (!hit.length) {
      console.log('⛔ THE SMOKE TEST IS BLIND: «' + sb.name + '» did not bring down «' + sb.expect + '»');
      console.log('   fell: ' + (f.join(' | ') || 'nothing')); bad++;
    } else {
      const other = f.filter((x) => x.indexOf(sb.expect) < 0);
      console.log('✅ «' + sb.name + '»\n   -> red: ' + hit.join(' | ')
        + (other.length ? '\n   ⚠️ hit the neighbours: ' + other.join(' | ') : ''));
    }
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

console.log('\n' + (bad ? 'TWO-WAY CHECK: FAILED (' + bad + ')'
  : 'TWO-WAY CHECK: PASSED — all ' + SABOTAGE.length
    + ' sabotage tests of the suite + ' + SMOKE_SABOTAGE.length + ' of the smoke test caught, both builds green'));
process.exit(bad ? 1 : 0);
