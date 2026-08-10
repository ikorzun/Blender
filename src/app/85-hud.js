// ===== 85-hud: DOM-хелперы и обновление интерфейса =====

function $(id){ return document.getElementById(id); }

// ===== ЗАНАВЕС ЗАГРУЗКИ: защёлка `html.uiready` (CSS-часть в shell.html) =====
// Спека владельца 2026-07-30: «во время загрузки бриджа не должно быть никаких
// элементов интерфейса. Они появляются плавно сразу после».
// ⚠️ ОТКРЫВАЕМ ОДИН РАЗ И НЕ ЗАКРЫВАЕМ. Ядро снимает `introdone` в startIntro
// (99-main) в начале КАЖДОГО уровня, поэтому занавес, повешенный прямо на
// introdone, гасил бы HUD на каждом интро — это шире спеки. Отсюда своя
// защёлка: первый introdone открывает её навсегда.
// ⚠️ НЕ ЦЕПЛЯЕМСЯ ЗА `#loading-overlay` СПЛЭША: это приватный DOM чужого SDK,
// и снимает его сам SDK (замер: сплэш ушёл на 3947 мс, а GAME_READY уходит
// только на 4359) — наблюдатель по чужому id молча сломается на обновлении
// Bridge. Наблюдаем ТОЛЬКО за своим <html>.
// ⚠️ СТРАХОВОЧНЫЙ ТАЙМАУТ ОБЯЗАТЕЛЕН: если интро не доехало (ошибка, зависший
// bridge), HUD остался бы скрыт НАВСЕГДА и игра выглядела бы сломанной наглухо
// — хуже исходного бага. По истечении предела открываем безусловно.
const UI_CURTAIN_MAX_MS = 8000;
let uiCurtainObs = null;
function openUICurtain(){
  document.documentElement.classList.add('uiready');
  if (uiCurtainObs){ uiCurtainObs.disconnect(); uiCurtainObs = null; }
}
if (document.documentElement.classList.contains('introdone')) openUICurtain();
else {
  uiCurtainObs = new MutationObserver(function(){
    if (document.documentElement.classList.contains('introdone')) openUICurtain();
  });
  uiCurtainObs.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  setTimeout(openUICurtain, UI_CURTAIN_MAX_MS);
}
// ⚠️ ЕДИНАЯ ТОЧКА ПОКАЗА/СКРЫТИЯ = единая точка учёта ЭКРАНОВ (docs/METRICS.md
// §3). Вешать замер на каждый оверлей отдельно бессмысленно: их семь, и
// новый восьмой молча выпал бы из статистики.
const SCREEN_OF = { winOverlay:'win', pauseOverlay:'pause', adOverlay:'ad',
  starsOverlay:'more_stars', museumOverlay:'museum', loseOverlay:'lose' };
function show(id){
  $(id).style.display = 'flex';
  if (SCREEN_OF[id]) Telemetry.screen.enter(SCREEN_OF[id]);
  if (id === 'winOverlay') renderWinScreen();
}
function hide(id){
  $(id).style.display = 'none';
  // вернулись в игру — экран снова 'game' (если партия жива)
  if (SCREEN_OF[id]) Telemetry.screen.enter(typeof level !== 'undefined' && level && !level.over ? 'game' : 'menu');
  if (id === 'winOverlay'){ winStopScore(); winLbStop(); }
}

// ===== ЭКРАН ЗАВЕРШЕНИЯ УРОВНЯ (Figma 778:732) =====
// Рисуется из ЖИВОГО состояния при показе оверлея (хук в show выше). checkEnd
// (80-gameplay, ВНЕ моей зоны) уже посчитал счёт, инкрементил levelNum и
// записал скрытые держатели winTitle/… — я читаю состояние и крашу стикеры.
let winScoreRAF = 0, winScoreTO = 0;
// стоп count-up: гасим И таймер, И rAF (зовётся из hide — иначе после клика
// Next досчёт бил бы по скрытому #winScore и мог перескочить в след. уровень)
function winStopScore(){ if (winScoreRAF) cancelAnimationFrame(winScoreRAF); if (winScoreTO) clearTimeout(winScoreTO); winScoreRAF = winScoreTO = 0; }
// компрессия как в HUD (≥10000 → «12.5k»): большой счёт не рвёт рамку 320 и
// согласован со счётом игрового экрана (иначе HUD «12.5k» vs победа «124800»)
// КОМПРЕССОР БОЛЬШИХ ЧИСЕЛ — общий для экрана победы И чипа счёта в HUD.
// Ступени: <10k как есть · <100k «12.5k» · <1M «125k» (дробь уже не нужна,
// а знак экономит место) · дальше «1.2M». Максимум 5 символов — этим и
// лечится наезд чипа на глаза (см. вызов в updateHUD).
// ⚠️ Ветка M добавлена 2026-07-28: с бандлами кошелёк становится
// 7-значным (МЕТА: ~29 уровней под x5), а без неё вышло бы «1200k».
function winFmtScore(n){
  n = n | 0;
  if (n < 10000) return '' + n;
  if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}
