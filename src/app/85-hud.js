// ===== 85-hud: DOM helpers and interface updates =====

function $(id){ return document.getElementById(id); }

// ===== LOADING CURTAIN: the `html.uiready` latch (CSS part in shell.html) =====
// The owner's spec 2026-07-30: «while the bridge is loading there must be no
// interface elements at all. They appear smoothly right afterwards».
// ⚠️ WE OPEN IT ONCE AND NEVER CLOSE IT. The core removes `introdone` in startIntro
// (99-main) at the start of EVERY level, so a curtain hung directly on
// introdone would blank the HUD on every intro — that is wider than the spec. Hence our own
// latch: the first introdone opens it forever.
// ⚠️ WE DO NOT HOOK THE SPLASH'S `#loading-overlay`: that is the private DOM of a foreign SDK,
// and the SDK removes it itself (measurement: the splash left at 3947 ms, while GAME_READY leaves
// only at 4359) — an observer keyed to a foreign id will silently break on a Bridge
// update. We observe ONLY our own <html>.
// ⚠️ THE SAFETY TIMEOUT IS MANDATORY: if the intro never arrived (an error, a hung
// bridge), the HUD would stay hidden FOREVER and the game would look utterly broken
// — worse than the original bug. Once the limit expires we open unconditionally.
const UI_CURTAIN_MAX_MS = 8000;
let uiCurtainObs = null;
function openUICurtain(){
  document.documentElement.classList.add('uiready');
  if (uiCurtainObs){ uiCurtainObs.disconnect(); uiCurtainObs = null; }
}
if (document.documentElement.classList.contains('introdone')) openUICurtain();
else {
  uiCurtainObs = new MutationObserver(function(){
    if (document.documentElement.classList.contains('introdone')) openUICurtain();
  });
  uiCurtainObs.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  setTimeout(openUICurtain, UI_CURTAIN_MAX_MS);
}
// ⚠️ A SINGLE SHOW/HIDE POINT = a single point of SCREEN accounting (docs/METRICS.md
// §3). Hanging a measurement on each overlay separately is pointless: there are seven of them, and
// a new eighth one would silently drop out of the statistics.
const SCREEN_OF = { winOverlay:'win', pauseOverlay:'pause', adOverlay:'ad',
  starsOverlay:'more_stars', museumOverlay:'museum', loseOverlay:'lose' };
// ⛔⛔ THE EDGE MACHINERY WAS REMOVED ENTIRELY 2026-08-14 — the owner's word: «remove all
// attempts to hide or extend the fields at the top and bottom, as I asked for ios 26 —
// we need to rule out all problems with extra code on top or with crutches».
// It used to be: chromeSync (the single driver) wrote --edge-top-rgb/--edge-bot-rgb,
// the html/body background and the theme-color meta in lockstep; the bars carried a background at alpha .01 as
// the channel for Safari 26's live sampling. Removed TOGETHER with viewport-fit=cover — otherwise
// the black bars would come back (Safari reads a fixed bar's `transparent` as
// «transparent black»). Now the page lives in the safe area, and the strips at
// the edges are drawn by the system. The five editions of the saga are in CLAUDE.md; bringing back any
// one item from this set is FORBIDDEN, only the whole set at once.
// ⚠️⚠️ THE TOAST UNDER THE EYES IS TORN DOWN WHENEVER A SCREEN OPENS (the owner's word
// 2026-08-23-a: «the notification under the eyes sometimes crawls out onto the final screen
// and onto the pause screen»). It is `position:fixed` at z-index 60, i.e. ABOVE every
// overlay in the project, so nothing else was ever going to cover it.
// ⚠️⚠️ THE TIMER IS KILLED TOGETHER WITH THE CLASS, AND THAT IS THE ACTUAL BUG. `multToastT`
// is a bare real-clock setTimeout: it is not held by `paused` and not queued by
// `afterPause`. Removing the class without clearing the timer leaves a live callback that
// will strip `.on`/`.up` later — and, worse, the NEXT toast would inherit a stale timer and
// vanish early. Hiding and forgetting is deliberate: he complained about clutter, so a
// toast swallowed by the win screen is simply lost, not queued for later.
function hideMultToast(){
  try {
    const el = $('multToast');
    if (el){ el.classList.remove('on'); el.classList.remove('up'); }
    if (multToastT){ clearTimeout(multToastT); multToastT = 0; }
    if (multTween){ cancelAnimationFrame(multTween); multTween = 0; }
  } catch(e){}
}
function show(id){
  const el = $(id);
  el.style.display = 'flex';
  chromeStripsSync();   // the Safari 26 strips follow the screen (84-chrome, 2026-09-05)
  // edges: any full-screen fade darkens the strips (5th edition)
  hideMultToast();   // 2026-08-23-a — see the comment above hideMultToast
  if (SCREEN_OF[id]) Telemetry.screen.enter(SCREEN_OF[id]);
  if (id === 'winOverlay') renderWinScreen();
}
function hide(id){
  const el = $(id);
  el.style.display = 'none';
  chromeStripsSync();   // 84-chrome, 2026-09-05
  // back in the game — the screen is 'game' again (if the run is alive)
  if (SCREEN_OF[id]) Telemetry.screen.enter(typeof level !== 'undefined' && level && !level.over ? 'game' : 'menu');
  if (id === 'winOverlay'){ winStopScore(); }
}

// ===== LEVEL COMPLETION SCREEN (Figma 778:732) =====
// Drawn from the LIVE state when the overlay is shown (the hook in show above). checkEnd
// (80-gameplay, OUTSIDE my zone) has already counted the score, incremented levelNum and
// written the hidden holders winTitle/… — I read the state and paint the stickers.
let winScoreRAF = 0, winScoreTO = 0;
// ⚠️ THE TIME HAS ITS OWN PAIR OF HANDLES AND SHARES THE STOPPER (2026-08-23-e, «add an
// animation to the time like the one on the score»). Separate handles because the two count-ups
// run on different schedules; ONE stopper because they are torn down by the same event — the
// screen closing — and a second stopper would be a second truth about when that happens.
let winTimeRAF = 0, winTimeTO = 0;
let winRwTO = 0;              // the reward badges' tick-up (2026-09-01-n)
// count-up stop: we kill BOTH the timer AND the rAF (called from hide — otherwise after a click on
// Next the count-up would write into the hidden #winScore and could spill into the next level)
function winStopScore(){ if (winScoreRAF) cancelAnimationFrame(winScoreRAF); if (winScoreTO) clearTimeout(winScoreTO); winScoreRAF = winScoreTO = 0;
  if (winTimeRAF) cancelAnimationFrame(winTimeRAF); if (winTimeTO) clearTimeout(winTimeTO); winTimeRAF = winTimeTO = 0;
  // ⚠️ THE BADGE TICK JOINS THE SAME STOPPER RATHER THAN GETTING ITS OWN: all three are torn down
  // by ONE event - the screen closing - and a second stopper would be a second truth about when
  // that happens.
  if (winRwTO) clearTimeout(winRwTO); winRwTO = 0; }
// compression as in the HUD (≥10000 → «12.5k»): a large score does not break the 320 frame and
// is consistent with the game screen's score (otherwise HUD «12.5k» vs win «124800»)
// THE BIG-NUMBER COMPRESSOR — shared by the win screen AND the score chip in the HUD.
// Steps: <10k as is · <100k «12.5k» · <1M «125k» (the fraction is no longer needed,
// and the sign saves space) · beyond that «1.2M». At most 5 characters — that is what
// cures the chip overlapping the eyes (see the call in updateHUD).
// ⚠️ The M branch was added 2026-07-28: with bundles the wallet becomes
// 7-digit (META: ~29 levels at x5), and without it we would have got «1200k».
function winFmtScore(n){
  n = n | 0;
  if (n < 10000) return '' + n;
  if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}
function renderWinScreen(){
  // ⚠️⚠️ WE UPDATE THE LEADERBOARD ROW SYNCHRONOUSLY AND FIRST, BEFORE THE SCORE: it itself
  // sets/clears `hidden` without the network, so its height (12+48+12 = 72) exists
  // already in the FIRST frame of the screen. The data arrives later and CHANGES ONLY THE TEXT —
  // the Next button below the list will not slide out from under the finger. The same rule by which
  // the former `#winLb` inset lived.
  // ⚠️ Wrapped in try: the win screen matters more than the leaderboard row, and a network failure,
  // a disabled feature or a missing module must not dare to bring the display down.
  try { lbEntryRefresh(); } catch (e) {}
  const wrap = $('winWrap'); if (!wrap) return;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // levelNum has already been incremented in checkEnd → the one just completed = levelNum-1
  const lv = Math.max(1, (typeof levelNum === 'number' ? levelNum - 1 : 1));
  const score = (typeof stats !== 'undefined' && stats) ? Math.max(0, stats.score | 0) : 0;
  // the ★-number on the win screen = the DENOMINATED gain (score/SCORE_DENOM) = exactly
  // as much as went into the balance (bankLevelScore) and by how much the chip grew. A single
  // balance: chip/wallet/leaderboard/win — one scale (dispatcher's decision v113)
  const bal = Math.floor(score / (typeof SCORE_DENOM === 'number' ? SCORE_DENOM : 10));
  const secs = (typeof stats !== 'undefined' && stats && stats.t0)
    ? Math.max(0, Math.round((performance.now() - stats.t0) / 1000)) : 0;
  const lt = $('winLevel'); if (lt) lt.textContent = 'Level ' + lv;
  const tt = $('winTime'); if (tt) tt.textContent = fmtTime(secs);
  // ⚠️⚠️ THE FINAL VALUE IS WRITTEN **BEFORE** `fitWinTopRow`, AND THAT ORDER IS LOAD-BEARING FOR
  // THE COUNT-UP BELOW: the fit shrinks each frame of the row to the width of the text it holds,
  // so it must measure the LONGEST string the animation will ever show — the final one. Fit on
  // «0:00» and a run of ten minutes would spill out of its own box on the last frame.
  fitWinTopRow();
  renderWinTop(reduce);
  // ⛔ There is no leaderboard inset here (the owner's word); its cluster was cut out by the cleanup
  // of 2026-08-12 — the former «left alive: hooks hang on them» went stale, nobody
  // read those hooks, tests included (a census of usages).
  // THE SCORE — an animated count-up (reduce/0 → immediately); it starts in sync with the pop
  winStopScore();
  // ⚠️⚠️ THE SCORE IS WRITTEN INTO BOTH OUTLINE LAYERS BY ONE PIECE OF CODE (2026-08-21-r). The text
  // is drawn twice — white 12 underneath, black 6 on top; a second writer
  // would diverge from the first on the count-up, and the outline would lag behind the digit.
  // ⚠️ A setter wrapper, not a list: below there are four assignments to `st.textContent`,
  // and rewriting each one would mean four places instead of one.
  const layers = Array.prototype.slice.call(document.querySelectorAll('.win-score text'));
  const st = layers.length ? { set textContent(v){ layers.forEach(n => { n.textContent = v; }); } } : null;
  if (st){
    if (reduce || bal <= 0){ st.textContent = '★ ' + winFmtScore(bal); }
    else {
      st.textContent = '★ 0';
      winScoreTO = setTimeout(()=>{
        const t0 = performance.now(), dur = 700;
        const tick = ()=>{
          const p = Math.min(1, (performance.now() - t0) / dur);
          st.textContent = '★ ' + winFmtScore(Math.round(bal * (1 - Math.pow(1 - p, 3))));
          winScoreRAF = p < 1 ? requestAnimationFrame(tick) : 0;
        };
        winScoreRAF = requestAnimationFrame(tick);
      }, 520);
    }
  }
  // ⛔⛔ THE TIME COUNTS UP TOO (the owner's word 2026-08-23-e: «add an animation to the time
  // like the one on the score»). ⚠️ «LIKE THE SCORE» READ AS THE COUNT-UP, NOT AS THE POP: the
  // time ALREADY has an entrance of its own (`winTimeIn`, .72s in the cascade) — what it lacked
  // beside the score was the number spinning up to its value. The shape is copied exactly, not
  // re-invented: the same 520 ms wait, the same 700 ms duration and the same cubic ease-out
  // `1 − (1−p)³`, so the two numbers on the card breathe together instead of beating.
  // ⚠️ IT COUNTS IN SECONDS AND FORMATS EACH FRAME, rather than interpolating the STRING: a
  // string tween would walk through nonsense like «0:9» on the way to «1:05».
  // ⚠️ `reduce` AND A ZERO RUN BOTH LAND ON THE FINAL VALUE AT ONCE — the same two exits the
  // score uses; a count-up from 0 to 0 is an animation that shows nothing and still costs a frame.
  if (tt){
    if (reduce || secs <= 0){ tt.textContent = fmtTime(secs); }
    else {
      tt.textContent = fmtTime(0);
      winTimeTO = setTimeout(()=>{
        const t0 = performance.now(), dur = 700;
        const tick = ()=>{
          const p = Math.min(1, (performance.now() - t0) / dur);
          tt.textContent = fmtTime(Math.round(secs * (1 - Math.pow(1 - p, 3))));
          winTimeRAF = p < 1 ? requestAnimationFrame(tick) : 0;
        };
        winTimeRAF = requestAnimationFrame(tick);
      }, 520);
    }
  }
  // ── THE REWARD BADGES TICK UP BY ONE (his word 2026-09-01-n) ────────────────────────────────
  // The number starts one short of the total and flips to it with a bounce once the reward row
  // has finished rising, so the win is READ rather than merely stated.
  // ⚠️⚠️ THE MOMENT IS TIED TO THE CASCADE AND NOT PICKED BY EYE: `.win-reward` rises at .86 s
  // over .4 s (`winRise`), so it is settled at 1.26 - the flip at 1.45 lands on a still badge.
  // Move that keyframe and this number must move with it; they are one sequence.
  // ⚠️ `reduce` LANDS ON THE FINAL VALUE AT ONCE - the same exit the score and the time take, and
  // the rule this project applies to every new motion.
  // ⚠️ A SLOT WITH NO `data-to` IS LEFT ALONE ENTIRELY: that is the shake pill on a level that paid
  // no shake, and writing a number into a hidden slot would leave a stale one there next time.
  {
    const slots = [];
    document.querySelectorAll('.win-rw').forEach(el => {
      const b = el.querySelector('.win-rw-n');
      const to = parseInt(el.dataset.to || '', 10);
      if (!b || !isFinite(to)) return;
      b.classList.remove('bump');
      if (reduce){ b.textContent = String(to); return; }
      b.textContent = String(Math.max(0, to - 1));
      slots.push({ b, to });
    });
    if (slots.length){
      winRwTO = setTimeout(() => {
        winRwTO = 0;
        for (const s of slots){
          s.b.textContent = String(s.to);
          // the reflow restart, as at the showcase panel's `.hit`: without it a second win in a
          // row would not replay the keyframes
          s.b.classList.remove('bump'); void s.b.offsetWidth; s.b.classList.add('bump');
          // ⚠️ AND IT COMES OFF BY THE EVENT, NOT BY A TIMER (the Shake toss's idiom): a timer
          // drifts from the keyframes at the first edit of the duration, and a class left on is
          // one rule away from meaning something it should not.
          s.b.addEventListener('animationend', () => s.b.classList.remove('bump'), { once: true });
        }
      }, 1450);
    }
  }
  // RESTART OF THE ENTRANCE ANIMATION: the reflow trick — the children's CSS animations play
  // again on every show (a fast Next→win does not «eat» the animation)
  wrap.classList.remove('win-in'); void wrap.offsetWidth; wrap.classList.add('win-in');
}
// ⛔ HERE LIVED THE LEADERBOARD INSET ON THE WIN SCREEN (WIN_LB_MS, winLbStop/Source/
// Adapt/Render, renderWinLb) — removed by the owner's word («there is no inset any more»),
// the cluster was CUT OUT by the cleanup of 2026-08-12 on his own order «delete the old and
// unused»: nobody read it, tests included. To bring it back — from the git history;
// the «rank after a win» requirement is covered by the menu plate and the leaderboard screen
// (the instant recount of lbOnSent). The guard «there is NO inset» is alive and stayed.
// ===== LEADERBOARD SCREEN: TWO TABS =====
// ⚠️⚠️ THE TEXT ABOUT THE DIVERGENCE OF THE NUMBERS IS WRITTEN BY THE OWNER HIMSELF. Until then there stands
// a VISIBLY MARKED stub here, and in the suite — a guard asserting that the mark is STILL
// IN PLACE. When the real text arrives the guard WILL GO RED and force the mark to be removed
// deliberately. A silent stub («an empty string») would have gone into the release
// unnoticed — the same «inverse assertion» trick as with the removed gradient.
// ⛔ THE STUB FOR THE OWNER'S TEXT WAS REMOVED TOGETHER WITH THE TABS: it explained
// the divergence of the numbers of the TWO tabs, and the tabs are cancelled — there is nothing to explain.
// The screen's subtitle is now taken from the mockup (846:1274).
let lbEpoch = 0;
// ⚠️ THE EPOCH IS ON THE DISCARD, as with the inset: the player switches tabs faster than
// the network answers, and the answer of the previous tab must not dare to draw itself into the fresh one.
function lbScreenStop(){ lbEpoch++; }
// ─── THE LEADERBOARD ENTRY POINT (menu, mockups 840:4344 mob. / 840:4633 desk.) ───
// ⚠️ BOTH NUMBERS GO THROUGH `window.__lb` AND ONLY THROUGH IT: it alone holds
// the `top()`/`me()` cache and knows how to do a ONE-OFF bypass of the browser's HTTP cache after a reset
// (without it the rank would not change for a whole minute right after a win and after a spend —
// found by a live run). The menu is opened often, and a second network path would start
// a request on every opening.
let lbEntryEpoch = 0;
// ⚠️ THE EPOCH IS NEEDED HERE FOR THE SAME REASON AS WITH THE WIN INSET: the menu
// is closed faster than the network answers, and the answer of the previous opening must not dare
// to draw itself into the next one. The check comes BEFORE a single touch of the DOM.

