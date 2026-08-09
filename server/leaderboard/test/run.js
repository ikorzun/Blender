// Стражи воркера таблицы лидеров. Прогон: `node server/leaderboard/test/run.js`
// Ассертный, как test.js игры: любой FAIL даёт код возврата 1.
// ⚠️ Каждый страж проверяется ДВУСТОРОННЕ (см. соседний файл break.js):
// красный на сломанной сборке, зелёный на исправной.
const fs = require('fs');
const path = require('path');
const { makeDB } = require('./d1.js');

const DIR = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');

let pass = 0; const fails = [];
function expect(cond, name) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fails.push(name); console.log('FAIL: ' + name); }
}

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sign(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
const KEY = 'a'.repeat(64);
const now = () => Math.floor(Date.now() / 1000);

async function post(worker, env, body) {
  const req = new Request('https://x/v1/score', { method: 'POST', body: JSON.stringify(body) });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, res };
}
async function score(worker, env, id, s, q, opts) {
  const t = (opts && opts.t) || now();
  const key = (opts && opts.key) || KEY;
  const sig = (opts && opts.sig) || await sign(key, id + '.' + s + '.' + q + '.' + t);
  const body = { id, n: (opts && opts.n) || 'Kingfisher', a: 7, s, q, t, sig };
  if (!opts || opts.withKey !== false) body.k = key;
  if (opts && opts.noKey) delete body.k;
  return post(worker, env, body);
}

