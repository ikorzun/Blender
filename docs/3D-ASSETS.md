# 3D asset acceptance (GRAPHICS zone)

## CURRENT 2026-07-21: the "animals" batch, 24 models

The owner replaced the ENTIRE folder. The new set fits the pipeline perfectly:
**422-951 tris each** — NOT A SINGLE ONE needed simplification, the Blender pass
runs idle. All of them have normals and a single material each.
Module 1.0 MB, index.html 3.9 MB, **1.2 MB over the network**.

**The texture is HOOKED UP (the owner's spec 2026-07-21): a shared atlas
`Textures/colormap.png`, 512×512, 10.9 KB — embedded into the module as a data-URI.**
The converter finds it next to the models or one level up on its own and embeds it;
the material takes it as `map` (the `tex:1` flag in TYPES), and the material color is
WHITE — otherwise the tint would spoil the coloring intended by the author. The grey
inaccessibility veil works as before: it lerps that same color toward grey.

Two traps, both marked in the code:
- **`flipY = false`** — glTF counts UV from the TOP left corner, three by
  default from the bottom one. Without this every model takes the wrong atlas strip.
- **mips are OFF** — the atlas strips are narrow (~1/16 of the width), at the distant
  mip levels neighboring colors would blend into mud.

Cost: module 1033 -> 1389 KB (UV + atlas), index.html 4.2 MB,
**over the network the same 1.2 MB gzip**.

⚠️ **THE ORDER IN TYPES = READABILITY.** With their native coloring the animals are
prettier, but they are HARDER TO TELL APART than with synthetic tones: real animals
cluster in brown and grey. The first nine (what the player sees at the start) are
assembled from the most contrasting ones — bee, crab, pig, penguin, caterpillar, fish,
elephant, polar bear, tiger. Beaver, deer, hare, boar, monkey are moved to the tail:
they look like one another, and matching goes BY TYPE.

⚠️ **There are 24 animals, and genLevel takes the first `9 + level − 1` types.** That means
the primitives (cube, sphere, torus…) will only start appearing from level 17 —
in effect the game has become an "animal" one. And there is no ceiling on the number of
types: by level 30 there will be 37 of them, which noticeably raises the difficulty.

⚠️ **A TRAP that cost a silent crash:** the surprise geometry was rigidly
tied to `present01Geo`. The batch changed, the function disappeared — `genLevel`
crashed with a ReferenceError BEFORE the items were created, the game came up with an
EMPTY bowl and WITHOUT an error in the console. Now `makeSurprise` has a check via
`typeof` and a fallback to the built-in `teapotGeo`.


The owner puts the models into **`3d assets/`** in the root of the working folder
(`funnel-game-v1/3d assets/`). The folder is NOT in git (untracked) and it is not in
the worktrees — run the audit from the main folder.

Before integration EVERY model is run through the audit:

```bash
node tools/audit-glb.js "3d assets"                 # geometry, materials, structure
node tools/extract-glb-textures.js "3d assets" /tmp/tex   # extract the PNGs and find shared atlases
```

## Requirements

The game is a single-file `index.html` with no runtime loaders: a model is
converted **at development time** into a data module `src/app/NN-name.js`
(like `35-steak.js`). Hence the strict constraints.

| What | Requirement | Why |
|---|---|---|
| Poly count | **≤ 400 tris** (the reference — the steak, 144) | up to 181 items on screen: 400 × 181 ≈ 72k tris |
| Primitives | **1** per model | every extra one is a separate draw call ×181 |
| Color | **vertex colors** (COLOR_0) or flat Kd | there are no textures in the pipeline; the inaccessibility veil is multiplied by the color |
| Origin | center at zero, bounding extent normalized to `rc` | the converter does it itself |
| Sides | **FrontSide** | `doubleSided` doubles the fragment work |
| Transparency | **OPAQUE**; if needed — only `opacity` | BLEND breaks sorting in a dense pile; `transmission` is FORBIDDEN (−55% of the frame) |
| Flat models | specify `wr` in TYPES | the bounding radius overestimates the width → a storm of false rescues at the wall |
| Concavity | fill ratio ≥ ~0.25 | below that the convex hull lies, a manual compound is needed (like the torus/teapot) |
| Compression | no Draco / meshopt / basisu | the decoder = an external wasm, single-file-ness breaks |
| Animations/skins | none | not supported |

## Audit result 2026-07-20 (5 models)

| model | tris | weight | verdict |
|---|---|---|---|
| `Present01` | 78 | 116 KB | **fits** |
| `NoelCap` | 128 | 116 KB | **fits** |
| `Mouse_Retro` | 130 | 1125 KB | fits by geometry, 1.1 MB of textures |
| `CellPhone_Retro` | 574 | 384 KB | poly count ×1.4 over the limit, 2 primitives, flat (0.20) |
| `CA_Head` | 2702 | 1270 KB | **does not fit** without rework |

### Common to all five

1. **Not a single one has vertex colors** — the color rests on textures
   (`baseColorTexture`). This is the main divergence from the pipeline.
2. **All are `doubleSided`** — remove that.
3. **All are offset from zero** (`CellPhone` has its center at Y=1.41) — the converter will fix it.
4. `NoelCap` and `Present01` — `alphaMode: BLEND` because of alpha in the atlas; convert
   them to OPAQUE, otherwise the transparency will break sorting in the pile.
5. `CellPhone` and `Mouse` — 2 primitives each, a merge is needed.
6. The `KHR_materials_specular/ior` extensions — dropped by the conversion, not a blocker.

### What to do with the textures

The models' atlases are **shared**: `Trim_Vapor_Column_02` is shared by `CellPhone` and `Mouse`,
`Atlas_02_Xmas` — by `NoelCap` and `Present01` (byte-for-byte identical files).
By their nature these are **trim sheets of flat color blocks**, stripes and checks —
such a thing bakes into vertex colors almost without loss (only the thin stripes
and the check will be lost, and on an item ~1 unit in size they are unreadable anyway).

The exception is `CA_Head`: its texture is a **2048×2048 sticker sheet** with
illustrations and logos. It does not reduce to vertex colors; either a real
atlas at runtime is needed, or the model has to be dropped.

**Recommendation:** bake UV→vertex colors for the four "trim" models
(zero bytes of textures, the pipeline does not change), put `CA_Head` on hold.

⚠️ The models look like a third-party author's asset pack (the sticker sheet contains
someone else's "PYRE PALS" logo). Check the license before publishing.

## Integration 2026-07-20 (10 models, textures stripped)

The converter `tools/glb2module.py` -> `src/app/36-models.js` (372 KB).
The owner asked to "remove all textures" — we take only the geometry, the color
from the TYPES palette. The models are put AT THE START of TYPES, otherwise on the early
levels they cannot be seen (genLevel takes the first typesCount types).

**`RetroComputerBooth.glb` was skipped** — 29 721 tris and 23 MB: this is scenery,
not an item for the pile. The converter's ceiling is `MAX_TRIS = 3000`, skips are printed.

Measurements at level 1 (129 items), primitives -> models:

| metric | was | became | norm |
|---|---|---|---|
| topY (fill) | 6.95 | **4.79** | 7.5-9.0 on a full level |
| time to stillness | instantly | **~3 s** | — |
| rescues at the wall | 0 | **2** | 0 |
| maxWallExcess | 0.101 | **0.165** | ≤ ~0.15 |
| index.html weight | 3.01 MB | 3.39 MB | ~1 MB gzip |

The reason for the underfill: the models are thin and elongated — at an equal bounding
extent their volume is half that of a sphere. The extent has already been raised from
0.78 to **1.0** (`RC` in the converter and `rc` in TYPES are to be kept in sync), this
raised topY from ~3.4 to 4.79. Beyond that — either larger still, or more pairs, but
**change PAIRS only by the owner's decision** (the glass fill is tied to volume, see CLAUDE.md).

## ⚠️ THE REAL CAUSE of "the topology disaster" — FLAT NORMALS

The owner rejected the look of the models twice, and the first diagnosis (decimation) was
CORRECT ONLY IN PART. The main thing was elsewhere: the converter read ONLY the positions,
broke the geometry apart into unconnected triangles and recomputed the normals via
`computeVertexNormals()`. That gives FLAT FACETING — any model looks like a
crude lump regardless of the triangle count. The normals were in the source GLBs
all along (the audit showed `POSITION, NORMAL, TEXCOORD_0`).

Fixed: we keep the ORIGINAL INDEX BUFFER and the ORIGINAL NORMALS. The indices from
the file already encode where a seam is hard and where it is smooth — on the hard edges the
model's author duplicated the vertices. Cost: module 663 -> 897 KB, index.html
3.70 -> 3.94 MB. The poly count did NOT change.

The measurement of "and what if with no simplification at all": module **71 MB** (1.3 million triangles),
index.html ~74 MB — 107 times more than the current one. Plus the copies in the bowl give
tens of millions of triangles per frame. Not an option either by weight or by frame.

## Decimation 2026-07-20 (second batch, 15 models)

The owner added "icon-like" assets of 84-509 thousand triangles — such things
physically do not fit into the game. **Decimation by collapsing the vertices into a grid**
was added to the converter (`cluster`/`decimate`), the bar `TARGET_TRIS = 500`. The method
was chosen over honest edge-collapse deliberately: it is linear in the number of
triangles (edge-collapse on half a million edges does not compute in python),
and its faceting matches our flat shading. The whole run — 7 s.

The module GOT LIGHTER: 372 KB (10 models) -> 292 KB (15 models).

**NOT TAKEN:**
- `Money 20.fbx` — the FBX format is not supported, an export to .glb is needed.
- `Gold Stone.glb` — 132 bytes, inside only `{"scenes":[{"name":"Scene"}]}`
  with no nodes and no meshes. **An empty export from Blender**, there is no geometry in the file.

**⚠️ THIS METHOD WAS REJECTED BY THE OWNER ("the topology is a total disaster") and REMOVED
from the converter.** Collapsing into a grid ruins THIN AND HOLLOW geometry: the walls
stick together, the model falls apart into shards. The crown crumbled into a handful of shards,
the ice skate and the booth — into mush. Do not bring it back.

## The simplification pipeline via Blender (2026-07-20, in effect)

Blender is installed in the system, and its Decimate/COLLAPSE (error quadric) preserves
the silhouette incomparably better. Now there are TWO steps, and the converter does NOT TOUCH the shape:

```bash
# 1. preparation: the heavy ones get simplified, the light ones are copied as-is
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools/blender-decimate.py -- "3d assets" "3d assets/.lowpoly"
# 2. building the data module from the prepared GLBs
python3 tools/glb2module.py "3d assets/.lowpoly" src/app/36-models.js
```

`KEEP_UNDER = 1500` — models lighter than that are NOT touched AT ALL. `TARGET = 15000`.
The whole run ~8 s.

### ⚠️ TARGET=1200 WAS A MISTAKE (the owner: "visually it works badly")

A measurement at the owner's request — three builds on one bench, level 1:

| variant | file | over the network | tris/frame | heap | look |
|---|---|---|---|---|---|
| primitives (before the models) | 2.9 MB | — | 22 098 | 15 MB | — |
| **simplification down to 15k** | **6.9 MB** | **1.9 MB** | **919 722** | 36 MB | like the original |
| as-is, without simplification | 39 MB | 8.0 MB | 13 026 950 | 190 MB | the reference |

At 1200 the ice skate and the crown came out TORN, with holes. The cause is not the
collapsing itself, but the VOXEL REMESH, which was switched on only because
the target was set absurdly low (509 440 -> 1200, that is a 425-fold compression).
At TARGET=15000 the remesh is not needed AT ALL — the collapsing goes through cleanly, and
the models are visually INDISTINGUISHABLE from the full ones at a fivefold smaller file.
The concrete mixer no longer needs to be excluded either: it was torn by that same remesh.

⚠️ Headless does NOT GIVE a trustworthy frame time: both rAF and gl.finish show
identical numbers on builds that differ 95-fold in triangles.
Only the weight, the load time, the triangle counter and the heap are trustworthy.
Measure FPS on a live device — exactly as written down in CLAUDE.md.

**Two traps, both verified and recorded in the code:**

1. **Merge into a single object before simplification.** Otherwise the ratio is counted per
   object, the lower cutoff keeps the small bits from disappearing, and a model made of hundreds of parts
   (Ice Skate) overshoots the target ninefold: we asked for 1200 — we got 10561.
2. **Vertex welding does NOT help, the counter GROWS** (1199 -> 1822 on the crown):
   it breeds non-manifold edges, and COLLAPSE is exactly what preserves them.
   For models made of thousands of intersecting shells the VOXEL REMESH works —
   it builds one closed surface, after which the collapsing does its job.
   The voxel resolution is a trade-off: `maxdim/150` gives an excellent ice skate
   (509k -> 3023, both boots are readable), `maxdim/280` saves the concrete mixer,
   but inflates the ice skate to 15369.

Result: **14 models out of 15 are readable** — the crown became a crown, the ice skate ice skates,
the circle a circle, the pretzel a pretzel. Module 663 KB.

**`Concrete Mixer` is excluded** (`EXCLUDE` in glb2module.py): thin sheet
metal and a frame, the voxel remesh tears such surfaces to dust at both
tested resolutions. A low-poly source is needed.

⚠️ A side effect for the tests: `test.js` forced a deadlock after
a fixed 600 ms pause. The primitives settled instantly and that worked;
the models settle in ~3 s, and while the pile is moving, `updateMatchRadius` overwrites
the forced `matchRadius` on every tick — the deadlock did not occur at all.
The pause was replaced by waiting for STEADY stillness (a series of calm polls: right
after `skipIntro` there is sometimes a brief false stillness ~150 ms).
