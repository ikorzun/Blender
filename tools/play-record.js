#!/usr/bin/env node
// THE RECORDING BOT (2026-09-24, the owner's word: «write a bot that plays the game and records
// minute-long videos in 9:16 and 16:9»). It plays the real build like a player — taps the biggest
// group, digs out the treasure, the rival and the ice, sets off the bomb, shakes when stuck, turns the
// bowl now and then, walks through the win screen and the new-object screen into the next level — and
// writes one MP4 per format with the game's own sound: its sound effects and its music.
//
// Run (from the repo):   npm run record                      — both formats, 60 s, 60 fps, level 12
//                        npm run record -- --format=9x16 --level=20 --seed=7 --seconds=30
// Flags: --format=both|9x16|16x9  --seconds=60  --fps=60|30  --level=12  --seed=N (a take is reproduced
//        by its seed)  --hard (the grey veil on the covered items)  --no-sfx  --no-music
//        --no-rival  --no-bomb  --out=renders  --takes=N (N takes with seeds seed, seed+1, …)
//        --loudness=-14 (LUFS of the final mix; «game» keeps the game's own level)  --keep-parts (debug)
//        --no-end-zoom (by default the bot presses «+» once when the pile has thinned to 30%)
//        --zoom=N (presses of the «+» button at the start of every level, 0 by default = the game's own framing;
//        one step fills a 16:9 frame with the pile, at the price the game itself sets: the bowl glass dissolves
//        up close and the top of the pile reaches the eyes)
// The videos land in renders/ (gitignored). ⚠️ Nothing is uploaded anywhere: the page is served from
// this folder on 127.0.0.1 and every request to an outside host is aborted.
//
// ⚠️⚠️ WHY THE GAME RUNS ON A VIRTUAL CLOCK AND NOT IN REAL TIME. Measured on this Mac (headless
// Chromium on the GPU, CDP screencast, level 12): the gaps between delivered frames were p95 30.5 ms at
// 1080×1920 and 33.7 ms at 1920×1080, the worst 75 ms — against 16.7 for 60 fps, i.e. a dropped frame
// every few frames: visible judder, and worse on a loaded machine. So the page's clock is replaced before
// its first script runs: performance.now, Date.now, requestAnimationFrame, setTimeout and setInterval all
// read a VIRTUAL time that moves only when the recorder says so, exactly 1/60 s per game tick. Every
// frame of the video is therefore one game frame at a perfect cadence, whatever the machine is doing — a
// slow frame only makes the render slower, never the video. Measured: ~65 ms of real time per video
// frame (a device-pixel screenshot is ~33 ms of it), i.e. ~4 minutes to render a 60-s take at 60 fps.
// ⚠️ CSS animations (the score pops, the toast, the win-screen cascade, the eyes' lids) run on the
// browser's own timeline, which a JS clock cannot reach: each one is PAUSED on first sight and seeked
// to (virtual now − its birth) every frame, and FINISHED past its end so `animationend` still fires.
// ⚠️ The pause-free boot: until the level is ready the virtual clock FOLLOWS real time (pumped by the
// native rAF), then it freezes and the recorder steps it. The level is regenerated after the freeze,
// so every video starts on the real intro — the empty bowl and the pour.
//
// ⚠️⚠️ THE SOUND IS RENDERED OFFLINE, NOT RECORDED. On the virtual clock a live AudioContext would play
// against real time and drift apart from the picture. Instead window.AudioContext is replaced with an
// OfflineAudioContext whose currentTime reads the virtual clock: the game builds its whole sound graph
// on it exactly as it does in play (75-audio is untouched), every source is scheduled at the virtual
// moment it was asked for (start()/stop() without a time are pinned to «now» — in an offline context
// «now» would otherwise be 0 for all of them), and after the take the context renders the lot in one
// pass. The music is the game's own track mixed at the game's own level (the slider's 0.7 × the music
// bus 0.5 = 0.35, 85-hud); the sound effects keep their master (0.95, 75-audio).
// ✅ SYNC, MEASURED: every merge sound's onset lands 50-65 ms after the tap that caused it — exactly the
// silent lead-in of the samples themselves (35-55 ms to −40 dB, measured on the mp3s in Audio/3-objects),
// i.e. what a player hears too; no drift across a take.
// ⚠️ A LIMIT OF THE SHIM, NAMED: an AudioParam's `.value = x` on an offline context lands at time 0 of the
// render, not at the virtual now. Every envelope of 75-audio uses setValueAtTime/ramps at t0 and every
// `.value` there is set on a node created for that one sound, so today nothing is affected; a future sound
// that re-sets `.value` on a LONG-LIVED node mid-take would be rendered as if set at the start.
//
// ⚠️ THE INPUT IS SYNTHETIC POINTER EVENTS dispatched at the canvas at an exact virtual moment. They
// reach the game: its handlers are plain pointerdown/pointerup listeners with no isTrusted check
// (90-input) — the canon's «a MouseEvent('click') from evaluate is not heard» is about a CLICK event,
// which the canvas does not listen to. Every tap first asks elementFromPoint whether the canvas is on
// top there — a human could not tap through the Shake button or the showcase panel either.
// ⚠️ Taps come from the game's own test hooks (DEV only, hence ?dev=1): bestTapTarget (the group and a
// pixel where the item is the FIRST hit of the camera ray), pixelOf, the rival/treasure/ice/bomb hooks.
// ?dev=1 draws nothing on the game screen (the only DEV-only element is a link inside the pause menu).
//
// ⚠️ THE SIZES: 9:16 is 405×720 CSS at DPR 8/3 (1080×1920 — a 402-wide iPhone's proportions); 16:9 is
// 1280×720 at DPR 1.5 (1920×1080 — a laptop window). The game caps its canvas at DPR 2 (10-stage), so
// on 9:16 the 3D is drawn at 810×1440 and scaled up, while the HUD is drawn at full resolution — still
// sharper than a real iPhone, where the touch cap is 1.5. At 720 CSS tall the desktop layout uses the
// short-window eyes (the phone's 120 px — shell.html, 2026-09-07-e); that is the game's own state.
// ⚠️ NOT while `node test.js` runs — a second browser job slows the suite into false reds.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const REPO = path.join(__dirname, '..');
const { chromium } = require(path.join(REPO, 'node_modules', 'playwright'));