function renderWinScreen(){
  const wrap = $('winWrap'); if (!wrap) return;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // levelNum уже инкрементнут в checkEnd → только что пройденный = levelNum-1
  const lv = Math.max(1, (typeof levelNum === 'number' ? levelNum - 1 : 1));
  const score = (typeof stats !== 'undefined' && stats) ? Math.max(0, stats.score | 0) : 0;
  // ★-число на победе = ДЕНОМИНИРОВАННЫЙ прирост (score/SCORE_DENOM) = ровно
  // столько ушло в баланс (bankLevelScore) и на сколько подрос чип. Единый
  // баланс: чип/кошелёк/лидерборд/победа — одна шкала (решение диспетчера v113)
  const bal = Math.floor(score / (typeof SCORE_DENOM === 'number' ? SCORE_DENOM : 10));
  const secs = (typeof stats !== 'undefined' && stats && stats.t0)
    ? Math.max(0, Math.round((performance.now() - stats.t0) / 1000)) : 0;
  const lt = $('winLevel'); if (lt) lt.textContent = 'Level ' + lv;
  const tt = $('winTime'); if (tt) tt.textContent = fmtTime(secs);
  renderWinTop(reduce);
  // ⛔ `renderWinLb()` СНЯТ — врезки на экране победы больше нет (слово
  // владельца). Функция и её эпоха оставлены НИЖЕ живыми: на них висят хуки
  // `winLbStub`/`winLbInfo`, а сама она безвредна без узла (первой же строкой
  // выходит по `if (!box) return`).
  // СЧЁТ — анимированный count-up (reduce/0 → сразу); стартует синхронно с pop
  winStopScore();
  const st = $('winScore');
  if (st){
    if (reduce || bal <= 0){ st.textContent = '★ ' + winFmtScore(bal); }
    else {
      st.textContent = '★ 0';
      winScoreTO = setTimeout(()=>{
        const t0 = performance.now(), dur = 700;
        const tick = ()=>{
          const p = Math.min(1, (performance.now() - t0) / dur);
          st.textContent = '★ ' + winFmtScore(Math.round(bal * (1 - Math.pow(1 - p, 3))));
          winScoreRAF = p < 1 ? requestAnimationFrame(tick) : 0;
        };
        winScoreRAF = requestAnimationFrame(tick);
      }, 520);
    }
  }
  // ПЕРЕЗАПУСК ВХОДНОЙ АНИМАЦИИ: reflow-трюк — CSS-анимации детей отыгрывают
  // заново при каждом показе (быстрый Next→win не «съедает» анимацию)
  wrap.classList.remove('win-in'); void wrap.offsetWidth; wrap.classList.add('win-in');
}
// ===== ВРЕЗКА ТАБЛИЦЫ НА ЭКРАНЕ ПОБЕДЫ (место + соседи) =====
// ⚠️⚠️ ШОВ С МОДУЛЕМ ТАБЛИЦЫ ЖИВЁТ РОВНО ЗДЕСЬ, В ОДНОЙ ФУНКЦИИ. Протокол
// (подпись, коды, частота) — зона ИНТЕГРАЦИИ; экран — моя. Переименуют поля
// ответа — правка в `winLbAdapt`, а вёрстка, состояния и стражи не двигаются.
// ⚠️ ПРОДУКТОВЫЙ СРОК, А НЕ ПАУЗА ЗАМЕРА: не дождались — врезка молчит, число
// обновится на следующей победе. ⚠️⚠️ ЧИСЛО ВЫВЕДЕНО ИЗ ОКНА ЧАСТОТЫ СЕРВЕРА,
// А НЕ ВЫБРАНО НА ГЛАЗ: трата сразу после победы откладывает отправку до
// открытия окна (~20 с), и это НЕ ошибка и не «нет сети» — своего состояния у
// неё нет, но срок обязан её пережить, иначе врезка молчала бы в самом
// типичном сценарии («победа -> покупка множителя»). Прежние 2500 его резали.
const WIN_LB_MS = 25000;
let winLbEpoch = 0, winLbTO = 0, winLbSrc = null, winLbLast = null;
// ⚠️ ЭПОХА — НА ВЫБРОСЕ ОТВЕТА. Растёт на КАЖДОМ показе и скрытии победы: игрок
// жмёт Next быстрее, чем отвечает сеть, и ответ прошлого уровня не смеет
// дорисоваться в свежий экран. Сверка — в колбэке, до единого касания DOM.
function winLbStop(){ if (winLbTO) clearTimeout(winLbTO); winLbTO = 0; winLbEpoch++; }
// ИСТОЧНИК. Боевой — window.__lb (модуль Интеграции), пока его нет — стенд
// `__game.winLbStub()`. Порядок именно такой: появится модуль — врезка
// переключится на него сама, без правки экрана.
function winLbSource(){
  if (winLbSrc) return winLbSrc;
  const lb = (typeof window !== 'undefined') ? window.__lb : null;
  if (!lb || !lb.submit || !lb.me) return null;
  // Модуль есть, но НЕ НАСТРОЕН (пустой адрес сервиса) — это та же «фича
  // выключена», и врезки в раскладке быть не должно.
  if (typeof lb.base === 'function' && !lb.base()) return null;
  return async ()=>{
    // ПОРЯДОК ОБЯЗАТЕЛЕН: банк (его делает checkEnd) -> отправка -> ДОЖДАТЬСЯ ->
    // точное место. Ответ отправки несёт лишь ПРИКИДКУ (exact:0), точное место
    // и соседей отдаёт только /me. ⚠️ Отказ отправки (частота, 20-секундное
    // окно — обычное дело при быстром Next) НЕ отменяет врезку: показываем
    // место по последнему записанному результату, молча.
    const s = await lb.submit().catch(()=>null);
    const m = await lb.me();
    // ⚠️⚠️ МЕСТО БЕРЁМ ТОЛЬКО ИЗ /me И ТОЛЬКО ТОЧНОЕ. У ответа на ОТПРАВКУ тоже
    // есть поле `rank`, и брать его нельзя: это ПРИКИДКА по лесенке снимка, а
    // лесенка строится по каждому сотому игроку — пока в таблице меньше сотни
    // строк, ступеней в ней нет ВООБЩЕ, и быстрый ответ отвечает «место 1»
    // КАЖДОМУ (замер диспетчера 2026-08-09). Меньше сотни — это состояние
    // таблицы в первые недели после запуска, то есть врал бы он всем и сразу.
    return { state:m && m.state, rank:m && m.rank, exact:m && m.exact, score:m && m.score,
             up:m && m.up, dn:m && m.dn,
             sent:s && s.sent, server:(s && s.score != null) ? s.score : (m && m.score) };
  };
}
// АДАПТЕР: ответ протокола -> вью-модель экрана. Отдаёт null = врезка молчит.
function winLbAdapt(raw){
  if (!raw || raw.state !== 'ok') return null;      // early/offline/broken — молча
  // МОЕЙ СТРОКИ В ВЫДАЧЕ НЕТ (ещё не отправлялся, строку скрыли) — тоже молча.
  const rank = raw.rank | 0; if (rank < 1) return null;
  // ⚠️⚠️ ТОЛЬКО ТОЧНОЕ МЕСТО, И ОТКАЗ ЗДЕСЬ ЗАКРЫТЫЙ: нет поля — не показываем.
  // Прикидку сервер помечает сам; показать её как место значит соврать числом,
  // которое выглядит настоящим. ⚠️ Прежняя версия трактовала ОТСУТСТВИЕ поля
  // как «можно» (боялся, что переименование погасит экран). Решение диспетчера
  // 2026-08-09: на вопросе доверия отказ обязан быть закрытым — цена молчания
  // это пустой виджет, цена ложного «можно» — показанное неверное место.
  // Тихое молчание при переименовании лечится СТРАЖЕМ («/me несёт exact»),
  // а не доверием по умолчанию: тогда ломается тест, а не экран у игрока.
  if (!raw.exact) return null;
  const num = (v)=> (typeof v === 'number' && isFinite(v)) ? v : null;
  // ⚠️⚠️ СОСЕДИ БЕРУТСЯ ПО СЧЁТУ, А НЕ ПО ПОРЯДКУ В МАССИВЕ. Порядок внутри
  // up/dn — часть чужого контракта (nearest-first или best-first), и угадывать
  // его нельзя: ошибка тихая, врезка покажет не тех соседей и будет выглядеть
  // правдоподобно. Ближайший СВЕРХУ — с наименьшим счётом среди тех, кто выше;
  // ближайший СНИЗУ — с наибольшим среди тех, кто ниже. Это верно при любом
  // порядке и переживёт переименование полей.
  const clean = (a)=> (Array.isArray(a) ? a : []).filter(e => e && num(e.score) !== null);
  const up = clean(raw.up).slice().sort((a,b)=> a.score - b.score);   // ближайший сверху первым
  const dn = clean(raw.dn).slice().sort((a,b)=> b.score - a.score);   // ближайший снизу первым
  // ⚠️⚠️ В СВОЕЙ СТРОКЕ — ТО, ЧТО ЗАПИСАЛ СЕРВЕР, А НЕ ТО, ЧТО МЫ ПОСЛАЛИ.
  // Отдельного ЭКРАНА под расхождение больше нет (владелец 2026-08-09 снял
  // потолок доверия целиком), но САМО РАЗДЕЛЕНИЕ несущее и остаётся: сервер
  // отказывает по частоте, по подписи, мягко деградирует на упавшей базе — и
  // «тело разобралось» успехом не является. Клиент, рисующий ОТПРАВЛЕННОЕ
  // число, показывал бы несуществующий результат в каждом таком случае.
  const server = num(raw.server);
  const me = { pos:rank, name:'You', av:(typeof guestAvatar === 'function' ? guestAvatar() : ''),
               score:(server !== null ? server : num(raw.score) || 0), me:true };
  // ⚠️ СТРОК ВСЕГДА ТРИ — на этом стоит зарезервированная высота слота
  // (см. min-height у .win-lb): «то две, то три» двигало бы Next под пальцем.
  // Первого места сосед сверху не бывает — добираем вторым снизу.
  const rows = [];
  if (up[0]) rows.push({ pos:rank - 1, name:up[0].name, av:up[0].av, score:up[0].score });
  rows.push(me);
  if (dn[0]) rows.push({ pos:rank + 1, name:dn[0].name, av:dn[0].av, score:dn[0].score });
  if (rows.length < 3 && dn[1]) rows.push({ pos:rank + 2, name:dn[1].name, av:dn[1].av, score:dn[1].score });
  if (rows.length < 3 && up[1]) rows.unshift({ pos:rank - 2, name:up[1].name, av:up[1].av, score:up[1].score });
  return { rows, rank };
}
function winLbRender(v){
  const box = $('winLb'), list = $('winLbList');
  if (!box || !list) return;
  if (!v){ box.classList.remove('on'); list.innerHTML = ''; return; }
  list.innerHTML = '';
  v.rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'wl-row' + (r.me ? ' me' : '');
    const pos = document.createElement('div'); pos.className = 'wl-pos'; pos.textContent = '#' + r.pos;
    // АВАТАР — ТОТ ЖЕ ФАЙЛОВЫЙ РЕЦЕПТ, ЧТО У ПРОФИЛЯ (avatars/AvatarNN.png,
    // ассеты владельца): и своя строка, и соседи приходят НОМЕРОМ файла.
    const av = document.createElement('div'); av.className = 'wl-av';
    const ai = r.av | 0;
    if (ai > 0){
      const img = document.createElement('img');
      img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
      img.alt = ''; img.decoding = 'async';
      av.appendChild(img);
    }
    const nm = document.createElement('div'); nm.className = 'wl-name'; nm.textContent = r.name || '';
    const sc = document.createElement('div'); sc.className = 'wl-score'; sc.textContent = winFmtScore(r.score);
    row.append(pos, av, nm, sc);
    list.appendChild(row);
  });
  box.classList.add('on');
}
function renderWinLb(){
  const box = $('winLb'); if (!box) return;
  // СИНХРОННЫЙ СБРОС В ПУСТОТУ на каждом показе: без него быстрый Next -> победа
  // мигнул бы врезкой ПРОШЛОГО уровня, пока не приедет свежая.
  winLbRender(null); winLbLast = null;
  if (winLbTO) clearTimeout(winLbTO);
  const src = winLbSource();
  // ⚠️⚠️ ФИЧА ВЫКЛЮЧЕНА — ВРЕЗКИ НЕТ В РАСКЛАДКЕ ВОВСЕ, НОЛЬ ПИКСЕЛЕЙ.
  // Резерв высоты нужен, только пока данные ОЖИДАЮТСЯ; держать пустой слот
  // «на будущее» значит отодвигать TOP ITEMS у игрока, которому таблица не
  // показывается никогда (указание диспетчера 2026-08-09). `display:none`, а
  // не `visibility`: нужен именно выход из потока, иначе место останется.
  box.style.display = src ? '' : 'none';
  if (!src) return;
  const my = ++winLbEpoch;
  let done = false;
  winLbTO = setTimeout(()=>{ done = true; }, WIN_LB_MS);
  Promise.resolve().then(src).then(raw => {
    if (my !== winLbEpoch || done) return;   // экран сменился или срок вышел — молча в мусор   // экран сменился или срок вышел — молча в мусор
    const v = winLbAdapt(raw); winLbLast = v;
    winLbRender(v);
  }).catch(()=>{});
}
// ===== ЭКРАН ТАБЛИЦЫ ЛИДЕРОВ: ДВЕ ВКЛАДКИ =====
// ⚠️⚠️ ТЕКСТ ПРО РАСХОЖДЕНИЕ ЧИСЕЛ ПИШЕТ ВЛАДЕЛЕЦ САМ. До тех пор здесь стоит
// ВИДИМО ПОМЕЧЕННАЯ заглушка, а в сьюте — страж, утверждающий, что метка ЕЩЁ
// НА МЕСТЕ. Когда придёт настоящий текст, страж ПОКРАСНЕЕТ и заставит снять
// метку осознанно. Молчаливая заглушка («пустая строка») уехала бы в релиз
// незамеченной — тот же приём «обратного утверждения», что у снятого градиента.
// ⛔ ЗАГЛУШКА ТЕКСТА ВЛАДЕЛЬЦА СНЯТА ВМЕСТЕ СО ВКЛАДКАМИ: она объясняла
// расхождение чисел ДВУХ вкладок, а вкладки отменены — объяснять нечего.
// Подзаголовок экрана теперь берётся из макета (846:1274).
let lbEpoch = 0;
// ⚠️ ЭПОХА — НА ВЫБРОСЕ, как у врезки: игрок переключает вкладки быстрее, чем
// отвечает сеть, и ответ прошлой вкладки не смеет дорисоваться в свежую.
function lbScreenStop(){ lbEpoch++; }
// ─── ТОЧКА ВХОДА В ТАБЛИЦУ (меню, макеты 840:4344 моб. / 840:4633 деск.) ───
// ⚠️ ОБА ЧИСЛА ИДУТ ЧЕРЕЗ `window.__lb` И ТОЛЬКО ЧЕРЕЗ НЕГО: он один держит
// кэш `top()`/`me()` и умеет РАЗОВЫЙ обход HTTP-кэша браузера после сброса
// (без этого место не менялось бы минуту ровно после победы и после траты —
// найдено живым прогоном). Меню открывается часто, второй сетевой путь завёл
// бы запрос на каждое открытие.
let lbEntryEpoch = 0;
// ⚠️ ЭПОХА НУЖНА ЗДЕСЬ ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО У ВРЕЗКИ ПОБЕДЫ: меню
// закрывают быстрее, чем отвечает сеть, и ответ прошлого открытия не смеет
// дорисоваться в следующее. Сверка — ДО единого касания DOM.
function lbEntryRefresh(){
  const box = $('msLbEntry'); if (!box) return;
  const lb = (typeof window !== 'undefined') ? window.__lb : null;
  // ФИЧА ВЫКЛЮЧЕНА (модуля нет или адрес сервиса пуст) — блока в раскладке
  // нет вовсе. Резервировать место под данные, которых в этой сборке быть не
  // может, значит без причины двигать меню (то же правило, что у врезки).
  const on = !!(lb && lb.top && lb.me && (typeof lb.base !== 'function' || lb.base()));
  box.hidden = !on;
  if (!on) return;
  const my = ++lbEntryEpoch;
  lb.top(1).then(t => {
    if (my !== lbEntryEpoch) return;
    const host = $('msLbeAvs'); if (!host) return;
    host.innerHTML = '';
    if (!t || t.state !== 'ok' || !t.rows) return;
    // ⚠️ `lbRow` отдаёт `null` на строке, которая не разобралась (сервер шлёт
    // МАССИВЫ `[имя, аватар, счёт]`, а не объекты). Без этой проверки битая
    // строка роняла бы весь рендер аватаров в `catch`, и блок молча оставался
    // бы без картинок — то есть дефект выглядел бы как «сервер пуст».
    // ⚠️⚠️ СЛОТОВ ВСЕГДА ТРИ (слово владельца «всегда показывай 3 аватарки»), и
    // ПУСТОЙ СЛОТ — НЕЙТРАЛЬНЫЙ КРУЖОК, а не чужой аватар. Подставить туда
    // картинку живого игрока значило бы придумать участника таблицы; на старте,
    // когда строк меньше трёх, это прямая ложь на самом видном месте.
    for (let i = 0; i < 3; i++){
      const r = t.rows[i];
      const ai = r ? (r.av | 0) : 0;
      if (ai <= 0){
        const пусто = document.createElement('i');
        пусто.className = 'ms-lbe-slot';
        host.appendChild(пусто);
        continue;
      }
      const img = document.createElement('img');
      img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
      img.alt = ''; img.decoding = 'async'; host.appendChild(img);
    }
  }).catch(()=>{});
  lb.me().then(m => {
    if (my !== lbEntryEpoch) return;
    const sub = $('msLbeSub'), dot = $('msLbeDot'), rk = $('msLbeRank'),
          box = $('msLbEntry');
    if (!sub || !dot || !rk || !box) return;
    // ⚠️⚠️ МЕСТО — ТОЛЬКО ТОЧНОЕ, И ОТКАЗ ЗАКРЫТЫЙ: нет признака достоверности
    // (`exact`) — числа не показываем вовсе. Прикидку из ответа на ОТПРАВКУ не
    // показываем нигде: пока в таблице меньше сотни строк, лесенка снимка
    // пуста и прикидка отвечает «место 1» КАЖДОМУ.
    const ok = !!(m && m.state === 'ok' && m.exact && m.rank > 0);
    // ⚠️ ОБЕ мобильные строки и класс идут от ТОГО ЖЕ `ok`, что и раньше, —
    // то есть место в ПЕРВОЙ строке слушается правила `exact` ровно так же,
    // как слушалась «You on N». Прикидка из ответа на отправку сюда не
    // попадает ни при каком состоянии.
    rk.textContent  = ok ? (winFmtScore(m.rank | 0) + ' place') : '';
    sub.textContent = ok ? 'on leaderboard' : '';
    box.classList.toggle('has-rank', ok);
    dot.textContent = ok ? (' • ' + winFmtScore(m.rank | 0)) : '';
  }).catch(()=>{});
}
function lbServ(text){
  const host = $('lbList'); if (!host) return;
  host.innerHTML = ''; const d = document.createElement('div');
  d.className = 'lb-serv'; d.textContent = text; host.appendChild(d);
}
// ⚠️ ЗВЕЗДА В ПИЛЮЛЕ СЧЁТА — фигура ассета `Star-box` (20×20). В макете три
// выгрузки с разной заливкой (тёмная у призёров, белая дальше, жёлтая у своей
// строки), но КОНТУР один — поэтому файл один, а цвет задаёт CSS по классу
// строки. Копировать три файла значило бы держать три копии одной фигуры.
const LB_STAR_D = 'M5.99339 29.418C5.0305 28.6875 4.83128 27.4756 5.31273 26.0811L7.76976 18.8262L1.52757 14.3604C0.299054 13.4805 -0.282001 12.4014 0.133038 11.2227C0.531476 10.0771 1.61058 9.5293 3.08812 9.5459L10.7414 9.6123L13.0657 2.29102C13.5305 0.84668 14.3772 0 15.5891 0C16.801 0 17.6477 0.84668 18.1125 2.29102L20.4367 9.6123L28.0735 9.5459C29.5676 9.5293 30.6467 10.0771 31.0451 11.2393C31.4436 12.4014 30.8791 13.4805 29.6506 14.3604L23.4084 18.8262L25.8655 26.0811C26.3469 27.4756 26.1477 28.6875 25.1848 29.418C24.2053 30.165 23.01 29.9658 21.7649 29.0527L15.5891 24.5039L9.39671 29.0527C8.16819 29.9658 6.97288 30.165 5.99339 29.418Z';
// ⚠️ ЧИСЛО ГРУППАМИ ПО ТРИ, КАК В МАКЕТЕ («123 900»). ⛔ НЕ `winFmtScore`: тот
// сжимает от 10 000 в «12.5k», а таблица — про ТОЧНЫЕ результаты, и сжатие
// скрывает как раз разницу между соседями, ради которой в неё и смотрят.
function lbFmt(n){ return String(Math.max(0, n | 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function lbRowsRender(rows){
  const host = $('lbList'); if (!host) return;
  host.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('div');
    // ⚠️ ЦВЕТ ПИЛЮЛИ — ПО МЕСТУ, А НЕ ПО ПОРЯДКУ В МАССИВЕ: строки экрана могут
    // начинаться не с первого места, и «первые три сверху» ≠ «призёры».
    const p = r.pos | 0;
    row.className = 'lb-row' + (r.me ? ' me' : (p >= 1 && p <= 3 ? ' p' + p : ''));
    const left = document.createElement('div'); left.className = 'lb-left';
    const pos = document.createElement('div'); pos.className = 'lb-pos';
    pos.textContent = (p > 0) ? String(p) : '';
    const ava = document.createElement('div'); ava.className = 'lb-ava';
    const av = document.createElement('div'); av.className = 'lb-av';
    const ai = r.av | 0;
    if (ai > 0){
      const img = document.createElement('img');
      img.src = 'avatars/Avatar' + String(ai).padStart(2, '0') + '.png';
      img.alt = ''; img.decoding = 'async'; av.appendChild(img);
    }
    const nm = document.createElement('div'); nm.className = 'lb-name';
    // «Name • You» — так в макете: своя строка ПОДПИСАНА, а не только выделена
    nm.textContent = (r.name || '') + (r.me ? ' • You' : '');
    ava.append(av, nm); left.append(pos, ava);
    const sc = document.createElement('div'); sc.className = 'lb-score';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 30'); svg.setAttribute('aria-hidden', 'true');
    const pth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pth.setAttribute('d', LB_STAR_D); svg.appendChild(pth);
    const num = document.createElement('span'); num.textContent = lbFmt(r.score);
    sc.append(svg, num);
    row.append(left, sc);
    host.appendChild(row);
  });
}
// НАША вкладка: место — ТОЛЬКО из me() и ТОЛЬКО точное (правило диспетчера);
// строки списка — из top(). ⚠️ Гость тут ПОЛНОПРАВЕН: платформенный гейт
// «нужно залогиниться» на нашу таблицу НЕ переносится (решение владельца).
async function lbLoadOurs(my){
  const lb = (typeof window !== 'undefined') ? window.__lb : null;
  if (!lb || !lb.top || (typeof lb.base === 'function' && !lb.base())){ lbServ('Leaderboard is off in this build.'); return; }
  const t = await lb.top(1).catch(()=>null);
  if (my !== lbEpoch) return;
  if (!t || t.state === 'offline' || t.state === 'broken'){ lbServ('No connection. Try again later.'); return; }
  if (t.state === 'early' || !t.rows || !t.rows.length){ lbServ('The board is still being built.'); return; }
  const строки = t.rows.map((r, i) => ({ pos:i + 1, name:r && r.name, av:r && r.av, score:r && r.score }));
  const m = await lb.me().catch(()=>null);
  if (my !== lbEpoch) return;
  // ⚠️⚠️ СВОЯ СТРОКА ИДЁТ ЧЕРЕЗ ТОТ ЖЕ РЕНДЕР, что и все прочие. Раньше она
  // собиралась ОТДЕЛЬНЫМ куском кода — и разъехалась с макетом сразу в трёх
  // местах (место с решёткой, имя «You» вместо «Имя • You», сжатый счёт). Это
  // ровно тот закон, на котором проект обжигался: копия рядом с рабочей
  // величиной совпадает в момент написания и расходится потом.
  // ⚠️ ТОЛЬКО ТОЧНОЕ МЕСТО (`exact`) — отказ закрытый: нет признака
  // достоверности, значит своей строки на экране нет вовсе.
  if (m && m.state === 'ok' && m.exact && m.rank > 0){
    const своя = { pos:m.rank, name:(typeof guestName === 'function') ? guestName() : '',
      av:(typeof guestAvatar === 'function') ? guestAvatar() : 0, score:m.score, me:true };
    // ⚠️⚠️ СВОЯ СТРОКА ВСТАЁТ НА СВОЁ МЕСТО, А НЕ В КОНЕЦ (слово владельца
    // 2026-08-10: «игрок должен занимать правильное место в таблице»). Прежний
    // `push` ставил её последней ВСЕГДА: при месте 7 из 60 она была
    // шестьдесят первой, то есть экран врал о положении игрока.
    // ⚠️ Место в снимке и место из `me()` — РАЗНЫЕ ИСТОЧНИКИ: топ приходит из
    // снимка крона, своё место живое. Пока ранг попадает в присланный отрезок,
    // строка под этим номером и есть наша, поэтому её ЗАМЕЩАЕМ (имя, аватар и
    // свежий счёт — наши), а не вставляем рядом: вставка сдвинула бы всех ниже
    // и в таблице появились бы два игрока с одним номером.
    // ⚠️ Ранг ВНЕ отрезка — строка идёт в конец, и это не «в конце списка», а
    // честное «ниже показанного»: подпирать её снизу будет `sticky`.
    const i = m.rank - 1;
    if (i >= 0 && i < строки.length) строки[i] = своя; else строки.push(своя);
  }
  lbRowsRender(строки);
}
// ПЛАТФОРМЕННАЯ вкладка — «рекорд за всё время». ⚠️ Отказ у неё СВОЙ (`why`),
// и он не ошибка: площадка может не поддерживать таблицы вовсе.
async function lbLoadPlat(my){
  if (typeof Ads === 'undefined' || !Ads.lbEntries){ lbServ('Not available on this platform.'); return; }
  const r = await Ads.lbEntries({ limit: 20 }).catch(()=>null);
  if (my !== lbEpoch) return;
  if (!r || !r.ok){ lbServ('Not available right now.'); return; }
  if (!r.entries || !r.entries.length){ lbServ('No records yet.'); return; }
  lbRowsRender(r.entries.map(e => ({ pos:e.rank, name:e.name, av:0, score:e.score, me:!!e.me })));
}
// ⛔ ВКЛАДОК НЕТ (решение владельца «только наша таблица, вкладки отменяются»),
// поэтому и переключателя, и заглушки текста здесь больше нет. `lbLoadPlat`
// оставлен ЖИВЫМ намеренно: платформенная отправка работает и даёт видимость на
// площадке — вернуть показ можно одной строкой, если владелец передумает.
function lbScreenRender(){
  lbServ('Loading…');
  const my = ++lbEpoch;
  lbLoadOurs(my).catch(()=>{});
}
function lbScreenOpen(){ show('lbOverlay'); lbScreenRender(); }
function lbScreenClose(){ lbScreenStop(); hide('lbOverlay'); }
// ЗАХВАТ ТИПОВ УРОВНЯ — НЕЗАВИСИМО от витрины (её тик gated ≥1160px, на
// мобайле/узком vitAll не строится вовсе). Дёргается из updateHUD (тикает
// ВСЕГДА): при смене уровня фиксируем ключи типов замеса, пока куча полна.
let winLevelTypes = null, winLevelRef = null;
function captureLevelTypes(){
  if (typeof level === 'undefined' || !level || level === winLevelRef) return;
  if (typeof intro !== 'undefined' && intro) return; // атласы моделей ещё декодятся
  const seen = new Set(), keys = [];
  try {
    for (const it of items){
      if (!it || it.surprise || it.bomb || it.rock || !it.type) continue;
      const k = String(it.type.name);
      if (!seen.has(k)){ seen.add(k); keys.push(k); }
    }
  } catch(e){}
  // пиним ref ТОЛЬКО при удачном захвате — иначе пустой items (крайний край)
  // залочил бы прошлые типы навсегда, уровень не перезахватился бы
  if (keys.length){ winLevelTypes = keys; winLevelRef = level; }
}
// TOP ITEMS: топ-5 типов уровня по прогрессу (та же метрика/портреты, что у
// витрины; было 3 — спека владельца 2026-07-28). Источник — winLevelTypes
// (captureLevelTypes); фолбэк — vitAll. Если типов уровня меньше — строк
// столько, сколько есть (slice не добивает пустышками).
// Строк на ДЕСКТОПЕ 5 (спека #124), на МОБАЙЛЕ 3 (макет 783:711, спека
// владельца 2026-07-28). Брейкпоинт тот же 768, что у HUD и мобильной
// раскладки экрана победы в shell.html — разводить нельзя.
const WIN_TOP_N = 5, WIN_TOP_N_MOB = 3;
function winTopN(){ return innerWidth < 768 ? WIN_TOP_N_MOB : WIN_TOP_N; }
function renderWinTop(reduce){
  const host = $('winTopList'); if (!host) return;
  host.innerHTML = '';
  let keys = (winLevelTypes && winLevelTypes.length) ? winLevelTypes.slice() : [];
  if (!keys.length && vitAll){ try { keys = vitAll.map(e => e.k); } catch(e){} }
  keys.sort((a, b)=> vitFrac(b) - vitFrac(a) || accCount(b) - accCount(a));
  const step = 0.09;
  keys.slice(0, winTopN()).forEach((k, i)=>{
    const row = document.createElement('div');
    row.className = 'wt-row';
    row.style.animationDelay = (reduce ? 0 : (1 + i * step)) + 's';
    let url = '';
    try { const it = thumbItemForKey(k); if (it) url = itemThumb(it); } catch(e){}
    row.innerHTML =
      '<div class="wt-thumb">' + (url ? '<img alt="" src="' + url + '">' : '') + '</div>' +
      '<div class="wt-body"><div class="wt-col"><div class="wt-name"></div>' +
      '<div class="wt-bar"><i></i></div></div><div class="wt-mult"></div></div>';
    row.querySelector('.wt-name').textContent = (typeof accLabel === 'function' ? accLabel(k) : k);
    row.querySelector('.wt-mult').textContent = fmtMult(typeof accMult === 'function' ? accMult(k) : 1);
    host.appendChild(row);
    const frac = (typeof vitFrac === 'function' ? vitFrac(k) : 0), bar = row.querySelector('.wt-bar i');
    if (reduce){ bar.style.width = (frac * 100).toFixed(1) + '%'; }
    else {
      bar.style.transitionDelay = (1.05 + i * step) + 's';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ bar.style.width = (frac * 100).toFixed(1) + '%'; }));
    }
  });
}
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.opacity = 0; }, 1600);
}
function fmtTime(s){ return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
// ===== Персонаж: 7 эмоций + живая анимация (ассеты владельца, Figma 741:1420) =====
// Четыре НЕЗАВИСИМЫХ слоя: ЭМОЦИЯ (какая форма) + ВЗГЛЯД (куда смотрят
// зрачки) + РЕАКЦИЯ (короткий всплеск) + МОРГАНИЕ. Круглая пара
// параметрическая: зрачок ездит ±24 и меняет размер 15..50 в единицах
// viewBox — этим покрыты семейства eyes-0 (взгляд/размер), eyes-2 (хитрые)
// и eyes-5 (подмигивание). Несводимые формы — отдельными слоями SVG.
// Дуги eyes-4-4 УДАЛЕНЫ (спека владельца 2026-07-21): «добрые» показываем
// не формой, а РАЗМЕРОМ зрачков — асимметрией eyes-5 (741:1357).
// ⚠️ `spent`/`out` — ЛИЦА УСТАЛОСТИ ПО НОДАМ ВЛАДЕЛЬЦА (741:1302 и 741:1281):
// «выдохся» (щёлочки) на предпоследнем зачёте и «вырубился» (✕✕) на N-м.
// `out` делит слой `fX` с поражением: слой один, поводов два — конфликта нет,
// они взаимоисключающие по построению (в норме уровень непроигрываем).
const FACE_LAYER = { calm:'fRound', surprised:'fRound', sly:'fRound', rolled:'fRound',
  closed:'fRound', kind:'fRound', angry:'fAngry', lose:'fX', sad:'fSad',
  spent:'fSlit', out:'fX' };
// Геометрия из ассетов (viewBox 240×120): белок r60, зрачок r29.
const EYE_R = 60, PUP_MIN = 15, PUP_WIDE = 50;
// eyes-5 (асимметрия из ассета: левый зрачок 40 в белке 60; правый белок 44
// со зрачком 12) — СЕРИЯ ТУРБО (решение владельца 2026-07-21: второе турбо,
// собранное внутри активного, = серия; ядро считает chainSeries в 60-access)
const EYE5_PL = 40, EYE5_PR = 12, EYE5_WR = 44;
const FACE_GAZE = {                    // смещения зрачков [левый, правый]
  rolled: [[0,-24],[0,-24]],           // eyes-0-5: закатились вверх
  sly:    [[-16,-16],[16,16]],         // eyes-2: один вверх-влево, другой вниз-вправо
};
const PUP_BASE = 29;                   // радиус зрачка в покое (eyes-0)
// ===== «МИКСЕР ВЫДЫХАЕТСЯ» (спека владельца v2: индикация зачётов чаши) =====
// Владелец отверг трещины и сказал «беру глаза»: каждый зачёт БЬЁТ миксер,
// усталость копится, на N-м глаза захлопываются и это переходит в разлёт.
// ⚠️ ИРОНИЯ, А НЕ ЖАЛОСТЬ: миксер «держится из последних сил», поэтому на
// серии он всё равно распахивается — просто от просевшей базы (см. eyeSizes).
//
// ⛔⛔ ТОМБСТОУН: ВЕК СВЕРХУ НЕ БЫВАЕТ. Спека владельца 2026-08-03 дословно,
// по скрину копящейся усталости: «убери черные веки сверху, у нас нет такого
// состояния, потому что во всех состояниях есть только белое глазное яблоко и
// черный зрачок в разной форме». Накладка `fTired` (дуга-веко из fSad поверх
// круглых, переменная `--tired`, парковка 54, фикс «серпа 5px») УДАЛЕНА
// ЦЕЛИКОМ вместе со своим CSS и стражами. НЕ ВОЗВРАЩАТЬ ни под каким видом:
// это не баг реализации, а отсутствующее в языке глаз состояние.
// ⚠️ НИЖНИЕ веки `fSad` (нода 741:1336) — ДРУГОЕ и остаются: они утверждённая
// форма грусти, а претензия была к ВЕРХНИМ дугам поверх круглых глаз.
// ⚠️ ВМЕСТЕ С ВЕКАМИ УМЕР «УДАР НА ЗАЧЁТ» (TIRED_STUN): он был доп. просадкой
// ВЕКА на 180 мс и другого канала не имел. Возвращать его через зрачок —
// отдельное слово владельца, самодеятельностью не делаем.
//
// ОСТАЛОСЬ ДВА канала, оба «белок + чёрный зрачок разной формы»:
//   (1) РАЗМЕР зрачка — копящаяся усталость роняет его базу;
//   (2) ФОРМА зрачка — щёлочки (741:1302) на предпоследнем зачёте и ✕✕
//       (741:1281) на N-м; обе — собственные ноды владельца.
const TIRED_PUP_K = 0.28;   // насколько усталость роняет БАЗУ зрачка (0..1)
const TIRED_SPENT_AT = 1;   // за сколько зачётов ДО разлёта миксер «выдыхается» (щёлочки)
let bowlSeen = 0, tiredSlam = false;
// доля усталости 0..1 по ЗАЧЁТАМ (cracks/N). Механику не трогаем — только читаем.
function bowlFatigue(){
  if (!level || level.over) return 0;
  const n = (typeof bowlN === 'function') ? bowlN() : 6;
  return Math.min(1, (level.bowlCracks || 0) / Math.max(1, n));
}
// сколько зачётов ОСТАЛОСЬ до разлёта (по нему решается «выдохся»)
function bowlLeft(){
  if (!level || level.over) return 99;
  const n = (typeof bowlN === 'function') ? bowlN() : 6;
  return n - (level.bowlCracks || 0);
}
let faceState = 'calm', blinkUntil = 0, nextBlinkAt = 0, faceHold = '', faceHoldUntil = 0, faceHoldFrom = 0;
let lookVec = null, lookUntil = 0, wander = [0,0], wanderAt = 0, dart = [0,0], dartAt = 0;
let pupPulseUntil = 0, lastScoreSeen = null;
// Приоритет сверху вниз. Лесенка угрозы: спокойные -> закатанные -> хитрые -> злые
function eyesMood(now, grinding){
  if (!level || intro) return 'calm';
  if (level.over) return items.every(i => !i.alive) ? 'kind' : 'lose'; // ✕✕ из набора
  if (chainUntil > now) return 'surprised';       // турбо
  if (grinding) return 'angry';                   // лопасти едят вещи
  const idle = (now - stats.lastAction)/1000;
  if (level.idleLimit - idle <= 3) return 'sly';  // предвкушение: ≤3 с до перемолки
  if (comboUntil > now) return 'kind';            // горит серия
  if (idle > 8) return 'rolled';                  // заскучал
  return 'calm';
}
// Диск заряда у курсора (tickChainBar) УДАЛЁН: индикатор турбо теперь
// РАЗМЕР ЗРАЧКА персонажа (спека владельца в чате ИНТЕРФЕЙСА: «полоски
// нет, копит глаз») — см. eyeSizes ниже. CHAIN_RING_ENABLED в 00-config
// остался мёртвым флагом истории.
// короткая реакция поверх состояния (тап по глазам, промах, сюрприз)
function faceEvent(state, ms){ faceHold = state; faceHoldUntil = performance.now() + ms; faceHoldFrom = 0; }
// зрачки поворачиваются к точке экрана (тап игрока) на 1.4 с
function faceLook(x, y){
  const r = $('face').getBoundingClientRect();
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const k = 24 * Math.min(1, d / 260);          // чем дальше тап, тем сильнее косит
  lookVec = [dx / d * k, dy / d * k];
  lookUntil = performance.now() + 1400;
}
function facePulse(){ pupPulseUntil = performance.now() + 180; } // «ах!» на матче
// РАЗМЕРЫ ЗРАЧКОВ И БЕЛКОВ, отдельно для левого и правого глаза.
// Драматургия буста (спека владельца): копится — зрачки РАСТУТ 29->50;
// как только буст набран — резко СЖИМАЮТСЯ до 15 (eyes-0-1) и катаются.
function eyeSizes(now, state){
  // ⚠️ УСТАЛОСТЬ — ВТОРАЯ ФАЗА ТОГО ЖЕ КАНАЛА РАЗМЕРА (рамка ГРАФИКИ: не
  // заводить новую визуальную переменную). Она роняет БАЗУ, а набор серии
  // по-прежнему тянет зрачок вверх ОТ ЭТОЙ просевшей базы — читается как
  // «устал, но на серии всё равно распахивается, просто уже не так широко».
  const base = PUP_BASE * (1 - TIRED_PUP_K * bowlFatigue());
  const s = { pl: base, pr: base, wl: EYE_R, wr: EYE_R };
  if (chainUntil > now){
    if (chainSeries >= 2){                       // СЕРИЯ турбо: асимметрия eyes-5
      s.pl = EYE5_PL; s.pr = EYE5_PR; s.wr = EYE5_WR; return s;
    }
    s.pl = s.pr = PUP_MIN; return s;             // обычное турбо: сжались, катаются
  }
  if (state === 'surprised'){ s.pl = s.pr = PUP_WIDE; return s; }
  if (state === 'kind'){
    // НАБОР БУСТА: зрачки растут 29 -> 50 по мере серии (спека владельца).
    // Дуги eyes-4-4 этим и заменены — размером, а не формой.
    const t = Math.min(1, comboCount / chainComboAt()); // порог растёт с уровнем (00-config)
    s.pl = s.pr = base + (PUP_WIDE - base) * t;          // тянем ОТ просевшей базы
    return s;
  }
  if (pupPulseUntil > now){ s.pl = s.pr = base * 1.25; }   // «ах!» на матче
  return s;
}
// КУДА СМОТРЯТ. Вектор задаётся с запасом — реальную амплитуду обрежет
// clampGaze по свободному месту внутри белка.
function gazeFor(now, state){
  if (chainUntil > now){
    // ТУРБО: зрачки КАТАЮТСЯ в РАЗНЫЕ стороны (спека владельца) — один по
    // часовой, другой против, оборот примерно за 1.2 с
    const th = now / 1000 * 5.2;
    const c = Math.cos(th) * 99, sn = Math.sin(th) * 99;       // 99 = «до упора»
    return [[c, sn], [-c, -sn]];
  }
  if (FACE_GAZE[state]) return FACE_GAZE[state];
  if (lookUntil > now && lookVec) return [lookVec, lookVec];
  if (now > wanderAt){ wanderAt = now + 1500 + Math.random() * 1500;
    wander = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 8]; }
  return [wander, wander];
}
// ⚠️ ГЛАВНОЕ ПРАВИЛО (спека владельца): чёрный зрачок НИКОГДА не выходит за
// белок. Свободный ход = радиус белка − радиус зрачка − 1 (запас, чтобы не
// касался края). Без этого распахнутый зрачок при взгляде вбок вылезал наружу.
function clampGaze(vec, pupR, eyeR){
  const room = Math.max(0, eyeR - pupR - 1);
  const d = Math.hypot(vec[0], vec[1]);
  if (d <= room || d === 0) return vec;
  return [vec[0] / d * room, vec[1] / d * room];
}
// тик всей конструкции — каждый кадр (моргание требует мельче 600 мс)
function tickFace(now){
  tickVitrine(now); // витрина сама гейтится медиазапросом и 150 мс
  // РЕАКЦИИ без правок в чужой зоне: следим за счётом. Вырос — зрачок
  // «ахнул», упал (промах −7) — ГРУСТНО смотрят вниз (eyes-1-6, спека
  // владельца). ⚠️ ВО ВРЕМЯ ПОМОЛА реакции ГЛУШАТСЯ: штраф −20 капает
  // каждый помол, и грусть перебивала бы злые глаза — владелец требует
  // «при работе блендера всегда злые».
  if (level && !intro && !lastGrind){
    if (lastScoreSeen === null) lastScoreSeen = stats.score;
    else if (stats.score > lastScoreSeen) facePulse();
    else if (stats.score < lastScoreSeen){
      // естественный вход в грусть: зрачки НЫРЯЮТ вниз (80 мс на круглой
      // паре), затем выезжают веки; после грусти взгляд ещё висит внизу
      lookVec = [0, 18]; lookUntil = performance.now() + 1900;
      faceHold = 'sad'; faceHoldUntil = performance.now() + 780;
      faceHoldFrom = performance.now() + 80; // 80 мс — нырок зрачков до век
    }
    lastScoreSeen = stats.score;
  } else lastScoreSeen = null;
  // время меняет ширину раз в секунду — обжимаем рамку по факту смены
  const tmStr = $('timer').textContent;
  if (tmStr !== tmStrLast){ tmStrLast = tmStr; fitStat('timer'); }
  // ЗАЧЁТ ЧАШИ ловим ДИФФОМ счётчика — механику (bowlCrackAdd) не трогаем.
  // ⚠️ Тот же дифф ловит и СБРОС уровня (cracks обнулился) — отдельного
  // обработчика смены уровня не нужно, и рассинхрона между ними не будет.
  const _cr = (level && level.bowlCracks) || 0;
  if (_cr !== bowlSeen){
    if (_cr > bowlSeen && level && !level.over){
      const _n = (typeof bowlN === 'function') ? bowlN() : 6;
      if (_cr >= _n) tiredSlam = true;               // N-й: глаза захлопнулись
    }
    if (_cr === 0) tiredSlam = false;                // новый уровень — с чистого лица
    bowlSeen = _cr;
  }
  if (!nextBlinkAt) nextBlinkAt = now + 4000;
  // моргание 120 мс раз в 4-7 с; в турбо и на помоле не моргаем
  const canBlink = faceState === 'calm' || faceState === 'kind' || faceState === 'rolled';
  if (now > nextBlinkAt && canBlink){
    blinkUntil = now + 120;
    // ⚠️ РЕЖЕ МОРГАЕТ ПО МЕРЕ УСТАЛОСТИ (рамка ГРАФИКИ): интервал растёт
    // вдвое к последнему зачёту. Не «чаще» — уставший моргает медленно и
    // тяжело, частое моргание читалось бы как тревога, а это чужой сигнал.
    nextBlinkAt = now + (4000 + Math.random() * 3000) * (1 + bowlFatigue());
  }
  // помол перебивает всё, включая короткие реакции и моргание;
  // faceHoldFrom задерживает включение hold-состояния (нырок зрачков)
  const holdOn = faceHoldUntil > now && now >= faceHoldFrom;
  // ЛИЦА УСТАЛОСТИ — ЛЕСЕНКА ВЛАДЕЛЬЦА: веки копятся -> ЩЁЛОЧКИ (выдохся) ->
  // ✕✕ (вырубился) -> разлёт чаши. ⚠️ Обе формы взяты из его нод, а не
  // придуманы: 741:1302 и 741:1281.
  // ⚠️ ЖИВОЙ ГЕЙТ `level.over`: `tiredSlam` живёт до genLevel (bowlCracks
  // обнуляет только он, shatterBowl — НЕТ), а уровень кончается РАНЬШЕ, на
  // волне сбора. Без гейта победное лицо рисовалось бы вырубленным.
  const живая = !lastGrind && !!level && !level.over;
  const вырубился = tiredSlam && живая;                       // ТЕРМИНАЛЬНОЕ: бьёт и реакции
  const выдохся = !вырубился && живая && bowlLeft() <= TIRED_SPENT_AT;
  // ⚠️ ПОРЯДОК ЗДЕСЬ И ЕСТЬ ЛЕСЕНКА ПРИОРИТЕТОВ (рамка ГРАФИКИ, п.3):
  // помол > вырубился > короткие реакции > выдохся > покой. «Выдохся» стоит
  // НИЖЕ реакций намеренно — иначе щёлочки съедали бы грусть на промахе,
  // а это сигнал о другом событии.
  const st = lastGrind ? 'angry'
           : вырубился ? 'out'
           : holdOn ? faceHold
           : выдохся ? 'spent' : faceState;
  setFace(st, now, blinkUntil > now && st !== 'lose' && st !== 'out' && st !== 'spent' && !lastGrind);
}
function setFace(state, now, blinking){
  const svg = $('eyes'), layer = FACE_LAYER[state] || 'fRound';
  for (const id of ['fRound','fAngry','fX','fSad','fSlit'])
    $(id).classList.toggle('on', id === layer);
  // ⚠️ СПИСОК СНОВА ОДИН — накладок больше нет (веки удалены, см. томбстоун
  // вверху файла). Правило канона «каждый узел разметки обработан в setFace»
  // выполняется буквально: сколько слоёв в разметке, столько и здесь.
  svg.classList.toggle('blink', !!blinking);
  if (layer === 'fAngry'){
    // злые СЛЕДЯТ ЗА ЧАШЕЙ (спека владельца): влево -> вправо -> вниз,
    // шаг ~0.8 с; CSS-переход на .p сглаживает; клип держит внутри белка
    const seq = [[-11, 5], [11, 5], [0, 11]];
    const g2 = seq[Math.floor((now || performance.now()) / 800) % 3];
    $('pupAL').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    $('pupAR').style.transform = 'translate(' + g2[0] + 'px,' + g2[1] + 'px)';
    return;
  }
  if (layer !== 'fRound') return;                 // у прочих слоёв зрачков нет
  const t = now || performance.now();
  const sz = eyeSizes(t, state), g = gazeFor(t, state);
  const gl = clampGaze(g[0], sz.pl, sz.wl), gr = clampGaze(g[1], sz.pr, sz.wr);
  $('pupL').style.transform = 'translate(' + gl[0].toFixed(1) + 'px,' + gl[1].toFixed(1) +
    'px) scale(' + (sz.pl / PUP_BASE).toFixed(3) + ')';
  $('pupR').style.transform = 'translate(' + gr[0].toFixed(1) + 'px,' + gr[1].toFixed(1) +
    'px) scale(' + (sz.pr / PUP_BASE).toFixed(3) + ')';
  $('wL').style.transform = 'scale(' + (sz.wl / EYE_R).toFixed(3) + ')';
  $('wR').style.transform = 'scale(' + (sz.wr / EYE_R).toFixed(3) + ')';
}
let lastGrind = false;
function updateEyes(now, grinding){ lastGrind = !!grinding; faceState = eyesMood(now, grinding); } // мод — раз в 600 мс
// ⚠️ МЕНЯЛОСЬ ВМЕСТЕ С skyTimeNow (10-stage), спека владельца 2026-07-31
// «день до 20:00, ночь с 20:00». ПРАВКА ГРАФИКИ В ФАЙЛЕ ИНТЕРФЕЙСА — по
// согласованию через диспетчера: граница обязана двигаться в локстепе с небом,
// иначе с 20 до 22 небо дневное, а тема кнопок ночная.
// ⚠️ ЧИСЛО БОЛЬШЕ НЕ ДУБЛИРУЕТСЯ: обе функции читают SKY_DAY_FROM/
// SKY_NIGHT_FROM из 00-config. Час берётся через skyHourNow() — он же несёт
// форс-хук `?hour=N`, которым ИНТЕРФЕЙС просил закрыть непроверяемость
// темовых фич (тема витрины, инверсия Shake, правило цвета кнопок).
function isNightSky(){
  const h = skyHourNow();
  return h >= SKY_NIGHT_FROM || h < SKY_DAY_FROM;
}
// Обжать svg-рамку по тексту: ширина = длина текста в юнитах viewBox ×
// текущий масштаб (высота/27). Без этого фиксированные рамки давали дыру
// между LV и временем и наезд времени на глаза (скрин владельца).
function fitStat(id){
  const t = $(id), svg = t.ownerSVGElement;
  const u = t.getComputedTextLength() + 3;          // ширина в юнитах viewBox
  // ⚠️ менять надо И viewBox, И css-ширину: svg держит пропорции viewBox
  // (meet) — одна лишь ширина при высоте 42 УМЕНЬШАЛА контент (LV мельче
  // времени на скрине владельца)
  svg.setAttribute('viewBox', '0 0 ' + u.toFixed(1) + ' 27');
  // ⚠️ ЯКОРЬ ЕДЕТ ЗА РАМКОЙ (жалоба владельца 2026-07-27 «отступы поломались»,
  // скрин: число обрезано краем экрана). LV и время привязаны к ЛЕВОМУ краю
  // (x=1) — им сжатие рамки безразлично. А чип очков привязан к ПРАВОМУ
  // (text-anchor=end, x=102 под ИСХОДНУЮ рамку 104). Ужав viewBox до ~91, мы
  // оставляли якорь на 102 — текст рисовался НА 10 ЮНИТОВ ЗА рамкой (overflow
  // у .otext visible, поэтому не обрезался, а вылезал) и уходил за вьюпорт:
  // замер 390px — правый край текста 392 при рамке до 382.
  if (t.getAttribute('text-anchor') === 'end') t.setAttribute('x', (u - 2).toFixed(1));
  const k = (svg.getBoundingClientRect().height || 27) / 27;
  svg.style.width = (u * k) + 'px';
}
let tmStrLast = '';
let chargeInT = 0, chargeRAF = 0;
// ⚠️⚠️ РАСТВОРЕНИЕ ЗАРЯДА ВЕДЁТ ПОКАДРОВЫЙ ТИК, А НЕ updateHUD. Постановка
// описывала «лестничную opacity из updateHUD (тик 600 мс)» — ТИКА НЕТ:
// `updateHUD` зовётся ПО СОБЫТИЯМ (матч, конец серии/цепи, встряска, реген,
// сам грант), а таймер миксера обновляет отдельный блок в loop. Замер на main:
// пока игрок не трогает игру, прозрачность пишется ОДИН раз при выпадении и
// не меняется — растворения не было вовсе, кнопка просто исчезала через 7 с.
// Поэтому здесь свой rAF: читает ЖИВОЙ `chargeState().leftMs` (единственный
// источник времени — ядро; пауза TTL не двигает, `chargeUntil` — чистая метка),
// пишет opacity каждый кадр и САМ ОСТАНАВЛИВАЕТСЯ, когда заряда нет.
// ⚠️ Писатель opacity ОДИН. Прежняя пара «шаг из updateHUD + переход в CSS»
// разъезжалась бы: на паузе меню кадры идут, а событий нет.
function chargeFadeStart(){ if (!chargeRAF) chargeRAF = requestAnimationFrame(chargeFadeTick); }
function chargeFadeTick(){
  chargeRAF = 0;
  const cb = $('chargeBtn');
  if (!cb || cb.style.display === 'none') return;
  const cs = (typeof chargeState === 'function') ? chargeState() : null;
  if (!cs || !cs.name) return;                    // заряд ушёл — тик умирает сам
  cb.style.opacity = String(0.25 + 0.75 * Math.min(1, cs.leftMs / CHARGE_TTL_MS));
  // САМОЛЕЧЕНИЕ СПИНА (Интерфейс поймал дыру и честно её не закрыл): канвас
  // ОДИН на игру — меню/коллекция забирают его в любой момент, а добор жил
  // только в updateHUD, то есть возвращался лишь со следующим игровым
  // событием. В простое слот оставался мёртвой картинкой (а по правилу
  // владельца картинка ещё и скрыта — то есть пустым). Возвращаем покадрово:
  // проверка дешёвая (сравнение parentNode), thumbSpinStart зовётся только
  // когда канваса в слоте реально нет.
  try {
    const live = (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb);
    if (!live && cb.dataset.img === cs.name){
      const sit = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
      if (sit && sit.mesh){ thumbSpinStart(sit, cb); cb.dataset.spin = cs.name; }
    }
    const img = $('chargeImg');
    if (img) img.style.display = (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb) ? 'none' : '';
  } catch(e){}
  chargeRAF = requestAnimationFrame(chargeFadeTick);
}
// ТОСТ МНОЖИТЕЛЯ ПОД ГЛАЗАМИ (нода 829:1242, слово владельца «множитель
// набранной вещи показывается под глазами»): плашка 169×60, портрет 44,
// «×N.NN» лаймом. Показывается на сборе прокачанного типа (accMult > 1),
// повторный сбор перезаводит таймер. Зовёт doMatch (80-gameplay).
let multToastT = 0, multTween = 0, multLastShown = null; // multLastShown — с какого числа крутить счётчик
function showMultToast(typeName, mult, isTierUp){
  // десктоп ставит тост НАД витриной (нода 741:1497): её высота зависит от
  // числа типов уровня, поэтому отдаём измеренную высоту в CSS-переменную
  try {
    const v = document.getElementById('vitrine');
    if (v && v.offsetHeight) document.documentElement.style.setProperty('--vitrineH', v.offsetHeight + 'px');
  } catch(e){}
  const el = $('multToast');
  if (!el) return;
  const it = (typeof thumbItemForKey === 'function') ? thumbItemForKey(typeName) : null;
  const url = it ? itemThumb(it) : '';
  const img = $('multToastImg');
  if (url) img.src = url; else img.removeAttribute('src');
  // ЧИСЛО ПЕРЕЕЗЖАЕТ ПЛАВНО (слово владельца 2026-08-05: «добавить плавное,
  // но быстрое изменение множителя с предыдущего значения на новое»): на
  // повышении ступени крутим счётчик от прошлого множителя к новому за 420 мс
  // на РЕАЛЬНЫХ часах (тост живёт вне игрового времени; слоу-мо разлёта не
  // должно его растягивать). Обычный показ ставит число сразу.
  const valEl = $('multToastVal');
  const target = Math.round(mult * 100) / 100;
  if (multTween){ cancelAnimationFrame(multTween); multTween = 0; }
  if (isTierUp && multLastShown != null && multLastShown < target){
    const from = multLastShown, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 420);
      const e = 1 - Math.pow(1 - k, 3);
      valEl.textContent = '×' + (Math.round((from + (target - from) * e) * 100) / 100);
      multTween = k < 1 ? requestAnimationFrame(step) : 0;
    };
    step();
  } else {
    valEl.textContent = '×' + target;
  }
  multLastShown = target;
  // ПОВЫШЕНИЕ СТУПЕНИ — тот же тост, но заметное СОБЫТИЕ: вспышка чипа и
  // вдвое дольше на экране (слово владельца 2026-08-05 «своди в один»).
  // Класс снимаем таймером — иначе разовая анимация висела бы на узле и
  // перебивала следующий показ (грабля слота заряда).
  el.classList.toggle('up', !!isTierUp);
  el.classList.add('on');
  if (multToastT) clearTimeout(multToastT);
  multToastT = setTimeout(() => { el.classList.remove('on'); el.classList.remove('up'); multToastT = 0; },
                          isTierUp ? 2600 : 1400);
}
function updateHUD(){
  // СЛОТ ЗАРЯДА ТИПА (вставка диспетчера 2026-07-31, полировка за ИНТЕРФЕЙСОМ):
  // портрет из общего thumb-кэша (холодная пачка отдаст пусто первые тики —
  // v183-правило само доложит картинку позже), прозрачность = остаток жизни.
  try {
    const cb = $('chargeBtn');
    if (cb && typeof chargeState === 'function'){
      const cs = chargeState();
      if (cs.name && level && !level.over && !intro){
        cb.style.display = '';
        if (cb.dataset.oc !== cs.name){
          cb.dataset.oc = cs.name; cb.dataset.img = '';   // портрет ещё не подтверждён
          cb.style.opacity = '1';
          // ВХОД: короткий поп — заряд выпадает на зажигании Power chain, момент
          // яркий. Поп на TRANSFORM УЗЛА, растворение на OPACITY, а бесконечный
          // ПУЛЬС — на transform КАРТИНКИ (v3, «не кнопкой, а моделью»): три
          // движения на трёх носителях, поэтому не спорят. Класс снимаем
          // таймером — иначе разовая анимация висела бы на узле вечно и
          // перебивала бы будущий поп следующего заряда.
          cb.classList.remove('in'); void cb.offsetWidth; cb.classList.add('in');
          if (chargeInT) clearTimeout(chargeInT);
          chargeInT = setTimeout(() => { cb.classList.remove('in'); chargeInT = 0; }, 420);
        }
        chargeFadeStart();
        // ⚠️ ПОРТРЕТ ДОБИРАЕМ, ПОКА НЕ ПРИДЁТ, а не один раз на смене имени:
        // тип заряда СЛУЧАЙНЫЙ, и его пачка вполне может быть холодной —
        // тогда `itemThumb` по правилу v183 честно отдаёт пусто, и разовая
        // попытка оставила бы слот с ЧУЖОЙ картинкой прошлого заряда (хуже
        // пустоты: кнопка обещала бы не тот предмет). До прихода снимаем src.
        if (cb.dataset.img !== cs.name){
          const it = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
          const url = it ? itemThumb(it) : '';
          if (url){ $('chargeImg').src = url; cb.dataset.img = cs.name; }
          else $('chargeImg').removeAttribute('src');
        }
        // ВРАЩЕНИЕ ЗАРЯДА (нода 829:1242 «крутится»). Общий спин портретов;
        // канвас ОДИН на игру — меню при открытии заберёт его под коллекцию,
        // а этот добор вернёт спин заряду, как только слот снова обновится.
        if (cb.dataset.img === cs.name &&
            !(typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb && cb.dataset.spin === cs.name)){
          const sit = (typeof thumbItemForKey === 'function') ? thumbItemForKey(cs.name) : null;
          if (sit && sit.mesh){ try { thumbSpinStart(sit, cb); cb.dataset.spin = cs.name; } catch(e){} }
        }
        // ⚠️⚠️ ПРАВИЛО ВЛАДЕЛЬЦА (2026-08-05, дословно): «если я прошу модельку
        // и у неё вращение, то это именно 3D БЕЗ ДОП КАРТИНКИ». Прежняя версия
        // держала `#chargeImg` ПОД канвасом «фолбэком» — и обе видны разом:
        // плоский портрет и крутящаяся модель поверх. Это ВТОРОЙ случай той же
        // ошибки (первый — галерея коллекции), поэтому правило, а не разовая
        // правка: живой спин => картинки быть НЕ ДОЛЖНО.
        // ⚠️ ПРОВЕРКА КАЖДЫЙ ТИК, А НЕ В ВЕТКЕ СМЕНЫ ИМЕНИ: канвас общий, меню
        // забирает его в любой момент — картинка обязана вернуться ровно тогда,
        // когда спина не стало, иначе слот останется пустым.
        // ⚠️ Пустой `src` НЕ ЗАМЕНЯЕМ чужим портретом (правило v183): холодная
        // пачка => пусто, и это честнее, чем показать не тот предмет.
        const spinLive = (typeof spinR !== 'undefined' && spinR &&
                          spinR.domElement.parentNode === cb);
        $('chargeImg').style.display = spinLive ? 'none' : '';
      } else {
        if (cb.style.display !== 'none'){
          try { if (typeof spinR !== 'undefined' && spinR && spinR.domElement.parentNode === cb) thumbSpinStop(); } catch(e){}
        }
        cb.style.display = 'none'; cb.dataset.oc = ''; cb.dataset.img = ''; cb.dataset.spin = '';
      }
    }
  } catch(e){}
  // ⚠️ ТЕМА МОЖЕТ СМЕНИТЬСЯ В ЖИВОЙ СЕССИИ (граница 20:00), а нейтраль полос
  // зависит ровно от неё — значит тинт обязан переехать вместе с темой, иначе
  // после заката полосы останутся белыми. Перекрашиваем ТОЛЬКО на переходе,
  // не каждый тик: `tintChrome` трогает html/body и мету.
  // ⛔ Под меню НЕ вмешиваемся — там своя нейтраль, и её ставит openMainScreen.
  const ночьТеперь = isNightSky();
  if (ночьТеперь !== hudWasNight){
    hudWasNight = ночьТеперь;
    if (!document.documentElement.classList.contains('menuopen') &&
        typeof tintChrome === 'function') tintChrome();
  }
  document.documentElement.classList.toggle('night', ночьТеперь);
  captureLevelTypes(); // фиксируем типы уровня для экрана победы (вне зоны витрины)
  // #11 (спека владельца): УРОВЕНЬ показываем на десктопе (левая группа) И на
  // мобайле — над очками (тот же #lvlSvg переносит в стек layoutHUD). Время
  // (#tmSvg) остаётся СКРЫТЫМ, слот не репёрпоузим — ассерт «время скрыто» цел.
  $('lvlNum').textContent = 'LV ' + levelNum;
  fitStat('lvlNum');
  // мобильный макет 741:1738: справа стек «уровень / очки». СЧЁТЧИК ПРЕДМЕТОВ
  // УДАЛЁН (спека владельца 2026-07-28 «верхняя цифра вообще не нужна»): на
  // десктопе его и так не было (макета нет), оставался только мобайл.
  // Монет тоже нет (кошелёк — в меню), номер уровня — #lvlSvg (#11).
  // СПРАВА — ОЧКИ УРОВНЯ под иконкой звезды (спека владельца 2026-07-22-б:
  // «звезды справа это не звезды, а очки. Иконка звезды остается, но подсчет
  // очков идет так же от совмещения или ошибок»). Отменяет короткоживущую
  // спеку «общие звёзды в чипе»: САМИ звёзды теперь только на экране
  // завершения (winStars) и на будущем главном экране (макет владелец
  // покажет позже) — totalStars() в HUD не выводить.
  // ЕДИНЫЙ БАЛАНС (финализация владельца 2026-07-24, запрос МЕТА): чип
  // показывает liveBalance() = баланс + незабанкованный счёт уровня (÷10),
  // а НЕ per-level stats.score — то же число, что кошелёк меню и лидерборд.
  // На победе счёт уезжает в se (bankLevelScore) → число непрерывно.
  // ⚠️ ЧИП ПЕРЕПОЛНЯЛСЯ (замер МЕТЫ: 6 цифр на 360px наезжали на глаза на
  // 4px, 7 цифр на 393px — на 14px): число писалось СЫРЫМ, а #scSvg имеет
  // фиксированный viewBox и ширину — лишнее рисовалось ЗА рамкой
  // (.otext overflow:visible) прямо на конструкцию глаз. Лечение из двух
  // частей: (а) тот же компрессор, что на экране победы — длина строки
  // ограничена сверху; (б) fitStat — рамка по факту текста, как у
  // lvlNum/timer. Бандлы делают это критичным: кошелёк 6-7 цифр уже в
  // первую платную сессию.
  $('score').textContent = '★ ' + winFmtScore(liveBalance());
  fitStat('score');
  const btn = $('shakeBtn');
  // ⚠️ Счётчик = бесплатные уровня + КУПЛЕННЫЙ запас бандла (77-save): без
  // этого игрок с 50 оплаченными встрясками видел бы «No shakes». Стиль/
  // раскладка бейджа — за ИНТЕРФЕЙСОМ, здесь только правдивое число.
  const shakesLeft = level.shakes + purchasedShakes();
  if (shakesLeft > 0){ btn.classList.remove('ad','off'); $('shakeLbl').textContent = 'Shake ×' + shakesLeft; }
  // AD-состояние по макетам 778:715/778:707: та же пилюля, слово «Ad» ЛАЙМОМ
  // внутри надписи (было «📺 Shake» на фиолетовом фоне). innerHTML — строка
  // своя, без пользовательских данных.
  else if (level.adShakes > 0){ btn.classList.add('ad'); btn.classList.remove('off'); $('shakeLbl').innerHTML = 'Shake <span class="ad-w">Ad</span>'; }
  else { btn.classList.add('off'); btn.classList.remove('ad'); $('shakeLbl').textContent = 'No shakes'; }
  // чипа монет и счётчика подсказок в макете 741:1738 НЕТ (монеты к тому же
  // скрыты COINS_ENABLED; кошелёк уедет в меню). Заряды подсказок живут в
  // сейве — кнопка просто гаснет при нуле
  // ПОДСКАЗКА — ТРИ СОСТОЯНИЯ бейджа (контракт МЕТЫ v129):
  //  заряды есть      → число зарядов (бейдж Number 783:91/778:721/778:719);
  //  зарядов 0 + ролик → лайм «Ad» (бейдж Ad 778:723/783:93) — тап крутит ролик;
  //  зарядов 0, кап    → «0» и кнопка гаснет (паттерн Shake .off).
  const hCnt = hints(), hAd = (typeof adHintAvailable === 'function') && adHintAvailable();
  $('hintCnt').textContent = hAd ? 'Ad' : hCnt;
  $('hintCnt').classList.toggle('ad', hAd);   // у ad-бейджа падинг 8 (в ноде без 12/8)
  // ⚠️ .off ТОЛЬКО когда И зарядов нет, И ролик недоступен. Раньше гасили по
  // одному hints()<1 — а .off несёт pointer-events:none, и это ЗАБЛОКИРОВАЛО БЫ
  // тап по «Ad» (кнопка выглядела бы активной, но не нажималась).
  $('hintBtn').classList.toggle('off', hCnt < 1 && !hAd);
  // ⚠️ ТОЧНЫЙ СЧЁТ ПАР УБРАН ИЗ updateHUD (ревью 2026-08-05): availablePairs
  // — O(k²) с GJK-запросом Rapier, а updateHUD зовётся из 48 мест, включая
  // хвост doMatch и досыпку турбо каждые 125 мс. Замер: ~11 лишних вызовов
  // в секунду активной игры (0.13-0.16 мс каждый) в САМЫХ горячих кадрах.
  // Поле #apCount живёт в дев-панели и обновляется 600-мс тиком (99-main),
  // где ap всё равно считается для детекта тупика — визуально ничего не
  // теряем.
  $('radiusVal').textContent = CFG.matchRadius > 10 ? '∞' : CFG.matchRadius.toFixed(2); // динамический; ∞ = эндшпиль
}


