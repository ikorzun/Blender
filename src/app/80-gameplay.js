// ===== 80-gameplay: матчи, тап, миксер, встряска, победа/поражение =====

// ЕДИНАЯ ТОЧКА ОЧКОВЫХ ШТРАФОВ (баланс-таблица владельца 2026-07-22).
// Уровень 1 — штрафов нет вовсе (возврат false: поп «−N» не рисуем, чтобы
// не врать); уровни 2..SCORE_CLAMP_LEVELS — кламп счёта снизу нулём
// (штраф показывается, но в минус не уводит); дальше — полный минус.
// Механика миксера (съедание предметов) от уровня НЕ зависит — только очки.
function scorePenalty(n){
  if (levelNum <= SCORE_NO_PENALTY_LEVELS) return false;
  // ⚠️ БУСТЕР МНОЖИТ И НАКАЗАНИЕ (решение владельца 2026-07-28): под x5 промах
  // −50, помол −100. Симметрия с наградой: плоские −10/−20 на фоне «+700»
  // превращали карательную сторону в шум ровно в оплаченном окне.
  // Кламп нулём применяется ПОСЛЕ умножения — новичок (ур.<=SCORE_CLAMP_LEVELS)
  // под бустером не улетает в минус быстрее, чем без него.
  stats.score -= Math.round(n * scoreBoostMult());
  if (levelNum <= SCORE_CLAMP_LEVELS && stats.score < 0) stats.score = 0;
  return true;
}

