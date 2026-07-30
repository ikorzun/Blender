# BLENDO — бриф на отрисовку комикса нейросетью (v1, 2026-07-31)

Запрос владельца: «распиши историю, чтобы отдать нейронке для комикса».
Замена моих плоских SVG-черновиков (86-story.js) на рисованные панели —
опция, прямо предусмотренная docs/STORY-SPEC.md §3 («ПОВЕСТВОВАНИЕ черновик →
ГРАФИКА полировка», рисованные/AI-панели при желании владельца).

⚠️ Панелей РОВНО ВОСЕМЬ, они уже живут в игре и привязаны к триггерам. Новый
арт заменяет их один-в-один; менять состав = менять код. Соотношение сторон
**3:2** (в игре viewBox 360×230, показ до 460px по ширине).

---

## 1. История в двух абзацах

Блендер одержим **Великим Рецептом** — смузи из всего сущего. Фрукты, звери,
машины, в конце списка — Земля. Мир для него это ингредиенты, и он идёт по
разделам, раздел за разделом.

Главный ход — **драматическая ирония**. Он уверен, что игрок его лучший
помощник: совмещение предметов на его глазах выглядит как уничтожение (вещи
лопаются в труху, летят сок и искры), он в восторге от комбо и НЕ ЗНАЕТ, что
предметы телепортируются в музей игрока. Игрок знает больше злодея с первой
минуты. К середине пути блендер начинает что-то подозревать, а затем видит
полку музея — целые, довольные, «смолотые» им вещи — и приходит в ярость.
С этого места вся эскалация сложности читается как его контрмеры.

---

## 2. Каноны комикса — что требовать от нейросети

1. **БЕССЛОВЕСНО.** Ни букв, ни реплик, ни звукоподражаний. Это инвариант:
   игра не локализуется, и панель должна читаться в любой стране. Смысл несут
   глаза, пузырь мысли и пиктограммы.
2. **Одна панель = один бит.** Не собирать два события в кадр. Если хочется
   «и то, и это» — значит нужны две панели, а их количество зафиксировано.
3. **Панель читается за 1–2 секунды.** Проверка: прищурься — считывается ли
   смысл по силуэтам? Если нет, панель перегружена.
4. **Крупность меняется по арке.** Общий план (герой + объект) для установки,
   средний для действия, КРУПНЫЙ на глаза — для эмоционального удара. Шок и
   ярость обязаны быть крупными, иначе твист не сработает.
5. **Правило 180°.** Герой во всех панелях смотрит В ОДНУ сторону (у нас —
   слева направо, на объект своего внимания). Если он «перепрыгнет» на другую
   сторону кадра, читатель решит, что это другой персонаж.
6. **Пустое место — это пауза.** Фон простой, без деталей; вокруг ключевого
   объекта воздух. Мобильный экран не прощает шума.
7. **Силуэт решает.** Персонаж обязан узнаваться чёрным силуэтом: банка +
   два круглых глаза. Никаких рук, ног, рта и бровей — их нет в игре.
8. ⚠️ **ГЛАВНАЯ ПРОБЛЕМА AI-КОМИКСОВ — НЕПОСТОЯНСТВО ГЕРОЯ.** Лечится только
   тем, что блок «character lock» (ниже) вставляется в КАЖДЫЙ промт дословно,
   без переформулировок, и первая удачная панель используется как reference
   для остальных.

---

## 3. Блок стиля (вставлять в каждый промт, английский)

```
STYLE: casual mobile 3D game render, soft matcap-like shading, no textures,
chunky rounded low-poly shapes, thick clean silhouettes, flat bright lighting,
no photorealism, no gritty detail. Wide 3:2 panel, simple uncluttered
background, generous negative space, subject centered-left.
PALETTE: sky gradient periwinkle #6e86ff to pale turquoise #ccfff8 (day) or
deep blue #031d83 to magenta #ff2fdc (night); ink #1d1c26; pure white; lime
accent #c0ff47; candy-saturated object colors (high saturation, medium
lightness).
MOOD: bright, playful, friendly-villain comedy. Silent comic panel, absolutely
no text, no letters, no numbers, no speech bubbles with words.
```

## 4. Character lock (дословно в каждый промт)

```
CHARACTER: "the Blender" — a chunky transparent glass blender jar, slightly
tapered, thin light outline, empty inside. It has NO face, NO mouth, NO
eyebrows, NO arms or legs. Its entire expression comes from TWO LARGE WHITE
CIRCULAR EYES with big black round pupils, floating over the front of the jar
like googly eyes. The eyes are the character. Same jar proportions and same
eye size in every panel.
```

