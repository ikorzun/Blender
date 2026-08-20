// ===== 75-audio: процедурный звук (WebAudio, без ассетов) и вибрация =====
// Контекст создаётся/резюмится только по жесту пользователя (требование iOS) —
// Sound.unlock() вешается на pointerdown в 90-input.

const Sound = (function(){
  let ctx = null, master = null;
  function ensure(){
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      // ⚠️ НЕ хардкод 0.5, а applyGain() — ЩЕЛЬ, найденная диспетчером на мерже
      // правки громкости (2026-07-30): master создаётся ЛЕНИВО по первому жесту,
      // а восстановление ползунка из localStorage (applySoundVol на старте,
      // 85-hud) отрабатывает РАНЬШЕ, когда master ещё null и applyGain — no-op.
      // С хардкодом восстановленные 40% ИГРАЛИ НА ПОЛНОЙ громкости до первого
      // касания ползунка или мьюта рекламы. Замер стража ниже: гейн после
      // холодного старта обязан быть 0.5·playerVol, а не 0.5.
      master.connect(ctx.destination);
      applyGain();
    } catch(e){ ctx = null; }
  }
  // Сэмплы из 74-sfx-data: декод лениво после unlock. m4a/AAC декодится
  // везде (ogg Safari НЕ умеет — потому конверсия на этапе интеграции).
  // При недоступности сэмпла звук честно падает на процедурный вариант.
  const buffers = {};
  function b64buf(b64){
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function loadSamples(){
    if (!ctx || loadSamples.done) return;
    loadSamples.done = true;
    for (const k in SFX_B64){
      try { ctx.decodeAudioData(b64buf(SFX_B64[k]), buf => { buffers[k] = buf; }, ()=>{}); }
      catch(e){}
    }
  }
  // ⚠️⚠️ ТРЕТИЙ АРГУМЕНТ `v` — РАЗНООБРАЗИЕ, И ОН НЕОБЯЗАТЕЛЕН ПО ЗАМЫСЛУ.
  // Слово владельца 2026-08-10: «сделай web audio разнообразным ТОЛЬКО для 3
  // ⚠️ ЗАПИСЕЙ ТЕПЕРЬ ПЯТЬ (2026-08-20-г/е: пластик и звери озвучены впервые), и
  // разнообразие пришло к нему САМО — ветка смотрит на НАЛИЧИЕ БУФЕРА, а не на
  // список имён. Спека «только для добавленных звуков» этим не нарушена: она
  // отделяла записи владельца от процедурного звука, а не считала их штуки.
  // добавленных новых звуков» — это его записи материалов (mat_juicy/metal/
  // glass). Все прочие потребители (`grind`, `ui`, `crunch`) зовут функцию
  // ДВУМЯ аргументами и идут прежним путём бит-в-бит.
  // ⛔ ИМЕННО ПОЭТОМУ РАЗНООБРАЗИЕ — АРГУМЕНТ, А НЕ ПОВЕДЕНИЕ ПО УМОЛЧАНИЮ:
  // «только для трёх» тогда держится СТРУКТУРОЙ, а не дисциплиной того, кто
  // будет править файл следующим. Страж на это опирается: `grind` — тоже
  // сэмпл и тоже через playBuf, и он обязан остаться с rate ровно 1.
  function playBuf(name, peak, v){
    const buf = buffers[name];
    if (!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    if (v && v.rate) src.playbackRate.value = v.rate;
    // Панорама — только если браузер её умеет; нет ноды, значит звук по центру,
    // и это НЕ повод тянуть PannerNode с HRTF: та на мобиле считает свёртку на
    // КАЖДЫЙ источник, а совмещение случается по нескольку раз в секунду.
    let pan = null;
    if (v && v.pan != null && ctx.createStereoPanner){
      try { pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, v.pan)); }
      catch (e) { pan = null; }
    }
    // ⚠️⚠️ √2 — ЭТО ВОЗВРАТ СЪЕДЕННОЙ ГРОМКОСТИ, А НЕ УСИЛЕНИЕ. Все три записи
    // владельца МОНО (проверено заголовками WAV: 1 канал, 46875 Гц, 16 бит).
    // Моно БЕЗ панорамы апмиксится КОПИЕЙ в оба канала — ×1.0; моно ЧЕРЕЗ
    // StereoPanner идёт equal-power и на ЛЮБОМ значении панорамы отдаёт ×0.707,
    // то есть РОВНО −3.01 дБ. Замерено в OfflineAudioContext: мощность
    // 0.25 → 0.125 при pan 0 / 0.33 / 0.6 — потеря не зависит от места.
    // ⛔ БЕЗ ЭТОЙ СТРОКИ записи владельца звучат тише процедурного «буля»,
    // который идёт в master напрямую, — то есть тише играет ровно то, что он
    // записал. И хуже: на старом iOS панорамы НЕТ вовсе, там те же записи шли
    // бы на 3 дБ ГРОМЧЕ — один звук разной громкости на разных телефонах.
    // ⚠️ ВЕРНО ТОЛЬКО ДЛЯ МОНО. Придут стерео-дубли — пересмотреть: у стерео
    // входа StereoPanner уровень не режет.
    // ⚠️ ПОРЯДОК НЕСУЩИЙ: гейн считается ПОСЛЕ решения о панораме, потому что
    // зависит от него. Переставить строки местами нельзя.
    const g = ctx.createGain();
    g.gain.value = (peak || 0.7) * (pan ? Math.SQRT2 : 1);
    src.connect(g);
    if (pan){ g.connect(pan); pan.connect(master); } else { g.connect(master); }
    // ⚠️ ОТСОЕДИНЯЕМ ПОСЛЕ ОКОНЧАНИЯ: Safari не спешит собирать отключённые
    // ноды сам, а при частых матчах их накапливаются сотни. Прежний путь (две
    // ноды на звук) это терпел, с панорамой их три.
    src.onended = function(){ try { src.disconnect(); g.disconnect(); if (pan) pan.disconnect(); } catch (e) {} };
    src.start();
    return true;
  }
  function unlock(){
    ensure();
    // не только 'suspended': iOS после звонка/сворачивания даёт 'interrupted' —
    // резюмим из ЛЮБОГО не-running состояния, иначе звук молчал до перезагрузки
    if (ctx && ctx.state !== 'running'){ try { ctx.resume(); } catch(e){} }
    loadSamples();
  }
  function env(t0, a, d, peak){
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
    g.connect(master);
    return g;
  }
  function tone(freq, type, t0, a, d, peak){
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(env(t0, a, d, peak));
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  function noise(t0, d, peak, cutoff){
    const len = Math.max(1, Math.floor(ctx.sampleRate * d));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 800;
    src.connect(f); f.connect(env(t0, 0.005, d, peak));
    src.start(t0);
  }
  const fxMap = {
    match(a){ // «буль»-арпеджио, выше и длиннее при большой группе.
      // Аргумент: число (совместимость) ЛИБО {n, k} — k = длина серии,
      // питч растёт лесенкой с темпом (пакет темпа 2026-07-31), кап +60%.
      const n = (a && a.n) || a || 2, k = (a && a.k) || 0;
      // ⚠️⚠️ ГОЛОС МАТЕРИАЛА ГЛАВНЕЕ ПРОЦЕДУРНОГО «БУЛЯ», НО НЕ ОБЯЗАТЕЛЕН.
      // Записан не весь набор (владелец прислал фрукты, металл и стекло) —
      // у остальных голосов сэмпла нет, и они ДОЛЖНЫ звучать как раньше.
      // ⛔ Поэтому здесь не `if (материал)`, а проверка НАЛИЧИЯ БУФЕРА: тип
      // размечен всегда, а звук — пока нет, и путать эти два условия значит
      // молча оглушить девять десятых пула.
      // ⚠️ ГРОМКОСТЬ РАСТЁТ С РАЗМЕРОМ ГРУППЫ, а не фиксирована: у процедурного
      // «буля» размер слышен длиной арпеджио, и сэмпл без этого читался бы как
      // «звук перестал реагировать на игру». Питч серии сюда НЕ переносим —
      // на записи он звучал бы как ускоренная плёнка.
      // ⚠️⚠️ РАЗНООБРАЗИЕ ТОЛЬКО ЗДЕСЬ (слово владельца 2026-08-10). Записанный
      // сэмпл, повторённый один в один, ухо ловит как «зациклило» уже к пятому
      // разу — процедурный «буль» этим не болел, он каждый раз считается заново.
      // ⛔ ROUND ROBIN ОТМЕНЁН ВЛАДЕЛЬЦЕМ (2026-08-11: «убери дубли записей
      // звука»). Я предлагал писать по 2-3 дубля на голос, чтобы включить
      // выбор как у `grind`, — он отказался. ⛔ Значит РАЗНООБРАЗИЕ ДЕРЖИТСЯ
      // ЦЕЛИКОМ НА ПИТЧЕ И ПАНОРАМЕ, и трогать их «за ненадобностью» нельзя:
      // без них одна запись читалась бы как зацикленная уже к пятому разу.
      // ⚠️ Не заводить дубли и «на будущее»: каждая запись едет в пакет
      // портала, а запас до лимита 8 МБ у нас 1.4 МБ на всё остальное.
      // ⚠️ ПИТЧ ПО РАЗМЕРУ — формула владельца 1/√размер: крупная вещь звучит
      // ниже, мелкая выше. Берём охватный радиус ТАПНУТОГО предмета: он несёт и
      // калибр типа, и разброс размеров уровня.
      // ⚠️⚠️ ОПОРА — `MESH_SCALE`, А НЕ ЕДИНИЦА, И ЭТО НЕ КОСМЕТИКА. `it.r` это
      // `rc · размерУровня · MESH_SCALE` (40-items:117), то есть у типичного
      // предмета (`rc:1.0`, а таких 107 из 120) он равен 0.62, а не 1. Пивот на
      // единице зашивал постоянный множитель 1/√0.62 = 1.27: ЗАМЕР на живых
      // матчах давал 12 значений из 12 ВЫШЕ единицы (медиана 1.12), то есть
      // «крупнее — ниже» вырождалось в «всё ускорено, крупное чуть меньше».
      // ⛔ И ЦЕНА БЫЛА НЕ ТОЛЬКО СМЫСЛОВОЙ: Blink и WebKit ресемплят
      // `AudioBufferSourceNode` линейной интерполяцией (это почти весь мобильный
      // трафик), и повышение тона — это децимация без антиалиасинга. Постоянная
      // работа выше единицы заворачивала верх спектра у КАЖДОГО совмещения.
      // ⚠️ Опора берётся ТОЙ ЖЕ константой, из которой собран радиус, а не
      // литералом 0.62: копия числа рядом с рабочим всегда расходится потом.
      // ⚠️ КОРИДОР 0.72..1.38 — НЕ УКРАШЕНИЕ: за его пределами короткая запись
      // читается уже не как «тот же материал крупнее», а как другой звук, и
      // материал перестаёт узнаваться на слух — ровно то, ради чего он записан.
      // ⚠️ ДЖИТТЕР ±5% берём ИЗ ОБРАЗЦА ВЛАДЕЛЬЦА (0.95..1.05) — он и даёт
      // «каждый раз чуть иначе» там, где размер одинаков (уровни 1-19 идут
      // ОДНИМ размером, SIZE_UNIFORM_LEVELS: без джиттера там нет разнообразия
      // вовсе, и это самые первые полчаса игрока).
      if (a && a.m){
        const r = Math.max(0.05, (a && a.r) || MESH_SCALE);
        const rate = Math.max(0.72, Math.min(1.38,
          Math.sqrt(MESH_SCALE / r) * (0.95 + Math.random() * 0.1)));
        if (playBuf('mat_' + a.m, 0.5 + 0.06 * Math.min(6, n),
                    { rate, pan: (a && a.pan != null) ? a.pan : null })) return;
      }
      const pitch = 1 + 0.06 * Math.min(10, k);
      const t = ctx.currentTime, base = (380 + Math.min(4, n)*60) * pitch;
      for (let i=0;i<Math.min(n,4);i++) tone(base*Math.pow(1.25, i), 'sine', t + i*0.055, 0.008, 0.16, 0.45);
    },
    tick(){ // тревога у края окна серии (пакет темпа): сухой короткий «тк»,
            // тихий — периферийный сигнал, не событие
      const t = ctx.currentTime; tone(1250, 'sine', t, 0.002, 0.035, 0.10); },
    miss(){ const t = ctx.currentTime; tone(150, 'square', t, 0.005, 0.12, 0.16); tone(110, 'square', t+0.07, 0.005, 0.12, 0.13); },
    shake(){ noise(ctx.currentTime, 0.35, 0.45, 500); },
    grind(){ // сэмпл дробления (3 варианта, спека владельца) с процедурным фолбэком
      if (playBuf('grind' + (1 + Math.floor(Math.random()*3)), 0.8)) return;
      const t = ctx.currentTime; noise(t, 0.45, 0.5, 300); tone(70, 'sawtooth', t, 0.01, 0.4, 0.22); },
    crunch(n){ // «хруст» скола твёрдой пачки (brick/pirate -> осколки).
      // СПЕКТР ВЫШЕ рокота grind (тот низкий, cutoff 300 + 70 Гц) — на общей
      // куче они не маскируют друг друга: рокот лопастей внизу, треск раскола
      // сверху. Тело — короткий фильтрованный шум, поверх пара сухих щелчков
      // (раскол «тк»). Чуть жёстче на большой группе (n осколков), кап 12.
      const t = ctx.currentTime, k = Math.min(1, (n || 7)/12);
      noise(t, 0.10 + 0.05*k, 0.30 + 0.12*k, 2600);   // резкий верхний скол
      noise(t + 0.015, 0.09, 0.18, 1300);             // тело хруста
      tone(190, 'square', t,        0.002, 0.05, 0.13);
      tone(130, 'square', t + 0.03, 0.002, 0.06, 0.10); },
    ui(){ if (!playBuf('ui', 0.5)){ const t = ctx.currentTime; tone(900, 'sine', t, 0.004, 0.05, 0.15); } },
    combo(){ // «пауэр-ап»: восходящее глиссандо + искорка; старт с задержкой,
             // чтобы не маскировать «буль» матча, звучащий в тот же тап
      const t = ctx.currentTime + 0.06;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(1260, t + 0.18);
      o.connect(env(t, 0.01, 0.22, 0.4));
      o.start(t); o.stop(t + 0.3);
      tone(1568, 'sine', t + 0.16, 0.005, 0.12, 0.3);  // искорка сверху
      tone(2093, 'sine', t + 0.22, 0.005, 0.14, 0.22);
    },
    chain(){ // «реактор пошёл»: низкое глиссандо + свуш + фанфарная искра
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.35);
      o.connect(env(t, 0.02, 0.4, 0.3));
      o.start(t); o.stop(t + 0.5);
      noise(t + 0.05, 0.35, 0.3, 1200);
      [784, 1047, 1568].forEach((f,i)=>tone(f, 'triangle', t + 0.3 + i*0.07, 0.008, 0.2, 0.32));
    },
    surprise(){ const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f,i)=>tone(f, 'triangle', t + i*0.09, 0.01, 0.25, 0.38)); },
    win(){ const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f,i)=>tone(f, 'triangle', t + i*0.12, 0.01, 0.3, 0.38)); },
    lose(){ const t = ctx.currentTime; [330, 262, 196].forEach((f,i)=>tone(f, 'sine', t + i*0.15, 0.01, 0.35, 0.32)); },
  };
  // ВНЕШНИЙ МЬЮТ — НЕЗАВИСИМЫЙ ОТ CFG.sound (запрос ИНТЕГРАЦИИ 2026-07-23).
  // Два разных владельца тишины: CFG.sound — выбор ИГРОКА (тумблер настроек),
  // extMuted — требование СРЕДЫ (рекламный ролик, площадка прислала
  // AUDIO_STATE_CHANGED). Мешать их нельзя: «сохранить и восстановить»
  // CFG.sound — гонка с игроком, который может открыть настройки под роликом
  // и получить затёртый выбор. Глушим master-гейном, а не флагом: уже
  // звучащие сэмплы обрываются тоже, иначе хвост звука лез бы поверх рекламы.
  let extMuted = false;
  // ГРОМКОСТЬ ИГРОКА 0..1 (ползунок Sound в настройках, 85-hud/applySoundVol).
  // ⚠️ ДОБАВЛЕНО ИНТЕРФЕЙСОМ 2026-07-30 по жалобе владельца «ползунок Sound не
  // сохраняет состояние»: до этого состоянием звука был ТОЛЬКО булев CFG.sound,
  // и ползунок 0..100 физически не мог ничего сохранить — громкости в тракте
  // не существовало. БАЗОВЫЙ УРОВЕНЬ МАСТЕРА 0.5 (запас на клиппинг) СОХРАНЁН:
  // при playerVol=1 гейн ровно 0.5, как было до правки, бит-в-бит.
  // ⚠️ ВНЕШНИЙ МЬЮТ СИЛЬНЕЕ: extMuted=true глушит в 0 при любой громкости —
  // иначе игрок, двинувший ползунок под рекламой, завёл бы звук поверх ролика.
  let playerVol = 1;
  function applyGain(){ if (master) master.gain.value = extMuted ? 0 : 0.5 * playerVol; }
  return {
    unlock,
    loaded(){ return Object.keys(buffers); }, // отладка: какие сэмплы декодированы
    setMuted(on){ extMuted = !!on; ensure(); applyGain(); return extMuted; },
    setVolume(v){ playerVol = Math.max(0, Math.min(1, +v || 0)); applyGain(); return playerVol; },
    volume(){ return playerVol; },
    // диагностика для стражей: НАСТОЯЩИЙ гейн мастера (volume() отдаёт лишь
    // playerVol и не видит расхождения с движком — на этом и жила щель выше)
    gain(){ return master ? master.gain.value : null; },
    isMuted(){ return extMuted; },
    play(name, arg){
      if (!CFG.sound || extMuted) return;
      ensure();
      if (!ctx || ctx.state !== 'running') return;
      try { fxMap[name](arg); } catch(e){}
    },
  };
})();
function vibrate(ms){ if (CFG.sound && navigator.vibrate){ try { navigator.vibrate(ms); } catch(e){} } }