// Группа из N>=2 одинаковых по ТИПУ: все расщепляются на пиксели;
// очки 10*N*(N-1) × комбо × МНОЖИТЕЛЬ НАКОПЛЕНИЯ типа (спека владельца
// 2026-07-22: накопленные совмещения растят цену типа, accMult в 77-save)
function doMatch(list){
  if (level) level.stuck = 0; // успешный ход сжигает фору «Оглядеться»
  // КОМБО: группа 3+ сразу, или вторая склейка за COMBO_CHAIN_MS, или матч
  // при уже горящем бусте — радиус до COMBO_RADIUS и ОЧКИ ×COMBO_SCORE_MULT
  // на COMBO_MS (окно продлевается каждым матчем — лихорадка живёт, пока
  // игрок быстр; первый матч цепочки идёт по обычной цене)
  const nowMs = performance.now();
  const comboHot = list.length >= 3 || nowMs - lastMatchMs < COMBO_CHAIN_MS || comboUntil > nowMs;
  // (лесенка темпа — seriesMult объявлен ниже doMatch, функции хойстятся)
  {
    const wasHot = comboUntil > nowMs;
    lastMatchMs = nowMs;
    if (comboHot){
      // ПАКЕТ ТЕМПА (спека владельца 2026-07-31): НОВОЕ зажигание начинает
      // счёт серии с 1 — раньше comboCount переживал протухшее окно и копился
      // сквозь паузы (турбо собиралось за несколько вялых серий, а лесенка
      // ×3 стартовала бы мгновенно). Теперь серия = непрерывный темп.
      comboCount = wasHot ? comboCount + 1 : 1;
      // ЧАША-РАЗЛЁТ, боевая единица «набранные серии» (5-7 за уровень —
      // слово владельца): каждые BOWL_SERIES_LEN НЕПРЕРЫВНЫХ матчей цепи =
      // 1 зачёт. Снимаем в момент роста comboCount — вход в турбо ниже по
      // файлу серию «тратит» (comboCount = 0), полученные зачёты не трогая.
      // Зачёт ЗВУЧНЫЙ (без silent): редкое событие (5-7 раз за уровень),
      // кранч+вибро — «удар по чаше»; тонкую индикацию возьмут глаза.
      if (BOWL_CRACK_ON === 'series' && comboCount > 0 && comboCount % BOWL_SERIES_LEN === 0) bowlCrackAdd();
      // исторический режим стенда: 'peak' — рекорд цепи (отменён владельцем)
      else if (BOWL_CRACK_ON === 'peak' && comboCount > ((level && level.bowlCracks) || 0)) bowlCrackAdd(true);
      // окно УТЕКАЕТ и сжимается с длиной серии (было плоское COMBO_MS)
      comboUntil = nowMs + seriesWindowMs(comboCount);
      comboLevel = Math.min(COMBO_STEPS, comboLevel + 1); // +ступень радиуса за матч серии
      if (!wasHot){
        const mid0 = new THREE.Vector3();
        list.forEach(it => mid0.add(it.p));
        mid0.multiplyScalar(1/list.length).y += 0.9;
        // спека владельца: без эмодзи; «Combo ×2» тает — и СРАЗУ с того же
        // места тем же эффектом вылетает «Radius Up»
        scorePop('Combo ×' + COMBO_SCORE_MULT, mid0, '#ff9d2e', true);
        // ЧАША-РАЗЛЁТ: режим 'combo' — трещина на КАЖДОМ зажигании серии
        if (BOWL_CRACK_ON === 'combo') bowlCrackAdd();
        const mid1 = mid0.clone();
        setTimeout(()=>{ scorePop('Radius Up', mid1, '#ff9d2e', true); }, 800);
        Sound.play('combo');
        vibrate([20, 40, 30]); // двойной пульс — отличим от одиночных 15/40 мс
      }
      // лесенка темпа: пересечение порога ×3 — короткий поп тем же стилем
      // (это НЕ шкала — разовый момент, как «Combo ×2»; постоянный показ
      // темпа несут ГЛАЗА, зона Интерфейса)
      if (comboCount === SERIES_X3_AT){
        const mid3 = new THREE.Vector3();
        list.forEach(it => mid3.add(it.p));
        mid3.multiplyScalar(1/list.length).y += 0.9;
        scorePop('×' + SERIES_MULT_X3 + '!', mid3, '#ff9d2e', true);
      }
      // серия дожата до цепной реакции. ВТОРОЕ турбо, собранное ВНУТРИ
      // активного, — «СЕРИЯ ТУРБО» (спека владельца 2026-07-21): окно
      // перезапускается, chainSeries растёт (интерфейс вешает на >=2
      // глаза eyes-5). Раньше гейт !chainUntil делал это невозможным —
      // вопрос ревью «comboCount копится, а зажечь следующую нельзя»
      // закрыт этим решением владельца.
      if (comboCount >= chainComboAt() && !level.over){ // порог входа в турбо растёт с уровнем
        const again = chainUntil > nowMs; // собрал турбо, не выходя из турбо
        chainSeries = again ? chainSeries + 1 : 1;
        chainUntil = nowMs + CHAIN_MS;
        chainStartMisses = stats.misses;
        if (!again) chainNextDrop = nowMs + 600; // у активной цепи досыпка уже тикает
        comboCount = 0; // серия «потрачена» на запуск — следующая копится заново
        // ВЫПАДЕНИЕ «ЗАРЯДА ТИПА» (спека владельца 2026-07-31, 00-config):
        // 1/уровень (level.chargeGiven) и только в пустой слот. Тип — случайный
        // из ЖИВЫХ с >= CHARGE_MIN_COPIES копий: ниже порога заряд взрывал бы
        // 1-2 предмета и разочаровывал (замер: медиана копий 14 рано / 6 ур.25).
        if (!level.chargeGiven && !chargeName){
          const cnt = {};
          for (const it of items)
            if (it.alive && !it.surprise && !it.bomb && !it.frozen && it.type)
              cnt[it.type.name] = (cnt[it.type.name] || 0) + 1;
          const pool = Object.keys(cnt).filter(k => cnt[k] >= CHARGE_MIN_COPIES);
          if (pool.length){
            level.chargeGiven = true;
            chargeName = pool[Math.floor(Math.random() * pool.length)];
            chargeUntil = performance.now() + CHARGE_TTL_MS; // ≤7 c, дальше растворяется
            try { updateHUD(); } catch(e){}
          }
        }
        const mid1 = new THREE.Vector3();
        list.forEach(it => mid1.add(it.p));
        mid1.multiplyScalar(1/list.length).y += 1.6;
        scorePop(again ? ('Power chain ×' + chainSeries + '!') : 'Power chain!', mid1, '#ff5a3c', true);
        // ЧАША-РАЗЛЁТ: режим 'chain' — трещина на входе в турбо (исходный
        // дизайн; серия турбо again — тоже буст). В режиме 'combo' здесь
        // НЕ добавляем — иначе двойной счёт за одну серию.
        if (BOWL_CRACK_ON === 'chain') bowlCrackAdd();
        // ⚠️ ПОДБРОС КУЧИ НА ВХОДЕ В ТУРБО (спека владельца 2026-07-28
        // «подкидывать все вещи, словно это шейк на старте») — заменил
        // молнии как маркер входа. performShake() НЕ списывает зарядов
        // (списание живёт у вызывающих: useFreeShake и др.), поэтому это
        // чистый эффект, а не бесплатная встряска-ресурс.
        if (TURBO_SHAKE) performShake();
        Sound.play('chain');
        vibrate([30, 50, 30, 50, 60]);
        updateMatchRadius();
      }
    }
  }
  // молнии цепной реакции: разряд от тапнутого к каждому предмету группы
  if (chainUntil > performance.now() && list.length > 1){
    for (let i = 1; i < Math.min(list.length, 9); i++) boltFX(list[0].p, list[i].p);
  }
  // ⚠️ ЗАМЕР ХВОСТА doMatch (передан Графикой: попы и сейв они сняли, 0.34 мс
  // из 4.1). Снос тел — их главный подозреваемый: удаление коллайдера
  // перестраивает широкую фазу, а прокси у нас 599.
  const _td0 = performance.now();
  list.forEach(it => { it.animating = true; it.animStartMs = nowMs; destroyItemBody(it); }); // тела сразу из мира; метка — для спасателя зависших удалений (99-main)
  tapDestroyMs += performance.now() - _td0;
  wakePhysics('gameplay:L7'); // соседи начинают оседать
  stats.matches++;
  stats.lastAction = performance.now();
  const n = list.length;
  const mid = new THREE.Vector3();
  list.forEach(it => mid.add(it.p)); mid.multiplyScalar(1/n);
  // НАКОПЛЕНИЕ: инкремент счётчика типа НА N предметов группы ДО подсчёта
  // очков — матч, пересёкший порог ступени, уже идёт по новому множителю
  // (ап ступени и жирные очки приходят одним моментом); событие всплывашки
  // (onAccTierUp) кидает accAdd в момент пересечения (спека владельца).
  const typeName = list[0].type.name;
  const _ta0 = performance.now();
  accAdd(typeName, n, list[0]);
  frozenCredit(typeName, n);                 // зачёт пар в глыбы этого типа
  tapAccMs += performance.now() - _ta0;      // накопление типа + запись сейва
  // ⚠️ Купленный бустер — ПОСЛЕДНИЙ множитель стека (комбо ×2 × накопление до
  // ×3.25 × бустер до ×5). ⚠️ ШТРАФЫ ОН ТОЖЕ МНОЖИТ (решение владельца
  // 2026-07-28, единая точка scorePenalty выше) — прежняя оговорка «наказание
  // не трогает» ОТМЕНЕНА: плоские −10/−20 на фоне «+700» делали карательную
  // сторону шумом ровно в оплаченном окне.
  // ЛЕСЕНКА ТЕМПА вместо плоского ×2 (спека владельца 2026-07-31): ×2 с
  // зажигания, ×3 с SERIES_X3_AT-го матча серии, ×4 в турбо. Единая точка —
  // seriesMult; comboCount к этой строке уже инкрементирован (матч,
  // пересёкший порог, идёт по новому множителю — как у ступеней накопления).
  // 🔥 БОНУС ОГНЯ (механика «горячего предмета», слово владельца 2026-08-01):
  // собрал группу ГОРЯЩЕГО типа, пока горит, — очки группы ×FIRE_BONUS_MULT.
  // Сверка по ТИПУ через burningName (стык Графики); сбор ГАСИТ огонь —
  // бонус одноразовый, следующая вспышка идёт своим расписанием
  // (tickFireSpawn отсчитывает от момента вспышки, не от гашения).
  const fireHot = typeName === burningName();
  if (fireHot) extinguishAll();
  // Пара из ФИНАЛЬНОЙ ДОКИДКИ (метка refill, 40-items): только базовая
  // цена — серийные и огненный множители не работают (обещание владельцу);
  // прокачка типа и купленный бустер остаются — они не серийные.
  const hasRefill = list.some(i => i.refill);
  const gained = Math.round(MATCH_SCORE * n * (n-1) * ((comboHot && !hasRefill) ? seriesMult(nowMs) : 1) * accMult(typeName) * scoreBoostMult() * ((fireHot && !hasRefill) ? FIRE_BONUS_MULT : 1));
  // тост множителя под глазами (нода 829:1242): только у прокачанных типов
  // ⚠️ ТОЛЬКО ПРИ РОСТЕ МНОЖИТЕЛЯ В ЭТОЙ ПАРТИИ (слово владельца 2026-08-05:
  // «тост под глазами показывается, если только множитель вещи увеличен во
  // время игры»). Раньше он всплывал на КАЖДОМ сборе прокачанного вида — то
  // есть на давно купленной прокачке тоже, и превращался в шум. Событие
  // роста приходит из accAdd (повышение ступени) и из покупки бустера —
  // оба идут через showTierUp -> showMultToast(..., true).
  // Здесь оставлен только СЛУЧАЙ РОСТА В БОЮ: множитель вида стал больше,
  // чем был на старте уровня.
  try {
    const am = accMult(typeName);
    const base = (level && level.multAtStart && level.multAtStart[typeName]) || 1;
    if (am > base + 1e-6) showMultToast(typeName, am);
  } catch(e){}
  const scoreBefore = stats.score;
  stats.score += gained;
  const shownGain = scoreShownDelta(scoreBefore, stats.score); // деноминир. прирост чипа (#10)
  const _tf0 = performance.now();
  popFX(mid);
  // «ПУНКТ 5» (спека владельца 2026-07-21): разнообразие эффектов ПРАВИЛОМ.
  // Пара/тройка — труха как раньше; группа >= BURST_MIN_N ЛОПАЕТСЯ эффектом
  // своей пачки (burstFX) + физическая волна вздрагивает соседей от
  // тапнутого (list[0]); в комбо/цепи поверх остаются молнии — как были.
  // ⚙️ СХЛОПЫВАНИЕ (выбор владельца 2026-08-01): группа СЛЕТАЕТСЯ в точку тапа и
  // лопается ОДНИМ событием оттуда. Раньше каждый предмет уменьшался на месте и
  // выдавал своё облачко — эффект читался как «замена предмету», а не как удар.
  // ⚠️ ПРАВИЛО ПАЧКИ (BURST_MIN_N) СОХРАНЕНО как было: группа >= 4 лопается
  // эффектом своей пачки, пара/тройка — трухой. Изменилось только МЕСТО (точка
  // тапа вместо N позиций) и КОЛИЧЕСТВО (одно событие вместо N).
  const burst = n >= BURST_MIN_N;
  const boomAt = list[0].p.clone();   // точка тапа: list[0] — тапнутый предмет
  const boomGhost = { p: boomAt, r: list[0].r * 1.25, type: list[0].type,
                      // geo — для ФОРМЫ кольца удара: она берётся из габаритов
                      // самого предмета (ringFamFor в 70-fx), а не из хеша имени
                      geo: list[0].geo,
                      fxColor: list[0].fxColor, baseColor: list[0].baseColor };
  collapseFX(list, boomAt);
  if (burst){ const _tw0 = performance.now(); blastWave(boomAt, BURST_WAVE_R, BURST_WAVE_V);
    tapWaveMs += performance.now() - _tw0; }
  // цифра — деноминированный прирост чипа (#10: «понятно и в процессе»);
  // множитель ×(n−1) остаётся как ярлык (не очки)
  // ⚠️⚠️ ОБВОДКА ЦИФРЫ — ВСЕГДА ИЗ ПАЛИТРЫ, БЕЗ ИСКЛЮЧЕНИЙ (слово владельца
  // 2026-08-17-г: «обводка у очков до сих пор оранжевая, а нужна разноцветная
  // с контрастом к белому»).
  // ⛔ ЗДЕСЬ СТОЯЛО `comboHot ? '#ff9d2e' : …`, и это была МОЯ НЕДОДЕЛКА, а не
  // «до сих пор»: я оставил оранжевый как «сигнал состояния», не посчитав, ЧТО
  // игрок почти всё время играет ВНУТРИ комбо (оно зажигается группой от трёх
  // или вторым матчем за 1.5 с). То есть исключение съедало правило: цветными
  // выходили только редкие одиночные матчи, а в бою цвет был один.
  // ⚠️ СИГНАЛ КОМБО НЕ ПОТЕРЯН: его несут ОТДЕЛЬНЫЕ подписи — «Combo ×2»,
  // «Radius Up», «Power chain!» — они остаются оранжевыми выше по функции.
  scorePop('+' + shownGain, mid, popOutlineColor(), false);
  if (n > 2) scorePop('×' + (n-1), mid.clone().add(new THREE.Vector3(0, 1.2, 0)), '#f5a623', true);
  if (fireHot) scorePop('Fire ×' + FIRE_BONUS_MULT + '!', mid.clone().add(new THREE.Vector3(0, 1.8, 0)), '#ff5a3c', true);
  tapFxMs += performance.now() - _tf0;       // popFX + схлопывание + волна + два попа очков
  // питч «буля» растёт с длиной серии (пакет темпа) — звуковая лесенка
  const _ts0 = performance.now();
  // ⚠️ МАТЕРИАЛ БЕРЁТСЯ ПО ИМЕНИ ТИПА (`typeName` выше — он же решает матч),
  // а не по пачке `tex`: пачка это атлас картинок, и в одной пачке `food`
  // лежат и сочные фрукты, и выпечка, и мороженое — звучать одинаково они не
  // должны. Разбор — docs/MATERIAL-SOUND-MAP.md.
  // ⚠️ РАЗМЕР И ПАНОРАМА — ТОЛЬКО ДЛЯ ЗАПИСАННЫХ ГОЛОСОВ МАТЕРИАЛА (слово
  // владельца 2026-08-10 «сделай web audio разнообразным только для 3 новых
  // звуков»). Процедурный «буль» их игнорирует — он ниже по ветке в 75-audio.
  // ⚠️ ПАНОРАМА СЧИТАЕТСЯ ЭКРАННОЙ ПРОЕКЦИЕЙ, а не мировым X: чашу вращают, и
  // мировая координата при повороте камеры давала бы звук СЛЕВА у предмета,
  // который игрок видит СПРАВА. Тот же приём, что у выбора пикселя для тестов
  // (`visiblePixel`) и у попов очков — камера уже есть, изобретать нечего.
  // ⚠️ 0.6 — НЕ ПОЛНЫЙ РАЗМАХ: чаша занимает середину экрана, и жёсткая
  // панорама в наушниках читается как «звук уехал из игры». Достаточно намёка.
  const _pan = (function (){
    try { const s = boomAt.clone().project(camera);
      return Math.max(-1, Math.min(1, s.x)) * 0.6; } catch (e) { return null; }
  })();
  Sound.play('match', { n, k: comboHot ? comboCount : 0, m: materialOf(typeName),
                        r: list[0].r, pan: _pan });
  vibrate(15);
  tapSndMs += performance.now() - _ts0;      // синтез «буля» + вибро
  if (MATCH_CAM_SHAKE && n > 2) camShake = Math.max(camShake, 0.12); // джус на большие группы
  setTimeout(()=>afterPause(()=>{
    // ⚠️ ХЛОПОК ЗДЕСЬ, НА ТЕХ ЖЕ ЧАСАХ, ЧТО И УДАЛЕНИЕ. Стягивание идёт по
    // ИГРОВОМУ времени (тик addFX), удаление — по РЕАЛЬНЫМ (этот setTimeout).
    // На просевшем FPS тик до конца не доходит, и хлопок, повешенный на него,
    // не наступил бы вовсе. Одни часы на «предметы исчезли» и «бабахнуло».
    // ⚡ УДАР (задача тестеров 2026-08-06 «больше драйва при соединении»):
    // кольцо + вспышка + стрелы поверх прежнего носителя. Стоит ЗДЕСЬ, на тех
    // же часах, что и хлопок с удалением, — по той же причине, что абзацем
    // выше. Пачечный эффект достаётся только группам >= BURST_MIN_N, а удар —
    // КАЖДОМУ соединению; его размер растёт с n (у пары самый скромный).
    impactFX(boomAt, n, boomGhost.fxColor || boomGhost.baseColor, boomGhost, fireHot);
    // 🔥 ВСПЛЕСК ОГНЯ (слово владельца 2026-08-06 «когда огненный объект
    // совмещается, при совмещении сделай визуальный всплеск огня»). Слой
    // ДОПОЛНИТЕЛЬНЫЙ: удар, кольцо и труха остаются, огонь ложится сверху —
    // иначе момент бонуса ×2 визуально не отличался бы от рядового матча.
    if (fireHot) fireBurstFX(boomAt, n);
    if (burst) burstFX(boomGhost); else dissolveFX(boomGhost);
    popFX(boomAt);
    // кик камеры тоже растёт с группой: у пары прежний, у группы в кап — вдвое
    if (MATCH_CAM_SHAKE) camShake = Math.max(camShake, COLLAPSE_SHAKE * (1 + Math.min(1, (n - 2) / Math.max(1, MATCH_MAX_N - 2))));
    list.forEach(removeItem);
    wakePhysics('gameplay:L28'); // масса над удалёнными должна осесть
    // ⚠️ ЛОКАЛЬНО ВОКРУГ ТОЧКИ СХЛОПЫВАНИЯ (79-86 мс полного обхода садились
    // на КАЖДЫЙ матч; фон досчитает остальное за 0.8 с) — см. 60-access
    refreshAccessibilityNear(boomAt); updateHUD(); checkEnd();
  }), 150);
}
// ===== Эффекты лопанья по пачкам («пункт 5», спека владельца 2026-07-21).
// СТАРТОВЫЕ реализации зоны ФИЗИКИ через публичный addFX — 70-fx не тронут
// (sphereFX-стиль жизненного цикла: материал/геометрия персональные,
// stepFX сам их диспозит). Полировка/перенос в 70-fx — за ГРАФИКОЙ
// (междузонный запрос в WORKSTREAMS). Баллистика ПАРАМЕТРИЧЕСКАЯ
// (позиция от t=k·life, не по кадрам) — FPS-независимо.
// Тап по КАМНЮ (спека владельца 2026-07-22): ДВОЙНОЙ штраф промаха как
// обучение «камни не совмещаются». Механика — зеркало penalize (70-fx) с
// суммой 2×MISS_PENALTY: «уровень 1 без штрафов» и кламп нуля ур.2..5
// несёт единая точка scorePenalty; misses и срез комбо-ступеней — как у
// стандартного промаха.

