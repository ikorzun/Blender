// ===== СВОЯ ТАБЛИЦА ЛИДЕРОВ — КЛИЕНТ (постановка docs/LEADERBOARD-OWN.md) =====
// Только ДАННЫЕ. Экран и врезка на победе — отдельными правками, поверх этого.
//
// Слово владельца 2026-08-07: «не будем мудрить и сейчас делать защиту от
// накрутки. Пока сделай хорошую простую основу для лидерборда с показом
// результата сразу по окончанию каждого уровня. Так же результат меняется,
// если игрок потратил деньги в коллекции на множитель».
//
// ⚠️⚠️ ЧЕТЫРЕ СОСТОЯНИЯ, И ТРИ ИЗ НИХ — НЕ ОШИБКИ. Экран обязан их различать,
// поэтому клиент отдаёт их ЯВНЫМ полем `state`, а не заставляет угадывать по
// пустому массиву:
//   'ok'      — список пришёл;
//   'early'   — сервер жив, но снимка ещё нет (признак `stale`, `t:0`).
//               ⛔ ЭТО НЕ ПОЛОМКА: топ строится кроном раз в час, сразу после
//               развёртывания он пуст ЗАКОННО. Показать «ошибка» здесь — соврать.
//   'offline' — сети/сервера нет;
//   'broken'  — ответ пришёл, но не по контракту (не JSON, нет полей).
// ⚠️ 'early' и 'broken' РАЗВЕДЕНЫ НАМЕРЕННО. Наш воркер деградирует МЯГКО и на
// упавшей базе отдаёт 200 — то есть признак поломки живёт В ТЕЛЕ, а не в коде
// ответа. Проверка по `res.ok` была бы зелёной на мёртвой таблице (этой ровно
// ошибкой уже болел серверный смоук — см. README сервера).

const LB_BASE = (function () {
  // Стенд разработки поднимается на 8788 рядом с превью игры (8779).
  // На боевой сборке адрес придёт из конфига Интеграции; пока пусто = выключено.
  try {
    const o = String(location.origin || '');
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(o)) return 'http://127.0.0.1:8788';
  } catch (e) {}
  return (typeof LB_URL === 'string' && LB_URL) ? LB_URL : '';
})();

const LB_TTL_MS = 20000;   // короткий кэш: врезка на победе и экран читают ОДНО
const LB_TIMEOUT_MS = 6000;

// ⚠️ КЛЮЧ ПОДПИСИ ПРИНИМАЕТСЯ СЕРВЕРОМ ТОЛЬКО ПРИ СОЗДАНИИ СТРОКИ
// (trust-on-first-use): прислать его к СУЩЕСТВУЮЩЕЙ строке нельзя, иначе любой
// желающий переписал бы чужую. Значит ключ обязан пережить перезапуск игры —
// потеряв его, игрок теряет и возможность обновлять СВОЮ строку навсегда.
// ⚠️ СЕЙЧАС ОН В localStorage, И ЭТО ВРЕМЕННО: правильное место — сейв (77-save,
// не моя зона), тогда он переживёт и чистку кэша, и переезд на второе устройство
// вместе с `Save.gid`. Запрос Мете отправлен; до него поведение честное, но
// «сменил устройство — новая строка».
const LB_KEY_LS = 'mixer_lb_key';

function lbKey() {
  try {
    let k = localStorage.getItem(LB_KEY_LS);
    if (k && /^[0-9a-f]{64}$/.test(k)) return k;
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    k = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(LB_KEY_LS, k);
    return k;
  } catch (e) { return ''; }
}

// Была ли строка уже создана (ключ отправляется РОВНО в первой отправке).
const LB_REG_LS = 'mixer_lb_reg';
function lbRegistered() { try { return localStorage.getItem(LB_REG_LS) === '1'; } catch (e) { return false; } }
function lbMarkRegistered() { try { localStorage.setItem(LB_REG_LS, '1'); } catch (e) {} }

