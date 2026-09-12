// ===== GOOGLE SIGN-IN, THE CLIENT HALF =====
// The server half is `server/pay/` (one endpoint, `/v1/auth`), the whole design and the six
// measured traps are in docs/GOOGLE-AUTH.md. His word: «I need a Google account and its name, with
// the leaderboard on a separate domain as it is now», and his answer to the one fork: «the purchases
// and the place in the table» — signing in on a new device brings back the PURCHASES and the ROW;
// the collection,
// the level and the boosts stay on the device.
//
// ⛔⛔ THE ENDPOINT LIVES IN THE PAY WORKER, AND THE MODULE THAT TALKS TO IT IS 83-pay: it already
// owns the gid, a trust-on-first-use key table and a D1, and the main thing sign-in buys the player
// is his purchases back. This module owns the ORDER OF THE STEPS and nothing else — the protocol is
// 83-pay's, the save arithmetic is 77-save's, the button is drawn by 85-hud into a host element.
//
// ⚠️ THE MODULE NUMBER IS LOAD-BEARING: 85-hud calls `authRenderButton` at runtime (functions are
// hoisted across the concatenation, so that direction is free), while nothing here reads another
// module's `const` at the TOP LEVEL — the temporal dead zone that cost this project six days
// (2026-08-13). Everything below runs on a call, never at load.

const AUTH_GSI_SRC = 'https://accounts.google.com/gsi/client';
// ⚠️ THE WORDING OF A REFUSAL IS PRODUCT, NOT PLUMBING. `bound` in particular is a WALL and it was
// named to the owner as one: a second person cannot CREATE an account on a phone whose identity is
// already some account's — he can only sign in with an account made on another device. That is the
// server's «one identity, one account» rule (trap 5) seen from the player's side.
const AUTH_MSG = {
  bound: 'This device already belongs to another account',
  noclient: 'Sign-in is not set up yet',
  net: 'No connection',
};
let authCfg = null;        // { cid } — the client id, read ONCE from the worker, never a second copy
let authGisP = null;       // the library's load promise
let authBusy = false;
let authLast = { state: '', err: '' };

// THE GATE IS THE PAYMENT'S OWN (our own origin, not in an iframe, not the wrapper). Google's
// library must not land in the portal's console or in an App Store review.
function authOn(){ try { return typeof payHostOk === 'function' && payHostOk(); } catch (e) { return false; } }
function authSignedIn(){ try { return Save.gs === 'g' && !!Save.gn; } catch (e) { return false; } }
function authCanRestore(){ try { return !!Save.gp; } catch (e) { return false; } }

function authGetCfg(){
  if (authCfg) return Promise.resolve(authCfg);
  if (!authOn() || typeof payAuthCfg !== 'function') return Promise.resolve(null);
  return payAuthCfg().then((c) => { authCfg = (c && c.cid) ? c : null; return authCfg; }, () => null);
}

// ⚠️⚠️ AN ALREADY PRESENT LIBRARY SHORT-CIRCUITS THE INJECT, AND THAT IS BOTH THE CORRECT CHECK AND
// THE ONLY WAY A STAND CAN EXERCISE THIS PATH: a bench stubs `window.google.accounts.id` and no
// third-party script is ever fetched. The check therefore stands BEFORE the tag, not after it.
function authLoadGis(){
  try { if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve(window.google.accounts.id); } catch (e) {}
  if (!authOn()) return Promise.reject(new Error('gate'));
  if (authGisP) return authGisP;
  authGisP = new Promise((ok, bad) => {
    const el = document.createElement('script');
    el.src = AUTH_GSI_SRC; el.async = true; el.defer = true;
    el.onload = () => {
      try { if (window.google && window.google.accounts && window.google.accounts.id) return ok(window.google.accounts.id); } catch (e) {}
      bad(new Error('gis'));
    };
    el.onerror = () => bad(new Error('gis'));
    document.head.appendChild(el);
  });
  return authGisP;
}

// ⛔⛔ GOOGLE'S OWN RENDERED BUTTON, AND NOT A BUTTON OF OURS: with a custom one the GIS library
// does not hand back an ID TOKEN at all, only an access token through a second flow — and an ID
// token is exactly what the worker verifies against Google's JWKS.
// ⚡ SO THE LINE HE DREW (node 840:4681) IS THE PICTURE AND GOOGLE'S BUTTON IS THE HIT AREA:
// 85-hud overlays the rendered button on it at `opacity:0`, clipped to the line's own box. The
// token path stays 100% Google's; what changes is only what the eye sees.
// ⚠⚠ ONE `initialize` SERVES BOTH THE BUTTON AND THE ONE TAP, and that is not tidiness: the call
// is GLOBAL library config, so a second one with different options would silently re-point the
// callback and re-decide auto-select for whichever consumer ran last.
let authGis = null;        // the library handle, kept so the prompt and the sign-out can reach it
let authInited = false;    // `initialize` has run — once per page, by the line above
let authTapped = false;    // the One Tap has been asked for this launch

