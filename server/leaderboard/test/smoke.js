// ЖИВОЙ СМОУК развёрнутого воркера таблицы лидеров.
//
//   node server/leaderboard/test/smoke.js --local          — на локальной копии
//   node server/leaderboard/test/smoke.js https://lb.…/    — на боевом воркере
//
// ⚠️ ЗАЧЕМ СКРИПТ, А НЕ СПИСОК В ДОКЕ: чек-лист прозой никто не проверяет, и
// в день доступа выясняется, что половина шагов неисполнима. `--local`
// поднимает воркер поверх `node:sqlite` и гоняет ТОТ ЖЕ сценарий — значит
// порядок шагов и ожидания проверены ДО того, как понадобились.
//
// ⚠️ СМОУК ПИШЕТ В БОЕВУЮ ТАБЛИЦУ и потому за собой убирает: id случайный,
// счёт маленький, в конце строка удаляется своим же `DELETE /v1/me` (это и
// есть проверка удаления). Если прогон падает раньше — удаление всё равно
// делается в `finally`, иначе в таблице копились бы строки «SMOKE».
const http = require('http');
const path = require('path');

const arg = process.argv[2] || '--local';
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const nowSec = () => Math.floor(Date.now() / 1000);

async function sign(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

let pass = 0; const fails = [];
function check(ok, name, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fails.push(name); console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
}

// ===== локальный стенд: тот же воркер поверх node:sqlite =====
async function startLocal() {
  const fs = require('fs');
  const { makeDB } = require('./d1.js');
  const dir = path.join(__dirname, '..');
  const worker = (await import(require('url').pathToFileURL(path.join(dir, 'src', 'index.js')).href)).default;
  const env = { DB: makeDB(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')), ADMIN_TOKEN: 'smoke' };
  const srv = http.createServer(async (rq, rs) => {
    const chunks = []; for await (const c of rq) chunks.push(c);
    const req = new Request('http://local' + rq.url, {
      method: rq.method, headers: rq.headers,
      body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks),
    });
    const res = await worker.fetch(req, env);
    rs.writeHead(res.status, Object.fromEntries(res.headers));
    rs.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise((r) => srv.listen(0, r));
  // снимок нужен для /top и точного места — на живом его строит cron
  await worker._internals.buildSnapshot(env);
  return { base: 'http://127.0.0.1:' + srv.address().port, stop: () => srv.close() };
}

const jget = async (u) => {
  const r = await fetch(u);
  let j = null; const t = await r.text();
  try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t, headers: r.headers };
};
const jpost = async (u, body) => {
  const r = await fetch(u, { method: 'POST', body: JSON.stringify(body) });
  let j = null; const t = await r.text();
  try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t };
};

(async () => {
  let local = null, base = arg;
  if (arg === '--local') { local = await startLocal(); base = local.base; }
  base = base.replace(/\/+$/, '');
  console.log('СМОУК ТАБЛИЦЫ ЛИДЕРОВ: ' + base + '\n');

  const id = 'smoke' + rnd(5);            // 15 символов — формат боевого Save.gid
  const key = rnd(32);
  const send = async (s, q, opts) => {
    const t = (opts && opts.t) || nowSec();
    const sig = (opts && opts.badSig) ? rnd(32) : await sign(key, id + '.' + s + '.' + q + '.' + t);
    const body = { id, n: 'SMOKE', a: 1, s, q, t, sig };
    if (!(opts && opts.noKey)) body.k = key;
    return jpost(base + '/v1/score', body);
  };

  try {
    // 1. ПЕРВАЯ ОТПРАВКА — строка создаётся, ключ принят один раз (TOFU).
    const r1 = await send(100, 1);
    check(r1.status === 200 && r1.j && r1.j.ok === 1 && typeof r1.j.rank === 'number',
      'отправка результата создаёт строку', 'HTTP ' + r1.status + ', место ' + (r1.j && r1.j.rank));

    // 2. ПОВТОР того же q — идемпотентно, 409 с СОХРАНЁННЫМ состоянием.
    const r2 = await send(100, 1);
    check(r2.status === 409 && r2.j && r2.j.dup === 1, 'повтор не создаёт вторую запись',
      'HTTP ' + r2.status);

    // 3. ЧАСТОТА — вторая запись раньше 20 с отбивается.
    const r3 = await send(150, 2);
    check(r3.status === 429 && r3.j && typeof r3.j.s === 'number',
      'чаще 20 с — отказ по частоте', 'HTTP ' + r3.status);

    // 4. ПОДПИСЬ — чужая/битая не принимается.
    const r4 = await send(999999, 3, { badSig: true });
    check(r4.status === 401, 'битая подпись отвергнута', 'HTTP ' + r4.status);

    // 5. ЧТЕНИЕ ТОПА — публичное, кэшируемое, без подписи.
    const r5 = await jget(base + '/v1/top?p=1');
    check(r5.status === 200 && r5.j && Array.isArray(r5.j.r),
      'чтение топа', 'HTTP ' + r5.status + ', строк ' + (r5.j && r5.j.r ? r5.j.r.length : '?')
      + ', кэш ' + (r5.headers.get('cache-control') || 'нет'));

    // 6. СВОЁ МЕСТО — точное, с соседями.
    const t6 = nowSec();
    const r6 = await jget(base + '/v1/me?id=' + id + '&t=' + t6 + '&sig=' + await sign(key, id + '.me.' + t6));
    check(r6.status === 200 && r6.j && r6.j.exact === 1 && Array.isArray(r6.j.dn),
      'своё место и соседи', 'HTTP ' + r6.status + ', место ' + (r6.j && r6.j.rank));

    // 7. CORS — игра живёт в iframe чужого домена.
    check((r5.headers.get('access-control-allow-origin') || '') === '*',
      'CORS открыт для iframe площадки', r5.headers.get('access-control-allow-origin') || 'нет заголовка');
  } catch (e) {
    check(false, 'смоук дошёл до конца без исключений', String(e && e.message || e));
  } finally {
    // 8. УДАЛЕНИЕ СВОИХ ДАННЫХ — и уборка за смоуком. В `finally`, иначе
    //    упавший прогон оставлял бы строки «SMOKE» в боевой таблице.
    try {
      const t8 = nowSec();
      const r8 = await fetch(base + '/v1/me?id=' + id + '&t=' + t8
        + '&sig=' + await sign(key, id + '.del.' + t8), { method: 'DELETE' });
      const j8 = JSON.parse(await r8.text());
      check(r8.status === 200 && j8.gone === 1, 'удаление своих данных (и уборка за смоуком)',
        'HTTP ' + r8.status);
      const t9 = nowSec();
      const r9 = await jget(base + '/v1/me?id=' + id + '&t=' + t9 + '&sig=' + await sign(key, id + '.me.' + t9));
      check(r9.status === 404, 'после удаления строки нет', 'HTTP ' + r9.status);
    } catch (e) {
      check(false, 'уборка за смоуком', String(e && e.message || e));
    }
    if (local) local.stop();
  }

  console.log('\nИТОГ: ' + pass + ' зелёных' + (fails.length ? ', КРАСНЫХ ' + fails.length + ': ' + fails.join(' | ') : ''));
  if (fails.length) process.exit(1);
  console.log(arg === '--local'
    ? 'Локально сценарий исполним — на боевом воркере идти по этому же списку.'
    : 'Боевой воркер отвечает по контракту.');
})();
