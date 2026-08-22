// ===== OUR OWN LEADERBOARD — CLIENT (spec docs/LEADERBOARD-OWN.md) =====
// DATA only. The screen and the win inset come as separate edits, on top of this.
//
// The owner's word 2026-08-07: «let's not get clever and build score-inflation
// protection right now. For now make a good simple foundation for the leaderboard that shows
// the result right at the end of every level. The result also changes
// if the player has spent money in the collection on a multiplier».
//
// ⚠️⚠️ FOUR STATES, AND THREE OF THEM ARE NOT ERRORS. The screen must tell them apart,
// which is why the client hands them over as an EXPLICIT `state` field instead of making it guess from
// an empty array:
//   'ok'      — the list arrived;
//   'early'   — the server is alive, but there is no snapshot yet (markers `stale`, `t:0`).
//               ⛔ THIS IS NOT A BREAKAGE: the top is built by a cron once an hour, right after
//               a deployment it is empty LEGITIMATELY. Showing «error» here would be a lie.
//   'offline' — no network/server;
//   'broken'  — a response arrived, but off-contract (not JSON, fields missing).
// ⚠️ 'early' and 'broken' ARE SEPARATED DELIBERATELY. Our worker degrades SOFTLY and on
// a downed database returns 200 — that is, the breakage marker lives IN THE BODY, not in the
// response code. A `res.ok` check would be green on a dead leaderboard (the server smoke test
// suffered from exactly this bug — see the server README).

// ⚠️⚠️ ENABLING — ONLY BY AN EXPLICIT MARKER, NOT BY A GUESS ABOUT localhost.
// This used to say «any localhost -> stand 127.0.0.1:8788», and that was convenient
// for exactly one person: ALL the workstreams sit on localhost (game preview 8779 —
// Graphics, Physics, Narrative), they have no stand running, and they were getting
// failed requests in the console on every win, without a single hint why.
// Markers, in descending priority:
//   ?lb=1            — the default stand (127.0.0.1:8788), for development;
//   ?lb=<address>    — an arbitrary address, for probes and for the suite;
//   localStorage.mixer_lb_url — the same, but survives a reload;
//   LB_URL           — the production address from the config (appears after deployment).
// None of these present — the leaderboard is switched OFF entirely and stays silent.
const LB_BASE = (function () {
  try {
    const q = new URLSearchParams(location.search).get('lb');
    if (q) return q === '1' ? 'http://127.0.0.1:8788' : q;
    const ls = localStorage.getItem('mixer_lb_url');
    if (ls) return ls;
  } catch (e) {}
  return (typeof LB_URL === 'string' && LB_URL) ? LB_URL : '';
})();

const LB_TTL_MS = 20000;   // short cache: the win inset and the screen read ONE AND THE SAME
const LB_TIMEOUT_MS = 6000;

// ⚠️ THE SIGNING KEY IS ACCEPTED BY THE SERVER ONLY WHEN THE ROW IS CREATED
// (trust-on-first-use): sending it against an EXISTING row is not allowed, otherwise anyone
// who felt like it could overwrite someone else's. So the key must survive a game restart —
// losing it, the player also loses the ability to update THEIR OWN row forever.
// ⚠️ RIGHT NOW IT LIVES IN localStorage, AND THAT IS TEMPORARY: the right place is the save (77-save,
// not my zone), then it would survive both a cache wipe and a move to a second device
// together with `Save.gid`. A request has been sent to Meta; until it lands the behaviour is honest, but
// «changed device — new row».
const LB_KEY_LS = 'mixer_lb_key';

function lbKey() {
  try {
    let k = localStorage.getItem(LB_KEY_LS);
    if (k && /^[0-9a-f]{64}$/.test(k)) return k;
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    k = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(LB_KEY_LS, k);
    return k;
  } catch (e) { return ''; }
}

// Whether the row has already been created (the key is sent in EXACTLY the first submission).
const LB_REG_LS = 'mixer_lb_reg';
// ⚠️ THE LAST SUBMITTED VALUE LIVES BETWEEN LAUNCHES, and that is not a luxury.
// Measurement (headless, a full win): with empty memory EVERY game start produced
// an extra submission — the cloud sync `bridgeSyncSave` pokes `onStarsChange` on
// initialization, and the subscription honestly sent the number that already sat on the server.
const LB_SENT_LS = 'mixer_lb_sent';
function lbRegistered() { try { return localStorage.getItem(LB_REG_LS) === '1'; } catch (e) { return false; } }
function lbMarkRegistered() { try { localStorage.setItem(LB_REG_LS, '1'); } catch (e) {} }