// ⚠️⚠️ THE RANK BY THE LIVE SCORE — ONE FUNCTION FOR ALL CONSUMERS.
// The owner's complaint 2026-08-17-d: «with the leaderboard there is still the same delay when
// spending points, the position needs to be counted faster». He spends STANDING IN THE MENU, while
// the server learns the new number no earlier than the send (rate 20 s) — for that whole window
// the rank stayed the same.
// ⚠️⚠️ THE MAIN SOURCE IS THE NEIGHBOURS FROM `/v1/me` (`up`/`dn`, five on each
// side), and NOT the top segment. The top comes from an HOURLY SNAPSHOT and covers
// only the first hundred: a player at rank 3000 never got into it, and for
// him the «instant rank» did not work at all. The neighbours are requested from the LIVE database and
// exist at any rank of the table.
// ⛔ THIS IS NOT A REPEAL OF THE CLOSED-REFUSAL RULE: the estimate (`exact:0`) we do not
// show anywhere. Here the EXACT position is computed — exactly while the live score
// has not left the known window; once it has — we return `null`, and the consumer stays on
// the server's number.
// ⚠️ TIES ARE RESOLVED BY THE SERVER'S ORDER (`ORDER BY s DESC, u ASC`):
// a neighbour below with the SAME score stands lower than me by identifier, which means that on
// a fall to exactly his number I do NOT pass him. Hence the strict comparison.
function lbRankNow(m, live, top){
  if (!m || m.state !== 'ok' || !m.exact || !(m.rank > 0)) return null;
  const srv = m.score | 0;
  if (live === srv) return m.rank | 0;            // the server caught up — its number is more exact
  // ── NEIGHBOURS (exact at any rank of the table) ──
  const nearWin = (live < srv) ? m.dn : m.up;
  if (Array.isArray(nearWin) && nearWin.length){
    // how many neighbours I crossed: downwards — those who are now above me; upwards — those
    // whom I overtook
    let passed = 0;
    for (const r of nearWin){
      if (!r) continue;
      const s = r.score | 0;
      if (live < srv ? (s > live) : (s < live)) passed++;
    }
    // ⚠️⚠️ THE WINDOW IS EXHAUSTED — THERE MAY BE MORE BEYOND IT, AND WE HAVE NO ANSWER: we return
    // `null`, the consumer stays on the server's number. The temptation of «the window is shorter
    // than five, so there are no more neighbours» is REJECTED — the five is the SERVER's `NEAR_N`,
    // and a copy of it here would diverge from it at the first edit (the law
    // on which the project has been burned five times over). The rule is strict and always correct.
    if (passed < nearWin.length) return Math.max(1, (m.rank | 0) + (live < srv ? passed : -passed));
  }
  // ⛔ HERE STOOD THE BRANCH «the list of neighbours above is empty — so the player is first,
  // we return his own rank». It is WRONG: an empty list means «the neighbours were not
  // sent», not «there are none» — for a player at rank 9 it returned the server's
  // nine and muted the computation over the top segment (caught by a probe: we expected 3,
  // we got 9). The real leader does not need that branch: he goes further down anyway, where
  // with a live score above the top row the segment answers with a refusal, and the rank
  // stays the server's one.
  // ── THE TOP SEGMENT (the fallback path: a large jump inside the first hundred) ──
  if (Array.isArray(top) && top.length > 1){
    const hi = top[0].score | 0, lo = top[top.length - 1].score | 0;
    // strictly INSIDE the segment: at the boundaries the position is ambiguous (below the bottom we
    // do not know how many players there are between us and the tail of the snapshot)
    if (live <= hi && live >= lo){
      let above = 0;
      for (const r of top) if ((r.score | 0) > live) above++;
      return above + 1;
    }
  }
  return null;
}
// ⚠️⚠️ THERE ARE NOW TWO INSTANCES OF THE ROW: in the menu (`#msLbEntry`) and on the win screen
// (`#winLbEntry`, node 891:4297, the owner's word 2026-08-21-n). The function now
// writes into ALL the ones it finds, and not into a node by id.
// ⚠️ WHY NOT A SECOND FUNCTION: the rank is computed by the `lbRankNow` formula with its own
// guard and its own memory of the previous rank in localStorage. Two copies of this logic
// would diverge at the first edit, and the screens would show a DIFFERENT rank for the player —
// the worst kind of divergence, because both numbers look like the truth.
const lbEntryAll = sel => Array.prototype.slice.call(document.querySelectorAll(sel));
// ⚠️ THE DIRECTION BADGE IS STAMPED OUT OF THE MENU AND NOT DUPLICATED IN THE MARKUP: the three
// SVGs (up/down/newcomer) weigh almost 5 KB of paths, and a second copy of them in the file
// would be exactly the duplicate that diverges at the first redraw of the badge.
// We take the markup from the first instance that has it.
function lbEntryStampBadge(){
  const source = document.querySelector('#msLbeBadge');
  if (!source || !source.firstElementChild) return;
  lbEntryAll('.ms-lbe-badge').forEach(badge => {
    if (badge !== source && !badge.firstElementChild) badge.innerHTML = source.innerHTML;
  });
}
function lbEntryRefresh(){
  lbEntryStampBadge();
  const boxes = lbEntryAll('.ms-lbentry'); if (!boxes.length) return;
  const box = boxes[0];
  const lb = (typeof window !== 'undefined') ? window.__lb : null;
  // THE FEATURE IS OFF (the module is missing or the service address is empty) — the block is not
  // in the layout at all. Reserving space for data that cannot exist in this build
  // means moving the menu for no reason (the same rule as with the inset).
  const on = !!(lb && lb.top && lb.me && (typeof lb.base !== 'function' || lb.base()));
  boxes.forEach(b => { b.hidden = !on; });
  if (!on) return;
  const my = ++lbEntryEpoch;
  lb.top(1).then(t => {
    if (my !== lbEntryEpoch) return;
    const hosts = lbEntryAll('.ms-lbe-avs'); if (!hosts.length) return;
    hosts.forEach(h => { h.innerHTML = ''; });
    // ⛔⛔ ON THE WIN SCREEN THERE IS ONE AVATAR, AND IT IS THE PLAYER'S AVATAR, NOT THE FIRST FROM
    // THE TOP (the owner's word 2026-08-21-r: «instead of three avatars we show
    // only the player's avatar», node 891:4307 — one circle of 56).
    // ⚠️ HIS OWN RULE «always show 3 avatars» (2026-08-05) REMAINS IN
    // FORCE FOR THE MENU: there three avatars show the TOP, here one shows
    // YOU — these are different statements, not a different density of one and the same thing.
    // ⚠️ THIS BRANCH DOES NOT WAIT FOR THE NETWORK: the avatar number is derived from the player's key
    // (`guestAvatar`), so the win row is drawn in full in the first frame,
    // even if the top never arrives at all.
    const own = lbEntryAll('#winLbeAvs');
    own.forEach(h => {
      const ai = (typeof guestAvatar === 'function') ? (guestAvatar() | 0) : 0;
      if (ai <= 0){ const blank = document.createElement('i');
        blank.className = 'ms-lbe-slot'; h.appendChild(blank); return; }
      const img = document.createElement('img');
      img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
      img.alt = ''; img.decoding = 'async'; h.appendChild(img);
    });
    const topHosts = hosts.filter(h => h.id !== 'winLbeAvs');
    if (!topHosts.length) return;
    if (!t || t.state !== 'ok' || !t.rows) return;
    // ⚠️ `lbRow` returns `null` on a row that failed to parse (the server sends
    // ARRAYS `[name, avatar, score]`, not objects). Without this check a broken
    // row would bring the whole avatar render down into `catch`, and the block would silently stay
    // without pictures — that is, the defect would look like «the server is empty».
    // ⚠️⚠️ THERE ARE ALWAYS THREE SLOTS (the owner's word «always show 3 avatars»), and
    // AN EMPTY SLOT IS A NEUTRAL CIRCLE, not somebody else's avatar. Putting the picture of
    // a live player there would mean inventing a participant of the table; at the start,
    // when there are fewer than three rows, that is a direct lie in the most visible place.
    for (let i = 0; i < 3; i++){
      const r = t.rows[i];
      const ai = r ? (r.av | 0) : 0;
      if (ai <= 0){
        topHosts.forEach(h => {
          const blank = document.createElement('i');
          blank.className = 'ms-lbe-slot';
          h.appendChild(blank);
        });
        continue;
      }
      topHosts.forEach(h => {
        const img = document.createElement('img');
        img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
        img.alt = ''; img.decoding = 'async'; h.appendChild(img);
      });
    }
  }).catch(()=>{});
  lb.me().then(async m => {
    if (my !== lbEntryEpoch) return;
    // ⚠️ WE TAKE THE TOP THROUGH THE SAME CACHED CALL, AND NOT FROM A VARIABLE OF THE NEIGHBOURING
    // `.then`: the two promises resolve in an unpredictable order, and the «instant»
    // rank would work every other time — exactly the flake recorded by us as
    // «caught a moment, not a state». It does not cost the network: `__lb` caches.
    let lbEntryTop = null;
    try { const t = await lb.top(1); if (t && t.state === 'ok' && Array.isArray(t.rows))
      lbEntryTop = t.rows.filter(Boolean); } catch(e){}
    if (my !== lbEntryEpoch) return;
    const subs = lbEntryAll('.ms-lbe-sub'), ranks = lbEntryAll('.ms-lbe-rank');
    const boxes = lbEntryAll('.ms-lbentry');
    if (!subs.length || !ranks.length || !boxes.length) return;
    const box = boxes[0];
    // ⚠️⚠️ THE RANK — ONLY THE EXACT ONE, AND THE REFUSAL IS CLOSED: there is no trustworthiness flag
    // (`exact`) — we do not show the numbers at all. The estimate from the answer to the SEND we do not
    // show anywhere: while the table has fewer than a hundred rows, the snapshot's ladder
    // is empty and the estimate answers «rank 1» to EVERYONE.
    const ok = !!(m && m.state === 'ok' && m.exact && m.rank > 0);
    // ⚠️⚠️ THE RANK IS UPDATED IMMEDIATELY AND DOES NOT WAIT FOR THE SERVER (the owner's complaint
    // 2026-08-17: «there are still the same problems with fast updating»). The
    // leaderboard screen has been able to do this since 2026-08-13, while the entry point stayed purely
    // server-side — and between the send and the answer (rate 20 s + caches) it showed
    // the old rank next to a fresh score pill.
    // ⛔⛔ THIS IS NOT A REPEAL OF THE CLOSED-REFUSAL RULE: the estimate over the ladder
    // (`exact:0`) we still do not show ANYWHERE. Here the EXACT position
    // is computed — but only when it CAN be derived: the live score is obliged
    // to fall INSIDE the top segment that was sent, then the position is simply
    // «how many rows are above», not an estimate. It did not fall in — we keep the server's number.
    let rank = ok ? (m.rank | 0) : 0;
    if (ok && typeof leaderboardScore === 'function'){
      // ⚠️ IT IS COMPUTED BY `lbRankNow` — a separate function, not an inline: there is
      // a guard on it, and the next consumer of the live rank will call the very same one. The leaderboard
      // screen computes ITS OWN (the insertion of the row into the visible segment) — there one needs not
      // a number but a position in the list; they have no shared formula.
      const fresh = lbRankNow(m, leaderboardScore() | 0, lbEntryTop);
      if (fresh > 0) rank = fresh;
    }
    // ⚠️ BOTH mobile rows and the class come from THE SAME `ok` as before, —
    // that is, the rank in the FIRST row obeys the `exact` rule exactly the same way
    // as «You on N» used to obey it. The estimate from the answer to the send does not
    // get here under any state.
    // ⚠️⚠️ A NEWCOMER HAS NO RANK, YET THE BLOCK STAYS — AND THIS CASE IS NOT IN THE MOCKUP.
    // The dispatcher's decision, told to the owner: we show the former word
    // «Leaderboard» as a single line, and mute the subtitle and the direction badge. That way the block
    // keeps its identity and asserts nothing: «on leaderboard» on its own says
    // nothing, whereas an arrow would assert a movement that did not happen.
    // ⛔ THE PLATE APPEARS WITH THE DATA, NOT BEFORE IT (the owner 2026-08-25-v). The class is
    // hung HERE, on the line that writes the row, so the paint and the content can never get out
    // of step. ⚠️ It is added unconditionally: the newcomer branch («Leaderboard» with no rank)
    // is data too — it is the answer, and it is what the row is going to show.
    boxes.forEach(b => b.classList.add('lb-ready'));
    ranks.forEach(rk => { rk.textContent = ok ? (winFmtScore(rank) + ' place') : 'Leaderboard'; });
    subs.forEach(sub => { sub.textContent = ok ? 'on leaderboard' : ''; });
    boxes.forEach(b => { b.classList.toggle('has-rank', ok); });
    // ⚠️⚠️ THE DIRECTION IS BY COMPARISON WITH THE PREVIOUSLY SEEN RANK, and not by the sign of
    // the score: the owner gave TWO badges (up/down), which means both states are obliged
    // to happen, and the only quantity that here goes up and down is the rank
    // itself. A smaller number = went up.
    // ⚠️ The memory lives in localStorage and NOT in the save: this is an interface hint, and
    // not progress; there is no point in carrying it between devices, and merging it —
    // even less so (two devices would give an arrow based on somebody else's movement).
    // ⚠️ THE FIRST TIME — WITHOUT A BADGE: there is nothing to compare with, and «up» would be
    // an invention. The badge appears from the second opening, when the movement is real.
    let dir = '';
    if (ok){
      const key = 'mixer_lb_seen_rank';
      let prev = null;
      try { const v = localStorage.getItem(key); prev = v === null ? null : (v | 0); } catch(e){}
      // ⚠️⚠️ WE COMPARE THE NUMBER THAT WAS SHOWN, NOT THE SERVER'S ONE — THE ROW HAS ONE EPOCH
      // (the lesson of «the two epochs», screenshot 2026-08-11). While the server has not caught up, on
      // the screen stands the live rank; having remembered the server's one next to it, the next
      // opening would show an arrow for a movement the player did not see.
      const now = rank | 0;
      if (prev !== null && prev !== now) dir = (now < prev) ? 'dir-up' : 'dir-dn';
      else if (prev !== null) dir = box.classList.contains('dir-dn') ? 'dir-dn' : 'dir-up';
      try { localStorage.setItem(key, String(now)); } catch(e){}
    }
    boxes.forEach(b => {
      b.classList.remove('dir-up', 'dir-dn');
      if (dir) b.classList.add(dir);
    });
  }).catch(()=>{});
}
function lbServ(text){
  const host = $('lbList'); if (!host) return;
  host.innerHTML = ''; const d = document.createElement('div');
  d.className = 'lb-serv'; d.textContent = text; host.appendChild(d);
}
// ⚠️ THE STAR IN THE SCORE PILL is the shape of the `Star-box` asset (20×20). In the mockup there are three
// exports with different fills (dark for the medallists, white further down, yellow for one's own
// row), but the OUTLINE is one — hence one file, and the colour is set by CSS according to the row's
// class. Copying three files would mean keeping three copies of one shape.
const LB_STAR_D = 'M5.99339 29.418C5.0305 28.6875 4.83128 27.4756 5.31273 26.0811L7.76976 18.8262L1.52757 14.3604C0.299054 13.4805 -0.282001 12.4014 0.133038 11.2227C0.531476 10.0771 1.61058 9.5293 3.08812 9.5459L10.7414 9.6123L13.0657 2.29102C13.5305 0.84668 14.3772 0 15.5891 0C16.801 0 17.6477 0.84668 18.1125 2.29102L20.4367 9.6123L28.0735 9.5459C29.5676 9.5293 30.6467 10.0771 31.0451 11.2393C31.4436 12.4014 30.8791 13.4805 29.6506 14.3604L23.4084 18.8262L25.8655 26.0811C26.3469 27.4756 26.1477 28.6875 25.1848 29.418C24.2053 30.165 23.01 29.9658 21.7649 29.0527L15.5891 24.5039L9.39671 29.0527C8.16819 29.9658 6.97288 30.165 5.99339 29.418Z';
// ⚠️ THE NUMBER IN GROUPS OF THREE, AS IN THE MOCKUP («123 900»). ⛔ NOT `winFmtScore`: that one
// compresses from 10 000 into «12.5k», whereas the table is about EXACT results, and the compression
// hides exactly the difference between neighbours for the sake of which people look at it.
function lbFmt(n){ return String(Math.max(0, n | 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function lbRowsRender(rows){
  const host = $('lbList'); if (!host) return;
  host.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('div');
    // ⚠️ THE PILL'S COLOUR IS BY RANK, AND NOT BY THE ORDER IN THE ARRAY: the screen's rows may
    // start not from the first rank, and «the first three from the top» ≠ «the medallists».
    const p = r.pos | 0;
    row.className = 'lb-row' + (r.me ? ' me' : (p >= 1 && p <= 3 ? ' p' + p : ''));
    const left = document.createElement('div'); left.className = 'lb-left';
    const pos = document.createElement('div'); pos.className = 'lb-pos';
    pos.textContent = (p > 0) ? String(p) : '';
    const ava = document.createElement('div'); ava.className = 'lb-ava';
    const av = document.createElement('div'); av.className = 'lb-av';
    const ai = r.av | 0;
    if (ai > 0){
      const img = document.createElement('img');
      img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
      img.alt = ''; img.decoding = 'async'; av.appendChild(img);
    }
    const nm = document.createElement('div'); nm.className = 'lb-name';
    // «Name • You» — that is how it is in the mockup: one's own row is LABELLED, not merely highlighted
    nm.textContent = (r.name || '') + (r.me ? ' • You' : '');
    ava.append(av, nm); left.append(pos, ava);
    const sc = document.createElement('div'); sc.className = 'lb-score';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 30'); svg.setAttribute('aria-hidden', 'true');
    const pth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pth.setAttribute('d', LB_STAR_D); svg.appendChild(pth);
    const num = document.createElement('span'); num.textContent = lbFmt(r.score);
    // ⚠️ THE NUMBER FIRST, THE STAR SECOND (the owner's word 2026-08-10). We change
    // THE ORDER IN THE MARKUP, and not `row-reverse` in the styles: a reverse would rearrange
    // only the picture, while the screen reader would go on reading «star, fourteen
    // thousand» instead of «fourteen thousand, star».
    sc.append(num, svg);
    row.append(left, sc);
    host.appendChild(row);
  });
}
// OUR tab: the rank — ONLY from me() and ONLY the exact one (the dispatcher's rule);
// the list's rows — from top(). ⚠️ A guest here has FULL RIGHTS: the platform gate
// «you need to log in» is NOT carried over to our table (the owner's decision).
async function lbLoadOurs(my){
  const lb = (typeof window !== 'undefined') ? window.__lb : null;
  if (!lb || !lb.top || (typeof lb.base === 'function' && !lb.base())){ lbServ('Leaderboard is off in this build.'); return; }
  const t = await lb.top(1).catch(()=>null);
  if (my !== lbEpoch) return;
  if (!t || t.state === 'offline' || t.state === 'broken'){ lbServ('No connection. Try again later.'); return; }
  if (t.state === 'early' || !t.rows || !t.rows.length){ lbServ('The board is still being built.'); return; }
  const rows = t.rows.map((r, i) => ({ pos:i + 1, name:r && r.name, av:r && r.av, score:r && r.score }));
  const m = await lb.me().catch(()=>null);
  if (my !== lbEpoch) return;
  // ⚠️⚠️ ONE'S OWN ROW GOES THROUGH THE SAME RENDER as all the others. Previously it
  // was assembled by a SEPARATE piece of code — and diverged from the mockup in three
  // places at once (the rank with a hash sign, the name «You» instead of «Name • You», a compressed score). This is
  // exactly the law on which the project has been burned: a copy next to a working
  // quantity matches at the moment of writing and diverges afterwards.
  // ⚠️ ONLY THE EXACT RANK (`exact`) — the refusal is closed: no trustworthiness
  // flag means there is no own row on the screen at all.
  if (m && m.state === 'ok' && m.exact && m.rank > 0){
    // ⚠️⚠️ THE SCORE OF ONE'S OWN ROW IS LIVE, NOT THE SERVER'S (the owner's complaint
    // 2026-08-13, screenshot «7 406 in the table against 1 406 in the pill»): after
    // a purchase the server catches up with a gap (send rate 20 s + caches), and for that
    // whole window the screen would show the old number next to a fresh pill.
    const live = (typeof leaderboardScore === 'function') ? (leaderboardScore() | 0) : (m.score | 0);
    const mine = { pos:m.rank, name:(typeof guestName === 'function') ? guestName() : '',
      av:(typeof guestAvatar === 'function') ? guestAvatar() : 0, score:live, me:true };
    // ⚠️⚠️ ONE'S OWN ROW TAKES ITS OWN PLACE AND NOT THE END (the owner's word
    // 2026-08-10: «the player must occupy the correct place in the table»). The former
    // `push` put it last ALWAYS: at rank 7 out of 60 it was
    // the sixty-first, that is, the screen lied about the player's position.
    // ⚠️ The rank in the snapshot and the rank from `me()` are DIFFERENT SOURCES: the top comes from
    // the cron's snapshot, one's own rank is live. As long as the rank falls into the segment that was sent,
    // the row under that number is ours, so we REPLACE it (the name, the avatar and
    // the fresh score are ours) rather than insert next to it: an insertion would shift everyone below
    // and two players with one number would appear in the table.
    // ⚠️ A rank OUTSIDE the segment — the row goes to the end, and that is not «at the end of the list» but
    // an honest «below what is shown»: `sticky` will prop it up from below.
    // ⚠️⚠️ FIRST WE LOOK FOR OURSELVES IN THE SNAPSHOT ITSELF, AND ONLY THEN PLACE BY RANK.
    // ⛔ WHY THIS WAS NOT ENOUGH BEFORE AND WHY IT WAS A REAL DEFECT: the top
    // comes from an HOURLY SNAPSHOT, while one's own rank is LIVE. Between them there passes
    // a win or the spending of a multiplier, they diverge, and a blind `rows[rank-1] =
    // mine` overwrote SOMEBODY ELSE'S row, leaving my old one in its former place —
    // the player saw himself TWICE, and a neighbour disappeared. It is right after a win that the screen
    // is opened, so the case is not rare but typical.
    // ⚠️⚠️ THE ROW FROM THE SNAPSHOT IS DELETED, AND NOT REPLACED IN PLACE. Here stood
    // «we found ourselves in the snapshot — we keep ITS position», and that gave outright
    // nonsense on the screen (the owner's complaint 2026-08-11, screenshot): the score was taken
    // LIVE, and the number was AN HOUR OLD, and «8 668» stood eighth between
    // 6 500 and 5 300, while the menu right there showed «4 place». Two numbers
    // of one row came from DIFFERENT epochs, and the score column stopped being
    // descending — that is, the table contradicted itself.
    // ⚠️ WHY THE LIVE RANK ALSO FIXES THE ORDER: the rank is computed by the server over
    // the LIVE database, the snapshot is its hour-old approximation. Having stood by rank,
    // the row lands between those who are above and below it BY SCORE — the monotonicity
    // is restored by itself, no separate sorting is needed.
    // ⚠️ A row's number is its INDEX in the segment that was sent (`pos: i + 1` above),
    // there is no other source of numbering at all. That is why after the insertion the list
    // is renumbered consecutively: then there are neither duplicates nor holes, and one's own row
    // gets EXACTLY `m.rank` — that very exact rank, and there is no need to assign it
    // a second time.
    // ⚠️ A rank OUTSIDE the segment — the row goes to the end with its own live number, and that is
    // not «at the end of the list» but an honest «below what is shown»: `sticky` props it up.
    // ⚠️ Identification by name+avatar is the only thing there is: the snapshot's rows
    // come as `[name, avatar, score]`, there is no identifier in them. A collision
    // with somebody else's is possible (the pool of names is finite); the price of a miss is now small — somebody else's
    // row will disappear from the display, but the list will stay coherent.
    // ⛔ `slot` is EXACTLY THAT index which the former version took for the rank
    // («we found ourselves — we keep the snapshot's position»). It is left as a variable, and not
    // dissolved into a boolean flag, so that the sabotage test of the defect is ONE line:
    // `const j = slot >= 0 ? slot : m.rank - 1` brings back the old behaviour
    // entirely, and by the red one can see that the guard guards exactly this.
    let slot = -1;
    for (let k = rows.length - 1; k >= 0; k--){
      if (rows[k].name === mine.name && (rows[k].av | 0) === (mine.av | 0)){ rows.splice(k, 1); slot = k; }
    }
    // ⚠️⚠️ THE LENGTH OF THE SHOWN SEGMENT DOES NOT CHANGE, AND THAT DECIDES WHETHER IT IS AN INSERTION OR
    // A REPLACEMENT: we found ourselves in the snapshot — our own old row has already been deleted, the hole
    // is closed by an INSERTION; we did not find ourselves — the row under our live number is ours
    // (the snapshot simply did not know), we REPLACE it. Otherwise the first case lost the player from
    // the display, and the second grew the list by a row and appended to the snapshot a number
    // which was not in it.
    // ⚠️⚠️ THE ROW STILL HAS ONE EPOCH (the lesson of «the two epochs», screenshot
    // 2026-08-11): while the server HAS NOT CAUGHT UP (live score != m.score), putting
    // the live number at the SERVER's rank is forbidden — the column would stop descending
    // exactly as it did then. In this window the rank is derived FROM THAT SAME live score:
    // an insertion by descending order into the visible segment. The server has caught up — the former path by
    // `m.rank` (the server's live rank is more exact than the snapshot, the canon of 2026-08-11).
    const caughtUp = live === (m.score | 0);
    let j;
    if (caughtUp){ j = m.rank - 1; }
    else {
      j = rows.length;
      for (let k = 0; k < rows.length; k++)
        if ((rows[k].score | 0) < live){ j = k; break; }
    }
    if (j >= 0 && j <= rows.length){
      // in the «has not caught up» case the snapshot does not know our new row — always an INSERTION
      rows.splice(j, (caughtUp && slot < 0) ? 1 : 0, mine);
      for (let k = 0; k < rows.length; k++) rows[k].pos = k + 1;
    } else {
      rows.push(mine);     // below the shown segment — with its own live number
    }
  }
  lbRowsRender(rows);
}
// THE PLATFORM tab — «the all-time record». ⚠️ Its refusal is ITS OWN (`why`),
// and it is not an error: the platform may not support tables at all.
async function lbLoadPlat(my){
  if (typeof Ads === 'undefined' || !Ads.lbEntries){ lbServ('Not available on this platform.'); return; }
  const r = await Ads.lbEntries({ limit: 20 }).catch(()=>null);
  if (my !== lbEpoch) return;
  if (!r || !r.ok){ lbServ('Not available right now.'); return; }
  if (!r.entries || !r.entries.length){ lbServ('No records yet.'); return; }
  lbRowsRender(r.entries.map(e => ({ pos:e.rank, name:e.name, av:0, score:e.score, me:!!e.me })));
}
// ⛔ THERE ARE NO TABS (the owner's decision «only our table, the tabs are cancelled»),
// which is why neither the switcher nor the text stub is here any more. `lbLoadPlat`
// is left ALIVE deliberately: the platform send works and gives visibility on
// the platform — the display can be brought back with one line if the owner changes his mind.
function lbScreenRender(){
  // «Loading…» — only on an empty list: the instant re-render after a spend
  // comes from the __lb caches, and a loading blink on a live list would read as flicker
  const host = $('lbList');
  if (!host || !host.querySelector('.lb-row')) lbServ('Loading…');
  const my = ++lbEpoch;
  lbLoadOurs(my).catch(()=>{});
}
function lbScreenOpen(){ show('lbOverlay'); lbScreenRender(); }
// ⚠️⚠️ INSTANT RECOUNT AFTER THE SEND (the owner's complaint 2026-08-12).
// Previously the display was updated only on the OPENING of the menu and of the screen; yet the player buys
// a boost while ALREADY standing in the menu, and looks at the former rank. Now the leaderboard client
// says «the score has arrived», and we re-read exactly what is visible RIGHT NOW.
// ⚠️ WE RE-READ, AND DO NOT PAINT THE NUMBER IN OURSELVES: the rank is still taken
// only from `/v1/me` and only the exact one — the closed-refusal rule is untouched.
// ⚠️ We touch the screen ONLY when it is open: otherwise `lbScreenRender` would show
// «Loading…» in an invisible layer and burn a request on every send.
try {
  if (typeof window !== 'undefined' && window.__lb && window.__lb.onSent){
    window.__lb.onSent(function (){
      try { lbEntryRefresh(); } catch (e) {}
      try {
        const o = document.getElementById('lbOverlay');
        if (o && getComputedStyle(o).display !== 'none') lbScreenRender();
      } catch (e) {}
    });
  }
} catch (e) {}
function lbScreenClose(){ lbScreenStop(); hide('lbOverlay'); }
// CAPTURE OF THE LEVEL'S TYPES — INDEPENDENTLY of the showcase (its tick is gated at ≥1160px, on
// mobile/narrow vitAll is not built at all). Pulled from updateHUD (which ticks
// ALWAYS): on a level change we fix the keys of the mix's types while the pile is full.
let winLevelTypes = null, winLevelRef = null;
function captureLevelTypes(){
  if (typeof level === 'undefined' || !level || level === winLevelRef) return;
  if (typeof intro !== 'undefined' && intro) return; // the model atlases are still decoding
  const seen = new Set(), keys = [];
  try {
    for (const it of items){
      if (!it || it.surprise || it.bomb || !it.type) continue;
      const k = String(it.type.name);
      if (!seen.has(k)){ seen.add(k); keys.push(k); }
    }
  } catch(e){}
  // we pin the ref ONLY on a successful capture — otherwise an empty items (the extreme edge)
  // would lock the previous types forever and the level would not be re-captured
  if (keys.length){ winLevelTypes = keys; winLevelRef = level; }
}
// TOP ITEMS: the top 3 types of the level by progress (the same metric and the same
// portraits as at the showcase panel). The source is winLevelTypes (captureLevelTypes); the
// fallback is vitAll. If the level has fewer types — there are as many rows as there are
// (slice does not pad with blanks), which is why level 1 gives three rows at ANY cap.
// ⛔⛔ THREE ON BOTH LAYOUTS (the owner's word 2026-08-22-e, with a screenshot of the
// DESKTOP screen carrying five rows: «show only the top 3»). ⛔ BY THIS THE DESKTOP FIVE IS
// CANCELLED — spec #124 of 2026-07-27 raised this list 3 → 5 (WORKSTREAMS.md, batch124),
// and it lived 26 days. This is a RETURN and not a new number: mobile has been three since
// the owner's spec of 2026-07-28, and the showcase panel took the same three that day
// (VIT_MAX below). Now the two lists agree in full — they already ranked by an identical
// key (vitFrac desc, then accCount), only the cap differed.
// ⚠️⚠️ THE TWO ARMS ARE DELIBERATELY EQUAL, AND THAT IS NOT AN OVERSIGHT. The pair of
// constants and the 768 branch are kept because the per-breakpoint split is the owner's own
// idea, it has already been switched on once, and bringing it back must cost ONE literal
// instead of rebuilding the mechanism. The price is named honestly: while the arms match,
// the breakpoint decides nothing and NOTHING on the screen can prove it is still 768 — do
// not read this ternary as evidence that the win screen adapts by width.
// ⚠️ SHOULD THE ARMS DIVERGE AGAIN, the breakpoint stays the same 768 as the HUD's and as
// the mobile layout of the win screen in shell.html (@media max-width:767px) — they must
// not be split apart.
const WIN_TOP_N = 3, WIN_TOP_N_MOB = 3;
function winTopN(){ return innerWidth < 768 ? WIN_TOP_N_MOB : WIN_TOP_N; }
function renderWinTop(reduce){
  const host = $('winTopList'); if (!host) return;
  host.innerHTML = '';
  let keys = (winLevelTypes && winLevelTypes.length) ? winLevelTypes.slice() : [];
  if (!keys.length && vitAll){ try { keys = vitAll.map(e => e.k); } catch(e){} }
  keys.sort((a, b)=> vitFrac(b) - vitFrac(a) || accCount(b) - accCount(a));
  const step = 0.09;
  keys.slice(0, winTopN()).forEach((k, i)=>{
    const row = document.createElement('div');
    row.className = 'wt-row';
    // ⚠️ THE ROW CARRIES ITS TYPE KEY (2026-08-25-d): the visible name is `accLabel`, and a guard
    // that has to compare this row's picture with the one production would compute for it would
    // otherwise have to reproduce that mapping — a copy of a translation table beside the
    // working one, which is how labels drift.
    row.dataset.type = k;
    row.style.animationDelay = (reduce ? 0 : (1 + i * step)) + 's';
    let url = '';
    // ⛔ TIGHT (2026-08-25-d): framed by the silhouette, not by the enclosing cylinder, so every
    // type fills its 44 px box instead of floating in it at a per-type share of 44…90 %.
    try { const it = thumbItemForKey(k); if (it) url = itemThumb(it, true); } catch(e){}
    row.innerHTML =
      '<div class="wt-thumb">' + (url ? '<img alt="" src="' + url + '">' : '') + '</div>' +
      '<div class="wt-body"><div class="wt-col"><div class="wt-name"></div>' +
      '<div class="wt-bar"><i></i></div></div><div class="wt-mult"></div></div>';
    row.querySelector('.wt-name').textContent = (typeof accLabel === 'function' ? accLabel(k) : k);
    row.querySelector('.wt-mult').textContent = fmtMult(typeof accMult === 'function' ? accMult(k) : 1);
    host.appendChild(row);
    // ⛔⛔ REVIEW FINDING 18, SETTLED BY THE OWNER 2026-08-30: «pokazyvaem obshchuyu, kak v
    // kollektsii». The row used `vitFrac` — progress WITHIN the current tier, (n−prev)/(next−prev)
    // — while the collection card shows progress from ZERO, n/next, and its caption («150/300»)
    // reads the same way. Below 100 matches the two agree; above, the win screen ran up to ~50
    // percentage points «emptier» than the same type one screen away. Neither number was wrong;
    // they answered different questions, and he chose the collection's question.
    // ⚠️ `vitFrac` ITSELF IS DELIBERATELY UNTOUCHED — it is also the SORT KEY of the showcase
    // panel (his spec: «descending, the first has the greater progress»), and rewriting it would
    // have silently reordered that panel. So the showcase still reads within-tier; that third
    // surface is named to him, not decided here.
    const frac = (typeof accNext === 'function' && accNext(k))
      ? Math.min(1, accCount(k) / accNext(k)) : 1;
    const bar = row.querySelector('.wt-bar i');
    if (reduce){ bar.style.width = (frac * 100).toFixed(1) + '%'; }
    else {
      bar.style.transitionDelay = (1.05 + i * step) + 's';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ bar.style.width = (frac * 100).toFixed(1) + '%'; }));
    }
  });
}
function toast(msg){
  const t = $('toast');
  // ⚠️ THE GAME'S REFUSAL CHANNEL («Not enough coins», «No hints left», «No shakes left») and it
  // was silent - the sound inventory named it.
  // ⚠️⚠️ BUT IT IS NOT ONLY A REFUSAL CHANNEL, AND THE SOUND IS HEARD ON BOTH: `toast()` also
  // carries REWARDS - «+1 Shake» (80-gameplay:782), «Free shake» (:1381, 99-main:960), «Final
  // pairs» (40-items), «Progress reset» (90-input). A ding reads as positive, so it fits both
  // readings, but this is a behaviour change on more paths than the refusals and it is named to
  // the owner rather than buried here.
  // ⚠️ It can overlap the delegated `ui` click when a BUTTON raised the toast, and that is
  // correct rather than a double-up: the pair reads as «pressed, and answered».
  try { Sound.play('toast'); } catch (e) {}
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.opacity = 0; }, 1600);
}
function fmtTime(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
// ===== The character: 7 emotions + live animation (the owner's assets, Figma 741:1420) =====
// Four INDEPENDENT layers: THE EMOTION (which shape) + THE GAZE (where the pupils
// look) + THE REACTION (a short burst) + THE BLINK. The round pair is
// parametric: the pupil travels ±24 and changes size 15..50 in units of
// the viewBox — that covers the families eyes-0 (gaze/size), eyes-2 (sly)
// and eyes-5 (winking). Irreducible shapes are separate SVG layers.
// The eyes-4-4 arcs were DELETED (the owner's spec 2026-07-21): «kind» we show
// not by shape but by the SIZE of the pupils — by the asymmetry of eyes-5 (741:1357).
// ⚠️ `spent`/`out` — THE FATIGUE FACES BY THE OWNER'S NODES (741:1302 and 741:1281):
// «spent» (slits) on the second-to-last bowl mark and «knocked out» (✕✕) on the N-th.
// `out` shares the `fX` layer with the defeat: there is one layer and two reasons — there is no conflict,
// they are mutually exclusive by construction (normally a level cannot be lost).
const FACE_LAYER = { calm:'fRound', surprised:'fRound', sly:'fRound', rolled:'fRound',
  closed:'fRound', kind:'fRound', angry:'fAngry', lose:'fX', sad:'fSad',
  spent:'fSlit', out:'fX' };
// Geometry from the assets (viewBox 240×120): the white r60, the pupil r29.
const EYE_R = 60, PUP_MIN = 15, PUP_WIDE = 50;
// eyes-5 (the asymmetry from the asset: the left pupil 40 in a white of 60; the right white 44
// with a pupil of 12) — A TURBO SERIES (the owner's decision 2026-07-21: a second turbo
// assembled inside an active one = a series; the core counts chainSeries in 60-access)
const EYE5_PL = 40, EYE5_PR = 12, EYE5_WR = 44;
const FACE_GAZE = {                    // pupil offsets [left, right]
  rolled: [[0,-24],[0,-24]],           // eyes-0-5: rolled up
  sly:    [[-16,-16],[16,16]],         // eyes-2: one up-left, the other down-right
};
const PUP_BASE = 29;                   // the pupil's radius at rest (eyes-0)
// ===== «THE MIXER IS RUNNING OUT OF STEAM» (the owner's spec v2: indication of the bowl's marks) =====
// The owner rejected the cracks and said «I'll take the eyes»: every mark HITS the mixer,
// the fatigue accumulates, on the N-th one the eyes slam shut and that turns into the scatter.
// ⚠️ IRONY, NOT PITY: the mixer is «holding on with its last strength», which is why on
// a series it still opens wide — just from a sagged base (see eyeSizes).
//
// ⛔⛔ TOMBSTONE: THERE IS NO SUCH THING AS AN UPPER EYELID. The owner's spec 2026-08-03 verbatim,
// on the screenshot of accumulating fatigue: «remove the black eyelids on top, we do not have such
// a state, because in all states there is only a white eyeball and
// a black pupil in various shapes». The `fTired` overlay (an eyelid arc from fSad on top of
// the round ones, the `--tired` variable, parking at 54, the «5px crescent» fix) was DELETED
// ENTIRELY together with its CSS and its guards. DO NOT BRING IT BACK under any guise:
// this is not an implementation bug but a state absent from the language of the eyes.
// ⚠️ The LOWER eyelids `fSad` (node 741:1336) are a DIFFERENT thing and they stay: they are the approved
// shape of sadness, whereas the objection was to the UPPER arcs on top of round eyes.
// ⚠️ TOGETHER WITH THE EYELIDS DIED «THE HIT ON A MARK» (TIRED_STUN): it was an extra sag of
// THE EYELID for 180 ms and it had no other channel. Bringing it back through the pupil is
// a separate word from the owner, we do not do it on our own initiative.
//
// TWO channels REMAIN, both «the white + a black pupil of a different shape»:
//   (1) THE SIZE of the pupil — the accumulating fatigue drops its base;
//   (2) THE SHAPE of the pupil — slits (741:1302) on the second-to-last mark and ✕✕
//       (741:1281) on the N-th; both are the owner's own nodes.
const TIRED_PUP_K = 0.28;   // how much the fatigue drops the pupil's BASE (0..1)
const TIRED_SPENT_AT = 1;   // how many marks BEFORE the scatter the mixer «runs out of steam» (slits)
let bowlSeen = 0, tiredSlam = false;
// the fatigue fraction 0..1 by MARKS (cracks/N). We do not touch the mechanics — we only read.
function bowlFatigue(){
  if (!level || level.over) return 0;
  const n = (typeof bowlN === 'function') ? bowlN() : 6;
  return Math.min(1, (level.bowlCracks || 0) / Math.max(1, n));
}
// how many marks are LEFT until the scatter (it decides «spent»)
function bowlLeft(){
  if (!level || level.over) return 99;
  const n = (typeof bowlN === 'function') ? bowlN() : 6;
  return n - (level.bowlCracks || 0);
}
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0, faceHoldFrom = 0;
let lookVec = null, lookUntil = 0, wander = [0,0], wanderAt = 0, dart = [0,0], dartAt = 0;
let pupPulseUntil = 0, lastScoreSeen = null;
// Priority from top to bottom. The ladder of menace: calm -> rolled -> sly -> angry
function eyesMood(now, grinding){
  if (!level || intro) return 'calm';
  if (level.over) return items.every(i => !i.alive) ? 'kind' : 'lose'; // ✕✕ from the set
  if (chainUntil > now) return 'surprised';       // turbo
  if (grinding) return 'angry';                   // the blades are eating things
  const idle = (now - stats.lastAction)/1000;
  if (level.idleLimit - idle <= 3) return 'sly';  // anticipation: ≤3 s until the grind
  if (comboUntil > now) return 'kind';            // a series is burning
  if (idle > 8) return 'rolled';                  // got bored
  return 'calm';
}
// The charge disc at the cursor (tickChainBar) was DELETED: the turbo indicator is now
// THE PUPIL SIZE of the character (the owner's spec in the INTERFACE chat: «there is no
// bar, the eye accumulates») — see eyeSizes below. (The charge-disc flag was cut out by the cleanup)
// it stayed a dead flag of history.
// a short reaction on top of the state (a tap on the eyes, a miss, a surprise)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; faceHoldFrom = 0; }
// the pupils turn towards a point on the screen (the player's tap) for 1.4 s
function faceLook(x, y){
  const r = $('face').getBoundingClientRect();
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const k = 24 * Math.min(1, d / 260);          // the farther the tap, the stronger the squint
  lookVec = [dx / d * k, dy / d * k];
  lookUntil = performance.now() + 1400;
}
function facePulse(){ pupPulseUntil = performance.now() + 180; } // «ah!» on a match
// THE SIZES OF THE PUPILS AND THE WHITES, separately for the left and the right eye.
// The dramaturgy of the boost (the owner's spec): while it accumulates — the pupils GROW 29->50;
// as soon as the boost is collected — they sharply SHRINK to 15 (eyes-0-1) and roll around.
function eyeSizes(now, state){
  // ⚠️ THE FATIGUE IS THE SECOND PHASE OF THAT SAME SIZE CHANNEL (the GRAPHICS frame: do not
  // introduce a new visual variable). It drops the BASE, while collecting a series
  // still pulls the pupil up FROM THAT sagged base — it reads as
  // «tired, but on a series it still opens wide, just not as wide any more».
  const base = PUP_BASE * (1 - TIRED_PUP_K * bowlFatigue());
  const s = { pl: base, pr: base, wl: EYE_R, wr: EYE_R };
  if (chainUntil > now){
    if (chainSeries >= 2){                       // a turbo SERIES: the asymmetry of eyes-5
      s.pl = EYE5_PL; s.pr = EYE5_PR; s.wr = EYE5_WR; return s;
    }
    s.pl = s.pr = PUP_MIN; return s;             // ordinary turbo: shrunk, rolling around
  }
  if (state === 'surprised'){ s.pl = s.pr = PUP_WIDE; return s; }
  if (state === 'kind'){
    // COLLECTING THE BOOST: the pupils grow 29 -> 50 as the series builds up (the owner's spec).
    // That is exactly what replaced the eyes-4-4 arcs — size, not shape.
    const t = Math.min(1, comboCount / chainComboAt()); // the threshold grows with the level (00-config)
    s.pl = s.pr = base + (PUP_WIDE - base) * t;          // we pull FROM the sagged base
    return s;
  }
  if (pupPulseUntil > now){ s.pl = s.pr = base * 1.25; }   // «ah!» on a match
  return s;
}
// WHERE THEY LOOK. The vector is given with a margin — the real amplitude will be trimmed by
// clampGaze according to the free room inside the white.
function gazeFor(now, state){
  if (chainUntil > now){
    // TURBO: the pupils ROLL in OPPOSITE directions (the owner's spec) — one
    // clockwise, the other counter-clockwise, a revolution in about 1.2 s
    const th = now / 1000 * 5.2;
    const c = Math.cos(th) * 99, sn = Math.sin(th) * 99;       // 99 = «all the way»
    return [[c, sn], [-c, -sn]];
  }
  if (FACE_GAZE[state]) return FACE_GAZE[state];
  if (lookUntil > now && lookVec) return [lookVec, lookVec];
  if (now > wanderAt){ wanderAt = now + 1500 + Math.random() * 1500;
    wander = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 8]; }
  return [wander, wander];
}
// ⚠️ THE MAIN RULE (the owner's spec): the black pupil NEVER goes outside
// the white. The free travel = the white's radius − the pupil's radius − 1 (a margin so that it does not
// touch the edge). Without this a wide-open pupil poked outside when looking sideways.
function clampGaze(vec, pupR, eyeR){
  const room = Math.max(0, eyeR - pupR - 1);
  const d = Math.hypot(vec[0], vec[1]);
  if (d <= room || d === 0) return vec;
  return [vec[0] / d * room, vec[1] / d * room];
}
// the tick of the whole construction — every frame (blinking requires finer than 600 ms)
function tickFace(now){
  tickVitrine(now); // the showcase gates itself by a media query and by 150 ms
  // REACTIONS without edits in somebody else's zone: we watch the score. It grew — the pupil
  // «gasped», it fell (a miss of −7) — they look down SADLY (eyes-1-6, the owner's
  // spec). ⚠️ DURING THE GRIND the reactions are MUTED: the −20 penalty drips
  // on every grind, and sadness would override the angry eyes — the owner demands
  // «always angry while the blender is working».
  if (level && !intro && !lastGrind){
    if (lastScoreSeen === null) lastScoreSeen = stats.score;
    else if (stats.score > lastScoreSeen) facePulse();
    else if (stats.score < lastScoreSeen){
      // the natural entry into sadness: the pupils DIVE downwards (80 ms on the round
      // pair), then the eyelids come out; after the sadness the gaze still hangs at the bottom
      lookVec = [0, 18]; lookUntil = performance.now() + 1900;
      faceHold = 'sad'; faceHoldUntil = performance.now() + 780;
      faceHoldFrom = performance.now() + 80; // 80 ms — the pupils' dive before the eyelids
    }
    lastScoreSeen = stats.score;
  } else lastScoreSeen = null;
  // the time changes its width once a second — we squeeze the frame on the fact of the change
  const tmStr = $('timer').textContent;
  if (tmStr !== tmStrLast){ tmStrLast = tmStr; fitStat('timer'); }
  // WE CATCH A BOWL MARK BY A DIFF of the counter — we do not touch the mechanics (bowlCrackAdd).
  // ⚠️ The same diff also catches a level RESET (cracks went back to zero) — a separate
  // handler for the level change is not needed, and there will be no desync between them.
  const _cr = (level && level.bowlCracks) || 0;
  if (_cr !== bowlSeen){
    if (_cr > bowlSeen && level && !level.over){
      const _n = (typeof bowlN === 'function') ? bowlN() : 6;
      if (_cr >= _n) tiredSlam = true;               // the N-th: the eyes slammed shut
    }
    if (_cr === 0) tiredSlam = false;                // a new level — with a clean face
    bowlSeen = _cr;
  }
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // a blink of 120 ms once every 4-7 s; in turbo and during the grind we do not blink
  const canBlink = faceState === 'calm' || faceState === 'kind' || faceState === 'rolled';
  if (now > nextBlinkAt && canBlink){
    blinkUntil = now + 120;
    // ⚠️ IT BLINKS MORE RARELY AS THE FATIGUE GROWS (the GRAPHICS frame): the interval grows
    // twofold by the last mark. Not «more often» — a tired one blinks slowly and
    // heavily, frequent blinking would read as anxiety, and that is somebody else's signal.
    nextBlinkAt = now + (4000 + Math.random() * 3000) * (1 + bowlFatigue());
  }
  // the grind overrides everything, including the short reactions and the blinking;
  // faceHoldFrom delays the switching-on of the hold state (the pupils' dive)
  const holdOn = faceHoldUntil > now && now >= faceHoldFrom;
  // THE FATIGUE FACES — THE OWNER'S LADDER: the eyelids accumulate -> SLITS (spent) ->
  // ✕✕ (knocked out) -> the bowl's scatter. ⚠️ Both shapes are taken from his nodes and not
  // invented: 741:1302 and 741:1281.
  // ⚠️ THE LIVE GATE `level.over`: `tiredSlam` lives until genLevel (only it resets
  // bowlCracks, shatterBowl does NOT), while the level ends EARLIER, on
  // the collection wave. Without the gate the victorious face would be drawn knocked out.
  const aliveNow = !lastGrind && !!level && !level.over;
  const knockedOut = tiredSlam && aliveNow;                   // TERMINAL: it beats the reactions too
  const isSpent = !knockedOut && aliveNow && bowlLeft() <= TIRED_SPENT_AT;
  // ⚠️ THE ORDER HERE IS EXACTLY THE LADDER OF PRIORITIES (the GRAPHICS frame, item 3):
  // grind > knocked out > short reactions > spent > rest. «Spent» stands
  // BELOW the reactions deliberately — otherwise the slits would eat the sadness on a miss,
  // and that is a signal about a different event.
  const st = lastGrind ? 'angry'
           : knockedOut ? 'out'
           : holdOn ? faceHold
           : isSpent ? 'spent' : faceState;
  setFace(st, now, blinkUntil > now && st !== 'lose' && st !== 'out' && st !== 'spent' && !lastGrind);
}
function setFace(state, now, blinking){
  const svg = $('eyes'), layer = FACE_LAYER[state] || 'fRound';
  for (const id of ['fRound','fAngry','fX','fSad','fSlit'])
    $(id).classList.toggle('on', id === layer);
  // ⚠️ THE LIST IS ONE AGAIN — there are no overlays any more (the eyelids were deleted, see the tombstone
  // at the top of the file). The canonical rule «every markup node is handled in setFace»
  // is fulfilled literally: as many layers as there are in the markup, so many are here.
  svg.classList.toggle('blink', !!blinking);
  if (layer === 'fAngry'){
    // the angry ones FOLLOW THE BOWL (the owner's spec): left -> right -> down,
    // step ~0.8 s; the CSS transition on .p smooths it; the clip keeps it inside the white
    const seq = [[-11, 5], [11, 5], [0, 11]];
    const g2 = seq[Math.floor((now || performance.now()) / 800) % 3];
    $('pupAL').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    $('pupAR').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    return;
  }
  if (layer !== 'fRound') return;                 // the other layers have no pupils
  const t = now || performance.now();
  const sz = eyeSizes(t, state), g = gazeFor(t, state);
  const gl = clampGaze(g[0], sz.pl, sz.wl), gr = clampGaze(g[1], sz.pr, sz.wr);
  $('pupL').style.transform = 'translate(' + gl[0].toFixed(1) + 'px,' + gl[1].toFixed(1) +
    'px) scale(' + (sz.pl / PUP_BASE).toFixed(3) + ')';
  $('pupR').style.transform = 'translate(' + gr[0].toFixed(1) + 'px,' + gr[1].toFixed(1) +
    'px) scale(' + (sz.pr / PUP_BASE).toFixed(3) + ')';
  $('wL').style.transform = 'scale(' + (sz.wl / EYE_R).toFixed(3) + ')';
  $('wR').style.transform = 'scale(' + (sz.wr / EYE_R).toFixed(3) + ')';
}
let lastGrind = false;
function updateEyes(now, grinding){ lastGrind = !!grinding; faceState = eyesMood(now, grinding); } // the mood — once every 600 ms
// ⚠️ IT USED TO CHANGE TOGETHER WITH skyTimeNow (10-stage), the owner's spec 2026-07-31
// «day until 20:00, night from 20:00». A GRAPHICS EDIT IN AN INTERFACE FILE — by
// agreement through the dispatcher: the boundary is obliged to move in lockstep with the sky,
// otherwise from 20 to 22 the sky is daytime while the buttons' theme is nighttime.
// ⚠️ THE NUMBER IS NO LONGER DUPLICATED: both functions read SKY_DAY_FROM/
// SKY_NIGHT_FROM from 00-config. The hour is taken via skyHourNow() — it also carries
// the force hook `?hour=N` with which the INTERFACE asked to close the untestability
// of the themed features (the showcase's theme, the Shake inversion, the button-colour rule).
// ⛔⛔ «THE SHAKE INVERSION» NO LONGER EXISTS IN THIS LIST (2026-08-21): by
// the owner's word «replace the Shake button everywhere» the button became a BRUSH ICON without
// a backing and left the `--btn-bg`/`--btn-fg` rule — there is nothing to invert
// on it. This is NOT «unreachable at night» but ABSENT; the phrase is left with
// a tombstone so that the next person does not go looking for a mechanic that does not exist. The other two
// themed features of the list are intact (and still unreachable — daytime only).
// ⛔⛔ DAYTIME ONLY, ALWAYS — the owner's word 2026-08-20. The second half of the rule
// lives in `skyTimeNow` (10-stage): if they diverge — the sky is daytime with a nighttime theme
// of the buttons, exactly the disease for the sake of which both functions were once brought onto the same
// numbers. The `html.night` rules (the showcase's theme, the buttons' colour; ⛔ the Shake inversion
// is NO LONGER among them — see the tombstone above) and
// the stars on the showcase stay in the code but are unreachable — a matter of the owner's
// taste, and to such things he comes back.
function isNightSky(){
  return false;
}
// Squeeze the svg frame to the text: the width = the text's length in viewBox units ×
// the current scale (height/27). Without this the fixed frames gave a hole
// between LV and the time and the time overlapping the eyes (the owner's screenshot).
function fitStat(id){
  const t = $(id), svg = t.ownerSVGElement;
  // ⚠️ THE LEAD — the space taken to the LEFT of the text inside the same frame (2026-08-25-b:
  // `#scSvg` carries the star icon at x=0). The frame is squeezed to the text, so without adding
  // it the icon would end up outside the viewBox it shares and be clipped at the first repaint.
  // ⚠️⚠️ THE GAP IS IN **PIXELS**, THE ICON IN VIEWBOX UNITS, AND THAT SPLIT IS THE WHOLE POINT
  // (the owner 2026-08-25-v: «the gap between the star icon and the score is 8 px»). Everything
  // inside an `.otext` frame scales with it — 42/27 on the desktop, 1 on the phone — so ONE
  // number of units would have rendered 8 px in one layout and 5 in the other, which is exactly
  // what he is pointing at. Dividing the pixels by the live scale pins the gap in both.
  // ⚠️ THE `- 1` IS THE FRAME'S OWN INSET, not a fudge: the text is anchored `end` at `u - 2`
  // and the frame is `lead + textLen + 3` wide, so the text's ink begins at exactly `lead + 1`.
  const k0 = (svg.getBoundingClientRect().height || 27) / 27;
  const icon = parseFloat(svg.getAttribute('data-icon')) || 0;
  const lead = icon ? (icon - 1 + (parseFloat(svg.getAttribute('data-gap')) || 0) / k0)
                    : (parseFloat(svg.getAttribute('data-lead')) || 0);
  const u = lead + t.getComputedTextLength() + 3;  // the width in viewBox units
  // ⚠️ one has to change BOTH the viewBox AND the css width: the svg keeps the viewBox proportions
  // (meet) — the width alone at a height of 42 SHRANK the content (LV smaller than
  // the time on the owner's screenshot)
  svg.setAttribute('viewBox', '0 0 ' + u.toFixed(1) + ' 27');
  // ⚠️ THE ANCHOR TRAVELS WITH THE FRAME (the owner's complaint 2026-07-27 «the paddings broke»,
  // screenshot: the number is cut off by the screen's edge). LV and the time are tied to the LEFT edge
  // (x=1) — the squeezing of the frame is irrelevant to them. But the points chip is tied to the RIGHT one
  // (text-anchor=end, x=102 for the ORIGINAL frame of 104). Having squeezed the viewBox to ~91, we
  // left the anchor at 102 — the text was drawn 10 UNITS BEYOND the frame (overflow
  // on .otext is visible, so it was not clipped but stuck out) and went past the viewport:
  // measurement 390px — the text's right edge 392 with the frame reaching 382.
  if (t.getAttribute('text-anchor') === 'end') t.setAttribute('x', (u - 2).toFixed(1));
  const k = (svg.getBoundingClientRect().height || 27) / 27;
  svg.style.width = (u * k) + 'px';
  // THE «x5 float» FOLLOWS THE SCORE FRAME'S RIGHT EDGE (the owner's word 2026-09-03: «the right
  // inset is the same as the score's», both layouts). On desktop the frame is CENTRED in the
  // stack's 72px minimum slot while the score is 1–2 digits (`#topBar .grp { align-items:center }`
  // on a column), so the edge moves with the digits — written here, at the one place the frame
  // is re-fitted; on mobile (flex-end) it is 0. Read by `.x5f { right:var(--x5f-dr) }`.
  if (id === 'score'){
    try {
      const st = svg.parentElement, dr = st.getBoundingClientRect().right - svg.getBoundingClientRect().right;
      st.style.setProperty('--x5f-dr', Math.max(0, dr).toFixed(2) + 'px');
    } catch(e){}
  }
}
// Squeeze the three frames of the win screen's top row to their text, the same way
// `fitStat` does it for the HUD. Without this the frames stay at their fixed 150/14/100
// viewBox units, and a fixed frame around short text IS the hole the owner is pointing
// at («between the level, the dot and the time — a single space each», 2026-08-22-d):
// the gap he sees is not a gap at all, it is empty frame.
// ⚠️ THE HEIGHT OF THE VIEWBOX STAYS 34, NOT 27 AS IN `fitStat`: these texts sit at
// y=26 of a 34-unit box, and rewriting the height would move the baseline.
// ⚠️ THE ANCHOR IS `middle` HERE (in `fitStat` it is the left edge or `end`), so after
// the squeeze x has to be re-centred — otherwise the text is drawn beside its own frame.
// ⚠️ The row itself carries the font, and the single space between the boxes comes from
// the MARKUP's whitespace in the inline flow — see `.win-toprow` in shell.html.
function fitWinTopRow(){
  const row = document.querySelector('.win-toprow');
  if (!row) return;
  // ⚠️⚠️ THE TIME IS SKIPPED WHILE ITS COUNT-UP IS IN FLIGHT (audit 2026-09-01-o). The fit sizes
  // each frame to the text the node HOLDS, and production always fits on the FINAL value before
  // the count-up starts (see the order note in `renderWinScreen`) — but a re-fit landing
  // mid-animation would measure «0:00» and leave a run of ten minutes spilling out of its box on
  // the last frame. Skipping leaves the correctly-sized frame in place, so the re-fit is a no-op
  // rather than a corruption. The timers themselves ARE the «in flight» flag; no new state.
  const flying = !!(winTimeRAF || winTimeTO);
  row.querySelectorAll('svg').forEach(svg => {
    const t = svg.querySelector('text');
    if (!t) return;
    if (flying && t.id === 'winTime') return;
    let u = 0;
    try { u = t.getComputedTextLength(); } catch (e) { u = 0; }
    if (!u) return;                       // the screen is hidden — nothing to measure
    u += 3;                               // the same padding as in fitStat
    svg.setAttribute('viewBox', '0 0 ' + u.toFixed(1) + ' 34');
    t.setAttribute('x', (u / 2).toFixed(1));
    svg.style.width = (u * (34 / 34)) + 'px';
    svg.style.height = '34px';
  });
}
let tmStrLast = '';
let chargeInT = 0, chargeRAF = 0;
// ⚠️⚠️ THE CHARGE'S DISSOLVE IS DRIVEN BY A PER-FRAME TICK, AND NOT BY updateHUD. The brief
// described «a stepped opacity from updateHUD (a 600 ms tick)» — THERE IS NO SUCH TICK:
// `updateHUD` is called BY EVENTS (a match, the end of a series/chain, a shake, a regen,
// the grant itself), while the mixer's timer updates a separate block in the loop. A measurement on main:
// as long as the player does not touch the game, the opacity is written ONCE when it drops and
// does not change — there was no dissolve at all, the button simply disappeared after 7 s.
// Hence its own rAF here: it reads the LIVE `chargeState().leftMs` (the only
// source of time is the core; the pause does not move the TTL, `chargeUntil` is a pure mark),
// writes the opacity every frame and STOPS ITSELF when there is no charge.
// ⚠️ There is ONE writer of the opacity. The former pair «a step from updateHUD + a transition in CSS»
// would diverge: on the menu's pause the frames go on, but there are no events.
function chargeFadeStart(){ if (!chargeRAF) chargeRAF = requestAnimationFrame(chargeFadeTick); }
function chargeFadeTick(){
  chargeRAF = 0;
  const cb = $('chargeBtn');
  if (!cb || cb.style.display === 'none') return;
  const cs = (typeof chargeState === 'function') ? chargeState() : null;
  if (!cs || !cs.name) return;                    // the charge is gone — the tick dies by itself
  cb.style.opacity = String(0.25 + 0.75 * Math.min(1, cs.leftMs / CHARGE_TTL_MS));
  // THE SPIN'S SELF-HEALING (the Interface caught the hole and honestly did not close it): the canvas is
  // ONE for the whole game — the menu/collection take it at any moment, while the top-up lived
  // only in updateHUD, that is, it came back only with the next game
  // event. In idle the slot stayed a dead picture (and by the owner's
  // rule the picture is also hidden — that is, empty). We bring it back per frame:
  // the check is cheap (a parentNode comparison), thumbSpinStart is called only
  // when the canvas really is not in the slot.
  // ⛔⛔ AND IT MUST NOT HEAL ITSELF WHILE THE MENU HOLDS THE CANVAS (audit 2026-09-01-o,
  // reproduced). This tick runs on EVERY frame, `thumbSpinStart`'s first act is `thumbSpinStop`,
  // and the collection card has already hidden its own <img> — so with a charge armed, hovering a
  // museum card gave the card the canvas for about two frames and then left it an EMPTY BOX, for
  // as long as the menu stayed open. It could not resolve itself either: `chargeTick` sits below
  // the `paused` return in the loop, so the charge's TTL does not run down while the menu is up.
  // ⚠️ THE SLOT LOSES NOTHING BY STANDING DOWN: `.flat` puts the conic ring back on it, which is
  // exactly the fallback that role was given when he picked the shell.
  // ⚠️ The gate is the menu's own class, the same signal `openMainScreen` writes - not a second
  // flag that would have to be kept in step with it.
  try {
    const ms = $('mainScreen');
    const menuOwns = !!(ms && ms.classList.contains('open'));
    const live = (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb);
    if (!live && !menuOwns && cb.dataset.img === cs.name){
      const sit = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
      if (sit && sit.mesh){ thumbSpinStart(sit, cb); cb.dataset.spin = cs.name; }
    }
    const onSlot = (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb);
    const img = $('chargeImg');
    if (img) img.style.display = onSlot ? 'none' : '';
    cb.classList.toggle('flat', !onSlot);
  } catch(e){}
  chargeRAF = requestAnimationFrame(chargeFadeTick);
}
// THE MULTIPLIER TOAST UNDER THE EYES (node 829:1242, the owner's word «the multiplier
// of the collected thing is shown under the eyes»): a plate of 169×60, a portrait of 44,
// «×N.NN» in lime. It is shown on collecting an upgraded type (accMult > 1),
// a repeated collection restarts the timer. Called by doMatch (80-gameplay).
let multToastT = 0, multTween = 0, multLastShown = null; // multLastShown — the number from which to spin the counter
function showMultToast(typeName, mult, isTierUp){
  // the desktop puts the toast ABOVE the showcase (node 741:1497): its height depends on
  // the number of the level's types, so we hand the measured height into a CSS variable
  try {
    const v = document.getElementById('vitrine');
    if (v && v.offsetHeight) document.documentElement.style.setProperty('--vitrineH', v.offsetHeight + 'px');
  } catch(e){}
  const el = $('multToast');
  if (!el) return;
  const it = (typeof thumbItemForKey === 'function') ? thumbItemForKey(typeName) : null;
  const url = it ? itemThumb(it) : '';
  const img = $('multToastImg');
  if (url) img.src = url; else img.removeAttribute('src');
  // THE NUMBER MOVES SMOOTHLY (the owner's word 2026-08-05: «add a smooth
  // but fast change of the multiplier from the previous value to the new one»): on
  // a tier increase we spin the counter from the previous multiplier to the new one over 420 ms
  // on the REAL clock (the toast lives outside the game time; the scatter's slow-mo must
  // not stretch it). An ordinary display sets the number at once.
  const valEl = $('multToastVal');
  const target = Math.round(mult * 100) / 100;
  if (multTween){ cancelAnimationFrame(multTween); multTween = 0; }
  if (isTierUp && multLastShown != null && multLastShown < target){
    const from = multLastShown, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 420);
      const e = 1 - Math.pow(1 - k, 3);
      valEl.textContent = '×' + (Math.round((from + (target - from) * e) * 100) / 100);
      multTween = k < 1 ? requestAnimationFrame(step) : 0;
    };
    step();
  } else {
    valEl.textContent = '×' + target;
  }
  multLastShown = target;
  // A TIER INCREASE — the same toast, but a noticeable EVENT: a flash of the chip and
  // twice as long on the screen (the owner's word 2026-08-05 «merge them into one»).
  // We remove the class by a timer — otherwise the one-off animation would hang on the node and
  // override the next display (the rake of the charge slot).
  el.classList.toggle('up', !!isTierUp);
  el.classList.add('on');
  if (multToastT) clearTimeout(multToastT);
  multToastT = setTimeout(() => { el.classList.remove('on'); el.classList.remove('up'); multToastT = 0; },
                          isTierUp ? 2600 : 1400);
}
// THE «x5 float» BADGE — TWO STATES (947:3670 idle / 957:3782 active, the owner's word 2026-09-03:
// «the second state when the player has bought the 30 minutes: everything the same, only the
// button shows the time and the button becomes a progress bar»). Active while play time is
// left: the label is the remaining minutes rounded UP («30 min» right after the purchase, «1 min»
// in the last one), the bar is remaining / the streak's total (77-save boostProgress). Called
// from updateHUD and from the loop after boostTick; it writes the DOM only when the shown
// minute or the bar's percent (in whole points) changes — a comparison per frame, not a write.
function refreshX5Float(){
  const f = $('x5Float'); if (!f) return;
  const left = (typeof scoreBoostLeftMs === 'function') ? scoreBoostLeftMs() : 0;
  const on = left > 0;
  const label = on ? (Math.ceil(left / 60000) + ' min') : 'Boost';
  const pct = on ? Math.round(boostProgress() * 100) : 0;
  const key = label + '|' + pct;
  if (f.dataset.x5 === key) return;
  f.dataset.x5 = key;
  f.classList.toggle('active', on);
  const b = $('x5FloatBtn'); if (b) b.textContent = label;
  f.style.setProperty('--x5f-pct', pct + '%');
}
function updateHUD(){
  try { refreshX5Float(); } catch(e){}
  // THE TYPE CHARGE SLOT (the dispatcher's insertion 2026-07-31, polished by the INTERFACE):
  // the portrait from the shared thumb cache (a cold pack will give back nothing for the first ticks —
  // the v183 rule will deliver the picture later by itself), the opacity = the remaining life.
  try {
    const cb = $('chargeBtn');
    if (cb && typeof chargeState === 'function'){
      const cs = chargeState();
      if (cs.name && level && !level.over && !intro){
        cb.style.display = '';
        if (cb.dataset.oc !== cs.name){
          cb.dataset.oc = cs.name; cb.dataset.img = '';   // the portrait is not confirmed yet
          cb.style.opacity = '1';
          // THE ENTRANCE: a short pop — the charge drops when the Power chain ignites, the moment is
          // a bright one. The pop is on the NODE'S TRANSFORM, the dissolve on the OPACITY, and the endless
          // PULSE — on the transform of the PICTURE (v3, «not with the button but with the model»): three
          // movements on three carriers, which is why they do not argue. We remove the class
          // by a timer — otherwise the one-off animation would hang on the node forever and
          // would override the future pop of the next charge.
          cb.classList.remove('in'); void cb.offsetWidth; cb.classList.add('in');
          if (chargeInT) clearTimeout(chargeInT);
          chargeInT = setTimeout(() => { cb.classList.remove('in'); chargeInT = 0; }, 420);
        }
        chargeFadeStart();
        // ⚠️ WE KEEP TOPPING UP THE PORTRAIT UNTIL IT ARRIVES, and not once on a name change:
        // the charge's type is RANDOM, and its pack may well be cold —
        // then `itemThumb` by the v183 rule honestly gives back nothing, and a one-off
        // attempt would leave the slot with SOMEBODY ELSE'S picture of the previous charge (worse than
        // emptiness: the button would promise the wrong item). Until it arrives we clear the src.
        if (cb.dataset.img !== cs.name){
          const it = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
          const url = it ? itemThumb(it) : '';
          if (url){ $('chargeImg').src = url; cb.dataset.img = cs.name; }
          else $('chargeImg').removeAttribute('src');
        }
        // THE CHARGE'S ROTATION (node 829:1242 «it spins»). The shared portrait spin;
        // the canvas is ONE for the whole game — the menu will take it for the collection when it opens,
        // and this top-up will give the spin back to the charge as soon as the slot is refreshed again.
        if (cb.dataset.img === cs.name &&
            !(typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb && cb.dataset.spin === cs.name)){
          const sit = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
          if (sit && sit.mesh){ try { thumbSpinStart(sit, cb); cb.dataset.spin = cs.name; } catch(e){} }
        }
        // ⚠️⚠️ THE OWNER'S RULE (2026-08-05, verbatim): «if I ask for a model
        // and it has rotation, then it is exactly 3D WITHOUT AN EXTRA PICTURE». The former version
        // kept `#chargeImg` UNDER the canvas as a «fallback» — and both are visible at once:
        // a flat portrait and a spinning model on top. This is the SECOND case of the same
        // mistake (the first was the collection gallery), hence a rule and not a one-off
        // fix: a live spin => there must be NO picture.
        // ⚠️ THE CHECK IS EVERY TICK, AND NOT IN THE NAME-CHANGE BRANCH: the canvas is shared, the menu
        // takes it at any moment — the picture is obliged to come back exactly when
        // the spin is gone, otherwise the slot will stay empty.
        // ⚠️ We do NOT REPLACE an empty `src` with somebody else's portrait (the v183 rule): a cold
        // pack => nothing, and that is more honest than showing the wrong item.
        const spinLive = (typeof spinR !== 'undefined' && spinR &&
                          spinR.domElement.parentNode === cb);
        $('chargeImg').style.display = spinLive ? 'none' : '';
        // ⚠️⚠️ THE CONIC RING IS NOW THE FALLBACK, NOT THE EFFECT. He picked the surge band off
        // the bench (2026-09-01-l), and a shader shell can only ride on the LIVE 3D model - when
        // the slot falls back to a flat `#chargeImg` (a cold pack, or the menu having taken the
        // shared canvas) there is nothing for it to hang on. The ring is what says «electrified»
        // there, which is exactly the role the bench named for it when it was shown to him.
        // ⚠️ Showing BOTH would be the same defect the canon records at this very button: a live
        // model plus a flat picture on top, «a model with rotation means 3D WITHOUT a picture».
        cb.classList.toggle('flat', !spinLive);
      } else {
        if (cb.style.display !== 'none'){
          try { if (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb) thumbSpinStop(); } catch(e){}
        }
        cb.style.display = 'none'; cb.dataset.oc = ''; cb.dataset.img = ''; cb.dataset.spin = '';
      }
    }
  } catch(e){}
  // ⚠️ THE THEME CAN CHANGE IN A LIVE SESSION (the 20:00 boundary), and the neutral of the strips
  // depends exactly on it — which means the tint is obliged to move together with the theme, otherwise
  // after sunset the strips would stay white. We repaint ONLY on the transition,
  // not every tick. (The painting of the edges was removed by the 4th edition — the tick stayed cheap.)
  // ⛔ Under the menu we do NOT interfere — there is its own neutral there, and openMainScreen sets it.
  const nightNow = isNightSky();
  if (nightNow !== hudWasNight){
    hudWasNight = nightNow;
    // a palette change in a live session (the 20:00 boundary): the edges follow the sky.
    // by this moment 10-stage has already rewritten --sky-*-rgb.
  }
  document.documentElement.classList.toggle('night', nightNow);
  captureLevelTypes(); // we fix the level's types for the win screen (outside the showcase's zone)
  // #11 (the owner's spec): we show the LEVEL on the desktop (the left group) AND on
  // mobile — above the points (layoutHUD moves that same #lvlSvg into the stack). The time
  // (#tmSvg) stays HIDDEN, we do not repurpose the slot — the assertion «the time is hidden» is intact.
  $('lvlNum').textContent = 'LV ' + levelNum;
  fitStat('lvlNum');
  // the mobile mockup 741:1738: on the right the stack «level / points». THE ITEM COUNTER
  // WAS DELETED (the owner's spec 2026-07-28 «the top figure is not needed at all»): on
  // the desktop it was not there anyway (there is no mockup), only mobile was left.
  // There are no coins either (the wallet is in the menu), the level number is #lvlSvg (#11).
  // ON THE RIGHT — THE LEVEL'S POINTS under the star icon (the owner's spec 2026-07-22-b:
  // «the stars on the right are not stars but points. The star icon stays, but the counting
  // of the points goes the same way from a match or from mistakes»). It cancels the short-lived
  // spec «the total stars in the chip».
  // ⛔ AND SINCE 2026-09-01-i THERE ARE NO STARS TO SHOW ANYWHERE: «we have no concept of stars,
  // only points». The rating and its win-screen row are gone; what is left of the word `star` in
  // this codebase is the ICON for points, which is exactly what this comment is about.
  // THE SINGLE BALANCE (the owner's finalisation 2026-07-24, META's request): the chip
  // shows liveBalance() = the balance + the level's unbanked score (÷10),
  // and NOT the per-level stats.score — the same number as the menu's wallet and the leaderboard.
  // On a win the score goes into se (bankLevelScore) → the number is continuous.
  // ⚠️ THE CHIP USED TO OVERFLOW (META's measurement: 6 digits at 360px overlapped the eyes by
  // 4px, 7 digits at 393px — by 14px): the number was written RAW, while #scSvg has
  // a fixed viewBox and width — the excess was drawn BEYOND the frame
  // (.otext overflow:visible) right onto the construction of the eyes. The cure has two
  // parts: (a) the same compressor as on the win screen — the string's length is
  // bounded from above; (b) fitStat — the frame by the fact of the text, as with
  // lvlNum/timer. Bundles make this critical: a wallet of 6-7 digits already in
  // the first paying session.
  // ⛔ THE «★ » PREFIX IS GONE FROM THE STRING (2026-08-25-b): the star is now the owner's
  // icon `#scStar` drawn inside the same frame, not a glyph in the text. Putting it back here
  // would draw TWO stars — the guard pins the text as digits only.
  $('score').textContent = winFmtScore(liveBalance());
  fitStat('score');
  const btn = $('shakeBtn');
  // ⚠️ The counter = the level's free ones + the PURCHASED stock of the bundle (77-save): without
  // this a player with 50 paid shakes would see «No shakes». The badge's style/
  // layout are the INTERFACE's business, here only the truthful number.
  const shakesLeft = level.shakes + purchasedShakes();
  // ⛔⛔ THERE IS NO CAPTION ANY MORE — THERE IS A LIME BADGE ON THE BRUSH ICON (the owner's
  // word 2026-08-21 «replace the Shake button everywhere» + the mockups 886:3949 and
  // 886:4017). Cancelled all at once: the strings «Shake ×N» / «Shake Ad» / «No shakes»,
  // the generated node <span class="ad-w"> and the rule #shakeBtn.ad .ad-w.
  // ⚠️⚠️ THE CARRIER OF THE «Ad» STATE MOVED FROM THE BUTTON TO THE BADGE — ONE, AND NOT TWO:
  // previously the .ad class hung on #shakeBtn for the sake of the colour of the word inside the caption, now
  // it lives on the badge itself, exactly like the .ad of #hintCnt. Keeping it in both
  // places would mean introducing a second truth about the state.
  // ⚠️ textContent, and not innerHTML: there is no node inside the badge any more, and
  // updateHUD is called from ~52 places — the write is obliged to be cheap.
  const lbl = $('shakeLbl');
  if (shakesLeft > 0){ btn.classList.remove('off'); lbl.classList.remove('ad'); lbl.textContent = shakesLeft; }
  else if (level.adShakes > 0){ btn.classList.remove('off'); lbl.classList.add('ad'); lbl.textContent = 'Ad'; }
  // ⚠️ THE BRANCH IS UNREACHABLE with AD_SHAKES_PER_LEVEL = Infinity (00-config) and
  // therefore it has no mockup — the «0» with the dimming is the dispatcher's default,
  // named to the owner. We do not demolish it: the constant may become finite, and then
  // the state will come alive. We dim ONLY with the opacity — the clickability of a dimmed
  // Shake is its contract (a tap drops the toast «No shakes left»), unlike
  // the hint, where .off mutes the events.
  else { btn.classList.add('off'); lbl.classList.remove('ad'); lbl.textContent = '0'; }
  // there is NO coin chip and no hint counter in the mockup 741:1738 (the coins are on top of that
  // hidden by COINS_ENABLED; the wallet will move into the menu). The hint charges live in
  // the save — the button simply dims at zero
  // THE HINT — THREE STATES of the badge (META's contract v129):
  //  there are charges  → the number of charges (the Number badge 783:91/778:721/778:719);
  //  0 charges + an ad  → a lime «Ad» (the Ad badge 778:723/783:93) — a tap plays the ad;
  //  0 charges, capped  → «0» and the button dims.
  // ⛔ «THE SHAKE .off PATTERN» WAS STRUCK OUT OF THIS LINE ON 2026-08-21, AND IT IS NOT
  // COSMETICS: ten lines above, in this same function, the OPPOSITE is now written
  // — with Shake `.off` dims ONLY with the opacity and leaves the button
  // clickable (a tap drops a toast), whereas with the hint `#hintBtn.off` also mutes
  // the events. The contracts are DIFFERENT, and a reference to Shake as a model would lie
  // in exactly the file where the refutation stands.
  const hCnt = hints(), hAd = (typeof adHintAvailable === 'function') && adHintAvailable();
  $('hintCnt').textContent = hAd ? 'Ad' : hCnt;
  $('hintCnt').classList.toggle('ad', hAd);   // the ad badge has a padding of 8 (in the node without 12/8)
  // ⚠️ .off ONLY when there are BOTH no charges AND no ad available. Previously we dimmed by
  // hints()<1 alone — but .off carries pointer-events:none, and that WOULD HAVE BLOCKED
  // a tap on «Ad» (the button would look active but would not press).
  $('hintBtn').classList.toggle('off', hCnt < 1 && !hAd);
  // ⚠️ THE EXACT COUNT OF PAIRS WAS REMOVED FROM updateHUD (review 2026-08-05): availablePairs
  // is O(k²) with a GJK query to Rapier, while updateHUD is called from 48 places, including
  // the tail of doMatch and the turbo top-up every 125 ms. Measurement: ~11 extra calls
  // per second of active play (0.13-0.16 ms each) in the HOTTEST frames.
  // The #apCount field lives in the dev panel and is updated by the 600-ms tick (99-main),
  // where ap is computed anyway for the deadlock detection — visually we lose
  // nothing.
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // dynamic; ∞ = the endgame
}