// ===== НАКОПЛЕНИЕ ОБЪЕКТОВ: всплывашка апа ступени + музей (каркас) =====
// Контракт с МЕТОЙ (WORKSTREAMS): accSnapshot() -> [{name,count,tier,mult,
// next}], хук onAccTierUp(cb) с {name,tier,mult,item}. Пока меты нет —
// демо-данные с бейджем DEMO; стыковка ниже подхватит настоящие функции
// автоматически, править ничего не придётся.

// --- миниатюра предмета: однокадровый рендер НАСТОЯЩЕГО меша в офскрин-
// канвас. Matcap не зависит от света — портрет честный без ламп. Кэш по
// типу; второй WebGL-контекст один и переиспользуется.
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbCache = {};
// РАЗМЕР БУФЕРА: 132 = 3×44 (витрина/музей) и 2.4×56 (тост) — хватает
// ретине; 96 давало мыло, 176 — лишние 50% веса кэша. Буфер СТРОГО
// КВАДРАТНЫЙ: у потребителей img 100%/100% без object-fit, неквадрат
// сплющит портрет. MARGIN 4% — меньше нельзя: у боксов радиус 10-12,
// углы круглых моделей срезало бы.
const THUMB_PX = 256, THUMB_MARGIN = 0.04, THUMB_Y = 100; // 256 (было 132): резче на карточке коллекции (спека владельца «качество»)
// ПОЗА ПОРТРЕТА — ЕДИНЫЙ ИСТОЧНИК для статики (itemThumb) И спина (thumbSpin):
// интерфейс на hover прячет статичный img и показывает канвас, спин стартует
// с этого же угла — подмена бесшовна. Если статика и спин разойдутся — скачок
// при наведении, поэтому ОБА берут отсюда (нельзя развести). Спека владельца
// 2026-07-24-в: «лёгкий подъём вправо-вверх, потом спин по горизонтали».
// tx=−0.15 — ЛЁГКИЙ взгляд СНИЗУ (перёд модели приподнят, не «ныряет» сверху,
// как прежний +0.42 top-down, который владелец забраковал «уводит в нижний
// угол»); yaw=−0.6 даёт 3/4: у машин перёд вправо-вверх, у зверей видна морда.
// Подобрано скрином на police/bee/banana (все три читаются геройски).
let PORTRAIT_TILT_X = -0.15, PORTRAIT_YAW0 = -0.6;
// ПОРТРЕТ-МЕШ ПО КЛЮЧУ ТИПА (type.name) — вариант B спеки владельца 2026-07-24:
// даёт модель тем ОТКРЫТЫМ типам, которых НЕТ в текущей партии (иначе была
// буква-заглушка). Меш строится БЕЗ тела Rapier (портрету физика не нужна) и
// НЕ добавляется в главную сцену — itemThumb/спин делают свою меш-обёртку.
// Материал — ТОТ ЖЕ itemMaterial (40-items), что у боевого предмета: matcap,
// вуаль, texTune честны. Кэш по ключу; key='T'+idx СОВПАДАЕТ с боевым, поэтому
// thumbCache (по item.key) у портрета и живого предмета один — двойного
// рендера нет. Возвращает минимальный item под itemThumb/thumbSpinStart.
// ГХОСТ ЗАКРЫТЫХ ТИПОВ (спека владельца 2026-07-24-в: «не открытые модели
// выглядят прозрачными и немного матовыми, но бесцветными» + «заполни весь
// музей моделями»). Силуэт непойманного (как покедекс) — дразнит. Интерфейс
// вешает на ЗАКРЫТЫЕ карточки ВМЕСТО буквы (ghost=true).
// ⚠️ ПЕРЕИСПОЛЬЗУЕМ уже готовое: обесцвечивание — вуаль uVeil (десат в шейдере,
// v84), прозрачность — material.opacity. itemThumb при item.ghost жмёт uVeil=1
// + opacity=GHOST_ALPHA (иначе форсит uVeil=0/opacity=1). Матовость даёт сам
// десат (серый читается как глина). Свой кэш-ключ '@g' — гхост и цветной
// портрет одного типа не должны затирать друг друга в thumbCache.
const GHOST_ALPHA = 0.42;   // «полупрозрачный»: сквозь силуэт видно фон карточки
const thumbItemCache = {};
function thumbItemForKey(key, ghost){
  const ck = ghost ? key + '@g' : key;
  if (thumbItemCache[ck]) return thumbItemCache[ck];
  let idx = -1;
  for (let i = 0; i < TYPES.length; i++) if (TYPES[i].name === key){ idx = i; break; }
  if (idx < 0) return null;
  const t = TYPES[idx], gkey = String(idx);
  if (!geoCache.has(gkey)) geoCache.set(gkey, t.geo());
  const mat = itemMaterial(t);
  // ⚠️ transparent выставляем ОДИН раз при создании (смена на лету =
  // перекомпиляция шейдера); гхост-материал персональный, живых не трогает
  if (ghost) mat.transparent = true;
  const mesh = new THREE.Mesh(geoCache.get(gkey), mat);
  mesh.scale.setScalar(MESH_SCALE);
  const it = {
    key: 'T' + idx + (ghost ? 'g' : ''), type: t, mesh, ghost: !!ghost, baseColor: mat.color.clone(),
    fxColor: (t.tex || t.mat === 'model') ? new THREE.Color(t.color).convertSRGBToLinear() : null,
  };
  thumbItemCache[ck] = it;
  return it;
}
function itemThumb(item){
  if (!item || !item.mesh) return null;
  const key = String(item.key);
  if (thumbCache[key]) return thumbCache[key];
  // ⚠️⚠️ АТЛАС ЕЩЁ НЕ ДЕКОДИРОВАН -> НЕ СНИМАТЬ И НЕ КЭШИРОВАТЬ (жалоба
  // владельца 2026-07-30 «где превью у всех новых объектов?»).
  // `modelColormap` (36-models) отдаёт текстуру с БЕЛОЙ 1×1 заглушкой, а
  // `needsUpdate` ставит только в `img.onload` — до него `map.version === 0`,
  // то есть текстура НИ РАЗУ не загружена в GPU. Портрет снимается синхронно
  // и выходит ПУСТЫМ (замер: 0 непрозрачных пикселей из 65536, а два разных
  // типа дают побайтово одинаковый PNG 3174 Б), после чего пустышка оседает
  // в thumbCache НАВСЕГДА — карточка остаётся без картинки до перезагрузки.
  // ⚠️ Болели только НОВЫЕ пачки (holiday/survival/toycar/factory/market/
  // arcade/forest): их атласы не нужны раннему уровню и декодируются впервые
  // ровно на этом вызове. Старые (animal/food/car/brick/pirate) прогреты
  // живой партией, поэтому дефект годами не проявлялся.
  // ⚠️ ВТОРОЙ РЕНДЕР ПОДРЯД НЕ ЛЕЧИТ (проверено: оба кадра по 3174 Б) —
  // ждать нужно СОБЫТИЯ декода, а не лишнего кадра. Сам вызов уже запустил
  // загрузку (itemMaterial -> modelColormap), поэтому добор идёт по таймеру
  // в buildMainCollection.
  const map0 = item.mesh.material && item.mesh.material.map;
  if (map0 && (!map0.image || !map0.image.width || map0.image.width <= 1 || !map0.version)) return null;
  try {
    if (!thumbR){
      thumbR = new THREE.WebGLRenderer({ alpha:true, antialias:true });
      thumbR.setSize(THUMB_PX, THUMB_PX, false);
      thumbR.outputEncoding = renderer.outputEncoding; // без неё цвета уезжают
      thumbScene = new THREE.Scene();
      // ОРТОГРАФИЯ (а не перспектива): проекция аффинная, поэтому кадр
      // считается АНАЛИТИЧЕСКИ за один проход — без чтения пикселей,
      // без второго рендера и без стойла GPU->CPU на readPixels.
      thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
      thumbCam.position.set(1.7, THUMB_Y + 1.35, 2.3);
      thumbCam.lookAt(0, THUMB_Y, 0);
      // на случай CFG.matcap=false (аварийный MeshStandard) — мягкий свет
      thumbScene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.5);
      dl.position.set(2, 3, 2); thumbScene.add(dl);
    }
    // ⚠️ НЕ mesh.clone(): three r149 копирует userData через JSON.stringify,
    // а в userData.item лежит тело Rapier — циклическая структура, throw.
    const m = new THREE.Mesh(item.mesh.geometry, item.mesh.material);
    m.scale.copy(item.mesh.scale);
    m.rotation.set(PORTRAIT_TILT_X, PORTRAIT_YAW0, 0);
    // ⚠️ ВЫСОКО НАД СЦЕНОЙ: matcap-патч гасит диффуз по МИРОВОЙ высоте
    // (vWorldY против uPileTop, 10-stage) — портрет на y=0 всегда выходил
    // самым тёмным тоном кучи (замер: до −0.83 по каналу R).
    m.position.set(0, THUMB_Y, 0);
    thumbScene.add(m);
    m.updateMatrixWorld(true);
    thumbCam.updateMatrixWorld(true);
    // ⚠️ КАДР ПО ОХВАТНОМУ ЦИЛИНДРУ (общий frameCylinder), НЕ по силуэту при
    // одном угле. Причина (спека владельца 2026-07-27 «размер при hover не
    // должен меняться»): спин обязан кадрировать по цилиндру (иначе «дышит»
    // при вращении), а статика по силуэту давала БОЛЬШУЮ модель → на hover
    // подмена img→канвас ШРИНКАЛА объект. Единая цилиндр-рамка = статика РОВНО
    // равна спину. Y-инвариантна: yaw не влияет, поэтому одна на любой ракурс.
    frameCylinder(thumbCam, m);
    // ⚠️ ВУАЛЬ НЕДОСТУПНОСТИ красит material.color лерпом к серому
    // (tickVeil, 60-access): снимок в этот момент лёг бы в кэш СЕРЫМ
    // НАВСЕГДА. На время рендера возвращаем исходный цвет типа.
    // ⚠️ С 2026-07-23 вуаль живёт ещё и В ШЕЙДЕРЕ (uVeil, режим 'desat'):
    // одного восстановления color МАЛО — обесцвеченный портрет так же
    // осел бы в кэше навсегда. Гасим обе ручки на время снимка.
    // ГХОСТ (item.ghost): наоборот — ЖМЁМ вуаль на максимум (десат к светло-
    // серому) + полупрозрачность. Обычный портрет: обе ручки в 0/1 (полный цвет).
    const gh = item.ghost;
    // ⚠️ userData.shader ставит matcapSpecPatch в onBeforeCompile — на ПЕРВОМ
    // рендере. У свежего гхост-материала до рендера он ещё null, и uVeil=1 не
    // применился бы (гхост выходил цветным). Форс-компиляция даёт shader
    // ДО чтения. Только для гхоста — обычным портретам uVeil=0 по умолчанию.
    if (gh) thumbR.compile(thumbScene, thumbCam);
    const col = m.material.color, saved = (item.baseColor && col) ? col.clone() : null;
    if (saved) col.copy(item.baseColor);
    const sh = m.material.userData && m.material.userData.shader;
    const savedVeil = sh ? sh.uniforms.uVeil.value : 0;
    if (sh) sh.uniforms.uVeil.value = gh ? 1 : 0;
    const savedOp = m.material.opacity;
    m.material.opacity = gh ? GHOST_ALPHA : 1;
    // ⚠️ ГХОСТ ОБЯЗАН ОСТАТЬСЯ БЕСЦВЕТНЫМ (спека владельца «не открытые модели —
    // прозрачные, немного матовые, но БЕСЦВЕТНЫЕ»). Гхост переиспользует ту же
    // юниформу uVeil, что и боевая вуаль, а у неё с 2026-07-29 ЕСТЬ ТОН
    // (VEIL_TINT, «светло-синяя, не серая») — и он молча красил силуэты
    // коллекции в синий: замер среднего цвета гхоста дал rgb(81,117,161), синева
    // b−r = +80. Два применения одной юниформы разъехались по требованиям,
    // поэтому на время СЪЁМКИ ПОРТРЕТА тон возвращается в нейтраль (белый:
    // vec3(vLum)*1 = честный серый). Боевая вуаль не затронута — правка живёт
    // ровно на кадр снимка, как и соседние сохранения color/opacity.
    const savedCol = uVeilCol.value.clone();
    if (gh) uVeilCol.value.setRGB(1, 1, 1);
    thumbR.render(thumbScene, thumbCam);
    uVeilCol.value.copy(savedCol);
    m.material.opacity = savedOp;
    if (sh) sh.uniforms.uVeil.value = savedVeil;
    if (saved) col.copy(saved);
    const url = thumbR.domElement.toDataURL();
    thumbScene.remove(m);
    thumbCache[key] = url;
    return url;
  } catch(e){ console.warn('itemThumb:', e && e.message); return null; }
}

