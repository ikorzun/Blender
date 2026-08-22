# Week plan: finish the web version + the growth challenge

Compiled 2026-07-30 by the dispatcher after all five workstreams delivered, a code
review (17 agents, 8 slices) and a retention panel (8 agents, 4 angles, 3 judges).
Base — `v1-test-177`, the suite 266 PASS, exit 0.

⚠️ **On the trustworthiness of this document.** Everything marked ✅ VERIFIED I
reproduced or recomputed myself. Everything else is a claim by an agent or a
workstream, and it has to be confirmed before work. The reason for such caution: out of
31 "confirmed" review findings **all three blockers turned out to be false** — six
agents in a row failed to find the guard standing fifty lines above the symptom.
No finding goes into work without its own check.

---

## 0. What has already been done today

| Version | What |
|---|---|
| 174 | A curtain over the HUD for the duration of loading (INTERFACE) |
| 175 | Prices without nines 4.90 / 9.90 / 19.90 + a guard on the button text |
| 176 | The interstitial once every 3 levels instead of 5 |
| 177 | The fill animation no longer plays behind the platform curtain; along the way the FOREVER BLACK SCREEN on an unresolved `initialize()` was closed |
| — | The tail error gate in the suite: 59% of the run went with a non-working guard |
| — | The canon was corrected three times: the dead TYPES tail, the wall geometry, two stale "open questions" |

---

## 1. Days 1–2: what the player sees and we somehow do not

These five items are the cheapest in the project and at the same time the most
noticeable. All five mean "already done and not shown", that is, the work is paid for and there is no effect.

