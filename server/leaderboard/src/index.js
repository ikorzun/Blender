// ===== СВОЯ ТАБЛИЦА ЛИДЕРОВ — Cloudflare Worker + D1 =====
// Постановка: docs/LEADERBOARD-OWN.md. Здесь только сервер; клиент —
// отдельный модуль игры (src/app/82-lb.js), ядро игры не правится.
//
// ⚠️⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ПЛОЩАДКИ: пишем ПОСЛЕДНЕЕ значение, а не максимум.
// Ради этого таблица и своя — сервер Playgama хранит максимум и понижать не
// умеет, а владельцу нужна «Форбс»-модель: потратил очки — упал в списке.
//
// ⛔⛔ ЗАЩИТЫ ОТ НАКРУТКИ ЗДЕСЬ НЕТ — ЭТО РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-08-09.
// Дословно: «давай не будем мудрить и сейчас делать защиту от накрутки. Пока
// сделай хорошую простую основу для лидерборда». Возрастной потолок
// (`GROW_BASE`/`GROW_PER_S`), обрезка счёта и автоматическое скрытие УДАЛЕНЫ
// целиком, а не заглушены флагом — история в git, возврат `git revert`.
// ⚠️ ЦЕНА НАЗВАНА ВЛАДЕЛЬЦУ И ПРИНЯТА: счёт считает КЛИЕНТ, сервер проверить
// его не может, поэтому любой желающий пришлёт любое число и встанет первым,
// не сыграв. Это осознанный размен «простота сейчас» против «честность
// таблицы», а не недосмотр.
//
// ⚠️⚠️ ЧТО ОСТАЛОСЬ И ПОЧЕМУ ЭТО НЕ «ЗАЩИТА ОТ НАКРУТКИ» (снести заодно —
// типичная ошибка, поэтому список явный):
//   • `sig` — ПРАВО СОБСТВЕННОСТИ на строку. Без подписи посторонний
//     перезапишет чужой результат и удалит чужие данные. Игрока защищаем от
//     ПОСТОРОННЕГО, а не от него самого.
//   • `RATE_SEC` — бережёт НАШ бесплатный тариф (лимит запросов к базе), а не
//     честность. Снять — первый же цикл отправок съест суточную квоту.
//   • `/admin/hide` и флаг `f` — ручная модерация. Теперь она ЕДИНСТВЕННАЯ:
//     автоматики, которая пряталa строку сама, больше нет.

const RATE_SEC   = 20;      // не чаще одной записи в 20 с на игрока
const SKEW_SEC   = 300;     // допуск часов клиента
const TOP_N      = 100;     // сколько строк держим в снимке
const PAGE_N     = 50;      // строк на странице /top
const NEAR_N     = 5;       // соседей выше и ниже в /me
const LADDER_STEP= 100;     // лесенка: счёт на каждом сотом месте
const KEEP_DAYS  = 180;     // ретенция молчащих строк

// ⚠️ ОТВЕТ ВСЕГДА НЕПУСТОЙ JSON, а успех кодируется ПОЛЕМ ТЕЛА, не статусом.
// Причина записана в постановке: если когда-нибудь пойдём через транспорт
// бриджа, он делает `fetch().then(r=>r.json())` БЕЗ проверки `res.ok` —
// пустое тело приезжает как провал, а 500 с телом как успех.
// ⚠️ CORS «простой»: тело text/plain, никаких кастомных заголовков — иначе
// каждый запрос стоил бы ДВА (preflight), а суточный лимит воркера штучный.
function reply(obj, status, extraHeaders) {
  const h = {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
  };
  if (extraHeaders) Object.assign(h, extraHeaders);
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}

// ⚠️ Preflight нужен РОВНО ОДНОМУ эндпоинту — DELETE /v1/me: метод DELETE не
// входит в «простые» по спецификации CORS и предполётный запрос неизбежен.
// Это осознанно: удаление своих данных случается раз в жизни игрока и не
// лежит на горячем пути, в отличие от отправки счёта.
function preflight() {
  return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }});
}

const nowSec = () => Math.floor(Date.now() / 1000);
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const intOr = (v, d) => (Number.isFinite(v) ? Math.floor(v) : d);