// ====== ЖИВОЕ ВРАЩЕНИЕ ПОРТРЕТА ПРИ HOVER (спека владельца 2026-07-24
// «на витрине при наведении модель медленно вращается по горизонтали»).
// ОДИН общий офскрин-контекст spinR, rAF ТОЛЬКО пока висит hover; вне hover —
// НОЛЬ стоимости (rAF отменён, канвас снят). КОНТРАКТ С ИНТЕРФЕЙСОМ:
// thumbSpinStart(item, hostEl) / thumbSpinStop() — интерфейс вешает на
// mouseenter/leave карточки, статический <img> остаётся кадром покоя.
const SPIN_PX = 256;       // квадрат буфера = THUMB_PX (качество, спека владельца)
const SPIN_SPEED = 0.9;    // рад/с — «медленно» (оборот ~7 с)
// SPIN_TILT_X/SPIN_YAW0 — АЛИАСЫ на общий PORTRAIT_* (нельзя развести со статикой)

let spinR = null, spinScene = null, spinCam = null;
let spinMesh = null, spinItem = null, spinRAF = 0, spinPrev = 0, spinAngle = 0;
const _spv = new THREE.Vector3(), _spm = new THREE.Matrix4();
function ensureSpinR(){
  if (spinR) return;
  spinR = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  spinR.setSize(SPIN_PX, SPIN_PX, false);
  spinR.outputEncoding = renderer.outputEncoding;
  // absolute inset:0 — канвас НАКРЫВАЕТ статический <img> в ячейке
  // (.msc-imgwrap position:relative), интерфейсу достаточно appendChild.
  // border-radius:inherit — если интерфейс округлит превью, канвас подхватит
  // радиус хоста сам (сейчас у .msc-img радиуса нет — no-op, но self-mounting
  // без CSS у интерфейса).
  spinR.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;';
  spinScene = new THREE.Scene();
  spinCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  spinCam.position.set(1.7, THUMB_Y + 1.35, 2.3); // тот же ракурс, что itemThumb
  spinCam.lookAt(0, THUMB_Y, 0);
  spinCam.updateMatrixWorld(true);
  spinScene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.5);
  dl.position.set(2, 3, 2); spinScene.add(dl);
}
// Y-ИНВАРИАНТНАЯ РАМКА: силуэт при вращении вокруг Y меняется, поэтому
// кадрируем по ОХВАТНОМУ ЦИЛИНДРУ вокруг локальной оси Y — его силуэт под
// Y-поворотом не меняется ПО ПОСТРОЕНИЮ (three Euler XYZ: R=Rx·Ry, а Ry не
// трогает Y-симметричный цилиндр). Значит модель НЕ клипается и не «дышит»
// зумом. Считается ОДИН раз на старте hover.
function frameCylinder(cam, mesh){
  const pos = mesh.geometry.attributes.position, s = mesh.scale.x;
  let R = 0, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z); if (r > R) R = r;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  R *= s; yMin *= s; yMax *= s;
  _spm.makeRotationX(PORTRAIT_TILT_X); _spm.setPosition(0, THUMB_Y, 0); // поза покоя (Ry не влияет)
  const view = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const yy of [yMin, (yMin + yMax) / 2, yMax]){
    for (let a = 0; a < 24; a++){
      const th = a / 24 * Math.PI * 2;
      _spv.set(Math.cos(th) * R, yy, Math.sin(th) * R).applyMatrix4(_spm).applyMatrix4(view);
      if (_spv.x < x0) x0 = _spv.x; if (_spv.x > x1) x1 = _spv.x;
      if (_spv.y < y0) y0 = _spv.y; if (_spv.y > y1) y1 = _spv.y;
    }
  }
  const half = Math.max(Math.max(x1 - x0, y1 - y0) / 2 * (1 + 2 * THUMB_MARGIN), 1e-4);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  cam.left = cx - half; cam.right = cx + half;
  cam.top = cy + half;  cam.bottom = cy - half;
  cam.updateProjectionMatrix();
}
function thumbSpinStop(){
  if (spinRAF){ cancelAnimationFrame(spinRAF); spinRAF = 0; }
  if (spinMesh && spinScene){ spinScene.remove(spinMesh); spinMesh = null; }
  if (spinR && spinR.domElement.parentNode) spinR.domElement.parentNode.removeChild(spinR.domElement);
  spinItem = null; spinPrev = 0;
}
function thumbSpinStart(item, host){
  if (!item || !item.mesh || !host) return;
  ensureSpinR();
  thumbSpinStop();                       // один общий канвас: снять предыдущий
  spinItem = item; spinAngle = PORTRAIT_YAW0;
  // ⚠️ НЕ mesh.clone() (JSON userData с телом Rapier — throw): обёртка на общих
  // geometry+material, как в itemThumb
  spinMesh = new THREE.Mesh(item.mesh.geometry, item.mesh.material);
  spinMesh.scale.copy(item.mesh.scale);
  spinMesh.position.set(0, THUMB_Y, 0);  // matcap гасит диффуз по мировой высоте — портрет высоко
  spinMesh.rotation.set(PORTRAIT_TILT_X, spinAngle, 0);
  spinScene.add(spinMesh);
  frameCylinder(spinCam, spinMesh);
  host.appendChild(spinR.domElement);
  spinRAF = requestAnimationFrame(spinTick);
}
// TAP = HOVER (спека владельца 2026-07-24 «один компонент, ховер = тап»): на
// мобиле нет mouseleave, поэтому ИНТЕРФЕЙС вешает НА ТАП карточки ОДИН
// обработчик thumbSpinToggle — тап по неактивной карточке заводит спин (сам
// снимет спин с прежней — канвас общий), повторный тап по ТОЙ ЖЕ карточке
// останавливает. Ховер (десктоп) как был: start на enter / stop на leave.
// Возвращает true, если после вызова карточка крутится. Размер при этом РОВНО
// как у статики (единый frameCylinder, см. #3) — тап не «дёргает» масштаб.
function thumbSpinToggle(item, host){
  if (spinItem === item && spinR && spinR.domElement.parentNode === host){ thumbSpinStop(); return false; }
  thumbSpinStart(item, host); return true;
}
function spinTick(now){
  if (!spinItem || !spinMesh){ spinRAF = 0; return; }
  // страховка: ячейку сняли из DOM без thumbSpinStop (ротация списка) —
  // не крутить впустую в отцепленный канвас
  if (!spinR.domElement.parentNode){ thumbSpinStop(); return; }
  const dt = spinPrev ? Math.min(0.05, (now - spinPrev) / 1000) : 0; spinPrev = now;
  spinAngle += dt * SPIN_SPEED;
  spinMesh.rotation.set(PORTRAIT_TILT_X, spinAngle, 0);
  // вуаль/matcap-затемнение и прозрачность OFF на кадр (портрет не сереет) —
  // материал ОБЩИЙ с боевым, восстанавливаем сразу (как itemThumb)
  const mat = spinMesh.material;
  const col = mat.color, saved = (spinItem.baseColor && col) ? col.clone() : null;
  if (saved) col.copy(spinItem.baseColor);
  const sh = mat.userData && mat.userData.shader;
  const savedVeil = sh ? sh.uniforms.uVeil.value : 0; if (sh) sh.uniforms.uVeil.value = 0;
  const savedOp = mat.opacity; mat.opacity = 1;
  spinR.render(spinScene, spinCam);
  mat.opacity = savedOp;
  if (sh) sh.uniforms.uVeil.value = savedVeil;
  if (saved) col.copy(saved);
  spinRAF = requestAnimationFrame(spinTick);
}

