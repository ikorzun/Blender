# The mixer's eyes — how they work (living document)

The character's canon. **Maintenance rule:** any edit to the eyes (state, timing,
asset, trigger) is required to add a line to the "Log" at the bottom and to fix the
corresponding section. The document is maintained by the INTERFACE chat; the code is
`85-hud.js` (engine), the markup is `#face` in `shell.html`.

The owner's assets: Figma 741:1420 (a grid of all the variants) + the folder
`Interface/Eyes/`. The historical version of this file (pre-asset, with arcs and
the charge bar) is not in force.

## 1. Anatomy

The eyes are **one inline SVG** (`#eyes`, viewBox 240×120), not a set of
images. Almost the whole set from the owner is two circles with different numbers, which
is why the round pair is **parametric**:

- the whites `#wL/#wR` (r60) and the pupils `#pupL/#pupR` (r29) are separate `circle`s;
  position and size are set by CSS transforms every frame;
- the irreducible shapes lie in **separate layers** `<g class="face">`:
  `fAngry` (angry, eyes-3-1, with THEIR OWN movable pupils `#pupAL/#pupAR`
  under a clip by the wedge-shaped white), `fSad` (sadness, eyes-1-6, lids `.lid`),
  `fX` (defeat, eyes-4);
- a layer is switched on by the class `.on` (opacity cross-fade 0.12 s).

⚠️ The layers are listed **explicitly** in `setFace`. If you delete a layer from the markup —
remove it from the list too: a reference to a non-existent id crashes the tick every frame and
stops the whole game loop (it was caught by a test: the bot could not finish off the level).

⚠️ **Never write textContent into `#eyes`** — that would erase the character's whole
markup (a trap from the emoji era; the pause used to put "😴" there).

## 2. Four independent animation layers

| Layer | What it decides | Where |
|---|---|---|
| EMOTION | which eye shape | `eyesMood` → `faceState`, 600 ms tick |
| GAZE | where the pupils look | `gazeFor` + `clampGaze`, every frame |
| REACTION | a short burst on top of the emotion | `faceEvent(state, ms)` / `facePulse` |
| BLINKING | life during pauses | `tickFace`, 120 ms once every 4–7 s |

The merging is in `tickFace` (called from the loop every frame): grinding > reaction >
emotion; blinking on top, if the state is allowed to blink.

## 3. States (priority from top to bottom)

| # | Trigger | Look | Mechanics |
|---|---|---|---|
| 1 | pause | freeze-frame of the current face | rAF is stopped, nothing ticks |
| 2 | victory (`level.over`, everyone saved) | kind: large pupils | fRound |
| 3 | defeat (`level.over`) | ✕✕ | layer `fX` |
| 4 | **turbo series** (`chainSeries ≥ 2` with an active chain) | eyes-5 asymmetry: the left pupil 40 inside a white of 60, the right white 44 with a pupil of 12; they roll | fRound, `EYE5_*` |
| 5 | turbo (`chainUntil > now`) | the pupils are squeezed down to 15, rolling in OPPOSITE directions (one clockwise, the other counter-clockwise), a revolution takes ~1.2 s | fRound, `PUP_MIN` |
| 6 | grinding (`grinding`) | angry eyes-3-1; the pupils SCAN the bowl: left → right → down, 0.8 s per step | layer `fAngry`, the clip keeps them inside the wedge |
| 7 | ≤3 s until the grind | sly: the pupils out of sync along the diagonal (±16) | fRound, `FACE_GAZE.sly` |
| 8 | a combo series is burning | boost build-up: the pupils grow 29→50 proportionally to `comboCount/CHAIN_COMBO_AT` | fRound |
| 9 | idle > 8 s | rolled up: the pupils up (0,−24) | fRound |
| 10 | otherwise | calm: the pupils wander ±10/±8 once every 1.5–3 s | fRound |

The threat ladder reads without words: calm → rolled up → sly → angry.
The turbo ladder: the pupils growing → squeezed and rolling → the eyes-5 asymmetry.

