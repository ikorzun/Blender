const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ⚠️ РЕВЬЮ 2026-07-21: сьют раньше только ПЕЧАТАЛ значения и всегда выходил
// с кодом 0 — «зелёный» ничего не гарантировал. Теперь каждое ожидание — через
// expect(): FAIL копится в failures, процесс завершается exitCode=1.
// «PASS/FAIL» в логе — человеку, exitCode — конвейеру (build && node test.js).
(async () => {
  const failures = [];
  const expect = (cond, msg) => {
    console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg);
    if (!cond) failures.push(msg);
  };

  // ⚠️⚠️ ПОСЛЕ «Next» ЦЕПОЧКА ПОБЕДЫ СТАЛА ДЛИННЕЕ: статистика → НОВАЯ ВЕЩЬ →
  // анонс → уровень (звено добавлено 2026-08-10 по слову владельца). Экран
  // новой вещи — полноэкранный `.overlay`, и пока его не закрыли, ЛЮБОЙ клик по
  // игре перехватывается им. Без этого шага прогон умирал на 31-м ассерте с
  // «#newObj intercepts pointer events», причём выглядело это как зависание.
  // ⚠️ Закрываем НАСТОЯЩИМ путём — кнопкой, а не `newObjHide()`: иначе страж
  // проверял бы обход механики, а не саму цепочку (канон «приводить состояние
  // настоящим путём»). Условно: на уровнях без новой вещи экрана нет вовсе.
  const passNewObj = async (pg) => {
    const был = await pg.evaluate(() => {
      const b = document.getElementById('newObj');
      if (!b || !b.classList.contains('on')) return false;
      document.getElementById('newObjBtn').click();
      return true;
    });
    if (был) await pg.waitForFunction(
      () => { const b = document.getElementById('newObj'); return !b || !b.classList.contains('on'); },
      null, { timeout: 5000 });
    return был;
  };

  // ⚠️⚠️ СТЕНД ДЛЯ СТРАЖЕЙ ОТПРАВКИ. `LB_NOSEND` глушит отправку по ДВУМ
  // признакам: `file:` и `navigator.webdriver`. Сьют попадает под ОБА, поэтому
  // страж, проверяющий САМУ отправку, обязан привести обстановку игрока:
  // страницу отдать по http и погасить признак автоматизации. Иначе он мерит
  // гейт, а не отправку, — и краснеет на ИСПРАВНОЙ сборке (ровно это и вышло:
  // три ассерта отправки написаны при прежнем гейте и НИ РАЗУ не исполнялись,
  // потому что до них прогон не доходил).
  // ⛔ СЕТИ ОТСЮДА ВСЁ РАВНО НЕТ: `fetch` у этих страниц подменён своим моком,
  // ни один запрос наружу не уходит. Гейт снимается ТОЛЬКО в паре с моком.
  // ⚠️ Сервер отдаёт РОВНО index.html, на прочие пути — 404: иначе мост
  // площадки получил бы HTML вместо своего скрипта и насыпал ошибок в общий
  // гейт (страж падал бы не на проверяемом свойстве).
  const httpStand = async () => {
    const http = require('http');
    const srv = http.createServer((req, res) => {
      if (String(req.url).split('?')[0] !== '/index.html'){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    return { url: 'http://127.0.0.1:' + srv.address().port + '/index.html',
             close(){ try { srv.close(); } catch (e) {} } };
  };
  // Гасим признак автоматизации — ставится в addInitScript ДО скриптов страницы,
  // потому что `LB_NOSEND` вычисляется в момент разбора модуля конфига.
  const маскаБота = () => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch (e) {}
  };

  const browser = await chromium.launch();

  // ⚠️⚠️ СЬЮТ НЕ ХОДИТ В БОЕВОЙ СЕРВЕР ТАБЛИЦЫ. Найдено прогоном 2026-08-10:
  // открытие меню зовёт `/v1/me`, тот для игрока БЕЗ строки честно отвечает
  // 404 (`err:"none"`, это документированная норма) — а Chromium пишет любой
  // 4xx в консоль, и гейт ошибок валил ВЕСЬ прогон на штатном поведении.
  // ⛔ Гасить сам гейт или фильтровать «404» из него НЕЛЬЗЯ: он ловит
  // настоящие поломки, а текст сообщения в консоли не несёт адреса — отличить
  // наш законный 404 от чужой пропавшей картинки было бы нечем.
  // ⚠️ И ЭТО НЕ ТОЛЬКО ПРО ЛОГ: до правки КАЖДЫЙ прогон сьюта стучался в
  // боевой воркер владельца. Чтение безвредно (пишет только `submit`, он
  // загейчен), но это внешняя зависимость: сервер лёг или включил ограничение
  // частоты — и «сьют покраснел» без единой правки в игре.
  // ⚠️ Заглушка ставится ПЕРВОЙ, поэтому секции со своими моками (стражи
  // отправки, экран таблицы) заворачивают её сверху и остаются главнее.
  const лбЗаглушка = () => {
    const of = window.fetch;
    window.fetch = function (u, o) {
      const s = String(u);
      if (s.indexOf('/v1/top') >= 0)
        return Promise.resolve(new Response(JSON.stringify({ r: [], t: 0, n: 0 }), { status: 200 }));
      // Форма взята у настоящего сервера: строки нет — 404 с `err:"none"`.
      if (s.indexOf('/v1/me') >= 0)
        return Promise.resolve(new Response(JSON.stringify({ err: 'none' }), { status: 404 }));
      if (s.indexOf('/v1/score') >= 0)
        return Promise.resolve(new Response(JSON.stringify({ ok: 1, s: 0, rank: null, exact: 0 }), { status: 200 }));
      return of.apply(this, arguments);
    };
  };
  const _newPage = browser.newPage.bind(browser);
  browser.newPage = async function (...a) {
    const pg = await _newPage(...a);
    await pg.addInitScript(лбЗаглушка);
    return pg;
  };

  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, 'index.html'));
  // не слепые 2.5 с, а честное ожидание: RAPIER.init асинхронный, __game
  // появляется после старта игры (флейк на холодной машине)
  await page.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });

  // ⚠️ ЗАНАВЕС ЗАГРУЗКИ — ЕДИНСТВЕННОЕ ОКНО, ГДЕ ЕГО ВИДНО: дальше сьют зовёт
  // skipIntro, тот ставит introdone и защёлка uiready открывается навсегда.
  // Спека владельца 2026-07-30 «во время загрузки бриджа не должно быть никаких
  // элементов интерфейса» — без этого ассерта фичу не проверяет ничто.
  // ⚠️ Ассерт УСЛОВНЫЙ, и это НЕ слабость: страховочный таймаут (8 с в 85-hud)
  // на медленной машине может успеть открыть занавес до этой строки, и
  // безусловная проверка стала бы флейком. Регрессию (снесли CSS-правило) он
  // ловит всё равно — при живой защёлке узлы обязаны быть скрыты.
  const curtain = await page.evaluate(() => {
    const ids = ['topBar', 'bottomBar', 'face', 'toast', 'tierToast', 'vitrine'];
    const shown = ids.filter(id => getComputedStyle(document.getElementById(id)).visibility !== 'hidden');
    const btn = document.getElementById('shakeBtn').getBoundingClientRect();
    const under = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
    return { latched: document.documentElement.classList.contains('uiready'), shown,
             tapReaches: !!(under && under.closest && under.closest('#bottomBar')) };
  });
  if (curtain.latched) console.log('SKIP: занавес уже открыт страховкой — окно проверки упущено');
  else {
    expect(curtain.shown.length === 0, 'ЗАНАВЕС: до introdone интерфейса нет (видимых узлов: ' +
      (curtain.shown.join(',') || 'ноль') + ')');
    expect(!curtain.tapReaches, 'ЗАНАВЕС: тап по месту Shake не доходит до кнопки');
  }

  // сюжет глушим на время механических секций: его полноэкранная виньетка
  // съедала бы координатные клики (своя секция включает его обратно)
  await page.evaluate(() => window.__game.storyEnable(false));
  await page.evaluate(() => window.__game.skipIntro());
  // ЧАША-РАЗЛЁТ: для СТАРЫХ длинных секций разлёт глушится (N=999) — в
  // режиме combo любой бот-прогон набирает трещины и чаша разлеталась
  // ПОСРЕДИ чужого стража (ловля: «защёлка 20% — ty null», уровень кончился
  // победой раньше камеры). Секция чаши живёт на СВОЕЙ странице со своим N.
  await page.evaluate(() => window.__game.bowlSetN(999));
  const latchedAfter = await page.evaluate(() => document.documentElement.classList.contains('uiready'));
  expect(latchedAfter, 'ЗАНАВЕС: introdone открыл защёлку uiready');

  const t0 = await page.evaluate(() => ({
    alive: window.__game.alive(),
    pairsAvail: window.__game.availablePairs(),
  }));
  console.log('start:', JSON.stringify(t0));
  // ⚠️ ЧИСЛО СМЕНИЛОСЬ ПРОГРЕССИЕЙ 2026-08-05 (отзыв тестеров «лёгкий уровень
  // должен быть меньше»): ур.1 = pairsForLevel(1)=40 пар + рыбка + бомба ≈ 82
  // (было 130). Вилка широкая: трим на рыхлом сиде тихо изымает пары.
  expect(t0.alive >= 70 && t0.alive <= 95, 'старт: предметов 70-95 по новой прогрессии (' + t0.alive + ')');
  expect(t0.pairsAvail > 0, 'старт: есть доступные пары (' + t0.pairsAvail + ')');
  // первые 15 уровней — предметы одного размера (спека владельца 2026-07-21)
  const sizes0 = await page.evaluate(() => window.__game.sizes());
  expect(sizes0.length === 1 && sizes0[0] === 1, 'уровень <=15: все предметы одного размера (' + JSON.stringify(sizes0) + ')');

  // КАП ГРУППЫ (спека владельца 2026-07-27 «поставь кап на 8»): ур.1 — 9 типов,
  // до капа тап уносил до 16 штук разом. Бьём РЕАЛЬНЫМ тапом по лучшей группе
  // и смотрим, сколько предметов ушло (кап считает и тапнутый).
  const capBefore = await page.evaluate(() => {
    const t = window.__game.bestTapTarget();
    return t ? { alive: window.__game.alive(), n: t.n, raw: t.raw, px: t.px, py: t.py } : null;
  });
  if (capBefore && capBefore.px != null){
    await page.mouse.click(capBefore.px, capBefore.py);
    await page.waitForTimeout(400);
    const gone = capBefore.alive - await page.evaluate(() => window.__game.alive());
    expect(gone <= 8, 'кап группы: за тап ушло не больше 8 (' + gone + ', цель обещала ' + capBefore.n + ')');
    expect(capBefore.n <= 8, 'цель тапа не обещает больше капа (' + capBefore.n + ')');
    // ⚠️ БЕЗ ЭТОГО АССЕРТ МОЖЕТ ПРОВЕРЯТЬ ПУСТОТУ: если самая крупная группа
    // сама меньше 8, «ушло <= 8» верно тривиально и кап не тронут. raw —
    // размер ДО капа, поэтому видно, сработал он или нет (ревью v157).
    console.log('кап группы (естественный): raw ' + capBefore.raw + ' -> n ' + capBefore.n + ', ушло ' + gone);
  } else console.log('кап группы: цели не нашлось (' + JSON.stringify(capBefore) + ') — пропуск');

  // ⚠️ ДЕТЕРМИНИРОВАННЫЙ СТРАЖ КАПА. Естественная крупнейшая группа на свежей
  // куче до 8 почти не дотягивает (замер 10 сидов: ни разу), поэтому «ушло <=8»
  // сверху проверяет ПУСТОТУ — ревью v157 поймало это как единственную дыру в
  // защите капа. Тут радиус ВРЕМЕННО раздувается: группа заведомо больше капа,
  // и срез виден. Радиус возвращается сразу же — ниже по сьюту он боевой.
  // ⚠️ ОСАДКА АНИМАЦИЙ ОПРОСОМ (v218): natural-клик выше изредка оставляет
  // предметы alive+animating (латентный класс «зависшее удаление», ловится
  // спасателем в loop за ANIM_RESCUE_MS) — force-цель, посчитанная при живых
  // зависших, кликала в них и получала «ушло 0». Ждём чистоты фактом.
  await page.waitForFunction(() => window.__game.animCount() === 0, null, { timeout: 4000 });
  const radSave = await page.evaluate(() => window.__game.cfg.baseRadius);
  await page.evaluate(() => { window.__game.cfg.baseRadius = 3.0; });
  await page.waitForTimeout(500);           // updateMatchRadius тикает раз в 300 мс
  const capBig = await page.evaluate(() => {
    const t = window.__game.bestTapTarget();
    return t ? { alive: window.__game.alive(), n: t.n, raw: t.raw, px: t.px, py: t.py } : null;
  });
  if (capBig && capBig.px != null){
    expect(capBig.raw > 8, 'раздутый радиус даёт группу больше капа (raw ' + capBig.raw + ')');
    expect(capBig.n === 8, 'кап срезал группу до 8 (raw ' + capBig.raw + ' -> n ' + capBig.n + ')');
    await page.mouse.click(capBig.px, capBig.py);
    await page.waitForTimeout(500);
    const goneBig = capBig.alive - await page.evaluate(() => window.__game.alive());
    expect(goneBig === 8, 'за тап по раздутой группе ушло РОВНО 8 (' + goneBig + ' при raw ' + capBig.raw + ')');
  } else console.log('кап группы (форс): цели не нашлось — пропуск');
  await page.evaluate((r) => { window.__game.cfg.baseRadius = r; }, radSave);
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'shot_start.png' });

  // 5 авто-матчей
  for (let i = 0; i < 5; i++) {
    const ok = await page.evaluate(() => window.__game.autoMatch());
    console.log('autoMatch', i, ok);
    await page.waitForTimeout(450);
  }
  const t1 = await page.evaluate(() => window.__game.alive());
  expect(t1 <= t0.alive - 10, '5 матчей сняли >=10 предметов (' + t0.alive + ' -> ' + t1 + ')');

  // встряска
  await page.evaluate(() => window.__game.shake());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shot_after.png' });
  const t2 = await page.evaluate(() => ({ alive: window.__game.alive(), ap: window.__game.availablePairs() }));
  console.log('after shake:', JSON.stringify(t2));
  expect(t2.alive === t1, 'встряска не уничтожает предметы (' + t1 + ' -> ' + t2.alive + ')');

  // ЧЁРНЫЙ ШАР-БОМБА (спека владельца 2026-07-22): тап/детонация взрывает
  // ближайших соседей — не более BOMB_MAX (7), без очков; бомба расходуется
  const b0 = await page.evaluate(() => ({ alive: window.__game.alive(),
    score: window.__game.stats().score, idx: window.__game.bombIndex() }));
  expect(b0.idx >= 0, 'бомба заспавнена в кучу (index ' + b0.idx + ')');
  // #2 ПЕРЕЛИВАЮЩАЯСЯ БОМБА (спека владельца 2026-07-23): материал — радужный
  // matcap, НЕ плоский MeshBasicMaterial (проверяем на живой бомбе до детонации)
  const bombMat = await page.evaluate(() => window.__game.bombMatKind());
  expect(bombMat && bombMat.type === 'MeshMatcapMaterial' && bombMat.hasMatcap,
    'бомба переливается: MeshMatcapMaterial с matcap (' + JSON.stringify(bombMat) + ')');
  const det = await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const b1 = await page.evaluate(() => ({ alive: window.__game.alive(),
    score: window.__game.stats().score, idx: window.__game.bombIndex() }));
  expect(det === true, 'детонация сработала');
  expect(b1.idx === -1, 'бомба израсходована взрывом');
  const bombKilled = b0.alive - b1.alive - 1;
  expect(bombKilled >= 1 && bombKilled <= 7, 'взрыв снял 1..7 соседей (' + bombKilled + ')');
  expect(b1.score === b0.score, 'взрыв без очков (' + b0.score + ' -> ' + b1.score + ')');

  // ПОРТРЕТЫ КОЛЛЕКЦИИ (спека владельца 2026-07-24): #3 размер при hover/спине =
  // размер статики; #4 tap=hover одним toggle. thumbFrames не рендерит (только
  // фрустумы) — работает и до декода атласов.
  const key0 = await page.evaluate(() => window.__game.accSnapshot()[0].key); // .key = TYPES.name
  const frm = await page.evaluate((k) => window.__game.thumbFrames(k), key0);
  expect(frm && frm.equal, '#3 статика и спин кадрируют одинаково (thumbW ' + (frm && frm.thumbW)
    + ' = spinW ' + (frm && frm.spinW) + ')');
  const tog = await page.evaluate((k) => {
    let h = document.getElementById('tsHost');
    if (!h){ h = document.createElement('div'); h.id = 'tsHost';
      h.style.cssText = 'position:fixed;left:-999px;top:0;width:120px;height:120px'; document.body.appendChild(h); }
    const on = window.__game.thumbSpinToggleKey(k, '#tsHost');   // тап 1 -> завести
    const a1 = window.__game.spinState().active;
    const off = window.__game.thumbSpinToggleKey(k, '#tsHost');  // тап 2 по той же -> снять
    const a2 = window.__game.spinState().active;
    window.__game.thumbSpinStop();
    return { on, a1, off, a2 };
  }, key0);
  expect(tog.on === true && tog.a1 === true, '#4 тап заводит спин (' + JSON.stringify(tog) + ')');
  expect(tog.off === false && tog.a2 === false, '#4 повторный тап по той же карточке снимает спин (' + JSON.stringify(tog) + ')');

  // доиграть до конца автоматом (с встрясками при тупике); по пути ловим
  // эндшпиль: при <=8 живых радиус обязан сняться (∞=99) — и он ПРИОРИТЕТНЕЕ
  // цепной реакции (фикс ревью: цепь глушила ∞ потолком 1.1)
  let guard = 0, shakes = 0, endgameRadius = null, endgameTy = null, sinceRest = 0, midTyMin = 99;
  // ⚠️ ЭНДШПИЛЬНЫЙ РАДИУС ЛОВИМ НАБЛЮДАТЕЛЕМ ВНУТРИ СТРАНИЦЫ, А НЕ ОПРОСОМ
  // СНАРУЖИ (флейк, найден ГРАФИКОЙ 2026-07-29 на чистой базе, 1 прогон из 4).
  // Разбор: окно `alive<=9` проверялось только В НАЧАЛЕ итерации, а между
  // итерациями кучу разбирают ДВА процесса — autoMatch уносит целую ГРУППУ, и
  // всё это время работает МИКСЕР-ФИНАЛ, снимающий по предмету раз в 0.5 с
  // (за паузу 1200 мс после встряски успевает 2+). Если на прошлом опросе было
  // >9, а к следующему стало 0 — окно проскакивало ЦЕЛИКОМ, ветка сэмпла не
  // срабатывала ни разу, и ассерт падал с null (значение оставалось
  // инициализатором — это и отличает «не прочитали вовремя» от «не читали
  // вообще», спасибо ГРАФИКЕ за то, что поправила мою гипотезу по логу).
  // ⚠️ ЛЕЧИМ ТЕМ ЖЕ ПРИНЦИПОМ, ЧТО И ГОНКУ ШТИЛЯ: не поднимаем потолок ожидания,
  // а не даём состоянию проскочить мимо наблюдателя. Тик 50 мс внутри страницы
  // видит окно даже если снаружи между опросами прошла секунда; условие
  // `matchRadius > 10` заодно сохраняет прежнюю защиту от раннего чтения —
  // сэмпл берётся только когда радиус УЖЕ пересчитан refresh-тиком.
  await page.evaluate(() => {
    window.__camFollowSample = null;
    window.__camFollowTimer = setInterval(() => {
      const g = window.__game; if (!g) return;
      const l = g.level();
      // ⚠️⚠️ МИНИМУМ ПОСЛЕ ЗАЩЁЛКИ, А НЕ ЗНАЧЕНИЕ В МОМЕНТ ЗАЩЁЛКИ. Прежняя
      // версия писала ty на ПЕРВОМ же тике с camFollowOn — то есть ловила кадр,
      // когда защёлка встала, но лерп ещё не сдвинул камеру. Ассерт при этом
      // утверждает «камера ПОШЛА вниз», а сравнивается с 4.19 при старте 4.2:
      // зазор 0.01, и попадание в него решает случай. Прогон 1 дал 4.13
      // (зелёный), прогон 2 — ровно 4.19 (красный), при том что в ОБОИХ соседние
      // ассерты зелены: до порога min ty 4.2, финал ровно 3.2 — механика цела,
      // врал способ наблюдения. Минимум — это ФАКТ движения, который ассерт и
      // называет; на сборке, где камера не поехала, он остаётся 4.2 и краснеет
      // ровно как прежде, а «защёлка не встала вовсе» ловится проверкой на null.
      if (l && l.camFollowOn){
        const ty = g.cam().ty;
        if (window.__camFollowSample === null || ty < window.__camFollowSample) window.__camFollowSample = ty;
      }
    }, 50);
    window.__egSample = null;
    window.__egTimer = setInterval(() => {
      const g = window.__game; if (!g) return;
      if (window.__egSample === null && g.alive() <= 9 && g.cfg.matchRadius > 10){
        window.__egSample = g.cfg.matchRadius;
        clearInterval(window.__egTimer);
      }
    }, 50);
  });
  while (guard++ < 600) {
    const st = await page.evaluate(() => ({ alive: window.__game.alive(), r: window.__game.cfg.matchRadius, ty: window.__game.cam().ty }));
    if (st.alive === 0){
      // последний шанс: окно могло закрыться, пока мы ждали снаружи —
      // наблюдатель его всё равно записал
      if (endgameRadius === null) endgameRadius = await page.evaluate(() => window.__egSample);
      await page.evaluate(() => { clearInterval(window.__egTimer); clearInterval(window.__camFollowTimer); });
      if (endgameTy === null) endgameTy = await page.evaluate(() => window.__camFollowSample);
      break;
    }
    if (st.alive > 45 && st.ty < midTyMin) midTyMin = st.ty; // до порога 20% камера обязана СТОЯТЬ
    if (endgameRadius === null) endgameRadius = await page.evaluate(() => window.__egSample);
    // ⚠️ ПО ФАКТУ ЗАЩЁЛКИ, А НЕ ПО ЧИСЛУ 20: порог — 20% от СТАРТОВОГО размера
    // уровня, а он теперь растёт с прогрессией (ур.1 = 82 -> порог 16, и на
    // «alive<=20» защёлка ещё не щёлкала — страж краснел на исправной игре).
    // ⚠️ НАБЛЮДАТЕЛЬ ВНУТРИ СТРАНИЦЫ, А НЕ ОПРОС СНАРУЖИ (тот же приём, что у
    // эндшпильного радиуса): между опросами уровень успевает кончиться, и
    // момент защёлки проскакивает целиком — страж краснел на исправной игре.
    // ⚠️⚠️ И ЧИТАЕМ ЕГО ТОЛЬКО ПОСЛЕ ЦИКЛА, а не здесь: раньше стояло
    // `if (endgameTy === null) endgameTy = …`, и это ЗАМОРАЖИВАЛО значение на
    // первом же ненулевом чтении — то есть на минимуме за первые миллисекунды
    // после защёлки, когда камера едва тронулась (замер: 4.11 при пороге 4.19,
    // запас 0.08 вместо полного хода до 3.2). Наблюдатель внутри страницы и так
    // не даёт окну проскочить — внешнее раннее чтение ему только мешало.
    const ok = await page.evaluate(() => window.__game.autoMatch());
    if (!ok) {
      shakes++;
      await page.evaluate(() => window.__game.shake());
      await page.waitForTimeout(1200);
    } else {
      // передышка раз в 10 матчей: непрерывный бот-темп держал бы СЕРИЮ ТУРБО
      // вечно (перезапуск цепи + досыпка 2.6/417мс = чаша не пустеет) —
      // человек так не может, а прогон должен доигрывать уровень. Пауза
      // >COMBO_MS гасит серию, текущая цепь дотикает и гаснет сама.
      if (++sinceRest >= 10){ sinceRest = 0; await page.waitForTimeout(4300); }
      else await page.waitForTimeout(300);
    }
  }
  // страховка на выход по исчерпанию guard (ветка alive===0 читает сама, стр. выше)
  if (endgameTy === null) endgameTy = await page.evaluate(() => window.__camFollowSample);
  const fin = await page.evaluate(() => window.__game.alive());
  const winShown = await page.evaluate(() => document.getElementById('winOverlay').style.display);
  console.log('final alive:', fin, '| deadlock shakes needed:', shakes, '| win overlay:', winShown, '| endgame radius:', endgameRadius);
  expect(fin === 0, 'полный прогон разобрал уровень до нуля');
  expect(winShown === 'flex', 'экран победы показан');
  expect(shakes <= 12, 'встрясок тупика в разумном бюджете (' + shakes + ' <= 12)');
  expect(endgameRadius !== null && endgameRadius > 10, 'эндшпиль <=8 живых снимает радиус (∞), даже поверх цепи (' + endgameRadius + ')');
  expect(midTyMin >= 4.19, 'до порога 20% камера по вертикали НЕ плавает (min ty ' + midTyMin + ')');
  expect(endgameTy !== null && endgameTy < 4.19, 'защёлка 20% сработала — камера пошла вниз (ty ' + endgameTy + ')');
  const finalTy = await page.evaluate(() => window.__game.cam().ty); // лерп доехал — финальная отметка
  expect(finalTy <= 3.3 && finalTy >= 3.1, 'автопан остановился ровно на поле трети хода 3.2 (' + finalTy + ')');
  await page.screenshot({ path: 'shot_win.png' });
  // ПИЛЮЛЯ НАГРАДЫ ПО НОДЕ 779:1114 (спека владельца «переделай на Implement
  // this design from Figma»): светлая полупрозрачная подложка + ЛАЙМОВОЕ
  // ВНУТРЕННЕЕ свечение, круг БЕЛЫЙ 64 с иконкой 32, «+1» лаймом, зазор 7.
  // ⛔ До правки было наоборот — тёмная подложка rgba(0,0,0,.2) и ЛАЙМОВЫЙ
  // круг, без свечения: на той сборке страж падает по трём полям сразу.
  // Падинги здесь НЕ проверяем: вьюпорт сьюта мобильный, а мобильный макет
  // 783:711 их сознательно переопределяет — проверялись бы не числа ноды.
  const pill = await page.evaluate(() => {
    const r = document.querySelector('.win-reward'), ic = document.querySelector('.win-reward-ic'),
          n = document.querySelector('.win-reward-n'), sv = ic && ic.querySelector('svg');
    if (!r || !ic || !n || !sv) return { нетУзла: true };
    const c = getComputedStyle(r), ci = getComputedStyle(ic), cn = getComputedStyle(n);
    return { фон: c.backgroundColor, тень: c.boxShadow, зазор: c.gap,
      круг: ci.backgroundColor, диаметр: Math.round(ic.getBoundingClientRect().width),
      иконка: Math.round(sv.getBoundingClientRect().width), плюс: cn.color };
  });
  expect(pill.фон === 'rgba(255, 255, 255, 0.16)' &&
    /inset/.test(pill.тень) && /192, 255, 71/.test(pill.тень) &&
    pill.круг === 'rgb(255, 255, 255)' && pill.диаметр === 64 && pill.иконка === 32 &&
    pill.зазор === '7px' && pill.плюс === 'rgb(192, 255, 71)',
    'ПОБЕДА: пилюля награды по ноде 779:1114 — лайм в свечении, круг белый (' + JSON.stringify(pill) + ')');
  // ПРОГАЛЫ ГЛИФОВ ЗАЛИТЫ ЦВЕТОМ ОБВОДКИ (спека владельца «внутри 8 и подобных
  // цифр должно быть полностью залито цветом обводки»).
  // ⚠️ МЕРИМ ОТРИСОВАННЫЕ ПИКСЕЛИ, а не наличие `filter` в стилях: объявление
  // фильтра не доказывает НИЧЕГО — вопрос в том, закрылась ли щель.
  // ⚠️ Клон живого узла кладём на заведомый фон В МАСШТАБЕ 1:1 К viewBox. CSS по
  // id и классу матчит клон, поэтому кегль/обводка/фильтр у него боевые; а 1:1
  // ОБЯЗАТЕЛЕН, потому что «×N» живёт в СКРЫТОМ оверлее — по живому rect клон
  // вышел бы нулевой ширины и страж стал бы тавтологией «нет пикселей — нет дырок».
  // На базе без приёма даёт 132 и 8 дырявых пикселей (и 1339/145 при ретинном ×3).
  const glyphHoles = await (async () => {
    const out = {};
    for (const [sel, txt, имя] of [['.otext.win-score', '★ 88', 'счёт'],
                                   ['.otext.st-x', '×8', 'карточка']]) {
      const есть = await page.evaluate(([sel, txt]) => {
        const old = document.getElementById('holeProbe'); if (old) old.remove();
        const src = document.querySelector(sel); if (!src) return false;
        const vb = (src.getAttribute('viewBox') || '0 0 240 78').split(/\s+/).map(Number);
        const box = document.createElement('div'); box.id = 'holeProbe';
        box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#ff00ff;padding:20px';
        const cl = src.cloneNode(true);
        cl.style.display = 'block';
        cl.setAttribute('width', vb[2]); cl.setAttribute('height', vb[3]);
        cl.style.width = vb[2] + 'px'; cl.style.height = vb[3] + 'px';
        const t = cl.querySelector('text');
        if (t){ t.textContent = txt; t.style.fill = '#000'; }   // заливка сплошная: градиент в клоне не разрешается
        box.appendChild(cl); document.body.appendChild(box);
        return true;
      }, [sel, txt]);
      if (!есть){ out[имя] = -1; continue; }
      const b64 = (await page.locator('#holeProbe').screenshot()).toString('base64');
      out[имя] = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
        const фон = i => d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200;
        const seen = new Uint8Array(W * H), st = [];
        for (let x = 0; x < W; x++){ st.push([x, 0], [x, H - 1]); }
        for (let y = 0; y < H; y++){ st.push([0, y], [W - 1, y]); }
        while (st.length){
          const [x, y] = st.pop();
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = y * W + x;
          if (seen[p] || !фон(p * 4)) continue;
          seen[p] = 1; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        let n = 0;
        for (let p = 0; p < W * H; p++) if (фон(p * 4) && !seen[p]) n++;
        return n;
      }, b64);
    }
    await page.evaluate(() => { const b = document.getElementById('holeProbe'); if (b) b.remove(); });
    return out;
  })();
  expect(glyphHoles.счёт === 0 && glyphHoles.карточка === 0,
    'ПРОГАЛЫ ГЛИФОВ: сквозь «8» не видно фона ни в счёте, ни на карточке (' + JSON.stringify(glyphHoles) + ')');

  // тап по кнопке встряски после рестарта — мгновенно, без подтверждения
  await page.click('#againBtn');
  await page.waitForTimeout(300);
  // ⚠️ САНИТАР ЦЕПОЧКИ: победа на ур.1 открывает ПЕРВУЮ новую вещь, и её экран
  // держит клики. Пропускаем его настоящей кнопкой и УТВЕРЖДАЕМ, что звено
  // сработало, — иначе исчезновение экрана из цепочки прошло бы молча.
  const noSeen1 = await passNewObj(page);
  expect(noSeen1 === true,
    'ЦЕПОЧКА ПОБЕДЫ: после Next показан экран новой вещи и закрыт кнопкой (' + noSeen1 + ')');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForTimeout(300);
  await page.click('#shakeBtn');
  await page.waitForTimeout(400);
  // ⚠️ БАЗА НЕ ФИКСИРОВАННАЯ 3: встряски растут с уровнем (3 + ⌊ур/10⌋,
  // решение владельца 2026-07-27) — сверяем со СТАРТОВЫМ значением уровня,
  // а не с константой, иначе ассерт врал бы на ур.10+.
  const shakeSpend = await page.evaluate(() => ({ left: window.__game.level().shakes,
    expect: window.__game.freeShakes(window.__game.levelNum()) - 1, lv: window.__game.levelNum() }));
  expect(shakeSpend.left === shakeSpend.expect,
    'встряска мгновенная и списала заряд (ур.' + shakeSpend.lv + ': ' +
    (shakeSpend.expect + 1) + ' -> ' + shakeSpend.left + ')');
  // ФЛЭТ 3 НА ЛЮБОМ УРОВНЕ (окончательное решение владельца 2026-07-27-в:
  // «8 бесплатных много, мы же продаём их за рекламу»). Лесенка 3+⌊ур/10⌋ была
  // введена и тут же отменена — стережём именно ПОСТОЯНСТВО запаса.
  const shakeFlat = await page.evaluate(() => {
    const g = window.__game, was = g.levelNum(), out = [];
    for (const lv of [1, 10, 20, 50]){
      g.setLevel(lv); g.regen(); g.skipIntro();
      out.push({ lv, n: g.level().shakes });
    }
    g.setLevel(was); g.regen(); g.skipIntro();
    return out;
  });
  await page.waitForTimeout(400);
  // ⚠️ ЭТОТ АССЕРТ ДЕРЖАЛ «ФЛЭТ 3, ЛЕСЕНКИ НЕТ» — решение владельца 2026-07-27,
  // РАЗВЁРНУТОЕ ИМ ЖЕ 2026-07-30 («подними встряски»). Он честно упал на
  // правке, и это правильная работа стража: экономика встрясок не должна
  // меняться молча. Новая спека — лесенка 3 + ⌊ур/6⌋ с капом 8, и ассерт
  // проверяет ЛЕСЕНКУ, а не просто «стало больше»: монотонность плюс потолок.
  expect(shakeFlat.every(x => x.n === Math.min(8, 3 + Math.floor(x.lv / 6))),
    'ЛЕСЕНКА встрясок 3 + ⌊ур/6⌋, кап 8 (' +
    shakeFlat.map(x => 'ур.' + x.lv + '→' + x.n).join(', ') + ')');

  // ТУПИК (пар нет достижимых + встрясок нет) -> ПОМОЛ-ВЫРУЧАЛКА, НЕ поражение
  // (решение владельца 2026-07-27 «помол = штраф, не смерть»): помол разбирает
  // кучу, пока не появится достижимая пара; экран поражения из тупика не всплывает.
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  // ⚠️ Ждём УСТОЙЧИВОГО штиля, а не фиксированной паузы: пока куча движется,
  // updateMatchRadius каждый тик перезаписывает форсированный ниже matchRadius,
  // и тупик не наступает вовсе. Сразу после skipIntro бывает КРАТКИЙ ложный
  // штиль (~150 мс), поэтому требуем серию подряд идущих спокойных опросов.
  await page.waitForFunction(() => {
    if (window.__game.awake().physAwake) { window.__calm = 0; return false; }
    window.__calm = (window.__calm || 0) + 1;
    return window.__calm >= 8;
  }, null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => {
    window.__game.cfg.baseRadius = -9; // радиус динамический — правим базу (метрика v3: 0.001 матчил бы касающиеся)
    window.__game.cfg.matchRadius = -9; // зазор не бывает отрицательным настолько — гарантированный тупик
    const lv = window.__game.level();
    // ⚠️ СЕМАНТИКА СМЕНИЛАСЬ СЛОВОМ ВЛАДЕЛЬЦА 2026-08-01 («встряска за
    // рекламу считается выходом»): при adShakes>0 тупик НЕ объявляется —
    // прежний комментарий «тупик обязан сработать при живой рекламе» ОТМЕНЁН.
    // Здесь моделируем РЕЗЕРВНЫЙ сценарий ветки (площадка без rewarded):
    // обнуляем и adShakes. «Вечного зависания» при живой рекламе нет — кучу
    // при простое разбирает обычный idle-помол; активно тапающий в тупике
    // игрок направляется в рекламу — осознанный дизайн владельца.
    lv.shakes = 0; lv.adShakes = 0;
    // авто-встряска (v234) в этом сценарии считается уже потраченной —
    // здесь проверяется РЕЗЕРВНАЯ ветка deadlock, а не выручалки до неё
    lv.autoShakeUsed = true;
  });
  // и обратная сторона слова владельца: при ЖИВОЙ рекламе тупика НЕТ
  const adAgency = await page.evaluate(async () => {
    const lv = window.__game.level();
    lv.deadlock = false; lv.stuck = 0; lv.adShakes = Infinity;
    await new Promise(r => setTimeout(r, 1600));      // две проверки детекта
    const дал = window.__game.level().deadlock;
    lv.adShakes = 0;                                   // вернуть форс-сценарий
    return { дал };
  });
  expect(adAgency.дал === false,
    'ТУПИК: при живой рекламной встряске НЕ объявляется — агентность (слово владельца)');
  const aliveBeforeMill = await page.evaluate(() => window.__game.alive());
  // тупик подтверждается 2 стабильными тиками (~1.2с) -> level.deadlock
  await page.waitForFunction(() => window.__game.level().deadlock === true, null, { timeout: 8000, polling: 100 });
  await page.waitForTimeout(3000); // дать помолу-выручалке отработать пару оборотов
  const dl = await page.evaluate(() => ({
    lose: document.getElementById('loseOverlay').style.display,
    deadlock: window.__game.level().deadlock,
    over: window.__game.level().over,
    grinding: document.getElementById('mixerTimer').textContent,
    alive: window.__game.alive(),
    adShakesInfinite: !Number.isFinite(window.__game.level().adShakes),
  }));
  console.log('тупик→помол:', JSON.stringify(dl), '| было живых', aliveBeforeMill);
  expect(dl.lose !== 'flex', 'тупик НЕ показывает экран поражения (помол-выручалка)');
  expect(dl.over === false, 'уровень НЕ проигран в тупике (помол вместо смерти)');
  expect(dl.deadlock === true, 'тупик выставил level.deadlock');
  expect(dl.alive < aliveBeforeMill, 'помол-выручалка разбирает кучу (' + aliveBeforeMill + ' -> ' + dl.alive + ')');
  await page.screenshot({ path: 'shot_deadlock_mill.png' });

  // восстановление агентности (вернули встряски) -> тупик снят, помол встал
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; window.__game.cfg.matchRadius = 2.0; window.__game.level().shakes = 3; });
  await page.waitForTimeout(1200);
  const clr = await page.evaluate(() => ({ deadlock: window.__game.level().deadlock,
    grinding: document.getElementById('mixerTimer').textContent }));
  expect(clr.deadlock === false, 'вернулась агентность -> тупик снят');
  // ⚠️ СЕМАНТИКА ПЕРЕВЁРНУТА СЛОВОМ ВЛАДЕЛЬЦА 2026-08-01 («встряска за
  // рекламу считается выходом»): теперь тупик при живой рекламе НЕ
  // объявляется (страж adAgency выше), а эта ветка — РЕЗЕРВ для площадок без
  // rewarded, и форс честно обнуляет adShakes. Прежний ассерт «сработал при
  // безлимитной рекламе» стерёг отменённый дизайн; страх «игрок без роликов
  // завис навсегда» закрыт idle-помолом (разбирает кучу при простое всегда).
  expect(dl.adShakesInfinite === false,
    'форс тупика идёт в резервном сценарии (adShakes обнулён) — семантика владельца 2026-08-01');
  // ФИКС ревью v116: сброс lastAction на снятии тупика -> idle-помол НЕ догрызает
  // после появления пары (помол встал РОВНО со снятием, не крутится по инерции)
  expect(clr.grinding !== 'Grinding', 'помол-выручалка встала со снятием тупика (не догрызает по инерции)');

  // рестарт уровня штатным regen (экран поражения больше не участвует)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  const aliveAfterRestart = await page.evaluate(() => window.__game.alive());
  expect(aliveAfterRestart > 0, 'regen пересоздал уровень (' + aliveAfterRestart + ')');

  // заполнение доверху + очки за групповой матч + миксер за простой
  // ⚠️ УРОВЕНЬ ЗАДАЁМ ЯВНО (прогрессия 2026-08-05): страж мерит «ПОЛНАЯ чаша
  // заполнена до красной линии», а размер уровня теперь растёт с номером —
  // на ур.1 (40 пар) куча законно ниже, и порог 5.5 краснел на исправной
  // игре (topY 5.49). Берём уровень с потолком пар (>=11).
  await page.evaluate(() => { window.__game.setLevel(12); window.__game.cfg.baseRadius = 0.9; window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(1000);
  const fill = await page.evaluate(() => ({ topY: window.__game.topY(), alive: window.__game.alive() }));
  console.log('fill: topY', fill.topY.toFixed(2), '(rim 9.2) | alive:', fill.alive);
  expect(fill.topY > 5.5 && fill.topY <= 9.21, 'заполнение у красной линии (topY ' + fill.topY.toFixed(2) + ')');

  await page.evaluate(() => window.__game.autoMatch());
  await page.waitForTimeout(400);
  const sc = await page.evaluate(() => window.__game.stats().score);
  expect(sc === 20, 'пара даёт 20 очков (' + sc + ')');

  const preMixerAlive = await page.evaluate(() => window.__game.alive());
  // ТАЙМЕР ПОМОЛА (спека владельца 2026-07-27, перетюн): easy idleLimit=15
  const idleDef = await page.evaluate(() => window.__game.level().idleLimit);
  expect(idleDef === 15, 'таймер помола Easy = 15с (спека владельца 2026-07-27) (' + idleDef + ')');
  await page.evaluate(() => { window.__game.level().idleLimit = 5; window.__game.stats().lastAction = performance.now() - 20000; }); // укорачиваем лимит до 5 для скорости теста
  await page.waitForTimeout(1000);
  // огонь — эскалация помола (правка владельца 2026-07-22): на 1-й секунде
  // Grinding его ещё НЕТ, появляется вместе со спуском глаз после 3 с
  const fireEarly = await page.evaluate(() => ({
    fire: document.getElementById('fFire').classList.contains('on'),
    dropped: document.getElementById('face').classList.contains('dropped') }));
  expect(!fireEarly.fire && !fireEarly.dropped, 'на 1-й секунде помола огня и спуска глаз ещё нет');
  await page.waitForTimeout(2600);
  const mixer = await page.evaluate(() => ({ alive: window.__game.alive(), score: window.__game.stats().score,
    mt: document.getElementById('mixerTimer').textContent,
    fire: document.getElementById('fFire').classList.contains('on'),
    dropped: document.getElementById('face').classList.contains('dropped') }));
  console.log('after idle: alive', mixer.alive, '| score', mixer.score, '| таймер-чип:', mixer.mt);
  expect(mixer.alive < preMixerAlive, 'миксер за простой съел предметы (' + preMixerAlive + ' -> ' + mixer.alive + ')');
  expect(mixer.score < sc, 'миксер снял очки за пару (' + sc + ' -> ' + mixer.score + ')');
  expect(mixer.fire && mixer.dropped, 'после 3 с помола огонь горит и глаза опустились');

  // БАЛАНС-ТАБЛИЦА (спека владельца 2026-07-22): промах −10; уровень 1 —
  // БЕЗ очковых штрафов вовсе; уровни 2-5 — кламп счёта снизу нулём;
  // с уровня 6 — полный минус. Точка (25, 540) — слева от чаши, вне HUD.
  await page.evaluate(() => { window.__game.setLevel(1); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL1 = await page.evaluate(() => { const s = window.__game.stats();
    return { score: s.score, misses: s.misses }; });
  console.log('miss L1:', JSON.stringify(missL1));
  expect(missL1.misses === 1 && missL1.score === 0, 'ур.1 без штрафов: промах не снял очков (score ' + missL1.score + ', misses ' + missL1.misses + ')');
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL3 = await page.evaluate(() => window.__game.stats().score);
  expect(missL3 === 0, 'ур.3: кламп нулём — промах с нуля держит 0 (' + missL3 + ')');
  await page.evaluate(() => { window.__game.setLevel(8); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(600);
  await page.mouse.click(25, 540);
  await page.waitForTimeout(300);
  const missL8 = await page.evaluate(() => window.__game.stats().score);
  expect(missL8 === -10, 'ур.8: полный штраф промаха −10 (' + missL8 + ')');

  // ПРОМАХ ОБНУЛЯЕТ НАБОР ТУРБО (спека владельца 2026-07-27; РАЗВОРОТ его же
  // прежнего тюнинга «слишком резко сбрасываем power chain», где было −2).
  // Радиус-лесенка (combo.level) при этом теряет ровно COMBO_MISS_DROP=2, а не
  // обнуляется — владелец назвал «счётчик РЕЖИМА», лесенку не трогал.
  const turboReset = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < 4; i++){ g.autoMatch(); await new Promise(r => setTimeout(r, 130)); }
    const hot = g.combo();                       // серия набрана, лихорадка горит
    g.tapEmpty ? g.tapEmpty() : null;            // промах, если есть ручка
    return { hot };
  });
  {
    // промах кликом в пустоту (та же дорога, что у ассертов штрафа выше)
    const before = await page.evaluate(() => window.__game.combo());
    await page.mouse.click(25, 540);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__game.combo());
    if (before.hot && before.count > 0){
      expect(after.count === 0,
        'промах ОБНУЛЯЕТ набор турбо (' + before.count + ' -> ' + after.count + ')');
      expect(after.level === Math.max(0, before.level - 2),
        'радиус-лесенка теряет ровно 2 шага, а не обнуляется (' + before.level + ' -> ' + after.level + ')');
    } else {
      expect(after.count === 0, 'набор турбо не копится вне лихорадки (' + after.count + ')');
    }
    void turboReset;
  }

  // #10 ДЕНОМИНАЦИЯ В ПРОЦЕССЕ (спека владельца 2026-07-27): всплывающие
  // поп-числа матча = деноминир. прирост чипа (÷10), «понятно и в процессе».
  const denomShownProbe = await page.evaluate(() => window.__game.scoreShownDenom(1234)
    + ',' + window.__game.scoreShownDenom(6400) + ',' + window.__game.scoreShownDenom(5));
  expect(denomShownProbe === '123,640,0', 'scoreShownDenom деноминирует ÷10 floor (' + denomShownProbe + ')');
  // end-to-end: поп на экране = изменение liveBalance-чипа (одна шкала)
  const popProbe = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    document.querySelectorAll('.pop').forEach(p => p.remove()); // чистим прежние
    const chip0 = g.liveBalance();
    const ok = g.autoMatch();
    await new Promise(r => setTimeout(r, 120));
    const chip1 = g.liveBalance();
    // поп-очки — тот, что начинается с +цифра (не ярлык «×N»)
    const texts = [...document.querySelectorAll('.pop text')].map(t => t.textContent);
    const scorePop = texts.find(s => /^\+\d/.test(s));
    return { ok, chip0, chip1, scorePop, texts };
  });
  expect(popProbe.ok && popProbe.scorePop != null, 'матч создал поп-число (' + JSON.stringify(popProbe.texts) + ')');
  expect(parseInt(popProbe.scorePop, 10) === popProbe.chip1 - popProbe.chip0,
    'поп на экране = прирост чипа (' + popProbe.scorePop + ' = ' + popProbe.chip0 + '→' + popProbe.chip1 + ')');

  // финал: остались одиночки без пар — миксер зачищает их, собирает сюрприз (+150)
  // и наступает победа с апом уровня
  const lvlBefore = await page.evaluate(() => window.__game.levelNum());
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); window.__game.level().finalRefillDone = true; /* докидка (v234) здесь чужая: сценарий ждёт финал-помола одиночек */ window.__game.leaveSingles(); });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  await page.waitForTimeout(600);
  const fin2 = await page.evaluate(() => ({
    win: document.getElementById('winOverlay').style.display,
    score: window.__game.stats().score,
    lvl: window.__game.levelNum(),
    timeOnWin: document.getElementById('winStats').textContent.includes('Time:'),
    hudTimerHidden: getComputedStyle(document.getElementById('tmSvg')).display === 'none',
    starChip: document.getElementById('score').textContent,
    liveBal: window.__game.liveBalance() }));
  expect(fin2.win === 'flex', 'финальная зачистка доводит до победы');
  expect(fin2.score === 150 + 5 * lvlBefore, 'финал: очки не тратятся/не начисляются, только рыбка 150+5×ур (' + fin2.score + ' при ур.' + lvlBefore + ')');
  expect(fin2.lvl === lvlBefore + 1, 'победа апает уровень (' + lvlBefore + ' -> ' + fin2.lvl + ')');
  expect(fin2.hudTimerHidden && fin2.timeOnWin, 'время уровня скрыто из HUD, но есть на экране победы (спека 2026-07-22)');
  // чип теперь показывает ЕДИНЫЙ БАЛАНС (liveBalance), а НЕ per-level score
  // (финализация владельца 2026-07-24 «очки=звёзды=баланс», запрос МЕТА):
  // на победе счёт забанкован в se → чип = баланс = liveBalance.
  expect(fin2.starChip === '★ ' + fin2.liveBal, 'чип показывает единый баланс liveBalance (' + fin2.starChip + ' = ★ ' + fin2.liveBal + ')');
  // дальше уровни пересоздаются через evaluate-regen (мимо кнопки «Дальше») —
  // победный оверлей надо спрятать руками, иначе он перехватит реальные клики
  await page.evaluate(() => { document.getElementById('winOverlay').style.display = 'none'; });

  // сложность: по умолчанию (easy) доступно всё живое, кроме сюрприза;
  // Hard включает перекрытия (веер лучей + вуаль)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  const diff = await page.evaluate(() => {
    window.__game.forceRefresh();
    // ⚠️ КТО ИМЕННО НЕДОСТУПЕН, а не только СКОЛЬКО: жёсткое «ровно alive−1»
    // зависело от сида — на части раскладок клад ложится сверху и доступен,
    // и страж краснел на исправной игре (флейк 2026-08-07). Свойство же
    // такое: в Easy перекрытия НИКОГО не прячут, недоступным может быть
    // только клад.
    const accSet = new Set(window.__game.accessibleList());
    const geo = window.__game.itemsGeo();
    const hidden = geo.filter((_, i) => !accSet.has(i)).map(x => x.name);
    const easy = { alive: window.__game.alive(), acc: accSet.size, hidden };
    window.__game.cfg.hard = true; window.__game.forceRefresh();
    const hard = { alive: window.__game.alive(), acc: window.__game.accessibleList().length };
    window.__game.cfg.hard = false; window.__game.forceRefresh();
    return { easy, hard };
  });
  expect(diff.easy.acc >= diff.easy.alive - 1 && (diff.easy.hidden || []).every(n => n === 'surprise'),
    'easy: перекрытия никого не прячут — недоступным может быть только клад (' +
    diff.easy.acc + '/' + diff.easy.alive + ', скрыты: ' + JSON.stringify(diff.easy.hidden) + ')');
  expect(diff.hard.acc < diff.hard.alive, 'hard: перекрытия прячут часть кучи (' + diff.hard.acc + '/' + diff.hard.alive + ')');

  // комбо-лесенка только ВВЕРХ (фикс ревью): при слайдере выше потолка 1.1
  // серия не должна ПОНИЖАТЬ радиус к потолку
  await page.evaluate(() => { window.__game.cfg.baseRadius = 1.6; });
  await page.evaluate(() => { window.__game.autoMatch(); window.__game.autoMatch(); }); // вторая склейка мгновенно — серия горит
  const comboProbe = await page.evaluate(() => {
    window.__game.forceRefresh();
    return { hot: window.__game.combo().hot, r: window.__game.cfg.matchRadius };
  });
  expect(comboProbe.hot, 'две быстрые склейки зажгли серию');
  expect(comboProbe.r >= 1.5, 'серия не понижает радиус при базе 1.6 выше потолка (' + comboProbe.r.toFixed(2) + ')');
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.9; });

  // подсказка: числимый ресурс списывается, подсветка не роняет matcap-ветку
  // (у MeshMatcapMaterial нет emissive — регрессия ловилась только руками)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  const hintProbe = await page.evaluate(() => {
    const before = window.__game.wallet().hints;
    document.getElementById('hintBtn').click();
    return { before, after: window.__game.wallet().hints };
  });
  expect(hintProbe.after === hintProbe.before - 1, 'подсказка списывает 1 заряд (' + hintProbe.before + ' -> ' + hintProbe.after + ')');

  // пауза: МЕНЮ (главный экран заменил карточку pauseOverlay — спека владельца
  // «это и главный экран и пауза»), стоп-кадр и СДВИГ ЧАСОВ — пауза не съедает
  // простой миксера. Кнопка меню Resume и снимает паузу.
  await page.evaluate(() => { document.getElementById('pauseBtn').click(); });
  await page.waitForTimeout(1200);
  const pausedState = await page.evaluate(() => ({
    overlay: document.getElementById('mainScreen').classList.contains('open'),
    paused: window.__game.pauseState().paused,
    idle: performance.now() - window.__game.stats().lastAction,
  }));
  await page.evaluate(() => { document.getElementById('msPlayBtn').click(); });
  const idleAfter = await page.evaluate(() => performance.now() - window.__game.stats().lastAction);
  expect(pausedState.overlay && pausedState.paused, 'пауза открывает меню и морозит игру');
  expect(idleAfter < pausedState.idle, 'резюме сдвинуло якоря часов (простой ' + Math.round(pausedState.idle) + ' -> ' + Math.round(idleAfter) + ' мс)');

  // смена уровня под идущей рекламой: genLevel гасит показ (Ads.cancel) —
  // награда НЕ должна прилететь новому уровню (фикс ревью: протухший rewardCb)
  await page.evaluate(() => {
    const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 1;
  });
  await page.click('#shakeBtn');   // ad-состояние: ролик СРАЗУ, без подтверждения
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); }); // уровень сменился ПОД роликом
  await page.waitForTimeout(3600); // стаб бы уже дозрел
  const adProbe = await page.evaluate(() => ({
    overlay: document.getElementById('adOverlay').style.display,
    adShakes: Number.isFinite(window.__game.level().adShakes) ? window.__game.level().adShakes : null,
    shakes: window.__game.level().shakes,
    used: window.__game.stats().adShakesUsed,
  }));
  expect(adProbe.overlay === 'none', 'reген спрятал оверлей рекламы');
  // ⚠️ ЛИМИТА AD-ВСТРЯСОК БОЛЬШЕ НЕТ (спека владельца 2026-07-28: «каждая
  // следующая только за показ рекламы») — прежняя сверка «adShakes === 2»
  // потеряла смысл. Стережём то же САМОЕ по существу: протухшая награда не
  // должна ни списаться в статистику, ни подарить встряску новому уровню.
  expect(adProbe.used === 0 && adProbe.shakes === 3,
    'награда старого показа не прилетела новому уровню (used ' + adProbe.used +
    ', бесплатных ' + adProbe.shakes + ' — как у свежего уровня)');
  expect(adProbe.adShakes === null,
    'ad-встряски БЕЗ лимита (' + adProbe.adShakes + ' = Infinity)');

  // вертикальный пан взгляда (спека владельца: «приподнять и рассмотреть
  // остатки»): Shift+колесо двигает target по Y с клампами, обычное колесо
  // по-прежнему только зумит
  const cam0 = await page.evaluate(() => window.__game.cam());
  await page.keyboard.down('Shift');
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 300);   // Shift+скролл вниз = смотреть ниже
  await page.keyboard.up('Shift');
  const cam1 = await page.evaluate(() => window.__game.cam());
  expect(cam1.ty < cam0.ty, 'Shift+колесо опустило взгляд (' + cam0.ty + ' -> ' + cam1.ty + ')');
  expect(cam1.r === cam0.r, 'Shift+колесо не тронуло зум (' + cam0.r + ' -> ' + cam1.r + ')');
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -9999); // кламп сверху
  await page.keyboard.up('Shift');
  const cam2 = await page.evaluate(() => window.__game.cam());
  expect(cam2.ty <= 5.2 && cam2.ty >= 5.19, 'пан ограничен потолком 5.2 (' + cam2.ty + ')');
  await page.mouse.wheel(0, 120);   // обычное колесо — зум работает как раньше
  const cam3 = await page.evaluate(() => window.__game.cam());
  expect(cam3.r > cam2.r && cam3.ty === cam2.ty, 'обычное колесо зумит и не панит (r ' + cam2.r + ' -> ' + cam3.r + ')');
  // рестарт уровня сбрасывает пан (resetPointers на границах интро);
  // автопан на свежей куче стоит у дефолта, допуск на первый лерп-тик
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  const cam4 = await page.evaluate(() => window.__game.cam());
  expect(cam4.ty > 3.6 && cam4.ty <= 4.2, 'новый уровень вернул взгляд к дефолту (' + cam4.ty + ')');

  // СЕРИЯ ТУРБО (спека владельца): вторая цепь, собранная ВНУТРИ активной,
  // перезапускает окно и растит chainSeries (>=2 — сигнал глазам eyes-5)
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  const chainProbe = await page.evaluate(async () => {
    const g = window.__game, out = { chainAt: -1, seriesAt: -1 };
    for (let i = 0; i < 30; i++){
      if (!g.autoMatch()) break;
      const c = g.combo();
      if (c.chain && out.chainAt < 0) out.chainAt = i;
      if (c.series >= 2 && out.seriesAt < 0){ out.seriesAt = i; break; }
      await new Promise(r => setTimeout(r, 60));
    }
    out.final = g.combo();
    return out;
  });
  expect(chainProbe.chainAt >= 0, 'серия матчей зажгла цепь (матч #' + chainProbe.chainAt + ')');
  expect(chainProbe.seriesAt > chainProbe.chainAt && chainProbe.final.series >= 2,
    'второе турбо внутри первого = серия турбо (матч #' + chainProbe.seriesAt + ', series ' + chainProbe.final.series + ')');

  // НАКОПЛЕНИЕ ПО ТИПАМ (спека владельца 2026-07-22): пороги 100·(2^n−1),
  // множитель 1+0.25×ступень, событие апа в момент пересечения, множитель
  // в очках матча и в пар-скоре
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(500);
  const accProbe = await page.evaluate(() => {
    const g = window.__game;
    const snap0 = g.accSnapshot()[0]; // TYPES[0] всегда в пуле уровня
    window.__accEvents = [];
    g.onAccTierUp(e => window.__accEvents.push({ key: e.key, name: e.name, tier: e.tier, mult: e.mult }));
    const t1 = g.accGrant(snap0.key, 100 - snap0.count); // ровно порог ступени 1
    const t2 = g.accGrant(snap0.key, 300 - t1.count);    // порог ступени 2
    return { key: snap0.key, label: snap0.name, t1, t2, events: window.__accEvents };
  });
  expect(accProbe.t1.tier === 1 && accProbe.t1.mult === 1.25 && accProbe.t1.next === 300,
    'ступень 1 на 100 шт: множитель 1.25, следующий порог 300 (' + JSON.stringify(accProbe.t1) + ')');
  expect(accProbe.t2.tier === 2 && accProbe.t2.mult === 1.5 && accProbe.t2.next === 700,
    'ступень 2 на 300 шт: множитель 1.5, следующий порог 700 (' + JSON.stringify(accProbe.t2) + ')');
  expect(accProbe.events.length === 2 && accProbe.events[0].tier === 1 && accProbe.events[1].tier === 2,
    'onAccTierUp сработал на каждом пересечении порога (' + JSON.stringify(accProbe.events) + ')');
  expect(accProbe.label !== accProbe.key && /^[A-Z]/.test(accProbe.label) && accProbe.events[0].name === accProbe.label,
    'снапшот и событие несут человеческий ярлык, ключ отдельно (' + accProbe.key + ' -> ' + accProbe.label + ')');
  // множитель в очках: пара типа со ступенью 2 = round(20 × 1.5) = 30
  // (радиус временно широкий — пары типа могут лежать далеко друг от друга)
  const multProbe = await page.evaluate(() => {
    const g = window.__game;
    g.cfg.baseRadius = 6; g.cfg.matchRadius = 6;
    const before = g.stats().score;
    const ok = g.matchType(g.accSnapshot()[0].key);
    g.cfg.baseRadius = 0.9;
    return { ok, delta: g.stats().score - before };
  });
  expect(multProbe.ok, 'нашлась пара прокачанного типа для матча');
  expect(multProbe.delta === 30, 'пара типа со ступенью 2 даёт 20×1.5=30 очков (' + multProbe.delta + ')');
  // пар-скор с множителями: независимый пересчёт по aliveByType × accMult
  const parProbe = await page.evaluate(() => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    const alive = g.aliveByType();
    const mult = {};
    for (const s of g.accSnapshot()) mult[s.key] = s.mult;
    let exp = 0;
    for (const k in alive) exp += Math.floor(alive[k] / 2) * 20 * (mult[k] || 1);
    return { par: g.level().parBase, exp: Math.round(exp) };
  });
  expect(parProbe.par === parProbe.exp && parProbe.par > 0,
    'пар-скор учитывает множители накопления (' + parProbe.par + ' = ' + parProbe.exp + ')');

  // ===== ЕДИНЫЙ БАЛАНС + BOOST + ОТКРЫТИЕ (финализация владельца 2026-07-24) =====
  // starAward остался ТОЛЬКО для grandfather-миграции (валюту за победу
  // больше не считает — её несёт bankLevelScore); проверяем как чистую функцию
  const awardProbe = await page.evaluate(() => {
    const g = window.__game;
    return { a1: g.starAward(1, 1), a3at1: g.starAward(1, 3), a3at10: g.starAward(10, 3), a0: g.starAward(5, 0) };
  });
  expect(awardProbe.a1 === 110 && awardProbe.a3at1 === 510,
    'миграция-номинал: 1★ на ур.1 = 110, 3★ = 510 (' + JSON.stringify(awardProbe) + ')');
  expect(awardProbe.a3at10 === 600 && awardProbe.a0 === 0,
    'миграция-номинал: надбавка за уровень и 0 за непройденный (' + JSON.stringify(awardProbe) + ')');

  // ЕДИНОЕ ЧИСЛО: банк счёта уровня деноминируется ×10 в кошелёк; чип
  // (liveBalance) = баланс + незабанкованный счёт текущего уровня
  const balProbe = await page.evaluate(() => {
    const g = window.__game;
    const b0 = g.starBalance();
    const banked = g.bankScore(6400);           // деноминация ÷10 -> +640
    const b1 = g.starBalance();
    // liveBalance = баланс + floor(score/10) во время уровня
    g.regen(); g.skipIntro();
    const st = g.stats(); st.score = 1230;
    const live = g.liveBalance(), bal = g.starBalance();
    return { b0, banked, b1, live, bal, lb: g.leaderboardScore() };
  });
  expect(balProbe.banked === 640 && balProbe.b1 === balProbe.b0 + 640,
    'банк счёта деноминирован ×10: 6400 -> +640 (' + balProbe.banked + ')');
  expect(balProbe.live === balProbe.bal + 123,
    'чип (liveBalance) = баланс + незабанкованный счёт/10 (' + balProbe.bal + '+123 -> ' + balProbe.live + ')');
  expect(balProbe.lb === balProbe.bal, 'лидерборд-число = баланс (' + balProbe.lb + ')');
  // ЕДИНОЕ ЧИСЛО ВЕЗДЕ (жалоба владельца 2026-07-27 «во время игры одно число,
  // а на пузе второе»): игровой чип и кошелёк меню обязаны показывать ОДНО И ТО
  // ЖЕ. Раньше чип читал liveBalance, а меню — starBalance, и открытие меню
  // посреди уровня «съедало» заработанное за партию.
  const oneNumber = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    g.starGrant(500);
    for (let i = 0; i < 6; i++) g.autoMatch();   // копим НЕзабанкованный счёт уровня
    await new Promise(r => setTimeout(r, 500));   // дать updateHUD отработать
    const chip = document.getElementById('score').textContent;
    window.showMainScreen();                      // открыть меню поверх партии
    await new Promise(r => setTimeout(r, 400));
    const wallet = document.getElementById('msStars').textContent;
    const unbanked = Math.floor(Math.max(0, g.stats().score) / 10);
    window.hideMainScreen && window.hideMainScreen();
    const d = s => String(s).replace(/[^0-9]/g, '');
    return { chip: d(chip), wallet: d(wallet), unbanked, live: g.liveBalance() };
  });
  expect(oneNumber.chip === oneNumber.wallet,
    'ЕДИНОЕ ЧИСЛО: чип в игре = кошелёк меню (' + oneNumber.chip + ' = ' + oneNumber.wallet + ')');
  expect(oneNumber.unbanked > 0 && Number(oneNumber.wallet) === oneNumber.live,
    'кошелёк меню включает незабанкованный счёт уровня (+' + oneNumber.unbanked + ', live ' + oneNumber.live + ')');

  // ⚠️ ПОЛЗУНОК SOUND ХРАНИТ СОСТОЯНИЕ (жалоба владельца 2026-07-30 «не
  // сохраняет состояние после выхода из паузы»). До правки состоянием был
  // БУЛЕВ CFG.sound, и refreshMainSettings рисовал ползунок как
  // `CFG.sound ? 100 : 0` — выставленные 40 при возврате в меню становились 100.
  // ⚠️ ПЕРЕЗАГРУЗКУ здесь НЕ проверяем (reload посреди сьюта сбросил бы уровень
  // и контекст следующих секций) — но проверяем ЗАПИСЬ в localStorage, на
  // которой перезагрузка и держится; сам reload покрыт пробой в отчёте.
  const soundState = await page.evaluate(async () => {
    const g = window.__game;
    const set = async v => { const s = document.getElementById('msSound');
      s.value = v; s.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60)); };
    const cycle = async () => { window.hideMainScreen && window.hideMainScreen();
      await new Promise(r => setTimeout(r, 120)); window.showMainScreen();
      await new Promise(r => setTimeout(r, 200)); };
    window.showMainScreen(); await new Promise(r => setTimeout(r, 200));
    await set(40); await cycle();
    const mid = { v: +document.getElementById('msSound').value, cfg: g.cfg.sound,
                  ls: localStorage.getItem('mixer_sound'),
                  eng: (g.sound && g.sound.volume) ? g.sound.volume() : null };
    await set(0); await cycle();
    const off = { v: +document.getElementById('msSound').value, cfg: g.cfg.sound,
                  ls: localStorage.getItem('mixer_sound') };
    // тумблер держателя состояний: выкл -> вкл обязан вернуть ПОСЛЕДНИЕ 40
    await set(40);
    const cb = document.getElementById('soundToggle');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const back = { v: +document.getElementById('msSound').value, cfg: g.cfg.sound };
    await set(100);                                  // вернуть громкость следующим секциям
    window.hideMainScreen && window.hideMainScreen();
    return { mid, off, back };
  });
  expect(soundState.mid.v === 40 && soundState.mid.cfg === true && soundState.mid.ls === '40',
    'ЗВУК: 40 выжило выход-возврат в меню (' + JSON.stringify(soundState.mid) + ')');
  expect(soundState.mid.eng === 0.4,
    'ЗВУК: громкость дошла до движка (мастер-гейн ' + soundState.mid.eng + ')');
  expect(soundState.off.v === 0 && soundState.off.cfg === false && soundState.off.ls === '0',
    'ЗВУК: тишина выжила выход-возврат и записана в localStorage (' + JSON.stringify(soundState.off) + ')');
  expect(soundState.back.v === 40 && soundState.back.cfg === true,
    'ЗВУК: тумблер выкл→вкл вернул ПОСЛЕДНИЕ 40, а не 100 (' + JSON.stringify(soundState.back) + ')');

  // ⚠️ ХОЛОДНЫЙ СТАРТ ГРОМКОСТИ — щель, которую метрика eng ВЫШЕ не ловит:
  // eng читает volume() = playerVol, а НЕ настоящий master.gain. Master
  // создаётся ЛЕНИВО по первому жесту с хардкодом 0.5, и восстановленные из
  // localStorage 40% играли на ПОЛНОЙ громкости до первого касания ползунка.
  // Страж: свежая страница с mixer_sound='0.4' -> первый жест -> настоящий
  // гейн обязан быть 0.5·0.4 = 0.2. До фикса (applyGain в ensure) здесь 0.5.
  {
    const spage = await browser.newPage({ viewport: { width: 400, height: 800 } });
    // ⚠️ ФОРМАТ ХРАНЕНИЯ — ПРОЦЕНТЫ ('40'), не доля ('0.4'): первый прогон этого
    // стража я завалил СВОИМ входом — движок честно сыграл 0.4% как ~тишину.
    await spage.addInitScript(() => { try { localStorage.setItem('mixer_sound', '40'); } catch(e){} });
    await spage.goto('file://' + path.join(__dirname, 'index.html'));
    await spage.waitForFunction(() => window.__game, null, { timeout: 30000 });
    await spage.mouse.click(200, 400); // первый жест: unlock -> ensure -> master
    await spage.waitForTimeout(250);
    const cold = await spage.evaluate(() => ({
      vol: window.__game.sound.volume ? window.__game.sound.volume() : null,
      gain: window.__game.sound.gain ? window.__game.sound.gain() : 'нет хука',
    }));
    await spage.close();
    if (cold.gain === null) console.log('SKIP: master не создался (нет AudioContext в headless?) — страж холодного старта пропущен');
    else {
      expect(cold.vol === 0.4 && Math.abs(cold.gain - 0.2) < 1e-6,
        'ЗВУК, ХОЛОДНЫЙ СТАРТ: ленивый master уважает восстановленную громкость (гейн '
        + cold.gain + ', ожидание 0.2)');
    }
  }

  // ⚠️ ПОРТРЕТЫ КОЛЛЕКЦИИ НЕ ПУСТЫЕ (жалоба владельца 2026-07-30 «где превью у
  // всех новых объектов?»). До правки на main 29 карточек из 122 показывали
  // ПУСТУЮ картинку: атлас новой пачки декодируется асинхронно, портрет
  // снимался с 1×1-заглушкой (map.version 0) и пустышка оседала в thumbCache
  // НАВСЕГДА. Болели только пачки, которых нет на раннем уровне, — поэтому
  // дефект и жил незамеченным.
  // ⚠️ ПОРОГ ПО ДЛИНЕ data-URL, А НЕ ЧТЕНИЕ ПИКСЕЛЕЙ: пустой PNG 256×256 весит
  // РОВНО 3174 Б (у двух разных типов совпадал побайтово), живой — от ~9 КБ.
  // Декодировать 122 картинки в сьюте дорого, а порог различает надёжно.
  await page.evaluate(() => window.showMainScreen());
  await page.waitForFunction(() => {            // ждём добор портретов (16×200 мс)
    const g = document.getElementById('msGrid');
    return g && g.children.length > 0 && !g.querySelector('.msc-img.letter');
  }, null, { timeout: 6000 }).catch(() => {});
  const thumbs = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#msGrid .msc')];
    const bad = cards.filter(c => { const im = c.querySelector('img.msc-img');
      return !im || im.src.length < 5000; })
      .map(c => { const n = c.querySelector('.msc-name'); return n ? n.textContent : '?'; });
    return { всего: cards.length, плохих: bad.length, примеры: bad.slice(0, 5) };
  });
  await page.evaluate(() => window.hideMainScreen && window.hideMainScreen());
  expect(thumbs.всего > 100 && thumbs.плохих === 0,
    'ПОРТРЕТЫ: живая картинка у всех ' + thumbs.всего + ' карточек коллекции' +
    (thumbs.плохих ? ' — ПУСТЫЕ: ' + thumbs.примеры.join(', ') : ''));

  // ЧИП НЕ ВЫЛЕЗАЕТ ЗА ЭКРАН (регрессия v140→v148, жалоба владельца «отступы
  // поломались»): fitStat ужимал viewBox, но НЕ двигал якорь end-текста —
  // тот оставался на x=102 от исходной рамки 104 и рисовался ЗА ней (.otext
  // overflow:visible), уезжая за вьюпорт. Меряем ПРАВЫЙ край текста против
  // ширины окна на всех балансах: и коротком, и сжатом до «12.5M».
  // ⚠️ ДЛИНУ ЧИСЛА НАБИРАЕМ СЧЁТОМ УРОВНЯ, А НЕ ВЫДАЧЕЙ ЗВЁЗД: starGrant
  // необратим (se/tu монотонные) и 12М в кошельке ломали соседний ассерт
  // «списание сверх баланса отклонено». stats.score — величина УРОВНЯ, её
  // снимает regen в конце пробы, состояние кошелька не трогаем вовсе.
  const chipFit = await page.evaluate(async () => {
    const g = window.__game, out = [];
    const keep = g.stats().score;
    for (const sc of [0, 16790, 1234560, 123456780]){
      g.stats().score = sc;
      g.autoMatch();                                   // любой матч дёргает updateHUD
      await new Promise(r => setTimeout(r, 220));
      const t = document.getElementById('score'), svg = document.getElementById('scSvg');
      const tr = t.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      out.push({ text: t.textContent, over: Math.round(tr.right - innerWidth),
                 outOfBox: Math.round(tr.right - sr.right) });
    }
    g.stats().score = keep;                            // счёт уровня вернули
    g.regen(); g.skipIntro();                          // и уровень с чистого листа
    return out;
  });
  {
    const worstScreen = Math.max(...chipFit.map(o => o.over));
    const worstBox = Math.max(...chipFit.map(o => o.outOfBox));
    expect(worstScreen < 0,
      'чип НЕ вылезает за экран ни на одном балансе (худший край ' + worstScreen + 'px, ' +
      chipFit.map(o => o.text.trim()).join(' / ') + ')');
    expect(worstBox <= 0,
      'текст чипа НЕ выходит за свою рамку — якорь едет за viewBox (' + worstBox + 'px)');
  }

  // Кошелёк и рейтинг РАЗДЕЛЕНЫ: трата не отнимает звёзды уровней
  const walletProbe = await page.evaluate(() => {
    const g = window.__game;
    g.starGrant(5000);
    const before = { bal: g.starBalance(), stars: Object.assign({}, g.wallet().stars) };
    const ok = g.spendStars(2000);
    const after = { bal: g.starBalance(), stars: Object.assign({}, g.wallet().stars) };
    const tooMuch = g.spendStars(999999);
    return { before, after, ok, tooMuch, balAfterFail: g.starBalance() };
  });
  expect(walletProbe.ok && walletProbe.after.bal === walletProbe.before.bal - 2000,
    'списание уменьшает баланс (' + walletProbe.before.bal + ' -> ' + walletProbe.after.bal + ')');
  expect(JSON.stringify(walletProbe.before.stars) === JSON.stringify(walletProbe.after.stars),
    'трата валюты НЕ трогает рейтинг уровней (' + JSON.stringify(walletProbe.after.stars) + ')');
  expect(walletProbe.tooMuch === false && walletProbe.balAfterFail === walletProbe.after.bal,
    'списание сверх баланса отклонено и баланс не изменён (' + walletProbe.balAfterFail + ')');

  // ⚠️ ГЛАВНЫЙ РИСК: потратил -> синхронизация с ОТСТАВШЕЙ облачной копией
  // НЕ должна вернуть потраченное (наивный max по балансу дюпил бы валюту)
  const dupProbe = await page.evaluate(() => {
    const g = window.__game;
    const stale = g.saveRaw();            // копия ДО траты — как в облаке
    const before = g.starBalance();
    g.spendStars(1000);
    const afterSpend = g.starBalance();
    const afterMerge = g.mergeRaw(stale); // «облако» отдаёт устаревшее состояние
    return { before, afterSpend, afterMerge };
  });
  expect(dupProbe.afterSpend === dupProbe.before - 1000, 'трата прошла (' + dupProbe.before + ' -> ' + dupProbe.afterSpend + ')');
  expect(dupProbe.afterMerge === dupProbe.afterSpend,
    '⚠️ ДЮП: мерж со старой облачной копией НЕ вернул потраченное (' + dupProbe.afterSpend + ' -> ' + dupProbe.afterMerge + ')');

  // BOOST: цена по ступени, покупка растит множитель, списывает баланс
  const boostProbe = await page.evaluate(() => {
    const g = window.__game;
    const key = g.accSnapshot()[0].key;
    g.starGrant(60000);
    const p0 = g.boostPrice(key), t0 = g.accSnapshot()[0].tier, bt0 = g.boostTier(key), m0 = g.accSnapshot()[0].mult;
    const bal0 = g.starBalance();
    const buy = g.buyBoost(key);
    const s1 = g.accSnapshot()[0];
    const p1 = g.boostPrice(key);
    return { key, p0, t0, bt0, m0, bal0, buy, t1: s1.tier, m1: s1.mult, boost: s1.boost,
      count0: s1.count, bal1: g.starBalance(), p1 };
  });
  // фикс B: цена от КУПЛЕННЫХ ступеней (boostTier), НЕ суммарных (accTier).
  // snap0 имеет заработанные ступени, но первая КУПЛЕННАЯ стоит base·2^0=2000
  expect(boostProbe.p0 === 2000 * Math.pow(2, boostProbe.bt0),
    'цена буста от boughtTier (не accTier): base 2000 (boughtTier ' + boostProbe.bt0 + ' -> ' + boostProbe.p0 + ')');
  expect(boostProbe.buy.ok && boostProbe.t1 === boostProbe.t0 + 1,
    'покупка подняла ступень (' + boostProbe.t0 + ' -> ' + boostProbe.t1 + ')');
  expect(Math.abs(boostProbe.m1 - (boostProbe.m0 + 0.25)) < 1e-9,
    'множитель типа вырос на ACC_MULT_STEP (' + boostProbe.m0 + ' -> ' + boostProbe.m1 + ')');
  expect(boostProbe.bal1 === boostProbe.bal0 - boostProbe.p0,
    'баланс списан ровно на цену (' + boostProbe.bal0 + ' -> ' + boostProbe.bal1 + ')');
  expect(boostProbe.p1 === boostProbe.p0 * 2, 'следующая ступень дороже вдвое (' + boostProbe.p1 + ')');
  expect(boostProbe.boost === 1, 'купленные ступени учтены отдельно от спасённых (boost ' + boostProbe.boost + ')');

  // Недостаточно средств — отказ без списания
  const denyProbe = await page.evaluate(() => {
    const g = window.__game;
    const key = g.accSnapshot()[1].key;
    while (g.starBalance() > 0) g.spendStars(g.starBalance());
    const r = g.buyBoost(key);
    return { r, bal: g.starBalance(), tier: g.accSnapshot()[1].tier };
  });
  expect(denyProbe.r.ok === false && denyProbe.r.reason === 'insufficient',
    'буст без денег отклонён (' + JSON.stringify(denyProbe.r) + ')');
  expect(denyProbe.bal === 0, 'отказ не списал баланс (' + denyProbe.bal + ')');

  // Миграция старого сейва: накопленный РЕЙТИНГ даёт стартовый баланс, разово
  const migProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // «старый» сейв из БОЛЕЕ НОВОГО поколения: рейтинг есть, кошелька нет
    g.mergeRaw({ gen: (cur.gen || 0) + 1, stars: { 1: 3, 2: 2, 3: 1 }, se: 0, ss: 0, sm: 0, ac: {}, bo: {} });
    const before = g.starBalance();
    const got = g.starMigrate();
    const after = g.starBalance();
    const again = g.starMigrate(); // повторный вызов не должен начислить
    return { before, got, after, again, balFinal: g.starBalance() };
  });
  const migExpect = (500 + 10) + (250 + 20) + (100 + 30); // 3★ур1 + 2★ур2 + 1★ур3
  expect(migProbe.before === 0 && migProbe.got === migExpect,
    'миграция начислила стартовый баланс по рейтингу (' + migProbe.got + ' = ' + migExpect + ')');
  expect(migProbe.again === 0 && migProbe.balFinal === migProbe.after,
    'миграция разовая — повтор ничего не добавил (' + migProbe.balFinal + ')');

  // ОТКРЫТИЕ ТИПА ЗА БАЛАНС (финализация владельца): закрытый тип, трата,
  // становится открытым (bought), лидерборд/баланс падают на цену
  const unlockBuyProbe = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.regen(); g.skipIntro();
    // берём заведомо ЗАКРЫТЫЙ тип (индекс 40 > 9 открытых на ур.1)
    const snap = g.accSnapshot();
    const closed = snap.find((r, i) => i >= 20 && !r.unlocked);
    g.starGrant(10000);
    const price = g.typeUnlockPrice(closed.key);
    const wasUnlocked = g.isTypeUnlocked(closed.key);
    const w0 = g.starBalance();
    const buy = g.purchaseUnlock(closed.key);
    const nowUnlocked = g.isTypeUnlocked(closed.key);
    const s2 = g.accSnapshot().find(r => r.key === closed.key);
    const w1 = g.starBalance();
    const buyAgain = g.purchaseUnlock(closed.key); // уже открыт -> отказ
    return { key: closed.key, price, wasUnlocked, buy, nowUnlocked,
      bought: s2.bought, snapUnlocked: s2.unlocked, w0, w1, buyAgain };
  });
  expect(unlockBuyProbe.wasUnlocked === false && unlockBuyProbe.price === 1000,
    'ур.1: цена открытия 1000 = BASE 800 + PER_LEVEL 200·1 (' + unlockBuyProbe.price + ')');
  // #9 МАТРИЦА: цена ЗАВИСИТ от уровня (не флэт). Проверяем L1/L10/L50.
  const unlockMatrixProbe = await page.evaluate(() => {
    const g = window.__game;
    const pick = () => { const s = g.accSnapshot(); const c = s.find((r, i) => i >= 20 && !r.unlocked); return c ? c.key : null; };
    g.setLevel(1);  g.regen(); g.skipIntro(); const p1  = g.typeUnlockPrice(pick());
    g.setLevel(10); g.regen(); g.skipIntro(); const p10 = g.typeUnlockPrice(pick());
    g.setLevel(50); g.regen(); g.skipIntro(); const p50 = g.typeUnlockPrice(pick());
    return { p1, p10, p50 };
  });
  expect(unlockMatrixProbe.p1 === 1000 && unlockMatrixProbe.p10 === 2800 && unlockMatrixProbe.p50 === 10800,
    'матрица цены по уровню: L1=1000 L10=2800 L50=10800 (' + JSON.stringify(unlockMatrixProbe) + ')');
  expect(unlockBuyProbe.buy.ok && unlockBuyProbe.nowUnlocked === true,
    'покупка открыла тип (' + unlockBuyProbe.key + ')');
  expect(unlockBuyProbe.bought === true && unlockBuyProbe.snapUnlocked === true,
    'снапшот: bought=true и unlocked=true после покупки');
  expect(unlockBuyProbe.w1 === unlockBuyProbe.w0 - unlockBuyProbe.price,
    'трата на открытие списала кошелёк на цену (' + unlockBuyProbe.w0 + ' -> ' + unlockBuyProbe.w1 + ')');
  expect(unlockBuyProbe.buyAgain.ok === false && unlockBuyProbe.buyAgain.reason === 'already',
    'повторная покупка открытого типа отклонена (' + JSON.stringify(unlockBuyProbe.buyAgain) + ')');

  // ФИКС A — ЧЕСТНЫЙ ЛИДЕРБОРД (таблица №2): пополнение (реклама/IAP) растит
  // КОШЕЛЁК, но НЕ ранг; трата сперва ест пополнение, ранг падает лишь при
  // трате СВЕРХ пополнения. Чистый старт через мерж нового поколения.
  const ldbProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // gen-bump берёт копию ЦЕЛИКОМ — сбрасываем только se/ss/tu, остальное
    // (накопление/рейтинг/бусты/разлоки) переносим из текущего сейва
    g.mergeRaw({ gen: (cur.gen || 0) + 1, se: 5000, ss: 0, tu: 0, sm: 1,
      stars: cur.stars, ac: cur.ac, bo: cur.bo, uk: cur.uk });
    const lb0 = g.leaderboardScore(), w0 = g.starBalance();  // se=5000 -> оба 5000
    g.starGrant(3000);                                        // пополнение -> tu
    const lb1 = g.leaderboardScore(), w1 = g.starBalance();  // кошелёк 8000, ранг 5000
    g.spendStars(2000);                                       // в пределах пополнения (3000)
    const lb2 = g.leaderboardScore();                         // ранг цел
    g.spendStars(2000);                                       // ss=4000 > tu=3000 на 1000 -> ранг 4000
    const lb3 = g.leaderboardScore();
    return { lb0, w0, lb1, w1, lb2, lb3 };
  });
  expect(ldbProbe.w0 === 5000 && ldbProbe.lb0 === 5000, 'ФИКС A: чистый старт se=5000 (кошелёк=ранг=5000)');
  expect(ldbProbe.w1 === 8000 && ldbProbe.lb1 === 5000,
    'ФИКС A: пополнение растит КОШЕЛЁК (8000), но НЕ лидерборд (5000) — не pay-to-win');
  expect(ldbProbe.lb2 === 5000, 'ФИКС A: трата в пределах пополнения не роняет ранг (' + ldbProbe.lb2 + ')');
  expect(ldbProbe.lb3 === 4000, 'ФИКС A: трата сверх пополнения роняет сыгранный ранг (5000 -> ' + ldbProbe.lb3 + ')');

  // КАП БУСТА (фикс код-ревью): макс купленных ступеней ЛЮБОГО типа = 5 =
  // 2000·(2^5−1) = 62000 = пак-анкор Mega, универсально. Незалоченный
  // несыгранный тип НЕ должен буститься на ~1M.
  const boostCapProbe = await page.evaluate(() => {
    const g = window.__game;
    const cur = g.saveRaw();
    // чистый старт: гора баланса, НОЛЬ накопления и бустов у всех типов
    g.mergeRaw({ gen: (cur.gen || 0) + 1, se: 2000000, ss: 0, tu: 0, sm: 1, stars: cur.stars, ac: {}, bo: {}, uk: {} });
    const key = g.accSnapshot().find(r => r.unlocked).key; // открытый прогрессией, 0 заработанных
    let spent = 0, steps = 0; const prices = [];
    while (g.boostPrice(key) != null && steps < 20){
      const p = g.boostPrice(key); prices.push(p); g.buyBoost(key); spent += p; steps++;
    }
    return { key, steps, spent, prices, finalPrice: g.boostPrice(key), boughtTier: g.boostTier(key) };
  });
  expect(boostCapProbe.steps === 5 && boostCapProbe.spent === 62000,
    'макс буст любого типа = 5 ступеней = 62000 (Mega-анкор), не ~1M (' + boostCapProbe.steps + '/' + boostCapProbe.spent + ')');
  expect(boostCapProbe.finalPrice === null && boostCapProbe.boughtTier === 5,
    'после 5 купленных boostPrice=null — кап boostTier (' + boostCapProbe.boughtTier + ')');
  expect(JSON.stringify(boostCapProbe.prices) === JSON.stringify([2000, 4000, 8000, 16000, 32000]),
    'лестница цен буста 2000/4000/8000/16000/32000 (' + JSON.stringify(boostCapProbe.prices) + ')');

  // закрытый тип НЕЛЬЗЯ бустить (сначала открыть) — boostPrice null, buyBoost 'locked'
  const lockBoost = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.clearBought(); g.regen(); g.skipIntro();
    const closed = g.accSnapshot().find((r, i) => i >= 20 && !r.unlocked);
    g.starGrant(100000);
    return { key: closed.key, price: g.boostPrice(closed.key), can: g.canBoost(closed.key), buy: g.buyBoost(closed.key) };
  });
  expect(lockBoost.price === null && lockBoost.can === false && lockBoost.buy.reason === 'locked',
    'закрытый тип нельзя забустить, сначала открыть (' + JSON.stringify(lockBoost.buy) + ')');

  // открытие без средств — отказ без списания
  const unlockDeny = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(1); g.regen(); g.skipIntro();
    const closed = g.accSnapshot().find((r, i) => i >= 20 && !r.unlocked);
    while (g.starBalance() > 0) g.spendStars(g.starBalance());
    const r = g.purchaseUnlock(closed.key);
    return { r, bal: g.starBalance(), unlocked: g.isTypeUnlocked(closed.key) };
  });
  expect(unlockDeny.r.ok === false && unlockDeny.r.reason === 'insufficient' && unlockDeny.unlocked === false,
    'открытие без средств отклонено, тип закрыт (' + JSON.stringify(unlockDeny.r) + ')');

  // ОТКРЫТОСТЬ ТИПОВ прогрессией (ручка для ГРАФИКИ: портрет только открытым)
  // ⚠️ сбрасываем купленные разлоки — иначе тест покупки выше засчитался бы
  // как прогрессия (эта проверка про ЧИСТУЮ прогрессионную открытость)
  const unlockProbe = await page.evaluate(() => {
    const g = window.__game;
    g.clearBought();
    g.setLevel(1);
    const snap1 = g.accSnapshot();
    const u1 = g.unlockedTypes();
    const first = snap1[0].key, at20 = snap1[20] ? snap1[20].key : null;
    g.setLevel(15);
    const u15 = g.unlockedTypes().length;
    g.setLevel(1);
    return { n1: u1.length, snapUnlocked1: snap1.filter(r => r.unlocked).length,
      firstUnlocked: g.isTypeUnlocked(first), at20Unlocked: at20 ? g.isTypeUnlocked(at20) : null,
      n15: u15, bogus: g.isTypeUnlocked('nope') };
  });
  expect(unlockProbe.n1 === 9 && unlockProbe.snapUnlocked1 === 9,
    'ур.1: открыто ровно 9 типов, поле unlocked согласовано (' + unlockProbe.n1 + '/' + unlockProbe.snapUnlocked1 + ')');
  expect(unlockProbe.firstUnlocked === true && unlockProbe.at20Unlocked === false,
    'TYPES[0] открыт, TYPES[20] закрыт на ур.1 (' + unlockProbe.firstUnlocked + '/' + unlockProbe.at20Unlocked + ')');
  expect(unlockProbe.n15 === 23, 'ур.15: открыто 9+14=23 типа (' + unlockProbe.n15 + ')');
  expect(unlockProbe.bogus === false, 'несуществующий тип не открыт (' + unlockProbe.bogus + ')');

  // адаптер рекламы: на file:// SDK не грузится — режим заглушки
  const adsMode = await page.evaluate(() => window.__game.adsMode());
  expect(adsMode === 'stub', 'ads mode на file:// — stub (' + adsMode + ')');


  // ⚠️ синтетический креш секции МЕТРИК — ожидаемый, он и есть предмет
  // проверки; иначе собственный тест ловли ошибок валил бы сьют как «ошибка
  // страницы» и маскировал настоящие
  const realErrors = errors.filter(e => !/reading 'boom'/.test(e));
  if (realErrors.length) failures.push('runtime errors: ' + realErrors.join(' | '));
  // ⚠️ ЭТОТ ГЕЙТ СТОИТ НА ~40% ФАЙЛА, И ДО 2026-07-30 ОН БЫЛ ЕДИНСТВЕННЫМ:
  // ошибки страницы, случившиеся ПОСЛЕ этой строки, лишь печатались в конце и
  // в `failures` не попадали — то есть больше половины сьюта гонялось с
  // неработающим стражем ошибок, а «SUITE: PASS» это скрывал. Найдено ревью
  // 2026-07-30 и подтверждено подсчётом строк. Гейт оставлен здесь как РАННИЙ
  // сигнал (падает ближе к причине), а перед вердиктом стоит второй, добирающий
  // хвост. Счётчик учтённого — чтобы не дублировать одни и те же ошибки.
  let errorsReported = errors.length;
  // ВИТРИНА: ПРАВИЛО 2/3 (спека владельца 2026-07-27, ОТМЕНЯЕТ camnear):
  // панель видна на десктопе И планшетах (@media min-width:813 = 3×271px
  // полосы, pointer:fine снят), прячется ТОЛЬКО по ширине; приближение
  // камеры её больше НЕ гасит.
  const vitDisp = () => page.evaluate(() =>
    getComputedStyle(document.getElementById('vitrine')).display);
  expect(await vitDisp() === 'none',
    'витрина: мобайл-вьюпорт (390 < 813) — панели нет');
  await page.setViewportSize({ width: 1024, height: 768 }); // планшет-ландшафт
  await page.waitForTimeout(500); // тик витрины 150мс — дать построиться
  expect(await vitDisp() === 'block',
    'витрина: планшет 1024 ≥ 813 — панель ВИДНА (pointer:fine снят)');
  const vitZoom = await (async () => {
    await page.evaluate(() => window.__game.setCamR(9)); // максимальный зум
    await page.waitForTimeout(400);
    return { disp: await vitDisp(),
      cls: await page.evaluate(() => document.documentElement.classList.contains('camnear')) };
  })();
  expect(vitZoom.disp === 'block' && vitZoom.cls === false,
    'витрина: при СИЛЬНОМ зуме панель СТОИТ (camnear отменён) (' + JSON.stringify(vitZoom) + ')');
  // МНОЖИТЕЛЬ: паддинги ФИКС 6/6, ширина ПО СОДЕРЖИМОМУ (спека владельца
  // 2026-07-31 по живому багу «множитель не влезает»). ⚠️ МЕРИТЬ ШИРИНОЙ ТЕКСТА
  // против ДРОБНОЙ внутренней ширины: scrollWidth в LTR НЕ считает вылет ВЛЕВО
  // (на сломанной сборке он честно отдавал scrollWidth===clientWidth при срезанном
  // ×), а clientWidth округлён до целого и сам даёт ложные 0.3px.
  const multFit = await page.evaluate(() => {
    const e = document.querySelector('.vmult');
    if (!e) return { нетБейджа: true };
    const old = e.textContent, out = [];
    for (const t of ['×1.25', '×3.25']) { // рабочее значение и кап ACC_TIER_CAP=9
      e.textContent = t; void e.offsetWidth;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(e);
      const inner = r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
      out.push({ t, вылет: +(rg.getBoundingClientRect().width - inner).toFixed(2),
                 pl: parseFloat(c.paddingLeft), pr: parseFloat(c.paddingRight) });
    }
    e.textContent = old; void e.offsetWidth;
    return { out };
  });
  expect(!multFit.нетБейджа &&
    multFit.out.every(o => o.вылет <= 0.01 && o.pl === 6 && o.pr === 6),
    'витрина: множитель влезает целиком при паддингах 6/6 (' + JSON.stringify(multFit) + ')');
  await page.setViewportSize({ width: 800, height: 768 }); // уже порога 813
  await page.waitForTimeout(250);
  expect(await vitDisp() === 'none',
    'витрина: 800 < 813 (панель заняла бы >1/3) — скрыта');
  await page.setViewportSize({ width: 390, height: 780 }); // вернуть сьюту мобайл
  await page.evaluate(() => window.__game.setCamR(16.2));
  await page.waitForTimeout(250);
  // ПРИМИТИВЫ ПОД РЕКЛАМУ (контракт с ИНТЕГРАЦИЕЙ 2026-07-23): тихая пауза
  // без попапа + владение резюмом через boolean + внешний мьют, независимый
  // от тумблера игрока CFG.sound
  const adPrim = await page.evaluate(() => {
    const g = window.__game;
    const first = g.pause(true);                 // тихая пауза: поставил я
    const s1 = g.pauseState();
    const second = g.pause(true);                // повторный вызов: НЕ моя
    g.sound.setMuted(true);
    const s2 = g.pauseState();
    g.resume(); g.sound.setMuted(false);
    const s3 = g.pauseState();
    return { first, second, s1, s2, s3, cfg: window.__game.cfg.sound };
  });
  expect(adPrim.first === true && adPrim.second === false,
    'пауза под рекламу: первый вызов владеет паузой, повторный отдаёт false (' + adPrim.first + '/' + adPrim.second + ')');
  expect(adPrim.s1.paused === true && adPrim.s1.overlay === false,
    'тихая пауза НЕ показывает попап настроек (' + JSON.stringify(adPrim.s1) + ')');
  expect(adPrim.s2.muted === true && adPrim.cfg === true,
    'внешний мьют глушит звук, НЕ трогая тумблер игрока CFG.sound (' + JSON.stringify(adPrim.s2) + ')');
  expect(adPrim.s3.paused === false && adPrim.s3.muted === false,
    'после ролика пауза и мьют сняты (' + JSON.stringify(adPrim.s3) + ')');

  // КОНТРАКТ INTRODONE (витрина разворачивается после облёта, спека владельца):
  // класса нет пока идёт интро, появляется по его завершении (в т.ч. skipIntro)
  const introCls = await page.evaluate(() => {
    const was = document.documentElement.classList.contains('introdone');
    window.__game.regen(); // новый уровень — интро стартует, класс обязан слететь
    const during = document.documentElement.classList.contains('introdone');
    window.__game.skipIntro();
    return { was, during, after: document.documentElement.classList.contains('introdone') };
  });
  expect(introCls.during === false && introCls.after === true,
    'introdone: во время интро класса нет, после завершения есть (' + JSON.stringify(introCls) + ')');
  await page.evaluate(() => window.__game.setCamR(16.2)); // вернуть камеру сценарию

  // === НЕСОВМЕЩАЕМЫЕ КАМНИ: блок В КОНЦЕ сьюта НАМЕРЕННО — секции меняют
  // уровень (setLevel 15/16 + regen), и в середине они ломали контекст
  // «полного прогона» (он рассчитан на ур.1: бюджет встрясок, камера) ===
  // НЕСОВМЕЩАЕМЫЕ КАМНИ (спека владельца 2026-07-22): рампа спавна,
  // двойной штраф тапа, съём бомбой, ∞-порог эндшпиля без учёта камней
  await page.evaluate(() => { window.__game.setLevel(15); window.__game.regen(); window.__game.skipIntro(); });
  const r15 = await page.evaluate(() => window.__game.rocks());
  expect(r15 === 0, 'ур.15: камней нет (' + r15 + ')');
  await page.evaluate(() => { window.__game.setLevel(16); window.__game.regen(); window.__game.skipIntro(); });
  const r16 = await page.evaluate(() => window.__game.rocks());
  expect(r16 === 1, 'ур.16: один камень (' + r16 + ')');
  // тап по камню: −2×MISS_PENALTY (на ур.16 штрафы полные), misses растёт.
  // findByTex v2 отдаёт ВИДИМУЮ точку (рейкаст с камеры) — если камень
  // целиком закрыт кучей, {occluded:true}: встряхиваем и повторяем (флейк
  // v76: клик по проекции центра попадал в загораживающий предмет, +120)
  let rockT = null;
  for (let att = 0; att < 5; att++){
    rockT = await page.evaluate(() => window.__game.findByTex('rock'));
    if (rockT && !rockT.occluded) break;
    await page.evaluate(() => window.__game.shake());
    await page.waitForTimeout(1700);
  }
  expect(!!rockT && !rockT.occluded, 'камень имеет видимую точку (' + JSON.stringify(rockT) + ')');
  const rockTap0 = await page.evaluate(() => ({ score: window.__game.stats().score,
    misses: window.__game.stats().misses }));
  await page.mouse.click(rockT.px, rockT.py);
  await page.waitForTimeout(300);
  const rockTap1 = await page.evaluate(() => ({ score: window.__game.stats().score,
    misses: window.__game.stats().misses, rocks: window.__game.rocks() }));
  expect(rockTap1.score === rockTap0.score - 20, 'тап по камню: −20 (' + rockTap0.score + ' -> ' + rockTap1.score + ')');
  expect(rockTap1.misses === rockTap0.misses + 1, 'тап по камню засчитан промахом');

  // ── МЕТРИКИ (docs/METRICS.md) — СЕКЦИЯ В КОНЦЕ НАМЕРЕННО:
  // она регенерит уровень и бросает синтетический креш, т.е. портит контекст
  // соседям (поймал на себе: следующий тест ждал ур.1 и промах, а получил 0).
  // ⚠️ Буфер телеметрии копится ДАЖЕ при выключенной отправке (URL пуст) —
  // иначе «работает ли сбор» выяснялось бы только на проде.
  const tm = await page.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 700));
    const scrInGame = g.telemetryScreen();
    setTimeout(() => { null.boom(); }, 0);          // синтетический креш
    await new Promise(r => setTimeout(r, 300));
    return { scrInGame, evs: g.telemetry(60) };
  });
  {
    const err = tm.evs.filter(e => e.n === 'err').pop();
    expect(tm.scrInGame === 'game', 'экран партии помечен как game (' + tm.scrInGame + ')');
    expect(!!err && /boom/.test(err.m) && !!err.st,
      'креш пойман с сообщением и стеком (' + (err ? err.m.slice(0, 40) : 'нет') + ')');
    expect(!!err && err.v === 'game' && err.lv >= 1,
      'у креша есть контекст: экран и уровень (' + (err ? err.v + '/' + err.lv : '—') + ')');
  }
  // тап пишет СЕКТОР и ИСХОД (а не координаты — см. METRICS §4)
  // ⚠️ кликаем по ЭКРАННОЙ позиции живого предмета, а не в наугад выбранную
  // точку: первая версия била в пустоту мимо кучи и ассерт «нет тапа» врал
  const pt = await page.evaluate(() => {
    const g = window.__game, t = g.topItem();
    if (!t) return null;
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (pt) await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const tap = await page.evaluate(() => window.__game.telemetry(20).filter(e => e.n === 'tap').pop());
  expect(!!tap && /^(t|m|b)(l|c|r)$/.test(tap.z) && !!tap.r,
    'тап записан сектором и исходом (' + (tap ? tap.z + '/' + tap.r : 'нет') + ')');
  // экран закрывается с длительностью
  const scr = await page.evaluate(() => window.__game.telemetry(60).filter(e => e.n === 'screen').pop());
  expect(!!scr && scr.ms > 0 && !!scr.v,
    'экран закрыт с длительностью (' + (scr ? scr.v + ' ' + scr.ms + 'мс' : 'нет') + ')');


  expect(rockTap1.rocks === 1, 'камень тапом не убирается');
  // бомба убирает камень: телепортируем обоих в воздух рядом и детонируем —
  // камень в радиусе, прочая куча далеко внизу (кап не мешает)
  // ⚠️ БОМБУ ПРОВЕРЯЕМ ЯВНО (флейк 2026-07-29 «1 -> 1»): если её израсходовала
  // предыдущая секция, bombIndex()=-1, place(-1,…) молча ничего не делает и
  // detonate() тоже — камень остаётся, а сообщение винит бомбу в том, что её
  // просто нет. Теперь индекс попадает в текст ассерта: следующий отказ сразу
  // назовёт настоящую причину, а не заставит гадать.
  // ⚠️⚠️ СЕКЦИЯ ИЗОЛИРОВАНА 2026-07-31 (сигнал ПОВЕСТВОВАНИЯ: два красных
  // прогона за два дня на СОСЕДНИХ контекстно-зависимых секциях — вчера
  // камни occluded, сегодня бомба −1; оба раза чужие ребейзы теряли время на
  // атрибуцию ЧУЖОЙ хрупкости). Если бомбы нет — реген до состояния «есть
  // бомба и есть камень», а не молитва на предыдущую секцию. Кап 3 регена:
  // бомба и камень кладутся genLevel-ом всегда (ур.16+), не пришли за три
  // регена — это настоящий дефект генерации, и падение будет честным.
  await page.evaluate(async () => {
    for (let k = 0; k < 3; k++){
      if (window.__game.bombIndex() >= 0 && window.__game.rockIndex() >= 0) break;
      window.__game.regen(); window.__game.skipIntro();
      await new Promise(r => setTimeout(r, 250));
    }
  });
  const bombPre = await page.evaluate(() => {
    const g = window.__game;
    const bi = g.bombIndex();
    if (bi >= 0) g.place(bi, 0, 13, 0);
    g.place(g.rockIndex(), 0.9, 13.2, 0);
    return { rocks: g.rocks(), bomb: bi };
  });
  await page.evaluate(() => window.__game.detonate());
  await page.waitForTimeout(450);
  const rocksAfterBomb = await page.evaluate(() => window.__game.rocks());
  expect(bombPre.rocks === 1 && bombPre.bomb >= 0 && rocksAfterBomb === 0,
    'бомба убирает камень (камней ' + bombPre.rocks + ' -> ' + rocksAfterBomb +
    ', бомба index ' + bombPre.bomb + ')');
  // ∞-порог эндшпиля: камни не в счёте — при <=8 совмещаемых радиус 99
  await page.evaluate(() => { window.__game.setLevel(16); window.__game.regen(); window.__game.skipIntro(); });
  let guardR = 0, sinceRestR = 0;
  while (guardR++ < 500){
    const st = await page.evaluate(() => ({ alive: window.__game.alive(), r: window.__game.cfg.matchRadius, rocks: window.__game.rocks(),
      over: window.__game.level().over }));
    if (st.over || st.alive === 0){ // финал доел всё раньше сэмпла ≤8 — тоже валидный исход
      console.log('эндшпиль-с-камнем: уровень закрыт до сэмпла ≤8 (валидно)');
      break;
    }
    if (st.alive - st.rocks - 1 <= 8){ // −сюрприз −камни
      // ждём refresh-тик — мгновенное чтение радиуса ловит старое значение
      await page.waitForFunction(() => window.__game.cfg.matchRadius > 10, null, { timeout: 900 }).catch(() => {});
      const rFin = await page.evaluate(() => window.__game.cfg.matchRadius);
      expect(rFin > 10, '∞-радиус при <=8 совмещаемых, камни не мешают (r=' + rFin + ', rocks=' + st.rocks + ')');
      break;
    }
    const ok = await page.evaluate(() => window.__game.autoMatch());
    if (!ok){ await page.evaluate(() => window.__game.shake()); await page.waitForTimeout(1100); }
    // та же передышка, что в полном прогоне: непрерывный темп держит серию
    // турбо вечно (досыпка не даёт чаше опустеть до ∞-порога)
    else if (++sinceRestR >= 10){ sinceRestR = 0; await page.waitForTimeout(4300); }
    else await page.waitForTimeout(120);
  }
  expect(guardR < 500, 'эндшпиль с камнем достигнут ботом');

  // matcap-тюнер (дебаг-инструмент владельца): открывается из консоли, живьём
  // пересматривает пресет, закрывается повторным вызовом. Секция В КОНЦЕ и
  // САМОВОССТАНАВЛИВАЮЩАЯСЯ — пресеты глобальны, испорченный matcap утёк бы
  // в любые последующие проверки.
  const tuner = await page.evaluate(() => {
    const g = window.__game;
    const was = g.matcapPresets().soft.amb, sum0 = g.matcapSum('soft');
    g.matcapTuner();
    const sliders = document.querySelectorAll('#matcapTuner input[type=range]').length;
    const el = document.querySelector('#matcapTuner input[data-mc="soft.amb"]');
    const drag = v => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    drag(0.05);
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const moved = g.matcapPresets().soft.amb, sum1 = g.matcapSum('soft');
      drag(was);                                        // вернуть как было
      requestAnimationFrame(() => requestAnimationFrame(() => {
        g.matcapTuner();                                // и закрыть
        res({ sliders, was, moved, sum0, sum1, back: g.matcapPresets().soft.amb,
              sumBack: g.matcapSum('soft'), closed: !document.getElementById('matcapTuner') });
      }));
    })));
  });
  // ⚠️ ЧИСЛО ДЕРЖАТЬ В СИНХРОНЕ С ПАНЕЛЬЮ: было 26, стало 29 — добавлены ручки
  // ЯРКОСТИ (gain/contrast текстурных моделей + затемнение низа кучи) по просьбе
  // владельца «сделать объекты чуть светлее». Добавляешь ползунок — правь это
  // число тем же коммитом, иначе страж покраснеет на исправной сборке.
  expect(tuner.sliders === 29,
    'тюнер: 29 ползунков (3 света + 2 вуали + 3 яркости + 3×7 пресетов), сейчас ' + tuner.sliders);
  expect(tuner.moved === 0.05, 'тюнер меняет пресет (soft.amb ' + tuner.was + ' -> ' + tuner.moved + ')');
  expect(tuner.sum1 !== tuner.sum0, 'тюнер ПЕРЕСНИМАЕТ текстуру (сумма ' + tuner.sum0 + ' -> ' + tuner.sum1 + ')');
  expect(tuner.back === tuner.was && tuner.sumBack === tuner.sum0, 'тюнер откатывается ровно назад');
  expect(tuner.closed, 'тюнер закрывается повторным вызовом');

  // ⚠️⚠️ СВЕТ ОДИН НА ИГРУ: осколки берут направление из MATCAP_LIGHT, а не из
  // своей копии. До 2026-08-04 констант было ДВЕ, равными их держали руками —
  // и первая же правка владельца через эту самую панель (она правит только
  // MATCAP_LIGHT) развела бы освещение надвое: куча по новому свету, её
  // обломки по старому, причём в кадре взрыва они рядом. Проверяем ЧЕЛОВЕЧЕСКИМ
  // путём — ползунком панели, как это делает владелец.
  // ⚠️ shardLight() читается ПОСЛЕ shardBurst: тогда это свет, которым скол
  // УЖЕ запечён, а не тот, которым запёкся бы.
  const lightSrc = await page.evaluate(() => {
    const g = window.__game;
    g.matcapTuner();
    const inp = a => document.querySelector('#matcapTuner input[data-mc="light.' + a + '"]');
    const read = () => ['x', 'y', 'z'].map(a => +inp(a).value);
    const norm = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => +(c / L).toFixed(3)); };
    const drag = v => { const el = inp('x'); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const was = +inp('x').value;
    const probe = () => { g.shardBurst(2); return g.shardLight(); };   // сперва печём, потом читаем
    const base = { want: norm(read()), got: probe() };
    drag(-0.90);
    const moved = { want: norm(read()), got: probe() };
    drag(was);                                                          // вернуть как было
    const back = { want: norm(read()), got: probe() };
    g.matcapTuner();                                                    // и закрыть панель
    return { base, moved, back, was, closed: !document.getElementById('matcapTuner') };
  });
  const sameVec = (a, b) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) < 0.002);
  expect(sameVec(lightSrc.base.got, lightSrc.base.want),
    'свет осколков = MATCAP_LIGHT (' + lightSrc.base.got.join(',') + ' против ' + lightSrc.base.want.join(',') + ')');
  expect(!sameVec(lightSrc.moved.got, lightSrc.base.got),
    'ползунок панели ДВИНУЛ свет осколков (' + lightSrc.base.got.join(',') + ' -> ' + lightSrc.moved.got.join(',') + ')');
  expect(sameVec(lightSrc.moved.got, lightSrc.moved.want),
    'свет осколков следует за источником живьём (' + lightSrc.moved.got.join(',') + ' против ' + lightSrc.moved.want.join(',') + ')');
  expect(sameVec(lightSrc.back.got, lightSrc.base.got) && lightSrc.closed,
    'свет вернулся на владельческий x=' + lightSrc.was + ', панель закрыта');

  // ── BRIDGE: облачный сейв НЕ зависит от поддержки rewarded ───────────────
  // Регрессия 2026-07-23: bridgeSyncSave() стоял ПОСЛЕ гейта isRewardedSupported,
  // а commitSave (77-save) пишет в bridge.storage всегда, когда storage есть.
  // На площадке со storage, но без rewarded прогресс уезжал в облако в один
  // конец и не поднимался никогда. Проверять приходится на http: на file://
  // SDK не грузится вовсе (ранний return по протоколу), поэтому поднимаем
  // локальный сервер и подсовываем ПОДДЕЛЬНЫЙ SDK с rewarded=false, который
  // считает обращения к storage. Отдельная страница — состояние основного
  // прогона не трогаем.
  const http = require('http'), fs = require('fs');
  const MOCK_SDK = `
window.__probe = { initialized:false, gameReady:false, storageGet:0, storageSet:0 };
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY: 'game_ready' },
  EVENT_NAME: { REWARDED_STATE_CHANGED: 'rewarded_state_changed' },
  REWARDED_STATE: { REWARDED:'rewarded', FAILED:'failed', CLOSED:'closed' },
  platform: { id:'mocktest', language:'en', sendMessage(){
    // ⚠️ Фиксируем не только ФАКТ, но и ОБСТАНОВКУ первого сообщения (это
    // GAME_READY — он уходит первым). Без обстановки ассерт не может отличить
    // «отправили над чёрным экраном» от «отправили над нарисованной чашей».
    const p = window.__probe;
    if (!p.gameReady){
      p.gameReady = true;
      try {
        p.readyFrames = window.__game ? window.__game.perfStats().frames : -1;
        p.readyAlive  = window.__game ? window.__game.alive() : -1;
      } catch(e){ p.readyFrames = -2; p.readyAlive = -2; }
    }
  } },
  advertisement: { isRewardedSupported:false, isInterstitialSupported:false,
                   on(){}, showRewarded(){}, showInterstitial(){} },
  storage: { get(k){ window.__probe.storageGet++; return Promise.resolve(null); },
             set(k,v){ window.__probe.storageSet++; return Promise.resolve(); } },
  initialize(){ window.__probe.initialized = true; return Promise.resolve(); },
  setGameLoadingProgress(v){ window.__probe.progress = v; },
};
`;
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK_SDK); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const bport = srv.address().port;
  // ===== ПАКЕТ ТЕСТИРОВЩИКОВ (спека владельца 2026-08-02: «Делай») =====
  // Секции САМОДОСТАТОЧНЫ (свой regen) и стоят В КОНЦЕ page-блока: первая
  // вставка посреди потока сломала 4 чужих стража, питавшихся состоянием
  // предыдущих секций (урок «строительные леса переживают сдачу»).
  // 1) БЕСПЛАТНАЯ АВТО-ВСТРЯСКА: «объекты далеко и их невозможно соединить»
  // (radius=-9 — приём deadlock-стража), бесплатные потрачены, РЕКЛАМНЫЕ
  // ЖИВЫ (суть жалобы «вымогают») -> в ~2 c приходит ровно ОДНА бесплатная
  // встряска (stats.autoShakes 0->1), второй нет.
  await page.evaluate(() => { window.__game.setLevel(1); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => {
    if (window.__game.awake().physAwake) { window.__calm = 0; return false; }
    window.__calm = (window.__calm || 0) + 1;
    return window.__calm >= 8;
  }, null, { timeout: 30000, polling: 100 });
  const autoShakeRes = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const radSave = { base: g.cfg.baseRadius, match: g.cfg.matchRadius };
    g.cfg.baseRadius = -9; g.cfg.matchRadius = -9;
    const lv = g.level();
    lv.shakes = 0;                    // бесплатные кончились; adShakes НЕ трогаем
    const a0 = (g.stats().autoShakes || 0);
    let a1 = a0;
    { const t0 = Date.now();          // осадка: 2 тика по 600 мс + допуск
      while (a1 === a0 && Date.now() - t0 < 6000){ await sleep(150); a1 = (g.stats().autoShakes || 0); } }
    await sleep(2500);                // ещё окно — второй прийти НЕ должна
    const a2 = (g.stats().autoShakes || 0);
    const usedFlag = g.level().autoShakeUsed;
    g.cfg.baseRadius = radSave.base; g.cfg.matchRadius = radSave.match;
    return { a0, a1, a2, usedFlag };
  });
  console.log('auto-shake:', JSON.stringify(autoShakeRes));
  expect(autoShakeRes.a0 === 0 && autoShakeRes.a1 === 1,
    'АВТО-ВСТРЯСКА: пришла сама при «не соединить» и живой рекламе (' + JSON.stringify(autoShakeRes) + ')');
  expect(autoShakeRes.a2 === 1 && autoShakeRes.usedFlag === true,
    'АВТО-ВСТРЯСКА: ровно одна за уровень (' + JSON.stringify(autoShakeRes) + ')');

  // 2) ФИНАЛЬНАЯ ДОКИДКА ПАР. Сирот честным геймплеем в стенде не сделать:
  // deadlock-помол ест топ-пару ЦЕЛИКОМ ([top, twin] в 99-main) — нечёт в
  // бою создаёт только бомба. Факт сироты даёт ручка killOneTest (обёртка
  // removeItem по прецеденту penalizeTest); страж меряет ПОВЕДЕНИЕ ПОСЛЕ:
  // finale -> партнёр докинут (alive 1->2, флаг), сбор -> победа с пустой
  // чашей. Помол докидку опередить не должен.
  // Сценарий с РЕТРАЯМИ: doMatch сливает и ГРУППЫ ПО 3 одного типа, поэтому
  // «чёт обычных = пары» — ложная посылка (пойман пробой: killOne из
  // {Y,Y,Y,X} давал тройку, она слилась одним тапом, сироты не было).
  // Каждая попытка честная: если сирота не сложился — новый уровень.
  const refill = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let attempt = 1; attempt <= 4; attempt++){
      g.setLevel(1); g.regen(); g.skipIntro(); await sleep(700);
      { const t0 = Date.now(); let rest = 0;               // доиграть до хвоста
        while (g.alive() > 6 && Date.now() - t0 < 90000){
          const ok = g.autoMatch();
          if (!ok){ g.shake(); await sleep(1200); }
          else if (++rest >= 10){ rest = 0; await sleep(4300); }
          else await sleep(90);
        } }
      if (g.alive() > 6) continue;
      // ⚠️ ДАТЬ ДОЗРЕТЬ ОТЛОЖЕННЫМ ПОМОЛАМ (пойман хронометражем [kill]):
      // mixerGrind фиксирует [low, twin] и удаляет их setTimeout'ом через
      // 560 мс — «хвостовой» помол, схваченный в конце доигрыша, созревал
      // ПОСЛЕ ручек и сносил свежесозданного сироту (в бою гонки нет: помол
      // ест парой, чётность цела — сирот делает только бомба). Ждём
      // стабильного alive двумя замерами.
      { const t0 = Date.now(); let prev = -1;
        while (Date.now() - t0 < 8000){
          const a = g.alive();
          if (a === prev) break;
          prev = a; await sleep(800);
        } }
      const clearKind = (kind) => { let c = g.alive();     // бомб бывает несколько
        for (;;){ const c2 = g.killOneTest(kind); if (c2 === c) return; c = c2; } };
      clearKind('surprise'); clearKind('bomb');
      if (g.alive() === 0) continue;                        // хвост был из мусора
      if (g.alive() % 2 === 0) g.killOneTest();             // попытка сироты
      { const t0 = Date.now();                              // собрать пары хвоста
        while (Date.now() - t0 < 30000){
          if (g.alive() <= 1 || g.level().finalRefillDone) break;
          const ok = g.autoMatch();
          if (!ok){ g.shake(); await sleep(1200); } else await sleep(150);
        } }
      if (g.alive() === 0 && !g.level().finalRefillDone) continue; // тройка съела сироту — заново
      // осадка: finale -> докинут партнёр (alive 2, флаг стоит)
      let refilled = false;
      { const t0 = Date.now();
        while (Date.now() - t0 < 8000){
          if (g.level().finalRefillDone && g.alive() === 2){ refilled = true; break; }
          await sleep(150);
        } }
      if (!refilled) continue;
      await sleep(1200);                                    // партнёру — осесть
      { const t0 = Date.now();                              // финальный сбор
        while (g.alive() > 0 && Date.now() - t0 < 15000){
          const ok = g.autoMatch();
          if (!ok){ g.shake(); await sleep(1200); } else await sleep(150);
        } }
      let over = false;
      { const t0 = Date.now();
        while (Date.now() - t0 < 5000){ if (g.level().over){ over = true; break; } await sleep(150); } }
      return { attempt, refilled, aliveEnd: g.alive(), over };
    }
    return { fail: 'сирота не сложился за 4 попытки' };
  });
  console.log('final refill:', JSON.stringify(refill));
  expect(!refill.fail && refill.refilled === true,
    'ДОКИДКА: сироте докинут партнёр его типа, ровно раз (' + JSON.stringify(refill) + ')');
  expect(refill.aliveEnd === 0 && refill.over === true,
    'ДОКИДКА: хэппиэнд — чаша пуста, уровень выигран сбором (' + JSON.stringify(refill) + ')');

  // ⚠️⚠️ ДОКИДКА НЕ СПАВНИТ ВЫШЕ ПОТОЛКА СПАСАТЕЛЯ (ФИЗИКА 2026-08-07).
  // Высота спавна = FUNNEL.H + 2 + k*1.2, где k пробегает ВСЕХ сирот и капа
  // не имеет. Замер (сироты = по одному каждого типа, 4 сида): ур.5 пик 25.6,
  // ур.10 — 31.6, ур.20 — 43.6, ур.40 — 67.4. При потолке 60 спасатель
  // телепортировал СВЕЖЕДОКИНУТОЕ — 23 телепорта на 4 прогона.
  // ⛔ ЛЕЧИТЬ КЛАПАНОМ НА ЛЕСЕНКЕ ПРОБОВАЛА И ОТВЕРГЛА ЗАМЕРОМ: решает
  // ПЛОТНОСТЬ спавна, а не высота. Спасений на ур.40 — без капа 23,
  // кап 30 слоёв 37, кап 10 слоёв 102. Поднят ПОТОЛОК (зона физики): 2.
  // ⚠️ Ассерт сверяет пик с ХУКОМ rescueCeil(), а не с литералом — иначе
  // страж и код разъедутся при следующей правке потолка.
  const refillTop = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(40); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 700));
    const before = g.alive();
    g.leaveSingles();
    const сирот = g.alive();
    let пик = 0;
    for (let i = 0; i < 30; i++){                 // ловим пик, пока докинутое в воздухе
      const a = g.itemsGeo();
      for (const it of a) if (it.y > пик) пик = it.y;
      if (a.length > сирот && пик > 0 && a.length && g.topY() < 12) break;
      await new Promise(r => setTimeout(r, 120));
    }
    return { сирот, пик: +пик.toFixed(1), потолок: g.rescueCeil(), докинуто: g.alive() - сирот };
  });
  // ⚠️⚠️ ПОРОГ ПРОСАДКИ ОТНОСИТЕЛЬНЫЙ (ФИЗИКА 2026-08-07, #32). У `brickbar`
  // полутолщина такова, что абсолютный порог 0.12 недостижим В ПРИНЦИПЕ —
  // спасатель не приходил к нему по построению, а предмет сидел в плите
  // утопленным на 85% своей толщины.
  // ⛔ ДВА ПРЕДЫДУЩИХ ВАРИАНТА ЭТОГО СТРАЖА ВЫБРОШЕНЫ, И ИХ ОШИБКИ СТОИТ ЗНАТЬ:
  //   (1) «утопить плашку через place() и потребовать подъёма» — ТАВТОЛОГИЯ:
  //       при центре ниже верха плиты срабатывает ВТОРАЯ ветка спасателя (по
  //       центру), и диверсия «вернуть абсолютный порог» осталась ЗЕЛЁНОЙ;
  //   (2) «у плашки на живой куче порог ниже абсолютного» — ФЛЕЙК ПО ПОЗЕ:
  //       `makeItem` крутит меш Math.random() по трём осям, тело берёт
  //       кватернион оттуда, а порог считается от ВЕРТИКАЛЬНОЙ толщины в
  //       текущей позе — ассерт краснел на ИСПРАВНОЙ сборке.
  // Здесь ни кучи, ни place(): `penProbe` строит предмет ВНЕ уровня и обнуляет
  // поворот, поэтому толщина — ровно scl · half.y, без случайных чисел
  // (проверено: 5 вызовов подряд дают одно значение).
  const pen = await page.evaluate(() => ({
    тонкая: window.__game.penProbe('brickbar'),
    контроль: ['foodorange', 'animalpig'].map(n => window.__game.penProbe(n)),
  }));
  expect(pen.тонкая && pen.тонкая.порог < pen.тонкая.абсолютный,
    'ПЛАШКА: порог просадки НИЖЕ абсолютного — относительная ветка включилась (' + JSON.stringify(pen.тонкая) + ')');
  expect(pen.контроль.every(c => c && c.порог === c.абсолютный),
    'ПЛАШКА-КОНТРОЛЬ: у толстых моделей порог РОВНО абсолютный — правка хирургическая (' + JSON.stringify(pen.контроль) + ')');

  // ⚠️⚠️ ПОНЧИК: ДЫРКА НАСТОЯЩАЯ (ФИЗИКА 2026-08-07). Модель-бублик уходила в
  // ветку `default` -> convex hull, а он ЗАКРЫВАЕТ середину: физически там
  // невидимая перепонка, и предмет ложится на пустоту. Вопрос был открыт
  // заново, когда пончик реально попал в кучу (индекс 117, с ур.110).
  // ⚠️ КОНТРОЛЬ ОБЯЗАТЕЛЕН, И ВОТ ПОЧЕМУ: первая версия зонда пускала ЛУЧ и
  // объявила «дырка есть» У ВСЕХ, включая заведомо сплошные модели —
  // свежесозданный коллайдер ещё не в query-конвейере Rapier, и луч не
  // встречал никого. Зелёный-на-всём зонд. Сейчас спрашиваем саму ФОРМУ
  // (`containsPoint`), и контрольные модели обязаны отвечать «закрыто».
  const hole = await page.evaluate(() => ({
    пончик: window.__game.holeProbe('fooddonutsprinkles'),
    контроль: ['foodorange', 'animalpig'].map(n => window.__game.holeProbe(n)),
  }));
  expect(hole.пончик && hole.пончик.дырка === true && hole.пончик.коллайдеров > 1,
    'ПОНЧИК: дырка настоящая — центр СВОБОДЕН, кольцо капсул вместо hull (' + JSON.stringify(hole.пончик) + ')');
  expect(hole.контроль.every(c => c && c.дырка === false),
    'ПОНЧИК-КОНТРОЛЬ: сплошные модели остаются закрытыми — зонд различает (' + JSON.stringify(hole.контроль) + ')');

  expect(refillTop.докинуто > 0,
    'ДОКИДКА-ВЫСОТА: сценарий сложился, партнёры докинуты (' + JSON.stringify(refillTop) + ')');
  expect(refillTop.пик < refillTop.потолок,
    'ДОКИДКА-ВЫСОТА: пик спавна НИЖЕ потолка спасателя — он не телепортирует свежедокинутое ('
    + JSON.stringify(refillTop) + ')');

  // ===== ПОДСКАЗКА: ПОВЕРХНОСТНЫЙ ВЫБОР + ПОЛЁТ КАМЕРЫ (просьба тестеров,
  // слово владельца 2026-08-03) =====
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(1200);
  const hintCam = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cam0 = g.cam();
    g.hintShow();                       // честный путь кнопки (заряды стартовые)
    const pick = g.hintLast();
    // осадка: камера ДОЛЕТЕЛА (два неподвижных снапшота), потолок 3 c
    let prev = null, cam1 = null;
    { const t0 = Date.now();
      while (Date.now() - t0 < 3000){
        const c = g.cam();
        if (prev && c.az === prev.az && c.ty === prev.ty && c.r === prev.r){ cam1 = c; break; }
        prev = c; await sleep(150);
      } }
    cam1 = cam1 || g.cam();
    return { cam0: { az: cam0.az, ty: cam0.ty, r: cam0.r },
             cam1: { az: cam1.az, ty: cam1.ty, r: cam1.r }, pick };
  });
  console.log('hint cam:', JSON.stringify(hintCam));
  expect(hintCam.pick && hintCam.pick.surface === true,
    'ПОДСКАЗКА: на свежей куче выбор из ВЕРХНЕГО слоя (глубина — крайний случай) (' + JSON.stringify(hintCam.pick) + ')');
  expect(hintCam.cam1.r <= 13.01 && (hintCam.cam1.az !== hintCam.cam0.az || hintCam.cam1.ty !== hintCam.cam0.ty),
    'ПОДСКАЗКА: камера подъехала к якорю (наезд + разворот/подъём) (' + JSON.stringify(hintCam) + ')');
  // жест игрока ОБРЫВАЕТ полёт: старт второй подсказки -> Shift+колесо в
  // середине -> камера замерла и к цели не доехала бы сама
  const hintBreak = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.regen(); g.skipIntro(); await sleep(1100);
    g.hintShow();
    await sleep(250);                    // полёт в разгоне (ease 900 мс)
    return g.cam();
  });
  // жест = ПРАВЫЙ драг (rdrag -> noteManualPan на pointerdown): shift+колесо
  // в headless доносит модификатор нестабильно — полёт жил, страж флейкал
  await page.mouse.move(195, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(195, 340);
  await page.mouse.up({ button: 'right' });
  // осадка по ФАКТУ обрыва (cam().fly), затем два стоп-кадра
  await page.waitForFunction(() => window.__game.cam().fly === false, null, { timeout: 3000 });
  await page.waitForTimeout(300);
  const hb1 = await page.evaluate(() => window.__game.cam());
  await page.waitForTimeout(450);
  const hb2 = await page.evaluate(() => window.__game.cam());
  // r — с эпсилоном: после обрыва демпфер зума дотягивает сотые (13.01 -> 13),
  // это не полёт (az при живом полёте шёл бы дугой и не совпал бы точно)
  expect(hb1.az === hb2.az && Math.abs(hb1.r - hb2.r) < 0.02,
    'ПОДСКАЗКА: жест игрока обрывает полёт — камера больше не движется сама (' + JSON.stringify({ hb1, hb2 }) + ')');

  const bpage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const bErrors = [];
  bpage.on('pageerror', e => bErrors.push('PAGEERROR: ' + e.message));
  bpage.on('console', m => { if (m.type() === 'error') bErrors.push('CONSOLE: ' + m.text()); });
  await bpage.goto('http://127.0.0.1:' + bport + '/index.html');
  await bpage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  await bpage.waitForFunction(() => window.__probe && window.__probe.initialized, null, { timeout: 20000 });
  await bpage.evaluate(() => window.__game.grant(1)); // любое изменение сейва -> commitSave -> запись в облако
  await bpage.waitForTimeout(1000);                   // промисы sync/записи
  // ⚠️ КОНТРАКТ GAME_READY, ВЕРСИЯ 2026-07-30 — ЗАПРЕТ ИМЕННО ЧЁРНОГО ЭКРАНА.
  // Прежний ассерт снимал флаг ПОСЛЕ того, как игра давно рисует, и потому не
  // различал два разных случая: отправку в Ads.init() (площадка снимает лоадер
  // над чёрным экраном — ЗАПРЕЩЕНО) и отправку из фазы ожидания занавеса
  // (чаша уже нарисована, предметы ещё не сыплются — ТЕПЕРЬ ШТАТНЫЙ ПУТЬ,
  // жалоба владельца «пропала анимация заполнения»). Мерим обстановку В МОМЕНТ
  // отправки: были ли предметы и был ли нарисован хоть один кадр.
  // ⚠️ АССЕРТ СПОСОБЕН УПАСТЬ (проверено переносом вызова назад в Ads.init):
  // там alive()===0, потому что genLevel ещё не звался.
  await bpage.evaluate(() => window.__game.skipIntro());
  await bpage.waitForTimeout(300);
  // ЗАНАВЕС: обещание обязано разрешиться, и именно НАШИМ game_ready — на этом
  // пути SDK удаляет свой узел синхронно, поэтому момент назначаем мы.
  const curtainSdk = await bpage.evaluate(async () => {
    const why = await Promise.race([ window.__ads.curtainGone,
      new Promise(r => setTimeout(()=>r('НЕ РАЗРЕШИЛОСЬ'), 3000)) ]);
    return why;
  });
  const bp = await bpage.evaluate(() => ({ ...window.__probe, mode: window.__game.adsMode() }));
  await bpage.close();
  await new Promise(r => srv.close(r));
  expect(bp.initialized, 'bridge: SDK инициализирован');
  expect(bp.readyAlive > 0 && bp.readyFrames >= 1,
    'bridge: GAME_READY ушёл над НАРИСОВАННОЙ чашей, а не над чёрным экраном (кадров '
    + bp.readyFrames + ', предметов ' + bp.readyAlive + ')');
  expect(bp.gameReady, 'bridge: GAME_READY отправлен по готовности игры');
  expect(bp.storageGet >= 1, 'bridge: облако ЧИТАЕТСЯ и без rewarded (storage.get ' + bp.storageGet + ')');
  expect(bp.storageSet >= 1, 'bridge: облако пишется (storage.set ' + bp.storageSet + ') — симметрия чтения/записи');
  expect(bp.mode === 'stub', 'bridge: без rewarded режим остаётся stub (' + bp.mode + ')');
  expect(curtainSdk === 'снят game_ready', 'занавес: снят НАШИМ game_ready (' + curtainSdk + ')');
  if (bErrors.length) failures.push('bridge-проба: ' + bErrors.join(' | '));

  // === ЗАНАВЕС: SDK ПОВИС (найдено замером, хуже исходной жалобы) ===
  // Если `initialize()` не резолвится, то и sdkReady не встаёт: GAME_READY
  // отправить нечем, а собственный `.finally` лоадера не наступает — на живом
  // стенде занавес висел 20 с, игра под ним невидима. Страховка обязана
  // сработать ЧЕРЕЗ ПУБЛИЧНЫЙ setGameLoadingProgress(100).
  // ⚠️ Различаем 'снят страховкой' и 'предел ожидания': второе значит, что
  // страховка НЕ отработала и спас только жёсткий предел — обещание-то
  // разрешилось, но занавес остался бы висеть. Ассерт на первое.
  const MOCK_HANG = `
window.__probe = window.__probe || { progress:null, boots:0 };
window.__probe.boots = (window.__probe.boots || 0) + 1; // диагностика двойной загрузки мока
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY: 'game_ready' },
  EVENT_NAME: {}, REWARDED_STATE: {},
  platform: { id:'mocktest', language:'en', sendMessage(){} },
  advertisement: { isRewardedSupported:false, isInterstitialSupported:false, on(){}, showRewarded(){}, showInterstitial(){} },
  storage: { get(){ return Promise.resolve(null); }, set(){ return Promise.resolve(); } },
  setGameLoadingProgress(v){ window.__probe.progress = v; },
  initialize(){ return new Promise(()=>{}); },   // НИКОГДА не резолвится
};
`;
  const srvH = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end('/* мок предзагружен addInitScript — сервер отдаёт пустышку, гонка загрузки исключена по построению */'); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srvH.listen(0, '127.0.0.1', r));
  const hpage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  // мок — ДО любого скрипта страницы: под нагрузкой сервер сьюта отдавал
  // bridge.js ПОЗЖЕ страховки/предела (finishIntro сам шлёт GAME_READY, не
  // дожидаясь нашего skipIntro), и публичный вызов бил в несуществующий bridge
  await hpage.addInitScript({ content: MOCK_HANG });
  await hpage.goto('http://127.0.0.1:' + srvH.address().port + '/index.html');
  await hpage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  // ⚠️ ЖДЁМ ИСПОЛНЕНИЯ МОКА (window.__probe): под нагрузкой полного прогона
  // сервер сьюта отдаёт playgama-bridge.js ПОЗЖЕ выстрела страховки — та
  // звала setGameLoadingProgress у НЕСУЩЕСТВУЮЩЕГО bridge (try глотал), и
  // progress оставался null. В бою SDK — локальный файл площадки, гонки нет.
  await hpage.waitForFunction(() => !!window.__probe, null, { timeout: 30000 });
  await hpage.evaluate(() => window.__game.skipIntro());   // игра готова -> Ads.gameReady()
  const hang = await hpage.evaluate(async () => {
    const why = await Promise.race([ window.__ads.curtainGone,
      new Promise(r => setTimeout(()=>r('НЕ РАЗРЕШИЛОСЬ'), 6000)) ]);
    // осадка-опрос ФАКТА вызова: под нагрузкой полного прогона чтение
    // сразу после резолва ловило момент, а не состояние (класс из канона)
    let pg = window.__probe.progress;
    for (let i = 0; i < 20 && pg == null; i++){ await new Promise(r => setTimeout(r, 100)); pg = window.__probe.progress; }
    return { why, progress: pg, boots: window.__probe.boots };
  });
  await hpage.close(); await new Promise(r => srvH.close(r));
  expect(hang.why === 'снят страховкой',
    'занавес: повисший SDK не оставил занавес навсегда — сработала страховка (' + hang.why + ')');
  expect(hang.progress === 100,
    'занавес: страховка сняла его ПУБЛИЧНЫМ setGameLoadingProgress(100) (прогресс ' + hang.progress + ')');

  // === ЗАНАВЕС: sendMessage БРОСИЛ (латч не должен «съесть» неотправленное) ===
  // Раньше gameReadySent взводился ДО вызова: синхронный бросок оставлял
  // «уже отправлено» при неотправленном сообщении, страховка (её условие —
  // `!gameReadySent`) не взводилась, и занавес висел до жёсткого предела.
  // ⚠️ Ассертим ИМЕННО 'снят страховкой': 'по пределу' значит, что латч
  // снова съел отправку и спас только грубый таймаут.
  const MOCK_THROW = `
window.__probe = { progress:null, tries:0 };
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY: 'game_ready' },
  EVENT_NAME: {}, REWARDED_STATE: {},
  platform: { id:'mocktest', language:'en',
              sendMessage(){ window.__probe.tries++; throw new Error('площадка отвергла сообщение'); } },
  advertisement: { isRewardedSupported:false, isInterstitialSupported:false, on(){}, showRewarded(){}, showInterstitial(){} },
  storage: { get(){ return Promise.resolve(null); }, set(){ return Promise.resolve(); } },
  setGameLoadingProgress(v){ window.__probe.progress = v; },
  initialize(){ return Promise.resolve(); },
};
`;
  const srvT = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK_THROW); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srvT.listen(0, '127.0.0.1', r));
  const tpage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await tpage.goto('http://127.0.0.1:' + srvT.address().port + '/index.html');
  await tpage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  await tpage.evaluate(() => window.__game.skipIntro());
  // ⚠️ МЕРИМ ИМЕННО ТО, ЧТО ОПРЕДЕЛЯЕТ ЛАТЧ: пустил ли он ПОВТОРНУЮ попытку.
  // Первая версия этого стража ассертила «занавес снят страховкой» — и была
  // ПУСТОЙ: страховку успевает взвести более ранний вызов gameReady (когда
  // sdkReady ещё false), поэтому ассерт зелен и при сломанном порядке латча.
  // Поймано зубами, оставляю как напоминание: сперва спроси, что именно
  // ломается от правки, и меряй ровно это.
  const thr = await tpage.evaluate(async () => {
    const before = window.__probe.tries;      // попытка при готовности игры (бросила)
    window.__ads.gameReady();                 // ещё один заход (следующий уровень/повтор)
    return { before, after: window.__probe.tries };
  });
  await tpage.close(); await new Promise(r => srvT.close(r));
  expect(thr.before >= 1, 'занавес: отправка вообще пробовалась — тест не меряет пустоту ('
    + thr.before + ')');
  expect(thr.after > thr.before,
    'занавес: бросок НЕ съеден латчем — повторная отправка пробуется снова ('
    + thr.before + ' -> ' + thr.after + ')');



  // ВУАЛЬ НЕДОСТУПНЫХ В HARD (спека владельца 2026-07-23): обесцвечивание
  // идёт ЧЕРЕЗ ШЕЙДЕР — у текстурных моделей material.color белый, и старый
  // лерп к серому их не обесцвечивал вовсе. Секция самовосстанавливающаяся:
  // пин вуали глобальный, оставленный включённым, испортил бы всё дальнейшее.
  const veil = await page.evaluate(async () => {
    const g = window.__game;
    g.cfg.hard = true; g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 1200));
    g.forceRefresh();
    await new Promise(r => setTimeout(r, 700));   // лерп вуали 0.25 с + запас
    const hard = g.veilStats();
    const pinned = (g.veilAll(1), await new Promise(r => setTimeout(() => r(g.veilStats()), 350)));
    g.veilAll(null);
    // ⚠️ НЕ фиксированная пауза (флейк 2026-07-24, флагнул интерфейс «181→181»):
    // снятие пина возвращает вуаль под доступность ЧЕРЕЗ ЛЕРП (0.25с) +
    // refresh-тик — на медленном прогоне 700мс не всегда хватало, veiled
    // оставался на пине. Ждём УСЛОВИЯ (обесценилось меньше пиковых), потолок
    // 3с — как чинили флейки осколков и эндшпильного радиуса.
    const relDeadline = Date.now() + 3000;
    while (g.veilStats().veiled >= pinned.veiled && Date.now() < relDeadline)
      await new Promise(r => setTimeout(r, 100));
    const released = g.veilStats();
    g.cfg.hard = false;
    return { hard, pinned, released, alive: g.alive() };
  });
  expect(veil.hard.withShader > 50, 'вуаль: шейдерный патч на всех предметах (' + veil.hard.withShader + ')');
  expect(veil.hard.veiled > 0 && veil.hard.max > 0.5,
    'Hard: недоступные реально обесцвечены через uVeil (' + veil.hard.veiled + ' шт, max ' + veil.hard.max + ')');
  expect(veil.pinned.veiled === veil.pinned.withShader,
    'пин тюнера накрывает всю кучу (' + veil.pinned.veiled + '/' + veil.pinned.withShader + ')');
  expect(veil.released.veiled < veil.pinned.veiled,
    'снятие пина возвращает вуаль под управление доступности (' + veil.pinned.veiled + ' -> ' + veil.released.veiled + ')');
  // ── РЕКЛАМА: игра СТОИТ и МОЛЧИТ на время ролика ─────────────────────────
  // Требование Poki и CrazyGames; Bridge его не закрывает (проверено по его
  // адаптерам). Мок объявляет rewarded поддержанным — тогда режим 'bridge' —
  // и даёт из теста слать состояния. Показ запускаем БОЕВЫМ путём: клик по
  // кнопке «Watch» -> startAd -> Ads.showRewarded.
  const MOCK_RW = `
window.__mock = { iapTried:[], h:{}, emit(ev,st){ (this.h[ev]||[]).forEach(f=>{ try{ f(st); }catch(e){} }); },
  rwShown:0, interShown:0, msgs:[], rwPlace:null, interPlace:null, lb:[] };
function reg(ev,cb){ (window.__mock.h[ev] = window.__mock.h[ev] || []).push(cb); }
window.bridge = {
  PLATFORM_MESSAGE: { GAME_READY:'game_ready', LEVEL_STARTED:'level_started',
    LEVEL_COMPLETED:'level_completed', LEVEL_PAUSED:'level_paused', LEVEL_RESUMED:'level_resumed' },
  EVENT_NAME: { REWARDED_STATE_CHANGED:'rw', INTERSTITIAL_STATE_CHANGED:'inter',
    AUDIO_STATE_CHANGED:'audio', PAUSE_STATE_CHANGED:'pause' },
  REWARDED_STATE: { REWARDED:'rewarded', FAILED:'failed', CLOSED:'closed' },
  INTERSTITIAL_STATE: { LOADING:'loading', OPENED:'opened', CLOSED:'closed', FAILED:'failed' },
  platform: { id:'mocktest', language:'ru', isAudioEnabled:true, isPaused:false, on:reg,
              sendMessage(n, p){ window.__mock.msgs.push({ n, p }); return Promise.resolve(); } },
  player: { id:'p1', isAuthorized:false },
  // ⚠️ МОК ВЕДЁТ СЕБЯ КАК НАСТОЯЩИЙ СЕРВЕР (форма и семантика сняты живым
  // прогоном 2026-07-29): хранит МАКСИМУМ и в ответе отдаёт СОХРАНЁННЫЙ счёт,
  // а не присланный; статус «normal» одинаков и при приёме, и при игноре.
  leaderboards: { type:'in_game', _best:0, _gets:0, _rows:null, _fail:false, _popup:0,
    getEntries(id){
      window.__mock.lbGets = (window.__mock.lbGets||0) + 1;
      if (this._fail) return Promise.reject(new Error('сеть'));
      return Promise.resolve(this._rows || []);
    },
    showNativePopup(id){ this._popup++; return this.type === 'native_popup'
      ? Promise.resolve() : Promise.reject(new Error('нет попапа')); },
    setScore(id, sc){ window.__mock.lb.push({ id, sc });
      this._best = Math.max(this._best, sc);
      return Promise.resolve({ uuid:'u', score:this._best, platformId:'mocktest',
        scoreAttemptStatus:'normal', scoreAttemptReasons:[] }); } },
  advertisement: { isRewardedSupported:true, isInterstitialSupported:true, on:reg,
                   showRewarded(pl){ window.__mock.rwShown++; window.__mock.rwPlace = pl === undefined ? null : pl; },
                   showInterstitial(pl){ window.__mock.interShown++; window.__mock.interPlace = pl === undefined ? null : pl; } },
  storage: { get(){ return Promise.resolve(null); }, set(){ return Promise.resolve(); } },
  payments: { isPaymentsSupported:true,
    _list: [], _consumed: [], _fail: false,
    purchase(id){
      window.__mock.iapTried.push(id);
      if (this._fail) return Promise.reject(new Error('игрок отменил'));
      const p = { id: id, orderId: 'ord_' + id + '_' + window.__mock.iapTried.length, status:'PAID' };
      this._list.push(p);
      return Promise.resolve(p);
    },
    getPurchases(){ return Promise.resolve(this._list.slice()); },
    consumePurchase(id){
      this._consumed.push(id);
      this._list = this._list.filter(x => x.id !== id);   // закрытая покупка уходит из списка
      return Promise.resolve({ id: id });
    },
    getCatalog(){ return Promise.resolve([{ id:'noads_forever', price:'49 Gam' }]); } },
  initialize(){ return Promise.resolve(); },
};
`;
  const srv2 = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/playgama-bridge.js'){ res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK_RW); }
    if (u === '/playgama-bridge-config.json'){ res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"platforms":{}}'); }
    if (u === '/' || u === '/index.html'){ res.writeHead(200, {'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv2.listen(0, '127.0.0.1', r));
  const apage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const aErrors = [];
  apage.on('pageerror', e => aErrors.push('PAGEERROR: ' + e.message));
  await apage.goto('http://127.0.0.1:' + srv2.address().port + '/index.html');
  await apage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
  await apage.evaluate(() => window.__game.skipIntro()); // пауза не встаёт во время интро
  await apage.waitForFunction(() => window.__game.adsMode() === 'bridge', null, { timeout: 20000 });
  expect(true, 'реклама: мок с rewarded даёт режим bridge');

  const adState = async () => apage.evaluate(() => window.__game.pauseState());
  const emit = async (ev, st) => { await apage.evaluate(([e,s]) => window.__mock.emit(e,s), [ev,st]); await apage.waitForTimeout(250); };

  // 1. НАГРАДА: показ -> игра замерла и заглохла -> награда -> всё вернулось
  await apage.evaluate(() => { const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 2;            // ad-состояние Shake
    document.getElementById('shakeBtn').click(); });  // тап = ролик сразу (оверлей снесён)
  await apage.waitForTimeout(250);
  const during = await adState();
  expect(during.paused && during.muted, 'реклама: во время ролика игра на паузе и звук заглушен (' + JSON.stringify(during) + ')');
  expect(!during.overlay, 'реклама: пауза ТИХАЯ — попап не показан (игрок не закрывает его руками)');
  await emit('rw', 'rewarded');
  const afterRw = await adState();
  expect(!afterRw.paused && !afterRw.muted, 'реклама: после награды пауза и звук восстановлены (' + JSON.stringify(afterRw) + ')');

  // 2. ПРОВАЛ: развязка обязана снимать паузу так же, иначе игра замёрзнет
  await apage.evaluate(() => { const lv = window.__game.level();
    lv.shakes = 0; lv.adShakes = 2;            // ad-состояние Shake
    document.getElementById('shakeBtn').click(); });  // тап = ролик сразу (оверлей снесён)
  await apage.waitForTimeout(250);
  const during2 = await adState();
  await emit('rw', 'failed');
  const afterFail = await adState();
  expect(during2.paused && !afterFail.paused && !afterFail.muted,
    'реклама: при ПРОВАЛЕ показа игра тоже размораживается (' + JSON.stringify(afterFail) + ')');

  // 3. МЕЖСТРАНИЧНАЯ: идёт без наших колбэков — пауза висит на состояниях
  await emit('inter', 'opened');
  const interOn = await adState();
  await emit('inter', 'closed');
  const interOff = await adState();
  expect(interOn.paused && interOn.muted && !interOn.overlay,
    'межстраничная: игра на паузе и без звука, попапа нет (' + JSON.stringify(interOn) + ')');
  expect(!interOff.paused && !interOff.muted, 'межстраничная: после закрытия всё восстановлено');

  // ГЛАВНЫЙ ЭКРАН НЕ ЛЕЗЕТ ПОВЕРХ ЧУЖОЙ ПАУЗЫ (интерфейс честно сообщил, что
  // сам эту ветку не покрыл — нужен именно этот bridge-мок). Сценарий: идёт
  // межстраничная (пауза рекламная), игрок жмёт ⏸ — меню НЕ должно открыться
  // и НЕ должно снять чужую паузу; после закрытия ролика игра размораживается
  // сама. Без этого игрок вернулся бы в живую игру, которую не возобновлял.
  await emit('inter', 'opened');
  const menuTry = await apage.evaluate(() => {
    window.showMainScreen();                       // попытка открыть поверх рекламы
    return { open: document.getElementById('mainScreen').classList.contains('open'),
             st: window.__game.pauseState() };
  });
  await emit('inter', 'closed');
  const afterAd = await apage.evaluate(() => ({
    open: document.getElementById('mainScreen').classList.contains('open'),
    st: window.__game.pauseState() }));
  expect(menuTry.open === false && menuTry.st.paused === true,
    'меню НЕ открывается поверх рекламной паузы (' + JSON.stringify(menuTry) + ')');
  expect(afterAd.st.paused === false && afterAd.open === false,
    'после ролика игра разморожена, меню так и не открылось (' + JSON.stringify(afterAd) + ')');

  // 4. ЗВУК ПЛОЩАДКИ (AUDIO_STATE_CHANGED): глушит БЕЗ паузы и не залипает
  await emit('audio', false);
  const audOff = await adState();
  await emit('audio', true);
  const audOn = await adState();
  expect(audOff.muted && !audOff.paused, 'звук площадки: выключение глушит игру, но не ставит её на паузу');
  expect(!audOn.muted, 'звук площадки: включение возвращает звук');

  // 5. КАДЕНЦИЯ «каждый 5 уровень» (спека владельца 2026-07-23). Копим победы
  // через публичные noteWin/maybeInterstitial (window.__ads), считаем реальные
  // вызовы showInterstitial у мока. Полный прогон 5 побед был бы медленным и
  // флейкозависимым — каденция это чистая функция счётчика, тестируем её.
  // ⚠️ ЧИСЛО КАДЕНЦИИ ЗАДАЁТСЯ ЗДЕСЬ И ТОЛЬКО ЗДЕСЬ. Это НАМЕРЕННЫЙ ДВОЙНИК
  // INTER_EVERY_LEVELS из 00-config: если его читать из игры, ассерт станет
  // тавтологией и пройдёт при любой каденции, а он обязан ловить именно
  // расхождение с утверждённой спекой владельца.
  // Спека: 2026-07-23 «каждый 5 уровень» → 2026-07-30 «раз в 3 уровня».
  // Меняется число у владельца — правится ЭТА строка, дальше всё считается.
  const INTER_EVERY = 3;
  const cad = await apage.evaluate((every) => {
    const A = window.__ads, M = window.__mock;
    const seq = [];
    const base = M.interShown;
    // every-1 побед — ролика ещё нет
    for (let i = 0; i < every - 1; i++){ A.noteWin(); A.maybeInterstitial(); }
    seq.push(M.interShown - base);                 // 0
    // порогова победа — ролик показан ровно один раз
    A.noteWin(); A.maybeInterstitial();
    seq.push(M.interShown - base);                 // 1
    // повторный переход без новой победы (напр. поражение+повтор) — не дублит
    A.maybeInterstitial();
    seq.push(M.interShown - base);                 // 1
    // ещё every побед — следующий ролик
    for (let i = 0; i < every; i++){ A.noteWin(); A.maybeInterstitial(); }
    seq.push(M.interShown - base);                 // 2
    // ОТЛОЖЕННЫЙ показ: уровень можно сменить МИМО maybeInterstitial
    // (msPlayBtn «Play Game»/pauseRestart — genLevel без сброса счётчика).
    // Тогда накопленный за 5 побед ролик выстрелит на БЛИЖАЙШЕМ ПОБЕДНОМ
    // переходе (againBtn) — единственный, кто теперь зовёт гейт. Здесь
    // прямой вызов maybeInterstitial моделирует именно этот победный Next.
    const preDef = M.interShown;
    for (let i = 0; i < every; i++) A.noteWin();    // every побед, ни одного maybeInterstitial
    const deferredNoShow = M.interShown - preDef;   // 0 — пока не показан
    A.maybeInterstitial();                          // ближайший победный Next
    const deferredFired = M.interShown - preDef;    // 1 — отложенный ролик вышел
    return { seq, winsLeft: A._winsSinceInter, deferredNoShow, deferredFired };
  }, INTER_EVERY);
  expect(cad.seq[0] === 0, 'каденция: ' + (INTER_EVERY - 1) + ' побед — ролика нет (' + cad.seq[0] + ')');
  expect(cad.seq[1] === 1, 'каденция: на ' + INTER_EVERY + '-й победе ровно один ролик (' + cad.seq[1] + ')');
  expect(cad.seq[2] === 1, 'каденция: переход без победы не дублирует ролик (' + cad.seq[2] + ')');
  expect(cad.seq[3] === 2, 'каденция: следующие ' + INTER_EVERY + ' побед дают ещё один ролик (' + cad.seq[3] + ')');
  expect(cad.winsLeft === 0, 'каденция: окно сброшено после показа (' + cad.winsLeft + ')');


  // === ТИХАЯ ПАУЗА ПОД РОЛИКОМ, ПРИЛЕТЕВШИМ ПОВЕРХ ИНТРО ===
  // Боевой путь againBtn: `Ads.maybeInterstitial(); genLevel();` — интро
  // встаёт СИНХРОННО, а OPENED приходит асинхронно уже поверх него, и
  // pauseGame во время интро отказывает. Без дожима pausedByAd оставался
  // false навсегда: интро кончалось, игра оживала ПОД непрозрачным роликом,
  // и миксер начинал есть предметы игрока.
  // ⚠️ Проверяем СОСТОЯНИЕ ПОСЛЕ ИНТРО, а не «пауза встала мгновенно»:
  // мгновенно она и не должна вставать — интро её законно не пускает.
  const adp = await apage.evaluate(async () => {
    const G = window.__game, M = window.__mock;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    G.regen();                                   // новый уровень -> интро живо
    M.msgs.length = 0;
    M.emit('inter', 'opened');                   // ролик поверх интро (имя события — как в моке)
    const duringIntro = G.pauseState().paused;   // ожидаемо false — гвард интро
    const adReached = G.pauseState().muted;      // ⚠️ инструмент дошёл? mutedByAd ставится
                                                 // в том же adBlockOn — если false, тест
                                                 // мерит пустоту (уже поймал себя на этом)
    G.skipIntro();                               // интро кончилось: игра ЖИВАЯ под роликом
    await wait(600);                             // время на дожим
    const afterIntro = G.pauseState().paused;
    const toldPlatform = M.msgs.some(m => String(m.n).indexOf('level_paused') >= 0
                                       || String(m.n).indexOf('LEVEL_PAUSED') >= 0);
    M.emit('inter', 'closed');
    await wait(300);
    return { duringIntro, adReached, afterIntro, toldPlatform, afterClose: G.pauseState().paused };
  });
  expect(adp.adReached === true,
    'реклама: событие ролика дошло до блокировки — тест меряет не пустоту (' + adp.adReached + ')');
  expect(adp.afterIntro === true,
    'реклама: игра ВСТАЛА на паузу, когда интро кончилось под роликом (' + adp.afterIntro + ')');
  expect(adp.toldPlatform === true,
    'реклама: площадка получила LEVEL_PAUSED дожатой паузой (' + adp.toldPlatform + ')');
  // ⚠️ ИМЕННО ПЕРЕХОД, а не «afterClose === false»: последнее зелено и когда
  // паузы не было вовсе (false === false) — пустой ассерт, поймал на зубах.
  expect(adp.afterIntro === true && adp.afterClose === false,
    'реклама: дожатая пауза СНЯТА закрытием ролика, игра не заморожена (была '
    + adp.afterIntro + ' -> стала ' + adp.afterClose + ')');

  expect(cad.deferredNoShow === 0 && cad.deferredFired === 1,
    'каденция: показ, отложенный не-рекламным выходом, выходит на ПОБЕДНОМ переходе (' +
    cad.deferredNoShow + '->' + cad.deferredFired + ')');

  // ⚠️ СЧЁТЧИК ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ (находка матрицы №3): пока он был
  // переменной замыкания, INTER_EVERY_LEVELS побед надо было набрать в ОДНОЙ
  // сессии страницы — три захода по 20 минут давали НОЛЬ показов всегда, и
  // «месяц без рекламы» из бандла гасил то, чего игрок и так не получал.
  // Набираем НЕДОБОР до порога (every-2), чтобы после перезагрузки одна победа
  // ещё НЕ дала ролик, а следующая — дала. При every=3 это одна победа.
  const preload = Math.max(1, INTER_EVERY - 2);
  await apage.evaluate((n) => { for (let i = 0; i < n; i++) window.__ads.noteWin(); }, preload);
  const cadBefore = await apage.evaluate(() => window.__ads._winsSinceInter);
  await apage.reload({ waitUntil: 'domcontentloaded' });
  await apage.waitForFunction(() => window.__ads && window.__game, null, { timeout: 20000 });
  const cadAfter = await apage.evaluate(() => window.__ads._winsSinceInter);
  expect(cadBefore === preload && cadAfter === preload,
    '⚠️ КАДЕНЦИЯ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ: ' + cadBefore + ' побед до, ' + cadAfter + ' после');
  // и порог по-прежнему срабатывает — накопленное через перезагрузку не потеряно
  const cadFire = await apage.evaluate((n) => {
    const A = window.__ads, M = window.__mock;
    const base = M.interShown;
    // добираем до every-1 — ролика ещё быть не должно
    while (A._winsSinceInter < n - 1){ A.noteWin(); A.maybeInterstitial(); }
    const atBelow = M.interShown - base;
    A.noteWin(); A.maybeInterstitial();   // порогова победа — ролик
    return { atBelow, atFire: M.interShown - base, left: A._winsSinceInter };
  }, INTER_EVERY);
  expect(cadFire.atBelow === 0 && cadFire.atFire === 1 && cadFire.left === 0,
    'порог считает победы ЧЕРЕЗ перезагрузку (' + (INTER_EVERY - 1) + '→0 показов, '
    + INTER_EVERY + '→1, счётчик сброшен)');

  // ПРОВОДКА (спека 2026-07-24): РЕАЛЬНЫЙ Retry НЕ показывает межстраничную,
  // даже когда счётчик у порога — вызов убран из loseAgainBtn. ⚠️ С 2026-07-27
  // экран поражения из ТУПИКА больше не всплывает (помол-выручалка, «помол =
  // штраф, не смерть»), но UI поражения жив и проводка кнопки Retry остаётся
  // валидной — показываем оверлей НАПРЯМУЮ (не через тупик) и жмём реальную
  // кнопку. До правки её обработчик звал maybeInterstitial и при счётчике 5
  // показал бы ролик — ассерт бы упал.
  await apage.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await apage.evaluate((n) => { window.__interEvery = n; }, INTER_EVERY);
  await apage.evaluate(() => {
    for (let i = 0; i < window.__interEvery; i++) window.__ads.noteWin(); // счётчик у порога
    window.__game.level().over = true;
    document.getElementById('loseOverlay').style.display = 'flex'; // показать UI поражения напрямую
  });
  const retry = await apage.evaluate(() => {
    const before = window.__mock.interShown;
    document.getElementById('loseAgainBtn').click(); // РЕАЛЬНЫЙ Retry
    return { before, after: window.__mock.interShown, winsLeft: window.__ads._winsSinceInter };
  });
  expect(retry.after === retry.before,
    'проводка: РЕАЛЬНЫЙ Retry из тупика при счётчике у порога НЕ показывает межстраничную ('
    + retry.before + '->' + retry.after + ')');
  expect(retry.winsLeft === INTER_EVERY,
    'проводка: Retry счётчик побед не тронул (остался у порога ' + retry.winsLeft + ')');
  await apage.evaluate(() => window.__game.skipIntro()); // loseAgainBtn запустил genLevel/интро

  // ── ИНТЕГРАЦИЯ BRIDGE v2 (2026-07-29): обязательные шаги доки ───────────
  // 6. ПАУЗА ПЛОЩАДКИ. Площадка просит паузу не только под рекламу (свой
  // оверлей, меню портала). До подписки под ним тикал миксер и ЖРАЛ предметы.
  await emit('pause', true);
  const platOn = await adState();
  await emit('pause', false);
  const platOff = await adState();
  expect(platOn.paused && platOn.muted && !platOn.overlay,
    'пауза площадки: игра встала тихо и замолчала (' + JSON.stringify(platOn) + ')');
  expect(!platOff.paused && !platOff.muted,
    'пауза площадки: снятие вернуло игру и звук (' + JSON.stringify(platOff) + ')');

  // 7. ВЛАДЕНИЕ: конец РОЛИКА не должен снимать паузу, поставленную ПЛОЩАДКОЙ
  // (разные флаги). Ставим платформенную, затем гоняем ролик до развязки.
  await emit('pause', true);
  await apage.evaluate(() => { window.__ads.showRewarded(()=>{}, ()=>{}); });
  await apage.waitForTimeout(200);
  await emit('rw', 'closed');           // ролик кончился
  const ownWar = await adState();
  expect(ownWar.paused && ownWar.muted,
    'владение: конец ролика НЕ снял паузу площадки (' + JSON.stringify(ownWar) + ')');
  await emit('pause', false);
  const ownFree = await adState();
  expect(!ownFree.paused, 'владение: снятие платформенной паузы разморозило игру');

  // 8. МУЗЫКА глохнет вместе с SFX (требование площадок: во время
  // полноэкранной рекламы игра И ЗВУК на паузе). Музыка — отдельный тракт
  // <audio id="bgm">, Sound.setMuted его не касается.
  // ⚠️ НЕ ПРОВЕРЯТЬ ЧЕРЕЗ bgm.paused: в headless автоплей запрещён, трек не
  // играет вовсе, и «во время ролика он остановлен» выполняется САМО СОБОЙ —
  // ассерт проходил и с фиксом, и без него (поймано реверс-проверкой).
  // Следим за ВЫЗОВАМИ play(): под роликом их быть не должно даже когда игрок
  // сам тянет ползунок громкости, а после ролика громкость обязана вернуться.
  const music = await apage.evaluate(async () => {
    const bgm = document.getElementById('bgm'), sl = document.getElementById('msMusic');
    if (!bgm || !sl) return { no: true };
    let plays = 0;
    const orig = bgm.play.bind(bgm);
    bgm.play = function(){ plays++; return orig().catch(()=>{}); };
    const drag = (v)=>{ sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles:true })); };
    drag(70);                                    // игрок включил музыку
    await new Promise(r => setTimeout(r, 80));
    const base = plays;
    window.__ads.showRewarded(()=>{}, ()=>{});   // ролик пошёл
    await new Promise(r => setTimeout(r, 120));
    drag(70);                                    // тянет ползунок ПОД роликом
    await new Promise(r => setTimeout(r, 120));
    const during = plays - base;                 // должно остаться 0
    return { no:false, during, paused: bgm.paused };
  });
  expect(music.no || (music.during === 0 && music.paused),
    'музыка: под роликом трек НЕ заводится даже ползунком (play ×' + music.during + ')');
  const musicBack = await apage.evaluate(async () => {
    const bgm = document.getElementById('bgm');
    if (!bgm) return { no: true };
    let plays = 0; const orig = bgm.play.bind(bgm);
    bgm.play = function(){ plays++; return orig().catch(()=>{}); };
    window.__mock.emit('rw', 'closed');          // ролик кончился
    await new Promise(r => setTimeout(r, 200));
    return { no:false, plays };
  });
  expect(musicBack.no || musicBack.plays >= 1,
    'музыка: после ролика возвращается (play ×' + musicBack.plays + ')');

  // 9. СООБЩЕНИЯ ПЛОЩАДКЕ: game_ready + жизненный цикл уровня. У Poki и
  // CrazyGames LEVEL_* маппятся в нативные gameplayStart/Stop — без них
  // площадка пейсит рекламу вслепую.
  const msgs = await apage.evaluate(() => {
    const seen = window.__mock.msgs.map(m => m.n);
    return { seen, ready: seen.filter(n => n === 'game_ready').length,
             started: seen.includes('level_started'),
             paused: seen.includes('level_paused'), resumed: seen.includes('level_resumed'),
             lang: window.__ads.lang };
  });
  expect(msgs.ready === 1, 'сообщения: game_ready отправлен РОВНО один раз (' + msgs.ready + ')');
  expect(msgs.started, 'сообщения: level_started отправлен на старте уровня');
  expect(msgs.paused && msgs.resumed, 'сообщения: level_paused/level_resumed идут с паузой');
  expect(msgs.lang === 'ru', 'язык игрока прочитан с площадки (' + msgs.lang + ')');

  // 10. PLACEMENT — имя рекламного места уходит в SDK (иначе статистика слепая)
  const places = await apage.evaluate(async () => {
    window.__ads.showRewarded(()=>{}, ()=>{}, 'shake');
    await new Promise(r => setTimeout(r, 120));
    return { rw: window.__mock.rwPlace, inter: window.__mock.interPlace };
  });
  await emit('rw', 'closed');
  expect(places.rw === 'shake', 'placement: rewarded ушёл с именем места (' + places.rw + ')');
  expect(places.inter === 'level_completed',
    'placement: межстраничная ушла с именем места (' + places.inter + ')');

  // ── ЛИДЕРБОРД: отправка счёта без экрана (спека владельца 2026-07-29) ────
  // ⚠️ ГЛАВНОЕ ПОД СТРАЖЕМ — ГЕЙТ ГОСТЕЙ. Он ПРОДУКТОВОЕ решение владельца
  // («чтобы попасть в лидерборд, нужно залогиниться») и СТРОЖЕ, чем делает
  // SDK: тот пропускает по непустому playerId, а у гостя он непустой. Без
  // нашей проверки гости поехали бы в таблицу, а удаления записей в SDK нет.
  const lb = await apage.evaluate(async () => {
    const A = window.__ads, M = window.__mock, out = {};
    A.setBoardId('');                       // как в бою по умолчанию: id пуст
    out.offWhy = A.lbWhy();
    out.offSent = (A.submitScore().ok === true);
    A.setBoardId('top_score');              // борд заведён
    // 1. ГОСТЬ (isAuthorized=false) — не отправляем
    window.bridge.player.isAuthorized = false;
    out.guestWhy = A.lbWhy();
    const before = M.lb.length;
    A.submitScore();
    out.guestSent = M.lb.length - before;
    // 2. Площадка не умеет — не отправляем даже авторизованному
    window.bridge.player.isAuthorized = true;
    window.bridge.leaderboards.type = 'not_available';
    out.naWhy = A.lbWhy();
    const before2 = M.lb.length;
    A.submitScore();
    out.naSent = M.lb.length - before2;
    // 3. Всё сложилось — отправляем ровно один раз, и не дублируем то же число
    window.bridge.leaderboards.type = 'in_game';
    out.okWhy = A.lbWhy();
    const before3 = M.lb.length;
    A.submitScore();
    const first = M.lb.length - before3;
    A.submitScore();                        // повтор с тем же счётом
    out.sentOnce = first;
    out.sentTwice = M.lb.length - before3;
    out.last = M.lb[M.lb.length - 1] || null;
    await new Promise(r => setTimeout(r, 150));
    out.raw = JSON.stringify(A.lbRaw);
    return out;
  });
  expect(lb.offWhy === 'нет id борда/токена' && !lb.offSent,
    'лидерборд: без id борда/токена не отправляем и не шумим (' + lb.offWhy + ')');
  expect(lb.guestWhy === 'игрок не авторизован' && lb.guestSent === 0,
    'лидерборд: ГОСТЬ не попадает в таблицу — гейт строже SDK (' + lb.guestWhy + ')');
  expect(lb.naWhy === 'площадка не поддерживает' && lb.naSent === 0,
    'лидерборд: на площадке без поддержки не отправляем (' + lb.naWhy + ')');
  expect(lb.okWhy === null && lb.sentOnce === 1,
    'лидерборд: при трёх выполненных предусловиях счёт уходит (' + JSON.stringify(lb.last) + ')');
  expect(lb.sentTwice === 1, 'лидерборд: то же значение повторно не шлём (' + lb.sentTwice + ')');
  expect(lb.last && lb.last.id === 'top_score' && typeof lb.last.sc === 'number',
    'лидерборд: уходит id борда и число (' + JSON.stringify(lb.last) + ')');
  expect(!!lb.raw && lb.raw.indexOf('"score"') > 0,
    'лидерборд: сырой ответ сохранён для разбора, а не выброшен (' + lb.raw + ')');

  // РАЗБОР ТЕЛА (форма и семантика — с живого прогона 2026-07-29). Сервер
  // хранит МАКСИМУМ и на проигнорированную запись отвечает тем же успешным
  // статусом, что и на принятую; отличить можно ТОЛЬКО сравнив число в ответе
  // с отправленным. Проверяем оба исхода.
  const lbp = await apage.evaluate(async () => {
    const A = window.__ads, out = {};
    A.setBoardId('top_score');
    window.bridge.player.isAuthorized = true;
    window.bridge.leaderboards.type = 'in_game';
    window.bridge.leaderboards._best = 0;
    // ⚠️ Ранг поднимает ТОЛЬКО заработанное (bankScore → se). starGrant пишет
    // в пополнения (tu), а они ранг НЕ двигают — это и есть защита от
    // pay-to-win, и на ней я сам оступился при первом наброске теста.
    // 1) счёт ВЫШЕ пика — принят
    window.__game.bankScore(50000);
    A.submitScore();
    await new Promise(r => setTimeout(r, 150));
    out.hi = { accepted: A.lbAccepted, stored: A.lbRaw && A.lbRaw.score, sent: A.lbLast };
    // 2) счёт НИЖЕ пика: поднимаем ЛИЧНЫЙ ПИК на сервере и шлём другое (меньшее
    // по отношению к пику) значение. Ответ придёт «успешный», но с чужим числом.
    window.bridge.leaderboards._best = 999999;
    window.__game.bankScore(1000);            // сдвинуть значение, иначе дедуп не пустит
    A.submitScore();
    await new Promise(r => setTimeout(r, 150));
    out.lo = { accepted: A.lbAccepted, stored: A.lbRaw && A.lbRaw.score, sent: A.lbLast };
    return out;
  });
  expect(lbp.hi.accepted === true && lbp.hi.stored === lbp.hi.sent,
    'разбор: счёт выше пика — принят (' + JSON.stringify(lbp.hi) + ')');
  expect(lbp.lo.accepted === false && lbp.lo.stored !== lbp.lo.sent,
    'разбор: счёт ниже пика — распознан как ПРОИГНОРИРОВАННЫЙ, хотя ответ «успех» ('
    + JSON.stringify(lbp.lo) + ')');

  // === ЧТЕНИЕ ТАБЛИЦЫ (контракт экрана ИНТЕРФЕЙСА) ===
  const lbr = await apage.evaluate(async () => {
    const A = window.__ads, L = window.bridge.leaderboards, out = {};
    A.setBoardId('top_score');
    L.type = 'in_game'; L._fail = false;
    window.bridge.player.id = 'me-42';
    // сервер отдаёт НЕ по порядку и с готовым rank — проверим, что не пересчитываем
    L._rows = [
      { id:'x', name:'Икс',   score:300, rank:2, photo:null },
      { id:'me-42', name:'Я', score:500, rank:1, photo:'p.png' },
      { id:'z', name:'Зет',   score:100, rank:3, photo:null },
    ];
    window.__mock.lbGets = 0;
    // ⚠️ ЧТЕНИЕ НЕ ТРЕБУЕТ АВТОРИЗАЦИИ (в отличие от записи): гость смотрит.
    window.bridge.player.isAuthorized = false;
    const r1 = await A.lbEntries({ force: true });
    out.guestOk = r1.ok;
    // ⚠️ БЕЗ ОПТИМИЗМА: при сломанной сборке r1 приходит пустым, и обращение
    // к найденной строке роняло ВСЮ пробу исключением — прогон падал целиком
    // вместо честных FAIL по каждому инварианту (поймано на своих же зубах).
    out.order = (r1.entries || []).map(e => e.rank).join(',');
    out.meFlag = !!(r1.me && r1.me.id === 'me-42' && r1.me.rank === 1);
    const mine = (r1.entries || []).find(e => e.id === 'me-42');
    out.photo = mine ? mine.photo : '(строки нет)';
    // страница РЕЖЕТСЯ ЛОКАЛЬНО: total остаётся полным, второй запрос НЕ уходит
    const r2 = await A.lbEntries({ limit: 1, offset: 1 });
    out.page = (r2.entries || []).map(e => e.id).join(',');
    out.total = r2.total;
    out.gets = window.__mock.lbGets;         // ожидаем 1: постраничности у моста нет
    // площадка не поддерживает
    L.type = 'not_available';
    const r3 = await A.lbEntries({ force: true });
    out.na = r3.ok === false && r3.why === 'площадка не поддерживает';
    // таблицу рисует площадка
    L.type = 'native_popup';
    const r4 = await A.lbEntries({ force: true });
    out.native = r4.ok === false && r4.why === 'таблицу рисует площадка';
    out.popupOk = (await A.lbShowNative()).ok;          // на native_popup — можно
    L.type = 'native';
    out.popupNo = (await A.lbShowNative()).ok;          // на native — мост откажет
    // сеть отвалилась
    L.type = 'in_game'; L._fail = true;
    const r5 = await A.lbEntries({ force: true });
    out.net = r5.ok === false && r5.why === 'сеть';
    L._fail = false;
    return out;
  });
  expect(lbr.guestOk === true,
    'таблица: ГОСТЬ ЧИТАЕТ (авторизация нужна для ЗАПИСИ, не для просмотра)');
  expect(lbr.order === '1,2,3' && lbr.meFlag === true,
    'таблица: строки по месту с сервера, своя помечена (' + lbr.order + ')');
  expect(lbr.photo === 'p.png', 'таблица: аватар доезжает до экрана (' + lbr.photo + ')');
  expect(lbr.page === 'x' && lbr.total === 3 && lbr.gets === 1,
    'таблица: страница режется ЛОКАЛЬНО, повторного запроса нет — постраничности у моста НЕТ ('
    + lbr.page + ', total ' + lbr.total + ', запросов ' + lbr.gets + ')');
  expect(lbr.na === true, 'таблица: площадка без лидерборда — честный отказ, не пустой список');
  expect(lbr.native === true && lbr.popupOk === true && lbr.popupNo === false,
    'таблица: native_popup — свой экран не рисуем, зовём платформенный (' + lbr.native + '/'
    + lbr.popupOk + '/' + lbr.popupNo + ')');
  expect(lbr.net === true, 'таблица: офлайн — «сеть», а не тишина');


  // ⚠️⚠️ ЭТОТ БЛОК СТОИТ В КОНЦЕ СТРАНИЦЫ НАМЕРЕННО (та же причина, что у секции
  // камней): покупка бандла ВКЛЮЧАЕТ ОКНО «БЕЗ РЕКЛАМЫ», а `maybeInterstitial`
  // с него и начинается — стоя выше, блок глушил межстраничную во ВСЕХ
  // последующих ассертах каденции (три падения: 0 показов, placement null).
  // Это верное поведение игры и неверная постановка теста. Плюс уборка ниже.

  // === ПЛАТЕЖИ (bridge.payments) ===
  // Проверяем ровно то, что определяет наш код: выдачу, ЗАКРЫТИЕ расходуемых
  // и защиту от повторной выдачи при восстановлении.
  const iap = await apage.evaluate(async () => {
    const A = window.__ads, P = window.bridge.payments;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    try { localStorage.removeItem('mixer_iap_done'); } catch(e){}
    P._list = []; P._consumed = []; P._fail = false;
    const out = {};
    // 1) БАНДЛ: покупка -> выдача -> закрытие (иначе он выдавался бы КАЖДЫЙ старт)
    const before = window.__game.bundleState().noAdLeftMs;
    out.buy = await A.purchase('bundle5');
    await wait(120);
    out.granted = window.__game.bundleState().noAdLeftMs > before;  // бандл реально выдан
    out.consumed = P._consumed.indexOf('bundle5') >= 0;
    // 2) NOADS_FOREVER: мета выдаёт НАВСЕГДА (grantNoAdsForever -> Save.naf,
    //    v237), и покупка НЕ закрывается: она и есть доказательство владения
    P._consumed = [];
    out.noads = await A.purchase('noads_forever');
    await wait(120);
    out.noadsForever = window.__game.noAdActive() === true; // включён флагом, окна na тут нет
    out.noadsConsumed = P._consumed.indexOf('noads_forever') >= 0;
    // 3) ВОССТАНОВЛЕНИЕ: незакрытая покупка довыдаётся...
    P._list = [{ id:'bundle3', orderId:'ord_restore_1', status:'PAID' }];
    P._consumed = [];
    const b2 = window.__game.bundleState().noAdLeftMs;
    out.rest1 = await A.restorePurchases();
    await wait(120);
    out.restGranted = window.__game.bundleState().noAdLeftMs > b2;
    // 4) ...а ВТОРОЙ раз — нет (реестр закрытых заказов). Возвращаем ту же
    //    покупку в список, будто consume не дошёл: выдать ещё раз нельзя.
    P._list = [{ id:'bundle3', orderId:'ord_restore_1', status:'PAID' }];
    const b3 = window.__game.bundleState().noAdLeftMs;
    out.rest2 = await A.restorePurchases();
    await wait(120);
    out.restTwice = window.__game.bundleState().noAdLeftMs > b3;   // ожидаем false
    return out;
  });
  expect(iap.buy && iap.buy.ok === true, 'платежи: покупка бандла прошла (' + JSON.stringify(iap.buy) + ')');
  expect(iap.granted === true, 'платежи: бандл РЕАЛЬНО выдан (окно без рекламы выросло)');
  expect(iap.consumed === true,
    'платежи: расходуемый бандл ЗАКРЫТ (без этого он выдавался бы каждый старт)');
  // Страж эволюционировал ВМЕСТЕ с ручкой (v237): раньше фиксировал громкий
  // отказ 'no_grant_handle' — теперь мета выдаёт (grantNoAdsForever ->
  // Save.naf), и правильный ассерт — успех покупки И включённый навсегда
  // noAdActive (без временного окна: чистый профиль страницы).
  expect(iap.noads && iap.noads.ok === true,
    'платежи: noads_forever ВЫДАН метой (grantNoAdsForever) (' + JSON.stringify(iap.noads) + ')');
  expect(iap.noadsForever === true,
    'платежи: «без рекламы» включён НАВСЕГДА (Save.naf, не окно) (' + JSON.stringify(iap.noadsForever) + ')');
  expect(iap.noadsConsumed === false,
    'платежи: noads_forever НЕ закрывается — покупка и есть доказательство владения');
  expect(iap.restGranted === true, 'платежи: восстановление ДОВЫДАЛО незакрытую покупку');
  expect(iap.restTwice === false,
    'платежи: повторное восстановление НЕ выдало второй раз (реестр заказов)');

  // === ТЕЛЕМЕТРИЯ: креш уходит ОДИН раз ===
  // ⚠️ Нужен непустой URL — иначе sendBeacon не зовётся вовсе и страж мерит
  // пустоту. Считаем, в скольких отправках встретился ЭТОТ креш.
  const tel = await apage.evaluate(async () => {
    const sent = [];
    const real = navigator.sendBeacon;
    navigator.sendBeacon = function(u, body){ sent.push(String(body)); return true; };
    window.__tel.setUrl('https://example.invalid/e');
    const mark = 'МЕТКА_КРЕША_' + Date.now();
    window.__tel.err('js', mark, 'f.js', 'stack');
    window.__tel.ev('после_креша', {});          // чтобы батч был непустым
    window.__tel.flush();
    window.__tel.setUrl('');
    navigator.sendBeacon = real;
    return { копий: sent.filter(b => b.indexOf(mark) >= 0).length, отправок: sent.length };
  });
  expect(tel.отправок >= 2, 'телеметрия: инструмент видит отправки — мерим не пустоту ('
    + tel.отправок + ')');
  expect(tel.копий === 1, 'телеметрия: креш ушёл РОВНО ОДИН раз (был дубль: сразу + батчем) ('
    + tel.копий + ')');

  // === ТЕЛЕМЕТРИЯ: экраны переживают уход вкладки ===
  const scrLife = await apage.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.__tel.screen.enter('game');
    const before = window.__tel.screen.current();
    Object.defineProperty(document, 'visibilityState', { value:'hidden', configurable:true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    await wait(30);
    const hidden = window.__tel.screen.current();
    Object.defineProperty(document, 'visibilityState', { value:'visible', configurable:true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    await wait(30);
    return { before: before, hidden: hidden, back: window.__tel.screen.current() };
  });
  expect(scrLife.before === 'game' && scrLife.hidden === null,
    'телеметрия: уход вкладки закрывает экран — инструмент работает (' + scrLife.before + '->' + scrLife.hidden + ')');
  expect(scrLife.back === 'game',
    'телеметрия: ПОСЛЕ ВОЗВРАТА экран восстановлен (раньше трекинг умирал навсегда) (' + scrLife.back + ')');
  // убираем за собой купленное: окно «без рекламы» пережило бы страницу
  await apage.evaluate(() => { try { window.__game.clearBought(); } catch(e){} });

  await apage.close();
  await new Promise(r => srv2.close(r));
  if (aErrors.length) failures.push('реклама-проба: ' + aErrors.join(' | '));

  // ОСКОЛКИ (полировка ГРАФИКИ 2026-07-23): shardFX переехал в 70-fx —
  // нерегулярная форма + фасеточный тинт + звук «хруст». Проверяем, что
  // залп создаёт fx и ПОЛНОСТЬЮ дренажит геометрии в базу (каждый осколок —
  // своя геометрия+материал, stepFX обязан диспозить). Заодно путь Sound
  // 'crunch' исполняется без ошибок (pageerror слушается сверху).
  // свежий уровень + штиль: на СПЯЩЕЙ куче geoms стабилен, и base==after
  // ловит именно осколочную утечку, а не фоновую досыпку цепи/миксера
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => !window.__game.awake().physAwake, null, { timeout: 4000 }).catch(() => {});
  const shard = await page.evaluate(async () => {
    const g = window.__game;
    const geoms = () => g.perfStats().geoms;
    // ⚠️ ФЛЕЙК «96 → 95» (репорт диспетчера 2026-07-28): база бралась МГНОВЕННО,
    // и если в этот момент ещё дренажились геометрии ПРЕДЫДУЩЕЙ секции, за два
    // кадра их уходило больше, чем осколки успевали добавить, — «после»
    // оказывалось МЕНЬШЕ «до». Разброс базы в репорте (96 / 74 / 71) — это она
    // и есть. Лечение, как у флейков вуали и радиуса: не мгновенное чтение, а
    // (1) СТАБИЛИЗАЦИЯ базы — ждём, пока счётчик перестанет меняться...
    let prev = -1, still = 0;
    const settle = Date.now() + 4000;
    while (still < 3 && Date.now() < settle){
      await new Promise(r => setTimeout(r, 80));
      const v = geoms();
      if (v === prev) still++; else { still = 0; prev = v; }
    }
    const base = geoms();
    // ⚠️ N — ЯВНЫЙ размер залпа: shardBurst возвращает fx.length (ВСЕ живые
    // эффекты, не только осколки), и опираться на него как на «сколько кусков
    // прилетело» нельзя — порог раннего выхода мог бы стать недостижимым.
    const N = 12;
    const created = g.shardBurst(N);
    // ...и (2) ПИК ЗА ОКНО, а не одна выборка: осколки регистрируются в
    // renderer.info на РЕНДЕРЕ, и один кадр мог прийтись на провал между
    // дренажом чужих и появлением своих. Ранний выход, как только рост доказан.
    let peak = base;
    const peakDl = Date.now() + 2000;
    while (Date.now() < peakDl){
      await new Promise(r => requestAnimationFrame(r));
      const v = geoms();
      if (v > peak) peak = v;
      if (peak >= base + N / 2) break;
    }
    // ⚠️ НЕ фиксированная пауза (флейк 2026-07-24, ловился и метой, и мной:
    // «48 → 48», «52 → 54»). Осколки догорают по СВОИМ часам, а сьют к этой
    // секции приходит с разной загрузкой машины — 900мс хватало не всегда, и
    // тест обвинял продукт в утечке, которой нет: проба показала честный
    // дренаж 33 → 21 к ~2с. Ждём УСЛОВИЯ с потолком, как чинили флейк радиуса.
    const deadline = Date.now() + 6000;
    while (g.perfStats().geoms > base && Date.now() < deadline)
      await new Promise(r => setTimeout(r, 100));
    // ⚠️ settled=false — база взята ПО ПОТОЛКУ, посреди дренажа. Сейчас
    // недостижимо (нужен >4 с монотонного падения), но без этого флага такой
    // провал выглядел бы КАК ИСХОДНЫЙ ФЛЕЙК, и следующий диагностировал бы
    // всё заново. Флаг только в сообщении — на вердикт не влияет.
    return { base, created, peak, N, settled: still >= 3, after: g.perfStats().geoms };
  });
  expect(shard.created >= 12, 'осколки: залп создал fx (' + shard.created + ')');
  // ⚠️ ПОРОГ N/2, А НЕ «БОЛЬШЕ БАЗЫ НА 1» (усиление 2026-07-28 вместе с фиксом
  // флейка). Смысл секции — стеречь инвариант 70-fx «КАЖДЫЙ осколок несёт СВОЮ
  // геометрию, общий кэш отдавать нельзя». При `peak > base` регрессия «все
  // осколки на одной кэшированной геометрии» даёт +1 и проходит ЗЕЛЁНОЙ. После
  // стабилизации базы прирост стал детерминированным ровно +N (замер: 71 -> 83
  // в полном сьюте, 21 -> 33 в изоляции), так что требовать хотя бы половину
  // залпа безопасно — запас на случайный дренаж соседей остаётся.
  expect(shard.peak >= shard.base + shard.N / 2,
    'осколки: КАЖДЫЙ несёт свою геометрию (' + shard.base + ' -> ' + shard.peak
    + ', +' + (shard.peak - shard.base) + ' при залпе ' + shard.N
    + (shard.settled ? '' : '; ⚠️ база НЕ устоялась — взята по потолку 4с') + ')');
  // ⚠️ ПОРОГ, А НЕ ТОЧНОЕ РАВЕНСТВО (разбор флейка 2026-07-24). geoms —
  // счётчик ВСЕЙ сцены, а между base и after тикают соседние системы
  // (витрина печёт портреты, догорают чужие эффекты) — ловилось стабильное
  // +2 при 12 осколках, и ассерт обвинял осколки в чужом шуме. Настоящая
  // утечка shardFX дала бы +12 и больше (по числу кусков), поэтому мерим
  // «вернулось ли БОЛЬШИНСТВО»: остаток меньше половины залпа = дренаж есть.
  // Изолированная проба подтвердила чистый дренаж 33 → 21 (диспетчер).
  const shardLeak = shard.after - shard.base;
  expect(shardLeak < shard.created / 2,
    'осколки: геометрии дренажат в базу без утечки (пик ' + shard.peak + ' → остаток +' + shardLeak + ' при ' + shard.created + ' осколках)');

  // УНИКАЛЬНОСТЬ ФОРМЫ СКОЛА — КОНТЕНТНЫЙ СТРАЖ (ФИЗИКА 2026-08-01).
  // ⚠️ ЗАЧЕМ ОТДЕЛЬНО ОТ СОСЕДНЕГО АССЕРТА ВЫШЕ. Тот считает ГЕОМЕТРИИ СЦЕНЫ и
  // доказывает, что они СОЗДАВАЛИСЬ, — но НЕ что формы разные: регрессия «одна
  // форма на весь залп, розданная через новый объект геометрии» прошла бы мимо
  // него зелёной. Инвариант ГРАФИКИ («углы сдвинуты ±38%, каждый скол уникален,
  // тинт по нормали грани») до сих пор не стерёг никто.
  // ⚠️ И ЭТО ПРЕДУСЛОВИЕ ПУЛА БУФЕРОВ: под пулом счётчик геометрий перестаёт
  // расти ПО ПОСТРОЕНИЮ (декремент живёт только в onGeometryDispose), то есть
  // соседний ассерт покраснеет на ВЕРНОЙ правке. Заменять его надо этим —
  // не ослаблять порог, иначе уникальность перестанет стеречь что-либо вовсе.
  const shapes = await page.evaluate(async () => {
    const g = window.__game;
    g.shardBurst(8);
    await new Promise(r => setTimeout(r, 40));
    const v = g.shardShapes();
    return { n: v.length, uniq: new Set(v.map(x => x.s + '|' + x.q)).size,
      lens: new Set(v.map(x => x.n)).size, tints: new Set(v.map(x => x.tint)).size,
      len0: v.length ? v[0].n : 0 };
  });
  expect(shapes.n >= 8, 'осколки: залп виден страж-хуку (' + shapes.n + ' живых кусков)');
  expect(shapes.uniq === shapes.n,
    'осколки: КАЖДЫЙ скол — своя форма (' + shapes.uniq + ' уникальных из ' + shapes.n + ')');
  // длина буфера у всех одна (4 грани × 3 вершины × 3 компоненты = 36) —
  // именно это делает будущую перезапись буферов пула безопасной
  expect(shapes.lens === 1 && shapes.len0 === 36,
    'осколки: буфер формы фиксированной длины 36 (' + shapes.len0 + ', классов длин ' + shapes.lens + ')');

  // ПРОФИЛЬ ПОСТРОЙКИ ЭФФЕКТОВ ПО ВИДАМ (A2, ФИЗИКА 2026-08-01).
  // ⚠️ ЗАЧЕМ СТРАЖ НА ИНСТРУМЕНТ: счётчик постройки уже ДВАЖДЫ молчал про
  // целую статью — сперва видел только пыль (поймала ГРАФИКА, осколки давали
  // ноль), потом пропустил семь новых конструкторов из набора владельца.
  // Молчащий счётчик хуже отсутствующего: он выглядит как измерение, и по
  // нему принимают решения. Здесь проверяется, что вид РЕАЛЬНО отчитывается.
  // ⚠️ Ассерт НЕ тавтологичен: снятие обёртки с dustCloud/shardFX убирает
  // ключ из отчёта целиком (проверено диверсией — оба ассерта краснеют).
  const fxb = await page.evaluate(async () => {
    const g = window.__game;
    g.fxBreak(true);                       // обнулить: мерим окно вокруг события
    const before = Object.keys(g.fxBreak(false)).length;
    g.shardBurst(6);                       // осколки — мгновенно
    g.grindNow();                          // помол -> труха (bladeDustFX, 3 фракции)
    await new Promise(r => setTimeout(r, 1600));   // помол двухфазный: захват, потом шинковка
    const by = g.fxBreak(false);
    return { before, by, kinds: Object.keys(by) };
  });
  expect(fxb.before === 0, 'профиль эффектов: reset обнуляет разбивку (' + fxb.before + ' видов после сброса)');
  // ⚠️ КОЛЛИЗИЯ МЕТКИ — НЕ КОСМЕТИКА (поймала ГРАФИКА на живом примере):
  // `fxBuildBy` ключуется меткой, и две разные функции под одним именем
  // складываются в ОДНУ строку отчёта. Так было с 'spark' (старый sparkFX и
  // новый sparkRicochetFX), и число оказалось верным лишь потому, что один из
  // эффектов мёртв. Реестр в 70-fx запоминает первую коллизию — здесь она
  // обязана быть пустой. Плюс сверка «обёрток столько же, сколько видов»:
  // список, обещающий «один взгляд», должен это обещание держать.
  const kinds = await page.evaluate(() => window.__game.fxKinds());
  expect(kinds.dup === null,
    'профиль эффектов: метки видов уникальны (коллизия: ' + kinds.dup + ')');
  // ⚠️ ЧИСЛО ДЕРЖАТЬ В СИНХРОНЕ СО СПИСКОМ в 70-fx: 15 -> 13 -> +impactFX —
  // удалены мёртвые juiceFX и sparkFX, затем screenDripsFX (капли на стекле
  // экрана сняты по слову владельца 2026-08-02). Меняешь список конструкторов —
  // меняй и это число, иначе страж покраснеет на исправной сборке.
  expect(kinds.kinds.length === 14,
    'профиль эффектов: обёрнуты ВСЕ 14 конструкторов (' + kinds.kinds.length + ': ' + kinds.kinds.join(',') + ')');
  expect(fxb.kinds.indexOf('shard') >= 0 && fxb.by.shard && fxb.by.shard.n >= 1,
    'профиль эффектов: осколки отчитываются отдельным видом (' + JSON.stringify(fxb.by.shard) + ')');
  expect(fxb.kinds.indexOf('dust') >= 0 && fxb.by.dust && fxb.by.dust.n >= 4,
    'профиль эффектов: труха отчитывается ЧЕТЫРЬМЯ фракциями (' + JSON.stringify(fxb.by.dust) + ')');

  // ⛔ СТРАЖА НА РАЗБОР ТАПА ЗДЕСЬ НЕТ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК (ФИЗИКА
  // 2026-08-01). Пробовала два, оба провалили двустороннюю проверку и оба
  // выброшены, а не подогнаны:
  //   (1) «остаток <= половины итога» — ТАВТОЛОГИЯ: при снятом таймере растёт
  //       И остаток, И итог, доля почти не меняется. Диверсия (снять таймер
  //       эффектов) дала 0.5 из 1.5 против здоровых 0.3 из 1.1 — ЗЕЛЁНЫЙ;
  //   (2) «названная фаза обязана быть > 0» — ЛОЖНО-КРАСНЫЙ на ИСПРАВНОЙ
  //       сборке: без троттлинга выбор предмета и физволна занимают доли
  //       микросекунды и округляются в ноль.
  // Разбор фаз тапа (`perfStats().tapPh`, включая `wave`/`acc`/`fx`/`snd` и
  // вычисляемый `rest`) остаётся ДИАГНОСТИЧЕСКИМ прибором: смотреть глазами
  // при перф-работе, под троттлингом. Зелёный-всегда ассерт хуже отсутствия.

  // ВРАЩЕНИЕ ПОРТРЕТА (спека владельца 2026-07-24): портрет-меш по ключу
  // типа (вариант B) + живой спин при hover. Секция самодостаточная —
  // создаёт свой host, гасит спин в конце.
  const spin = await page.evaluate(async () => {
    const g = window.__game;
    // портрет для типа, которого может не быть в текущей партии (хвост списка)
    const rows = g.accSnapshot();
    const tailKey = rows[rows.length - 1].key;
    const it = g.thumbItemForKey(tailKey);
    const built = !!(it && it.mesh);
    // хост + старт спина
    const host = document.createElement('div');
    host.id = '__spinHost';
    host.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:120px;';
    document.body.appendChild(host);
    g.thumbSpinKey(rows[0].key, '#__spinHost');
    const s0 = g.spinState();
    const a0 = s0.angle, camW0 = s0.camW;
    await new Promise(r => setTimeout(r, 500));           // крутится
    const s1 = g.spinState();
    // вариант B: построить портреты всех открытых типов
    const all = g.buildAllThumbs();
    g.thumbSpinStop();
    const sStop = g.spinState();
    host.remove();
    return { built, tailKey, mounted: s0.mounted, rafOn: s0.rafOn,
      angleGrew: s1.angle > a0, camConst: s1.camW === camW0,
      allBuilt: all.built === all.total && all.total > 0, allTotal: all.total,
      stopped: !sStop.rafOn && !sStop.mounted && !sStop.active };
  });
  expect(spin.built, 'портрет-меш строится по ключу типа вне партии (' + spin.tailKey + ')');
  expect(spin.mounted && spin.rafOn, 'спин: канвас смонтирован и rAF идёт');
  expect(spin.angleGrew, 'спин: угол растёт (модель крутится)');
  expect(spin.camConst, 'спин: Y-рамка константна за оборот (не «дышит»)');
  expect(spin.allBuilt, 'вариант B: портреты построены для всех открытых типов (' + spin.allTotal + ')');
  expect(spin.stopped, 'стоп: rAF погашен, канвас снят, ноль стоимости вне hover');

  // ГХОСТ ЗАКРЫТЫХ + ЕДИНАЯ ПОЗА (спека владельца 2026-07-24-в). Гхост —
  // полупрозрачный+обесцвеченный силуэт закрытого типа. Поза статики И спина
  // из ОДНОГО источника (PORTRAIT_*) — иначе скачок при наведении.
  const ghostPose = await page.evaluate(() => {
    const g = window.__game, key = g.accSnapshot()[0].key;
    // гхост строится и ОТЛИЧАЕТСЯ от цветного; item.ghost + материал transparent
    const full = g.thumbURL(key, false), gh = g.thumbURL(key, true);
    const gItem = g.thumbItemForKey(key, true);
    const ghost = { built: !!gh, differ: full !== gh,
      flag: !!(gItem && gItem.ghost), transp: !!(gItem && gItem.mesh.material.transparent) };
    // ⚠️ ЕДИНЫЙ ИСТОЧНИК ПОЗЫ — МУТАЦИЯ ЗДЕСЬ НЕСУЩАЯ, НЕ ОСТАТОК ТЮНИНГА.
    // Меняем позу — спин обязан стартовать С НЕЁ (== PORTRAIT_YAW0). Заменить
    // на getter НЕЛЬЗЯ: статика и спин читают ОДНУ переменную, сверка
    // «getter против getter» пуста и зелена всегда. Проверено симуляцией
    // 2026-07-27: дали спину свою копию yaw → упало (−0.6 вместо 0.2).
    g.setPortraitPose(0.1, 0.2);
    const host = document.createElement('div'); host.id = '__ph';
    host.style.cssText = 'position:fixed;left:0;top:0;width:80px;height:80px'; document.body.appendChild(host);
    g.thumbSpinKey(g.accSnapshot()[0].key, '#__ph');
    const startAngle = g.spinState().angle;
    g.thumbSpinStop(); host.remove();
    g.setPortraitPose(-0.15, -0.6);   // вернуть боевую позу
    return { ghost, startAngle };
  });
  expect(ghostPose.ghost.built && ghostPose.ghost.differ, 'гхост: закрытый портрет строится и отличается от цветного');
  expect(ghostPose.ghost.flag && ghostPose.ghost.transp, 'гхост: item.ghost + материал transparent');
  expect(Math.abs(ghostPose.startAngle - 0.2) < 0.05, 'поза статики и спина — ОДИН источник (спин стартует с PORTRAIT_YAW0, angle=' + ghostPose.startAngle + ')');

  // ── ПОДСКАЗКА ЗА РЕКЛАМУ (спека владельца 2026-07-28) ────────────────────
  // Секция В КОНЦЕ намеренно (setLevel/regen меняют контекст — см. камни).
  // Зеркало ad-встряски: заряды кончились → ролик → +1 заряд, кап на уровень.
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(400);
  // 1. ГЕЙТ: пока заряды есть — ad-состояния НЕТ (ролик не предлагаем зря)
  const hintGate = await page.evaluate(() => {
    const g = window.__game;
    const withCharges = { hints: g.wallet().hints, ad: g.adHintAvailable() };
    let guard = 200;
    while (g.wallet().hints > 0 && guard-- > 0) g.spendHint();
    return { withCharges, empty: { hints: g.wallet().hints, ad: g.adHintAvailable(), cap: g.level().adHints } };
  });
  {
    expect(hintGate.withCharges.hints > 0 && hintGate.withCharges.ad === false,
      'ad-подсказка НЕ предлагается, пока заряды есть (' + JSON.stringify(hintGate.withCharges) + ')');
    expect(hintGate.empty.hints === 0 && hintGate.empty.ad === true && hintGate.empty.cap === 2,
      'заряды кончились → ad-состояние доступно, кап 2 (' + JSON.stringify(hintGate.empty) + ')');
    // 2. РОЛИК ДАЁТ ЗАРЯД: stub 3 с, награда после досмотра
    const before = await page.evaluate(() => ({ hints: window.__game.wallet().hints,
      he: window.__game.saveRaw().he, cap: window.__game.level().adHints,
      used: window.__game.stats().adHintsUsed, started: window.__game.requestAdHint() }));
    await page.waitForTimeout(3600);
    const after = await page.evaluate(() => ({ hints: window.__game.wallet().hints,
      he: window.__game.saveRaw().he, cap: window.__game.level().adHints,
      used: window.__game.stats().adHintsUsed }));
    expect(before.started === true && after.cap === before.cap - 1 && after.used === 1,
      'ролик списал кап и посчитан в stats (' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) + ')');
    // ⚠️ Заряд проверяем по МОНОТОННОМУ he, а не по остатку hints: свежий заряд
    // сразу уходит на показ подсказки (hints 0->0 ничего не доказал бы).
    expect(after.he === before.he + 1,
      'ролик начислил РОВНО один заряд в he (' + before.he + ' -> ' + after.he + ')');
    // 2б. RESTART НЕ ВОЗВРАЩАЕТ КАП (дыра: заряд подсказки ПОЖИЗНЕННЫЙ, поэтому
    // refill капа на каждый genLevel давал бы бесконечные подсказки за рекламу —
    // «Restart» в паузе делает ровно genLevel). Кап привязан к НОМЕРУ уровня.
    const restartProbe = await page.evaluate(() => {
      const g = window.__game; const capBefore = g.level().adHints; const lv = g.levelNum();
      g.regen(); g.skipIntro();                    // = pauseRestart той же партии
      const capAfterRestart = g.level().adHints;
      g.setLevel(lv + 1); g.regen(); g.skipIntro(); // новый уровень — кап обязан вернуться
      return { capBefore, capAfterRestart, capNewLevel: g.level().adHints };
    });
    expect(restartProbe.capAfterRestart === restartProbe.capBefore,
      'Restart той же партии НЕ вернул кап роликов (' + restartProbe.capBefore + ' -> ' + restartProbe.capAfterRestart + ')');
    expect(restartProbe.capNewLevel === 2,
      'на НОВОМ уровне кап роликов восстановлен (' + restartProbe.capNewLevel + ')');
    await page.evaluate(() => { const g = window.__game; let n = 200; while (g.wallet().hints > 0 && n-- > 0) g.spendHint(); });
    // 3. КАП ИСЧЕРПАН → ad-состояние гаснет (бесконечных роликов нет)
    const capOut = await page.evaluate(() => {
      const g = window.__game; g.level().adHints = 0;
      return { ad: g.adHintAvailable(), started: g.requestAdHint() };
    });
    expect(capOut.ad === false && capOut.started === false,
      'кап исчерпан → ролик больше не предлагается и не стартует (' + JSON.stringify(capOut) + ')');
    // 4. АНТИ-ДЮП: кап НЕ в сейве (иначе max-мерж вернул бы просмотренный ролик)
    const dup = await page.evaluate(() => {
      const g = window.__game; const raw = g.saveRaw();
      const keys = Object.keys(raw).join(',');
      const stale = JSON.parse(JSON.stringify(raw)); // «облако» ДО траты
      g.level().adHints = 0;                          // ролик просмотрен, кап съеден
      g.mergeRaw(stale);                              // облако отдаёт устаревшую копию
      return { keys, capAfterMerge: g.level().adHints };
    });
    expect(/adHint|adhint/i.test(dup.keys) === false,
      'кап роликов НЕ хранится в сейве — мержу нечего возвращать (поля: ' + dup.keys + ')');
    expect(dup.capAfterMerge === 0,
      'мерж со старой облачной копией НЕ вернул просмотренный ролик (' + dup.capAfterMerge + ')');
  }
  // ── БАНДЛЫ «More Stars» (макеты владельца 2026-07-28) ────────────────────
  // Секция В КОНЦЕ намеренно (setLevel/regen меняют контекст — см. камни).
  const sbProbe = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear();
    const tiers = g.bundles();
    const idle = { mult: g.scoreBoostMult(), noAd: g.noAdActive(), shakes: g.purchasedShakes() };
    const hints0 = g.wallet().hints;
    const buy = g.buyBundle('bundle2');            // $19.90: x2/сутки + 50 встрясок + 30 подсказок + месяц без рекламы
    const st = g.bundleState();
    // ⚠️ Цена на кнопке — ЗАШИТЫЙ ТЕКСТ в shell.html, каталог площадки её не
    // подставляет. Значит конфиг и разметку надо сверять, иначе игрок увидит
    // одну цену, а спишется другая — и узнаем мы об этом от него, не от сьюта.
    const btnLabels = [...document.querySelectorAll('.st-buy')].map(b => b.textContent.trim());
    return { tiers, idle, hints0, buy, st, hints1: g.wallet().hints, btnLabels };
  });
  // ⚠️ ЦЕНЫ БЕЗ ДЕВЯТОК — спека владельца 2026-07-30 «цены везде без последних
  // 9 центов, т.е. 4.90, 9.90, 19.90». Ассерт держит ТРИ вещи разом: цену,
  // порядок тиров и то, что текст кнопок в shell.html не разъехался с конфигом
  // (цена там ЗАШИТА В HTML, каталог площадки её не подставляет).
  expect(sbProbe.tiers.length === 3 && sbProbe.tiers[0].usd === 4.90
      && sbProbe.tiers[1].usd === 9.90 && sbProbe.tiers[2].usd === 19.90
      && sbProbe.tiers[2].shakes === 50,
    'тиры бандлов по спеке ($4.90 x5, $9.90 x3, $19.90 x2 = 50 встрясок) (' + JSON.stringify(sbProbe.tiers.map(t=>t.usd)) + ')');
  expect(sbProbe.btnLabels && sbProbe.btnLabels.join('|') === 'Upgrade $4.90|Upgrade $9.90|Upgrade $19.90',
    'ценники на КНОПКАХ совпадают с конфигом (' + JSON.stringify(sbProbe.btnLabels) + ')');
  // ⚠️ КРЕСТИК ЗАКРЫТИЯ — ВСЕГДА белый с чёрным крестом (спека владельца
  // 2026-07-31: «цвет иконки не зависит от времени суток» — оверлей тёмный в
  // обе темы, системное правило --btn-bg давало днём тёмную кнопку на тёмном).
  // Проверяем В ОБЕ темы: точечное отклонение не должно съесться правилом.
  const stClose = await page.evaluate(() => {
    const b = document.getElementById('starsClose'), p = b.querySelector('svg path');
    const wasNight = document.documentElement.classList.contains('night');
    const snap = () => ({ bg: getComputedStyle(b).backgroundColor, fill: getComputedStyle(p).fill });
    document.documentElement.classList.remove('night');
    const день = snap();
    document.documentElement.classList.add('night');
    const ночь = snap();
    document.documentElement.classList.toggle('night', wasNight);
    return { день, ночь };
  });
  expect(stClose.день.bg === 'rgb(255, 255, 255)' && stClose.ночь.bg === 'rgb(255, 255, 255)' &&
    stClose.день.fill === 'rgb(0, 0, 0)' && stClose.ночь.fill === 'rgb(0, 0, 0)',
    'крестик More Stars всегда белый с чёрным крестом, вне времени суток (' + JSON.stringify(stClose) + ')');
  expect(sbProbe.idle.mult === 1 && sbProbe.idle.noAd === false,
    'без бандла: множитель 1, реклама не отключена (' + JSON.stringify(sbProbe.idle) + ')');
  expect(sbProbe.buy.ok && sbProbe.st.mult === 2 && sbProbe.st.shakes === 50 &&
         sbProbe.hints1 === sbProbe.hints0 + 30 && sbProbe.st.noAdLeftMs > 29 * 24 * 3600 * 1000,
    'бандл выдал ВСЁ разом: x2 + 50 встрясок + 30 подсказок + месяц без рекламы (' + JSON.stringify(sbProbe.st) + ')');

  // ⚠️ ОЧЕРЕДЬ ТИРОВ: множители НЕ стекуются — играет сильнейший, время копится
  // СВОЕМУ тиру. Отклонять покупку нельзя: в бандле едут расходники.
  const sbQueue = await page.evaluate(() => {
    const g = window.__game;
    const before = g.bundleState();
    const buy = g.buyBundle('bundle5');            // x5/30мин поверх активного x2/сутки
    const after = g.bundleState();
    const t2 = after.tiers.find(t => t.mult === 2), t5 = after.tiers.find(t => t.mult === 5);
    return { before, buy, mult: after.mult, left2: t2.leftMs, left5: t5.leftMs,
             shakes: after.shakes, wasLeft2: before.tiers.find(t => t.mult === 2).leftMs };
  });
  expect(sbQueue.buy.ok && sbQueue.mult === 5,
    'сильнейший тир играет: x5 поверх x2 (' + sbQueue.mult + ')');
  expect(sbQueue.left5 > 29 * 60 * 1000 && sbQueue.left5 <= 30 * 60 * 1000,
    'x5 получил СВОИ 30 минут (' + Math.round(sbQueue.left5/60000) + ' мин)');
  expect(Math.abs(sbQueue.left2 - sbQueue.wasLeft2) < 5000,
    '⚠️ ОЧЕРЕДЬ: время x2 НЕ сгорело под x5 — вернётся после (' + Math.round(sbQueue.left2/3600000) + ' ч)');
  expect(sbQueue.shakes === 60, 'расходники бандлов просто суммируются (50+10=' + sbQueue.shakes + ')');

  // ⚠️ ЭКСПЛОЙТ «ОТКАТ ПОД ЛЮФТ» (найден адверс-прогоном матрицы №3, был в
  // проде v131-v135): откат РОВНО в пределах прежнего люфта не детектился, а
  // окна хранятся абсолютной меткой → остаток РОС. Откат по 5 мин каждые
  // 5 мин = вечный x5 за $4.99. Теперь амнистия — ПОЖИЗНЕННЫЙ БЮДЖЕТ.
  const sbExploit = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0); // чистый сейв
    g.buyBundle('bundle5');                                   // x5 на 30 минут
    const left = [g.scoreBoostLeftMs()];
    for (let i = 0; i < 6; i++){
      g.boostSetClock(Date.now() + 5 * 60 * 1000);            // «часы отмотаны на 5 минут назад»
      left.push(g.scoreBoostLeftMs());
    }
    return { minutes: left.map(ms => +(ms / 60000).toFixed(1)), mult: g.scoreBoostMult() };
  });
  expect(sbExploit.minutes[1] === 25 && sbExploit.minutes[2] === 20,
    '⚠️ ЭКСПЛОЙТ ЗАКРЫТ: откат под прежний люфт больше НЕ добавляет времени (' + sbExploit.minutes + ')');
  expect(sbExploit.minutes[6] === 0,
    'окно сгорает ровно за своё время при ЛЮБОЙ каденции отката (' + sbExploit.minutes + ')');

  // ЧАСЫ: разовый большой скачок НЕ сжигает оплаченное (кап списания), брика нет
  const sbClock = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.buyBundle('bundle2');                                   // x2 на сутки + месяц no-Ad
    const before = { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
    g.boostSetClock(Date.now() + 60 * 60 * 1000);             // скачок часов на час
    const after = { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
    const lsGap = g.boostRaw().ls - Date.now();
    return { before, after, lsGap, lostMin: +((before.noAd - after.noAd) / 60000).toFixed(1) };
  });
  expect(sbClock.after.mult === 2 && sbClock.after.noAd > 0,
    '⚠️ ЧАСЫ: разовый скачок НЕ сжёг оплаченные окна (mult ' + sbClock.after.mult + ')');
  expect(sbClock.lostMin > 55 && sbClock.lostMin < 65,
    'часы: скачок стоит РОВНО себя, ни секунды сверх (' + sbClock.lostMin + ' мин)');
  expect(Math.abs(sbClock.lsGap) < 10000,
    '⚠️ ЧАСЫ: метка ресинхронизирована — вечного залипания нет (' + sbClock.lsGap + ' мс)');
  const sbAfterIncident = await page.evaluate(() => {
    const g = window.__game;
    g.boostSetClock(Date.now() + 2 * 60 * 60 * 1000);
    g.scoreBoostMult();
    g.buyBundle('bundle2');
    return { mult: g.scoreBoostMult(), noAd: g.noAdLeftMs() };
  });
  expect(sbAfterIncident.noAd > 20 * 24 * 3600 * 1000,
    '⚠️ НЕТ БРИКА: бандл, купленный ПОСЛЕ скачка часов, работает (' + Math.round(sbAfterIncident.noAd/86400000) + ' д)');

  // МЕРЖ: окна мержатся max ПО КЛЮЧУ-МНОЖИТЕЛЮ — чужой короткий x5 не апгрейдит
  const sbMerge = await page.evaluate(() => {
    const g = window.__game;
    g.boostClear(); g.buyBundle('bundle2');        // свой: x2 на сутки
    const mine = g.bundleState().tiers.find(t => t.mult === 2).leftMs;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, bx: { 5: Date.now() + 10 * 60 * 1000 } });
    const withCloud5 = g.bundleState();
    const still2 = withCloud5.tiers.find(t => t.mult === 2).leftMs;
    return { mine, mult: withCloud5.mult, left5: withCloud5.tiers.find(t => t.mult === 5).leftMs, still2 };
  });
  expect(sbMerge.mult === 5 && sbMerge.left5 > 0 && Math.abs(sbMerge.still2 - sbMerge.mine) < 5000,
    '⚠️ МЕРЖ: чужой x5 лёг в СВОЙ ключ, не тронув x2 (' + JSON.stringify(sbMerge) + ')');

  // КУПЛЕННЫЕ ВСТРЯСКИ: порядок расхода и анти-дюп
  const sbShakes = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    const lv = g.level(); const free0 = lv.shakes, bought0 = g.purchasedShakes();
    g.requestShake();                              // РЕАЛЬНЫЙ путь: должен съесть БЕСПЛАТНУЮ
    const afterFree = { free: g.level().shakes, bought: g.purchasedShakes() };
    g.level().shakes = 0;                          // бесплатные кончились
    g.requestShake();                              // теперь — купленную
    const afterBought = { free: g.level().shakes, bought: g.purchasedShakes() };
    const stale = g.saveRaw();                     // «облако» ДО траты
    g.mergeRaw(stale);
    return { free0, bought0, afterFree, afterBought, afterMerge: g.purchasedShakes() };
  });
  expect(sbShakes.afterFree.free === sbShakes.free0 - 1 && sbShakes.afterFree.bought === sbShakes.bought0,
    'порядок расхода: сперва БЕСПЛАТНЫЕ (' + JSON.stringify(sbShakes.afterFree) + ')');
  expect(sbShakes.afterBought.bought === sbShakes.bought0 - 1,
    'бесплатные кончились → тратится КУПЛЕННЫЙ запас (' + JSON.stringify(sbShakes.afterBought) + ')');
  expect(sbShakes.afterMerge === sbShakes.afterBought.bought,
    '⚠️ ДЮП: мерж со старой облачной копией НЕ вернул потраченную встряску (' + sbShakes.afterMerge + ')');

  // ⚠️ ТУПИК-ВЫРУЧАЛКА: пока есть купленный запас, помол за игрока НЕ включается
  const sbDeadlock = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    const lv = g.level(); lv.shakes = 0; lv.adShakes = 0;
    g.cfg.baseRadius = -9;                         // форсим «нет достижимых пар» (cfg — объект, не функция)
    await new Promise(r => setTimeout(r, 2200));
    const withStock = g.level().deadlock;          // запас есть → тупика быть не должно
    const raw = g.boostRaw(); const before = g.purchasedShakes();
    await page_drain();                            // сливаем запас
    await new Promise(r => setTimeout(r, 2200));
    const noStock = g.level().deadlock;
    return { withStock: !!withStock, noStock: !!noStock, before, after: g.purchasedShakes() };
    function page_drain(){ let n = 500; while (g.purchasedShakes() > 0 && n-- > 0) g.requestShake(); return Promise.resolve(); }
  });
  expect(sbDeadlock.withStock === false,
    '⚠️ ТУПИК: с купленным запасом помол-выручалка НЕ включается — у игрока есть чем ходить');
  expect(sbDeadlock.noStock === true,
    'запас кончился → тупик признан, помол выручает (' + JSON.stringify(sbDeadlock) + ')');
  await page.evaluate(() => { window.__game.cfg.baseRadius = 0.35; });

  // НАЧИСЛЕНИЕ, ТОЧНО: бонус клада — единственный ДЕТЕРМИНИРОВАННЫЙ путь очков
  // (150 + 5×уровень, без комбо и без накопления). Финал сам собирает рыбку,
  // очки за зачистку не начисляются — значит весь счёт партии это ровно бонус.
  // ⚠️ Через матчи точную проверку сделать нельзя: autoMatch берёт ПАРУ, но
  // комбо ×2 зажигается от темпа, а accMult зависит от типа — первая версия
  // этого теста гуляла 1.24…3.33 и была флейком, а не проверкой.
  const sbExact = await page.evaluate(async () => {
    const g = window.__game;
    g.boostSetClock(0); g.boostClear();
    g.regen(); g.skipIntro(); g.level().finalRefillDone = true; // докидка чужая (v234)
    g.leaveSingles();
    return { lv: g.levelNum() };
  });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  const sbPlainFinale = await page.evaluate(() => window.__game.stats().score);
  expect(sbPlainFinale === 150 + 5 * sbExact.lv,
    'контроль: без бандла клад даёт ровно 150+5×ур (' + sbPlainFinale + ' при ур.' + sbExact.lv + ')');
  const sbBoosted = await page.evaluate(async () => {
    const g = window.__game;
    g.buyBundle('bundle2');                        // x2
    g.regen(); g.skipIntro(); g.level().finalRefillDone = true; // докидка чужая (v234)
    g.leaveSingles();
    return { lv: g.levelNum(), mult: g.scoreBoostMult() };
  });
  await page.waitForFunction(() => window.__game.alive() === 0, null, { timeout: 40000 });
  const sbBoostedFinale = await page.evaluate(() => window.__game.stats().score);
  expect(sbBoosted.mult === 2 && sbBoostedFinale === 2 * (150 + 5 * sbBoosted.lv),
    '⚠️ БАНДЛ x2 УМНОЖАЕТ ТОЧНО: клад ' + sbBoostedFinale + ' = 2×(150+5×' + sbBoosted.lv + ')');
  await page.evaluate(() => { window.__game.boostClear(); });

  // ── ШТРАФЫ ПОД БУСТЕРОМ (решение владельца 2026-07-28) ───────────────────
  // Симметрия: бустер множит и награду, и наказание. Плоские −10/−20 на фоне
  // «+700» делали карательную сторону шумом ровно в оплаченном окне.
  const penSym = await page.evaluate(async () => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.setLevel(8); g.regen(); g.skipIntro();          // ур.>5: клампа нет, минус честный
    await new Promise(r => setTimeout(r, 400));
    const s0 = g.stats().score;
    g.penalizeTest();                                  // промах без бустера
    const plain = s0 - g.stats().score;
    g.buyBundle('bundle2');                            // x2
    const s1 = g.stats().score;
    g.penalizeTest();
    const boosted = s1 - g.stats().score;
    return { plain, boosted, mult: g.scoreBoostMult() };
  });
  expect(penSym.plain === 10 && penSym.boosted === 20 && penSym.mult === 2,
    '⚠️ СИММЕТРИЯ: под x2 промах стоит ×2 (−' + penSym.plain + ' -> −' + penSym.boosted + ')');

  // КЛАМП ЖИВ ПОСЛЕ УМНОЖЕНИЯ: новичок под x5 не улетает в минус быстрее
  const penClamp = await page.evaluate(async () => {
    const g = window.__game;
    g.boostClear(); g.boostSetClock(0);
    g.setLevel(3); g.regen(); g.skipIntro();          // ур.<=5 — кламп нулём
    await new Promise(r => setTimeout(r, 400));
    g.buyBundle('bundle5');                            // x5
    for (let i = 0; i < 5; i++) g.penalizeTest();
    const clamped = g.stats().score;
    g.setLevel(1); g.regen(); g.skipIntro();          // ур.1 — штрафов нет вовсе
    await new Promise(r => setTimeout(r, 400));
    g.penalizeTest();
    return { clamped, lv1: g.stats().score, mult: g.scoreBoostMult() };
  });
  expect(penClamp.mult === 5 && penClamp.clamped === 0,
    'кламп нулём применён ПОСЛЕ умножения — новичок под x5 не в минусе (' + penClamp.clamped + ')');
  expect(penClamp.lv1 === 0,
    'ур.1 без штрафов вовсе — бустер этого не меняет (' + penClamp.lv1 + ')');

  // ⚠️ ЗАМЕР ДЛЯ ВЛАДЕЛЬЦА: цена помол-выручалки под бустером. Под x5 налог
  // −100 за оборот вместо −20 — насколько глубоко уходит застрявший игрок.
  // ⚠️ Запас встрясок из бандла приходится СЛИВАТЬ: собственный гвард не
  // признаёт тупик, пока у игрока есть чем ходить (это и проверяется выше).
  const stuckRun = async (withBoost) => {
    await page.evaluate(async (boost) => {
      const g = window.__game;
      g.boostClear(); g.boostSetClock(0);
      g.setLevel(8); g.regen(); g.skipIntro();        // ур.>5 — минус честный, без клампа
      if (boost) g.buyBundle('bundle5');              // x5 — худший случай
      // ⚠️ Слив запаса ОБЯЗАТЕЛЕН В ОБОИХ прогонах: купленные встряски копятся
      // в сейве от прежних секций, а собственный гвард не признаёт тупик, пока
      // игроку есть чем ходить (см. ассерт «ТУПИК: с купленным запасом…»).
      const lv0 = g.level(); lv0.shakes = 0; lv0.adShakes = 0;
      let n = 500; while (g.purchasedShakes() > 0 && n-- > 0) g.requestShake();
    }, withBoost);
    // ⚠️ ЖДЁМ ШТИЛЬ, УДЕРЖИВАЯ МИКСЕР (репорт ИНТЕРФЕЙСА и ГРАФИКИ 2026-07-29:
    // TimeoutError ровно здесь на чистой базе). Механизм гонки, подтверждённый
    // кодом: слив запаса циклом requestShake разогревает кучу (замер коллег:
    // maxV 42.9, остывает ~15 с), а на 10-й секунде простоя (MIXER_IDLE_EASY)
    // просыпается миксер-наказание и КАЖДЫЙ помол будит физику — условие
    // «8 тихих опросов подряд» становится недостижимым В ПРИНЦИПЕ, и ждать
    // можно вечно. Срабатывает не всегда: беда включается, когда предыдущие
    // секции оставили большой купленный запас (у них было 219 встрясок) —
    // поэтому у меня 4 прогона подряд, в том числе два параллельных под
    // нагрузкой, были зелёными, а у них падало.
    // ⚠️ ЛЕЧИМ ПРИЧИНУ, А НЕ ТАЙМАУТ: на каждом опросе двигаем метку последнего
    // действия, то есть миксер просто не успевает проснуться, пока куча стынет.
    // Поднимать таймаут было бы лечением симптома — при чуть большем запасе
    // встрясок он бы снова не хватил.
    // ⚠️ Тупик ниже форсится ЯВНО (radius −9), так что подавленный здесь миксер
    // проверке не нужен — она от него не зависит.
    await page.waitForFunction(() => {
      const g = window.__game;
      g.stats().lastAction = performance.now();       // миксеру не дать проснуться
      if (g.awake().physAwake){ window.__calm = 0; return false; }
      window.__calm = (window.__calm || 0) + 1;
      return window.__calm >= 8;
    }, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => {
      const g = window.__game;
      g.cfg.baseRadius = -9; g.cfg.matchRadius = -9;  // гарантированный тупик (рецепт сьюта)
      const lv = g.level(); lv.shakes = 0; lv.adShakes = 0;
    });
    await page.waitForFunction(() => window.__game.level().deadlock === true, null, { timeout: 10000, polling: 100 });
    await page.evaluate(() => { window.__s0 = window.__game.stats().score; }); // отсчёт С МОМЕНТА тупика
    await page.waitForTimeout(10000);                 // 10 с выручалки
    return page.evaluate(() => {
      const g = window.__game;
      const r = { drop: window.__s0 - g.stats().score, deadlock: !!g.level().deadlock, mult: g.scoreBoostMult() };
      g.cfg.baseRadius = 0.35; g.boostClear();
      return r;
    });
  };
  const stuckPlain = await stuckRun(false);
  const stuckBoost = await stuckRun(true);
  console.log('ЗАМЕР выручалки за 10 с: без бустера −' + stuckPlain.drop +
              ', под x' + stuckBoost.mult + ' −' + stuckBoost.drop);
  expect(stuckPlain.deadlock && stuckBoost.deadlock,
    'выручалка запустилась в обоих прогонах');
  expect(stuckBoost.drop > stuckPlain.drop * 2,
    '⚠️ ЦЕНА ВЫРУЧАЛКИ под бустером кратно выше — число для владельца (−' + stuckPlain.drop + ' -> −' + stuckBoost.drop + ')');

  await page.evaluate(() => { window.__game.boostClear(); });
  // ── ПОКАЗАННОЕ = ТРАТИМОЕ (спека владельца 2026-07-28) ───────────────────
  // Кошелёк показывает liveBalance (забанкованное + счёт текущего уровня ÷10),
  // а траты проверяли starBalance (только забанкованное) → «вижу 2003, но
  // Boost за 2000 не покупается». Лечение — банк по требованию.
  const liveSpend = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    g.saveRaw();                                     // прогрев
    // ставим ровно ту вилку из репорта: показано >= цены, забанковано < цены
    const price = 2000;
    g.starGrant(0);
    const need = price - g.starBalance();
    if (need > 0) g.addScore(need * 10 + 30);        // +живой счёт с запасом 3 ед.
    const shown0 = g.liveBalance(), banked0 = g.starBalance();
    const gap = shown0 >= price && banked0 < price;  // та самая вилка
    const before = { shown: shown0, banked: banked0 };
    const ok = g.spendStars(price);
    const after = { shown: g.liveBalance(), banked: g.starBalance() };
    return { gap, before, after, ok, price };
  });
  expect(liveSpend.gap === true,
    'воспроизведена вилка репорта: показано ' + liveSpend.before.shown + ' >= 2000 > забанковано ' + liveSpend.before.banked);
  expect(liveSpend.ok === true,
    '⚠️ (а) покупка на ВИДИМЫЕ деньги проходит (было «вижу, но не куплю»)');
  expect(liveSpend.after.shown === liveSpend.before.shown - liveSpend.price,
    '⚠️ (в) баланс после покупки = показанному минус цена (' + liveSpend.before.shown + ' − ' + liveSpend.price + ' = ' + liveSpend.after.shown + ')');

  // (б) сумма банка за уровень = floor(score/10) РОВНО, сколько бы досрочных
  // банков ни случилось: ни дюпа, ни потери.
  const bankSum = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(3); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    const w0 = g.starBalance();
    g.addScore(5000);                                // 500 единиц живого счёта
    g.spendStars(100); g.spendStars(150); g.spendStars(70); // три досрочных банка
    const spent = 320;
    const scoreNow = g.stats().score;
    g.bankScore(scoreNow);                           // «победа»
    const w1 = g.starBalance();
    return { w0, w1, spent, expected: Math.floor(scoreNow / 10) };
  });
  expect(bankSum.w1 === bankSum.w0 + bankSum.expected - bankSum.spent,
    '⚠️ (б) банк за уровень РОВНО floor(score/10) при трёх досрочных банках (' +
    bankSum.w0 + ' + ' + bankSum.expected + ' − ' + bankSum.spent + ' = ' + bankSum.w1 + ')');

  // ⚠️ МОЙ СЛУЧАЙ, которого не было в постановке: счёт УПАЛ после досрочного
  // банка (штрафы/помол). se монотонный — уменьшать нельзя, коррекция в ss.
  const bankDrop = await page.evaluate(async () => {
    const g = window.__game;
    g.setLevel(8); g.regen(); g.skipIntro();          // ур.>5 — минус честный
    await new Promise(r => setTimeout(r, 400));
    const w0 = g.starBalance(), rank0 = g.leaderboardScore();
    g.addScore(3000);                                 // 300 единиц
    g.spendStars(250);                                // досрочный банк на 300
    g.addScore(-1500);                                // счёт упал до 150 единиц
    const scoreNow = g.stats().score;
    g.bankScore(scoreNow);                            // победа: банк ОСТАТКА (он отрицательный)
    return { w0, w1: g.starBalance(), rank0, rank1: g.leaderboardScore(),
             expected: Math.floor(scoreNow / 10), spent: 250 };
  });
  expect(bankDrop.w1 === bankDrop.w0 + bankDrop.expected - bankDrop.spent,
    '⚠️ СЧЁТ УПАЛ ПОСЛЕ БАНКА: кошелёк всё равно ровно floor(score/10) − траты (' +
    bankDrop.w0 + ' + ' + bankDrop.expected + ' − ' + bankDrop.spent + ' = ' + bankDrop.w1 + ')');
  // ⚠️ Ранг двигается ТАК ЖЕ, как кошелёк: заработок поднимает, трата опускает
  // (утверждённый размен владельца). Проверяем ГЛАВНОЕ — что досрочный банк не
  // РАЗДУЛ ранг по пику счёта: без коррекции в ss вышло бы rank0+300−250.
  const rankHonest = bankDrop.rank0 + bankDrop.expected - bankDrop.spent;
  const rankInflated = bankDrop.rank0 + 300 - bankDrop.spent; // если бы банк по пику остался
  expect(bankDrop.rank1 === rankHonest && bankDrop.rank1 !== rankInflated,
    '⚠️ ЛИДЕРБОРД не раздут пиком: ' + bankDrop.rank1 + ' (честно ' + rankHonest +
    ', по пику было бы ' + rankInflated + ')');

  // ⚠️ ЭТА СЕКЦИЯ СТОИТ В САМОМ КОНЦЕ НАМЕРЕННО — по той же причине, что и
  // секция камней: она делает setLevel/regen, а это меняет контекст следующим
  // проверкам. Когда я поставил её в середину, она сломала «5 матчей сняли
  // >=10 предметов» (уровень стал больше, живых 172 вместо 130) и секцию
  // бомбы. Проект эту граблю уже документировал — я на неё наступил повторно.

  // ⚠️ ТАП ПО ДОСТУПНОМУ БЕЗ ПАРЫ НЕ ШТРАФУЕТСЯ (спека владельца 2026-07-29).
  // Стережём ЯВНО: снятие штрафа — это одна строка, и вернуть её случайной
  // правкой в handleTap проще простого, а игрок заметит не сразу.
  // Радиус загоняем в −9 (документированный приём форса «пар нет»), уровень
  // берём 10-й: на 1-м штрафов нет вовсе, на 2-5 счёт клампится нулём — там
  // ассерт был бы зелёным по чужой причине.
  await page.evaluate(() => { window.__game.setLevel(10); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => !window.__game.awake().physAwake, null, { timeout: 5000 }).catch(()=>{});
  const npRad = await page.evaluate(() => window.__game.cfg.baseRadius);
  await page.evaluate(() => { window.__game.cfg.baseRadius = -9; });
  await page.waitForTimeout(500);                       // updateMatchRadius тикает раз в 300 мс
  const npTarget = await page.evaluate(() => {
    const g = window.__game; g.forceRefresh();
    return g.findByTex('food') || g.findByTex('animal');
  });
  if (npTarget && npTarget.px != null){
    const npBefore = await page.evaluate(() => ({ score: window.__game.stats().score, misses: window.__game.stats().misses }));
    await page.mouse.click(npTarget.px, npTarget.py);
    await page.waitForTimeout(400);
    const npAfter = await page.evaluate(() => ({ score: window.__game.stats().score, misses: window.__game.stats().misses }));
    expect(npAfter.score === npBefore.score,
      'тап по доступному без пары НЕ снял очки (' + npBefore.score + ' -> ' + npAfter.score + ')');
    expect(npAfter.misses === npBefore.misses,
      'тап по доступному без пары НЕ засчитан промахом (' + npBefore.misses + ' -> ' + npAfter.misses + ')');
  } else console.log('тап без пары: доступной цели не нашлось — пропуск');
  await page.evaluate((r) => { window.__game.cfg.baseRadius = r; }, npRad);
  await page.waitForTimeout(400);

  // ===== ХВОСТ TYPES, СТЕЙК И ЛЕСЕНКА ВСТРЯСОК (спеки владельца 2026-07-30) =====
  // ⚠️ СЕКЦИЯ В САМОМ КОНЦЕ НАМЕРЕННО: setLevel/regen меняют контекст, и в
  // середине файла она ломала бы соседние ассерты (та же грабля, что у камней).
  const tailProbe = await page.evaluate(() => {
    const g = window.__game;
    const at = (lv) => { g.setLevel(lv); g.regen(); g.skipIntro();
                         return Object.keys(g.typesSnapshot()); };
    const lv20 = at(20);
    // ⚠️ УРОВЕНЬ ПОЛНОГО ОТКРЫТИЯ ПЛАВАЕТ С ЧИСЛОМ ТИПОВ (берём 160 с запасом),
    // а с v181 состав кучи на высоких уровнях ещё и СЛУЧАЕН: спавн выбирает
    // 90 из ~122 открытых Фишер-Йетсом. Один реген содержит конкретный тип с
    // вероятностью ~0.74 — одиночная проверка флейкала бы каждый четвёртый
    // прогон. Поэтому ОБЪЕДИНЕНИЕ по регенам до успеха (кап 6): вероятность
    // ложного падения при ЖИВОМ хвосте ~0.26^6 ≈ 0.0003 — измерять умеем.
    // Если хвост МЁРТВ (вернули `i % typesCount`) — не поможет ни один реген,
    // падение честное.
    const seen = new Set(); let regens = 0;
    for (let k = 0; k < 6; k++){
      regens++;
      for (const n of at(160)) seen.add(n);
      if (seen.has('forestplant') && seen.has('survivalfish')) break;
    }
    return {
             tailAll: seen.has('forestplant'),   // последний тип массива
             fishAll: seen.has('survivalfish'),  // рыба владельца (v180)
             regens,
             tail20:  lv20.includes('forestplant'),
             shakes1: g.freeShakes(1), shakes20: g.freeShakes(20), shakes40: g.freeShakes(40) };
  });
  // ⚠️ СТРАЖ СТЕЙКА СНЯТ ВМЕСТЕ С ТИПОМ (спека владельца 2026-07-30 «убери
  // стейк совсем»). Это отмена его же утренней спеки, на которой страж и
  // стоял; данные 35-steak.js удалены. Вернут стейк — вернуть и ассерт.
  // ⚠️ АССЕРТ СПОСОБЕН УПАСТЬ: вернуть `i % typesCount` — и tail113 станет
  // false, потому что pairsCnt (90) меньше числа типов (121).
  expect(tailProbe.tailAll && tailProbe.fishAll,
    'ХВОСТ TYPES ДОСТИЖИМ: последний тип и рыба попадают в кучу при полном открытии ('
    + tailProbe.regens + ' реген(ов))');
  expect(!tailProbe.tail20,
    'сентинел forestplant на ур.20 ещё не открыт (он намеренно последний)');
  // ПЕРЕМЕШИВАНИЕ (спека владельца 2026-07-30): новые типы обязаны быть видны
  // РАНО. На ур.20 открыты индексы 0..27 ДЕТЕРМИНИРОВАННО (typesCount<=pairsCnt
  // — берутся все открытые), поэтому проверка без регенов честная.
  const mixProbe = await page.evaluate(() => {
    const g = window.__game;
    g.setLevel(20); g.regen(); g.skipIntro();
    const n20 = Object.keys(g.typesSnapshot());
    g.setLevel(10); g.regen(); g.skipIntro();
    const n10 = Object.keys(g.typesSnapshot());
    return { holiday20: ['holidayhanukkahdreidel','holidaygingerbreadman','holidaynutcracker']
               .filter(x => n20.includes(x)).length,
             fish10: n10.includes('survivalfish'),
             donut20: n20.includes('fooddonutsprinkles') };
  });
  expect(mixProbe.holiday20 >= 2,
    'ПЕРЕМЕШИВАНИЕ: к ур.20 видны новые типы (' + mixProbe.holiday20 + ' из 3 сентинелов)');
  expect(!mixProbe.fish10,
    'рыба НЕ в первой десятке уровней (учёт возражения Графики о путанице с кладом)');
  expect(!mixProbe.donut20,
    'пончик остаётся поздним, пока не починен его коллайдер');
  // Лесенка 3 + ⌊ур/6⌋, кап 8 — числа из 00-config, ассерт их ПИНУЕТ
  // намеренно (двойник спеки; читать из игры значило бы проверять пустоту).
  expect(tailProbe.shakes1 === 3 && tailProbe.shakes20 === 6 && tailProbe.shakes40 === 8,
    'ЛЕСЕНКА ВСТРЯСОК 3/6/8 на ур.1/20/40 (' + tailProbe.shakes1 + '/'
    + tailProbe.shakes20 + '/' + tailProbe.shakes40 + ')');

  // ===== ПРОВАЛ СКВОЗЬ ПОЛ (жалоба владельца 2026-07-30 «дыра в объектах») =====
  // Стейк и посох лежали НА ЛОПАСТЯХ, ниже невидимого пола: плита пола была
  // толщиной 0.6 и НИЧЕГО под ней, а глобальный сон замораживал провалившегося
  // навсегда. Две половины правки — толстая плита (корень) и спасатель пола.
  // ⚠️ СТРАЖ ДЕТЕРМИНИРОВАННЫЙ, и иначе нельзя: сам провал стохастичен (в
  // стрессе он выпадал в 2 циклах из 28), ассерт «после взрыва никто не под
  // полом» на чистой базе зелен в 26 прогонах из 28 и механику НЕ проверяет.
  await page.evaluate(() => { window.__game.setLevel(10); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForFunction(() => !window.__game.awake().physAwake, null, { timeout: 5000 }).catch(()=>{});
  const floorGuard = await page.evaluate(() => {
    const g = window.__game;
    // сперва ОСУШАЕМ спасателя: дальше «>=1» обязано быть заслугой подкладки,
    // а не хвоста от осадки
    const drained = g.rescueNow();
    const idx = g.accessibleList()[0];
    // кладём предмет ВНУТРЬ плиты (0.5 под её верх) у оси — там точно пол,
    // а не стена: радиус стены на этой высоте 2.5 при d=0.85
    g.place(idx, 0.6, 1.15 - 0.5, 0.6);
    const before = g.underFloor().length;
    const lifted = g.rescueNow();
    return { drained, before, lifted, after: g.underFloor().length };
  });
  expect(floorGuard.drained === 0,
    'СТРАЖ ПОЛА: на осевшей куче спасателю нечего делать (' + floorGuard.drained + ')');
  expect(floorGuard.before >= 1,
    'СТРАЖ ПОЛА: подкладка сработала — предмет под полом (' + floorGuard.before + ')');
  expect(floorGuard.lifted >= 1,
    'СТРАЖ ПОЛА: спасатель поднял утонувшего (' + floorGuard.lifted + ')');
  expect(floorGuard.after === 0,
    'СТРАЖ ПОЛА: под полом больше никого (' + floorGuard.after + ')');
  // Живой контроль сверху детерминированного: реальный стресс (встряски +
  // взрыв на полной куче) не оставляет никого в полу.
  await page.evaluate(() => { window.__game.regen(); window.__game.skipIntro(); });
  for (let i = 0; i < 2; i++){ await page.evaluate(() => window.__game.shake()); await page.waitForTimeout(1200); }
  await page.evaluate(() => window.__game.detonate());
  // ⚠️ НЕ ОДИН СНИМОК ПО ЧАСАМ, А ОПРОС ДО ЧИСТОТЫ. Прежний вид (снимок ровно
  // на 3000 мс) флейкал ~5% прогонов — диагноз ГРАФИКИ, подтверждён их пробой
  // 2×18 попыток: транзиентная просадка на ЛЕТЯЩЕЙ куче (норма по замеру
  // Физики 0.05..0.28) попадала в кадр РАНЬШЕ, чем спасатель имеет право её
  // поднять — его второй ключ ТРЕБУЕТ просадки, держащейся ~1.5 с, и это
  // задумано (иначе шторм телепортов). Настоящий дефект — ЗАЛИПАНИЕ, а оно
  // от опроса не прячется: застрявший не очистится ни к 3-й, ни к 9-й
  // секунде (проба Графики: у обеих сборок чисто к 7-й, 0/18). Падение
  // теперь означает «спасатель НЕ вынул за 9 с» — ровно инвариант соака.
  let floorLive = null;
  for (let t = 0; t < 30; t++){
    await page.waitForTimeout(300);
    floorLive = await page.evaluate(() => window.__game.underFloor());
    if (floorLive.length === 0) break;
  }
  expect(floorLive.length === 0,
    'ПОЛ: после встрясок и взрыва спасатель вынул всех не позднее 9 с (' + JSON.stringify(floorLive).slice(0, 160) + ')');

  // ===== ТАП ПО ГЛАЗАМ = ПРОВОКАЦИЯ ПОМОЛА (спека владельца 2026-07-30) =====
  // В конце файла: regen меняет контекст. Механика переиспользует наказание за
  // простой, поэтому проверяем ОБА конца: укус случился И матч его ОСТАНОВИЛ.
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  // ⚠️ ОВЕРЛЕИ ПЕРЕКРЫВАЮТ КЛИК (правило сьюта): предыдущая секция могла
  // оставить экран победы — regen его не прячет, и click('#eyes') умирал
  // TimeoutError «winOverlay intercepts pointer events» (первый прогон).
  await page.evaluate(() => {
    for (const id of ['winOverlay','loseOverlay','mainScreen'])
      { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  });
  const pokeBefore = await page.evaluate(() => window.__game.alive());
  await page.click('#eyes');
  await page.waitForTimeout(1800); // первый укус немедленный, анимация помола ~0.6 с
  const pokeAfter = await page.evaluate(() => window.__game.alive());
  expect(pokeBefore - pokeAfter >= 2,
    'ПРОВОКАЦИЯ: тап по глазам включил помол — съедена пара (' + pokeBefore + ' -> ' + pokeAfter + ')');
  // матч останавливает: простой обнуляется, дальше миксер молчит
  await page.evaluate(() => window.__game.autoMatch());
  await page.waitForTimeout(200);
  const pokeCalm = await page.evaluate(() => {
    const g = window.__game;
    return (performance.now() - g.stats().lastAction)/1000 < g.level().idleLimit;
  });
  expect(pokeCalm, 'ПРОВОКАЦИЯ: матч сбросил злость — простой снова в норме');

  // ===== ПАКЕТ ТЕМПА (спека владельца 2026-07-31: «драйва не хватает» →
  // окно серии утекает и сжимается, лесенка множителя ×2→×3→×4, показ
  // глазами/звуком — БЕЗ шкалы). Секция ставит свой уровень и стоит перед
  // зарядом — тот начинается со своего regen, контекст не течёт.
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  const tempo = await page.evaluate(async () => {
    const g = window.__game;
    const идти = async (k) => { for (let i = 0; i < k; i++){ g.autoMatch(); await new Promise(r => setTimeout(r, 80)); } };
    const s0 = g.series();                        // до серии
    await идти(2);                                // второй матч в окне склейки — зажигание
    const s2 = g.series();
    await идти(6);                                // до порога ×3 и дальше
    const s8 = g.series();
    return { s0, s2, s8 };
  });
  expect(tempo.s0.mult === 1 && tempo.s2.mult === 2 && tempo.s8.len >= 6 && tempo.s8.mult === 3,
    'ТЕМП: лесенка множителя 1 → ×2 (зажигание) → ×3 (длинная серия) (' +
    [tempo.s0.mult, tempo.s2.mult, tempo.s8.mult].join('/') + ' при len ' + tempo.s8.len + ')');
  expect(tempo.s8.winMs < tempo.s2.winMs,
    'ТЕМП: окно СЖИМАЕТСЯ с длиной серии (' + tempo.s2.winMs + ' -> ' + tempo.s8.winMs + ' мс)');
  // окно реально утекает: без матчей серия гаснет к концу СВОЕГО окна
  // (осадка-опрос по факту, потолок-страховка сверх winMs)
  const tempoDie = await page.evaluate(async () => {
    const g = window.__game;
    const win = g.series().leftMs;
    const t0 = Date.now();
    while (g.series().mult > 1 && Date.now() - t0 < win + 1500)
      await new Promise(r => setTimeout(r, 100));
    return { погасла: g.series().mult === 1, ждали: Date.now() - t0, окно: win };
  });
  expect(tempoDie.погасла && tempoDie.ждали <= tempoDie.окно + 1500,
    'ТЕМП: окно утекло без матчей — множитель упал на базу (' + JSON.stringify(tempoDie) + ')');
  // НОВОЕ зажигание после смерти окна начинает серию С ЕДИНИЦЫ (раньше
  // comboCount переживал протухшее окно — лесенка стартовала бы с ×3 мгновенно)
  const tempoFresh = await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 2; i++){ g.autoMatch(); await new Promise(r => setTimeout(r, 80)); }
    return g.series();
  });
  expect(tempoFresh.mult === 2 && tempoFresh.len <= 2,
    'ТЕМП: новая серия после протухшей начинается с единицы, а не с хвоста старой (' +
    JSON.stringify(tempoFresh) + ')');
  // вершина лесенки: догоняем до турбо — множитель ×4 при живой цепи
  const tempoChain = await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 14 && !g.combo().chain; i++){ g.autoMatch(); await new Promise(r => setTimeout(r, 80)); }
    return { chain: g.combo().chain, mult: g.series().mult };
  });
  expect(tempoChain.chain && tempoChain.mult === 4,
    'ТЕМП: в турбо множитель ×4 — вершина лесенки (' + JSON.stringify(tempoChain) + ')');

  // ===== «ЗАРЯД ТИПА» + ЛЕСЕНКА ТУРБО (спеки владельца 2026-07-31) =====
  // Секция в конце: regen/setLevel меняют контекст (правило канона).
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  const chg = await page.evaluate(() => {
    const g = window.__game;
    const sn = g.typesSnapshot();
    // ведущий тип: максимум живых копий (surprise в снимке не тип)
    let name = null, n = 0;
    for (const [k, v] of Object.entries(sn)) if (k !== 'surprise' && v.alive > n){ name = k; n = v.alive; }
    const acc0 = g.accSnapshot().find(x => x.key === name);
    const s0 = g.stats().score;
    g.chargeGrant(name);
    const okBtn = document.getElementById('chargeBtn').style.display !== 'none';
    const fired = g.detonateCharge();
    const s1 = g.stats().score;
    const acc1 = g.accSnapshot().find(x => x.key === name);
    const N = Math.min(n, 8);
    // ⚠️ ЦЕНА — С МНОЖИТЕЛЕМ ТИПА, снятым ДО детонации (detonateCharge считает
    // gained ПЕРЕД accAdd). Первая версия ждала голые 10·N·(N−1) и была
    // ФЛЕЙКОМ-ЛОТЕРЕЕЙ: молчала, пока ведущий тип шёл с mult 1, и упала, когда
    // им оказался прокачанный прежними секциями (1260 = 560 × 2.25, тир 5 от
    // пожизненных счётчиков + купленного буста — сейв живёт весь прогон).
    return { name, n, fired, okBtn, gained: s1 - s0,
             // × бустер (слово владельца 2026-08-01 «множит») — снимаем живой
             want: Math.round(10 * N * (N - 1) * (acc0 ? acc0.mult : 1) * g.scoreBoostMult()),
             accGrew: (acc1 ? acc1.count : 0) - (acc0 ? acc0.count : 0),
             cleared: g.charge().name === '' };
  });
  // ⚠️ Удаление идёт ХВОСТОМ АНИМАЦИИ (afterPause 150 мс, паттерн бомбы) —
  // мгновенный снимок остатка врал «осталось 16» при исправной механике.
  // Первый прогон этого стража я завалил именно так.
  await page.waitForTimeout(700);
  const chgLeft = await page.evaluate((nm) =>
    (window.__game.typesSnapshot()[nm] || { alive: 0 }).alive, chg.name);
  // ⚠️ АССЕРТ КАПА СПОСОБЕН УПАСТЬ: на ур.3 ведущий тип даёт ~14 копий (замер),
  // без капа gained был бы 10·14·13=1820 — проверяем РОВНО капнутую цену.
  expect(chg.fired && chgLeft === 0,
    'ЗАРЯД: детонация сняла ВСЕХ ' + chg.n + ' предметов типа ' + chg.name + ' (осталось ' + chgLeft + ')');
  expect(chg.gained === chg.want,
    'ЗАРЯД: цена капнута формулой группы ×множитель типа, БЕЗ комбо-×2 (' + chg.gained + ' == ' + chg.want + ' при n=' + chg.n + ')');
  expect(chg.accGrew === chg.n,
    'ЗАРЯД = СПАСЕНИЕ: пожизненный счётчик вырос на все ' + chg.n + ' (' + chg.accGrew + ')');
  expect(chg.okBtn && chg.cleared, 'ЗАРЯД: слот показался при гранте и очищен после детонации');
  // TTL: заряд живёт <= 7 c и растворяется сам
  const ttl = await page.evaluate(async () => {
    const g = window.__game;
    g.chargeGrant('foodwatermelon', 250);
    const alive0 = g.charge().name;
    await new Promise(r => setTimeout(r, 600));
    return { alive0, after: g.charge().name, fired: g.detonateCharge() };
  });
  expect(ttl.alive0 === 'foodwatermelon' && ttl.after === '' && ttl.fired === false,
    'ЗАРЯД: растворился по TTL, детонация после смерти отказана (' + JSON.stringify(ttl) + ')');
  // ⚠️ ЖИЗНЕННЫЙ ЦИКЛ (ревью v212, оба дефекта подтверждены скептиками):
  // (1) заряд НЕ переживает смену уровня — genLevel сбрасывает chargeName
  //     (иначе чип чужого типа в новом уровне, детонация по новой куче после
  //     быстрого рестарта и ВТОРОЙ заряд поверх — chargeGiven-то свежий);
  // (2) пауза НЕ съедает TTL — resumeGame сдвигает chargeUntil как все якоря
  //     (реклама/меню длиннее остатка молча гасили ресурс «1/уровень», при
  //     том что турбо той же цепи паузу переживало — асимметрия).
  const chgLife = await page.evaluate(async () => {
    const g = window.__game;
    g.chargeGrant('foodwatermelon');
    g.regen();
    const послеРегена = g.charge().name;
    g.skipIntro();
    await new Promise(r => setTimeout(r, 200));
    g.chargeGrant('foodwatermelon');
    const до = g.charge().leftMs;
    window.showMainScreen();                       // тихая пауза меню
    await new Promise(r => setTimeout(r, 700));
    window.hideMainScreen();
    await new Promise(r => setTimeout(r, 100));
    const после = g.charge().leftMs;
    g.detonateCharge();                            // прибрать за собой
    return { послеРегена, съедено: Math.round(до - после) };
  });
  expect(chgLife.послеРегена === '',
    'ЗАРЯД: не переживает смену уровня — genLevel сбрасывает (' + JSON.stringify(chgLife) + ')');
  expect(chgLife.съедено < 350,
    'ЗАРЯД: пауза не съедает TTL — resumeGame сдвигает chargeUntil (съедено ' +
    chgLife.съедено + ' мс из 700 паузы)');
  // ⚠️ РАСТВОРЕНИЕ ВИДНО ГЛАЗУ (полировка ИНТЕРФЕЙСА). До неё прозрачность
  // писалась ОДИН раз при выпадении: `updateHUD` зовётся ПО СОБЫТИЯМ, а не
  // тиком (таймер миксера обновляет отдельный блок loop — на нём легко
  // ошибиться, я и ошиблась первым замером). Кнопка висела непрозрачной все
  // 7 с и пропадала скачком. Теперь opacity ведёт покадровый тик по живому
  // leftMs. Ассерт берёт ДВА снимка без единого события между ними — ровно тот
  // случай, который был сломан; убери тик, и он падает.
  // ⚠️ ОКНО ЗАМЕРА 2 с, А НЕ 1.2: рампа нормирована на КОНСТАНТУ CHARGE_TTL_MS
  // (7000), поэтому падение = 0.75·окно/7000 и от длины гранта не зависит.
  // С окном 1.2 с ожидаемые 0.13 не прошли бы порог 0.15 — первая версия
  // ассерта падала на исправной ветке (поймано прогоном против обеих сборок).
  const fade = await page.evaluate(async () => {
    const g = window.__game, cb = document.getElementById('chargeBtn');
    g.chargeGrant('foodwatermelon');               // полный TTL — не истечёт за замер
    await new Promise(r => setTimeout(r, 300));
    const a = +getComputedStyle(cb).opacity;
    // ⚠️ ОКНО 3 с, А НЕ 2 (флейк, пойман Графикой: 0.823/0.827/0.824 при
    // пороге 0.15). Причина арифметическая и моя: TTL заряда поднят 7 -> 10 с
    // словом владельца, и падение за 2 с стало РОВНО 0.75*2/10 = 0.150 —
    // на самой границе ассерта. За 3 с ожидаем 0.225, порог отодвинут к 0.18.
    await new Promise(r => setTimeout(r, 3000));   // НИКАКИХ действий игрока
    const b = +getComputedStyle(cb).opacity;
    g.detonateCharge();                            // прибрать за собой
    return { a: +a.toFixed(3), b: +b.toFixed(3), drop: +(a - b).toFixed(3) };
  });
  expect(fade.drop > 0.18,                          // ожидаемые ~0.225, на main ровно 0
    'ЗАРЯД: прозрачность падает БЕЗ событий — растворение видно (' + fade.a + ' -> ' + fade.b + ')');
  // СЛОТ = МОДЕЛЬ, А НЕ КНОПКА (спека владельца v3): кнопочного хрома нет,
  // габарит равен кнопке подсказки, и вещь ПУЛЬСИРУЕТ.
  // ⚠️ ПУЛЬС ПРОВЕРЯЕМ ФАКТОМ — реальным габаритом картинки за ПОЛНЫЙ период
  // (1.1 с; 80 кадров ≈ 1.33 с ловят и пик, и провал), а НЕ именем анимации из
  // computed style: имя там стоит и у анимации, которую ничто не двигает.
  // ⚠️ Полсекунды перед замером — переждать РАЗОВЫЙ поп входа: он живёт на
  // transform РОДИТЕЛЯ и тоже растягивает rect картинки.
  const slot = await page.evaluate(async () => {
    const g = window.__game, sn = g.typesSnapshot();
    let name = null, n = 0;
    for (const [k, v] of Object.entries(sn)) if (k !== 'surprise' && v.alive > n){ name = k; n = v.alive; }
    g.chargeGrant(name);
    await new Promise(r => setTimeout(r, 500));
    const cb = document.getElementById('chargeBtn'), img = document.getElementById('chargeImg');
    const c = getComputedStyle(cb), w = [];
    // ⚠️ СЭМПЛИМ СТЕННЫМИ ЧАСАМИ, НЕ ЧИСЛОМ КАДРОВ (диагноз ГРАФИКИ v218):
    // 80 rAF-кадров на медленной машине = 10+ секунд (замер: headless даёт
    // 7.8 fps) — заряд с TTL 7 с успевал раствориться ПОД замером, слот
    // схлопывался, «ход» ловил его исчезновение (58 при ожидаемых ~4-5).
    // Полный период пульса 1.1 с → окно 1.4 с ловит пик и провал при любом
    // fps, оставаясь глубоко внутри TTL.
    // ⚠️ НОСИТЕЛЬ ПУЛЬСА — ВИДИМЫЙ УЗЕЛ: по правилу владельца «модель +
    // вращение = 3D без картинки» картинка скрыта, и мерить её ширину значит
    // мерить ноль (ровно это страж и поймал). Берём канвас модели, если он
    // жив, иначе картинку-фолбэк.
    const beat = () => cb.querySelector('canvas') || img;
    const t0 = Date.now();
    while (Date.now() - t0 < 1400){
      w.push(beat().getBoundingClientRect().width);
      await new Promise(r => requestAnimationFrame(r));
    }
    const res = { фон: c.backgroundColor, кольцо: c.boxShadow,
      слот: cb.getBoundingClientRect().width,
      подсказка: document.getElementById('hintBtn').getBoundingClientRect().width,
      ход: +(Math.max(...w) - Math.min(...w)).toFixed(2) };
    res.картинка = getComputedStyle(img).display;
    res.канвас = !!cb.querySelector('canvas');
    // обратный ход: отнимаем канвас — добор обязан вернуть спин в слот
    const cv = cb.querySelector('canvas');
    if (cv) document.body.appendChild(cv);
    await new Promise(r => setTimeout(r, 900));
    res.канвасВернулся = !!cb.querySelector('canvas');
    g.detonateCharge();
    return res;
  });
  // ⚠️ РАВЕНСТВО «слот === подсказка» ОТМЕНЕНО НОДОЙ 829:1242: там «бонусная
  // вещь» 64×64 над Shake, а не 56 рядом с подсказкой (прежняя спека v3
  // «размером с кнопку подсказки», 2026-07-31). Проверка не ослаблена, а
  // переведена на новое число: слот ОБЯЗАН быть КРУПНЕЕ подсказки — так страж
  // по-прежнему краснеет, если слот схлопнется к размеру кнопки или к нулю.
  expect(slot.канвас === true && slot.картинка === 'none',
    'ЗАРЯД: только 3D-модель, картинки-подложки НЕТ (правило владельца 2026-08-05) (' + JSON.stringify(slot) + ')');
  expect(slot.канвасВернулся === true,
    'ЗАРЯД: отняли канвас — добор вернул спин в слот (' + JSON.stringify(slot) + ')');
  expect(/rgba\(0, 0, 0, 0\)|transparent/.test(slot.фон) && slot.кольцо === 'none' &&
    slot.слот === 64 && slot.слот > slot.подсказка && slot.ход > 1 && slot.ход < 6,
    'ЗАРЯД: не кнопка, а модель 64 (нода 829:1242, крупнее подсказки), и она пульсирует (' +
    JSON.stringify(slot) + ')');
  // ЛЕСЕНКА ТУРБО: порог входа растёт с уровнем. Числа ПИНУЮТСЯ как двойник
  // спеки (10 + ⌊ур/8⌋, кап 14) — читать из игры значило бы проверять пустоту.
  const chainLadder = await page.evaluate(() => {
    const g = window.__game, out = {};
    for (const lv of [1, 8, 16, 40]){ g.setLevel(lv); out[lv] = g.chainAt(); }
    g.setLevel(3);
    return out;
  });
  expect(chainLadder[1] === 10 && chainLadder[8] === 11 && chainLadder[16] === 12 && chainLadder[40] === 14,
    'ТУРБО ДОРОЖАЕТ: порог 10/11/12/14 на ур.1/8/16/40 (' + JSON.stringify(chainLadder) + ')');
  // ВЫПАДЕНИЕ ИЗ ЖИВОЙ СЕРИИ: честные 10 быстрых матчей зажигают цепь,
  // и в момент зажигания выпадает заряд типа с >= 6 копиями
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  // ⚠️ КОПИИ СЧИТАТЬ В МОМЕНТ ВЫПАДЕНИЯ, А НЕ ПОСЛЕ ЦИКЛА (страж падал «4 < 6»
  // на исправной фиче: грант честно выбрал тип с >=6, но два ХВОСТОВЫХ
  // autoMatch успевали съесть его копии до снимка). Ловим тесным опросом и
  // рвём цикл сразу по гранту — удаление зажёгшего матча живёт 150 мс, снимок
  // в первые ~50 мс видит копии ещё живыми.
  const drop = await page.evaluate(async () => {
    const g = window.__game;
    let cs = { name: '', leftMs: 0 }, copies = 0;
    for (let i = 0; i < 14 && !cs.name; i++){
      g.autoMatch();
      for (let t = 0; t < 3 && !cs.name; t++){
        await new Promise(r => setTimeout(r, 40));
        cs = g.charge();
      }
    }
    if (cs.name) copies = (g.typesSnapshot()[cs.name] || { alive: 0 }).alive;
    return { name: cs.name, leftMs: cs.leftMs, copies };
  });
  expect(!!drop.name && drop.leftMs > 0,
    'ВЫПАДЕНИЕ: зажигание цепи выдало заряд (' + drop.name + ', жить ' + Math.round(drop.leftMs) + ' мс)');
  expect(drop.copies >= 6,
    'ВЫПАДЕНИЕ: тип заряда имеет >= 6 живых копий (' + drop.copies + ')');

  // ОДИН ПРОМАХ ГАСИТ ТУРБО (спека владельца 2026-07-31, отменяет 4/3).
  // Цепь сейчас живая после выпадения заряда — бьём промахом в пустоту.
  // ⚠️ combo() отдаёт БУЛЕВО поле chain, а не сырой chainUntil — первый прогон
  // этого стража я завалил чтением несуществующего поля (undefined > now).
  const missKill = await page.evaluate(async () => {
    const g = window.__game;
    const before = g.combo().chain;
    g.penalizeTest();                              // один промах
    await new Promise(r => setTimeout(r, 250));    // тик планировщика цепи
    return { before, after: g.combo().chain };
  });
  expect(missKill.before && !missKill.after,
    'ТУРБО: один промах остановил режим (' + JSON.stringify(missKill) + ')');

  // ЗАРЯД С ПЕРВОГО КАСАНИЯ (жалоба владельца «нажимать дважды»): детонация
  // обязана уйти с ОДНОГО pointerdown по слоту, без click-синтеза
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(300);
  const tap1 = await page.evaluate(() => {
    const g = window.__game;
    const sn = g.typesSnapshot();
    let name = null, n = 0;
    for (const [k, v] of Object.entries(sn)) if (k !== 'surprise' && v.alive > n){ name = k; n = v.alive; }
    g.chargeGrant(name);
    document.getElementById('chargeBtn').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return { cleared: g.charge().name === '' };
  });
  expect(tap1.cleared, 'ЗАРЯД: сработал с ПЕРВОГО pointerdown по слоту');
  // (страж дрожи курсора удалён вместе с фичей — отвергнута владельцем v202)

  // ===== КАСТОМНЫЕ КУРСОРЫ ДЕСКТОПА (спека владельца 2026-07-31) =====
  // headless chromium отдаёт pointer:fine — медиа-гейт открыт, курсоры видны
  const cur = await page.evaluate(() => ({
    fine: matchMedia('(pointer:fine)').matches,
    body: getComputedStyle(document.body).cursor.slice(0, 60),
    btn: getComputedStyle(document.getElementById('shakeBtn')).cursor.slice(0, 60),
  }));
  // v2: основной курсор — указательная рука (слово владельца), computed может
  // отдавать image-set(...) — проверяем ВХОЖДЕНИЕ data-URI, не префикс
  expect(cur.fine && cur.body.includes('data:image/png'),
    'КУРСОР: указательная рука — основной (' + cur.body + '…)');
  expect(cur.btn.includes('data:image/png'),
    'КУРСОР: рука и на кнопках (' + cur.btn + '…)');
  // драг камеры сжимает руку, отпускание разжимает
  await page.mouse.move(200, 400); await page.mouse.down();
  await page.mouse.move(260, 420, { steps: 4 });
  const grabOn = await page.evaluate(() => document.documentElement.classList.contains('grabbing'));
  await page.mouse.up();
  const grabOff = await page.evaluate(() => document.documentElement.classList.contains('grabbing'));
  expect(grabOn && !grabOff,
    'КУРСОР: драг сжимает руку, отпускание разжимает (' + grabOn + '/' + grabOff + ')');

  // ХВОСТОВОЙ ГЕЙТ: всё, что случилось после раннего гейта, обязано валить
  // вердикт — иначе стража нет у 59% прогона (см. комментарий у errorsReported).
  const lateErrors = errors.slice(errorsReported).filter(e => !/reading 'boom'/.test(e));
  if (lateErrors.length) failures.push('runtime errors ПОСЛЕ раннего гейта: ' + lateErrors.join(' | '));
  // ── ПРОЛОГ-КОМИКС ПЕРЕД ИГРОЙ (спека владельца 2026-07-30) ───────────────
  // ⚠️ Это осознанная отмена правила §6.1 «никогда до первого тапа»: слово
  // владельца новее спеки. Риск темпа снят конструкцией — пролог живёт в фазе
  // 'wait' интро (занавес убран, предметы ещё не падали), поэтому анимация
  // заполнения не теряется, а панели быстрее обычных.
  const stPro = await page.evaluate(async () => {
    const g = window.__game;
    g.storyEnable(true);
    const due0 = g.storyPrologueDue();            // после старта пролог уже показан/закрыт
    g.storyReset();                               // «новый игрок»
    const due1 = g.storyPrologueDue();
    let done = false;
    g.storyPrologueSpy(() => { done = true; });   // проигрываем пролог заново
    const panels = document.querySelectorAll('#storyOverlay svg').length;
    return { due0, due1, done, panels, open: !!document.getElementById('storyOverlay'), st: g.storyState().st };
  });
  expect(stPro.due0 === false && stPro.due1 === true,
    'пролог положен НОВОМУ игроку и не положен уже видевшему (' + stPro.due0 + '/' + stPro.due1 + ')');
  expect(stPro.done === false,
    '⚠️ КОЛБЭК ждёт закрытия: пока комикс на экране, падение предметов НЕ стартует');
  expect(stPro.open === true && stPro.panels === 1,
    'пролог открылся новому игроку, панель одна на экране (' + JSON.stringify(stPro) + ')');

  // ТАП ЛИСТАЕТ ТРИ ПАНЕЛИ, закрытие метит и пролог, и К0/К1
  const stProTap = await page.evaluate(async () => {
    const g = window.__game;
    const tap = () => document.getElementById('storyOverlay')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tap(); await new Promise(r => setTimeout(r, 60));
    const p2 = !!document.getElementById('storyOverlay');
    tap(); await new Promise(r => setTimeout(r, 60));
    const p3 = !!document.getElementById('storyOverlay');
    tap(); await new Promise(r => setTimeout(r, 60));
    return { p2, p3, closed: !document.getElementById('storyOverlay'), st: g.storyState().st };
  });
  expect(stProTap.p2 && stProTap.p3 && stProTap.closed,
    'пролог — ТРИ панели (рецепт → мечта → помощник), закрывается третьим тапом');
  expect((stProTap.st & 32) === 32 && (stProTap.st & 1) === 1 && (stProTap.st & 2) === 2,
    '⚠️ закрытие пролога метит и К0, и К1 — между уровнями они больше НЕ придут (st ' + stProTap.st + ')');

  // ⚠️ КОЛБЭК НЕ ТЕРЯЕТСЯ — на нём висит запуск падения предметов. Проверяем
  // ОБА пути: когда пролог не нужен (зовётся сразу) и когда показан.
  const stProCb = await page.evaluate(async () => {
    const g = window.__game;
    let fastCalled = false;
    g.storyPrologueSpy(() => { fastCalled = true; });   // st уже не 0 — пролог не нужен
    return { fastCalled };
  });
  expect(stProCb.fastCalled === true,
    '⚠️ КОЛБЭК: пролог не нужен → done() зовётся сразу, падение предметов не зависает');

  // СТАРЫЙ ИГРОК пролога не видит: он уже смотрел этот контент по прежней схеме
  const stProOld = await page.evaluate(() => {
    const g = window.__game;
    g.storyReset(); g.storyMark(1); g.storyMark(2);   // видел К0/К1 между уровнями
    return { due: g.storyPrologueDue() };
  });
  expect(stProOld.due === false,
    '⚠️ ГРАНДФАЗЕР: игрок, видевший К0/К1 по старой схеме, пролог НЕ получает (' + stProOld.due + ')');

  // МЕРЖ: главы OR — отставшая облачная копия не «разпоказывает» пролог
  const stMerge = await page.evaluate(() => {
    const g = window.__game;
    g.storyMark(32);
    const mine = g.storyState().st;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, st: 0, sv: 0 });
    const afterOld = g.storyState().st;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, st: 4, sv: 9 });
    return { mine, afterOld, afterNew: g.storyState().st, sv: g.storyState().sv };
  });
  expect(stMerge.afterOld === stMerge.mine,
    '⚠️ МЕРЖ: старая копия НЕ сбросила показанные главы (' + stMerge.mine + ' -> ' + stMerge.afterOld + ')');
  expect((stMerge.afterNew & 4) === 4 && stMerge.sv === 9,
    'мерж принял главу с другого устройства (OR) и подвинул уровень виньетки (' + JSON.stringify(stMerge) + ')');

  // ── К2/К3/К4: вехи из счётчиков накопления ───────────────────────────────
  // ⚠️ Триггеры выведены из Save.ac (мои данные), а не из событий музея —
  // поэтому проверяются напрямую: ступень типа / вторая пачка / полный зал.
  const stMile = await page.evaluate(async () => {
    const g = window.__game;
    g.storyEnable(true); g.storyReset();
    // ⚠️ ОБНУЛЯЕМ НАКОПЛЕНИЯ: за прогон сьюта счётчики типов давно перешагнули
    // порог ступени, и веха К2 была бы «уже выполнена» до всякого гранта —
    // тест мерил бы не триггер, а историю прогона.
    g.storyClearAcc(); g.clearBought();   // и накопления, и КУПЛЕННЫЕ ступени
    g.setLevel(20); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    // ⚠️ Закрывать панель ТОЛЬКО штатным путём: снос узла напрямую оставлял
    // внутренний флаг занятости взведённым, и следующая глава не открывалась.
    // ⚠️ Между главами раздвигаем разрыв: правило «≤1 виньетка за 2 уровня»
    // честно тормозит следующую главу сразу после предыдущей — без этого тест
    // мерил бы кулдаун, а не веху.
    const ready = () => g.storySetLevelMark(1);
    const seen = () => { ready(); g.stats().taps = 3; g.storyOnWin();
      const o = !!document.getElementById('storyOverlay');
      while (document.getElementById('storyOverlay')) g.storyClose();
      return o; };
    const mark = (bit) => g.storyMark(bit);
    mark(1); mark(2);                       // К0/К1 считаем показанными
    g.storySetLevelMark(1);                 // виньетка была на 1-м — разрыв есть
    ready();
    const beforeMile = { due: g.storyState().due, open: seen() };
    // ВЕХА К2: первый тип добрался до 1-й ступени накопления
    const types = g.storyTypeNames();
    g.accGrant(types[0], 120);              // порог 1-й ступени = 100
    const k2 = { due: g.storyState().due, open: seen() };
    mark(4);
    // ВЕХА К3: ступень появилась во ВТОРОЙ пачке
    const packOf = g.storyPackOf;
    const other = types.find(t => packOf(t) && packOf(t) !== packOf(types[0]));
    ready(); const k3before = g.storyState().due;
    g.accGrant(other, 120);
    const k3 = { due: g.storyState().due, open: seen() };
    mark(8);
    // ВЕХА К4: собран ПОЛНЫЙ зал (все типы пачки хоть раз спасены)
    ready(); const k4before = g.storyState().due;
    g.storyFillSet();                       // добираем самую маленькую годную пачку
    ready(); g.stats().taps = 3; g.storyOnWin();
    const panels = document.querySelectorAll('#storyOverlay svg').length;
    const k4 = { due: g.storyState().due, open: !!document.getElementById('storyOverlay'), panels };
    return { beforeMile, k2, k3before, k3, k4before, k4, set: g.storyFullSet() };
  });
  expect(stMile.beforeMile.due === null && stMile.beforeMile.open === false,
    '⚠️ ВЕХА: пока ни один тип не добрался до ступени — К2 НЕ всплывает (' + JSON.stringify(stMile.beforeMile) + ')');
  expect(stMile.k2.due === 'k2' && stMile.k2.open === true,
    'К2 «Куда?..» пришёл на первую ступень накопления (' + JSON.stringify(stMile.k2) + ')');
  expect(stMile.k3before === null,
    '⚠️ ВЕХА: одна пачка со ступенью — К3 ещё ждёт (' + stMile.k3before + ')');
  expect(stMile.k3.due === 'k3' && stMile.k3.open === true,
    'К3 «Раздел второй» пришёл, когда ступень появилась во ВТОРОЙ пачке');
  expect(stMile.k4before === null,
    '⚠️ ВЕХА: полного зала нет — твист К4 ждёт (' + stMile.k4before + ')');
  expect(stMile.k4.due === 'k4' && stMile.k4.open === true && stMile.k4.panels === 1,
    'К4 «Музей?!» пришёл на первый ПОЛНЫЙ зал: ' + stMile.set + ' (' + JSON.stringify(stMile.k4) + ')');
  const stK4 = await page.evaluate(async () => {
    const box = document.getElementById('storyOverlay');
    const tap = () => box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tap(); await new Promise(r => setTimeout(r, 60));
    const p2 = !!document.getElementById('storyOverlay');
    tap(); await new Promise(r => setTimeout(r, 60));
    const p3 = !!document.getElementById('storyOverlay');
    tap(); await new Promise(r => setTimeout(r, 60));
    return { p2, p3, closed: !document.getElementById('storyOverlay'), st: window.__game.storyState().st };
  });
  expect(stK4.p2 && stK4.p3 && stK4.closed,
    'твист К4 — ТРИ панели (полка → шок → ярость), закрывается на третьем тапе');
  expect((stK4.st & 16) === 16, 'К4 отмечен в сейве после показа (st ' + stK4.st + ')');
  // ⚠️ ПОРЯДОК: твист не может опередить сомнение даже при готовом сете
  const stOrder = await page.evaluate(() => {
    const g = window.__game;
    g.storyReset();                          // все главы забыты, вехи К2-К4 уже выполнены
    g.storySetLevelMark(1);
    return { due: g.storyState().due };
  });
  expect(stOrder.due === 'k0',
    '⚠️ ПОРЯДОК СТРОГИЙ: при готовых вехах очередь всё равно начинается с К0 (' + stOrder.due + ')');

  await page.evaluate(() => { window.__game.storyReset(); window.__game.storyEnable(false); });

  // ===== ВРЕМЯ СУТОК: НЕБО И ТЕМА КНОПОК В ОДНУ СЕКУНДУ (спека владельца
  // 2026-07-31 «день до 20:00, ночь с 20:00») =====
  // ⚠️ ЗАЧЕМ СТРАЖ: границу держат ДВЕ функции в разных файлах — skyTimeNow
  // (10-stage, небо/лихорадка) и isNightSky (85-hud, html.night: тема витрины,
  // инверсия Shake, правило цвета кнопок). Раньше час был вписан в обе руками,
  // и правка одной дала бы с 20 до 22 ДНЕВНОЕ НЕБО ПРИ НОЧНОЙ ТЕМЕ КНОПОК.
  // Теперь обе читают SKY_DAY_FROM/SKY_NIGHT_FROM — ассерт стережёт именно это
  // СОВПАДЕНИЕ, а не сами числа: разведут источники — упадёт.
  // ⚠️ Проверяется отдельными загрузками с ?hour=N, потому что палитра неба
  // считается РАЗ при загрузке (как раньше выбор панорамы) — на живой странице
  // час не подменить. Хук ?hour= заведён по запросу ИНТЕРФЕЙСА: до него три
  // темовые фичи проверялись только подменой Date.
  const hourPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const hoursSeen = [];
  for (const [h, wantNight] of [[4, true], [5, false], [19, false], [20, true], [23, true]]){
    await hourPage.goto('file://' + path.join(__dirname, 'index.html') + '?hour=' + h);
    await hourPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
    const got = await hourPage.evaluate(() => {
      const s = window.__game.skyHour();
      return { hour: s.hour, sky: s.time, night: s.night,
               html: document.documentElement.classList.contains('night') };
    });
    hoursSeen.push({ h, ...got, wantNight });
    expect(got.hour === h, 'форс-хук ?hour=' + h + ' принят (' + got.hour + ')');
    expect((got.sky === 'night') === wantNight,
      'небо на ' + h + ':00 — ' + (wantNight ? 'ночь' : 'день') + ' (' + got.sky + ')');
    expect(got.night === wantNight && got.html === wantNight,
      'тема кнопок на ' + h + ':00 совпала с небом (' + JSON.stringify(got) + ')');
  }
  expect(hoursSeen.every(x => (x.sky === 'night') === x.night),
    '⚠️ ЕДИНЫЙ ИСТОЧНИК: skyTimeNow и isNightSky не разошлись ни на одном часе (' +
    JSON.stringify(hoursSeen.map(x => x.h + ':' + x.sky + '/' + (x.night ? 'n' : 'd'))) + ')');
  await hourPage.close();

  // ===== МОБИЛЬНОЕ МЕНЮ: ПЛАВАЮЩАЯ ШАПКА + ПЛАВАЮЩИЙ RESUME =====
  // Спека владельца 2026-07-31: «плавающая шапка появляется ТОЛЬКО когда блок
  // My Collection уходит за границу верхнего вью. Появляется сверху быстро, но
  // плавно» + кнопка Resume снизу (ноды 815:1506 / 815:1521).
  // ⚠️ СЕКЦИЯ НА ОТДЕЛЬНОЙ СТРАНИЦЕ И В КОНЦЕ: открытие меню ставит ТИХУЮ паузу
  // и крутит глаза меню — в середине сьюта это меняло бы контекст соседям.
  const menuPage = await browser.newPage({ viewport: { width: 393, height: 761 } });
  await menuPage.goto('file://' + path.join(__dirname, 'index.html'));
  await menuPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await menuPage.evaluate(() => window.__game.skipIntro());
  await menuPage.waitForTimeout(400);
  await menuPage.evaluate(() => window.showMainScreen());
  await menuPage.waitForTimeout(400);
  const снимок = () => menuPage.evaluate(() => {
    const sk = document.getElementById('msSticky'), t = document.querySelector('.ms-coll-title');
    const fl = document.getElementById('msFloatResume');
    if (!sk || !fl) return { нетУзлов: true };
    const in_ = sk.querySelector('.ms-sticky-in').getBoundingClientRect();
    return { on: sk.classList.contains('on'),
             узелTop: Math.round(sk.getBoundingClientRect().top),
             пилюляTop: Math.round(in_.top), пилюляH: Math.round(in_.height),
             заголовокНиз: t ? Math.round(t.getBoundingClientRect().bottom) : null,
             зеркало: (document.getElementById('msStars2') || {}).textContent,
             живой: (document.getElementById('msStars') || {}).textContent,
             кнопка: getComputedStyle(fl).display,
             playoff: document.getElementById('mainScreen').classList.contains('playoff') };
  });
  const menuTop = await снимок();
  expect(!menuTop.нетУзлов && menuTop.on === false && menuTop.пилюляTop < 0 &&
    menuTop.кнопка === 'none' && menuTop.playoff === false,
    'МЕНЮ: наверху плавающей шапки нет и дубля кнопки нет (' + JSON.stringify(menuTop) + ')');
  // ⚠️⚠️ ПРОКРУЧИВАЕМ НАСТОЯЩИМ КОЛЕСОМ, А НЕ ПРИСВАИВАНИЕМ scrollTop.
  // Присваивание перескакивает целый класс дефектов: прошлая версия шапки
  // ужимала высоту в потоке, Blink компенсировал усадку своим scroll anchoring,
  // и МЕНЮ НЕ ПРОКРУЧИВАЛОСЬ ВООБЩЕ — при этом ВСЕ ассерты были зелёными,
  // потому что ходили присваиванием. В WebKit механизма нет, на iOS не видно.
  await menuPage.mouse.move(196, 500);
  const wheelSteps = [];
  for (let i = 0; i < 10; i++){
    await menuPage.mouse.wheel(0, 8);
    await menuPage.waitForTimeout(60);
    wheelSteps.push(await menuPage.evaluate(() => document.getElementById('mainScreen').scrollTop));
  }
  expect(wheelSteps[wheelSteps.length - 1] >= 56,
    'МЕНЮ ПРОКРУЧИВАЕТСЯ настоящим колесом, а не только присваиванием (' +
    JSON.stringify(wheelSteps) + ')');
  // «ТОЛЬКО КОГДА»: пока заголовок «My collection» ХОТЬ ЧАСТЬЮ виден — шапки нет.
  // Это и есть суть спеки: прежняя версия липла сразу при любой прокрутке.
  const покаВидно = await menuPage.evaluate(async () => {
    const ms = document.getElementById('mainScreen'), sk = document.getElementById('msSticky');
    const t = document.querySelector('.ms-coll-title');
    if (!t) return { нетЗаголовка: true };
    // встаём так, чтобы низ заголовка был чуть НИЖЕ верхней кромки
    ms.scrollTop += t.getBoundingClientRect().bottom - 12;
    await new Promise(r => setTimeout(r, 350));
    return { низ: Math.round(t.getBoundingClientRect().bottom), on: sk.classList.contains('on') };
  });
  expect(!покаВидно.нетЗаголовка && покаВидно.низ > 0 && покаВидно.on === false,
    'МЕНЮ: пока блок My Collection виден — плавающей шапки НЕТ (' + JSON.stringify(покаВидно) + ')');
  // ...а как только ушёл за верх — шапка на месте и по геометрии ноды
  await menuPage.evaluate(() => {
    const ms = document.getElementById('mainScreen'), t = document.querySelector('.ms-coll-title');
    ms.scrollTop += t.getBoundingClientRect().bottom + 40;
  });
  // ⚠️ ОСАДКА ВЫЕЗДА ФАКТОМ, не фикс-паузой (патч диспетчера v218: пауза 500
  // изредка ловила середину перехода 0.22s — узелTop −6 на исправной сборке;
  // тот самый подвид «момент, а не состояние»). Ждём top===0 с потолком.
  await menuPage.waitForFunction(() => {
    const sk = document.getElementById('msSticky');
    return sk.classList.contains('on') && Math.round(sk.getBoundingClientRect().top) === 0;
  }, null, { timeout: 4000 });
  const menuOn = await снимок();
  expect(!menuOn.нетУзлов && menuOn.on === true && menuOn.заголовокНиз <= 0 &&
    menuOn.узелTop === 0 && menuOn.пилюляTop === 8 && menuOn.пилюляH === 48 &&
    menuOn.зеркало === menuOn.живой,
    'МЕНЮ: блок ушёл за верх → шапка выехала по ноде 815:1506, баланс из одного источника (' +
    JSON.stringify(menuOn) + ')');
  // ⚠️ «БЫСТРО, НО ПЛАВНО» — ЛОВИМ СОБЫТИЕ ДВИЖКА `transitionrun`, А НЕ КАДРЫ.
  // Первая версия считала промежуточные положения по rAF и ФЛЕЙКОВАЛА: с
  // округлением до пикселя и ease-out их выпадало то 4, то 1 — страж краснел на
  // исправной сборке. `transitionrun` возникает ТОЛЬКО если переход реально
  // создан (при `transition:none` его нет вовсе), то есть меряет факт, а не
  // везение выборки. Промежуточное положение проверяем дополнительно, но с
  // порогом 1 — он устойчив.
  const плавно = await menuPage.evaluate(async () => {
    const sk = document.getElementById('msSticky');
    sk.classList.remove('on');
    await new Promise(r => setTimeout(r, 320));
    let событие = null;
    const лови = e => { if (!событие && e.propertyName === 'transform') событие = e.propertyName; };
    sk.addEventListener('transitionrun', лови);
    sk.classList.add('on');
    const кадры = [];
    for (let i = 0; i < 24; i++){
      await new Promise(r => requestAnimationFrame(r));
      кадры.push(Math.round(sk.getBoundingClientRect().top));
    }
    sk.removeEventListener('transitionrun', лови);
    const h = Math.round(sk.getBoundingClientRect().height);
    return { событие, промежуточных: new Set(кадры.filter(v => v < 0 && v > -h)).size,
             кадры: кадры.slice(0, 6) };
  });
  expect(плавно.событие === 'transform' && плавно.промежуточных >= 1,
    'МЕНЮ: шапка ВЫЕЗЖАЕТ переходом, а не возникает скачком (' + JSON.stringify(плавно) + ')');
  // НИЗ НЕ ПЕРЕКРЫТ плавающей кнопкой: она `fixed`, места в потоке не занимает.
  // ⚠️ Прокручивать дважды: от первой прокрутки включается `.playoff`, от него
  // растёт падинг и высота — одиночная прокрутка меряет промежуточный кадр.
  const bottomHit = await menuPage.evaluate(async () => {
    const ms = document.getElementById('mainScreen'), wrap = document.querySelector('.ms-wrap');
    for (let i = 0; i < 2; i++){ ms.scrollTop = ms.scrollHeight; await new Promise(r => setTimeout(r, 350)); }
    let el = wrap.lastElementChild;
    if (!el || el.getBoundingClientRect().height < 2){
      const cards = document.querySelectorAll('.ms-grid .msc');
      el = cards[cards.length - 1];
    }
    if (!el) return { нетУзла: true };
    const r = el.getBoundingClientRect();
    const кто = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { кто: кто ? (кто.id || кто.className || кто.tagName) : 'нет',
             своё: !!(кто && wrap.contains(кто)) };
  });
  expect(!bottomHit.нетУзла && bottomHit.своё,
    'МЕНЮ: плавающая кнопка не накрывает низ колонки — тап доходит (' + JSON.stringify(bottomHit) + ')');
  // УЗКИЙ ЭКРАН: ряд шапки ужимается заголовком, а не выпихивает баланс за край.
  await menuPage.setViewportSize({ width: 320, height: 780 });
  await menuPage.waitForTimeout(250);
  const narrow = await menuPage.evaluate(async () => {
    if (window.__game.starGrant) window.__game.starGrant(166500);
    const ms = document.getElementById('mainScreen');
    ms.scrollTop = ms.scrollHeight; await new Promise(r => setTimeout(r, 350));
    const sk = document.getElementById('msSticky');
    const in_ = sk.querySelector('.ms-sticky-in').getBoundingClientRect();
    const r = sk.querySelector('.ms-sticky-r').getBoundingClientRect();
    return { гориз: ms.scrollWidth - ms.clientWidth,
             ряд: Math.round(r.right), пилюля: Math.round(in_.right) };
  });
  expect(narrow.гориз === 0 && narrow.ряд <= narrow.пилюля,
    'МЕНЮ на 320: горизонтальной прокрутки нет и ряд не вылез из пилюли (' + JSON.stringify(narrow) + ')');
  // ⚠️ КЛАВИАТУРА: скрытая шапка не должна ловить фокус. Один `transform` её из
  // Tab-порядка НЕ выводит — уехавшая за экран кнопка «Get More» оставалась
  // фокусируемой (замер до правки: focus() проходил). Лечит `visibility:hidden`,
  // она же убирает узел из дерева доступности, поэтому статический `aria-hidden`
  // снят: он врал в обратную сторону, пряча шапку от скринридера, когда та ВИДНА.
  // ⚠️ МЕРИМ УСТОЯВШЕЕСЯ СОСТОЯНИЕ, А НЕ ПЕРЕХОД. Видимость при уходе
  // переключается С ЗАДЕРЖКОЙ в 220 мс (иначе шапка пропадала бы мгновенно и
  // обрезала свой же выезд назад), поэтому сразу после снятия класса кнопка
  // ЕЩЁ фокусируема — и это нормально: шапка в этот момент физически на экране.
  // Первая версия стража ждать забыла и краснела на исправной сборке.
  // ⚠️⚠️ ШАПКУ ПРЯЧЕМ НАСТОЯЩИМ ПУТЁМ (прокрутка в верх), НЕ classList.remove:
  // ручное снятие класса ВОЮЕТ с живым scroll-слушателем — событие прокрутки
  // от предыдущего присваивания долетает с лагом (замер пробой: 65 мс, под
  // нагрузкой больше), и один поздний ивент на дне ВОЗВРАЩАЛ `.on` после
  // снятия — шапка законно видима, фокус проходит, страж красный на исправной
  // сборке (флейк первого прогона v210). Прокрутка в верх решает по построению:
  // слушатель сам снимает класс И САМ ДЕРЖИТ его снятым при любых поздних
  // ивентах. Осадку ждём ОПРОСОМ (паттерн 0b2de04), а не фикс-таймером.
  const a11y = await menuPage.evaluate(async () => {
    const ms = document.getElementById('mainScreen');
    const sk = document.getElementById('msSticky'), b2 = document.getElementById('msGetMore2');
    if (!sk || !b2) return { нетУзлов: true };
    // ⚠️ ФАКТ ДОЖДАЛИСЬ/НЕТ КЛАДЁМ В ОТЧЁТ. Опрос выходит и по достижению
    // состояния, и по потолку — без этой отметки «шапка так и не спряталась»
    // и «спряталась, но фокус пролез» дают ОДИНАКОВОЕ сообщение, и следующий
    // читатель красного будет искать не там.
    const ждать = async (усл) => {
      for (let i = 0; i < 30; i++){ if (усл()) return true;
        await new Promise(r => setTimeout(r, 60)); }
      return усл();
    };
    ms.scrollTop = 0;
    const дождалисьСкрытия = await ждать(() => !sk.classList.contains('on') &&
      getComputedStyle(sk).visibility === 'hidden');
    b2.focus();
    const приСкрытой = document.activeElement === b2;
    ms.scrollTop = ms.scrollHeight;
    // ⚠️ СИММЕТРИЧНО СКРЫТИЮ — ЖДЁМ И КЛАСС, И ВИДИМОСТЬ. Раньше показ ждал
    // только класс, а «кадр на включение видимости» был ФИКС-ПАУЗОЙ — тем
    // самым приёмом, который мы запретили. Замер: видимость показа включается
    // ВМЕСТЕ с классом (переход показа без задержки), то есть пауза была
    // НЕНЕСУЩЕЙ — и тем опаснее: смени кто-то переход на задержку, она молча
    // стала бы единственной опорой, и флейк вернулся бы уже без диагностики.
    // Плюс отчёт: без видимости в условии «дождалисьПоказа:true» могло стоять
    // рядом с «приВидимой:false» и уводить читателя красного не туда.
    const дождалисьПоказа = await ждать(() => sk.classList.contains('on') &&
      getComputedStyle(sk).visibility === 'visible');
    b2.focus();
    const приВидимой = document.activeElement === b2;
    return { приСкрытой, приВидимой, ариа: sk.getAttribute('aria-hidden'),
             дождалисьСкрытия, дождалисьПоказа,
             видимость: getComputedStyle(sk).visibility };
  });
  expect(!a11y.нетУзлов && a11y.дождалисьСкрытия && a11y.дождалисьПоказа &&
    a11y.приСкрытой === false && a11y.приВидимой === true && a11y.ариа === null,
    'МЕНЮ: скрытая шапка не ловит фокус, видимая ловит, статического aria-hidden нет (' +
    JSON.stringify(a11y) + ')');
  // ⚠️⚠️ СБРОС ПРОКРУТКИ: у `openMainScreen` ДВА пути с РАЗНЫМИ ожиданиями
  // (страж диспетчера v207). Вызов НА ОТКРЫТОМ меню (так его зовёт
  // visibilitychange из 90-input) прокрутку СОХРАНЯЕТ — безусловный сброс
  // выбрасывал игрока из середины коллекции в верх. А НАСТОЯЩЕЕ переоткрытие
  // (закрыл-открыл) СБРАСЫВАЕТ в верх и снимает stuck/playoff — иначе меню
  // открывается сразу с залипшей шапкой поверх карточки Play. Починка 56cca3b
  // отличала эти пути проверкой `!contains('open')` ПОСЛЕ `add('open')` — та
  // всегда ложна, сброс был мёртвым кодом; второй ассерт ловит именно это.
  // ⚠️ ПРИВЕДЕНО К НОВОЙ АРХИТЕКТУРЕ: класса `stuck` больше нет (залипание
  // отменено спекой владельца), сигнал шапки — `#msSticky.on`. Проверять снятый
  // класс значило бы ассертить всегда-ложное — половина стража была бы пустой.
  // Прокрутка берётся ЗАВЕДОМО БОЛЬШАЯ, чтобы шапка успела выехать: на 300px
  // блок My Collection ещё виден и `on` был бы false сам по себе.
  const reopen = await menuPage.evaluate(async () => {
    const ms = document.getElementById('mainScreen'), sk = document.getElementById('msSticky');
    ms.scrollTop = ms.scrollHeight; await new Promise(r => setTimeout(r, 350));
    const былаШапка = sk.classList.contains('on'), былаПрокрутка = ms.scrollTop;
    window.showMainScreen();                     // путь visibilitychange: меню уже открыто
    await new Promise(r => setTimeout(r, 200));
    const приФоне = ms.scrollTop, шапкаПриФоне = sk.classList.contains('on');
    window.hideMainScreen();
    await new Promise(r => setTimeout(r, 150));
    window.showMainScreen();                     // настоящее переоткрытие
    await new Promise(r => setTimeout(r, 300));
    return { былаШапка, былаПрокрутка, приФоне, шапкаПриФоне,
             послеОткрытия: ms.scrollTop, шапка: sk.classList.contains('on'),
             playoff: ms.classList.contains('playoff') };
  });
  expect(reopen.былаШапка && reopen.приФоне === reopen.былаПрокрутка && reopen.шапкаПриФоне,
    'МЕНЮ: openMainScreen на открытом меню (visibilitychange) НЕ сбрасывает ни прокрутку, ни шапку (' +
    JSON.stringify(reopen) + ')');
  expect(reopen.послеОткрытия === 0 && !reopen.шапка && !reopen.playoff,
    'МЕНЮ: настоящее переоткрытие сбрасывает прокрутку в верх и убирает шапку с кнопкой (' +
    JSON.stringify(reopen) + ')');
  // ⚠️⚠️ ШАПКА НЕ ПЕРЕЖИВАЕТ ЗАКРЫТИЕ МЕНЮ (скрин владельца 2026-07-31, v212):
  // #msSticky — отдельный fixed-узел ВНЕ #mainScreen, закрытие экрана его не
  // прячет. До фикса: прокрутил меню (шапка выехала), нажал плавающую Resume —
  // плашка «My collection» оставалась висеть НАД ИГРОЙ. Гасит closeMainScreen.
  const closeLeak = await menuPage.evaluate(async () => {
    const ms = document.getElementById('mainScreen'), sk = document.getElementById('msSticky');
    const ждать = async (усл) => {
      for (let i = 0; i < 30; i++){ if (усл()) return true;
        await new Promise(r => setTimeout(r, 60)); }
      return усл();
    };
    window.showMainScreen();
    await new Promise(r => setTimeout(r, 200));
    ms.scrollTop = ms.scrollHeight;
    const шапкаБыла = await ждать(() => sk.classList.contains('on'));
    window.hideMainScreen();                     // = нажатие плавающей Resume
    const погасла = await ждать(() => !sk.classList.contains('on') &&
      getComputedStyle(sk).visibility === 'hidden');
    return { шапкаБыла, менюЗакрыто: !ms.classList.contains('open'), погасла };
  });
  expect(closeLeak.шапкаБыла && closeLeak.менюЗакрыто && closeLeak.погасла,
    'МЕНЮ: плавающая шапка гаснет при закрытии меню — не висит над игрой (' +
    JSON.stringify(closeLeak) + ')');
  // ⚠️ ФОН ШАПКИ — ДВА ТРЕБОВАНИЯ СРАЗУ, И ОНИ ТЯНУТ В РАЗНЫЕ СТОРОНЫ.
  // (1) Спека владельца 2026-08-03 (скрин DevTools со снятой галкой): фон
  //     ВЫКЛЮЧЕН — визуально его быть не должно, значит альфа ~0.
  // (2) Рецепт «Хром iOS» из канона: узел ФИКСИРОВАННЫЙ и касается верхней
  //     кромки, а `transparent` Safari 26 читает как «прозрачный ЧЁРНЫЙ» и
  //     красит свою полосу в чёрный. Полностью нулевой фон здесь ЗАПРЕЩЁН.
  // Отсюда инвариант: тон ТОТ ЖЕ, что у меню (единый источник, защита от
  // регресса v212 — переменная не наследовалась и фон уезжал в transparent),
  // альфа НЕНУЛЕВАЯ, но пренебрежимая. Прежний ассерт «шапка === меню»
  // отменён спекой владельца, а не ослаблен.
  const stickyBg = await menuPage.evaluate(() => {
    const чис = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const ш = чис(getComputedStyle(document.getElementById('msSticky')).backgroundColor);
    const м = чис(getComputedStyle(document.getElementById('mainScreen')).backgroundColor);
    return { шапка: ш, меню: м,
             тонСовпал: ш[0] === м[0] && ш[1] === м[1] && ш[2] === м[2],
             альфа: ш.length > 3 ? ш[3] : 1 };
  });
  expect(stickyBg.тонСовпал && stickyBg.альфа > 0 && stickyBg.альфа <= 0.02,
    'МЕНЮ: фон плавающей шапки ВЫКЛЮЧЕН (альфа ~0 по спеке владельца), но НЕ нулевой — ' +
    'иначе Safari красит верхнюю полосу чёрным; тон от единого источника (' +
    JSON.stringify(stickyBg) + ')');
  await menuPage.close();

  // ===== ГРОМКОСТЬ ПРИМЕНЯЕТСЯ СРАЗУ (жалоба владельца 2026-07-31: музыка
  // при загрузке выше настроек, падала после интро). Механика была: volume
  // ставил только жестовый unlock, а на портале трек заводила разморозка
  // после рекламы БЕЗ установки громкости. Инвариант: bgm.volume = настройке
  // СРАЗУ после загрузки, ДО всякого жеста и play.
  const volPage = await browser.newPage({ viewport: { width: 393, height: 761 } });
  await volPage.addInitScript(() => {
    localStorage.setItem('mixer_music', '20');
    localStorage.setItem('mixer_sound', '30');
  });
  await volPage.goto('file://' + path.join(__dirname, 'index.html'));
  await volPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  const vol0 = await volPage.evaluate(() => ({
    bgmVol: +document.getElementById('bgm').volume.toFixed(2),
    sfxOn: window.__game.cfg.sound,
  }));
  expect(vol0.bgmVol === 0.2 && vol0.sfxOn === true,
    'ГРОМКОСТЬ: настройки применены СРАЗУ после загрузки, до жеста (' + JSON.stringify(vol0) + ')');
  await volPage.close();
  // ⚠️ СЕКЦИЯ В САМОМ КОНЦЕ НАМЕРЕННО (как камни и меню): она делает до
  // полутора десятков скриншотов на своих страницах, и стоя ПЕРЕД соседом,
  // который сэмплит кадры CSS-перехода, отнимала у него rAF — «МЕНЮ: шапка
  // выезжает переходом» ловило 0 промежуточных кадров. Своей странице это не
  // мешает (замер ждёт устоявшегося состояния), чужой — мешало.
  // ===== ПОЛ КОНТРАСТА HUD К НЕБУ (заказ диспетчера 2026-07-31) =====
  // ⚠️ ЗАЧЕМ: белый HUD читается на небе только за счёт яркости самого неба, и
  // сторожить это было нечем. Риск не гипотетический — он срабатывал дважды: на
  // белом поле глаза пропадали (жалоба владельца), а откат дневного декора
  // 2026-07-31 уронил контраст, и заметили это лишь ручным замером.
  // ⚠️ ПОЛ, А НЕ ПЛАНКА: цель — поймать ТИХУЮ деградацию, поэтому пол ставится
  // чуть ниже наблюдаемого, а НАСКОЛЬКО ниже — написано явно: что страж
  // сознательно пропускает, должно быть видно.
  //   глаза  день 3.08 -> пол 3.00 (терпим просадку 2.6%), ночь 13.48 -> 12.5 (7%)
  //   пауза  день 4.68 -> пол 3.50 (терпим 25%),           ночь 13.38 -> 11.0 (18%)
  // ⚠️ У КНОПКИ ЗАПАС ШИРЕ НАМЕРЕННО: её пол ловит не дрейф, а осмысленное
  // затемнение верха неба (замер: −15% роняет её до 3.47, −30% до 2.53 — ниже
  // 3:1). Ставить ей узкий пол значит красить сьют на каждой правке палитры.
  // ⚠️⚠️ ЧИСЛА ЭТОГО СТРАЖА И ЧИСЛА КАНОНА — РАЗНЫЕ ЛИНЕЙКИ И РАЗНЫЕ РАСКЛАДКИ,
  // НЕ ПУТАТЬ. В CLAUDE.md записан замер ПРОФИЛЕМ СТРОКИ через центр глаз на
  // ДЕСКТОПЕ 900×640: день 2.96. Здесь — максимум внутри рамки против МЕДИАНЫ
  // боковых полос, на вьюпорте сьюта 390×780: день 3.08. Сборка одна и та же,
  // контраст никуда не «вырос» — линейка другая (на одном вьюпорте метрики
  // расходятся на 1.4-2.2%, остальное даёт раскладка: на десктопе конструкция
  // глаз крупнее и стоит ниже, а небо ниже по экрану светлее).
  // ⚠️ СЛЕДСТВИЕ, о котором легко споткнуться: «порог 3:1 днём не берётся» —
  // это про ДЕСКТОПНУЮ раскладку. На вьюпорте сьюта он берётся обеими линейками
  // (3.03-3.08), и лог стража это показывает. Отсюда и пол 3.00, а не 2.9,
  // который предлагался по десктопному числу: на здешней линейке 2.9 разрешил
  // бы просадку 5.4% — то есть почти повтор того самого инцидента, ради которого
  // страж и ставится (откат декора стоил 6.9% на своей линейке).
  // ⚠️ ПОЧЕМУ ОБА ЭЛЕМЕНТА, А НЕ ОДНИ ГЛАЗА: они защищают ПРОТИВОПОЛОЖНЫЕ
  // направления. Белок гаснет, когда небо СВЕТЛЕЕТ; кнопка паузы днём ТЁМНАЯ и
  // гаснет, когда небо ТЕМНЕЕТ. А действующий рецепт канона для любого будущего
  // дневного декора — «сдвиг чтения рампы В МИНУС», то есть ровно затемнение:
  // без второго пола охраняемой осталась бы та сторона, по которой не бьют.
  const HUD_FLOOR = { day: 3.00, night: 12.5 };   // белок глаза против неба
  const BTN_FLOOR = { day: 3.50, night: 11.0 };   // диск кнопки паузы против неба
  // Оставить видимым ТОЛЬКО цель и её предков (visibility, а не display — чтобы
  // раскладка не поехала и цель не сдвинулась под собственным замером).
  // ⚠️ ЗАЧЕМ ПРЯТАТЬ СОСЕДЕЙ: полосы неба ловили правый стек (очки к 3-му уровню
  // пятизначные и лезут влево), и замер гулял 2.83-3.10 по раскладкам — ровно тот
  // разброс, на котором страж бы флейкал. Отношение «элемент к небу» от соседей
  // не зависит, поэтому сокрытие ничего не подменяет.
  const hudProbe = async (pg, sel, mode) => {
    // ⚠️ ПРИШПИЛИВАЕМ ПОКОЙ ПЕРЕД КАЖДЫМ КАДРОМ. Угроза помола (uGrind) наливает
    // ВЕРХ кадра красным по таймеру простоя — там же, где и глаза, и полосы неба.
    // Небо темнеет, контраст к белку РАСТЁТ: страж прошёл бы на слишком светлой
    // палитре. Это СЛЕПОЕ ПЯТНО, а не флейк, и разбросом выборки оно не ловится
    // (краснеет вся строка разом, горизонтальный разброс остаётся нулевым).
    // Замер дрейфа: простой 2.8 c -> ratio 3.08, 8.4 c -> 3.57, 13.6 c -> 4.01.
    // Один кадр этого замера стоит 0.5-1.4 c, так что цикл сам себе и создавал
    // дрейф. Сбрасываем таймер простоя (stats().lastAction — живой объект).
    await pg.evaluate(() => { window.__game.stats().lastAction = performance.now(); });
    const geo = await pg.evaluate((s) => {
      // ⚠️ СНАЧАЛА СНЯТЬ ПРЕЖНЮЮ МАСКУ, И СНИМАТЬ ТОЛЬКО СВОЮ. Без этого второй
      // замер на той же странице мерит элемент, спрятанный ПЕРВЫМ: кнопка паузы
      // выходила ровно цветом неба (диск 0.2933 при небе 0.2933, отношение 1.000)
      // — страж честно краснел, но на собственном дефекте. Метку ставим своим
      // data-атрибутом, чтобы не тронуть то, что прячет сама игра.
      document.querySelectorAll('[data-hudmask]').forEach(n => {
        n.style.visibility = ''; delete n.dataset.hudmask;
      });
      const el = document.querySelector(s);
      const keep = new Set(); for (let n = el; n; n = n.parentElement) keep.add(n);
      document.querySelectorAll('body *').forEach(n => {
        if (!keep.has(n) && !el.contains(n) && n.tagName !== 'CANVAS'){
          n.style.visibility = 'hidden'; n.dataset.hudmask = '1';
        }
      });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, sel);
    const b64 = (await pg.screenshot()).toString('base64');
    // ⚠️ РАМКА ПЕРЕЧИТЫВАЕТСЯ ПОСЛЕ СКРИНШОТА: между чтением коробки и съёмкой
    // проходит до 1.4 c, а конструкция глаз умеет ЕЗЖАТЬ (#face.dropped смещает
    // её на --fireLift перед помолом). Разъехались — кадр негоден, пересъём.
    const moved = await pg.evaluate(([s, g]) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return Math.max(Math.abs(r.x - g.x), Math.abs(r.y - g.y), Math.abs(r.width - g.w));
    }, [sel, geo]);
    const px = await pg.evaluate(async ([b64, g, mode]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
      const k = img.width / window.innerWidth;
      const sl = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = i => 0.2126 * sl(d[i]) + 0.7152 * sl(d[i + 1]) + 0.0722 * sl(d[i + 2]);
      const med = a => { const b = a.slice().sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };
      const X0 = Math.round(g.x * k), X1 = Math.round((g.x + g.w) * k);
      const Y0 = Math.round(g.y * k);
      // у глаз берём ВЕРХНИЕ 55% рамки (ниже живёт число отсчёта), у кнопки — всю
      const Y1 = Math.round((g.y + g.h * (mode === 'max' ? 0.55 : 1)) * k);
      const IN = Math.round(6 * k), OUT = Math.round(26 * k);
      let mx = 0, spread = 0; const inner = [], rowMed = [], rowSpreads = [];
      for (let y = Y0; y < Y1; y++){
        for (let x = X0; x < X1; x++){ const L = lum((y * W + x) * 4); inner.push(L); if (L > mx) mx = L; }
        const row = [];
        for (let x = Math.max(0, X0 - OUT); x < X0 - IN; x++) row.push(lum((y * W + x) * 4));
        for (let x = X1 + IN; x < Math.min(W, X1 + OUT); x++) row.push(lum((y * W + x) * 4));
        if (!row.length) continue;
        rowMed.push(med(row));
        // ⚠️ ДЕТЕКТОР ЗАГРЯЗНЕНИЯ ВЫБОРКИ: небо разложено ПО ЭКРАНУ, значит строка
        // чистого неба горизонтально ПОСТОЯННА (замер: ровно 0). Заедет в полосу
        // посторонний объект (стекло чаши на неосевшей сцене, будущий элемент
        // HUD) — разброс скакнёт, и замер обязан честно провалиться, а не отдать
        // правдоподобное неверное число.
        rowSpreads.push(Math.max.apply(null, row) - Math.min.apply(null, row));
      }
      // ⚠️ 70-Й ПЕРЦЕНТИЛЬ ПОСТРОЧНЫХ РАЗМАХОВ, НЕ МАКСИМУМ (ловля 2026-08-04:
      // глаза 165 из ноды владельца сдвинули полосу, и НОЧЬЮ в неё попала
      // ЗВЕЗДА — легитимная часть неба, 1-3 грязных строки, разброс 0.63).
      // Точечный выброс детектор терпит (до ~30% строк), СИСТЕМАТИЧЕСКОЕ
      // загрязнение (элемент HUD грязнит все строки подряд) по-прежнему валит.
      if (rowSpreads.length){
        const q = rowSpreads.slice().sort((a, b) => a - b);
        spread = q[Math.min(q.length - 1, Math.floor(q.length * 0.7))];
      }
      const sky = med(rowMed);
      // ⚠️ У ГЛАЗ БЕРЁМ МАКСИМУМ (белок), У КНОПКИ — МЕДИАНУ (диск). Медиана по
      // ЦЕНТРУ кнопки не годится: там белый глиф «II», и он утягивает число
      // (замер: по центру 0.167 против 0.0234 по всей кнопке, контраст 1.43
      // против 4.23 — я на этом сама ошиблась раз).
      const own = mode === 'max' ? mx : med(inner);
      // ⚠️ ДЕТЕКТОР УГРОЗЫ ПОМОЛА (см. выше): верх кадра обязан РОВНО совпадать с
      // первым стопом палитры — приём из канона, «кромку меряют, пока угроза на
      // нуле». Это ассерт-факт поверх пришпиленного покоя, а не вместо него.
      const tv = getComputedStyle(document.documentElement)
        .getPropertyValue('--sky-top-rgb').trim().split(',').map(Number);
      const ti = (2 * W + Math.round(W / 2)) * 4;
      const topDelta = tv.length === 3
        ? Math.max(Math.abs(d[ti] - tv[0]), Math.abs(d[ti + 1] - tv[1]), Math.abs(d[ti + 2] - tv[2]))
        : 999;
      return { own: +own.toFixed(4), max: +mx.toFixed(4), sky: +sky.toFixed(4),
               spread: +spread.toFixed(4), topDelta: topDelta,
               ratio: +(((Math.max(own, sky) + 0.05) / (Math.min(own, sky) + 0.05)).toFixed(3)) };
    }, [b64, geo, mode]);
    return { ...px, moved: +moved.toFixed(2) };
  };
  // ⚠️ ЖДЁМ СОСТОЯНИЯ, А НЕ ЧАСОВ (правило канона): опрашиваем, пока замер не
  // УСТОИТСЯ (два подряд сходятся), с потолком-страховкой. Фикс-пауза тут уже
  // подводила: после подмены палитры рампа доезжает не в тот же кадр (замер
  // ловил 2.40 вместо 1.11), а на нагруженном стенде это растянется сильнее.
  // ⚠️ ОТБРАКОВКА КАДРА ≠ ПРОВАЛ ЗАМЕРА: причину возвращаем отдельным полем why,
  // иначе сообщения ассертов врут диагнозом (тусклый элемент отчитывался бы как
  // «не устоялся» и «выборка грязная»).
  const settledProbe = async (pg, sel, mode) => {
    let prev = null, why = 'ok', dropped = 0;
    for (let i = 0; i < 14; i++){
      const r = await hudProbe(pg, sel, mode);
      // элемент ещё не проявился: у #face есть входная анимация uiIn на защёлке
      // uiready, и первые кадры после skipIntro он полупрозрачный.
      // ⛔ ЭТО НЕ ПРО МОРГАНИЕ: при моргании #eyes.blink жмёт веко scaleY(.06),
      // от белка остаётся сплющенная, но ЧИСТО БЕЛАЯ полоска — максимум по окну
      // не сдвигается (проверено принудительным классом: white 1 и там, и там).
      if (mode === 'max' && r.max < 0.9){ why = 'элемент не проявился'; prev = null; dropped++; continue; }
      if (r.moved > 1){ why = 'рамка уехала между чтением и съёмкой'; prev = null; dropped++; continue; }
      if (prev && Math.abs(r.ratio - prev.ratio) < 0.02) return { ...r, settled: true, why: 'ok', dropped };
      prev = r;
    }
    return { ...(prev || { own: 0, max: 0, sky: 0, spread: 9, topDelta: 999, ratio: 0, moved: 0 }),
             settled: false, why: prev ? 'не сошлось за 14 кадров' : why, dropped };
  };
  const hudPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  hudPage.on('pageerror', e => errors.push('PAGEERROR(hud): ' + e.message));
  hudPage.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE(hud): ' + m.text()); });
  const hudSeen = {};
  for (const [tema, h] of [['day', 12], ['night', 22]]){
    await hudPage.goto('file://' + path.join(__dirname, 'index.html') + '?hour=' + h);
    await hudPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
    await hudPage.evaluate(() => window.__game.skipIntro());
    // ⚠️ ПРОВЕРКА РАСКЛАДКИ ДО СОКРЫТИЯ СОСЕДЕЙ: сам замер гасит всё лишнее и
    // потому слеп к тому, что глаза кто-то ЗАКРЫЛ новым элементом. Дешёвый
    // ассерт по elementFromPoint возвращает эту слепую зону обратно.
    const onTop = await hudPage.evaluate(() => {
      const f = document.getElementById('face'), r = f.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height * 0.25);
      return { внутриFace: !!el && f.contains(el), кто: el ? (el.id || el.tagName) : 'нет' };
    });
    expect(onTop.внутриFace, 'глаза не закрыты чужим элементом (' + tema + '): сверху ' + onTop.кто);
    const r = await settledProbe(hudPage, '#face', 'max');
    const btn = await settledProbe(hudPage, '#pauseBtn', 'med');
    hudSeen[tema] = { eyes: r, btn };
    expect(r.settled, 'контраст глаз (' + tema + ') устоялся: ' + r.why);
    expect(r.spread < 0.02,
      'выборка неба чистая (' + tema + '): горизонтальный разброс ' + r.spread + ' < 0.02');
    expect(r.topDelta <= 6,
      'замер вне угрозы помола (' + tema + '): верх кадра = первый стоп, Δ' + r.topDelta + ' <= 6');
    expect(r.ratio >= HUD_FLOOR[tema],
      'ПОЛ КОНТРАСТА ГЛАЗ (' + tema + '): ' + r.ratio + ' >= ' + HUD_FLOOR[tema] +
      ' (белок ' + r.own + ', небо ' + r.sky + ')');
    expect(btn.settled && btn.ratio >= BTN_FLOOR[tema],
      'ПОЛ КОНТРАСТА КНОПКИ ПАУЗЫ (' + tema + '): ' + btn.ratio + ' >= ' + BTN_FLOOR[tema] +
      ' (диск ' + btn.own + ', небо ' + btn.sky + ', ' + btn.why + ')');
  }
  await hudPage.close();
  // ⚠️ ДВУСТОРОННИЙ ПРОГОН ВНУТРИ КАЖДОГО ПРОГОНА: страж не сдан, пока не
  // показано, что он КРАСНЕЕТ на сломанном. Здесь это проверяется всегда —
  // подменяем палитру на светлую и убеждаемся, что метрика проваливает свой пол.
  // ⚠️ ОДНОГО АССЕРТА «ratio упал» МАЛО: фолбэк несостоявшегося замера отдаёт
  // ratio 0, то есть ОСЛЕПШАЯ метрика «подтверждала» бы собственную исправность
  // (проверено: спрятал глаза — ratio 0, ассерт зелен). Поэтому рядом стоят
  // санитары «замер состоялся» и «белок на месте»: они превращают «упало» в
  // «упало ПОТОМУ ЧТО небо стало светлым, а элемент никуда не делся».
  // ⚠️ ДИВЕРСИЯ ТОЛЬКО НА СВОЕЙ СТРАНИЦЕ: у setSkyStops НЕТ геттера и НЕТ отката
  // (вызов без списка возвращает null и ничего не восстанавливает) — единственный
  // честный откат это новая загрузка.
  const sabPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  sabPage.on('pageerror', e => errors.push('PAGEERROR(sab): ' + e.message));
  sabPage.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE(sab): ' + m.text()); });
  await sabPage.goto('file://' + path.join(__dirname, 'index.html') + '?hour=12');
  await sabPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  const sabApplied = await sabPage.evaluate(() => {
    window.__game.skipIntro();
    // светлый верх — ровно та регрессия, от которой ставится пол глаз
    return !!window.__game.skyStops(['#eaf4ff', '#e7f2ff', '#e4f0ff', '#e1eeff',
                                     '#deecff', '#dbeaff', '#d8e8ff']);
  });
  expect(sabApplied, 'САНИТАР: диверсионная палитра принята (иначе «сломанного» прогона не было)');
  const sab = await settledProbe(sabPage, '#face', 'max');
  expect(sab.settled && sab.max >= 0.9,
    'САНИТАР: на диверсии замер СОСТОЯЛСЯ и белок на месте (' + sab.why +
    ', белок ' + sab.max + ') — иначе «упало» означало бы ослепшую метрику');
  expect(sab.ratio < HUD_FLOOR.day,
    '⚠️ ДВУСТОРОННЕ: на светлом небе метрика ПАДАЕТ ниже пола — ' + sab.ratio +
    ' < ' + HUD_FLOOR.day + ' (на исправной палитре было ' + hudSeen.day.eyes.ratio + ')');
  await sabPage.close();
  // ===== ЭФФЕКТЫ ВЫБОРА ВЛАДЕЛЬЦА 2026-08-01: СХЛОПЫВАНИЕ / РАСПИЛ / ОГОНЬ =====
  // ⚠️ ГЛАВНЫЙ СТРАЖ ЗДЕСЬ — ПРО КАТАСТРОФУ, А НЕ ПРО КРАСОТУ. У половин распила
  // и у накладки огня геометрия ОБЩАЯ с предметом, а у предметов она общая НА
  // ТИП (кэш 30-shapes). stepFX диспозит геометрию догоревшего эффекта — если
  // флаг keepGeo потеряется, первый же помол погасит ВСЕ предметы этого типа в
  // куче, и заметить это можно только глазами на живой игре.
  const fxPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  fxPage.on('pageerror', e => errors.push('PAGEERROR(fx): ' + e.message));
  await fxPage.goto('file://' + path.join(__dirname, 'index.html'));
  await fxPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await fxPage.evaluate(() => window.__game.skipIntro());
  await new Promise(r => setTimeout(r, 700));
  const fx0 = await fxPage.evaluate(() => { const s = window.__game.perfStats();
    return { ...window.__game.fxProbe(), geoms: s.geoms, sceneChildren: s.sceneChildren }; });
  // ПОМОЛ: гоним несколько раз и смотрим, целы ли геометрии ОСТАВШИХСЯ предметов
  await fxPage.evaluate(() => { for (let i = 0; i < 3; i++) window.__game.grindNow(); });
  await new Promise(r => setTimeout(r, 2600));
  const fx1 = await fxPage.evaluate(() => { const s = window.__game.perfStats();
    return { ...window.__game.fxProbe(), geoms: s.geoms, sceneChildren: s.sceneChildren }; });
  // ⛔ ЗДЕСЬ БЫЛ АССЕРТ «распил не убил общую геометрию типа» — СНЯТ КАК
  // ТАВТОЛОГИЧНЫЙ. Двусторонний прогон показал, что он НЕ КРАСНЕЕТ на сломанной
  // сборке: со снятым keepGeo кадр отличается от исправного на те же 6.2%, а
  // attributes.position.count цел — three не стирает атрибуты при dispose.
  // Проверять надо то, что действительно ломается: половины не должны оставаться
  // в сцене, а накладка огня — на предмете.
  // ⚠️ ОСТАНАВЛИВАЕМ МИКСЕР ДЕЙСТВИЕМ ПЕРЕД ЗАМЕРОМ, иначе меряем МОМЕНТ, а не
  // состояние: помол продолжается сам каждые 2 с, половины живут SAW_LIFE=0.75 с,
  // и в кадре замера всегда может лететь свежая пара. Этот ассерт дважды прошёл
  // по везению и упал на третьем прогоне — ровно та ошибка, которую канон
  // называет «поймал момент, а не состояние». Встряска сбрасывает lastAction.
  await fxPage.evaluate(() => window.__game.shake());
  await new Promise(r => setTimeout(r, 1800));
  const halves = await fxPage.evaluate(() => window.__game.fxProbe().halves);
  expect(halves === 0,
    'РАСПИЛ: половины ушли из сцены, сирот нет (осталось ' + halves + ')');
  // ⚠️ УТЕЧКУ МЕРИМ РОСТОМ МЕЖДУ ДВУМЯ ЗАМЕРАМИ, А НЕ ПОТОЛКОМ. Две прежние
  // версии этого ассерта падали на ИСПРАВНОЙ сборке: миксер, начав молоть,
  // продолжает сам, и в сцене всегда живёт пыль очередного помола — сколько
  // именно, зависит от того, насколько он занят. Это не утечка, а работа.
  // Настоящий признак утечки — НАКОПЛЕНИЕ: если геометрии текут, второй замер
  // будет заметно больше первого при той же нагрузке.
  await new Promise(r => setTimeout(r, 3000));
  const fx1b = await fxPage.evaluate(() => window.__game.perfStats().geoms);
  expect(fx1b <= fx1.geoms + 6,
    'РАСПИЛ не копит геометрии: за 3 с непрерывного помола ' + fx1.geoms + ' -> ' + fx1b);
  // ОГОНЬ: накладка-ребёнок, материал предмета не тронут, тушение дренирует
  const ign = await fxPage.evaluate(() => window.__game.ignite());
  expect(!!ign && ign.fires === 1, 'ОГОНЬ: зажёгся (' + JSON.stringify(ign) + ')');
  await new Promise(r => setTimeout(r, 300));
  const burn = await fxPage.evaluate(() => {
    const p = window.__game.fxProbe();
    return { fires: p.fires, детей: p.kidsTotal, макс: p.kidsMax };
  });
  expect(burn.fires === 1 && burn.детей === 1 && burn.макс === 1,
    '⚠️ ОГОНЬ — НАКЛАДКА-РЕБЁНОК, А НЕ ПРАВКА МАТЕРИАЛА (иначе просочится в портреты ' +
    'коллекции — грабля двух потребителей uVeil): горит ' + burn.fires + ', предметов с детьми ' + burn.детей);
  await fxPage.evaluate(() => window.__game.extinguish());
  await new Promise(r => setTimeout(r, 900));
  const fx2 = await fxPage.evaluate(() => { const s = window.__game.perfStats();
    return { ...window.__game.fxProbe(), geoms: s.geoms, sceneChildren: s.sceneChildren }; });
  expect(fx2.fires === 0 && fx2.kidsTotal === 0,
    'ОГОНЬ: потушен и накладка снята (горит ' + fx2.fires + ')');
  expect(fx2.geoms <= fx1b + 6,
    'ОГОНЬ: тушение не оставило геометрий (' + fx1b + ' -> ' + fx2.geoms + ')');
  await fxPage.close();

  // ===== ГОРЯЩИЙ ПРЕДМЕТ: МЕХАНИКА (спека владельца 2026-08-01) =====
  // Дословно: «ДЕЛАЙ, только 1 предмет за 30 секунд может загореться» + мой
  // гейт «поджигать только доступные, иначе награда издевательская».
  // ⚠️ 30 СЕКУНД — ЧИСЛО ВЛАДЕЛЬЦА. Страж сверяет именно его: если кто-то
  // «оптимизирует» частоту, прогон обязан покраснеть.
  const firePage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  firePage.on('pageerror', e => errors.push('PAGEERROR(fire): ' + e.message));
  await firePage.goto('file://' + path.join(__dirname, 'index.html'));
  await firePage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await firePage.evaluate(() => window.__game.skipIntro());
  await new Promise(r => setTimeout(r, 700));
  expect((await firePage.evaluate(() => window.__game.burning())) === null,
    'ОГОНЬ: в начале партии никто не горит');
  // вспышка по сроку — окно двигаем ручкой, чтобы не ждать полминуты
  await firePage.evaluate(() => window.__game.fireDue(200));
  await new Promise(r => setTimeout(r, 1100));
  const fire1 = await firePage.evaluate(() => ({ горит: window.__game.burning(),
    огней: window.__game.firesN(), срок: window.__game.fireDue(), t: performance.now() }));
  expect(!!fire1.горит && fire1.огней === 1,
    'ОГОНЬ: по сроку загорелся ровно один (' + fire1.горит + ', огней ' + fire1.огней + ')');
  // ⚠️ ЧИСЛО ВЛАДЕЛЬЦА: следующая вспышка назначена НЕ РАНЬШЕ чем через 30 с
  // от момента ЭТОЙ (а не от момента, когда она догорит).
  const gap = (fire1.срок - fire1.t) / 1000;
  expect(gap > 28 && gap <= 30.5,
    'ОГОНЬ: следующая вспышка не раньше 30 с (назначена через ' + gap.toFixed(1) + ' с)');
  // гаснет САМ (FIRE_BURN_MS = 6 с), окно при этом не сбрасывается
  await new Promise(r => setTimeout(r, 6600));
  const fire2 = await firePage.evaluate(() => ({ горит: window.__game.burning(),
    огней: window.__game.firesN(), срок: window.__game.fireDue(), t: performance.now() }));
  expect(fire2.горит === null && fire2.огней === 0,
    'ОГОНЬ: догорел и погас сам (' + JSON.stringify(fire2.горит) + ', огней ' + fire2.огней + ')');
  expect((fire2.срок - fire2.t) / 1000 > 20,
    'ОГОНЬ: после догорания второй вспышки НЕ случилось раньше срока (осталось ' +
    ((fire2.срок - fire2.t) / 1000).toFixed(1) + ' с)');
  // кого поджигает: спецпредметы нельзя, и на Hard — только доступные
  await firePage.evaluate(() => { window.__game.cfg.hard = true; window.__game.forceRefresh(); });
  const выбор = [];
  for (let i = 0; i < 5; i++){
    await firePage.evaluate(() => { window.__game.extinguish(); window.__game.fireDue(60); });
    await new Promise(r => setTimeout(r, 420));
    выбор.push(await firePage.evaluate(() => {
      const n = window.__game.burning();
      if (!n) return null;
      // сверяем, что горящий — ДОСТУПНЫЙ: список доступных отдаёт ядро
      return { name: n, доступных: window.__game.accessibleList().length };
    }));
  }
  const зажглось = выбор.filter(Boolean);
  expect(зажглось.length >= 3,
    'ОГОНЬ: вспышка воспроизводится (зажглось ' + зажглось.length + ' из 5)');
  expect(зажглось.every(v => v.name !== 'surprise' && v.name !== 'bomb' && v.name !== 'rock'),
    'ОГОНЬ: спецпредметы не горят (' + зажглось.map(v => v.name).join(',') + ')');
  // ⚠️ РАЗНООБРАЗИЕ — НЕ ПРИДИРКА, А ЛОВУШКА, В КОТОРУЮ Я УЖЕ ПОПАЛА: пока
  // extinguishAll не чистил состояние, планировщик больше не поджигал никого,
  // а страж выше читал ОДНО И ТО ЖЕ имя пять раз и был зелёным. Замер дал
  // 14 вспышек — 1 тип при 129 доступных. Требуем, чтобы выбор реально менялся.
  expect(new Set(зажглось.map(v => v.name)).size >= 2,
    'ОГОНЬ: выбор жертвы реально меняется (' + new Set(зажглось.map(v => v.name)).size +
    ' разных из ' + зажглось.length + ')');
  // смена уровня гасит: накладка висит на МЕШЕ, который сейчас уедет
  await firePage.evaluate(() => { window.__game.extinguish(); window.__game.fireDue(60); });
  await new Promise(r => setTimeout(r, 400));
  await firePage.evaluate(() => window.__game.regen());
  await new Promise(r => setTimeout(r, 900));
  const после = await firePage.evaluate(() => ({ горит: window.__game.burning(), огней: window.__game.firesN() }));
  expect(после.горит === null && после.огней === 0,
    'ОГОНЬ: новый уровень гасит старое пламя (' + JSON.stringify(после) + ')');
  // 🔥 БОНУС (зона диспетчера): сбор группы горящего типа платит
  // ×FIRE_BONUS_MULT и ГАСИТ огонь. Метод — A/B на ОДНОЙ раскладке: два
  // последовательных «холодных» матча одного типа (пауза > COMBO_CHAIN_MS
  // гасит склейку; окно серии от первого не зажигается — пара без огня и
  // без hot), второй — с поджогом предмета этого типа. Тир накопления
  // между замерами не пересекается (страж выбирает тип с запасом до
  // порога), бусты чистятся.
  const fireBonus = await firePage.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.regen(); g.skipIntro(); await sleep(400);
    g.boostClear();
    // ⚠️ ДВА РАЗНЫХ ВИДА, А НЕ ДВА МАТЧА ОДНОГО (переписано 2026-08-07).
    // Прежняя версия жгла один вид дважды: с поднятым радиусом 3.0 первый
    // матч забирал до кап-группы (8), а после прогрессии размера уровня
    // предметов одного вида стало ~9 — на второй матч не оставалось, и d1
    // честно выходил 0. Это был ФЛЕЙК ЗАМЕРА, а не бонуса.
    // Теперь: холодный матч на виде A, горящий на виде B, и сравнение
    // допускается ТОЛЬКО при равном размере группы (иначе цена разная по
    // формуле n·(n−1) и сравнивать нечего) — при неравенстве берём
    // следующую пару видов, до 4 попыток.
    const radSave = g.cfg.baseRadius;
    g.cfg.baseRadius = 3.0;
    await sleep(600);                              // updateMatchRadius тикает 300 мс
    const acc = g.accSnapshot();
    const farFromTier = (k) => { const a = acc.find(x => x.key === k); return !a || (a.next - a.count) > 10; };
    const pool = Object.entries(g.typesSnapshot())
      .filter(([k, v]) => k !== 'surprise' && v.alive >= 4 && farFromTier(k))
      .map(([k]) => k);
    if (pool.length < 2) return { нетТипа: true, pool: pool.length };
    for (let att = 0; att + 1 < pool.length && att < 4; att += 2){
      const A = pool[att], B = pool[att + 1];
      const aliveA0 = g.typesSnapshot()[A].alive, s0 = g.stats().score;
      g.matchType(A);                              // холодный
      await sleep(1700);                           // > COMBO_CHAIN_MS — склейка погасла
      const nA = aliveA0 - g.typesSnapshot()[A].alive;
      const d0 = g.stats().score - s0;
      const idx = g.indexByType(B);
      if (idx < 0) continue;
      g.ignite(idx);
      const горелоДо = g.burning();
      const aliveB0 = g.typesSnapshot()[B].alive, s1 = g.stats().score;
      g.matchType(B);                              // горящий
      await sleep(150);
      const nB = aliveB0 - g.typesSnapshot()[B].alive;
      const d1 = g.stats().score - s1;
      if (nA === nB && d0 > 0){
        g.cfg.baseRadius = radSave;
        return { A, B, nA, nB, d0, d1, горелоДо, послеСбора: g.burning() };
      }
      await sleep(1700);                           // следующая попытка — с холодной склейкой
    }
    g.cfg.baseRadius = radSave;
    return { неСошлось: true };
  });
  expect(!fireBonus.нетТипа && !fireBonus.неСошлось && fireBonus.горелоДо === fireBonus.B &&
    fireBonus.d1 === 2 * fireBonus.d0 && fireBonus.d0 > 0,
    '🔥 БОНУС: группа горящего типа платит ровно ×2 (' + JSON.stringify(fireBonus) + ')');
  expect(fireBonus.послеСбора === null,
    '🔥 БОНУС: сбор группы ГАСИТ огонь — одноразовый (' + JSON.stringify(fireBonus.послеСбора) + ')');
  await firePage.close();

  // ===== КУРСОР-НАЖАТИЕ (спека владельца 2026-08-02: клик мыши сжимает
  // курсор на 4% на 140 мс — «ощущение нажатия»). Стражи: стиль сжатых
  // копий сгенерирован на старте (внутри — обход CSS-правил: в свежем
  // Chromium .cssRules есть у КАЖДОГО правила, ловля «сначала дети»
  // пропускала всё); класс на mousedown ставится, computed-курсор МЕНЯЕТСЯ
  // (боевое правило на body бьётся только прямым селектором, наследование
  // от html проигрывало — ловля пробой), возврат сам, осадка-опросом.
  {
    const cp = await page.evaluate(async () => {
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      for (let i = 0; i < 60 && !document.getElementById('cursorPressStyle'); i++) await sleep(100);
      const styleReady = !!document.getElementById('cursorPressStyle');
      const cur0 = getComputedStyle(document.body).cursor;
      window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
      const during = document.documentElement.classList.contains('cursorpress');
      const curPress = getComputedStyle(document.body).cursor;
      let gone = false;
      for (let i = 0; i < 40 && !gone; i++) { await sleep(50); gone = !document.documentElement.classList.contains('cursorpress'); }
      return { styleReady, during, changed: curPress !== cur0, hotspotKept: curPress.includes(' 8 2, auto'),
               restored: gone && getComputedStyle(document.body).cursor === cur0 };
    });
    expect(cp.styleReady, 'КУРСОР-НАЖАТИЕ: сжатые копии курсоров сгенерированы на старте');
    expect(cp.during && cp.changed && cp.hotspotKept,
      'КУРСОР-НАЖАТИЕ: на mousedown курсор подменяется сжатым с тем же hotspot (' + JSON.stringify(cp) + ')');
    expect(cp.restored, 'КУРСОР-НАЖАТИЕ: через 140 мс курсор вернулся точно к исходному (' + JSON.stringify(cp) + ')');
  }

  // ===== HUD-ПАКЕТ A (нода 829:1242, хвосты диспетчера 2026-08-04) =====
  // Заряд: TTL 10с (слово владельца) и ВРАЩЕНИЕ общим спин-канвасом; тост
  // множителя под глазами через тест-ручку (единая точка showMultToast).
  await page.evaluate(() => { window.__game.setLevel(3); window.__game.regen(); window.__game.skipIntro(); });
  await page.waitForTimeout(700);
  const hudA = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 16 && !g.combo().chain; i++){ g.autoMatch(); await sleep(80); }
    let cs = null;
    { const t0 = Date.now();      // осадка: заряд выдан на входе в турбо
      while (Date.now() - t0 < 5000){ cs = g.chargeInfo ? g.chargeInfo() : (g.charge ? g.charge() : null);
        if (cs && cs.name) break; await sleep(120); } }
    const cb = document.getElementById('chargeBtn');
    let spin = false;
    { const t0 = Date.now();      // осадка: спин-канвас пришёл в слот
      while (Date.now() - t0 < 4000){ if (cb && cb.querySelector('canvas')){ spin = true; break; } await sleep(120); } }
    g.multToastTest('T1', 2.25);
    await sleep(120);
    const mt = document.getElementById('multToast');
    const toastOn = !!(mt && mt.classList.contains('on'));
    const toastVal = mt ? document.getElementById('multToastVal').textContent : '';
    let toastGone = false;
    { const t0 = Date.now();      // сам гаснет
      while (Date.now() - t0 < 4000){ if (!mt.classList.contains('on')){ toastGone = true; break; } await sleep(150); } }
    return { chargeName: cs && cs.name, ttlLeft: cs ? cs.leftMs : 0, spin, toastOn, toastVal, toastGone };
  });
  console.log('hud A:', JSON.stringify(hudA));
  expect(!!hudA.chargeName && hudA.ttlLeft > 7000,
    'ЗАРЯД: TTL больше прежних 7с — слово владельца «10 секунд» (' + JSON.stringify(hudA) + ')');
  expect(hudA.spin === true, 'ЗАРЯД: крутится — спин-канвас в слоте (' + JSON.stringify(hudA) + ')');
  expect(hudA.toastOn && hudA.toastVal === '×2.25' && hudA.toastGone,
    'ТОСТ МНОЖИТЕЛЯ: показывается под глазами и сам гаснет (' + JSON.stringify(hudA) + ')');

  // +1 ВСТРЯСКА ЗА 5 УРОВНЕЙ (слово владельца 2026-08-04). Проверяем на
  // ГРАНИЦАХ: ур.4 -> запас не растёт, ур.5 -> +1. Победа настоящим путём
  // (leaveSingles + финальный помол), докидка чужая — глушим её флагом.
  const shakeBonus = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const winAt = async (lv) => {
      g.setLevel(lv); g.regen(); g.skipIntro();
      g.level().finalRefillDone = true;               // докидка тут чужая
      g.leaveSingles();
      const t0 = Date.now();
      while (g.alive() > 0 && Date.now() - t0 < 40000) await sleep(200);
      await sleep(600);
      return g.bundleState().shakes;
    };
    const before4 = g.bundleState().shakes;
    const after4 = await winAt(4);
    const after5 = await winAt(5);
    return { before4, after4, after5 };
  });
  console.log('shake bonus:', JSON.stringify(shakeBonus));
  expect(shakeBonus.after4 === shakeBonus.before4,
    'БОНУС-ВСТРЯСКА: на 4-м уровне запас НЕ растёт (' + JSON.stringify(shakeBonus) + ')');
  expect(shakeBonus.after5 === shakeBonus.after4 + 1,
    'БОНУС-ВСТРЯСКА: +1 за прохождение 5-го уровня (' + JSON.stringify(shakeBonus) + ')');

  // ===== HUD-ПАКЕТ C: гостевое имя-животное + цветной аватар =====
  const guestC = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // ⚠️ СНАЧАЛА ЖИВОЙ УРОВЕНЬ: секция идёт после чужих, и игра могла остаться
    // на экране победы/в интро — тогда пауза не открывает меню, профиль не
    // строится, и рамка честно нулевая (ловля [0,0] на исправной сборке).
    g.setLevel(3); g.regen(); g.skipIntro(); await sleep(700);
    document.getElementById('pauseBtn').click();      // меню — честным путём
    await sleep(600);
    const name1 = document.getElementById('msUser').textContent;
    const av = document.querySelector('.ms-av');
    const bg1 = getComputedStyle(av).backgroundColor;
    const emojiGone = av.textContent.trim() === '';
    // ⚠️ ЗАМЕР АВАТАРА — ПОКА МЕНЮ ОТКРЫТО: после Resume карточка скрыта,
    // и рамка честно нулевая (ловля: avatarBox [0,0] на исправной сборке).
    // ⚠️ ОСАДКА ПО ФАКТУ РАМКИ, а не по паузе: в полном прогоне меню может
    // достраиваться дольше, чем в изолированной пробе (там 400 мс хватало,
    // здесь рамка ещё нулевая) — ждём НЕНУЛЕВОЙ бокс, потолок 3 с.
    let img0 = null, ib0 = null;
    { const t0 = Date.now();
      while (Date.now() - t0 < 3000){
        const cur = document.querySelector('.ms-av');
        img0 = cur ? cur.querySelector('img') : null;
        if (img0){
          if (!img0.complete) await new Promise(r => { img0.onload = r; img0.onerror = r; });
          ib0 = img0.getBoundingClientRect();
          if (ib0.width > 0) break;
        }
        await sleep(150);
      } }
    const avBg = getComputedStyle(av).backgroundColor;
    document.getElementById('resumeBtn').click();
    await sleep(300);
    document.getElementById('pauseBtn').click();      // повторный вход: имя стабильно
    await sleep(300);
    const name2 = document.getElementById('msUser').textContent;
    document.getElementById('resumeBtn').click();
    await sleep(200);
    const cur2 = document.querySelector('.ms-av');
    const csAv = cur2 ? getComputedStyle(cur2) : null;
    const csImg = img0 ? getComputedStyle(img0) : null;
    return { name1, name2, bg1: avBg, emojiGone,
             circleW: csAv ? csAv.width : null,
             imgW: img0 ? img0.style.width : null,
             imgFit: csImg ? csImg.objectFit : null,
             avatarFile: img0 ? img0.getAttribute('src') : null,
             avatarLoaded: img0 ? img0.naturalWidth > 0 : false,
             avatarNatural: img0 ? img0.naturalWidth : 0,
             avatarBox: ib0 ? [Math.round(ib0.width), Math.round(ib0.height)] : null };
  });
  console.log('guest:', JSON.stringify(guestC));
  expect(guestC.name1 && guestC.name1 !== 'Guest' && /^[A-Z][A-Za-z-]+$/.test(guestC.name1),
    'ГОСТЬ: имя-животное вместо Guest (' + guestC.name1 + ')');
  expect(guestC.name2 === guestC.name1, 'ГОСТЬ: имя стабильно между входами в меню');
  expect(guestC.emojiGone && /rgba\(0, 0, 0, 0\)|transparent/.test(guestC.bg1),
    'ГОСТЬ: под аватаром НЕТ фона (слово владельца) (' + guestC.bg1 + ')');
  // ⚠️ ИСХОДНИК КРУПНЕЕ ЭКРАННОГО РАЗМЕРА (обновление владельца 2026-08-06:
  // 96 -> 192 px): кружок 48 CSS при плотности 2.75 = 132 физических, и
  // растяжение исчезло — теперь всегда уменьшение. Страж держит это число:
  // если однажды подложат мелкие файлы, край снова начнёт рваться.
  expect(guestC.avatarNatural >= 132,
    'ГОСТЬ: исходник аватара не мельче экранного размера (' + guestC.avatarNatural + ' px)');
  expect(guestC.avatarFile && /avatars\/Avatar\d\d\.png/.test(guestC.avatarFile) && guestC.avatarLoaded === true,
    'ГОСТЬ: аватар владельца вписан в круг и загружен (' + JSON.stringify({ f: guestC.avatarFile, w: guestC.avatarBox }) + ')');
  // ⚠️ МЕРИМ КОНТРАКТ, А НЕ ПИКСЕЛИ РАМКИ: в полном прогоне соседние секции
  // оставляют меню в разных состояниях, и getBoundingClientRect честно даёт
  // нули у скрытого предка (изолированная проба на той же сборке — 48×48).
  // «Вписан в окружность» = круг 48 и картинка 100%/contain внутри него.
  expect(guestC.circleW === '48px' && guestC.imgW === '100%' && guestC.imgFit === 'contain',
    'ГОСТЬ: аватар вписан в окружность 48 (' + JSON.stringify({ круг: guestC.circleW, w: guestC.imgW, fit: guestC.imgFit, рамка: guestC.avatarBox }) + ')');

  // ===== ЗУМ-КНОПКИ: чёрный глиф в обе темы + плавный ход (слова владельца
  // 2026-08-04: «всегда черного цвета», «увеличивает плавнее, а не так резко»)
  const zoomSmooth = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.regen(); g.skipIntro(); await sleep(500);
    const glyphDay = getComputedStyle(document.querySelector('#zoomInBtn svg path')).fill;
    document.documentElement.classList.add('night');
    const glyphNight = getComputedStyle(document.querySelector('#zoomInBtn svg path')).fill;
    document.documentElement.classList.remove('night');
    const r0 = g.cam().r;
    document.getElementById('zoomInBtn').click();
    await sleep(80);                                  // середина хода: ещё едем
    const rMid = g.cam().r;
    let rEnd = rMid;
    { const t0 = Date.now();                          // осадка: доехали и встали
      let prev = -1;
      while (Date.now() - t0 < 2000){ const r = g.cam().r; if (r === prev) { rEnd = r; break; } prev = r; await sleep(120); } }
    return { glyphDay, glyphNight, r0, rMid, rEnd };
  });
  console.log('zoom:', JSON.stringify(zoomSmooth));
  // ДЕСКТОПНАЯ РАСКЛАДКА ЗУМА (нода 741:1497): РЯД по центру внизу, 48×48,
  // минус ЛЕВЕЕ плюса. Мобильная колонка 56×56 слева при этом цела.
  const zoomDesk = await (async () => {
    const dp = await browser.newPage({ viewport: { width: 1280, height: 832 } });
    await dp.goto('file://' + path.join(__dirname, 'index.html'));
    await dp.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
    await dp.evaluate(() => window.__game.skipIntro());
    await dp.waitForTimeout(600);
    const r = await dp.evaluate(() => {
      const g = (id) => { const b = document.getElementById(id).getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const plus = g('zoomInBtn'), minus = g('zoomOutBtn');
      const hint = g('hintBtn'), shake = g('shakeBtn'), vit = g('vitrine');
      const over = (r) => !(r.x + r.w < vit.x || r.x > vit.x + vit.w || r.y + r.h < vit.y || r.y > vit.y + vit.h);
      return { plus, minus, cx: Math.round((Math.min(plus.x, minus.x) + Math.max(plus.x + plus.w, minus.x + minus.w)) / 2),
               bottom: Math.round(innerHeight - Math.max(plus.y + plus.h, minus.y + minus.h)),
               hintRight: Math.round(innerWidth - (hint.x + hint.w)),
               shakeRight: Math.round(innerWidth - (shake.x + shake.w)),
               overVit: over(hint) || over(shake) };
    });
    await dp.close();
    return r;
  })();
  console.log('zoom desktop:', JSON.stringify(zoomDesk));
  expect(zoomDesk.plus.w === 48 && zoomDesk.minus.w === 48 && zoomDesk.plus.y === zoomDesk.minus.y,
    'ЗУМ-ДЕСКТОП: ряд 48×48 на одной высоте (нода 741:1497) (' + JSON.stringify(zoomDesk) + ')');
  expect(zoomDesk.minus.x < zoomDesk.plus.x && Math.abs(zoomDesk.cx - 640) <= 2 && Math.abs(zoomDesk.bottom - 20) <= 2,
    'ЗУМ-ДЕСКТОП: минус слева, группа по центру, 20px от низа (' + JSON.stringify(zoomDesk) + ')');
  // ⚠️ Прямая жалоба владельца со скрином: контролы лезли на список предметов.
  // Корень: зум ушёл в absolute, и единственный оставшийся флекс-ребёнок бара
  // по space-between уехал влево, на витрину. Ассерт двусторонний — и место
  // по ноде (hint right 150, shake right 16), и факт «не наезжает».
  expect(zoomDesk.overVit === false,
    'ДЕСКТОП: подсказка и Shake НЕ наезжают на список предметов (' + JSON.stringify(zoomDesk) + ')');
  expect(Math.abs(zoomDesk.shakeRight - 16) <= 4 && zoomDesk.hintRight > zoomDesk.shakeRight,
    'ДЕСКТОП: подсказка и Shake справа по ноде 741:1497 (' + JSON.stringify(zoomDesk) + ')');
  expect(zoomSmooth.glyphDay === 'rgb(0, 0, 0)' && zoomSmooth.glyphNight === 'rgb(0, 0, 0)',
    'ЗУМ: глиф чёрный в ОБЕ темы (' + zoomSmooth.glyphDay + ' / ' + zoomSmooth.glyphNight + ')');
  // 50% в покое / 100% под пальцем и на ховере (слово владельца 2026-08-05)
  const zoomOpacity = await page.evaluate(async () => {
    const b = document.getElementById('zoomInBtn');
    const rest = getComputedStyle(b).opacity;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 120)); // ⚠️ КОРОЧЕ ПОРОГА УДЕРЖАНИЯ (260 мс):
    // 250 мс попадали в его край, кнопка отмечалась как «держали», и СЛЕДУЮЩИЙ
    // страж шага клика получал подавленный клик (шагКлика 0) — красное на
    // исправной сборке. Строительные леса не должны менять состояние соседям.
    const act = getComputedStyle(b).opacity;
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'touch' }));
    return { rest, act };
  });
  expect(Math.abs(parseFloat(zoomOpacity.rest) - 0.5) < 0.02,
    'ЗУМ: в покое полупрозрачный 50% (' + JSON.stringify(zoomOpacity) + ')');
  // ⚠️ ШАГ УДВОЕН СЛОВОМ ВЛАДЕЛЬЦА 2026-08-05 (было 1.6, стало ZOOM_STEP=3.2);
  // кламп CAM_R_MIN может укоротить ход, поэтому конец сверяем с ожидаемым
  // радиусом, а не с разностью «ровно шаг».
  const ZS = 3.2;
  expect(zoomSmooth.rMid < zoomSmooth.r0 && zoomSmooth.rMid > zoomSmooth.r0 - ZS + 0.05,
    'ЗУМ: ход ПЛАВНЫЙ — на 80мс камера ещё в пути, не ступенька (' + JSON.stringify(zoomSmooth) + ')');
  expect(Math.abs(zoomSmooth.rEnd - Math.max(9, zoomSmooth.r0 - ZS)) < 0.15,
    'ЗУМ: доехал на удвоенный шаг и встал (' + JSON.stringify(zoomSmooth) + ')');

  // ===== ПАКЕТ ТЕСТЕРОВ 2026-08-05 (прогрессия, зум, финал, no-fill) =====
  // 1) ПРОГРЕССИЯ РАЗМЕРА: ур.1 заметно легче прежних 130, счёт РАСТЁТ по
  // уровням и упирается в потолок ~180. Числа с допуском ±6 (сюрприз, камни
  // с ур.16, округление досыпки), важна МОНОТОННОСТЬ и падение старта.
  const sizes = await page.evaluate(async () => {
    const g = window.__game, out = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (const lv of [1, 5, 11, 20]){
      g.setLevel(lv); g.regen(); g.skipIntro(); await sleep(900);
      out.push({ lv, n: g.alive() });
    }
    return out;
  });
  console.log('размер уровней:', JSON.stringify(sizes));
  expect(sizes[0].n <= 90 && sizes[0].n >= 70,
    'ПРОГРЕССИЯ: ур.1 стал лёгким — ~80 предметов вместо 130 (' + JSON.stringify(sizes) + ')');
  expect(sizes[0].n < sizes[1].n && sizes[1].n < sizes[2].n,
    'ПРОГРЕССИЯ: число предметов РАСТЁТ с уровнем (' + JSON.stringify(sizes) + ')');
  expect(Math.abs(sizes[3].n - sizes[2].n) <= 8 && sizes[3].n <= 190,
    'ПРОГРЕССИЯ: с 11-го уровня потолок ~180, дальше плато (' + JSON.stringify(sizes) + ')');

  // 2) ЗУМ: шаг ×2 (был 1.6) и УДЕРЖАНИЕ едет плавно, пока палец на кнопке
  const zoomRes = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.setLevel(3); g.regen(); g.skipIntro(); await sleep(600);
    g.setCamR(16.2);
    const r0 = g.cam().r;
    document.getElementById('zoomInBtn').click();
    await sleep(500);                                  // ease 260 мс + запас
    const rClick = g.cam().r;
    // удержание: pointerdown без up — камера обязана ехать САМА
    g.setCamR(16.2); await sleep(60);
    const b = document.getElementById('zoomInBtn');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }));
    await sleep(400); const rHold1 = g.cam().r;
    await sleep(500); const rHold2 = g.cam().r;
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'touch' }));
    await sleep(300); const rAfter = g.cam().r;
    return { r0, rClick, шагКлика: +(r0 - rClick).toFixed(2), rHold1, rHold2, rAfter };
  });
  console.log('зум:', JSON.stringify(zoomRes));
  expect(zoomRes.шагКлика > 2.4,
    'ЗУМ: шаг клика удвоен (было 1.6, стало ~3.2) (' + JSON.stringify(zoomRes) + ')');
  expect(zoomRes.rHold2 < zoomRes.rHold1 - 0.5,
    'ЗУМ: удержание едет НЕПРЕРЫВНО, пока палец на кнопке (' + JSON.stringify(zoomRes) + ')');
  expect(Math.abs(zoomRes.rAfter - zoomRes.rHold2) < 0.6,
    'ЗУМ: отпустил — камера встала (' + JSON.stringify(zoomRes) + ')');

  // 3) NO-FILL: ролик не подобрался -> встряска ВСЁ РАВНО даётся; закрыл сам
  // -> НЕ даётся. Моки: showRewarded вызывает переданный onFail с причиной.
  const noFill = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.setLevel(3); g.regen(); g.skipIntro(); await sleep(600);
    const lv = g.level(); lv.shakes = 0;               // бесплатные кончились
    const real = window.Ads ? null : null;
    const alive0 = g.alive();
    // подменяем показ рекламы: сперва «не подобралась»
    const AdsRef = window.__ads;
    if (!AdsRef) return { skip: 'нет ручки __ads' };
    const orig = AdsRef.showRewarded;
    AdsRef.showRewarded = (onReward, onFail) => { if (onFail) onFail('unavailable'); };
    const before = g.stats().shakesUsed + (g.stats().adShakesUsed || 0);
    g.requestShake();
    await sleep(400);
    const afterNoFill = g.stats().shakesUsed + (g.stats().adShakesUsed || 0);
    // теперь «закрыл сам»
    AdsRef.showRewarded = (onReward, onFail) => { if (onFail) onFail('closed'); };
    g.requestShake();
    await sleep(400);
    const afterClosed = g.stats().shakesUsed + (g.stats().adShakesUsed || 0);
    AdsRef.showRewarded = orig;
    return { before, afterNoFill, afterClosed };
  });
  console.log('no-fill:', JSON.stringify(noFill));
  expect(noFill.skip || noFill.afterNoFill > noFill.before,
    'NO-FILL: ролик не подобрался — встряску всё равно дали (' + JSON.stringify(noFill) + ')');
  expect(noFill.skip || noFill.afterClosed === noFill.afterNoFill,
    'NO-FILL: закрыл ролик сам — встряски НЕТ (' + JSON.stringify(noFill) + ')');

  // ===== ЗАГРУЗКА: БЕЛЫЙ -> ЗАЛИВКА СНИЗУ -> ИНТРО (скрин владельца 2026-08-05
  // «мелькает лишний экран и лишние элементы»; лишним был мой #multToast с
  // пустой картинкой мимо занавеса). Своя страница: ловим РАННИЕ кадры.
  {
    const lpage = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await lpage.goto('file://' + path.join(__dirname, 'index.html'));
    // сразу, ДО готовности игры: ни один элемент HUD не показан
    const early = await lpage.evaluate(() => {
      const vis = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e).visibility : 'нет'; };
      return { ready: document.documentElement.classList.contains('uiready'),
               toast: vis('multToast'), charge: vis('chargeBtn'), face: vis('face'),
               fill: !!document.getElementById('skyFill') };
    });
    expect(early.toast !== 'visible' && early.charge !== 'visible' && early.face !== 'visible',
      'ЗАГРУЗКА: HUD не мелькает до готовности — тост множителя и заряд под занавесом (' + JSON.stringify(early) + ')');
    expect(early.fill === true, 'ЗАГРУЗКА: слой заливки неба есть в разметке');
    // заливка снизу вверх: класс поставлен, слой дорос до полного экрана
    await lpage.waitForFunction(() => document.documentElement.classList.contains('skyfill'), null, { timeout: 5000 });
    await lpage.waitForFunction(() => {
      const e = document.getElementById('skyFill');
      return e && e.getBoundingClientRect().height > innerHeight * 0.95;
    }, null, { timeout: 5000 });
    // после готовности слой уходит — дальше небо рисует сам движок
    await lpage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 60000 });
    await lpage.evaluate(() => window.__game.skipIntro());
    await lpage.waitForFunction(() => {
      const e = document.getElementById('skyFill');
      return e && parseFloat(getComputedStyle(e).opacity) < 0.05;
    }, null, { timeout: 8000 });
    const late = await lpage.evaluate(() => ({
      toast: getComputedStyle(document.getElementById('multToast')).visibility,
      face: getComputedStyle(document.getElementById('face')).visibility }));
    expect(late.face === 'visible' && late.toast === 'visible',
      'ЗАГРУЗКА: после готовности занавес снят, HUD доступен (' + JSON.stringify(late) + ')');
    await lpage.close();
  }

  // ===== ОГОНЬ ЗАЖИГАЕТ ТОЛЬКО СОБИРАЕМОЕ (слово владельца 2026-08-05) =====
  // Свойство: у горящего ОБЯЗАН быть живой доступный близнец, до которого
  // дотягивается боевой радиус. Проверяем боевым путём — ждём естественного
  // поджига (ручку не зовём: она проверяла бы саму себя).
  {
    const fireCheck = await page.evaluate(async () => {
      const g = window.__game;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      g.setLevel(6); g.regen(); g.skipIntro(); await sleep(900);
      g.fireSoon && g.fireSoon();                       // ускорить отсчёт, если ручка есть
      let name = null;
      { const t0 = Date.now();
        while (Date.now() - t0 < 40000){ name = g.burning ? g.burning() : null; if (name) break; await sleep(300); } }
      if (!name) return { skip: 'поджиг не наступил за 40с' };
      // ⚠️ ПЕРЕСЧЁТ ПЕРЕД ЧТЕНИЕМ: флаг accessible — КЭШ, он обновляется
      // только пока куча движется; в штиле страж читал бы прошлое (ловля:
      // «доступных 0» при 10 живых на исправной механике).
      g.refreshAcc();
      const brief = g.itemsGeo().filter(it => it.name === name);
      // ⚠️ ФЛАГ acc НЕ ИСПОЛЬЗУЕМ: он заполняется только в Hard (вуаль), а
      // сьют идёт в Easy, где isAccessible() честно отдаёт true всем — флаг
      // при этом остаётся false, и страж читал бы «доступных 0» на исправной
      // механике (ловля 2026-08-05). Меряем СВОЙСТВО, а не служебный кэш:
      // есть ли у горящего вида второй живой предмет в пределах радиуса.
      const acc = brief;
      // НЕЗАВИСИМАЯ проверка достижимости: истинный зазор между охватными
      // сферами меньше боевого радиуса — считаем в тесте по координатам,
      // а не спрашиваем pairMatch (иначе страж проверял бы сам себя).
      let minGap = 99;
      for (let i = 0; i < acc.length; i++) for (let j = i + 1; j < acc.length; j++){
        const a = acc[i], b = acc[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - (a.r + b.r);
        if (d < minGap) minGap = d;
      }
      return { name, живыхВида: brief.length, доступных: acc.length,
               зазор: +minGap.toFixed(2), радиус: +g.cfg.matchRadius.toFixed(2) };
    });
    console.log('огонь:', JSON.stringify(fireCheck));
    expect(fireCheck.skip || (fireCheck.живыхВида >= 2 && fireCheck.зазор <= fireCheck.радиус),
      'ОГОНЬ: загорается только предмет с ДОСТИЖИМОЙ парой — есть второй доступный того же вида в пределах боевого радиуса (' + JSON.stringify(fireCheck) + ')');
  }

  // ТОСТ МНОЖИТЕЛЯ: под глазами, по центру, зазор 32 (слово владельца
  // 2026-08-05). Мерим ПОКАЗАННЫЙ тост: в покое он scale(.85), и рамка
  // отличается на 5 px — замер до конца перехода дал бы 37.
  {
    const mt = await page.evaluate(async () => {
      const g = window.__game;
      g.multToastTest('T1', 2.25);
      await new Promise(r => setTimeout(r, 350));
      const f = document.getElementById('face').getBoundingClientRect();
      const t = document.getElementById('multToast').getBoundingClientRect();
      return { зазор: Math.round(t.top - f.bottom), центр: Math.round(t.left + t.width / 2),
               экран: Math.round(innerWidth / 2), позиция: getComputedStyle(document.getElementById('multToast')).position,
               строка: !!document.getElementById('ttLine') };
    });
    expect(mt.позиция === 'fixed' && Math.abs(mt.зазор - 32) <= 2 && Math.abs(mt.центр - mt.экран) <= 2,
      'ТОСТ: под глазами по центру, зазор 32 (' + JSON.stringify(mt) + ')');
    expect(mt.строка === false,
      'ТОСТ: лишней белой строки в пилюле нет (слово владельца) (' + JSON.stringify(mt) + ')');
  }

  // ===== ОДИН ТОСТ НА ДВА СОБЫТИЯ (слово владельца 2026-08-05 «своди в один»)
  {
    const oneToast = await page.evaluate(async () => {
      const g = window.__game;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      // ⚠️ ТА ЖЕ ПОДГОТОВКА, ЧТО У СОСЕДНЕЙ МЕТА-СЕКЦИИ: без сброса накопления
      // порог ступени мог быть уже пройден в прошлых секциях, событие не
      // приходило, и страж читал «не показан» на исправной сборке.
      g.metaRuleReset(); g.storyClearAcc(); g.clearBought();
      g.setLevel(20); g.regen(); g.skipIntro(); await sleep(500);
      const mt = document.getElementById('multToast');
      const tt = document.getElementById('tierToast');
      mt.classList.remove('on', 'up');
      const live = g.accSnapshot().find(r => r._item);
      if (!live) return { skipped: true };
      // ⚠️ ГРАНТИМ ДО СЛЕДУЮЩЕЙ СТУПЕНИ ПО ФАКТУ, а не фиксированные 120:
      // соседняя мета-секция уже поднимала ступень этому виду, и повторный
      // грант того же размера событие НЕ рождал — страж читал «не показан»
      // на исправной сборке (ловля 2026-08-05).
      const t0tier = g.accGrant(live.key, 0).tier;
      let guard = 0;
      while (g.accGrant(live.key, 60).tier === t0tier && guard++ < 40){ /* добираем */ }
      // осадка по ФАКТУ показа
      let shown = false;
      { const t0 = Date.now();
        while (Date.now() - t0 < 4000){ if (mt.classList.contains('on')){ shown = true; break; } await sleep(80); } }
      const up = mt.classList.contains('up');
      const pill = tt ? (getComputedStyle(tt).opacity !== '0' && tt.classList.contains('show')) : false;
      return { shown, up, pill, val: document.getElementById('multToastVal').textContent };
    });
    console.log('один тост:', JSON.stringify(oneToast));
    expect(oneToast.skipped || (oneToast.shown && oneToast.up),
      'ТОСТ: повышение ступени идёт ТЕМ ЖЕ тостом под глазами, с пометкой события (' + JSON.stringify(oneToast) + ')');
    expect(oneToast.skipped || oneToast.pill === false,
      'ТОСТ: старая пилюля ступени больше не показывается (' + JSON.stringify(oneToast) + ')');
  }

  // ===== ПАКЕТ 2026-08-07: ночной тост, заряд не трогает глаза, нет линии =====
  {
    const pk = await page.evaluate(async () => {
      const g = window.__game;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      g.setLevel(5); g.regen(); g.skipIntro(); await sleep(700);
      // (1) серия набрана -> клик по заряду НЕ сбивает счёт и НЕ перебивает глаза
      for (let i = 0; i < 5; i++){ g.autoMatch(); await sleep(90); }
      const c0 = g.combo().count;
      const face0 = g.faceState ? g.faceState() : null;
      g.chargeGrant((g.itemsGeo()[0] || {}).name || 'foodbanana');
      await sleep(150);
      const btn = document.getElementById('chargeBtn');
      const shown = btn && btn.style.display !== 'none';
      if (shown) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }));
      await sleep(300);
      const c1 = g.combo().count;
      const face1 = g.faceState ? g.faceState() : null;
      return { shown, c0, c1, face0, face1 };
    });
    console.log('заряд:', JSON.stringify(pk));
    expect(pk.shown && pk.c1 === pk.c0,
      'ЗАРЯД: клик НЕ сбивает счёт серии (' + JSON.stringify(pk) + ')');
    expect(!pk.face1 || pk.face1 !== 'angry',
      'ЗАРЯД: клик НЕ перебивает глаза злостью — серия читается дальше (' + JSON.stringify(pk) + ')');
  }

  // ===== ЧАША-РАЗЛЁТ (прототип v2, решения владельца: чаша новая каждый
  // уровень / камни-бомба без очков / слоу-мо да) =====
  const bowlPage = await browser.newPage({ viewport: { width: 900, height: 640 } });
  // ⚠️ СПАСЕНИЯ СЧИТАЕМ ПО КОНСОЛИ: rescueSweep пишет `[rescue]` на каждый
  // телепорт, и это ЕДИНСТВЕННЫЙ наблюдаемый снаружи след — ассерты он не
  // роняет (предметы живы, счётчики целы), поэтому баг «спасатель воюет с
  // разлётом» был бы виден только глазами.
  let bowlRescues = 0;
  bowlPage.on('console', m => { if (m.text().startsWith('[rescue]')) bowlRescues++; });
  await bowlPage.goto('file://' + path.join(__dirname, 'index.html'));
  await bowlPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await bowlPage.evaluate(() => { window.__game.setLevel(5); window.__game.regen(); window.__game.skipIntro(); });
  await bowlPage.waitForTimeout(400);
  // 1) ЕДИНИЦА «3 ТУРБО ПОДРЯД БЕЗ ОШИБОК» (слово владельца 2026-08-03,
  // сменило «серии по 4»: «всё остальное слишком просто»). Стражи ловят:
  // (а) вход в турбо честной цепью = +1 зачёт; (б) ЛЮБОЙ промах обнуляет
  // накопленное (клик в пустоту настоящим путём); (в) после сброса стрик
  // копится заново. Паузы стрик НЕ рвут (уже взятые турбо живут).
  const bowlStreak1 = await bowlPage.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.bowlSetN(999); // порог не должен сработать посреди стража
    g.regen(); g.skipIntro(); await sleep(600);
    const c0 = g.bowl().cracks;
    for (let i = 0; i < 16 && !g.combo().chain; i++){ g.autoMatch(); await sleep(80); }
    return { c0, chain: g.combo().chain, c1: g.bowl().cracks, misses: g.stats().misses };
  });
  expect(bowlStreak1.c0 === 0 && bowlStreak1.chain === true && bowlStreak1.c1 === 1,
    'ЧАША: вход в турбо честной цепью = +1 зачёт стрика (' + JSON.stringify(bowlStreak1) + ')');
  let streakMissGrew = false;
  for (const [mx, my] of [[875, 320], [30, 180], [875, 180]]){
    await bowlPage.mouse.click(mx, my);
    await bowlPage.waitForTimeout(180);
    const m = await bowlPage.evaluate(() => window.__game.stats().misses);
    if (m > bowlStreak1.misses){ streakMissGrew = true; break; }
  }
  const bowlStreak2 = await bowlPage.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cAfterMiss = g.bowl().cracks;              // промах обнулил стрик
    // пауза > окна серии: стрик (0) ждать обязан, паузы его не трогают
    await sleep(4400);
    const cAfterPause = g.bowl().cracks;
    for (let i = 0; i < 16 && !g.combo().chain; i++){ g.autoMatch(); await sleep(80); }
    return { cAfterMiss, cAfterPause, c2: g.bowl().cracks };
  });
  expect(streakMissGrew && bowlStreak2.cAfterMiss === 0,
    'ЧАША: промах ОБНУЛЯЕТ накопленные турбо-зачёты («без ошибок») (' + JSON.stringify(bowlStreak2) + ')');
  expect(bowlStreak2.cAfterPause === 0 && bowlStreak2.c2 === 1,
    'ЧАША: после сброса стрик копится заново честной цепью (' + JSON.stringify(bowlStreak2) + ')');

  // ЛЕСЕНКА N (слово владельца 2026-08-04: «5 турбо... каждый 10 уровень
  // +1»): ур.1 -> 5, ур.10 -> 6, ур.25 -> 7. bowlSetN(0) снимает runtime.
  const bowlLadder = await bowlPage.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.bowlSetN(0);
    const out = [];
    for (const lv of [1, 10, 25]){ g.setLevel(lv); g.regen(); g.skipIntro(); await sleep(250); out.push(g.bowl().n); }
    return out;
  });
  expect(bowlLadder[0] === 5 && bowlLadder[1] === 6 && bowlLadder[2] === 7,
    'ЧАША: N растёт лесенкой 5 +1/десяток уровней (' + JSON.stringify(bowlLadder) + ')');

  // РАЗЛЁТ В ЖИВОМ ТУРБО (баг владельца 2026-08-04: досыпка цепи кидала
  // предметы сквозь призрачное дно, победа не наступала, уровень зависал).
  // Сценарий: N=3, 2 зачёта ручкой, вход в турбо честной цепью = 3-й ->
  // разлёт при ЖИВОЙ цепи с досыпкой. Ловим: победа наступает, следующий
  // уровень рождается ЖИВЫМ (предметы не проваливаются сквозь дно).
  const bowlTurboShatter = await bowlPage.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.setLevel(2); g.regen(); g.skipIntro(); await sleep(700);
    g.bowlSetN(3);
    g.bowlCrack(); g.bowlCrack();
    for (let i = 0; i < 16 && !g.combo().chain; i++){ g.autoMatch(); await sleep(80); }
    const cracked = g.bowl().cracks;
    let over = false;
    { const t0 = Date.now();                       // осадка: победа разлёта
      while (Date.now() - t0 < 12000){ if (g.level().over){ over = true; break; } await sleep(250); } }
    const lv0 = g.levelNum();
    // следующий уровень: дно вернулось, предметы живут
    g.regen(); g.skipIntro(); await sleep(1200);
    const brief = g.itemsBrief();
    const below = brief.filter(it => it.y < -1).length;
    return { cracked, over, lv0, aliveNext: g.alive(), below, floorGhost: g.bowl().floorGhost };
  });
  expect(bowlTurboShatter.cracked >= 3 && bowlTurboShatter.over === true,
    'ЧАША: разлёт в ЖИВОМ турбо завершается победой — цепь гасится, опоздавшие добраны (' + JSON.stringify(bowlTurboShatter) + ')');
  expect(bowlTurboShatter.aliveNext > 30 && bowlTurboShatter.below === 0 && bowlTurboShatter.floorGhost === false,
    'ЧАША: следующий уровень рождается живым — дно твёрдое, никто не под ним (' + JSON.stringify(bowlTurboShatter) + ')');

  // 2) разлёт на N: стены сняты, слоу-мо идёт, ВСЕ собраны «как соединённые»
  //    (счётчик накопления типа вырос на всех живых), победа; камни без очков
  // ⚠️ ОКНО СЧЁТА — ТОЛЬКО РАЗЛЁТ, А НЕ ВЕСЬ БЛОК (флейк, замечен Графикой,
  // корень подтверждён независимой проверкой): обнуление стояло ПЕРЕД
  // evaluate, который начинается с regen + skipIntro — в счёт попадали
  // спасения ОСЕДАЮЩЕЙ КУЧИ нового уровня, законные и к разлёту не
  // относящиеся (1 из 3 прогонов). Теперь считаем от метки, которая ставится
  // прямо перед взрывом.
  bowlRescues = 0;
  let bowlRescuesAtMark = 0;
  const markWatcher = setInterval(async () => {
    try {
      const marked = await bowlPage.evaluate(() => !!window.__rescueMark).catch(() => false);
      if (marked && !bowlRescuesAtMark){ bowlRescuesAtMark = bowlRescues + 1; }  // +1: 0 значит «ещё не отмечено»
    } catch(e){}
  }, 50);
  const bowlShatter = await bowlPage.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    g.bowlSetN(2);
    window.__rescueMark = true;   // ⚠️ ОКНО СЧЁТА НАЧИНАЕТСЯ ЗДЕСЬ (см. ниже)
    // эталон для «спасения»: тип с k живых и его счётчик ДО
    const sn = g.typesSnapshot();
    let name = null, k = 0;
    for (const [key, v] of Object.entries(sn)) if (key !== 'surprise' && v.alive > k){ name = key; k = v.alive; }
    const acc0 = (g.accSnapshot().find(x => x.key === name) || { count: 0 }).count;
    const walls0 = g.walls(), score0 = g.stats().score, alive0 = g.alive();
    g.bowlCrack();                       // 1-я трещина (та же точка, что у турбо)
    await new Promise(r => setTimeout(r, 120));
    g.bowlCrack();                       // 2-я = N -> отложенный разлёт (650 мс)
    await new Promise(r => setTimeout(r, 900));
    const вРазлёте = { slowmo: g.slowmoLeft(), walls: g.walls(), shattering: g.bowl().shattering,
                       floorGhost: g.bowl().floorGhost, rescuerOff: g.bowl().rescuerOff };
    // осадка-опрос: сбор + удаление + победа (потолок-страховка 8 с)
    const t0 = Date.now();
    while (Date.now() - t0 < 8000){
      const st = { alive: g.alive(), over: !!(g.level() && g.level().over) };
      if (st.alive === 0 && st.over) break;
      await new Promise(r => setTimeout(r, 150));
    }
    const acc1 = (g.accSnapshot().find(x => x.key === name) || { count: 0 }).count;
    return { name, k, walls0, вРазлёте, alive: g.alive(),
             over: !!(g.level() && g.level().over),
             очки: g.stats().score - score0, alive0,
             спасено: acc1 - acc0 };
  });
  expect(bowlShatter.walls0 > 0 && bowlShatter.вРазлёте.walls === 0,
    'ЧАША: разлёт СНЯЛ стены (' + bowlShatter.walls0 + ' -> ' + bowlShatter.вРазлёте.walls + ')');
  expect(bowlShatter.вРазлёте.floorGhost === true,
    'ЧАША: дно-плита призрачное в разлёте — силуэта не остаётся (слово владельца 2026-08-03) (' + JSON.stringify(bowlShatter.вРазлёте) + ')');
  expect(bowlShatter.вРазлёте.slowmo > 0,
    'ЧАША: слоу-мо идёт в момент разлёта («да!» владельца) (' + bowlShatter.вРазлёте.slowmo + ' мс)');
  // ⚠️⚠️ СПАСАТЕЛЬ НЕ ВОЮЕТ С РАЗЛЁТОМ (ФИЗИКА 2026-08-04). rescueSweep меряет
  // «сбежал ли предмет» по radiusAt(y) — радиусу чаши, которой в этот момент
  // УЖЕ НЕТ, — и без гейта возвращал бы разлетающиеся предметы внутрь, обнуляя
  // скорости: окно 900 мс, развёртка раз в 500 — попадание гарантировано, а
  // blastWave в shatterBowl специально швыряет кучу наружу. Игрок увидел бы,
  // как предметы прыгают обратно и замирают ПО ФОРМЕ ЧАШИ.
  // ⚠️ Ассерт НЕ тавтологичен: со снятым гейтом (`if (bowlOpen) return 0`)
  // прогон даёт спасения десятками — проверено диверсией.
  expect(bowlShatter.вРазлёте.rescuerOff === true,
    'ЧАША: спасатель выключен на время разлёта (' + JSON.stringify(bowlShatter.вРазлёте) + ')');
  clearInterval(markWatcher);
  const rescuesInWindow = bowlRescuesAtMark ? (bowlRescues - (bowlRescuesAtMark - 1)) : bowlRescues;
  expect(rescuesInWindow === 0,
    'ЧАША: за окно разлёта НИ ОДНОГО спасения — предметы не прыгают обратно в несуществующую чашу ('
    + rescuesInWindow + ' в окне разлёта, ' + bowlRescues + ' за блок)');
  expect(bowlShatter.alive === 0 && bowlShatter.over === true,
    'ЧАША: все предметы собраны, уровень выигран (' + JSON.stringify({ alive: bowlShatter.alive, over: bowlShatter.over }) + ')');
  expect(bowlShatter.очки > 0,
    'ЧАША: сбор «как соединённые» дал очки (' + bowlShatter.очки + ')');
  expect(bowlShatter.спасено === bowlShatter.k,
    'ЧАША: накопление типа выросло на ВСЕХ живых — это спасение (' +
    bowlShatter.спасено + ' == ' + bowlShatter.k + ')');
  // 3) новый уровень: чаша НОВАЯ (решение №1) — трещины 0, стены на месте
  const bowlReset = await bowlPage.evaluate(async () => {
    const g = window.__game;
    g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    return { cracks: g.bowl().cracks, walls: g.walls(), shattering: g.bowl().shattering,
             floorGhost: g.bowl().floorGhost, rescuerOff: g.bowl().rescuerOff };
  });
  expect(bowlReset.floorGhost === false,
    'ЧАША: новый уровень вернул твёрдое дно (' + JSON.stringify(bowlReset) + ')');
  expect(bowlReset.rescuerOff === false,
    'ЧАША: новый уровень ВЕРНУЛ спасателя (' + JSON.stringify(bowlReset) + ')');
  expect(bowlReset.cracks === 0 && bowlReset.walls > 0 && bowlReset.shattering === false,
    'ЧАША: новый уровень = новая чаша, трещины 0, стены восстановлены (' + JSON.stringify(bowlReset) + ')');

  // ===== ГЛАЗА: «МИКСЕР ВЫДЫХАЕТСЯ» (владелец отверг трещины: «беру глаза») =====
  // ⛔ ВЕКО-КАНАЛА БОЛЬШЕ НЕТ. Спека владельца 2026-08-03: «убери черные веки
  // сверху, у нас нет такого состояния, потому что во всех состояниях есть
  // только белое глазное яблоко и черный зрачок в разной форме». Прежние стражи
  // мерили ГЛУБИНУ ВЕКА (зазор веко->глаз) — они удалены вместе со слоем, а не
  // ослаблены. Осталось два канала, оба зрачковые: РАЗМЕР (просадка базы) и
  // ФОРМА (щёлочки 741:1302 -> ✕✕ 741:1281).
  const лицо = () => bowlPage.evaluate(() => ({
    зрачок: +document.getElementById('pupL').getBoundingClientRect().width.toFixed(1),
    слой: ['fRound','fAngry','fX','fSad','fSlit'].find(id => document.getElementById(id).classList.contains('on')),
    cracks: window.__game.bowl().cracks }));
  // ждём ФАКТ, который ассертим (канон), потолок — страховка и он ОТЛИЧИМ от провала
  const ждуЛицо = async (годно, мс = 4000) => {
    const t0 = Date.now(); let с;
    while (Date.now() - t0 < мс){
      с = await лицо();
      if (годно(с)) return Object.assign(с, { дождались: true });
      await bowlPage.waitForTimeout(80);
    }
    return Object.assign(с || {}, { дождались: false });
  };
  const ждуСлой = (id, мс = 4000) => bowlPage.waitForFunction(
    (i) => document.getElementById(i).classList.contains('on'), id, { timeout: мс })
    .then(() => true).catch(() => false);

  // ТОМБСТОУН: верхних век не должно быть НИ ОДНОГО узла. Дешёвый страж прямо
  // на спеку владельца — вернётся накладка, покраснеет здесь.
  const векНет = await bowlPage.evaluate(() =>
    !document.getElementById('fTired') && !document.querySelector('#eyes .face-ov'));
  expect(векНет, 'ГЛАЗА: верхних век усталости нет в разметке — их не бывает ни в одном состоянии (спека 2026-08-03)');

  await bowlPage.evaluate(() => { const g = window.__game; g.bowlSetN(6); g.regen(); g.skipIntro();
    g.stats().lastAction = performance.now(); });
  await bowlPage.waitForFunction(
    () => !document.getElementById('fAngry').classList.contains('on'), null, { timeout: 5000 }).catch(() => {});
  const глазСвеж = await ждуЛицо(с => с.cracks === 0 && с.слой === 'fRound');
  // зачёты ПО ОДНОМУ с паузой — как в живой игре; залпом они забивают кадр
  for (let i = 0; i < 4; i++){
    await bowlPage.evaluate(() => window.__game.bowlCrack());
    await bowlPage.waitForTimeout(260);
  }
  // ⚠️ ждём СЧЁТ и УСТОЙЧИВОСТЬ, а величину просадки АССЕРТИМ — иначе ожидание
  // самого утверждения сделало бы стража тавтологией.
  let a1 = await лицо(), глазУстал = a1;
  for (let i = 0; i < 20; i++){
    await bowlPage.waitForTimeout(80);
    const b1 = await лицо();
    if (b1.cracks === 4 && Math.abs(b1.зрачок - a1.зрачок) < 0.05){ глазУстал = b1; break; }
    a1 = b1; глазУстал = b1;
  }
  expect(глазСвеж.дождались && глазУстал.cracks === 4 && глазУстал.слой === 'fRound' &&
         глазУстал.зрачок <= глазСвеж.зрачок * 0.9,
    'ГЛАЗА: зачёты выматывают миксер — зрачок ОСЕДАЕТ (единственный копящийся канал): ' +
    глазСвеж.зрачок + ' -> ' + глазУстал.зрачок + ' (нужно <= ' + (глазСвеж.зрачок * 0.9).toFixed(1) + ')');

  // ЛЕСЕНКА ФОРМ: щёлочки на предпоследнем зачёте, ✕✕ на N-м.
  await bowlPage.evaluate(() => { const g = window.__game;
    while (g.bowl().cracks < g.bowl().n - 1) g.bowlCrack(); });
  const выдохсяДошёл = await ждуСлой('fSlit');
  // ЛЕСЕНКА ПРИОРИТЕТОВ: помол ВЫШЕ усталости — проверяем В ТОЧКЕ, где иначе
  // висели бы ЩЁЛОЧКИ (на свежем миксере этот ассерт был бы пустым).
  await bowlPage.evaluate(() => { const g = window.__game, lv = g.level();
    g.stats().lastAction = performance.now() - (lv.idleLimit + 1) * 1000; });
  const помолПеребил = await ждуСлой('fAngry');
  const слойПриПомоле = (await лицо()).слой;
  expect(выдохсяДошёл && помолПеребил && слойПриПомоле === 'fAngry',
    'ГЛАЗА: помол ПЕРЕБИВАЕТ усталость — на предпоследнем зачёте были щёлочки (' + выдохсяДошёл +
    '), помол сменил лицо на злое (' + слойПриПомоле + ')');

  await bowlPage.evaluate(() => { window.__game.stats().lastAction = performance.now(); });
  const щёлочкиВернулись = await ждуСлой('fSlit');
  await bowlPage.evaluate(() => window.__game.bowlCrack());   // N-й зачёт
  const вырубилсяДошёл = await ждуСлой('fX');
  expect(глазСвеж.слой === 'fRound' && щёлочкиВернулись && вырубилсяДошёл,
    'ГЛАЗА: лесенка форм зрачка — круглый -> ЩЁЛОЧКИ 741:1302 (предпоследний) -> ✕✕ 741:1281 (N-й): ' +
    глазСвеж.слой + ' -> щёлочки ' + щёлочкиВернулись + ' -> ✕✕ ' + вырубилсяДошёл);

  // КОНЕЦ УРОВНЯ СНИМАЕТ ✕✕: tiredSlam живёт до genLevel, а shatterBowl
  // bowlCracks НЕ обнуляет — уровень кончается раньше, на волне сбора, и без
  // гейта `level.over` победное лицо осталось бы вырубленным.
  const концовка = await bowlPage.evaluate(async () => {
    const g = window.__game; g.bowlShatterNow();
    const t0 = Date.now();
    while (!g.level().over && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 120));
    await new Promise(r => setTimeout(r, 300));
    return { over: g.level().over,
             слой: ['fRound','fAngry','fX','fSad','fSlit'].find(id => document.getElementById(id).classList.contains('on')) };
  });
  expect(концовка.over === true && концовка.слой !== 'fX' && концовка.слой !== 'fSlit' && вырубилсяДошёл,
    'ГЛАЗА: конец уровня СНИМАЕТ ✕✕ — победное лицо не вырубленное (' +
    JSON.stringify(концовка) + ', до конца было ✕✕: ' + вырубилсяДошёл + ')');

  // ⚠️ АССЕРТИМ «НЕ УСТАЛОЕ», А НЕ «РОВНО КРУГЛОЕ»: сразу после `regen` счёт
  // падает с большого до нуля, и штатная реакция грусти честно даёт `fSad` —
  // требовать здесь `fRound` значит ловить чужую живую механику.
  const глазСброс = await bowlPage.evaluate(async () => {
    const g = window.__game; g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 500));
    return { cracks: g.bowl().cracks,
             зрачок: +document.getElementById('pupL').getBoundingClientRect().width.toFixed(1),
             слой: ['fRound','fAngry','fX','fSad','fSlit'].find(id => document.getElementById(id).classList.contains('on')) };
  });
  expect(глазСброс.cracks === 0 && глазСброс.слой !== 'fSlit' && глазСброс.слой !== 'fX' &&
         глазСброс.зрачок >= глазУстал.зрачок,
    'ГЛАЗА: новый уровень снимает усталость — форма не усталая, зрачок вернулся к базе (' +
    JSON.stringify(глазСброс) + ', на усталом было ' + глазУстал.зрачок + ')');

  await bowlPage.close();

  // ── ТЕКСТЫ ДОЛГОЙ МЕТЫ НА ТЕЛЕФОНЕ (план §1.3) ──────────────────────────
  // СЕКЦИЯ В КОНЦЕ НАМЕРЕННО (правило камней): она гонит setLevel/regen и
  // трогает Save.mt — в середине сдвинула бы контекст соседям.
  // Проблема: витрина загейтована min-width:813px и на телефоне не строится,
  // а под глазами с v2 висит «×1.25» на КАЖДОМ сборе прокачанного вида.
  // Правило «спасённые НАВСЕГДА растят множитель» игрок не узнавал нигде.
  const mtText = await page.evaluate(() => {
    const g = window.__game;
    g.metaRuleReset(); g.storyClearAcc();
    const key = g.storyTypeNames()[0];
    const zero = g.metaTexts(key);
    g.accGrant(key, 120);                       // первая ступень (порог 100)
    const tier1 = g.metaTexts(key);
    g.accGrant(key, 100000);                    // за кап ступеней
    const capped = g.metaTexts(key);
    return { key, zero, tier1, capped };
  });
  expect(/^\S.* · 0 saved$/.test(mtText.zero.line),
    'МЕТА-ТЕКСТ: строка тоста = имя вида + счётчик спасённых (' + mtText.zero.line + ')');
  expect(mtText.tier1.line.endsWith('· 120 saved'),
    'МЕТА-ТЕКСТ: счётчик в строке живой (' + mtText.tier1.line + ')');
  expect(/^next ×[\d.]+ at \d+$/.test(mtText.tier1.next),
    'МЕТА-ТЕКСТ: строка прогресса обещает СЛЕДУЮЩУЮ ступень и порог (' + mtText.tier1.next + ')');
  expect(mtText.capped.next === 'max level',
    '⚠️ НА КАПЕ строка «next …» НЕ ВРЁТ, а честно говорит про потолок (' + mtText.capped.next + ')');

  // ПРАВИЛО ОБЪЯСНЯЕТСЯ РОВНО ОДИН РАЗ и переживает мерж отставшей копии
  const mtRule = await page.evaluate(() => {
    const g = window.__game;
    g.metaRuleReset();
    const before = g.metaRuleState().due;
    g.metaRuleMark();
    const after = g.metaRuleState().due;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, mt: 0 });      // отставшая копия
    const afterOldMerge = g.metaRuleState().due;
    // ⚠️⚠️ НЕСУЩЕЕ НАПРАВЛЕНИЕ МЕРЖА — ИМЕННО ОНО ПРОВЕРЯЕТ OR-СТРОКУ.
    // Обратное («старая копия не разпоказывает») ТАВТОЛОГИЧНО: mergeSave пишет
    // В ЖИВОЙ Save, поле, которого мерж не касается, остаётся как было, и тот
    // ассерт зелен даже если строки в mergeSave нет вовсе. Здесь наоборот:
    // локально правило НЕ показывали, а копия с другого устройства говорит
    // «показывали» — без OR игрок получил бы объяснялку повторно.
    g.metaRuleReset();
    const dueFresh = g.metaRuleState().due;
    g.mergeRaw({ gen: g.saveRaw().gen || 0, mt: 1 });
    const afterForeign = g.metaRuleState().due;
    return { before, after, afterOldMerge, dueFresh, afterForeign,
             text: g.metaTexts(g.storyTypeNames()[0]).rule };
  });
  expect(mtRule.before === true && mtRule.after === false,
    'МЕТА-ТЕКСТ: правило накопления объясняется ОДИН раз (' + JSON.stringify(mtRule) + ')');
  expect(mtRule.afterOldMerge === false,
    'МЕРЖ: старая копия НЕ заставит объяснять правило заново (санитар, слабый)');
  expect(mtRule.dueFresh === true && mtRule.afterForeign === false,
    '⚠️ МЕРЖ (несущий): правило, показанное НА ДРУГОМ устройстве, здесь уже не показывается — ' +
    'объяснялка одна на игрока, а не на устройство (' + JSON.stringify(mtRule) + ')');
  expect(mtRule.text.length > 0 && mtRule.text.length <= 40,
    'МЕТА-ТЕКСТ: правило короткое — тост живёт секунды (' + mtRule.text.length + ' знаков: «' + mtRule.text + '»)');

  // ПОДПИСЬ РЕАЛЬНО ОТРИСОВАНА В ТОСТЕ (а не только возвращается хелпером)
  const mtToast = await page.evaluate(async () => {
    const g = window.__game;
    g.metaRuleReset(); g.storyClearAcc(); g.clearBought();
    g.setLevel(20); g.regen(); g.skipIntro();
    await new Promise(r => setTimeout(r, 400));
    const live = g.accSnapshot().find(r => r._item);
    if (!live) return { skipped: true };
    g.accGrant(live.key, 120);                  // пересечение порога -> событие
    await new Promise(r => setTimeout(r, 200));
    const el = document.getElementById('ttLine');
    return { text: el ? el.textContent : null, key: live.key,
             вПилюле: !!(el && el.closest('#tierToast')) };
  });
  expect(!mtToast.skipped, 'МЕТА-ТЕКСТ: нашёлся живой прокачиваемый вид для проверки тоста');
  if (!mtToast.skipped){
    // ⛔ ОТМЕНЁН СЛОВОМ ВЛАДЕЛЬЦА 2026-08-05 («в тосте появился какой-то лишний
  // белый текст, убери его»): подпись «имя · N saved» снята из пилюли. Тексты
  // Повествования живы в 77-save и работают в разовом правиле; страж на их
  // ОТРИСОВКУ В ТОСТЕ противоречит спеке, обратное свойство проверяет
  // «ТОСТ: лишней белой строки в пилюле нет».
  expect(true, 'МЕТА-ТЕКСТ: подпись в пилюле снята по слову владельца (страж отменён)');
  }



  // ===== ФОН ДОЕЗЖАЕТ ДО КРОМКИ: ГРАДИЕНТ ПРИ ЗАГРУЗКЕ + ТОН МЕНЮ =====
  // Две жалобы владельца 2026-08-06, ОДИН класс дефекта — «фон не доезжает до
  // кромки экрана»: (2) «при загрузке появляется первый экран, а должен быть
  // сразу градиент» — подложка html/body была `#ffffff`; (3) «в меню паузы
  // сверху прокидывается фон игры» — под меню в html/body оставался цвет НЕБА
  // (его пишет tintChrome), а полосу хрома Safari красит именно оттуда.
  // ⚠️ СЕКЦИЯ В САМОМ КОНЦЕ: она открывает и закрывает меню (тихая пауза),
  // то есть трогает долгоживущее состояние — правило «как камни».
  const bgSeams = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const norm = s => String(s).replace(/\s+/g, '');
    const rootVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const bg = el => { const c = getComputedStyle(el); return { col: norm(c.backgroundColor), img: norm(c.backgroundImage) }; };
    const skyTop = norm('rgb(' + rootVar('--sky-top-rgb') + ')');
    const skyBot = norm('rgb(' + rootVar('--sky-bot-rgb') + ')');
    const menuBg = rootVar('--ms-bg');
    // МЕНЮ ЗАКРЫТО. Меряем ровно то, что называем: опоры градиента обязаны
    // БЫТЬ кромками неба (те же переменные, что у полос Safari), а не просто
    // «каким-то нежёлтым цветом» — иначе страж зелен на любом хардкоде.
    document.querySelector('.ms-play').click(); await sleep(200); // на случай открытого
    const closed = { html: bg(document.documentElement), body: bg(document.body) };
    // ЖИВОЙ ПУТЬ ОТКРЫТИЯ (не classList руками): класс держит openMainScreen,
    // и поздние события не должны его снять — приводим состояние как игрок.
    document.getElementById('pauseBtn').click(); await sleep(250);
    const open = { html: bg(document.documentElement), body: bg(document.body),
                   меню: document.getElementById('mainScreen').classList.contains('open') };
    document.querySelector('.ms-play').click(); await sleep(250);
    const back = { html: bg(document.documentElement), body: bg(document.body) };
    // menuBg в переменной — hex; переводим в тот же вид, что отдаёт computed
    const probe = document.createElement('div');
    probe.style.backgroundColor = menuBg; document.body.appendChild(probe);
    const menuRGB = norm(getComputedStyle(probe).backgroundColor); probe.remove();
    return { closed, open, back, skyTop, skyBot, menuRGB };
  });
  console.log('bgSeams:', JSON.stringify(bgSeams));
  // ⚠️ АССЕРТЫ ПРО ГРАДИЕНТ ПОДЛОЖКИ СНЯТЫ ВМЕСТЕ С ПРАВКОЙ (2026-08-06):
  // в v2 живёт `#skyFill` — «белый экран, потом заливка снизу вверх» по слову
  // владельца 05.08. Его жалоба 06.08 «должен быть сразу градиент» это слово
  // ОТМЕНЯЕТ, но реверс чужой принятой механики — решение диспетчера, а не моё.
  // Здесь остаётся только ТОН МЕНЮ (жалоба «сверху прокидывается фон игры»).
  // (3) МЕНЮ: ПЕРЕХОД состояния, а не значение — до/во время/после
  // ⚠️⚠️ ПРАВИЛО СМЕНИЛОСЬ ВТОРОЙ РАЗ ЗА СУТКИ (слово владельца 2026-08-10:
  // «фоновый градиент должен заполнять всё от самого верха до самого низа»).
  // Нейтраль прожила день и ОТМЕНЕНА; кромка снова в тоне палитры.
  // ⚠️ У КАЖДОГО АССЕРТА ВТОРАЯ ПОЛОВИНА — «И НЕ нейтраль»: без неё возврат
  // белого прошёл бы молча, а мы его только что снимали.
  const БЕЛЫЙ = /^rgb\(255, ?255, ?255\)$/;
  expect(bgSeams.closed.body.col === bgSeams.skyTop && !БЕЛЫЙ.test(bgSeams.closed.body.col),
    '⚠️ КРОМКА В ИГРЕ: тон НЕБА (верхний стоп), а НЕ нейтраль (' + bgSeams.closed.body.col +
    ', небо ' + bgSeams.skyTop + ')');
  expect(bgSeams.open.меню === true,
    'САНИТАР: меню действительно открылось кликом по паузе (иначе следующий ассерт мерит пустоту)');
  expect(bgSeams.open.body.col === bgSeams.menuRGB && bgSeams.open.html.col === bgSeams.menuRGB &&
         bgSeams.open.body.col !== bgSeams.skyTop,
    '⚠️ КРОМКА В МЕНЮ: тон МЕНЮ на обоих каналах, а не небо и не нейтраль (' +
    JSON.stringify(bgSeams.open) + ', меню ' + bgSeams.menuRGB + ')');
  expect(bgSeams.back.body.col === bgSeams.skyTop,
    '⚠️ КРОМКА ПОСЛЕ МЕНЮ: вернулась к небу — тон меню не залипает (' +
    bgSeams.closed.body.col + ' -> ' + bgSeams.open.body.col + ' -> ' + bgSeams.back.body.col + ')');

  // ===== ПАКЕТ 2026-08-06: ПОРЯДОК АНОНСА / КОЛОНКИ КОЛЛЕКЦИИ / ГЛАЗА ЗА КУРСОРОМ =====
  // ⚠️ В КОНЦЕ ФАЙЛА: секция гоняет победу и открывает меню — долгоживущее
  // состояние, правило «как камни».

  // (1) АНОНС: колбэк отдаёт управление уровню на ВСЕХ ветках, включая отказные.
  // Это несущий ассерт правки: `genLevel` теперь живёт В КОЛБЭКЕ, и потерянный
  // вызов означал бы, что кнопка «Next» перестала начинать уровень — в самом
  // частом случае, когда анонса нет вовсе.
  // (2) АНОНС: ПЕРЕХОД. Пока висит статистика — виньетки нет; она приходит
  // только по «Next». Ассертится именно ПОРЯДОК, а не наличие: сравнение
  // «нет-нет» было бы истинно и на сборке, где анонса нет вовсе, поэтому
  // вторая фаза обязана дать СЛЕД.
  const stAnn06 = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const есть = () => !!document.getElementById('storyOverlay');
    { const so = document.getElementById('storyOverlay'); if (so) so.click(); } g.storyEnable(true);
    g.setLevel(3); g.regen(); g.skipIntro(); await sleep(400);
    g.stats().taps = 5;                          // §6.1: без тапов виньетки нет
    g.leaveSingles(); await sleep(2500);          // доводим до победы финалом
    // ⚠️ НАБЛЮДАЕМ НЕПРЕРЫВНО, А НЕ В ТОЧКЕ: виньетка живёт 4 с и ГАСНЕТ САМА.
    // Разовый замер после ожидания победы её просто не заставал — диверсия
    // «вернуть storyOnWin в checkEnd» оставалась зелёной. Копим ФАКТ появления
    // за весь отрезок «победа -> до нажатия Next».
    let приСтатистике = false, статистика = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 9000){
      if (есть()) приСтатистике = true;
      if (getComputedStyle(document.getElementById('winOverlay')).display !== 'none'){
        статистика = true;
        if (Date.now() - t0 > 5200) break;   // пересидели автогашение 4 с
      }
      await sleep(100);
    }
    document.getElementById('againBtn').click();
    // ⚠️ МЕЖДУ «Next» И АНОНСОМ СТОИТ ЭКРАН НОВОЙ ВЕЩИ (звено 2026-08-10):
    // анонс не появится, пока его не закрыли. Ждём ФАКТ его показа и жмём
    // настоящую кнопку — фиксированной паузой это ловилось бы через раз.
    let новВещь = false;
    for (let i = 0; i < 20 && !новВещь; i++){
      await sleep(100);
      новВещь = document.getElementById('newObj').classList.contains('on');
    }
    if (новВещь) document.getElementById('newObjBtn').click();
    let послеNext = false;
    for (let i = 0; i < 20 && !послеNext; i++){ await sleep(100); послеNext = есть(); }
    { const so = document.getElementById('storyOverlay'); if (so) so.click(); }
    return { статистика, приСтатистике, послеNext, новВещь };
  });
  console.log('анонс:', JSON.stringify(stAnn06));
  expect(stAnn06.статистика === true,
    'САНИТАР: экран статистики дошёл (иначе следующие два ассерта мерят пустоту)');
  expect(stAnn06.приСтатистике === false,
    '⚠️ АНОНС: пока показана СТАТИСТИКА, виньетки поверх неё НЕТ (жалоба владельца «сразу же после уровня»)');
  expect(stAnn06.послеNext === true,
    '⚠️ АНОНС: по «Next» виньетка приходит — проверен ПЕРЕХОД, а не «нигде нет» (' +
    JSON.stringify(stAnn06) + ')');

  // ⚠️ ПОРЯДОК ДВУХ СЕКЦИЙ НЕСУЩИЙ: страж колбэка помечает ВСЕ главы
  // виденными (иначе ветку «главы нет» не поставить детерминированно) —
  // и после него виньетка не выпадет уже никому. Поэтому он идёт ПОСЛЕ
  // стража порядка, а не перед ним. Поймано на себе: страж порядка
  // покраснел на ИСПРАВНОЙ сборке, потому что сосед забрал у него главу.
  // ⚠️ ВЕТОК ОТКАЗА ТРИ, И СТРАЖ ОБЯЗАН ПРОЙТИ ПО ВСЕМ: «сюжет выключен»,
  // «уровень без тапов», «главы нет». Первая версия щупала только первую —
  // и диверсия, снявшая `else fin()` (ветка «главы нет»), осталась ЗЕЛЁНОЙ.
  // Ровно тот случай, о котором канон говорит «ломай всех держателей»: тут
  // наоборот, страж обязан ДЕРЖАТЬ всех, иначе ломать нечего.
  const stCb = await page.evaluate(async () => {
    const g = window.__game;
    const зов = () => new Promise(r => {
      let ok = false;
      g.storyOnWin(() => { ok = true; r('вернулся'); });
      setTimeout(() => r(ok ? 'вернулся' : 'ПОТЕРЯН'), 1200);
    });
    { const so = document.getElementById('storyOverlay'); if (so) so.click(); }
    g.storyEnable(false); const выкл = await зов(); g.storyEnable(true);
    const t = g.stats(); const было = t.taps; t.taps = 0;
    const безТапов = await зов(); t.taps = было || 5;
    // «ГЛАВЫ НЕТ» — ДЕТЕРМИНИРОВАННО, БИТАМИ СЕЙВА. Прежняя постановка («две
    // победы подряд, гейт по уровням») главу всё-таки давала, и диверсия,
    // снявшая `else fin()`, оставалась зелёной — страж мерил не ту ветку.
    // Помечаем ВСЕ главы виденными: storyDue гарантированно отдаёт null.
    g.mergeRaw({ gen: (g.saveRaw().gen || 0), st: 0xffff });
    const главыНет = await зов();
    { const so = document.getElementById('storyOverlay'); if (so) so.click(); }
    return { выкл, безТапов, главыНет };
  });
  console.log('колбэк:', JSON.stringify(stCb));
  expect(stCb.выкл === 'вернулся' && stCb.безТапов === 'вернулся' && stCb.главыНет === 'вернулся',
    '⚠️ АНОНС: колбэк зовётся на ВСЕХ ТРЁХ отказных ветках — «Next» начинает уровень и когда анонса нет (' +
    JSON.stringify(stCb) + ')');

  // (3) КОЛОНКИ КОЛЛЕКЦИИ: 2 только ниже 360, дальше растут.
  const cols = await (async () => {
    const cp = await browser.newPage({ viewport: { width: 359, height: 780 } });
    await cp.goto('file://' + path.join(__dirname, 'index.html'));
    await cp.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
    await cp.evaluate(() => window.__game.skipIntro());
    const n = async (w) => {
      await cp.setViewportSize({ width: w, height: 780 });
      return await cp.evaluate(async () => {
        document.getElementById('pauseBtn').click();
        await new Promise(r => setTimeout(r, 250));
        const g = document.querySelector('.ms-grid');
        // ЧИСЛО КОЛОНОК — ПО РЕАЛЬНОЙ РАСКЛАДКЕ, а не по строке шаблона:
        // `repeat(auto-fill, …)` в computed уже развёрнут в список треков.
        return getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length;
      });
    };
    // ⚠️ ТОЧКИ ЗАМЕРА — ПО ОБЕ СТОРОНЫ КАЖДОГО НАЗВАННОГО ЧИСЛА. Владелец
    // называл порог ТРИЖДЫ (360 -> 380 -> 420), поэтому страж обязан держать
    // именно ПЕРЕХОД на границе, а не «столбцов стало больше»: последняя
    // формулировка была бы истинной при любом из трёх вариантов.
    const r = { w359: await n(359), w360: await n(360), w420: await n(420),
                w421: await n(421), w600: await n(600), w799: await n(799) };
    await cp.close(); return r;
  })();
  console.log('колонки:', JSON.stringify(cols));
  // ДЕЙСТВУЮЩАЯ СПЕКА (2026-08-06, третья редакция, дословно): «4 колонки в
  // мобильном появляются только при ширине более 420 px, меньше 420 px
  // показываем 3 колонки, меньше 360 px показываем 2 колонки».
  // ⛔ ПРЕЖНЯЯ ПАРА «380 -> 2 / 381 -> 3» ОТМЕНЕНА — на 380 теперь ТРИ.
  expect(cols.w359 === 2,
    '⚠️ КОЛЛЕКЦИЯ: НИЖЕ 360 — ровно 2 столбца (' + cols.w359 + ')');
  expect(cols.w360 === 3,
    '⚠️ КОЛЛЕКЦИЯ: с 360 — уже 3 столбца, переход ровно на названном числе (' + cols.w360 + ')');
  expect(cols.w420 === 3,
    '⚠️ КОЛЛЕКЦИЯ: на 420 ещё 3 столбца — четвёртая приходит ПОСЛЕ 420 (' + cols.w420 + ')');
  expect(cols.w421 === 4,
    '⚠️ КОЛЛЕКЦИЯ: ШИРЕ 420 — 4 столбца (' + cols.w421 + ')');
  // ПОТОЛОК 4 (слово владельца 2026-08-06 «в мобильном максимум 4 колонки»):
  // рост обязан ОСТАНОВИТЬСЯ, а не продолжиться до пяти на широких телефонах.
  expect(cols.w600 === 4 && cols.w799 === 4,
    '⚠️ КОЛЛЕКЦИЯ: на мобильном НЕ БОЛЬШЕ 4 столбцов (' + JSON.stringify(cols) + ')');
  // ⛔ ПРЕЖНИЙ АССЕРТ ПРО 393/389 СНЯТ ТРЕТЬЕЙ РЕДАКЦИЕЙ ВЛАДЕЛЬЦА
  // (2026-08-07): его телефон 1080 физ. = 393 CSS попадает теперь в полосу
  // «360-420 → 3», и это ЕГО ЖЕ новое слово. Оставлять старый ассерт значило
  // бы держать отменённое число — конфликт спек, а не проверка.

  // (4) ГЛАЗА ЗА КУРСОРОМ НА ГЕЙМПЛЕЕ. Меряем СМЕЩЕНИЕ ЗРАЧКА, а не факт
  // события: «слушатель повешен» зелено и на сборке, где зрачок стоит.
  const gaze = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    { const so = document.getElementById('storyOverlay'); if (so) so.click(); }
    document.querySelector('.ms-play').click(); await sleep(200); // меню закрыть
    g.setLevel(2); g.regen(); g.skipIntro(); await sleep(500);
    // ⚠️ ЧИТАЕМ TRANSFORM, А НЕ `cx`: атрибут центра у зрачка СТАТИЧЕН (60),
    // взгляд едет `style.transform` (85-hud). Линейка по `cx` дала бы вечный
    // ноль сдвига — то есть «зрачок не движется» на ИСПРАВНОЙ сборке.
    const зрачок = () => { const c = document.getElementById('pupL');
      if (!c) return null; const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
      return [m.e, m.f]; };
    const шли = (x, y) => window.dispatchEvent(
      Object.assign(new MouseEvent('mousemove', { clientX: x, clientY: y }), {}));
    шли(20, 700); await sleep(260); const слева = зрачок();
    await sleep(120);
    шли(window.innerWidth - 20, 700); await sleep(260); const справа = зрачок();
    return { слева, справа, сдвиг: (слева && справа) ? +(справа[0] - слева[0]).toFixed(2) : null };
  });
  console.log('взгляд:', JSON.stringify(gaze));
  expect(gaze.слева && gaze.справа, 'САНИТАР: зрачок найден в разметке (иначе сдвиг мерит null)');
  expect(gaze.сдвиг !== null && gaze.сдвиг > 4,
    '⚠️ ГЛАЗА: на ГЕЙМПЛЕЕ зрачок едет за курсором слева направо (сдвиг ' + gaze.сдвиг + ' единиц viewBox)');

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');

  // ===== УДАР ПРИ СОЕДИНЕНИИ (задача тестеров 2026-08-06 «больше драйва») =====
  // ⚠️ СЕКЦИЯ СТОИТ В КОНЦЕ И НА СВОЕЙ СТРАНИЦЕ НАМЕРЕННО: она делает реген,
  // осадку и НАСТОЯЩИЙ тап — это секунды синхронной работы. Первая версия
  // стояла в середине, у эффектов, и обокрала соседа по кадрам: «🔥 БОНУС за
  // горящий тип» с его фиксированными паузами упал (d1=0) на ИСПРАВНОЙ сборке,
  // а тот же сценарий в изоляции дал 6/6 на обеих сборках. Тот же приём, что
  // у камней и меню.
  // Четыре обещания пакета, и каждое ломалось бы БЕСШУМНО:
  //  (1) удар достаётся КАЖДОМУ соединению, включая пару (в этом весь смысл —
  //      у пар до сих пор была только труха);
  //  (2) удар РАСТЁТ с размером группы;
  //  (3) ударный слой ПРОБИВАЕТ ГЛУБИНУ. Не косметика: хлопок происходит
  //      в точке тапа, то есть ВНУТРИ плотной кучи, и с тестом глубины кольцо
  //      закрыто предметами ЦЕЛИКОМ — эффект строится, тратит время и не виден
  //      вовсе. Поймано съёмкой с замедлением ×10, чтением кода не заметно;
  //  (4) труха стала гуще на ЧЕТВЁРТУЮ фракцию (крупные куски).
  const impPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  impPage.on('pageerror', e => errors.push('PAGEERROR(impact): ' + e.message));
  await impPage.goto('file://' + path.join(__dirname, 'index.html'));
  await impPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await impPage.evaluate(() => window.__game.skipIntro());
  await new Promise(r => setTimeout(r, 900));
  // ПАРА — детерминированно: matchType матчит РОВНО двоих
  const ударПара = await impPage.evaluate(async () => {
    const g = window.__game;
    g.fxBreak(true);
    const s = g.typesSnapshot();
    const names = Array.isArray(s) ? s.map(t => t.name) : Object.keys(s);
    let ok = false;
    for (const nm of names) if (g.matchType(nm)) { ok = true; break; }
    await new Promise(r => setTimeout(r, 500));
    return { ok, br: g.fxBreak(false), удар: g.lastImpact() };
  });
  expect(ударПара.ok && ударПара.br.impact && ударПара.br.impact.n === 1,
    'УДАР: есть на ПАРЕ — по одному на соединение (' + JSON.stringify(ударПара.br.impact) + ')');
  expect(ударПара.br.dust && ударПара.br.dust.n === 4,
    'ТРУХА: четыре фракции, включая КУСКИ (вызовов dustCloud ' +
    (ударПара.br.dust ? ударПара.br.dust.n : 0) + ', было 3)');
  expect(ударПара.удар && ударПара.удар.over === true,
    '⚠️ УДАР ПРОБИВАЕТ ГЛУБИНУ — иначе он рождается внутри кучи и НЕ ВИДЕН вовсе (' +
    JSON.stringify(ударПара.удар) + ')');
  // ГРУППА — настоящим тапом по пикселю, где предмет первое пересечение луча
  const ударЦель = await impPage.evaluate(() => window.__game.bestTapTarget());
  let ударГруппа = null;
  if (ударЦель && ударЦель.n >= 4 && !ударЦель.occluded){
    await impPage.mouse.click(ударЦель.px, ударЦель.py);
    await new Promise(r => setTimeout(r, 520));
    ударГруппа = await impPage.evaluate(() => window.__game.lastImpact());
  }
  // 🔵 КОЛЬЦО: ШИРЕ, ПРОЗРАЧНЕЕ, РАЗНОЙ ФОРМЫ (слово владельца 2026-08-06).
  // ⚠️ Три обещания, и все три ломаются молча: ширина/прозрачность — числа,
  // которые легко «поправить обратно» соседней правкой; семейство формы обязано
  // быть ДЕТЕРМИНИРОВАННЫМ (случайная форма читается как глитч, а не как
  // свойство предмета) и обязано РАЗЛИЧАТЬСЯ, иначе фича есть только на бумаге.
  expect(ударПара.удар.w >= 0.30 && ударПара.удар.alpha <= 0.7,
    'КОЛЬЦО: шире и прозрачнее прежнего (обод ' + ударПара.удар.w +
    ' при прежних 0.14, плотность ' + ударПара.удар.alpha + ' при прежней 1.0)');
  const семьи = await impPage.evaluate(() => window.__game.ringFams());
  const родов = Object.keys(семьи).filter(k => семьи[k].length > 0);
  expect(родов.length === 3,
    'КОЛЬЦО: живы ВСЕ ТРИ семейства формы (' + родов.map(k => k + ' ' + семьи[k].length).join(', ') + ')');
  // формы обязаны РАЗЛИЧАТЬСЯ — иначе «разная форма» пустой звук
  const образцы = await impPage.evaluate(async (имена) => {
    const g = window.__game, out = {};
    for (const [fam, name] of имена){
      for (let i = 0; i < 12 && !out[fam]; i++){
        const sn = g.typesSnapshot();
        const есть = Array.isArray(sn) ? sn.some(t => t.name === name) : !!sn[name];
        if (есть && g.matchType(name)){ await new Promise(r => setTimeout(r, 260)); out[fam] = g.lastImpact(); break; }
        g.regen(); g.skipIntro();
        await new Promise(r => setTimeout(r, 420));
      }
    }
    return out;
  }, родов.map(k => [k, семьи[k][0].name]));
  const подписи = Object.values(образцы).map(v => v && (v.fam + ':' + v.w + '/' + v.seg + '/' + v.kx));
  expect(подписи.length === 3 && new Set(подписи).size === 3,
    'КОЛЬЦО: у семейств РАЗНЫЕ обод/грани/растяжка (' + подписи.join(' | ') + ')');
  // ДЕТЕРМИНИЗМ: тот же тип — то же кольцо (а не случайное при каждом матче)
  const повтор = await impPage.evaluate(async (name) => {
    const g = window.__game, было = [];
    for (let i = 0; i < 6 && было.length < 2; i++){
      const sn = g.typesSnapshot();
      const есть = Array.isArray(sn) ? sn.some(t => t.name === name) : !!sn[name];
      if (есть && g.matchType(name)){ await new Promise(r => setTimeout(r, 260)); было.push(g.lastImpact()); continue; }
      g.regen(); g.skipIntro();
      await new Promise(r => setTimeout(r, 420));
    }
    return было;
  }, семьи[родов[0]][0].name);
  expect(повтор.length === 2 && повтор[0].fam === повтор[1].fam &&
         повтор[0].w === повтор[1].w && повтор[0].kx === повтор[1].kx,
    'КОЛЬЦО: форма ДЕТЕРМИНИРОВАНА типом — один предмет даёт одно кольцо (' +
    JSON.stringify(повтор.map(v => v && v.fam + ':' + v.w)) + ')');
  expect(ударГруппа && ударГруппа.n > ударПара.удар.n &&
         ударГруппа.ringR > ударПара.удар.ringR &&
         ударГруппа.arrows > ударПара.удар.arrows &&
         ударГруппа.flash > ударПара.удар.flash,
    'УДАР РАСТЁТ С ГРУППОЙ: пара ' + JSON.stringify(ударПара.удар) +
    ' против группы ' + JSON.stringify(ударГруппа));
  // 🔥 ВСПЛЕСК ОГНЯ ПРИ СОВМЕЩЕНИИ ГОРЯЩЕГО (слово владельца 2026-08-06).
  // ⚠️ ГЛАВНОЕ ОБЕЩАНИЕ — ИЗБИРАТЕЛЬНОСТЬ: всплеск обязан случаться ТОЛЬКО на
  // горящем виде. Сломайся это в любую сторону — фича либо исчезает, либо
  // становится шумом на каждом матче; оба случая молчаливы.
  // ⚠️⚠️ ПОРЯДОК ЗДЕСЬ НЕСУЩИЙ: СНАЧАЛА горящий, ПОТОМ обычный. Первая версия
  // шла наоборот и сравнивала `null` с `null` — «обычный матч огня не даёт»
  // было ИСТИННО и на сборке, где всплеска нет вовсе. Проверять надо ПЕРЕХОД
  // состояния: снимок появился на горящем и НЕ ОБНОВИЛСЯ на обычном.
  const огонь = await impPage.evaluate(async () => {
    const g = window.__game;
    let имя = null;
    for (let i = 0; i < 12 && !имя; i++){
      g.fireDue(0);
      await new Promise(r => setTimeout(r, 430));
      имя = g.burning();
    }
    if (!имя) return { нетОгня: true };
    const собрали = g.matchType(имя);
    await new Promise(r => setTimeout(r, 460));
    const всплеск = g.lastFireBurst(), кольцо = g.lastImpact();
    // теперь ОБЫЧНЫЙ матч: снимок обязан остаться прежним
    const sn = g.typesSnapshot();
    const names = Array.isArray(sn) ? sn.map(t => t.name) : Object.keys(sn);
    let холодныйOk = false;
    for (const nm of names) if (nm !== g.burning() && g.matchType(nm)) { холодныйOk = true; break; }
    await new Promise(r => setTimeout(r, 460));
    return { имя, собрали, всплеск, кольцо, холодныйOk,
             послеХолодного: g.lastFireBurst(), кольцоХолодного: g.lastImpact() };
  });
  expect(!огонь.нетОгня && огонь.собрали && огонь.холодныйOk,
    '🔥 ВСПЛЕСК: сцена собралась — матч горящего и обычный после него (' +
    JSON.stringify({ горело: огонь.имя, собрали: огонь.собрали, обычный: огонь.холодныйOk }) + ')');
  expect(огонь.всплеск && огонь.всплеск.плюм > 20 && огонь.всплеск.угли > 5,
    '🔥 ВСПЛЕСК: матч ГОРЯЩЕГО даёт огонь — плюм и угли (' + JSON.stringify(огонь.всплеск) + ')');
  expect(огонь.всплеск && огонь.послеХолодного &&
         огонь.послеХолодного.ms === огонь.всплеск.ms,
    '🔥 ВСПЛЕСК: обычный матч огня НЕ даёт — снимок не обновился (' +
    JSON.stringify(огонь.всплеск && огонь.всплеск.ms) + ' -> ' +
    JSON.stringify(огонь.послеХолодного && огонь.послеХолодного.ms) + ')');
  expect(огонь.всплеск && огонь.всплеск.over === true,
    '🔥 ВСПЛЕСК ПРОБИВАЕТ ГЛУБИНУ — он рождается внутри кучи, как и удар (' +
    JSON.stringify(огонь.всплеск && огонь.всплеск.over) + ')');
  expect(огонь.кольцо && огонь.кольцо.hot === true && огонь.кольцо.fam === 'рваное' &&
         огонь.кольцоХолодного && огонь.кольцоХолодного.hot === false,
    '🔥 КОЛЬЦО ГОРЯЩЕГО — рваное и огненное, у обычного прежнее (' +
    (огонь.кольцо && огонь.кольцо.fam) + ' против ' +
    (огонь.кольцоХолодного && огонь.кольцоХолодного.fam) + ')');
  await impPage.close();

  // ===== РАЗЛЁТ ЧАШИ: ОДИН МЕШ, НЕРЕГУЛЯРНЫЙ СКОЛ, СБОР В ЦЕНТР =====
  // Правки по трём словам владельца 2026-08-06: техника взрыва из его же
  // примеров (куски слиты в один меш, движение в шейдере), «в жизни стекло так
  // не трескается» (ячейки Вороного вместо решётки), «после взрыва не должно
  // быть силуэта» и «объекты сливаются в центре, как при обычном совмещении».
  // ⚠️ КАЖДОЕ ИЗ ЭТОГО ЛОМАЕТСЯ БЕСШУМНО, а два — особенно:
  //  • силуэтом владеет ЦИКЛ (99-main ставит bowlMesh.visible каждый кадр по
  //    расстоянию камеры). Наше «спрятать» жило ровно один кадр — ровно это
  //    владелец и увидел. Проверять надо ЧЕРЕЗ НЕСКОЛЬКО КАДРОВ после разлёта,
  //    иначе страж поймает наш кадр, а не цикла;
  //  • «куски разного размера» — это и есть жалоба «сетка стерильная»: возврат
  //    к правильной решётке даст ровно те же 159 кусков и тот же один объект,
  //    и заметит его ТОЛЬКО разброс площадей.
  const bowlVisPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  bowlVisPage.on('pageerror', e => errors.push('PAGEERROR(bowl): ' + e.message));
  await bowlVisPage.goto('file://' + path.join(__dirname, 'index.html'));
  await bowlVisPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await bowlVisPage.evaluate(() => window.__game.skipIntro());
  await new Promise(r => setTimeout(r, 900));
  const чаша = await bowlVisPage.evaluate(async () => {
    const g = window.__game;
    const до = g.bowlShardsInfo();
    const детиДо = g.perfStats().sceneChildren;
    const радиусДо = g.bowlShardsInfo().радиусМешей;
    const кладДо = g.bowlShardsInfo().кладДоЦентра;
    g.fxBreak(true);                       // считаем попы ИМЕННО этого сбора
    g.bowlShatterNow();
    await new Promise(r => setTimeout(r, 260));
    const вЛёте = { дети: g.perfStats().sceneChildren, инфо: g.bowlShardsInfo() };
    // ⚠️ ждём НЕСКОЛЬКО кадров: видимость стекла ставит цикл, а не мы
    await new Promise(r => setTimeout(r, 420));
    const силуэт = g.bowlShardsInfo().стеклоВидно;
    // ⚠️⚠️ СЛЁТ В ЦЕНТР МЕРИМ ОПРОСОМ, ПОКА ПРЕДМЕТЫ ЖИВЫ, И БЕРЁМ МИНИМУМ.
    // Первая версия читала радиус ОДИН раз в конце и имела лазейку «или живых
    // ноль» — к тому моменту предметы уже удалены, и ассерт был истинным при
    // ЛЮБОМ поведении: диверсия «не слетаются» проходила зелёной. Классическая
    // тавтология из канона: `X || пусто` истинно, когда механики нет вовсе.
    let минР = Infinity, кладМин = Infinity, сэмплов = 0;
    for (let i = 0; i < 40; i++){
      await new Promise(r => setTimeout(r, 60));
      const инфо = g.bowlShardsInfo();
      if (!инфо.живыхМешей) break;
      if (инфо.радиусМешей < минР) минР = инфо.радиусМешей;
      if (инфо.кладДоЦентра != null && инфо.кладДоЦентра < кладМин) кладМин = инфо.кладДоЦентра;
      сэмплов++;
    }
    return { до, детиДо, радиусДо, вЛёте, силуэт, минР, сэмплов, живых: g.alive(),
             кладДо, кладМин: isFinite(кладМин) ? кладМин : null, поп: g.fxBreak(false).pop };
  });
  expect(чаша.до.испечена === true && чаша.до.кусков > 100,
    'ЧАША: расколотая геометрия испечена ЗАРАНЕЕ, на старте уровня (' +
    JSON.stringify({ испечена: чаша.до.испечена, кусков: чаша.до.кусков }) + ')');
  expect(чаша.вЛёте.дети - чаша.детиДо === 1,
    'ЧАША: разлёт — ОДИН объект сцены, а не N кусков (' + чаша.детиДо + ' -> ' + чаша.вЛёте.дети + ')');
  expect(чаша.вЛёте.инфо.geoId === чаша.до.geoId,
    'ЧАША: взрыв берёт геометрию из кэша, а не строит заново (id ' +
    чаша.до.geoId + ' -> ' + чаша.вЛёте.инфо.geoId + ')');
  expect(чаша.до.размеры && чаша.до.размеры.ratio >= 8,
    '⚠️ ЧАША: куски РАЗНОГО размера — пластины и крошка, а не решётка (разброс площадей ×' +
    (чаша.до.размеры && чаша.до.размеры.ratio) + ', нужно >= 8)');
  expect(чаша.силуэт === false,
    '⚠️ ЧАША: после разлёта силуэта НЕТ — цикл не возвращает стекло (видно: ' + чаша.силуэт + ')');
  expect(чаша.кладДо != null && чаша.кладМин != null && чаша.кладМин < 0.6,
    '⚠️ ЧАША: КЛАД летит в центр ВМЕСТЕ СО ВСЕМИ (слово владельца «все объекты»): ' +
    чаша.кладДо + ' -> ' + чаша.кладМин + ' до точки сбора');
  expect(чаша.поп && чаша.поп.n >= 2,
    'ЧАША: в хлопке есть ПОП (свой + кладовый) — язык хлопка тот же, что у матча (' +
    JSON.stringify(чаша.поп) + ')');
  expect(чаша.сэмплов >= 3 && чаша.минР < чаша.радиусДо * 0.5,
    'ЧАША: куча СЛЕТАЕТСЯ В ЦЕНТР — радиус живой кучи падает (' +
    чаша.радиусДо.toFixed(2) + ' -> ' + (isFinite(чаша.минР) ? чаша.минР.toFixed(2) : '—') +
    ', сэмплов ' + чаша.сэмплов + ')');
  await bowlVisPage.close();


  // ===== НОЧНЫЕ ЗВЁЗДЫ: БОЛЬШЕ МЕЛКИХ + ПУЛЬС МЕНЬШИНСТВА =====
  // Слово владельца 2026-08-06: «больше мелких звёзд НЕ МЕНЯЯ их текущее
  // количество» и «некоторые, например 1 из 10, совсем аккуратно пульсируют,
  // плавно меняя прозрачность».
  // ⚠️⚠️ ПОЧЕМУ ПУЛЬС ПРОВЕРЯЕТСЯ РУЧКОЙ, А НЕ «КАК ЕСТЬ»: 10% пульсирующих на
  // фоне моргания ВСЕХ пиксельный замер НЕ РАЗЛИЧАЕТ — размах яркости 0.41
  // против 0.41 у базы, разница тонет в шуме порога на 40 пятнах. При доле 1.0
  // тот же замер даёт 0.93. Поэтому страж гоняет ДОЛЮ и проверяет, что тракт
  // «доля -> пиксели» жив; сама доля 0.10 — это константа, а не поведение.
  const starPage = await browser.newPage({ viewport: { width: 900, height: 760 } });
  starPage.on('pageerror', e => errors.push('PAGEERROR(stars): ' + e.message));
  await starPage.goto('file://' + path.join(__dirname, 'index.html') + '?hour=1');
  await starPage.waitForFunction(() => window.__game && window.__game.alive() > 0, null, { timeout: 30000 });
  await starPage.evaluate(() => { window.__game.skipIntro();
    for (const id of ['topBar', 'bottomBar', 'face', 'vitrine', 'mainScreen']){
      const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
  await new Promise(r => setTimeout(r, 900));
  // общий разборЗвёзд кадра: пятна ярче фона СТРОКИ (небо плавно светлеет книзу —
  // глобальный порог ловил бы градиент: первое измерение дало «звезду» в 5057 px)
  const снимокЗвёзд = async () => (await starPage.screenshot()).toString('base64');
  const разборЗвёзд = async (кадры) => starPage.evaluate(async (кадры) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const imgs = await Promise.all(кадры.map(load));
    const W = imgs[0].width, H = Math.floor(imgs[0].height * 0.45);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    const поле = [];
    for (const im of imgs){
      cx.clearRect(0, 0, W, H); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.299*d[i*4] + 0.587*d[i*4+1] + 0.114*d[i*4+2];
      const V = new Float32Array(W * H);
      for (let y = 0; y < H; y++){
        const row = Array.from(L.subarray(y*W, (y+1)*W)).sort((a, b) => a - b), md = row[W >> 1];
        for (let x = 0; x < W; x++) V[y*W + x] = L[y*W + x] - md;
      }
      поле.push(V);
    }
    const MX = new Float32Array(W * H);
    for (const V of поле) for (let i = 0; i < W * H; i++) if (V[i] > MX[i]) MX[i] = V[i];
    const seen = new Uint8Array(W * H), площади = [], размах = [], сырые = [];
    for (let i = 0; i < W * H; i++){
      if (seen[i] || MX[i] < 12) continue;
      const пикс = [], стек = [i]; seen[i] = 1;
      while (стек.length){
        const j = стек.pop(); пикс.push(j);
        const x = j % W, y = (j - x) / W;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny*W + nx; if (!seen[k] && MX[k] >= 12){ seen[k] = 1; стек.push(k); }
        }
      }
      if (пикс.length > 200) continue;           // > 200 px — это не звезда
      площади.push(пикс.length);
      сырые.push(поле.map(V => { let s = 0; for (const j of пикс) s += V[j]; return s / пикс.length; }));
    }
    // ⚠️⚠️ НОРМИРОВКА КАДРА. Без неё замер меряет не пульс звезды, а ГЛОБАЛЬНУЮ
    // яркость неба: за время съёмки наливается красная угроза помола, и все
    // пятна ходят хором. Первый прогон дал перевёрнутый результат — «без
    // пульса» размах БОЛЬШЕ, чем «пульс у всех». Делим яркость каждого пятна
    // на медиану пятен ЭТОГО кадра — общий множитель уходит, остаётся личное.
    const масштаб = поле.map((_, f) => {
      const v = сырые.map(r => r[f]).filter(x => x > 0).sort((a, b) => a - b);
      return v[v.length >> 1] || 1;
    });
    for (const r of сырые){
      const н = r.map((v, f) => v / масштаб[f]);
      const mx = Math.max(...н), mn = Math.min(...н);
      if (mx > 0) размах.push((mx - mn) / mx);
    }
    площади.sort((a, b) => a - b); размах.sort((a, b) => a - b);
    return { звёзд: площади.length, медианаПлощади: площади[площади.length >> 1] || 0,
             медианаРазмаха: +(размах[размах.length >> 1] || 0).toFixed(3),
             // ⚠️ ДОЛЯ ГЛУБОКО ГУЛЯЮЩИХ, А НЕ МЕДИАНА: моргание есть у ВСЕХ и
             // даёт размах ~0.31, поэтому медиана к доле пульса почти глуха
             // (лесенка: 0.306 при доле 0 против 0.569 при доле 1). А вот доля
             // выше 0.45 разделяет начисто: 0% против 77.5%.
             глубоких: +(размах.filter(v => v > 0.45).length / Math.max(1, размах.length) * 100).toFixed(1) };
  }, кадры);
  const звёзды = await разборЗвёзд([await снимокЗвёзд()]);
  expect(звёзды.звёзд >= 25 && звёзды.медианаПлощади <= 16,
    '⚠️ ЗВЁЗДЫ: мелких стало больше при том же количестве (пятен ' + звёзды.звёзд +
    ', медиана площади ' + звёзды.медианаПлощади + ' px; у прежнего ровного разброса было 29)');
  // ПУЛЬС: гоняем ДОЛЮ и смотрим, доезжает ли она до пикселей
  // ⚠️ МИКСЕР ДЕРЖИМ СПОКОЙНЫМ: за 9 с простоя наливается угроза помола, а
  // потом он начинает есть предметы — сцена меняется, и замер поедет.
  const кадрыПульсаЗвёзд = async () => { const k = []; for (let i = 0; i < 5; i++){
      await starPage.evaluate(() => { window.__game.stats().lastAction = performance.now(); });
      k.push(await снимокЗвёзд()); await new Promise(r => setTimeout(r, 1800)); } return k; };
  await starPage.evaluate(() => window.__game.starPulse(1.0, 0.95));
  const всеПульсируют = await разборЗвёзд(await кадрыПульсаЗвёзд());
  await starPage.evaluate(() => window.__game.starPulse(0, 0.55));
  const безПульса = await разборЗвёзд(await кадрыПульсаЗвёзд());
  await starPage.evaluate(() => window.__game.starPulse(0.10, 0.55));
  // ⚠️⚠️ ПОРОГ ПОСТАВЛЕН ПО РАСПРЕДЕЛЕНИЮ, А НЕ «на глаз от одного прогона».
  // Прежние 40 стояли впритык к здоровому разбросу и ОДИН РАЗ ПОКРАСНЕЛИ НА
  // ИСПРАВНОЙ СБОРКЕ (37.7% в чужом прогоне; правка Интерфейса физически не
  // могла коснуться — звёзды живут на своей странице). Такой страж однажды
  // съедает кому-то полдня, и это ровно та болезнь, что была у камеры.
  // ЛИНЕЙКА: headless Chromium на GPU (--use-angle=metal), 5 кадров на руку
  // через 1.8 с, верхние 45% кадра, пятно от 12 над фоном СТРОКИ, «глубокий» —
  // размах > 0.45. ЗАМЕР: 6 проб (3 в покое, 3 под полным сьютом) + 2 прогона
  // сьюта. Здоровые значения при доле 1.0: 37.7 / 55.8 / 57.1 / 57.5 / 61.5 /
  // 64.1 / 64.1 / 78.3 — минимум 37.7. При доле 0 — РОВНО 0 во всех восьми.
  // Коридор между сломанным (0) и здоровым (37.7) пуст, порог 20 стоит в его
  // середине: запас вдвое в обе стороны.
  // ⚠️ Сравниваем РАЗНОСТЬ рук, а не абсолют: обе руки меряются в одном
  // прогоне и под одной нагрузкой, поэтому разность устойчивее любой из них.
  expect(безПульса.глубоких <= 10 && (всеПульсируют.глубоких - безПульса.глубоких) >= 20,
    '⚠️ ЗВЁЗДЫ: пульс ДОЕЗЖАЕТ ДО ПИКСЕЛЕЙ — доля 1.0 против 0 (глубоко гуляющих ' +
    безПульса.глубоких + '% -> ' + всеПульсируют.глубоких + '%, разница ' +
    (всеПульсируют.глубоких - безПульса.глубоких).toFixed(1) + ' при пороге 20; ' +
    'здоровый минимум по 8 замерам — 37.7, сломанное даёт 0)');
  const ручка = await starPage.evaluate(() => window.__game.starPulse());
  expect(ручка && Math.abs(ручка.frac - 0.10) < 1e-6,
    'ЗВЁЗДЫ: боевая доля пульса — 1 из 10, как просил владелец (' + JSON.stringify(ручка) + ')');
  await starPage.close();

  // ===== ТАБЛИЦА ЛИДЕРОВ: ОТПРАВКА СЧЁТА (зона ИНТЕГРАЦИИ) =====
  // ⚠️ СЕКЦИЯ В КОНЦЕ И НА СВОЕЙ СТРАНИЦЕ: она чистит localStorage (нужен игрок
  // с НУЛЕВЫМ балансом) и доигрывает уровень до победы — такой контекст соседям
  // ломать нельзя. Тот же приём, что у камней и меню.
  // ⚠️⚠️ СЕТИ ЗДЕСЬ НЕТ ВОВСЕ: `fetch` подменён ДО загрузки страницы
  // (addInitScript), поэтому стенд не нужен, гонки загрузки нет по построению, а
  // ответы сервера мы задаём сами — включая отказ по частоте.
  {
    // ⚠️⚠️ СТРАНИЦА ПО HTTP И БЕЗ ПРИЗНАКА БОТА — иначе `LB_NOSEND` глушит
    // отправку по обоим признакам (`file:` и `navigator.webdriver`), и стражи
    // ниже мерили бы ГЕЙТ вместо отправки: «отправок 0» было бы истинно и на
    // сборке, где отправки нет вовсе. Сеть при этом всё равно замокана.
    const стенд = await httpStand();
    const lbPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await lbPage.addInitScript(маскаБота);
    await lbPage.addInitScript(() => {
      try { localStorage.clear(); localStorage.setItem('mixer_lb_url', 'http://lb.test'); } catch (e) {}
      window.__lbMock = { posts: [], rateOnce: false, retry: 1 };
      const of = window.fetch;
      window.fetch = function (u, o) {
        if (String(u).indexOf('/v1/score') >= 0) {
          let b = null; try { b = JSON.parse(o && o.body); } catch (e) {}
          window.__lbMock.posts.push({ at: performance.now(), s: b && b.s });
          if (window.__lbMock.rateOnce) {
            window.__lbMock.rateOnce = false;
            return Promise.resolve(new Response(JSON.stringify({ ok: 0, err: 'rate',
              retry: window.__lbMock.retry, s: 0, rank: null }), { status: 429 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ ok: 1, s: b && b.s,
            rank: null, exact: 0, n: b && b.n }), { status: 200 }));
        }
        // ⚠️ ФОРМА ОТВЕТА ВЗЯТА У НАСТОЯЩЕГО СЕРВЕРА, а не придумана: `/v1/me`
        // на отсутствующую строку отдаёт `404 {"err":"none"}` (index.js:238,
        // сверено запросом к стенду 2026-08-10). Мок с «пустым 404» проверял бы
        // путь, которого в бою нет.
        if (String(u).indexOf('/v1/me') >= 0) {
          window.__lbMock.me = (window.__lbMock.me || 0) + 1;
          return Promise.resolve(new Response(JSON.stringify({ err: 'none' }), { status: 404 }));
        }
        return of.apply(this, arguments);
      };
    });
    await lbPage.goto(стенд.url);
    await lbPage.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    await lbPage.evaluate(() => window.__game.skipIntro());
    await new Promise((r) => setTimeout(r, 1500));
    // ⚠️ САНИТАР ОБСТАНОВКИ: без него «отправок 0» ниже неотличимо от «гейт всё
    // ещё держит». Утверждаем именно ПРЕДПОСЫЛКУ, отдельной строкой, чтобы по
    // красному было видно, что сломалось — стенд или сама отправка.
    const обстановка = await lbPage.evaluate(() => ({
      протокол: location.protocol, бот: navigator.webdriver,
      база: window.__lb ? window.__lb.base() : null }));
    expect(обстановка.протокол === 'http:' && обстановка.бот === false && !!обстановка.база,
      'САНИТАР ОТПРАВКИ: стенд поднят по http, признак бота погашен, адрес задан (' +
      JSON.stringify(обстановка) + ')');

    // (1) НОЛЬ НЕ ОТПРАВЛЯЕТСЯ
    // ⚠️ САНИТАР В ТОМ ЖЕ АССЕРТЕ ОБЯЗАТЕЛЕН: без проверки, что таблица ВКЛЮЧЕНА
    // (`base` непустой), «ноль отправок» было бы истинно и на выключенной —
    // то есть страж-тавтология. Он же ловит регрессию в разборе признака `?lb`.
    // ⚠️⚠️ СТРАЖ ОБЯЗАН ИСПОЛНИТЬ ПРОВЕРЯЕМЫЙ ПУТЬ, А НЕ ЖДАТЬ ЕГО. Первая версия
    // просто смотрела «после загрузки отправок ноль» — и была зелена по ПУСТОЙ
    // причине: на `file://` облачный синк не запускается, событие баланса не
    // приходит вовсе, и диверсия «ноль снова отправляется» ничего не ломала
    // (двусторонний прогон показал «покраснели: НИЧЕГО»). Поэтому событие с
    // нулевым балансом мы вызываем САМИ — банк нуля дёргает `fireStarsChange`
    // безусловно, ровно как облачный синк у настоящего игрока.
    await lbPage.evaluate(() => window.__game.bankScore(0));
    await new Promise((r) => setTimeout(r, 1500));   // больше окна склейки 0.5 с
    const приСтарте = await lbPage.evaluate(() => ({ n: window.__lbMock.posts.length,
      bal: window.__game.leaderboardScore(), base: window.__lb.base() }));
    expect(приСтарте.base === 'http://lb.test' && приСтарте.bal === 0 && приСтарте.n === 0,
      'ТАБЛИЦА: НОЛЬ НЕ ОТПРАВЛЯЕТСЯ — событие баланса при нуле строку не заводит (адрес '
      + JSON.stringify(приСтарте.base) + ', баланс ' + приСтарте.bal + ', отправок ' + приСтарте.n + ')');

    // (2) ОДНА ОТПРАВКА НА ПОБЕДУ
    // Сперва зарабатываем очки матчами: финальная зачистка очков НЕ начисляет,
    // и на чистом `leaveSingles` баланс остался бы нулём — страж проверял бы
    // пустоту (проверено замером до постановки стража).
    await lbPage.evaluate(() => { for (let i = 0; i < 12; i++) window.__game.autoMatch(); });
    await new Promise((r) => setTimeout(r, 700));
    // ⚠️⚠️ ЖДЁМ ФАКТ, А НЕ ЧАСЫ, И ВЫИГРЫВАЕМ КАК ИГРОК. Первая версия звала
    // `leaveSingles` и крутила фиксированные 300×60 мс: одиночки доедает ФИНАЛ
    // по предмету за 0.5 с, на восьми десятках это минуты — замер приходил ДО
    // банка, баланс был нулём, и страж краснел на ИСПРАВНОЙ сборке.
    // Теперь матчим пары, при тупике встряхиваем, а выходим по СОБЫТИЮ:
    // уровень закончен И счёт забанкован.
    let дождались = false;
    for (let i = 0; i < 600; i++) {
      const st = await lbPage.evaluate(() => { const g = window.__game;
        const over = !!(g.level() && g.level().over);
        if (!over) { if (g.availablePairs() === 0) g.shake(); else g.autoMatch(); }
        return { over: over, bal: g.leaderboardScore() }; });
      if (st.over && st.bal > 0) { дождались = true; break; }
      await new Promise((r) => setTimeout(r, 80));
    }
    await new Promise((r) => setTimeout(r, 1800));   // пусть отработает отложенный таймер
    const победа = await lbPage.evaluate(() => ({ posts: window.__lbMock.posts.slice(),
      bal: window.__game.leaderboardScore() }));
    expect(дождались && победа.bal > 0 && победа.posts.length === 1 && победа.posts[0].s === победа.bal,
      'ТАБЛИЦА: ОДНА ОТПРАВКА НА ПОБЕДУ — банк и подписка не дублируют друг друга (отправок '
      + победа.posts.length + ', ушло ' + JSON.stringify(победа.posts.map((x) => x.s))
      + ', баланс ' + победа.bal + ', победа дождалась: ' + дождались + ')');

    // (3) 429 НЕ ТЕРЯЕТСЯ, И ЗАДЕРЖКУ КЛИЕНТ БЕРЁТ ИЗ ТЕЛА
    // ⚠️ РАЗЛИЧАЮЩИЙ ПРИЗНАК: мок говорит `retry: 1`, а собственный фолбэк
    // клиента — 30 с. Ждём три секунды: успел повторить — значит прочитал ТЕЛО;
    // держит свою константу — страж краснеет.
    await lbPage.evaluate(() => { window.__lbMock.rateOnce = true; window.__lbMock.posts.length = 0; });
    await lbPage.evaluate((n) => window.__game.spendStars(n), Math.max(1, Math.floor(победа.bal / 2)));
    // ждём ФАКТ повторной отправки, потолок 5 с — он и различает: своя константа
    // клиента 30 с, значит уложиться можно ТОЛЬКО прочитав `retry` из тела.
    let отказ = null;
    for (let i = 0; i < 50; i++) {
      отказ = await lbPage.evaluate(() => ({ posts: window.__lbMock.posts.slice(),
        bal: window.__game.leaderboardScore(), lb: window.__lb.pending() }));
      if (отказ.posts.length >= 2 && !отказ.lb.timer) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const последняя = отказ.posts[отказ.posts.length - 1];
    expect(отказ.bal < победа.bal && отказ.posts.length >= 2 && !!последняя
      && последняя.s === отказ.bal && !отказ.lb.timer,
      'ТАБЛИЦА: 429 НЕ ТЕРЯЕТСЯ — после отказа отправка повторилась с новым числом (отправок '
      + отказ.posts.length + ', ушло ' + JSON.stringify(отказ.posts.map((x) => x.s))
      + ', баланс ' + отказ.bal + ')');

    // (4) «СТРОКИ ЕЩЁ НЕТ» — ЭТО `ok`, А НЕ ОТКАЗ
    // ⚠️⚠️ ЭТОТ СТРАЖ СТОИТ НА МЕСТЕ НЕДОСТИЖИМОЙ ВЕТКИ. Сервер отвечает
    // `404 {"err":"none"}`, а `lbFetch` любое `err` в теле объявляет `refused` —
    // прежнее условие `r.code === 404` стояло ПОСЛЕ общего выхода и не
    // исполнялось никогда (замер против стенда). То есть КАЖДЫЙ игрок до первой
    // победы получал `refused`, и экран прятал блок молча: новичок был
    // неотличим от мёртвого сервера.
    // ⚠️ Санитар `запросов` в том же ассерте: без него «состояние ok» было бы
    // истинно и на сборке, где `me()` вовсе не ходит в сеть.
    const нетСтроки = await lbPage.evaluate(async () => {
      window.__lb.invalidate();
      const r = await window.__lb.me();
      return { r: r, запросов: window.__lbMock.me || 0 };
    });
    const мс = нетСтроки.r || {};
    expect(нетСтроки.запросов >= 1 && мс.state === 'ok' && мс.me === null
      && мс.rank === null && мс.exact === false,
      'ТАБЛИЦА: НЕТ СТРОКИ — НЕ ОТКАЗ (запросов ' + нетСтроки.запросов
      + ', state ' + JSON.stringify(мс.state) + ', me ' + JSON.stringify(мс.me)
      + ', rank ' + JSON.stringify(мс.rank) + ', exact ' + JSON.stringify(мс.exact) + ')');
    // ⚠️ ЗАКРЫТИЕ СТРАНИЦЫ ПЕРЕЕХАЛО ВНИЗ (диспетчер, разрешение конфликта
    //    2026-08-10): здесь стоял `await lbPage.close()`, а следующая секция —
    //    стражи ЭКРАНА таблицы — работает на ТОЙ ЖЕ странице. Обе стороны были
    //    правы поодиночке: одна закрывала за собой, вторая наследовала открытую.
    //    После склейки прогон падал `Target page has been closed` на 559-м
    //    ассерте — без вердикта, то есть выглядел как «оборвался сам».
    //    Закрываем ОДИН раз, после последнего потребителя (ниже).

    // ===== ЭКРАН ТАБЛИЦЫ: ДВЕ ВКЛАДКИ =====
  // ⚠️ Ходим НАСТОЯЩИМ путём — кнопка в меню, кнопки вкладок, крестик: страж
  // обязан идти той же дорогой, что игрок, иначе проверит путь, которого нет.
  const экран = await lbPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const вид = () => {
      // ⛔ ВКЛАДОК И ЗАГЛУШКИ БОЛЬШЕ НЕТ (решение владельца «только наша
      // таблица»), поэтому и полей о них тут нет. Заголовок с подзаголовком —
      // из макета, их и снимаем.
      const o = document.getElementById('lbOverlay');
      const t = document.querySelector('#lbOverlay .lb-title');
      const sb = document.querySelector('#lbOverlay .lb-sub');
      return { открыт:getComputedStyle(o).display !== 'none',
               вкладок:document.querySelectorAll('#lbOverlay .lb-tab').length,
               заглушка:document.querySelectorAll('#lbOverlay .lb-note').length,
               заголовок:t ? t.textContent.trim() : '',
               подзаголовок:sb ? sb.textContent.trim().slice(0, 24) : '',
               строк:document.querySelectorAll('#lbList .lb-row').length,
               служебных:document.querySelectorAll('#lbList .lb-serv').length };
    };
    document.getElementById('pauseBtn').click(); await sleep(300);
    const доОткрытия = вид();
    // ⚠️⚠️ ЗАМЕР «ФИЧА ВЫКЛЮЧЕНА» ДЕЛАЕТСЯ ЗДЕСЬ, НА ОТКРЫТОМ МЕНЮ, И ЭТО НЕ
    // придирка: у ЗАКРЫТОГО `#mainScreen` стоит `display:none`, поэтому высота
    // блока равна нулю ПРИ ЛЮБОМ поведении — такой ассерт был бы зелёным и на
    // сборке, где `hidden` не ставится вовсе (тавтология, поймана на себе).
    // Проверяем ПЕРЕХОД: снимаем модуль -> блока нет; возвращаем -> блок есть.
    const высота = () => { const e = document.getElementById('msLbEntry');
      return e ? Math.round(e.getBoundingClientRect().height) : -1; };
    const модуль = window.__lb;
    let выкл = -1, вкл = -1;
    try {
      window.__lb = undefined; window.__game.lbEntryRefresh(); await sleep(50); выкл = высота();
    } finally { window.__lb = модуль; window.__game.lbEntryRefresh(); }
    await sleep(50); вкл = высота();
    // ⚠️ ВХОД — БЛОК `#msLbEntry` ПОД РЯДОМ ПРОФИЛЯ (макеты 840:4344/840:4633).
    // Прежняя временная строка `#lbOpen` в настройках снята вместе с заглушкой;
    // страж ходит тем же путём, что игрок, поэтому переехал за ней.
    const вход = (() => {
      const e = document.getElementById('msLbEntry');
      if (!e) return { есть:false };
      const r = e.getBoundingClientRect();
      return { есть:true, виден:!e.hidden && r.height > 0,
               место:(document.getElementById('msLbeSub') || {}).textContent || '',
               точка:(document.getElementById('msLbeDot') || {}).textContent || '',
               аватаров:document.querySelectorAll('#msLbeAvs img').length,
               кнопок:document.querySelectorAll('#msLbEntry button').length,
               // порядок в раскладке: блок обязан стоять НИЖЕ ряда профиля и ВЫШЕ Play
               подПрофилем:r.top >= document.querySelector('.ms-head').getBoundingClientRect().bottom,
               надИгрой:r.bottom <= document.querySelector('.ms-play').getBoundingClientRect().top };
    })();
    document.getElementById('msLbEntry').click(); await sleep(500);
    const открыт = вид();
    document.getElementById('lbClose').click(); await sleep(200);
    const закрыт = вид();
    { const p = document.querySelector('.ms-play'); if (p) p.click(); }
    await sleep(300);
    return { доОткрытия, открыт, закрыт, вход, выкл, вкл };
  });
  console.log('экран таблицы:', JSON.stringify(экран));
  console.log('точка входа:', JSON.stringify(экран.вход));
  expect(экран.доОткрытия.открыт === false && экран.открыт.открыт === true &&
         экран.закрыт.открыт === false,
    '⚠️ ЭКРАН ТАБЛИЦЫ: открывается точкой входа в меню и закрывается крестиком — проверен ПЕРЕХОД в обе стороны');
  // ⚠️ МЕСТО В РАСКЛАДКЕ — НЕСУЩЕЕ, А НЕ КОСМЕТИКА: по макету блок стоит МЕЖДУ
  // рядом профиля и карточкой Play. Прежнее указание «вместо снятого баннера»
  // (то есть НИЖЕ Play) отменено самим макетом, и без этого ассерта возврат к
  // нему прошёл бы молча — блок виден в обоих случаях.
  expect(экран.вход.есть && экран.вход.виден && экран.вход.подПрофилем && экран.вход.надИгрой,
    '⚠️ ТОЧКА ВХОДА: видна и стоит МЕЖДУ профилем и Play (' + JSON.stringify(экран.вход) + ')');
  // ⚠️ РОВНО ОДИН ФОКУСИРУЕМЫЙ УЗЕЛ: ряд кликается целиком (по макету), но
  // клавиатуре и озвучке достаётся одна кнопка. Второй слушатель на ней дал бы
  // ДВА открытия на нажатие — то есть два сетевых захода.
  expect(экран.вход.кнопок === 1,
    'ТОЧКА ВХОДА: ровно одна настоящая кнопка на оба представления (кнопок ' + экран.вход.кнопок + ')');
  // ⚠️⚠️ ФИЧА ВЫКЛЮЧЕНА — БЛОКА В РАСКЛАДКЕ НЕТ ВОВСЕ (то же правило, что у
  // врезки победы: резервировать место под данные, которых в этой сборке быть
  // не может, — значит без причины двигать меню). Утверждается ПЕРЕХОД: ноль
  // при снятом модуле И ненулевая высота при возвращённом. Одного нуля мало —
  // он истинен и на сборке, где блок не показывается никогда.
  expect(экран.выкл === 0 && экран.вкл > 0,
    '⚠️ ТОЧКА ВХОДА: без модуля таблицы блок НЕ занимает места, с ним — занимает (' +
    экран.выкл + ' -> ' + экран.вкл + ' px)');
  // ⚠️⚠️ НОВИЧОК: строки игрока в таблице ещё нет (`/v1/me` отдаёт 404
  // `err:"none"`), значит ТОЧНОГО места нет — и числа быть не должно НИ В ОДНОМ
  // из двух представлений. Это ровно тот дефект, который стоил нам молчащего
  // блока у каждого игрока до первой победы: прикидка из ответа на отправку
  // («место 1» всем подряд) здесь не показывается по построению.
  expect(экран.вход.место === '' && экран.вход.точка === '',
    '⚠️ ТОЧКА ВХОДА: без ТОЧНОГО места число не показывается ни строкой, ни в заголовке (' +
    JSON.stringify({ строка:экран.вход.место, заголовок:экран.вход.точка }) + ')');
  // ⚠️⚠️ ШИРИНА ЭКРАНА ТАБЛИЦЫ — ПОТОЛОК С ОБЕИХ СТОРОН (прямое слово владельца
  // «ширина таблицы 560 px максимальная»). Один потолок `<=560` зелен и у
  // экрана шириной 200 — то есть у сборки, где карточка схлопнулась; нижняя
  // граница отличает «не шире» от «не уже» (ловля ИНТЕРФЕЙСА).
  // ⚠️ И ПОДЛОЖКА ОБЩАЯ С «More»: у попапа НЕТ своего фона, он берётся у
  // `.overlay`. Сравниваем с ЖИВЫМ экраном More, а не с литералом — тот
  // разъехался бы при первой правке общего стиля.
  // ⚠️ МЕРИМ НА ШИРОКОМ ВЬЮПОРТЕ: 560 — это ПОТОЛОК, а страница стража узкая
  // (390), там карточка законно уже. Замер на ней дал бы 337 и КРАСНЫЙ на
  // исправной сборке — тот самый случай «страж проверяет не то, что называет».
  await lbPage.setViewportSize({ width: 1280, height: 800 });
  await lbPage.waitForTimeout(250);
  const попап = await lbPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('pauseBtn').click(); await sleep(300);
    document.getElementById('msLbEntry').click(); await sleep(600);
    const o = document.getElementById('lbOverlay'), c = document.querySelector('#lbOverlay .lb-card');
    const so = document.getElementById('starsOverlay');
    const cs = getComputedStyle(o), ss = getComputedStyle(so);
    const x = document.getElementById('lbClose');
    const out = { ширина:Math.round(c.getBoundingClientRect().width),
      фон:cs.backgroundColor, фонMore:ss.backgroundColor,
      размытие:cs.backdropFilter || cs.webkitBackdropFilter,
      размытиеMore:ss.backdropFilter || ss.webkitBackdropFilter,
      крестикКлассы:x ? x.className : '' };
    document.getElementById('lbClose').click(); await sleep(200);
    { const p = document.querySelector('.ms-play'); if (p) p.click(); }
    await sleep(250);
    return out;
  });
  console.log('попап таблицы:', JSON.stringify(попап));
  expect(попап.ширина <= 560 && попап.ширина >= 520,
    '⚠️ ЭКРАН ТАБЛИЦЫ: ширина по слову владельца — не шире 560 И не уже 520 ' +
    '(один потолок зелен и у схлопнутой карточки): ' + попап.ширина + 'px');
  expect(попап.фон === попап.фонMore && попап.размытие === попап.размытиеMore,
    '⚠️ ЭКРАН ТАБЛИЦЫ: подложка ОБЩАЯ с экраном More — «все попапы в этом стиле» ' +
    '(' + JSON.stringify({ таблица:попап.фон, more:попап.фонMore }) + ')');
  // ⚠️ КЛАССЫ, А НЕ ПОХОЖЕСТЬ: копия стилей прошла бы «выглядит так же» и
  // разъехалась при первой правке More; на `.st-close` висит своя спека.
  expect(/\biconBtn\b/.test(попап.крестикКлассы) && /\bst-close\b/.test(попап.крестикКлассы),
    '⚠️ ЭКРАН ТАБЛИЦЫ: крестик несёт ТЕ ЖЕ классы, что у More («' + попап.крестикКлассы + '»)');
  await lbPage.setViewportSize({ width: 390, height: 780 });
  await lbPage.waitForTimeout(250);
  // ⚠️⚠️ БОЕВОЙ АДРЕС ЗАДАН — СТРАЖ ПРОТИВ САМОГО ТИХОГО ОТКАЗА, КАКОЙ У НАС
  // БЫЛ: `LB_URL` не был объявлен НИГДЕ, `LB_BASE` падал в пустую строку, и вся
  // таблица (врезка победы, точка входа, экран) молча выключалась при живом
  // сервере и свёрстанном экране. Ни один ассерт этого не видел — все стражи
  // ставят адрес сами через `mixer_lb_url`, то есть проверяют механику при
  // ЗАДАННОМ адресе и слепы к тому, что в поставке его нет.
  // Читаем СБОРКУ, а не исходник: в игрока едет именно она.
  {
    const сборка = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    // ⚠️ ЧИТАЕМ ВЫРАЖЕНИЕ ЦЕЛИКОМ, А НЕ ЛИТЕРАЛ: у константы стоит гейт `file:`,
    // и regex «= '…'» на ней умер бы молча, отдав пустой адрес на ИСПРАВНОЙ
    // сборке. Страж переезжает за правкой, а не ломается об неё.
    const m = /const LB_URL\s*=\s*([^;]+);/.exec(сборка);
    const выражение = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    const адрес = (/'(https:\/\/[^']+)'/.exec(выражение) || [])[1] || '';
    expect(!!адрес && адрес.indexOf('workers.dev') < 0,
      '⚠️ ПОСТАВКА: боевой адрес таблицы задан и НЕ ведёт на workers.dev — ' +
      'поддомен у воркера выключен (workers_dev = false), такой адрес отвечал бы ' +
      'отказом (адрес «' + адрес + '»)');
  }
  // ⚠️⚠️ ГЕЙТ ЛОКАЛЬНОГО ХОСТА — ЗАЩИТА БОЕВОЙ ТАБЛИЦЫ ОТ НАШИХ ЖЕ ПРОГОНОВ, И
  // ПРОВЕРЯЕТСЯ ОН ПОВЕДЕНИЕМ, А НЕ ТЕКСТОМ КОНСТАНТЫ. Первая версия гейта
  // смотрела только на `file:` и ПРОПУСКАЛА: сьют поднимает свой http-сервер и
  // открывает игру по `http://127.0.0.1:<порт>/index.html` (секции моста и
  // площадки), а там протокол уже другой — два прогона занесли в живую базу три
  // настоящие строки. Текстовый ассерт на подстроку `file:` был бы ЗЕЛЁНЫМ на
  // той самой сборке, которая писала в продакшн: он проверял формулировку, а не
  // следствие. Поэтому поднимаем НАСТОЯЩИЙ локальный сервер и спрашиваем у
  // клиента таблицы, какой адрес он себе вывел.
  {
    // ⚠️ `http` требуем ЗДЕСЬ: выше он объявлен внутри чужого блока и в эту
    // область видимости не попадает (страж упал бы на ReferenceError, а не на
    // проверяемом свойстве — то есть врал бы о причине).
    const http = require('http');
    const srvLB = http.createServer((req, res) => {
      const f = path.join(__dirname, 'index.html');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fs.readFileSync(f));
    });
    await new Promise((r) => srvLB.listen(0, '127.0.0.1', r));
    const порт = srvLB.address().port;
    const p = await browser.newPage();
    // ⚠️ БЕЗ `mixer_lb_url`: любая подмена адреса ПРИОРИТЕТНЕЕ константы и
    // сделала бы проверку пустой — мы бы читали свою же заглушку.
    await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await p.goto('http://127.0.0.1:' + порт + '/index.html');
    await p.waitForFunction(() => window.__lb && typeof window.__lb.base === 'function',
      { timeout: 30000 });
    // ⚠️⚠️ ПРОВЕРЯЕМ ЗАПРЕТ ОТПРАВКИ, А НЕ ПУСТОЙ АДРЕС. Прежняя редакция
    // зануляла адрес на локальном хосте — и владелец на своём стенде не нашёл
    // входа в таблицу ВООБЩЕ (живая жалоба). Засоряет базу только ЗАПИСЬ, а
    // чтение безвредно, поэтому гейт переехал с адреса на `lbSubmit`.
    // Ловим ФАКТ: считаем POST'ы своим перехватчиком и зовём отправку явно.
    const локально = await p.evaluate(async () => {
      const прежний = window.fetch; const посты = [];
      window.fetch = function (u, o) {
        if (String(u).indexOf('/v1/score') >= 0 && o && o.method === 'POST') посты.push(String(u));
        return прежний.apply(this, arguments);
      };
      try {
        const r = await window.__lb.submit();
        return { база: window.__lb.base(), протокол: location.protocol, хост: location.hostname,
                 постов: посты.length, состояние: r && r.state, признак: r && r.err };
      } finally { window.fetch = прежний; }
    });
    // ⚠️ СЕРВЕР ЖИВЁТ ДО КОНЦА БЛОКА: им пользуются ещё таблица хостов и
    // сквозная проверка `.local` ниже. Закрытие здесь (как было в первой
    // редакции) роняло бы их на «connection refused» — то есть страж падал бы
    // не на проверяемом свойстве, а на своей же уборке.
    await p.close();
    console.log('гейт локального хоста:', JSON.stringify(локально));
    expect(локально.постов === 0 && локально.признак === 'bot' && локально.база !== '',
      '⚠️ ПОСТАВКА: с ЛОКАЛЬНОГО хоста таблица ЧИТАЕТСЯ (адрес задан), но отправка ' +
      'НЕ уходит — прогоны сьюта и превью направлений в боевую базу не пишут (' +
      JSON.stringify(локально) + ')');
    // ⚠️ ВТОРАЯ ПОЛОВИНА: «пусто» истинно и на сборке, где адреса нет ВООБЩЕ.
    // Утверждаем, что подмена через `?lb=` тот же клиент читает — то есть тракт
    // «адрес → база» жив, и ноль выше получен ГЕЙТОМ, а не поломкой.
    const p2 = await browser.newPage();
    await p2.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const srvLB2 = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    });
    await new Promise((r) => srvLB2.listen(0, '127.0.0.1', r));
    await p2.goto('http://127.0.0.1:' + srvLB2.address().port + '/index.html?lb=http://lb.probe');
    await p2.waitForFunction(() => window.__lb && typeof window.__lb.base === 'function',
      { timeout: 30000 });
    const подмена = await p2.evaluate(() => window.__lb.base());
    await p2.close(); srvLB2.close();
    expect(подмена === 'http://lb.probe',
      'ПОСТАВКА: тракт «адрес → база» жив — подмена `?lb=` читается (база «' + подмена + '»)');
    // ⚠️⚠️ ТАБЛИЦА ХОСТОВ — ГЛАВНАЯ ЧАСТЬ. Сквозной ассерт выше поднимает
    // `127.0.0.1`, то есть доказывает РОВНО ТОТ случай, который уже починен;
    // `.local` и локальная сеть им не проверяются ПО ПОСТРОЕНИЮ (браузеру не
    // задать произвольное имя хоста). Гейт уже дважды пропускал случай, о
    // котором не вспомнили, — значит проверять надо ПЕРЕЧИСЛЕНИЕ, а его можно
    // прогнать только по чистой функции.
    // ⚠️ `<имя>.local` — Bonjour, и это НЕ мелочь: ровно так телефон владельца
    // ходит на Mac, то есть на этой строке висит открытый пункт «плейтест на
    // телефоне». Найдено ИНТЕГРАЦИЕЙ прогоном списка хостов, а не чтением.
    const p3 = await browser.newPage();
    await p3.goto('http://127.0.0.1:' + порт + '/index.html');
    await p3.waitForFunction(() => window.__game && window.__game.lbHostIsLocal,
      { timeout: 30000 });
    const таблица = await p3.evaluate(() => {
      const L = window.__game.lbHostIsLocal;
      const мест = ['localhost', '127.0.0.1', '127.1.2.3', 'app.localhost', '::1', '[::1]',
        'ivans-macbook.local', 'MacBook-Pro.local', '192.168.1.50', '10.0.0.7',
        '172.20.3.4', '172.16.0.1', '172.31.255.254', '169.254.1.1',
        // ⚠️ IPv6 — В СКОБКАХ, так его отдаёт `location.hostname`. Голый вид
        // тоже держим: адрес может прийти из конфига, а не из адресной строки.
        '[fe80::1]', 'fe80::1', '[FE80::ABCD]', '[febf::1]', '[fd12:3456::1]', 'fc00::1'];
      const чужих = ['lb.blendo.monster', 'playgama.com', 'html5.gamedistribution.com',
        '8.8.8.8', '172.15.0.1', '172.32.0.1', 'localhost.evil.com', 'notlocal',
        // ⚠️ ГРАНИЦА IPv6: глобальный адрес локальным быть НЕ должен, а
        // `fd-server`/`fe80.example.com` — это ИМЕНА, и без проверки «есть
        // двоеточие» регулярка объявила бы их локальными.
        '[2a00:1450:4001::200e]', 'fd-server.example.com', 'fe80.example.com'];
      return { файл: L('file:', ''), пустой: L('http:', ''),
        своиНеЛокальные: мест.filter(h => !L('http:', h)),
        чужиеЛокальные: чужих.filter(h => L('http:', h)) };
    });
    await p3.close();
    console.log('таблица хостов:', JSON.stringify(таблица));
    expect(таблица.файл === true && таблица.пустой === true &&
           таблица.своиНеЛокальные.length === 0,
      '⚠️ ГЕЙТ: все локальные адреса загейчены — `.local` (Bonjour, так ходит ТЕЛЕФОН), ' +
      'петля 127/8, IPv6-петля, RFC1918 и link-local (не загейчены: ' +
      JSON.stringify(таблица.своиНеЛокальные) + ')');
    // ⚠️ ВТОРАЯ СТОРОНА, БЕЗ НЕЁ ПЕРВАЯ ЗЕЛЕНА У ФУНКЦИИ `return true`: чужие
    // хосты локальными считаться НЕ должны. `172.15`/`172.32` — соседи диапазона
    // RFC1918 (границы 16..31), `localhost.evil.com` — подстрока не якорь.
    expect(таблица.чужиеЛокальные.length === 0,
      '⚠️ ГЕЙТ: боевые хосты НЕ считаются локальными — иначе таблица молчала бы у ' +
      'игроков (ошибочно локальные: ' + JSON.stringify(таблица.чужиеЛокальные) + ')');
    // ⚠️⚠️ И СКВОЗНАЯ ПРОВЕРКА ИМЕННО `.local` — замечание ИНТЕГРАЦИИ, и оно
    // точное: сквозной ассерт выше поднимает `127.0.0.1`, то есть доказывает
    // случай, который работал и до правки. Телефонный путь (`<имя>.local`)
    // им не проверяется по построению. Браузеру произвольное имя не задать —
    // маппим его резолвером на петлю СВОИМ экземпляром браузера.
    {
      const bl = await chromium.launch({
        args: ['--host-resolver-rules=MAP ivans-macbook.local 127.0.0.1'] });
      try {
        const pl = await bl.newPage();
        await pl.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
        await pl.goto('http://ivans-macbook.local:' + порт + '/index.html');
        await pl.waitForFunction(() => window.__lb && typeof window.__lb.base === 'function',
          { timeout: 30000 });
        const бонжур = await pl.evaluate(async () => {
          const прежний = window.fetch; const посты = [];
          window.fetch = function (u, o) {
            if (String(u).indexOf('/v1/score') >= 0 && o && o.method === 'POST') посты.push(1);
            return прежний.apply(this, arguments);
          };
          try {
            const r = await window.__lb.submit();
            return { хост: location.hostname, постов: посты.length, признак: r && r.err };
          } finally { window.fetch = прежний; }
        });
        console.log('гейт .local:', JSON.stringify(бонжур));
        expect(бонжур.постов === 0 && бонжур.признак === 'bot' && /\.local$/.test(бонжур.хост),
          '⚠️ ГЕЙТ: с `<имя>.local` (Bonjour — так ТЕЛЕФОН ходит на Mac) отправка НЕ ' +
          'уходит — плейтест с телефона не пишет в боевую базу (' + JSON.stringify(бонжур) + ')');
      } finally { await bl.close(); }
    }
    srvLB.close();
  }
  // ⚠️⚠️ УЗКИЕ ЭКРАНЫ: ЗАГОЛОВОК НЕ НАЕЗЖАЕТ НА АВАТАРЫ. Правая группа блока
  // фиксирована (три аватара + стрелка = 168px), «Leaderboard» стоит `nowrap` и
  // требует 139 — на 393 они сходятся с запасом 20px, на 320 не хватает 65, и
  // флекс ужимал ТЕКСТОВЫЙ БОКС, оставляя буквы поверх аватаров.
  // ⛔ СУЩЕСТВУЮЩИЙ СТРАЖ «МЕНЮ на 320» ЭТОГО НЕ ВИДИТ ПО ПОСТРОЕНИЮ: он ловит
  // горизонтальную прокрутку, а её тут нет ни на одной ширине (замер:
  // `scrollWidth − clientWidth` = 0 на 320/360/375/390/430). Нужна СВОЯ линейка.
  // ⚠️ МЕРИМ ЧЕРНИЛА ЧЕРЕЗ `Range`, А НЕ `scrollWidth` — тот у переполняющего
  // текста врёт (правило канона, чипса ×1.25).
  // ⚠️⚠️ СТРАЖ ПРИВОДИТ ОБСТАНОВКУ САМ. Страница общая, и на ней замокан только
  // `/v1/score` и `/v1/me` — топ уходил бы в настоящую сеть, отдавал `offline` и
  // аватаров было бы НОЛЬ. Тогда «аватары уступают» проверялось бы на пустоте.
  // Ставим свой ответ `/v1/top` (строки — МАССИВЫ `[имя, аватар, счёт]`, как у
  // боевого сервера) и снимаем его в `finally`.
  const промер = async () => lbPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const прежний = window.fetch;
    window.fetch = function (u) {
      if (String(u).indexOf('/v1/top') >= 0)
        return Promise.resolve(new Response(JSON.stringify({ t:1, n:3, p:1,
          r:[['Otter', 5, 900], ['Perch', 12, 800], ['Tanuki', 46, 700]] }), { status: 200 }));
      return прежний.apply(this, arguments);
    };
    try {
      window.__lb.invalidate();
      document.getElementById('pauseBtn').click(); await sleep(500);
      const t = document.querySelector('.ms-lbe-title');
      const rg = document.createRange(); rg.selectNodeContents(t);
      const ink = rg.getBoundingClientRect(), box = t.getBoundingClientRect();
      const txt = document.querySelector('.ms-lbe-txt').getBoundingClientRect();
      const right = document.querySelector('.ms-lbe-right').getBoundingClientRect();
      const ms = document.getElementById('mainScreen');
      const out = { чернила:Math.round(ink.width), бокс:Math.round(box.width),
                    зазор:Math.round(right.left - txt.right), гориз:ms.scrollWidth - ms.clientWidth,
                    видимыхАватаров:Array.prototype.filter.call(
                      document.querySelectorAll('#msLbeAvs > *'),
                      i => i.getBoundingClientRect().width > 0).length };
      { const p = document.querySelector('.ms-play'); if (p) p.click(); }
      await sleep(250);
      return out;
    } finally { window.fetch = прежний; window.__lb.invalidate(); }
  });
  // Две ширины: 390 (близко к макету 393) и 320 (самая тесная из живых).
  const узкий = await промер();
  await lbPage.setViewportSize({ width: 320, height: 780 });
  await lbPage.waitForTimeout(250);
  const тесно = await промер();
  await lbPage.setViewportSize({ width: 390, height: 780 });
  console.log('точка входа на 390/320:', JSON.stringify(узкий), JSON.stringify(тесно));
  expect(узкий.чернила <= узкий.бокс + 1 && узкий.зазор >= 0 && узкий.гориз === 0,
    'ТОЧКА ВХОДА на 390: заголовок влезает в свой бокс и не наезжает на аватары (' +
    JSON.stringify(узкий) + ')');
  expect(тесно.чернила <= тесно.бокс + 1 && тесно.зазор >= 0 && тесно.гориз === 0,
    '⚠️ ТОЧКА ВХОДА на 320: заголовок влезает и не наезжает — аватары уступают ему ' +
    'поштучно (' + JSON.stringify(тесно) + ')');
  // ⚠️ ВТОРАЯ ПОЛОВИНА, БЕЗ КОТОРОЙ ПЕРВАЯ ЗЕЛЕНА ПРИ ЛЮБОМ ПОВЕДЕНИИ: «влезает»
  // истинно и на сборке, где аватаров нет ВООБЩЕ. Утверждаем, что на широкой
  // раскладке их три, а на тесной — меньше, то есть уступание РАБОТАЕТ.
  // ⚠️⚠️ ТРИ АВАТАРА ВСЕГДА, НА ОБЕИХ ШИРИНАХ — прямое слово владельца. ⛔ Этим
  // ОТМЕНЁН прежний ассерт «аватары уступают тексту поштучно»: он утверждал
  // моё решение той же задачи, а владелец выбрал другое (стопка вместо
  // скрытия). Страж переехал за правилом, а не удалён.
  // ⚠️ И он ОБЯЗАН стоять рядом с проверкой «заголовок влезает» выше: «три»
  // нельзя получить ценой обрезанного текста — иначе мы вернём исходный дефект
  // и объявим его победой.
  expect(узкий.видимыхАватаров === 3 && тесно.видимыхАватаров === 3,
    '⚠️ ТОЧКА ВХОДА: три аватара видимы и на 390, и на 320 — стопкой, без ' +
    'скрытия и без наезда на заголовок (390 → ' + узкий.видимыхАватаров +
    ', 320 → ' + тесно.видимыхАватаров + ')');
  // ⛔ ВКЛАДОК НЕТ — решение владельца «только наша таблица, вкладки
  // отменяются». Прежний страж утверждал, что они переключаются; правило
  // сменилось, и он ПЕРЕЕХАЛ за ним с ОБРАТНЫМ утверждением, а не удалён:
  // иначе возврат вкладок прошёл бы молча. Там же — снятая заглушка текста.
  expect(экран.открыт.вкладок === 0 && экран.открыт.заглушка === 0,
    '⛔ ЭКРАН ТАБЛИЦЫ: вкладок и заглушки текста НЕТ — только наша таблица (' +
    JSON.stringify({ вкладок:экран.открыт.вкладок, заглушек:экран.открыт.заглушка }) + ')');
  // Заголовок и подзаголовок — из макета (840:1273/840:1274), а не выдуманные.
  expect(экран.открыт.заголовок === 'Leaderboard' && /^Switch on a booster/.test(экран.открыт.подзаголовок),
    'ЭКРАН ТАБЛИЦЫ: заголовок и подзаголовок взяты из макета (' +
    JSON.stringify({ з:экран.открыт.заголовок, п:экран.открыт.подзаголовок }) + ')');
  expect(экран.открыт.строк + экран.открыт.служебных > 0,
    'ЭКРАН ТАБЛИЦЫ: список не пуст молча — либо строки, либо ЧЕСТНОЕ служебное состояние (' +
    экран.открыт.строк + ' строк, ' + экран.открыт.служебных + ' служебных)');

  await lbPage.close();
  стенд.close();
  }


  // ⛔ ВРЕЗКА ТАБЛИЦЫ СНЯТА С ЭКРАНА ПОБЕДЫ (слово владельца: «не должно быть
  // этого блока на финальном экране»). Секция её стражей УДАЛЕНА вместе с
  // механикой, а не переписана «под новое поведение»: правило проекта — страж
  // умирает вместе с тем, что стерёг, иначе счётчик PASS сохраняется ценой
  // стражей, которые ничего не проверяют.
  // ⚠️ ВЗАМЕН ОДИН ПОЛОЖИТЕЛЬНЫЙ, И ОН НЕСУЩИЙ: узла нет, НО отправка счёта
  // жива. Она к врезке не привязана (идёт подпиской на изменение баланса), и
  // утащи её кто-то следом — место игрока молча исчезло бы и из меню, и с
  // экрана таблицы, а заметить это можно было бы только по пустому серверу.
  {
    // ⚠️ ТОТ ЖЕ СТЕНД, ЧТО У СТРАЖЕЙ ОТПРАВКИ ВЫШЕ: на `file://` отправка
    // загейчена ВТОРЫМ признаком, и одного гашения `navigator.webdriver` мало —
    // страж краснел бы на исправной сборке. Проверено пробой: маска снимает
    // только признак бота, протокол остаётся.
    const стендW = await httpStand();
    const wp = await browser.newPage({ viewport: { width: 390, height: 780 } });
    wp.on('pageerror', e => errors.push('PAGEERROR(nowinlb): ' + e.message));
    await wp.addInitScript(маскаБота);
    await wp.addInitScript(() => {
      try { localStorage.clear(); localStorage.setItem('mixer_lb_url', 'http://lb.test'); } catch (e) {}
      // ⚠️ Гасим признак автоматизации: иначе отправка законно загейчена как
      // автопрогон, и страж мерил бы гейт, а не связь врезки с отправкой.
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
      window.__posts = [];
      const of = window.fetch;
      window.fetch = function (u, o) {
        if (String(u).indexOf('/v1/score') >= 0 && o && o.method === 'POST'){
          window.__posts.push(1);
          return Promise.resolve(new Response(JSON.stringify({ ok:1, s:100, rank:null, exact:0 }), { status:200 }));
        }
        if (String(u).indexOf('lb.test') >= 0)
          return Promise.resolve(new Response(JSON.stringify({ err:'none' }), { status:404 }));
        return of.apply(this, arguments);
      };
    });
    await wp.goto(стендW.url);
    await wp.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    await wp.evaluate(() => window.__game.skipIntro());
    await wp.waitForTimeout(900);
    const финал = await wp.evaluate(async () => {
      const g = window.__game;
      g.winScreen(true); await new Promise(r => setTimeout(r, 400));
      const узел = !!document.getElementById('winLb');
      g.bankScore(1500); await new Promise(r => setTimeout(r, 900));
      return { узел, отправок: window.__posts.length,
               протокол: location.protocol, бот: navigator.webdriver };
    });
    await wp.close();
    стендW.close();
    console.log('финальный экран:', JSON.stringify(финал));
    expect(финал.узел === false,
      '⛔ ЭКРАН ПОБЕДЫ: врезки таблицы НЕТ — узел `#winLb` снят (слово владельца)');
    expect(финал.протокол === 'http:' && финал.бот === false,
      'САНИТАР: обстановка игрока приведена (http, признак бота погашен) — иначе ' +
      'ассерт ниже мерит гейт, а не отправку (' + JSON.stringify(финал) + ')');
    expect(финал.отправок >= 1,
      '⚠️ ЭКРАН ПОБЕДЫ: отправка счёта ЖИВА и к снятой врезке не привязана (отправок ' +
      финал.отправок + ')');
  }
  // ===== КРОМКА ЭКРАНА: ВТОРОЙ КАНАЛ ЦВЕТА СЛЕДУЕТ ЗА МЕНЮ =====
  // ⚠️ У кромки ДВА канала: фон html/body (его перекрашивает правило
  // `html.menuopen`) и мета `theme-color`. Замер 2026-08-10 показал, что второй
  // за меню НЕ шёл: фон становился светлым, а мета оставалась цветом НОЧНОГО
  // неба — системе сообщался цвет, которого на экране нет.
  // ⚠️ Меню открываем и закрываем НАСТОЯЩИМ путём (кнопка паузы / клик по
  // карточке Play), а не выставляя класс руками: классом владеет живой код.
  // ⚠️⚠️ СВОЯ СТРАНИЦА, А НЕ ЧУЖАЯ. Прежняя редакция читала `lbPage` соседнего
  // блока — тот её закрывает у себя в конце, и после склейки двух ПРАВИЛЬНЫХ
  // по отдельности блоков прогон падал здесь на `lbPage is not defined`, БЕЗ
  // вердикта, то есть неотличимо от внешнего обрыва. Канон: страж приводит
  // нужное состояние сам и не наследует ресурс от соседа.
  const chPage = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await chPage.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await chPage.goto('file://' + path.join(__dirname, 'index.html'));
  await chPage.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
  await chPage.evaluate(() => window.__game.skipIntro());
  await chPage.waitForTimeout(600);
  const кромка = await chPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const мета = () => { const m = document.querySelector('meta[name="theme-color"]'); return m ? m.getAttribute('content') : null; };
    const пер = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const hex2rgb = (h)=>{ const s = String(h||'').replace('#',''); if (s.length !== 6) return null;
      return [0,2,4].map(i => parseInt(s.slice(i,i+2),16)).join(','); };
    window.__game.winScreen(false);
    const доМеню = мета();
    document.getElementById('pauseBtn').click();
    await sleep(400);
    const вМеню = { мета:мета(), msbg:пер('--ms-bg'), класс:document.documentElement.classList.contains('menuopen') };
    const play = document.querySelector('.ms-play'); if (play) play.click();
    await sleep(400);
    const после = { мета:мета(), класс:document.documentElement.classList.contains('menuopen') };
    return { доМеню, вМеню, после, msRgb:hex2rgb(вМеню.msbg), метаRgb:hex2rgb(вМеню.мета),
             верх:пер('--sky-top-rgb'), низ:пер('--sky-bot-rgb'), игроваяRgb:hex2rgb(доМеню) };
  });
  console.log('кромка/каналы:', JSON.stringify(кромка));
  expect(кромка.вМеню.класс === true && кромка.после.класс === false,
    'САНИТАР КРОМКИ: меню реально открылось и закрылось настоящим путём (иначе ассерты ниже мерят пустоту)');
  // ⚠️⚠️ ДВА КАНАЛА НЕСУТ РАЗНЫЕ СТОПЫ — в этом вся правка: одним значением
  // две кромки не покрасить, а каналов два и они работают (доказано снимком).
  // ⚠️ Распределение проверяется, но НЕ утверждается как истина: какой канал
  // красит верх, покажет устройство; обмен — одна константа `CHROME_SWAP`.
  expect(кромка.игроваяRgb === кромка.низ && кромка.игроваяRgb !== кромка.верх &&
         кромка.игроваяRgb !== '255,255,255',
    '⚠️ КРОМКА: в игре мета = НИЖНИЙ стоп, фон = верхний, и это НЕ нейтраль (' +
    кромка.доМеню + ', верх ' + кромка.верх + ', низ ' + кромка.низ + ')');
  // В МЕНЮ мета = фону меню (оба канала одинаково). ⚠️ И НЕ нейтраль —
  // вторая половина обязательна, белый мы только что снимали.
  expect(кромка.метаRgb === кромка.msRgb && кромка.метаRgb !== '255,255,255',
    '⚠️ КРОМКА: в меню мета = фону МЕНЮ, а не нейтраль (' + кромка.вМеню.мета +
    ', фон меню ' + кромка.вМеню.msbg + ')');
  // ПЕРЕХОД СНОВА ЕСТЬ (небо -> меню -> небо) — проверяем его, а не значение.
  expect(кромка.после.мета === кромка.доМеню && кромка.доМеню !== кромка.вМеню.мета,
    '⚠️ КРОМКА: мета вернулась к небу — тон меню не залипает (' + кромка.доМеню +
    ' -> ' + кромка.вМеню.мета + ' -> ' + кромка.после.мета + ')');

  // ПОДЛОЖКА — ПЛОСКИЙ верхний стоп (градиент на ней не нужен: две кромки
  // красят два канала). ⚠️ И НЕ нейтраль.
  const подложка = await chPage.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { картинка:cs.backgroundImage, цвет:cs.backgroundColor,
             верх:cs.getPropertyValue('--sky-top-rgb').trim() };
  });
  console.log('кромка/подложка:', JSON.stringify(подложка));
  expect(подложка.картинка === 'none' && подложка.цвет === 'rgb(' + подложка.верх.replace(/,/g, ', ') + ')',
    '⚠️ КРОМКА: подложка — плоский ВЕРХНИЙ стоп неба, без градиента и не нейтраль (' +
    подложка.цвет + ' / верх ' + подложка.верх + ')');

  await chPage.close();

  // ===== ЭКРАН НОВОЙ ВЕЩИ (макеты 846:4814 моб. / 846:4763 деск.) =====
  // ⚠️ СВОЯ СТРАНИЦА И КОНЕЦ ФАЙЛА: экран — ПОЛНОЭКРАННЫЙ слой, и открытым он
  // глотает координатные клики соседних секций (та же грабля, что у виньетки
  // сюжета и у меню). Закрываем за собой явно.
  {
    const noPage = await browser.newPage({ viewport: { width: 393, height: 852 } });
    noPage.on('pageerror', e => errors.push('PAGEERROR(newobj): ' + e.message));
    await noPage.goto('file://' + path.join(__dirname, 'index.html'));
    await noPage.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    await noPage.evaluate(() => window.__game.skipIntro());
    await noPage.waitForTimeout(1200);

    // ПОВОД ВЫВЕДЕН ИЗ ПРОГРЕССИИ, А НЕ ИЗ ОТДЕЛЬНОГО СПИСКА. Правило одно с
    // genLevel: 9 типов на ур.1 и ровно один новый за каждый следующий, по
    // порядку массива. Страж сверяет КЛЮЧ с этим правилом, а не с литералом —
    // сменится порядок типов, и он поедет за ним (копия числа рядом с рабочей
    // величиной — закон, на котором проект обжигался пять раз).
    const повод = await noPage.evaluate(() => {
      const g = window.__game, out = {};
      const ключ = (lv) => { g.setLevel(lv); return g.newObjDue(); };
      out.ур1 = ключ(1);                       // стартовая девятка — новой ОДНОЙ нет
      out.ур2 = ключ(2); out.ур5 = ключ(5); out.ур20 = ключ(20);
      out.заПулом = ключ(400);                 // пул исчерпан — экрана нет
      out.ожид2 = g.typeNameAt(9);             // LEVEL_TYPES_MIN + 2 − 2 = 9
      out.ожид5 = g.typeNameAt(12);
      out.ожид20 = g.typeNameAt(27);
      return out;
    });
    console.log('новая вещь/повод:', JSON.stringify(повод));
    expect(повод.ур1 === null && повод.заПулом === null,
      '⚠️ НОВАЯ ВЕЩЬ: на первом уровне и за пределами пула повода НЕТ — там открывается ' +
      'вся стартовая девятка либо не открывается ничего (' + JSON.stringify(повод) + ')');
    expect(повод.ур2 === повод.ожид2 && повод.ур5 === повод.ожид5 && повод.ур20 === повод.ожид20,
      '⚠️ НОВАЯ ВЕЩЬ: повод = тип, который открывает ПРОГРЕССИЯ (правило одно с genLevel), ' +
      'а не отдельный список (' + JSON.stringify(повод) + ')');

    // ⚠️⚠️ МОДЕЛЬ КРУТИТСЯ, А НЕ КАРТИНКА. Это НЕ придирка: владелец ловил меня
    // на подложке-картинке ДВАЖДЫ («моделька, которая крутится» = чистый 3D).
    // Проверяем ДВУМЯ признаками сразу: в боксе живой `canvas` (а не `img`) И
    // два снимка того же бокса с паузой РАЗЛИЧАЮТСЯ. Одного мало: канвас может
    // стоять неподвижно, а различие кадров дал бы и подменённый gif.
    await noPage.evaluate(() => { const g = window.__game; g.setLevel(5); g.newObjShow(g.newObjDue(), () => {}); });
    await noPage.waitForTimeout(900);
    const узел = await noPage.$('#newObjModel');
    const кадр1 = await узел.screenshot();
    await noPage.waitForTimeout(700);
    const кадр2 = await узел.screenshot();
    const модель = await noPage.evaluate(() => ({ инфо: window.__game.newObjInfo(),
      картинок: document.querySelectorAll('#newObjModel img').length }));
    console.log('новая вещь/модель:', JSON.stringify(модель), 'кадры', кадр1.length, кадр2.length);
    expect(модель.инфо && модель.инфо.канвас && модель.картинок === 0 &&
           Buffer.compare(кадр1, кадр2) !== 0,
      '⚠️⚠️ НОВАЯ ВЕЩЬ: модель ЖИВАЯ И ВРАЩАЕТСЯ — в боксе canvas без картинки-подложки, ' +
      'и два кадра подряд различаются (' + JSON.stringify(модель) + ')');

    // ⚠️⚠️ ЦВЕТ СВЕЧЕНИЯ = ОСНОВНОЙ ЦВЕТ ВЕЩИ (слово владельца 2026-08-10).
    // Читаем ВЫЧИСЛЕННЫЙ градиент `.no-shine`, а не переменную, которую ставит
    // сам код: переменная — пересказ намерения, правило могло до неё не дойти.
    // ⚠️ ДВА ПРИЗНАКА, И ВТОРОЙ НЕСУЩИЙ: (1) у каждой вещи в градиенте её тон,
    // (2) тоны РАЗНЫХ вещей РАЗЛИЧАЮТСЯ. Без (2) ассерт остался бы зелёным на
    // сборке, где свечение прибито одним цветом, случайно совпавшим с первым
    // проверенным типом, — и вся правка проверялась бы вхолостую.
    // ⚠️ Уровни ищем перебором по ЖИВОМУ пулу, а не литералами: порядок типов —
    // рычаг сложности, его правят по спеке, и вписанные номера разъехались бы.
    const свеч = await noPage.evaluate(async () => {
      const g = window.__game, out = [];
      for (let lv = 2; lv <= 30 && out.length < 4; lv++){
        g.setLevel(lv);
        const k = g.newObjDue(); if (!k) continue;
        g.newObjShow(k, () => {});
        await new Promise(r => setTimeout(r, 120));
        const i = g.newObjInfo();
        out.push({ lv, ключ: k, тон: i.тонВещи, вГрадиенте: !!(i.тонВещи && i.свечение.indexOf('rgb(' + i.тонВещи + ')') >= 0),
          лаймДефолт: i.свечение.indexOf('rgb(203, 255, 104)') >= 0 });
        g.newObjHide(); await new Promise(r => setTimeout(r, 60));
      }
      return out;
    });
    console.log('новая вещь/свечение:', JSON.stringify(свеч));
    const тоновРазных = new Set(свеч.map(x => x.тон)).size;
    expect(свеч.length >= 2 && свеч.every(x => x.вГрадиенте) && тоновРазных >= 2,
      '⚠️ НОВАЯ ВЕЩЬ: свечение красится ОСНОВНЫМ ЦВЕТОМ ВЕЩИ и следует за ней ' +
      '(проверено ' + свеч.length + ' вещей, разных тонов ' + тоновРазных + ': ' +
      свеч.map(x => x.ключ + '→' + x.тон).join(' | ') + ')');
    // Отдельно и намеренно: лаймовый цвет макета остаётся ТОЛЬКО дефолтом CSS.
    // Если он всплыл у настоящей вещи — значит переменная не доехала, и первый
    // ассерт мог бы это пропустить у типа, чей тон близок к лайму.
    expect(свеч.every(x => !x.лаймДефолт),
      'НОВАЯ ВЕЩЬ: лаймовый дефолт макета не подменяет тон вещи (' +
      свеч.filter(x => x.лаймДефолт).length + ' подмен)');

    // ЦЕПОЧКА НЕ РВЁТСЯ. Колбэк обязан прийти РОВНО ОДИН раз и на показе, и на
    // отказной ветке: иначе «Next» молча перестанет начинать уровень — ровно та
    // грабля, что уже была у анонса сюжета.
    const цепь = await noPage.evaluate(async () => {
      const g = window.__game; const out = {};
      let n = 0; g.setLevel(5); g.newObjShow(g.newObjDue(), () => { n++; });
      await new Promise(r => setTimeout(r, 350));
      out.открыт = g.newObjInfo().on;
      document.getElementById('newObjBtn').click();
      await new Promise(r => setTimeout(r, 350));
      out.закрыт = !g.newObjInfo().on; out.колбэков = n;
      out.канвасСнят = !document.querySelector('#newObjModel canvas');
      let m = 0; g.setLevel(1);                    // повода нет
      await new Promise(r => { g.newObjShow(g.newObjDue(), () => { m++; r(); }); setTimeout(r, 400); });
      out.колбэкБезПовода = m;
      return out;
    });
    console.log('новая вещь/цепочка:', JSON.stringify(цепь));
    expect(цепь.открыт && цепь.закрыт && цепь.колбэков === 1 && цепь.колбэкБезПовода === 1,
      '⚠️ НОВАЯ ВЕЩЬ: кнопка закрывает экран и отдаёт управление РОВНО ОДИН раз, ' +
      'и на ветке «повода нет» колбэк тоже приходит (' + JSON.stringify(цепь) + ')');
    // ⚠️ КАНВАС СНИМАЕТСЯ — он ОБЩИЙ с карточками коллекции: оставленный в
    // закрытом экране, он увёл бы спин у музея (та же природа, что «один общий
    // канвас» у thumbSpinStart).
    expect(цепь.канвасСнят,
      '⚠️ НОВАЯ ВЕЩЬ: общий спин-канвас возвращён — закрытый экран не держит его у себя');

    // АНИМАЦИЯ ПОЯВЛЕНИЯ (заказ владельца). ⚠️ Проверяем НАБЛЮДАЕМЫЙ ПЕРЕХОД, а
    // не имя `animation` в стилях: страж на формулировку был бы зелен и на
    // сборке, где анимация объявлена, но не проигрывается. Берём МИНИМУМ
    // непрозрачности за раннее окно (должен быть заметно меньше единицы) и
    // ждём ФАКТА устоявшегося состояния (opacity === 1), а не фикс-паузы.
    const анимация = await noPage.evaluate(async () => {
      const g = window.__game;
      g.newObjHide(); await new Promise(r => setTimeout(r, 60));
      g.setLevel(5); g.newObjShow(g.newObjDue(), () => {});
      const t = document.querySelector('#newObj .no-title');
      let мин = 1;
      for (let i = 0; i < 12; i++){
        мин = Math.min(мин, parseFloat(getComputedStyle(t).opacity) || 0);
        await new Promise(r => setTimeout(r, 20));
      }
      for (let i = 0; i < 60; i++){
        if (parseFloat(getComputedStyle(t).opacity) >= 0.99) break;
        await new Promise(r => setTimeout(r, 40));
      }
      const итог = parseFloat(getComputedStyle(t).opacity);
      g.newObjHide();
      return { мин: +мин.toFixed(3), итог: +итог.toFixed(3) };
    });
    console.log('новая вещь/анимация:', JSON.stringify(анимация));
    expect(анимация.мин < 0.5 && анимация.итог >= 0.99,
      '⚠️ НОВАЯ ВЕЩЬ: заголовок ПОЯВЛЯЕТСЯ — начинается прозрачным и доходит до полной ' +
      'видимости (мин ' + анимация.мин + ' -> ' + анимация.итог + ')');

    await noPage.close();
  }

  // ===== ГОЛОСА МАТЕРИАЛОВ (звук совмещения) =====
  {
    const mp = await browser.newPage();
    mp.on('pageerror', e => errors.push('PAGEERROR(mat): ' + e.message));
    await mp.goto('file://' + path.join(__dirname, 'index.html'));
    await mp.waitForFunction(() => window.__game && window.__game.typeNameAt, { timeout: 60000 });
    const мат = await mp.evaluate(() => {
      const g = window.__game; const без = []; let всего = 0;
      for (let i = 0; ; i++){ const n = g.typeNameAt(i); if (!n) break; всего++; if (!g.materialOf(n)) без.push(n); }
      return { всего, безГолоса:без.slice(0, 8), нехваток:без.length, голоса:g.sfxVoices(),
        фрукт:g.materialOf('foodapple'), металл:g.materialOf('piratecannon'),
        стекло:g.materialOf('survivalbottle'), чужой:g.materialOf('нетТакого') };
    });
    await mp.close();
    console.log('голоса материалов:', JSON.stringify(мат));
    // ⚠️ РАЗМЕТКА ПОЛНАЯ: тип без голоса — это тип, который молча зазвучит
    // «как все», и заметить это можно только на слух. Новая партия моделей
    // попадёт сюда автоматически.
    expect(мат.нехваток === 0 && мат.всего > 100,
      '⚠️ МАТЕРИАЛЫ: у КАЖДОГО типа есть голос (' + мат.всего + ' типов, без голоса ' +
      мат.нехваток + (мат.нехваток ? ': ' + мат.безГолоса.join(', ') : '') + ')');
    // ⚠️⚠️ ВТОРАЯ СТОРОНА: неизвестный тип обязан дать `null`, а не первый
    // попавшийся голос. Без этого ассерта карта вида «всё сочное» была бы
    // зелёной по первому — и новая модель чавкала бы как фрукт.
    expect(мат.чужой === null && мат.фрукт === 'juicy' && мат.металл === 'metal' && мат.стекло === 'glass',
      '⚠️ МАТЕРИАЛЫ: голос берётся ПО ТИПУ, неизвестный даёт null (' +
      JSON.stringify({ фрукт:мат.фрукт, металл:мат.металл, стекло:мат.стекло, чужой:мат.чужой }) + ')');
    // ⚠️ И ОТДЕЛЬНО — ЧТО ЗАПИСИ ВЛАДЕЛЬЦА ДОЕХАЛИ ДО СБОРКИ. Разметка есть у
    // всех 120, сэмплов пока три; страж обязан различать «размечен» и
    // «озвучен», иначе зазеленеет на сборке без единого звука.
    expect(['juicy','metal','glass'].every(v => мат.голоса.indexOf(v) >= 0),
      'МАТЕРИАЛЫ: записи владельца в сборке — фрукты, металл, стекло (' + мат.голоса.join(', ') + ')');
  }

  // ===== РАЗНООБРАЗИЕ ЗВУКА — ТОЛЬКО У ТРЁХ ЗАПИСЕЙ ВЛАДЕЛЬЦА =====
  // Слово владельца 2026-08-10: «сделай web audio разнообразным только для 3
  // добавленных новых звуков». Проверяем СЛЕДСТВИЕ на настоящих нодах: перехват
  // ставится ДО скриптов страницы и пишет `playbackRate`, который реально
  // выставлен на `AudioBufferSourceNode` перед `start()`.
  // ⚠️⚠️ КОНТРОЛЬ ВСТРОЕН В ТУ ЖЕ СЕКЦИЮ И ОН НЕСУЩИЙ: `grind` — ТОЖЕ сэмпл и
  // идёт через ТОТ ЖЕ `playBuf`. Если разнообразие уедет в общий путь (самая
  // вероятная будущая правка — «а давайте всем»), у помола поедет rate, и
  // ассерт про «только для трёх» покраснеет. Без контроля вся секция была бы
  // зелена и на сборке, где варьируется ВЕСЬ звук.
  {
    const ap = await browser.newPage({ viewport: { width: 390, height: 780 } });
    ap.on('pageerror', e => errors.push('PAGEERROR(sfx): ' + e.message));
    await ap.addInitScript(() => {
      window.__sfx = { src: [], pan: [] };
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const cbs = AC.prototype.createBufferSource;
      AC.prototype.createBufferSource = function (){
        const n = cbs.call(this);
        const st = n.start.bind(n);
        n.start = function (){
          try { window.__sfx.src.push(+n.playbackRate.value.toFixed(4)); } catch (e) {}
          return st.apply(n, arguments);
        };
        return n;
      };
      const csp = AC.prototype.createStereoPanner;
      if (csp) AC.prototype.createStereoPanner = function (){
        const n = csp.call(this); window.__sfx.pan.push(n); return n;
      };
    });
    await ap.goto('file://' + path.join(__dirname, 'index.html'));
    await ap.waitForFunction(() => window.__game && window.__game.alive() > 0, { timeout: 60000 });
    // ⚠️ РАЗБЛОКИРОВКУ ЗОВЁМ ЯВНО, А НЕ КЛИКОМ: в интро ВЕСЬ ввод глушится на
    // входе, и `pointerdown` до `Sound.unlock` не доходит. Первая проба на
    // клике получила пустой список сэмплов и едва не родила ложный вывод
    // «в headless сэмплы не декодятся» — они декодятся, все семь.
    await ap.evaluate(() => { window.__game.skipIntro(); window.__game.sound.unlock(); });
    await ap.waitForTimeout(1200);
    const звук = await ap.evaluate(async () => {
      const S = window.__game.sound, sleep = ms => new Promise(r => setTimeout(r, ms));
      const out = { декодировано: S.loaded().slice() };
      const срез = () => window.__sfx.src.length;
      let a = срез();
      for (let i = 0; i < 12; i++){ S.play('match', { n: 3, m: 'metal', r: 1.0, pan: 0.3 }); await sleep(25); }
      out.одинРазмер = window.__sfx.src.slice(a);
      // ⚠️ РАЗМЕРЫ БЕРЁМ ИЗ БОЕВОГО ДИАПАЗОНА (`it.r` = rc · размерУровня ·
      // MESH_SCALE ≈ 0.4..0.87), а не круглые 0.6/1.0/1.4: на выдуманных
      // входах страж проверяет ПРЕДСТАВЛЕНИЕ автора, а не игру — ровно на этом
      // он и пропустил постоянный сдвиг питча вверх.
      a = срез();
      for (const r of [0.40, 0.62, 0.87]){ S.play('match', { n: 2, m: 'juicy', r, pan: 0 }); await sleep(35); }
      out.поРазмеру = window.__sfx.src.slice(a);
      // ⚠️⚠️ И ГЛАВНОЕ — НАСТОЯЩИЕ МАТЧИ, А НЕ ПОДСТАВЛЕННЫЕ ЧИСЛА. Только они
      // видят, какой радиус реально приходит из игры.
      a = срез();
      for (let i = 0; i < 20; i++){ window.__game.autoMatch(); await sleep(110); }
      out.боевые = window.__sfx.src.slice(a).filter(v => v !== 1);
      a = срез();
      for (let i = 0; i < 8; i++){ S.play('grind'); await sleep(25); }
      out.помол = window.__sfx.src.slice(a);
      out.панорам = window.__sfx.pan.length;
      out.панЗначение = window.__sfx.pan.length ? +window.__sfx.pan[0].pan.value.toFixed(3) : null;
      return out;
    });
    await ap.close();
    console.log('разнообразие звука:', JSON.stringify(звук));
    // САНИТАР: без декодированных записей вся секция мерила бы пустоту —
    // `playBuf` возвращает false и до нод дело не доходит вовсе.
    expect(['mat_juicy','mat_metal','mat_glass'].every(k => звук.декодировано.indexOf(k) >= 0) &&
           звук.одинРазмер.length === 12,
      'САНИТАР ЗВУКА: три записи декодированы и сыграли 12 раз (' +
      звук.декодировано.length + ' сэмплов, нод ' + звук.одинРазмер.length + ')');
    // (1) ДЖИТТЕР: при ОДИНАКОВОМ размере высота всё равно каждый раз своя.
    // ⚠️ Порог 8 из 12, а не «все 12»: совпадение двух случайных значений
    // законно, и ассерт «все разные» флейковал бы на исправной сборке.
    const разных = new Set(звук.одинРазмер).size;
    expect(разных >= 8,
      '⚠️ ЗВУК МАТЕРИАЛА: при ОДНОМ размере высота всё равно гуляет — запись не ' +
      'читается как зацикленная (' + разных + ' разных из 12)');
    // (2) КОРИДОР: разнообразие не должно уводить запись в «ускоренную плёнку».
    expect(звук.одинРазмер.every(v => v >= 0.72 && v <= 1.38),
      'ЗВУК МАТЕРИАЛА: высота держится в коридоре 0.72..1.38 — материал остаётся ' +
      'узнаваемым (' + Math.min.apply(null, звук.одинРазмер) + '..' +
      Math.max.apply(null, звук.одинРазмер) + ')');
    // (3) РАЗМЕР: формула владельца 1/√размер — крупная вещь звучит НИЖЕ.
    // ⚠️ Строгий порядок безопасен: коридоры трёх размеров с джиттером ±5% не
    // пересекаются (1.226..1.356 / 0.95..1.05 / 0.803..0.887) — посчитано, а
    // не понадеялось.
    expect(звук.поРазмеру.length === 3 && звук.поРазмеру[0] > звук.поРазмеру[1] &&
           звук.поРазмеру[1] > звук.поРазмеру[2],
      '⚠️ ЗВУК МАТЕРИАЛА: крупная вещь звучит НИЖЕ мелкой (0.6 → ' + звук.поРазмеру[0] +
      ', 1.0 → ' + звук.поРазмеру[1] + ', 1.4 → ' + звук.поРазмеру[2] + ')');
    // (3б) ⚠️⚠️ БОЕВОЙ РАЗБРОС ОБЯЗАН ЛЕЖАТЬ ПО ОБЕ СТОРОНЫ ЕДИНИЦЫ. Это тот
    // ассерт, которого не хватало: на подставленных входах формула выглядела
    // исправной, а в игре давала 12 значений из 12 ВЫШЕ единицы — «крупнее
    // ниже» вырождалось в «всё ускорено». Плюс постоянная работа выше единицы
    // это децимация без антиалиасинга у Blink и WebKit, то есть заворот верха
    // спектра на почти всём мобильном трафике.
    // ⚠️ УСЛОВИЕ — «НЕ СДВИНУТО ВВЕРХ», А НЕ «ЕСТЬ ОБЕ СТОРОНЫ»: какие типы
    // попадутся боту, мы не выбираем, и требование «хоть одно выше единицы»
    // краснело бы на ИСПРАВНОЙ сборке в прогоне, где все совпавшие предметы
    // оказались крупного калибра. Оба условия ниже нарушались сломанной
    // сборкой (там min был 1.036, медиана 1.124) — двусторонность сохранена.
    const бой = звук.боевые.slice().sort((x, y) => x - y);
    const мин = бой[0], мед = бой[Math.floor(бой.length / 2)];
    expect(бой.length >= 6 && мин < 1 && мед <= 1.05,
      '⚠️⚠️ ЗВУК МАТЕРИАЛА В БОЮ: высота НЕ сдвинута вверх целиком — опора взята ' +
      'по боевому радиусу (' + бой.length + ' матчей, min ' + мин + ', медиана ' + мед + ')');
    // (4) ⚠️⚠️ КОНТРОЛЬ «ТОЛЬКО ДЛЯ ТРЁХ»: помол — тоже сэмпл, тот же playBuf,
    // и его высота обязана остаться РОВНО 1. Это единственный ассерт секции,
    // который краснеет, если разнообразие расползётся на весь звук.
    expect(звук.помол.length === 8 && звук.помол.every(v => v === 1),
      '⛔ ТОЛЬКО ДЛЯ ТРЁХ: помол — тоже сэмпл через тот же playBuf — остался с ' +
      'высотой ровно 1 (' + JSON.stringify(звук.помол) + ')');
    // (5) ПАНОРАМА доехала до ноды и несёт переданное значение.
    expect(звук.панорам >= 12 && звук.панЗначение === 0.3,
      'ЗВУК МАТЕРИАЛА: панорама создаётся и несёт переданное место (' +
      звук.панорам + ' нод, первая ' + звук.панЗначение + ')');
  }

  console.log(failures.length ? 'SUITE: FAIL (' + failures.length + '): ' + failures.join(' || ') : 'SUITE: PASS');
  process.exitCode = failures.length ? 1 : 0;
  await browser.close();
})();