// --- всплывашка: очередь, показываем по одной ~2.2 с ---
const tierQueue = [];
let tierBusy = false;
function fmtMult(m){ return '×' + (+m).toFixed(2).replace(/\.?0+$/, ''); }
// ⚠️ ОДИН ТОСТ НА ДВА СОБЫТИЯ (слово владельца 2026-08-05 «своди в один»):
// сбор прокачанного вида и ПОВЫШЕНИЕ ступени показывает один и тот же тост
// под глазами; раньше ступень уходила в отдельную пилюлю у нижнего края и
// читалась как дубль. Пилюля #tierToast и очередь nextTierToast остаются
// мёртвым кодом до уборки — снимать вместе с разметкой и CSS.
function showTierUp(ev){
  try { showMultToast(ev && (ev.key || ev.name), (ev && ev.mult) || 1, true); } catch(e){}
}
function showTierUpLegacy(ev){ tierQueue.push(ev); if (!tierBusy) nextTierToast(); }
function nextTierToast(){
  const ev = tierQueue.shift();
  if (!ev){ tierBusy = false; return; }
  tierBusy = true;
  const t = $('tierToast');
  // СОСЕДСТВО С ВИТРИНОЙ (десктоп, витрина теперь СЛЕВА, v1-test-74):
  // при видимой витрине всплывашка ПОДНИМАЕТСЯ над её верхом — читается
  // как «выпрыгнула из карточки». Глушить тост не стали: он прямая спека
  // владельца («красивый эффект»), а витрина показывает ап лишь тихой
  // полоской. При скрытой витрине (узко/мобайл) — прежний угол.
  const vit = $('vitrine');
  // панель считается видимой, только если она НЕ погашена своим состоянием
  // vempty (всё собрано). (camnear отменён 2026-07-27 — правило ширины.)
  const vitShown = vit && getComputedStyle(vit).display !== 'none' &&
    !vit.classList.contains('vempty');
  if (vitShown){
    t.style.bottom = (innerHeight - vit.getBoundingClientRect().top + 12) + 'px';
    t.style.left = '8px'; // в ЛИНИЮ с витриной и кнопкой подсказки (обе на 8)
  } else { t.style.bottom = ''; t.style.left = ''; }
  const url = itemThumb(ev.item);
  $('ttImg').style.display = url ? '' : 'none';
  if (url) $('ttImg').src = url;
  // имени предмета в макете 769:56 нет — показываем портрет и множитель
  $('ttMult').textContent = fmtMult(ev.mult || 1);
  // ⚠️ ПОДПИСЬ ПОД ПОРТРЕТОМ (пункт плана 1.3, тексты — ПОВЕСТВОВАНИЕ; место —
  // зона ИНТЕРФЕЙСА, помечено в сдаче). Голое «×1.25» на телефоне не значит
  // НИЧЕГО: витрина там не строится вовсе, и связать множитель с конкретным
  // видом негде. Имя + счётчик спасённых делают число величиной.
  // Узел создаётся ИЗ JS и не трогает разметку макета 769:56 (имени он не
  // предусматривал) — правка адресная и снимается одной строкой. Пилюля уже
  // flex-column, поэтому строка встаёт под .ttRow без правки раскладки.
  // ⛔ СТРОКА «Name · N saved» В ПИЛЮЛЕ СНЯТА (слово владельца 2026-08-05:
  // «в тосте появился какой-то лишний белый текст, убери его»). Тексты
  // Повествования (accToastLine/accSavedText) ЖИВЫ в 77-save и переиспользуются
  // разовым правилом ниже и экраном победы — снята только эта строка.
  const ttLineOld = $('ttLine');
  if (ttLineOld) ttLineOld.remove();
  // ПРАВИЛО — РОВНО ОДИН РАЗ, в момент ПЕРВОЙ ступени: раньше игрок не понял бы,
  // о чём речь, позже — уже привык к цифре без смысла. Отдельным тостом, а не
  // строкой в пилюле: за 1.9 с две мысли не читаются.
  if (typeof accRuleDue === 'function' && accRuleDue()){
    accRuleMark();
    setTimeout(()=>{ toast(accRuleText()); }, 700);
  }
  t.classList.remove('bye'); void t.offsetWidth;
  t.classList.add('show');
  Sound.play('surprise', 0.6); vibrate([15, 30, 15]);
  setTimeout(()=>{ t.classList.remove('show'); t.classList.add('bye'); }, 1900);
  setTimeout(()=>{ t.classList.remove('bye'); nextTierToast(); }, 2250);
}