### 1.1 ✅ VERIFIED. The museum is physically unreachable — bring the entry back
The `Museum` button lies inside `#pauseOverlay` (shell.html:1181), and that overlay
is never shown again: the menu became `#mainScreen`, and all `pauseGame`
calls go with `silent=true`. Verified in the field: on pressing pause
`mainScreen` is visible, `pauseOverlay` and `museumBtn` are hidden.
A whole meta screen — portraits of all 93 types, tiers, counters — is dead.
Found by TWO independent runs (the prod-readiness slice and the panel's diagnostician).
**To whom:** INTERFACE. **Price:** hours. Move the entry into `#mainScreen`.
⚠️ Decide the fate of `#pauseOverlay` at the same time: it holds `soundToggle`/`hardToggle`
as state and contains the entry into debug WITHOUT a DEV guard.

### 1.2 ✅ VERIFIED. The 1★/2★/3★ rating is never shown
It is computed on a win and goes into `<div id="winHolders" hidden>`; `hidden` is
removed NOWHERE in `src/app`. The visible "★ N" on the win screen is the balance
gain, not a score. So the level has neither a visible goal nor a quality score —
the player does not know whether he played well.
**To whom:** INTERFACE. **Price:** hours.
⚠️ Tied to the NARRATIVE debt: the rating measures the LEVEL NUMBER no less than
mastery (one and the same play gives ratio 4.95 on lv.1 and 1.2 on lv.20), while a
×3/×5 booster guarantees 3★. To show it as is means to show a noisy score.
That is why the item goes IN A PAIR with normalization (see 2.3).

### 1.3 The long meta is invisible on the phone
The showcase panel — the only surface in the field that shows tiers and multipliers —
is gated by `min-width:813px`, that is, on the phone it is not built at all. The tier-up
popup shows a portrait and "×1.25" for 1.9 s without text. There is not a single line
in the game explaining that matches grow a type's multiplier FOREVER.
**To whom:** INTERFACE + NARRATIVE (text). **Price:** a day.

### 1.4 The win screen gives no reason to start the next level
It shows: "Level N", "CLEANED", the time, "★ N", a static "+1" of hints,
the Next button. No balance, no "what will open next", no collection news.
**This is the panel's TOP-2 move by the judges' score (26 out of 30).**
**To whom:** INTERFACE. **Price:** a day. Details — in the "Challenge" section.

### 1.5 The balance chip freezes at roughly level 15
From 10000 the value is printed as "12.5k" — the minimum visible step is 100, while a
pair match gives +2. That is, ~50 matches are needed for the digit to budge. The main
"I have earned something" channel stops responding to action.
**To whom:** INTERFACE. **Price:** hours (show the full number or a finer step).

---

## 2. Days 2–4: physics, balance and what must not ship unmeasured

### 2.1 ✅ VERIFIED (recomputed myself). The bowl walls are a picket fence, not a ring
The panel rotation is set as `Euler(0, -a + Math.PI/2, 0)`: the local X goes
tangentially, so the half-thickness 0.30 stands crosswise, while `chord/2` (computed
as the TANGENTIAL width of the sector) sticks out radially. At the edge: the step between
centres is 0.84 with a panel width of 0.6 → a gap of 0.24; at the inner ends of the ribs
0.156; the inner boundary goes inward by ~0.13 from the intended one.
This explains the long-standing `wallExcess` anomaly of 0.141 on lv.40 WITHOUT an explosion and the
rescuer's teleports: between the ribs there are pockets, items get jammed in them.
**To whom:** PHYSICS. **Price:** a one-line fix, verification — a day.
⚠️ **DO NOT FIX SEPARATELY.** Removing π/2 changes the effective radius of the bowl, and on
the current geometry the PAIRS/topY calibration and the wallExcess norm were taken. It goes as ONE
package with 2.2.

### 2.2 The soak has not been run since 20 July — PHYSICS debt №1
Since then rocks appeared, a bomb with a strengthened explosion, the group cap, shards,
two-phase grinding, 93 types. Everything was checked pointwise, by a long session — not once.
The soak catches leaks, cumulative drift and hangers, and it is also the grounds
to revise the stale `wallExcess ~0.15` norm.
**To whom:** PHYSICS. **Price:** half a day with the ready tool (3–6 runs × 15 min).

### 2.3 Nobody measured the explosion perf at production values — and the headroom is eaten
I strengthened the explosion threefold (punch 5.0→15.0, jolt 6.0→18.0) AFTER the PHYSICS calibration.
Their measurement on main: the physics step in the explosion frame is **12.6–16.4 ms against 6.3–6.6** —
the headroom to the budget of 25 dropped from ×4 to ×1.5. The invariants are intact, there are no leaks.
⚠️ And the return is falling: ×3 force gave a response gain of only 10–40%. If "more powerful"
is wanted again — strengthen the perception (camera, sound, particles), not the physics.
**The owner's decision:** mitigate or deliberately leave it, knowing the price.

### 2.4 Free shakes are structurally short from ~level 15
NARRATIVE's measurement: a non-paying player loses **45–55% of the level's points** to grindings.
The stock is a flat 3 at any level, the ladder was cancelled deliberately. The panel's diagnostician
measured the consequence: the state "not a single tappable group" takes up
**28–48% of the level's time**, and there is not a single hint on the screen at that time.
This is no longer balance but a retention risk.
**The owner's decision:** raise the stock, or give shakes for progress, or
leave it as pressure toward monetization.

### 2.5 The Android measurement — a blocker that runs into the owner's phone
Without it 2.1–2.3 remain theory on the desktop: it is exactly there that it will become clear whether the
explosion freezes and whether the detector correctly identifies a weak device.
**Mine:** make a way to take the numbers in one tap and send a link.

---

## 3. Days 4–5: dead content and a store that sells the non-existent

### 3.1 ✅ VERIFIED. The last three types never get into the game
Spawn hands out types as `type: i % typesCount`, where `i` runs 0..pairs−1, and pairs
are at most 90. Only indices 0..89 are reachable. Dead are `foodicecreamscoopmint` (90),
`fooddonutsprinkles` (91) and **`steak` (92) — the owner's own model.**
⛔ It cancels the canon entry "the donut opens at level 54, that is how the convex hull
hole question is closed": it never opens, the hole is "closed" by the absence of the
item. And "the ceiling TYPES.length=93" is wrong — the ceiling is PAIRS=90.
⚠️ A consequence found by the completeness critic: **the store offers to unlock for 700
types that do not occur in the game.**
**The owner's decision:** a one-line fix (`floor(i*typesCount/pairsCnt)` instead of
`i % typesCount`) — the distribution stays even, the number of types in a level does not
change, the tail becomes reachable. But the level composition is a difficulty lever.

### 3.2 The GRAPHICS branch with 28 new types is waiting for a decision on 3.1
I am keeping it unmerged: their types land exactly in the dead tail and will not work, while
they weigh almost a megabyte (`index.html` 8.09 → ~9.0 MB; the package zip 6.11 out of the limit of 8).
There is no point merging what is invisible to the player.

### 3.3 The novelty of a level is physically unnoticeable
Because of the same formula types 0–8 stand in EVERY level from the 1st to the 82nd, while
the single new type per level is 7 pairs out of 71 on lv.2 and 3 pairs out of 90 on
lv.20 (3% of the bowl). The progression exists on paper, not in the feel.
**Tied to NARRATIVE's answer to "what comes after level 20":** make the unit of
progression not "+1 type" but a **recipe section** (our packs: animals, food,
cars, bricks, pirate). Mechanically nothing new — the packs already exist.

---

## 4. Days 5–6: the infrastructure of truth