// ===== OBJECT ACCUMULATION: the tier-up popup + the museum (the skeleton) =====
// The contract with META (WORKSTREAMS): accSnapshot() -> [{name,count,tier,mult,
// next}], the hook onAccTierUp(cb) with {name,tier,mult,item}. While there is no meta —
// demo data with a DEMO badge; the joining below will pick up the real functions
// automatically, nothing will have to be edited.

// --- an item's thumbnail: a single-frame render of the REAL mesh into an offscreen
// canvas. Matcap does not depend on the light — the portrait is honest without lamps. The cache is by
// type; the second WebGL context is single and reused.
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbCache = {};
// A reset of the portrait cache. It is needed by anyone who changes an item's MATERIAL: the collection's
// cards are shot once and live forever, so after a change of a pack's matcap
// the museum would keep the old pictures (caught on my own fitting —
// the force unwrap showed four identical shots).
function thumbCacheDrop(){ for (const k in thumbCache) delete thumbCache[k]; }
// THE BUFFER SIZE: 132 = 3×44 (the showcase/museum) and 2.4×56 (the toast) — enough for
// a retina; 96 gave mush, 176 — an extra 50% of the cache's weight. The buffer is STRICTLY
// SQUARE: the consumers have img 100%/100% without object-fit, a non-square
// will squash the portrait. MARGIN 4% — less is not allowed: the boxes have a radius of 10-12,
// the corners of round models would be clipped.
const THUMB_PX = 256, THUMB_MARGIN = 0.04, THUMB_Y = 100; // 256 (it used to be 132): sharper on the collection card (the owner's spec «quality»)
// THE PORTRAIT'S POSE — A SINGLE SOURCE for the static shot (itemThumb) AND the spin (thumbSpin):
// on hover the interface hides the static img and shows the canvas, the spin starts
// from that same angle — the substitution is seamless. If the static shot and the spin diverge — there is a jump
// on hover, which is why BOTH take it from here (they must not be split apart). The owner's spec
// 2026-07-24-v: «a light lift to the right and up, then a spin along the horizontal».
// tx=−0.15 — a LIGHT view FROM BELOW (the model's front is lifted, it does not «dive» from above,
// as the former +0.42 top-down did, which the owner rejected as «it drags into the bottom
// corner»); yaw=−0.6 gives a 3/4: cars have their front to the right and up, animals show their muzzle.
// Chosen by screenshots on police/bee/banana (all three read heroically).
let PORTRAIT_TILT_X = -0.15, PORTRAIT_YAW0 = -0.6;
// A PORTRAIT MESH BY THE TYPE'S KEY (type.name) — variant B of the owner's spec 2026-07-24:
// it gives a model to those OPEN types that are NOT in the current run (otherwise there was
// a letter placeholder). The mesh is built WITHOUT a Rapier body (a portrait does not need physics) and
// is NOT added to the main scene — itemThumb/the spin make their own mesh wrapper.
// The material is THE SAME itemMaterial (40-items) as on a live item: the matcap,
// the veil, texTune are honest. The cache is by key; key='T'+idx MATCHES the live one, which is why
// thumbCache (by item.key) is shared by the portrait and the live item — there is no double
// render. It returns a minimal item for itemThumb/thumbSpinStart.
// THE GHOST OF LOCKED TYPES (the owner's spec 2026-07-24-v: «the models that are not open
// look transparent and a little matte, but colourless» + «fill the whole
// museum with models»). The silhouette of what has not been caught (like a pokedex) — it teases. The interface
// hangs it on the LOCKED cards INSTEAD of the letter (ghost=true).
// ⚠️ WE REUSE what is already there: the decolouring is the uVeil veil (the desat in the shader,
// v84), the transparency is material.opacity. itemThumb on item.ghost pushes uVeil=1
// + opacity=GHOST_ALPHA (otherwise it forces uVeil=0/opacity=1). The matteness is given by the
// desat itself (grey reads as clay). Its own cache key '@g' — the ghost and the colour
// portrait of one type must not overwrite each other in thumbCache.
const GHOST_ALPHA = 0.42;   // «semi-transparent»: the card's background shows through the silhouette
const thumbItemCache = {};
// ⚠️ A LIVE PILE ITEM IS PREFERRED FOR PORTRAITS ONLY WHEN THE TYPE HAS ONE GEOMETRY.
// The live item exists as a warm fallback for a cold pack atlas — but for the six sport types
// the live mesh is the pile LOD, and a card drawn from it would show the simplified model at
// portrait scale. For geoHi types the portrait item comes first; the live item stays the
// cold-atlas fallback (thumbItemForKey's thumb returns nothing until the pack warms up).
function portraitPick(live, key, locked){
  const hasHi = (function(){ for (let i = 0; i < TYPES.length; i++)
    if (TYPES[i].name === key) return !!TYPES[i].geoHi; return false; })();
  const thumb = (typeof thumbItemForKey === 'function') ? thumbItemForKey(key, locked) : null;
  return hasHi ? (thumb || live) : (live || thumb);
}
function thumbItemForKey(key, ghost){
  const ck = ghost ? key + '@g' : key;
  if (thumbItemCache[ck]) return thumbItemCache[ck];
  let idx = -1;
  for (let i = 0; i < TYPES.length; i++) if (TYPES[i].name === key){ idx = i; break; }
  if (idx < 0) return null;
  const t = TYPES[idx];
  // ⚠️ THE PORTRAIT TAKES THE DETAILED GEOMETRY (the owner's variant 3, 2026-08-29): types with
  // a `geoHi` render the full model here — this function feeds EVERY big view (the collection
  // card, the new-object showcase, the spins). The cache key is split from the pile's on
  // purpose: String(idx) is the pile's LOD, 'hi:'+idx is the portrait's, and sharing the key
  // would silently hand one of them the other's mesh.
  const gkey = t.geoHi ? ('hi:' + idx) : String(idx);
  if (!geoCache.has(gkey)) geoCache.set(gkey, (t.geoHi || t.geo)());
  const mat = itemMaterial(t);
  // ⚠️ we set transparent ONCE at creation time (changing it on the fly =
  // a shader recompilation); the ghost material is personal, it does not touch the live ones
  if (ghost) mat.transparent = true;
  const mesh = new THREE.Mesh(geoCache.get(gkey), mat);
  mesh.scale.setScalar(MESH_SCALE);
  const it = {
    // ⚠️⚠️ 'h' IN THE KEY IS LOAD-BEARING (found by the adversarial verify, 2026-08-29).
    // itemThumb caches the PNG by item.key, and a LIVE pile item of the same type carries
    // 'T'+idx too. Before variant 3 both meshes were identical and sharing the slot was
    // harmless; now the live mesh is the pile LOD and this one is geoHi — two different
    // pictures under one key, first shooter wins. The vitrine and the museum shoot LIVE items
    // automatically (vitFillCell / renderMuseum), so without the suffix a level with a sport
    // type in the vitrine poisoned the collection card with the LOD shot until a reload.
    key: 'T' + idx + (t.geoHi ? 'h' : '') + (ghost ? 'g' : ''), type: t, mesh, ghost: !!ghost, baseColor: mat.color.clone(),
    fxColor: (t.tex || t.mat === 'model') ? new THREE.Color(t.color).convertSRGBToLinear() : null,
  };
  thumbItemCache[ck] = it;
  return it;
}
// ⚠️⚠️ PORTRAITS ARE ALSO ITEMS OF A PACK, AND THEIR MATERIAL IS THEIR OWN. `itemMaterial`
// builds a NEW material for every portrait (`new THREE.MeshMatcapMaterial`), while
// `thumbItemCache` keeps the ready item forever. Which means that anyone who CHANGES THE TEXTURE
// OBJECT ITSELF of a pack is obliged to go over the portraits too: resetting `thumbCache`
// is not enough — the shot will be retaken, but with the OLD material, and the card lies until
// a reload. That was exactly the defect «the portraits go stale» (2026-08-19).
// ⚠️ An in-place edit of the PIXELS does NOT need to be called in here: the object is the same, and the materials
// point where they should anyway — `thumbCacheDrop` is enough there. There are FOUR such writers,
// and the list cost an investigation on 2026-08-19: `packMatcapApply` (08),
// `mceApply` over an existing texture and `mceReset` (12), and also
// `retuneMatcap` (10) — the preset tuner's sliders go through it.
// ⚠️⚠️ HERE THERE IS ONLY THE SEARCH, WITHOUT THE JUDGEMENT. Who is entitled to a pack's matcap and who is not
// (`paint`) is decided by ONE place — `packMatcapRepoint` (10-stage). Splitting this
// rule across two loops has already been tried: in the live one `paint` was forgotten, and «Apply»
// on the bricks split the pack.
// ⚠️ The ghost variants get in here on equal terms: they have their own cache key ('@g') but the same
// `type`, and they need the same matcap — otherwise a locked card would stay
// on the old material while an open one got updated.
function thumbItemsOfPack(pack){
  const out = [];
  for (const k in thumbItemCache){
    const it = thumbItemCache[k];
    if (it && it.type && it.type.tex === pack && it.mesh) out.push(it);
  }
  return out;
}
// The same, but for ONE type — the per-object matcap of the editor (2026-08-25-b) repoints
// exactly one type, and the portraits are separate items that live only here.
function thumbItemsOfType(name){
  const out = [];
  for (const k in thumbItemCache){
    const it = thumbItemCache[k];
    if (it && it.type && it.type.name === name && it.mesh) out.push(it);
  }
  return out;
}
function itemThumb(item, tight){
  if (!item || !item.mesh) return null;
  // ⚠️⚠️ THE MODE IS PART OF THE CACHE KEY (2026-08-25-d). Both variants are legitimate pictures
  // of one item, and one key for two framings would have served whichever was shot first — the
  // collection card would have got the tight one or the victory row the loose one, at random,
  // depending on which screen the player opened first.
  // ⚠️ `thumbCacheDrop` walks the whole object, so the second variant is dropped with the first
  // and no writer of pixels has to learn about it.
  const key = String(item.key) + (tight ? '#t' : '');
  if (thumbCache[key]) return thumbCache[key];
  // ⚠️⚠️ THE ATLAS IS NOT DECODED YET -> DO NOT SHOOT AND DO NOT CACHE (the owner's
  // complaint 2026-07-30 «where are the previews of all the new objects?»).
  // `modelColormap` (36-models) returns a texture with a WHITE 1×1 placeholder, while
  // `needsUpdate` is set only in `img.onload` — before that `map.version === 0`,
  // that is, the texture has NEVER been uploaded to the GPU. The portrait is shot synchronously
  // and comes out EMPTY (measurement: 0 opaque pixels out of 65536, and two different
  // types give a byte-identical PNG of 3174 B), after which the blank settles
  // in thumbCache FOREVER — the card stays without a picture until a reload.
  // ⚠️ Only the NEW packs were ill (holiday/survival/toycar/factory/market/
  // arcade/forest): their atlases are not needed by an early level and are decoded for the first time
  // exactly on this call. The old ones (animal/food/car/brick/pirate) are warmed up
  // by a live run, which is why the defect did not show itself for years.
  // ⚠️ A SECOND RENDER IN A ROW DOES NOT CURE IT (verified: both frames at 3174 B) —
  // what one has to wait for is the decode EVENT, not an extra frame. The call itself has already started
  // the loading (itemMaterial -> modelColormap), which is why the top-up goes by a timer
  // in buildMainCollection.
  const map0 = item.mesh.material && item.mesh.material.map;
  if (map0 && (!map0.image || !map0.image.width || map0.image.width <= 1 || !map0.version)) return null;
  try {
    if (!thumbR){
      thumbR = new THREE.WebGLRenderer({ alpha:true, antialias:true });
      thumbR.setSize(THUMB_PX, THUMB_PX, false);
      thumbR.outputEncoding = renderer.outputEncoding; // without it the colours drift
      thumbScene = new THREE.Scene();
      // ORTHOGRAPHY (and not perspective): the projection is affine, which is why the frame
      // is computed ANALYTICALLY in a single pass — without reading pixels,
      // without a second render and without a GPU->CPU stall on readPixels.
      thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
      thumbCam.position.set(1.7, THUMB_Y + 1.35, 2.3);
      thumbCam.lookAt(0, THUMB_Y, 0);
      // in case of CFG.matcap=false (the emergency MeshStandard) — a soft light
      thumbScene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5);
      dl.position.set(2, 3, 2); thumbScene.add(dl);
    }
    // ⚠️ NOT mesh.clone(): three r149 copies userData through JSON.stringify,
    // and userData.item holds a Rapier body — a cyclic structure, a throw.
    const m = new THREE.Mesh(item.mesh.geometry, item.mesh.material);
    m.scale.copy(item.mesh.scale);
    m.rotation.set(PORTRAIT_TILT_X, PORTRAIT_YAW0, 0);
    // ⚠️ HIGH ABOVE THE SCENE: the matcap patch dims the diffuse by the WORLD height
    // (vWorldY against uPileTop, 10-stage) — a portrait at y=0 always came out
    // in the darkest tone of the pile (measurement: down to −0.83 on the R channel).
    m.position.set(0, THUMB_Y, 0);
    thumbScene.add(m);
    m.updateMatrixWorld(true);
    thumbCam.updateMatrixWorld(true);
    // ⚠️ THE FRAME BY THE ENCLOSING CYLINDER (the shared frameCylinder), NOT by the silhouette at
    // one angle. The reason (the owner's spec 2026-07-27 «the size must not change on
    // hover»): the spin is obliged to frame by the cylinder (otherwise it «breathes»
    // while rotating), whereas the static shot by the silhouette gave a BIGGER model → on hover
    // the img→canvas substitution SHRANK the object. A single cylinder frame = the static shot is EXACTLY
    // equal to the spin. It is Y-invariant: yaw has no effect, so one frame fits any angle.
    // ⛔ THE VICTORY ROWS ASK FOR THE TIGHT ONE — the only surface with no hover spin to keep in
    // step with (verified: `thumbSpinStart`/`thumbSpinToggle` are wired to the collection cards
    // and the new-item screen, never to `.wt-thumb`).
    if (tight) frameSilhouette(thumbCam, m); else frameCylinder(thumbCam, m);
    // ⚠️ THE UNAVAILABILITY VEIL paints material.color with a lerp towards grey
    // (tickVeil, 60-access): a shot at that moment would settle into the cache GREY
    // FOREVER. For the duration of the render we restore the type's original colour.
    // ⚠️ Since 2026-07-23 the veil also lives IN THE SHADER (uVeil, the 'desat' mode):
    // restoring the color alone is NOT ENOUGH — a decoloured portrait would just as well
    // settle into the cache forever. We mute both knobs for the duration of the shot.
    // THE GHOST (item.ghost): the other way round — we PUSH the veil to the maximum (a desat towards a light
    // grey) + semi-transparency. An ordinary portrait: both knobs at 0/1 (full colour).
    const gh = item.ghost;
    // ⚠️ userData.shader is set by matcapSpecPatch in onBeforeCompile — on the FIRST
    // render. On a fresh ghost material it is still null before the render, and uVeil=1 would
    // not have been applied (the ghost came out in colour). A forced compilation gives the shader
    // BEFORE the read. Only for the ghost — ordinary portraits have uVeil=0 by default.
    if (gh) thumbR.compile(thumbScene, thumbCam);
    const col = m.material.color, saved = (item.baseColor && col) ? col.clone() : null;
    if (saved) col.copy(item.baseColor);
    const sh = m.material.userData && m.material.userData.shader;
    const savedVeil = sh ? sh.uniforms.uVeil.value : 0;
    if (sh) sh.uniforms.uVeil.value = gh ? 1 : 0;
    const savedOp = m.material.opacity;
    m.material.opacity = gh ? GHOST_ALPHA : 1;
    // ⚠️ THE GHOST IS OBLIGED TO STAY COLOURLESS (the owner's spec «the models that are not open are
    // transparent, a little matte, but COLOURLESS»). The ghost reuses the same
    // uVeil uniform as the live veil, and that one since 2026-07-29 HAS A TINT
    // (VEIL_TINT, «light blue, not grey») — and it silently painted the collection's
    // silhouettes blue: a measurement of the ghost's average colour gave rgb(81,117,161), a blueness
    // of b−r = +80. Two applications of one uniform diverged in their requirements,
    // which is why for the duration of the PORTRAIT SHOT the tint is returned to neutral (white:
    // vec3(vLum)*1 = an honest grey). The live veil is untouched — the edit lives
    // exactly for the frame of the shot, just like the neighbouring saves of color/opacity.
    const savedCol = uVeilCol.value.clone();
    if (gh) uVeilCol.value.setRGB(1, 1, 1);
    thumbR.render(thumbScene, thumbCam);
    uVeilCol.value.copy(savedCol);
    m.material.opacity = savedOp;
    if (sh) sh.uniforms.uVeil.value = savedVeil;
    if (saved) col.copy(saved);
    const url = thumbR.domElement.toDataURL();
    thumbScene.remove(m);
    thumbCache[key] = url;
    return url;
  } catch(e){ console.warn('itemThumb:', e && e.message); return null; }
}

