# Классификация предметов по материалу — под звук совмещения

Заказ владельца 2026-08-10: «классифицируй предметы по типу материала, чтобы я
смог записать для каждого типа свой звук совмещения предметов».

⚠️ **РАЗМЕТКА СНЯТА С ЖИВОГО ПУЛА, А НЕ ПО ПАМЯТИ**: имена вычитаны из
`src/app/30-shapes.js`, покрытие проверено перебором — **120 из 120, ноль
пропусков, ноль дублей**. Появится новая партия моделей — прогнать проверку
заново (скрипт ниже), иначе новые типы молча останутся без звука.

⛔ **ПОЛЕ `mat` В `TYPES` ДЛЯ ЭТОГО НЕ ГОДИТСЯ, ХОТЯ НАЗЫВАЕТСЯ ТАК ЖЕ.** Оно
рендерное: `40-items.js` выбирает по нему matcap и вершинные цвета, а
`50-physics.js` — ПЛОТНОСТЬ тела. Сейчас у всех 120 там стоит `'soft'`, то есть
информации оно не несёт, но перепись его значений сменила бы материалы и вес
предметов в игре. Звуку нужен ОТДЕЛЬНЫЙ признак (предлагаю `snd`).

## Десять голосов

Восемь основных плюс два маленьких. Считать «типом материала» стоит именно
голос: игрок различает звуки на слух, а не по пачке ассетов — поэтому пачки
`food`, `holiday`, `survival` РАЗОБРАНЫ между голосами, а `car`+`brick`+`toycar`
наоборот слиты в один.

| голос | шт | что это звучит | характер записи |
|---|---:|---|---|
| `juicy` | 26 | фрукты, овощи, зелень | сочный чавк, брызги, короткий |
| `dough` | 8 | выпечка и тесто | глухой мягкий шлепок, крошка |
| `meat` | 7 | мясо, рыба, сыр, бургер | плотный влажный удар |
| `cream` | 3 | мороженое | холодный «плюх», липкий хвост |
| `plush` | 26 | звери и мягкие игрушки | пуховый пуф, лёгкий писк |
| `plastic` | 25 | кубики, машинки, игрушки | сухой щелчок, клац |
| `wood` | 11 | бочки, ящики, сундуки, инструмент | деревянный стук, скрип |
| `metal` | 10 | ядра, шестерни, поршни, ведро | звон, лязг |
| `glass` | 1 | бутылка | звяк (можно не записывать — см. ниже) |
| `paper` | 3 | подарки, корзина | шорох картона (можно не записывать) |

⚠️ **`glass` и `paper` — по желанию.** В них 1 и 3 предмета; если записывать их
отдельно не хочется, `glass` уходит в `metal`, `paper` — в `plastic`, и ничего
не ломается. Восемь голосов — рабочий минимум, десять — потолок.

## Полная разметка

**juicy (26)** — foodapple, foodavocado, foodbanana, foodbeet, foodbroccoli,
foodcabbage, foodcarrot, foodcauliflower, foodcherries, foodcoconut, foodcorn,
foodeggplant, foodgrapes, foodleek, foodlemon, foodmushroom, foodonion,
foodorange, foodpaprika, foodpear, foodpineapple, foodpumpkin, foodstrawberry,
foodtomato, foodwatermelon, forestplant

**dough (8)** — foodcakebirthday, foodchinese, foodcookie, foodcroissant,
foodcupcake, fooddonutsprinkles, foodtaco, holidaygingerbreadman

**meat (7)** — foodburger, foodcheese, foodfish, foodhotdog, foodturkey,
foodwholeham, survivalfish

**cream (3)** — foodicecream, foodicecreamscoopmint, foodsundae

**plush (26)** — animalbeaver, animalbee, animalbunny, animalcat,
animalcaterpillar, animalchick, animalcow, animalcrab, animaldeer, animaldog,
animalelephant, animalfish, animalfox, animalgiraffe, animalhog, animalkoala,
animallion, animalmonkey, animalpanda, animalparrot, animalpenguin, animalpig,
animalpolar, animaltiger, holidayreindeer, holidaysnowman

**plastic (25)** — brickbar, brickclassic, brickcorner, brickduo, brickround,
bricksquare, brickstud, carambulance, carbox, carcone, carfiretruck,
cargarbagetruck, carkartoobi, carpolice, carrace, cartaxi, cartractor, cartruck,
carvan, holidayhanukkahdreidel, toycaritemcoingold, toycaritemcone,
toycarvehiclemonstertruck, toycarvehiclespeedster, toycarvehiclevintageracer

**wood (11)** — holidaynutcracker, piratebarrel, piratechest, piratecrate,
piratedoor, piratepalm, survivalbarrel, survivalchest, survivaltoolaxe,
survivaltoolhammer, survivaltoolpickaxe

**metal (10)** — arcadeclawmachine, factoryboxsmall, factorycoga, factorycogc,
factorypistonround, marketcashregister, pirateball, piratecannon, piratetower,
survivalbucket

**glass (1)** — survivalbottle

**paper (3)** — holidaypresentacube, holidaypresentaround,
marketshoppingbasket

## Спорные, которые я решил сам — скажите, если иначе

- **foodcoconut → juicy.** Скорлупа твёрдая, и трескается кокос вкусно; если
  захотите отдельный «хруст скорлупы», он вытащится в свой голос одной строкой.
- **holidaysnowman и holidayreindeer → plush,** а не к «холодному»: в пуле они
  игрушечные, и с зверями звучат заодно.
- **holidayhanukkahdreidel → plastic** (волчок, сухой щелчок), хотя пачка
  праздничная.
- **survivalbucket → metal.** Если ведро в модели пластиковое, переедет в
  `plastic`.
- **piratetower → metal** как каменная кладка; при желании — свой голос
  «камень» вместе с ядром и пушкой.

## Чего ещё нет и о чём стоит подумать заранее

- **Спецпредметы вне пула:** сюрприз-рыбка (золото), бомба, камни. У них своя
  природа и, вероятно, свои звуки — в эту таблицу они не входят.
- **Размер группы.** Совмещение бывает от 2 до 8 предметов, и цена растёт
  квадратично. Стоит записать ОДИН звук на голос, а масштаб отдать коду
  (высота тона и громкость от размера группы) — иначе понадобится 10 голосов ×
  7 размеров.
- **Горящий предмет** уже даёт всплеск огня при совмещении; звук огня, скорее
  всего, ложится ПОВЕРХ материала, а не вместо него.

## Проверка полноты при новой партии моделей

```bash
node tools/material-map-check.js
```
Печатает «НЕ РАЗМЕЧЕНЫ» — список типов, у которых нет голоса. ⚠️ Он же ловит
опечатки в именах: тип, которого нет в пуле, попадает в «НЕТ В ПУЛЕ».
