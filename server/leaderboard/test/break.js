// ДВУСТОРОННЯЯ ПРОВЕРКА СТРАЖЕЙ: `node server/leaderboard/test/break.js`
// ⚠️ По канону проекта страж НЕ СДАН, пока не показано, что он КРАСНЕЕТ на
// сломанной сборке и ЗЕЛЁН на исправной. Односторонний прогон «зелено на
// исправной» не защищает от тавтологии, «красно на сломанной» — от флейка.
//
// Здесь каждая диверсия бьёт в ОДНО свойство и обязана уронить ИМЕННО тот
// ассерт, который это свойство утверждает. Если диверсия роняет чужой
// ассерт — страж меряет не то, что называет.
//
// ⚠️ Патч проверяется на ПРИМЕНИМОСТЬ (строка найдена): диверсии протухают
// вместе с боевой строкой, и молча разошедшийся regex дал бы прогон по
// ЗДОРОВОЙ сборке — то есть пять уверенных зелёных ни о чём.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(DIR, 'src', 'index.js'), 'utf8');
const RUN = path.join(__dirname, 'run.js');

const SABOTAGE = [
  { name: 'сервер хранит МАКСИМУМ (как у площадки)',
    find: 'UPDATE p SET n=?, a=?, s=?, u=?',
    repl: 'UPDATE p SET n=?, a=?, s=MAX(s,?), u=?',
    expect: 'ПАДЕНИЕ СОХРАНЕНО' },
  { name: 'принимаем присланный ключ у существующей строки',
    find: 'if (!sameSig(await hmacHex(row.k, msg), body.sig))',
    repl: 'if (!sameSig(await hmacHex(body.k || row.k, msg), body.sig))',
    expect: 'ЧУЖОЙ КЛЮЧ ОТВЕРГНУТ' },
  { name: 'снято ограничение частоты',
    find: 'if (now - row.u < RATE_SEC)',
    repl: 'if (false)',
    expect: 'ЧАСТОТА: чаще 20 с' },
  { name: 'снята проверка монотонности q',
    find: 'if (q <= row.q)',
    repl: 'if (false)',
    expect: 'ПОВТОР q' },
  { name: 'снимок не фильтрует скрытых',
    find: "'SELECT n,a,s FROM p WHERE f=0 AND s>0 ORDER BY s DESC, u ASC LIMIT ?'",
    repl: "'SELECT n,a,s FROM p WHERE s>0 ORDER BY s DESC, u ASC LIMIT ?'",
    expect: 'СКРЫТОГО НЕТ' },
  { name: 'пустая лесенка снова отвечает «место 1»',
    find: 'if (!ladder || !ladder.length) return null;',
    repl: 'if (!ladder || !ladder.length) return 1;',
    expect: 'ОЦЕНКА: пустая лесенка' },
  { name: 'выше первой ступени снова «место 1»',
    find: 'return lo === 0 ? null : lo * LADDER_STEP;',
    repl: 'return lo === 0 ? 1 : lo * LADDER_STEP;',
    expect: 'ОЦЕНКА: выше первой ступени' },
  { name: '429 молчит, сколько ждать (клиент вынужден угадывать)',
    find: "return reply({ ok: 0, err: 'rate', retry: RATE_SEC - (now - row.u),",
    repl: "return reply({ ok: 0, err: 'rate',",
    expect: 'ЧАСТОТА: 429 говорит, СКОЛЬКО ждать' },
  { name: 'граница корзины считается дважды (сдвиг места на 1)',
    find: '- (bound === null ? 0 : 1)',
    repl: '- (bound === null ? 0 : 0)',
    expect: 'ТОЧНОЕ МЕСТО' },
  { name: 'отправка снимает РУЧНОЕ скрытие (спрятанный вернул себя сам)',
    find: "'UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?'",
    repl: "'UPDATE p SET n=?, a=?, s=?, u=?, q=?, f=0 WHERE id=?'",
    expect: 'РУЧНОЕ СКРЫТИЕ' },
  // ⚠️ ДВЕ ДИВЕРСИИ НА СНЯТЫЙ ПОТОЛОК — ПО ОДНОЙ НА КАЖДЫЙ УМЕРШИЙ МЕХАНИЗМ.
  // Обрезка и автоскрытие ушли вместе, но вернуть их можно ПОРОЗНЬ, и страж
  // «счёт как есть» утверждает оба признака — значит каждый нужно уронить
  // отдельно, иначе один из двух ассертов останется непроверенным.
  { name: 'вернулась ОБРЕЗКА присланного счёта',
    find: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();',
    repl: '.bind(n, Math.min(49, Math.max(1, a)), Math.min(s, 2000), now, q, id).run();',
    expect: 'СЧЁТ КАК ЕСТЬ' },
  { name: 'вернулось АВТОСКРЫТИЕ по величине счёта',
    find: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();',
    repl: '.bind(n, Math.min(49, Math.max(1, a)), s, now, q, id).run();'
        + " if (s > 2000) await env.DB.prepare('UPDATE p SET f=1 WHERE id=?').bind(id).run();",
    expect: 'СЧЁТ КАК ЕСТЬ' },
  // ⚠️⚠️ САМОПРОВЕРКА САМОГО ИНСТРУМЕНТА, А НЕ БОЕВОГО КОДА. Правка КОММЕНТАРИЯ
  // заведомо не меняет поведения — значит прогон обязан сказать «ДИВЕРСИЯ НЕ
  // СРАБОТАЛА», а не «страж слеп». Без этой записи проверка поведения сама
  // осталась бы непроверенной: она ведь тоже может замолчать.
  { name: 'САМОПРОВЕРКА: правка комментария поведения не меняет',
    find: '// ===== ЛЕСЕНКА РАНГОВ =====',
    repl: '// ===== ЛЕСЕНКА РАНГОВ (метка самопроверки) =====',
    expect: 'ОЦЕНКА: пустая лесенка', noop: true },
  { name: '/top падает вместе с базой',
    find: 'catch (e) { snap = null; }',
    repl: 'catch (e) { throw e; }',
    expect: '/top при упавшей базе' },
];