async function lbSign(msg) {
  const keyHex = lbKey();
  if (!keyHex) return '';
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ⚠️⚠️ REQUESTS MUST STAY «SIMPLE» BY CORS RULES: a `text/plain` body, NO
// custom headers and no `content-type: application/json`. Otherwise the browser sends
// a preflight request, and EVERY submission costs TWO round trips instead of one.
// The requirement is written into the server contract — not an «optimization», but a condition.
async function lbFetch(path, opts) {
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, LB_TIMEOUT_MS);
  try {
    const res = await fetch(LB_BASE + path, Object.assign({ signal: ctl && ctl.signal }, opts || {}));
    clearTimeout(timer);
    // The server's body is ALWAYS non-empty JSON, and success is a FIELD of the body. That is why we read
    // the body on any code: 409 (duplicate) and 429 (rate-limited) carry meaningful data.
    let body = null;
    try { body = JSON.parse(await res.text()); } catch (e) { return { state: 'broken', code: res.status }; }
    if (!body || typeof body !== 'object') return { state: 'broken', code: res.status };
    // ⚠️⚠️ THE JSON PARSED — THAT IS NOT SUCCESS YET. Caught by a LIVE RUN against the stand
    // on 2026-08-07; before that the code counted ANY parsed body as success: a repeated
    // submission returned `state:'ok'` even though the server answered with an error. That is,
    // the client cheerfully reported «accepted» on 400/401/429 — exactly the class we
    // catch in the guards, only in production code.
    // The server's error is the `err` FIELD (measurement: a broken signature → 400 `{"err":"nokey"}`),
    // and it does not depend on the response code: it degrades softly and on a downed database
    // answers 200. That is why we judge BY THE BODY.
    if (body.err) return { state: 'refused', code: res.status, err: String(body.err), body: body };
    return { state: 'ok', code: res.status, body: body };
  } catch (e) {
    clearTimeout(timer);
    return { state: 'offline' };
  }
}

// ===== READING =====

let lbTopCache = null;   // { at, data }
let lbMeCache = null;

// ⚠️ ONE FETCH POINT FOR TWO CONSUMERS (the win inset + the leaderboard
// screen). Two copies of the logic would drift apart exactly on SPENDING on the multiplier — that is,
// in the single place where the owner asked the numbers to agree.
// ⚠️⚠️ DROPPING OUR OWN CACHE DOES NOT MEAN GETTING FRESH DATA. Caught by a live run:
// after the leaderboard was cleared on the stand the client honestly re-requested `/v1/top` and again
// got the OLD 24 rows with the same `t` — the answer came from the browser's HTTP cache, the
// server has `max-age` 60 s on that route. Our own memory had been dropped, but the number
// on the screen would not change for another minute — exactly where it is obliged to change
// (after a win and after spending on the multiplier).
// ⛔ CURING THIS WITH A PERMANENT CACHE BYPASS IS NOT ALLOWED: those 60 seconds on the server are DELIBERATE,
// the top is served from a snapshot and holds the load. That is why the bypass is ONE-SHOT — the mark
// lives until the next successful read and is spent on it.
let lbBust = 0;
function lbInvalidate() { lbTopCache = null; lbMeCache = null; lbBust = Date.now(); }
// ⚠️⚠️ THE «THE SCORE HAS ARRIVED» SUBSCRIPTION — THE POINT THAT WAS MISSING (the owner's complaint
// 2026-08-12: «I need an instant recount of the rating and the position if I
// finished a level or spent points on an upgrade»). The submission FORGOT THE CACHE, but
// TOLD NOBODY that the number on the server was already new: the badge in the menu re-read
// the leaderboard only when the menu was OPENED, and at that moment the player is already standing in it
// looking at the old figure. Hence his own «different values»: 9445 in the wallet
// against 9367 in the row — those are not different formulas, but a lagging display.
// ⚠️ We call it AFTER `lbInvalidate`, otherwise the subscriber will re-read the old cache.
const lbSentCbs = [];
function lbOnSent(cb){ if (typeof cb === 'function') lbSentCbs.push(cb); }
function lbFireSent(info){ for (const cb of lbSentCbs){ try { cb(info); } catch (e) {} } }
function lbBustQ() { return lbBust ? '&_=' + lbBust : ''; }