Настроения глаз (менять ТОЛЬКО зрачки и веки, форма белков постоянна):
| Панель | Настроение | Как рисовать |
|---|---|---|
| P1 | спокойное, деловое | зрачки по центру, чуть вниз — сверяется со списком |
| P2 | мечтательное | зрачки подняты вверх |
| P3 | обожание | зрачки распахнуты на весь белок |
| K2 | сомнение | зрачки уведены вбок, лёгкий наклон банки |
| K3 | хитрое | зрачки вниз-вбок, верхние веки полуприкрыты |
| K4a | нейтральное, ещё не понял | зрачки по центру |
| K4b | шок | белки увеличены, зрачки крошечные |
| K4c | ярость | «брови» срезают верх-внутренние углы белков клином |

---

## 5. Раскадровка — 8 промтов

### ПРОЛОГ (показывается ОДИН раз перед первой игрой)

**P1 — «Рецепт».** Установка: он собирается смолоть всё на свете.
```
[STYLE] [CHARACTER LOCK]
The Blender stands at the left, calm businesslike eyes, looking right at a
large open recipe book floating beside it. The book's left page shows a
vertical checklist of icons: an apple with a bright lime checkmark next to it,
below it an animal head, below it a small car. The right page shows three
small dots and, under them, a big planet Earth globe drawn as a simple line
sphere. The order reads top to bottom, ending on the planet.
```

**P2 — «Мечта».** Масштаб замысла: смузи из планеты.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes rolled upward, dreaming. A large rounded
thought bubble occupies the right two thirds of the panel, connected to the
jar by two small circles. Inside the bubble: a blender jar exactly like the
character's, and inside that jar sits planet Earth. Nothing else in the bubble.
```

**P3 — «Помощник».** Ирония установлена: он думает, что игрок ему помогает.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes wide with adoration (pupils huge), two
small lime hearts floating above it. A thought bubble at the upper right
shows a simple sequence: a finger-tap ripple icon, an arrow pointing right,
and a puff of scattered dust particles. The bubble reads left to right.
```

### ВЕХИ (приходят по ходу игры)

**K2 — «Куда?..».** Первое сомнение. Приходит, когда игрок впервые докопит
первый тип до ступени накопления.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes shifted to the side in suspicion, jar
tilted very slightly. A thought bubble at the upper right shows an apple on
the left, a faded arrow in the middle, and a large white question mark on the
right where the apple should have arrived. The question mark is a drawn
symbol, not a typographic character.
```

**K3 — «Раздел второй».** План идёт по плану — он ещё уверен, что побеждает.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, sly narrowed eyes (upper lids half closed,
pupils down-left). To the right, a tall recipe page: at the top an apple with
a bright lime checkmark, a downward arrow below it, and at the bottom an
animal head circled with a thin white ring as the next target.
```

**K4a — «Полка».** Твист, панель 1: он видит то, чего не ожидал.
```
[STYLE] [CHARACTER LOCK]
Wide establishing shot. The Blender small at the lower left, neutral eyes,
looking right. Across the panel a long simple shelf. Standing on the shelf,
intact and pristine: an apple, an animal, a small car — the very things he
believes he destroyed. Small lime sparkles float above them. Everything is
calm and tidy, like a museum display.
```

**K4b — «Шок».** Твист, панель 2: КРУПНО.
```
[STYLE] [CHARACTER LOCK]
Close-up. The Blender fills the center of the panel, much larger than in
previous panels. Its eyes are enormous with tiny shrunken pupils — pure shock.
Behind it, blurred and small, the same shelf with the intact apple, animal and
car. All attention is on the eyes.
```

**K4c — «Ярость».** Твист, панель 3: он всё понял.
```
[STYLE] [CHARACTER LOCK]
Close-up. The Blender centered, eyes narrowed into an angry wedge shape —
angled dark brows cutting the top inner corners of the white eyes. Five
stylized flames surround the jar, rising from the sides and one above:
orange-red #ff5a3c outer flame with a lighter #ffc247 inner core. No smoke,
no debris, clean shapes.
```

---

## 6. Негативный промт

```
NEGATIVE: text, letters, words, numbers, captions, speech bubbles with
writing, watermark, signature, photorealism, gritty realism, horror, human
characters, hands, faces, mouth on the jar, eyebrows as hair, cluttered
background, busy patterns, motion blur, heavy shadows, dark moody lighting.
```

## 7. Практика: как получить постоянного героя

1. Сначала сгенерировать **P1** и итерировать, пока герой не понравится.
2. Удачную панель отдать как **image reference / style reference** во все
   остальные семь промтов — без этого банка и глаза «поплывут».
3. Проверять серию ВМЕСТЕ, а не по одной: положить восемь панелей рядом и
   искать, где герой изменил пропорции.
4. Панели K4a → K4b → K4c обязаны читаться как ОДНА сцена: одна и та же полка,
   один и тот же ракурс, меняется только крупность и эмоция.
5. Готовые PNG отдать ГРАФИКЕ — подмена SVG на картинки в 86-story.js
   тривиальна (панель это функция, возвращающая разметку).
