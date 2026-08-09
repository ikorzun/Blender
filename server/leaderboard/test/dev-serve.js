// ПОСТОЯННЫЙ ЛОКАЛЬНЫЙ СТЕНД таблицы лидеров — для разработки клиента и экрана,
// пока боевой воркер не развёрнут.
//
//   node server/leaderboard/test/dev-serve.js
//   node server/leaderboard/test/dev-serve.js --port=8788 --seed=24
//
// Тот же `src/index.js` поверх `node:sqlite`, живёт до Ctrl-C. При старте
// засевает базу и СТРОИТ СНИМОК, поэтому `/v1/top` отдаёт непустой список
// сразу — вёрстку списка есть на чём проверять с первой секунды.
//
// ⚠️⚠️ СЛУЖЕБНЫЕ МАРШРУТЫ `/_dev/*` ЖИВУТ ЗДЕСЬ, А НЕ В `src/index.js`.
// Боевой воркер накануне одноразового захода в чужой аккаунт не трогаем — по
// той же причине, по которой отложен `/admin/snap`. Стенд их перехватывает
// ДО обращения к воркеру, продукт о них не знает вовсе.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { makeDB } = require('./d1.js');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
};
const PORT = Number(opt('port', 8788));          // 8779 — превью игры, 8787 — wrangler
const SEED_N = args.includes('--no-seed') ? 0 : Number(opt('seed', 24));

const DIR = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
const KEY = 'a'.repeat(64);                       // общий ключ сид-строк, см. ниже
const nowSec = () => Math.floor(Date.now() / 1000);

// Имена из того же ряда, что `GUEST_NAMES` в игре: список должен выглядеть
// как настоящий, иначе вёрстка проверяется на «P1/P2/P3» и ломается на живых
// длинных именах.
const NAMES = ['Kingfisher', 'Otter', 'Aquamarine Guppy', 'Peregrine', 'Marmot',
  'Puffin', 'Ocelot', 'Snowy Owl', 'Axolotl', 'Ibis', 'Capybara', 'Lynx',
  'Hummingbird', 'Pangolin', 'Narwhal', 'Meerkat', 'Quokka', 'Tapir',
  'Wolverine', 'Sandpiper', 'Fennec', 'Manatee', 'Osprey', 'Jerboa'];

function seed(env, n) {
  const t0 = nowSec() - 200000;
  const st = env.DB._raw.prepare(
    'INSERT OR REPLACE INTO p (id,k,n,a,s,u,q,c,cl,f) VALUES (?,?,?,?,?,?,?,?,0,?)');
  env.DB._raw.exec('BEGIN');
  for (let i = 0; i < n; i++) {
    // счёт с разбросом порядков — в списке должны быть и 5 цифр, и 2:
    // на ровном ряду не видно, как вёрстка держит длинные числа
    const s = Math.round(90000 / Math.pow(1.35, i)) + (i * 7 % 13);
    st.run('gidseed' + String(i).padStart(6, '0'), KEY, NAMES[i % NAMES.length],
      (i % 49) + 1, s, t0 + i * 60, 1, t0, 0);
  }
  // ⚠️ Одна СКРЫТАЯ строка: экран обязан её не показывать, и проверить это
  // можно только если она в базе есть.
  st.run('gidseedhidden', KEY, 'ShouldNotAppear', 1, 999999, t0, 1, t0, 1);
  env.DB._raw.exec('COMMIT');
}