async function lbSign(msg) {
  const keyHex = lbKey();
  if (!keyHex) return '';
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ⚠️⚠️ ЗАПРОСЫ ОБЯЗАНЫ ОСТАВАТЬСЯ «ПРОСТЫМИ» ПО CORS: тело `text/plain`, НИКАКИХ
// кастомных заголовков и `content-type: application/json`. Иначе браузер шлёт
// предполётный запрос, и КАЖДАЯ отправка стоит ДВА обращения вместо одного.
// Требование записано в контракте сервера — не «оптимизация», а условие.
async function lbFetch(path, opts) {
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, LB_TIMEOUT_MS);
  try {
    const res = await fetch(LB_BASE + path, Object.assign({ signal: ctl && ctl.signal }, opts || {}));
    clearTimeout(timer);
    // Тело у сервера ВСЕГДА непустой JSON, а успех — ПОЛЕ тела. Поэтому читаем
    // тело при любом коде: 409 (повтор) и 429 (частим) несут осмысленные данные.
    let body = null;
    try { body = JSON.parse(await res.text()); } catch (e) { return { state: 'broken', code: res.status }; }
    if (!body || typeof body !== 'object') return { state: 'broken', code: res.status };
    // ⚠️⚠️ РАЗОБРАЛСЯ JSON — ЕЩЁ НЕ УСПЕХ. Поймано ЖИВЫМ ПРОГОНОМ против стенда
    // 2026-08-07, до него код считал успехом ЛЮБОЕ разобранное тело: повторная
    // отправка возвращала `state:'ok'`, хотя сервер отвечал ошибкой. То есть
    // клиент бодро рапортовал «приняли» на 400/401/429 — ровно тот класс, что
    // мы ловим в стражах, только в боевом коде.
    // Ошибка у сервера — ПОЛЕ `err` (замер: битая подпись → 400 `{"err":"nokey"}`),
    // и она не зависит от кода ответа: он деградирует мягко и на упавшей базе
    // отвечает 200. Поэтому судим ПО ТЕЛУ.
    if (body.err) return { state: 'refused', code: res.status, err: String(body.err), body: body };
    return { state: 'ok', code: res.status, body: body };
  } catch (e) {
    clearTimeout(timer);
    return { state: 'offline' };
  }
}

// ===== ЧТЕНИЕ =====

let lbTopCache = null;   // { at, data }
let lbMeCache = null;

// ⚠️ ОДНА ТОЧКА ПОЛУЧЕНИЯ НА ДВУХ ПОТРЕБИТЕЛЕЙ (врезка на победе + экран
// таблицы). Две копии логики разъехались бы ровно на ТРАТЕ множителя — то есть
// в единственном месте, где владелец и просил числам сходиться.
// ⚠️⚠️ СБРОСИТЬ СВОЙ КЭШ НЕ ЗНАЧИТ ПОЛУЧИТЬ СВЕЖЕЕ. Поймано живым прогоном:
// после очистки таблицы на стенде клиент честно перезапросил `/v1/top` и снова
// получил СТАРЫЕ 24 строки с тем же `t` — ответ отдал HTTP-кэш браузера, у
// сервера на этом маршруте `max-age` 60 с. Своя память была сброшена, а число
// на экране не менялось бы ещё минуту — ровно там, где оно и обязано меняться
// (после победы и после траты на множитель).
// ⛔ ЛЕЧИТЬ ПОСТОЯННЫМ ОБХОДОМ КЭША НЕЛЬЗЯ: те 60 секунд у сервера НАМЕРЕННЫЕ,
// топ отдаётся из снимка и держит нагрузку. Поэтому обход РАЗОВЫЙ — метка
// живёт до следующего успешного чтения и тратится на него.
let lbBust = 0;
function lbInvalidate() { lbTopCache = null; lbMeCache = null; lbBust = Date.now(); }
function lbBustQ() { return lbBust ? '&_=' + lbBust : ''; }

