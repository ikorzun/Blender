// ===== soak.js — long-session soak test (PHYSICS zone) =====
// Plays with an autobot for N minutes of REAL time: series of matches (combos/
// chain reactions with top-ups), idle phases under the mixer grind, shakes,
// wins -> next level with a LIVE intro (settling/trim/rescuer as for a player).
// Every 5 s it snapshots diagnostics into JSONL and at the end prints a verdict
// on the invariants:
//   - sleep at maxV>2.5 = BUG (psLog);
//   - a "floater" on a SLEEPING pile WITH NOT A SINGLE CONTACT = BUG (floaters:
//     sleeping and contacts<=0; a "bridge" — a flat item resting by its ends on
//     neighbours with its centre over a cavity — gives gap>0.35 at contacts>0
//     and is NOT a bug);
//   - wallExcess>0.18 in a sample = alarm (the rescuer must clear it in 0.5 s);
//   - NaN in the state = BUG; monotonic growth of the JS heap after GC = a leak.
// Run: node soak.js --minutes=15 --seed=101 --hard=0 --idle=0.25 --out=soak.jsonl
// (--hard=1 — Hard difficulty: ray fan + mixer patience 10 s)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const arg = (name, def) => {
  const m = process.argv.find(a => a.startsWith('--' + name + '='));
  return m ? m.split('=')[1] : def;
};
const MINUTES = parseFloat(arg('minutes', '15'));
const SEED = parseInt(arg('seed', '1'), 10);
const HARD = arg('hard', '0') === '1';
const IDLE_SHARE = parseFloat(arg('idle', '0.25')); // share of "idle" phases (mixer grind)
const OUT = arg('out', 'soak-' + SEED + '.jsonl');
// ⚠️ RESEARCH KNOB (2026-08-11, investigation of the frame drop while pouring):
// the number of CCD substeps. Production is 4; the measurement showed that 1
// cuts the WORST pouring frame from 44 down to 29 ms. CCD is part of the
// anti-tunnel complex, so its price must be measured by a SOAK (hundreds of
// samples), not by three runs.
// -1 = do not touch (production behaviour).
const CCDSUB = parseInt(arg('ccdsub', '-1'), 10);
// ⚠️ --walltol=N|off: a knob FOR MEASUREMENT, production value 0.18 (2026-08-12).
// It weakens THE RESCUER'S WALL TOLERANCE and only it — the bowl geometry is the
// same, a real protrusion simply survives until the sample. It is needed because
// the wallExcess norm lacked a DEFECTIVE ANCHOR, and one cannot wait for it: real
// jamming may never happen if the mechanics are healthy.
const WALLTOL = arg('walltol', '');
// --waves=0 — the arm WITHOUT waves for A/B (production: waves on, task #51)
const WAVES = arg('waves', '');

// mulberry32: deterministic bot decisions AND the page's Math.random (level seed)
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