(async () => {
  const worker = (await import(require('url').pathToFileURL(
    path.join(DIR, 'src', 'index.js')).href)).default;
  const env = { DB: makeDB(SCHEMA), ADMIN_TOKEN: 'dev' };

  const snap = async () => worker._internals.buildSnapshot(env);
  const count = () => env.DB._raw.prepare('SELECT COUNT(*) c FROM p').get().c;

  if (SEED_N > 0) { seed(env, SEED_N); await snap(); }

  const json = (rs, obj, status) => {
    rs.writeHead(status || 200, {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    rs.end(JSON.stringify(obj));
  };

  const srv = http.createServer(async (rq, rs) => {
    const u = new URL(rq.url, 'http://local');

    // ===== служебные маршруты СТЕНДА (в продукте их нет) =====
    if (u.pathname.startsWith('/_dev/')) {
      if (rq.method === 'OPTIONS') {
        rs.writeHead(204, { 'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type' });
        return rs.end();
      }
      try {
        if (u.pathname === '/_dev/snap') {
          // ⚠️ БЕЗ ЭТОГО СТЕНД БЕСПОЛЕЗЕН: на боевом снимок печёт крон раз в час,
          // локально крона нет вовсе — экран вечно видел бы жёлтое пустое
          // состояние, и это читалось бы как «сломан клиент».
          const r = await snap();
          return json(rs, { ok: 1, top: r.top, ladder: r.ladder });
        }
        if (u.pathname === '/_dev/seed') {
          const n = Number(u.searchParams.get('n') || SEED_N || 24);
          seed(env, n); await snap();
          return json(rs, { ok: 1, seeded: n, rows: count() });
        }
        if (u.pathname === '/_dev/rewind') {
          // ⚠️⚠️ ДВЕ РАЗНЫЕ ЗАЩИТЫ СЕРВЕРА МЕШАЮТ ИМЕННО РАЗРАБОТКЕ, И ВТОРАЯ
          // МАСКИРУЕТСЯ ПОД ПОЛОМКУ КЛИЕНТА. Поймано прогоном стенда:
          //   1) окно частоты 20 с — каждая вторая отправка 429;
          //   2) ВОЗРАСТНОЙ ПОТОЛОК — он меряет возраст СТРОКИ. Строке,
          //      созданной минуту назад, разрешено ~2000 очков; вторая
          //      отправка с большим числом СКРЫВАЕТ её из общей таблицы
          //      (f=1). Снаружи это выглядит как «моя строка пропала из
          //      топа, клиент сломан», хотя сервер отработал ровно по спеке.
          // Поэтому перематываем ОБА часа строки: последнюю запись и рождение.
          // Механику не выключаем — её проверяет смоук; здесь просто делаем
          // строку «взрослой», как у настоящего игрока.
          const sec = Math.max(60, Number(u.searchParams.get('sec') || 3600));
          env.DB._raw.prepare('UPDATE p SET u = u - ?, c = c - ?').run(sec, sec);
          return json(rs, { ok: 1, sec,
            note: 'часы строк отмотаны: окно частоты и возраст (возрастной потолок больше не прячет)' });
        }
        if (u.pathname === '/_dev/reset') {
          env.DB._raw.exec('DELETE FROM p; DELETE FROM snap;');
          return json(rs, { ok: 1, rows: 0 });
        }
        if (u.pathname === '/_dev/state') {
          const top = await worker.fetch(new Request('http://local/v1/top?p=1'), env);
          return json(rs, { rows: count(), top: JSON.parse(await top.text()) });
        }
      } catch (e) { return json(rs, { err: String(e && e.message || e) }, 500); }
      return json(rs, { err: 'нет такого служебного маршрута' }, 404);
    }

    // ===== всё остальное — БОЕВОЙ воркер, без единой поблажки =====
    const chunks = []; for await (const c of rq) chunks.push(c);
    const req = new Request('http://local' + rq.url, {
      method: rq.method, headers: rq.headers,
      body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks),
    });
    const res = await worker.fetch(req, env);
    rs.writeHead(res.status, Object.fromEntries(res.headers));
    rs.end(Buffer.from(await res.arrayBuffer()));
  });

  srv.listen(PORT, () => {
    const base = 'http://127.0.0.1:' + PORT;
    console.log('СТЕНД ТАБЛИЦЫ ЛИДЕРОВ: ' + base);
    console.log('строк в базе: ' + count() + ' (одна из них СКРЫТА — в топе её быть не должно)');
    console.log('');
    console.log('  боевые:    POST ' + base + '/v1/score');
    console.log('             GET  ' + base + '/v1/top?p=1');
    console.log('             GET  ' + base + '/v1/me?id=…&t=…&sig=…');
    console.log('             DEL  ' + base + '/v1/me?id=…&t=…&sig=…');
    console.log('  стенда:    POST ' + base + '/_dev/snap     — построить снимок (на боевом это крон раз в час)');
    console.log('             POST ' + base + '/_dev/seed?n=24 — пересеять список');
    console.log('             POST ' + base + '/_dev/rewind?sec=3600 — состарить строки: снимает и окно');
  console.log('                                            частоты, и возрастной потолок');
    console.log('             POST ' + base + '/_dev/reset     — очистить');
    console.log('             GET  ' + base + '/_dev/state     — что сейчас в базе и в топе');
    console.log('');
    console.log('⚠️ База В ПАМЯТИ: перезапуск стенда = свежий сид. Ctrl-C — остановить.');
    console.log('⚠️ Маршрутов /_dev/* в боевом воркере НЕТ и не будет — это стенд.');
  console.log('');
  console.log('⚠️⚠️ ЕСЛИ СВОЯ СТРОКА ПРОПАЛА ИЗ ТОПА — ЭТО НЕ КЛИЕНТ. Сервер режет рост');
  console.log('     по ВОЗРАСТУ СТРОКИ: свежей разрешено ~2000, выше — прячет её из общей');
  console.log('     таблицы (своё место при этом отдаётся). Лечится `POST /_dev/rewind`,');
  console.log('     после него следующая честная отправка возвращает строку сама.');
  });
})();
