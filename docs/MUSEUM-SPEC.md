# Museum of Rescued Things — design spec v1.1 (2026-07-20)

## ⚠️ ADDENDUM 2026-07-22 (reply to the dispatcher's request; §1–§3 below are outdated in their details)

Since the spec was written, the item pool has changed ENTIRELY: the 15 procedural
types are gone, now there are **63 models from the owner** (24 animals + 30 fruits
and vegetables + 8 cars + steak), the surprise is a **golden fish** (not a teapot),
**coins are hidden** by the COINS_ENABLED=false flag. What this changes
(recalculation — when the museum is implemented, after the v1 metrics):

1. **Sets = model packs**, not a thematic breakdown of primitives:
   "Menagerie" (animal), "Harvest" (food + steak), "Garage" (car).
   The classification is already in the code (the SHAKE_RESP/burst-effect
   packs) — the sets get it for free. Packs larger than 5 types → an exhibit =
   a subset of the pack, halls = chapters inside the pack.
2. **The museum's first exhibit is the golden fish** (it replaces the teapot in
   roadmap §1 as well). The "Tea Party"→teapot set rhyme died with the primitives.
3. **The "~13 items of a type per level" calibration is outdated:** the pool grows
   to 63 types, the yield per type falls with the level (~20/type at lv.1 → ~3/type
   at the full pool). Recalculate the exhibit thresholds against the actual
   distribution; give the tail types low thresholds.
4. **Rewards without coins:** while COINS_ENABLED=false, exhibit rewards are
   consumables (hints — already a countable resource he/hs, shakes);
   duplicate artifacts accumulate the afDup counter (conversion — when the owner
   turns coins on). The skin for a full set is unchanged.
5. **An artifact = the golden version of a model**: material on top of the atlas —
   the mechanism already exists (the golden fish in makeSurprise), rolling it out
   to other models is a question for GRAPHICS at implementation time.
6. The museum's story frame is synchronized with docs/STORY-SPEC.md
   (the blender-villain of the "Great Recipe"; the museum is the player's secret
   kept from the blender).

The spec's principles (monotonic sv counters, OR bitmasks, pity, crediting only
what the player rescued, display as a line on the win screen) — STILL IN FORCE.

NARRATIVE AND META workstream. Detailing of §1–§3 of DESIGN-ROADMAP.md with the
defense corrections No. 3 (showcase → a line on the win screen), No. 4 (semantic
save merge), No. 7 (telegraph in the endgame, artifact not in 100% of levels,
3 rarities), No. 9 (the museum takes 4–5 sessions). Implementation — STRICTLY AFTER
the v1 metrics (roadmap gate). All numbers are starting values for tuning, not dogma.

## 0. Bounds

- Story invariant: zero story text. The museum speaks through visuals + ~15
  system UI strings (glossary in §7).
- The v1.1 museum does NOT change the "9+N types" spawn progression — it is an
  overlay on top of it. Replacing the unlock with set-halls (roadmap §2) is a
  separate owner decision for v1.2, it touches the CORE (genLevel) — see open
  question §8.1.
- Counting from the code as it is: 15 types (30-shapes TYPES), the level pool = the
  first 9+(level−1) types of the array, a yield of ~12–14 items of each pool type
  per level (PAIRS_EARLY 64/71/78, 90 pairs beyond that).

## 1. Sets: splitting the 15 types into 3 halls

Split criterion: theme + EARLY AVAILABILITY of the types (the base 9 are available
from lv.1, the tail opens one at a time on lv.2–7). The sets are deliberately of
different "speed": Geometry closes first, Tea Party is a long arc up to ~lv.9.

| Set | Types (TYPES index) | Availability |
|---|---|---|
| **Geometry** | cube(0), ball(1), octa(6), dode(7), tetra(8) | all from lv.1 |
| **Grill** | steak(5), cyl(4), cone(2), knot(9)≈pretzel, spiral(10)≈spiral potato | 3 from lv.1, knot lv.2, spiral lv.3 |
| **Tea Party** | torus(3)≈bagel, star(11)≈cookie, heart(12)≈gingerbread, pill(13)≈marshmallow, teapot(14) | torus from lv.1, tail lv.4–7 |