⚠️ GRINDING OVERRIDES EVERYTHING: while the blades are spinning — angry only. Reactions to
a score drop are muted (`lastGrind` in `tickFace`), otherwise the −20 penalty for every
grind would jerk sadness on top of the angry ones. Blinking during grinding is also off.

## 4. Instant reactions (on top of the state)

| Trigger | What happens | Lasts |
|---|---|---|
| the score went up (match, treasure) | the pupils "gasped" ×1.25 | 180 ms |
| the score went down (miss −7) | **sadness in three phases**: the pupils dive down for 80 ms while still on the round pair (`faceHoldFrom`) → the lower lids `.lid` slide out from below over 0.22 s (CSS translateY 34→0 on `#fSad.on`) → it holds ~0.7 s → the lids slide away, the gaze hangs down for another ~1 s and "rises" (the lookVec tail). rAF measurement: sadness is visible 273→941 ms from the tap | ~0.9 s + the tail |
| a treasure has been dug up | wide-open pupils | 1 s (`collectSurprise`, 80-gameplay) |
| a tap on the eyes | a winking pose (the pupils out of sync) + a `bounce` hop (scale 1.12, −5°) + sound | 0.8 s / 0.45 s |
| a tap/drag on the field | the pupils follow the finger: a vector towards the point, strength 24·min(1, d/260) | 1.4 s |

The reactions to the score are implemented by WATCHING `stats.score` in `tickFace` —
there are no edits in the core.

## 5. Hard rules (the owner's spec)

1. **The black pupil never goes outside the white.** `clampGaze` clips the gaze
   vector by the free space: the white's radius − the pupil's radius − 1. It works
   PER EYE — with the eyes-5 asymmetry the right one is allowed a travel of 31, the left one 19.
2. The turbo indicator is **the pupils themselves**, no bars/rings (they are removed).
3. The eyes-4-4 arcs are removed entirely: "kind" is conveyed by the size of the pupils, not by shape.
4. During grinding always angry; instead of the red "0" — the word "Grinding" in the same
   style (this is the `#face` construction, but the text belongs to the zone of the single .otext outline).

## 6. Asset map → what became of them

| Asset | Fate |
|---|---|
| the eyes-0 family (gaze/size) | the parametrics of the round pair |
| eyes-0-1 (pupils 15) | turbo |
| eyes-0-2 (pupils 50) | wide open (treasure, the peak of the boost build-up) |
| eyes-0-3/4/5/6 (gaze to the sides) | the parametrics of the gaze |
| eyes-1-6 (lids from below, gaze down) | layer `fSad` (miss) |
| eyes-1, 1-2…1-5 (lid phases) | NOT used (candidate: sleep/boredom) |
| the eyes-2 family (out of sync) | the "sly" pose and winking |
| eyes-3-1 (angry) | layer `fAngry` + movable pupils |
| eyes-3 (angry, variant) | not used (replaced by 3-1 per the spec) |
| eyes-4 (✕✕) | layer `fX` (defeat) |
| eyes-4-1 (><), 4-2 (——), 4-3 (^^), 4-4 (⌒⌒) | NOT used (4-3 was the squint — removed; the 4-4 arcs are forbidden) |
| eyes-5 / 5-1 (asymmetry) | the turbo series (`chainSeries ≥ 2`) |

## 7. Code map

| Function (85-hud) | Role |
|---|---|
| `eyesMood(now, grinding)` | the emotion name by priority (600 ms tick from `updateEyes`) |
| `eyeSizes(now, state)` | the pupil and white radii per eye (boost/turbo/series/pulse) |
| `gazeFor(now, state)` | the gaze vector (turbo rolling, poses, finger, wandering) |
| `clampGaze(vec, pupR, eyeR)` | rule #1 |
| `tickFace(now)` | merging everything + the score watcher + blinking (every frame from the loop in 99-main) |
| `setFace(state, now, blinking)` | switching a layer on + the pupil transforms (incl. the angry scan) |
| `faceEvent(state, ms)` | a short reaction; `faceHoldFrom` is able to delay the start |
| `faceLook(x, y)` | gaze at a screen point (called by 90-input on pointerdown) |
| `facePulse()` | a pupil pulse |