// ====== LIVE ROTATION OF THE PORTRAIT ON HOVER (the owner's spec 2026-07-24
// «on the showcase, on hover, the model rotates slowly along the horizontal»).
// ONE shared offscreen context spinR, the rAF ONLY while the hover hangs; outside the hover —
// ZERO cost (the rAF is cancelled, the canvas is removed). THE CONTRACT WITH THE INTERFACE:
// thumbSpinStart(item, hostEl) / thumbSpinStop() — the interface hangs them on the card's
// mouseenter/leave, the static <img> stays the frame of rest.
const SPIN_PX = 256;       // the buffer's square = THUMB_PX (quality, the owner's spec)
const SPIN_SPEED = 0.9;    // rad/s — «slowly» (a revolution in ~7 s)
// SPIN_TILT_X/SPIN_YAW0 — ALIASES onto the shared PORTRAIT_* (they must not be split apart from the static shot)

let spinR = null, spinScene = null, spinCam = null;
let spinMesh = null, spinItem = null, spinRAF = 0, spinPrev = 0, spinAngle = 0;
// THE CHARGE'S ELECTRIC SHELL (chargeSurgeMake, 70-fx) - a child of `spinMesh`, so it is
// rebuilt with it and can never outlive the mesh it hangs on.
let spinSurge = null;
const _spv = new THREE.Vector3(), _spm = new THREE.Matrix4();
function ensureSpinR(){
  if (spinR) return;
  spinR = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  spinR.setSize(SPIN_PX, SPIN_PX, false);
  spinR.outputEncoding = renderer.outputEncoding;
  // absolute inset:0 — the canvas COVERS the static <img> in the cell
  // (.msc-imgwrap position:relative), an appendChild is enough for the interface.
  // border-radius:inherit — if the interface rounds the preview, the canvas will pick up
  // the host's radius by itself (right now .msc-img has no radius — a no-op, but it is self-mounting
  // without CSS from the interface).
  spinR.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;';
  spinScene = new THREE.Scene();
  spinCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  spinCam.position.set(1.7, THUMB_Y + 1.35, 2.3); // the same angle as itemThumb
  spinCam.lookAt(0, THUMB_Y, 0);
  spinCam.updateMatrixWorld(true);
  spinScene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.5);
  dl.position.set(2, 3, 2); spinScene.add(dl);
}
// A Y-INVARIANT FRAME: the silhouette changes while rotating around Y, which is why
// we frame by the ENCLOSING CYLINDER around the local Y axis — its silhouette under
// a Y rotation does not change BY CONSTRUCTION (three Euler XYZ: R=Rx·Ry, and Ry does not
// touch a Y-symmetric cylinder). This means the model is NOT clipped and does not «breathe»
// with the zoom. It is computed ONCE at the start of the hover.
// ⛔⛔ THE TIGHT FRAME — BY THE SILHOUETTE AT THE POSE ACTUALLY SHOWN (the owner's word
// 2026-08-25-d, choosing option «a» after the measurement was put to him).
// ⚠️⚠️ IT DOES **NOT** REPLACE `frameCylinder` AND MUST NOT: the cylinder is his own spec of
// 2026-07-27 («the size must not change on hover»), it is what makes the static shot and the
// live spin identical, and `__game.thumbFrames(key).equal` asserts that equality. This function
// is a SECOND path for the ONE surface that never spins — the victory screen's rows. Everything
// else keeps the cylinder untouched.
// ⚠️ WHY THE CYLINDER UNDER-SIZES AT ALL: its radius is the single widest vertex in XZ, sampled
// as a full circle, so a model that is not round in plan is framed by a disc it does not fill —
// measured 44.5 % of the box on `brickbar` against the 92.6 % the margin allows, and a 1.49×
// spread between neighbouring rows of one screen.
// ⚠️ IT PROJECTS THROUGH `mesh.matrixWorld`, NOT THROUGH A POSE REBUILT HERE. The cylinder can
// afford `makeRotationX` alone because it is Y-invariant; the silhouette is not — it must see
// `PORTRAIT_YAW0`, and the only place that never disagrees with the render is the matrix the
// render itself uses.
function frameSilhouette(cam, mesh){
  const pos = mesh.geometry.attributes.position;
  const mw = mesh.matrixWorld, view = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++){
    _spv.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw).applyMatrix4(view);
    if (_spv.x < x0) x0 = _spv.x; if (_spv.x > x1) x1 = _spv.x;
    if (_spv.y < y0) y0 = _spv.y; if (_spv.y > y1) y1 = _spv.y;
  }
  // ⚠️ THE SAME `THUMB_MARGIN` AS THE CYLINDER, and squared off the same way: the buffer is
  // square, so the LONGER axis decides and the other one keeps the model's own proportion.
  const half = Math.max(Math.max(x1 - x0, y1 - y0) / 2 * (1 + 2 * THUMB_MARGIN), 1e-4);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  cam.left = cx - half; cam.right = cx + half;
  cam.top = cy + half;  cam.bottom = cy - half;
  cam.updateProjectionMatrix();
}
function frameCylinder(cam, mesh){
  const pos = mesh.geometry.attributes.position, s = mesh.scale.x;
  let R = 0, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z); if (r > R) R = r;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  R *= s; yMin *= s; yMax *= s;
  _spm.makeRotationX(PORTRAIT_TILT_X); _spm.setPosition(0, THUMB_Y, 0); // the pose of rest (Ry has no effect)
  const view = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const yy of [yMin, (yMin + yMax) / 2, yMax]){
    for (let a = 0; a < 24; a++){
      const th = a / 24 * Math.PI * 2;
      _spv.set(Math.cos(th) * R, yy, Math.sin(th) * R).applyMatrix4(_spm).applyMatrix4(view);
      if (_spv.x < x0) x0 = _spv.x; if (_spv.x > x1) x1 = _spv.x;
      if (_spv.y < y0) y0 = _spv.y; if (_spv.y > y1) y1 = _spv.y;
    }
  }
  const half = Math.max(Math.max(x1 - x0, y1 - y0) / 2 * (1 + 2 * THUMB_MARGIN), 1e-4);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  cam.left = cx - half; cam.right = cx + half;
  cam.top = cy + half;  cam.bottom = cy - half;
  cam.updateProjectionMatrix();
}
function thumbSpinStop(){
  if (spinRAF){ cancelAnimationFrame(spinRAF); spinRAF = 0; }
  if (spinSurge){ try { spinSurge.material.dispose(); } catch(e){} spinSurge = null; }
  if (spinMesh && spinScene){ spinScene.remove(spinMesh); spinMesh = null; }
  if (spinR && spinR.domElement.parentNode) spinR.domElement.parentNode.removeChild(spinR.domElement);
  spinItem = null; spinPrev = 0;
}
// the spin's auto-rotation: the new-item screen mutes it for the duration of a finger drag.
// spinTilt is the SECOND axis (the owner's word 2026-08-13 «spin it on all the axes»):
// a vertical drag tilts, a horizontal one turns — a turntable with two angles.
let spinAuto = true;
let spinTilt = PORTRAIT_TILT_X;
function thumbSpinNudge(dYaw, dTilt){ spinAngle += dYaw; if (dTilt) spinTilt += dTilt; }
function thumbSpinAuto(on){ spinAuto = !!on; }
function thumbSpinStart(item, host, px){
  if (!item || !item.mesh || !host) return;
  ensureSpinR();
  thumbSpinStop();                       // one shared canvas: remove the previous one
  // ⚠️ THE BUFFER SIZE IS A PARAMETER (the owner's word 2026-08-13 «higher quality»):
  // the collection stays at SPIN_PX=256 (the invariant of the frame with the static shot is intact — the frame
  // is held by the single frameCylinder, the buffer has no effect on it), while the new-item screen
  // asks for a buffer FOR ITS OWN SIZE × DPR — the former 256 was stretched threefold and
  // went mushy. Every start sets the size anew — the shared canvas does not
  // inherit somebody else's.
  spinR.setSize(px || SPIN_PX, px || SPIN_PX, false);
  spinAuto = true;
  spinItem = item; spinAngle = PORTRAIT_YAW0; spinTilt = PORTRAIT_TILT_X;
  spinSurge = null;                      // thumbSpinStop above dropped the previous mesh with its child
  // ⚠️ NOT mesh.clone() (JSON userData with a Rapier body — a throw): a wrapper on the shared
  // geometry+material, as in itemThumb
  spinMesh = new THREE.Mesh(item.mesh.geometry, item.mesh.material);
  spinMesh.scale.copy(item.mesh.scale);
  spinMesh.position.set(0, THUMB_Y, 0);  // the matcap dims the diffuse by the world height — the portrait sits high
  spinMesh.rotation.set(spinTilt, spinAngle, 0);
  spinScene.add(spinMesh);
  frameCylinder(spinCam, spinMesh);
  // ⚠️ A FRAME MARGIN FOR FREE ROTATION (only the item screen, px is given):
  // the cylinder frame is Y-invariant, but a tilt on the SECOND axis takes
  // the model's diagonal outside it — we widen the ortho camera so that the corners are not clipped.
  // The collection (no px) turns only along Y — it does not need a margin, we do not touch the cards'
  // size (the invariant of the frame with the static shot).
  if (px){ spinCam.left *= 1.22; spinCam.right *= 1.22;
           spinCam.top *= 1.22; spinCam.bottom *= 1.22;
           spinCam.updateProjectionMatrix(); }
  host.appendChild(spinR.domElement);
  spinRAF = requestAnimationFrame(spinTick);
}
// TAP = HOVER (the owner's spec 2026-07-24 «one component, hover = tap»): on
// mobile there is no mouseleave, which is why the INTERFACE hangs ONE handler
// thumbSpinToggle ON THE CARD'S TAP — a tap on an inactive card starts the spin (it will itself
// take the spin off the previous one — the canvas is shared), a repeated tap on THE SAME card
// stops it. The hover (desktop) is as it was: start on enter / stop on leave.
// It returns true if after the call the card is spinning. The size at that is EXACTLY
// as with the static shot (the single frameCylinder, see #3) — a tap does not «jerk» the scale.
function thumbSpinToggle(item, host){
  if (spinItem === item && spinR && spinR.domElement.parentNode === host){ thumbSpinStop(); return false; }
  thumbSpinStart(item, host); return true;
}
function spinTick(now){
  if (!spinItem || !spinMesh){ spinRAF = 0; return; }
  // a safety net: the cell was removed from the DOM without thumbSpinStop (a rotation of the list) —
  // do not spin into a detached canvas for nothing
  if (!spinR.domElement.parentNode){ thumbSpinStop(); return; }
  const dt = spinPrev ? Math.min(0.05, (now - spinPrev) / 1000) : 0; spinPrev = now;
  if (spinAuto) spinAngle += dt * SPIN_SPEED;
  spinMesh.rotation.set(spinTilt, spinAngle, 0);
  // ⚠️⚠️ THE ELECTRIC SHELL IS OWNED HERE, AND THAT IS THE WHOLE REASON IT CANNOT LEAK INTO THE
  // MUSEUM. `spinR` is ONE canvas for the whole game - the collection takes it the moment the
  // menu opens - so the question «is this the charge?» has exactly one honest answer at any
  // instant: WHERE the canvas is currently mounted. Deciding it at `thumbSpinStart` instead
  // would leave the shell on a collection card the next time the slot handed the canvas over.
  // ⚠️ `chargeSurgeMake` is a function declaration in 70-fx, i.e. hoisted and callable from a
  // higher-numbered module - the concatenation order guarantees only that, never a `const`.
  try {
    const cb = $('chargeBtn');
    const onCharge = !!(cb && spinR.domElement.parentNode === cb);
    if (onCharge && !spinSurge && typeof chargeSurgeMake === 'function') spinSurge = chargeSurgeMake(spinMesh);
    else if (!onCharge && spinSurge){
      spinMesh.remove(spinSurge); spinSurge.material.dispose(); spinSurge = null;
    }
    if (spinSurge) spinSurge.material.uniforms.t.value = now / 1000;
  } catch(e){}
  // the veil/matcap darkening and the transparency are OFF for the frame (the portrait does not go grey) —
  // the material is SHARED with the live one, we restore it at once (as itemThumb does)
  const mat = spinMesh.material;
  const col = mat.color, saved = (spinItem.baseColor && col) ? col.clone() : null;
  if (saved) col.copy(spinItem.baseColor);
  const sh = mat.userData && mat.userData.shader;
  const savedVeil = sh ? sh.uniforms.uVeil.value : 0; if (sh) sh.uniforms.uVeil.value = 0;
  const savedOp = mat.opacity; mat.opacity = 1;
  spinR.render(spinScene, spinCam);
  mat.opacity = savedOp;
  if (sh) sh.uniforms.uVeil.value = savedVeil;
  if (saved) col.copy(saved);
  spinRAF = requestAnimationFrame(spinTick);
}