Narrative bonus: the "Tea Party" set is crowned by the teapot type — a rhyme with
the golden teapot surprise (the museum's first exhibit per the roadmap).

## 2. Exhibits: passive progress from rescued items

**Crediting rule (story-forming):** only items MATCHED BY THE PLAYER go into the
counter. Grinding for idling and the final cleanup are "not rescued", they do not
count. The "rescue them from under the blades" frame becomes a mechanic, the finale
gains a light price (make it before the end), while the finale still does not touch
the score (the owner's invariant).

**Data model:** 15 lifetime monotonic counters `sv[typeName]`
(rescued all-time). An exhibit = a threshold over the counters of its own types; the
exhibit's progress = min(sv[type]/需, 1) across the types. The exhibits' state is
COMPUTED from the counters, it is not stored separately → the save merge is trivial
(max), there are no dupes.

**Exhibit table (3 per set, 9 in total):**

| Exhibit | Requirement | Closes at (estimate ~13/type/level) |
|---|---|---|
| Geometry I | cube, ball, tetra × 8 | middle of lv.1 — teaching the loop |
| Geometry II | cube, ball, octa, dode × 20 | lv.2 |
| Geometry III | all 5 × 35 | ~lv.3 |
| Grill I | steak, cyl, cone × 8 | lv.1 (right after Geometry I) |
| Grill II | 4 types (+knot) × 20 | ~lv.3 (knot from lv.2) |
| Grill III | all 5 × 35 | ~lv.5 (spiral from lv.3) |
| Tea Party I | torus × 12 | lv.1 (a single type — the showcase "first bagel") |
| Tea Party II | torus, star, heart × 20 | ~lv.6 (heart from lv.5) |
| Tea Party III | all 5 × 35 | ~lv.9–10 (teapot from lv.7) |

First session (2–3 levels): Geometry I, Grill I, Tea Party I are closed (three
early "dings" — teaching the loop), you exit with Geometry II at ~70% and Grill II
at ~50% — designed incompleteness. All 9 exhibits ≈ by lv.9–10; the long
tail beyond that is carried by artifacts (§3).

**Reward for a closed exhibit:** coins (I — 15, II — 30, III — 60) +
an animation on the win screen. For a FULL set (3/3): a procedural bowl skin
(v1.2 implementation, GRAPHICS) + a one-off bundle of 3 shakes. The only
permanent one is +1 base shake for the very first full set (capped, roadmap §3).

## 3. Artifacts: generalizing the golden teapot

The current surprise (golden teapot, +150, buried at the bottom) BECOMES a system:

- An artifact is buried in the level — the golden version of a RANDOM type from the
  level pool (a material swap, zero bytes of art). Behavior as before: it does not
  match, does not get veiled, the mixer does not eat it, a tap on the dug-out one
  gives +150, in the finale it is auto-collected with a bonus.
- **Not in 100% of levels** (correction No. 7): 80% — one, 5% — two, 15% — none.
  Level 1 — ALWAYS exactly one (the first exhibit is guaranteed).
- **Rarities — 3 tiers** (No. 7), by material: common (gold, as now) /
  rare (mother-of-pearl) / legendary (a glow-pulse). Chances 75 / 20 / 5.
- **Pity:** no rare+ for 5 levels in a row → a guaranteed rare;
  no legendary for 25 levels → a guaranteed legendary.
  The pity counters live in the save (§5), merged by max (in the player's favor, it
  creates no dupe).
- **Collection:** 15 types × 3 rarities = 45 slots — the museum's long arc.
  A duplicate (the slot is taken) → coins 15 / 40 / 120 by rarity, gives NO stars.
- **The telegraph glint — ONLY in the endgame** (No. 7, removes the conflict with
  combo): turns on at alive ≤ 24 (to be tuned), a golden flicker through the mass
  once every ~8 s. Before that the artifact is a pure surprise, like the teapot now.
  Implementing the glint — a sprite glow (correction No. 9), GRAPHICS.
- Grinding an artifact in the mixer is FORBIDDEN, as it is now (the AB idea "it may
  be ground with compensation" — behind a flag only and not in v1.1, roadmap).

## 4. Display: no separate showcase screen (correction No. 3)

- **The win screen** gets one animated line: the exhibit closest to closing
  ("Geometry II ▓▓▓░ 78%", the gain is underlined) OR "new exhibit" on a closure,
  OR an artifact card on a find (priority: artifact > closure > progress).
- **The museum** — an optional button (win screen + the ⚙️ panel): shelves of the
  three halls, exhibits = the same meshes scaled, silhouettes of what is not closed,
  a grid of 45 artifact slots. Rendering — a second scene on demand with physics
  paused (No. 9). Markup/screen — INTERFACE, rarity materials — GRAPHICS,
  by cross-zone requests when implementation starts.
- The "tomorrow" teaser and the daily slot are NOT in the v1.1 museum (they come
  with the Daily batch).

## 5. Save v2 (extension of 77-save, semantic merge — correction No. 4)

```js
Save = {
  v: 2,
  ce, cs,            // coins earned/spent — as now (max/max)
  stars: {lv: n},    // as now (max per level)
  sv: {type: n},     // 15 "rescued all-time" counters — merged by max
  af: {type: mask},  // artifacts: rarity bitmask (1|2|4) — merged by OR
  afDup: n,          // duplicates in total (statistics) — merged by max
  pityR: n, pityL: n // levels without a rare/legendary — merged by max
}
```

- Monotonicity is preserved everywhere; there is no non-monotonic state → a version
  field / LWW is not needed in v1.1. Coins for duplicates go through the existing
  addCoins.
- Compatibility: a v1 save is read as is (new fields start from zero), we keep the
  v field for the future.
- Size: +~400 bytes of JSON — it does not touch the Bridge/CloudStorage limits.

## 6. Character (eyesMood, the link to the museum)

A new emotion: 🤩→✨ "a find" for 2 s when a rare+ artifact is dug out
(priority above combo, below victory). Cheap: one line in the moods table
of 85-hud. Sprites — at the visual stage (GRAPHICS).

## 7. Glossary of the museum's UI strings (the "zero story text" invariant, ~15 strings)

Museum / Sets / Artifacts / New exhibit! / Set complete! / Rare find! /
Legendary! / +N coins / Duplicate → +N / Next exhibit / Saved: N /
Geometry / Grill / Tea Party / Progress N%.
The language is EN (like the buttons), the full JSON glossary — at the time of
general localization (INTERFACE).

## 8. Open questions for the owner

1. **Halls as the spawn progression** (replacing "9+N", roadmap §2): we do NOT do
   it in v1.1; to be decided by v1.2 — it changes difficulty (the number of types =
   the main lever) and the CORE.
2. **The finale does not credit rescues** (§2) — narratively right, but it slightly
   punishes an already weak player. Alternative: the finale counts with a factor
   of 1/2. The owner's verdict is needed.
3. Set names: "Geometry / Grill / Tea Party" — OK? (Grill is built around the
   owner's steak.)
4. The "level without an artifact" chance of 15% — an acceptable harshness for v1.1?

## 9. Implementation estimate (the ×2 buffer is already included, correction No. 9)

| Batch | Volume | Zones |
|---|---|---|
| Save v2 + sv counters in doMatch | 0.5 session | 77-save, a point in 80-gameplay (CORE — by agreement) |
| Artifacts: rarities/pity/duplicates | 1 session | 40-items makeSurprise (CORE), 77-save |
| Line on the win screen + eyesMood | 0.5 session | 85-hud, shell (INTERFACE — request) |
| Museum screen (a second scene) | 2 sessions | INTERFACE + GRAPHICS (requests) |
| Endgame telegraph glint | 0.5 session | 70-fx (GRAPHICS — request) |
| Economy bot run + tests | 0.5 session | test zone |

Total ~5 sessions — this matches the roadmap (4–5 after the buffer).