// ДВОЙНОЙ ШТРАФ ЗА ТАП ПО НЕСОВМЕЩАЕМОМУ (2×MISS_PENALTY).
// ⚠️⚠️ РОДОМ ОТ КАМНЕЙ (`penalizeRock`), но КАМНИ УДАЛЕНЫ 2026-08-17, а функция
// ЖИВА — её зовёт ГЛЫБА при раннем тапе: спека владельца по льду дословно
// говорит «штраф КАК У КАМНЯ». Снести её вместе с камнями значило бы тихо
// изменить механику льда, поэтому переименована, а не удалена.
function penalizeDouble(item){
  stats.misses++;
  const before = stats.score;
  const charged = scorePenalty(2 * MISS_PENALTY);
  const shown = scoreShownDelta(stats.score, before); // положительная величина падения чипа (#10)
  // тап по несовмещаемому — тоже промах: набор турбо обнуляется (спека владельца
  // 2026-07-27), радиус-лесенка теряет свои 2 шага. Симметрично registerMiss.
  if (comboUntil > performance.now()){
    comboLevel = Math.max(0, comboLevel - COMBO_MISS_DROP);
    comboCount = 0; // набор турбо — с нуля
    updateMatchRadius(); updateHUD();
  }
  try { bowlStreakReset(); } catch(e){} // стрик чаши: промах по несовмещаемому = ошибка
  try { noteMissRadius(); } catch(e){} // штраф радиуса — как у обычного промаха (2026-08-11)
  if (charged && shown > 0) scorePop('-' + shown, item.p.clone().setY(item.p.y + 0.6), '#e5484d', false);
  Sound.play('miss');
  vibrate(20);
  wiggle(item);
  updateHUD();
}