function runSuite(srcPath) {
  try {
    const out = execFileSync('node', [RUN], {
      env: Object.assign({}, process.env, srcPath ? { LB_SRC: srcPath } : {}),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}
const failedNames = (out) => out.split('\n').filter((l) => l.startsWith('FAIL: '))
  .map((l) => l.slice(6));

let bad = 0;

// 1) ИСПРАВНАЯ сборка обязана быть зелёной — иначе всё ниже бессмысленно.
const base = runSuite(null);
const baseFails = failedNames(base.out);
if (!base.ok || baseFails.length) {
  console.log('⛔ ИСПРАВНАЯ СБОРКА НЕ ЗЕЛЕНА — диверсии не имеют смысла:');
  console.log(baseFails.join('\n') || base.out.slice(-800));
  process.exit(1);
}
const baseCount = (base.out.match(/^PASS:/gm) || []).length;

// ⚠️⚠️ ВТОРОЙ ПРОГОН ИСПРАВНОЙ СБОРКИ — ЭТО НЕ ПЕРЕСТРАХОВКА, А ЛИНЕЙКА ШУМА.
// Часть чисел в сообщениях зависит от часов (например `retry` у 429), и между
// двумя ЗДОРОВЫМИ прогонами они законно расходятся. Без этой линейки любое
// расхождение читалось бы как «поведение изменилось», и проверка ниже врала бы
// в другую сторону.
const base2 = runSuite(null);
const шумныеСтроки = (function () {
  const a = base.out.split('\n'), b = base2.out.split('\n'), n = new Set();
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n.add(i);
  return n;
})();

// ⚠️⚠️ ГЛАВНОЕ: ОТЛИЧИТЬ «СТРАЖ СЛЕП» ОТ «ДИВЕРСИЯ НЕ СРАБОТАЛА».
// Протухшую диверсию видно сразу — «строка не найдена». А диверсию, которая
// ПОДСТАВИЛАСЬ, но ничего не изменила, не видно НИЧЕМ: сьют зелен, отчёт пишет
// «страж слеп», и вывод получается ложным. Живой случай (2026-08-09): патч
// `f = (s > 2000)` в SET-выражении читает СТАРОЕ значение колонки, а не
// присланное, и не срабатывал никогда — исправный страж час числился слепым.
// Признак поведения: вывод сьюта на пропатченной сборке обязан ОТЛИЧАТЬСЯ от
// вывода на исправной хоть чем-то за пределами шумных строк. Совпал дословно —
// значит диверсия не состоялась, и о страже мы не узнали НИЧЕГО.
function поведениеИзменилось(out) {
  const a = base.out.split('\n'), b = out.split('\n');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i] && !шумныеСтроки.has(i)) return true;
  return false;
}

// ⚠️⚠️ ТОЧНЫЙ ПРИЗНАК, И ОН СИЛЬНЕЕ ПРЕДЫДУЩЕГО. «Поведение изменилось хоть
// где-то» ловит только СОВСЕМ пустую диверсию. Настоящий случай 2026-08-09 был
// хитрее: патч `f = (s > 2000)` менял флаг у ЧУЖИХ строк (их числа в отчёте
// поехали), а строки, за которой следит страж «СЧЁТ КАК ЕСТЬ», не касался
// вовсе — и отчёт снова писал «страж слеп».
// Спрашиваем ровно то, что нужно: изменилось ли ТО, ЧТО ВИДИТ ЭТОТ СТРАЖ.
// Строка ассерта печатает свои замеренные числа (правило проекта), поэтому
// совпадение её текста бит-в-бит означает: диверсия прошла МИМО наблюдаемого.
function строкаСтража(out, имя) {
  return out.split('\n').filter((l) => l.indexOf(имя) >= 0).join(' ¦ ');
}
console.log('исправная сборка: ' + baseCount + ' PASS, 0 FAIL (шумных строк '
  + шумныеСтроки.size + ')\n');

// 2) Каждая диверсия — свой ассерт красный, соседи целы.
for (let i = 0; i < SABOTAGE.length; i++) {
  const sb = SABOTAGE[i];
  if (SRC.indexOf(sb.find) < 0) {
    console.log('⛔ ДИВЕРСИЯ ПРОТУХЛА (строка не найдена): ' + sb.name);
    bad++; continue;
  }
  const patched = SRC.replace(sb.find, sb.repl);
  if (patched === SRC) { console.log('⛔ ПАТЧ НЕ ИЗМЕНИЛ ФАЙЛ: ' + sb.name); bad++; continue; }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lb-')), 'index.js');
  fs.writeFileSync(tmp, patched);

  const res = runSuite(tmp);
  const fails = failedNames(res.out);
  const hit = fails.filter((f) => f.indexOf(sb.expect) >= 0);
  const collateral = fails.filter((f) => f.indexOf(sb.expect) < 0);

  if (!hit.length && !fails.length && !res.ok) {
    console.log('⛔ ДИВЕРСИЯ РАЗВАЛИЛА СБОРКУ (это НЕ слепой страж): ' + sb.name);
    console.log('   ' + res.out.trim().split('\n').slice(-2).join(' / '));
    bad++;
  } else if (!hit.length && строкаСтража(res.out, sb.expect) === строкаСтража(base.out, sb.expect)) {
    // Строка стража совпала дословно: он замерил ТО ЖЕ САМОЕ, то есть диверсия
    // прошла мимо наблюдаемого. Про сам страж мы не узнали ничего.
    if (sb.noop) {
      console.log('✅ «' + sb.name + '»\n   -> инструмент верно назвал пустую диверсию пустой');
    } else {
      console.log('⛔ ДИВЕРСИЯ ПРОШЛА МИМО (это НЕ слепой страж): «' + sb.name + '»');
      console.log('   страж замерил ТО ЖЕ, что на исправной сборке: '
        + строкаСтража(base.out, sb.expect).slice(0, 120));
      console.log('   остальная сборка ' + (поведениеИзменилось(res.out)
        ? 'изменилась — значит патч применился, но бьёт не туда'
        : 'не изменилась вовсе — патч не сработал нигде'));
      console.log('   чинить ДИВЕРСИЮ, а не страж.');
      bad++;
    }
  } else if (sb.noop) {
    console.log('⛔ САМОПРОВЕРКА ПРОВАЛЕНА: пустая диверсия не опознана как пустая');
    bad++;
  } else if (!hit.length) {
    console.log('⛔ СТРАЖ СЛЕП: «' + sb.name + '» не уронил «' + sb.expect + '»');
    console.log('   (поведение сборки изменилось — значит диверсия состоялась)');
    console.log('   упало: ' + (fails.join(' | ') || 'ничего'));
    bad++;
  } else {
    console.log('✅ «' + sb.name + '»\n   -> красный: ' + hit.join(' | ')
      + (collateral.length ? '\n   ⚠️ задело соседей: ' + collateral.join(' | ') : ''));
  }
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

// ===== ФАЗА 2: СМОУК ТОЖЕ СДАЁТСЯ КАК СТРАЖ =====
// ⚠️ Его новые проверки (сохранённый счёт, путь UPDATE, предполёт, свежесть
// снимка) обязаны краснеть на сломанной сборке — иначе они не стражи, а
// описание. Прогон идёт через `--local`, каждый ~25 с (внутри честное
// ожидание окна частоты 21 с — без него путь UPDATE не исполняется).
const SMOKE = path.join(__dirname, 'smoke.js');
const SMOKE_SABOTAGE = [
  { name: 'в базу пишется 0 вместо счёта',
    find: '.bind(id, body.k, n, Math.min(49, Math.max(1, a)), s, now, q, born).run();',
    repl: '.bind(id, body.k, n, Math.min(49, Math.max(1, a)), 0, now, q, born).run();',
    expect: 'своё место и соседи' },
  { name: 'путь UPDATE сломан (несуществующая колонка)',
    find: "'UPDATE p SET n=?, a=?, s=?, u=?, q=? WHERE id=?'",
    repl: "'UPDATE p SET n=?, a=?, s=?, u=?, zz=? WHERE id=?'",
    expect: 'вторая отправка меняет счёт' },
  { name: 'предполёт не обслуживается',
    find: "if (req.method === 'OPTIONS') return preflight();",
    repl: "if (false) return preflight();",
    expect: 'предполёт для DELETE' },
  { name: 'пустой снимок выдаёт себя за свежий',
    find: "return reply({ t: 0, n: 0, p: page, r: [], stale: 1 }, 200,",
    repl: "return reply({ t: nowSec(), n: 0, p: page, r: [] }, 200,",
    expect: 'локально: без снимка честно ЖЁЛТЫЙ' },
];

function runSmoke(srcPath) {
  try {
    const out = execFileSync('node', [SMOKE, '--local'], {
      env: Object.assign({}, process.env, srcPath ? { LB_SRC: srcPath } : {}),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}
const smokeFails = (out) => out.split('\n').filter((l) => l.indexOf('❌') >= 0)
  .map((l) => l.replace(/^\s*❌\s*/, '').split('  —')[0].trim());

console.log('\n--- фаза 2: смоук ---');
const sBase = runSmoke(null);
if (!sBase.ok || smokeFails(sBase.out).length) {
  console.log('⛔ СМОУК НЕ ЗЕЛЁН НА ИСПРАВНОЙ СБОРКЕ:');
  console.log(smokeFails(sBase.out).join(' | ') || sBase.out.slice(-600));
  bad++;
} else {
  console.log('исправная сборка: смоук зелёный\n');
  for (const sb of SMOKE_SABOTAGE) {
    if (SRC.indexOf(sb.find) < 0) {
      console.log('⛔ ДИВЕРСИЯ ПРОТУХЛА (строка не найдена): ' + sb.name); bad++; continue;
    }
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lbs-')), 'index.js');
    fs.writeFileSync(tmp, SRC.replace(sb.find, sb.repl));
    const res = runSmoke(tmp);
    const f = smokeFails(res.out);
    const hit = f.filter((x) => x.indexOf(sb.expect) >= 0);
    if (!hit.length && !f.length && !res.ok) {
      console.log('⛔ ДИВЕРСИЯ РАЗВАЛИЛА СБОРКУ (это НЕ слепой страж): ' + sb.name); bad++;
    } else if (!hit.length) {
      console.log('⛔ СМОУК СЛЕП: «' + sb.name + '» не уронил «' + sb.expect + '»');
      console.log('   упало: ' + (f.join(' | ') || 'ничего')); bad++;
    } else {
      const other = f.filter((x) => x.indexOf(sb.expect) < 0);
      console.log('✅ «' + sb.name + '»\n   -> красный: ' + hit.join(' | ')
        + (other.length ? '\n   ⚠️ задело соседей: ' + other.join(' | ') : ''));
    }
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

console.log('\n' + (bad ? 'ДВУСТОРОННЯЯ ПРОВЕРКА: ПРОВАЛ (' + bad + ')'
  : 'ДВУСТОРОННЯЯ ПРОВЕРКА: ПРОЙДЕНА — все ' + SABOTAGE.length
    + ' диверсий сьюта + ' + SMOKE_SABOTAGE.length + ' смоука пойманы, обе сборки зелены'));
process.exit(bad ? 1 : 0);