(async () => {
  // Путь к воркеру можно подменить (диверсии в break.js гоняют ПАТЧЕННУЮ копию).
  const src = process.env.LB_SRC
    ? require('url').pathToFileURL(process.env.LB_SRC).href : '../src/index.js';
  const worker = (await import(src)).default;
  const env = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };

  // ===== 1. ПОСЛЕДНЕЕ ЗНАЧЕНИЕ, А НЕ МАКСИМУМ — ради этого таблица и своя =====
  // Владелец: «потратил очки — упал в списке». Сервер площадки так не умеет.
  await score(worker, env, 'gid1aaaaaa01', 500, 1);
  const row0 = await env.DB.prepare('SELECT s FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  // сдвигаем окно частоты назад, чтобы вторая запись прошла
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const down = await score(worker, env, 'gid1aaaaaa01', 300, 2);
  const row1 = await env.DB.prepare('SELECT s FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  expect(row1.s === 300 && down.json.ok === 1,
    'ПАДЕНИЕ СОХРАНЕНО: пишем ПОСЛЕДНЕЕ, а не максимум (' + row0.s + ' -> ' + row1.s + ')');

  // ===== 2. СЧЁТ ПИШЕТСЯ КАК ПРИСЛАН, СТРОКА ОСТАЁТСЯ ВИДИМОЙ =====
  // ⚠️ Раньше здесь стоял обратный страж («рост сверх потолка клампится молча»).
  // Потолок снят решением владельца 2026-08-09, и этот ассерт утверждает НОВОЕ
  // поведение: сервер не спорит с клиентом о числе и никого не прячет сам.
  // ⚠️ ДВА ПРИЗНАКА, А НЕ ОДИН: «значение сохранено» ловит возврат обрезки,
  // «f === 0» — возврат автоскрытия. Это разные механизмы, и умерли они
  // порознь: вернуть можно любой из них по отдельности.
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const grow = await score(worker, env, 'gid1aaaaaa01', 999999999, 3);
  const row2 = await env.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  expect(grow.json.ok === 1 && row2.s === 999999999 && grow.json.s === 999999999 && row2.f === 0,
    'СЧЁТ КАК ЕСТЬ: миллиард сохранён без обрезки и строка не скрыта (s '
    + row2.s + ', f ' + row2.f + ')');

  // ===== 3. Ключ существующей строки НЕ перезаписывается =====
  // Иначе любой желающий прислал бы свой k и забрал чужую строку.
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const evil = 'b'.repeat(64);
  const t3 = now();
  const stolen = await post(worker, env, { id: 'gid1aaaaaa01', n: 'Hacker', a: 1, s: 100, q: 99, t: t3,
    k: evil, sig: await sign(evil, 'gid1aaaaaa01.100.99.' + t3) });
  expect(stolen.status === 401,
    'ЧУЖОЙ КЛЮЧ ОТВЕРГНУТ: подпись сверяется СОХРАНЁННЫМ ключом (' + stolen.status + ')');

  // ===== 4. Идемпотентный повтор: q не вырос =====
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const dup = await score(worker, env, 'gid1aaaaaa01', 777, 1);
  expect(dup.status === 409 && dup.json && dup.json.dup === 1 && typeof dup.json.s === 'number',
    'ПОВТОР q — 409 с СОХРАНЁННЫМ состоянием, а не ошибка (' + dup.status + ')');

  // ===== 5. Частота =====
  // ⚠️ Сначала УСПЕШНАЯ запись (она и ставит `u = now`), и только потом
  // вторая. Первая версия стража шла сразу после «повтора q», а тот `u` не
  // трогает — окно оставалось открытым, и ассерт мерил не частоту, а мою же
  // подготовку (получал 200 и был бы зелёным при снятом лимите).
  const okWrite = await score(worker, env, 'gid1aaaaaa01', 800, 4);
  const rate = await score(worker, env, 'gid1aaaaaa01', 810, 5);
  expect(okWrite.status === 200, 'ЧАСТОТА: подготовительная запись прошла (санитар)');
  expect(rate.status === 429 && rate.json && typeof rate.json.s === 'number',
    'ЧАСТОТА: чаще 20 с — 429, тело непустое (' + rate.status + ')');
  // ⚠️ `retry` НЕСУЩЕЕ: по нему клиент откладывает отправку и НЕ держит копию
  // нашего `RATE_SEC` у себя. Ассертим ГРАНИЦЫ, а не число: подготовительная
  // запись прошла мгновением раньше, поэтому ждать осталось почти всё окно, но
  // сравнивать с литералом 20 нельзя — это была бы та же копия константы,
  // только в страже (закон, на котором проект обжёгся четыре раза за сессию).
  expect(typeof rate.json.retry === 'number' && rate.json.retry > 0
    && rate.json.retry <= worker._internals.RATE_SEC
    && rate.json.retry >= worker._internals.RATE_SEC - 2,
    'ЧАСТОТА: 429 говорит, СКОЛЬКО ждать (retry ' + rate.json.retry
    + ' при окне ' + worker._internals.RATE_SEC + ')');

  // ===== 6. Часы клиента =====
  const skew = await score(worker, env, 'gid1aaaaaa02', 100, 1, { t: now() - 4000 });
  expect(skew.status === 400 && skew.json.err === 'skew', 'ЧАСЫ: сдвиг >300 с отвергнут');

  // ===== 7. Первая отправка без ключа =====
  const t7 = now();
  const nokey = await post(worker, env, { id: 'gid1aaaaaa03', n: 'Otter', a: 2, s: 10, q: 1, t: t7,
    sig: await sign(KEY, 'gid1aaaaaa03.10.1.' + t7) });
  expect(nokey.status === 400 && nokey.json.err === 'nokey',
    'НОВАЯ СТРОКА БЕЗ КЛЮЧА не создаётся');

  // ===== 8-9. Скрытая РУКАМИ строка не попадает в общую таблицу =====
  // ⚠️ Автоматического скрытия больше нет — единственный источник флага `f`
  // это `/admin/hide` (решение владельца 2026-08-09). Поэтому прячем строку
  // НАСТОЯЩИМ путём, через эндпоинт, а не подсовывая `f` прямо в INSERT:
  // иначе страж проверял бы выборку снимка, а не механику скрытия.
  const env3 = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };
  const ins = (id, name, sc, ageSec, lastSec) => env3.DB._raw
    .prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
    .run(id, KEY, name, 1, sc, now() - lastSec, 1, now() - ageSec);
  ins('gid1honest01', 'Honest', 5000, 100000, 100);   // играет давно, строка старая
  ins('gid1cheat001', 'Cheater', 1000, 30, 30);       // его спрячет модератор
  const hidReq = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1cheat001' }) }), env3);
  const ch = await env3.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1cheat001').first();
  expect(hidReq.status === 200 && ch.f > 0,
    'РУЧНОЕ СКРЫТИЕ пометило строку (HTTP ' + hidReq.status + ', f=' + ch.f + ')');

  await worker._internals.buildSnapshot(env3);
  const top3 = JSON.parse((await env3.DB.prepare('SELECT v FROM snap WHERE k=?').bind('top').first()).v);
  const names3 = (top3.r || []).map((r) => r[0]);
  // ⚠️ САНИТАР: имя скрытого обязано ДОЖИТЬ до снимка. Однажды страж ниже уже
  // был тавтологией по этой причине — тест сам переименовывал строку своей же
  // отправкой (UPDATE пишет присланное имя), и «Cheater» не нашёлся бы никогда.
  // Отправки до снимка теперь нет, но санитар оставлен: он стережёт ассерт от
  // повторного превращения в пустой.
  expect((await env3.DB.prepare('SELECT n FROM p WHERE id=?').bind('gid1cheat001').first()).n === 'Cheater',
    'САНИТАР: строка накрутчика всё ещё зовётся Cheater');
  expect(names3.includes('Honest') && !names3.includes('Cheater'),
    'В ТАБЛИЦЕ ЧЕСТНЫЙ ЕСТЬ, СКРЫТОГО НЕТ (' + JSON.stringify(names3) + ')');

  env3.DB._raw.exec("UPDATE p SET u = u - 60 WHERE id='gid1cheat001'");
  const seen = await score(worker, env3, 'gid1cheat001', 900, 3, { n: 'Cheater' });
  // ⚠️ Ассертим ФОРМУ, а не тип `rank`: на базе меньше сотни игроков честная
  // оценка — `null` (см. estimateRank), и «typeof number» краснел бы на
  // ИСПРАВНОЙ сборке. Свойство здесь другое: скрытому отвечают ровно как всем.
  expect(seen.status === 200 && seen.json && seen.json.ok === 1
    && 'rank' in seen.json && seen.json.exact === 0,
    'СКРЫТОМУ ОТВЕЧАЮТ КАК ВСЕМ (он не должен узнать, что пойман; rank '
    + JSON.stringify(seen.json.rank) + ')');

  // ⚠️ СТРАЖ «ЧЕСТНЫЙ ВОЗВРАЩЕНЕЦ» УДАЛЁН ВМЕСТЕ С МЕХАНИКОЙ, а не ослаблен.
  // Он проверял, что чистая отправка СНИМАЕТ автоматический флаг: возрастной
  // потолок мерял возраст СТРОКИ, а не игрока, и вернувшийся после чистки кэша
  // прятался ни за что. Снят весь тракт — и болезнь, и лекарство.
  // ⛔ Не восстанавливать «под новое поведение»: снятие флага отправкой теперь
  // означало бы, что спрятанный РУКАМИ возвращает себя сам первой же победой.

  // ===== 10. Лесенка и оценка места =====
  // ⚠️⚠️ ОЦЕНКА — ГРАНИЦА «НЕ ЛУЧШЕ N», А НЕ МЕСТО, и `null` тут законный ответ.
  // ДВА случая, где границы нет, и оба РАНЬШЕ отдавали уверенную единицу:
  //   • лесенка пуста (в таблице меньше сотни игроков — то есть первые недели
  //     после запуска, ровно когда на таблицу и смотрят);
  //   • счёт выше первой ступени: известно лишь «где-то в первой сотне».
  // Первый нашёл живой прогон клиента, второй пережил бы починку первого.
  const est = worker._internals.estimateRank;
  expect(est([], 1000) === null && est(null, 1000) === null,
    'ОЦЕНКА: пустая лесенка отвечает null, а не «место 1» каждому');
  expect(est([900, 800, 700], 1000) === null && est([900, 800, 700], 850) === 100
      && est([900, 800, 700], 650) === 300,
    'ОЦЕНКА: выше первой ступени — null, ниже — монотонная граница (100/300)');
  // ⚠️ И ЖИВОЙ ЗАМЕР, а не только чистая функция: настоящий ответ сервера на
  // маленькой базе обязан нести `null`. Без него страж проверял бы формулу, а
  // не то, что уезжает клиенту.
  expect(grow.json.rank === null && grow.json.exact === 0,
    'ЖИВОЙ ОТВЕТ на базе меньше сотни: rank ' + JSON.stringify(grow.json.rank)
    + ' при exact ' + grow.json.exact);

  // ===== 11. /top — из снимка, с кэшем =====
  const topRes = await worker.fetch(new Request('https://x/v1/top?p=1'), env3);
  const topJson = JSON.parse(await topRes.text());
  expect(topRes.headers.get('cache-control') === 'public, max-age=60' && topJson.r.length > 0,
    '/top: отдаётся из снимка с кэш-заголовком (строк ' + topJson.r.length + ')');
  // Снимка ещё нет (cron не отработал) — отдаём пустой, но ЧЕСТНО помеченный
  // ответ и с коротким кэшем, а не 500: таблица никогда не ломает игру.
  const coldRes = await worker.fetch(new Request('https://x/v1/top?p=1'), { DB: makeDB(SCHEMA) });
  const cold = JSON.parse(await coldRes.text());
  expect(coldRes.status === 200 && cold.stale === 1 && cold.r.length === 0,
    '/top БЕЗ снимка: пустой ответ с пометкой, не ошибка');

  // ===== 12. /me: точное место и соседи =====
  const env2 = { DB: makeDB(SCHEMA) };
  const base = now() - 10000;
  for (let i = 1; i <= 12; i++) {
    env2.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
      .run('gid1user' + String(i).padStart(4,'0'), KEY, 'N' + i, 1, 1000 - i * 10, base + i, 1, base);
  }
  // ⚠️⚠️ СНИМОК СТРОИМ НАСТОЯЩИМ СТРОИТЕЛЕМ, а не подсовываем пустой массив:
  // диспетчер просил подтвердить ЗАМЕРОМ, что при базе меньше сотни игроков
  // лесенка выходит ПУСТОЙ (она берёт каждое сотое место), и что точное место
  // в этой ветке (`bound === null`, полный пересчёт по живой таблице) считается
  // верно. Порядок как в бою: сперва крон собрал снимок, потом пришёл игрок.
  await worker._internals.buildSnapshot(env2);
  const ladSteps = JSON.parse((await env2.DB.prepare('SELECT v FROM snap WHERE k=?')
    .bind('ladder').first()).v);
  const tMe = now();
  const meRes = await worker.fetch(new Request('https://x/v1/me?id=gid1user0005&t=' + tMe
    + '&sig=' + await sign(KEY, 'gid1user0005.me.' + tMe)), env2);
  const me = JSON.parse(await meRes.text());
  expect(me.ok === 1 && me.rank === 5 && me.exact === 1 && ladSteps.length === 0
    && me.up.length === 4 + 1 - 1 + 1 - 1,
    '/me: точное место верно ПРИ ПУСТОЙ ЛЕСЕНКЕ — 12 игроков дают 0 ступеней '
    + '(rank ' + me.rank + ', ступеней ' + ladSteps.length + ')');
  expect(me.up.length === 4 && me.dn.length === 5,
    '/me: соседи выше/ниже (' + me.up.length + ' / ' + me.dn.length + ')');
  expect(me.up[me.up.length - 1][2] === 1000 - 4 * 10,
    '/me: ближайший сверху — ровно предыдущее место (' + me.up[me.up.length - 1][2] + ')');

  // ===== 13. Удаление своей строки =====
  const tD = now();
  const delRes = await worker.fetch(new Request('https://x/v1/me?id=gid1user0005&t=' + tD
    + '&sig=' + await sign(KEY, 'gid1user0005.del.' + tD), { method: 'DELETE' }), env2);
  const gone = await env2.DB.prepare('SELECT id FROM p WHERE id=?').bind('gid1user0005').first();
  expect(delRes.status === 200 && gone === null, 'DELETE /me: строка удалена');
  const badDel = await worker.fetch(new Request('https://x/v1/me?id=gid1user0006&t=' + tD
    + '&sig=' + 'c'.repeat(64), { method: 'DELETE' }), env2);
  expect(badDel.status === 401, 'DELETE /me: без верной подписи — 401');

  // ===== 14. Тело ответа ВСЕГДА непустой JSON =====
  // Транспорт бриджа читает r.json() без проверки r.ok — пустое тело
  // приезжает как провал, поэтому пустых ответов у нас не бывает нигде.
  const r404 = await worker.fetch(new Request('https://x/nope'), env);
  const t404 = await r404.text();
  const rOpt = await worker.fetch(new Request('https://x/v1/me', { method: 'OPTIONS' }), env);
  expect(r404.status === 404 && t404.length > 2 && JSON.parse(t404).err === 'route',
    'ЛЮБОЙ ответ — непустой JSON (404 тоже)');
  expect(rOpt.status === 204 && rOpt.headers.get('access-control-allow-methods'),
    'OPTIONS: preflight обслужен (нужен только для DELETE)');

  // ===== 15. CORS: простой запрос, без кастомных заголовков =====
  expect(topRes.headers.get('access-control-allow-origin') === '*'
      && (topRes.headers.get('content-type') || '').startsWith('text/plain'),
    'CORS: text/plain + ACAO:* — запрос «простой», preflight не нужен');

  // ===== 16. РУЧНОЕ СКРЫТИЕ ПЕРЕЖИВАЕТ ЧИСТУЮ ОТПРАВКУ =====
  // Ручной тир — последняя ступень и единственное средство против гриферства
  // (имя приходит с клиента). Если бы чистая отправка снимала и его, спрятанный
  // руками возвращал бы себя сам первой же победой.
  const envA = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'secret' };
  envA.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)')
    .run('gid1grief001', KEY, 'Grief', 1, 5000, now() - 600, 1, now() - 100000);
  const hid = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1grief001' }) }), envA);
  const afterHide = await envA.DB.prepare('SELECT f FROM p WHERE id=?').bind('gid1grief001').first();
  await score(worker, envA, 'gid1grief001', 5200, 2, { n: 'Grief' });   // обычный рост
  const afterClean = await envA.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1grief001').first();
  expect(hid.status === 200 && afterHide.f > 0 && afterClean.f > 0 && afterClean.s === 5200,
    'РУЧНОЕ СКРЫТИЕ переживает чистую отправку (f ' + afterHide.f + ' -> ' + afterClean.f + ')');
  await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ id: 'gid1grief001', show: 1 }) }), envA);
  const back = await envA.DB.prepare('SELECT f FROM p WHERE id=?').bind('gid1grief001').first();
  expect(back.f === 0, 'РУЧНОЙ ВОЗВРАТ работает (f=' + back.f + ')');
  const noAuth = await worker.fetch(new Request('https://x/admin/hide', { method: 'POST',
    body: JSON.stringify({ id: 'gid1grief001' }) }), envA);
  expect(noAuth.status === 401, 'admin/hide без токена — 401');

  // ===== 17. ГЛУБОКОЕ МЕСТО НА 50 000 СТРОК =====
  // ⚠️ Сид из постановки, и он же — ЕДИНСТВЕННЫЙ страж лесенки: путь «через
  // корзину» на маленькой базе не исполняется вовсе (снимка нет, bound=null),
  // а именно там жил сдвиг на единицу — игрок ровно на границе корзины
  // считался дважды, и все ниже сотого места видели место на 1 хуже.
  const envB = { DB: makeDB(SCHEMA) };
  const N = 50000, base0 = now() - 200000;
  envB.DB._raw.exec('BEGIN');
  const st = envB.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,f) VALUES (?,?,?,?,?,?,?,?,0)');
  for (let i = 0; i < N; i++) st.run('gidseed' + String(i).padStart(6, '0'), KEY, 'P' + i, 1,
    N - i, base0 + i, 1, base0);          // счёт уникален: истинное место = i+1
  envB.DB._raw.exec('COMMIT');
  const t0 = Date.now();
  const snapB = await worker._internals.buildSnapshot(envB);
  const ladderB = JSON.parse((await envB.DB.prepare('SELECT v FROM snap WHERE k=?').bind('ladder').first()).v);
  expect(ladderB.length === N / 100 && snapB.top === 100,
    'ЛЕСЕНКА на 50 000: ' + ladderB.length + ' ступеней, топ ' + snapB.top
    + ', снимок за ' + (Date.now() - t0) + ' мс');

  const probes = [1, 100, 101, 25037, 49999];
  const got = [];
  for (const rank of probes) {
    const id = 'gidseed' + String(rank - 1).padStart(6, '0');
    const tq = now();
    const r = await worker.fetch(new Request('https://x/v1/me?id=' + id + '&t=' + tq
      + '&sig=' + await sign(KEY, id + '.me.' + tq)), envB);
    got.push(JSON.parse(await r.text()).rank);
  }
  expect(JSON.stringify(got) === JSON.stringify(probes),
    'ТОЧНОЕ МЕСТО совпадает с истинным на всех глубинах (' + got.join(',') + ' против '
    + probes.join(',') + ')');

  // ===== 18. /top НЕ ПАДАЕТ, КОГДА БАЗА МОЛЧИТ =====
  // Правило номер один постановки: таблица — украшение, игру не блокирует.
  const envDead = { DB: { prepare() { throw new Error('D1 недоступна'); } } };
  const deadRes = await worker.fetch(new Request('https://x/v1/top?p=1'), envDead);
  const dead = JSON.parse(await deadRes.text());
  expect(deadRes.status === 200 && dead.stale === 1,
    '/top при упавшей базе: 200 с пометкой, не 503 (' + deadRes.status + ')');

  console.log('\nВСЕГО PASS: ' + pass + (fails.length ? ' | FAIL: ' + fails.length : ''));
  if (fails.length) { console.log('SUITE: FAIL — ' + fails.join(' || ')); process.exit(1); }
  console.log('SUITE: PASS');
})().catch((e) => { console.error('ПРОГОН УПАЛ:', e && e.stack || e); process.exit(1); });