async function lbTop(page) {
  const p = page || 1;
  if (lbTopCache && lbTopCache.p === p && Date.now() - lbTopCache.at < LB_TTL_MS) return lbTopCache.data;
  if (!LB_BASE) return { state: 'offline', rows: [] };
  const r = await lbFetch('/v1/top?p=' + p + lbBustQ(), { method: 'GET' });
  let out;
  if (r.state !== 'ok') out = { state: r.state, rows: [] };
  else if (!Array.isArray(r.body.r)) out = { state: 'broken', rows: [] };
  else if (r.body.stale || !r.body.t) {
    // ⛔ ИМЕННО ЗДЕСЬ ЖИВЁТ РАЗНИЦА «ПУСТО, ПОТОМУ ЧТО РАНО» И «ПУСТО, ПОТОМУ ЧТО
    // СЛОМАЛОСЬ». Признак берём из ТЕЛА (`stale`/`t`), а не из кода ответа.
    out = { state: 'early', rows: r.body.r.map(lbRow), total: r.body.n || 0, at: 0 };
  } else out = { state: 'ok', rows: r.body.r.map(lbRow), total: r.body.n || 0, at: r.body.t };
  if (out.state === 'ok' || out.state === 'early') lbBust = 0;  // метка потрачена
  lbTopCache = { p: p, at: Date.now(), data: out };
  return out;
}

// Строка снимка/соседей приходит тройкой [имя, аватар, счёт] — разворачиваем в
// объект здесь, чтобы экран не знал про порядок полей.
function lbRow(a) { return Array.isArray(a) ? { name: a[0], av: a[1], score: a[2] } : null; }

async function lbMe() {
  if (lbMeCache && Date.now() - lbMeCache.at < LB_TTL_MS) return lbMeCache.data;
  if (!LB_BASE) return { state: 'offline' };
  const id = (typeof guestId === 'function') ? guestId() : '';
  if (!id) return { state: 'offline' };
  const t = Math.floor(Date.now() / 1000);
  const sig = await lbSign(id + '.me.' + t);
  if (!sig) return { state: 'offline' };
  const r = await lbFetch('/v1/me?id=' + encodeURIComponent(id) + '&t=' + t + '&sig=' + sig + lbBustQ(), { method: 'GET' });
  let out;
  if (r.state !== 'ok') out = { state: r.state };
  else if (r.code === 404) out = { state: 'ok', me: null, rank: 0, up: [], dn: [] };
  else out = {
    state: 'ok',
    rank: r.body.rank || 0,
    exact: !!r.body.exact,
    score: r.body.s,
    up: (r.body.up || []).map(lbRow).filter(Boolean),
    dn: (r.body.dn || []).map(lbRow).filter(Boolean),
  };
  lbMeCache = { at: Date.now(), data: out };
  return out;
}

// ===== ОТПРАВКА =====

let lbSending = false;
let lbLastQ = 0;

