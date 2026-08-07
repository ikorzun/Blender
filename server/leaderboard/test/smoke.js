// ЖИВОЙ СМОУК развёрнутого воркера таблицы лидеров.
//
//   node server/leaderboard/test/smoke.js --local          — на локальной копии
//   node server/leaderboard/test/smoke.js https://lb.…/    — на боевом воркере
//
// Коды возврата: 0 — всё зелено; 1 — контракт нарушен; 2 — ЖЁЛТЫЙ исход,
// снимок ещё не строился, нужен ПОВТОРНЫЙ прогон после часового тика.
//
// ⚠️ ЗАЧЕМ СКРИПТ, А НЕ СПИСОК В ДОКЕ: чек-лист прозой никто не исполняет, и
// в день доступа выясняется, что половина шагов неисполнима. `--local`
// поднимает воркер поверх `node:sqlite` и гоняет ТОТ ЖЕ сценарий.
//
// ⚠️⚠️ СМОУК ПИШЕТ В БОЕВУЮ ТАБЛИЦУ. Убирает за собой тремя путями (нормальный
// финал, `finally`, перехват SIGINT/SIGTERM), но ГАРАНТИИ НЕТ: `finally` не
// выполняется при жёстком убийстве процесса, обрыве питания и падении сети
// на самом DELETE. Поэтому id печатается ПЕРВОЙ строкой ДО создания строки —
// чтобы было чем убрать вручную (команда в README).
const http = require('http');
const path = require('path');

const arg = process.argv[2] || '--local';
const LOCAL = arg === '--local';
const TIMEOUT_MS = 10000;      // ⚠️ без него undici ждёт до 300 с
const SNAP_MAX_AGE = 7200;     // снимок строит крон раз в час; два часа — запас
const RATE_WAIT_MS = 21000;    // окно частоты 20 с + секунда на дорогу

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const rnd = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sign(keyHex, msg) {
  const raw = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}

let pass = 0; const fails = []; const warns = [];
function check(ok, name, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fails.push(name); console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
}
function yellow(name, detail) {
  warns.push(name); console.log('  🟡 ' + name + (detail ? '  — ' + detail : ''));
}

// ===== локальный стенд: тот же воркер поверх node:sqlite =====
async function startLocal() {
  const fs = require('fs');
  const { makeDB } = require('./d1.js');
  const dir = path.join(__dirname, '..');
  // Путь к воркеру подменяем в диверсиях (break.js, фаза 2).
  const srcFile = process.env.LB_SRC || path.join(dir, 'src', 'index.js');
  const worker = (await import(require('url').pathToFileURL(srcFile).href)).default;
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
  // ⚠️ СНИМОК ЗДЕСЬ НЕ СТРОИМ НАМЕРЕННО: локальный прогон обязан пройти через
  // ЖЁЛТОЕ состояние «снимка ещё нет» — иначе новая проверка свежести
  // локально не исполняется вовсе и сдана не как страж, а как описание.
  return { base: 'http://127.0.0.1:' + srv.address().port, worker, env, stop: () => srv.close() };
}

const withTimeout = (opts) => Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, opts || {});
const jget = async (u) => {
  const r = await fetch(u, withTimeout());
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t, headers: r.headers };
};
const jpost = async (u, body) => {
  const r = await fetch(u, withTimeout({ method: 'POST', body: JSON.stringify(body) }));
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, t };
};

// ===== уборка: три пути, и ни один не даёт гарантии — потому id виден сразу =====
let cleanup = null, cleaned = false;
async function doCleanup(reason) {
  if (cleaned || !cleanup) return; cleaned = true;
  try { await cleanup(); console.log('\n[уборка: строка удалена, ' + reason + ']'); }
  catch (e) { console.log('\n⚠️ УБОРКА НЕ УДАЛАСЬ (' + reason + '): ' + (e && e.message)
    + ' — удалите строку вручную, id напечатан выше'); }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await doCleanup(sig); process.exit(130); });
}