async function lbTop(page) {
  const p = page || 1;
  if (lbTopCache && lbTopCache.p === p && Date.now() - lbTopCache.at < LB_TTL_MS) return lbTopCache.data;
  if (!LB_BASE) return { state: 'offline', rows: [] };
  const r = await lbFetch('/v1/top?p=' + p + lbBustQ(), { method: 'GET' });
  let out;
  if (r.state !== 'ok') out = { state: r.state, rows: [] };
  else if (!Array.isArray(r.body.r)) out = { state: 'broken', rows: [] };
  else if (r.body.stale || !r.body.t) {
    // ⛔ THIS IS EXACTLY WHERE THE DIFFERENCE BETWEEN «EMPTY BECAUSE IT IS EARLY» AND «EMPTY BECAUSE
    // IT BROKE» LIVES. We take the marker from the BODY (`stale`/`t`), not from the response code.
    out = { state: 'early', rows: r.body.r.map(lbRow), total: r.body.n || 0, at: 0 };
  } else out = { state: 'ok', rows: r.body.r.map(lbRow), total: r.body.n || 0, at: r.body.t };
  if (out.state === 'ok' || out.state === 'early') lbBust = 0;  // the mark is spent
  lbTopCache = { p: p, at: Date.now(), data: out };
  return out;
}

// A snapshot/neighbours row arrives as a triple [name, avatar, score] — we unfold it into
// an object here so that the screen does not need to know the field order.
function lbRow(a) { return Array.isArray(a) ? { name: a[0], av: a[1], score: a[2] } : null; }

async function lbMe() {
  if (lbMeCache && Date.now() - lbMeCache.at < LB_TTL_MS) return lbMeCache.data;
  if (!LB_BASE) return { state: 'offline' };
  const id = (typeof guestId === 'function') ? guestId() : '';
  if (!id) return { state: 'offline' };
  const t = Math.floor(Date.now() / 1000);
  const sig = await lbSign(id + '.me.' + t);
  if (!sig) return { state: 'offline' };
  const r = await lbFetch('/v1/me?id=' + encodeURIComponent(id) + '&t=' + t + '&sig=' + sig + lbBustQ(), { method: 'GET' });
  let out;
  // ⚠️⚠️ «THE PLAYER HAS NO ROW YET» — THAT IS NOT A REFUSAL, AND IT IS RECOGNIZED BY MEANING, NOT
  // BY THE RESPONSE CODE. The server answers `404 {"err":"none"}` (index.js:238), while
  // `lbFetch` declares ANY `err` field in the body to be `refused` — that is why the former branch
  // `r.code === 404` stood AFTER the common exit and was UNREACHABLE. A measurement against
  // the stand (2026-08-10): before the first win the player got `refused`, the screen hid
  // the block silently, and A NEWCOMER WAS INDISTINGUISHABLE FROM A DEAD SERVER — and that is the most common
  // first-launch path.
  // ⛔ The condition is `err === 'none'`, and NOT `code === 404`: the server's second 404 is
  // `{"err":"route"}` (a broken `LB_BASE`), and by the code it would report «you are simply not on
  // the leaderboard» instead of a breakage — a false «ok», exactly the class we are cleaning out.
  // The shape of the branch is the same as the 429 one below (`refused` + parsing `err`).
  // ⚠️ `exact` IS MANDATORY HERE, EVEN THOUGH THERE IS NO RANK: without the field the legitimate case
  // is indistinguishable from «the field was renamed on the server», and the screen's refusal on `exact`
  // is CLOSED — no trustworthiness marker, no rank shown. RULE: any
  // response that CAN carry a rank (`me`, `submit`) also carries
  // `exact` when `state:'ok'` — even if it is `false`. A uniform contract removes a class of ambiguity
  // and keeps the guard at the seam simple.
  if (r.state === 'refused' && r.err === 'none') {
    out = { state: 'ok', me: null, rank: null, exact: false, up: [], dn: [] };
  } else if (r.state !== 'ok') out = { state: r.state };
  else out = {
    state: 'ok',
    // ⚠️ At `/v1/me` the rank is EXACT, but `null` is possible as the «no row» marker —
    // we pass it through as is so the screen can tell «I don't know» from «first place».
    rank: (typeof r.body.rank === 'number') ? r.body.rank : null,
    exact: !!r.body.exact,
    score: r.body.s,
    up: (r.body.up || []).map(lbRow).filter(Boolean),
    dn: (r.body.dn || []).map(lbRow).filter(Boolean),
  };
  lbMeCache = { at: Date.now(), data: out };
  return out;
}