### 4.1 There are almost no visual guards — INTERFACE's self-assessment, and I agree
The suite checks behaviour, while the whole layout lives on measurements that die together with
the session. Three things are guarded. WITHOUT a guard: outline thicknesses, button inversion in
the night theme, settings alignment, the boundaries of number compression, the showcase gap and the whole
iOS chrome recipe. Any of them is wiped out by a one-line fix on a green run.
⚠️ Separately: the contrast of the eye white against the daytime sky is **50 out of 255** (at night 209), and
the white pause button hangs on the same number. Should GRAPHICS lighten the top of the daytime
sky — both will disappear silently.
**To whom:** INTERFACE (they themselves proposed to start with this). **Price:** a day.

### 4.2 The time of day cannot be forced — three theme features are unverifiable
`skyTimeNow()` (10-stage; the former `skyForNow`/the 05-sky module were deleted together with
the panoramas in v191) and `isNightSky()` read the real clock, so the showcase theme,
the Shake inversion and the system button rule are not checked in the suite at all.
A tiny hook is needed (`?hour=`) — Graphics has been offered to introduce it within the current
sky task, they are touching that code right now.

### 4.3 The whole suite is one engine
`test.js` and `soak.js` hard-take chromium. Not a single run in WebKit.
The completeness critic showed that a smoke in WebKit is cheap, but did not himself give a
green verdict on another engine.

### 4.4 Sound is outside the review and outside the tests
`75-audio.js` and `74-sfx-data.js` were not claimed by any slice; there is not a single
audio assert in the suite; **not one sound has been listened to by anyone** — headless cannot.
`docs/AUDIO-PLAN.md` lists five "these are not wishes, these are breakages", and not one
slice checked the list against the code.
⚠️ Plus: the music is on by default (`musicVol=0.7`) and pulls 4.4 MB on the first
touch; a re-export to m4a 96–112 kbit/s will give 1.5–1.8 MB.

### 4.5 Small items from the review that I will re-check before work
A negative balance is hidden by a clamp (the button promises a purchase it will reject);
`commitSave` overwrites localStorage without a merge (two tabs wipe each
other) and writes to the cloud on every match; the toast lies UNDER the monetization screens
(z-index 8 against 30/40 — all refusals there are invisible); `wiggle` is called twice;
level/difficulty/music live OUTSIDE the save, that is, they do not travel between devices;
`DEV` is determined by hostname — the Capacitor wrapper will ship a build to the store with
debug open.

---

## 5. Day 7: upload to the platform

The first execution of the production monetization path on the real SDK. Not a single check
of ads and payments has yet run against the real portal — only mocks and the bench.
A smoke on developer.playgama.com is needed: telling a real impression from the fallback
"there is no ad — grant the reward" is only possible by eye on the portal.

---

## 6. The owner's decision block

| № | Decision | Why exactly your word is needed |
|---|---|---|
| 1 | **The game's name: BLENDO?** | The build has `<title>Mixer</title>`, while Narrative wrote the whole platform listing for BLENDO. I do not rename a brand off a retelling |
| 2 | **The spawn formula and the dead steak** (3.1) | It changes the level composition — the main difficulty lever |
| 3 | **The Subscribe button → "no ads forever" for 4.90** | Decided but not done; a "purchased" flag in the save and purchase restoration are needed |
| 4 | **Whether to create `noads_forever` in the dashboard** | At a cadence of once every 3 levels the product stopped being empty |
| 5 | **Banner ads** | I asked, there was no answer. I do not create it on my own |
| 6 | **The shake stock** (2.4) | A non-paying player loses 45–55% of the level's points |
| 7 | **The explosion perf** (2.3) | Mitigate or leave it, knowing the price |
| 8 | **The emptiness in the middle of the Play card on the desktop** | Hanging since past sessions (INTERFACE) |
| 9 | **Progress bars in the collection: partial or always full** | Hanging since past sessions (INTERFACE) |
| 10 | **The Open button on the collection cards** | Postponed by your request; bringing it back is three lines |
| 11 | **16 MB of assets in the repository** | My oversight (I assembled the commit via `git add -A`). I propose to keep it deliberately: these are the sources of the model converter |
| 12 | **The platform storefront materials** (icon, cover, screenshots, description) | Only you |
| 13 | **The music license** | Only you |

---

## 7. THE CHALLENGE: how to grow retention and time spent

### 7.1 The diagnosis: why the player leaves

Eight leaks, all with references to the code. The heaviest ones:

1. **The first 60 seconds do not explain the rule.** There is no tutorial in the project at all.
   By default it is Easy, where EVERYTHING is available — that is, the 3D pile is decorative, and the rule
   sounds like "the same type AND an invisible gap ≤0.9". The reach zone is drawn
   ONLY AFTER a tap, so before a tap it is impossible to tell a working pair from a
   non-working one. The first thing an unsuccessful tap teaches is the toast "Pair is too far — shake!",
   that is, "spend a resource of which you have 3".
