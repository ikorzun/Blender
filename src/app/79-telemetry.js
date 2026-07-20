// ===== 79-telemetry: beacon-каркас (план v1, корректировка №2) =====
// Endpoint пуст — телеметрия ВЫКЛЮЧЕНА (no-op). Включение одной строкой:
// URL воркера владельца (Cloudflare, как platform-landings) — события уйдут
// батчами через sendBeacon. Схема события: {t, s: session, n: name, ...поля}.
const Telemetry = (function(){
  const URL = ''; // например 'https://mixer-telemetry.<аккаунт>.workers.dev/e'
  let buf = [];
  const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function ev(name, data){
    if (!URL) return;
    buf.push(Object.assign({ t: Date.now(), s: sid, n: name }, data || {}));
    if (buf.length >= 12) flush();
  }
  function flush(){
    if (!URL || !buf.length) return;
    try { navigator.sendBeacon(URL, JSON.stringify(buf)); } catch(e){}
    buf = [];
  }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  return { ev, flush };
})();