// ЧЁРНЫЙ ШАР-БОМБА (спека владельца 2026-07-22): тап = взрыв БЛИЖАЙШИХ
// соседей (зазор охватных сфер <= BOMB_RADIUS, кап BOMB_MAX), без очков.
// Поведение объекта — зона ФИЗИКИ (правило 9). Жертвы уходят пак-эффектами
// «пункта 5» (сок/искры/звёзды — взрыв бесплатно разнообразен), сама бомба —
// тёмной трухой; волна сильнее бурстовой (BOMB_WAVE_V) — куча вздрагивает.
// Комбо/серии взрыв НЕ трогает (не матч); сюрприз и другие бомбы не задевает.
// ЗАЧЁТ ПАР В ГЛЫБЫ — ЕДИНСТВЕННАЯ ТОЧКА (копия счёта рядом с рабочим —
// канонный источник расхождений). Считаем ШТУКАМИ: 2 собранные штуки типа =
// пара; нечётные группы не теряют половинку. Готовность даёт пульс (тик в
// 99-main), разбитие — за игроком (слово владельца «нужен тап»).
function frozenCredit(typeName, n){
  for (const it of items){
    if (!it.alive || !it.frozen || it.frozenReady || it.frozenType !== typeName) continue;
    it.frozenGotItems = Math.min(it.frozenNeedItems, it.frozenGotItems + n);
    iceCracks(it);                                   // трещины углубляются
    try { Sound.play && Sound.play('crunch'); } catch(e){}
    if (it.frozenGotItems >= it.frozenNeedItems){ it.frozenReady = true; }
  }
}
function breakIce(it, поБомбе){
  wakePhysics('frozen');
  stats.lastAction = performance.now();
  try { Sound.play && Sound.play('crunch'); } catch(e){}
  // РАЗЛОМ «КАК ЧАША» (слово владельца 2026-08-13): корка отцепляется в мир и
  // разлетается СВОИМИ кусками Вороного (iceBoomStart, вершинный шейдер);
  // осколки shardFX остаются мелкой крошкой ПОВЕРХ кусков, как у чаши
  iceBoomStart(it);
  try { shardFX(it.p.clone(), 0xbfe8ff, { count: 12, size: 0.07, life: 0.6 }); } catch(e){}
  it.frozen = false; it.frozenReady = false;
  it.key = it.frozenKey;                             // предмет снова ПАРНЫЙ
  // «чистые очки предмета ×3» — MATCH_SCORE × 3 × множитель типа × бустер.
  // ⚠️ ПО БОМБЕ — БЕЗ ОЧКОВ (умолчание, названо владельцу): досрочная
  // разморозка без выполнения условия не оплачивается.
  if (!поБомбе){
    const before = stats.score;
    const gained = Math.round(MATCH_SCORE * FROZEN_BREAK_MULT * accMult(it.key) * scoreBoostMult());
    stats.score += gained;
    const shown = scoreShownDelta(before, stats.score);
    try { scorePop('+' + shown, it.p.clone().setY(it.p.y + 0.6), '#bfe8ff', true); } catch(e){}
  }
  try { popFX(it.p); } catch(e){}
  try { refreshAccessibility(); } catch(e){}
  try { updateHUD(); } catch(e){}
}
function detonateBomb(bomb){
  bomb.animating = true;
  destroyItemBody(bomb);
  wakePhysics('bomb');
  stats.lastAction = performance.now(); // тап = действие, миксер откладывается
  // ⚠️ ГЛЫБЫ: бомба лёд разбивает только ВПЛОТНУЮ (FROZEN_BOMB_RADIUS =
  // старая зона 2.86; выбор владельца «2», 2026-08-13). На полной зоне 5.72
  // при чаше ~8 бомба доставала глыбу отовсюду (замер 10/10) и обесценивала
  // условие сбора пар одним тапом. Предмет жив — из жертв исключаем,
  // размораживаем отдельно и БЕЗ очков ×3.
  items.filter(i => i.alive && i.frozen && pairDist(i, bomb) <= FROZEN_BOMB_RADIUS)
       .forEach(i => { try { breakIce(i, true); } catch(e){} });
  const victims = items
    .filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && !i.frozen)
    .map(i => ({ i, d: pairDist(i, bomb) }))
    .filter(v => v.d <= BOMB_RADIUS)
    .sort((a, b) => a.d - b.d)
    .slice(0, BOMB_MAX)
    .map(v => v.i);
  victims.forEach(it => { it.animating = true; destroyItemBody(it); });
  popFX(bomb.p);
  dissolveFX(bomb);
  victims.forEach(it => burstFX(it));
  // «ВЗРЫВ ПОХОЖ НА ЭФФЕКТ SHAKE» (спека владельца 2026-07-27-б): волна идёт
  // ДВУМЯ слоями — радиальный ПАНЧ в зоне поражения (характер взрыва, чтобы
  // он не стал неотличим от встряски) + ДЖОЛТ по ВСЕЙ куче, включая верх
  // (вздрагивает весь миксер — то самое «как shake»). Радиус панча едет за
  // BOMB_RADIUS через BOMB_WAVE_R_K, без хардкода: зону владелец уже менял.
  blastWave(bomb.p, BOMB_RADIUS + BOMB_WAVE_PAD, CFG.bombWaveV, CFG.bombJolt);
  // camShake — ДЛИТЕЛЬНОСТЬ дрожания: держим НИЖЕ встряски (0.42), иначе
  // взрыв дрожал бы дольше неё при вчетверо меньшем толчке (ревью 2026-07-27)
  camShake = Math.max(camShake, BOMB_CAM_SHAKE);
  Sound.play('shake');
  vibrate([40, 80, 50]); // тактильная сила взрыва под усиленную волну (спека «усилить силу», 2026-07-27)
  scorePop('BOOM', bomb.p.clone().setY(bomb.p.y + 0.9), '#1d1c26', true);
  const all = [bomb].concat(victims);
  const scales = all.map(it => it.mesh.scale.x);
  addFX(new THREE.Object3D(), 0.16, (o, k) => {
    const s = k < 0.45 ? 1 + 0.5*k : 1.22 * (1 - (k - 0.45)/0.55);
    all.forEach((it, i) => { it.mesh.scale.setScalar(scales[i]*Math.max(0, s)); });
  });
  setTimeout(() => afterPause(() => {
    all.forEach(removeItem);   // ⚠️ после хлопка: BOWL_MERGE_MS + пауза
    wakePhysics('gameplay:L28'); // масса над воронкой взрыва должна осесть
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 150);
}

// ===== ДЕТОНАЦИЯ «ЗАРЯДА ТИПА» (спека владельца 2026-07-31; 00-config) =====
// СПАСЕНИЕ, не уничтожение (решение владельца): accAdd копит, музей и вехи
// сюжета честны, а миксер ЗЛИТСЯ — игрок дерзко спас целый тип разом.
// Снимает ВСЕХ живых этого типа, ВКЛЮЧАЯ недоступные — в этом сила заряда:
// раскопка без встряски. Очки: формула группы с капом MATCH_MAX_N, ×множитель
// типа, БЕЗ комбо-×2 (обоснование у CHARGE_MIN_COPIES). Паттерн удаления —
// detonateBomb: animating → эффекты → afterPause → removeItem.
// Состояние заряда — РАНТАЙМ, не сейв (поправка владельца «жить не больше 7
// секунд»): chargeName/chargeUntil; истечение проверяет chargeTick из loop.
let chargeName = '', chargeUntil = 0;
// ЛЕСЕНКА ТЕМПА — единая точка множителя серии (пакет темпа 2026-07-31):
// ×4 в турбо, ×3 с SERIES_X3_AT-го матча серии, иначе базовый ×2. Потребители:
// начисление в doMatch и __game.series() (глаза Интерфейса читают его же —
// показ и деньги не могут разойтись по построению).
function seriesMult(nowMs){
  if (chainUntil > nowMs) return SERIES_MULT_CHAIN;
  return comboCount >= SERIES_X3_AT ? SERIES_MULT_X3 : COMBO_SCORE_MULT;
}
// ===== ЧАША-РАЗЛЁТ (прототип v2) — механика =====
// Единая точка трещины: её зовут И вход в турбо, И ручка стенда/тестов —
// поведение одно (урок «ручка мимо механики» из огня v232).
let bowlShattering = false;
let bowlNRuntime = 0; // 0 = брать BOWL_SHATTER_N; ручка setN для стенда
function bowlN(){
  // лесенка сложности (слово владельца 2026-08-04): +1 турбо каждый десяток
  return bowlNRuntime || (BOWL_SHATTER_N + Math.floor((levelNum || 1) / 10));
}
// «БЕЗ ОШИБОК» (слово владельца 2026-08-03): любой промах обнуляет
// накопленные турбо-зачёты чаши. Зовёт penalize (70-fx) —
// ВСЕГДА, не только при горячем окне. Бомба сюда не заходит (не ошибка).
// Глаза отыграют сброс сами: bowlLeft() читает cracks каждый тик.
function bowlStreakReset(){
  if (BOWL_CRACK_ON !== 'chain') return;
  if (!level || level.over || bowlShattering) return;
  if (!level.bowlCracks) return;
  level.bowlCracks = 0;
  try { setBowlCracks(0, bowlN()); } catch(e){}
}
function bowlCrackAdd(silent){
  if (!level || level.over || bowlShattering) return;
  level.bowlCracks = (level.bowlCracks || 0) + 1;
  // ⚠️⚠️ НАГРАДА ЗА СЕРИИ (спека владельца 2026-08-12: «а так же если игрок
  // выбьет 3 серии»). Считаем ЕГО ЖЕ единицу — `bowlCracks`, ту самую, которой
  // он мерил «5-7 серий за уровень» при вводе разлёта чаши; второй счётчик
  // рядом с работающим завёл бы расхождение при первой правке.
  // ⚠️ Ровно НА ТРЕТЬЕЙ (`===`), а не «>= 3»: иначе бомба сыпалась бы на
  // каждой следующей серии. Прочие гварды — внутри `bombDropReward`.
  if (level.bowlCracks === BOMB_SERIES_REWARD){ try { bombDropReward(); } catch(e){} }
  try { setBowlCracks(level.bowlCracks, bowlN()); } catch(e){}
  if (!silent){
    Sound.play('crunch', 9); vibrate([15, 30, 25]);
    camShake = Math.max(camShake, 0.18);
  }
  if (level.bowlCracks >= bowlN()){
    // отложенно на РЕАЛЬНЫХ часах: дать попу Power chain и подбросу прожить
    setTimeout(shatterBowl, 650);
  }
}
function shatterBowl(){
  if (!level || level.over || bowlShattering || intro) return;
  bowlShattering = true;
  // РАЗЛЁТ ИСПОЛНЯЕТ ЦЕПЬ (баг владельца 2026-08-04, скрин «чаша разбилась
  // во время серии, всё сломалось»): живое турбо продолжало ДОСЫПАТЬ
  // предметы все 900 мс до сбора — опоздавшие к снапшоту сборщика падали
  // сквозь ПРИЗРАЧНОЕ дно в вечное падение, alive не достигал нуля, победа
  // не наступала, уровень зависал. Цепь гасим сразу: серия своё отыграла.
  chainUntil = 0;
  slowmoUntil = performance.now() + BOWL_SLOWMO_MS; // «да!» владельца: слоу-мо
  try { dropWalls(); } catch(e){}
  try { shatterBowlVis(); } catch(e){}
  wakePhysics('bowl:shatter');
  blastWave(new THREE.Vector3(0, 3.5, 0), 9, 3.2, 2.0); // куче — наружу, зрелищно
  Sound.play('chain'); Sound.play('crunch', 12);
  vibrate([40, 60, 40, 60, 80]);
  camShake = Math.max(camShake, 0.6);
  stats.lastAction = performance.now(); // миксер молчит на празднике
  // волна сбора — после разлёта, РЕАЛЬНЫЕ часы (канонный паттерн grindShred)
  setTimeout(bowlCollectAll, BOWL_COLLECT_DELAY);
}
function bowlCollectAll(){
  if (!level || level.over) { bowlShattering = false; return; }
  // «засчитываются как соединённые»: по каждому типу k живых — очки группы
  // с капом, ×накопление ×платный бустер, БЕЗ серийных множителей (иначе
  // стак с турбо); accAdd на все k — это СПАСЕНИЕ, музей честен.
  const byType = {};
  const extras = []; // камни/бомба — уносятся без очков (решение №2 владельца)
  let surprise = null;
  for (const it of items){
    if (!it.alive || it.animating) continue;
    if (it.surprise){ surprise = it; continue; }
    if (it.bomb || it.frozen){ extras.push(it); continue; }
    if (!it.type) continue;
    (byType[it.type.name] = byType[it.type.name] || []).push(it);
  }
  let gainedTotal = 0;
  const scoreBefore = stats.score;
  for (const [name, list] of Object.entries(byType)){
    const k = list.length;
    const kk = Math.min(k, MATCH_MAX_N);
    gainedTotal += Math.round(MATCH_SCORE * kk * (kk - 1) * accMult(name) * scoreBoostMult());
    accAdd(name, k, list[0]);
  }
  stats.score += gainedTotal;
  const shown = scoreShownDelta(scoreBefore, stats.score);
  // ⚠️ КЛАД БОЛЬШЕ НЕ СОБИРАЕТСЯ ЗДЕСЬ: он летит в центр ВМЕСТЕ СО ВСЕМИ
  // (слово владельца — «ВСЕ объекты, которые были в чаше»), а начисление и его
  // эффекты уходят в момент хлопка, уже в точке сбора. Раньше он лопался на
  // месте, пока остальные ещё летели, — и обещание «все сливаются» ломалось
  // ровно на самом заметном предмете.
  // ⚙️ СЛЁТ В ЦЕНТР И ХЛОПОК (слово владельца 2026-08-06: «все объекты, которые
  // были в чаше на момент взрыва, сливаются друг с другом в центре и исчезают,
  // как сейчас сделано слияние объектов»). Было: каждый таял на месте волной от
  // центра — это читалось как «растворились», а не как «собрались».
  // ⚠️ Тот же collapseFX, что у обычного матча, только длиннее: лететь через
  // всю чашу. Хлопок — на РЕАЛЬНЫХ часах, как в doMatch (тик анимации на
  // просевшем FPS до конца не доходит, и хлопок бы не наступил).
  const all = Object.values(byType).flat().concat(extras);
  const центр = new THREE.Vector3(0, BOWL_MERGE_AT_Y, 0);
  for (const it of all){
    it.animating = true; it.animStartMs = performance.now();
    destroyItemBody(it);   // тела нет — меш ведёт анимация, физика не спорит
  }
  // ⚠️ РЕАЛЬНЫЕ ЧАСЫ (4-й аргумент): удаление ниже висит на setTimeout, и на
  // просевшем FPS игровой тик отставал — куча исчезала, не долетев до центра.
  const летят = surprise ? all.concat([surprise]) : all;
  if (surprise){ surprise.animating = true; destroyItemBody(surprise); }
  collapseFX(летят, центр, BOWL_MERGE_MS, true);
  const тон = (all[0] && (all[0].fxColor || all[0].baseColor)) || null;
  setTimeout(() => {
    if (!level) return;
    impactFX(центр, MATCH_MAX_N, тон, all[0] || null);   // удар как у крупной группы
    dissolveFX({ p: центр, r: 1.6, fxColor: тон, baseColor: тон });
    popFX(центр);          // ⚠️ был у обычного матча и не был здесь — язык хлопка один
    // клад забирается ЗДЕСЬ, в точке сбора: сдвигаем его якорь эффектов на
    // центр, иначе его поп и труха ушли бы туда, где он лежал до слёта
    // ⚠️ ДВИГАЕМ ТОЛЬКО ЯКОРЬ ЭФФЕКТОВ (`p`), А НЕ МЕШ. Меш к этому моменту уже
    // САМ прилетел в центр вместе со всеми — в этом вся правка. Первая версия
    // копировала и mesh.position, то есть ТЕЛЕПОРТИРОВАЛА клад, и страж «клад
    // летит со всеми» проходил зелёным даже когда клад вынут из слёта: он мерил
    // телепорт, а не полёт (диверсия это и показала).
    if (surprise && surprise.alive){ surprise.p.copy(центр);
      try { collectSurprise(surprise); } catch(e){} }
    camShake = Math.max(camShake, COLLAPSE_SHAKE * 2);
    Sound.play('match', { n: Math.min(all.length, MATCH_MAX_N), k: 0 });
  }, BOWL_MERGE_MS);
  scorePop('Bowl Shatter! +' + shown, new THREE.Vector3(0, 5.5, 0), '#ff5a3c', true);
  Sound.play('win');
  setTimeout(() => afterPause(() => {
    all.forEach(removeItem);
    // СТРАХОВКА-ДОБОР (баг владельца 2026-08-04): всё, что заспавнилось
    // ПОСЛЕ снапшота сборщика (досыпка живого турбо и любой будущий спавн),
    // тихо убирается без очков — иначе «опоздавший» вечно падал под
    // призрачным дном, alive не достигал нуля и уровень зависал без победы.
    for (const it of items){ if (it.alive){ try { removeItem(it); } catch(e){} } }
    bowlShattering = false;
    refreshAccessibility(); updateHUD(); checkEnd(); // живых нет -> победа
  }), BOWL_MERGE_MS + 260);
}
function bowlState(){
  return { cracks: (level && level.bowlCracks) || 0, n: bowlN(),
           len: BOWL_SERIES_LEN, shattering: bowlShattering,
           floorGhost: (() => { try { return floorCol.isSensor(); } catch(e){ return false; } })(),
           rescuerOff: bowlIsOpen() };
}
function chargeState(){
  return { name: chargeName, leftMs: chargeName ? Math.max(0, chargeUntil - performance.now()) : 0 };
}
function chargeTick(){
  if (chargeName && performance.now() > chargeUntil){
    chargeName = ''; chargeUntil = 0;              // растворился — момент упущен
    try { updateHUD(); } catch(e){}
  }
}
function detonateCharge(){
  if (intro || paused || !level || level.over) return false;
  if (!chargeName || performance.now() > chargeUntil) return false;
  const name = chargeName;
  // ⚠️ !i.frozen: заряд бьёт по ИМЕНИ ТИПА (не по ключу), и без исключения
  // снял бы глыбу мимо её условия; собранные же штуки в зачёт ИДУТ (владелец).
  const victims = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb
                                    && !i.frozen && i.type && i.type.name === name);
  chargeName = ''; chargeUntil = 0;
  if (!victims.length){ try { updateHUD(); } catch(e){} return false; } // тип кончился раньше клика
  wakePhysics('charge');
  stats.lastAction = performance.now();          // клик = действие, миксер откладывается
  const n = victims.length;
  const N = Math.min(n, MATCH_MAX_N);            // кап цены — как у группы
  // ⚠️ БУСТЕР МНОЖИТ И ЗАРЯД (слово владельца 2026-08-01: «множит») — как все
  // очковые точки; комбо-×2 по-прежнему НЕ участвует (обоснование у формулы).
  const gained = Math.round(MATCH_SCORE * N * (N - 1) * accMult(name) * scoreBoostMult());
  stats.score += gained;
  accAdd(name, n, victims[0]);                   // СПАСЕНИЕ: копит на все n
  frozenCredit(name, n);                         // пары заряда идут в зачёт глыб (владелец: «идут»)
  lastMatchMs = performance.now();               // окно серии продлевается (действие),
                                                 // comboCount НЕ трогаем — заряд серию не копит
  victims.forEach(it => { it.animating = true; destroyItemBody(it); });
  // РАСТВОРЕНИЕ, а не пак-бурст (спека владельца 2026-07-31: «должны разлетаться
  // сильнее, или просто растворяться, иначе не понятно что произошло»): выбрано
  // растворение — труха dissolveFX на КАЖДОМ из 6-16 предметов читается как
  // одновременное исчезновение типа, бурст на этом числе выглядел мелко.
  victims.forEach(it => dissolveFX(it));
  const mid = new THREE.Vector3();
  victims.forEach(it => mid.add(it.p)); mid.multiplyScalar(1/n).y += 1.2;
  scorePop('+' + gained, mid, '#ffffff', true);
  // ⛔ РЕАКЦИЯ ГЛАЗ НА ЗАРЯД СНЯТА (слово владельца 2026-08-07: «клик на
  // бонусную вещь не должен сбивать счётчик турбо, сейчас сбивает, по крайней
  // мере меняются глаза»). Замер показал: СЧЁТЧИК ЦЕЛ (4 -> 4, промахов 0) —
  // сбивались именно ГЛАЗА: 'angry' на 1.4 с перебивал распахнутые зрачки
  // горящей серии, и это читалось как потеря турбо. Заряд — награда, а не
  // происшествие: пусть глаза продолжают показывать серию.
  // (Звук и вибро остаются: обратная связь о самом сборе нужна.)
  Sound.play('match', N); vibrate([30, 60, 40]);
  // ⚠️ БЕЗ 150 мс ожидания (жалоба «задержка по уничтожению»): труха уже
  // прячет меши, удаление сразу — паттерн бомбы держал паузу ради надувания,
  // которого у заряда больше нет.
  afterPause(() => {
    victims.forEach(removeItem);
    wakePhysics('charge:settle');
    refreshAccessibility(); updateHUD(); checkEnd();
  });
  return true;
}