// ===== ПОДПИСЬ =====
// HMAC-SHA256 по строке `id.s.q.t`. Ключ клиент присылает ОДИН раз, при
// создании строки (trust-on-first-use под TLS).
// ⚠️⚠️ КЛЮЧ ПРИНИМАЕТСЯ ТОЛЬКО ПРИ СОЗДАНИИ. Если разрешить присылать `k`
// существующей строке, любой желающий перезапишет чужой ключ своим и заберёт
// строку себе — это была бы дыра размером со всю защиту.
async function hmacHex(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Сравнение за постоянное время: обычный `===` на строках выходит раньше при
// первом несовпадении и по времени ответа подсказывает подбор побайтно.
function sameSig(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ===== ЛЕСЕНКА РАНГОВ =====
// Массив счетов на местах 100, 200, 300… (по убыванию). Оценка места стоит
// НОЛЬ строк D1 — это и есть то, из-за чего смета сходится: точный
// `COUNT(*) WHERE s > ?` для игрока на 30 000-м месте стоил бы 30 000
// прочитанных строк на КАЖДОЙ отправке.
// ⚠️⚠️ ОТДАЁТ ГРАНИЦУ «НЕ ЛУЧШЕ N», А НЕ МЕСТО, И `null` — ЗАКОННЫЙ ОТВЕТ.
// Здесь стояло `return 1`, и это была не опечатка, а ЛОЖЬ УВЕРЕННОСТИ, причём
// ровно в тот период, когда на таблицу и будут смотреть:
//   • лесенка строится по каждому СОТОМУ месту, значит при базе меньше сотни
//     игроков она ПУСТА — и «место 1» получал КАЖДЫЙ, все первые недели после
//     запуска (поймано живым прогоном клиента, диагноз диспетчера 2026-08-09);
//   • тот же дефект жил на шаг глубже и пережил бы починку первого: игрок ВЫШЕ
//     первой ступени (`lo === 0`) тоже получал единицу, хотя про него известно
//     лишь «где-то в первой сотне».
// Формально контракт был честен — рядом едет `exact: 0`. Но поле называется
// `rank`, и живой потребитель прочёл его как настоящее место в первый же день.
// ⚠️ ЗНАЧЕНИЕ, КОТОРОЕ НЕЛЬЗЯ ПЕРЕПУТАТЬ, ЛУЧШЕ ПОМЕТКИ, КОТОРУЮ МОЖНО НЕ
// ЗАМЕТИТЬ: где границы нет — отдаём `null`, и экран сам решает, что показать.
// ⛔ ТОЧНОЕ МЕСТО ЖИВЁТ ТОЛЬКО В `/v1/me` (`exact: 1`). Оценка — подсказка, и
// стоит она НОЛЬ строк D1; ради этого лесенка и заведена.
function estimateRank(ladder, score) {
  if (!ladder || !ladder.length) return null;   // меньше сотни игроков — сказать нечего
  let lo = 0, hi = ladder.length;
  while (lo < hi) {                       // ищем первую ступень НИЖЕ нашего счёта
    const mid = (lo + hi) >> 1;
    if (ladder[mid] >= score) lo = mid + 1; else hi = mid;
  }
  // прошли lo ступеней -> мы ниже lo*100. При lo === 0 мы выше первой ступени,
  // то есть в первой сотне, а НАСКОЛЬКО — лесенка не знает: это тоже `null`.
  return lo === 0 ? null : lo * LADDER_STEP;
}

async function readSnap(env, key) {
  const row = await env.DB.prepare('SELECT v, t FROM snap WHERE k = ?').bind(key).first();
  if (!row) return null;
  try { return { v: JSON.parse(row.v), t: row.t }; } catch (e) { return null; }
}

// ===== POST /v1/score =====
async function postScore(req, env) {
  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return reply({ err: 'form' }, 400); }
  const id = body && body.id, n = body && body.n;
  const s = intOr(body && body.s, NaN), q = intOr(body && body.q, NaN);
  const t = intOr(body && body.t, NaN), a = intOr(body && body.a, 1);
  if (typeof id !== 'string' || id.length < 6 || id.length > 40) return reply({ err: 'form' }, 400);
  if (typeof n !== 'string' || !n.length || n.length > 40)      return reply({ err: 'form' }, 400);
  if (!Number.isFinite(s) || s < 0 || s > 1e12)                 return reply({ err: 'form' }, 400);
  if (!Number.isFinite(q) || q < 0)                             return reply({ err: 'form' }, 400);
  if (!Number.isFinite(t))                                      return reply({ err: 'form' }, 400);
  if (!isHex64(body.sig))                                       return reply({ err: 'form' }, 400);

  const now = nowSec();
  if (Math.abs(t - now) > SKEW_SEC) return reply({ err: 'skew' }, 400);

  const row = await env.DB.prepare(
    'SELECT id,k,n,a,s,u,q,c,f FROM p WHERE id = ?').bind(id).first();

  const msg = id + '.' + s + '.' + q + '.' + t;
  if (!row) {
    // ПЕРВАЯ отправка: ключ приходит открыто (TOFU). Строка создаётся здесь,
    // то есть при ПЕРВОЙ ПОБЕДЕ — зашедший на десять секунд гость строку
    // не плодит.
    if (!isHex64(body.k)) return reply({ err: 'nokey' }, 400);
    if (!sameSig(await hmacHex(body.k, msg), body.sig)) return reply({ err: 'sig' }, 401);
    // ⚠️ `c` (когда строка создана) ПИШЕМ, но механикой больше НЕ ЧИТАЕМ: на нём
    // держался возрастной потолок, и он снят. Оставлен для ручной модерации —
    // отличить свежую строку от давней иначе нечем, а стоит он один INTEGER.
    const born = now;
    await env.DB.prepare(
      'INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
      .bind(id, body.k, n, Math.min(49, Math.max(1, a)), s, now, q, born).run();
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 1, s: s, rank: estimateRank(snap && snap.v, s), exact: 0, n: n });
  }

  if (!sameSig(await hmacHex(row.k, msg), body.sig)) return reply({ err: 'sig' }, 401);

  // ⚠️ ИДЕМПОТЕНТНЫЙ ПОВТОР, А НЕ ОШИБКА: клиент шлёт АБСОЛЮТНОЕ значение,
  // поэтому ретрай безопасен по построению — отдаём сохранённое состояние.
  if (q <= row.q) {
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 1, dup: 1, s: row.s, rank: estimateRank(snap && snap.v, row.s), exact: 0, n: row.n }, 409);
  }
  if (now - row.u < RATE_SEC) {
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 0, err: 'rate', s: row.s, rank: estimateRank(snap && snap.v, row.s), n: row.n }, 429);
  }

  // ===== СЧЁТ ПИШЕТСЯ КАК ПРИСЛАН =====
  // Здесь был возрастной потолок: рост обрезался «по доверию», а превысившая
  // строка пряталась из общей таблицы. Снят целиком по решению владельца
  // 2026-08-09 (см. шапку файла) — сервер больше не спорит с клиентом о числе.
  // ⚠️ ФЛАГ `f` ЗДЕСЬ НЕ ТРОГАЕМ ВОВСЕ, НИ В КАКУЮ СТОРОНУ. Он теперь
  // принадлежит ТОЛЬКО ручной модерации (`/admin/hide`): выставлять его стало
  // некому, а снимать отправкой — значит дать спрятанному руками вернуть себя
  // самому первой же победой. Единственный владелец флага — админ.
  await env.DB.prepare('UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?')
    .bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();

  const snap = await readSnap(env, 'ladder');
  // ⚠️ Скрытому руками место ВСЁ РАВНО отдаём: узнав о скрытии, он просто
  // заведёт новый id. Из ОБЩЕЙ таблицы он при этом исчез — выборки фильтруют
  // по `f = 0`.
  return reply({ ok: 1, s: s, rank: estimateRank(snap && snap.v, s), exact: 0, n: n });
}