// ---------------------------------------------------------------- the command line
function parseArgs(argv){
  const o = {};
  for (const a of argv){
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/i.exec(a);
    if (!m) { console.error('Unknown argument: ' + a); process.exit(2); }
    o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}
const A = parseArgs(process.argv.slice(2));
if (A.help || A.h){
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const FORMATS = {
  '9x16': { w: 405, h: 720, dpr: 1080 / 405, outW: 1080, outH: 1920 },
  '16x9': { w: 1280, h: 720, dpr: 1.5, outW: 1920, outH: 1080 },
};
const fmtArg = String(A.format || 'both').replace(':', 'x');
const formats = fmtArg === 'both' ? ['9x16', '16x9'] : [fmtArg];
for (const f of formats) if (!FORMATS[f]) { console.error('--format must be 9x16, 16x9 or both'); process.exit(2); }
const SECONDS = Math.max(3, +(A.seconds || 60));
const FPS = +(A.fps || 60);
if (FPS !== 60 && FPS !== 30) { console.error('--fps must be 60 or 30'); process.exit(2); }
const LEVEL = Math.max(1, (+(A.level || 12)) | 0);
const TAKES = Math.max(1, (+(A.takes || 1)) | 0);
const SEED0 = A.seed !== undefined ? (+A.seed) >>> 0 : (Date.now() % 100000);
const OUT = path.resolve(REPO, A.out || 'renders');
const SFX = !A['no-sfx'], MUSIC = !A['no-music'];
const JPEG_Q = 92;
const TICK_MS = 1000 / 60;
const MUSIC_LEVEL = 0.7 * 0.5;   // 85-hud: musicVol default 0.7 × MUSIC_BUS 0.5 — the element's volume in play
const MUSIC_FILE = path.join(REPO, 'music.mp3');
// ⚠️ THE GAME'S OWN MIX IS ~−24 LUFS (measured on the first takes): right for a game played with the device's
// volume up, 10 dB under every other clip of a social feed (−14 is where Shorts/Reels/TikTok/YouTube sit). The
// balance between the music and the effects stays the game's; only the whole mix is lifted, and a limiter
// holds the effects' transients under −1 dBFS. «--loudness=game» keeps the game's own level.
const LOUDNESS = String(A.loudness === undefined ? '-14' : A.loudness);
const KEEP = !!A['keep-parts'];

// ---------------------------------------------------------------- the static stand
function serve(){
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(String(req.url).split('?')[0]).replace(/^\/+/, '') || 'index.html';
    if (/(^|[\\/])\.\./.test(rel)) { res.writeHead(403); res.end(); return; }
    fs.readFile(path.join(REPO, rel), (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---------------------------------------------------------------- the page runtime (an init script)
// Runs before the game's first script, in the page's own world. Everything it needs comes in `cfg`.
function pageRuntime(cfg){
  if (window.top !== window.self || window.__rec) return;
  // --- a seeded Math.random: a take is reproduced by its seed (mulberry32, the suite's bench generator)
  let seedState = cfg.seed >>> 0;
  Math.random = function(){
    seedState = (seedState + 0x6D2B79F5) >>> 0;
    let t = seedState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // --- the player's settings, before the game reads them (the cold-start path of 2026-08-13)
  try {
    localStorage.setItem('mixer_level', String(cfg.level));
    localStorage.setItem('mixer_hard', cfg.hard ? '1' : '0');
  } catch (e) {}

  // --- THE VIRTUAL CLOCK
  const N = {
    now: performance.now.bind(performance), raf: window.requestAnimationFrame.bind(window),
    st: window.setTimeout.bind(window),
  };
  const T0 = N.now(), D0 = Date.now();
  let manual = false, vt = 0, vtBase = 0, tickN = 0;
  const cur = () => manual ? vt : (N.now() - T0);
  performance.now = cur;
  Date.now = () => D0 + cur();
  let tseq = 0; const timers = new Map();
  window.setTimeout = function(fn, ms){
    const args = Array.prototype.slice.call(arguments, 2), id = ++tseq;
    timers.set(id, { at: cur() + Math.max(0, +ms || 0), fn, args, every: 0, seq: id });
    return id;
  };
  window.setInterval = function(fn, ms){
    const args = Array.prototype.slice.call(arguments, 2), id = ++tseq, every = Math.max(4, +ms || 0);
    timers.set(id, { at: cur() + every, fn, args, every, seq: id });
    return id;
  };
  window.clearTimeout = window.clearInterval = function(id){ timers.delete(id); };
  let rseq = 0, rq = new Map();
  window.requestAnimationFrame = function(cb){ const id = ++rseq; rq.set(id, cb); return id; };
  window.cancelAnimationFrame = function(id){ rq.delete(id); };
  function runTimers(until){
    for (let guard = 0; guard < 200000; guard++){
      let best = null, bid = 0;
      for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq))) { best = t; bid = id; }
      if (!best) return;
      if (manual && best.at > vt) vt = best.at;         // a callback reads the time it was due at
      if (best.every) { best.at += best.every; best.seq = ++tseq; } else timers.delete(bid);
      try { if (typeof best.fn === 'function') best.fn.apply(window, best.args); } catch (e) { console.error(e); }
    }
  }
  function runRaf(ts){
    const q = rq; rq = new Map();
    for (const cb of q.values()) { try { cb(ts); } catch (e) { console.error(e); } }
  }
  // follow mode: the clock is real time, pumped by the native frame and a short native timer
  (function pumpFrame(){ if (manual) return; runTimers(cur()); runRaf(cur()); N.raf(pumpFrame); })();
  (function pumpTimers(){ if (manual) return; runTimers(cur()); N.st(pumpTimers, 4); })();

  // --- THE SOUND: an OfflineAudioContext on the virtual clock
  const SR = 48000;
  let actx = null, ctxT0 = 0, pcm = null;
  if (cfg.sfx && window.OfflineAudioContext){
    class VCtx extends OfflineAudioContext {
      constructor(){ super(2, Math.ceil(SR * cfg.audioSeconds), SR); actx = this; ctxT0 = cur(); }
      get currentTime(){ return Math.max(0, (cur() - ctxT0) / 1000); }
      get state(){ return 'running'; }
      resume(){ return Promise.resolve(); }
      suspend(){ return Promise.resolve(); }
      close(){ return Promise.resolve(); }
    }
    window.AudioContext = VCtx; window.webkitAudioContext = VCtx;
    // a source started or stopped without a time means «now» — in an offline context that is 0 for all
    const pin = (P, name) => {
      if (!P || !Object.prototype.hasOwnProperty.call(P, name)) return;
      const f = P[name];
      P[name] = function(when){
        const rest = Array.prototype.slice.call(arguments, 1);
        if (actx && this.context === actx && !(when > 0)) when = actx.currentTime;
        return f.apply(this, [when].concat(rest));
      };
    };
    pin(window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype, 'start');
    pin(window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype, 'stop');
    pin(window.AudioBufferSourceNode && AudioBufferSourceNode.prototype, 'start');
  }
  function b64(u8){
    let s = ''; const K = 0x8000;
    for (let i = 0; i < u8.length; i += K) s += String.fromCharCode.apply(null, u8.subarray(i, i + K));
    return btoa(s);
  }

  // --- CSS ANIMATIONS on the virtual clock: paused on first sight, seeked every frame, finished past the end
  const seen = new WeakMap();
  function seekAnims(){
    let list; try { list = document.getAnimations(); } catch (e) { return 0; }
    const now = cur();
    for (const a of list){
      let st = seen.get(a);
      if (!st){
        let ct = 0; try { ct = +a.currentTime || 0; } catch (e) {}
        st = { born: now - ct, done: false };
        seen.set(a, st);
        try { a.pause(); } catch (e) {}
      }
      if (st.done) continue;
      const t = now - st.born;
      let end = Infinity;
      try { end = a.effect ? a.effect.getComputedTiming().endTime : Infinity; } catch (e) {}
      if (isFinite(end) && t >= end){
        st.done = true;
        try { a.finish(); } catch (e) { try { a.currentTime = end; } catch (e2) {} }
        continue;
      }
      try { a.currentTime = t; } catch (e) {}
    }
    return list.length;
  }

  // --- THE BOT
  const B = cfg.bot;
  const $ = id => document.getElementById(id);
  const rnd = (a, b) => a + (b - a) * Math.random();
  const bot = { on: false, pending: [], nextAt: 0, nextOrbitAt: 0, levelStartAt: -1, screenSince: 0,
    bombTried: false, lastShake: -1e9, lastOrbit: -1e9, stuck: 0, startAlive: 0, endZoomDone: false,
    errors: 0, lastErr: '', lastLevel: 0,
    stats: { taps: 0, specials: 0, shakes: 0, orbits: 0, charges: 0, nexts: 0, levels: [] }, tapLog: [] };
  function firePtr(el, type, x, y){
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, screenX: x, screenY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }
  function onCanvas(x, y){
    if (!(x >= 1 && y >= 1 && x < innerWidth - 1 && y < innerHeight - 1)) return false;
    const el = document.elementFromPoint(x, y);
    return !!el && el.id === 'c';
  }
  function queueTap(x, y, at){
    const c = $('c');
    bot.pending.push({ at, fn: () => firePtr(c, 'pointerdown', x, y) });
    bot.pending.push({ at: at + 3 * (1000 / 60), fn: () => { firePtr(c, 'pointerup', x, y); if (bot.tapLog.length < 2000) bot.tapLog.push(cur()); } });
  }
  function queueOrbit(at){
    const W = innerWidth, H = innerHeight;
    const x0 = W * rnd(0.32, 0.68), y0 = H * rnd(0.42, 0.58);
    if (!onCanvas(x0, y0)) return false;
    const ang = rnd(B.orbitMin, B.orbitMax) * (Math.random() < 0.5 ? -1 : 1);
    const dx = ang / 0.006, dy = rnd(-25, 25);          // 90-input: camAz = az0 − dx·0.006, camPhi = phi0 − dy·0.004
    const dur = rnd(1100, 1700), steps = Math.max(2, Math.round(dur / (1000 / 60)));
    const c = $('c');
    bot.pending.push({ at, fn: () => firePtr(c, 'pointerdown', x0, y0) });
    for (let k = 1; k <= steps; k++){
      const t = k / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      bot.pending.push({ at: at + dur * t, fn: () => firePtr(c, 'pointermove', x0 + dx * e, y0 + dy * e) });
    }
    bot.pending.push({ at: at + dur + 17, fn: () => firePtr(c, 'pointerup', x0 + dx, y0 + dy) });
    return true;
  }
  function pickSpecial(g, vt){
    const acc = new Set(g.accessibleList());
    const list = [];
    const fi = g.surpriseIndex(); if (fi >= 0 && acc.has(fi)) list.push(fi);
    const rv = g.rivalInfo ? g.rivalInfo() : null; if (rv && rv.index >= 0 && acc.has(rv.index)) list.push(rv.index);
    for (const f of (g.frozenInfo() || [])) if (f.ready && acc.has(f.index)) list.push(f.index);
    const bi = g.bombIndex();
    if (B.bomb && !bot.bombTried && vt - bot.levelStartAt > B.bombAfter && bi >= 0 && acc.has(bi)) list.push(bi);
    for (const i of list){
      const p = g.pixelOf(i);
      if (p && p.px != null && onCanvas(p.px, p.py)) { if (i === bi) bot.bombTried = true; return p; }
    }
    return null;
  }
  function pairsExist(g){
    const m = g.aliveByType();
    for (const k in m) if (m[k] >= 2) return true;
    return false;
  }
  function decide(g, vt){
    const win = $('winOverlay'), nob = $('newObj');
    if (win && win.style.display === 'flex'){
      if (!bot.screenSince) bot.screenSince = vt;
      if (vt - bot.screenSince >= B.winHold){ const b = $('againBtn'); if (b) b.click(); bot.stats.nexts++; bot.screenSince = 0; bot.nextAt = vt + 300; }
      return;
    }
    if (nob && nob.classList.contains('on')){
      if (!bot.screenSince) bot.screenSince = vt;
      if (vt - bot.screenSince >= B.newObjHold){ const b = $('newObjBtn'); if (b) b.click(); bot.screenSince = 0; bot.nextAt = vt + 300; }
      return;
    }
    bot.screenSince = 0;
    if (g.introPhase() != null) { bot.levelStartAt = -1; return; }
    if (g.pausedNow()) return;
    const lv = g.level(); if (!lv || lv.over) return;
    if (bot.levelStartAt < 0){
      bot.levelStartAt = vt; bot.bombTried = false; bot.stuck = 0; bot.endZoomDone = false;
      bot.startAlive = g.alive();
      const n = g.levelNum(); if (n !== bot.lastLevel) { bot.lastLevel = n; bot.stats.levels.push(n); }
      bot.nextOrbitAt = vt + rnd(B.orbitFirstMin, B.orbitFirstMax);
      bot.nextAt = vt + rnd(250, 450);
      // the zoom waits out the camera's own run-in after the fly-around (420 ms, 90-input): a press during it
      // would be read as the player's gesture and cancel it half-way
      for (let z = 0; z < B.zoom; z++) bot.pending.push({ at: vt + 650 + z * 450, fn: () => { const zb = $('zoomInBtn'); if (zb) zb.click(); } });
      return;
    }
    if (vt >= bot.nextOrbitAt){
      if (queueOrbit(vt)) { bot.stats.orbits++; bot.lastOrbit = vt; }
      bot.nextOrbitAt = vt + rnd(B.orbitEveryMin, B.orbitEveryMax);
      bot.nextAt = vt + 250;
      return;
    }
    // the endgame close-up: with the pile thinned out a player leans in, and the game is built for it (the
    // bowl glass dissolves as the camera comes close — the owner's own spec, so the last items are not behind it)
    if (B.endZoom && !bot.endZoomDone && g.alive() <= Math.max(24, 0.3 * bot.startAlive)){
      bot.endZoomDone = true;
      const zb = $('zoomInBtn'); if (zb) zb.click();
      bot.nextAt = vt + 500;
      return;
    }
    const ch = g.charge();
    if (ch && ch.name && ch.leftMs > 400){
      const b = $('chargeBtn');
      if (b && getComputedStyle(b).display !== 'none'){
        const r = b.getBoundingClientRect();
        firePtr(b, 'pointerdown', r.left + r.width / 2, r.top + r.height / 2);
        firePtr(b, 'pointerup', r.left + r.width / 2, r.top + r.height / 2);
        bot.stats.charges++; bot.nextAt = vt + rnd(900, 1300);
        return;
      }
    }
    let t = g.bestTapTarget(Math.random() < B.anyP ? 'any' : undefined);     // refreshes accessibility first
    // ⚠️ THE HOOK ALWAYS OFFERS THE SAME BIGGEST GROUP, and its pixel can lie under a panel or a button (on the
    // desktop layout the showcase panel and the zoom pair sit exactly where a thinned pile lies): asked again in
    // the same order it would offer it for ever and the bot would stand still. A few random orders find another.
    if (t && t.px != null && !onCanvas(t.px, t.py))
      for (let k = 0; k < 5; k++){ const u = g.bestTapTarget('any'); if (u && u.px != null && onCanvas(u.px, u.py)) { t = u; break; } }
    // the treasure, the rival and a ready ice block wait a moment, so the video shows them before they burst
    const sp = vt - bot.levelStartAt > B.specialAfter ? pickSpecial(g, vt) : null;
    if (sp){ queueTap(sp.px, sp.py, vt); bot.stats.specials++; bot.stuck = 0; bot.nextAt = vt + rnd(700, 1000); return; }
    if (t && t.px != null && onCanvas(t.px, t.py)){
      queueTap(t.px, t.py, vt); bot.stats.taps++; bot.stuck = 0;
      bot.nextAt = vt + (Math.random() < B.pauseP ? rnd(B.pauseMin, B.pauseMax) : rnd(B.tapMin, B.tapMax));
      return;
    }
    bot.stuck++;
    // pairs that exist but cannot be tapped from this angle: a player turns the bowl to find them
    if (t && bot.stuck >= 2 && vt - bot.lastOrbit > 1500 && queueOrbit(vt)){
      bot.stats.orbits++; bot.lastOrbit = vt;
      bot.nextOrbitAt = vt + rnd(B.orbitEveryMin, B.orbitEveryMax);
      bot.nextAt = vt + 250;
      return;
    }
    // no reachable group at all: a free shake while pairs still exist (never an ad or a bought one)
    if (lv.shakes > 0 && pairsExist(g) && vt - bot.lastShake > 2500){
      const b = $('shakeBtn'); if (b) b.click();
      bot.lastShake = vt; bot.stats.shakes++; bot.nextAt = vt + rnd(1400, 1900);
      return;
    }
    bot.nextAt = vt + 300;
  }
  function botTick(){
    const g = window.__game;
    if (!bot.on || !g) return;
    const vtNow = cur();
    while (bot.pending.length && bot.pending[0].at <= vtNow){
      const a = bot.pending.shift();
      try { a.fn(); } catch (e) { bot.errors++; bot.lastErr = String(e); }
    }
    if (bot.pending.length || vtNow < bot.nextAt) return;
    try { decide(g, vtNow); } catch (e) { bot.errors++; bot.lastErr = String(e && e.stack || e).slice(0, 300); }
  }

  // --- THE RECORDER'S HANDLE
  window.__rec = {
    now: cur,
    booted(){ const g = window.__game; return !!(window.__booted && g && g.alive() > 0); },
    unlock(){ document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return !!actx; },
    sfxCount(){ const g = window.__game; try { return g.sfx().length; } catch (e) { return -1; } },
    // freeze the clock, deal the level afresh on the reseeded generator, and hand it to the bot
    setup(o){
      if (!manual){ vt = N.now() - T0; vtBase = vt; tickN = 0; manual = true; }
      const g = window.__game;
      try { if (o.rival && g.rivalSetNext){ g.rivalSetNext(o.rival.av, o.rival.name); g.rivalNextAt(g.levelNum()); } } catch (e) {}
      try { if (o.bomb && g.bombNextAt) g.bombNextAt(g.levelNum()); } catch (e) {}
      seedState = o.seed >>> 0;
      g.regen();
      bot.on = true;
      return { level: g.levelNum(), vt: cur() };
    },
    async frame(ticks){
      for (let i = 0; i < ticks; i++){
        botTick();
        tickN++;
        const target = vtBase + tickN * (1000 / 60);
        runTimers(target);
        vt = target;
        runRaf(vt);
        await null; await null;                          // let the promises the tick queued settle
      }
      seekAnims();
      await new Promise(r => N.raf(() => N.raf(r)));     // two real frames: the compositor has the new picture
      const g = window.__game, lv = g && g.level();
      return { t: cur(), level: g ? g.levelNum() : 0, phase: g ? g.introPhase() : null, over: !!(lv && lv.over),
        alive: g ? g.alive() : 0, stats: bot.stats, errors: bot.errors, lastErr: bot.lastErr };
    },
    audioInfo(){ return actx ? { t0: ctxT0, sr: SR, length: actx.length } : null; },
    tapLog(){ return bot.tapLog.slice(); },
    async renderAudio(){
      if (!actx) return null;
      const buf = await actx.startRendering();
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const n = buf.length; pcm = new Int16Array(n * 2);
      let peak = 0, sum = 0;
      for (let i = 0; i < n; i++){
        const l = L[i], r = R[i];
        const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
        if (al > peak) peak = al; if (ar > peak) peak = ar;
        sum += l * l + r * r;
        pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
        pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
      }
      return { frames: n, peak: +peak.toFixed(4), rms: +Math.sqrt(sum / (2 * n)).toFixed(5), bytes: pcm.byteLength };
    },
    audioChunk(i, size){ return b64(new Uint8Array(pcm.buffer, i * size, Math.min(size, pcm.byteLength - i * size))); },
  };
}

// ---------------------------------------------------------------- the node side
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fnSrc, arg, ms, what){
  const t0 = Date.now();
  for (;;){
    let ok = false;
    try { ok = await page.evaluate(fnSrc, arg); } catch (e) {}
    if (ok) return ok;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
    await sleep(100);
  }
}
function run(cmd, args, opts){
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', code => code === 0 ? res({ out, err }) : rej(new Error(cmd + ' exited ' + code + '\n' + err.slice(-2000))));
  });
}
function wavHeader(bytes, sr){
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return h;
}