// --- the popup: a queue, we show them one at a time for ~2.2 s ---
function fmtMult(m){ return '×' + (+m).toFixed(2).replace(/\.?0+$/, ''); }
// ⚠️ ONE TOAST FOR TWO EVENTS (the owner's word 2026-08-05 «merge them into one»):
// the collection of an upgraded kind and a TIER INCREASE are shown by one and the same toast
// under the eyes; previously the tier went into a separate pill at the bottom edge and
// read as a duplicate. ✅ The #tierToast pill, its queue and its CSS were CUT OUT by the cleanup
// of 2026-08-12 — this very comment asked to remove them «together with the markup».
// ⛔⛔ ONCE PER LEVEL (the owner's word 2026-08-23-a: «show it only once per game session,
// if an item has moved up to the next level»; asked and answered — «once per level», so
// that a long sitting still gets the celebration regularly).
// ⚠️⚠️ THE GATE STANDS HERE AND NOT IN `accAdd`, AND THAT IS LOAD-BEARING. The tier increase
// is also an event (`acc_up` telemetry) and a documented hook (`onAccTierUp`) that the suite
// pins; gating the EVENT would silently stop both, so what is gated is only the DISPLAY.
// ⚠️ THE FLAG LIVES ON `level`, which genLevel builds fresh — so it resets by itself, in
// the same way as multAtStart / chargeGiven / continueUsed. No reset line is needed, and
// adding one would just be a second truth.
// ⚠️ `multToastTest` (99-main) DELIBERATELY BYPASSES THIS GATE: it calls showMultToast
// directly, so the suite can still raise the toast at will. If that ever changes, the toast
// guard goes silent rather than red.
function showTierUp(ev){
  try {
    if (typeof level === 'undefined' || !level) return;
    if (level.multToastShown) return;
    level.multToastShown = true;
    // ⚠️ INSIDE the once-per-level gate on purpose: the owner capped this notice at one per
    // level (2026-08-23-a), and a sound outside the gate would fire on every tier-up while the
    // pill stayed hidden - a sound with no picture, which reads as a bug.
    try { Sound.play('upgrade'); } catch (e) {}
    showMultToast(ev && (ev.key || ev.name), (ev && ev.mult) || 1, true);
  } catch(e){}
}

