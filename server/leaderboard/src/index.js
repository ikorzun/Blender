// ===== СВОЯ ТАБЛИЦА ЛИДЕРОВ — Cloudflare Worker + D1 =====
// Постановка: docs/LEADERBOARD-OWN.md. Здесь только сервер; клиент —
// отдельный модуль игры (src/app/82-lb.js), ядро игры не правится.
//
// ⚠️⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ПЛОЩАДКИ: пишем ПОСЛЕДНЕЕ значение, а не максимум.
// Ради этого таблица и своя — сервер Playgama хранит максимум и понижать не
// умеет, а владельцу нужна «Форбс»-модель: потратил очки — упал в списке.
//
// ⚠️ ЗАЩИТА ОДНОСТОРОННЯЯ И ЭТО ОСОЗНАННО: сторожим только РОСТ. Уменьшение
// принимаем без вопросов — оно легитимно (трата) и накрутчику бесполезно.
// Вдвое меньше кода и ни одного ложного срабатывания на честной трате.
//
// ⚠️ ЧЕСТНАЯ РАМКА: счёт считает клиент, абсолютной защиты нет и быть не
// может без серверной симуляции игры. Всё ниже — ПОДЪЁМ ЦЕНЫ накрутки, а не
// стена. Защищаем не истину, а то, что видят остальные.

