# Star top-up — the economics of rewarded + IAP packs (spec, 2026-07-24)

> ## ⚠️ DOCUMENT STATUS (2026-07-27/28) — READ FIRST
>
> **STAR PACKS CANCELLED BY THE OWNER** (verbatim 2026-07-27: "we have no
> concept of a star pack. Get More and the multiplier give a multiplication of
> in-game points for the time set at the point of sale"). A direct purchase of
> stars does not exist and is not planned. The `STAR_PACKS` constant has been
> **deleted** from the code (it does not "sleep").
> Everything below about **IAP packs** (§3.B, §4 cannibalization, the pack
> anchors 3000/19000/90000, "Mega=62000") is **THE HISTORY OF THE CALCULATIONS, not the spec.**
>
> **WHAT IS IN FORCE INSTEAD:** the only paid star mechanic is the
> **TIMED BUNDLE MULTIPLIER** (`STAR_BUNDLES`, 00-config): it multiplies what
> the player EARNS BY PLAYING for the duration of the window, plus consumables
> (shakes/hints) and a window with no interstitial ads. Tiers per the owner's
> mockups 783:95/785:112: `$4.99` ×5/30 min + 10 shakes + 15 hints +
> 1 day without ads; `$9.99` ×3/1 h + 15 + 20 + 3 days; `$19.99` ×2/24 h +
> 50 + 30 + a month. The value of a tier is counted as "how much the player
> WILL PLAY OUT during the window" — `(multiplier−1) × rate × time` + consumables
> + no-Ad, and NOT as "how many stars were bought".
>
> **WHAT STAYS ALIVE FROM THIS DOCUMENT:** the Boost ladder (2000/4000/8000/16000/
> 32000, a full buy-out of a type at 62 000) and **§v3 — the matrix of the
> early-unlock price** (`800 + 200·level`), it is approved and in the code.
>
> **THE `tu` FIELD** (fix A: what was purchased does not raise rank) is kept in
> the save, but **it has had no active sources since 2026-07-27** — there are no
> packs, and the booster, by the "works on everything" decision, goes through `se`.
> Do not delete the field: live saves and future top-ups.
>
> **§3.A (rewarded → stars, 70/video, cap 5) — CANCELLED BY THE OWNER**
> (2026-07-27, following the packs). Stars are given **only by the game**; the
> paid option is the **timed bundle multiplier**, which multiplies what was earned
> by playing. Ads for stars would contradict the model. The constants
> `REWARD_STARS_PER_AD`/`REWARD_DAILY_CAP` have been **deleted** from the code
> (they were never implemented either — no call sites existed).
> ⚠️ **The rewarded placements for SHAKE and HINTS are alive** and are not
> affected by this decision: they hand out a **resource**, not stars; the bundle's
> no-Ad window only suppresses interstitial ads and does not touch them.


Workstream NARRATIVE AND META, track [retention]. The owner's decision
(2026-07-24, verbatim): "for buying points, if there aren't enough, let's make a
fork: either you have to watch N number of ads, or top up with packs: I want
three packs, work out the economics".

⚠️ THIS IS A SPEC WITH NUMBERS BEFORE THE OWNER'S APPROVAL (like the star table).
Implementation (crediting, API, IAP hook) — a SEPARATE task after a "yes".
The payment hook is the INTEGRATION zone; the platform has not been chosen yet.

## 0. What already exists (the calculation base)

- **Stars as currency** (v1-test-90): the `se/ss` wallet, crediting for a win by
  the DELTA of the rating — 1★=100 / 2★=250 / 3★=500 **+ 10×level number**.
- **Earning rate from playing:** a typical level (2★–3★) ≈ **350★**; a session of
  2–3 levels ≈ **700–1050★** (~900★). The first Boost (1500) — in ~4–5
  levels of free play (~2 sessions).
- **The Boost ladder** (price of a step = `1500×2^step`):
  1500 / 3000 / 6000 / 12000 / 24000. The sum of the first 5 steps of ONE type
  = **46 500** (further on 48k/96k/… — the exponent cuts it off by itself,
  "maxing out" really means ~5 steps). Mockup: Boost 11k ≈ the 4th step (12000),
  a balance of 166.5K = a player with several purchases + a lot of play.

## 1. The fork when there is not enough (Get More)

When the balance is not enough for a Boost — two top-up paths, DIFFERENT AXES:

| Path | Price | Speed | Cap |
|---|---|---|---|
| **Rewarded** (watch videos) | free | SLOW | daily |
| **IAP packs** (three packs) | real $ | INSTANT | none |

The paths do NOT compete by construction: rewarded is "free, but slow and with a
daily ceiling"; a pack is "fast and with no ceiling, but for money". The grinder
player and the paying player are served by different paths (see §4 — the
cannibalization check).

## 2. A. REWARDED: the face value of a video

- **1 video = 100★.** Rationale: a round number; = the base of a 1★ level;
  = ~28% of an average level (350★) and exactly 1/5 of an excellent 3★ level (500★).
- **Daily soft cap on this placement: 5 videos/day → a ceiling of 500★/day.**
  The cap is the MAIN lever: it does not let rewarded devalue either the game or the packs.
- **"N videos for what" (honest reference points for the UI):**
  - 5 videos = 500★ ≈ one excellent 3★ level.
  - 15 videos = 1500★ = the smallest Boost (but that is **3 days** at a cap of 5/day).

⚠️ Rewarded does NOT devalue the game: a 3★ level gives 500★ for ~3–5 min of
real play; the same 500★ via videos = 5×~30 s per video + loading ≈ 15 min
AND are impossible in one sitting because of the cap. **The game is three times
more efficient than videos in terms of time** — videos are a valve for "tired of
playing well, but I want progress", not a replacement for the game.

⚠️ Platform dependency (audit verdict plt-4): on platforms WITHOUT rewarded this
path disappears — what remains is the packs (where there is IAP) or pure play.
Conversely, pure web portals usually have no IAP, but do have rewarded —
therefore the two-path fork COVERS BOTH types of platform (this is an argument
FOR the design, not a problem). Open question: on a platform with NEITHER path
(a rarity) — consider a "daily free bonus" so that the player does not get
stuck; not in v1.

## 3. B. IAP: three packs

Prices are the standard store tiers; the value per star GROWS with the size of
the pack (the large one is the better deal — the genre norm).

| Pack | Price | Stars | ★ per $ | Value vs the small one | = videos | What it is enough for |
|---|---|---|---|---|---|---|
| **Handful** (a handful) | **$0.99** | **2 000** | 2 020 | — | 20 | Boost-1 (1500) + change |
| **Jar** (a jar) | **$4.99** | **12 000** | 2 405 | **+19%** | 120 | Boost 1+2+3 (10 500) OR one Boost-4 (12000) |
| **Vault** (a safe) | **$19.99** | **60 000** | 3 001 | **+49%** | 600 | A full boost of a type 1–5 (46 500) + change; or several types |

Checks:
- **★ per $:** 2020 → 2405 → 3001 — monotonic growth, the large one is +49%
  better value than the small one (the standard "anchor" on mid/large).
- **Tie-in with the Boost ladder:** the small one covers the FIRST boost (a trial),
  the mid one a COMMITMENT to a type (3 steps), the large one the MAX of one type
  or a push across several.
- **No pack "solves out" the economy:** the large 60K < the mockup's 166.5K —
  that balance = a large pack + hundreds of levels of play OR 2–3 large packs.
  The economy cannot be closed out with one purchase (a healthy sign).
- **F2P is not blocked:** $1 = ~6 levels of earning (350★×6≈2100); over a
  distance of hundreds of levels this is a soft nudge, not a wall.

## 4. C. Cannibalization: rewarded ↔ the small pack

| | The small pack | Rewarded up to the same 2000★ |
|---|---|---|
| Price | $0.99 | $0 |
| Time | instantly | 20 videos |
| In practice | right away | **~4 days** (cap 5/day) |

The paths lie on DIFFERENT axes (money×instant versus free×slow+cap) — they do
not devour each other: whoever pays takes the pack for the speed; whoever grinds
watches videos for the zero price. The key lever of this section is the **daily
cap on videos**: without it, 20 videos in a row would nullify the point of the small pack.

## 5. Summary of the numbers (for approval)

- **Rewarded:** 1 video = **100★**; soft cap **5/day** (a ceiling of 500★/day).
- **Packs:** Handful **$0.99 = 2 000★** · Jar **$4.99 = 12 000★** ·
  Vault **$19.99 = 60 000★**.
- **The single most sensitive number is 100★/video** (it sets both the value of
  the game and the protection of the packs); the insurance is the daily cap. The
  rest scales from it.

## 6. Optional levers (not in the base spec, for the owner to choose)

- **×2 for the first video of the day** (200★): a soft hook for a daily return.
- **A newcomer's starter bundle** (one-time $1.99 = 8 000★, only in the first
  N days): the classic first-purchase converter; work it out if the owner wants
  a 4th "starter" slot.
