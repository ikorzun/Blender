// ===== 78-ads: rewarded-реклама через Playgama Bridge с фолбэком-заглушкой =====
// SDK: github.com/playgama/bridge — файлы playgama-bridge.js и
// playgama-bridge-config.json лежат РЯДОМ с index.html (в пакете для портала
// заливаются вместе). Схема: на http/https подгружаем SDK динамически,
// bridge.initialize() -> если платформа поддерживает rewarded — работаем через
// Bridge (награда строго по состоянию REWARDED), иначе/офлайн — заглушка.

const Ads = (function(){
  let mode = 'stub';      // 'stub' | 'bridge'
  let rewardCb = null;    // колбэк текущего показа
  let watchdog = 0;

  function settleReward(){
    if (!rewardCb) return;
    const cb = rewardCb; rewardCb = null;
    clearTimeout(watchdog);
    cb();
  }
  function settleFail(silent){
    if (!rewardCb) return;
    rewardCb = null;
    clearTimeout(watchdog);
    if (!silent) toast('Реклама недоступна');
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
        if (!(br.advertisement && br.advertisement.isRewardedSupported)) return; // остаёмся на заглушке
        br.advertisement.on(br.EVENT_NAME.REWARDED_STATE_CHANGED, (state)=>{
          // любое состояние = платформа жива: гасим watchdog (ролики штатно
          // идут 15-30+ с — таймер на 20 с отбирал награду у досмотревших)
          if (watchdog){ clearTimeout(watchdog); watchdog = null; }
          // во время рекламы миксер не должен пожирать предметы
          if (stats) stats.lastAction = performance.now();
          if (state === br.REWARDED_STATE.REWARDED) settleReward();
          else if (state === br.REWARDED_STATE.FAILED) settleFail(false);
          else if (state === br.REWARDED_STATE.CLOSED) settleFail(true); // закрыл до награды — без награды
        });
        mode = 'bridge';
        bridgeSyncSave(); // подтянуть облачную копию сейва и смержить
      }).catch(()=>{ /* остаёмся на заглушке */ });
    };
    s.onerror = ()=>{ /* файла нет — остаёмся на заглушке */ };
    document.head.appendChild(s);
  }

  function showStub(onReward){
    show('adOverlay');
    let left = 3;
    const el = $('adCount');
    el.textContent = left;
    const iv = setInterval(()=>{
      left--; el.textContent = left;
      if (left <= 0){
        clearInterval(iv);
        hide('adOverlay');
        onReward();
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
    get mode(){ return mode; },
    showRewarded(onReward){
      if (mode === 'bridge'){
        rewardCb = onReward;
        // страховка ТОЛЬКО на полную тишину платформы (ни одного состояния)
        watchdog = setTimeout(()=>settleFail(false), 20000);
        try { window.bridge.advertisement.showRewarded(); }
        catch(e){ settleFail(true); showStub(onReward); }
      } else {
        showStub(onReward);
      }
    },
  };
})();
