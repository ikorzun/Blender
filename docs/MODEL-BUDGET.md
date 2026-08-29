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

## The six to redo (current state)

soccer-ball 5580, golf-ball 4416 (modelled as a baseball — see the standing discrepancy),
fries 1748, tennis-ball 1344, basketball 1180, volleyball 1008. The dynamite (804) is fine
as is. Machine-decimated LODs shipped 2026-08-29 as a stopgap; the owner judged them not good
enough, hence this contract.