External calls: `tickFace` — the loop (99-main); `faceLook` and the tap-wink —
90-input; `faceEvent('surprised')` — collectSurprise (80-gameplay, by a
cross-zone request). The series is counted by the core: `chainSeries` (60-access,
incremented in doMatch, 80-gameplay).

## 7b. The threat fire (mockup 751:1122, assets Fire-left/right)

A crown of flame BEHIND the whites: two mirrored tongues (viewBox coordinates:
the left one −6.7…120, the right one 120…246.7, Y −47…79.8 — from the design context, the
0.33° rotation is dropped). The `#fFire` layer is the FIRST child of `#eyes` (the eyes are
drawn on top, as in the mockup); `#eyes` got `overflow:visible`.

- **Trigger:** the time left until grinding < 5 s OR Grinding is under way. It is computed in
  the countdown block of 99-main from the SAME source as the number (`level.idleLimit
  − idleS`), the cache `lastFireOn` — the class is touched only on a change.
- **Timings:** appearance 0.35 s / fade-out 0.2 s — the same as for the red
  sky ladder (one threat system). It goes out when a match has reset the timer.
- **Life:** a soft "breathing" scaleY 1→1.045 (0.52 s, alternate), the tongues
  out of sync (the right one has a 0.26 s delay).
- ⚠️ **SVG trap:** the position is the transform ATTRIBUTE of the outer group, the breathing is
  a CSS animation of the NESTED `.fl`: a CSS transform overrides the attribute of the same
  group — the flames flew off to (0,0) and lay in a stack on the left eye.
- ⚠️ **Open (the owner's decision):** the construction stands 8px from the top of
  the screen, the mockup's crown rises ~37px above the eyes — on screens without
  a notch the top of the flame is cut off by the edge. Options: lower the construction /
  make the fire smaller / accept it as is (on phones with a notch the crown is visible
  in the safe area). Implemented 1:1 with the mockup.

## 8. Open questions

- The "rolled up" eyes are never shown on Hard: boredom requires 8 s of idling,
  while the "sly" ones intercept at the 7th second (Hard patience = 10 s). It is cured
  by tying the boredom threshold to a fraction of the patience — it awaits the owner's decision.
- The owner wants blinking "worked out separately later" (his words when
  the rules were set) — for now 120 ms by collapsing, once every 4–7 s.
- The eyes-1 family (lid phases) is free — a candidate for sleep/deep boredom.

## Log
- 2026-07-30 (v1-test-186, the owner's spec): A TAP ON THE EYES = PROVOCATION.
  It cancels "he winks" (2026-07-19). The tap declares the mixer's patience
  exhausted — the scheduler starts grinding immediately (the same path as
  the punishment for idling; the eyes get angry on their own, grinding overrides all states).
  It is stopped by any match/shake. Outside a game (intro/pause/victory) —
  only the hop. The 'match' sound on the tap is REMOVED (it lied "matched", AUDIO-PLAN §1);
  the grinding itself sounds. The cost = the cost of grinding (−20 per bite, lv.1 without penalties).

- 2026-07-22 · dropping the construction to make room for the fire crown (the owner's decision):
  #face.dropped on --fireLift, the modes FIRE_DROP_MODE; on notches the lift is 0.
- 2026-07-21 · the threat fire: the #fFire layer at <5 s until grinding and during Grinding
  (mockup 751:1122); timings 0.35/0.2 s as for the sky fever; scaleY
  breathing; the trap "a CSS animation against the transform attribute" is described in §7b.
- 2026-07-21 · the document was rewritten from scratch as a living canon (the pre-asset
  version is not in force); the current behavior of v1-test-47+branch was recorded:
  the turbo series = eyes-5, the angry scan, sadness in three phases, the score watcher.
