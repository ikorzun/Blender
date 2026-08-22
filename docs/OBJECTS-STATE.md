# OBJECTS-STATE — state of the objects (2026-07-21)

⚠️ THE PREVIOUS CONTRACT WAS CANCELLED BY THE OWNER'S DECISION (2026-07-21). The baseline
`objects-baseline-2026-07-20` assumed that the 3D models WOULD DROP INTO THE 18
existing slots, keeping the names, the hue source and candyColor. The owner
chose otherwise: **the animals are a self-contained set**, the procedural shapes stay
behind them. The old tag is kept as a rollback point.

Two items of the previous contract are cancelled:
- "hue from hex via candyColor" — for the animals the colour is given by the NATIVE ATLAS, not by the palette;
- "surprise slot: candidate Present01" — THIS MODEL NO LONGER EXISTS,
  the owner replaced the whole batch. The surprise = **the goldfish** (animal-fish).

## Composition: 80 types (2026-07-21, final for the day)

**Animals 24 + Fruits-vegetables 30 + Cars 8 = 62 models, a 2:2:1 mix**
(the owner's spec: "fewer cars, more fruits and animals"). There are exactly 24
animals in the batch — ALL of them are in the game, so "more animals" is settled by the SHARE, not by the count.
**Pizza removed** at the owner's request.

The starting nine: bee, crab, watermelon, banana, police, pig, penguin,
orange, strawberry — **4 animals, 4 fruits, 1 car**.

The food was rebuilt around fruits and vegetables: 12 fruits + 12 vegetables + 6 treats.
Utensils (dishes, knives, pots) are not taken on principle — that is not food.

⚠️ The cars are THINNED DOWN to 1200 tris (originally 2000-3100 — four times heavier
than the animals). The run is done with a temporarily lowered TARGET in blender-decimate.py.

**WEIGHT: 1.49 MB gzip** (it was 1.68 with 18 cars). Above the "~1 MB" reference point
from WORKSTREAMS, but three times below the strictest limit of the platforms.

**Depth:** `DEPTH_TINT_MIN = 0.65`, `DEPTH_TINT_RANGE = 3.2`. Picked
on a 40-80% scale (the owner: "the bottom ones are completely dark"): at 40% the bottom sank
into darkness, at 80% the volume disappeared. Both parameters live in ONE uniform
`uDepthTint` — they are turned on the fly, without a rebuild.

## Previous composition: 66 types

**Animals 24 + Food 24 — INTERLEAVED every other one.** The alternation is not cosmetics:
genLevel takes the first `9 + level − 1` types, and without it at the start there would be
only animals, and the food would surface only by level 25. The first nine:
bee, pizza, crab, banana, pig, watermelon, penguin, donut, caterpillar.

EACH BATCH HAS ITS OWN ATLAS (`tex:'animal'` / `tex:'food'`) — earlier there was a single
atlas, and with the second batch all the models would have taken someone else's palette.

The food was selected by hand: 24 out of 200 (iconic and voluminous; dishes, knives and
pots were not taken — those are utensils, not food).

✅ CLOSED 2026-07-21. The wording "the flat food climbs into the glass" was WRONG:
a check against the MESH VERTICES THEMSELVES showed that not a single object crossed
the glass either before or after (the deepest one — 0.074 NOT REACHING IT). The sensor lied:
the wall test took ONE radius per type, that is, it treated the object as a ball, and for the flat
pizza it equals the extent at any tilt. The rescuer teleported objects for nothing
(8-10 per intro) — and that is what the player could see as a jerk.
Fixed in `radialReach` (50-physics): the overhang is computed from the ORIENTED
BOX taking the current rotation into account, and the MINIMUM with the bounding sphere is taken —
the box is tight for the flat ones, but for the round ones it is worse than the sphere (up to 1.73r along the diagonal,
on which the watermelon immediately failed falsely). Rescues: 10 -> 0 on three runs.

⚠️ `__game.floaters()` shows 31 "hanging" ones, BUT each of them has 4-8 contacts —
they are wedged in the pile, not floating. The metric is tuned for balls and cubes; on
interlocking animals and food it gives false positives. Visually the pile is dense.

## Previous composition: 42 types

**Animals, 24 — with the native texture** (`tex:1`, the `colormap.png` atlas is embedded
into 36-models as a data-URI, one for all):

`bee, crab, pig, penguin, caterpillar, fish, elephant, polar, tiger, panda,
cow, parrot, koala, cat, giraffe, chick, fox, lion, monkey, dog, beaver,
deer, bunny, hog`

**Procedural, 18 — the candyColor palette + LIGHT_OFFSETS:**

`cube, ball, cone, torus, cyl, steak, octa, dode, tetra, knot, spiral, star,
heart, pill, egg, prism, nut, gem`

## Contract (in force)

- **The order = readability, not the alphabet.** `genLevel` takes the first
  `9 + level − 1` types, therefore the first nine is what the player sees at the
  start. Up front stand the MOST DISTINGUISHABLE ones (bee, crab, pig, penguin,
  caterpillar, fish, elephant, polar bear, tiger). The brown shaggy ones — beaver,
  deer, bunny, hog, monkey — are moved to the tail: with their native colouring they
  look alike, while the match goes BY TYPE.
- **For the animals the `color` field paints NOT the model, but the DEBRIS on breakup.** The
  colour of the material is white, otherwise the tint would spoil the author's colouring. Picked
  for each animal separately.
- **`rc = 1.0` for all the animals** (the extent of the sources is 0.87–1.10, we bring it to a common one).
  `wr` is needed by none of them — the flatness is 0.58–0.98.
- **Polygon count 422–951 tris** — not a single model had to be simplified.
  The rules for heavy batches — docs/3D-ASSETS.md.
- **Brightness and contrast of the textures** — the `TEX_GAIN` / `TEX_CONTRAST` knobs
  in 00-config (currently 1.02 / 1.08, the owner's choice on a scale).
- **The surprise:** the goldfish, `MeshStandard` with emissive (matcap cannot do
  glow, and that is for the better — the shine of the gold sets the treasure apart). The `gemGeo` fallback is
  procedural, it does NOT depend on the assets folder. ⚠️ Do not tie the surprise to
  a model from the folder without a fallback: the whole level generation has already been lost on this
  (a ReferenceError before the objects are created, the bowl empty, silence in the console).

## Open question to the core

There are now **42** types, while `typesCount = min(TYPES.length, 9 + level − 1)` has
no ceiling. That means the procedural shapes will surface only from **level 17**,
and by **level 34** all 42 types will be in the game at once. The former "up to 15" ceiling
from CLAUDE.md is effectively not in force. The decision is up to the owner/the core.

## New batches in the folder

`3d assets/` is now laid out into subfolders: **Animals** (in the game),
**Car**, **Food**, **skyboxes** (not integrated). The acceptance pipeline —
docs/3D-ASSETS.md.