// --- музей: открывается ИЗ ПАУЗЫ (paused держится), закрытие — обратно ---
const ACC_TIERS_DEMO = [100, 300, 700, 1500, 3100]; // пороги контракта (×2+100)
function demoAccSnapshot(){
  // демо: живые типы уровня с правдоподобными накоплениями — только чтобы
  // владелец видел каркас; НЕ настоящие данные (бейдж DEMO в шапке)
  const byKey = {};
  for (const it of items) if (it.alive && !it.surprise) (byKey[it.key] = byKey[it.key] || { it, n: 0 }).n++;
  return Object.keys(byKey).slice(0, 12).map((k, i) => {
    const count = 40 + i * 97 % 900 + byKey[k].n * 7;
    let tier = 0; while (tier < ACC_TIERS_DEMO.length && count >= ACC_TIERS_DEMO[tier]) tier++;
    return { name: k, count, tier, mult: 1 + 0.25 * tier,
      next: ACC_TIERS_DEMO[tier] || null, _item: byKey[k].it };
  });
}
function renderMuseum(rows, demo){
  $('museumDemo').style.display = demo ? '' : 'none';
  const list = $('museumList');
  list.innerHTML = '';
  for (const r of rows){
    const row = document.createElement('div');
    row.className = 'mrow';
    const th = document.createElement('div');
    th.className = 'mthumb';
    // ⚠️ фолбэк по КЛЮЧУ типа, не по имени: r.name — человеческий ярлык
    // («Watermelon»), а item.key — 'T{индекс}'; сравнение с name не могло
    // совпасть никогда, и строки без _item молча теряли портрет
    const url = itemThumb(r._item || (items && items.find(i =>
      i.alive && i.type && String(i.type.name) === String(r.key))));
    if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
    else th.textContent = String(r.name || '?').slice(0, 1).toUpperCase();
    const mid = document.createElement('div');
    mid.style.flex = '1'; mid.style.minWidth = '0';
    const frac = r.next ? Math.min(1, r.count / r.next) : 1;
    mid.innerHTML = '<div class="mname"></div><div class="mprog"><i style="width:' +
      (frac * 100).toFixed(0) + '%"></i></div><div class="mcnt">' + r.count +
      (r.next ? ' / ' + r.next : ' · max') + '</div>';
    mid.firstChild.textContent = String(r.name).replace(/[-_]/g, ' ');
    const right = document.createElement('div');
    right.className = 'mmult';
    right.innerHTML = '<b>' + fmtMult(r.mult) + '</b><span>tier ' + r.tier + '</span>';
    row.appendChild(th); row.appendChild(mid); row.appendChild(right);
    list.appendChild(row);
  }
}
function openMuseum(){
  hide('pauseOverlay');
  show('museumOverlay');
  const real = typeof accSnapshot === 'function';
  renderMuseum(real ? accSnapshot() : demoAccSnapshot(), !real);
}
function closeMuseum(){ hide('museumOverlay'); show('pauseOverlay'); }
// стыковка с метой: хук подключаем, как только он появится в сборке
if (typeof onAccTierUp === 'function') onAccTierUp(showTierUp);

// ===== ГЛАВНЫЙ ЭКРАН / ПАУЗА (макет Figma 770:1271) =====
// ОДИН экран, две роли: «Play Game» до партии, «Resume» в паузе. Живые
// данные: коллекция — accSnapshot(), звёзды — totalStars(), Sound/Difficult —
// CFG. ⚠️ ЭКОНОМИЧЕСКИЕ РАЗВИЛКИ на плейсхолдерах (владельцу в отчёт,
// междузонные запросы МЕТЕ/ИНТЕГРАЦИИ): звёзды-как-валюта + Boost (МЕТА),
// Subscribe $1.99 (ИНТЕГРАЦИЯ), Music-слайдер и аватар (ассетов/фичи нет).
let msSelKey = null;
function fmtStars(n){
  n = n | 0;
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
// КОШЕЛЁК В ШАПКЕ МЕНЮ: ТОЧНОЕ ЧИСЛО, ЕСЛИ ВЛЕЗАЕТ ПО ГОРИЗОНТАЛИ (спека
// владельца 2026-07-28: «1466, а не 1.5K, если помещается»). Пишем точное,
// меряем ряд — если он переполнился ИЛИ Get More съехал на другую строку
// (у .ms-collhead на десктопе flex-wrap), откатываемся в сокращение.
// ⚠️ Порог не в знаках: ширина зависит от раскладки (мобильная пилюля против
// десктопной шапки) и от длины имени — меряем ФАКТ, а не угадываем.
// Кнопки Boost сокращение сохраняют (спека про кошелёк) — они зовут fmtStars.
function setWalletNumber(el, n){
  if (!el) return;
  const exact = String(n | 0), short = fmtStars(n);
  el.textContent = exact;
  if (exact === short) return;                       // сокращать нечего
  const row = el.closest('.ms-head'); if (!row) return;
  let fits = row.scrollWidth <= row.clientWidth + 1; // ряд не переполнен
  if (fits){
    const gm = $('msGetMore');
    if (gm){                                          // Get More на той же строке?
      const a = el.getBoundingClientRect(), b = gm.getBoundingClientRect();
      if (Math.abs(a.top - b.top) > Math.max(a.height, b.height) * 0.6) fits = false;
    }
    // ⚠️ И ИМЯ НЕ ДОЛЖНО ОБРЕЗАТЬСЯ: у .ms-uname overflow:hidden, поэтому
    // флекс «впихивал» длинное число за счёт имени («Guest» → «Gu…»), а ряд
    // при этом НЕ переполнялся и проверка выше молчала. Обрезка имени = число
    // по горизонтали не поместилось.
    const un = row.querySelector('.ms-uname');
    if (fits && un && un.offsetParent !== null && un.scrollWidth > un.clientWidth + 1) fits = false;
  }
  if (!fits) el.textContent = short;
}
// сколько типов открыто прогрессией: 9 на ур.1, +1 за уровень, потолок пула
// (типы открываются ПО ПОРЯДКУ массива TYPES — как в genLevel)
function unlockedTypeCount(){
  const lvl = (typeof levelNum === 'number' ? levelNum : 1);
  return Math.min(TYPES.length, LEVEL_TYPES_MIN + Math.max(0, lvl - 1));
}
// BOOST-ЦЕЛЕБРАЦИЯ (спека владельца): на успешную покупку карточка празднует —
// полоска зеленеет и доливается к текущей доле, под портретом бьют частицы
// радости (лайм+белые). Зовётся ПОСЛЕ refreshMainScreen (карточка пересобрана)
// — ищем свежую по ключу. ⚠️ полоска считается по ЗАРАБОТАННЫМ ступеням, Boost
// копит отдельно → доливка ЦЕЛЕБРАЦИОННАЯ (к текущей доле), экономику не трогаем.
function spawnJoyParticles(host){
  if (!host) return;
  const N = 12, col = ['#c0ff47', '#ffffff'];
  for (let i = 0; i < N; i++){
    const s = document.createElement('span');
    s.className = 'joyp';
    const ang = (i / N) * Math.PI * 2;
    const dist = 24 + (i % 3) * 9;
    s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * dist - 12).toFixed(1) + 'px'); // лёгкий подъём вверх
    s.style.background = col[i % 2];
    host.appendChild(s);
    setTimeout(()=> s.remove(), 760);
  }
}
function boostCelebrate(key){
  const grid = $('msGrid'); if (!grid) return;
  const card = [...grid.children].find(c => c.dataset && c.dataset.key === key);
  if (!card) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.classList.add('boosted'); // полоска -> зелёная (+ transition из .boosted)
  const bar = card.querySelector('.msc-prog i');
  if (bar && !reduce){
    const target = bar.style.width || '0%';
    bar.style.transition = 'none'; bar.style.width = '0%'; // старт с нуля БЕЗ анимации
    void bar.offsetWidth;
    bar.style.transition = '';                              // вернуть CSS-переход .55с
    bar.style.width = target;                               // анимируется 0 -> доля
    setTimeout(()=>{ if (bar.isConnected) bar.style.transition = ''; }, 620);
  }
  if (!reduce) spawnJoyParticles(card.querySelector('.msc-imgwrap'));
  // класс-целебрацию снимаем позже (следующий refresh и так пересоберёт карточку)
  setTimeout(()=>{ if (card.isConnected) card.classList.remove('boosted'); }, 950);
}
// #4 ТАП-СПИН (тач): один тап-обработчик через хук ГРАФИКИ thumbSpinToggle
// (контракт диспетчера v121): тап по неактивной заводит спин (общий канвас сам
// снимет спин с прежней), повторный тап по ТОЙ ЖЕ — стоп, размер НЕ дёргается.
// Хук управляет ТОЛЬКО спином; статический <img> (канвас alpha:true накрывает
// его, но просвечивает) прячем/возвращаем МЫ — как ховер. msTapSpinCard держит,
// у какой карточки img спрятан, чтобы вернуть его при переключении на другую.
let msTapSpinCard = null;
function msTapSpinRestore(){ if (msTapSpinCard){ const im = msTapSpinCard.querySelector('img.msc-img'); if (im) im.style.visibility = 'visible'; msTapSpinCard.classList.remove('spinning'); msTapSpinCard = null; } }
function msCardTapSpin(card){
  if (!card || card.classList.contains('lock')) return;
  const wrap = card.querySelector('.msc-imgwrap'); if (!wrap) return;
  const key = card.dataset.key;
  const live = (typeof items !== 'undefined' && items) ? items.find(it => it.alive && it.type && String(it.type.name) === String(key)) : null;
  msTapSpinRestore();                                   // вернуть img прошлой тап-крутящейся
  let spinning = false;
  try { spinning = thumbSpinToggle(live || thumbItemForKey(key), wrap); } catch(e){ spinning = false; }
  const im = wrap.querySelector('img.msc-img');
  if (im) im.style.visibility = spinning ? 'hidden' : 'visible';
  card.classList.toggle('spinning', spinning); // тач-аналог :hover для бейджа (40%)
  msTapSpinCard = spinning ? card : null;
}
// ДОБОР ПОРТРЕТОВ: атлас пачки декодируется асинхронно, и карточки типов из
// ещё не прогретой пачки открываются с буквой. Ждём декода и подменяем букву
// картинкой НА МЕСТЕ. Предел 16×200 мс = 3.2 с — если пачка так и не пришла
// (битый атлас), добор молча прекращается и буква остаётся честным фолбэком.
let msThumbWait = null;
const MS_THUMB_TRIES = 16, MS_THUMB_MS = 200;
function msThumbFill(pending, left){
  msThumbWait = setTimeout(() => {
    msThumbWait = null;
    const rest = [];
    for (const p of pending){
      if (!p.wrap.isConnected) continue;   // сетку пересобрали — эта карточка мертва
      const url = p.live ? itemThumb(p.live) : itemThumb(thumbItemForKey(p.key, p.locked));
      if (!url){ rest.push(p); continue; }
      const im = document.createElement('img');
      im.className = 'msc-img'; im.src = url;
      const ph = p.wrap.querySelector('.msc-img.letter');
      if (ph) p.wrap.replaceChild(im, ph); else p.wrap.insertBefore(im, p.wrap.firstChild);
    }
    if (rest.length && left > 1) msThumbFill(rest, left - 1);
  }, MS_THUMB_MS);
}
function buildMainCollection(){
  const grid = $('msGrid');
  if (!grid) return;
  if (msTapSpinCard){ thumbSpinStop(); msTapSpinCard = null; } // сброс тап-спина при пересборке
  grid.innerHTML = '';
  if (msThumbWait){ clearTimeout(msThumbWait); msThumbWait = null; } // старый добор к мёртвым карточкам
  const pending = []; // карточки без портрета: атлас пачки ещё декодируется
  const rows = (typeof accSnapshot === 'function') ? accSnapshot() : [];
  const open = unlockedTypeCount();
  // спин портрета — ТОЛЬКО на устройствах с настоящим hover (десктоп): на
  // тач-экранах mouseenter стреляет по тапу и крутил бы карточку без причины
  // (спека ГРАФИКИ «мобайл: hover не вешать, статический портрет и так есть»)
  const canHover = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  rows.forEach((r, i) => {
    const locked = i >= open;
    const card = document.createElement('div');
    card.className = 'msc' + (locked ? ' lock' : '') + (r.key === msSelKey ? ' sel' : '');
    card.dataset.key = r.key;
    // портрет: живой предмет типа -> офскрин-рендер; иначе буква (как музей).
    // ⚠️ портрет есть только у типов, живых в ТЕКУЩЕЙ партии (мешей вне
    // уровня нет) — вне партии/у неоткрытых будет буква. Портрет для ВСЕХ
    // типов = хелпер «собрать меш по типу» (междузонный запрос ГРАФИКЕ/МЕТЕ).
    const wrap = document.createElement('div');
    wrap.className = 'msc-imgwrap';
    const live = r._item || (typeof items !== 'undefined' && items &&
      items.find(it => it.alive && it.type && String(it.type.name) === String(r.key)));
    // портрет: живой предмет типа -> его снимок; иначе строим меш по ключу
    // (thumbItemForKey, ГРАФИКА). ЗАКРЫТЫЕ (locked) — ГХОСТ (2-й арг true:
    // полупрозрачный+бесцветный силуэт, «покедекс»; спека владельца «не
    // открытые модели прозрачные, матовые, бесцветные» + «заполни музей
    // моделями», ОТМЕНЯЕТ прежнюю букву). ОТКРЫТЫЕ — цветной портрет.
    const url = live ? itemThumb(live) : itemThumb(thumbItemForKey(r.key, locked));
    if (url){
      const im = document.createElement('img');
      im.className = 'msc-img'; im.src = url; wrap.appendChild(im);
    } else {
      const ph = document.createElement('div');
      ph.className = 'msc-img letter';
      ph.textContent = String(r.name || '?').slice(0, 1).toUpperCase();
      wrap.appendChild(ph);
      // ⚠️ ПОРТРЕТА ПОКА НЕТ — берём на ДОБОР, а не оставляем букву навсегда.
      // itemThumb отказывается снимать, пока атлас пачки не декодирован
      // (см. страж там же); сам этот вызов декод и запустил. Буква остаётся
      // видимой доли секунды и подменяется картинкой НА МЕСТЕ — без
      // пересборки сетки, чтобы не рвать скролл и тап-спин.
      pending.push({ wrap, key: r.key, locked, live });
    }
    if (!locked){
      const badge = document.createElement('div');
      badge.className = 'msc-badge';
      badge.textContent = fmtMult(r.mult || 1);
      wrap.appendChild(badge);
    }
    card.appendChild(wrap);
    const name = document.createElement('div');
    name.className = 'msc-name'; name.textContent = r.name;
    card.appendChild(name);
    if (locked){
      const lvl = document.createElement('div');
      lvl.className = 'msc-lvl';
      lvl.textContent = 'Level ' + Math.max(1, i - LEVEL_TYPES_MIN + 2);
      card.appendChild(lvl);
      // КНОПКА «Open» СКРЫТА (спека владельца 2026-07-28: «не имеет сейчас
      // никакого смысла для игроков»). Механика покупки типа (purchaseUnlock,
      // act:'open') ЖИВА и не тронута — вернуть = раскомментировать три строки.
      // ОТЛОЖЕНО (просьба владельца записать): когда-нибудь вернуть открытие
      // предметов ЗА ЗВЁЗДЫ — см. блок ИНТЕРФЕЙС в WORKSTREAMS.
    } else {
      const cnt = document.createElement('div');
      cnt.className = 'msc-cnt';
      cnt.textContent = r.next ? (r.count + '/' + r.next) : (r.count + ' · max');
      card.appendChild(cnt);
      const prog = document.createElement('div');
      prog.className = 'msc-prog';
      const frac = r.next ? Math.min(1, r.count / r.next) : 1;
      prog.innerHTML = '<i style="width:' + (frac * 100).toFixed(0) + '%"></i>';
      card.appendChild(prog);
      // BOOST: цена следующей ступени из снапшота. price === null — КАП
      // (показываем «Max», а не пустую цену); !affordable — гасим кнопку,
      // чтобы не обещать покупку, которую buyBoost отвергнет.
      const boost = document.createElement('button');
      boost.className = 'msc-boost'; boost.dataset.act = 'boost';
      if (r.price == null){ boost.textContent = 'Max'; boost.disabled = true; }
      else {
        boost.textContent = 'Boost ' + fmtStars(r.price); // ★ убрана (спека владельца #5)
        if (!r.affordable) boost.classList.add('poor');
      }
      card.appendChild(boost);
    }
    // HOVER-СПИН (десктоп): канвас ГРАФИКИ самомонтируется в .msc-imgwrap
    // (absolute inset:0). ⚠️ канвас ПРОЗРАЧНЫЙ (alpha) — под вращающимся
    // силуэтом просвечивал статический <img> кадра покоя (жалоба владельца
    // «картинка модели остаётся за ней»). ПРЯЧЕМ img на время спина
    // (visibility, чтобы rect ячейки не схлопнулся — канвас на нём и стоит),
    // возвращаем на mouseleave. Спин стартует с угла статики (SPIN_YAW0/TILT
    // == rotation портрета) — подмена бесшовна. Только у ОТКРЫТЫХ.
    if (canHover && !locked){
      card.addEventListener('mouseenter', () => {
        const im = wrap.querySelector('img.msc-img'); if (im) im.style.visibility = 'hidden';
        thumbSpinStart(r._item || thumbItemForKey(r.key), wrap);
      });
      card.addEventListener('mouseleave', () => {
        thumbSpinStop();
        const im = wrap.querySelector('img.msc-img'); if (im) im.style.visibility = 'visible';
      });
    }
    grid.appendChild(card);
  });
  if (pending.length) msThumbFill(pending, MS_THUMB_TRIES);
}
// отражение текущих настроек в контролах экрана (значения из CFG)
// --fill (в %) двигает зелёную заливку у WebKit-ползунка (см. shell.html);
// Firefox рисует её сам через ::-moz-range-progress, но лишним не будет
function msFill(el){ if (el) el.style.setProperty('--fill', el.value + '%'); }
// ===== ГРОМКОСТЬ ЗВУКА 0..1, хранится в mixer_sound =====
// ⚠️⚠️ ЖАЛОБА ВЛАДЕЛЬЦА 2026-07-30: «ползунок Sound не сохраняет состояние
// после выхода из паузы». ДИАГНОЗ: состоянием звука был БУЛЕВ `CFG.sound`, а
// в блоке настроек стоит ПОЛЗУНОК 0..100. `refreshMainSettings` рисовал его
// как `CFG.sound ? 100 : 0` — любое промежуточное значение (40) при повторном
// открытии меню превращалось в 100. Плюс персиста не было ВОВСЕ: у музыки есть
// `mixer_music`, у звука не было ничего, поэтому и тишина не выживала
// перезагрузку (замер: выставил 0 → reload → снова 100 и звук включён).
// ⚠️ ЛЕЧЕНИЕ СИММЕТРИЧНО МУЗЫКЕ: своя громкость 0..1 + localStorage + единая
// точка применения. `CFG.sound` ОСТАЁТСЯ (на него смотрят `Sound.play` и
// `vibrate`) и вычисляется как `soundVol > 0` — старый смысл «вкл/выкл» цел,
// а чекбокс `#soundToggle` в держателе состояний паузы синхронизируется тут же.
// ⚠️ ВНЕШНИЙ МЬЮТ (`Sound.setMuted` из 78-ads на время ролика) НЕ ТРОГАЕМ —
// у него свой флаг и он СИЛЬНЕЕ ползунка, как и у музыки (musicSuspend).
// ⚠️ ДВЕ ПЕРЕМЕННЫЕ, А НЕ ОДНА: `soundVolPrev` — ПОСЛЕДНЯЯ НЕНУЛЕВАЯ громкость.
// Без неё тумблер «выкл → вкл» возвращал 100 вместо выбранных игроком 40:
// выключение обнуляет `soundVol`, и «последнее ненулевое» брать уже негде
// (поймано собственным замером ПОСЛЕ первой версии этой правки).
let soundVol = 1, soundVolPrev = 1;
try { const _sv = localStorage.getItem('mixer_sound');
  if (_sv !== null) soundVol = Math.max(0, Math.min(1, (parseInt(_sv, 10) || 0) / 100)); } catch(e){}