function burstFX(it){
  const tex = it.type && it.type.tex;
  // ⚙️ КРУПНЫЕ ВАРИАНТЫ (выбор владельца 2026-08-01): у еды и машин эффекты
  // заменены — меньше частиц, но жирнее, и у кусков поведение (рикошет искр от
  // стенок, укатывающееся колесо, капли сока на стекле экрана). Звери и твёрдые
  // пачки оставлены прежними: звёзды владелец принял как есть, осколкам подняли
  // только количество (SHARD_BURST_N).
  if (tex === 'food') juiceBigFX(it);
  else if (tex === 'car') sparkRicochetFX(it);
  else if (tex === 'animal') starPopFX(it);
  // ОСКОЛКИ (спека владельца 2026-07-23 «сделай осколками»): твёрдые пачки —
  // кладка/пиратское/камни — не в труху, а КОЛЮТСЯ на угловатые куски
  else if (tex === 'brick' || tex === 'pirate')
    shardFX(it.p, it.fxColor || it.baseColor, { count: SHARD_BURST_N, size: 0.2, up: 4.2 });
  else dissolveFX(it); // без пачки — прежняя труха
}
// ⚠️ ВИЗУАЛ пак-эффектов ПЕРЕЕХАЛ В 70-fx (сок и искры с тех пор ЗАМЕНЕНЫ
// на juiceBigFX/sparkRicochetFX по выбору владельца 2026-08-01, старые удалены)
// (просьба ФИЗИКИ в WORKSTREAMS, сделано ГРАФИКОЙ 2026-07-22): там они
// полированы — круглые точки вместо квадратных, звёзды билбордами.
// Здесь остаётся только ПРАВИЛО выбора (burstFX выше) — оно ваше.

// ⚠️ ВИЗУАЛ ОСКОЛКОВ (shardFX + makeShardGeo) ПЕРЕЕХАЛ В 70-fx (полировка
// ГРАФИКОЙ 2026-07-23 по запросу ФИЗИКИ): нерегулярная форма скола, тинт
// по граням (объём на плоском MeshBasicMaterial), звук «хруст». Сигнатура
// та же — (pos, color, opts{count,life,up,spread,size}); здесь остаются
// только ВЫЗОВЫ (правило burstFX выше и шинковка grindShred ниже) — ваша зона.

// «МОЛОТЬ ЭФФЕКТНО» (спека владельца 2026-07-23): двухфазная анимация помола,
// общий помощник для mixerGrind и finaleGrind (чтобы не разъезжались).
// Фаза 1 (захват): предмет РЫВКОМ утягивается к плоскости ножей с ускорением,
// ДРОЖИТ и СПЛЮЩИВАЕТСЯ (сжатие по Y, распор по XZ) — «затянуло под ножи».
// Фаза 2 (шинковка): меш гаснет, из-под лопастей ФОНТАНОМ бьют осколки +
// пылевой взрыв (+ по вкусу тряска камеры). Удаление предмета остаётся в
// afterPause вызывающего (гварды целы), меш прячется масштабом.
// ⚠️ ШИНКОВКА — НА РЕАЛЬНЫХ ЧАСАХ (setTimeout), а НЕ в тике addFX: тик растёт
// на КЛАМПНУТОМ dt (99-main), и на <~20 FPS шинковка по FX-часам наступала
// ПОЗЖЕ removeItem по реальным (560/410 мс) — фонтан отрывался от исчезнувшего
// меша. Реальные часы держат порядок «шинковка -> removeItem» при любом FPS.
// shake — амплитуда тряски (наказание mixerGrind ярче; финал спокойнее).
function grindShred(item, dur, shake){
  const p0 = item.p.clone(), s0 = item.mesh.scale.x, mesh = item.mesh;
  const drop = Math.max(0.6, p0.y - FLOOR_REST + 0.25); // дотянуть до ножей
  const grab = dur * 0.7; // длительность фазы захвата
  // фаза 1 — покадровое сплющивание (косметика, безопасна на любом FPS)
  addFX(new THREE.Object3D(), grab, (o, k) => {
    const e = k*k;                                // ускорение вниз — «засасывает»
    const jud = Math.sin(k*49)*0.05*k;            // дрожь захвата
    mesh.position.set(p0.x + jud, p0.y - e*drop, p0.z - jud);
    mesh.rotation.y += 0.7;
    const sq = s0*Math.max(0.05, 1 - 0.6*k);      // сплющивание
    mesh.scale.set(s0*(1 + 0.4*k), sq, s0*(1 + 0.4*k));
  });
  // фаза 2 — шинковка на реальных часах, ПЕРЕД removeItem вызывающего
  setTimeout(() => {
    if (!item.alive) return;                      // перестраховка: не стрелять по трупу
    const gp = mesh.position.clone();
    // ⚙️ РАСПИЛ (выбор владельца 2026-08-01): предмет не рассыпается фонтаном
    // осколков, а РАЗВАЛИВАЕТСЯ НА ДВЕ ПОЛОВИНЫ по плоскости реза — виден срез
    // настоящей модели. Фаза захвата (сплющивание) осталась как была.
    sawFX(item);
    mesh.scale.setScalar(0.0001);                 // оригинал исчез — дальше половины
    bladeDustFX(gp, item.fxColor || item.baseColor);
    if (shake) camShake = Math.max(camShake, shake);
  }, grab * 1000);
}

