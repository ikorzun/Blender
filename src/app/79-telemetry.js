// ===== 79-telemetry: beacon-каркас + ловля крешей + экраны/отвалы =====
// Endpoint пуст — отправка ВЫКЛЮЧЕНА (no-op). Включение одной строкой:
// URL воркера владельца (Cloudflare, как platform-landings) — события уйдут
// батчами через sendBeacon. Схема события: {t, s: session, n: name, ...поля}.
// Набор метрик и что каким решением закрывается — docs/METRICS.md.
const Telemetry = (function(){
  const URL = ''; // например 'https://mixer-telemetry.<аккаунт>.workers.dev/e'
  let buf = [];
  const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();
  // ⚠️ БУФЕР КОПИТСЯ ДАЖЕ ПРИ ПУСТОМ URL. Раньше ev() выходил сразу, и до
  // включения endpoint'а телеметрию нельзя было ни отладить, ни проверить
  // тестом — «работает ли» выяснялось бы уже на проде. Теперь события живут
  // в кольце (кап RING), отправки по-прежнему нет: __game.telemetry() их
  // показывает, ассерты сьюта проверяют по нему.
  const RING = 200;
  function ev(name, data){
    const e = Object.assign({ t: Date.now(), s: sid, n: name }, data || {});
    buf.push(e);
    if (buf.length > RING) buf.splice(0, buf.length - RING);
    if (URL && buf.length >= 12) flush();
    return e;
  }
  function flush(){
    if (!URL || !buf.length) return;
    try { navigator.sendBeacon(URL, JSON.stringify(buf)); } catch(e){}
    buf = [];
  }
  // ⚠️ КРЕШ ШЛЁТСЯ НЕМЕДЛЕННО, не по батчу: следующая строка кода может убить
  // страницу, и накопленное уйдёт в никуда вместе с причиной.
  function sendNow(e){
    if (!URL) return;
    try { navigator.sendBeacon(URL, JSON.stringify([e])); } catch(_){}
  }

  // ===== КРЕШИ (docs/METRICS.md §6) =====
  // Три источника: синхронные ошибки, упавшие промисы и ПОТЕРЯ WEBGL-КОНТЕКСТА
  // (в 3D на мобильных это самый частый «креш»: игра не падает, но экран
  // чернеет — без своего события выглядело бы как обычный уход игрока).
  const seen = new Set();      // дедуп по сигнатуре: одна и та же — раз за сессию
  let errCount = 0;            // потолок: цикл ошибок не должен затопить приём
  const ERR_CAP = 5;
  function ctx(){
    // где именно упало — без этого стек мало что даёт
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
    }), {});
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

  // ===== ЭКРАНЫ И ОТВАЛЫ (docs/METRICS.md §3 и §5) =====
  // Время меряем по УХОДУ с экрана — только тогда известна длительность.
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
      // экраны-«моргания» (< 150 мс) не пишем: это переходы, а не просмотры
      if (ms >= 150) ev('screen', { v: cur, ms: ms, lv: ctx().lv });
      cur = null;
    }
    return { enter, leave, current: () => cur };
  })();

  // ===== КАРТА ТАПОВ (docs/METRICS.md §4) =====
  // Сектор 3×3, а НЕ координаты: точный heat-map требует нормировки под сотни
  // разрешений и хранит на порядок больше данных, а решения («палец закрывает
  // низ-центр») читаются уже по секторам.
  function tap(x, y, result){
    const col = x < innerWidth / 3 ? 'l' : x < innerWidth * 2 / 3 ? 'c' : 'r';
    const row = y < innerHeight / 3 ? 't' : y < innerHeight * 2 / 3 ? 'm' : 'b';
    ev('tap', { z: row + col, r: result, lv: ctx().lv });
  }

  // уход со вкладки = отвал: фиксируем ГДЕ и В КАКОМ состоянии бросили
  addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
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

  return { ev, flush, err, tap, screen: Screen, buffer: () => buf.slice(), sid };
})();