(async () => {
  let local = null, base = arg;
  if (LOCAL) { local = await startLocal(); base = local.base; }
  base = base.replace(/\/+$/, '');

  const id = 'smoke' + rnd(5);            // 15 символов — формат боевого Save.gid
  const key = rnd(32);
  // ⚠️ ПЕРВОЙ СТРОКОЙ И ДО СОЗДАНИЯ СТРОКИ: если прогон убьют жёстко, это
  // единственное, чем потом убрать за собой.
  console.log('СМОУК ТАБЛИЦЫ ЛИДЕРОВ: ' + base);
  console.log('id этого прогона: ' + id + '   (если оборвётся — см. ручную уборку в README)\n');

  const send = async (s, q, opts) => {
    const t = (opts && opts.t) || nowSec();
    const sig = (opts && opts.badSig) ? rnd(32) : await sign(key, id + '.' + s + '.' + q + '.' + t);
    const body = { id, n: 'SMOKE', a: 1, s, q, t, sig };
    if (!(opts && opts.noKey)) body.k = key;
    return jpost(base + '/v1/score', body);
  };
  const me = async () => {
    const t = nowSec();
    return jget(base + '/v1/me?id=' + id + '&t=' + t + '&sig=' + await sign(key, id + '.me.' + t));
  };
  cleanup = async () => {
    const t = nowSec();
    await fetch(base + '/v1/me?id=' + id + '&t=' + t + '&sig=' + await sign(key, id + '.del.' + t),
      withTimeout({ method: 'DELETE' }));
  };

  let snapshotYellow = false;
  try {
    // 1. ПЕРВАЯ ОТПРАВКА — строка создаётся, ключ принят один раз (TOFU).
    // ⚠️ Сверяем и СОХРАНЁННЫЙ СЧЁТ: без этого диверсия «пишем 0 вместо счёта»
    // проходит зелёной, а строка с s=0 выпадает из частичного индекса —
    // игрока нет ни в топе, ни у соседей, зато свой экран рисует «место 1».
    const r1 = await send(100, 1);
    check(r1.status === 200 && r1.j && r1.j.ok === 1 && typeof r1.j.rank === 'number' && r1.j.s === 100,
      'отправка результата создаёт строку', 'HTTP ' + r1.status + ', счёт ' + (r1.j && r1.j.s)
      + ', место ' + (r1.j && r1.j.rank));

    // 2. ПОВТОР того же q — идемпотентно, 409 с СОХРАНЁННЫМ состоянием.
    const r2 = await send(100, 1);
    check(r2.status === 409 && r2.j && r2.j.dup === 1 && r2.j.s === 100,
      'повтор не создаёт вторую запись', 'HTTP ' + r2.status + ', счёт ' + (r2.j && r2.j.s));

    // 3. ЧАСТОТА — вторая запись раньше 20 с отбивается.
    const r3 = await send(150, 2);
    check(r3.status === 429 && r3.j && typeof r3.j.s === 'number',
      'чаще 20 с — отказ по частоте', 'HTTP ' + r3.status);

    // 4. ПОДПИСЬ — чужая/битая не принимается.
    const r4 = await send(999999, 3, { badSig: true });
    check(r4.status === 401, 'битая подпись отвергнута', 'HTTP ' + r4.status);

    // 5. ЧТЕНИЕ ТОПА — ТРИ ИСХОДА, и жёлтый здесь несущий.
    // ⚠️ Прежняя версия проверяла только «200 и массив» и была ЗЕЛЁНОЙ на
    // мёртвом снимке: сервер честно отдаёт stale:1 и t:0, а скрипт оба поля
    // выбрасывал. Если крон не зарегистрировался, топ пуст НАВСЕГДА — и это
    // неотличимо от «крон ещё не успел», пока не посмотреть на `t`.
    const r5 = await jget(base + '/v1/top?p=1');
    const fresh = r5.j && !r5.j.stale && r5.j.t > nowSec() - SNAP_MAX_AGE;
    const never = r5.j && (r5.j.stale === 1 || r5.j.t === 0);
    const age = r5.j && r5.j.t ? Math.round((nowSec() - r5.j.t) / 60) + ' мин назад' : 'не строился';
    if (r5.status !== 200 || !r5.j || !Array.isArray(r5.j.r)) {
      check(false, 'чтение топа', 'HTTP ' + r5.status);
    } else if (fresh) {
      // ⚠️ Число строк НЕ ассертим: в день деплоя игроков ноль, и пустой
      // свежий снимок — здоровый ответ.
      check(true, 'чтение топа: снимок свежий', 'строк ' + r5.j.r.length + ', снят ' + age
        + ', кэш ' + (r5.headers.get('cache-control') || 'нет'));
    } else if (never) {
      snapshotYellow = true;
      yellow('снимок ещё НЕ СТРОИЛСЯ (stale)', 'крон печёт раз в час — дождаться тика и'
        + ' прогнать смоук ПОВТОРНО; если и во второй раз stale — крон не работает');
    } else {
      check(false, 'снимок ПРОТУХ', 'снят ' + age + ' при норме до 2 ч — крон встал');
    }

    // 6. СВОЁ МЕСТО — точное, с соседями, и с тем же счётом.
    const r6 = await me();
    check(r6.status === 200 && r6.j && r6.j.exact === 1 && Array.isArray(r6.j.dn) && r6.j.s === 100,
      'своё место и соседи', 'HTTP ' + r6.status + ', счёт ' + (r6.j && r6.j.s)
      + ', место ' + (r6.j && r6.j.rank));

    // 7. Заголовок ACAO на ЧТЕНИИ (игра живёт в iframe чужого домена).
    check((r5.headers.get('access-control-allow-origin') || '') === '*',
      'заголовок ACAO на чтении', r5.headers.get('access-control-allow-origin') || 'нет заголовка');

    // 8. ПРЕДПОЛЁТ — единственный эндпоинт, которому он нужен: DELETE.
    // ⚠️ ACAO тут НЕ ассертим: он висит на КАЖДОМ ответе, включая 404, —
    // такой ассерт был бы тавтологией и прошёл бы при «OPTIONS → 404».
    const pre = await fetch(base + '/v1/me', withTimeout({ method: 'OPTIONS',
      headers: { 'access-control-request-method': 'DELETE', origin: 'https://games.playgama.com' } }));
    const allow = pre.headers.get('access-control-allow-methods') || '';
    check(pre.status === 204 && allow.indexOf('DELETE') >= 0,
      'предполёт для DELETE обслужен', 'HTTP ' + pre.status + ', методы: ' + (allow || 'нет'));

    // 9. ВТОРАЯ УСПЕШНАЯ ОТПРАВКА — путь UPDATE, ради которого таблица и своя.
    // ⚠️ Шаги 2-4 отбиваются ДО записи, то есть проверяли только INSERT:
    // диверсия «несуществующая колонка в UPDATE» проходила зелёной, а игрок
    // при этом навсегда заморожен на первом результате — «Форбс»-модели нет.
    process.stdout.write('  … ждём окно частоты (' + (RATE_WAIT_MS / 1000) + ' с)\r');
    await sleep(RATE_WAIT_MS);
    const r9 = await send(50, 4);                      // МЕНЬШИЙ счёт: падение легально
    const after = await me();
    // ⚠️ Сверяем ПЕРЕЧИТКОЙ, а не ответом POST: `reply()` считает число в JS,
    // а подмена вроде `s=MAX(s,?)` живёт в SQL — ответ отдал бы 50 при 100 в базе.
    check(r9.status === 200 && after.status === 200 && after.j && after.j.s === 50,
      'вторая отправка меняет счёт (падение сохранено)', 'HTTP ' + r9.status
      + ', в базе ' + (after.j && after.j.s));

    // 10. ЛОКАЛЬНО: показать переход жёлтый -> зелёный. Тем самым новая
    // проверка свежести сдана КАК СТРАЖ (красна на сломанном, зелена на
    // исправном), а не только описана в доке.
    if (LOCAL) {
      check(snapshotYellow, 'локально: без снимка честно ЖЁЛТЫЙ (сломанное состояние показано)');
      await local.worker._internals.buildSnapshot(local.env);
      const r10 = await jget(base + '/v1/top?p=1');
      const ok10 = r10.j && !r10.j.stale && r10.j.t > nowSec() - SNAP_MAX_AGE
        && (r10.j.r || []).some((row) => row[0] === 'SMOKE');
      check(ok10, 'локально: после постройки снимка ЗЕЛЁНЫЙ и своя строка в топе',
        'строк ' + (r10.j && r10.j.r ? r10.j.r.length : '?'));
      snapshotYellow = false;                          // жёлтый был предъявлен намеренно
    }
  } catch (e) {
    check(false, 'смоук дошёл до конца без исключений', String(e && e.message || e));
  } finally {
    // 11. УДАЛЕНИЕ СВОИХ ДАННЫХ — и уборка за смоуком.
    try {
      const t = nowSec();
      const rd = await fetch(base + '/v1/me?id=' + id + '&t=' + t
        + '&sig=' + await sign(key, id + '.del.' + t), withTimeout({ method: 'DELETE' }));
      const jd = JSON.parse(await rd.text());
      cleaned = true;
      check(rd.status === 200 && jd.gone === 1, 'удаление своих данных (и уборка за смоуком)',
        'HTTP ' + rd.status);
      const r12 = await me();
      check(r12.status === 404, 'после удаления строки нет', 'HTTP ' + r12.status);
    } catch (e) {
      check(false, 'уборка за смоуком', String(e && e.message || e)
        + ' — удалите строку вручную, id: ' + id);
    }
    if (local) local.stop();
  }

  console.log('\nИТОГ: ' + pass + ' зелёных'
    + (warns.length ? ', жёлтых ' + warns.length : '')
    + (fails.length ? ', КРАСНЫХ ' + fails.length + ': ' + fails.join(' | ') : ''));
  if (fails.length) process.exit(1);
  if (snapshotYellow) {
    console.log('⚠️ НЕ ЗЕЛЁНЫЙ, А ЖЁЛТЫЙ: снимок ещё не строился. Дождитесь часового тика'
      + ' и прогоните смоук ВТОРОЙ РАЗ — живость крона доказывает сдвинувшееся `t`.');
    process.exit(2);
  }
  console.log(LOCAL
    ? 'Локально сценарий исполним, переход жёлтый->зелёный показан — на боевом идти по этому же списку.'
    : 'Боевой воркер отвечает по контракту.');
})();
