// ===== 79-telemetry: beacon scaffold + crash catching + screens/drop-offs =====
// Endpoint is empty — sending is DISABLED (no-op). Enabling it takes one line:
// the URL of the owner's worker (Cloudflare, like platform-landings) — events
// will go out in batches via sendBeacon. Event schema: {t, s: session, n: name, ...fields}.
// The set of metrics and which decision each one settles — docs/METRICS.md.
const Telemetry = (function(){
  let URL = ''; // for example 'https://mixer-telemetry.<account>.workers.dev/e'
  let buf = [];
  const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();
  // ⚠️ THE BUFFER ACCUMULATES EVEN WITH AN EMPTY URL. Previously ev() bailed out at
  // once, and until the endpoint was switched on the telemetry could neither be
  // debugged nor checked by a test — "does it work" would have been found out on
  // production already. Now the events live in a ring (RING cap), there is still no
  // sending: __game.telemetry() shows them, the suite's asserts check against it.
  const RING = 200;
  const sentAlready = new WeakSet();   // records that have already gone out one by one
  // ⚠️ THE THIRD PARAMETER `now` means "this record will be sent one by one, do not
  // put it in the batch". Marking it MUST happen BEFORE `buf.push`: one line below
  // there is an AUTO-FLUSH every 12 events, and it can carry the record away in a
  // batch RIGHT HERE — earlier than `sendNow` manages to mark it. That is exactly how
  // the crash duplicate survived the first version of the fix (caught by a guard: two
  // copies instead of one).
  function ev(name, data, now){
    const e = Object.assign({ t: Date.now(), s: sid, n: name }, data || {});
    if (now) sentAlready.add(e);
    buf.push(e);
    if (buf.length > RING) buf.splice(0, buf.length - RING);
    if (URL && buf.length >= 12) flush();
    return e;
  }
  function flush(){
    if (!URL || !buf.length) return;
    const batch = buf.filter((e) => !sentAlready.has(e)); // crashes have already gone out one by one
    buf = [];
    if (!batch.length) return;
    try { navigator.sendBeacon(URL, JSON.stringify(batch)); } catch(e){}
  }
  // ⚠️ A CRASH IS SENT IMMEDIATELY, not with the batch: the next line of code may kill
  // the page, and everything accumulated goes nowhere along with the cause.
  // ⚠️⚠️ AND EXACTLY FOR THAT REASON IT WENT OUT TWICE (dispatcher review): `err()`
  // puts the record into the buffer via `ev()`, and then that same record goes out via
  // `sendNow` — with a live URL the receiver got EVERY crash twice (at once and then
  // with the batch). Fixing it by "not putting it in the buffer" is not allowed: the
  // buffer is also the debug ring, `__game.telemetry()` looks at it and the suite
  // asserts on it. So what has been sent is marked and EXCLUDED FROM THE BATCH, while
  // staying in the ring.
  // ⚠️ The marking happens BEFORE the URL check — otherwise with an empty URL (the
  // suite, development) the semantics would differ from the production ones.
  function sendNow(e){
    sentAlready.add(e);
    if (!URL) return;
    try { navigator.sendBeacon(URL, JSON.stringify([e])); } catch(_){}
  }

  // ===== CRASHES (docs/METRICS.md §6) =====
  // Three sources: synchronous errors, rejected promises and WEBGL CONTEXT LOSS (in 3D
  // on mobile this is the most frequent "crash": the game does not fall over, but the
  // screen goes black — without its own event it would look like an ordinary player exit).
  const seen = new Set();      // dedup by signature: the same one — once per session
  let errCount = 0;            // ceiling: an error loop must not flood the receiver
  const ERR_CAP = 5;
  function ctx(){
    // where exactly it fell over — without this the stack gives little
    let lv = null, scr = null, build = null;
    try { lv = typeof levelNum !== 'undefined' ? levelNum : null; } catch(_){}
    try { scr = Screen.current(); } catch(_){}
    try { const b = document.getElementById('buildVer'); build = b && b.textContent.trim(); } catch(_){}
    return { lv: lv, v: scr, b: build };
  }
  function err(kind, msg, file, stack){
    if (errCount >= ERR_CAP) return null;
    const sig = kind + '|' + (msg || '').slice(0, 120) + '|' + (file || '');
    if (seen.has(sig)) return null;
    seen.add(sig); errCount++;
    const e = Object.assign(ev('err', {
      k: kind,
      m: String(msg || '').slice(0, 200),
      f: String(file || '').slice(0, 120),
      st: String(stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
    }, true), {});
    Object.assign(e, ctx());
    sendNow(e);
    return e;
  }
  addEventListener('error', (e) => {
    err('js', e.message, (e.filename || '') + ':' + (e.lineno || 0), e.error && e.error.stack);
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    err('promise', r && (r.message || r), '', r && r.stack);
  });

  // ===== SCREENS AND DROP-OFFS (docs/METRICS.md §3 and §5) =====
  // We measure the time on LEAVING the screen — only then is the duration known.
  const Screen = (function(){
    let cur = null, since = 0;
    function enter(name){
      if (cur === name) return;
      leave();
      cur = name; since = Date.now();
    }
    function leave(){
      if (!cur) return;
      const ms = Date.now() - since;
      // "blink" screens (< 150 ms) are not written down: those are transitions, not views
      if (ms >= 150) ev('screen', { v: cur, ms: ms, lv: ctx().lv });
      cur = null;
    }
    return { enter, leave, current: () => cur };
  })();

  // ===== TAP MAP (docs/METRICS.md §4) =====
  // A 3×3 sector, and NOT coordinates: a precise heat-map requires normalisation for
  // hundreds of resolutions and stores an order of magnitude more data, while the
  // decisions ("the finger covers the bottom-centre") are already read off the sectors.
  function tap(x, y, result){
    const col = x < innerWidth / 3 ? 'l' : x < innerWidth * 2 / 3 ? 'c' : 'r';
    const row = y < innerHeight / 3 ? 't' : y < innerHeight * 2 / 3 ? 'm' : 'b';
    ev('tap', { z: row + col, r: result, lv: ctx().lv });
  }

  // leaving the tab = a drop-off: we record WHERE and IN WHAT STATE it was abandoned
  // ⚠️ SCREEN TRACKING DIED AFTER THE FIRST TAB EXIT (dispatcher review): on `hidden`
  // `Screen.leave()` was called (it nulls the current screen), and there was no handler
  // for the RETURN at all — `current()` stayed null forever. The consequences are
  // quieter than they seem: not only the `screen` events went missing, but also the `v`
  // field in the crash context and in `quit`. We remember the screen that was left and
  // return into it when the tab is visible again.
  let screenBeforeHide = null;
  addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden'){
      if (screenBeforeHide){ Screen.enter(screenBeforeHide); screenBeforeHide = null; }
      return;
    }
    screenBeforeHide = Screen.current();
    let st = 'playing';
    try {
      if (typeof level !== 'undefined' && level){
        if (level.over) st = 'after_win';
        else if (level.deadlock) st = 'stuck';
      }
      const scr = Screen.current();
      if (scr === 'more_stars') st = 'on_offer';
      else if (scr === 'ad') st = 'on_ad';
    } catch(_){}
    ev('quit', { v: Screen.current(), st: st, ms: Date.now() - t0, lv: ctx().lv });
    Screen.leave();
    flush();
  });

  return { ev, flush, err, tap, screen: Screen, buffer: () => buf.slice(), sid,
    // ⚠️ A TEST HANDLE (DEV only). Without it the crash duplicate is IMPOSSIBLE TO
    // OBSERVE: with an empty URL sendBeacon is not called at all, and the guard would
    // be measuring emptiness — exactly the class of bug we have already been burned by.
    setUrl(u){ if (typeof DEV !== 'undefined' && DEV) URL = u || ''; } };
})();

// Exposed ONLY in development — modelled on window.__ads (78-ads): the production
// build has no hook. Needed by the telemetry guards: err/flush/setUrl/screen live
// inside the IIFE, while __game gives out only the buffer and the current screen
// (reading, not control).
if (typeof window !== 'undefined' && typeof DEV !== 'undefined' && DEV) window.__tel = Telemetry;
