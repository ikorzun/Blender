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
  // ПЛАТФОРМЕННАЯ ПАУЗА — ТРЕТИЙ владелец паузы, СВОЙ флаг (2026-07-29,
  // обязательный шаг доки: подписка на ОБА события, pause и audio).
  // ⚠️ НЕЛЬЗЯ переиспользовать pausedByAd: конец ролика снял бы паузу,
  // которую поставила площадка, и игрок вернулся бы в живую игру под
  // чужим оверлеем. `visibilitychange` (90-input) это НЕ покрывает: игра
  // на портале живёт в iframe, и когда площадка открывает своё меню/промо
  // поверх фрейма, document.hidden НЕ становится true — сигнал приходит
  // только от платформы. До этой подписки под оверлеем портала у нас
  // продолжал тикать миксер и ЖРАТЬ предметы игрока.
  // ⚠️ У ПАУЗЫ СВОЙ МЬЮТ, ОТДЕЛЬНО ОТ mutedByPlatform. Сначала я переиспользовал
  // общий флаг звука площадки — и снятие паузы не возвращало звук: флаг
  // принадлежит AUDIO_STATE_CHANGED, снимать его чужой рукой нельзя (поймано
  // собственным ассертом). Один флаг = один владелец, как и у паузы.
  let pausedByPlatform = false, mutedByPause = false;
  let bridgeLang = null;      // platform.language — читаем, отдаём наружу под будущий словарь
  let sdkReady = false;       // initialize() резолвился
  let gameReadyWanted = false, gameReadySent = false; // латч: игра дозрела раньше SDK

  // ===== ЗАНАВЕС ПЛОЩАДКИ (жалоба владельца 2026-07-30) =====
  // Симптом: «после загрузки бриджа пропала анимация заполнения корзины».
  // РАЗБОР КОДА SDK (v2.0.2, вендорный бандл): у Playgama свой БРЕНДОВЫЙ
  // лоадер — непрозрачный `#242424` во весь вьюпорт (замер: он и виден).
  // Снимается ДВУМЯ путями:
  //   1) `sendMessage(GAME_READY)` — СИНХРОННО удаляет узел внутри вызова;
  //   2) сам SDK: `initialize()` в `.finally` через 700 мс ставит прогресс
  //      100 (мягко — только если игра ни разу не сообщала прогресс), а
  //      снятие идёт ещё через 1400 мс. Итого ≈2.1 с после резолва init.
  //      ⚠️ Тайминги 700/1400 СВЕРЕНЫ на 2.0.2 — не изменились.
  // ⚠️ С 2.0.2 занавес имеет z-index 9999999 (в 2.0.0 был 1, и наш HUD
  // рисовался ПОВЕРХ него). Значит «занавес завис» теперь = ПУСТОЙ ЭКРАН
  // без единого нашего пикселя — страховка ниже стала важнее, а не наоборот.
  // Отдельного события «занавес снят» в SDK НЕТ. Но нам оно и не нужно:
  // путь 1 — НАШ, значит момент снятия мы не угадываем, а НАЗНАЧАЕМ.
  // ⚠️⚠️ НАЙДЕНО ЗАМЕРОМ И ХУЖЕ ИСХОДНОЙ ЖАЛОБЫ: если `initialize()` НЕ
  // РЕЗОЛВИТСЯ (у меня на стенде playgama вне их домена — висел 20 с),
  // то `sdkReady` остаётся false, GAME_READY не уходит, `.finally` не
  // наступает — и занавес висит НАВСЕГДА, игра под ним невидима.
  // Поэтому нужна страховка. Рычаг — ПУБЛИЧНЫЙ `setGameLoadingProgress(100)`
  // (документированный метод v2), проверен замером: занавес уходит.
  // ⚠️ НЕ трогаем `#loading-overlay` по id — приватный DOM чужого SDK
  // (прямой запрет диспетчера; молча отвалится на обновлении).
  let curtainSettle = null, curtainWhy = null, curtainForce = 0;
  const curtainGone = new Promise((res)=>{ curtainSettle = res; });
  function curtainDone(why){
    if (!curtainSettle) return;
    const r = curtainSettle; curtainSettle = null; curtainWhy = why;
    clearTimeout(curtainForce); curtainForce = 0;
    r(why);
  }
  // Дёрнуть публичный рычаг и разрешить обещание ТОЛЬКО ПОСЛЕ затухания.
  // ⚠️ РАЗРЕШАТЬ РАНЬШЕ СНЯТИЯ НЕЛЬЗЯ — это ровно исходный баг, только короче:
  // потребитель начнёт показ под ещё висящим занавесом. Поймано замером на
  // живом стенде (обещание 8771 мс против фактического снятия 9442 мс —
  // жёсткий предел обгонял страховку), мок этого не воспроизводил.
  function liftCurtain(why){
    if (!curtainSettle) return;
    try { window.bridge.setGameLoadingProgress(100); } catch(e){}
    setTimeout(()=>curtainDone(why), CURTAIN_FADE_MS); // у SDK своё затухание 1400
  }
  // Страховка ставится ТОЛЬКО когда игра уже сказала «я готова», а
  // GAME_READY уйти не смог: занавес в этот момент врёт — картинка есть.
  // Если не готова сама игра — занавес честен, и снимать его нельзя.
  function armCurtainFallback(){
    if (curtainForce || !curtainSettle) return;
    curtainForce = setTimeout(()=>{ curtainForce = 0; liftCurtain('снят страховкой'); },
      CURTAIN_GRACE_MS);
  }

  // GAME_READY шлётся ОДИН РАЗ и по факту первого играбельного кадра.
  // Идемпотентность обязательна: finishIntro и skipIntro оба зовут, а
  // повторный sendMessage у части площадок отдаёт rejected-промис
  // (в бандле: второй GAME_READY уходит в `Promise.reject()`).
  function sendGameReady(){
    if (gameReadySent || !sdkReady) return;
    try {
      const br = window.bridge;
      const p = br.platform.sendMessage(br.PLATFORM_MESSAGE.GAME_READY);
      if (p && p.catch) p.catch(()=>{}); // промис — синхронный try его не поймает
      // ⚠️ ЛАТЧ ВЗВОДИТСЯ ПОСЛЕ ОТПРАВКИ, А НЕ ДО (найдено ревью диспетчера).
      // Раньше синхронный бросок sendMessage оставлял gameReadySent=true при
      // НЕотправленном сообщении: повтора нет, страховка занавеса не взводится
      // (её условие — именно `!gameReadySent`), и занавес висел до жёсткого
      // предела. Теперь бросок = «не отправили», и оба механизма живут дальше.
      gameReadySent = true;
      // Узел занавеса удаляется СИНХРОННО внутри sendMessage — к этой строке
      // его уже нет, поэтому ждать нечего.
      curtainDone('снят game_ready');
    } catch(e){}
  }
  // Сообщения жизненного цикла уровня. У POKI и CRAZY_GAMES адаптеры Bridge
  // маппят LEVEL_* в НАТИВНЫЕ gameplayStart()/gameplayStop() — без них
  // площадка не знает, что геймплей идёт, и пейсит рекламу вслепую (прямая
  // потеря показов). Ядро зовёт только Ads.msg(...) и о bridge не знает.
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
  // ТРИ независимых источника тишины: ролик, звук площадки
  // (AUDIO_STATE_CHANGED — игрок выключил звук в плеере портала) и
  // платформенная пауза. Складываем: иначе конец ролика включал бы звук,
  // который площадка просила выключить.
  // ⚠️ ГЛУШИМ ОБА ТРАКТА. Sound.setMuted — это master-гейн WebAudio, то есть
  // ТОЛЬКО процедурные SFX; фоновая музыка живёт отдельно (<audio id="bgm">,
  // 85-hud). Когда мьют писался (v85), музыки в движке не было — её завели
  // в v106 и в мьют не внесли, из-за чего трек играл ПОВЕРХ рекламы. Это
  // нарушение требования площадок «во время полноэкранной рекламы игра и её
  // звук должны быть на паузе» и пункт их самопроверки.
  function applyMute(){
    const m = mutedByAd || mutedByPlatform || mutedByPause;
    try { Sound.setMuted(m); } catch(e){}
    try { musicSuspend(m); } catch(e){} // 85-hud; своя среда, musicVol не трогает
  }
  // ⚠️⚠️ ПАУЗУ НАДО ДОЖИМАТЬ, А НЕ «попробовать один раз» (найдено адверсарным
  // ревью диспетчера, v211; на единственном пути показа межстраничной тихая
  // пауза НЕ ВСТАВАЛА НИКОГДА).
  // МЕХАНИЗМ: показ идёт из againBtn (90-input) — `Ads.maybeInterstitial();
  // genLevel();`. genLevel ставит интро СИНХРОННО, а OPENED прилетает
  // асинхронно уже поверх живого интро; `pauseGame` во время интро отдаёт
  // false (гвард в 99-main). Одной попытки не хватало никогда: pausedByAd
  // оставался false, и КОГДА ИНТРО КОНЧАЛОСЬ, игра оказывалась ЖИВОЙ под
  // непрозрачным роликом — миксер по idleLimit начинал ЕСТЬ ПРЕДМЕТЫ игрока
  // (−20 за помол), а площадка не получала LEVEL_PAUSED.
  // ⚠️ ПОЧЕМУ НЕ «применить в finishIntro»: этот вызов вот-вот переедет в
  // третью точку (занавес площадки), то есть внутрь интро — привязка к нему
  // сломалась бы молча. Дожим самодостаточен и от чужого порядка не зависит.
  // ⚠️ ГАСИТЬ ОБЯЗАТЕЛЬНО в adBlockOff: поздняя удачная пауза заморозила бы
  // игру уже БЕЗ рекламы на экране.
  let adPauseRetry = 0;
  function tryAdPause(){
    if (pausedByAd) return true;
    pausedByAd = pauseGame(true); // true — тихая, без попапа; LEVEL_PAUSED шлёт сам pauseGame
    return pausedByAd;
  }
  function stopAdPauseRetry(){ if (adPauseRetry){ clearInterval(adPauseRetry); adPauseRetry = 0; } }
  function adBlockOn(){
    if (!tryAdPause() && !adPauseRetry)
      adPauseRetry = setInterval(()=>{ if (tryAdPause()) stopAdPauseRetry(); }, AD_PAUSE_RETRY_MS);
    mutedByAd = true; applyMute();
  }
  function adBlockOff(){
    stopAdPauseRetry();
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
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      curtainDone('нет sdk (file://)');   // занавеса быть не может — не заставляем ждать
      return;
    }
    // ЖЁСТКИЙ ПРЕДЕЛ на весь путь: что бы ни случилось со SDK (не загрузился,
    // повис, площадка без лоадера), обещание разрешится и игра не встанет.
    // Предел не «сдаётся молча»: перед тем как отпустить игру, он делает
    // последнюю попытку СНЯТЬ занавес тем же публичным рычагом.
    setTimeout(()=>liftCurtain('снят по пределу ожидания'), CURTAIN_MAX_MS);
    const s = document.createElement('script');
    s.src = 'playgama-bridge.js';
    s.onload = ()=>{
      if (!window.bridge || !window.bridge.initialize) return;
      window.bridge.initialize().then(()=>{
        const br = window.bridge;
        sdkReady = true;
        // ⚠️ GAME_READY здесь БОЛЬШЕ НЕ ШЛЁТСЯ. Дока: слать «когда готов
        // первый играбельный кадр», а тут ещё не было ни genLevel, ни
        // декодирования атласов, ни ~2 с интро — площадка сняла бы свой
        // лоадер над чёрным экраном. Шлём из finishIntro/skipIntro через
        // Ads.gameReady(); если игра успела дозреть раньше SDK, латч
        // gameReadyWanted досылает сообщение здесь.
        if (gameReadyWanted) sendGameReady();
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
        // ПАУЗА ПЛОЩАДКИ (обязательный шаг доки — подписка на ОБА события).
        // Площадка просит паузу не только под свою рекламу: свой оверлей,
        // меню портала, диалог оценки. Своё владение — снимаем ТОЛЬКО свою.
        try {
          const setPlatPause = (isPaused)=>{
            if (isPaused){
              if (!pausedByPlatform) pausedByPlatform = pauseGame(true); // тихо, без попапа
              mutedByPause = true;
            } else {
              mutedByPause = false;
              if (pausedByPlatform){ pausedByPlatform = false; resumeGame(); }
            }
            applyMute();
          };
          if (br.platform.isPaused) setPlatPause(true); // стартовое: событие о уже поставленной паузе не придёт
          br.platform.on(br.EVENT_NAME.PAUSE_STATE_CHANGED, setPlatPause);
        } catch(e){}
        // ЯЗЫК ИГРОКА (обязательный шаг доки). Локализации пока нет —
        // интерфейс жёстко EN по спеке владельца; читаем и отдаём наружу,
        // чтобы словарь можно было завести без правок этого файла.
        try { bridgeLang = String(br.platform.language || '').slice(0, 2).toLowerCase() || null; } catch(e){}
        // ⚠️ ВСТАВКА ДИСПЕТЧЕРА в зону ИНТЕГРАЦИИ: ревьюить при подключении
        // bridge.payments (план — понедельник 3.08). id обязан совпадать с
        // кабинетом: 'noads_forever'. СТОИТ ДО ГЕЙТА rewarded НАМЕРЕННО (ревью
        // v212): платежи от rewarded не зависят — та же причина, по которой
        // bridgeSyncSave вынесен выше (площадка с платежами, но без rewarded,
        // иначе не получала бы живую цену никогда).
        try {
          // ⛔ Подтяжка живой цены noads_forever на кнопку меню удалена
          // вместе с баннером (слово владельца 2026-08-03); сам продукт в
          // каталоге жив. Вернуть при блоке лидербордов/новой точке входа.
        } catch(e){}
        if (!(br.advertisement && br.advertisement.isRewardedSupported)) return; // остаёмся на заглушке
        br.advertisement.on(br.EVENT_NAME.REWARDED_STATE_CHANGED, (state)=>{
          // любое состояние = платформа жива: гасим watchdog (ролики штатно
          // идут 15-30+ с — таймер на 20 с отбирал награду у досмотревших)
          // ⚠️ ГАСИМ СТОРОЖА ТОЛЬКО НА КОНЕЧНЫХ СОСТОЯНИЯХ. Раньше его снимало
          // ЛЮБОЕ первое состояние, включая OPENED, — и если площадка после
          // открытия ролика замолкала, снять паузу было уже некому: игра
          // оставалась замороженной навсегда. У межстраничной такая страховка
          // была, у роликов нет. Теперь на OPENED сторож ПЕРЕВОДИТСЯ на длинный
          // предел (ролик штатно идёт 15-30 с, 120 трогает только аварию).
          const terminal = state === br.REWARDED_STATE.REWARDED ||
                           state === br.REWARDED_STATE.FAILED ||
                           state === br.REWARDED_STATE.CLOSED;
          clearTimeout(watchdog); watchdog = 0;
          if (!terminal) watchdog = setTimeout(()=>settleFail(true), 120000);
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
        // ЦЕНА «НАВСЕГДА БЕЗ РЕКЛАМЫ» — ИЗ КАТАЛОГА ПЛОЩАДКИ (спека владельца
        // 2026-07-30 «проверь цену из бриджа»). Кнопка в shell.html несёт фолбэк
        // «Forever for $4.90»; здесь подтягивается живая цена товара
        // noads_forever (у площадки она в локальной валюте игрока). Ошибки
        // глотаем молча — кнопка остаётся с фолбэком, покупку это не ломает.
        // (фетч каталога платежей — ВЫШЕ, до гейта rewarded: ревью v212)
        mode = 'bridge';
      }).catch(()=>{ /* остаёмся на заглушке */
        // initialize упал: GAME_READY отправить нечем, но у SDK сработает свой
        // `.finally` (прогресс 100 -> снятие через 1400 мс) — ждём ровно его
        setTimeout(()=>curtainDone('снят самим sdk после сбоя init'), CURTAIN_SELF_MS);
      });
    };
    s.onerror = ()=>{ /* файла нет — остаёмся на заглушке */
      curtainDone('sdk не загрузился');   // занавес рисовать некому
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
        settleReward(); // прибирает и сам stubTimer (endPending)
      }
    }, 1000);
  }

  // interstitial между уровнями: раз в INTER_EVERY_LEVELS ПОБЕД (спека
  // владельца 2026-07-23 «межстраничная каждый 5 уровень», уточнение
  // 2026-07-24 «только между уровнями, не на переигровке из тупика»).
  // Счётчик двигает ТОЛЬКО победа (noteWin в showEnd). Показ привязан
  // СТРУКТУРНО к победному переходу: maybeInterstitial зовёт лишь `againBtn`
  // (Next после победы, 90-input); из `loseAgainBtn` (Retry из тупика) вызов
  // УБРАН — спасение там это rewarded Continue, а не межстраничная.
  // ⚠️ Уровень меняют и МИМО этого гейта (msPlayBtn «Play Game», pauseRestart —
  // genLevel без сброса счётчика). Это не показывает ролик, но копит перелив:
  // накопленный за 5 побед показ выстрелит на БЛИЖАЙШЕМ againBtn (следующая
  // победа) — на поражении не выстрелит НИКОГДА, т.к. loseAgainBtn гейт не зовёт.
  // Почему нельзя загейтить внутри 78-ads: msPlayBtn/pauseRestart/showLose о
  // переходе сюда не сообщают, любой win-латч пережил бы bypass и утёк в
  // Retry — различает переходы только проводка кнопок (90-input).
  // Только в bridge-режиме (в стабе не раздражаем). Единственная точка ПОКАЗА.
  // ⚠️ Это НАШ ЗАПРОС, а не гарантия: showInterstitial у Poki/CrazyGames —
  // сигнал возможности, площадка сама пейсит и вправе пропустить. «Каждый 5»
  // — верхняя граница нашей инициативы; ЧАЩЕ мы не просим (см.
  // docs/AD-CADENCE-PER-PLATFORM.md). Пауза/мьют на время ролика висят на
  // INTERSTITIAL_STATE_CHANGED (см. init) — если площадка ничего не показала,
  // OPENED не придёт и игра не замрёт.
  // ⚠️ ТОЧКА ПОДПИСКИ: когда владелец включит «Subscribe отключает баннеры»,
  // сюда встанет ОДНА строка-гвард в начале (`if (adsRemoved()) return;`).
  // Флаг «реклама снята» — покупка, живёт в сейве (зона МЕТЫ), запрос туда
  // оформляется в момент решения по платежам (у Poki платежей в Bridge нет).
  // ⚠️ СЧЁТЧИК ПОБЕД ЖИВЁТ В СЕЙВЕ (Save.iw), а НЕ в замыкании. Пока он был
  // переменной IIFE, он умирал с перезагрузкой страницы: чтобы увидеть ОДИН
  // ролик, надо было выиграть INTER_EVERY_LEVELS уровней в ОДНОЙ непрерывной
  // сессии (~25 мин). Замер: час игры одним заходом = 2 показа в день, тот же
  // час тремя заходами по 20 мин = НОЛЬ, всегда. Из-за этого обещание бандла
  // «месяц без рекламы» убирало то, чего игрок и так почти не получал.
  // ⚠️ Это НЕ валюта: анти-дюп не нужен, мерж берёт max (худший случай —
  // один лишний показ, а не потерянные деньги игрока).
  // ===== ЛИДЕРБОРД: отправка счёта без экрана (спека владельца 2026-07-29) =====
  // МОДЕЛЬ РАНГА — «как в Форбс»: ранг это ТЕКУЩЕЕ состояние, а не пожизненное
  // достижение. Заработал — поднялся, потратил — упал. Формулу не трогаем,
  // шлём `leaderboardScore()` как есть (77-save).
  let lbBoardId = LEADERBOARD_ID;   // мутабельно ради тест-хука (DEV)
  let lbLast = null;                // последнее ОТПРАВЛЕННОЕ значение — не шлём то же дважды
  let lbLastRaw = null;             // сырой ответ сервера (форма известна с 2026-07-29)
  let lbAccepted = null;            // true — счёт принят, false — ниже пика и проигнорирован
  // Три предусловия ДО вызова. Причина именно такой проверки: и «площадка не
  // умеет», и «сеть упала» дают ПУСТОЙ Promise.reject() без аргумента — по
  // самому реджекту их не различить (замер 2026-07-29). Значит различаем ДО.
  function lbBlockedWhy(){
    if (!lbBoardId) return 'нет id борда/токена';          // наш выключатель
    if (mode !== 'bridge' || !sdkReady) return 'sdk не поднят';
    try {
      const br = window.bridge;
      if (!br.leaderboards || br.leaderboards.type === 'not_available')
        return 'площадка не поддерживает';
      // ⚠️ ГЕЙТ ПО АВТОРИЗАЦИИ — НАШ, И ОН СТРОЖЕ SDK. Спека владельца:
      // «чтобы попасть в лидерборд, нужно залогиниться». SDK пропускает по
      // НЕПУСТОМУ playerId, а у гостя он непустой (замер) — без этой строки
      // гости бы поехали. Побочно закрывает засорение таблицы: гостевой id
      // НОВЫЙ НА КАЖДУЮ СЕССИЮ, а удаления записей в SDK нет вовсе.
      if (!br.player || !br.player.isAuthorized) return 'игрок не авторизован';
      if (!br.player.id) return 'нет id игрока';
    } catch(e){ return 'sdk недоступен'; }
    return null;
  }
  function submitLeaderboardScore(){
    const why = lbBlockedWhy();
    if (why) return { ok: false, skipped: why };   // МОЛЧА: ни тостов, ни ошибок в консоли
    const score = leaderboardScore();
    if (score === lbLast) return { ok: false, skipped: 'значение не изменилось' };
    lbLast = score;
    try {
      window.bridge.leaderboards.setScore(lbBoardId, score).then((res)=>{
        // ⚠️⚠️ РЕЗОЛВ НЕ ОЗНАЧАЕТ УСПЕХ. Транспорт SaaS — fetch(...).then(r =>
        // r.json()) БЕЗ проверки res.ok (замер: 403 и 500 с JSON-телом приезжают
        // сюда как успех; пустое тело — наоборот, улетает в catch по парсингу).
        lbLastRaw = res;
        // РАЗБОР ТЕЛА — форма установлена ЖИВЫМ ПРОГОНОМ 2026-07-29 (борд
        // Blendo, площадки playgama и poki, два независимых прогона):
        //   POST → {uuid, leaderboardUuid, playerUuid, score, platformId,
        //           updatedAt, scoreAttemptStatus, scoreAttemptReasons[]}
        // ⚠️⚠️ СЕРВЕР ХРАНИТ МАКСИМУМ, И ОТКАЗ НЕВИДИМ ПО СТАТУСУ: меньшее
        // значение молча игнорируется, но ответ всё равно 201 и
        // scoreAttemptStatus:'normal' — поле, которое выглядит созданным ровно
        // для этого, не срабатывает. ЕДИНСТВЕННЫЙ честный признак: в теле
        // приходит СОХРАНЁННЫЙ счёт, а не присланный. Сравниваем с ним.
        const stored = res && typeof res.score === 'number' ? res.score : null;
        const accepted = stored === null ? null : stored === score;
        lbAccepted = accepted;
        // ⚠️ «Проигнорировано» — НЕ ошибка и НЕ повод для тревоги: это штатный
        // случай, когда текущий счёт ниже личного пика игрока. Пишем как факт.
        Telemetry.ev('lb', { s: score, st: stored, ok: accepted === true ? 1 : 0 });
      }).catch(()=>{
        // Сюда падает и НАСТОЯЩИЙ транспортный сбой, и успешная запись с пустым
        // телом. Различить нельзя — поэтому просто разрешаем повтор на следующей
        // победе, а не считаем «не сохранилось».
        lbLast = null;
        Telemetry.ev('lb', { s: score, err: 1 });
      });
    } catch(e){ lbLast = null; }
    return { ok: true, score };
  }
  function interWins(){ return Math.max(0, Save.iw || 0); }
  function noteWin(){
    Save.iw = interWins() + 1; commitSave();
    // ЛИДЕРБОРД шлём ОТСЮДА, а не из ядра: noteWin уже зовётся ровно раз за
    // победу и СТРОГО ПОСЛЕ bankLevelScore (80-gameplay: банк на строке выше
    // вызова) — значит счёт уже учтён. Ядро о лидерборде не знает, правок в
    // чужой зоне не потребовалось.
    // ⚠️ ИЗВЕСТНОЕ ПОВЕДЕНИЕ: leaderboardScore() меняется НЕ только на победе —
    // досрочный банк при покупке двигает его посреди партии. В таблицу уходит
    // значение НА КОНЕЦ УРОВНЯ; промежуточные изменения не отправляются.
    // Принято осознанно (диспетчер 2026-07-29): отправка привязана к
    // естественной точке, а не к каждому шевелению баланса.
    submitLeaderboardScore();
  }
  function maybeInterstitial(){
    // ОКНО БЕЗ РЕКЛАМЫ из бандла (77-save): гасит ТОЛЬКО межстраничные.
    // Rewarded НЕ трогаем — их игрок просит сам, и они несут заряды.
    if (typeof noAdActive === 'function' && noAdActive()) return;
    if (mode !== 'bridge') return;
    // ⚠️ ГВАРД ПОДДЕРЖКИ — СТРОГО ДО сброса окна. mode==='bridge' ставится по
    // isRewardedSupported, а межстраничная поддержана НЕ везде (в бандле это
    // разные геттеры, у части адаптеров интерстишл ещё и отключается конфигом
    // `advertisement.interstitial.disable`). Без гварда мы обнуляли накопленные
    // 5 побед там, где ролика не будет НИКОГДА, — окно скручивалось впустую.
    try { if (!window.bridge.advertisement.isInterstitialSupported) return; } catch(e){ return; }
    if (interWins() < INTER_EVERY_LEVELS) return;
    Save.iw = 0; commitSave(); // крестим окно СРАЗУ: повторный клик или поражение
    // между победами не должны выпустить второй ролик; при сбое показа
    // best-effort теряем один — лучше, чем спам-ретраи каждый переход
    try {
      // PLACEMENT — имя рекламного места. Адаптеры прокидывают его в нативные
      // SDK площадок (у Poki/GameSnacks это `name` в adBreak), и без него вся
      // статистика по местам слепая. У межстраничной место ровно одно.
      window.bridge.advertisement.showInterstitial('level_completed');
      if (stats) stats.lastAction = performance.now(); // миксер не ест предметы под рекламой
      Telemetry.ev('inter', { every: INTER_EVERY_LEVELS });
    } catch(e){}
  }
  return {
    init,
    noteWin,
    maybeInterstitial,
    cancel, // genLevel гасит висящий показ (колбэки замкнуты на старый level)
    get mode(){ return mode; },
    get lang(){ return bridgeLang; }, // язык игрока с площадки (под будущий словарь)
    // Первый ИГРАБЕЛЬНЫЙ кадр (зовут finishIntro/skipIntro). Идемпотентно и
    // терпит вызов до готовности SDK — тогда досылается из init.
    gameReady(){
      gameReadyWanted = true; sendGameReady();
      // не смогли отправить (initialize ещё/уже не резолвится) — взводим
      // страховку: игра-то готова, значит занавес поверх неё врёт
      if (!gameReadySent) armCurtainFallback();
    },
    // «ЗАНАВЕС ПЛОЩАДКИ УБРАН, ИГРОКА МОЖНО ПОКАЗЫВАТЬ» — однократный промис
    // с ГАРАНТИЕЙ срабатывания. Резолвится: сразу, если занавеса быть не может
    // (file://, SDK не загрузился, initialize упал); при отправке GAME_READY
    // (SDK снимает узел синхронно); либо страховкой через публичный
    // setGameLoadingProgress. Никогда не висит: жёсткий предел в init.
    // ⚠️ Дефолт — РЕЗОЛВИТЬ. Ошибиться в сторону «показать игру» безопасно,
    // в сторону «ждать вечно» — нет.
    get curtainGone(){ return curtainGone; },
    get curtainWhy(){ return curtainWhy; },   // отладка: чем именно разрешилось
    // Жизненный цикл уровня для площадки: LEVEL_STARTED/COMPLETED/PAUSED/
    // RESUMED. LEVEL_FAILED не шлём — поражения в игре нет (тупик = помол).
    msg: sendMsg,
    // ЛИДЕРБОРД (отправка живёт в noteWin). Наружу — только для сьюта и
    // будущего экрана: причина отказа, последнее отправленное и сырой ответ.
    submitScore: submitLeaderboardScore,
    lbWhy: lbBlockedWhy,
    get lbLast(){ return lbLast; },
    get lbRaw(){ return lbLastRaw; },
    // ⚠️ ЧИТАТЬ ТАК: true — счёт принят; false — НЕ ошибка, а «ниже личного
    // пика», сервер хранит максимум; null — ответ без поля score (сбой).
    get lbAccepted(){ return lbAccepted; },
    setBoardId(id){ if (DEV) lbBoardId = id || ''; },  // тест-хук: id боевой из 00-config
    // onFail (опционален) зовётся на FAILED/CLOSED/исключении — например,
    // вернуть кнопку «×2», которую спрятали на время показа
    // placement — имя рекламного места ('shake'/'continue'/'x2'/'magnet'),
    // прокидывается в нативный SDK площадки; без него статистика по местам
    // слепая. Необязателен: старые вызовы работают как раньше.
    showRewarded(onReward, onFail, placement){
      // Страховка: сирота прошлого показа (watchdog/стаб) не должен пережить
      // новый. ⚠️ НЕ полный cancel(): тот снимает паузу и МЬЮТ, а мы через
      // строку ставим их обратно — на этом «сняли-вернули» музыка успевала
      // рыпнуться и заиграть поверх начинающегося ролика (поймано ассертом
      // «трек не заводится под роликом»). Гасим только таймеры и колбэки;
      // A/V переарминает beginPending, единая точка снятия (endPending) цела.
      rewardCb = null; failCb = null; clearTimers(); hide('adOverlay');
      rewardCb = onReward; failCb = onFail || null;
      beginPending();
      if (mode === 'bridge'){
        // страховка ТОЛЬКО на полную тишину платформы (ни одного состояния)
        watchdog = setTimeout(()=>settleFail(false), 20000);
        try { window.bridge.advertisement.showRewarded(placement || 'rewarded'); }
        // исключение SDK = показа не было. Раньше тут открывался стаб —
        // БЕСПЛАТНАЯ награда без рекламы на боевой платформе (дыра экономики)
        catch(e){ settleFail(false); }
      } else if (DEV){
        showStub();   // локальная разработка: показать поток без настоящего ролика
      } else {
        // ⚠️ В БОЮ ЗАГЛУШКИ НЕТ (спека владельца 2026-07-29). Раньше на площадке
        // без поддержки роликов открывался НАШ экран «(rewarded video will play
        // here)», ждал 3 секунды и ВЫДАВАЛ награду. Рекламных встрясок на
        // уровень не ограничено — то есть бесконечная раздача бонусов при нулевом
        // доходе, причём игрок уверен, что смотрит рекламу. Показ поддельного
        // рекламного экрана — типовое основание для отказа на ревью площадки.
        // Нет ролика — нет награды, честный тост.
        settleFail(false);
      }
    },
    // отладка каденции (сьют): счётчик побед до следующего ролика
    get _winsSinceInter(){ return interWins(); },
  };
})();
// Отладочная ручка каденции для headless-сьюта (как __game для ядра): полный
// прогон 5 побед в тесте медленный и флейкозависимый, а noteWin/maybeInter —
// публичные методы Ads. Зона ИНТЕГРАЦИИ, снять = одна строка.
if (typeof window !== 'undefined' && DEV) window.__ads = Ads;