// ===== GET /v1/top =====
// Читается ИЗ СНИМКА, а не из `p`: ноль сканов боевой таблицы и кэш на краю.
async function getTop(env, url) {
  const page = Math.max(1, Math.min(2, intOr(Number(url.searchParams.get('p')), 1)));
  // ⚠️ Постановка, раздел ДЕГРАДАЦИЯ: «если D1 не отвечает, /top отдаёт
  // последний снимок». Обрыв базы НЕ должен превращаться в 503 — таблица
  // украшение и игру не блокирует никогда.
  let snap = null;
  try { snap = await readSnap(env, 'top'); }
  catch (e) { snap = null; }
  if (!snap) return reply({ t: 0, n: 0, p: page, r: [], stale: 1 }, 200,
    { 'cache-control': 'public, max-age=30' });
  const from = (page - 1) * PAGE_N;
  return reply({ t: snap.t, n: snap.v.n || 0, p: page, r: (snap.v.r || []).slice(from, from + PAGE_N) },
    200, { 'cache-control': 'public, max-age=60' });
}

// ===== GET /v1/me =====
// Точное место: база по лесенке + пересчёт ВНУТРИ корзины (<=100 строк),
// плюс соседи keyset-запросами. OFFSET не используем нигде — он сканирует
// всё, что перепрыгивает, и в D1 это оплаченные строки.
async function getMe(env, url) {
  const id = url.searchParams.get('id');
  const t = intOr(Number(url.searchParams.get('t')), NaN);
  const sig = url.searchParams.get('sig');
  if (!id || !Number.isFinite(t) || !isHex64(sig)) return reply({ err: 'form' }, 400);
  if (Math.abs(t - nowSec()) > SKEW_SEC) return reply({ err: 'skew' }, 400);

  const row = await env.DB.prepare('SELECT id,k,n,a,s,u,f FROM p WHERE id = ?').bind(id).first();
  if (!row) return reply({ err: 'none' }, 404);
  if (!sameSig(await hmacHex(row.k, id + '.me.' + t), sig)) return reply({ err: 'sig' }, 401);

  const snap = await readSnap(env, 'ladder');
  const ladder = (snap && snap.v) || [];
  let base = 0, bound = null;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i] >= row.s) { base = (i + 1) * LADDER_STEP; bound = ladder[i]; } else break;
  }
  // Кто выше меня, но не выше границы корзины — таких по построению <= ~100.
  const cnt = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM p WHERE f=0 AND s>0 AND (s > ? OR (s = ? AND u < ?))'
    + (bound === null ? '' : ' AND s <= ?'))
    .bind(...(bound === null ? [row.s, row.s, row.u] : [row.s, row.s, row.u, bound])).first();
  // ⚠️⚠️ МИНУС ЕДИНИЦА — НЕ КОСМЕТИКА. Игрок, стоящий РОВНО на границе
  // корзины (место (i+1)·100), попадает в счёт ДВАЖДЫ: он уже учтён в `base`
  // и снова проходит по условию `s <= bound`. Без вычета все, кто ниже
  // сотого места, видели место на единицу хуже настоящего.
  const exactRank = base + 1 + ((cnt && cnt.c) || 0) - (bound === null ? 0 : 1);

  const above = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 AND (s > ? OR (s = ? AND u < ?)) ORDER BY s ASC, u DESC LIMIT ?')
    .bind(row.s, row.s, row.u, NEAR_N).all();
  const below = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 AND (s < ? OR (s = ? AND u > ?)) ORDER BY s DESC, u ASC LIMIT ?')
    .bind(row.s, row.s, row.u, NEAR_N).all();

  return reply({
    ok: 1, s: row.s, n: row.n, a: row.a, rank: exactRank, exact: 1,
    up: ((above.results || []).map((r) => [r.n, r.a, r.s])).reverse(),
    dn: (below.results || []).map((r) => [r.n, r.a, r.s]),
  });
}

