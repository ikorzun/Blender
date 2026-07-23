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
  let interWatchdog = 0;  // страховка межстраничной: OPENED без CLOSED заморозил бы игру

  // ТРЕБОВАНИЕ ПЛОЩАДОК (Poki и CrazyGames, 2026-07-23): на время ролика игра
  // СТОИТ и МОЛЧИТ. Bridge этого НЕ делает — проверено чтением его адаптеров:
  // он лишь переводит колбэки площадки (rewardedBreak / ad.requestAd) в свои
  // состояния, а ручки на наш звук у него нет. Значит обязанность на игре.
  // Пауза заодно закрывает и блок ввода: в 90-input тап-путь начинается с
  // `if (paused) return`, отдельная блокировка не нужна.
  // pausedByAd — ВЛАДЕНИЕ паузой: резюмим ТОЛЬКО свою. Вкладка могла уйти в
  // hidden, тогда паузу поставил visibilitychange (90-input), и снять её
  // обязан игрок кнопкой Continue — автоснятие вернуло бы его в живую игру.
  let pausedByAd = false, mutedByAd = false, mutedByPlatform = false;
  // Два независимых источника тишины: ролик и сама площадка
  // (AUDIO_STATE_CHANGED — игрок выключил звук в плеере портала). Складываем,
  // иначе конец ролика включал бы звук, который площадка просила выключить.
  function applyMute(){ try { Sound.setMuted(mutedByAd || mutedByPlatform); } catch(e){} }
  function adBlockOn(){
    if (!pausedByAd) pausedByAd = pauseGame(true); // true — тихая, без попапа
    mutedByAd = true; applyMute();
  }
  function adBlockOff(){
    mutedByAd = false; applyMute();
    if (pausedByAd){ pausedByAd = false; resumeGame(); }
  }

  // Ролик может идти десятки секунд (и стаб — 3 с): всё это время простой
  // игрока не по его вине, миксер-наказание должно молчать. Тикаем на ЛЮБОМ
  // показе (bridge И стаб) до развязки. Тик остаётся страховкой и после
  // введения паузы: pauseGame не встаёт на конце уровня (level.over — экраны
  // победы/поражения с плейсментами ×2 и Continue), там игра идёт дальше.
  function beginPending(){
    clearInterval(pendingTick);
    pendingTick = setInterval(()=>{ if (stats) stats.lastAction = performance.now(); }, 800);
    adBlockOn();
  }
  // ЕДИНСТВЕННАЯ развязка: сюда сходятся награда, провал, watchdog, исключение
  // SDK и cancel(). Снимать паузу и мьют только здесь — иначе один забытый
  // путь оставит игру замороженной навсегда, а это хуже исходного бага.
  function endPending(){
    clearInterval(pendingTick); pendingTick = 0;
    clearTimeout(watchdog); watchdog = 0;
    clearInterval(stubTimer); stubTimer = 0;
    clearTimeout(interWatchdog); interWatchdog = 0;
    adBlockOff();
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
        // ЗВУК ПЛОЩАДКИ (тоже вне гейта rewarded — к рекламе отношения не
        // имеет): игрок мог выключить звук в плеере портала. Bridge отдаёт
        // событие со значением «звук РАЗРЕШЁН», отсюда инверсия. Стартовое
        // состояние читаем сразу — событие о том, что уже было выключено, не
        // придёт.
        try {
          mutedByPlatform = !br.platform.isAudioEnabled;
          br.platform.on(br.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled)=>{
            mutedByPlatform = !enabled; applyMute();
          });
          applyMute();
        } catch(e){}
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
        // МЕЖСТРАНИЧНАЯ: показ идёт БЕЗ наших колбэков (showInterstitial —
        // fire-and-forget), поэтому пауза/мьют вешаются прямо на состояния —
        // без этой подписки мы вообще не знали, когда ролик кончился.
        br.advertisement.on(br.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (state)=>{
          if (stats) stats.lastAction = performance.now();
          if (state === br.INTERSTITIAL_STATE.OPENED){
            adBlockOn();
            // Страховка на молчание платформы: CLOSED может не прийти вовсе,
            // и тогда игра осталась бы замороженной навсегда. Межстраничные
            // штатно короче минуты — этот предел трогает только аварию.
            clearTimeout(interWatchdog);
            interWatchdog = setTimeout(()=>{ interWatchdog = 0; adBlockOff(); }, 60000);
          } else if (state === br.INTERSTITIAL_STATE.CLOSED || state === br.INTERSTITIAL_STATE.FAILED){
            clearTimeout(interWatchdog); interWatchdog = 0;
            adBlockOff();
          }
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