- **A video bonus on top of a pack** ("+10% stars if you watch a video after the
  purchase") — a coupling of the paths, it raises both IAP ARPU and rewarded inventory.

## 7. Implementation (when the owner approves — a separate task)

| Piece | Zone |
|---|---|
| Crediting per video + the daily cap; `buyPack`/`grantStars` API | NARRATIVE (77-save, like spendStars/buyBoost) |
| Rewarded hook "stars for a video" (a new placement, its own soft cap separate from shake/continue) | INTEGRATION (78-ads) |
| IAP hook (buying a pack) + choosing the platform | INTEGRATION (deferred until the platform is chosen) |
| The Get More screen / the fork in the menu | INTERFACE |

---

# v3 — THE EARLY-UNLOCK PRICE MATRIX (level-scaled, 2026-07-27, APPROVED by the dispatcher as the default, implemented)

The owner's task (#9): the price of unlocking a type ahead of time must DEPEND on
the player's level (a matrix, not a flat 700); the unlock progression must be
HARD but ACHIEVABLE; take into account that early on the player may buy a Boost
too. Run through an adversarial check (power spike / F2P wall). Units are the
denominated balance (income ~700/lvl).

## The principle

Price = f(the CURRENT level), grows linearly together with income → it holds a
constant "dent" of ~29% of the bank at any level: more expensive than simply
playing on until the type, but always achievable by digging for ~1.5–2 levels. A
deliberate investment, not a routine. LINEAR, not geometric — income is linear
too (~700/lvl, there is no replay); geometry would sooner or later outrun the
bank and become "insurmountable".

## The matrix

| Level | Price | Levels of income | Premium × over "play out 1 level" |
|---|---|---|---|
| 1  | 1000  | 1.4  | 1.4× |
| 5  | 1800  | 2.6  | 2.6× |
| 10 | 2800  | 4.0  | 4.0× |
| 20 | 4800  | 6.9  | 6.9× |
| 30 | 6800  | 9.7  | 9.7× |
| 50 | 10800 | 15.4 | 15.4× |
| 85 (the 93rd type) | 17800 | 25.4 | 25.4× |

No ceiling. The growing premium is a feature: the purchase becomes ever more
deliberate, but NEVER exceeds the bank (income outruns the price, see the stress test).

## The formula

```
UNLOCK_PRICE(level) = TYPE_UNLOCK_BASE + TYPE_UNLOCK_PER_LEVEL · level
TYPE_UNLOCK_BASE = 800   // ≈1.14·income (the floor "more expensive than one level": 1000 > 700 at L1)
TYPE_UNLOCK_PER_LEVEL = 200  // ≈0.29·income (holds the ~29% dent)
```

## Reconciliation with Boost

Unlocking is a PRECONDITION for a boost, therefore the real price of an early
spike = the unlock + the 1st boost step (2000):

| Level | Unlock | +Boost-1 | Spike total |
|---|---|---|---|
| 1  | 1000 | 2000 | 3000 (~4.3 lvl) |
| 10 | 2800 | 2000 | 4800 (~6.9 lvl) |
| 30 | 6800 | 2000 | 8800 (~12.6 lvl) |

L1–9: the unlock is CHEAPER than the 1st boost step (2000) — the newcomer tries
the breadth of the collection before its depth. From L10 the unlock overtakes the
boost. A full max-boost of a type = 62000 (~88 lvl) — the combo "unlocked a
future type + upgraded it" is economically irrational.

## STRESS-TEST PASSED (what the adversary did NOT break)

- ⚠️ **THE MAIN CONCLUSION: the price is a regulator of FEEL, not an anti-exploit.**
  A power spike is impossible STRUCTURALLY (three independent gates, each kills the
  spike on its own): (1) THE SPAWN GATE — a purchased type does not enter the
  genLevel pool until the normal progression → an upgraded-but-not-spawning type
  pays exactly 0; (2) THERE ARE NO VALUABLE TYPES — accMult only multiplies matches
  of its own type, there is nothing to snipe; (3) self-financing + a minus to rank
  + deferred ROI. Any price here is safe — the owner may choose the numbers FREELY,
  by feel.
- NO F2P WALL forms: the price = 44%/33%/31% of the bank at L1/10/30, an asymptote
  of ~28.6% forever (the income slope 700 > the price slope 200). The only "not
  enough" is L1 with a bank of 0, and that is correct (no jump at the 1st level).
- A RANK LAUNDROMAT is excluded by sign: the unlock writes into ss, the leaderboard
  only falls from spending.

## Code note (the shape of the edit, code AFTER the owner's sign-off)

- `00-config.js`: the flat `TYPE_UNLOCK_PRICE = 700` → `TYPE_UNLOCK_BASE = 800`,
  `TYPE_UNLOCK_PER_LEVEL = 200`.
- `77-save.js` `typeUnlockPrice`: goes from a constant to a function of levelNum →
  `TYPE_UNLOCK_BASE + TYPE_UNLOCK_PER_LEVEL * levelNum`. The spending path (ss/merge/
  dup-assert), purchaseUnlock, canUnlockType — do NOT touch.
- No migration needed: uk is monotonic, what was purchased is preserved; there are
  no refunds.
- ⚠️ **TRIPWIRE:** the whole defence rests on the spawn gate (the type does not
  spawn ahead of time). IF an early unlock ever starts spawning the type — a price
  "based on level only" will become exploitable; cure it THEN: gate the early spawn
  by proximity (d≤1–2) OR move the price onto distance `base(L) + 150·(d−1)`. For
  now it is dead weight, do not add it.