// ===== DELETE /v1/me =====
// Единственный физически возможный «удалите мои данные»: почты у нас нет.
async function deleteMe(env, url) {
  const id = url.searchParams.get('id');
  const t = intOr(Number(url.searchParams.get('t')), NaN);
  const sig = url.searchParams.get('sig');
  if (!id || !Number.isFinite(t) || !isHex64(sig)) return reply({ err: 'form' }, 400);
  if (Math.abs(t - nowSec()) > SKEW_SEC) return reply({ err: 'skew' }, 400);
  const row = await env.DB.prepare('SELECT k FROM p WHERE id = ?').bind(id).first();
  if (!row) return reply({ ok: 1, gone: 1 });         // уже нет — это успех
  if (!sameSig(await hmacHex(row.k, id + '.del.' + t), sig)) return reply({ err: 'sig' }, 401);
  await env.DB.prepare('DELETE FROM p WHERE id = ?').bind(id).run();
  return reply({ ok: 1, gone: 1 });
}

// ===== POST /admin/hide =====
async function adminHide(req, env) {
  const auth = req.headers.get('authorization') || '';
  if (!env.ADMIN_TOKEN || auth !== 'Bearer ' + env.ADMIN_TOKEN) return reply({ err: 'auth' }, 401);
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return reply({ err: 'form' }, 400); }
  if (!b || typeof b.id !== 'string') return reply({ err: 'form' }, 400);
  const f = b.show ? 0 : 2;   // 2 = РУЧНОЕ, чистой отправкой не снимается
  await env.DB.prepare('UPDATE p SET f=? WHERE id=?').bind(f, b.id).run();
  return reply({ ok: 1, id: b.id, f: f });
}

