# Item classification by material — for the merge sound

The owner's order 2026-08-10: «classify the items by material type so that I
can record its own item-merge sound for each type».

⚠️ **THE MARKUP IS TAKEN FROM THE LIVE POOL, NOT FROM MEMORY**: the names were read out of
`src/app/30-shapes.js`, coverage checked by enumeration — **120 of 120, zero
omissions, zero duplicates**. A new batch of models appears — run the check
again (script below), otherwise the new types will silently be left without sound.

⛔ **THE `mat` FIELD IN `TYPES` IS NOT FIT FOR THIS, THOUGH IT IS NAMED THE SAME.** It is
a render field: `40-items.js` picks the matcap and the vertex colors by it, and
`50-physics.js` — the body's DENSITY. Right now all 120 have `'soft'` there, that is, it
carries no information, but rewriting its values would change the materials and the
weight of the items in the game. The sound needs a SEPARATE attribute (I propose `snd`).

## Ten voices

Eight main ones plus two small ones. It is precisely the voice that should be
counted as the «material type»: the player tells the sounds apart by ear, not by
the asset pack — that is why the packs `food`, `holiday`, `survival`, `car`,
`toycar` are SPLIT UP between the voices, while `brick` lies wholly in one.
⚠️ An asset pack is NOT EQUAL to a voice in either direction: `brick` + the cones from
`car` and `toycar` give `plastic`, while the bodies of those same two packs — `metal`.

| voice | qty | what it is that sounds | character of the recording |
|---|---:|---|---|
| `juicy` | 26 | fruit, vegetables, greens | juicy squelch, splashes, short |
| `dough` | 8 | baked goods and dough | dull soft slap, crumbs |
| `meat` | 7 | meat, fish, cheese, burger | dense wet impact |
| `cream` | 3 | ice cream | cold «plop», sticky tail |
| `plush` | 26 | animals and soft toys | downy poof, light squeak |
| `plastic` | 10 | bricks, spinning top, traffic cones | dry click, clack |
| `wood` | 11 | barrels, crates, chests, tools | wooden knock, creak |
| `metal` | 25 | TOY CARS, cannonballs, cogs, pistons, bucket | ring, clang |
| `glass` | 1 | bottle | clink (may be left unrecorded — see below) |
| `paper` | 3 | presents, basket | rustle of cardboard (may be left unrecorded) |

⚠️ **`glass` and `paper` are optional.** They hold 1 and 3 items; if you do not want
to record them separately, `glass` goes into `metal`, `paper` — into `plastic`, and
nothing breaks. Eight voices is the working minimum, ten is the ceiling.

⚠️ **THE TOY CARS MOVED INTO `metal`** (the owner's word 2026-08-10: «assign all the
toy car models to the metal group by sound»): 11 models from the `car` pack, three
bodies from `toycar` and the gold coin — 15 in all. `plastic` shrank from 25 to 10.
⛔ **TWO TRAFFIC CONES STAYED IN PLASTIC** (`carcone`, `toycaritemcone`):
they lie in the same packs, but they are not toy cars. Say «the whole pack
entirely» — and they move over with two lines.

## Full markup

**juicy (26)** — foodapple, foodavocado, foodbanana, foodbeet, foodbroccoli, foodcabbage, foodcarrot, foodcauliflower, foodcherries, foodcoconut, foodcorn, foodeggplant, foodgrapes, foodleek, foodlemon, foodmushroom, foodonion, foodorange, foodpaprika, foodpear, foodpineapple, foodpumpkin, foodstrawberry, foodtomato, foodwatermelon, forestplant

**dough (8)** — foodcakebirthday, foodchinese, foodcookie, foodcroissant, foodcupcake, fooddonutsprinkles, foodtaco, holidaygingerbreadman

**meat (7)** — foodburger, foodcheese, foodfish, foodhotdog, foodturkey, foodwholeham, survivalfish

**cream (3)** — foodicecream, foodicecreamscoopmint, foodsundae

**plush (26)** — animalbeaver, animalbee, animalbunny, animalcat, animalcaterpillar, animalchick, animalcow, animalcrab, animaldeer, animaldog, animalelephant, animalfish, animalfox, animalgiraffe, animalhog, animalkoala, animallion, animalmonkey, animalpanda, animalparrot, animalpenguin, animalpig, animalpolar, animaltiger, holidayreindeer, holidaysnowman

**plastic (10)** — brickbar, brickclassic, brickcorner, brickduo, brickround, bricksquare, brickstud, carcone, holidayhanukkahdreidel, toycaritemcone

**wood (11)** — holidaynutcracker, piratebarrel, piratechest, piratecrate, piratedoor, piratepalm, survivalbarrel, survivalchest, survivaltoolaxe, survivaltoolhammer, survivaltoolpickaxe

**metal (25)** — arcadeclawmachine, carambulance, carbox, carfiretruck, cargarbagetruck, carkartoobi, carpolice, carrace, cartaxi, cartractor, cartruck, carvan, factoryboxsmall, factorycoga, factorycogc, factorypistonround, marketcashregister, pirateball, piratecannon, piratetower, survivalbucket, toycaritemcoingold, toycarvehiclemonstertruck, toycarvehiclespeedster, toycarvehiclevintageracer

**glass (1)** — survivalbottle

**paper (3)** — holidaypresentacube, holidaypresentaround, marketshoppingbasket

## Debatable ones I decided myself — tell me if it should be otherwise

- **foodcoconut → juicy.** The shell is hard, and a coconut cracks tastily; if
  you want a separate «crunch of the shell», it pulls out into its own voice with one line.
- **holidaysnowman and holidayreindeer → plush,** and not to the «cold» one: in the pool
  they are toy-like, and they sound together with the animals.
- **holidayhanukkahdreidel → plastic** (a spinning top, a dry click), even though the
  pack is a holiday one.
- **survivalbucket → metal.** If the bucket in the model is plastic, it will move into
  `plastic`.
- **piratetower → metal** as stone masonry; if desired — its own voice
  «stone» together with the cannonball and the cannon.

## What is still missing and what is worth thinking about in advance

- **Special items outside the pool:** the surprise fish (gold), the bomb, the rocks. They
  have their own nature and, probably, their own sounds — they are not in this table.
- **Group size.** A merge runs from 2 to 8 items, and the price grows
  quadratically. It is worth recording ONE sound per voice and giving the scaling
  to the code (pitch and volume from the group size) — otherwise 10 voices ×
  7 sizes will be needed.
- **A burning item** already gives a burst of fire on merging; the fire sound most
  likely lies ON TOP OF the material, and not instead of it.

## Completeness check when a new batch of models arrives

```bash
node tools/material-map-check.js
```
Prints «NOT MAPPED» — the list of types that have no voice. ⚠️ It also catches
typos in names: a type that is not in the pool lands in «NOT IN POOL».