// ⚠️⚠️ ЗВАТЬ ТОЛЬКО ПОСЛЕ `bankLevelScore` — иначе место отстанет РОВНО НА ОДИН
// УРОВЕНЬ. Симптом коварный: число правдоподобное, просто вчерашнее, и на глаз
// это не ловится.
// ✅ ПОРЯДОК В ИГРЕ УЖЕ ВЕРНЫЙ, сверено диспетчером ПО КОДУ 2026-08-07:
// `80-gameplay.js` банкует счёт, и только потом идёт `Ads.noteWin()`, внутри
// которого отправка; в `78-ads.js` у этого места стоит объяснение, что вызов
// положили в `noteWin` именно потому, что он случается ровно раз за победу и
// строго после банка. Чинить тут нечего — но и ломать нельзя.
// ⚠️⚠️ А ВОТ ДЛЯ ВРЕЗКИ НА ПОБЕДЕ ЭТОГО МАЛО, И ЭТО НЕОЧЕВИДНО: в ответе на
// отправку `rank` идёт с `exact: 0` — это ОЦЕНКА по последнему снимку, а не
// точное место. Точное (`exact: 1`) и соседи `up`/`dn` есть ТОЛЬКО у `/v1/me`.
// Значит последовательность врезки строго такая:
//     банк → `lbSubmit()` → ДОЖДАТЬСЯ ответа → `lbMe()` → рисовать.
// ⛔ Позвать `lbMe()` ПАРАЛЛЕЛЬНО с отправкой — получить место ДО учёта только
// что сыгранной партии, то есть тот же «отстало на уровень», только теперь уже
// не из-за банка. Кэш этому не мешает: `lbSubmit` сбрасывает его сам.
async function lbSubmit() {
  if (!LB_BASE || lbSending) return { state: 'offline' };
  const id = (typeof guestId === 'function') ? guestId() : '';
  const nm = (typeof guestName === 'function') ? guestName() : '';
  const av = (typeof guestAvatar === 'function') ? guestAvatar() : 0;
  const s = (typeof leaderboardScore === 'function') ? leaderboardScore() : 0;
  if (!id || !nm) return { state: 'offline' };
  lbSending = true;
  try {
    const t = Math.floor(Date.now() / 1000);
    // `q` — номер попытки: по нему сервер отличает ПОВТОР (409 dup) от новой
    // отправки. Растёт монотонно, иначе повтор выглядел бы новой записью.
    const q = Math.max(lbLastQ + 1, t);
    lbLastQ = q;
    const sig = await lbSign(id + '.' + s + '.' + q + '.' + t);
    if (!sig) return { state: 'offline' };
    const payload = { id: id, n: nm, a: av, s: s, q: q, t: t, sig: sig };
    // Ключ уходит РОВНО в первой отправке (создание строки); к существующей
    // сервер его не примет — и это не наша ошибка, а его защита.
    if (!lbRegistered()) payload.k = lbKey();
    const r = await lbFetch('/v1/score', { method: 'POST', body: JSON.stringify(payload) });
    if (r.state !== 'ok') return { state: r.state };
    if (r.body.ok) lbMarkRegistered();
    lbInvalidate();
    return {
      state: 'ok',
      dup: !!r.body.dup,
      rank: r.body.rank || 0,
      exact: !!r.body.exact,
      // ⚠️ ОБА ЧИСЛА НАРУЖУ, И ЭТО НЕСУЩЕЕ: `sent` — что мы отправили,
      // `score` — что сервер записал. Сегодня они совпадают, но экран обязан
      // уметь показать расхождение: как только сервер начнёт что-то делать со
      // счётом, разница станет единственным способом это заметить.
      sent: s,
      score: r.body.s,
    };
  } finally { lbSending = false; }
}

// Трата на множитель меняет место — сбрасываем кэш, чтобы врезка и экран
// показали свежее число, а не прошлую партию (прямое слово владельца).
try { if (typeof onStarsChange === 'function') onStarsChange(function () { lbInvalidate(); }); } catch (e) {}

// ⚠️ ТЕСТОВАЯ ПОВЕРХНОСТЬ — СВОЙ ОБЪЕКТ, А НЕ `__game`. Причина не в
// брезгливости: `__game` — ОДИН литерал в 99-main (чужая зона), и два
// определения одного имени там не конфликтуют, а молча затирают друг друга —
// хук начинает отдавать `undefined`, то есть правдоподобные нули. Проект на
// этом уже обжигался (`itemsBrief`). Своё пространство имён такой встречи
// исключает ПО ПОСТРОЕНИЮ.
window.__lb = {
  top: lbTop, me: lbMe, submit: lbSubmit, invalidate: lbInvalidate,
  base: function () { return LB_BASE; },
};
