// ===== 78-ads: rewarded-реклама через Playgama Bridge с фолбэком-заглушкой =====
// SDK: github.com/playgama/bridge — файлы playgama-bridge.js и
// playgama-bridge-config.json лежат РЯДОМ с index.html (в пакете для портала
// заливаются вместе). Схема: на http/https подгружаем SDK динамически,
// bridge.initialize() -> если платформа поддерживает rewarded — работаем через
// Bridge (награда строго по состоянию REWARDED), иначе/офлайн — заглушка.

const Ads = (function(){
  let mode = 'stub';      // 'stub' | 'bridge'
  let rewardCb = null;    // колбэк награды текущего показа
  let failCb = null;      // колбэк неудачи (FAILED/CLOSED/исключение) — опционален
  let watchdog = 0;
  let stubTimer = 0;      // интервал заглушки — cancel() обязан уметь её прервать
  let pendingTick = 0;    // пока показ висит, тикаем lastAction — миксер не ест предметы

  // Ролик может идти десятки секунд (и стаб — 3 с): всё это время простой
  // игрока не по его вине, миксер-наказание должно молчать. Тикаем на ЛЮБОМ
  // показе (bridge И стаб) до развязки.
  function beginPending(){
    clearInterval(pendingTick);
    pendingTick = setInterval(()=>{ if (stats) stats.lastAction = performance.now(); }, 800);
  }
  function endPending(){
    clearInterval(pendingTick); pendingTick = 0;
    clearTimeout(watchdog); watchdog = 0;
    clearInterval(stubTimer); stubTimer = 0;
  }
  function settleReward(){
    if (!rewardCb) return;
    const cb = rewardCb; rewardCb = null; failCb = null;
    endPending();
    cb();
  }
  function settleFail(silent){
    if (!rewardCb) return;
    const fb = failCb; rewardCb = null; failCb = null;
    endPending();
    if (!silent) toast('Ad unavailable');
    if (fb) fb();
  }
  // Смена контекста (genLevel): висящий показ никого не должен наградить —
  // колбэки замкнуты на СТАРЫЙ level, награда пришла бы новому уровню
  // (или уже несуществующему состоянию). Колбэк неудачи тоже не зовём:
  // экран, который он восстанавливал, уже пересоздан.
  function cancel(){
    rewardCb = null; failCb = null;
    endPending();
    hide('adOverlay');
  }

  function init(){
    // file:// (офлайн-прототип, headless-тесты) — SDK не грузим, живём на заглушке
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const s = document.createElement('script');
    s.src = 'playgama-bridge.js';
    s.onload = ()=>{
      if (!window.bridge || !window.bridge.initialize) return;
      window.bridge.initialize().then(()=>{
        const br = window.bridge;
        try { br.platform.sendMessage(br.PLATFORM_MESSAGE.GAME_READY); } catch(e){}
        // Облачный сейв НЕ зависит от рекламы и потому синкается ДО гейта
        // rewarded: commitSave (77-save) пишет в bridge.storage всегда, когда
        // storage есть, а читал облако только этот вызов — на площадке со
        // storage, но без rewarded, прогресс уезжал в облако в один конец и
        // не поднимался никогда (потеря прогресса между сессиями/устройствами).
        bridgeSyncSave();
        if (!(br.advertisement && br.advertisement.isRewardedSupported)) return; // остаёмся на заглушке
        br.advertisement.on(br.EVENT_NAME.REWARDED_STATE_CHANGED, (state)=>{
          // любое состояние = платформа жива: гасим watchdog (ролики штатно
          // идут 15-30+ с — таймер на 20 с отбирал награду у досмотревших)
          if (watchdog){ clearTimeout(watchdog); watchdog = 0; }
          // во время рекламы миксер не должен пожирать предметы
          if (stats) stats.lastAction = performance.now();
          if (state === br.REWARDED_STATE.REWARDED) settleReward();
          else if (state === br.REWARDED_STATE.FAILED) settleFail(false);
          else if (state === br.REWARDED_STATE.CLOSED) settleFail(true); // закрыл до награды — без награды
        });
        mode = 'bridge';
      }).catch(()=>{ /* остаёмся на заглушке */ });
    };
    s.onerror = ()=>{ /* файла нет — остаёмся на заглушке */ };
    document.head.appendChild(s);
  }

  function showStub(){
    show('adOverlay');
    let left = 3;
    const el = $('adCount');
    el.textContent = left;
    stubTimer = setInterval(()=>{
      left--; el.textContent = left;
      if (left <= 0){
        hide('adOverlay');
        settleReward(); // прибирает и сам stubTimer (endPending)
      }
    }, 1000);
  }

  // interstitial между уровнями: не раньше INTER_MIN_WINS побед сессии и не
  // чаще INTER_GAP_MS; только в bridge-режиме (в стабе не раздражаем).
  // Каденция может переехать в per-platform конфиг (вердикт аудита плана).
  let sessionWins = 0, interLastMs = 0;
  function noteWin(){ sessionWins++; }
  function maybeInterstitial(){
    if (mode !== 'bridge') return;
    if (sessionWins < INTER_MIN_WINS) return;
    const now = performance.now();
    if (now - interLastMs < INTER_GAP_MS) return;
    try {
      window.bridge.advertisement.showInterstitial();
      interLastMs = now;
      if (stats) stats.lastAction = performance.now(); // миксер не ест предметы под рекламой
      Telemetry.ev('inter', {});
    } catch(e){}
  }
  return {
    init,
    noteWin,
    maybeInterstitial,
    cancel, // genLevel гасит висящий показ (колбэки замкнуты на старый level)
    get mode(){ return mode; },
    // onFail (опционален) зовётся на FAILED/CLOSED/исключении — например,
    // вернуть кнопку «×2», которую спрятали на время показа
    showRewarded(onReward, onFail){
      cancel(); // страховка: сирота прошлого показа (watchdog/стаб) не должен пережить новый
      rewardCb = onReward; failCb = onFail || null;
      beginPending();
      if (mode === 'bridge'){
        // страховка ТОЛЬКО на полную тишину платформы (ни одного состояния)
        watchdog = setTimeout(()=>settleFail(false), 20000);
        try { window.bridge.advertisement.showRewarded(); }
        // исключение SDK = показа не было. Раньше тут открывался стаб —
        // БЕСПЛАТНАЯ награда без рекламы на боевой платформе (дыра экономики)
        catch(e){ settleFail(false); }
      } else {
        showStub();
      }
    },
  };
})();
