# BLENDO v2 — the owner's ideas

## ⛔ BOWL TILT — WE ARE NOT DOING IT (the owner's decision 2026-08-07)

Verbatim: «we are not doing the tilt for now». The analysis was done BEFORE the
decision (4 independent proposals × 3 judging lenses = 12 verdicts) and is kept
here so that nobody starts over and steps on the same traps.

WHAT WAS ESTABLISHED (useful for any future mechanic that moves the pile):
1. **Tilting the REAL glass is expensive and dangerous.** All of the fairness logic —
   the rescuer of flown-out items, reachability, match radius, spawn, hint,
   deadlock detection — is computed from a MOTIONLESS bowl (`legalR = radiusAt(y)`).
   Tilting the glass requires rewriting all of it in a tilted frame: 4-6
   agent-days and a full re-soak, plus the shadow pass and the fan of reachability
   rays, extinguished at rest, come back.
2. **The cheap equivalent is to rotate GRAVITY and the camera**, leaving the glass
   in place: on screen it reads as a tilt (there is no horizon and no stand in the
   frame), and not a single fairness subsystem is touched.
3. **Automatic tilt «during pauses» is rejected on player grounds**: the event moves
   items while the player is aiming (a miss costs points and steps), and the free
   re-stacking of the pile substitutes for the shake, which we sell for an ad.
   If the mechanic is ever brought back — it must go THROUGH the shake and be
   charged by that very same chain.
4. **The angle cannot be assigned, only measured**: item friction of 0.5 gives a
   sliding threshold of ~26.6°, so «6-8°» will not move the pile at all. The working
   range is 25-35°, the ceiling is where the distribution of protrusion past the
   wall (`wallExcessAll`) keeps p99/max below the 0.20 alarm with a healthy
   maximum of 0.181 and a rescuer trigger of 0.18.
5. **A direct measurement against a coherent load already exists in the project**:
   the horizontal part of the bomb's push was cut FOURFOLD precisely because it
   doubled the rescuer's work (4 teleports versus 2).
6. Such work should have been started with a 0.1-day probe (dev knob
   `setGravityTilt`, a ladder of angles, two curves: «does the pile re-stack» and
   «does the rescuer stay silent») — a cull gate instead of 2.5 days blind.

The second version's folder. Starting point — v1 in freeze
(tag v1-freeze-2026-08-01, build v1-test-231, 394 PASS).

The branch here is `v2`; we do not touch main (it lives in the Blender/ folder and
continues its path to the 7.08 launch: Friday tasks, payments, upload).

## Ideas (the owner dictates — we write them down here)

### 1. BOWL SHATTER — PROTOTYPE READY (2026-08-01)

The owner's spec: a boost (entering turbo) = a crack on the bowl; N boosts per
level — the bowl shatters, all items are counted AS CONNECTED.
His decisions: (1) a new bowl each level; (2) stones/bomb are carried away without
points (mine, approved); (3) shatter slow-mo — «yes!».

Implemented: a crack on every entry into Power chain (turbo series count);
a telegraph pulse at N−1; at N — slow-mo 0.45× for 600 ms, ghost walls
(sensors — NOT removeCollider, that one crashed WASM), 2×7 shards with ballistics,
a collection wave from the center: points in groups by type (cap 8, ×accumulation,
×paid booster, WITHOUT series multipliers), accAdd = rescue, a surprise with
a bonus, stones/bomb without points → victory. N=5 initial, a knob in the dev panel
(Crack / Shatter / N) and __game.bowl* hooks. 7 guards, suite 412 PASS ×2.

THE OWNER'S DECISIONS 2026-08-02: progress indication = the EYES «the mixer
is running out of steam» («I am taking the eyes», Interface + Graphics). The unit
of a boost — a story of a single day: «peak series length» (choice by measurement)
-> PLAYED -> final word: «It should shatter if the player constantly racks up
series, for example, 5-7 series per level... it should not be so easy and
attainable» => BOWL_CRACK_ON='series': every 6 uninterrupted chain matches =
a credit, N=6 (range 5-7, Graphics calibrates with an «N -> % of triggers» table).

⛔ THE CRACK VISUALS WERE REJECTED by the owner 2026-08-02 («let's remove them
entirely — unnatural and ugly») after three iterations (1px → tubes → 1px along the
surface). The scoring mechanic and the shatter are alive; progress is invisible —
an indicator only on his word. Open for moving into the process: the sound
of the shatter with its own sample, calibration of N by a series-running bot, the
star economy on an early victory (par score takes a full level — check thresholds).

## v2 start rules

- The v1 canon (CLAUDE.md) is in force until an idea explicitly cancels one of its
  points; cancellations are recorded right here with a date and the owner's word.
- The v1 suite is the baseline: we break it deliberately, along with a guards fix.
- node_modules is a symlink to Blender/ (build.py works as is).