function checkEnd(){
  if (level.over) return;
  if (items.every(i=>!i.alive)){
    level.over = true;
    Sound.play('win');
    const secs = Math.round((performance.now()-stats.t0)/1000);
    // ЗВЁЗДЫ: 1★ пройден, 2★ очки >= пар-скор×1.3, 3★ >= ×1.7 (скилл в очках,
    // НЕ в спецусловиях — «цепная реакция обязательна» отвергнута аудитом плана)
    const base = level.parBase || 0;
    const stars = 1 + (base > 0 && stats.score >= base * STAR2_K ? 1 : 0)
                    + (base > 0 && stats.score >= base * STAR3_K ? 1 : 0);
    // МОНЕТЫ: база + конверсия очков (комбо наконец экономически выгодны)
    level.coinsWon = COIN_BASE + Math.floor(Math.max(0, stats.score) / COIN_PER_SCORE);
    addCoins(level.coinsWon);
    // ЕДИНЫЙ БАЛАНС (финализация владельца 2026-07-24: «всё заработанное в
    // уровне = баланс»): банкуем НАКОПЛЕННЫЙ СЧЁТ уровня (деноминир. ×10) в
    // кошелёк — то же число в чипе, меню и лидерборде. Рейтинг stars[lv]
    // остаётся как индикатор качества (setStars), валюту больше не несёт.
    setStars(levelNum, stars);
    // +1 ВСТРЯСКА ЗА КАЖДЫЕ 5 ПРОЙДЕННЫХ УРОВНЕЙ (слово владельца 2026-08-04:
    // «нужно будет давать +1 шейк за прохождение 5 уровней»). Кладём в
    // ПОСТОЯННЫЙ запас (пара pe/ps — тот же, что у бандлов): переживает
    // уровень и устройство, дюп-безопасен по монотонной паре. Срабатывает
    // на 5/10/15..., то есть по номеру ЗАВЕРШЁННОГО уровня.
    if (levelNum % 5 === 0){
      try { Save.pe = (Save.pe || 0) + 1; commitSave(); level.shakeBonus = 1; toast('+1 Shake'); } catch(e){}
    }
    level.starsWon = bankLevelScore(stats.score);
    addHints(1); // +1 подсказка за успешный уровень (спека владельца)
    Telemetry.ev('win', { lv: levelNum, st: stars, sw: level.starsWon, c: level.coinsWon, sc: stats.score, sec: secs });
    $('winTitle').textContent = '🎉 Level ' + levelNum + ' cleared!';
    // ЗВЁЗДЫ ПОБЕДЫ — ассет владельца Interface/Star.svg (слово 2026-08-05
    // «замени везде иконку звезды»): вместо текстовых ★/☆ рисуем ту же
    // геометрию, что в HUD и меню; незаработанная — та же форма с opacity.
    {
      const star = (on) => '<svg viewBox="0 0 32 30" width="34" height="32" aria-hidden="true" style="margin:0 3px' +
        (on ? '' : ';opacity:.28') + '"><path d="M5.99339 29.418C5.0305 28.6875 4.83128 27.4756 5.31273 26.0811L7.76976 18.8262L1.52757 14.3604C0.299054 13.4805 -0.282001 12.4014 0.133038 11.2227C0.531476 10.0771 1.61058 9.5293 3.08812 9.5459L10.7414 9.6123L13.0657 2.29102C13.5305 0.84668 14.3772 0 15.5891 0C16.801 0 17.6477 0.84668 18.1125 2.29102L20.4367 9.6123L28.0735 9.5459C29.5676 9.5293 30.6467 10.0771 31.0451 11.2393C31.4436 12.4014 30.8791 13.4805 29.6506 14.3604L23.4084 18.8262L25.8655 26.0811C26.3469 27.4756 26.1477 28.6875 25.1848 29.418C24.2053 30.165 23.01 29.9658 21.7649 29.0527L15.5891 24.5039L9.39671 29.0527C8.16819 29.9658 6.97288 30.165 5.99339 29.418Z" fill="#FFE730"/></svg>';
      let html = '';
      for (let i = 0; i < 3; i++) html += star(i < stars);
      $('winStars').innerHTML = html;
    }
    $('winStats').textContent =
      'Score: ' + stats.score + (base ? ' / goal ' + Math.round(base * STAR2_K) : '') + '  ·  Time: ' + fmtTime(secs);
    // монеты скрыты: награда уровня на экране — звёзды + подсказка;
    // начисление выше живёт (вернётся вместе с COINS_ENABLED)
    // награда уровня: заработанные звёзды-валюта + подсказка (монеты скрыты
    // флагом; их начисление выше живёт и вернётся вместе с COINS_ENABLED)
    $('winCoins').textContent = (level.starsWon > 0 ? '+' + level.starsWon + ' ★  ·  ' : '')
      + (COINS_ENABLED ? ('+' + level.coinsWon + ' 🪙  ·  ') : '') + '+1 💡';
    $('winX2Btn').style.display = COINS_ENABLED ? '' : 'none';
    levelNum++;
    try { localStorage.setItem('mixer_level', String(levelNum)); } catch(e){}
    try { Save.lv = Math.max(Save.lv || 1, levelNum); commitSave(); } catch(e){} // прогресс — в облако
    Ads.noteWin();
    // площадке: уровень пройден (у Poki/CrazyGames — нативный gameplayStop,
    // естественная точка, где площадка вправе показать свою рекламу)
    try { Ads.msg('LEVEL_COMPLETED', { level: String(levelNum - 1) }); } catch(_){}
    show('winOverlay');
    // ⚠️ ЗДЕСЬ БОЛЬШЕ НЕТ storyOnWin() — слово владельца 2026-08-06: анонс
    // нового предмета идёт ПОСЛЕ статистики, а не поверх неё. Его зовёт кнопка
    // «Next» (90-input), и уровень стартует уже из её колбэка.
    updateHUD();
  }
}
function showLose(){
  level.over = true;
  Sound.play('lose');
  Telemetry.ev('lose', { lv: levelNum, alive: items.filter(i=>i.alive).length });
  const secs = Math.round((performance.now()-stats.t0)/1000);
  $('loseStats').textContent = 'No pairs available and no shakes left. Items left: '
    + items.filter(i=>i.alive).length + '  ·  Time: ' + fmtTime(secs);
  // Continue за рекламу — 1 раз за уровень (самый конвертящий плейсмент жанра)
  $('loseAdContinue').style.display = level.continueUsed ? 'none' : '';
  show('loseOverlay');
}
// Continue: реклама досмотрена — вернуть игру к жизни
function continueRun(){
  level.continueUsed = true;
  level.over = false;
  hide('loseOverlay');
  level.shakes++;                 // +1 встряска
  dropExtra(CONTINUE_DROP);       // +предметы сверху (появляются новые пары)
  stats.lastAction = performance.now();
  level.stuck = -4;               // фора детектору тупика, пока досыпка оседает
  Telemetry.ev('continue', { lv: levelNum });
  refreshAccessibility(); updateHUD();
}
// «Прицел» (магазин): подсветить ВСЕ доступные пары на 5 с
function scopeHighlight(){
  const byKey = {};
  for (const it of items) if (it.alive && it.accessible && !it.animating) (byKey[it.key] = byKey[it.key]||[]).push(it);
  let lit = 0;
  for (const k in byKey){
    const arr = byKey[k];
    for (const a0 of arr){
      const paired = arr.some(o => o !== a0 && pairMatch(o, a0));
      if (paired){ scopePulse(a0, 5); lit++; }
    }
  }
  if (!lit) toast('No pairs available right now');
}
function scopePulse(item, dur){
  const mat = item.mesh.material;
  mat.emissive.setHex(0x35c46a);
  mat.emissiveIntensity = 0;
  addFX(new THREE.Object3D(), dur, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*10)) * 0.7 * (1-k*0.5);
  });
}
// «Металлоискатель» (rewarded): показать, ГДЕ копать до сюрприза
function detectorHighlight(){
  const sp = items.find(i => i.surprise && i.alive);
  if (!sp) return;
  level.detectorUsed = true;
  markerFX(sp.p, 0xffc84a);
  for (const it of items){
    if (!it.alive || it.surprise || it.animating) continue;
    const dx = it.p.x - sp.p.x, dz = it.p.z - sp.p.z;
    if (dx*dx + dz*dz < 1.7 && it.p.y > sp.p.y) scopePulse(it, 10);
  }
  Telemetry.ev('rw', { p: 'detector' });
  updateHUD();
}
// Сюрприз раскопан и затапан: бонус и золотое расщепление
function collectSurprise(it){
  it.animating = true;
  destroyItemBody(it);
  wakePhysics('gameplay:L58');
  faceEvent('surprised', 1000); // матрица эмоций ИНТЕРФЕЙСА: клад — «удивлённые» глаза (EYES-CHARACTER-SPEC §5)
  stats.lastAction = performance.now();
  // рыбка дорожает с уровнем: +150 + 5×уровень (баланс-таблица 2026-07-22)
  const bonus = Math.round((SURPRISE_BONUS + SURPRISE_LEVEL_BONUS * levelNum) * scoreBoostMult()); // бустер работает и на клад
  const before = stats.score;
  stats.score += bonus;
  const shown = scoreShownDelta(before, stats.score); // деноминир. прирост (#10)
  scorePop('+' + shown, it.p.clone().setY(it.p.y + 0.6), '#ffc84a', true);
  popFX(it.p);
  dissolveFX(it);
  Sound.play('surprise');
  vibrate(30);
  const s0 = it.mesh.scale.x;
  addFX(new THREE.Object3D(), 0.2, (o,k)=>{ it.mesh.scale.setScalar(s0*(1-k)); });
  setTimeout(()=>afterPause(()=>{
    removeItem(it);
    wakePhysics('gameplay:L70');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 200);
}

// Ореол-призрак досягаемости (метрика v3): САМА ФОРМА предмета, раздутая
// на matchRadius по каждой локальной оси — честный образ зоны «истинный
// зазор <= R» (сфера при неохватной метрике врала бы в обе стороны: у
// стейка зона — плита, не шар). Геометрия ОБЯЗАТЕЛЬНО клонируется:
// stepFX по завершении зовёт dispose — общий кэш геометрий типов трогать
// нельзя (иначе все предметы типа теряют GPU-буферы).
function reachGhostFX(item, color){
  if (!CFG.radiusOn) return;
  const geo = item.mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, s = item.mesh.scale.x;
  const R = Math.min(CFG.matchRadius, 3.6); // в цепи/эндшпиле не больше чаши
  // воздушный вариант (спека владельца): прозрачнее втрое, кромка мягкая и широкая
  const ghost = new THREE.Mesh(geo.clone(), fresnelGhostMat(color, 0.02, 0.16, 1.1));
  ghost.position.copy(item.mesh.position);
  ghost.quaternion.copy(item.mesh.quaternion);
  ghost.scale.set(
    s + R / Math.max(0.05, (bb.max.x - bb.min.x) / 2),
    s + R / Math.max(0.05, (bb.max.y - bb.min.y) / 2),
    s + R / Math.max(0.05, (bb.max.z - bb.min.z) / 2));
  ghost.renderOrder = 10;
  addFX(ghost, 0.9, (o, k) => { o.material.uniforms.op.value = 1 - k; });
}

// ⚠️ ПРОФИЛИРОВКА (2026-07-31): вся работа тапа идёт в ОБРАБОТЧИКЕ СОБЫТИЯ,
// то есть ВНЕ кадрового цикла — кольца loop её не видят, и на кадре тапа
// в профиле висели ~40 мс «ничьих». Копим сюда, loop забирает раз в кадр.
let tapMs = 0;
const tapMsTake = () => { const v = tapMs; tapMs = 0; return v; };
// ⚠️ РАЗБОРКА САМОГО ТАПА (2026-07-31). Спор с ГРАФИКОЙ: их гипотеза —
// «9.6 мс это логика (рейкаст/GJK/доступность)», моя первая версия говорила
// «аллокации». Ни одна НЕ БЫЛА ИЗМЕРЕНА: у меня счётчик постройки видел
// только пылевые облака, а в пути тапа есть ещё `geo.clone()` призрака.
// Три фазы: выбор предмета лучом, отбор кандидатов (там GJK в pairMatch),
// призрак-ореол (клон геометрии). Остаток тапа = хвост doMatch.
let tapPickMs = 0, tapCandMs = 0, tapGhostMs = 0, tapDestroyMs = 0, tapWaveMs = 0;
let tapAccMs = 0, tapFxMs = 0, tapSndMs = 0;
// ⚠️ `rest` СЧИТАЕТСЯ, А НЕ ЗАМЕРЯЕТСЯ, и это не лень: он ловит ВСЁ, чего нет
// в названных фазах (очки, звук, вибро, накопление, сейв, попы). Пока он мал —
// искать там нечего; вырастет — значит появилась новая статья, и вот тогда её
// и разбирать. Именованные фазы без остатка всегда врут на новом коде.
// ⚠️ ИТОГ ПЕРЕДАЁТСЯ АРГУМЕНТОМ, А НЕ ЧИТАЕТСЯ ИЗ tapMs: в loop сначала идёт
// `tapMsTake()`, и он ОБНУЛЯЕТ tapMs — читая его здесь, остаток всегда выходил
// бы нулём. Ровно тот класс, где страж зелен, потому что меряет пустоту.
const tapPhasesTake = (total) => { const v = { pick: tapPickMs, cand: tapCandMs, ghost: tapGhostMs,
    destroy: tapDestroyMs, wave: tapWaveMs, acc: tapAccMs, fx: tapFxMs, snd: tapSndMs };
  v.rest = +Math.max(0, (total || 0) - (tapPickMs + tapCandMs + tapGhostMs + tapDestroyMs
    + tapWaveMs + tapAccMs + tapFxMs + tapSndMs)).toFixed(2);
  for (const k in v) v[k] = +(+v[k]).toFixed(2);
  tapPickMs = tapCandMs = tapGhostMs = tapDestroyMs = tapWaveMs = 0;
  tapAccMs = tapFxMs = tapSndMs = 0; return v; };
function handleTap(x, y){
  const _tap0 = performance.now();
  try { return handleTapInner(x, y); } finally { tapMs += performance.now() - _tap0; }
}
function handleTapInner(x, y){
  if (level.over) return;
  // финал миксера (пар по типам не осталось): очки не тратятся и не
  // начисляются — промахи по сиротам/пустоте БЕЗ штрафа (спека владельца);
  // тап по раскопанному сюрпризу остаётся рабочим
  const finale = !hasAnyPair();
  stats.taps++;
  const _tp0 = performance.now();
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x-rect.left)/rect.width)*2-1, -((y-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = aliveMeshes();
  let hits = raycaster.intersectObjects(meshes, false);
  let item = hits.length ? hits[0].object.userData.item : null;
  if (!item){
    // мягкий подбор: ближайший к точке тапа в экранных координатах
    let best = null, bestD = 34; // px
    for (const it of items){
      if (!it.alive || it.animating) continue;
      const sp = it.p.clone().project(camera);
      const px = (sp.x+1)/2*rect.width + rect.left, py = (-sp.y+1)/2*rect.height + rect.top;
      const d = Math.hypot(px-x, py-y);
      if (d < bestD){ bestD = d; best = it; }
    }
    item = best;
  }
  tapPickMs += performance.now() - _tp0;   // выбор предмета лучом + фолбэк-проекция
  if (!item){ Telemetry.tap(x, y, 'dead'); if (!finale) penalize(null, x, y); return; }
  if (item.animating) return; // растворяющийся: двойной тап давал двойные очки (+300 за сюрприз)

  if (!isAccessible(item)){
    wiggle(item);
    toast(item.surprise ? 'The treasure is still buried' : 'Item is covered from above');
    if (!finale) penalize(item.p);
    return;
  }
  if (item.surprise){ Telemetry.tap(x, y, 'surprise'); collectSurprise(item); return; } // раскопанный сюрприз собирается тапом
  if (item.bomb){ detonateBomb(item); return; } // бомба: взрыв вместо матча, очков нет
  if (item.frozen){
    // ГЛЫБА (спека 2026-08-13): готова — тап РАЗБИВАЕТ; рано — штраф КАК У
    // КАМНЯ (слово владельца) + подсказка, сколько пар осталось.
    Telemetry.tap(x, y, 'frozen');
    if (item.frozenReady){ breakIce(item); }
    else {
      penalizeDouble(item);
      const осталось = Math.ceil((item.frozenNeedItems - item.frozenGotItems) / 2);
      try { toast('Frozen! Collect ' + осталось + ' more pair' + (осталось > 1 ? 's' : '') + ' of this item'); } catch(e){}
    }
    return;
  }
  const _tc0 = performance.now();
  const copies = items.filter(i => i.alive && !i.animating && i !== item && i.key === item.key);
  const accessible = copies.filter(i => isAccessible(i));
  let eligible = accessible.filter(i => pairMatch(i, item));
  // КАП ГРУППЫ (спека владельца 2026-07-27 «поставь кап на 8»): в матч уходит
  // не больше MATCH_MAX_N предметов ВСЕГО, включая тапнутый. Лишние
  // отсекаются по ДАЛЬНОСТИ — остаются ближайшие по истинному зазору (та же
  // метрика, что у жертв бомбы): визуально «схлопнулось вокруг пальца».
  // Отсечённые остаются жить и матчатся следующим тапом.
  if (eligible.length > MATCH_MAX_N - 1){
    eligible = eligible
      .map(i => ({ i, d: pairDist(i, item) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MATCH_MAX_N - 1)
      .map(v => v.i);
  }

  // ореол досягаемости: белый — матч есть, красный — промах
  tapCandMs += performance.now() - _tc0;   // отбор кандидатов, внутри GJK pairMatch
  const _tg0 = performance.now();
  reachGhostFX(item, eligible.length ? 0xffffff : 0xff5a64);
  tapGhostMs += performance.now() - _tg0;   // ореол-призрак: КЛОН геометрии предмета

  if (eligible.length){
    // все одинаковые (тип, любой размер) в сфере — разом, даже нечётным числом;
    // оставшихся без пары в конце уничтожит миксер
    Telemetry.tap(x, y, 'match');
    doMatch([item].concat(eligible));
    return;
  }
  if (finale){ wiggle(item); return; }
  // ⚠️ ТАП ПО ДОСТУПНОМУ ПРЕДМЕТУ БЕЗ ПАРЫ — НЕ ОШИБКА И НЕ ШТРАФУЕТСЯ
  // (спека владельца 2026-07-29). Он потыкал в цветные предметы у дна чаши и
  // получил штраф; замер объяснил почему: на ур.20 Hard доступных предметов 50,
  // а доступных ПАР 11 — то есть больше половины «цветных» соединить не с чем
  // в принципе. Вуаль отвечает на вопрос «ДОТЯНУСЬ ЛИ», а игрок читает её как
  // «МОГУ ЛИ ИСПОЛЬЗОВАТЬ»; это разные множества, и разрыв огромный. Наказывать
  // за то, что игра сама показала зелёный свет, нечестно.
  // ⚠️ ОСТАЛЬНЫЕ ПРОМАХИ ШТРАФ СОХРАНЯЮТ: пустое место, ПЕРЕКРЫТЫЙ предмет
  // (он завуалирован, игрок это видит) и камень (двойной штраф-обучение).
  // ⚠️ НЕ ТРОГАЕМ stats.lastAction: иначе тапами по одинокому предмету можно
  // было бы бесконечно откладывать помол — это была бы дыра, а не поблажка.
  // ⚠️ ТУРБО ТОЖЕ НЕ СТРАДАЕТ: penalize сбрасывает набор цепи и роняет
  // радиус-лесенку, а раз это не ошибка — ничего сбрасывать не за что.
  // Обратная связь остаётся: красный ореол уже нарисован выше + дрожание.
  Telemetry.tap(x, y, 'nopair');   // отдельно от 'miss' — в карте промахов это другой случай
  wiggle(item);
  const nearBuried = copies.filter(i => pairMatch(i, item));
  if (accessible.length){
    accessible.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    // ⛔ ПУНКТИРНАЯ ЛИНИЯ К ДАЛЬНЕЙ ПАРЕ СНЯТА (слово владельца 2026-08-07:
    // «убери пунктирную линию от объекта к объекту, которая указывает на
    // расстояние»). Вместе с ней ранее снят и тост «Pair is too far» — то
    // есть подсказка о недостижимой паре теперь молчит целиком; вернётся,
    // если он попросит новую форму. Функция lineFX жива (70-fx) и может
    // понадобиться другим механикам — удалять её не надо.
    // ⛔ ТОСТ СНЯТ (слово владельца 2026-08-05: «убери нижний тост сообщение,
    // который говорит, что пары слишком далеко. Его нужно визуально переделать
    // и поменять позицию, займемся этим потом»). Подсказку НЕСЁТ ЛИНИЯ выше —
    // она показывает, КУДА тянуться, и остаётся. Текст вернётся с новой
    // формой и местом по его слову; строку не изобретать заново.
  } else if (nearBuried.length){
    nearBuried.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(nearBuried[0].p, 0xffb224);
    toast('Pair is near but covered');
  } else if (copies.length){
    copies.sort((a,b)=>a.p.distanceTo(item.p)-b.p.distanceTo(item.p));
    markerFX(copies[0].p, 0xff6369);
    toast('Pair is deeper and farther');
  }
  wiggle(item);
}

// ---------- Подсказка ----------
// Находит лучшую доступную группу (максимум одинаковых в радиусе) и подсвечивает
function findHintGroup(){
  refreshAccessibility();
  const acc = items.filter(i => i.alive && !i.animating && !i.surprise && i.accessible);
  // вершина кучи — по НЕлетящим, чтобы свежая досыпка не задирала планку
  let pileTop = 0;
  for (const it of items) if (it.alive && it.p.y < FUNNEL.H) pileTop = Math.max(pileTop, it.p.y);
  const surfaceY = pileTop - HINT_SURFACE_DEPTH;
  let best = null, bestScore = null;
  for (const it of acc){
    let grp = acc.filter(o => o !== it && o.key === it.key && pairMatch(o, it));
    // тот же кап, что и в тапе (спека владельца 2026-07-27): подсказка не
    // должна обещать группу больше той, что реально соединится
    if (grp.length > MATCH_MAX_N - 1){
      grp = grp.map(o => ({ o, d: pairDist(o, it) })).sort((a, b) => a.d - b.d)
               .slice(0, MATCH_MAX_N - 1).map(v => v.o);
    }
    if (!grp.length) continue;
    const full = [it].concat(grp);
    // ПОВЕРХНОСТНЫЙ ЭШЕЛОН (просьба тестеров, слово владельца 2026-08-03):
    // группы, целиком лежащие в верхнем слое кучи, всегда бьют глубокие —
    // глубина «только в крайнем случае». Внутри эшелона — прежний порядок:
    // больше группа, при равенстве ближе пара.
    const surface = full.every(o => o.p.y >= surfaceY) ? 1 : 0;
    const score = { surface, len: full.length, d: pairDist(grp[0], it) };
    if (!bestScore ||
        score.surface > bestScore.surface ||
        (score.surface === bestScore.surface && (score.len > bestScore.len ||
         (score.len === bestScore.len && score.d < bestScore.d)))){
      best = full; bestScore = score;
    }
  }
  hintLastPick = best ? { keys: best.map(o => String(o.key)), anchorY: +best[0].p.y.toFixed(2),
                          pileTop: +pileTop.toFixed(2), surface: bestScore.surface === 1 } : null;
  return best;
}
let hintLastPick = null; // самоотчёт ПОСЛЕДНЕГО выбора — только для стражей/стенда
// ПОДСКАЗКА ЗА РЕКЛАМУ (спека владельца 2026-07-28) — зеркало ad-встряски:
// заряды кончились → предлагаем ролик → +1 заряд. Доступна ТОЛЬКО при нуле
// зарядов (как ad-встряска открывается лишь после бесплатных) и в пределах
// пер-уровневого капа. Контракт для ИНТЕРФЕЙСА: этой ручкой они решают,
// показывать ли на кнопке лайм-бейдж «Ad».
function adHintAvailable(){
  return !!(level && !level.over && !intro && hints() < 1 && level.adHints > 0);
}
// Ролик за заряд. Подтверждающего оверлея НЕТ намеренно: кнопка сама несёт
// бейдж «Ad», тап по ней — уже осознанный выбор (у встряски оверлей остался
// историческим, её поток не трогаю).
function requestAdHint(){
  if (!adHintAvailable()) return false;
  Ads.showRewarded(()=>{ // награда только после досмотра (78-ads)
    // ⚠️ ЗАРЯД ДАЁМ ВСЕГДА, даже если уровень кончился за время ролика:
    // игрок ролик ДОСМОТРЕЛ, а заряд пожизненный (he) и не пропадает —
    // в отличие от встряски, которой на мёртвом уровне некого трясти.
    addHints(1);
    if (level) level.adHints--;
    adHintCarry = Math.max(0, adHintCarry - 1); // кап переживает Restart той же партии
    stats.adHintsUsed++;
    Telemetry.ev('rw', { p: 'hint' });
    updateHUD();
    if (!level.over && !intro) showHint(); // свежий заряд тратим сразу — игрок жал «подсказку»
  }, (reason) => {
    if (reason !== 'unavailable') return;              // закрыл сам — без подсказки
    // ролик не подобрался: заряд ВЫДАЁМ (слово владельца 2026-08-05), но
    // пер-уровневый кап рекламных подсказок не трогаем — он про показы
    addHints(1);
    stats.adHintsUsed++;
    Telemetry.ev('rw_nofill', { p: 'hint' });
    updateHUD();
    if (level && !level.over && !intro) showHint();
  });
  return true;
}
function showHint(){
  if (level.over || intro) return;
  if (hints() < 1){
    if (adHintAvailable()){ requestAdHint(); return; } // ролик вместо отказа
    toast('No hints left'); return;
  }
  const grp = findHintGroup();
  if (!grp){
    toast('Доступных пар нет — встряхните!'); // группа не найдена — подсказку НЕ тратим
    return;
  }
  spendHint(); // числимый ресурс (спека владельца: старт 3, +1 за уровень)
  Telemetry.ev('spend', { item: 'hint' });
  reachGhostFX(grp[0], 0xffe066);
  grp.forEach(it => hintPulse(it));
  // КАМЕРА ПОДЪЕЗЖАЕТ к якорю подсказки (просьба тестеров, слово владельца
  // 2026-08-03) — мягкий полёт, любой жест игрока его обрывает (90-input)
  try { hintCamFly(grp[0]); } catch(e){}
  updateHUD();
}
function hintPulse(item){
  const mat = item.mesh.material;
  mat.emissive.setHex(0xffb020);
  mat.emissiveIntensity = 0;
  // 3.2с и множитель 9 (слово владельца 2026-08-04 «моргание подсказки
  // увеличь на 1 секунду»; было 2.2/6 — частота полуволн сохранена)
  addFX(new THREE.Object3D(), 3.2, (o,k)=>{
    if (!item.alive || k > 0.95){ mat.emissiveIntensity = 0; return; }
    mat.emissiveIntensity = Math.max(0, Math.sin(k*Math.PI*9)) * 0.8 * (1-k);
  });
}

// ---------- Миксер ----------
// Режим наказания (простой > level.idleLimit): раз в MIXER_PERIOD нижний предмет
// затягивает в лопасти (тонет с вращением), его пара расщепляется вместе с ним,
// за пару отнимаются очки.
function mixerGrind(){
  const cand = items.filter(i => i.alive && !i.animating && !i.surprise && !i.bomb && !i.frozen); // сюрприз и бомбу миксер-наказание не ест (их доедает финал)
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  const twin = cand.find(i => i !== low && i.key === low.key);
  const group = twin ? [low, twin] : [low];
  group.forEach(it => { it.animating = true; destroyItemBody(it); });
  wakePhysics('gameplay:L182');
  const grindBefore = stats.score;
  if (scorePenalty(MIXER_PENALTY)){ // ур.1 без штрафов; ур.<=5 кламп нулём (баланс-таблица 2026-07-22)
    const shown = scoreShownDelta(stats.score, grindBefore); // деноминир. падение чипа (#10)
    if (shown > 0) scorePop('-' + shown, low.p.clone().setY(low.p.y + 0.8), '#e5484d', true);
  }
  Sound.play('grind');
  vibrate(40);
  grindShred(low, 0.5, 0.28); // двухфазный помол: захват -> шинковка в осколки (наказание — тряска ярче)
  if (twin) dissolveFX(twin); // близнец не под ножами — уходит трухой (парность)
  camShake = Math.max(camShake, 0.22);
  setTimeout(()=>afterPause(()=>{
    group.forEach(removeItem); // осколки/пыль спавнит grindShred на шинковке
    wakePhysics('gameplay:L198');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 560);
}
// Финальная зачистка: парных не осталось — миксер уничтожает остатки (без штрафа)
function finaleGrind(){
  const cand = items.filter(i => i.alive && !i.animating);
  if (!cand.length) return;
  cand.sort((a,b) => a.p.y - b.p.y);
  const low = cand[0];
  if (low.surprise){ collectSurprise(low); return; } // сюрприз финал бережно собирает с бонусом
  low.animating = true;
  destroyItemBody(low);
  wakePhysics('gameplay:L211');
  Sound.play('grind');
  // финал по канону СПОКОЙНЫЙ (автосбор без очков) — тряску помола делаем
  // лёгкой (0.1), а не наказательной 0.28: иначе камера дёргалась бы каждые
  // 0.5 с весь финал (~8-10 с). Ревью 2026-07-23.
  grindShred(low, 0.4, 0.1); // тот же помол, чуть короче (каденция финала 0.5 с) + мягкая тряска
  setTimeout(()=>afterPause(()=>{
    removeItem(low);
    wakePhysics('gameplay:L222');
    refreshAccessibility(); updateHUD(); checkEnd();
  }), 410);
}

// ---------- Встряска ----------
function performShake(){
  wakePhysics('shake');
  // К концу уровня встряска ПРИТЯГИВАЕТ пары друг к другу (спека владельца:
  // «иначе игрок не может совместить последние пары и злится»). Доля
  // притяжения растёт по мере опустошения: >=40 живых — чистое рыхление,
  // <=12 — почти чистое притяжение к ближайшему близнецу по типу.
  let aliveCnt = 0;
  for (const it of items) if (it.alive && !it.surprise) aliveCnt++;
  const pullK = Math.max(0, Math.min(1, (40 - aliveCnt) / 28));
  for (const it of items){
    if (!it.alive || !it.body) continue;
    let ax = 0, az = 0;
    if (pullK > 0 && !it.surprise){
      let twin = null, bd = 1e9;
      for (const ot of items){
        if (ot === it || !ot.alive || ot.animating || ot.key !== it.key) continue;
        const d = ot.p.distanceToSquared(it.p);
        if (d < bd){ bd = d; twin = ot; }
      }
      if (twin){
        const dx = twin.p.x - it.p.x, dz = twin.p.z - it.p.z;
        const len = Math.hypot(dx, dz) || 1;
        ax = dx/len; az = dz/len;
      }
    }
    // сила ×1.2 (спека владельца: «усиль эффект встряхивания на 20%»)
    const pull = 7.8 * pullK, rnd = 1 - 0.75*pullK;
    // вес (вариант 1, спека владельца 2026-07-21): множитель пачки ТОЛЬКО
    // на случайное рыхление/подброс/вращение; притяжение к близнецу (pull)
    // остаётся нормированным — оно функциональное, не «ощущенческое»
    const wk = it.shakeK || 1;
    impulseBody(it, (Math.random()-0.5)*9*rnd*wk + ax*pull, (5.4 + Math.random()*6)*wk, (Math.random()-0.5)*9*rnd*wk + az*pull);
    spinBody(it, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk, (Math.random()-0.5)*7.2*wk);
  }
  camShake = 0.42; // +20% и на камеру
  stats.lastAction = performance.now(); // встряска — тоже действие, миксер откладывается
  Sound.play('shake');
  setTimeout(()=>{ refreshAccessibility(); updateHUD(); }, 900);
}
function requestShake(){
  if (level.over || intro) return;
  if (level.shakes > 0){
    useFreeShake(); // без подтверждения — сразу (по требованию владельца)
  } else if (purchasedShakes() > 0){
    // КУПЛЕННЫЙ ЗАПАС (бандл) — между бесплатными и рекламой: уже оплачен,
    // поэтому тратится так же молча, без оверлея-подтверждения.
    spendPurchasedShake(); stats.shakesUsed++;
    performShake(); updateHUD();
  } else if (level.adShakes > 0){
    // РОЛИК СРАЗУ, БЕЗ ПОДТВЕРЖДЕНИЯ (спека владельца 2026-07-28: «Shake с
    // рекламой работает по принципу подсказки — единое решение, сразу
    // запускает рекламу»). Оверлей adAskOverlay (Cancel/Watch) УДАЛЁН: у
    // подсказки его нет, слово «Ad» на кнопке само делает тап осознанным.
    startAd();
  } else {
    toast('No shakes left');
  }
}
function buyCoinShake(){
  if (level.over || intro) return; // уровень успел кончиться — монеты не списываем
  if (!spendCoins(PRICE_SHAKE)){ toast('Not enough coins'); return; }
  Telemetry.ev('spend', { item: 'shake' });
  performShake(); updateHUD();
}
function useFreeShake(){
  level.shakes--; stats.shakesUsed++;
  performShake(); updateHUD();
}
function startAd(){
  // ⚠️ ОТМЕНА МОЕЙ ЖЕ СПЕКИ 2026-07-29 «нет ролика — нет награды» (слово
  // владельца 2026-08-05: «если реклама не подобралась, всё равно разрешать
  // шейк и типс»). Это НЕ дыра экономики: дыра была в ПОДДЕЛЬНОМ рекламном
  // экране, который делал вид, что ролик идёт. Здесь показа не было, игрок
  // видит честный тост, а действие ему всё равно дают — площадка просто не
  // подобрала ролик, и наказывать за это игрока владелец не хочет.
  // ⚠️ Только на 'unavailable': закрыл ролик сам — награды нет (78-ads).
  Ads.showRewarded(()=>{ // награда только после досмотра (см. 78-ads)
    // смену уровня закрывает Ads.cancel() в genLevel; здесь — конец ТОГО ЖЕ
    // уровня, наставший за время ролика (встряске некого трясти)
    if (level.over) return;
    level.adShakes--; stats.adShakesUsed++;
    Telemetry.ev('rw', { p: 'shake' });
    performShake(); updateHUD();
  }, (reason) => {
    if (reason !== 'unavailable') return;              // закрыл сам — без встряски
    if (!level || level.over || intro) return;
    stats.adShakesUsed++;
    Telemetry.ev('rw_nofill', { p: 'shake' });
    toast('Free shake');
    performShake(); updateHUD();
  });
}