// ===== CRON =====
// ⚠️ Агрегация делается В SQL, а не перебором в JS: время запроса D1 в
// CPU воркера не входит, а перебор 50 000 элементов может съесть бесплатные
// 10 мс CPU целиком.
async function buildSnapshot(env) {
  const now = nowSec();
  const top = await env.DB.prepare(
    'SELECT n,a,s FROM p WHERE f=0 AND s>0 ORDER BY s DESC, u ASC LIMIT ?').bind(TOP_N).all();
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM p WHERE f=0 AND s>0').first();
  const lad = await env.DB.prepare(
    'SELECT s FROM (SELECT s, ROW_NUMBER() OVER (ORDER BY s DESC, u ASC) rn'
    + ' FROM p WHERE f=0 AND s>0) WHERE rn % ? = 0').bind(LADDER_STEP).all();
  const topJson = JSON.stringify({ n: (cnt && cnt.c) || 0, r: (top.results || []).map((r) => [r.n, r.a, r.s]) });
  const ladJson = JSON.stringify((lad.results || []).map((r) => r.s));
  await env.DB.prepare('INSERT INTO snap (k,v,t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, t=excluded.t')
    .bind('top', topJson, now).run();
  await env.DB.prepare('INSERT INTO snap (k,v,t) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, t=excluded.t')
    .bind('ladder', ladJson, now).run();
  return { top: (top.results || []).length, ladder: (lad.results || []).length };
}

async function retention(env) {
  const cut = nowSec() - KEEP_DAYS * 86400;
  const r = await env.DB.prepare('DELETE FROM p WHERE u < ?').bind(cut).run();
  return r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return preflight();
    try {
      if (url.pathname === '/v1/score'  && req.method === 'POST')   return await postScore(req, env);
      if (url.pathname === '/v1/top'    && req.method === 'GET')    return await getTop(env, url);
      if (url.pathname === '/v1/me'     && req.method === 'GET')    return await getMe(env, url);
      if (url.pathname === '/v1/me'     && req.method === 'DELETE') return await deleteMe(env, url);
      if (url.pathname === '/admin/hide'&& req.method === 'POST')   return await adminHide(req, env);
      return reply({ err: 'route' }, 404);
    } catch (e) {
      // ⚠️ Даже на сбое тело непустое и это НЕ 200: клиент оставит число в
      // слоте и повторит на следующей естественной точке, а не решит, что
      // «сохранилось».
      return reply({ err: 'srv' }, 503);
    }
  },
  async scheduled(event, env) {
    if (event.cron === '0 4 * * *') return void await retention(env);
    await buildSnapshot(env);
  },
  // экспорт для тестов — боевой путь их не использует
  _internals: { estimateRank, hmacHex, buildSnapshot, retention, sameSig },
};