const RATE_SEC   = 20;      // не чаще одной записи в 20 с на игрока
const SKEW_SEC   = 300;     // допуск часов клиента
const GROW_PER_S = 25;      // честный пик ~9 ед/с, берём с запасом
// ⚠️⚠️ GROW_BASE ЖДЁТ ЖИВЫХ ДАННЫХ — НЕ КРУТИТЬ ВСЛЕПУЮ (решение диспетчера
// 2026-08-07). Эта пара чисел задаёт, как быстро вернувшийся игрок (новая
// строка, старый баланс) выбирается из-под возрастного потолка обратно в
// общую таблицу. Соблазн поднять её велик, поэтому цена посчитана заранее:
//   баланс 3 278 (скрин владельца) — догон ~51 секунда, незаметно;
//   баланс 50 000 — 20-30 минут игры, и всё это время игрок скрыт из общей
//   таблицы (СВОЁ место он видит — это не «пропал», а «пока не в списке»).
// Игроков второго порядка сегодня нет НИ ОДНОГО, поэтому поднимать нечего:
// правка делается по ЗАМЕРУ на живых данных, а не по опасению. Появятся
// такие балансы — сперва число, потом константа.
const GROW_BASE  = 2000;    // «за один присест» — уровень целиком
const CLAMP_HIDE = 5;       // столько клампов подряд — прячем строку
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
function estimateRank(ladder, score) {
  if (!ladder || !ladder.length) return 1;
  let lo = 0, hi = ladder.length;
  while (lo < hi) {                       // ищем первую ступень НИЖЕ нашего счёта
    const mid = (lo + hi) >> 1;
    if (ladder[mid] >= score) lo = mid + 1; else hi = mid;
  }
  return lo === 0 ? 1 : lo * LADDER_STEP; // прошли lo ступеней -> мы ниже lo*100
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
    'SELECT id,k,n,a,s,u,q,c,cl,f FROM p WHERE id = ?').bind(id).first();

  const msg = id + '.' + s + '.' + q + '.' + t;
  if (!row) {
    // ПЕРВАЯ отправка: ключ приходит открыто (TOFU). Строка создаётся здесь,
    // то есть при ПЕРВОЙ ПОБЕДЕ — зашедший на десять секунд гость строку
    // не плодит.
    if (!isHex64(body.k)) return reply({ err: 'nokey' }, 400);
    if (!sameSig(await hmacHex(body.k, msg), body.sig)) return reply({ err: 'sig' }, 401);
    // ⚠️ Возрастной потолок применяется и к НОВОЙ строке: иначе накрутчик
    // просто заводил бы свежий id с миллиардом.
    const born = now;
    const s0 = Math.min(s, GROW_BASE);
    await env.DB.prepare(
      'INSERT INTO p (id,k,n,a,s,u,q,c,cl,f) VALUES (?,?,?,?,?,?,?,?,0,0)')
      .bind(id, body.k, n, Math.min(49, Math.max(1, a)), s0, now, q, born).run();
    const snap = await readSnap(env, 'ladder');
    return reply({ ok: 1, s: s0, rank: estimateRank(snap && snap.v, s0), exact: 0, n: n });
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

  // ===== ПОТОЛОК ПРИРОСТА, КЛАМП МОЛЧА =====
  // ⚠️ Молча, а не отказом: отказ учит накрутчика подбирать параметры, а
  // кламп оставляет его в неведении и не мешает честному игроку никогда.
  let val = s, cl = row.cl, f = row.f;
  if (s > row.s) {
    const cap = row.s + GROW_PER_S * Math.max(0, now - row.u) + GROW_BASE;
    const ageCap = GROW_PER_S * Math.max(1, now - row.c) + GROW_BASE;
    // ⚠️⚠️ ЧИСТАЯ ОТПРАВКА СНИМАЕТ ВСЕ ПОДОЗРЕНИЯ — БЕЗ ЭТОГО СЕРВЕР ПРЯЧЕТ
    // ЧЕСТНЫХ НАВСЕГДА. Возрастной потолок меряет ВОЗРАСТ СТРОКИ, а не игрока:
    // у вернувшегося (чистка кэша Safari, новое устройство, удаление строки по
    // ретенции) строка новая, а баланс накоплен за недели — он пробивает
    // потолок на первой же победе и, будь флаг липким, исчезал бы из таблицы
    // НАВСЕГДА, ничего не нарушив. Поймано собственным прогоном: обычный
    // игрок теста оказался скрыт, и страж «скрытый не в общей таблице» стал
    // тавтологией — таблица была пуста целиком.
    // Накрутчику это ничего не даёт: с миллиардом «чистой» отправки не будет
    // ещё сорок лет, а честный догоняет за полчаса игры и возвращается сам.
    const clean = (s <= cap && s <= ageCap);
    if (val > cap) { val = cap; cl = cl + 1; }
    if (val > ageCap) { val = ageCap; f = Math.max(f, 1); }  // новорождённый не первый
    if (cl >= CLAMP_HIDE) f = Math.max(f, 1);
    // ⚠️⚠️ ЧИСТАЯ ОТПРАВКА СНИМАЕТ ТОЛЬКО АВТОМАТИЧЕСКОЕ СКРЫТИЕ (f=1).
    // Ручное (f=2) — ПОСЛЕДНЯЯ ступень и единственное средство против
    // гриферства: имя приходит с клиента как есть, и накрутчик со своим
    // ключом пишет в топ что угодно. Снимай мы и его — спрятанный руками
    // возвращал бы себя сам первой же победой. Все выборки фильтруют по
    // `f=0`, поэтому двойка исключается везде бесплатно.
    if (clean) { cl = 0; if (f === 1) f = 0; }
  }
  // ⚠️ ПАДЕНИЕ ФЛАГ НЕ ТРОГАЕТ: иначе пойманный «обелялся» бы одной тратой.
  await env.DB.prepare('UPDATE p SET n=?, a=?, s=?, u=?, q=?, cl=?, f=? WHERE id=?')
    .bind(n, Math.min(49, Math.max(1, a)), val, now, q, cl, f, id).run();

  const snap = await readSnap(env, 'ladder');
  // ⚠️ Скрытому (f=1) место ВСЁ РАВНО отдаём: он не должен узнать, что пойман,
  // иначе просто заведёт новый id. Из общей таблицы он при этом исчез.
  return reply({ ok: 1, s: val, rank: estimateRank(snap && snap.v, val), exact: 0, n: n });
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
