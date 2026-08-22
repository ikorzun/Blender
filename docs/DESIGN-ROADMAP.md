# "Mixer" — meta-gameplay development plan (2026-07-17)

Method: 3 designers (retention / narrative / portal economy) -> synthesis -> 3 adversarial critics -> defense with verdicts.


---

# PART 1. THE PLAN

# "Mixer" — meta development plan. Final design document

## Backbone of the plan

Today the game has a strong core (combo → chain reaction, "dig deeper") and two holes: points don't convert into anything, and there isn't a single reason to come back tomorrow. The channel is portals: the player is anonymous, there are no pushes, the save is fragile, the session is 5–15 minutes, portals rank by playtime and by the share of returning players. That means the whole meta must be small, survive the loss of the save, live inside the session and sell the core's best mechanics rather than dilute them. The battle is for the first session and for the moment of leaving it: the player must close the tab with visible unfinished business.

## 1. Story frame: "Museum of Rescued Things"

The mixer is the antagonist. The player doesn't "collect pairs", he rescues things from under the blades. The frame is free because it flips already existing mechanics into story: the idle timer = the mixer is losing patience; penalty grinding = the things died; the final sweep = "what wasn't rescued"; the shake = the last chance. The golden teapot is the museum's first exhibit, it's already in the game.

Invariant: zero translatable text. The whole narrative is done visually: a golden glint, dark silhouettes on empty shelves, pictograms, progress numbers. This removes localization into all the portals' languages and makes the frame shippable right away.

The only "character" is the blender itself with eyes: 3–4 emotion sprites (joy on a combo, excitement on a chain reaction, boredom on idling). Dialogues, cutscenes, lore — we don't make them: on portals they get skipped, they don't move metrics, and they cost a lot.

## 2. Level progression

**Museum halls.** Every 10 levels — a new hall: its own background and bowl palette plus a set of 5 item types. We reassemble the existing 15 types into 3 starting sets of 5 ("Tea Party", "Geometry", "Grill" with the steak) — this is classification, not new art, halls 1–3 are free. Inside a hall the levels introduce the set's types one at a time; by the hall's tenth level the full pool is active. The current "9+N types" unlock is replaced by this scheme — the familiarization curve is preserved but gains a showcase meaning: the halls are visible on the museum screen as sections, the progression reads without words.

**The price of new halls — we count in kilobytes.** A low-poly OBJ weighs 20–60 KB; a hall = 3 reskins of existing shapes + no more than 2 new models ≈ 100–150 KB. With a file budget of ~1 MB it is comfortable to add 3–4 new halls; beyond that — model decimation or pool rotation. The KB limit is fixed before ordering each model — this is the second art budget.

**The first session — a front-load of all the hooks (the battle for D1):**
- Levels 1–3 shortened (100–110 items instead of 141): the first win by minute 3.
- The buried golden surprise — already on level 1–2.
- The first museum exhibit closes by level 2, the second is open right away (§3).
- The interstitial is not shown before the first win. Time to the first tap < 20 seconds from load — the trump card of the 1 MB file, protect it.

**Next — cheap variety:**
- A 5-level difficulty cycle: Easy → Medium → Medium → Hard → Medium. "Hard" = woven-in Hard rules (a visibility veil or a 15 s mixer timer), flagged in advance and paying ×1.5 coins. Hard stops being a setting and becomes a rhythm.
- Every 5th level — a mutator with no new art, parameters only: "Giants" (items ×1.6, 8 types), "Fog" (the upper half of the bowl is visible), "Turbo-mixer", "Chains only" (points count only during a chain reaction). At the start 3–4 mutators ≈ 1 AI session.
- The par score for 2★ (§4) grows by 8% per level inside a hall and resets at the start of a new one: a difficulty sawtooth — the hall ends hard, the new one starts easy plus the novelty of the set.

## 3. Collections: the museum as a return machine

**Set exhibits (passive progress).** An exhibit is "assembled" from rescued items: "rescue N items of type X". The progress drips in by itself from ordinary matches, no separate play needed. Calibration from the fact that "per level ~8–10 items of each type are collected":
- Exhibit 1: 3 types × 8 pcs. → closes in 1 level. Teaching the loop in the first session.
- Exhibit 2: 4 types × 20 pcs. → ~2.5–3 levels. A typical first session = 2–3 levels, which means the player leaves with 60–75% progress. This is designed unfinished business — the main D1 lever on a channel with no pushes.
- Further on: 5 types × 25–30 pcs. → ~3–4 levels per exhibit; a whole hall ≈ 30–40 levels of content.

**Artifacts (a generalization of the golden teapot).** In every level exactly one artifact is buried at the bottom — a golden version of an item from the current set (a material swap, zero bytes of art). Always in the lower third of the bowl, roughly once every 8 seconds it gives a golden glint through the mass: the player knows WHERE to dig, but not WHAT lies there. Dug it out before the end of the level — an exhibit in the museum plus coins.

**Rarities** — by material, procedurally: common 70% / rare 20% / epic 8% / legendary 2% (metallic, pearlescent, glow). Pity timer: no rare+ for 6 levels — a rare is guaranteed; no legendary by level 40 — guaranteed. Duplicates are converted into coins: 15 / 40 / 100 / 250 by rarity. Duplicates do NOT give stars — stars only for playing (§4).

**The showcase.** One screen between levels: museum shelves, exhibits = the same 3D meshes at a scale of ~0.4 — zero new bytes. A tap — the figurine rotates. Empty shelves with silhouettes are visible from day one. Hard timing: up to the "Next" button ≤5 seconds, skip by tap — we do not lengthen the session cycle.