// ===== SUBMISSION =====

let lbSending = false;
let lbLastQ = 0;
// What already sits on the server — we do not send the same thing twice (see LB_SENT_LS).
let lbSentScore = (function () {
  try { const v = localStorage.getItem(LB_SENT_LS); return v === null ? null : Number(v); }
  catch (e) { return null; }
})();
let lbTimer = 0;          // deferred submission: the rate window or coalescing
let lbAgain = false;      // the balance changed while the previous submission was in flight

// ⚠️ A FALLBACK IN CASE OF AN OLD WORKER WITHOUT THE `retry` FIELD. This is a DELIBERATE copy,
// and it is intentionally LARGER than any reasonable window: overshooting
// means waiting longer than needed, undershooting means hammering the server with refusals. The production number
// comes from whoever owns it — from the 429 body.
const LB_RETRY_FALLBACK_S = 30;

// ⚠️⚠️ THE COALESCING DELAY IS NOT A DEFENCE AGAINST A STREAM OF EVENTS. The premise «the balance
// changes on every award» HAS BEEN CHECKED BY GREP AND IS WRONG: `fireStarsChange`
// is called from seven places (cloud sync, early bank, win bank, top-up,
// spend, boost, unlock), during a match it is not poked at all. So there is no stream
// to collect, and the delay is needed for exactly two things:
//   1) to glue together a batch of changes from one gesture (bought two boosts in a row);
//   2) to let the immediate win submission go first — it leaves in the same
//      tick as the bank, while this timer arrives later and sees the already submitted
//      value (suppressed by the `s === lbSentScore` check).
// ⚠️ MEASUREMENT (headless against a live stand, a full win by the bot): one win
// costs EXACTLY ONE submission — the immediate one; the deferred one does not duplicate it.
// ⚠️⚠️ AND THE MAIN MEASUREMENT, THE OWNER'S SCENARIO «a win, immediately spending on a multiplier»
// (the same stand, rank score 5000 -> spend 2000 -> 3000):
//     #1 200 (5000) -> #2 429 err=rate retry=18s -> #3 200 (3000)
//     the stand's database holds 3000, i.e. it matched the game.
// Without the deferred send step #3 would not have happened at all, and the rank would update
// only after the NEXT win — exactly the loss all of this was built to prevent.
const LB_CHANGE_DELAY_S = 0.5;

// Defer the submission by `sec` seconds. A repeated call REASSIGNS the timer —
// that is exactly what the gluing is: ONE submission leaves, carrying the latest value.
function lbSchedule(sec) {
  const ms = Math.max(0, Math.min(120, Number(sec) || 0)) * 1000;
  if (lbTimer) clearTimeout(lbTimer);
  lbTimer = setTimeout(function () { lbTimer = 0; lbSubmit(); }, ms);
}