// --- the museum: it opens FROM THE PAUSE (paused is held), closing goes back ---
const ACC_TIERS_DEMO = [100, 300, 700, 1500, 3100]; // the contract's thresholds (×2+100)
function demoAccSnapshot(){
  // demo: the level's live types with plausible accumulations — only so that
  // the owner sees the skeleton; NOT real data (the DEMO badge in the header)
  const byKey = {};
  for (const it of items) if (it.alive && !it.surprise) (byKey[it.key] = byKey[it.key] || { it, n: 0 }).n++;
  return Object.keys(byKey).slice(0, 12).map((k, i) => {
    const count = 40 + i * 97 % 900 + byKey[k].n * 7;
    let tier = 0; while (tier < ACC_TIERS_DEMO.length && count >= ACC_TIERS_DEMO[tier]) tier++;
    return { name: k, count, tier, mult: 1 + 0.25 * tier,
      next: ACC_TIERS_DEMO[tier] || null, _item: byKey[k].it };
  });
}
function renderMuseum(rows, demo){
  $('museumDemo').style.display = demo ? '' : 'none';
  const list = $('museumList');
  list.innerHTML = '';
  for (const r of rows){
    const row = document.createElement('div');
    row.className = 'mrow';
    const th = document.createElement('div');
    th.className = 'mthumb';
    // ⚠️ the fallback is by the type's KEY, not by the name: r.name is a human label
    // («Watermelon»), whereas item.key is 'T{index}'; a comparison with name could
    // never match, and the rows without _item silently lost their portrait
    const url = itemThumb(r._item || (items && items.find(i =>
      i.alive && i.type && String(i.type.name) === String(r.key))));
    if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
    else th.textContent = String(r.name || '?').slice(0, 1).toUpperCase();
    const mid = document.createElement('div');
    mid.style.flex = '1'; mid.style.minWidth = '0';
    const frac = r.next ? Math.min(1, r.count / r.next) : 1;
    mid.innerHTML = '<div class="mname"></div><div class="mprog"><i style="width:' +
      (frac * 100).toFixed(0) + '%"></i></div><div class="mcnt">' + r.count +
      (r.next ? ' / ' + r.next : ' · max') + '</div>';
    mid.firstChild.textContent = String(r.name).replace(/[-_]/g, ' ');
    const right = document.createElement('div');
    right.className = 'mmult';
    right.innerHTML = '<b>' + fmtMult(r.mult) + '</b><span>tier ' + r.tier + '</span>';
    row.appendChild(th); row.appendChild(mid); row.appendChild(right);
    list.appendChild(row);
  }
}
function openMuseum(){
  hide('pauseOverlay');
  show('museumOverlay');
  const real = typeof accSnapshot === 'function';
  renderMuseum(real ? accSnapshot() : demoAccSnapshot(), !real);
}
function closeMuseum(){ hide('museumOverlay'); show('pauseOverlay'); }
// the joining with the meta: we connect the hook as soon as it appears in the build
if (typeof onAccTierUp === 'function') onAccTierUp(showTierUp);

// ===== THE MAIN SCREEN / THE PAUSE (Figma mockup 770:1271) =====
// ONE screen, two roles: «Play Game» before a run, «Resume» in the pause. Live
// data: the collection — accSnapshot(), the stars — totalStars(), Sound/Difficult —
// CFG. ⚠️ THE ECONOMIC FORKS are on placeholders (into the report to the owner,
// cross-zone requests to META/INTEGRATION): stars-as-currency + Boost (META),
// Subscribe $1.99 (INTEGRATION), the Music slider and the avatar (there are no assets/feature).
// ⛔ `msSelKey` WAS DELETED 2026-08-21-n together with the click selection: the look of the selected
// card moved onto the CSS hover (the owner's word «right now this is the look of a click, but
// it has to be made a hover, desktop»). The variable lived longer than the menu's opening and
// restored the highlight on a repeated entry — a hover has nothing to restore,
// it follows the cursor. To bring it back = revert this commit.
function fmtStars(n){
  n = n | 0;
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
// THE WALLET IN THE MENU'S HEADER: THE EXACT NUMBER IF IT FITS HORIZONTALLY (the owner's
// spec 2026-07-28: «1466, and not 1.5K, if it fits»). We write the exact one,
// we measure the row — if it has overflowed OR Get More has moved onto another line
// (.ms-collhead has flex-wrap on the desktop), we fall back to the abbreviation.
// ⚠️ The threshold is not in characters: the width depends on the layout (the mobile pill against
// the desktop header) and on the name's length — we measure the FACT, we do not guess.
// The Boost buttons keep the abbreviation (the spec is about the wallet) — they call fmtStars.
function setWalletNumber(el, n){
  if (!el) return;
  const exact = String(n | 0), short = fmtStars(n);
  el.textContent = exact;
  if (exact === short) return;                       // there is nothing to abbreviate
  const row = el.closest('.ms-head'); if (!row) return;
  let fits = row.scrollWidth <= row.clientWidth + 1; // the row has not overflowed
  if (fits){
    const gm = $('msGetMore');
    if (gm){                                          // is Get More on the same line?
      const a = el.getBoundingClientRect(), b = gm.getBoundingClientRect();
      if (Math.abs(a.top - b.top) > Math.max(a.height, b.height) * 0.6) fits = false;
    }
    // ⚠️ AND THE NAME MUST NOT BE TRUNCATED: .ms-uname has overflow:hidden, which is why
    // the flex «squeezed in» a long number at the expense of the name («Guest» → «Gu…»), while the row
    // did NOT overflow and the check above stayed silent. A truncation of the name = the number
    // did not fit horizontally.
    const un = row.querySelector('.ms-uname');
    if (fits && un && un.offsetParent !== null && un.scrollWidth > un.clientWidth + 1) fits = false;
  }
  if (!fits) el.textContent = short;
}
// how many types are opened by the progression: 9 at level 1, +1 per level, the pool's ceiling
// (the types are opened IN THE ORDER of the TYPES array — as in genLevel)
function unlockedTypeCount(){
  const lvl = (typeof levelNum === 'number' ? levelNum : 1);
  return Math.min(TYPES.length, LEVEL_TYPES_MIN + Math.max(0, lvl - 1));
}
// THE BOOST CELEBRATION (the owner's spec): on a successful purchase the card celebrates —
// the bar goes green and tops up to the current fraction, under the portrait particles
// of joy burst (lime+white). It is called AFTER refreshMainScreen (the card has been rebuilt)
// — we look for the fresh one by key. ⚠️ the bar is computed by the EARNED tiers, Boost
// accumulates separately → the top-up is CELEBRATORY (to the current fraction), we do not touch the economy.
function spawnJoyParticles(host){
  if (!host) return;
  const N = 12, col = ['#c0ff47', '#ffffff'];
  for (let i = 0; i < N; i++){
    const s = document.createElement('span');
    s.className = 'joyp';
    const ang = (i / N) * Math.PI * 2;
    const dist = 24 + (i % 3) * 9;
    s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * dist - 12).toFixed(1) + 'px'); // a light lift upwards
    s.style.background = col[i % 2];
    host.appendChild(s);
    setTimeout(()=> s.remove(), 760);
  }
}
function boostCelebrate(key){
  const grid = $('msGrid'); if (!grid) return;
  const card = [...grid.children].find(c => c.dataset && c.dataset.key === key);
  if (!card) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.classList.add('boosted'); // the bar -> green (+ the transition from .boosted)
  const bar = card.querySelector('.msc-prog i');
  if (bar && !reduce){
    const target = bar.style.width || '0%';
    bar.style.transition = 'none'; bar.style.width = '0%'; // the start from zero WITHOUT animation
    void bar.offsetWidth;
    bar.style.transition = '';                              // bring back the CSS transition of .55s
    bar.style.width = target;                               // it animates 0 -> the fraction
    setTimeout(()=>{ if (bar.isConnected) bar.style.transition = ''; }, 620);
  }
  if (!reduce) spawnJoyParticles(card.querySelector('.msc-imgwrap'));
  // we remove the celebration class later (the next refresh will rebuild the card anyway)
  setTimeout(()=>{ if (card.isConnected) card.classList.remove('boosted'); }, 950);
}
// #4 THE TAP SPIN (touch): one tap handler through the GRAPHICS hook thumbSpinToggle
// (the dispatcher's contract v121): a tap on an inactive one starts the spin (the shared canvas itself
// takes the spin off the previous one), a repeated tap on THE SAME one — stop, the size is NOT jerked.
// The hook controls ONLY the spin; the static <img> (the alpha:true canvas covers
// it but it shows through) is hidden/restored by US — like the hover. msTapSpinCard holds
// which card's img is hidden, so that it can be restored when switching to another one.
let msTapSpinCard = null;
function msTapSpinRestore(){ if (msTapSpinCard){ const im = msTapSpinCard.querySelector('img.msc-img'); if (im) im.style.visibility = 'visible'; msTapSpinCard.classList.remove('spinning'); msTapSpinCard = null; } }
function msCardTapSpin(card){
  if (!card || card.classList.contains('lock')) return;
  const wrap = card.querySelector('.msc-imgwrap'); if (!wrap) return;
  const key = card.dataset.key;
  const live = (typeof items !== 'undefined' && items) ? items.find(it => it.alive && it.type && String(it.type.name) === String(key)) : null;
  msTapSpinRestore();                                   // restore the img of the previously tap-spinning one
  let spinning = false;
  try { spinning = thumbSpinToggle(portraitPick(live, key), wrap); } catch(e){ spinning = false; }
  const im = wrap.querySelector('img.msc-img');
  if (im) im.style.visibility = spinning ? 'hidden' : 'visible';
  card.classList.toggle('spinning', spinning); // the touch analogue of :hover for the badge (40%)
  msTapSpinCard = spinning ? card : null;
}
// THE TOP-UP OF PORTRAITS: a pack's atlas is decoded asynchronously, and the cards of types from
// a pack that has not warmed up yet open with a letter. We wait for the decode and replace the letter
// with a picture IN PLACE. The limit is 16×200 ms = 3.2 s — if the pack never arrived
// (a broken atlas), the top-up silently stops and the letter stays an honest fallback.
let msThumbWait = null;
const MS_THUMB_TRIES = 16, MS_THUMB_MS = 200;
function msThumbFill(pending, left){
  msThumbWait = setTimeout(() => {
    msThumbWait = null;
    const rest = [];
    for (const p of pending){
      if (!p.wrap.isConnected) continue;   // the grid was rebuilt — this card is dead
      const url = itemThumb(portraitPick(p.live, p.key, p.locked));
      if (!url){ rest.push(p); continue; }
      const im = document.createElement('img');
      im.className = 'msc-img'; im.src = url;
      const ph = p.wrap.querySelector('.msc-img.letter');
      if (ph) p.wrap.replaceChild(im, ph); else p.wrap.insertBefore(im, p.wrap.firstChild);
    }
    if (rest.length && left > 1) msThumbFill(rest, left - 1);
  }, MS_THUMB_MS);
}
function buildMainCollection(){
  const grid = $('msGrid');
  if (!grid) return;
  if (msTapSpinCard){ thumbSpinStop(); msTapSpinCard = null; } // a reset of the tap spin on a rebuild
  grid.innerHTML = '';
  if (msThumbWait){ clearTimeout(msThumbWait); msThumbWait = null; } // the old top-up to dead cards
  const pending = []; // the cards without a portrait: the pack's atlas is still decoding
  const rows = (typeof accSnapshot === 'function') ? accSnapshot() : [];
  const open = unlockedTypeCount();
  // the portrait spin — ONLY on devices with a real hover (desktop): on
  // touch screens mouseenter fires on a tap and would spin the card for no reason
  // (the GRAPHICS spec «mobile: do not hang a hover, the static portrait is there anyway»)
  const canHover = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  rows.forEach((r, i) => {
    const locked = i >= open;
    const card = document.createElement('div');
    // ⛔ Here `sel` was added to the classes on a match with `msSelKey`. Removed
    //    2026-08-21-n: the highlight is given by `:hover` in the styles, the `sel` class is
    //    no longer in any file.
    card.className = 'msc' + (locked ? ' lock' : '');
    card.dataset.key = r.key;
    // the portrait: a live item of the type -> an offscreen render; otherwise a letter (as in the museum).
    // ⚠️ a portrait exists only for the types that are live in the CURRENT run (there are no meshes outside
    // a level) — outside a run / for the unopened ones there will be a letter. A portrait for ALL
    // types = a helper «assemble a mesh by type» (a cross-zone request to GRAPHICS/META).
    const wrap = document.createElement('div');
    wrap.className = 'msc-imgwrap';
    const live = r._item || (typeof items !== 'undefined' && items &&
      items.find(it => it.alive && it.type && String(it.type.name) === String(r.key)));
    // the portrait: a live item of the type -> its shot; otherwise we build a mesh by key
    // (thumbItemForKey, GRAPHICS). The LOCKED ones — a GHOST (the 2nd arg true:
    // a semi-transparent+colourless silhouette, a «pokedex»; the owner's spec «the models that are not
    // open are transparent, matte, colourless» + «fill the museum with
    // models», it CANCELS the former letter). The OPEN ones — a colour portrait.
    const url = itemThumb(portraitPick(live, r.key, locked));
    if (url){
      const im = document.createElement('img');
      im.className = 'msc-img'; im.src = url; wrap.appendChild(im);
    } else {
      const ph = document.createElement('div');
      ph.className = 'msc-img letter';
      ph.textContent = String(r.name || '?').slice(0, 1).toUpperCase();
      wrap.appendChild(ph);
      // ⚠️ THERE IS NO PORTRAIT YET — we take it for the TOP-UP instead of leaving the letter forever.
      // itemThumb refuses to shoot until the pack's atlas is decoded
      // (see the guard right there); this very call is what started the decode. The letter stays
      // visible for a fraction of a second and is replaced by a picture IN PLACE — without
      // rebuilding the grid, so as not to tear the scroll and the tap spin.
      pending.push({ wrap, key: r.key, locked, live });
    }
    if (!locked){
      const badge = document.createElement('div');
      badge.className = 'msc-badge';
      badge.textContent = fmtMult(r.mult || 1);
      wrap.appendChild(badge);
    }
    card.appendChild(wrap);
    const name = document.createElement('div');
    name.className = 'msc-name'; name.textContent = r.name;
    card.appendChild(name);
    if (locked){
      const lvl = document.createElement('div');
      lvl.className = 'msc-lvl';
      lvl.textContent = 'Level ' + Math.max(1, i - LEVEL_TYPES_MIN + 2);
      card.appendChild(lvl);
      // THE «Open» BUTTON IS HIDDEN (the owner's spec 2026-07-28: «it makes no
      // sense at all for the players right now»). The mechanic of buying a type (purchaseUnlock,
      // act:'open') is ALIVE and untouched — to bring it back = uncomment three lines.
      // POSTPONED (the owner asked to write it down): some day bring back the opening
      // of items FOR STARS — see the INTERFACE block in WORKSTREAMS.
    } else {
      const cnt = document.createElement('div');
      cnt.className = 'msc-cnt';
      cnt.textContent = r.next ? (r.count + '/' + r.next) : (r.count + ' · max');
      card.appendChild(cnt);
      const prog = document.createElement('div');
      prog.className = 'msc-prog';
      const frac = r.next ? Math.min(1, r.count / r.next) : 1;
      prog.innerHTML = '<i style="width:' + (frac * 100).toFixed(0) + '%"></i>';
      card.appendChild(prog);
      // BOOST: the price of the next tier from the snapshot. price === null — THE CAP
      // (we show «Max», and not an empty price); !affordable — we dim the button,
      // so as not to promise a purchase that buyBoost will reject.
      const boost = document.createElement('button');
      boost.className = 'msc-boost'; boost.dataset.act = 'boost';
      if (r.price == null){ boost.textContent = 'Max'; boost.disabled = true; }
      else {
        boost.textContent = 'Boost ' + fmtStars(r.price); // the ★ was removed (the owner's spec #5)
        if (!r.affordable) boost.classList.add('poor');
      }
      card.appendChild(boost);
    }
    // THE HOVER SPIN (desktop): the GRAPHICS canvas self-mounts into .msc-imgwrap
    // (absolute inset:0). ⚠️ the canvas is TRANSPARENT (alpha) — under the rotating
    // silhouette the static <img> of the frame of rest showed through (the owner's complaint
    // «the picture of the model stays behind it»). We HIDE the img for the duration of the spin
    // (visibility, so that the cell's rect does not collapse — the canvas stands on it),
    // we restore it on mouseleave. The spin starts from the static shot's angle (SPIN_YAW0/TILT
    // == the portrait's rotation) — the substitution is seamless. Only on the OPEN ones.
    if (canHover && !locked){
      card.addEventListener('mouseenter', () => {
        const im = wrap.querySelector('img.msc-img'); if (im) im.style.visibility = 'hidden';
        thumbSpinStart(portraitPick(r._item, r.key), wrap);
      });
      card.addEventListener('mouseleave', () => {
        thumbSpinStop();
        const im = wrap.querySelector('img.msc-img'); if (im) im.style.visibility = 'visible';
      });
    }
    grid.appendChild(card);
  });
  if (pending.length) msThumbFill(pending, MS_THUMB_TRIES);
}
// the reflection of the current settings in the screen's controls (the values from CFG)
// --fill (in %) moves the green fill of the WebKit slider (see shell.html);
// Firefox draws it itself through ::-moz-range-progress, but it will not hurt
function msFill(el){ if (el) el.style.setProperty('--fill', el.value + '%'); }
// ===== THE SOUND VOLUME 0..1, stored in mixer_sound =====
// ⚠️⚠️ THE OWNER'S COMPLAINT 2026-07-30: «the Sound slider does not keep its state
// after leaving the pause». THE DIAGNOSIS: the sound's state was the BOOLEAN `CFG.sound`, while
// in the settings block there stands a SLIDER 0..100. `refreshMainSettings` drew it
// as `CFG.sound ? 100 : 0` — any intermediate value (40) on a repeated
// opening of the menu turned into 100. On top of that there was NO persistence AT ALL: the music has
// `mixer_music`, the sound had nothing, which is why silence did not survive
// a reload either (measurement: set 0 → reload → 100 again and the sound on).
// ⚠️ THE CURE IS SYMMETRIC TO THE MUSIC: its own volume 0..1 + localStorage + a single
// point of application. `CFG.sound` REMAINS (`Sound.play` and
// `vibrate` look at it) and is computed as `soundVol > 0` — the old meaning «on/off» is intact,
// and the `#soundToggle` checkbox in the pause's state holder is synchronised right here.
// ⚠️ WE DO NOT TOUCH THE EXTERNAL MUTE (`Sound.setMuted` from 78-ads for the duration of an ad) —
// it has its own flag and it is STRONGER than the slider, as with the music (musicSuspend).
// ⚠️ TWO VARIABLES, NOT ONE: `soundVolPrev` is the LAST NON-ZERO volume.
// Without it the «off → on» toggle brought back 100 instead of the 40 chosen by the player:
// switching off zeroes `soundVol`, and there is nowhere left to take the «last non-zero» from
// (caught by my own measurement AFTER the first version of this fix).
let soundVol = 1, soundVolPrev = 1;
try { const _sv = localStorage.getItem('mixer_sound');
  if (_sv !== null) soundVol = Math.max(0, Math.min(1, (parseInt(_sv, 10) || 0) / 100)); } catch(e){}
if (soundVol > 0) soundVolPrev = soundVol;
function applySoundVol(v01){
  soundVol = Math.max(0, Math.min(1, v01));
  if (soundVol > 0) soundVolPrev = soundVol;
  try { localStorage.setItem('mixer_sound', String(Math.round(soundVol * 100))); } catch(e){}
  CFG.sound = soundVol > 0;
  const cb = $('soundToggle'); if (cb) cb.checked = CFG.sound;   // the pause's state holder
  // ⚠️ THE SLIDER IS HERE TOO: otherwise the pause's toggle changed the volume while the slider
  // went on showing the old number — two elements about one state
  // diverged (measurement: the toggle off → the slider still at 35 while there was silence).
  const snd = $('msSound'); if (snd){ snd.value = Math.round(soundVol * 100); msFill(snd); }
  try { Sound.setVolume(soundVol); } catch(e){}                  // the WebAudio master gain
}
applySoundVol(soundVol);   // the live restoration at startup (like CFG.hard from mixer_hard)
// ===== THE BACKGROUND MUSIC (the owner's spec 2026-07-24): a control + a track =====
// A streaming HTML5 <audio id="bgm"> (the track of ~4.2 MB is loaded LAZILY, not at startup;
// we do NOT touch the WebAudio SFX engine (Sound) — the music is a separate path). The Music
// slider = the volume 0..1, stored in mixer_music. Autoplay is unlocked by the FIRST
// gesture on the page (90-input) — the browser's policy: audio.play() only on a gesture.
// ⛔⛔ THE MUSIC BUS (his word 2026-09-01: «the sounds are barely audible together with the
// music»). The sfx side was raised first and hit its ceiling: the master is peak-limited by
// `mat_plush`, so it can go no higher than 1.065 and is already at 0.95. Measured after that,
// the bed still sat ABOVE everything - music -19.4 dB against matches -21.5 and events -24.1.
// ⚠️⚠️ A BUS FACTOR AND NOT A NEW DEFAULT, AND THE DIFFERENCE MATTERS: `musicVol` is his
// SETTING, restored from `mixer_music`, so lowering the default would fix nothing for anyone who
// has ever touched the slider - including him. The factor sits between the setting and the
// element, so the slider keeps meaning «music volume, 0..100%» while the bed drops for everyone.
// ⚠️ -6 dB puts the music at about -25.4, i.e. under the matches and level with the events -
// a bed under the feedback rather than over it.
const MUSIC_BUS = 0.5;
// one place that turns the setting into what the element gets; every writer goes through it
function musicOut(v){ return Math.max(0, Math.min(1, v)) * MUSIC_BUS; }
let musicVol = 0.7;
try { const _mv = localStorage.getItem('mixer_music');
  if (_mv !== null) musicVol = Math.max(0, Math.min(1, (parseInt(_mv, 10) || 0) / 100)); } catch(e){}