**The reward for a full set is cosmetics and consumables, not power:** a procedural bowl/blender skin + a one-off pack of 3 shakes. The only permanent is +1 free shake for the very first closed set, and that is the cap. The museum is joy and status; skill and luck do not depend on it, losing the save hurts but does not break the balance.

## 4. Economy: coins + stars

**Coins are the only spendable currency.** Income per level: 20 base + 5 for each unused shake + 1 coin per each 500 points (combos and chain reactions are finally economically profitable) + artifact duplicates (15–250). Typical income 35–50 coins/level.

**The shop — 2 items at the start:**
- An extra shake — 25 coins (slightly less than one per level of honest play → a soft deficit).
- "Sight" — highlight all available pairs for 5 s — 15 coins (removes the visibility frustration on hard levels).
- Later: "Magnet" — force-collect any pair — 40 coins.

Balance rule: the average player's spending must outpace income by ~20–30%, otherwise coins inflate and stop being a goal. On the victory screen the goal is always visible: "35 coins left until the Magnet".

**Stars are a level rating, not a currency.** Per level 1–3★: 1★ — completed; 2★ — points ≥ the par score (the sum of the items' face values × 1.3 — you have to match with combo multipliers, not "flat"); 3★ — launched at least one chain reaction AND not a single item was ground down during idling. 3★ directly sells the two best mechanics as a goal. Stars are not spent: the total score unlocks skins at thresholds and gives a reason to replay a level. Later (v1.2): replaying a completed level on Hard gives a 4th star — a cheap ×2 of content out of ready-made difficulty.

**Rewarded — 4 placements (currently 1):**
1. Shake (exists, stays: base 3 + up to 2 for an ad).
2. Continue after a loss — once per level: top up 10 items + 1 shake. The genre's highest-converting placement.
3. ×2 points on the victory screen — second by conversion.
4. "Metal Detector" — highlight the column of items above the buried artifact for 10 s. (Not to be confused with the "Sight" from the shop: the sight shows pairs, the metal detector shows the dig.)

A choice appears: "spend coins or watch an ad" — it grows both retention and ad inventory. Benchmarks: 1.5–2.5 rewarded impressions/session, offer-to-view conversion 25–40%; placements with conversion <10% we kill rather than multiply.

**Interstitial:** only between levels, not before the 2nd win in a session, no more often than once every 3 minutes. All of it through the Playgama Bridge with the fallback "the platform doesn't give it — we silently skip".

## 5. Session rhythm and return

Target rhythm: a level of 3–5 min → a session of 2–3 levels = 8–12 minutes of playtime + 1–2 interstitials + 1–2 rewarded. A flow with no dead ends: win → showcase ≤5 s → one tap on "Next" → the next level.

**Daily Challenge — the main return mechanism, no backend needed.** The layout seed = the date (YYYYMMDD): all players get one level of the day, one scored attempt per day. The first level of the day — a guaranteed rare+ artifact. A single soft streak: day 2 = +1 starting shake, day 3+ = +2 and a frame in the museum, day 7 = a legendary artifact. A miss takes off one step and does NOT zero it out: a harsh reset on an anonymous audience = churn.

**The "Days in the game" visit counter** — not consecutive, never resets: rewards at 2, 3, 5, 7, 10, 15 visits (coins → shake → an exclusive item in the bowl → skin). It works on the portal's organics: the player came back to the catalog → "I've got 4/5 there until a reward".

**Return bonus:** hasn't come in for >24 h → "the bowl has steeped": +1 free shake and ×2 coins on the first level.

**The "tomorrow" teaser:** on the showcase, a slot with the silhouette of a rare artifact and a timer until midnight (local time). A promise inside the session is the only return channel without pushes, and therefore it must be visible at the end of every session.

**"Set of the week":** a seed from the ISO week number → the drop of one set ×2. Pseudo-live-ops without a backend and without calendar deadlines.

**Leaderboards** (Bridge, only where the platform gives them, behind a flag): "Points of the Day" and "Best Chain" (the maximum number of items in a single chain reaction — the board sells a spectacular feature and provokes replays). Fallback everywhere: local records + a "New record!" banner on the victory screen. We do not build the return core on leaderboards — that is a bonus on some platforms.

## 6. Save survivability

- Everything critical (coins, stars, the museum bitmask, visits, the streak) — one compact JSON, written after every level.
- Duplication: localStorage + Bridge storage; on divergence we take the maximum of each counter.
- The meta survives the loss of the save: the first 5–8 levels have accelerated progression (fast re-accumulation), content is not gated behind one long chain, permanent power is not sold for currency.
- We do not build anti-cheat protection: the player is anonymous, there is no PvP value — we do not spend sessions on it.

## 7. Release batches (each row ≈ 1 AI session unless stated otherwise)

### v1 — "the economy and the first session" (≈5 AI sessions, everything is cheap — code and parameters, zero art)

| P | Feature | Metric |
|---|------|---------|
| P0 | Coins: accrual, 500:1 point conversion, the shop (shake 25, sight 15), a counter on the HUD and on the victory screen | retention, playtime |
| P0 | Stars 1–3★ + the par score + the victory screen with them | replays |
| P0 | Rebalance of the first session: levels 1–3 shortened, the golden one on lvl. 1–2, no interstitial before the first win; a one-tap "Next" flow (0.5 session) | D1, QA gate |
| P0 | Rewarded ×3 new placements + interstitial with caps (1.5 sessions) | ads |
| P0 | Bridge storage + localStorage, the maximum on divergence (0.5 session) | D1 |

We do not drag anything from v1.1 into v1 — we release in a small batch and watch the platform's metrics.

### v1.1 — "the museum and a reason to come back" (in 1–2 weeks, ≈5–6 AI sessions, cheap: materials and UI, zero new models)

| P | Feature | Metric |
|---|------|---------|
| P0 | The museum: 3 sets out of existing types, set exhibits with passive progress, artifacts + rarities + pity, showcase ≤5 s, the glint telegraph (2 sessions) | D1, playtime |
| P0 | Daily Challenge (a seed from the date) + a single soft streak + the "tomorrow" teaser (2 sessions) | D1 |
| P1 | Visit counter + return bonus | D1/D7 |
| P1 | Duplicates → coins; rewards for a full set (skin + a pack of shakes) | replays |

### v1.2 — "variety and the showcase" (another 2–3 weeks later, ≈5–6 AI sessions; the only expensive part is the models)

| P | Feature | Metric |
|---|------|---------|
| P0 | The first new hall: palette + 2 new OBJs within 150 KB (2 sessions + ordering the models — EXPENSIVE, the only art line item) | retention after level 10 |
| P1 | The 5-level difficulty cycle + "hard ×1.5 coins"; mutators, 3–4 pcs. | playtime |
| P1 | Bowl/background skins for star thresholds and full sets | replays |
| P2 | Bridge leaderboards "Points of the Day" + "Best Chain" (behind a flag); a Hard replay for the 4th star (0.5 session) | replays |

Further on, by the metrics: a hall conveyor (1 session + models per hall), "set of the week", a seasonal set for a holiday. An optional A/B experiment (behind a flag only): the artifact can be ground up during penalty grinding with 50% compensation in coins — it adds stakes, but there is a frustration risk, do not turn it on without A/B.

## 8. Deliberately cut off (contradicts portal reality)

- **Energy/lives/waiting timers** — they cut the playtime the portal ranks by; on a portal this is a direct exit to the neighboring game in the catalog.
- **Hard streaks with a reset and calendar events "make it within 48 hours"** — without pushes the player comes back to a failed timer → pure negative.
- **In-game purchases** — portals usually do not have them; monetization = rewarded + interstitial.
- **Narrative deeper than the museum frame** (dialogues, cutscenes, chapters with text) — expensive, gets skipped, does not move metrics, drags localization along.
- **Deep meta** (leveling, crafting, upgrade trees) — dies together with localStorage and does not unfold in 5–15 minutes.
- **A backend, login, cloud saves beyond Bridge** — the channel does not give that.
- **New core mechanics** — the core is already strong; the plan frames and monetizes it rather than diluting it.

## 9. What to measure after every release

- **Playtime/session:** target 8+ minutes (the job of the stars, the showcase and the "Next" flow is to drag the player onto level 2/3). Levels per session: from 2–3 → 3–4.
- **D1:** the portal benchmark is 8–15%; the v1 target is +3–5 pp to our own baseline; after v1.1 the benchmark is 15–20% (a target, not a forecast) — daily should give a visible jump.
- **Unfinished business:** % of sessions that ended with an exhibit ≥50% complete — target >60%.
- **Rewarded:** conversion for each of the 4 placements separately; <10% — we kill the placement.
- **Interstitial:** complaints/anomalies → we tune the 3-minute cap rather than rip it out.

The first step is all of v1: it fixes both holes (points → coins and stars; the first session → unfinished business and a clean flow), costs ~5 AI sessions without a single new model and is self-sufficient — even if nothing further works out, the game already gets an economy and a reason to play "one more level".


---

# PART 2. CRITIQUE


## Lens: player psychology

1. An exhibit's unfinished business as the main D1 lever — works only in the game designer's head

The plan directly calls leaving a session with an exhibit at 60–75% "the main D1 lever". The failure mechanism: the incompleteness effect requires the player, at the moment of deciding "what to play", to REMEMBER the progress. But the decision is made the next day in the portal's catalog, where among a hundred icons an unclosed exhibit is not visible, and an 8-minute anonymous session creates neither a memory of the game's name nor an emotional attachment to "4 teapots out of 20" on a shelf. Collection mechanics retain the already retained (this is a D30 instrument, not D1) — a casual who has not yet decided whether he likes the game feels no loss from an unfinished set of nameless pastel figurines. The whole of v1.1 is betting on a psychological mechanism which, in order to fire, needs memory and attachment that on this channel physically have nowhere to come from. Criticality: killer.

2. Daily Challenge — "the main return mechanism", which is seen only by those who have already returned

Daily mechanics live on pushes (mobile) or social sharing (Wordle). Here there is neither, and the plan knows it — but props daily up with the "tomorrow teaser" on the showcase. This is a closed loop: the teaser is seen only by a player who played the session through to the showcase, that is, the return mechanism is advertised exclusively to those who have already returned. The streak rewards (+1/+2 starting shakes) are microscopic relative to the effort of "remember on your own and come back on your own": shakes are nearly free as it is — 3 base plus rewarded. The "Days in the game" counter suffers from the same thing: "the player came back to the catalog → I've got 4/5 there" assumes that he remembers a counter from a game he entered once. The benchmark "D1 15–20% after v1.1" against a portal benchmark of 8–15% is a doubling of the baseline off the back of a mechanic invisible to those who did not return. Criticality: killer.

3. The coin economy is cannibalized by its own rewarded

The plan is proud of the line "a choice appears: 'spend coins or watch an ad' — it grows both retention and ad inventory". This is not a choice: a shake for 25 coins and a shake for 30 seconds of an ad are one product at two prices, one of which is zero. The rational (and intuitive casual) behavior is to always watch the ad; the paid channel is dead from day one. The "Sight" for 15 coins is needed only on hard levels — a low-frequency sink. The result: coins pile up without being spent, there is nothing to back the rule "spending outpaces income by 20–30%" with, and v1 reproduces exactly the hole ("points don't convert into anything") that it claims to fix — only now with a shop, a HUD counter and spent AI sessions on top. Criticality: serious.

4. 3★ — a skill gate that turns the rating system into a sign that says "you play badly"

3★ requires launching a chain reaction (a series of 10 fast matches with no misses — a real skill threshold for a finger on a phone) AND not allowing a single grinding per level. Most casuals will never take it — and level after level they will see 1★. A system conceived to "sell the two best mechanics" becomes, for the bulk of the audience, permanent evidence of incompetence, and skins "by thresholds of total stars" become a knowingly unreachable showcase. Counting on replays for the sake of stars is a myth about a different audience: an anonymous casual with a 10-minute session does not replay what he has already completed, he either goes forward or leaves for the neighboring game. The replays metric, on which the whole block is staked, is close to zero on this channel regardless of the design of the stars. Criticality: serious.

5. The between-level flow: "one tap on Next" is declared, a funnel of four screens is designed

After a level the player is met by: the victory screen (stars, coins, the par score, the ×2-for-an-ad offer, "35 coins left until the Magnet"), the museum showcase, the "tomorrow" teaser and — with a level of 3–5 minutes and a "once every 3 minutes" cap — an interstitial after practically every level. The showcase trap is twofold: if it really is ≤5 seconds and is skipped by a tap, the casual will scroll past it without looking and the whole museum hook will pass by his consciousness (the main lever from point 1 will on top of that never even be seen); if it is informative, the cycle lengthens and stacks with the ad into a double interruption, and interrupting the flow between levels is churn point number one in a genre where the next game is one click away. The plan simultaneously demands of one screen that it sell the collection and that it not exist. Criticality: serious.

6. A mandatory Hard every fifth level — a wall exactly at the decision point "whether to continue"

A casual on a portal did not choose Hard — the cycle "Easy → Medium → Medium → Hard" imposes it on everyone. At the wall the casual does not "farm ×1.5 coins" (he does not calculate EV, he feels frustration) — he leaves. Worse: a par score of +8% per level inside a hall means that the end of every hall is the player's worst experience of the session, and the "sawtooth" places that worst experience exactly at the moment of the decision about returning. The "Chains only" mutator, for a player who has never once launched a chain reaction (see point 4 — such players are the majority), is a level with forcibly zero income. Variety designed as retention works as a schedule of churn points. Criticality: serious.

7. Generalizing the artifacts kills the only working hook and conflicts with the core

The golden teapot worked because it was a surprise. "Exactly one artifact every level, always in the lower third, a glint every 8 seconds" is a routine chore with a telegraph, not a discovery: the third dig is emotionally empty. Rarities 70/20/8/2 are gacha grammar without gacha value: the player quickly learns that 70% of digs are "junk for 15 coins", while the pity legendary at level 40 is promised to an audience that by and large does not survive to the tenth. The main thing is the mechanical conflict with the core: digging requires deliberately matching the lower third of the bowl, the combo system requires fast matches anywhere; misses for the sake of digging knock down the combo steps, that is, the new system penalizes the player for using the best old one. Two motivations pull the finger in different directions in every level. Criticality: serious.


## Lens: production

# Critique of the "Mixer" plan: 7 weak spots (in descending order of the cost of the error)

## 1. The AI-session estimate is understated by a factor of 2–3, and the monolith's regression tax is not budgeted at all — killer

The whole plan is counted in "session-features", as if every session ended with working code. The project's production reality says the opposite: the game is a single HTML file with tuned physics (three.js + Rapier), which has already been through the 2026-07 regression, after which the sleep/trim/reachability/glass invariants had to be fixed. There are no tests, QA is the owner, a non-programmer, on a phone. Each of v1's "cheap" features (coins, stars, placements, storage) reaches into the monolith's shared places: the points pipeline, the level flow, the UI overlays. The failure mechanism: session N breaks what session N-3 tuned, the owner notices it a day later on his phone, the repairing session breaks the next thing. "The museum in 2 sessions" is the showcase example: this is a separate meta UI with progress by type, pity timers, silhouettes and rotating figurines; realistically 5–8 sessions (see also point 4). Multiply all the §7 tables by 2–3 — "v1 in a week" turns into a month, and that is before the first measurement of the metrics. Additionally: every system inflates the single file, and the production model itself degrades — the bigger the monolith, the worse AI sessions orient themselves in it and the more expensive each subsequent edit is.

## 2. The plan has no sensor: there is nothing to measure §9 with — killer

The plan's entire logic is "we release in a small batch and watch the metrics": D1, playtime, the conversion of each of the 4 rewarded placements separately, "% of sessions with an exhibit ≥50%". But neither v1, nor v1.1, nor v1.2 contains a single session for telemetry, and a backend to send the events to does not exist by definition. Portals give out at best aggregates at the level of "players/sessions"; per-placement rewarded conversion and "unfinished business" they do not count — those are custom events. The failure mechanism: the rule "a placement with conversion <10% we kill" is unenforceable — there is nowhere to get the conversion figure from. The plan is building a control loop with no sensors: the releases will happen, decisions on them will not be possible to make, and after 3 releases the choice of features is once again made by eye. Dragging in third-party analytics is separate work (plus some portals restrict external requests or require approval for them), and it is nowhere budgeted.

## 3. The coin economy does not arithmetically add up to the declared deficit — serious

The plan declares "spending outpaces income by 20–30%", but the plan's own numbers give the opposite. Income 35–50 coins/level; by the measurements a level is completed with 2–3 shakes given 3 free ones + 2 for an ad — that is, the typical player does **not need** to buy a shake for 25 coins. The "Sight" for 15 is situational. There is no mandatory sink. The failure mechanism: over 10 levels the average player accumulates 300+ dead coins, the banner "35 left until the Magnet" stops meaning anything — and the original hole "points don't convert into anything" is reproduced one floor up, only now ~2 sessions have been paid for it. Inside the same economy a conflict of incentives is baked in: +5 coins for an unused shake rewards NOT using a mechanic, and directly wars both with the shake shop and with the Continue placement. And one more thing from the plan's own numbers: the "×2 points" rewarded, at a 500:1 conversion, gives ~5–15 coins — less than one shake; by the plan's own rule (<10% — we kill) this placement will kill itself.

## 4. The museum showcase: the hidden cost of rendering on mobiles — serious

"Exhibits = the same meshes at a scale of 0.4 — zero new bytes" sounds free, but the bytes are not the price. A museum shelf is either a second scene or a render-to-texture on top of the live game scene on a weak mobile GPU. "Rarities by material": metallic and pearlescent without an environment map look like gray plastic, glow is bloom or an imitation of it; both are a performance line item that the game does not currently have. "A glint once every 8 seconds through the mass" is a glow through occluders, that is, a separate render trick, not a material swap. The failure mechanism: the "2 sessions" estimate turns into 5+, half of which is the fight to keep the legendary artifact from looking worse than a common one and to keep the showcase from dropping FPS before the next level. This is v1.1's main feature ("a reason to come back"), and it is precisely the one that is underestimated the most.

## 5. "All players get one level of the day" — an unproven promise — serious

A seed from the date sets the composition and the spawn order, but the layout comes out of the physical settling of 141 bodies — and that depends on the timestep, the frame rate and the device. "One level of the day for everyone" requires either a deterministic simulation with a fixed step or pre-baked layouts — neither is budgeted, and a fixed step is an intrusion into the debugged physics core that the plan itself swore not to touch (§8: "we do not do new core mechanics"). The failure mechanism: either unplanned sessions are spent on determinism with a risk of a physics regression, or the "level of the day" is different for everyone — and then the "Points of the Day" board compares the incomparable, while daily's marketing essence ("everyone gets the same thing") is quietly false. The cheap honest option (the seed sets only the composition) must be admitted in advance, not discovered halfway through a session.

## 6. The invariant "zero translatable text" is refuted by the plan's own content — serious

The museum frame can be sold with pictograms. But further on the plan introduces: the 3★ conditions ("launch a chain reaction AND not a single item ground down"), the par score for 2★, a shop with three goods, pity rules, a streak with steps, "the bowl has steeped", "35 coins left until the Magnet" (that is literally a text string in the plan itself). The failure mechanism: the player does not reverse-engineer "points ≥ the sum of the face values × 1.3" out of an icon. The fork is binary: either text and localization come back (the cost that "zero text" promised to remove), or the players do not understand the systems — and then the stars, pity and the streak have been bought with sessions but do not move metrics, because they are invisible as goals. The second outcome is worse: the money is spent, the effect is zero, and in the metrics it will look like "the feature did not work".

## 7. The halls' KB budget is counted from headroom that does not exist — serious/cosmetic

The file is **already** ~1 MB. The plan disposes of "a comfortable 3–4 halls at 100–150 KB each" out of a budget that the current state has exhausted, and on top of that it counts kilobytes only for the art — while v1–v1.2 add the shop, the stars, the museum, daily, the streaks, the mutators, that is, hundreds of kilobytes of code into the same file. The failure mechanism: the trump card "under 20 seconds to the first tap", which the plan itself calls the first session's main advantage, is diluted by exactly those features that are supposed to save the first session. The limit has to be recalculated from fact (weigh the current file, fix the ceiling and a "code" line item, not just "models") before ordering the first model, otherwise v1.2 will run into the choice "cut the hall or cut the load speed" after the fact.

---

**Bottom line on the cost/effect ratio:** points 1 and 2 are systemic: they are not about a particular feature but about the fact that the plan's production model (the estimates) and its control loop (the metrics) do not exist in the declared form; until they are closed, any §7 table is a fantasy. Points 3–6 are features bought at an understated price with a risk of a zero or negative effect. Point 7 is a cheap check that has to be done before the first kopeck spent on models.


## Lens: platforms

## 1. The museum stands on storage that the target channels wipe — "killer"

The whole v1.1 meta (exhibits, the streak, "days in the game", unfinished business as a D1 lever) assumes that the player can be recognized tomorrow. On portals this is a lie. The game lives in an iframe on someone else's domain: in Safari/iOS WebView storage is partitioned and/or cleaned out by ITP after roughly 7 days without a visit — while a weekly cadence of returning from the catalog is the norm for a portal audience. Worse: the plan "we duplicate localStorage + Bridge storage" degenerates on Poki and on some other platforms into localStorage + localStorage, because in the absence of a platform store Bridge falls back to that same localStorage. On CrazyGames a cloud save exists only for logged-in users — and the player is anonymous by definition. The failure mechanism: the player comes back on day 8 → the museum is empty → the "designed unfinished business" turns into designed zeroing, that is, the return machine actively teaches the player that coming back is pointless. The §6 item "the meta survives the loss of the save" describes a fast re-accumulation of the first levels, but it does not answer the main thing: a collection that regularly evaporates does not build retention, it destroys it. **Criticality: killer** — this is the foundation of the whole of v1.1.

## 2. The "maximum of each counter" merge breaks the deficit economy — serious

The rule from §6 provably generates a currency dupe. Scenario: 100 coins in both stores → the player buys a shake for 25 → localStorage = 75, the asynchronous write to Bridge did not go through (the platform is lagging, the tab is closed, the write limit) → the next launch: max(75, 100) = 100 → the purchase is free. Any spend rolls back on any write failure, and failures on portals are the norm, not the exception. The whole §4 calibration ("spending outpaces income by 20–30%") is built on a deficit that this rule silently cancels. Separately for Telegram: CloudStorage means 4096 characters per value and limits on write frequency; "one JSON after every level" will hit the ceiling as the museum bitmask and the counters grow, and that is exactly when the writes will start silently failing, including the scenario above. Merging has to be done by the semantics of the field (coins — through a transaction log or last-write-wins with a version, bitmasks — through OR), and that is not in the plan. **Criticality: serious.**

## 3. The plan disposes of an ad cadence that does not belong to it — serious

"The interstitial is not shown before the first win" and "the first tap < 20 seconds" are written as if the game owned the ad slot. On portals this is not so: the portal shows its own preroll before/during the loading of the game regardless of the developer's wishes — the promise of "a first tap in 20 seconds" dies not in your code but in the platform's wrapper. The other side of the same error: Poki requires calling commercialBreak at natural pauses, and portal QA/ranking algorithms look at session monetization; a game that disciplinedly keeps silent until the second win and holds a "once every 3 minutes" cap gets a low revenue score → less traffic from the catalog → all the §9 metrics fall for a reason the plan does not even measure. The cadence has to be designed per-platform from the SDK's requirements, not declared globally. **Criticality: serious.**

## 4. The economy is calibrated for rewarded, which some platforms do not have — serious

The fallback "the platform doesn't give it — we silently skip" is written by the plan only for the interstitial. For rewarded there is no fallback, even though rewarded carries the economic load: Continue after a loss, ×2 coins, shakes 4–5, the metal detector. On a platform without rewarded all four placements silently disappear → the player's income falls, while the shop prices (a shake at 25 against an income of 35–50) and the rule "spending outpaces income by 20–30%" remain → the soft deficit turns into a hard shortage, a loss becomes an outcome with no alternative (there is no Continue), frustration churn grows precisely where there is no monetization anyway. The benchmark "1.5–2.5 rewarded impressions/session" on such platforms is zero by definition, and averaged metrics will mask that. A separate price/reward table for no-rewarded platforms is needed — it is not in the plan. **Criticality: serious.**

## 5. §9 promises measurements for which no instrument is named — serious

The plan's kill criteria ("a placement's conversion <10% — we kill it", "% of sessions with an exhibit ≥50% — target >60%", "unfinished business") require custom events for every placement and every session. Portal dashboards give aggregates: impressions, revenue, DAU, sometimes playtime — but not the "offer → view" funnel across four placements and not the state of an exhibit at the exit from a session. Bridge analytics is fragmented across platforms in the same way storage is. Nowhere does the plan name a pipeline (an external beacon endpoint, an event schema, the cost of maintaining it given the "there is no backend" position) — that is, the whole control loop "release → metrics → decision" silently assumes a capability that does not exist in the described stack. Without that, "kill/keep" decisions will be made by eye, and the whole point of small release batches is lost. **Criticality: serious.**

## 6. The "Points of the Day" leaderboard in the specified form does not exist in any Bridge backend — cosmetic

Bridge proxies platform leaderboards, and those are global persistent tables (where they exist at all). A board with a daily reset, "Points of the Day", is not given by any of the target platforms without server logic — that is, the feature as written is unimplementable, and an AI session will go into something of which only the local record with a banner will remain in prod, which the plan makes a fallback anyway. "Best Chain" as a global maximum is technically possible, but on an anonymous audience with a losable save the same chain will be submitted by "new" players many times over, cluttering the board. **Criticality: cosmetic** (the feature is behind a flag), but the v1.2 row in its current wording is a session spent in advance.


---

# PART 3. DEFENSE AND CORRECTIONS

# Verdicts on the critique of the "Mixer" plan

## Psychology

**1. Unfinished business as a D1 lever — PARTIAL.** I acknowledge the mechanism: the incompleteness effect requires memory and attachment, which an anonymous casual does not have after one session, and the status of "the main D1 lever" is removed from the exhibit. But this is not a killer: on portals the return goes through the catalog and the "recently played" rows — what brings the player there is the quality of the first session (v1's front-load), while unfinished business legitimately works one floor down, as an accelerator of the second session for those who have already clicked. We lower the feature in rank rather than cut it out: it is cheap and it hits D7, not D1.

**2. Daily is seen only by those who returned — PARTIAL.** I acknowledge the closed loop: daily does not create a return out of nowhere, and the benchmark "D1 15–20% after v1.1" is withdrawn as unfounded. But the mechanic's function is a different one: portal organics returns some of the players anyway — daily gives the returning player a reason to come in precisely today and tomorrow, that is, it works on the session frequency of returning players and on D7. At the cost price of "a seed from the date" the feature stays, the target metric changes.

**3. Rewarded cannibalizes coins — ACCEPTED.** One product at two prices, one of which is zero, is a design bug, there is nothing to argue with. The plan is corrected: the goods are split across the channels (rewarded = Continue and ×2; the shop = the sight and the magnet), a shake for coins is bought only after the rewarded cap has been exhausted — then coins lift the cap rather than compete with what is free. The details are in the list of corrections, item 1.

**4. 3★ — a skill gate — PARTIAL.** The condition "a chain reaction AND zero grindings" is set too high for a casual — accepted, we recalibrate: 3★ = points with a margin over the par score, the chain reaction moves into an achievement/record, "Best Chain". But there is nothing to throw the stars out for: it is a cheap progression feel and the only level rating; the bet on mass replays is indeed withdrawn, the stars remain for the sake of the skin thresholds and the feeling of growth, not for the sake of replays.

**5. A funnel of four screens instead of "one tap" — ACCEPTED.** The contradiction is real: the showcase is simultaneously obliged to sell the museum and not to exist. Correction: the separate showcase screen between levels is removed — the exhibit's gain is shown by an animated line right on the victory screen, the museum opens via an optional button; the interstitial cap is aligned so that it does not stack with the victory screen every level.

**6. A mandatory Hard — a wall at the decision point — PARTIAL.** That an imposed wall at the end of a hall is the worst moment for the worst experience, I accept: the "hard" level becomes an optional choice ("normal / challenge ×1.5 coins") — the wall turns into a door; the "Chains only" mutator leaves the starting pool; the par score's growth is smoothed. But the variety cycle itself and mutators for pennies are a healthy part of the plan and stay.

**7. Artifacts kill the surprise and conflict with the combo — PARTIAL.** The conflict of motivations (dig the bottom versus fast matches anywhere) is a strong observation, accepted with a cheap fix: the glint telegraph turns on only in the endgame, when the bowl is emptying and the combo pressure has subsided — digging becomes a natural phase of the level's end rather than a war over the finger. We treat the routinization with variability (an artifact not in 100% of levels, occasionally two) and by cutting the rarities down to 3 tiers. Generalizing the only confirmed hook is the right bet, there is no need to cancel it because of the telegraph's calibration.

## Production

**1. The estimate ×2–3 and the regression tax — ACCEPTED.** The project's history (the 2026-07 regression, the invariants, the owner as QA on a phone) is direct confirmation. All the §7 tables are recalculated with a ×2 buffer, the rule "one feature — one session — one smoke run of the invariants checklist" is introduced, the museum in v1.1 is budgeted from 4–5 sessions. The order and composition of the batches do not change in the process — the critique hits the estimate, not the sequence.

**2. There is no sensor for §9 — ACCEPTED, but not a killer.** The hole is real, and it is closed by a concrete cheap move: the owner already has a production Cloudflare Worker (platform-landings) — an event beacon for 10–15 events (placements, sessions, exhibit progress) — that is ~1 AI session and a P0 row in v1. The critique's own caveat is taken into account: the permissibility of external requests is checked per-portal before the release, and where it is forbidden — a fallback to the platform's aggregates.

**3. The economy does not add up to a deficit — ACCEPTED.** The critique's arithmetic is correct: there is no mandatory sink, +5 for an unused shake wars with our own placements, "×2 points" gives pennies. It is fixed together with psychology-3 by a single correction (the list, item 1): splitting the channels, ×2 coins instead of ×2 points, cancelling the bonus for unused shakes, reassembling the prices after the beacon's first data.

**4. The hidden cost of rendering the museum — REPELLED (with a concession on the estimate).** All the named problems are solved by standard three.js techniques without a fight: the showcase is a second scene that is rendered on demand between levels with the physics put on pause (not "on top of the live scene"); metallic/pearlescent is a PMREM environment out of a procedural gradient, a couple of lines; "a glint through the mass" is a billboard glow sprite, not bloom and not volumetrics. There is one concession: the estimate of 2 sessions → 3, which is already covered by the buffer from item 1; the "5+ sessions, half of them on FPS" scenario is not confirmed with these solutions.

**5. "One level of the day for everyone" is unprovable — ACCEPTED.** Physical settling is non-deterministic, and the plan has no right to touch the debugged core for the sake of a fixed step, by its own §8. The honest option that the critique itself proposes is accepted: the seed sets the composition, the spawn order and the day's rules, the wording "one layout for everyone" is removed from the plan in advance, the "Points of the Day" board becomes a local record of the day.

**6. "Zero text" is refuted by our own content — ACCEPTED.** The star conditions, the shop and the streak are not reverse-engineered out of pictograms. The invariant is reformulated: "zero story text" (dialogues, lore, cutscenes are still forbidden) + a dictionary of ~30 short system UI strings in JSON, translatable by AI for pennies. This preserves the original goal (not to build narrative localization) while admitting that the systems have to be spelled out.

**7. The KB budget from non-existent headroom — PARTIAL.** The procedural part is accepted in full: before ordering the first model the file is weighed by fact (raw and over the network), the ceiling and a separate "code" line item are fixed. But the panic that "hundreds of KB of code will dilute the loading trump card" is exaggerated: code is compressed by brotli at roughly 5:1, hundreds of KB of code are tens of KB over the network, whereas models compress badly; the limit will remain first and foremost an art limit, which is what the plan asserted.

## Platforms

**1. Storage is wiped by the channel — PARTIAL.** I acknowledge the save's fragility on some of the channels (iframe, ITP, the Bridge fallback into that same localStorage) — this is the heaviest point of the entire critique, and "a museum that evaporates teaches you not to come back" is a correct formula of the risk. But it would be a killer only if the whole meta hung on persistence: the plan is corrected with the principle "session value comes first" — the museum fully delights inside the session, on the loss of the save it shows "a new exposition" instead of empty shelves as evidence, long chains are not sold on platforms without a real store (adaptive meta depth per-platform). On Playgama and Telegram a platform store exists — there the meta works as intended.

**2. The max merge dupes currency — ACCEPTED.** The scenario of spends rolling back is provable, there is nothing to argue about. The fix is classic and cheap: coins are stored as a pair of monotonic earned/spent counters (the balance = the difference, both are merged via max), the museum bitmasks — via OR, the non-monotonic — last-write-wins with a version; for Telegram the JSON is split across keys to fit under the CloudStorage limit. Half a session of work, the hole is fully closed.

**3. The ad cadence does not belong to the game — PARTIAL.** That the portal shows a preroll and that Poki requires commercialBreak — accepted: the cadence becomes a per-platform config on top of Bridge, "<20 s to the first tap" is reformulated as a metric of our part of the loading. But the principle "do not hit with an interstitial before the first win" remains the default where the platform does not dictate otherwise — it is a defense of D1, and there is no reason to surrender it to all the channels wholesale.

**4. The economy breaks without rewarded — ACCEPTED.** The fallback was written only for the interstitial — a gap. Correction: a single config table for no-rewarded platforms: Continue for coins, 4 base shakes instead of 3, shop prices −30%; rewarded metrics are counted only on the platforms that have it, so that averaging does not mask a zero.

**5. §9 without a named instrument — ACCEPTED.** The same point as production-2, and the same fix: a beacon to the owner's existing Cloudflare Worker, an event schema for 10–15 events, P0 in v1, a per-portal check of the permissibility of external requests. Without that row the small batches really do lose their meaning — the critique carried the plan's own logic through to it.

**6. The "Points of the Day" board does not exist in Bridge — ACCEPTED.** A daily reset requires server logic, which is not there. The v1.2 row is reformulated down to what is implementable: a persistent "Best Chain" board where the platform gives one (behind a flag), "Points of the Day" — a local record with a banner; a session is not spent on a non-existent feature.

---

## Final corrections to the plan

1. **Economy (psy-3, prod-3, plat-4):** the goods are split across the channels — rewarded: Continue, ×2 coins (not points), the metal detector; the shop: the sight, the magnet; a shake for coins — only after the rewarded cap has been exhausted. Remove the +5 for an unused shake. A separate price table for no-rewarded platforms. Reassemble the prices from the telemetry data.
2. **Telemetry (prod-2, plat-5):** a new P0 row in v1 — an event beacon to the existing Cloudflare Worker (10–15 events: placements, session length, exhibit progress), with a per-portal check of the permissibility of external requests and a fallback to the platform's aggregates.
3. **Flow (psy-5):** the showcase screen between levels is abolished; the exhibit's gain — by an animation on the victory screen, the museum — via an optional button; the interstitial does not stack with the victory screen.
4. **Save (plat-1, plat-2):** a semantic merge instead of max (earned/spent counters, OR for bitmasks, versions for the rest); the principle "session value comes first", "a new exposition" instead of empty shelves on the loss of the save, meta depth adaptive to the reliability of the platform's store.
5. **Daily (psy-2, prod-5):** the seed sets the composition and the rules, not the layout; the wording "everyone gets one layout" is removed; the mechanic's goal is the session frequency of returning players and D7, the "D1 15–20%" benchmark is withdrawn.
6. **Stars and difficulty (psy-4, psy-6):** 3★ = points with a margin over the par score; the chain reaction — into an achievement/record, "Best Chain"; the "hard" level — an optional choice with ×1.5, "Chains only" is removed from the starting pool, the par score's growth is smoothed.
7. **Artifacts (psy-7):** the telegraph glint only in the endgame (removes the conflict with the combo); an artifact not in 100% of levels; 3 rarities instead of 4 at the start.
8. **Text (prod-6):** the invariant = "zero story text" + a dictionary of ~30 system UI strings in JSON with AI translation.
9. **Production (prod-1, prod-4):** a ×2 estimate buffer on all the §7 tables; the rule "feature — session — invariants smoke checklist"; the v1.1 museum is budgeted from 4–5 sessions with concrete techniques (a second scene on demand, PMREM out of a gradient, a glow sprite).
10. **Ads and the file budget (plat-3, plat-6, prod-7):** the ad cadence — a per-platform config; the boards are reduced to what is implementable ("Best Chain" behind a flag, local records of the day); before v1.2 — weighing the file by fact, a ceiling with a "code" line item, the hall's KB limit is confirmed before ordering the models.

## Top 5 arguments in defense of the plan

1. **The §8 perimeter withstood an attack from three sides.** Twenty points of critique — and not one of them demanded bringing back energy, IAP, backend meta, narrative or new core mechanics. Everything the plan deliberately cut off, the critique silently confirmed as correctly cut off — and those are the most expensive mistakes it could have made and did not make.
2. **The critique hits the calibrations, not the architecture.** The shop prices, the 3★ conditions, the wording of the daily seed, the merge rule, the telegraph's timing — every "killer" and "serious" was closed by a correction inside the existing structure, without tearing down a single system. The plan is of the right shape: the parameters are fixed by releases, the shape is not.
3. **The diagnosis was disputed by no one.** Both holes ("points don't convert into anything", "there is no reason to come back") and v1's priority — code and parameters without a single model, without risk to the debugged core — all three critics accepted as a given and argued only about the methods of treatment.
4. **The plan's art discipline is unique for meta plans.** The whole of v1 and v1.1 is built on reskins, materials and a reassembly of the existing 15 types; the only expensive line item (the new hall's models) is moved out to v1.2 — after the first metrics, not before them.
5. **Small batches with kill criteria are the plan's self-repair mechanism, and after correction No. 2 it is real.** With beacon telemetry on the already existing Worker the loop "release → metrics → decision" gets a sensor, and all the remaining disputed calibrations (the prices, the placements' conversions, the share of unfinished business) will be verified by data over one or two cheap releases rather than guessed in advance.