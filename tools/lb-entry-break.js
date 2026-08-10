// ДВУСТОРОННЯЯ ПРОВЕРКА СТРАЖЕЙ ТОЧКИ ВХОДА В ТАБЛИЦУ (диспетчер, 2026-08-10)
//
// ⚠️ ЗАЧЕМ ОТДЕЛЬНЫЙ ИНСТРУМЕНТ, А НЕ ПОЛНЫЙ СЬЮТ НА КАЖДУЮ ДИВЕРСИЮ: сьют идёт
// 13 минут, диверсий шесть. Здесь снимаются РОВНО ТЕ ЖЕ величины, которые
// читают стражи в test.js, — то есть проверяется наблюдаемость дефекта той же
// линейкой. Зелёный полный прогон отдельно доказывает, что стражи подключены.
//
// ⚠️ ТРИ ПРИЗНАКА НЕСРАБОТАВШЕЙ ДИВЕРСИИ (закон проекта, 2026-08-09) закрыты:
//   • ПРОТУХЛА  — подстрока не найдена, печатаем явно и выходим;
//   • ПРОШЛА МИМО / НЕ СРАБОТАЛА — сравниваем ЗАМЕР, а не факт подстановки:
//     если снятые числа совпали с базовыми бит-в-бит, диверсия названа пустой.
// ⚠️ САМОПРОВЕРКА ИНСТРУМЕНТА постоянной записью в списке: правка комментария
// заведомо ничего не меняет, и прогон ОБЯЗАН назвать её пустой. Без неё
// проверка поведения осталась бы непроверенной.
//
// ⚠️ ОРИГИНАЛЫ ВОССТАНАВЛИВАЮТСЯ В `finally` И СВЕРЯЮТСЯ ПОБАЙТОВО В КОНЦЕ:
// прошлый раз прогон диверсий, убитый по SIGPIPE, оставил боевую сборку
// изувеченной, и следующая диверсия отрапортовала об этом как о чужой ошибке.
// По той же причине НЕ пускать вывод через `| head` — закрытая труба убивает
// писателя сигналом, и уборка не наступает.
//
// Запуск: NODE_PATH=<...>/node_modules node tools/lb-entry-break.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = (f) => path.join(ROOT, f);

// ⚠️ Стенд не поднимаем: сеть подменяется ДО загрузки страницы, как в сьюте.
// `/v1/me` отвечает так же, как боевой сервер новичку: 404 `{"err":"none"}`.
// ⚠️ СТРОКИ ТОПА — МАССИВЫ `[имя, аватар, счёт]`: так их шлёт боевой сервер и
// так их разбирает `lbRow`. Мок из объектов давал бы `null` на строку и НОЛЬ
// аватаров — стенд врал бы в пользу «всё влезает» (поймано на себе).
const MOCK = () => {
  try { localStorage.clear(); localStorage.setItem('mixer_lb_url', 'http://lb.test'); } catch (e) {}
  const of = window.fetch;
  window.fetch = function (u) {
    if (String(u).indexOf('/v1/me') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ err: 'none' }), { status: 404 }));
    if (String(u).indexOf('/v1/top') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ t: 1, n: 3, p: 1,
        r: [['Otter', 5, 900], ['Perch', 12, 800], ['Tanuki', 46, 700]] }), { status: 200 }));
    return of.apply(this, arguments);
  };
};

// ГЕОМЕТРИЯ РЯДА: чернила заголовка против его бокса и зазор до правой группы.
// ⚠️ Чернила через `Range`, а не `scrollWidth` — тот у переполняющего текста врёт.
const ГЕОМ = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('pauseBtn').click();
  await sleep(500);
  const t = document.querySelector('.ms-lbe-title');
  const rg = document.createRange(); rg.selectNodeContents(t);
  const ink = rg.getBoundingClientRect(), box = t.getBoundingClientRect();
  const txt = document.querySelector('.ms-lbe-txt').getBoundingClientRect();
  const right = document.querySelector('.ms-lbe-right').getBoundingClientRect();
  const out = { чернила: Math.round(ink.width), бокс: Math.round(box.width),
    зазор: Math.round(right.left - txt.right),
    аватаров: Array.prototype.filter.call(document.querySelectorAll('#msLbeAvs img'),
      (i) => i.getBoundingClientRect().width > 0).length };
  { const p = document.querySelector('.ms-play'); if (p) p.click(); }
  await sleep(250);
  return out;
};