(async () => {
  const rnd = mulberry32(SEED);
  const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const problems = [], errors = [];
  let rescues = 0, floorLifts = 0;
  let bowlSkipped = 0;   // samples skipped because of the bowl shattering (gate below)
  let flyAbove = 0;      // wall excess of items ABOVE all the walls — not a defect
// ⚠️⚠️ BOTH THRESHOLDS WERE RESET BY DISTRIBUTION 2026-08-07 (5 seeds × 12 min).
// THE RULER: headless Chromium on a real GPU (--use-angle=metal), WITHOUT
// CPU throttling, Hard, idle 0.25, autoMatch bot + shakes; a FULL session from
// level 1 is wrapped. The bowl shattering is excluded, the excess is counted by
// the EXACT reach and only where a wall exists.
// ⛔ DO NOT COMPARE THE NEW SOAK NUMBERS WITH THE OLD ONES: the RULER changed,
// not the behaviour — the diagnostics were moved from an upper-bound estimate to
// the exact reach (for the banana the margin reached 0.36 at a threshold of
// 0.20), plus the level size progression and the lastAction fix. The project got
// burned on this twice; writing it down in advance.
//
// FLOOR LIFTS — the threshold stays a RATE (it has to ride along with the run
// duration), but the frequency has been measured: healthy runs gave 3, 16, 17,
// 18, 21 per 12 min, i.e. a maximum of 1.75/min; the DEFECTIVE variants of the
// sag threshold — 36 (3.0/min) and 115 (9.6/min). Between 1.75 and 3.0 there is
// an EMPTY CORRIDOR, and that is where we put 2.5: it catches both known defects
// and stays silent on all SIX healthy runs (the five the threshold was computed
// from, plus the check seed 606 — see below).
// ⚠️ VERIFIED ON A SIXTH SEED THAT DID NOT TAKE PART IN THE CHOICE (606): 23
// lifts, zero alarms. The healthy range widened because of it (3..23, i.e.
// 1.9/min) — this is exactly why a threshold is verified on an outside run and
// not only on the ones it was computed from.
// The former one per minute fired on FOUR healthy runs out of five.
const FLOOR_LIFT_PER_MIN = 2.5;
// WALLEXCESS: 616 samples, p50 −0.151, p90 −0.087, p99 0.033, maximum 0.382.
// 0.45 is above the healthy maximum with a margin of ~18%. The former 0.20 was
// left over from the OVERESTIMATING metric and, after the move to the exact
// reach, fired on four healthy runs out of five.
// ✅ THE DEFECTIVE ANCHOR WAS OBTAINED 2026-08-12 — THE "CEILING" CAVEAT IS
// LIFTED. Waiting for real jamming was not an option: if the mechanics are
// healthy it may NEVER happen, i.e. "a case will turn up — we will re-measure"
// in fact meant "it will stay a ceiling forever". The anchor was obtained by a
// DELIBERATE breakage — weakening the rescuer's wall tolerance (the --walltol
// knob), which does NOT touch the geometry: the walls and radiusAt are the same,
// a real protrusion simply survives until the sample.
// 3 arms × 4 seeds × 12 min, the arms alternate inside a seed, seed 707 OUTSIDE:
//   healthy (0.18):      0 firings out of 500 samples, maximum 0.407
//   light   (0.85):      1 out of 502,  maximum 0.519
//   coarse  (off):      10 out of 502,  maximum 13.562 (+4 falls under the floor)
// The corridor is 0.407 .. 0.519, the threshold 0.45 stands inside it.
// ⚠️ HONESTLY ABOUT ROBUSTNESS: the threshold catches the coarse failure
// confidently, the LIGHT one — only by the tail (1 sample out of 502, and only
// on one seed out of four). Lowering it is not allowed: the healthy maximum is
// 0.407, the margin became 10% and not 18% — the former number was computed
// against the outdated healthy maximum of 0.382.
// ⚠️ And a side observation that explains the narrowness of the corridor: it is
// the SOLVER that holds items at the wall, not the rescuer. Weakening the
// tolerance fivefold (0.18 -> 0.85) cut rescues 161 -> 102, but barely shifted
// the distribution of the protrusions.
const WALL_EXCESS_NORM = 0.45;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errors.push('CONSOLE: ' + t);
    if (t.startsWith('[rescue]')) rescues++;
    if (t.startsWith('[floor]')) floorLifts++; // lifts out of the floor slab: watching for a storm
  });
  await page.addInitScript(([seed, hard]) => {
    let a = seed | 0;
    Math.random = function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    try { localStorage.setItem('mixer_hard', hard ? '1' : '0'); } catch (e) {}
  }, [SEED, HARD]);

  // ⚠️ --ccdsub=N: a knob FOR RESEARCHING the anti-tunnel price (2026-08-11).
  // It is set AFTER loading and again after every regen — the bodies get
  // recreated, and otherwise the knowledge about the knob is lost silently.
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForFunction(() => window.__game && window.__game.alive() > 30, null, { timeout: 40000 });
  await page.waitForFunction(() => !window.__game.cam().intro, null, { timeout: 40000 });
  if (CCDSUB >= 0) await page.evaluate((n) => window.__game.physKnobs({ ccdSub: n }), CCDSUB);
  if (WALLTOL) await page.evaluate((v) => window.__game.physKnobs({ wallTol: v === 'off' ? 'off' : +v }), WALLTOL);
  if (WAVES !== '') await page.evaluate((v) => window.__game.physKnobs({ waves: v !== '0' }), WAVES);

  const outStream = fs.createWriteStream(OUT);
  const t0 = Date.now();
  const tEnd = t0 + MINUTES * 60000;
  let mode = 'active', modeUntil = 0, nextSample = 0, lastGc = 0, lastMinute = -1;
  let lastPsT = 0, samples = 0, wins = 0, loses = 0, shakes = 0, matchFails = 0, evalFails = 0;
  let bombedLvl = -1, blasts = 0; // blast — EXACTLY ONE per level, on a still full pile
  let underPrev = [], underHits = 0; // sags into the floor: sticking versus a transient
  const gcHeap = []; // {t, mb} — only the samples right after GC (leak trend)

  while (Date.now() < tEnd){
    try {
      const st = await page.evaluate(() => {
        const vis = id => { const el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none'; };
        return { intro: !!window.__game.cam().intro, win: vis('winOverlay'), lose: vis('loseOverlay'),
                 adAsk: vis('adAskOverlay'), ad: vis('adOverlay'),
                 // ⚠️⚠️ THE NEW ITEM SCREEN JOINED THE WIN CHAIN 2026-08-10 —
                 // and SILENTLY STOPPED THE SOAK: it is fullscreen, it waits for
                 // a button, and the bot did not know about it. The symptom is
                 // deceptive: the journal shows even lines
                 // `alive=0 rescues=0 problems=0`, i.e. the run looks HEALTHY and
                 // simply checks nothing (measurement 2026-08-11 — the soak had
                 // been standing on the win screen for a second minute). The same
                 // class as "a blocker at the start of a run is a silent
                 // shutdown of the tail".
                 newObj: vis('newObj') };
      });
      if (st.intro){ await page.waitForTimeout(400); continue; }
      if (st.newObj){ await page.click('#newObjBtn'); await page.waitForTimeout(300); continue; }
      if (st.win){ wins++; await page.click('#againBtn'); await page.waitForTimeout(400); continue; }
      if (st.lose){ loses++; await page.click('#loseAgainBtn'); await page.waitForTimeout(400); continue; }
      if (st.adAsk){ await page.click('#adNo'); await page.waitForTimeout(200); continue; }
      if (st.ad){ await page.waitForTimeout(600); continue; } // the ad stub is finishing up

      const now = Date.now();
      if (now >= modeUntil){
        // A BLAST ON A STILL FULL PILE (the 2026-07-30 "fall through the floor"
        // scenario): thin items at the bottom lie under the whole mass, and the
        // sag into the floor slab happened exactly there. One blast per level —
        // there is only one bomb anyway, whereas "whenever it happens" would land
        // on a half-empty bowl and check nothing.
        // ⚠️ The check is here and not in every tick of the loop: the phase
        // changes at least once in 8 s, which is enough for "while the pile is
        // full", while an extra round-trip per tick would slow the bot down
        // noticeably.
        const lvlNow = await page.evaluate(() => window.__game.levelNum());
        if (lvlNow !== bombedLvl){
          bombedLvl = lvlNow;
          if (await page.evaluate(() => window.__game.detonate())) blasts++;
        }
        // next phase: idling under the mixer grind OR active play; on entering
        // the phase sometimes a shake (loosening/attraction — physical stress)
        if (rnd() < IDLE_SHARE){ mode = 'idle'; modeUntil = now + (HARD ? 13000 : 36000); }
        else { mode = 'active'; modeUntil = now + 8000 + rnd() * 10000; }
        if (rnd() < 0.35){ shakes++; await page.evaluate(() => window.__game.shake()); }
      }
      if (mode === 'active'){
        const ok = await page.evaluate(() => window.__game.autoMatch());
        if (!ok){
          matchFails++;
          // two misses in a row — we shake ourselves (the bot does not wait for
          // the grind forever)
          if (matchFails >= 2){ matchFails = 0; shakes++; await page.evaluate(() => window.__game.shake()); await page.waitForTimeout(900); }
        } else matchFails = 0;
        await page.waitForTimeout(300 + Math.floor(rnd() * 350));
      } else {
        await page.waitForTimeout(800);
      }

      if (now >= nextSample){
        nextSample = now + 5000;
        const doGc = now - lastGc > 30000;
        if (doGc){ lastGc = now; await page.evaluate(() => { if (typeof gc === 'function') gc(); }); }
        const s = await page.evaluate(([ccdsub, walltol, waves]) => {
          const g = window.__game;
          // the knob is re-confirmed on every sample: the bodies get recreated by
          // a regen, and "set it once" is exactly the case where a measurement
          // silently drifts away
          if (ccdsub >= 0) g.physKnobs({ ccdSub: ccdsub });
          if (walltol) g.physKnobs({ wallTol: walltol === 'off' ? 'off' : +walltol });
          if (waves !== '') g.physKnobs({ waves: waves !== '0' });
          // "bridges" (gap>0.35, but there is support) are the norm for a loose
          // pile, only their COUNT goes into the journal; full records — only for
          // zero contacts
          const kn = g.physKnobs({});          // the tolerance GOES INTO the sample:
          const fl = g.floaters();             // the arm must be visible in the journal
          return { alive: g.alive(), ap: g.availablePairs(), topY: +g.topY().toFixed(2), lvl: g.levelNum(),
                   score: g.stats().score, misses: g.stats().misses, awake: g.awake(), combo: g.combo(),
                   floaters: fl.filter(f => f.contacts <= 0), bridges: fl.filter(f => f.contacts > 0).length,
                   under: g.underFloor(), // fall through the floor: centre below the slab top
                   // ⚠️⚠️ THE BOWL STATE IS A LOAD-BEARING FIELD, NOT A NOTE. In
                   // the shattering the walls and the bottom are GHOSTLY (sensors)
                   // by design: the items honestly pour into the void. The "under
                   // the floor" and "beyond the wall" invariants measure the
                   // distance to a bowl WHICH DOES NOT EXIST AT THAT MOMENT, and
                   // report the shattering as a defect.
                   bowl: g.bowl(),
                   wall: g.maxWallExcess(), nan: g.scanNaN().length,
                   wallTol: kn.wallTol,        // the arm is visible in EVERY sample
                   excesses: g.wallExcessAll(),// the DISTRIBUTION, not the maximum
                   flips: g.accFlips(), ps: g.psLog(), perf: g.perfStats() };
        }, [CCDSUB, WALLTOL, WAVES]);
        const tSec = Math.round((now - t0) / 1000);
        const freshPs = s.ps.filter(e => e.t > lastPsT);
        if (freshPs.length) lastPsT = freshPs[freshPs.length - 1].t;
        for (const e of freshPs)
          if (e.ev === 'sleep' && e.v > 2.5) problems.push(`SLEEP AT v=${e.v} src=${e.src} t=+${tSec}s`);
        const sleepingFloaters = s.floaters.filter(f => f.sleeping && f.contacts <= 0);
        if (sleepingFloaters.length)
          problems.push(`SLEEPING FLOATERS t=+${tSec}s: ${JSON.stringify(sleepingFloaters)}`);
        // ⚠️ THE NORM WAS RESET BY DISTRIBUTION (2026-07-31), not fitted to a
        // green result. The former 0.18 fired 4 times per 12 minutes ON A
        // HEALTHY build — both on the new geometry and on the old one, i.e. the
        // norm was outdated for both. A measurement of the excess over ALL items
        // (8856 samples, lvl.10+40, settling + 3 shakes): the current ring gives
        // p99 0.075, p99.9 0.165, MAXIMUM 0.181; the former palisade has a worse
        // tail — p99 0.102, maximum 0.226. The threshold must stand ABOVE the
        // healthy maximum, otherwise it catches the norm and not a defect. 0.20
        // is slightly above 0.181 and noticeably below 0.226, i.e. it would have
        // caught the former geometry.
        // ⚠️ THE NUMBER DEPENDS ON THE SHAPE OF THE ITEMS (radialReach is an
        // upper-bound estimate): if the batch of models changes — re-measure
        // `__game.wallExcessAll()`.
        // ⚠️⚠️ WE SKIP THE BOWL SHATTERING — THIS IS NOT A RELAXATION FOR THE
        // SAKE OF GREEN. It was caught by the very first run on the current code:
        // 7 "beyond the wall" alarms and 21 "under the floor", and all of them
        // are snapshots OF THE SHATTERING (all have `pen: null` and
        // `touching: 0`, i.e. there are no contacts at all: the bottom and the
        // walls are sensors). Measuring the excess beyond a wall when there is no
        // wall is meaningless by construction.
        // ⚠️ The same class as with the rescuer (its gate was put into
        // 50-physics): EVERY consumer that assumes the bowl exists must know
        // about the shattering. If a third one appears — gate it too.
        const bowlOpen = !!(s.bowl && (s.bowl.floorGhost || s.bowl.shattering));
        if (bowlOpen) bowlSkipped++;
        // ⚠️⚠️ ONLY WHERE A WALL EXISTS. The physical walls end at 13.3 (the cone
        // up to 9.2 + a belt of half-height 2.1 above the rim), while `radiusAt`
        // above the rim returns R1 FOREVER — an item flying above the bowl was
        // being compared with a non-existent wall. A measurement across all the
        // journals: out of 19 alarms 11 had y > 13.3 and ZERO came from the belt
        // itself, i.e. more than half of the signal is metric noise. The flying
        // ones are counted separately (`flyAbove`) so as not to lose them
        // entirely: if the number grows — then something really is throwing the
        // pile upwards.
        if (!bowlOpen && s.wall.excess > WALL_EXCESS_NORM){
          if (s.wall.walled) problems.push(`WALL EXCESS ${s.wall.excess} (${s.wall.who}) t=+${tSec}s`);
          else flyAbove++;
        }
        // THE FLOOR. ⚠️ A SINGLE SAMPLE IS NOT A DEFECT, and this is not a
        // relaxation for the sake of green: BY DESIGN the rescuer waits up to
        // 1.5 s for a MOVING item (the rest gate, otherwise a storm of teleports
        // on a shake). A measurement of the durations 2026-07-30: 8 seeds with
        // the grind gave 4 episodes, the maximum EXACTLY 1500 ms, not a single
        // one left unclosed. A sample once per 5 s legitimately catches a dip in
        // progress.
        // THE DEFECT IS STICKING, and it is caught by two signs:
        //   (1) the same item under the floor in TWO consecutive samples (>=5 s —
        //       three times above the design ceiling; the original bug lived 30 s
        //       and longer);
        //   (2) under the floor on a SLEEPING body — that is exactly the
        //       "forever": the integrator is off and it will not get out by
        //       itself any more.
        const underNow = bowlOpen ? [] : s.under.map(u => u.name + '@' + Math.round(u.y * 5));
        if (!bowlOpen) underHits += s.under.length;
        const stuck = bowlOpen ? [] : s.under.filter((u, i) => underPrev.includes(underNow[i]));
        if (stuck.length)
          problems.push(`UNDER FLOOR STICKING (2 samples in a row) t=+${tSec}s: ${JSON.stringify(stuck)}`);
        const frozen = bowlOpen ? [] : s.under.filter(u => u.sleeping);
        if (frozen.length)
          problems.push(`UNDER FLOOR ON A SLEEPING PILE t=+${tSec}s: ${JSON.stringify(frozen)}`);
        underPrev = underNow;
        if (s.nan > 0) problems.push(`NaN x${s.nan} t=+${tSec}s`);
        if (doGc && s.perf.heapMB > 0) gcHeap.push({ t: tSec, mb: s.perf.heapMB });
        samples++;
        s.ps = freshPs; // to the file — only the new sleep events
        outStream.write(JSON.stringify({ t: tSec, gc: doGc, wins, loses, shakes, rescues, blasts, floorLifts, ...s }) + '\n');
        const min = Math.floor(tSec / 60);
        if (min !== lastMinute){
          lastMinute = min;
          console.log(`t=+${min}m lvl=${s.lvl} alive=${s.alive} heap=${s.perf.heapMB}MB ` +
            `frame p95=${s.perf.frame.p95}ms step p95=${s.perf.step.p95}ms wins=${wins} rescues=${rescues} problems=${problems.length}`);
        }
      }
      evalFails = 0;
    } catch (e){
      evalFails++;
      console.log('driver error:', e.message.split('\n')[0]);
      if (evalFails >= 5){ problems.push('DRIVER STALLED: ' + e.message.split('\n')[0]); break; }
      await page.waitForTimeout(1000);
    }
  }

  // heap trend: we compare the POST-GC values, discarding the warm-up (first 2)
  let heapVerdict = 'n/a';
  if (gcHeap.length >= 4){
    const base = gcHeap[2].mb, last = gcHeap[gcHeap.length - 1].mb;
    const grow = last - base;
    heapVerdict = `${base}MB -> ${last}MB (+${grow.toFixed(1)})`;
    if (grow > Math.max(8, base * 0.25)) problems.push(`HEAP LEAK? ${heapVerdict}`);
  }
  // FLOOR RESCUER STORM: a lift is a teleport, even if only by millimetres;
  // if it repeats more often than roughly once a minute, then the threshold is
  // catching not a fall-through but normal settling — and that is a regression,
  // not a protection.
  if (floorLifts > MINUTES * FLOOR_LIFT_PER_MIN)
    problems.push(`FLOOR LIFT STORM: ${floorLifts} lifts in ${MINUTES} min `
      + `(norm <= ${Math.round(MINUTES * FLOOR_LIFT_PER_MIN)}, i.e. ${FLOOR_LIFT_PER_MIN}/min)`);
  const summary = { seed: SEED, hard: HARD, minutes: MINUTES, samples, bowlSkipped, flyAbove, wins, loses, shakes, rescues,
    blasts, floorLifts, underHits, heap: heapVerdict, problems: problems.length, errors: errors.length };
  outStream.write(JSON.stringify({ summary, problems, errors: errors.slice(0, 20) }) + '\n');
  outStream.end();
  console.log('SOAK SUMMARY', JSON.stringify(summary));
  console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
  console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 'none');
  await browser.close();
})();