if (soundVol > 0) soundVolPrev = soundVol;
function applySoundVol(v01){
  soundVol = Math.max(0, Math.min(1, v01));
  if (soundVol > 0) soundVolPrev = soundVol;
  try { localStorage.setItem('mixer_sound', String(Math.round(soundVol * 100))); } catch(e){}
  CFG.sound = soundVol > 0;
  const cb = $('soundToggle'); if (cb) cb.checked = CFG.sound;   // держатель состояний паузы
  // ⚠️ ПОЛЗУНОК ТОЖЕ ЗДЕСЬ: иначе тумблер паузы менял громкость, а ползунок
  // продолжал показывать старое число — два элемента об одном состоянии
  // расходились (замер: тумблер выкл → ползунок всё ещё 35 при тишине).
  const snd = $('msSound'); if (snd){ snd.value = Math.round(soundVol * 100); msFill(snd); }
  try { Sound.setVolume(soundVol); } catch(e){}                  // мастер-гейн WebAudio
}
applySoundVol(soundVol);   // боевое восстановление на старте (как CFG.hard из mixer_hard)
// ===== ФОНОВАЯ МУЗЫКА (спека владельца 2026-07-24): регулятор + трек =====
// Потоковый HTML5 <audio id="bgm"> (трек ~4.2 МБ грузится ЛЕНИВО, не в старте;
// WebAudio-движок SFX (Sound) НЕ трогаем — музыка отдельный тракт). Ползунок
// Music = громкость 0..1, хранится в mixer_music. Автоплей разблокирует ПЕРВЫЙ
// жест страницы (90-input) — политика браузера: audio.play() только по жесту.
let musicVol = 0.7;
try { const _mv = localStorage.getItem('mixer_music');
  if (_mv !== null) musicVol = Math.max(0, Math.min(1, (parseInt(_mv, 10) || 0) / 100)); } catch(e){}
// ⚠️⚠️ ГРОМКОСТЬ ПРИМЕНЯЕТСЯ К ЭЛЕМЕНТУ СРАЗУ, НЕ ПРИ ПЕРВОМ ЖЕСТЕ (жалоба
// владельца 2026-07-31: «при загрузке музыка выше, падает до настроек после
// анимации ведра»). МЕХАНИКА, доказана пробой: volume ставил только жестовый
// unlockBgm, а на портале трек заводила РАЗМОРОЗКА (musicSuspend(false) после
// рекламы/паузы площадки) — play() шёл на дефолтной 1.0, и до первого жеста
// игрока музыка орала мимо настроек. Инвариант: volume выставлен ДО любого
// возможного play, кто бы его ни позвал.
{ const _bgm0 = $('bgm'); if (_bgm0) _bgm0.volume = musicVol; }
function applyMusic(v01){
  musicVol = Math.max(0, Math.min(1, v01));
  try { localStorage.setItem('mixer_music', String(Math.round(musicVol * 100))); } catch(e){}
  const bgm = $('bgm'); if (!bgm) return;
  bgm.volume = musicVol;
  // ⚠️ Внешняя приглушка (реклама/пауза площадки) СИЛЬНЕЕ ползунка: иначе
  // игрок, двинувший громкость во время ролика, завёл бы трек поверх рекламы.
  if (musicVol > 0 && !musicExtMuted){ if (bgm.paused) bgm.play().catch(()=>{}); } // тянут вверх — заводим
  else if (!bgm.paused) bgm.pause();                             // в ноль — глушим
}
// ВНЕШНЯЯ ПРИГЛУШКА МУЗЫКИ (правка ИНТЕГРАЦИИ 2026-07-29 по авторизации
// диспетчера; аналог Sound.setMuted для WebAudio-тракта). Зовётся из
// applyMute (78-ads) на время рекламного ролика и платформенной паузы.
// ⚠️ СВОЙ ФЛАГ, `musicVol` НЕ ТРОГАЕМ: громкость — выбор игрока, лежит в
// localStorage; затирать его временной приглушкой нельзя. Поэтому храним
// причину отдельно и на снятии восстанавливаем ровно то, что выбрал игрок
// (в т.ч. НЕ заводим трек, если ползунок стоит в нуле).
let musicExtMuted = false;
function musicSuspend(on){
  musicExtMuted = !!on;
  const bgm = $('bgm'); if (!bgm) return;
  if (musicExtMuted){ if (!bgm.paused) bgm.pause(); }
  else if (musicVol > 0 && bgm.paused){
    bgm.volume = musicVol; // инвариант: громкость ДО play (см. блок musicVol)
    bgm.play().catch(()=>{});
  }
}
function refreshMainSettings(){
  // ⚠️ ИЗ `soundVol`, А НЕ ИЗ `CFG.sound ? 100 : 0` — именно та строка теряла
  // промежуточное положение ползунка (жалоба владельца, см. applySoundVol).
  const snd = $('msSound'); if (snd){ snd.value = Math.round(soundVol * 100); msFill(snd); }
  const mus = $('msMusic'); if (mus){ mus.value = Math.round(musicVol * 100); msFill(mus); }
  const seg = $('msDiff');
  if (seg) for (const b of seg.querySelectorAll('button'))
    b.classList.toggle('on', (b.dataset.hard === '1') === !!CFG.hard);
}
function refreshMainScreen(){
  // ⚠️ ЕДИНОЕ ЧИСЛО ВЕЗДЕ — liveBalance(), ТОТ ЖЕ вызов, что у игрового чипа
  // ($('score') в updateHUD). Жалоба владельца 2026-07-27: «во время игры одно
  // число, а на пузе второе — игрок всегда и везде видит свой единый баланс».
  // Причина расхождения была: чип показывал liveBalance (забанкованное +
  // незабанкованный счёт текущего уровня ÷10), а меню — starBalance (только
  // забанкованное), т.е. открытие меню посреди уровня «съедало» заработанное
  // за партию. Теперь оба читают liveBalance.
  // ⚠️ НЕ totalStars: сумма рейтинга уровней живёт отдельно и не тратится —
  // показывать её как валюту было бы враньём.
  const st = $('msStars');
  const бал = typeof liveBalance === 'function' ? liveBalance()
              : (typeof starBalance === 'function' ? starBalance() : 0);
  setWalletNumber(st, бал);
  // ЗЕРКАЛО В ПЛАВАЮЩЕЙ ШАПКЕ — ТОТ ЖЕ ПИСАТЕЛЬ. Отдельный расчёт завёл бы
  // второй источник одного числа: они разъезжаются на первом же начислении.
  const st2 = $('msStars2');
  if (st2) setWalletNumber(st2, бал);
  // роль кнопки: нет живой партии — «Play Game» (старт), иначе «Resume»
  const btn = $('msPlayBtn');
  const роль = (!level || level.over) ? 'Play Game' : 'Resume';
  if (btn) btn.textContent = роль;
  // ПЛАВАЮЩАЯ КНОПКА (нода 815:1521) — ТОТ ЖЕ ПИСАТЕЛЬ РОЛИ. Заводить ей
  // собственный расчёт нельзя: два источника одной подписи разъезжаются на
  // первом же переходе (в ноде стоит «Resume», но без живой партии это «Play
  // Game», и кнопки не должны спорить между собой).
  const fl = $('msFloatResume');
  if (fl) fl.textContent = роль;
  refreshMainSettings();
  buildMainCollection();
}
// ⚠️ ВЛАДЕНИЕ ПАУЗОЙ (контракт 99-main, тот же паттерн, что у рекламы в
// 78-ads): pauseGame(silent) отдаёт true ТОЛЬКО если паузу поставил именно
// этот вызов. Резюмить ЧУЖУЮ паузу (рекламную или от visibilitychange)
// нельзя — игрок вернулся бы в живую игру, которую не возобновлял. Поэтому
// меню (а) ставит паузу ТИХО (silent — своя карточка вместо pauseOverlay),
// (б) над чужой паузой НЕ открывается вовсе, (в) снимает только свою.
let menuPaused = false;
// ЦЕННИКИ БАНДЛОВ ЖИВЫМИ (находка Интеграции 2026-08-03: на карточках были
// зашиты ДОЛЛАРЫ, а игрок платит в GAM — «неправда на экране»). Каталог
// асинхронный: до его прихода стоят зашитые лейблы-фолбэки, после — цена
// площадки (Ads.priceOf). Зовётся при каждом открытии магазина звёзд.
function refreshBundlePrices(){
  try {
    if (!(typeof Ads === 'object' && Ads.priceOf)) return;
    document.querySelectorAll('.st-buy[data-tier]').forEach(btn => {
      const price = Ads.priceOf('bundle' + btn.dataset.tier);
      if (price) btn.textContent = 'Upgrade ' + price;
    });
  } catch(e){}
}
// ПРОФИЛЬ ГОСТЯ: имя-животное + аватар чистым цветом из хеша имени
// (слово владельца 2026-08-04; 🫐-плейсхолдер уходит). HSL: тон из хеша,
// сочность фиксированная — любое имя даёт читаемый кружок.
function refreshGuestProfile(){
  try {
    const name = (typeof guestName === 'function') ? guestName() : 'Guest';
    const u = document.getElementById('msUser');
    if (u && u.textContent !== name) u.textContent = name;
    const av = document.querySelector('.ms-av');
    if (av && av.dataset.gn !== name){
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      av.dataset.gn = name;
      av.textContent = '';                        // 🫐-плейсхолдер уходит
      // АВАТАРЫ ВЛАДЕЛЬЦА (папка avatars/, слово 2026-08-05: «они должны быть
      // вписаны в текущий размер окружности, но быть все без фона, поэтому и
      // png»). Файл выбирается ДЕТЕРМИНИРОВАННО по имени: один гость — один
      // аватар навсегда, как и его имя. Цветной круг остаётся ПОДЛОЖКОЙ:
      // картинки прозрачные, и без него они висели бы в пустоте.
      // ⚠️ БЕЗ ПОДЛОЖКИ (слово владельца 2026-08-05: «под картинкой не должно
      // быть никакого фона»). Прежняя цветная заливка отменена — аватары
      // владельца сами несут форму и цвет, круг под ними давал второй ободок.
      av.style.background = 'transparent';
      // ⚠️ АВАТАР ИЗ КЛЮЧА ИГРОКА, а не из хеша имени (слово владельца
      // 2026-08-07 «лучше свести к одному»): личность одинакова на всех
      // устройствах, потому что ключ сходится мержем, а имя выводится из него.
      const idx = (typeof guestAvatar === 'function') ? guestAvatar() : ((h % AVATAR_COUNT) + 1);
      const file = 'avatars/Avatar' + String(idx).padStart(2, '0') + '.png';
      const img = document.createElement('img');
      img.src = file; img.alt = ''; img.decoding = 'async';
      // ⚠️ БЕЗ border-radius НА КАРТИНКЕ (жалоба владельца 2026-08-06 «рваные
      // пиксели по контуру»): аватар УЖЕ круглый и со сглаженной альфой
      // (замер исходника: 48 градаций, 199 полупрозрачных пикселей по краю).
      // Наша круглая обрезка резала ПОВЕРХ этого края — граница клипа
      // ступенчатая, и она видна как рваный контур. Ассеты владельца при
      // этом не трогаем: он прямо запретил их «оптимизировать».
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
      av.appendChild(img);
    }
  } catch(e){}
}
// ===== ЗВЁЗДЫ НА КАРТОЧКЕ PLAY (слово владельца 2026-08-10) =====
// «Добавь сюда звёзды в ночной теме, как на экране игры». Карточка УЖЕ носит
// градиент неба (`--sky-grad` в shell.html), поэтому ночью она и выглядит
// ночным небом — не хватало только звёзд.
// ⚠️⚠️ ЧИСЛА БЕРУТСЯ ИЗ ТЕХ ЖЕ КОНСТАНТ, ЧТО У ШЕЙДЕРА НЕБА (`STAR_*`,
// 00-config): распределение размера (`STAR_SIZE_MIN`/`STAR_SIZE_BIAS`), обе
// скорости и амплитуды моргания и пульса, доля пульсирующих. Копия чисел
// «на глаз» разошлась бы с небом при первой же правке палитры — ровно тот
// закон, на котором проект обжигался не раз.
// ⛔ ПОЧЕМУ КАНВАС, А НЕ НАБОР `radial-gradient`: у неба звёзды МОРГАЮТ, и
// каждая десятая ещё и пульсирует (спека владельца) — CSS-градиентами это не
// выражается, а статичная россыпь читается как текстура, а не как небо.
const MS_SKY_PER_KPX = 0.55;   // звёзд на 1000 px² карточки — плотность подобрана к небу
let msSkyRaf = 0, msSkyStars = null, msSkyW = 0, msSkyH = 0;
// хеш из индекса — детерминированный, как у ячеек неба: одна и та же карточка
// даёт одно и то же небо, а не мерцающую кашу при каждом открытии меню
function msSkyHash(i, k){ const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }
function msSkyBuild(w, h){
  const n = Math.max(24, Math.round(w * h / 1000 * MS_SKY_PER_KPX));
  const out = [];
  for (let i = 0; i < n; i++){
    const hs = msSkyHash(i, 3);
    out.push({
      x: msSkyHash(i, 1) * w, y: msSkyHash(i, 2) * h,
      // ⚠️ ТА ЖЕ ФОРМУЛА РАЗМЕРА, ЧТО В ШЕЙДЕРЕ: смещение выборки к мелким
      // (спека владельца «больше мелких звёзд, не меняя их количество»).
      r: (STAR_SIZE_MIN + (1 - STAR_SIZE_MIN) * Math.pow(hs, STAR_SIZE_BIAS)) * 1.6,
      ph: msSkyHash(i, 4) * Math.PI * 2,
      // ⚠️ ОТБОР ПУЛЬСИРУЮЩИХ — ОТДЕЛЬНЫМ хешем, как у неба: иначе пульс
      // коррелировал бы с размером и «одна из десяти» превратилась бы
      // в «самые крупные».
      pulse: msSkyHash(i, 5) < STAR_PULSE_FRAC, pph: msSkyHash(i, 6) * Math.PI * 2,
    });
  }
  return out;
}
function msSkyDraw(t){
  const c = $('msNightSky'); if (!c) return;
  const g = c.getContext('2d'); if (!g) return;
  g.clearRect(0, 0, msSkyW, msSkyH);
  for (let i = 0; i < msSkyStars.length; i++){
    const s = msSkyStars[i];
    let a = 1 - STAR_TW_AMP * 0.5 * (1 - Math.cos(t * STAR_TW_SPD + s.ph));
    if (s.pulse) a *= 1 - STAR_PULSE_AMP * 0.5 * (1 - Math.cos(t * STAR_PULSE_SPD + s.pph));
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}
// ⚠️ ГЕЙТ ДВОЙНОЙ: ночь И открытое меню. Днём слоя нет вовсе (у неба днём
// звёзд тоже нет), а при закрытом меню rAF не крутится — карточка живёт в
// поддереве, которое просто скрыто, и без явной остановки цикл жил бы ВЕСЬ
// геймплей (та же грабля, что уже ловили у тап-спина коллекции).
function msSkyStart(){
  const c = $('msNightSky'), host = c && c.parentNode; if (!c || !host) return;
  const ночь = (typeof isNightSky === 'function') ? isNightSky() : false;
  if (!ночь){ msSkyStop(); c.style.display = 'none'; return; }
  const r = host.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (w !== msSkyW || h !== msSkyH || !msSkyStars){
    msSkyW = w; msSkyH = h;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d'); if (g){ g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    msSkyStars = msSkyBuild(w, h);
  }
  c.style.display = 'block';
  if (msSkyRaf) return;
  const t0 = performance.now();
  const тик = () => {
    msSkyRaf = 0;
    if (!$('mainScreen') || !$('mainScreen').classList.contains('open')){ return; }
    msSkyDraw((performance.now() - t0) / 1000);
    msSkyRaf = requestAnimationFrame(тик);
  };
  msSkyRaf = requestAnimationFrame(тик);
}
function msSkyStop(){
  if (msSkyRaf){ cancelAnimationFrame(msSkyRaf); msSkyRaf = 0; }
  const c = $('msNightSky'); if (c) c.style.display = 'none';
}
function openMainScreen(){
  // телеметрия меню (дыра из ревью Интеграции: #mainScreen открывается
  // классом .open мимо show()/SCREEN_OF — крупнейший экран не трекался)
  try { Telemetry.screen.enter('menu'); } catch(e){}
  try { refreshGuestProfile(); } catch(e){}
  if (!menuPaused) menuPaused = pauseGame(true);
  if (!menuPaused && paused) return; // чужая пауза (реклама/вкладка) — не лезем
  refreshMainScreen();
  // ⚠️ ПОСЛЕ гварда чужой паузы: при отказе открыться ни канваса, ни цикла
  // заводиться не должно. Размер берём отложенно — у только что показанной
  // карточки rect ещё нулевой (та же природа, что у спина в коллекции).
  setTimeout(()=>{ try { msSkyStart(); } catch(e){} }, 0);
  // ⚠️ ПОСЛЕ ГВАРДА ЧУЖОЙ ПАУЗЫ: при отказе открыться сетевого захода быть не
  // должно. Сам вызов ничего не ждёт — числа приезжают асинхронно из кэша
  // `__lb`, а до их прихода блок стоит с прежними (или пустыми) значениями.
  try { lbEntryRefresh(); } catch(e){}
  const ms = $('mainScreen');
  // «Было ли открыто» снимается ДО add('open') — проверка после него всегда
  // ложна, и сброс превращался в мёртвый код (поймано стражем переоткрытия).
  const wasOpen = ms.classList.contains('open');
  ms.classList.add('open');
  // КРОМКА ЭКРАНА В ТОНЕ МЕНЮ (жалоба владельца «в меню паузы сверху
  // прокидывается фон игры»). Сам `#mainScreen` стоит inset:0 и закрывает
  // весь вьюпорт — «фон игры» протекал ПОЛОСОЙ ХРОМА, которую Safari красит
  // по background-color html/body (там цвет неба от tintChrome). Правило —
  // `html.menuopen` в shell.html; ставится ПОСЛЕ гварда чужой паузы, иначе
  // при отказе открыться кромка перекрасилась бы под невидимое меню.
  document.documentElement.classList.add('menuopen');
  // ⚠️⚠️ У КРОМКИ ДВА КАНАЛА, И ВТОРОЙ ПРАВИЛО `html.menuopen` НЕ ТРОГАЕТ.
  // Оно перекрашивает фон html/body, а мета `theme-color` оставалась цветом
  // НЕБА: замер 2026-08-10 (ночь, меню открыто) — фон стал светлым
  // rgb(217,244,255), мета осталась `#031d83`. То есть системе сообщался цвет,
  // которого на экране нет, — и это единственная найденная замером причина,
  // по которой полосы в меню могут остаться тёмными. Возврат — в closeMainScreen.
  chromeMeta(menuChrome());
  // СБРОС ПРОКРУТКИ — ТОЛЬКО ПРИ ФАКТИЧЕСКОМ ОТКРЫТИИ. Контейнер помнит
  // scrollTop между открытиями, и без сброса меню открывалось бы сразу с
  // плавающей шапкой и кнопкой поверх видимой карточки Play.
  // ⚠️ НО НЕ БЕЗУСЛОВНО: `openMainScreen` зовётся ещё и по visibilitychange
  // (90-input) — при уходе вкладки в фон НА УЖЕ ОТКРЫТОМ меню. Безусловный
  // сброс выбрасывал игрока из середины коллекции в самый верх (замер: 3000 →
  // 0). Классы снимаем ЯВНО: scrollTop=0 события scroll не рождает.
  if (!wasOpen){
    ms.scrollTop = 0;
    ms.classList.remove('playoff');
    const sk = $('msSticky'); if (sk) sk.classList.remove('on');
  }
  menuEyesStart(); // #8b: оживить глаза меню (курсор/оглядка)
}
// ЕДИНАЯ ТОЧКА ЗАПИСИ ВТОРОГО КАНАЛА КРОМКИ (мета `theme-color`). Отдельная
// функция, а не строка в двух местах: копия признака рядом с рабочей величиной
// расходится с ней при первой же правке (закон канона, четыре случая за неделю).
// ⚠️ В МЕНЮ ОБА КАНАЛА НЕСУТ ФОН МЕНЮ (слово владельца 2026-08-10, отмена
// нейтрали). Меню прокручивается, но его СТРАНИЧНЫЙ фон постоянен — карточки
// плавают ПОВЕРХ него, поэтому попадание в тон здесь возможно.
// ⚠️ Читается из `--ms-bg`, а не литералом: фон меню объявлен один раз, и
// копия рядом с ним разошлась бы при первой же правке палитры меню.
// ⚠️ Прошлое состояние темы — для перекраски кромки ТОЛЬКО на переходе.
// ⚠️ ОБЪЯВЛЕНИЕ ЧУТЬ НЕ ПОГИБЛО: оно стояло вплотную к снятому блоку
// нейтрали, и правка «вырезать блок» унесла его заодно — сьют поймал
// ошибкой страницы. Режешь диапазон — проверь, что на его краях.
let hudWasNight = null;
function menuChrome(){
  return getComputedStyle(document.documentElement).getPropertyValue('--ms-bg').trim() || '#d9f4ff';
}
function chromeMeta(col){
  try {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m && col) m.setAttribute('content', col);
  } catch(e){}
}
function closeMainScreen(){
  // #4: тап-спин крутит offscreen-WebGL rAF; без mouseleave он бы жил ВЕСЬ
  // геймплей (карточка уходит в display:none-поддерево, guard parentNode в
  // spinTick не срабатывает — оно ещё в DOM). Гасим явно + возвращаем img.
  if (msTapSpinCard){ thumbSpinStop(); msTapSpinRestore(); }
  try { msSkyStop(); } catch(e){}
  $('mainScreen').classList.remove('open');
  document.documentElement.classList.remove('menuopen'); // кромку — обратно небу
  // ...и ВТОРОЙ КАНАЛ тоже: tintChrome возвращает мете и фону цвет неба.
  if (typeof tintChrome === 'function') tintChrome();
  // Плавающая шапка — ОТДЕЛЬНЫЙ fixed-узел ВНЕ #mainScreen (z-index 31):
  // закрытие экрана её не прячет. Без явного гашения она переживала закрытие
  // и висела над игрой (скрин владельца 2026-07-31: прокрутил меню, нажал
  // плавающую Resume — плашка «My collection» проникла на игровой экран).
  const sk = $('msSticky'); if (sk) sk.classList.remove('on');
  if (menuPaused){ menuPaused = false; resumeGame(); }
}
// #8b ЖИВЫЕ ГЛАЗА МЕНЮ (спека владельца): десктоп — зрачки СЛЕДЯТ за курсором;
// тач — зациклённая мягкая «оглядка» (курсора нет). Зрачок не выходит за белок.
// Активно ТОЛЬКО пока меню открыто (перф). НЕ путать с игровым #face.
let _menuEyesInit = false, _menuEyesRun = false;
function menuEyesStart(){
  const eyes = document.querySelector('.ms-eyes');
  const pL = $('msPupL'), pR = $('msPupR');
  if (!eyes || !pL || !pR) return;
  const CX_L = 60, CX_R = 180, CY = 60, MAXOFF = 29; // зрачок r29 в белке r60 → ход 29
  const menuOpen = () => { const m = $('mainScreen'); return !!(m && m.classList.contains('open')); };
  const center = () => { pL.setAttribute('cx', CX_L); pR.setAttribute('cx', CX_R); pL.setAttribute('cy', CY); pR.setAttribute('cy', CY); };
  const clamp = (dx, dy) => { const d = Math.hypot(dx, dy); return d > MAXOFF ? [dx / d * MAXOFF, dy / d * MAXOFF] : [dx, dy]; };
  const offset = (ox, oy) => { pL.setAttribute('cx', (CX_L + ox).toFixed(1)); pR.setAttribute('cx', (CX_R + ox).toFixed(1)); pL.setAttribute('cy', (CY + oy).toFixed(1)); pR.setAttribute('cy', (CY + oy).toFixed(1)); };
  const look = (tx, ty) => { // десктоп: оба зрачка сходятся к курсору
    const [lx, ly] = clamp(tx - CX_L, ty - CY); pL.setAttribute('cx', (CX_L + lx).toFixed(1)); pL.setAttribute('cy', (CY + ly).toFixed(1));
    const [rx, ry] = clamp(tx - CX_R, ty - CY); pR.setAttribute('cx', (CX_R + rx).toFixed(1)); pR.setAttribute('cy', (CY + ry).toFixed(1));
  };
  const canHover = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!_menuEyesInit){
    _menuEyesInit = true;
    if (canHover) addEventListener('pointermove', (e) => {
      if (!menuOpen()) return;
      const r = eyes.getBoundingClientRect(); if (!r.width) return;
      look((e.clientX - r.left) / r.width * 240, (e.clientY - r.top) / r.height * 120);
    }, { passive: true });
  }
  if (canHover || reduce) return;            // десктоп двигает на pointermove; reduce — статичные зрачки
  if (_menuEyesRun) return; _menuEyesRun = true;   // тач: зациклённая мягкая «оглядка»
  requestAnimationFrame(function loop(ts){
    if (!menuOpen()){ _menuEyesRun = false; center(); return; }
    const t = ts / 1000, [ox, oy] = clamp(Math.cos(t * 0.8) * 26, Math.sin(t * 1.25) * 17);
    offset(ox, oy);
    requestAnimationFrame(loop);
  });
}
// живое обновление шапки/цен при трате или начислении звёзд (подписка МЕТЫ)
if (typeof onStarsChange === 'function') onStarsChange(()=>{
  if ($('mainScreen').classList.contains('open')) refreshMainScreen();
});
// debug/preview: открыть экран из консоли
window.showMainScreen = openMainScreen;
window.hideMainScreen = closeMainScreen;