async function recordTake(browser, base, fmtKey, seed){
  const F = FORMATS[fmtKey];
  const frames = Math.round(SECONDS * FPS), ticks = 60 / FPS;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blendo-rec-'));
  const name = 'blendo-' + fmtKey + '-L' + LEVEL + '-s' + seed + '-' + FPS + 'fps';
  const outFile = path.join(OUT, name + '.mp4');
  const tag = '[' + fmtKey + ' s' + seed + ']';
  const cfg = { seed, level: LEVEL, hard: !!A.hard, sfx: SFX, audioSeconds: SECONDS + 40,
    // a skilled player: mostly the biggest group, a tap every 0.4-0.7 s (the series stays lit, turbo comes)
    bot: { tapMin: 380, tapMax: 700, pauseP: 0.05, pauseMin: 1000, pauseMax: 1800, anyP: 0.15, endZoom: !A['no-end-zoom'],
      orbitFirstMin: 3500, orbitFirstMax: 6000, orbitEveryMin: 8000, orbitEveryMax: 14000,
      orbitMin: 0.45, orbitMax: 0.95, bomb: !A['no-bomb'], bombAfter: 6000, specialAfter: 2500, winHold: 3200, newObjHold: 2800,
      zoom: Math.max(0, Math.min(3, (+A.zoom || 0) | 0)) } };
  const ctx = await browser.newContext({ viewport: { width: F.w, height: F.h }, deviceScaleFactor: F.dpr });
  const pageErrors = [];
  try {
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) r.continue(); else r.abort(); });
    await ctx.addInitScript(pageRuntime, cfg);
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 300)));
    await page.goto(base + '/index.html?dev=1', { waitUntil: 'load', timeout: 90000 });
    await waitFor(page, () => window.__rec && window.__rec.booted(), null, 60000, 'the game to boot');
    if (SFX){
      await page.evaluate(() => window.__rec.unlock());
      // the samples decode asynchronously after the unlock: wait until their count stops growing
      let last = -1, stable = 0; const t0 = Date.now();
      while (Date.now() - t0 < 15000){
        const n = await page.evaluate(() => window.__rec.sfxCount());
        if (n > 0 && n === last) { if (++stable >= 5) break; } else stable = 0;
        last = n; await sleep(100);
      }
    }
    const rival = A['no-rival'] ? null : { av: 1 + (seed % 49), name: 'Rival' };
    const setup = await page.evaluate(o => window.__rec.setup(o), { seed, rival, bomb: !A['no-bomb'] });
    await sleep(900);                               // the rival's face texture loads in real time; the clock is frozen
    const cdp = await ctx.newCDPSession(page);
    const vfile = path.join(tmp, 'video.mp4');
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      // the JPEG decodes as full-range BT.601; going through RGB lets ONE scaler write BT.709 limited range
      // straight into yuv420p (a yuvj → yuv chain can convert the range twice and wash the picture out)
      '-vf', 'format=rgb24,scale=' + F.outW + ':' + F.outH + ':flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-r', String(FPS),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', vfile],
      { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', d => { ffErr += d; });
    const ffDone = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg (video) exited ' + c + '\n' + ffErr.slice(-2000)))));
    const recStart = await page.evaluate(() => window.__rec.now());
    const clip = { x: 0, y: 0, width: F.w, height: F.h, scale: F.dpr };
    const t0 = Date.now(); let st = null;
    for (let f = 0; f < frames; f++){
      st = await page.evaluate(k => window.__rec.frame(k), f === 0 ? 0 : ticks);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: JPEG_Q, clip });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      if (f % (FPS * 5) === 0 || f === frames - 1){
        const s = st.stats, el = (Date.now() - t0) / 1000;
        console.log(tag, (f / FPS).toFixed(0).padStart(3) + ' s', 'level', st.level, st.phase ? '(' + st.phase + ')' : '',
          'alive', st.alive, '| taps', s.taps, 'specials', s.specials, 'shakes', s.shakes, 'orbits', s.orbits,
          'charges', s.charges, 'next', s.nexts, '| render', el.toFixed(0) + ' s', st.errors ? '| bot errors ' + st.errors + ' ' + st.lastErr : '');
      }
    }
    ff.stdin.end();
    await ffDone;
    let afile = null, audio = null;
    if (SFX){
      const info = await page.evaluate(() => window.__rec.audioInfo());
      if (info){
        audio = await page.evaluate(() => window.__rec.renderAudio());
        const CH = 4 << 20, parts = [];
        for (let i = 0; i * CH < audio.bytes; i++) parts.push(Buffer.from(await page.evaluate(([j, c]) => window.__rec.audioChunk(j, c), [i, CH]), 'base64'));
        const data = Buffer.concat(parts);
        afile = path.join(tmp, 'sfx.wav');
        fs.writeFileSync(afile, Buffer.concat([wavHeader(data.length, info.sr), data]));
        audio.offset = (recStart - info.t0) / 1000;
      }
    }
    fs.mkdirSync(OUT, { recursive: true });
    await mux(vfile, afile, audio, outFile, tmp);
    if (KEEP){
      const taps = await page.evaluate(() => window.__rec.tapLog());
      const dir = path.join(OUT, name + '.parts'); fs.mkdirSync(dir, { recursive: true });
      if (afile) fs.copyFileSync(afile, path.join(dir, 'sfx.wav'));
      fs.writeFileSync(path.join(dir, 'taps.json'), JSON.stringify({ recStart, audioOffset: audio ? audio.offset : null,
        taps: taps.map(t => +((t - recStart) / 1000).toFixed(4)) }));
    }
    const s = st.stats;
    console.log(tag, 'DONE', path.relative(REPO, outFile), '| levels', s.levels.join(','), '| taps', s.taps, 'specials', s.specials,
      'shakes', s.shakes, 'orbits', s.orbits, 'charges', s.charges, '| render', ((Date.now() - t0) / 1000).toFixed(0) + ' s',
      audio ? '| sfx peak ' + audio.peak : '', pageErrors.length ? '| page errors: ' + pageErrors.slice(0, 3).join(' / ') : '');
    return outFile;
  } finally {
    await ctx.close().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The final file: the picture as it is, the sound effects from the virtual moment the take began, the
// music from its first bar at the game's own level, the whole mix lifted to the target loudness with a
// limiter on the transients, and a short fade at the end.
async function mux(vfile, afile, audio, outFile, tmp){
  const D = SECONDS.toFixed(3), fadeAt = Math.max(0, SECONDS - 1.2).toFixed(3);
  const inputs = [], chains = [], mixIn = [];
  const idx = () => inputs.filter(x => x === '-i').length - 1;
  if (afile){
    inputs.push('-i', afile);
    chains.push('[' + idx() + ':a]atrim=start=' + Math.max(0, audio.offset).toFixed(4) + ',asetpts=PTS-STARTPTS,apad,atrim=duration=' + D + '[s]');
    mixIn.push('[s]');
  }
  if (MUSIC && fs.existsSync(MUSIC_FILE)){
    inputs.push('-stream_loop', '-1', '-i', MUSIC_FILE);
    chains.push('[' + idx() + ':a]aresample=48000,volume=' + MUSIC_LEVEL + ',atrim=duration=' + D + ',asetpts=PTS-STARTPTS[m]');
    mixIn.push('[m]');
  }
  if (!mixIn.length){ fs.copyFileSync(vfile, outFile); return; }
  // pass 1: the game's own mix, uncompressed
  const mixWav = path.join(tmp, 'mix.wav');
  const mixed = mixIn.length > 1 ? mixIn.join('') + 'amix=inputs=' + mixIn.length + ':normalize=0:duration=longest[a]' : mixIn[0] + 'anull[a]';
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y'].concat(inputs,
    ['-filter_complex', chains.join(';') + ';' + mixed, '-map', '[a]', '-t', D, '-ar', '48000', '-c:a', 'pcm_f32le', mixWav]));
  // pass 2: measure it
  let gainDb = 0;
  if (LOUDNESS !== 'game'){
    const m = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', mixWav, '-af', 'ebur128', '-f', 'null', '-']);
    const I = /Summary:[\s\S]*?I:\s*(-?[\d.]+) LUFS/.exec(m.err);
    if (I) gainDb = Math.max(-20, Math.min(20, (+LOUDNESS) - (+I[1])));
    console.log('   the mix: ' + (I ? I[1] : '?') + ' LUFS → gain ' + gainDb.toFixed(1) + ' dB');
  }
  // pass 3: lift, limit, fade, encode beside the picture
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', vfile, '-i', mixWav,
    // ⚠️ −1.5 dBFS AND NOT −1: the AAC encoder overshoots the limiter — the first delivered takes, limited at
    // −1 dBFS (0.891), measured −0.7 and −0.1 dBTP after encoding; the extra half decibel keeps it under −1
    '-af', 'volume=' + gainDb.toFixed(2) + 'dB,alimiter=limit=0.841:attack=4:release=60:level=false,afade=t=out:st=' + fadeAt + ':d=1.2',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', D, '-movflags', '+faststart', outFile]);
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization'] });
  const made = [];
  try {
    for (let k = 0; k < TAKES; k++)
      for (const f of formats) made.push(await recordTake(browser, base, f, (SEED0 + k) >>> 0));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log('\nRecorded:\n' + made.map(m => '  ' + m).join('\n'));
})().catch(e => { console.error('RECORD ERROR:', e && e.stack || e); process.exit(1); });
