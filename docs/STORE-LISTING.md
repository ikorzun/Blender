# Тексты листинга площадок — BLENDO (v1, 2026-07-30)

Направление ПОВЕСТВОВАНИЕ. Запрос владельца: тексты для формы паблишинга
(поля «Game description» и «How to play»), отвечающие требованиям площадок
и работающие на SEO.

⚠️ **ИМЯ ИГРЫ — BLENDO** (решение владельца 2026-07-30; кандидаты BLENDO RUSH /
BLENDO SORT НЕ выбраны). «Миксер» — рабочее имя папки и веток, во внешних
текстах не употребляется.

## 0. Инварианты этих текстов

- **Соответствие фактической механике.** Ни одной выдуманной фичи: чаша,
  таймер ножей, комбо/Power chain, встряска, подсказка, рыбка, бомба, камни,
  коллекция, Hard-режим — всё реализовано. Несоответствие = снятие листинга.
- **Лор соблюдён:** матч = СПАСЕНИЕ предмета (он уходит в коллекцию), помол и
  бомба = потеря. Формулировки «fuse and burst» из первой редакции ОТМЕНЕНЫ —
  это взгляд блендера, а не игрока (см. docs/STORY-SPEC.md §1).
- **Запрещено (типовые причины отклонения):** ссылки, упоминания других
  площадок и конкурентов, обещания призов/реальных денег, слово «beta»,
  «download/install» в утвердительном смысле, keyword stuffing.
- **SEO:** ключ `free 3D physics puzzle game` в первых ~120 знаках; имя BLENDO
  трижды (первое предложение, закрывающая строка, meta); жанровые слова
  вплетены в предложения, а не списком; текст уникальный (дубли режут выдачу).

## 1. Game description

```
The blender has a recipe. Every fruit, every animal, every car, every last
thing on Earth goes into the jar — and he is absolutely certain that you are
his favorite little helper.

He is wrong. BLENDO is a free 3D physics puzzle game built on that
misunderstanding: every time you match objects, they burst into juice and
sparks right in front of him and quietly slip away into your museum. He
applauds your combos. He has no idea he is being robbed, one exhibit at a
time.

Tap two or more of the same kind to save them. Everything in the jar is a real
physics body, so the pile shifts and settles as it empties — dig from the top
down, chain matches for double points and a lightning-fed Power Chain, shake
the jar when it jams, and get the golden fish out of the bottom before he
spots it. Stall too long and the blades below take whatever you failed to
rescue. That part is legitimately his.

One tap to play, a new kind of object every level, and a collection that
slowly fills with everything you stole from under his nose. BLENDO plays
instantly in your browser on mobile, tablet and desktop — no download,
no install.
```

## 2. How to play

```
GOAL
Save the objects. Tap any object that isn't buried to match it with every
identical one nearby — two is enough, but bigger groups pay far more. To the
blender it looks like destruction; the objects land safely in your collection.
Empty the jar to finish the level and earn up to 3 stars for your score.

CONTROLS
• Tap / left click — match objects
• Drag — rotate the jar
• Pinch / mouse wheel — zoom in and out
• Space or the Shake button — shake the jar
• Hint button — highlight the best group available

WATCH THE TIMER
The number under his eyes counts down to the blades. When it hits zero he
stops waiting and starts grinding objects himself, and every one he takes
costs you points. Any match or shake resets his patience, so keep moving.

BUILD COMBOS
Match a group of three or more, or land two matches quickly in a row, to
ignite a combo: double points and a wider matching reach. Keep the streak
alive to trigger a Power Chain — lightning, falling objects and a fully
boosted reach. He loves this. He thinks you're getting better at helping.

WHEN YOU'RE STUCK
Shake the jar to loosen the pile. Late in a level a shake also pulls the last
pairs toward each other, so you always have a way out.

GOOD TO KNOW
• The black iridescent ball is a bomb — tap it to clear everything around it.
  Objects caught in the blast are gone for good, not saved.
• Grey rocks never match, and tapping one costs you points.
• The golden fish at the very bottom is a delicacy he has been saving. Take it.
• Every level you win adds a new kind of object, so the jar gets busier and
  harder to read. Switch on Hard mode in the menu to keep buried objects
  locked until you uncover them.
```

## 3. Остальные поля формы

**Title:** `BLENDO — 3D Blender Puzzle`
⚠️ Голое `BLENDO` в выдаче конкурирует со словом «blender» (миксер И 3D-редактор,
очень сильный домен) — поэтому рядом с именем ВСЕГДА слово `puzzle`.

**Meta description (139 знаков):**
```
The blender wants to grind up the world and thinks you're helping. Free 3D
puzzle game: match objects, save them, play in your browser.
```

**Теги:** puzzle, 3d, physics, match, casual, brain, one button, mobile,
arcade, logic, relaxing, blender, sorting, collection

## 4. Размеры и что резать

Описание ~1020 знаков, How to play ~1450. Лимиты формы не сверялись.
Если поле короче — резать в этом порядке: (1) блок `GOOD TO KNOW`,
(2) абзац `WHEN YOU'RE STUCK`, (3) третий абзац описания (механика),
НИКОГДА — первые два абзаца описания (там имя, жанровый ключ и премиса).

## 5. Почему премиса обязана быть в тексте

Сюжет в игре **бессловесный** (пиктограммы, ноль реплик — инвариант
STORY-SPEC §0, ради отсутствия локализации). Карточка площадки — ЕДИНСТВЕННОЕ
место, где ирония «блендер думает, что ты помогаешь» проговаривается словами.
Если текст свести к перечислению механик, игрок узнает о ней только из
виньеток, которые скипаются одним тапом.