// ===== ВИТРИНА УРОВНЯ — макет Figma 768:1061 =====
// ТОП-5 ПО ПРОГРЕССУ (спека владельца 2026-07-24): видимых строк РОВНО 5, но
// ранжируются ВСЕ типы уровня по vitFrac — скрытый тип, набравший больше,
// ВЫТЕСНЯЕТ верхнего (входит в пятёрку, выбывший уходит за кадр). Отменяет
// «весь замес» (2026-07-23) и авторотацию «собрал→ушёл» (v77): механизм — РАНГ.
// Ручной скролл невозможен (pointer-events:none). Реалтайм: пересчёт vitFrac
// ВСЕХ типов раз в 150 мс (число, дёшево — не DOM).
// ⚠️ РОВНО 5 СЛОТОВ ВСЕГДА (LEVEL_TYPES_MIN=9 ≥ 5) → высота #vGrid постоянна →
// rect #vitrine бит-в-бит: его читает якорь тоста
// (85-hud). Смена типа в слоте — уезд/въезд ВНУТРИ слота (.out/.in на ДЕТЯХ
// раскладки нет — на самой ячейке, но число ячеек не меняется), НЕ add/remove.
// VIT_MAX 5 → 3 (спека владельца 2026-07-28 «давай сюда всё же три строки,
// и они так же меняются при наборе»): кап строк, ротация НЕ трогается —
// собранный тип уезжает, на его место встаёт следующий из ranked-очереди.
// Побочно закрыт открытый вопрос «на высоких уровнях панель уходит выше вьюпорта».
const VIT_TICK_MS = 150, VIT_MAX = 3;
let vitLevelRef = null, vitAt = 0, vitSlots = null, vitAll = null;
function vitrineOn(){
  // ПРАВИЛО 2/3 (спека владельца 2026-07-27): панель на десктопе И планшетах,
  // прячется только когда заняла бы >1/3 ширины (порог 813 = 3×271px полосы,
  // тот же @media в shell.html). pointer:fine снят — планшеты видят панель.
  return window.matchMedia && matchMedia('(min-width:813px)').matches;
}
function vitFillCell(cell, entry){
  cell.dataset.key = entry.k;
  const th = cell.querySelector('.vthumb');
  th.innerHTML = '';
  const url = itemThumb(entry.it);
  if (url){ const im = document.createElement('img'); im.src = url; th.appendChild(im); }
  else th.textContent = entry.k.slice(0, 1).toUpperCase();
  cell.querySelector('.vname').textContent =
    (typeof accLabel === 'function' ? accLabel(entry.k) : entry.k);
  cell._acc = { last: -1 };
  vitUpdateCell(cell);
}
// прогресс полоски типа (0..1) к следующей ступени; на капе = 1. Это КЛЮЧ
// сортировки витрины (спека владельца «по убыванию, первая — с большим
// прогрессом; строка меняется, если полоска обгонит первую»).
function vitFrac(k){
  const n = accCount(k), next = accNext(k), tier = accTier(k);
  const prev = tier > 0 ? 100 * (Math.pow(2, tier) - 1) : 0;
  return next ? Math.max(0, Math.min(1, (n - prev) / (next - prev))) : 1;
}
function vitUpdateCell(cell){
  const k = cell.dataset.key, n = accCount(k);
  if (n === cell._acc.last) return;
  // рост счётчика = я СОВМЕСТИЛ этот тип (first-set с last=-1 не считаем)
  const grew = cell._acc.last >= 0 && n > cell._acc.last;
  cell._acc.last = n;
  cell.querySelector('.vbar i').style.width = (vitFrac(k) * 100).toFixed(1) + '%';
  cell.querySelector('.vmult').textContent = fmtMult(accMult(k));
  if (grew) vitPulse(cell); // ненавязчивая реакция на моё совмещение
}
// короткий подскок портрета + вспышка полоски; рестарт через reflow, чтобы
// частые совмещения подряд перезапускали анимацию, а не глотали её.
// ⚠️ СНИМАЕМ ПРЕДЫДУЩИЙ ТАЙМЕР: без этого при двух матчах одного типа за
// <460 мс (цепь/эндшпиль-∞) старый таймер срывал .hit посреди новой
// анимации — скачок scale (найдено адверс-ревью 2026-07-23)
function vitPulse(cell){
  if (cell._hitT) clearTimeout(cell._hitT);
  cell.classList.remove('hit'); void cell.offsetWidth;
  cell.classList.add('hit');
  cell._hitT = setTimeout(()=>{ cell.classList.remove('hit'); cell._hitT = 0; }, 460);
}
// vitAll — ВСЕ типы замеса уровня (не расходуется: ранжируем среди всех, но
// показываем только топ-5). Строим РОВНО 5 слотов, заполняем топ-5 по прогрессу.
function buildVitrine(){
  vitLevelRef = level;
  const grid = $('vGrid'); grid.innerHTML = '';
  $('vitrine').classList.remove('vempty');
  const seen = new Set(); vitAll = [];
  for (const it of items){
    if (it.surprise || it.bomb || it.rock || !it.type) continue;
    const k = String(it.type.name);
    if (!seen.has(k)){ seen.add(k); vitAll.push({ k, it }); }
  }
  vitSlots = [];
  const ranked = vitRankedAll();
  const count = Math.min(VIT_MAX, ranked.length); // РОВНО 3 (типов всегда ≥9)
  // шаг каскада капим, чтобы разворот не тянулся (~0.45 с)
  const step = Math.min(0.07, 0.45 / Math.max(1, count));
  for (let i = 0; i < count; i++){
    const cell = document.createElement('div');
    cell.className = 'vcell';
    cell.innerHTML = '<div class="vthumb"></div><div class="vbody">' +
      '<div class="vname"></div><div class="vbar"><i></i></div></div>' +
      '<div class="vmult"></div>';
    vitFillCell(cell, ranked[i]);
    // КАСКАД РАЗВОРОТА: строки проявляются снизу по очереди (i·step); .rin
    // снимаем по завершении, чтобы остаточный animation-delay не задержал
    // будущие .hit/.in на этой же ячейке
    cell.style.animationDelay = (i * step) + 's';
    cell.classList.add('rin');
    setTimeout(()=>{ cell.classList.remove('rin'); cell.style.animationDelay = ''; }, 520 + i * step * 1000);
    grid.appendChild(cell);
    vitSlots.push(cell);
  }
}
// РАНЖИРОВАНИЕ ВСЕХ типов уровня по прогрессу убыванием (тай-брейк — накопление)
function vitRankedAll(){
  return vitAll.slice().sort((a, b) =>
    vitFrac(b.k) - vitFrac(a.k) || accCount(b.k) - accCount(a.k));
}
// СОГЛАСОВАНИЕ ТОП-5: держим РОВНО 5 слотов = топ-5 по рангу. Слот, чей тип
// перестал занимать свою позицию топ-5 (вытеснён скрытым обгонщиком / пересорт),
// уходит ВВЕРХ и гаснет (.out, 0.28 с), затем перезаполняется актуальным типом
// позиции и проявляется СНИЗУ (.in) — ТОЛЬКО вертикаль + фейд, без бокового
// движения (спека владельца 2026-07-24). Слот, где тип не изменился, — обычный
// vitUpdateCell (полоска + .hit-пульс на совмещении). Число ячеек НЕ меняется
// → высота #vGrid и rect #vitrine постоянны. reduce-motion: мгновенная замена.
function vitReconcile(){
  if (!vitSlots || !vitAll) return;
  const top5 = vitRankedAll().slice(0, VIT_MAX); // имя историческое: теперь топ-3
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let i = 0; i < vitSlots.length; i++){
    const cell = vitSlots[i], want = top5[i];
    if (!want) continue;
    if (cell.dataset.key === want.k){ vitUpdateCell(cell); continue; }
    if (cell.classList.contains('out')) continue; // уже анимируется — не трогаем
    if (reduce){ vitFillCell(cell, want); continue; }
    cell.classList.add('out');
    setTimeout(()=>{
      // топ мог сдвинуться за 0.28 с — берём АКТУАЛЬНЫЙ тип для этой позиции
      const w = vitRankedAll()[i];
      cell.classList.remove('out');
      if (w){ vitFillCell(cell, w); void cell.offsetWidth; cell.classList.add('in');
        setTimeout(()=>cell.classList.remove('in'), 360); }
    }, 280);
  }
}
function tickVitrine(now){
  if (!vitrineOn()) return;
  // строим ПОСЛЕ интро: на первых кадрах палитровые атласы моделей ещё
  // декодируются (грабля 36-models) — портреты выходили чёрными и
  // навсегда оседали в кэше превью
  if (level && level !== vitLevelRef && !intro) buildVitrine();
  if (!vitSlots || now - vitAt < VIT_TICK_MS) return;
  vitAt = now;
  // vitReconcile сам зовёт vitUpdateCell для неизменившихся слотов (полоски/пульс)
  if (!intro && level && !level.over) vitReconcile();
}

// ═══ ЭКРАН НОВОЙ ВЕЩИ (макеты владельца 2026-08-10: 846:4814 моб. / 846:4763
// деск.). Слово владельца: «идёт сразу бесшовно за экраном окончания уровня».
//
// ⚠️⚠️ ЧТО СЧИТАЕТСЯ «НОВОЙ ВЕЩЬЮ» — ВЫВЕДЕНО ИЗ ПРОГРЕССИИ, А НЕ ПРИДУМАНО.
// Типы открываются ПО ПОРЯДКУ массива: 9 штук на первом уровне и РОВНО ОДИН
// новый за каждый следующий (`LEVEL_TYPES_MIN + (уровень − 1)`, единое правило
// genLevel и `isTypeUnlocked`). Значит у экрана есть естественный и
// детерминированный повод: показать ту единственную вещь, которая откроется на
// уровне, к которому игрок только что перешёл.
// ⛔ ПОЭТОМУ ЖЕ ЕГО НЕТ ПЕРЕД ПЕРВЫМ УРОВНЕМ (там открывается сразу девятка —
// «новая вещь» одна не выделяется) И КОГДА ПУЛ ИСЧЕРПАН (с ур.112 новых типов
// больше не появляется). Обе ветки обязаны отдавать управление дальше, иначе
// кнопка «Next» молча перестанет начинать уровень — та же грабля, что была у
// анонса сюжета.
function newObjDue(){
  const lv = (typeof levelNum === 'number') ? levelNum : 0;   // уровень, который вот-вот начнётся
  if (lv < 2) return null;
  const idx = LEVEL_TYPES_MIN + lv - 2;
  if (idx < 0 || idx >= TYPES.length) return null;
  return TYPES[idx].name;
}
let newObjDone = null;
// ⚠️ Ключ показанной вещи держим отдельно — по нему `newObjInfo` отдаёт стражу
// ОЖИДАЕМЫЙ тон. Иначе тест сверял бы вычисленный градиент с литералом, а тот
// разъедется с палитрой при первой же правке цвета типа (закон «копия рядом с
// рабочей величиной всегда расходится»).
let newObjLastKey = null;
// Показ. `done` зовётся по нажатию кнопки — ровно один раз.
// ⚠️ МОДЕЛЬ ЖИВАЯ: общий спин-канвас `thumbSpinStart`, тот же, что крутит
// карточки коллекции. Картинку-подложку сюда НЕ ставить (слово владельца
// «моделька, которая крутится» — про чистый 3D без подложки).
function newObjShow(key, done){
  const box = $('newObj'), host = $('newObjModel'), nm = $('newObjName');
  if (!box || !host || !key){ if (done) done(); return; }
  const item = (typeof thumbItemForKey === 'function') ? thumbItemForKey(key) : null;
  // ⚠️ НЕТ МОДЕЛИ — НЕТ ЭКРАНА. Пустая сцена с надписью «new object» и дыркой
  // посередине хуже, чем отсутствие экрана: игрок решит, что вещь не выдали.
  if (!item){ if (done) done(); return; }
  newObjDone = done || null;
  newObjLastKey = key;
  if (nm) nm.textContent = (typeof accLabel === 'function') ? accLabel(key) : key;
  // ⚠️⚠️ ЦВЕТ СВЕЧЕНИЯ — ОСНОВНОЙ ЦВЕТ ВЕЩИ (слово владельца 2026-08-10). Берём
  // `type.color`: это тот же авторский тон, которым сыплется труха ЭТОГО типа
  // (`fxColor` — он же, только переведённый в linear), то есть цвет у игрока
  // уже связан с предметом, а не назначен экрану заново.
  // ⛔ НЕ `baseColor` и не пиксели портрета: у всех 120 моделей цвет несёт
  // АТЛАС, а `material.color` белый — свечение вышло бы белым у всего пула
  // (та же грабля, из-за которой вуаль недоступных пришлось увести в шейдер).
  const тон = item.type && item.type.color;
  box.style.setProperty('--no-glow-rgb', (typeof тон === 'number')
    ? ((тон >> 16) & 255) + ',' + ((тон >> 8) & 255) + ',' + (тон & 255)
    : '203,255,104');
  host.innerHTML = '';
  box.setAttribute('aria-hidden', 'false');
  box.classList.add('on');
  // ⚠️ СПИН ЗАВОДИМ ПОСЛЕ ПОКАЗА: `frameCylinder` внутри старта считает кадр по
  // размерам узла, а у скрытого блока они нулевые (та же природа, что у
  // «страж мерил высоту на закрытом меню» — скрытый узел не имеет геометрии).
  try { thumbSpinStart(item, host); } catch (e) {}
  Telemetry.ev('newobj', { k: key });
}
function newObjHide(){
  const box = $('newObj');
  if (box){ box.classList.remove('on'); box.setAttribute('aria-hidden', 'true'); }
  try { thumbSpinStop(); } catch (e) {}
  const d = newObjDone; newObjDone = null;
  if (d) d();
}
// Точка входа для цепочки победы: сам решает, есть ли повод, и ВСЕГДА отдаёт
// управление дальше.
function newObjOnWin(done){
  const key = newObjDue();
  if (!key){ if (done) done(); return; }
  newObjShow(key, done);
}