// ⚠️ THE LAST NON-ZERO VOLUME OF THE MUSIC — exactly the same pair as with the sound
// (`soundVolPrev`), and introduced for the same reason: the mobile switcher knows
// only ON/OFF, and switching on is obliged to give the player back HIS volume, and not 100.
// Without this the switcher would quietly erase the choice made with the slider on the desktop.
let musicVolPrev = musicVol > 0 ? musicVol : 0.7;
// ⚠️⚠️ THE VOLUME IS APPLIED TO THE ELEMENT AT ONCE, NOT ON THE FIRST GESTURE (the owner's
// complaint 2026-07-31: «on loading the music is louder, it drops to the settings after
// the bucket animation»). THE MECHANIC, proven by a probe: the volume was set only by the gesture-driven
// unlockBgm, while on the portal the track was started by the UNFREEZE (musicSuspend(false) after
// an ad / the platform's pause) — play() went at the default 1.0, and until the player's first
// gesture the music blared past the settings. The invariant: the volume is set BEFORE any
// possible play, whoever calls it.
{ const _bgm0 = $('bgm'); if (_bgm0) _bgm0.volume = musicOut(musicVol); }
function applyMusic(v01){
  musicVol = Math.max(0, Math.min(1, v01));
  if (musicVol > 0) musicVolPrev = musicVol;
  try { localStorage.setItem('mixer_music', String(Math.round(musicVol * 100))); } catch(e){}
  const bgm = $('bgm'); if (!bgm) return;
  bgm.volume = musicOut(musicVol);
  // ⚠️ The external muffling (an ad / the platform's pause) is STRONGER than the slider: otherwise
  // a player who moved the volume during an ad would have started the track over the ad.
  if (musicVol > 0 && !musicExtMuted){ if (bgm.paused) bgm.play().catch(()=>{}); } // they pull it up — we start it
  else if (!bgm.paused) bgm.pause();                             // down to zero — we mute it
}
// THE EXTERNAL MUFFLING OF THE MUSIC (INTEGRATION's edit 2026-07-29 by the dispatcher's
// authorisation; the analogue of Sound.setMuted for the WebAudio path). It is called from
// applyMute (78-ads) for the duration of an ad and of the platform's pause.
// ⚠️ ITS OWN FLAG, WE DO NOT TOUCH `musicVol`: the volume is the player's choice, it lies in
// localStorage; overwriting it with a temporary muffling is forbidden. That is why we keep the
// reason separately and on the release we restore exactly what the player chose
// (including NOT starting the track if the slider stands at zero).
// ⛔⛔ PRE-WARMING THE BUFFER WAS TRIED AND REMOVED — DO NOT INVENT IT AGAIN.
// The hypothesis was reasonable: the file is external, 4.4 MB, the tag is `preload="none"`, which means
// the download starts only with the first gesture. THE MEASUREMENT DID NOT CONFIRM IT. The delay
// from the gesture to the sound is small even without the warm-up (191 ms on 8 Mbit, 253 on 4, 467 on
// 1.5), and with the warm-up on 1.5 Mbit it came out at 466 against 469 — that is, NOTHING.
// ⚠️ And it cost a defect: `load()` on a PLAYING element cuts the sound off — a player who
// tapped during the intro lost the music a second later (caught by a probe).
// The price without a gain: 4.4 MB of traffic for someone who may not even touch the screen.
// ⚠️ The REAL reason for the owner's complaint was a different one — see `unlockBgm` in
// 90-input: the music waited for the FIRST TOUCH, and a key did not start it at all.
let musicExtMuted = false;
function musicSuspend(on){
  musicExtMuted = !!on;
  const bgm = $('bgm'); if (!bgm) return;
  if (musicExtMuted){ if (!bgm.paused) bgm.pause(); }
  else if (musicVol > 0 && bgm.paused){
    bgm.volume = musicOut(musicVol); // the invariant: the volume BEFORE play (see the musicVol block)
    bgm.play().catch(()=>{});
  }
}
function refreshMainSettings(){
  // ⚠️ FROM `soundVol`, AND NOT FROM `CFG.sound ? 100 : 0` — that very line lost
  // the intermediate position of the slider (the owner's complaint, see applySoundVol).
  const snd = $('msSound'); if (snd){ snd.value = Math.round(soundVol * 100); msFill(snd); }
  const mus = $('msMusic'); if (mus){ mus.value = Math.round(musicVol * 100); msFill(mus); }
  // ⚠️ THE SWITCHERS ARE SYNCHRONISED RIGHT HERE, and not by their own tick: the slider and
  // the switcher have ONE state (the volume), and two points of updating would diverge —
  // the player moved the slider on a tablet, rotated the screen, and the switcher shows the old one.
  const sSw = $('msSoundSw'); if (sSw) sSw.setAttribute('aria-checked', soundVol > 0 ? 'true' : 'false');
  const mSw = $('msMusicSw'); if (mSw) mSw.setAttribute('aria-checked', musicVol > 0 ? 'true' : 'false');
  const seg = $('msDiff');
  if (seg) for (const b of seg.querySelectorAll('button'))
    b.classList.toggle('on', (b.dataset.hard === '1') === !!CFG.hard);
}
// ⛔⛔ THE SCORE CHIP REDDENS AT THE MOMENT OF A MISTAKE (the owner's word 2026-08-25: «if the
// player misses, at that moment the total score must redden — the same colour as the miss»).
// ⚠️ THE COLOUR IS NOT SET FROM HERE. The class is the whole mechanism, the paint lives in
// `#score.miss` (shell.html) beside the base `#score { fill:#ffe730 }`, and the return is a CSS
// transition on `fill` — so there is ONE description of the colour per side and no per-frame JS.
// ⚠️ THE TIMER IS RESTARTED, NOT STACKED: a run of quick misses would otherwise leave several
// timeouts racing, and the FIRST of them would clear the red while the chip was still being
// punished by the later ones. `clearTimeout` on a fresh id is a no-op, so the first call is safe.
// ⚠️ Called from BOTH charge points (`penalize` in 70-fx, `penalizeDouble` in 80-gameplay), each
// time inside their `charged && shown > 0` gate — see the note there for why.
let scoreMissT = 0;
function scoreFlashMiss(){
  const el = $('score'); if (!el) return;
  el.classList.add('miss');
  clearTimeout(scoreMissT);
  scoreMissT = setTimeout(()=>{ el.classList.remove('miss'); }, SCORE_MISS_MS);
}
function refreshMainScreen(){
  // ⚠️ ONE NUMBER EVERYWHERE — liveBalance(), THE SAME call as the game chip's
  // ($('score') in updateHUD). The owner's complaint 2026-07-27: «during the game one
  // number, and on the belly a second one — the player must always and everywhere see his single balance».
  // The reason for the divergence was: the chip showed liveBalance (the banked +
  // the unbanked score of the current level ÷10), while the menu showed starBalance (only
  // the banked one), i.e. opening the menu in the middle of a level «ate» what had been earned
  // during the run. Now both read liveBalance.
  // ⚠️ NOT totalStars: the sum of the levels' ratings lives separately and is not spent —
  // showing it as a currency would be a lie.
  const st = $('msStars');
  const bal = typeof liveBalance === 'function' ? liveBalance()
              : (typeof starBalance === 'function' ? starBalance() : 0);
  setWalletNumber(st, bal);
  // THE MIRROR IN THE FLOATING HEADER — THE SAME WRITER. A separate computation would introduce
  // a second source of one number: they diverge on the very first accrual.
  const st2 = $('msStars2');
  if (st2) setWalletNumber(st2, bal);
  // the button's role: there is no live run — «Play Game» (a start), otherwise «Resume»
  const btn = $('msPlayBtn');
  const role = (!level || level.over) ? 'Play' : 'Resume';   // «just Play» — the owner's word 2026-09-04 (it was «Play Game»)
  if (btn) btn.textContent = role;
  // THE FLOATING BUTTON (node 815:1521) — THE SAME WRITER OF THE ROLE. Giving it
  // its own computation is forbidden: two sources of one caption diverge on
  // the very first transition (the node says «Resume», but without a live run this is «Play
  // Game», and the buttons must not argue with each other).
  const fl = $('msFloatResume');
  if (fl) fl.textContent = role;
  refreshMainSettings();
  buildMainCollection();
}
// ⚠️ THE OWNERSHIP OF THE PAUSE (the 99-main contract, the same pattern as with the ads in
// 78-ads): pauseGame(silent) returns true ONLY if the pause was set by this very
// call. Resuming SOMEBODY ELSE'S pause (an ad one or one from visibilitychange)
// is forbidden — the player would return into a live game that he did not resume. That is why
// the menu (a) sets the pause QUIETLY (silent — its own card instead of pauseOverlay),
// (b) does NOT open over somebody else's pause at all, (c) lifts only its own.
let menuPaused = false;
// THE BUNDLE PRICE TAGS LIVE (Integration's find 2026-08-03: the cards had
// DOLLARS hard-wired, while the player pays in GAM — «an untruth on the screen»). The catalogue
// is asynchronous: until it arrives the hard-wired fallback labels stand, afterwards — the platform's
// price (Ads.priceOf). It is called on every opening of the star shop.
function refreshBundlePrices(){
  try {
    if (!(typeof Ads === 'object' && Ads.priceOf)) return;
    document.querySelectorAll('.st-buy[data-tier]').forEach(btn => {
      const price = Ads.priceOf('bundle' + btn.dataset.tier);
      if (price) btn.textContent = 'Buy ' + price;   // the mock-up's verb (937:1517), 2026-09-03
    });
  } catch(e){}
}
// THE GUEST'S PROFILE: an animal name + an avatar in a pure colour from the name's hash
// (the owner's word 2026-08-04; the 🫐 placeholder goes). HSL: the hue from the hash,
// the saturation fixed — any name gives a readable circle.
function refreshGuestProfile(){
  try {
    const name = (typeof guestName === 'function') ? guestName() : 'Guest';
    const u = document.getElementById('msUser');
    if (u && u.textContent !== name) u.textContent = name;
    const av = document.querySelector('.ms-av');
    if (av && av.dataset.gn !== name){
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      av.dataset.gn = name;
      av.textContent = '';                        // the 🫐 placeholder goes
      // THE OWNER'S AVATARS (the avatars/ folder, his word 2026-08-05: «they must be
      // fitted into the current size of the circle, but all be without a background, hence
      // png»). The file is chosen DETERMINISTICALLY by the name: one guest — one
      // avatar forever, just like his name. The coloured circle stays a BACKING:
      // the pictures are transparent, and without it they would hang in a void.
      // ⚠️ WITHOUT A BACKING (the owner's word 2026-08-05: «under the picture there must
      // be no background at all»). The former coloured fill is cancelled — the owner's
      // avatars carry the shape and the colour themselves, and a circle under them gave a second rim.
      av.style.background = 'transparent';
      // ⚠️ THE AVATAR FROM THE PLAYER'S KEY, and not from the name's hash (the owner's word
      // 2026-08-07 «better to reduce it to one»): the identity is the same on all
      // devices, because the key converges by a merge, and the name is derived from it.
      const idx = (typeof guestAvatar === 'function') ? guestAvatar() : ((h % AVATAR_COUNT) + 1);
      const file = 'avatars/Avatar' + String(idx).padStart(2, '0') + '.png';
      const img = document.createElement('img');
      img.src = file; img.alt = ''; img.decoding = 'async';
      // ⚠️ WITHOUT border-radius ON THE PICTURE (the owner's complaint 2026-08-06 «ragged
      // pixels along the outline»): the avatar is ALREADY round and with a smoothed alpha
      // (a measurement of the source: 48 gradations, 199 semi-transparent pixels along the edge).
      // Our round clipping cut ON TOP OF that edge — the clip's boundary is
      // stepped, and it is visible as a ragged outline. The owner's assets we
      // do not touch: he explicitly forbade «optimising» them.
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
      av.appendChild(img);
    }
  } catch(e){}
}
// ===== THE STARS ON THE PLAY CARD (the owner's word 2026-08-10) =====
// «Add stars here in the night theme, like on the game screen». Back then the card CARRIED
// the sky's gradient (`--sky-grad` in shell.html) and at night looked like a night sky —
// only the stars were missing.
// ⛔ TOMBSTONE 2026-08-20: the card now has `background:transparent` (the owner's
// word «a 100% transparent background»), the sky under the stars is given by THE PAUSE SCREEN ITSELF.
// ⚠️ The layer is unreachable anyway — the theme became daytime only; it is left, as is
// the whole night branch.
// ⚠️⚠️ THE NUMBERS ARE TAKEN FROM THE SAME CONSTANTS AS THE SKY'S SHADER (`STAR_*`,
// 00-config): the size distribution (`STAR_SIZE_MIN`/`STAR_SIZE_BIAS`), both
// speeds and amplitudes of the twinkle and the pulse, the fraction of the pulsing ones. A copy of the numbers
// «by eye» would diverge from the sky at the very first edit of the palette — exactly the
// law on which the project has been burned more than once.
// ⛔ WHY A CANVAS AND NOT A SET OF `radial-gradient`s: in the sky the stars TWINKLE, and
// every tenth one also pulses (the owner's spec) — this cannot be expressed
// with CSS gradients, and a static scattering reads as a texture, not as a sky.
const MS_SKY_PER_KPX = 0.55;   // stars per 1000 px² of the card — the density was matched to the sky
let msSkyRaf = 0, msSkyStars = null, msSkyW = 0, msSkyH = 0;
// a hash from the index — deterministic, as with the sky's cells: one and the same card
// gives one and the same sky, and not a flickering mess on every opening of the menu
function msSkyHash(i, k){ const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }
function msSkyBuild(w, h){
  const n = Math.max(24, Math.round(w * h / 1000 * MS_SKY_PER_KPX));
  const out = [];
  for (let i = 0; i < n; i++){
    const hs = msSkyHash(i, 3);
    out.push({
      x: msSkyHash(i, 1) * w, y: msSkyHash(i, 2) * h,
      // ⚠️ THE SAME SIZE FORMULA AS IN THE SHADER: a bias of the sampling towards the small ones
      // (the owner's spec «more small stars, without changing their number»).
      r: (STAR_SIZE_MIN + (1 - STAR_SIZE_MIN) * Math.pow(hs, STAR_SIZE_BIAS)) * 1.6,
      ph: msSkyHash(i, 4) * Math.PI * 2,
      // ⚠️ THE SELECTION OF THE PULSING ONES IS BY A SEPARATE hash, as with the sky: otherwise the pulse
      // would correlate with the size and «one in ten» would turn
      // into «the largest ones».
      pulse: msSkyHash(i, 5) < STAR_PULSE_FRAC, pph: msSkyHash(i, 6) * Math.PI * 2,
    });
  }
  return out;
}
function msSkyDraw(t){
  const c = $('msNightSky'); if (!c) return;
  const g = c.getContext('2d'); if (!g) return;
  g.clearRect(0, 0, msSkyW, msSkyH);
  for (let i = 0; i < msSkyStars.length; i++){
    const s = msSkyStars[i];
    let a = 1 - STAR_TW_AMP * 0.5 * (1 - Math.cos(t * STAR_TW_SPD + s.ph));
    if (s.pulse) a *= 1 - STAR_PULSE_AMP * 0.5 * (1 - Math.cos(t * STAR_PULSE_SPD + s.pph));
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}
// ⚠️ THE GATE IS DOUBLE: night AND an open menu. In the daytime the layer is not there at all (the sky
// has no stars in the daytime either), and with the menu closed the rAF does not spin — the card lives in
// a subtree that is simply hidden, and without an explicit stop the loop would live through the WHOLE
// gameplay (the same rake we already caught with the collection's tap spin).
function msSkyStart(){
  const c = $('msNightSky'), host = c && c.parentNode; if (!c || !host) return;
  const night = (typeof isNightSky === 'function') ? isNightSky() : false;
  if (!night){ msSkyStop(); c.style.display = 'none'; return; }
  const r = host.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (w !== msSkyW || h !== msSkyH || !msSkyStars){
    msSkyW = w; msSkyH = h;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d'); if (g){ g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    msSkyStars = msSkyBuild(w, h);
  }
  c.style.display = 'block';
  if (msSkyRaf) return;
  const t0 = performance.now();
  const tick = () => {
    msSkyRaf = 0;
    if (!$('mainScreen') || !$('mainScreen').classList.contains('open')){ return; }
    msSkyDraw((performance.now() - t0) / 1000);
    msSkyRaf = requestAnimationFrame(tick);
  };
  msSkyRaf = requestAnimationFrame(tick);
}
// ⚠️ A REBUILD ON A SIZE CHANGE: without it the canvas is stretched by the CSS
// (`width:100%`), and after a rotation of the phone the stars turn into ellipses —
// until the menu is reopened. `msSkyStart` re-measures by itself and decides by itself whether it is needed.
try {
  window.addEventListener('resize', function (){
    if (!$('mainScreen') || !$('mainScreen').classList.contains('open')) return;
    try { msSkyStart(); } catch (e) {}
  });
} catch (e) {}
function msSkyStop(){
  if (msSkyRaf){ cancelAnimationFrame(msSkyRaf); msSkyRaf = 0; }
  const c = $('msNightSky'); if (c) c.style.display = 'none';
}
function openMainScreen(){
  // the menu's telemetry (a hole from Integration's review: #mainScreen is opened
  // by the .open class bypassing show()/SCREEN_OF — the largest screen was not tracked)
  // ⚠️⚠️ AND FOR EXACTLY THE SAME REASON THE TOAST HAS TO BE TORN DOWN HERE BY HAND. What
  // the owner calls «the pause screen» IS this one: `pauseGame` is called with silent=true
  // at every production site, so `#pauseOverlay` is never shown in a live game. A fix that
  // only hooked `show()` would have cured the win screen and left his other complaint
  // standing.
  hideMultToast();
  try { Telemetry.screen.enter('menu'); } catch(e){}
  try { refreshGuestProfile(); } catch(e){}
  if (!menuPaused) menuPaused = pauseGame(true);
  if (!menuPaused && paused) return; // somebody else's pause (an ad / the tab) — we do not meddle
  // ⚠️⚠️ WE BANK THE RUN'S SCORE BEFORE THE DISPLAY — THE OWNER'S COMPLAINT «different values»
  // (9445 in the header, 9 367 in the leaderboard row). The measurement explained the difference exactly:
  // the header reads liveBalance (the bank + the UNbanked score of the current level), while
  // on the server there lies only the BANKED one — and 78 is exactly the run's score ÷10.
  // The canon of 2026-07-24: «the balance is shown EVERYWHERE — the chip, the wallet, the leaderboard»,
  // that is, two numbers have no right to argue.
  // ⛔ The reverse path (showing starBalance in the menu) is FORBIDDEN by the owner's earlier word
  // 2026-07-27: «during the game one number, and on the belly a second one» — that has
  // already been fixed, and it must not be repeated. Which means we reconcile UPWARDS: we bank.
  // ⚠️ There is no path of our own — we call the same bankLive that the purchase uses
  // («banking on demand»): it moves the level.banked watermark, so that
  // a win does not bank this a second time, while a score that later falls is corrected
  // through ss in bankLevelScore. Without any earnings it returns 0 and sends no events —
  // reopening the menu does not touch the network.
  // ⚠️ AFTER the guard of somebody else's pause and BEFORE refreshMainScreen: otherwise the header would manage
  // to draw the number before the banking, and the leaderboard row — after it.
  try { if (typeof bankLive === 'function') bankLive(); } catch(e){}
  refreshMainScreen();
  // ⚠️ AFTER the guard of somebody else's pause: if the opening is refused, neither the canvas nor the loop
  // must be started. We take the size deferred — a card that has only just been shown
  // still has a zero rect (the same nature as with the spin in the collection).
  setTimeout(()=>{ try { msSkyStart(); } catch(e){} }, 0);
  // ⚠️ AFTER THE GUARD OF SOMEBODY ELSE'S PAUSE: if the opening is refused there must be no network
  // trip. The call itself waits for nothing — the numbers arrive asynchronously from the `__lb`
  // cache, and until they arrive the block stands with the former (or empty) values.
  try { lbEntryRefresh(); } catch(e){}
  const ms = $('mainScreen');
  // «Whether it was open» is taken BEFORE add('open') — a check after it is always
  // false, and the reset turned into dead code (caught by the reopening guard).
  const wasOpen = ms.classList.contains('open');
  ms.classList.add('open');
  // THE SCREEN'S EDGE IN THE MENU'S TONE (the owner's complaint «in the pause menu the game's
  // background leaks through at the top»). `#mainScreen` itself stands at inset:0 and covers
  // the whole viewport — the «game's background» leaked through the CHROME STRIP, which Safari paints
  // by the background-color of html/body (there the sky's colour comes from tintChrome). The rule is
  // `html.menuopen` in shell.html; it is set AFTER the guard of somebody else's pause, otherwise
  // if the opening were refused the edge would be repainted for an invisible menu.
  document.documentElement.classList.add('menuopen');
  // ⛔⛔ THE REPAINTING OF THE EDGE FOR THE MENU WAS REMOVED (the owner's decision 2026-08-12): the strips
  // take THE DEVICE'S THEME, while the view is separated from them by a 40px rounding. Here stood
  // `chromeMeta(menuChrome())` — the second channel of the edge, introduced 2026-08-10,
  // when the strip's colour was still being matched to the screen.
  // ⚠️ THE `menuopen` CLASS IS STILL SET — other rules hang on it;
  // only the painting was removed.
  // THE SCROLL RESET — ONLY ON AN ACTUAL OPENING. The container remembers
  // scrollTop between openings, and without the reset the menu would open straight away with
  // the floating header and the button on top of the visible Play card.
  // ⚠️ BUT NOT UNCONDITIONALLY: `openMainScreen` is also called on visibilitychange
  // (90-input) — when the tab goes into the background WITH THE MENU ALREADY OPEN. An unconditional
  // reset threw the player out of the middle of the collection right to the top (measurement: 3000 →
  // 0). We remove the classes EXPLICITLY: scrollTop=0 does not produce a scroll event.
  if (!wasOpen){
    ms.scrollTop = 0;
    ms.classList.remove('playoff');
    const sk = $('msSticky'); if (sk) sk.classList.remove('on');
  }
  menuEyesStart(); // #8b: bring the menu's eyes to life (the cursor / the looking around)
}
// THE SINGLE WRITE POINT OF THE EDGE'S SECOND CHANNEL (the `theme-color` meta). A separate
// function, and not a line in two places: a copy of a flag next to a working quantity
// diverges from it at the very first edit (the canon's law, four cases in a week).
// ⚠️ IN THE MENU BOTH CHANNELS CARRY THE MENU'S BACKGROUND (the owner's word 2026-08-10, the cancellation
// of the neutral). The menu scrolls, but its PAGE background is constant — the cards
// float ON TOP of it, which is why hitting the tone is possible here.
// ⚠️ It is read from `--ms-bg` and not as a literal: the menu's background is declared once, and
// a copy next to it would diverge at the very first edit of the menu's palette.
// ⚠️ The previous state of the theme — for repainting the edge ONLY on the transition.
// ⚠️ THE DECLARATION NEARLY PERISHED: it stood right against the removed neutral
// block, and the edit «cut out the block» carried it along — the suite caught it
// with a page error. When you cut a range — check what is at its edges.
let hudWasNight = null;
// ⛔ menuChrome/chromeMeta were cut out by the cleanup of 2026-08-12: the 4th edition of the edges
// (black always, statically) left them without a single reader. My own
// «menuChrome is alive — a guard reads it» turned out to be untrue by the census.
function closeMainScreen(){
  // #4: the tap spin drives an offscreen-WebGL rAF; without a mouseleave it would live through the WHOLE
  // gameplay (the card goes into a display:none subtree, the parentNode guard in
  // spinTick does not fire — it is still in the DOM). We kill it explicitly + restore the img.
  if (msTapSpinCard){ thumbSpinStop(); msTapSpinRestore(); }
  try { msSkyStop(); } catch(e){}
  $('mainScreen').classList.remove('open');
  document.documentElement.classList.remove('menuopen');
  // The floating header is a SEPARATE fixed node OUTSIDE #mainScreen (z-index 31):
  // closing the screen does not hide it. Without an explicit dismissal it survived the closing
  // and hung over the game (the owner's screenshot 2026-07-31: he scrolled the menu, pressed
  // the floating Resume — the «My collection» plate got through onto the game screen).
  const sk = $('msSticky'); if (sk) sk.classList.remove('on');
  if (menuPaused){ menuPaused = false; resumeGame(); }
}
// #8b THE LIVE EYES OF THE MENU (the owner's spec): on the desktop the pupils FOLLOW the cursor;
// on touch — a looped soft «looking around» (there is no cursor). The pupil does not go outside the white.
// It is active ONLY while the menu is open (perf). NOT to be confused with the game's #face.
let _menuEyesInit = false, _menuEyesRun = false;
function menuEyesStart(){
  const eyes = document.querySelector('.ms-eyes');
  const pL = $('msPupL'), pR = $('msPupR');
  if (!eyes || !pL || !pR) return;
  const CX_L = 60, CX_R = 180, CY = 60, MAXOFF = 29; // a pupil of r29 in a white of r60 → a travel of 29
  const menuOpen = () => { const m = $('mainScreen'); return !!(m && m.classList.contains('open')); };
  const center = () => { pL.setAttribute('cx', CX_L); pR.setAttribute('cx', CX_R); pL.setAttribute('cy', CY); pR.setAttribute('cy', CY); };
  const clamp = (dx, dy) => { const d = Math.hypot(dx, dy); return d > MAXOFF ? [dx / d * MAXOFF, dy / d * MAXOFF] : [dx, dy]; };
  const offset = (ox, oy) => { pL.setAttribute('cx', (CX_L + ox).toFixed(1)); pR.setAttribute('cx', (CX_R + ox).toFixed(1)); pL.setAttribute('cy', (CY + oy).toFixed(1)); pR.setAttribute('cy', (CY + oy).toFixed(1)); };
  const look = (tx, ty) => { // desktop: both pupils converge on the cursor
    const [lx, ly] = clamp(tx - CX_L, ty - CY); pL.setAttribute('cx', (CX_L + lx).toFixed(1)); pL.setAttribute('cy', (CY + ly).toFixed(1));
    const [rx, ry] = clamp(tx - CX_R, ty - CY); pR.setAttribute('cx', (CX_R + rx).toFixed(1)); pR.setAttribute('cy', (CY + ry).toFixed(1));
  };
  const canHover = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!_menuEyesInit){
    _menuEyesInit = true;
    if (canHover) addEventListener('pointermove', (e) => {
      if (!menuOpen()) return;
      const r = eyes.getBoundingClientRect(); if (!r.width) return;
      look((e.clientX - r.left) / r.width * 240, (e.clientY - r.top) / r.height * 120);
    }, { passive: true });
  }
  if (canHover || reduce) return;            // the desktop moves them on pointermove; reduce — static pupils
  if (_menuEyesRun) return; _menuEyesRun = true;   // touch: a looped soft «looking around»
  requestAnimationFrame(function loop(ts){
    if (!menuOpen()){ _menuEyesRun = false; center(); return; }
    const t = ts / 1000, [ox, oy] = clamp(Math.cos(t * 0.8) * 26, Math.sin(t * 1.25) * 17);
    offset(ox, oy);
    requestAnimationFrame(loop);
  });
}
// a live update of the header/prices on a spend or an accrual of stars (META's subscription)
if (typeof onStarsChange === 'function') onStarsChange(()=>{
  if ($('mainScreen').classList.contains('open')) refreshMainScreen();
  // ⚠️⚠️ THE ENTRY POINT IS RECOMPUTED RIGHT HERE (the owner's complaint 2026-08-17-d
  // «there is still the same delay when spending points»). Previously it was updated only on
  // the OPENING of the menu and on `onSent` — but the player spends STANDING IN THE MENU, and until the server's
  // answer (a send rate of 20 s) the old rank hung next to a fresh
  // pill. Exactly the same gap that was closed for the leaderboard screen on 2026-08-13 — for
  // the neighbouring block it stayed unclosed.
  // ⚠️ It does not cost the network: `me()`/`top()` in `__lb` are cached, and the rank is computed by
  // `lbRankNow` from the neighbours already received. We touch only an open menu.
  if ($('mainScreen').classList.contains('open')){
    try { lbEntryRefresh(); } catch (e) {}
  }
  // an INSTANT recount of an open leaderboard (the owner's complaint 2026-08-13):
  // the render goes from the __lb caches + the live score, it does not touch the network; the server will then
  // catch up through onSent and redraw once more — this time with the exact rank
  try {
    const o = $('lbOverlay');
    if (o && getComputedStyle(o).display !== 'none') lbScreenRender();
  } catch (e) {}
});
// debug/preview: open the screen from the console
window.showMainScreen = openMainScreen;
window.hideMainScreen = closeMainScreen;


