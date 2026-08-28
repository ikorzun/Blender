// ===== 78-ads: rewarded ads via Playgama Bridge with a stub fallback =====
// SDK: github.com/playgama/bridge — the files playgama-bridge.js and
// playgama-bridge-config.json sit NEXT TO index.html (in the portal package
// they are uploaded together). The scheme: on http/https we load the SDK
// dynamically, bridge.initialize() -> if the platform supports rewarded we work
// through Bridge (reward strictly by the REWARDED state), otherwise/offline — the stub.

const Ads = (function(){
  let mode = 'stub';      // 'stub' | 'bridge'
  let rewardCb = null;    // reward callback of the current show
  let failCb = null;      // failure callback (FAILED/CLOSED/exception) — optional
  let watchdog = 0;
  let stubTimer = 0;      // the stub's interval — cancel() must be able to break it
  let pendingTick = 0;    // while a show hangs we tick lastAction — the mixer does not eat items
  let interWatchdog = 0;  // interstitial safety net: OPENED without CLOSED would freeze the game

  // PLATFORM REQUIREMENT (Poki and CrazyGames, 2026-07-23): for the duration of
  // the ad the game STANDS STILL and STAYS SILENT. Bridge does NOT do this —
  // verified by reading its adapters: it only translates the platform's callbacks
  // (rewardedBreak / ad.requestAd) into its own states, and it has no handle on
  // our sound. So the duty is on the game.
  // The pause also covers input blocking: in 90-input the tap path starts with
  // `if (paused) return`, no separate lock is needed.
  // pausedByAd — pause OWNERSHIP: we resume ONLY our own. The tab could have gone
  // hidden, then the pause was set by visibilitychange (90-input), and it is the
  // player who must lift it with the Continue button — auto-lifting would drop
  // him back into a live game.
  let pausedByAd = false, mutedByAd = false, mutedByPlatform = false;
  // THE PLATFORM PAUSE — the THIRD owner of the pause, with ITS OWN flag (2026-07-29,
  // a mandatory step of the docs: subscribe to BOTH events, pause and audio).
  // ⚠️ pausedByAd MUST NOT BE REUSED: the end of the ad would lift a pause that
  // the platform had set, and the player would come back to a live game under
  // someone else's overlay. `visibilitychange` (90-input) does NOT cover this:
  // on the portal the game lives in an iframe, and when the platform opens its
  // own menu/promo over the frame, document.hidden does NOT become true — the
  // signal comes only from the platform. Before this subscription, under the
  // portal's overlay our mixer kept ticking and EATING the player's items.
  // ⚠️ THE PAUSE HAS ITS OWN MUTE, SEPARATE FROM mutedByPlatform. At first I reused
  // the platform's shared sound flag — and lifting the pause did not bring the
  // sound back: the flag belongs to AUDIO_STATE_CHANGED, it must not be cleared by
  // someone else's hand (caught by our own assert). One flag = one owner, same as
  // for the pause.
  let pausedByPlatform = false, mutedByPause = false;
  let bridgeLang = null;      // platform.language — we read it and expose it outward for a future dictionary
  let sdkReady = false;       // initialize() resolved
  let gameReadyWanted = false, gameReadySent = false; // latch: the game got ready before the SDK

  // ===== THE PLATFORM'S CURTAIN (the owner's complaint 2026-07-30) =====
  // Symptom: "after the bridge loaded, the basket-filling animation disappeared".
  // ANALYSIS OF THE SDK CODE (v2.0.2, the vendor bundle): Playgama has its own
  // BRANDED loader — an opaque `#242424` across the whole viewport (measurement:
  // it is indeed the one visible).
  // It is removed in TWO ways:
  //   1) `sendMessage(GAME_READY)` — SYNCHRONOUSLY removes the node inside the call;
  //   2) the SDK itself: `initialize()` in `.finally` sets progress 100 after 700 ms
  //      (softly — only if the game never reported progress), and the removal comes
  //      1400 ms after that. In total ≈2.1 s after the init resolve.
  //      ⚠️ The 700/1400 timings are VERIFIED against 2.0.2 — they have not changed.
  // ⚠️ Since 2.0.2 the curtain has z-index 9999999 (in 2.0.0 it was 1, and our HUD
  // was drawn ON TOP of it). So "the curtain hung" now means an EMPTY SCREEN
  // without a single pixel of ours — the safety net below became more important,
  // not less.
  // The SDK has NO separate "curtain removed" event. But we do not need one:
  // path 1 is OURS, so we do not guess the moment of removal, we APPOINT it.
  // ⚠️⚠️ FOUND BY MEASUREMENT AND WORSE THAN THE ORIGINAL COMPLAINT: if `initialize()`
  // DOES NOT RESOLVE (on my bench playgama outside their domain — it hung for 20 s),
  // then `sdkReady` stays false, GAME_READY never goes out, `.finally` never
  // happens — and the curtain hangs FOREVER, with the game invisible underneath.
  // That is why a safety net is needed. The lever is the PUBLIC
  // `setGameLoadingProgress(100)` (a documented v2 method), verified by
  // measurement: the curtain goes away.
  // ⚠️ We do NOT touch `#loading-overlay` by id — that is the private DOM of
  // someone else's SDK (a direct ban from the dispatcher; it would silently break
  // on an update).
  let curtainSettle = null, curtainWhy = null, curtainForce = 0;
  const curtainGone = new Promise((res)=>{ curtainSettle = res; });
  function curtainDone(why){
    if (!curtainSettle) return;
    const r = curtainSettle; curtainSettle = null; curtainWhy = why;
    clearTimeout(curtainForce); curtainForce = 0;
    r(why);
  }
  // Pull the public lever and resolve the promise ONLY AFTER the fade-out.
  // ⚠️ RESOLVING BEFORE THE REMOVAL IS FORBIDDEN — that is exactly the original bug,
  // only shorter: the consumer would start a show under a curtain that is still
  // hanging. Caught by a measurement on a live bench (the promise at 8771 ms against
  // the actual removal at 9442 ms — the hard limit was outrunning the safety net);
  // the mock did not reproduce this.
  function liftCurtain(why){
    if (!curtainSettle) return;
    try { window.bridge.setGameLoadingProgress(100); } catch(e){}
    setTimeout(()=>curtainDone(why), CURTAIN_FADE_MS); // the SDK has its own 1400 fade-out
  }
  // The safety net is armed ONLY when the game has already said "I am ready" and
  // GAME_READY could not go out: at that moment the curtain is lying — the picture
  // is there.
  // If the game itself is not ready — the curtain is honest, and it must not be removed.
  function armCurtainFallback(){
    if (curtainForce || !curtainSettle) return;
    curtainForce = setTimeout(()=>{ curtainForce = 0; liftCurtain('lifted by the safety net'); },
      CURTAIN_GRACE_MS);
  }

  // GAME_READY is sent ONCE and upon the fact of the first playable frame.
  // Idempotency is mandatory: finishIntro and skipIntro both call it, and a repeat
  // sendMessage on some platforms returns a rejected promise
  // (in the bundle: the second GAME_READY goes into `Promise.reject()`).
  function sendGameReady(){
    if (gameReadySent || !sdkReady) return;
    try {
      const br = window.bridge;
      const p = br.platform.sendMessage(br.PLATFORM_MESSAGE.GAME_READY);
      if (p && p.catch) p.catch(()=>{}); // a promise — a synchronous try will not catch it
      // ⚠️ THE LATCH IS ARMED AFTER SENDING, NOT BEFORE (found by the dispatcher's review).
      // Previously a synchronous throw from sendMessage left gameReadySent=true with the
      // message NOT sent: no repeat, the curtain's safety net is not armed (its condition
      // is precisely `!gameReadySent`), and the curtain hung until the hard limit.
      // Now a throw = "we did not send", and both mechanisms stay alive.
      gameReadySent = true;
      // The curtain node is removed SYNCHRONOUSLY inside sendMessage — by this line
      // it is already gone, so there is nothing to wait for.
      curtainDone('lifted by game_ready');
    } catch(e){}
  }
  // Level lifecycle messages. On POKI and CRAZY_GAMES the Bridge adapters map
  // LEVEL_* to NATIVE gameplayStart()/gameplayStop() — without them the platform
  // does not know that gameplay is running, and paces ads blindly (a direct loss
  // of impressions). The core calls only Ads.msg(...) and knows nothing about bridge.
  function sendMsg(name, params){
    if (!sdkReady) return;
    try {
      const br = window.bridge;
      const id = br.PLATFORM_MESSAGE && br.PLATFORM_MESSAGE[name];
      if (!id) return;
      const p = br.platform.sendMessage(id, params);
      if (p && p.catch) p.catch(()=>{});
    } catch(e){}
  }
  // THREE independent sources of silence: the ad, the platform's sound
  // (AUDIO_STATE_CHANGED — the player turned the sound off in the portal's player)
  // and the platform pause. We add them up: otherwise the end of an ad would turn on
  // the sound that the platform had asked to keep off.
  // ⚠️ WE MUTE BOTH PATHS. Sound.setMuted is the WebAudio master gain, that is,
  // ONLY the procedural SFX; the background music lives separately (<audio id="bgm">,
  // 85-hud). When the mute was written (v85) there was no music in the engine — it
  // was introduced in v106 and was not added to the mute, because of which the track
  // played ON TOP of the ad. That is a violation of the platforms' requirement "during
  // a fullscreen ad the game and its sound must be paused" and an item on their
  // self-check list.
  function applyMute(){
    const m = mutedByAd || mutedByPlatform || mutedByPause;
    try { Sound.setMuted(m); } catch(e){}
    try { musicSuspend(m); } catch(e){} // 85-hud; its own environment, does not touch musicVol
  }
  // ⚠️⚠️ THE PAUSE MUST BE PRESSED THROUGH, NOT "tried once" (found by the dispatcher's
  // adversarial review, v211; on the only interstitial show path the quiet pause
  // NEVER GOT SET AT ALL).
  // THE MECHANISM: the show comes from againBtn (90-input) — `Ads.maybeInterstitial();
  // genLevel();`. genLevel starts the intro SYNCHRONOUSLY, and OPENED arrives
  // asynchronously already on top of a live intro; `pauseGame` during the intro returns
  // false (a guard in 99-main). One attempt was never enough: pausedByAd
  // stayed false, and WHEN THE INTRO ENDED, the game turned out to be ALIVE under
  // an opaque ad — the mixer, by idleLimit, started EATING the player's items
  // (−20 per grind), and the platform did not get LEVEL_PAUSED.
  // ⚠️ WHY NOT "apply it in finishIntro": that call is about to move to a
  // third point (the platform's curtain), that is, inside the intro — binding to it
  // would break silently. Pressing through is self-sufficient and does not depend on
  // someone else's ordering.
  // ⚠️ IT MUST BE KILLED in adBlockOff: a late successful pause would freeze
  // the game with NO ad on screen any more.
  let adPauseRetry = 0;
  function tryAdPause(){
    if (pausedByAd) return true;
    pausedByAd = pauseGame(true); // true — quiet, without a popup; pauseGame sends LEVEL_PAUSED itself
    return pausedByAd;
  }
  function stopAdPauseRetry(){ if (adPauseRetry){ clearInterval(adPauseRetry); adPauseRetry = 0; } }
  // ⚠️ THE "AD" SCREEN IN TELEMETRY WAS ONLY TRACKED IN THE STUB. `show('adOverlay')`
  // lives exactly in showStub, and the SCREEN_OF map (85-hud) hangs the screen on the
  // overlay being shown — which means in PRODUCTION, where the ad is drawn by the
  // platform, the 'ad' screen was never entered at all: the `screen` event about ads was
  // absent, and the `st:'on_ad'` branch in the tab-leave handler was unreachable. We track
  // the screen ourselves — here, because adBlockOn/Off cover BOTH rewarded AND interstitial.
  let screenBeforeAd = null;
  function adScreenOn(){
    try {
      if (Telemetry.screen.current() === 'ad') return;   // the stub has already entered
      screenBeforeAd = Telemetry.screen.current();
      Telemetry.screen.enter('ad');
    } catch(e){}
  }
  function adScreenOff(){
    try {
      if (Telemetry.screen.current() !== 'ad') return;
      // we go back to where we came from; the fallback rule is the same as in hide()
      const back = screenBeforeAd
        || ((typeof level !== 'undefined' && level && !level.over) ? 'game' : 'menu');
      screenBeforeAd = null;
      Telemetry.screen.enter(back);
    } catch(e){}
  }
  function adBlockOn(){
    if (!tryAdPause() && !adPauseRetry)
      adPauseRetry = setInterval(()=>{ if (tryAdPause()) stopAdPauseRetry(); }, AD_PAUSE_RETRY_MS);
    mutedByAd = true; applyMute();
    adScreenOn();
  }
  function adBlockOff(){
    stopAdPauseRetry();
    mutedByAd = false; applyMute();
    if (pausedByAd){ pausedByAd = false; resumeGame(); }
    adScreenOff();
  }

  // An ad can run for tens of seconds (and the stub — 3 s): all that time the player's
  // idleness is not his fault, and the mixer punishment must stay silent. We tick on
  // ANY show (bridge AND stub) until the resolution. The tick remains a safety net even
  // after the pause was introduced: pauseGame does not engage at the end of a level
  // (level.over — the win/lose screens with the ×2 and Continue placements), there the
  // game keeps running.
  function beginPending(){
    clearInterval(pendingTick);
    pendingTick = setInterval(()=>{ if (stats) stats.lastAction = performance.now(); }, 800);
    adBlockOn();
  }
  // THE ONLY resolution: the reward, the failure, the watchdog, an SDK exception and
  // cancel() all converge here. Lift the pause and the mute only here — otherwise one
  // forgotten path will leave the game frozen forever, and that is worse than the
  // original bug.
  function clearTimers(){
    clearInterval(pendingTick); pendingTick = 0;
    clearTimeout(watchdog); watchdog = 0;
    clearInterval(stubTimer); stubTimer = 0;
    clearTimeout(interWatchdog); interWatchdog = 0;
  }
  function endPending(){ clearTimers(); adBlockOff(); }
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
    // ⚠️ THE REASON IS PASSED INTO THE CALLBACK: 'unavailable' — the ad DID NOT FILL
    // (no fill, an SDK exception, a platform without ads, silence);
    // 'closed' — the player closed it himself before the reward. The owner's word of
    // 2026-08-05 "if the ad did not fill, still allow the shake and the tips"
    // applies ONLY to the first one: closed it himself — no reward.
    if (fb) fb(silent ? 'closed' : 'unavailable');
  }
  // A context switch (genLevel): a hanging show must not reward anyone — the
  // callbacks are closed over the OLD level, the reward would go to a new level
  // (or to a state that no longer exists). We do not call the failure callback either:
  // the screen it used to restore has already been rebuilt.
  function cancel(){
    rewardCb = null; failCb = null;
    endPending();
    hide('adOverlay');
  }

  function init(){
    // file:// (the offline prototype, headless tests) — we do not load the SDK, we live on the stub
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      curtainDone('no sdk (file://)');   // there can be no curtain — we do not make anyone wait
      return;
    }
    // A HARD LIMIT on the whole path: whatever happens to the SDK (did not load,
    // hung, a platform without a loader), the promise will resolve and the game will
    // not stall. The limit does not "give up silently": before releasing the game it
    // makes one last attempt to REMOVE the curtain with the same public lever.
    setTimeout(()=>liftCurtain('lifted by the wait limit'), CURTAIN_MAX_MS);
    const s = document.createElement('script');
    s.src = 'playgama-bridge.js';
    s.onload = ()=>{
      if (!window.bridge || !window.bridge.initialize) return;
      window.bridge.initialize().then(()=>{
        const br = window.bridge;
        sdkReady = true;
        // ⚠️ GAME_READY IS NO LONGER SENT HERE. The docs: send it "when the first
        // playable frame is ready", and at this point there has been no genLevel, no
        // atlas decoding, no ~2 s of intro — the platform would have removed its
        // loader over a black screen. We send it from finishIntro/skipIntro via
        // Ads.gameReady(); if the game managed to get ready before the SDK, the
        // gameReadyWanted latch sends the message from here.
        if (gameReadyWanted) sendGameReady();
        // The cloud save does NOT depend on ads and is therefore synced BEFORE the
        // rewarded gate: commitSave (77-save) writes into bridge.storage whenever
        // storage exists, and only this call ever read the cloud — on a platform with
        // storage but without rewarded, progress went into the cloud one way and never
        // came back (loss of progress between sessions/devices).
        bridgeSyncSave();
        // RESTORING PURCHASES — here as well and for the same reason as the save sync:
        // payments do not depend on rewarded, and on a platform with storage and
        // payments but without rewarded the player would otherwise never get back what
        // he had paid for.
        try { restorePurchases(); } catch(e){}
        // THE PLATFORM'S SOUND (also outside the rewarded gate — it has nothing to do
        // with ads): the player could have turned the sound off in the portal's player.
        // Bridge gives an event with the value "sound is ALLOWED", hence the inversion.
        // We read the initial state right away — an event about something that was
        // already off will not arrive.
        try {
          mutedByPlatform = !br.platform.isAudioEnabled;
          br.platform.on(br.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled)=>{
            mutedByPlatform = !enabled; applyMute();
          });
          applyMute();
        } catch(e){}
        // THE PLATFORM'S PAUSE (a mandatory step of the docs — subscribe to BOTH events).
        // The platform asks for a pause not only for its own ads: its own overlay, the
        // portal menu, a rating dialog. Our own ownership — we lift ONLY our own.
        try {
          const setPlatPause = (isPaused)=>{
            if (isPaused){
              if (!pausedByPlatform) pausedByPlatform = pauseGame(true); // quietly, without a popup
              mutedByPause = true;
            } else {
              mutedByPause = false;
              if (pausedByPlatform){ pausedByPlatform = false; resumeGame(); }
            }
            applyMute();
          };
          if (br.platform.isPaused) setPlatPause(true); // the initial state: an event about an already-set pause will not arrive
          br.platform.on(br.EVENT_NAME.PAUSE_STATE_CHANGED, setPlatPause);
        } catch(e){}
        // THE PLAYER'S LANGUAGE (a mandatory step of the docs). There is no localization
        // yet — the interface is hard EN by the owner's spec; we read it and expose it
        // outward so that a dictionary can be introduced without editing this file.
        try { bridgeLang = String(br.platform.language || '').slice(0, 2).toLowerCase() || null; } catch(e){}
        // ⚠️ THE DISPATCHER'S INSERT into the INTEGRATION zone: review it when
        // bridge.payments is hooked up (the plan — Monday 3.08). The id must match the
        // dashboard: 'noads_forever'. IT STANDS BEFORE THE rewarded GATE DELIBERATELY
        // (review v212): payments do not depend on rewarded — the same reason for which
        // bridgeSyncSave was moved above (a platform with payments but without rewarded
        // would otherwise never get a live price).
        try {
          // ⛔ Pulling the live noads_forever price onto the menu button was removed
          // together with the banner (the owner's word 2026-08-03); the product itself
          // is alive in the catalog. For the FUTURE entry point (the leaderboards block)
          // the price is taken ready-made as Ads.priceOf('noads_forever') from the
          // payments package.
        } catch(e){}
        if (!(br.advertisement && br.advertisement.isRewardedSupported)) return; // we stay on the stub
        br.advertisement.on(br.EVENT_NAME.REWARDED_STATE_CHANGED, (state)=>{
          // any state = the platform is alive: we kill the watchdog (ads normally
          // run 15-30+ s — a 20 s timer was taking the reward away from those who
          // watched it through)
          // ⚠️ WE KILL THE GUARD ONLY ON TERMINAL STATES. Previously ANY first state
          // cleared it, including OPENED — and if the platform went silent after
          // opening the ad, there was no one left to lift the pause: the game stayed
          // frozen forever. The interstitial had such a safety net, the rewarded did
          // not. Now on OPENED the guard is SWITCHED to a long limit (an ad normally
          // runs 15-30 s, 120 only touches a breakdown).
          const terminal = state === br.REWARDED_STATE.REWARDED ||
                           state === br.REWARDED_STATE.FAILED ||
                           state === br.REWARDED_STATE.CLOSED;
          clearTimeout(watchdog); watchdog = 0;
          if (!terminal) watchdog = setTimeout(()=>settleFail(true), 120000);
          // during an ad the mixer must not devour items
          if (stats) stats.lastAction = performance.now();
          if (state === br.REWARDED_STATE.REWARDED) settleReward();
          else if (state === br.REWARDED_STATE.FAILED) settleFail(false);
          else if (state === br.REWARDED_STATE.CLOSED) settleFail(true); // closed before the reward — no reward
        });
        // THE INTERSTITIAL: the show runs WITHOUT our callbacks (showInterstitial is
        // fire-and-forget), so the pause/mute are hung directly on the states —
        // without this subscription we did not know at all when the ad had ended.
        br.advertisement.on(br.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (state)=>{
          if (stats) stats.lastAction = performance.now();
          if (state === br.INTERSTITIAL_STATE.OPENED){
            adBlockOn();
            // A safety net against the platform's silence: CLOSED may not arrive at all,
            // and then the game would stay frozen forever. Interstitials are normally
            // shorter than a minute — this limit only touches a breakdown.
            clearTimeout(interWatchdog);
            interWatchdog = setTimeout(()=>{ interWatchdog = 0; adBlockOff(); }, 60000);
          } else if (state === br.INTERSTITIAL_STATE.CLOSED || state === br.INTERSTITIAL_STATE.FAILED){
            clearTimeout(interWatchdog); interWatchdog = 0;
            adBlockOff();
          }
        });
        // THE "FOREVER WITHOUT ADS" PRICE — FROM THE PLATFORM'S CATALOG (the owner's spec
        // 2026-07-30 "check the price from the bridge"). The button in shell.html carries
        // the fallback "Forever for $4.90"; here the live price of the noads_forever
        // product is pulled in (on the platform it is in the player's local currency).
        // Errors are swallowed silently — the button keeps the fallback, and this does
        // not break the purchase.
        // (fetching the payments catalog is ABOVE, before the rewarded gate: review v212)
        mode = 'bridge';
      }).catch(()=>{ /* we stay on the stub */
        // initialize failed: there is nothing to send GAME_READY through, but the SDK
        // will run its own `.finally` (progress 100 -> removal after 1400 ms) — we wait
        // for exactly that
        setTimeout(()=>curtainDone('lifted by the sdk itself after an init failure'), CURTAIN_SELF_MS);
      });
    };
    s.onerror = ()=>{ /* no file — we stay on the stub */
      curtainDone('sdk did not load');   // there is no one to draw the curtain
    };
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
        settleReward(); // it also cleans up stubTimer itself (endPending)
      }
    }, 1000);
  }

  // The interstitial between levels: once every INTER_EVERY_LEVELS WINS (the owner's
  // spec 2026-07-23 "an interstitial every 5th level", the clarification of
  // 2026-07-24 "only between levels, not on a replay out of a dead end").
  // The counter is moved ONLY by a win (noteWin in showEnd). The show is bound
  // STRUCTURALLY to the victory transition: maybeInterstitial is called only by `againBtn`
  // (Next after a win, 90-input); the call from `loseAgainBtn` (Retry out of a dead end)
  // has been REMOVED — the rescue there is a rewarded Continue, not an interstitial.
  // ⚠️ The level is also changed PAST this gate (msPlayBtn "Play Game", pauseRestart —
  // genLevel without resetting the counter). That does not show an ad, but it accumulates
  // an overflow: a show accumulated over 5 wins will fire on the NEAREST againBtn (the next
  // win) — on a loss it will NEVER fire, since loseAgainBtn does not call the gate.
  // Why it cannot be gated inside 78-ads: msPlayBtn/pauseRestart/showLose do not report
  // the transition here, and any win latch would survive the bypass and leak into
  // Retry — only the buttons' wiring (90-input) distinguishes the transitions.
  // Only in bridge mode (in the stub we do not annoy anyone). The ONLY SHOW point.
  // ⚠️ This is OUR REQUEST, not a guarantee: showInterstitial on Poki/CrazyGames is
  // a signal of an opportunity, the platform paces it itself and is entitled to skip it.
  // "Every 5th" is the upper bound of our initiative; we do NOT ask MORE OFTEN (see
  // docs/AD-CADENCE-PER-PLATFORM.md). The pause/mute for the duration of the ad hang on
  // INTERSTITIAL_STATE_CHANGED (see init) — if the platform showed nothing,
  // OPENED will not arrive and the game will not freeze.
  // ⚠️ THE SUBSCRIPTION POINT: when the owner enables "Subscribe turns off the banners",
  // ONE guard line will go in here at the beginning (`if (adsRemoved()) return;`).
  // The "ads removed" flag is a purchase, it lives in the save (the META zone), and the
  // request for it is filed at the moment the payments decision is made (Poki has no
  // payments in Bridge).
  // ⚠️ THE WIN COUNTER LIVES IN THE SAVE (Save.iw), and NOT in the closure. While it was
  // an IIFE variable, it died with a page reload: to see ONE ad you had to win
  // INTER_EVERY_LEVELS levels in ONE uninterrupted session (~25 min). Measurement: an
  // hour of play in one sitting = 2 impressions a day, the same hour in three 20-minute
  // sittings = ZERO, always. Because of that the bundle's promise of "a month without ads"
  // removed something the player was hardly getting anyway.
  // ⚠️ This is NOT currency: no anti-dupe is needed, the merge takes max (the worst case
  // is one extra impression, not the player's lost money).
  // ===== THE LEADERBOARD: submitting the score without a screen (the owner's spec 2026-07-29) =====
  // THE RANK MODEL — "like in Forbes": the rank is the CURRENT state, not a lifetime
  // achievement. Earned it — went up, spent it — went down. We do not touch the formula,
  // we send `leaderboardScore()` as is (77-save).
  let lbBoardId = LEADERBOARD_ID;   // mutable for the sake of the test hook (DEV)
  let lbLast = null;                // the last SUBMITTED value — we do not send the same one twice
  let lbLastRaw = null;             // the raw server response (its shape has been known since 2026-07-29)
  let lbAccepted = null;            // true — the score was accepted, false — below the peak and ignored
  // Three preconditions BEFORE the call. The reason for exactly this check: both "the
  // platform cannot do it" and "the network went down" give an EMPTY Promise.reject()
  // with no argument — they cannot be told apart by the rejection itself (measurement
  // 2026-07-29). So we tell them apart BEFOREHAND.
  function lbBlockedWhy(){
    if (!lbBoardId) return 'no board id/token';          // our own switch
    if (mode !== 'bridge' || !sdkReady) return 'sdk is not up';
    try {
      const br = window.bridge;
      if (!br.leaderboards || br.leaderboards.type === 'not_available')
        return 'platform does not support it';
      // ⚠️ THE AUTHORIZATION GATE IS OURS, AND IT IS STRICTER THAN THE SDK'S. The owner's
      // spec: "to get into the leaderboard you have to log in". The SDK lets you through
      // on a NON-EMPTY playerId, and a guest's one is non-empty (measurement) — without
      // this line guests would go through. As a side effect it closes the littering of the
      // table: a guest id is NEW FOR EVERY SESSION, and the SDK has no record deletion at all.
      if (!br.player || !br.player.isAuthorized) return 'player is not authorized';
      if (!br.player.id) return 'no player id';
    } catch(e){ return 'sdk unavailable'; }
    return null;
  }
  // ⚠️⚠️ THIS TABLE CANNOT GO DOWN, AND THERE IS NOTHING TO FIX HERE.
  // The platform's server keeps the MAXIMUM: it silently ignores a smaller value, and the
  // refusal is invisible even by status — a 201 arrives with `scoreAttemptStatus:'normal'`
  // (a live measurement 2026-07-29, two runs, the playgama and poki platforms). There is
  // one sign: the body returns the STORED score, not the submitted one.
  // ⛔ THEREFORE the owner's requirement "spending drops you in the table immediately" IS
  // NOT SOLVED HERE, neither by re-hanging the trigger nor by anything else: only OUR
  // table (`82-lb.js`) can go down. Whoever comes next with this requirement
  // must read these lines before starting to edit the platform path.
  // The roles were separated deliberately: the platform's one is "the all-time record",
  // ours is the current balance. The divergence of their numbers is by design and is
  // explained on screen.
  function submitLeaderboardScore(){
    const why = lbBlockedWhy();
    if (why) return { ok: false, skipped: why };   // SILENTLY: no toasts, no errors in the console
    const score = leaderboardScore();
    if (score === lbLast) return { ok: false, skipped: 'the value did not change' };
    lbLast = score;
    try {
      window.bridge.leaderboards.setScore(lbBoardId, score).then((res)=>{
        // ⚠️⚠️ A RESOLVE DOES NOT MEAN SUCCESS. The SaaS transport is fetch(...).then(r =>
        // r.json()) WITHOUT checking res.ok (measurement: 403 and 500 with a JSON body arrive
        // here as a success; an empty body, on the contrary, flies into catch on parsing).
        lbLastRaw = res;
        // PARSING THE BODY — the shape was established by a LIVE RUN on 2026-07-29 (the
        // Blendo board, the playgama and poki platforms, two independent runs):
        //   POST → {uuid, leaderboardUuid, playerUuid, score, platformId,
        //           updatedAt, scoreAttemptStatus, scoreAttemptReasons[]}
        // ⚠️⚠️ THE SERVER KEEPS THE MAXIMUM, AND THE REFUSAL IS INVISIBLE BY STATUS: a smaller
        // value is silently ignored, but the response is still 201 and
        // scoreAttemptStatus:'normal' — the field that looks like it was created for exactly
        // this does not fire. THE ONLY honest sign: the body carries the STORED score, not
        // the submitted one. We compare against it.
        const stored = res && typeof res.score === 'number' ? res.score : null;
        const accepted = stored === null ? null : stored === score;
        lbAccepted = accepted;
        // ⚠️ "Ignored" is NOT an error and NOT a reason for alarm: it is the normal case
        // where the current score is below the player's personal peak. We record it as a fact.
        Telemetry.ev('lb', { s: score, st: stored, ok: accepted === true ? 1 : 0 });
      }).catch(()=>{
        // Both a REAL transport failure and a successful write with an empty body land here.
        // They cannot be told apart — so we simply allow a repeat on the next win, rather
        // than deciding "it was not saved".
        lbLast = null;
        Telemetry.ev('lb', { s: score, err: 1 });
      });
    } catch(e){ lbLast = null; }
    return { ok: true, score };
  }
  function interWins(){ return Math.max(0, Save.iw || 0); }
  function noteWin(){
    Save.iw = interWins() + 1; commitSave();
    // THE LEADERBOARD is sent FROM HERE, not from the core: noteWin is already called
    // exactly once per win and STRICTLY AFTER bankLevelScore (80-gameplay: the bank is on
    // the line above the call) — which means the score has already been counted. The core
    // knows nothing about the leaderboard, and no edits in someone else's zone were needed.
    // ⛔⛔ A TOMBSTONE. Below is a decision taken DELIBERATELY on 2026-07-29, and it has been
    // REVERSED by the owner's word of 2026-08-09 ("the result changes if the player has
    // spent money in the collection on a multiplier"). The text is kept verbatim, because
    // here we do not silently rewrite what has been weighed:
    //
    //   "⚠️ KNOWN BEHAVIOR: leaderboardScore() changes NOT only on a win — an early bank
    //    on a purchase moves it in the middle of a run. What goes into the table is the
    //    value AT THE END OF THE LEVEL; intermediate changes are not submitted.
    //    Accepted deliberately (the dispatcher 2026-07-29): the submission is bound to a
    //    natural point, not to every twitch of the balance."
    //
    // WHAT EXACTLY WAS REVERSED: the spending happens IN THE MENU, between levels. With the
    // former trigger the place would have been updated only after the NEXT win — that is,
    // exactly what the owner asked for would not have happened.
    // ⚠️ WHAT REMAINED TRUE AND MUST NOT BE LOST: both submissions stand AFTER
    // `bankLevelScore` (80-gameplay: the bank is on the line above the `noteWin` call).
    // Move them above the bank and a score without the level just played will go into the
    // table, and the symptom will be insidious: a plausible number, just yesterday's.
    submitLeaderboardScore();
    // OUR table (the current balance, it can go down). Intermediate changes are caught by
    // its own subscription to `onStarsChange` — here it is only the win.
    if (typeof lbSubmit === 'function') { try { lbSubmit(); } catch (e) {} }
  }

  // ===== THE LEADERBOARD: READING (the contract for the INTERFACE screen) =====
  // Analyzed FROM THE SOURCE of `LeaderboardsModule.ts` v2.0.2, not from the docs.
  //
  // ⚠️⚠️ THE TABLE TYPE IS OVERRIDDEN BY SaaS, AND THAT CHANGES THE STATEMENT OF THE TASK:
  //   `get type(){ return this.#saas ? IN_GAME : platformBridge.leaderboardsType }`
  // We have SaaS enabled in the config for playgama/poki/y8/yandex/crazy_games,
  // which means on those platforms the type is ALWAYS `in_game`, and the branch "the
  // platform will draw it, our screen is not needed" will NEVER FIRE there. We draw our own
  // screen; `native`/`native_popup` remain only for platforms outside that list.
  //
  // ⚠️ THE BRIDGE HAS NO PAGINATION. `getEntries(id)` is called WITHOUT parameters
  // (`saas.get('leaderboards/'+id)`) and returns one whole list. That is why the
  // `limit/offset` below slice an ALREADY RECEIVED array on our side —
  // this is NOT a server page, and we must not promise the screen "we will load more".
  //
  // ⚠️ READING DOES NOT REQUIRE AUTHORIZATION, unlike WRITING. The
  // `isAcquired`/`isAuthorized` gate in `lbBlockedWhy` is about submitting one's own
  // result (the owner's decision "to GET INTO the table you have to log in"). ANYONE can
  // LOOK at the table, including a guest; keeping these two rules apart is mandatory.
  const LB_ENTRY_TTL = 30000;         // the screen is opened often, spare the server
  let lbCache = null, lbCacheAt = 0;

  function lbType(){
    try {
      const t = window.bridge && window.bridge.leaderboards && window.bridge.leaderboards.type;
      return t || null;
    } catch(e){ return null; }
  }
  // Why it cannot be read — in a single reason, IN THE SCREEN'S LANGUAGE.
  function lbReadWhy(){
    if (!lbBoardId) return 'disabled';                   // our own switch
    if (mode !== 'bridge' || !sdkReady) return 'no sdk';
    const t = lbType();
    if (!t || t === 'not_available') return 'platform does not support it';
    if (t !== 'in_game') return 'the table is drawn by the platform';  // native / native_popup
    return null;
  }
  function lbNormalize(list){
    const meId = (()=>{ try { return String(window.bridge.player.id || ''); } catch(e){ return ''; } })();
    const rows = (Array.isArray(list) ? list : []).map((e, i) => ({
      id: String((e && e.id) || ''),
      name: (e && e.name) || '',
      score: Number((e && e.score) || 0),
      // ⚠️ We take `rank` from the server, and compute OUR OWN only when it is missing:
      // with SaaS the place arrives ready-made, and recomputing it by index would
      // silently diverge from the server on equal scores.
      rank: (e && typeof e.rank === 'number') ? e.rank : (i + 1),
      photo: (e && e.photo) || null,
      me: !!meId && String((e && e.id) || '') === meId,
    }));
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }
  // It ALWAYS returns a resolve: a refusal is a state of the screen, not an exception.
  // {ok, why, type, total, entries, me}
  // ⚠️ `me === null` means "my row is not in the output" — and NOT "I am outside the table":
  // the list arrives as a slice, and beyond its bounds the place is unknown. The screen must
  // distinguish these two cases, otherwise it will show the player an untruth.
  function lbEntries(opts){
    const o = opts || {};
    const why = lbReadWhy();
    if (why) return Promise.resolve({ ok: false, why: why, type: lbType(), entries: [], me: null, total: 0 });
    const fresh = lbCache && !o.force && (Date.now() - lbCacheAt) < LB_ENTRY_TTL;
    const src = fresh ? Promise.resolve(lbCache) : (function(){
      let p; try { p = window.bridge.leaderboards.getEntries(lbBoardId); } catch(e){ p = Promise.reject(e); }
      return Promise.resolve(p).then((list)=>{ lbCache = lbNormalize(list); lbCacheAt = Date.now(); return lbCache; });
    })();
    return src.then((rows)=>{
      const from = Math.max(0, o.offset || 0);
      const to = o.limit ? from + o.limit : rows.length;
      return { ok: true, why: null, type: lbType(), total: rows.length,
               entries: rows.slice(from, to), me: rows.find(r => r.me) || null };
    }).catch((e)=>{
      Telemetry.ev('lb', { ph: 'read_fail', r: String((e && e.message) || e || '').slice(0, 60) });
      return { ok: false, why: 'network', type: lbType(), entries: [], me: null, total: 0 };
    });
  }
  // THE PLATFORM'S POPUP. ⚠️ It is IMPOSSIBLE to find out in advance whether it exists: the
  // module checks the RAW platform type (`_platformBridge.leaderboardsType`), while outward
  // it gives the type overridden by SaaS. So — we try and honestly report the refusal.
  function lbShowNative(){
    if (!lbBoardId) return Promise.resolve({ ok: false, why: 'disabled' });
    let p;
    try { p = window.bridge.leaderboards.showNativePopup(lbBoardId); }
    catch(e){ p = Promise.reject(e); }
    return Promise.resolve(p).then(()=>({ ok: true, why: null }))
      .catch(()=>({ ok: false, why: 'the platform cannot do a popup' }));
  }

  function maybeInterstitial(){
    // THE NO-ADS WINDOW from the bundle (77-save): it kills ONLY interstitials.
    // We do NOT touch rewarded — the player asks for those himself, and they carry charges.
    if (typeof noAdActive === 'function' && noAdActive()) return;
    if (mode !== 'bridge') return;
    // ⚠️ THE SUPPORT GUARD — STRICTLY BEFORE resetting the window. mode==='bridge' is set by
    // isRewardedSupported, while the interstitial is NOT supported everywhere (in the bundle
    // these are different getters, and on some adapters the interstitial is additionally
    // disabled by the config
    // `advertisement.interstitial.disable`). Without the guard we were zeroing the
    // accumulated 5 wins where there will NEVER be an ad — the window was being wound
    // down for nothing.
    try { if (!window.bridge.advertisement.isInterstitialSupported) return; } catch(e){ return; }
    if (interWins() < INTER_EVERY_LEVELS) return;
    Save.iw = 0; commitSave(); // we cross the window off RIGHT AWAY: a repeated click or a loss
    // between wins must not release a second ad; on a show failure we lose one on a
    // best-effort basis — better than spam retries on every transition
    try {
      // PLACEMENT — the name of the ad slot. The adapters pass it into the platforms'
      // native SDKs (on Poki/GameSnacks this is `name` in adBreak), and without it all
      // per-slot statistics is blind. The interstitial has exactly one slot.
      window.bridge.advertisement.showInterstitial('level_completed');
      if (stats) stats.lastAction = performance.now(); // the mixer does not eat items under an ad
      Telemetry.ev('inter', { every: INTER_EVERY_LEVELS });
    } catch(e){}
  }
  // ===== PAYMENTS (bridge.payments, v2.0.2) =====
  // The playgama platform's contract (analyzed from the PlaygamaPlatformBridge source):
  // purchase() RESOLVES ONLY on status==='PAID' (otherwise it rejects), the SDK confirms
  // delivery itself (confirmDelivery), and getPurchases() returns a list where
  // `id` is our product identifier.
  //
  // ⚠️⚠️ CONSUMABLE AND NOT — THE MAIN DECISION OF THIS SECTION, everything else grows out
  // of it. BUNDLES are consumable: they MUST be consumed after being granted, otherwise
  // getPurchases() would return them forever and EVERY START would grant the booster
  // again — an endless free boost. NOADS_FOREVER is not consumable: the purchase itself
  // IS the proof of ownership, and a consume would erase the possibility of restoring it.
  const isConsumable = (id) => id !== 'noads_forever';

  // A local registry of closed orders — OUR OWN key, we do not climb into Save (someone
  // else's zone). It is needed for the case "we granted it, but the consume did not go
  // through": without it the next start would see the purchase in the list and grant it
  // a SECOND time.
  // ⚠️ The key is the orderId, and NOT the product id: bundles can be bought repeatedly, and
  // a key by id would block a legitimate second purchase.
  const IAP_LEDGER = 'mixer_iap_done';
  function ledger(){
    try { return JSON.parse(localStorage.getItem(IAP_LEDGER) || '[]') || []; } catch(e){ return []; }
  }
  function ledgerAdd(orderId){
    if (!orderId) return;                       // no order — we do not block anything
    try {
      const l = ledger(); if (l.indexOf(orderId) >= 0) return;
      l.push(orderId);
      localStorage.setItem(IAP_LEDGER, JSON.stringify(l.slice(-100)));
    } catch(e){}
  }
  const ledgerHas = (orderId) => !!orderId && ledger().indexOf(orderId) >= 0;

  // ⚠️⚠️ TWO PROVIDERS, ONE SEAM (the native wrapper, 2026-08-28). In the iOS/macOS wrapper
  // the page is served from the custom origin `blendo://game` and a WKUserScript injects
  // `window.__nativePayments` at documentStart — that is, BEFORE the first byte of our scripts,
  // so asking for it synchronously here is safe and no readiness event is needed.
  // ⛔ THIS IS AN EXPLICIT ADAPTER, NOT AN IMPERSONATION OF THE BRIDGE. The native side must
  // never pretend to be `window.bridge` — the canon forbids it, and the two contracts genuinely
  // differ (see the orderId note on the consume below).
  // ⚠️ The shim itself returns null when there is no native handler behind it, so null and
  // undefined must be treated the same: «there is no provider».
  function nativePayments(){
    try {
      const n = window.__nativePayments;
      return (n && typeof n.purchase === 'function') ? n : null;
    } catch(e){ return null; }
  }
  function bridgePayments(){
    try {
      return (window.bridge && window.bridge.payments
              && window.bridge.payments.isPaymentsSupported) ? window.bridge.payments : null;
    } catch(e){ return null; }
  }
  // The native provider wins when present: inside the wrapper Apple's rules leave no choice.
  function payApi(){ return nativePayments() || bridgePayments(); }
  const isNativeApi = (api) => !!api && api === nativePayments();

  // ⚠️ THE STORE'S PRODUCT IDS ARE NOT OURS. StoreKit needs the full bundle-scoped id; the game
  // speaks its own short ones everywhere else (the ledger, the telemetry, the grant handles), so
  // the translation lives HERE and nowhere else.
  // ⛔ `noads_forever` IS DELIBERATELY ABSENT — its App Store id has not been given to me yet.
  // An unmapped id on the native path returns 'unavailable', which the HUD already renders as
  // «Coming soon». That is the honest answer; do NOT invent an id to fill this hole.
  const NATIVE_IDS = { bundle5: 'monster.blendo.bundle5',
                       bundle3: 'monster.blendo.bundle3',
                       bundle2: 'monster.blendo.bundle2' };
  const GAME_IDS = Object.keys(NATIVE_IDS).reduce((m, k) => (m[NATIVE_IDS[k]] = k, m), {});
  const toNativeId = (id) => NATIVE_IDS[id] || null;
  const toGameId   = (id) => GAME_IDS[id] || id;

  function paymentsOn(){ return !!payApi(); }

  // THE CATALOG — cached for the session. We expose it outward so that the INTERFACE takes
  // LIVE prices rather than hard-wired dollars: on the playgama platform the bridge returns
  // `price: "49 Gam"`, `priceCurrencyCode: 'Gam'`, `priceValue` and a coin image (verified
  // against the PlaygamaPlatformBridge source, not against the docs). The player pays IN GAM —
  // a "$4.99" price tag on the card would simply be a lie.
  let catalogCache = null, catalogPromise = null;
  function catalog(){
    if (catalogCache) return Promise.resolve(catalogCache);
    if (catalogPromise) return catalogPromise;
    const api = payApi();
    if (!api) return Promise.resolve([]);
    const native = isNativeApi(api);
    let p; try { p = api.getCatalog(); } catch(e){ p = Promise.reject(e); }
    catalogPromise = Promise.resolve(p).then((items)=>{
      const arr = Array.isArray(items) ? items : [];
      // ⚠️ On the native path the store answers with an EMPTY ARRAY (not a rejection) when it is
      // unreachable. An empty catalog therefore means «no live prices» — `priceOf` returns null
      // and the interface falls back to its hard-wired price tags, exactly as before.
      catalogCache = native ? arr.map((it) => (it && it.id) ? Object.assign({}, it, { id: toGameId(it.id) }) : it)
                            : arr;
      return catalogCache;
    }).catch(()=>{ catalogPromise = null; return []; });
    return catalogPromise;
  }
  function priceOf(id){
    const it = (catalogCache || []).find(x => x && x.id === id);
    if (!it) return null;
    return it.price || (it.priceValue != null && it.priceCurrencyCode
      ? it.priceValue + ' ' + it.priceCurrencyCode : null);
  }

  // GRANTING. Bundles go into the existing META handle buyBundle (77-save).
  // ⚠️ THERE IS NOTHING TO GRANT NOADS_FOREVER WITH: `Save.na` is a TEMPORARY window, and it
  // is set only inside buyBundle for the three bundles; there is no permanent marker in the
  // save at all (verified against 77-save). So here there is a call to a handle that does not
  // exist yet, and a LOUD refusal instead of a quiet "ok": to silently "buy forever" and grant
  // nothing is the worst thing you can do with a paid purchase.
  function grantPurchase(id){
    if (id === 'noads_forever'){
      if (typeof grantNoAdsForever === 'function'){
        try { grantNoAdsForever(); return { ok: true }; } catch(e){ return { ok: false, reason: 'grant_threw' }; }
      }
      console.warn('[iap] noads_forever was paid for, but there is nothing to grant it with: no META handle grantNoAdsForever');
      return { ok: false, reason: 'no_grant_handle' };
    }
    if (typeof buyBundle !== 'function') return { ok: false, reason: 'no_grant_handle' };
    const r = buyBundle(id);
    return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.reason) || 'grant_failed' };
  }

  // GRANT FIRST, THEN CLOSE. The order matters: had we closed first and the granting
  // failed — the player paid and got nothing, and there would be nothing left to restore it
  // with. The reverse order in the worst case gives one extra grant, and the registry catches it.
  function settlePurchase(id, purchase){
    const orderId = purchase && (purchase.orderId || purchase.id_order || null);
    const g = grantPurchase(id);
    if (!g.ok){
      Telemetry.ev('iap', { ph: 'grant_fail', id: id, r: g.reason });
      return { ok: false, reason: g.reason };
    }
    ledgerAdd(orderId);
    if (isConsumable(id)){
      try {
        // ⚠️⚠️ THE TWO CONTRACTS DIFFER HERE AND THAT IS THE WHOLE POINT OF THE ADAPTER.
        // StoreKit must finish EXACTLY the transaction that was issued, addressed by its
        // orderId — not «the newest purchase carrying this product id». With Ask to Buy a
        // second copy of the same product can be in the queue, and closing by id alone kills
        // it UNGRANTED: the family pays and the player receives nothing. Found by the iOS
        // session's adversarial review, 2026-08-28.
        // ⛔ The Playgama bridge takes ONE argument. Do not «unify» these by passing the extra
        // one to the vendor SDK — an ignored argument today is a changed meaning tomorrow.
        const api = payApi();
        const p = isNativeApi(api) ? api.consumePurchase(toNativeId(id) || id, orderId)
                                   : api.consumePurchase(id);
        if (p && p.catch) p.catch(()=>{ console.warn('[iap] the consume did not go through:', id); });
      } catch(e){}
    }
    Telemetry.ev('iap', { ph: 'granted', id: id });
    return { ok: true, id: id };
  }

  // A PURCHASE. It ALWAYS returns a resolve with {ok}, so that the caller does not build its
  // own catch: the player's refusal is not a program error.
  function purchase(id){
    const api = payApi();
    if (!api) return Promise.resolve({ ok: false, reason: 'unsupported' });
    const native = isNativeApi(api);
    // ⛔ An id the store does not know is 'unavailable', NOT 'failed': the HUD renders that as
    // «Coming soon» instead of «Purchase failed», which is the truth — see NATIVE_IDS above.
    const storeId = native ? toNativeId(id) : id;
    if (native && !storeId) return Promise.resolve({ ok: false, reason: 'unavailable' });
    Telemetry.ev('iap', { ph: 'start', id: id });
    let p;
    try { p = api.purchase(storeId); } catch(e){ p = Promise.reject(e); }
    return Promise.resolve(p)
      .then((res) => settlePurchase(id, res))
      .catch((e) => {
        // ⚠️ A REFUSAL IS NOT A FAILURE. The native provider rejects with a message that names
        // which of the three happened; the bridge has no such vocabulary, so anything it says
        // keeps falling into 'failed' exactly as before — this widens the vocabulary, it does
        // not change the Playgama path.
        //   cancelled — the player backed out: say nothing;
        //   pending   — Ask to Buy awaits approval: neither granted nor failed; it will arrive
        //               UNCONSUMED through getPurchases() on the next restore pass;
        //   unavailable — the store does not know this product: «Coming soon», not «failed».
        //                 ⚠️ Kept SEPARATE from 'failed' on purpose — 'failed' is reserved for a
        //                 product the store KNOWS but could not sell (network, StoreKit error).
        //                 Without this line an id we map but Apple has not published yet would
        //                 tell the player their purchase broke, when nothing was ever on sale.
        //   failed    — a real error: tell the player.
        const m = String((e && e.message) || e || '');
        const reason = (m === 'cancelled' || m === 'pending' || m === 'unavailable') ? m : 'failed';
        Telemetry.ev('iap', { ph: reason === 'failed' ? 'fail' : reason, id: id, r: m.slice(0, 60) });
        return { ok: false, reason: reason };
      });
  }

  // RESTORING AT STARTUP. Two tasks at once:
  //  (1) bring back noads_forever — it is not consumable and always lives in the list;
  //  (2) FINISH GRANTING what was paid for but not granted: the tab could have been closed
  //      between the payment and the granting, then the bundle stayed UNclosed and hangs in
  //      the list.
  function restorePurchases(){
    const api = payApi();
    if (!api) return Promise.resolve({ ok: false, reason: 'unsupported' });
    const native = isNativeApi(api);
    let p;
    try { p = api.getPurchases(); } catch(e){ p = Promise.reject(e); }
    return Promise.resolve(p).then((list) => {
      const items = Array.isArray(list) ? list : [];
      let restored = 0, skipped = 0;
      items.forEach((it) => {
        // ⚠️ orderId is StoreKit's Transaction.id: stable across launches, reinstalls and
        // devices, and a consumed one never returns to the queue. That is what makes the
        // ledger a reliable key here — an unconsumed bundle survives a reinstall with the
        // SAME orderId, so it is granted once and only once.
        const id = it && toGameId(it.id); if (!id) return;
        const orderId = it.orderId || null;
        if (ledgerHas(orderId)){ skipped++; return; }   // already closed — do not grant again
        const r = settlePurchase(id, it);
        if (r.ok) restored++;
      });
      Telemetry.ev('iap', { ph: 'restore', n: items.length, ok: restored, skip: skipped });
      return { ok: true, total: items.length, restored: restored, skipped: skipped };
    }).catch((e) => {
      Telemetry.ev('iap', { ph: 'restore_fail', r: String((e && e.message) || e || '').slice(0, 60) });
      return { ok: false, reason: 'failed' };
    });
  }

  return {
    init,
    noteWin,
    // PAYMENTS. purchase returns {ok, reason} and NEVER rejects.
    // ⚠️ noads_forever will currently return ok:false / 'no_grant_handle' — the META handle
    // for granting "forever without ads" does not exist yet (a request to the dispatcher).
    purchase,
    restorePurchases,
    catalog,          // a promise with the product list (cached for the session)
    priceOf,          // the product's price string from the catalog or null (a fetch is required)
    get paymentsOn(){ return paymentsOn(); },
    maybeInterstitial,
    cancel, // genLevel kills a hanging show (the callbacks are closed over the old level)
    get mode(){ return mode; },
    get lang(){ return bridgeLang; }, // the player's language from the platform (for a future dictionary)
    // The first PLAYABLE frame (called by finishIntro/skipIntro). Idempotent and
    // tolerant of a call before the SDK is ready — then it is sent later from init.
    gameReady(){
      gameReadyWanted = true; sendGameReady();
      // we could not send it (initialize does not resolve yet/any more) — we arm the
      // safety net: the game IS ready, so the curtain on top of it is lying
      if (!gameReadySent) armCurtainFallback();
    },
    // "THE PLATFORM'S CURTAIN IS REMOVED, THE PLAYER CAN BE SHOWN" — a one-shot promise
    // with a GUARANTEE of firing. It resolves: immediately, if there can be no curtain
    // (file://, the SDK did not load, initialize failed); on sending GAME_READY
    // (the SDK removes the node synchronously); or by the safety net via the public
    // setGameLoadingProgress. It never hangs: there is a hard limit in init.
    // ⚠️ The default is TO RESOLVE. Erring on the side of "show the game" is safe,
    // erring on the side of "wait forever" is not.
    get curtainGone(){ return curtainGone; },
    get curtainWhy(){ return curtainWhy; },   // debugging: what exactly resolved it
    // The level lifecycle for the platform: LEVEL_STARTED/COMPLETED/PAUSED/
    // RESUMED. We do not send LEVEL_FAILED — there is no losing in the game (a dead end = a grind).
    msg: sendMsg,
    // THE LEADERBOARD (the submission lives in noteWin). Outward — only for the suite and
    // the future screen: the refusal reason, the last submitted value and the raw response.
    submitScore: submitLeaderboardScore,
    lbWhy: lbBlockedWhy,
    get lbLast(){ return lbLast; },
    get lbRaw(){ return lbLastRaw; },
    // ⚠️ READ IT LIKE THIS: true — the score was accepted; false — NOT an error, but "below
    // the personal peak", the server keeps the maximum; null — a response without a score
    // field (a failure).
    get lbAccepted(){ return lbAccepted; },
    setBoardId(id){ if (DEV) lbBoardId = id || ''; },  // test hook: the production id is in 00-config
    // READING THE TABLE — the screen's contract. The details and the boundaries — at the functions.
    lbType,                 // 'in_game' | 'native' | 'native_popup' | 'not_available' | null
    lbReadWhy,              // why it cannot be read (null = it can)
    lbEntries,              // {ok, why, type, total, entries[{rank,name,score,photo,id,me}], me}
    lbShowNative,           // the platform's popup; it cannot be known in advance — only tried
    // onFail (optional) is called on FAILED/CLOSED/an exception — for example, to
    // bring back the "×2" button that was hidden for the duration of the show
    // placement — the name of the ad slot ('shake'/'continue'/'x2'/'magnet'),
    // it is passed into the platform's native SDK; without it the per-slot statistics
    // is blind. Optional: old calls work as before.
    showRewarded(onReward, onFail, placement){
      // A safety net: an orphan of a previous show (watchdog/stub) must not outlive
      // the new one. ⚠️ NOT a full cancel(): that one lifts the pause and the MUTE, and a
      // line later we put them back — on that "lifted-and-restored" the music managed to
      // twitch and start playing on top of the beginning ad (caught by the assert
      // "the track does not start under an ad"). We kill only the timers and the callbacks;
      // beginPending re-arms the A/V, and the single lifting point (endPending) is intact.
      rewardCb = null; failCb = null; clearTimers(); hide('adOverlay');
      rewardCb = onReward; failCb = onFail || null;
      beginPending();
      if (mode === 'bridge'){
        // a safety net ONLY against complete silence from the platform (not a single state)
        watchdog = setTimeout(()=>settleFail(false), 20000);
        try { window.bridge.advertisement.showRewarded(placement || 'rewarded'); }
        // an SDK exception = there was no show. Previously the stub opened here —
        // a FREE reward without an ad on a production platform (an economy hole)
        catch(e){ settleFail(false); }
      } else if (DEV){
        showStub();   // local development: show the flow without a real ad
      } else {
        // ⚠️ THERE IS NO STUB IN PRODUCTION (the owner's spec 2026-07-29). Previously, on a
        // platform without ad support, OUR screen "(rewarded video will play here)" opened,
        // waited 3 seconds and GRANTED the reward. Ad shakes per level are not limited —
        // that is, an endless handout of bonuses at zero revenue, and the player is
        // convinced he is watching an ad. Showing a fake ad screen is a standard ground for
        // rejection at the platform's review.
        // No ad — no reward, an honest toast.
        settleFail(false);
      }
    },
    // cadence debugging (the suite): the win counter until the next ad
    get _winsSinceInter(){ return interWins(); },
  };
})();
// A cadence debug handle for the headless suite (like __game for the core): a full
// run of 5 wins in a test is slow and flaky, while noteWin/maybeInter are
// public methods of Ads. The INTEGRATION zone, removing it = one line.
if (typeof window !== 'undefined' && DEV) window.__ads = Ads;
