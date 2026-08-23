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

### 2. THE OWNER'S TO-DO LIST, DICTATED 2026-08-23

⚠️ **WRITTEN DOWN AS DICTATED, NOT ANALYSED.** He asked for a list, not for
decisions — nothing below has been scoped, questioned or agreed. Each item still
needs its own round of «what exactly do you mean» before any code. The pointers in
italics are only «what this would touch», put there so a future session does not
re-derive it or blunder into a decision already recorded elsewhere.

1. **A screen after buying a multiplier.**
   *Touches:* the purchase flow and the «More Stars» screen; there is no
   post-purchase screen today — the buy just resolves.

2. **A click or tap on an item opens it in a separate pop-up, where it can be
   spun.**
   *Touches:* the spin machinery already exists and is exposed —
   `thumbSpinStart` / `thumbSpinToggle` / `thumbSpinKey` (99-main), used by the
   collection. ⚠️ AND IT COLLIDES HEAD-ON WITH A LIVE RULE: a tap on an item in the
   bowl is the game's main verb, and since 2026-08-23-a a tap on a pairless item
   COSTS 10 points. Which tap opens the pop-up — in the bowl, or only in the
   collection? That is the first question to ask.
   *And his standing rule:* «a model that spins» means pure 3D, never a picture on
   a backing — he has caught that twice.

3. **Fix the level completion screen.**
   ⚠️ NO DEFECT NAMED. That screen was rebuilt twice in the last three days
   (2026-08-21-r by node 891:4251, then 2026-08-22-d and -e). Ask for a frame with
   what is wrong before touching it — the canon's own rule for a screenshot
   complaint.

4. **Fix the margins in iOS 26.**
   *Touches:* the longest-running saga in the canon — the safe area, the
   `viewport-fit`, the Safari 26 chrome tint and the black bars, five editions of
   it, with a standing ⛔ «bringing back any ONE item of that set is FORBIDDEN,
   only the whole set at once». ⚠️ READ THAT SECTION FIRST; do not re-derive it.
   Needs a frame from his device to know which margin he means.

5. **Make the background gradient in the game a little darker, add life and
   volume to it.**
   *Touches:* `SKY_FADE_WHITE = 0.40` (00-config) — the 40% white fade he asked
   for himself on 2026-08-22-g is exactly what made it lighter, so «darker» is
   most likely that number coming down. ⚠️ But «life and volume» is not the same
   knob and is not a number — ask what he wants to see. The palette itself
   (`SKY_STOPS.day`) is his from a Figma screenshot the same day.
   ⚠️ A darker sky RAISES the HUD contrast, which is currently 1.69:1 for the white
   level and 1.35:1 for the yellow score — both below the project floor. This item
   may cure that complaint for free; say so when it lands.

6. **Bonus objects in the bowl — for example an ELECTRIC object, appearing when
   you have collected N similar objects on the level.**
   *Touches:* the closest existing thing is the TYPE CHARGE, which drops on
   entering turbo and destroys every copy of its type — and since 2026-08-23-a it
   draws a thread of lightning through them. ⚠️ So «electric» may mean a second,
   differently-earned charge rather than a new mechanic; ask whether it replaces
   the charge, stands beside it, or is a new item type in the pile.

7. **Finish the graphics.**
   ⚠️ TOO BROAD TO ACT ON — needs breaking into named pieces by him.

8. **Are loading screens needed on a slow connection?** — A QUESTION, NOT A TASK.
   *What is already there:* the loading curtain (`#skyFill`, a fill from the bottom
   up, the HUD hidden until `uiready`) and a guard on it. The build is a single
   10 MB HTML file, so the whole game arrives before the first frame — the honest
   answer needs a measurement on a throttled connection, not an opinion.

## v2 start rules

- The v1 canon (CLAUDE.md) is in force until an idea explicitly cancels one of its
  points; cancellations are recorded right here with a date and the owner's word.
- The v1 suite is the baseline: we break it deliberately, along with a guards fix.
- node_modules is a symlink to Blender/ (build.py works as is).