// ===== THE LEVEL'S SHOWCASE — Figma mockup 768:1061 =====
// THE TOP 5 BY PROGRESS (the owner's spec 2026-07-24): there are EXACTLY 5 visible rows, but
// ALL the level's types are ranked by vitFrac — a hidden type that has collected more
// DISPLACES the top one (it enters the five, the one dropping out goes off screen). It cancels
// «the whole mix» (2026-07-23) and the auto-rotation «collected→gone» (v77): the mechanism is the RANK.
// Manual scrolling is impossible (pointer-events:none). Realtime: a recount of vitFrac for
// ALL the types once every 150 ms (a number, cheap — not the DOM).
// ⚠️ THE NUMBER OF SLOTS IS CONSTANT (VIT_MAX=3, and at level 1 there are exactly 3 types) → the height of #vGrid is constant →
// the rect of #vitrine is bit-for-bit: the toast's anchor reads it
// (85-hud). A type change in a slot is a departure/arrival INSIDE the slot (.out/.in are not on the layout's
// CHILDREN — they are on the cell itself, but the number of cells does not change), NOT an add/remove.
// VIT_MAX 5 → 3 (the owner's spec 2026-07-28 «let us have three rows here after all,
// and they change on collecting just the same»): a cap on the rows, the rotation is NOT touched —
// a collected type departs, and the next one from the ranked queue takes its place.
// As a side effect the open question «at high levels the panel goes above the viewport» is closed.
const VIT_TICK_MS = 150, VIT_MAX = 3;
let vitLevelRef = null, vitAt = 0, vitSlots = null, vitAll = null;
function vitrineOn(){
  // THE 2/3 RULE (the owner's spec 2026-07-27): the panel is on the desktop AND on tablets,
  // it hides only when it would take up >1/3 of the width (the threshold 813 = 3×271px of the strip,
  // the same @media in shell.html). pointer:fine was removed — tablets see the panel.
  return window.matchMedia && matchMedia('(min-width:813px)').matches;
}
function vitFillCell(cell, entry){
  cell.dataset.key = entry.k;
  const th = cell.querySelector('.vthumb');
  th.innerHTML = '';
  const url = itemThumb(entry.it);
  if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
  else th.textContent = entry.k.slice(0, 1).toUpperCase();
  cell.querySelector('.vname').textContent =
    (typeof accLabel === 'function' ? accLabel(entry.k) : entry.k);
  cell._acc = { last: -1 };
  vitUpdateCell(cell);
}
// the progress of a type's bar (0..1) towards the next tier; at the cap = 1. This is the KEY
// of the showcase's sorting (the owner's spec «descending, the first one has the greater
// progress; a row changes if a bar overtakes the first one»).
// ⚠️⚠️ THE BAR IS COMPUTED BY THE EARNED TIER — BOTH ENDS OF THE SEGMENT.
// THE LIVE COMPLAINT THAT UNCOVERED THIS (the owner 2026-08-11): «there were matches,
// but the bars did not grow» — on the win screen the watermelon stood at 100%, the orange at 0.
// ⛔ THE REASON: the start of the segment was taken from `accTier` (the earned PLUS the purchased
// boost), and the end from `accNext`, which counts by `accCountTier` (only
// the earned). For anyone who had bought a boost, `prev` went ABOVE `next`, the denominator
// became negative, and the fraction was clamped to 0 or 1 — the bar stuck dead
// and stopped reacting to matches.
// An example with numbers: earned 150 (tier 1), bought 2 → accTier 3 →
// prev = 700, next = 300 → (150−700)/(300−700) = 1.375 → a full bar.
// ⚠️ AND A SECOND COPY IN THAT SAME LINE: the threshold was computed by a formula by hand
// (`100·(2^t−1)`), although `accThreshold` lives right next door. Now both sides take
// ONE function — that very law about a copy next to a working quantity.
// ⚠️ The bar shows WHAT WAS HONESTLY EARNED, and that is deliberate: the purchased
// tiers are already reflected by the multiplier on the right, whereas the progress is about matches.
function vitFrac(k){
  const n = accCount(k), next = accNext(k);
  const prev = accThreshold(accCountTier(k));
  return next ? Math.max(0, Math.min(1, (n - prev) / (next - prev))) : 1;
}
function vitUpdateCell(cell){
  const k = cell.dataset.key, n = accCount(k);
  if (n === cell._acc.last) return;
  // a growth of the counter = I MATCHED this type (the first set with last=-1 does not count)
  const grew = cell._acc.last >= 0 && n > cell._acc.last;
  cell._acc.last = n;
  cell.querySelector('.vbar i').style.width = (vitFrac(k) * 100).toFixed(1) + '%';
  cell.querySelector('.vmult').textContent = fmtMult(accMult(k));
  if (grew) vitPulse(cell); // an unobtrusive reaction to my match
}
// a short bounce of the portrait + a flash of the bar; the restart is through a reflow, so that
// frequent matches in a row restart the animation instead of swallowing it.
// ⚠️ WE CLEAR THE PREVIOUS TIMER: without this, on two matches of one type within
// <460 ms (a chain / the ∞ endgame) the old timer tore .hit off in the middle of a new
// animation — a jump of the scale (found by an adversarial review 2026-07-23)
function vitPulse(cell){
  if (cell._hitT) clearTimeout(cell._hitT);
  cell.classList.remove('hit'); void cell.offsetWidth;
  cell.classList.add('hit');
  cell._hitT = setTimeout(()=>{ cell.classList.remove('hit'); cell._hitT = 0; }, 460);
}
// vitAll — ALL the types of the level's mix (it is not consumed: we rank among all of them, but
// we show only the top 5). We build EXACTLY 5 slots and fill them with the top 5 by progress.
function buildVitrine(){
  vitLevelRef = level;
  const grid = $('vGrid'); grid.innerHTML = '';
  $('vitrine').classList.remove('vempty');
  const seen = new Set(); vitAll = [];
  for (const it of items){
    if (it.surprise || it.bomb || !it.type) continue;
    const k = String(it.type.name);
    if (!seen.has(k)){ seen.add(k); vitAll.push({ k, it }); }
  }
  vitSlots = [];
  const ranked = vitRankedAll();
  const count = Math.min(VIT_MAX, ranked.length); // EXACTLY 3 (there are always ≥9 types)
  // we cap the cascade's step so that the unfolding does not drag on (~0.45 s)
  const step = Math.min(0.07, 0.45 / Math.max(1, count));
  for (let i = 0; i < count; i++){
    const cell = document.createElement('div');
    cell.className = 'vcell';
    cell.innerHTML = '<div class="vthumb"></div><div class="vbody">' +
      '<div class="vname"></div><div class="vbar"><i></i></div></div>' +
      '<div class="vmult"></div>';
    vitFillCell(cell, ranked[i]);
    // THE UNFOLDING CASCADE: the rows appear from the bottom in turn (i·step); we remove
    // .rin on completion, so that a residual animation-delay does not hold up
    // future .hit/.in on this same cell
    cell.style.animationDelay = (i * step) + 's';
    cell.classList.add('rin');
    setTimeout(()=>{ cell.classList.remove('rin'); cell.style.animationDelay = ''; }, 520 + i * step * 1000);
    grid.appendChild(cell);
    vitSlots.push(cell);
  }
}
// THE RANKING OF ALL the level's types by progress in descending order (the tie-break is the accumulation)
function vitRankedAll(){
  return vitAll.slice().sort((a, b) =>
    vitFrac(b.k) - vitFrac(a.k) || accCount(b.k) - accCount(a.k));
}
// THE RECONCILIATION OF THE TOP 5: we keep EXACTLY 5 slots = the top 5 by rank. A slot whose type
// has stopped occupying its top-5 position (displaced by a hidden overtaker / a re-sort)
// goes UP and fades out (.out, 0.28 s), then is refilled with the current type of that
// position and appears FROM BELOW (.in) — ONLY the vertical + a fade, without any sideways
// movement (the owner's spec 2026-07-24). A slot where the type has not changed gets the ordinary
// vitUpdateCell (the bar + the .hit pulse on a match). The number of cells does NOT change
// → the height of #vGrid and the rect of #vitrine are constant. reduce-motion: an instant replacement.
function vitReconcile(){
  if (!vitSlots || !vitAll) return;
  const top5 = vitRankedAll().slice(0, VIT_MAX); // the name is historical: now it is the top 3
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let i = 0; i < vitSlots.length; i++){
    const cell = vitSlots[i], want = top5[i];
    if (!want) continue;
    if (cell.dataset.key === want.k){ vitUpdateCell(cell); continue; }
    if (cell.classList.contains('out')) continue; // it is already animating — we do not touch it
    if (reduce){ vitFillCell(cell, want); continue; }
    cell.classList.add('out');
    setTimeout(()=>{
      // the top could have shifted over 0.28 s — we take the CURRENT type for this position
      const w = vitRankedAll()[i];
      cell.classList.remove('out');
      if (w){ vitFillCell(cell, w); void cell.offsetWidth; cell.classList.add('in');
        setTimeout(()=>cell.classList.remove('in'), 360); }
    }, 280);
  }
}
function tickVitrine(now){
  // ⚠️⚠️ THE GATE DOES NOT MERELY «NOT BUILD», IT REMOVES WHAT HAS ALREADY BEEN BUILT. The former edition
  // returned on the first line — and the panel assembled while the gate was open
  // stayed hanging in all its glory: three rows, opacity 1 (the owner's measurement by
  // eye, my probe confirmed it bit-for-bit). The classic gate mistake: it
  // closes the FUTURE action, while the state has already been created.
  // ⚠️ WE KILL IT WITH THE EXISTING SIGNAL `vempty` (the opacity), and not with a new rule:
  // `#vitrine` has FOUR independent visibility signals, spread over DIFFERENT
  // properties (opacity / display in the media query / clip-path in the unfolding), and
  // a fifth one on the same property would argue with them by the order in the file — the fade would die
  // silently. An empty panel really is empty: we remove the rows.
  // ⚠️ We reset `vitLevelRef`, otherwise a return to an ordinary level would not rebuild
  // the panel — the tick builds only on a level CHANGE.
  if (!vitrineOn()){
    // ⚠️⚠️ THE KILLING IS UNCONDITIONAL, AND THIS IS THE SECOND ATTEMPT. The first one killed the panel
    // ONLY if it had been built (`if (vitSlots || vitLevelRef)`) — but when
    // the gate is closed FROM THE SESSION'S FIRST FRAME, nobody built it, and so nobody killed it either:
    // on the desktop an empty card of 24×24 with the background
    // `rgba(255,255,255,.16)` remained. The measurement caught this on the LIVE link, already after
    // the upload.
    // ⚠️ The same class as the gate itself had: the condition closed the PATH and did not
    // assert the STATE. The state «there is no panel» is obliged to hold under
    // ANY way of ending up behind a closed gate, including a cold start.
    const g = $('vGrid'); if (g && g.firstChild) g.innerHTML = '';
    const v = $('vitrine'); if (v) v.classList.add('vempty');
    if (vitSlots || vitLevelRef){ vitSlots = null; vitAll = null; vitLevelRef = null; }
    return;
  }
  // we build AFTER the intro: in the first frames the models' palette atlases are still
  // decoding (the 36-models rake) — the portraits came out black and
  // settled into the preview cache forever
  if (level && level !== vitLevelRef && !intro) buildVitrine();
  if (!vitSlots || now - vitAt < VIT_TICK_MS) return;
  vitAt = now;
  // vitReconcile itself calls vitUpdateCell for the unchanged slots (the bars/the pulse)
  if (!intro && level && !level.over) vitReconcile();
}

// ═══ THE NEW-ITEM SCREEN (the owner's mockups 2026-08-10: 846:4814 mob. / 846:4763
// desk.). The owner's word: «it goes seamlessly right after the level completion screen».
//
// ⚠️⚠️ WHAT COUNTS AS A «NEW ITEM» IS DERIVED FROM THE PROGRESSION AND NOT INVENTED.
// The types are opened IN THE ORDER of the array: 9 of them at the first level and EXACTLY ONE
// new one for each subsequent one (`LEVEL_TYPES_MIN + (level − 1)`, the single rule of
// genLevel and `isTypeUnlocked`). Which means the screen has a natural and
// deterministic occasion: to show that single item which will open at
// the level the player has just moved on to.
// ⛔ FOR THAT VERY REASON IT IS NOT THERE BEFORE THE FIRST LEVEL (there a whole nine open at once —
// a single «new item» does not stand out) AND WHEN THE POOL IS EXHAUSTED (from level 112 no new types
// appear any more). Both branches are obliged to hand control on, otherwise
// the «Next» button will silently stop starting a level — the same rake as with
// the story announcement.
function newObjDue(){
  const lv = (typeof levelNum === 'number') ? levelNum : 0;   // the level that is about to begin
  if (lv < 2) return null;
  const idx = LEVEL_TYPES_MIN + lv - 2;
  if (idx < 0 || idx >= TYPES.length) return null;
  return TYPES[idx].name;
}
let newObjDone = null;
// ⚠️ We keep the key of the shown item separately — by it `newObjInfo` gives the guard
// the EXPECTED tone. Otherwise the test would compare the computed gradient with a literal, and that
// would diverge from the palette at the very first edit of a type's colour (the law «a copy next to
// a working quantity always diverges»).
let newObjLastKey = null;
// The display. `done` is called on a press of the button — exactly once.
// ⚠️ THE MODEL IS LIVE: the shared spin canvas `thumbSpinStart`, the same one that spins
// the collection's cards. A backing picture must NOT be put here (the owner's word
// «a model that spins» — about pure 3D without a backing).
function newObjShow(key, done){
  const box = $('newObj'), host = $('newObjModel');
  if (!box || !host || !key){ if (done) done(); return; }
  const item = (typeof thumbItemForKey === 'function') ? thumbItemForKey(key) : null;
  // ⚠️ NO MODEL — NO SCREEN. An empty scene with the caption «new object» and a hole
  // in the middle is worse than the absence of the screen: the player will decide the item was not given.
  if (!item){ if (done) done(); return; }
  newObjDone = done || null;
  newObjLastKey = key;
  // ⛔ WE NO LONGER SHOW THE ITEM'S NAME (the owner's word 2026-08-11: «remove
  // the object's name for all objects»). The node was removed from the markup entirely, and not
  // hidden by a style: a hidden node with text stays in the accessibility tree and
  // is read by the screen reader — the screen would announce a name that is not on it.
  // ⚠️⚠️ THE GLOW'S COLOUR IS THE ITEM'S MAIN COLOUR (the owner's word 2026-08-10). We take
  // `type.color`: it is that same authored tone in which THIS type's crumbs scatter
  // (`fxColor` is the same one, only converted to linear), that is, for the player the colour
  // is already tied to the item, and not assigned to the screen anew.
  // ⛔ NOT `baseColor` and not the portrait's pixels: for all 120 models the colour is carried by
  // the ATLAS, while `material.color` is white — the glow would come out white for the whole pool
  // (the same rake because of which the veil of the unavailable ones had to be moved into the shader).
  const tone = item.type && item.type.color;
  // ⚠️⚠️ FOR DARK ITEMS THE BASE OF THE GLOW IS WHITE (the owner's word 2026-08-11
  // «for black items use white as the base of the glow»).
  // ⛔ THE REASON IS NOT TASTE BUT THE PHYSICS OF THE SCREEN: the popup's backing is almost black
  // (rgba(10,14,22,.88)), and light in the colour of the item itself is simply invisible for the penguin (#3a4048),
  // the pirate cannonball and the cannon — it is as if there were no glow.
  // ⚠️ A THRESHOLD BY LIGHTNESS, AND NOT A LIST OF NAMES: a new dark model will appear — it will be
  // picked up by itself. A list would diverge from the pool at the very first run.
  // ⚠️ The lightness is Rec.709 over the RAW sRGB channels: what we need is not colorimetry but
  // «is this tone distinguishable on black», and for a threshold that is enough.
  // ⚠️⚠️ THE FLAG «BLACK» IS DARK **AND** DESATURATED, AND NOT MERELY DARK.
  // Lightness alone is not enough: the beetroot (#a03a6b) and the aubergine (#7a4a9e) are also dark, but
  // SATURATED — their light reads as colour and there is nothing to whiten. What look black in the pool
  // are the greys: the penguin, the pirate cannonball and the cannon.
  // ⚠️ THE NUMBERS WERE DERIVED BY A MEASUREMENT OVER THE WHOLE POOL and not picked: at L<0.40 and
  // S<0.14 EXACTLY these three out of 120 fall in; the nearest one that does not is the fish (L 0.410),
  // the nearest by saturation is the same one (S 0.118). The corridor is empty on both sides.
  // ⚠️⚠️ THE OWNER'S CLARIFICATION 2026-08-11: «black OR DARK — CLOSE TO
  // THE BACKGROUND COLOUR». That is, the flag is not «little light in general» but «indistinguishable
  // from the backing» — and that is exactly what the player sees. We compute the DISTANCE to
  // the popup's background; everything closer than the threshold glows white.
  // ⚠️ WE TAKE THE BACKGROUND FROM THE LIVE STYLE, AND NOT AS A LITERAL: the backing is set on `.overlay`
  // by one rule for all the popups, and a copy of the number here would diverge at the very first
  // edit of it — the law on which the project has been burned more than once.
  const bg = (function (){
    try {
      const m = String(getComputedStyle(box).backgroundColor).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : [10, 14, 22];
    } catch (e) { return [10, 14, 22]; }
  })();
  // ⚠️ THE THRESHOLD OF 140 WAS DERIVED BY A MEASUREMENT OVER THE POOL AND STANDS IN AN EMPTY CORRIDOR: the distances
  // to the background are — the penguin 85.5, the cannonball 119.6, the sphere 124.2, while the boar that follows them
  // is already at 161.8. Between 124 and 162 there is nobody, and that is where the threshold was put.
  // ⚠️ The saturation NO LONGER takes part: the beetroot and the aubergine are far from the background by
  // themselves (they are dark but colourful), the distance alone cuts them off — the owner's flag
  // «close to the background colour» turned out to be both more exact and simpler than the former one.
  const NEAR_BG = 140;
  let rgb = '203,255,104';
  if (typeof tone === 'number'){
    const r = (tone >> 16) & 255, g = (tone >> 8) & 255, b = tone & 255;
    const d = Math.sqrt((r - bg[0]) * (r - bg[0]) + (g - bg[1]) * (g - bg[1]) +
                        (b - bg[2]) * (b - bg[2]));
    // ⚠️ Not a pure white, but the tone PULLED towards white: the item stays «its own»,
    // its light simply becomes visible. A pure white would erase the difference between
    // the three dark items.
    rgb = (d < NEAR_BG)
      ? Math.round(r + (255 - r) * 0.82) + ',' + Math.round(g + (255 - g) * 0.82) + ',' +
        Math.round(b + (255 - b) * 0.82)
      : r + ',' + g + ',' + b;
  }
  box.style.setProperty('--no-glow-rgb', rgb);
  host.innerHTML = '';
  box.setAttribute('aria-hidden', 'false');
  box.classList.add('on');
  // ⚠️ WE START THE SPIN AFTER THE DISPLAY: `frameCylinder` inside the start computes the frame from
  // the node's dimensions, and for a hidden block they are zero (the same nature as with
  // «the guard measured the height on a closed menu» — a hidden node has no geometry).
  // QUALITY (the owner's word): the buffer = the node's size × DPR, a cap of 768 — above that
  // it is already indistinguishable on phone diagonals, while the buffer is quadratic in cost.
  // ⚠️ THE CAP WAS RAISED 768 -> 1280: on a phone the node is ~250px and the cap was not touched at all,
  // whereas on the desktop the model is now up to 40% of the width (the owner's word 2026-08-17), and
  // at DPR 2 the old cap would give a twofold upscale — exactly the mush because of which
  // the buffer was once raised from 256. The cost is quadratic, but the screen is one-off.
  const px = Math.min(1280, Math.max(SPIN_PX,
    Math.round((host.clientWidth || 256) * (window.devicePixelRatio || 1))));
  try { thumbSpinStart(item, host, px); } catch (e) {}
  // ⚠️ THE BIGGEST REWARD SCREEN IN THE GAME AND IT HAD NO SOUND AT ALL - the sound inventory
  // put it first on the list of what to ask him for. Fired AFTER the screen is up so the sting
  // lands with the model rising, not against an empty card.
  try { Sound.play('newobj'); } catch (e) {}
  newObjDragWire(host);
  Telemetry.ev('newobj', { k: key });
}
// ROTATION WITH A FINGER/CURSOR (the owner's word 2026-08-13). The drag mutes
// the auto-rotation and leads the angle by hand; on release the auto continues from that
// place. The handlers are hung ONCE (a guard flag): host is a permanent node.
let newObjDragOn = false;
function newObjDragWire(host){
  if (newObjDragOn) return; newObjDragOn = true;
  let dragging = false, x0 = 0;
  let y0 = 0;
  host.addEventListener('pointerdown', (e) => {
    dragging = true; x0 = e.clientX; y0 = e.clientY; thumbSpinAuto(false);
    try { host.setPointerCapture(e.pointerId); } catch(err){}
    e.preventDefault();
  });
  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // both axes: the horizontal turns, the vertical tilts («on all the axes»)
    thumbSpinNudge((e.clientX - x0) * 0.012, (e.clientY - y0) * 0.012);
    x0 = e.clientX; y0 = e.clientY;
  });
  const onRelease = () => { dragging = false; thumbSpinAuto(true); };
  host.addEventListener('pointerup', onRelease);
  host.addEventListener('pointercancel', onRelease);
}
function newObjHide(){
  const box = $('newObj');
  if (box){ box.classList.remove('on'); box.setAttribute('aria-hidden', 'true'); }
  try { thumbSpinStop(); } catch (e) {}
  const d = newObjDone; newObjDone = null;
  if (d) d();
}
// The entry point for the win chain: it decides for itself whether there is an occasion, and it ALWAYS hands
// control on.
function newObjOnWin(done){
  const key = newObjDue();
  if (!key){ if (done) done(); return; }
  newObjShow(key, done);
}