async function authInit(){
  if (authInited) return true;
  if (!authOn()) return false;
  const cfg = await authGetCfg();
  if (!cfg || !cfg.cid) return false;          // the worker carries no client id yet — nothing to configure
  try { authGis = await authLoadGis(); } catch (e) { return false; }
  try {
    authGis.initialize({
      client_id: cfg.cid,
      callback: authCredential,
      // ⚡ AUTO-LOGIN IS HIS OWN «auto-login if possible», AND IT BUYS MORE THAN A SAVED TAP: it
      // re-covers Safari's seven-day eviction of localStorage (2026-09-04-a) — a player whose save
      // was swept comes back to his purchases and his row without touching anything.
      auto_select: true,
      // ⛔ WITHOUT `itp_support` THE PROMPT DOES NOTHING AT ALL IN SAFARI, which is his own
      // browser. It costs nothing in the engines that do not need it.
      itp_support: true,
      // ⚠ UNDER FedCM THE BROWSER OWNS THE PROMPT'S UI. We ask for it explicitly rather than
      // letting the library guess, and we read the RESULT through the callback — never through
      // the moment notifications, which FedCM took away.
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: true,
    });
  } catch (e) { return false; }
  authInited = true;
  return true;
}

async function authRenderButton(host){
  if (!host || !authOn()) return false;
  if (!(await authInit())) return false;
  try {
    host.textContent = '';
    authGis.renderButton(host, { theme: (typeof GSI_THEME === 'string' ? GSI_THEME : 'outline'),
      size: 'medium', type: 'standard', shape: 'pill', text: 'signin_with' });
  } catch (e) { return false; }
  return true;
}

// ⚡ THE ONE TAP ON ENTERING THE GAME (his word 2026-09-11-v: «show the native Google popup in
// the top-right corner on entering the game, auto-login if possible»).
// ⚠⚠ THE CORNER IS GOOGLE'S TO CHOOSE, NOT OURS, AND HE WAS TOLD SO: on a desktop the prompt is
// a card in the TOP-RIGHT of the window — which is what he asked for — while the same call on a
// phone renders a BOTTOM SHEET, and no option of the library moves it. What we own is when it is
// asked for, and whether a returning player is signed in without a tap.
// ⚠ ONCE PER LAUNCH: the library has its own cooldown after a dismissal, and asking twice in one
// session would spend it for nothing and read as nagging.
function authPromptOneTap(){
  if (authTapped) return false;
  if (!authOn()) return false;
  if ((typeof authSignedIn === 'function') && authSignedIn()) return false;   // already his account
  authTapped = true;
  authInit().then((ok) => {
    if (!ok || !authGis) return;
    // ⛔ NO MOMENT LISTENER. Under FedCM `getNotDisplayedReason` and its neighbours are gone, and
    // a branch on them would throw or lie; the only honest signal that the prompt worked is the
    // credential arriving at `authCredential` — the same callback the button uses.
    try { authGis.prompt(); } catch (e) {}
  }, () => {});
  return true;
}

function authCredential(resp){
  const tok = resp && resp.credential;
  if (!tok) return Promise.resolve(authFail('token'));
  return authExchange(tok);
}

function authFail(err){
  authLast = { state: 'refused', err: err || 'net' };
  const msg = AUTH_MSG[err];
  try { if (msg && typeof toast === 'function') toast(msg); } catch (e) {}
  return authLast;
}

async function authExchange(tok){
  if (authBusy) return authLast;
  if (!authOn() || typeof payAuth !== 'function') return authFail('net');
  authBusy = true;
  try {
    const r = await payAuth(tok);
    if (!r) return authFail('net');
    if (r.err || r.ok !== 1) return authFail(r.err || 'net');
    return await authApply(r);
  } catch (e) {
    return authFail('net');
  } finally { authBusy = false; }
}

