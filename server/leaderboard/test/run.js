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

  // ===== 2. Рост сверх потолка КЛАМПИТСЯ МОЛЧА =====
  env.DB._raw.exec('UPDATE p SET u = u - 60');
  const grow = await score(worker, env, 'gid1aaaaaa01', 999999999, 3);
  const row2 = await env.DB.prepare('SELECT s,cl FROM p WHERE id=?').bind('gid1aaaaaa01').first();
  expect(grow.json.ok === 1 && row2.s < 999999999 && row2.cl === 1,
    'РОСТ КЛАМПИТСЯ МОЛЧА: ответ успешный, значение срезано, счётчик вырос (s '
    + row2.s + ', cl ' + row2.cl + ')');

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

  // ===== 6. Часы клиента =====
  const skew = await score(worker, env, 'gid1aaaaaa02', 100, 1, { t: now() - 4000 });
  expect(skew.status === 400 && skew.json.err === 'skew', 'ЧАСЫ: сдвиг >300 с отвергнут');

  // ===== 7. Первая отправка без ключа =====
  const t7 = now();
  const nokey = await post(worker, env, { id: 'gid1aaaaaa03', n: 'Otter', a: 2, s: 10, q: 1, t: t7,
    sig: await sign(KEY, 'gid1aaaaaa03.10.1.' + t7) });
  expect(nokey.status === 400 && nokey.json.err === 'nokey',
    'НОВАЯ СТРОКА БЕЗ КЛЮЧА не создаётся');

  // ===== 8-9. Накрутчик скрыт, честный виден, флаг СНИМАЕТСЯ =====
  // ⚠️ Отдельная база с ЧЕСТНЫМИ метками времени. В общей я двигал `u` назад,
  // не трогая `c`, и обычный игрок сам угодил под возрастной потолок — из-за
  // чего страж «скрытого нет в таблице» смотрел в ПУСТУЮ таблицу и был бы
  // зелен при любом поведении. Классическая тавтология, поймана прогоном.
  const env3 = { DB: makeDB(SCHEMA) };
  const ins = (id, name, sc, ageSec, lastSec) => env3.DB._raw
    .prepare('INSERT INTO p (id,k,n,a,s,u,q,c,cl,f) VALUES (?,?,?,?,?,?,?,?,0,0)')
    .run(id, KEY, name, 1, sc, now() - lastSec, 1, now() - ageSec);
  ins('gid1honest01', 'Honest', 5000, 100000, 100);   // играет давно, строка старая
  ins('gid1cheat001', 'Cheater', 1000, 30, 30);       // строка родилась 30 с назад
  await score(worker, env3, 'gid1cheat001', 1e9, 2, { n: 'Cheater' });
  const ch = await env3.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1cheat001').first();
  expect(ch.f === 1, 'ВОЗРАСТНОЙ ПОТОЛОК: свежая строка с миллиардом СКРЫТА (f=' + ch.f + ')');

  await worker._internals.buildSnapshot(env3);
  const top3 = JSON.parse((await env3.DB.prepare('SELECT v FROM snap WHERE k=?').bind('top').first()).v);
  const names3 = (top3.r || []).map((r) => r[0]);
  // ⚠️ САНИТАР: имя накрутчика обязано ДОЖИТЬ до снимка. Без него страж ниже
  // был тавтологией — тест сам переименовывал строку своей же отправкой
  // (UPDATE пишет присланное имя), и «Cheater» не нашёлся бы никогда.
  expect((await env3.DB.prepare('SELECT n FROM p WHERE id=?').bind('gid1cheat001').first()).n === 'Cheater',
    'САНИТАР: строка накрутчика всё ещё зовётся Cheater');
  expect(names3.includes('Honest') && !names3.includes('Cheater'),
    'В ТАБЛИЦЕ ЧЕСТНЫЙ ЕСТЬ, СКРЫТОГО НЕТ (' + JSON.stringify(names3) + ')');

  env3.DB._raw.exec("UPDATE p SET u = u - 60 WHERE id='gid1cheat001'");
  const seen = await score(worker, env3, 'gid1cheat001', 900, 3, { n: 'Cheater' });
  expect(seen.status === 200 && seen.json && typeof seen.json.rank === 'number',
    'СКРЫТОМУ МЕСТО ВСЁ РАВНО ОТДАЁТСЯ (он не должен узнать, что пойман)');

  // ⚠️ ВОЗВРАТ ЧЕСТНОГО. Возрастной потолок меряет возраст СТРОКИ, а не игрока:
  // у вернувшегося после чистки кэша строка новая, а баланс накоплен за недели.
  // Он честно прячется на первой отправке — и обязан вернуться, как только
  // значение снова укладывается в потолки. Без снятия флага он исчезал бы
  // из таблицы НАВСЕГДА.
  ins('gid1return01', 'Returner', 500, 40, 40);
  await score(worker, env3, 'gid1return01', 50000, 2, { n: 'Returner' });
  const r1 = await env3.DB.prepare('SELECT s,f FROM p WHERE id=?').bind('gid1return01').first();
  env3.DB._raw.exec("UPDATE p SET c = c - 9000, u = u - 60 WHERE id='gid1return01'");
  await score(worker, env3, 'gid1return01', 6000, 3, { n: 'Returner' });
  const r2 = await env3.DB.prepare('SELECT s,f,cl FROM p WHERE id=?').bind('gid1return01').first();
  expect(r1.f === 1 && r2.f === 0 && r2.cl === 0,
    'ЧЕСТНЫЙ ВОЗВРАЩЕНЕЦ: скрыт (f=' + r1.f + ') -> чистая отправка вернула (f='
    + r2.f + ', клампов ' + r2.cl + ')');

  // ===== 10. Лесенка и оценка места =====
  const est = worker._internals.estimateRank;
  expect(est([900, 800, 700], 1000) === 1 && est([900, 800, 700], 850) === 100
      && est([900, 800, 700], 650) === 300,
    'ЛЕСЕНКА: оценка места монотонна и без обращений к базе');

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
    env2.DB._raw.prepare('INSERT INTO p (id,k,n,a,s,u,q,c,cl,f) VALUES (?,?,?,?,?,?,?,?,0,0)')
      .run('gid1user' + String(i).padStart(4,'0'), KEY, 'N' + i, 1, 1000 - i * 10, base + i, 1, base);
  }
  const tMe = now();
  const meRes = await worker.fetch(new Request('https://x/v1/me?id=gid1user0005&t=' + tMe
    + '&sig=' + await sign(KEY, 'gid1user0005.me.' + tMe)), env2);
  const me = JSON.parse(await meRes.text());
  expect(me.ok === 1 && me.rank === 5 && me.exact === 1 && me.up.length === 4 + 1 - 1 + 1 - 1,
    '/me: точное место посчитано (rank ' + me.rank + ')');
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

  console.log('\nВСЕГО PASS: ' + pass + (fails.length ? ' | FAIL: ' + fails.length : ''));
  if (fails.length) { console.log('SUITE: FAIL — ' + fails.join(' || ')); process.exit(1); }
  console.log('SUITE: PASS');
})().catch((e) => { console.error('ПРОГОН УПАЛ:', e && e.stack || e); process.exit(1); });
