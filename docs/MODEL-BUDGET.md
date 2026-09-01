# Model budget and export contract (for any new 3D pack)

Written 2026-08-29, after the sport-pack lag: six models at 2.4x–13.3x the pool median tripled
the deep-level scene and the owner felt it («igra nachala tupit»). Measured: frame p95 tracked
the added triangles exactly; physics was untouched. This document is the contract a new pack
must satisfy BEFORE it reaches `tools/glb2module.py`. The Russian rendering handed to the 3D
artist mirrors it 1:1.

## The budget

| | triangles |
|---|---|
| norm (aim here) | **<= 800** |
| hard ceiling | **1500** — a POLICY ceiling; `glb2module.py` only WARNS above it (`TARGET_TRIS`) and still imports — nothing in the tooling rejects an overage, so the ceiling is held by review, not by a safety net |
| pool reference | median 420; 61 of 76 live models are <= 800; record 3100 (cargarbagetruck) |

Why: the pile holds ~15 copies of each open type at once, so one model's excess is multiplied
by fifteen. Examples from the live pool: carrot 148, burger 294, brick 324, fish 416, penguin
558, watermelon 1348, taxi 2048 (heavy), garbage truck 3100 (the record — do not repeat it).

## The export contract (what glb2module.py actually reads)

- **.glb** (glTF binary), one file = one model; **Latin lowercase filename** (hyphens fine) —
  the type name is derived as `re.sub('[^a-z0-9]','', name)`, so Cyrillic collapses to nothing.
- **Triangles only** (primitive mode 4); other modes are silently skipped. No bones, morphs,
  animations, cameras, lights — ignored at best.
- Multiple nodes/primitives are merged with their node transforms applied. ⚠️ Normals are
  rotated assuming **uniform node scale** — non-uniform scale on a node bends the shading.
- **< 65 536 vertices** (Uint16 index) — unreachable within budget, stated for completeness.
- **Normals are taken AS IS and never recomputed** — they encode where an edge is hard and
  where smooth. Shading must be authored in the editor. ⚠️ A missing NORMAL attribute on ANY
  primitive drops that whole FILE (that one model, not the pack) to the recomputed-flat
  fallback — including the authored normals of its other primitives.
- **TEXCOORD_0 + the pack's `colormap.png`** (512x512, lying in the pack folder next to the
  .glb files) are the ONLY colour inputs. Materials, metallic/roughness, transparency, vertex
  colours are ignored entirely. Every triangle must map inside one flat colour cell of the
  palette; gradients and photo textures are not supported. No baked light or shadow in the
  texture — volume comes from the game's matcap shading.
- **Size and position are free** — the geometry is auto-centred and normalised to bounding
  radius 1.0. But keep the silhouette compact: a thin elongated shape gets visually inflated
  by the normalisation.
- **Balls must be true spheres**: types flagged `phys:'ball'` collide as the exact ENCLOSING
  sphere, and the visual mesh lies entirely inside it — so a dent or flat spot produces AIR
  GAPS: the ball floats off its neighbours and they hover above the dent. Nothing ever sinks
  through; the artefact is hovering, and it looks broken all the same.

## The optional beauty tier

Variant 3 (2026-08-29) lets a type carry `geoHi` for the big views (collection card, showcase)
and a light `geo` for the pile. If a hand-made model fits 800 and looks good, ONE file is
enough and the LOD machinery is unnecessary for it. A second detailed version (<= ~5000) is an
OPTION for the card only — deliver as `<name>-hi.glb`, wiring is the dispatcher's job, not the
artist's.

## Batch state (last updated 2026-08-31)

The artist delivered 22 .glb on 2026-08-31. **Export hygiene was perfect across all 22** —
triangles-only, NORMAL on every primitive, TEXCOORD_0 everywhere, zero degenerate normals,
no animations or skins, every file sampling the animals' palette. The contract is understood;
the ONLY failing axis is the triangle budget.

⚠️ Two of the 22 were byte-identical to files already on disk (`Dinamit` = the shipped
dynamite, `Kartoshka fri` = the 1748-tri fries — the artist's own Russian filenames,
transliterated here because the repo carries no Cyrillic that was REMOVED for weight) — i.e. copies, not
redos. Verified by md5, not by name.

**ACCEPTED AND SHIPPED (12, all <= the 1500 ceiling)** — pack `props`, module `41-props.js`,
levels 6/9/12/15/18/21/24/27/30/33/36/39 by the owner's word, lightest first:
toiletpaper 200, dumbbell 300, waterbottle 320, book 332, hat 536, plunger 574, matchbox 716,
soup 918, volleyball 1008, cart 1112, ghost 1140, lifebuoy 1440.
⚠️ Five of those (soup, volleyball, cart, ghost, lifebuoy) are ABOVE the 800 norm though under
the ceiling. They passed; the norm is still the aim for the next batch.

**RETURNED FOR REWORK (8 subjects, 9 files, all over the 1500 ceiling):**