// ===== THE SEVEN STEPS, AND THEIR ORDER IS THE MECHANIC =====
async function authApply(r){
  const before = (typeof guestId === 'function') ? guestId() : '';
  // 1-2. the way back and the identity (identityAdopt writes `gp`/`lp` once and commits)
  const adopted = (typeof identityAdopt === 'function') ? identityAdopt(r.gid, r.k) : false;
  // the name always — a sign-in that changes nothing else still brings the account's name
  if (typeof playerNameSet === 'function') playerNameSet(r.name, 'g');
  // ⚠️ THE PHOTO IS WRITTEN EVEN WHEN IT IS EMPTY, and that is the point: an account with no photo
  // must CLEAR whatever a previous account left, or the circle keeps a stranger's face.
  // ⛔ AN OLD WORKER SENDS NO `pic` AT ALL — the field is simply absent, `playerPhotoSet` stores an
  // empty string and the animal picture stays. The feature appears when the worker is deployed, and
  // that deploy is the owner's action.
  if (typeof playerPhotoSet === 'function') playerPhotoSet(r.pic);
  let lifted = 0, score = -1;
  if (adopted){
    // ⛔⛔ THE CACHE IS DROPPED BEFORE `lbMe`, NOT AFTER. `lbMe` serves a 20-second cache, and that
    // cache holds the answer for the OLD id — the lift would then be counted against a stranger's
    // score, on the device of the player it was meant to rescue.
    try { if (typeof lbInvalidate === 'function') lbInvalidate(); } catch (e) {}
    let me = null;
    try { me = (typeof lbMe === 'function') ? await lbMe() : null; } catch (e) {}
    if (me && me.state === 'ok' && typeof me.score === 'number') score = me.score;
    // ⚠️ NO ROW ON THE SERVER IS NOT A ZERO: a fresh account has no row at all, and `lbMe` answers
    // without a `score` field. Lifting to 0 from a negative raw would be a silent gift.
    if (score >= 0 && typeof identityLift === 'function') lifted = identityLift(score);
    // ⚠️ THE TWO REGISTRATION MARKS NEED NO CLEARING AND ARE DELIBERATELY LEFT ALONE: both NAME the
    // id they were earned for (`lbRegistered(id)`, `payRegistered(gid)` compare against it on the
    // path), so a change of id invalidates them by itself — verified by reading, 2026-09-06-e.
  }
  // ⛔ THE ONE MEMORY THAT DOES NOT NAME AN ID IS THE LAST SUBMITTED SCORE, and a sign-in usually
  // does not move the score — without this the row would keep the animal name until it next did.
  try { if (typeof lbForgetSent === 'function') lbForgetSent(); } catch (e) {}
  // the purchases come back by the same road a returning payment takes
  try { if (window.Ads && typeof Ads.restorePurchases === 'function') Ads.restorePurchases(); } catch (e) {}
  // ⚠️ `fireStarsChange` AND NOT A SUBMISSION OF OUR OWN: seven places already go through it, and
  // its leaderboard subscriber is what drops the cache and schedules the send. A second tract next
  // to a working one is the defect this project has paid for five times.
  try { if (typeof fireStarsChange === 'function') fireStarsChange(); } catch (e) {}
  authRedraw();
  authLast = { state: 'ok', err: '', name: (r.name || ''), gid: (r.gid || ''), was: before,
    adopted: !!adopted, fresh: !!r.fresh, lifted: lifted, score: score };
  return authLast;
}

// ⛔⛔ SIGN-OUT GIVES THE DEVICE ITS OWN IDENTITY BACK, AND THAT IS WHY HE WANTED IT AT ALL («a
// phone is shared»): a name-only sign-out would leave the phone BEING that account — the next
// person plays, earns and BUYS under a stranger's gid.
// ⛔ IT NEVER GENERATES A NEW gid: that would strand this device's purchases behind an id nobody
// remembers — the very hole this feature exists to close.
function authSignOut(){
  // ⛔⛔ WITHOUT THIS THE NEXT LAUNCH SIGNS THE SAME ACCOUNT STRAIGHT BACK IN, BEFORE ANYONE HAS
  // TAPPED ANYTHING: `auto_select` remembers the last account, and the One Tap on entry would undo
  // the sign-out in silence. A shared phone is the whole reason sign-out exists at all.
  try { if (authGis && authGis.disableAutoSelect) authGis.disableAutoSelect(); } catch (e) {}
  const restored = (typeof identityRestore === 'function') ? identityRestore() : false;
  if (!restored){
    // The account was CREATED from this device: the identity is the device's own, only the name goes.
    try { if (Save.gs === 'g'){ Save.gn = ''; Save.gs = ''; commitSave(); } } catch (e) {}
  }
  try { if (typeof lbInvalidate === 'function') lbInvalidate(); } catch (e) {}
  try { if (typeof lbForgetSent === 'function') lbForgetSent(); } catch (e) {}
  try { if (typeof fireStarsChange === 'function') fireStarsChange(); } catch (e) {}
  authRedraw();
  authLast = { state: 'out', err: '', restored: !!restored };
  return authLast;
}

function authRedraw(){
  try { if (typeof refreshGuestProfile === 'function') refreshGuestProfile(); } catch (e) {}
  try { if (typeof refreshAuthUi === 'function') refreshAuthUi(); } catch (e) {}
  try { if (typeof updateHUD === 'function') updateHUD(); } catch (e) {}
}

function authState(){
  let sv = {};
  try { sv = Save || {}; } catch (e) { sv = {}; }
  return {
    on: authOn(), cid: authCfg ? (authCfg.cid || '') : '',
    signedIn: authSignedIn(), canRestore: authCanRestore(),
    name: sv.gn || '', src: sv.gs || '', photo: sv.ga || '', lift: sv.gr || 0, own: sv.gp || '',
    inited: authInited, tapped: authTapped,
    gid: (typeof guestId === 'function') ? guestId() : '',
    last: authLast,
  };
}