// СНИМОК ТЕХ ЖЕ ВЕЛИЧИН, ЧТО ЧИТАЮТ СТРАЖИ. Меню открывается НАСТОЯЩИМ путём.
const SNAP = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('pauseBtn').click();
  await sleep(400);
  const H = () => { const e = document.getElementById('msLbEntry');
    return e ? Math.round(e.getBoundingClientRect().height) : -1; };
  const модуль = window.__lb;
  let выкл = -1;
  try { window.__lb = undefined; window.__game.lbEntryRefresh(); await sleep(60); выкл = H(); }
  finally { window.__lb = модуль; window.__game.lbEntryRefresh(); }
  await sleep(400);
  const e = document.getElementById('msLbEntry');
  const r = e.getBoundingClientRect();
  return {
    выкл, вкл: H(),
    место: (document.getElementById('msLbeSub') || {}).textContent || '',
    точка: (document.getElementById('msLbeDot') || {}).textContent || '',
    кнопок: document.querySelectorAll('#msLbEntry button').length,
    подПрофилем: r.top >= document.querySelector('.ms-head').getBoundingClientRect().bottom,
    надИгрой: r.bottom <= document.querySelector('.ms-play').getBoundingClientRect().top,
  };
};

// ⚠️ АДРЕС ЧИТАЕТСЯ ИЗ СБОРКИ ТЕМ ЖЕ РАЗБОРОМ, ЧТО В СЬЮТЕ, — иначе диверсия
// «снять гейт» проверялась бы другой линейкой, чем страж.
function поставка() {
  const s = fs.readFileSync(P('index.html'), 'utf8');
  const m = /const LB_URL\s*=\s*([^;]+);/.exec(s);
  const выражение = m ? m[1].replace(/\s+/g, ' ').trim() : '';
  return { выражение, адрес: (/'(https:\/\/[^']+)'/.exec(выражение) || [])[1] || '',
           гейт: /file:/.test(выражение) };
}

const ДИВЕРСИИ = [
  { имя: 'САМОПРОВЕРКА: правка комментария', файл: 'src/app/85-hud.js',
    было: '// ─── ТОЧКА ВХОДА В ТАБЛИЦУ', стало: '// --- ТОЧКА ВХОДА В ТАБЛИЦУ',
    ждём: 'ничего (инструмент обязан назвать диверсию ПУСТОЙ)' },
  { имя: 'блок показывается всегда, мимо base()', файл: 'src/app/85-hud.js',
    было: '  box.hidden = !on;', стало: '  box.hidden = false;',
    ждём: 'страж «фича выключена» (выкл станет > 0)' },
  { имя: 'место показывается БЕЗ признака exact', файл: 'src/app/85-hud.js',
    было: "    const ok = !!(m && m.state === 'ok' && m.exact && m.rank > 0);",
    стало: "    const ok = true;",
    ждём: 'страж новичка (появится число из ниоткуда)' },
  { имя: 'блок уехал ПОД карточку Play', файл: 'src/shell.html',
    было: '    .ms-lbentry { order:1; }', стало: '    .ms-lbentry { order:3; }',
    ждём: 'страж места в раскладке (надИгрой станет false)' },
  { имя: 'второй фокусируемый узел в ряду', файл: 'src/shell.html',
    было: '          <span class="ms-lbe-open">Open</span>',
    стало: '          <button class="ms-lbe-open">Open</button>',
    ждём: 'страж «ровно одна кнопка» (кнопок станет 2)' },
  { имя: 'аватары НЕ уступают тексту на узком экране', файл: 'src/shell.html',
    было: '  @media (max-width:389px){ .ms-lbe-avs img:nth-child(3){ display:none; } }\n  @media (max-width:359px){ .ms-lbe-avs img:nth-child(2){ display:none; } }',
    стало: '  /* уступание снято диверсией */',
    ждём: 'стражи узких ширин (на 320 чернила заголовка вылезут из бокса)' },
  { имя: 'снят гейт file:// — прогоны пишут в БОЕВУЮ таблицу', файл: 'src/app/00-config.js',
    было: "const LB_URL = (typeof location !== 'undefined' && location.protocol === 'file:')\n  ? '' : 'https://lb.blendo.monster';",
    стало: "const LB_URL = 'https://lb.blendo.monster';",
    ждём: 'страж поставки (гейт исчезнет из выражения)' },
  { имя: 'адрес уведён на выключенный workers.dev', файл: 'src/app/00-config.js',
    было: "? '' : 'https://lb.blendo.monster';", стало: "? '' : 'https://blendo-lb.workers.dev';",
    ждём: 'страж поставки (адрес станет workers.dev)' },
];