| model | tris | over ceiling | note |
|---|---|---|---|
| fire extinguisher | 7504 | 5.0x | the heaviest model ever offered to this pool |
| fire extinguisher (low mesh) | 2756 | 1.8x | the artist's own lighter cut — still not enough |
| axe | 2902 | 1.9x | |
| basketball | 2840 | 1.9x | ⛔ **HEAVIER than the 1180 it was meant to replace** |
| grenade | 2166 | 1.4x | |
| football | 2156 | 1.4x | improved from 5580, still over |
| ship | 1987 | 1.3x | |
| fries | 1748 | 1.2x | byte-identical to the removed original — not a redo |
| robot | 1624 | 1.1x | 8% over; the line is held, flexing is how a ceiling dies |

⛔ **STILL OWED FROM THE ORIGINAL SIX:** tennis-ball (1344) and golf-ball (4416, modelled as a
baseball — the standing discrepancy) did not arrive at all; volleyball arrived at exactly the
same 1008 as before.

⚠️ **BALLS ARE FINE ON SPHERICITY** and that was measured rather than assumed: the shipped
baseline was 0.939-0.959 (rmin/rmax), the new balls are 0.965-1.000. The `phys:'ball'` flag is
safe on them. Sphericity was never the problem — polygons are.

## Batch state 2026-09-01 (the 17-model rework pack)

**ACCEPTED AND SHIPPED (15)** — appended to pack `props`, levels 42..75 plus three that took the
slots of the models the owner deleted (water → lvl 12, ketchup → 27, fries → 33), lightest first:
ketchup 140, water 236, fries 304, wineglass 370, camera 433, microwave 436, bat 440, washer 540,
grenade 584, knife 612, sledgehammer 626, kabar 744, rifle 916, beachball 960, pistol 1056.
✅ **THIRTEEN OF THE FIFTEEN ARE UNDER THE 800 NORM** — against five-of-twelve last batch. The two
above it (beachball 960, pistol 1056) are comfortably under the ceiling.
✅ **THE REWORKS LANDED:** grenade **2166 → 584**, fries **1748 → 304** (a real redo this time, not
the byte-identical copy). Both were over the ceiling last batch and are now under the NORM.

**RETURNED FOR REWORK (2, both over the 1500 ceiling):**

| model | tris | over ceiling | note |
|---|---|---|---|
| basketball | 1732 | 1.15x | improved from 2840, still over. Third time this subject has been asked for |
| revolver | 1564 | 1.04x | a new subject, 4% over — and 4% is still over |

⛔ **WHY 4% IS ENOUGH TO RETURN A MODEL, WRITTEN DOWN SO THE NEXT BATCH DOES NOT REOPEN IT:** the
robot was returned last batch at **1624, 8% over**, with the words «the line is held, flexing is
how a ceiling dies». The ceiling is a POLICY held by review — the tooling warns and imports
anyway — so the only thing that makes 1500 mean 1500 is that it is applied the same way twice.
A frame measurement showing a given model is harmless is not an argument: that argument was
equally available for the robot, and for every model that will ever be 4% over.

⚠️ **STILL OWED:** fire extinguisher, axe, football, ship, robot (all returned 2026-08-31 and not
in this delivery); tennis-ball and golf-ball from the original six.
⚠️ The two returned files are kept at `3d assets/returned-2026-09-01/`.

## ⛔⛔ 2026-09-01, hours after acceptance: FOUR OF THE FIFTEEN WERE DELETED BY THE OWNER

He sent five collection cards and «delete these models». Four were from the batch accepted that
morning — **rifle 916, sledgehammer 626, knife 612, baseball bat 440 triangles** — plus the
pre-existing `forestplant`. Every one of the four was **comfortably inside both the norm and the
ceiling**. The budget did not fail; it simply does not describe what failed.

**WHAT THEY HAVE IN COMMON IS PROPORTION, NOT POLYGONS.** Their thinnest half-extents after the
generator's normalisation to bounding radius 1.0: knife **0.021**, rifle **0.054**, bat **0.078**,
sledgehammer **0.111**. They are the four thinnest models in the pool by a wide margin — thinner
than `brickbar` (0.1085), the plate on which the floor-rescue threshold was originally calibrated.
Two consequences the contract had nothing to say about:
- **on a collection card they read as a stick.** The portrait frames to the silhouette, so a model
  whose silhouette is a line fills its 150 px card with a line;
- in the pile they are the models that need the relative floor-rescue branch at all.

### The rule this adds

> **Keep the silhouette compact — aim for a thinnest half-extent above ~0.15 after normalisation.**
> A long thin object is normalised by its LONGEST axis, so its other two collapse: the game shows
> it in a square portrait and in a pile of round things, and in both it reads as a splinter.

⚠️ The existing line «keep the silhouette compact: a thin elongated shape gets visually inflated by
the normalisation» was already in the export contract and was **not specific enough to act on** —
it carried no number, so nothing in review measured against it. It does now.
⚠️ **THIS IS NOT A REJECTION OF THOSE FOUR SUBJECTS**, and the distinction matters for whoever
briefs the artist next: a knife, a rifle, a bat and a sledgehammer can all be modelled with a
readable silhouette (a thicker haft, a foreshortened blade, a fatter grip). What failed is the
proportion these particular meshes were built at, not the idea.
⚠️ `propskabar` (0.147) survives and is the closest to the new line. The owner did not send its card;
whether it goes is his call, and it was named to him rather than swept up with the others.
⚠️ The five sources are at `3d assets/removed-2026-09-01/`.
