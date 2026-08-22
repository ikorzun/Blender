# BLENDO launch week

The owner's goal: **the game ships next week.** We are aiming for Friday, August 7,
the weekend is the buffer. Today is Thursday, July 30, build v1-test-179 (270 checks green).

This is a plan for a human to read. Technical details are in WEEK-PLAN.md and WORKSTREAMS.md.
Only this here: who, what, when.

---

## YOUR PERSONAL LIST (everything else the chats will do)

Sorted so that the top blocks the launch and the bottom is decisions along the way.

| # | What | Deadline |
|---|---|---|
| 1 | **Music** (you remember): a new track + license. Export it right away as **m4a, 96–112 kbps** — otherwise it will have to be redone. The file simply replaces `music.mp3` next to the game. *On 31.07 you promised to send it on Friday 1.08 — we will pour it in right away, ahead of plan* | by Wednesday 5.08 |
| 2 | **Playgama dashboard — products**: three bundles per the cheat sheet below. The fourth (`noads_forever`) — if you decide to remove Subscribe | by Tuesday 4.08 |
| 3 | **Store listing materials**: icon, cover, screenshots. The texts are ALREADY ready — `docs/STORE-LISTING.md`, only pick and confirm | by Wednesday 5.08 |
| 4 | **Test on your iPhone**: I will send a link — look at the loading (curtain → items pouring in), the Safari bars, sound after a phone call | Wednesday–Thursday |
| 5 | **Measurement on Android** (if any mid-range Android is at hand): open the link, play a level, press one button — the numbers will fly off by themselves | any time before Thursday |
| 6 | **Smoke test on developer.playgama.com** after the upload: see real ads with your own eyes (you can tell them from a stub only on the portal) | Thursday 6.08 |

### Cheat sheet for the dashboard (item 2)

```
Product ID: bundle5        Consumable   4.90   Booster ×5 — 30 min
Product ID: bundle3        Consumable   9.90   Booster ×3 — 1 hour
Product ID: bundle2        Consumable  19.90   Booster ×2 — 1 day
Product ID: noads_forever  PERMANENT    4.90   Remove Ads Forever   ← if you decide
```
⚠️ `bundle5` is the cheap one ($4.90), `bundle2` is the expensive one ($19.90). The ID goes by the multiplier.
⚠️ For `noads_forever` the type must NOT be Consumable — otherwise the player will be sold it twice.

### Decisions needed from you during the week (not blockers)

- ~~Subscribe → "forever"~~ ✅ DONE 30.07: the "Forever for $4.90" button, the live
  price will be pulled from the platform's catalog. The `noads_forever` product in the dashboard IS NEEDED
  (cheat sheet above) — without it the purchase will not work on Monday.
- ~~28 new types~~ ✅ SHUFFLED IN 30.07: the first new ones are visible from level ~5, the fish
  from level 22 (deliberately not earlier), the donut stayed late until its shape is fixed.
- ~~Banner ads~~ ✅ DECIDED 30.07: we are not setting them up.
- **Explosion perf**: the strengthened explosion ate the performance headroom (×1.5 left).
  Leave as is or soften it — it will be clear after the measurement on Android.
- **Donut**: back in the game from level ~84, and its physical shape has no hole
  (items do not fall through into the ring, on Hard this is visible). For the launch we leave it
  late, it gets fixed afterwards (my decision, say so if you are against it).

---

## DAY-BY-DAY PLAN

### Friday 31.07 — the gameplay is visible to the player
**Interface:**
- ~~Bring the Museum back~~ → **remove the dead duplicate** (the owner's correction 30.07: the collection
  lives in the pause menu and works; "Museum" is an OLD copy of the same screen,
  stuck in a disabled layer together with the entry into debug. We do not fix it — we remove it,
  carefully: the sound/difficulty toggles live in the same layer, do not touch them).
- ~~Show the 1★–3★ rating~~ → **CANCELLED by the owner 30.07**: "stars are not needed,
  there are only points". The rating stays internal, we do not put it on screen.
- Unfreeze the points chip (the number in the top right corner; from level ~15 it
  is shown abbreviated as "12.5k" and stops changing from matches — show
  the full number).

**Physics:** the soak — 6 long runs on the current code. It has not been run for 10 days, during
which the rocks, the bomb and the shards appeared. It catches leaks and gives grounds to fix the walls.

### Saturday–Sunday 1–2.08 — growth and sound (without rushing, whatever we manage)
- **Series telegraph** (the best move by the estimation of all the judges, costs hours): show the player
  how many matches until turbo and how many misses until the breakdown. The depth is already in the game —
  it is simply not visible.
- **Victory screen**: name the new item of the next level + show its silhouette.
  Turns "Next" into "I want to see it".
- **Sound, three breakages out of four** (the fourth — the loop seam — will be closed by your new track):
  the music comes back after a phone call on iPhone; the victory jingles do not yell over the music;
  a tap on the eyes stops lying with the "matched" sound.

### Monday 3.08 — payments
**Integration:** hook up `bridge.payments` — the purchase, restoring `noads_forever`
when coming in from another device, taking "Coming soon" off the buttons. This is the riskiest
item of the week, which is why it is on Monday and not on Thursday.
**Interface:** showing the active booster on the game screen and on More Stars (has been hanging for a long time).

### Tuesday 4.08 — the walls and control
**Physics:** fix the rotation of the wall panels (right now the bowl is a picket fence with gaps, because of this
items get jammed) + a re-measurement of the fill. In one package, after the soak.
**You:** the products in the dashboard (item 2 of the list).

### Wednesday 5.08 — building the candidate
- Replacing the music (your track), the final build, a full run, zipping the package.
- **You:** the store listing materials into the dashboard (item 3), the test on iPhone (item 4).

### Thursday 6.08 — the upload and the smoke test
- I upload the package to developer.playgama.com.
- **You:** the smoke test on the portal (item 6): loading, the ads are real, the purchase goes through,
  the progress is saved. If a problem was found — Friday is for fixing it.

### Friday 7.08 — LAUNCH
- Fixes from the smoke test, if there were any. Publication.
- After the launch, for the first days we watch: downloads, complaints, ad impressions in the dashboard.

---

## What deliberately does NOT go into the launch

To make it in a week, these things go after the release — they improve the game but do not block it:

- **Leaderboards** — parked by your decision (the server stores the maximum, your model is
  a falling one; the question to Playgama is on you).
- **Story** (the arc with vignettes) — the spec is ready, zero lines in the code. This is the main answer
  to "what comes after level 20", but it is the next iteration.
- **Localization** — the launch is in English.
- **Daily mechanics** ("ingredient of the day", the excavation journal) — the second wave of growth.
- **The "Living environment" package** (the meta trio: the dream planet, the collection stars,
  the character's memory + the daily pair: idle gestures, the sun by the hour) — approved
  by the owner 31.07, the FIRST update after the release. Spec: docs/AMBIENT-META-PLAN.md.
- **Migration into apps** (iOS/iPad/Mac) — by the ready plan, after the web.

## Known risks of the week

1. **Payments will meet the real SDK for the first time only on Thursday.** If something is not
   right — a launch without purchases is technically possible (the buttons will go back to "Coming soon"),
   the decision will be yours on Friday morning.
2. **Weak Androids.** The bomb explosion is expensive; the measurement from a real phone (item 5)
   will show whether it needs softening.
3. **Weight**: 9.03 MB, the zip ~6.8 out of the limit of 8. There is headroom, but we do not pour in
   any more new model packs before the launch.