// ⚠️⚠️ CALL ONLY AFTER `bankLevelScore` — otherwise the rank lags behind BY EXACTLY ONE
// LEVEL. The symptom is insidious: the number is plausible, just yesterday's, and by eye
// it cannot be caught.
// ✅ THE ORDER IN THE GAME IS ALREADY CORRECT, verified by the dispatcher BY CODE on 2026-08-07:
// `80-gameplay.js` banks the score, and only then comes `Ads.noteWin()`, inside
// which the submission lives; in `78-ads.js` there is an explanation at that spot that the call
// was put into `noteWin` precisely because it happens exactly once per win and
// strictly after the bank. There is nothing to fix here — but nothing to break either.
// ⚠️⚠️ FOR THE WIN INSET, THOUGH, THAT IS NOT ENOUGH, AND IT IS NOT OBVIOUS: in the response to
// the submission `rank` comes with `exact: 0` — that is an ESTIMATE from the last snapshot, not
// an exact rank. The exact one (`exact: 1`) and the neighbours `up`/`dn` exist ONLY at `/v1/me`.
// So the inset's sequence is strictly this:
//     bank → `lbSubmit()` → WAIT for the answer → `lbMe()` → draw.
// ⛔ Calling `lbMe()` IN PARALLEL with the submission means getting the rank BEFORE the round just
// played is accounted for, that is, the same «one level behind», only this time
// not because of the bank. The cache does not get in the way: `lbSubmit` drops it itself.
async function lbSubmit() {
  if (!LB_BASE) return { state: 'offline' };
  // ⚠️⚠️ AN AUTOMATED RUN READS BUT DOES NOT WRITE. The gate stands EXACTLY HERE, at
  // the single place where a write is born — and not on the address: an empty address
  // muted reading too, and the owner could not find the entry point into the leaderboard on his own stand.
  // ⛔ THE MARKER IS AUTOMATION (`navigator.webdriver`, plus `file:`), and NOT
  // the local host: by host the owner himself got muted, and without his own row his
  // rank disappeared and the win inset went silent («there is no leaderboard on the level
  // completion screen»). Details are at `LB_NOSEND` in 00-config.
  // ⛔ THE EXIT IS MARKED WITH ITS OWN `bot` FLAG rather than disguised as success:
  // «silently did not submit» is exactly the class of lie we spent the whole day cleaning out.
  // ⚠️ AND NOT `state:'ok'`: the win screen draws a rank on `ok`, and there is no rank here.
  if (typeof LB_NOSEND !== 'undefined' && LB_NOSEND)
    return { state: 'refused', err: 'bot', bot: true, sent: 0 };
  // ⚠️ Being busy is NOT a reason to lose a change: we mark it and send it in the tail.
  if (lbSending) { lbAgain = true; return { state: 'busy' }; }
  const id = (typeof guestId === 'function') ? guestId() : '';
  const nm = (typeof guestName === 'function') ? guestName() : '';
  const av = (typeof guestAvatar === 'function') ? guestAvatar() : 0;
  const s = (typeof leaderboardScore === 'function') ? leaderboardScore() : 0;
  if (!id || !nm) return { state: 'offline' };
  // ⚠️ We do not send the same value a second time: the win submits the score itself,
  // and the balance-change subscription would follow with the same number — the second
  // submission changes nothing, but EATS UP the rate window, and a real spend
  // happening a second later would hit a 429 out of nowhere.
  if (s === lbSentScore) return { state: 'ok', skipped: true, sent: s, score: s,
    rank: null, exact: false, dup: false };
  // ⚠️⚠️ ZERO DOES NOT CREATE A ROW, BUT IT MUST UPDATE AN EXISTING ONE. The server
  // deliberately creates a row on the FIRST WIN — «a guest who dropped in for ten seconds
  // does not breed rows». The balance-change subscription BROKE that property:
  // the cloud sync pokes `onStarsChange` at startup, and a guest who had not played
  // sent off a submission with a zero, creating a row. Found by measurement, not by reasoning.
  // ⛔ BUT THE FORMER `if (!(s > 0)) return` FORBADE ZERO ALSO FOR SOMEONE WHOSE ROW
  // ALREADY EXISTS — and these are TWO different cases, and the second one broke the owner's model:
  //   • a progress reset (the developer panel) zeroed the game, while on the leaderboard
  //     the former score and the former rank remained — the owner's complaint 2026-08-11;
  //   • the «Forbes» model promises «blew it all → 0, bottom of the leaderboard» (the canon
  //     2026-07-29), and exactly the last step down to zero never made it through.
  // ⚠️ THE «the row exists» MARKER IS `lbSentScore > 0`, and NOT `lbRegistered()`:
  // registration remembers that we sent the KEY, while we need to know that on
  // the server sits a POSITIVE number that a zero will overwrite. It also
  // survives the deferred send: after a 429 `lbSchedule` calls `lbSubmit()`
  // with no arguments, and a flag parameter would be lost here (verified by code).
  if (!(s > 0) && !(lbSentScore > 0)) return { state: 'ok', skipped: true, sent: s, score: s,
    rank: null, exact: false, dup: false };
  lbSending = true;
  try {
    const t = Math.floor(Date.now() / 1000);
    // `q` is the attempt number: by it the server tells a REPEAT (409 dup) from a new
    // submission. It grows monotonically, otherwise a repeat would look like a new record.
    const q = Math.max(lbLastQ + 1, t);
    lbLastQ = q;
    const sig = await lbSign(id + '.' + s + '.' + q + '.' + t);
    if (!sig) return { state: 'offline' };
    const payload = { id: id, n: nm, a: av, s: s, q: q, t: t, sig: sig };
    // The key leaves in EXACTLY the first submission (row creation); against an existing one
    // the server will not accept it — and that is not our bug, but its protection.
    if (!lbRegistered()) payload.k = lbKey();
    const r = await lbFetch('/v1/score', { method: 'POST', body: JSON.stringify(payload) });
    // ⚠️⚠️ A 429 MEANS «WAIT», NOT «THROW AWAY». The owner's typical path: the win
    // submitted the score, the player immediately buys a multiplier on the win screen — the second
    // submission lands inside the rate window. Were we to lose it, «spending drops you on
    // the leaderboard immediately» would not happen in exactly the scenario all of this was
    // built for; the next submission would leave only after the NEXT win.
    // ⚠️ How long to wait is told by the SERVER (the `retry` field): keeping our own copy of its `RATE_SEC`
    // here is not allowed — it would match today and drift apart at the very first
    // edit of the window, which this file will not learn about.
    if (r.state === 'refused' && r.err === 'rate') {
      const wait = Number(r.body && r.body.retry) || LB_RETRY_FALLBACK_S;
      lbSchedule(wait);
      return { state: 'deferred', retryIn: wait };
    }
    if (r.state !== 'ok') return { state: r.state };
    if (r.body.ok) lbMarkRegistered();
    lbSentScore = s;
    try { localStorage.setItem(LB_SENT_LS, String(s)); } catch (e) {}
    lbInvalidate();
    lbFireSent({ score: s, rank: (typeof r.body.rank === 'number') ? r.body.rank : null });
    return {
      state: 'ok',
      dup: !!r.body.dup,
      // ⚠️ WE PASS `null` OUTWARDS AS IS. The former `|| 0` turned «nothing to
      // say» into a number, and the screen would not be able to tell it from a real rank.
      // The estimate in the submission response is not a rank at all — see the client contract.
      rank: (typeof r.body.rank === 'number') ? r.body.rank : null,
      exact: !!r.body.exact,
      // ⚠️ BOTH NUMBERS GO OUTWARDS, AND THAT IS LOAD-BEARING: `sent` is what we submitted,
      // `score` is what the server recorded. Today they match, but the screen must
      // be able to show the discrepancy: as soon as the server starts doing something with the
      // score, the difference will become the only way to notice it.
      sent: s,
      score: r.body.s,
    };
  } finally {
    lbSending = false;
    // A change that arrived while in flight is not lost — we send it right after.
    if (lbAgain) { lbAgain = false; lbSchedule(LB_CHANGE_DELAY_S); }
  }
}

