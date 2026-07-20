// ===== soak.js — соак-тест длинной сессии (зона ФИЗИКА) =====
// Играет автоботом N минут РЕАЛЬНОГО времени: серии матчей (комбо/цепные
// реакции с досыпкой), простои под миксер-помол, встряски, победы -> след.
// уровень с ЖИВЫМ интро (осадка/трим/спасатель как у игрока). Каждые 5 с
// снимает диагностику в JSONL и в конце печатает вердикт по инвариантам:
//   - сон при maxV>2.5 = БАГ (psLog);
//   - «висун» у СПЯЩЕЙ кучи БЕЗ ЕДИНОГО КОНТАКТА = БАГ (floaters: sleeping
//     и contacts<=0; «мост» — плоский предмет концами на соседях, центр над
//     полостью — даёт gap>0.35 при contacts>0 и багом НЕ является);
//   - wallExcess>0.18 в сэмпле = тревога (спасатель обязан убрать за 0.5 с);
//   - NaN в состоянии = БАГ; монотонный рост кучи JS после GC = утечка.
// Запуск: node soak.js --minutes=15 --seed=101 --hard=0 --idle=0.25 --out=soak.jsonl
// (--hard=1 — сложность Hard: веер лучей + терпение миксера 10 с)
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
const IDLE_SHARE = parseFloat(arg('idle', '0.25')); // доля фаз «простоя» (миксер-помол)
const OUT = arg('out', 'soak-' + SEED + '.jsonl');

// mulberry32: детерминированные решения бота И Math.random страницы (сид уровня)
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
  let rescues = 0;
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errors.push('CONSOLE: ' + t);
    if (t.startsWith('[rescue]')) rescues++;
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

  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForFunction(() => window.__game && window.__game.alive() > 30, null, { timeout: 40000 });
  await page.waitForFunction(() => !window.__game.cam().intro, null, { timeout: 40000 });

  const outStream = fs.createWriteStream(OUT);
  const t0 = Date.now();
  const tEnd = t0 + MINUTES * 60000;
  let mode = 'active', modeUntil = 0, nextSample = 0, lastGc = 0, lastMinute = -1;
  let lastPsT = 0, samples = 0, wins = 0, loses = 0, shakes = 0, matchFails = 0, evalFails = 0;
  const gcHeap = []; // {t, mb} — только сэмплы сразу после GC (тренд утечки)

  while (Date.now() < tEnd){
    try {
      const st = await page.evaluate(() => {
        const vis = id => { const el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none'; };
        return { intro: !!window.__game.cam().intro, win: vis('winOverlay'), lose: vis('loseOverlay'),
                 adAsk: vis('adAskOverlay'), ad: vis('adOverlay') };
      });
      if (st.intro){ await page.waitForTimeout(400); continue; }
      if (st.win){ wins++; await page.click('#againBtn'); await page.waitForTimeout(400); continue; }
      if (st.lose){ loses++; await page.click('#loseAgainBtn'); await page.waitForTimeout(400); continue; }
      if (st.adAsk){ await page.click('#adNo'); await page.waitForTimeout(200); continue; }
      if (st.ad){ await page.waitForTimeout(600); continue; } // заглушка рекламы докручивается

      const now = Date.now();
      if (now >= modeUntil){
        // следующая фаза: простой под миксер-помол ИЛИ активная игра; на входе
        // в фазу иногда встряска (рыхление/притяжение — физический стресс)
        if (rnd() < IDLE_SHARE){ mode = 'idle'; modeUntil = now + (HARD ? 13000 : 36000); }
        else { mode = 'active'; modeUntil = now + 8000 + rnd() * 10000; }
        if (rnd() < 0.35){ shakes++; await page.evaluate(() => window.__game.shake()); }
      }
      if (mode === 'active'){
        const ok = await page.evaluate(() => window.__game.autoMatch());
        if (!ok){
          matchFails++;
          // два промаха подряд — встряхиваем сами (бот не ждёт помола вечно)
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
        const s = await page.evaluate(() => {
          const g = window.__game;
          // «мосты» (gap>0.35, но опора есть) — норма рыхлой кучи, в журнал
          // идёт только их ЧИСЛО; полные записи — лишь у нулевых контактов
          const fl = g.floaters();
          return { alive: g.alive(), ap: g.availablePairs(), topY: +g.topY().toFixed(2), lvl: g.levelNum(),
                   score: g.stats().score, misses: g.stats().misses, awake: g.awake(), combo: g.combo(),
                   floaters: fl.filter(f => f.contacts <= 0), bridges: fl.filter(f => f.contacts > 0).length,
                   wall: g.maxWallExcess(), nan: g.scanNaN().length,
                   flips: g.accFlips(), ps: g.psLog(), perf: g.perfStats() };
        });
        const tSec = Math.round((now - t0) / 1000);
        const freshPs = s.ps.filter(e => e.t > lastPsT);
        if (freshPs.length) lastPsT = freshPs[freshPs.length - 1].t;
        for (const e of freshPs)
          if (e.ev === 'sleep' && e.v > 2.5) problems.push(`SLEEP AT v=${e.v} src=${e.src} t=+${tSec}s`);
        const sleepingFloaters = s.floaters.filter(f => f.sleeping && f.contacts <= 0);
        if (sleepingFloaters.length)
          problems.push(`SLEEPING FLOATERS t=+${tSec}s: ${JSON.stringify(sleepingFloaters)}`);
        if (s.wall.excess > 0.18)
          problems.push(`WALL EXCESS ${s.wall.excess} (${s.wall.who}) t=+${tSec}s`);
        if (s.nan > 0) problems.push(`NaN x${s.nan} t=+${tSec}s`);
        if (doGc && s.perf.heapMB > 0) gcHeap.push({ t: tSec, mb: s.perf.heapMB });
        samples++;
        s.ps = freshPs; // в файл — только новые события сна
        outStream.write(JSON.stringify({ t: tSec, gc: doGc, wins, loses, shakes, rescues, ...s }) + '\n');
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

  // тренд кучи: сравниваем ПОСЛЕ-GC значения, отбросив прогрев (первые 2)
  let heapVerdict = 'n/a';
  if (gcHeap.length >= 4){
    const base = gcHeap[2].mb, last = gcHeap[gcHeap.length - 1].mb;
    const grow = last - base;
    heapVerdict = `${base}MB -> ${last}MB (+${grow.toFixed(1)})`;
    if (grow > Math.max(8, base * 0.25)) problems.push(`HEAP LEAK? ${heapVerdict}`);
  }
  const summary = { seed: SEED, hard: HARD, minutes: MINUTES, samples, wins, loses, shakes, rescues,
    heap: heapVerdict, problems: problems.length, errors: errors.length };
  outStream.write(JSON.stringify({ summary, problems, errors: errors.slice(0, 20) }) + '\n');
  outStream.end();
  console.log('SOAK SUMMARY', JSON.stringify(summary));
  console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
  console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 'none');
  await browser.close();
})();