(async () => {
  const сборка = () => execFileSync('python3', [P('build.py')], { cwd: ROOT }).toString().trim();
  const оригиналы = new Map();
  for (const d of ДИВЕРСИИ) if (!оригиналы.has(d.файл)) оригиналы.set(d.файл, fs.readFileSync(P(d.файл), 'utf8'));

  const browser = await chromium.launch();
  const снять = async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(MOCK);
    await page.goto('file://' + P('index.html'));
    await page.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    await page.evaluate(() => window.__game.skipIntro());
    await new Promise((r) => setTimeout(r, 1200));
    const out = await page.evaluate(SNAP);
    const ш390 = await page.evaluate(ГЕОМ);
    await page.setViewportSize({ width: 320, height: 780 });
    await page.waitForTimeout(250);
    const ш320 = await page.evaluate(ГЕОМ);
    await page.close();
    return Object.assign(out, поставка(), { ш390, ш320 });
  };

  let слепых = 0, пустых = 0, сборкаДо = null;
  try {
    console.log(сборка());
    сборкаДо = fs.readFileSync(P('index.html'), 'utf8');
    const база = await снять();
    console.log('БАЗА (исправная сборка):', JSON.stringify(база));
    console.log('');

    for (const d of ДИВЕРСИИ) {
      const исходный = оригиналы.get(d.файл);
      if (исходный.indexOf(d.было) < 0) {
        console.log('⛔ ДИВЕРСИЯ ПРОТУХЛА (строка не найдена): ' + d.имя);
        слепых++; continue;
      }
      try {
        fs.writeFileSync(P(d.файл), исходный.replace(d.было, d.стало));
        сборка();
        const снимок = await снять();
        const одинаково = JSON.stringify(снимок) === JSON.stringify(база);
        const самопроверка = d.имя.indexOf('САМОПРОВЕРКА') === 0;
        if (одинаково) {
          пустых++;
          console.log((самопроверка ? '✅ ' : '⛔ ') + 'ДИВЕРСИЯ ПУСТАЯ (замер не изменился): ' + d.имя);
          if (!самопроверка) слепых++;
        } else if (самопроверка) {
          слепых++;
          console.log('⛔ ИНСТРУМЕНТ ВРЁТ: пустая правка изменила замер — ' + JSON.stringify(снимок));
        } else {
          console.log('✅ ПОЙМАНА: ' + d.имя);
          console.log('   ждали: ' + d.ждём);
          // ⚠️ ПЕЧАТАЕМ ЗАМЕРЕННОЕ, А НЕ ФАКТ РАСХОЖДЕНИЯ: на вложенных объектах
          // конкатенация давала `[object Object] -> [object Object]`, и по такой
          // строке нельзя отличить «поехало в ожидаемую сторону» от «поехало
          // куда-то ещё». Правило проекта «печатай числа в сообщении» здесь
          // несущее — на нём держится различение трёх признаков диверсии.
          const diff = [];
          for (const k of Object.keys(база)) if (JSON.stringify(база[k]) !== JSON.stringify(снимок[k]))
            diff.push(k + ': ' + JSON.stringify(база[k]) + ' -> ' + JSON.stringify(снимок[k]));
          console.log('   разошлось: ' + diff.join('; '));
        }
      } finally {
        fs.writeFileSync(P(d.файл), исходный);
      }
    }
  } finally {
    await browser.close();
    for (const [f, s] of оригиналы) fs.writeFileSync(P(f), s);
    console.log('\nвосстановление: ' + сборка());
    // ⚠️ ПОБАЙТОВАЯ СВЕРКА — ОБЯЗАТЕЛЬНАЯ ЧАСТЬ, а не вежливость: изувеченная
    // боевая сборка снаружи выглядит как чужая ошибка.
    // ⛔ СВЕРЯЕМСЯ С СОБСТВЕННЫМ СНИМКОМ, А НЕ С `git status`: правки этой ветки
    // ещё не закоммичены, и git честно показал бы «грязно» при идеальной уборке —
    // то есть проверка была бы зелёной/красной не по тому поводу.
    let целы = true;
    for (const [f, s] of оригиналы) if (fs.readFileSync(P(f), 'utf8') !== s) { целы = false; console.log('⛔ НЕ ВОССТАНОВЛЕН: ' + f); }
    if (сборкаДо !== null && fs.readFileSync(P('index.html'), 'utf8') !== сборкаДо) { целы = false; console.log('⛔ СБОРКА РАЗОШЛАСЬ С ИСХОДНОЙ'); }
    console.log(целы ? '✅ исходники и сборка восстановлены побайтово' : '⛔ УБОРКА НЕ ПОЛНАЯ');
  }
  console.log(слепых ? ('\n⛔ НЕ СДАНО: слепых/несработавших ' + слепых) :
    '\n✅ ВСЕ СТРАЖИ ДВУСТОРОННИ (пустых по плану: ' + пустых + ')');
  process.exit(слепых ? 1 : 0);
})();