// ⚠️⚠️ SPENDING MUST DROP YOU ON THE LEADERBOARD IMMEDIATELY (the owner's direct word
// 2026-08-09), and dropping our own cache is not enough for that — we have to SUBMIT the new number.
// Here there used to be only `lbInvalidate()`: the screen re-read the leaderboard and saw
// the OLD score in it, because on the server it was indeed sitting there old until the next win.
// ⛔ And why this could not be solved with the platform submission: the platform's server
// stores the MAXIMUM and silently ignores a smaller value (measurement 2026-07-29) —
// only our own leaderboard can lower you.
try {
  if (typeof onStarsChange === 'function') onStarsChange(function () {
    lbInvalidate();
    lbSchedule(LB_CHANGE_DELAY_S);
  });
} catch (e) {}

// ⚠️ THE TEST SURFACE IS OUR OWN OBJECT, NOT `__game`. The reason is not
// squeamishness: `__game` is ONE literal in 99-main (someone else's zone), and two
// definitions of the same name there do not conflict but silently overwrite each other —
// the hook starts returning `undefined`, that is, plausible zeros. The project has
// been burned by this before (`itemsBrief`). Our own namespace rules such a collision
// out BY CONSTRUCTION.
window.__lb = {
  top: lbTop, me: lbMe, submit: lbSubmit, invalidate: lbInvalidate, onSent: lbOnSent,
  base: function () { return LB_BASE; },
  // ⚠️ Outwards goes the SUBMISSION STATE, not an «all is well» flag: the guard must
  // see that the deferred send is ALIVE (a timer is scheduled), otherwise «the 429 is not
  // lost» would be checked against a returned word rather than against the fact.
  pending: function () { return { timer: !!lbTimer, again: lbAgain, sent: lbSentScore }; },
};