2. **The player becomes a spectator when the shakes run out** (see 2.4):
   for 28–48% of the level's time there is no agency, and the screen says nothing about it.
3. **The win screen gives no reason to continue** (see 1.4).
4. **The balance has nowhere to go.** The only reachable sink is Boost for
   2000×2^bought, giving +25% points of ONE type: on lv.20 that is ~+0.9% of income for
   three levels of savings, a full buyout of one type ≈ 88 levels. The Open button
   is hidden, the leaderboard is off. The number grows endlessly and turns into nothing.
5. **An unfinished level is zeroed.** The score is banked only on a win;
   the round in progress is not in the save. Leaving on the 4th minute destroys 100% of the visible reward — while
   the invisible lifetime counters are committed on every match. On the portal,
   inside an iframe, a session break is the norm.
6. **The return is met by nothing:** straight to the bowl fill with the same 9 base types.

⚠️ And a systemic property that must not be forgotten: **a level is practically
unlosable** — your deliberate decision. So "I lost and want to win it back",
the main return driver in the genre, is absent for us by construction, and growth has to be
built on something else.

### 7.2 What to do: three moves selected by the judges

The judges scored by the price of the effect, the risk of doing harm and feasibility within our
constraints (no backend, no pushes, an iframe, a guest with a new id every session).

**Move 1. The series telegraph — 29 out of 30, unanimously first. Price: hours.**
The game DOES have a skill ceiling: a bot on the chain scored 28 855 points against a par score of
1280, that is ×22.5. But both halves — both the reward and the price — are not communicated to the player:
he does not know how many matches remain until turbo, how many misses remain until the break, and
how much he has just lost. Showing these three numbers is the cheapest move in the
list and the only one that makes the existing depth visible.

**Move 2. The win screen names the NEW item and shows the ghost of the next one —
26 out of 30. Price: a day.**
It turns "Next" into "I want to see what comes next". It leans on what is ready: the ghost
portraits of locked types are already implemented, the collection already knows what is open.
At the same time it closes leak 1.4 and gives the progression the feel it lacks.

**Move 3. Two numbers on the win screen that can be beaten — 21 out of 30. Price: a day.**
The best series against the record and how much the mixer took. Competing with oneself is what
works without a server and without a login, and the ideal metric is already computed for us
(`level.parBase`), and it lies in a hidden holder.

**What the judges killed:** "Mix of the day" (4 out of 30) — it requires shared state, which
does not exist without a backend; turning on the leaderboard (6 out of 30) — it runs into the server
storing a maximum, while your model is a falling one.

### 7.3 Further on, in descending value

A personal record as a rival (18) · A shake as a step toward turbo, so that the resource
gets a reason for risk (17) · A tap in a dead end aims the mixer instead of
doing nothing (16) · A safe exit: banking on `visibilitychange`, so that leaving does not
cost the player everything (15) · The level finale — a sweep with a payout instead of a 10–15-second
cutscene (15) · A dig log for 7 days (14) · Guest of the day (13) · Albums and
FOCUS in the collection (12).

⚠️ **About daily hooks — an important observation by NARRATIVE.** We have just been
closing the clock-rollback exploit, where the rollback STOLE what had been paid for. For a daily
gift the asymmetry is the opposite: the worst a player does by rolling back the clock is give himself
the bonus earlier. This is not an exploit but self-service. Therefore a daily on the device
clock MAY be built, unlike paid windows.

⛔ What we do not do: energy, lives and timers that gate the game. They kill our own
promise "a level is unlosable, play as much as you want".

### 7.4 An honest caveat
Moves 2 and 3 run into INTERFACE, and the story part runs into it as well and into GRAPHICS
(vignettes, museum halls). My part and the narrative part are cheap; the bottleneck is
their capacity. Planning has to be done with that in mind.

---

## 8. What is NOT in the plan and why

- **The story in code.** The arc spec was written on 22.07, in the product there are zero lines — this is
  the biggest "designed ↔ exists" gap. It does not fit into a week and is not
  a launch blocker; but it is exactly what answers "what comes after level 20".
- **Localization.** The platform language is read and thrown away. A layer is needed, but that is
  separate work, and until launch on English-language platforms it is not a blocker.
- **Accessibility.** For 1462 lines of markup — 10 aria/role/tabindex attributes.
- **Recovery from a WebGL context loss.** The loss is caught, recovery is not
  implemented, nobody has reproduced it.
- **Migration into an app.** There is a plan (`docs/LAUNCH-PLAN.md`, part II), but that is
  next week, not this one.
