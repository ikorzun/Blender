# OUR OWN LEADERBOARD — specification (2026-08-07)

The owner's decision: «we're making our own» + «a guest needs to be assigned a unique id and always shown, effectively auto-login in the game, but not a Google one».
Assembled by code reconnaissance (4 parallel agents) + consolidation. Below is the working specification.

## WHAT WE RANK
## Which number we rank

**We rank `leaderboardScore()` — `src/app/77-save.js:285`.** The formula is already written and does NOT need to be changed:
`leaderboardScore() = max(0, se − max(0, ss − tu))`

In plain words: this is everything the player has **earned in play**, minus what he **spent above what was topped up**. Top-ups (`tu`) are eaten by spending first, and only the excess of spending drags down what was played — that is why buying stars does NOT raise your place («fix A», the owner's decision 2026-07-24), while spending on a boost/unlock drops your place. This is exactly the «Forbes» model, which the owner confirmed verbatim on 2026-08-07 («we're making our own», CLAUDE.md, «OWNER'S DECISIONS 2026-08-07», item 1).

**Do NOT take `starBalance()` (77-save.js:278)** — that is the wallet (`se+tu−ss`). Today both numbers coincide, because there have been no live sources of `tu` since 2026-07-27 (77-save.js:34-41, the star packs were removed by the owner's word; `addStars` is called only from the dev handle `starGrant`, 99-main.js:1068). But if top-ups come back, the difference becomes «is a place bought or not», and the table cannot be cleaned up after the fact. The public handle is already exposed: `__game.leaderboardScore` (99-main.js:1055).

## ⚠️ THE MAIN CORRECTION TO THE DOSSIER: the moment of submission

The dossier (the block about the service) proposes hanging the submission on `noteWin()` in 78-ads.js:502-514. **That way «dropping» WILL NOT WORK.** `noteWin` is called exactly once per win (the only call is 80-gameplay.js:657), so buying a boost in the menu will drop the balance instantly, while the table will stay at the end-of-level value. This is recorded as a DELIBERATE decision of the dispatcher 2026-07-29 (the comment at 78-ads.js:508-512) — and it is exactly that decision which the owner's task cancels.

**The solution: the `onStarsChange(cb)` subscription (77-save.js:270-276).** One subscription covers ALL the points where the balance changes, because `fireStarsChange()` is called by every writer:
- `bankLevelScore` (77-save.js:344) — a win;
- `bankLive` (:318) — early banking on a purchase;
- `spendStars` (:364), `buyBoost` (:408), `purchaseUnlock` (:570) — spending;
- `bridgeSyncSave` (:132) — the arrival of the cloud copy.

The core (`80-gameplay.js`) is not touched at all — the same technique with which Integration already built the submission without intruding into someone else's zone. Throttle: dedup by the last submitted value (the pattern `lbLast`, 78-ads.js:441/468) + a server-side limit of 1 write per 20 s (the `u` field of the same row).

## Three sources of the «table ≠ wallet» discrepancy — what to do with each

- **D1 (the server stores the maximum)** — on OUR OWN server it disappears by construction: we write the LAST value (`UPDATE`, not `max`). It remains only on the second tab — the platform one — and there it is the caption «all-time record», already sanctioned by the owner on 2026-08-06.
- **D2 (unspent top-ups `max(0, tu−ss)`)** — identically zero, there are no sources of `tu`. If a discrepancy is shown to the owner, `tu` has nothing to do with it.
- **D3 (the unbanked score of the current level)** — real and not curable: the chip in the game and the wallet in the menu show `liveBalance() = starBalance() + liveScoreDenom()` (77-save.js:299-307; the consumers are 85-hud.js:630 and :1406-1417), while only what has been banked goes into the table. In the middle of a level the player will see more in the wallet than in the table, by exactly `liveScoreDenom()` (`SCORE_DENOM = 10`, 00-config.js:99). **We cure this with a caption on the screen «in the table — as of the level's result», not by submitting liveBalance** (otherwise the table twitches on every match).

## Two tabs, not one

The owner, 2026-08-07, item 1, verbatim: «the platform table remains the second tab "all-time record" (it is free, the code is ready)». That means:
- **Tab 1 «Now»** — our service, `leaderboardScore()`, the LAST value, it drops, guests are visible.
- **Tab 2 «Record»** — the platform, the same `leaderboardScore()`, the server stores the maximum, the authorization gate stays (78-ads.js:456-460). Enabling = one line `LEADERBOARD_ID` (00-config.js:379, currently `''`) + a token from the Playgama dashboard (an action for the owner).

## THE PLAYER'S IDENTITY
## How the guest id is arranged

**Today there is no unique id at all.** There is only a DISPLAYED identity: `Save.gn` — a random name from the `GUEST_NAMES` list (77-save.js:200-217), the avatar is DERIVED from a hash of that same name (85-hud.js:1459-1493, `AVATAR_COUNT = 49`, files `avatars/Avatar01..49.png`). That is, the «name+avatar» pair carries exactly the same entropy as the name, and with 100 players ~77 distinct names are expected — as a key it is no good.

## The new field `Save.gid`

**Format:** `Date.now().toString(36) + Math.random().toString(36).slice(2,8)` — the precedent is already in the project, the telemetry `sid` (79-telemetry.js:9). Lazy initialization on the first access, as in `guestName()` (77-save.js:218-224), so that old saves get an id on the first launch.

**The merge rule — the MINIMUM OF THE STRING, in BOTH branches of `mergeSave`.** Why exactly min: the base36 timestamp stays 8 characters long until the year 2059, therefore the lexicographic minimum = the OLDEST id. The rule is idempotent, commutative, associative — both devices CONVERGE to one and the same value.

⚠️ **Do NOT copy the `Save.gn` rule** (`into.gn = into.gn || from.gn`, 77-save.js:63 and :91). By construction it does NOT converge: each device keeps its own forever, and the cloud copy is overwritten by whoever committed last. Copy it and we get the same disease under a new name: two rows in the table for one person.

**A checklist of three places — right in the file's comment (77-save.js:11-12):**
1. the `Save` literal (77-save.js:48);
2. **BOTH** branches of `mergeSave` — the carry-over when `from.gen > gen` (:54-72) and the merge when they are equal (:74-111);
3. `resetProgress` (:416-424) — **we do NOT reset gid** (the precedents: `gn` and `naf` are not listed there).

**Resetting progress sends a score of 0**, and the player honestly falls to the bottom of the table. This is not a hole but the declared mechanic — and it closes the old problem from LEADERBOARD-PLAN «I reset my progress, but the record on the platform stayed forever».

## What the player sees

The animal name `Save.gn` + the avatar from the hash — as it is now, no changes in the display. `gid` is never shown to the player, it is the key of the row on the server. The owner, 2026-08-07, item 2, verbatim: «a guest needs to be assigned a unique id and always shown, effectively auto-login in the game, but not a Google one» — that is, we do not wait for the platform's authorization, we issue the id ourselves on the first launch.

## The limits of honesty — tell the owner straight

- **`gid` travels to the cloud only inside the `Save` object** — that is the only channel (`commitSave` → `bridge.storage.set('mixer_save_v1')`, 77-save.js:116-135). A field outside `Save` will never see the cloud.
- **Only what has landed in the PLATFORM's cloud survives a reinstall and a Safari cache clear** (docs/PROGRESS-SAVE.md:31-45): Playgama and Yandex — yes, a real cloud; Poki and GameDistribution — no cloud at all, everything is in localStorage; CrazyGames — unknown. **A client-side solution does not exist.** On Poki a cache clear = a new identity and an orphaned row (it will die by the 180-day retention).
- **A HOLE that the owner probably does not know about: the level number is NOT in the save.** `mixer_level` is a separate localStorage key (40-items.js:12; written by 80-gameplay.js:656 and 99-main.js:1138), it is not in the `Save` object. That is, even on Playgama/Yandex with a working cloud the player will carry over the balance, the stars, the accumulations and the purchases — **but will start from level 1.** If it is «auto-login for the sake of saving progress», this must either be fixed (move it into `Save` with a max-merge per the same checklist) or honestly named as a limitation. Moved out into the questions for the owner.
- **Our `gid` does not reach the PLATFORM's server at all** — `bridge.leaderboards.setScore(id, score)` accepts only the board id and a number (78-ads.js:471), the row key there is the platform's `x-player-id`. That is why the authorization gate stays on the «Record» tab: without it we get a row per device and one more row per every cache clear, and with someone else's name at that («Aquamarine Guppy»), and there is nothing to clean it up with — the SDK has no record deletion.

## ⚠️ A contradiction with the canon, do not close it with theory

The vendored bridge (v2.0.2 and v2.1.0 alike, module 3941) **persists** the guest id in `localStorage` (the key `bridge-player-guest-id`), while the canon asserts three times «the guest id is new for every session» (CLAUDE.md «UNIFIED BALANCE»; docs/LEADERBOARD-PLAN.md:166, :186-188; the comment at 78-ads.js:457-458). We do NOT rewrite the canon — one live re-measurement on the bench is needed. **This does not affect our choice:** localStorage does not survive a Safari cache clear anyway, so the SDK's key cannot be our storage in any case. And we are not going to write into a private key of someone else's SDK — that is an undocumented contract, it will fall off on a bridge update.

## THE SERVICE
## Hosting

**Cloudflare Worker + D1. We do not set up a second binding — KV is not needed.**

KV falls away by arithmetic, not by taste: the free plan is 1 000 writes per day, and with a thousand active players the limit is used up in an hour; plus KV has no ordering, and the position would have to be computed by reading the whole list into the worker's memory. The role of a snapshot cache is covered more cheaply by the Cache API right in the worker.

⚠️ **Hang the worker on OUR OWN subdomain, not on `*.workers.dev`** — a part of corporate and school networks blocks workers.dev entirely, and the game lives on other people's portals, where we do not control the network.

**The key billing fact around which the whole scheme is built: a «row read» in D1 is a SCANNED row, not a returned one.** That means `SELECT COUNT(*) WHERE s > ?` for a player in 30 000th place costs 30 000 rows, and an exact rank on every submission never fits into the free plan.

| | Free | Workers Paid ($5/mo) |
|---|---|---|
| Requests to the worker | 100 000/day | no limit |
| CPU per request | 10 ms | 30 s |
| D1 rows read | 5 000 000/day | 25 billion/mo |
| D1 rows written | 100 000/day | 50 million/mo |
| D1 storage | 5 GB (500 MB per database) | 10 GB per database |
| Cron triggers | 5 per account | 250 |

**The estimate:** up to ~5 000 active per day — the free plan with a twofold margin. 10 000 active — it fits with a cron once per hour (~2.9 million rows read, 50 thousand requests out of 100 thousand). 50 000 active — Workers Paid $5/mo, there will be no overages (290 million rows read per month against the 25 billion included = 1% of the package). Storage is not a problem at all: a row is ~200 B, 50 000 players = 10 MB. Traffic ~4 KB per session.

## Schema

```sql
CREATE TABLE p (
  id TEXT PRIMARY KEY,            -- our Save.gid
  k  TEXT NOT NULL,               -- the HMAC secret, arrives once (TOFU)
  n  TEXT NOT NULL,               -- the animal name from GUEST_NAMES
  a  INTEGER NOT NULL,            -- the avatar number 1..49
  s  INTEGER NOT NULL,            -- POSITION = leaderboardScore(); the LAST value, not the maximum
  u  INTEGER NOT NULL,            -- unix-sec of the last write: tie-break + rate-limit
  q  INTEGER NOT NULL DEFAULT 0,  -- the client's seq, monotonic (anti-replay)
  c  INTEGER NOT NULL,            -- created: the plausibility ceiling by age
  cl INTEGER NOT NULL DEFAULT 0,  -- how many times the growth was clamped
  f  INTEGER NOT NULL DEFAULT 0   -- 1 = hidden from the common table
);
CREATE INDEX ix_rank ON p(s DESC, u ASC) WHERE f = 0 AND s > 0;
CREATE TABLE snap (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL);
```

The partial index `WHERE f=0 AND s>0` throws hidden cheaters and zeroed-out players out of all scans for free. The `u ASC` tie-break (whoever reached it earlier stands higher) makes the ordering deterministic without an extra field.

**The ladder of ranks is what makes the estimate add up.** Once an hour a cron collects, in a single query with a window function, the score at every hundredth place:
```sql
SELECT s FROM (SELECT s, ROW_NUMBER() OVER (ORDER BY s DESC, u ASC) rn
               FROM p WHERE f=0 AND s>0) WHERE rn % 100 = 0;
```
With 50 000 players that is 500 numbers (~3.5 KB of JSON). We put it into `snap` together with the top-100 and the total number of players. ⚠️ **The aggregation is done in SQL, not in JS** — iterating over 50 000 elements in the worker can eat up the free 10 ms of CPU (the time of the D1 query itself does not count towards the worker's CPU).

The position is computed in two ways:
- **an estimate (0 D1 rows)** — a binary search over the ladder, `rank ≈ i*100`. Returned in the response to a score submission;
- **an exact one (≤100 rows)** — `rank = i*100 + 1 + COUNT(*)` inside the bucket. Only when the screen is explicitly opened.

## Endpoints

⚠️ **All of them are «simple» CORS requests: a `text/plain` body with JSON inside, without custom headers.** The game lives in an iframe of someone else's domain, and `Content-Type: application/json` would trigger an OPTIONS preflight — every submission would cost TWO requests out of the daily 100 000. The edge cache saves D1 rows, but NOT requests.

- **`POST /v1/score`** — upsert + position. The request `{id,k(the first time),n,a,s,q,t,sig}` ~190 B, the response `{s,rank,exact,n}` ~70 B. Codes: 400 the form, 401 the signature, 409 `q` did not grow (an idempotent retry — we return what was stored), 429 more often than 20 s. **The row is created on the FIRST WIN, not when the game is opened** — a guest who dropped in for ten seconds does not spawn a row.
- **`GET /v1/top?p=1`** — no id and no signature, therefore it is cached at the edge in full (`Cache-Control: public, max-age=60`) and for the majority of requests does not touch D1 at all. A compact array form: `{"t":…,"n":50231,"p":1,"r":[["Kingfisher",37,182400],…50 rows]}` ≈ 1.6 KB raw, ~700 B after compression.
- **`GET /v1/me?id=…&t=…&sig=…`** — the exact rank + 5 neighbours above and below, ~400 B. Pagination is **keyset, not OFFSET**, and we deliberately do not go deeper than 100 places: instead of an endless list the player is given his own neighbourhood.
- **`DELETE /v1/me`** (signed) — deletion of one's own row. Since there is no email, this is the only physically possible mechanism for «delete my data».
- **`POST /admin/hide`** (Bearer from secrets) — manual hiding and restoring.
- **cron** `0 * * * *` the snapshot + the ladder, `0 4 * * *` retention. Two triggers out of five.

## Anti-cheat protection

**An honest framing: the score is computed by the client, which means there is no absolute protection and there will not be one** — it would require a server-side simulation of the game. We protect not the truth but what everyone else sees: the table must not look buried under billions.

**The key simplification: the dropping mechanic makes the protection ONE-SIDED — we protect growth only.** A decrease of the score we accept without questions: it is legitimate (spending) and useless to a cheater. Half as much code.

1. **An HMAC-SHA256 signature via WebCrypto.** The client generates an `id` and a `key` (32 bytes), the first submission carries the key in the clear (trust-on-first-use under TLS), after that `id.s.q.t` is signed. Honestly: it closes off curl against someone else's id, the replay of an intercepted packet and editing the number in transit. It does **NOT** close off whoever opens the console — the key lies in the save. This is raising the price, not a wall, and that is how it must be called.
2. **Anti-replay:** `q` is monotonic (`q <= the stored one` → 409), `|t − now| > 300 s` → 400. We send the ABSOLUTE value, not a delta, therefore retries are safe by construction.
3. **Rate:** no more often than 1 write per 20 s per player — by the `u` field of the same row, no separate storage is needed. On top of that — a Cloudflare Rate Limiting rule by IP at the WAF level (we do not store the IP itself).
4. **A server-side ceiling on the growth** derived from the game's economy (600-800 denominated per level, a level is 1.5-4 min, an honest peak of ~9 units/s): `Δ_max = 25×(now−u) + 2000`, plus an age ceiling `s ≤ 25×(now−c)` (a newborn account cannot stand first). **We clamp silently rather than reject** — a rejection teaches the cheater to tune the parameters.
5. **Three quiet steps:** clamping → at `cl ≥ 5` or on breaching the age ceiling `f=1` (the row disappears from the common table, **but the player still sees his own position** — he does not learn that he has been caught and does not go and create a new id) → manual deletion via the admin endpoint. **There are no bans:** there is no login, a ban costs one localStorage clear.
6. **We do not do:** captchas, proof-of-work, submitting replays of a round, server-side validation of the gameplay. For a casual game without prizes it does not pay off in any way.

## Compatibility with the existing parsing

Our server returns the STORED value in the body (`res.score`) + an explicit status — then the client-side parsing from 78-ads.js:472-490 is reused without rewriting. And if we ever go through substituting `saas.baseUrl` in the bridge's config, **the server is obliged to ALWAYS return a non-empty JSON body and to encode success in a body field, not in the HTTP status**: the bridge's transport does `fetch(...).then(r=>r.json())` without checking `res.ok`, therefore 403 and 500 arrive as success, while a 204 with an empty body arrives as a failure. **Recommendation: our own transport (fetch/sendBeacon bypassing the bridge), it does not depend on anything in the SDK** — the `saas.*` keys are not officially documented and may shift in a future version.

## DEGRADATION
## Rule number one

**The table is decoration. It NEVER blocks the game.** Not a single `await` on the win path, not a single gate at the start of a round, on `GAME_READY` or on the transition between levels.

This is not our invention — the owner has already approved the same principle for another delivery channel on 2026-08-06, item 1, verbatim: «if the pack is unavailable the game silently plays with the base». We formulate it for the leaderboard the same way: the game must be complete without it.

## Three battle-tested patterns from the project — we copy, we do not invent

1. **A silent skip with the reason determined BEFORE the call.** `lbBlockedWhy()` (78-ads.js:445-462) → `{ok:false, skipped: why}`, the comment right there: «SILENTLY: no toasts, no errors in the console». The reason for exactly this construction: both «the platform cannot do it» and «the network went down» give an empty `Promise.reject()` without an argument — they cannot be told apart by the rejection itself (measurement 2026-07-29). So we tell them apart BEFORE the call.
2. **Best-effort without retry spam.** `.catch(()=>{ lbLast = null; Telemetry.ev('lb',{s:score,err:1}); })` (78-ads.js:~495) — «we simply allow a retry at the next natural point rather than deciding "it did not save"».
3. **A promise with a hard time ceiling.** `Ads.curtainGone` — a one-shot promise that ALWAYS resolves (immediately on `file://` and without the SDK, on `game_ready`, by the safety net, by the hard limit `CURTAIN_MAX_MS`).

## The client

- `fetch` with an `AbortController` and a timeout of **4 s**, there are no retries within a session.
- **The outgoing score is ONE SLOT, not a queue.** The number is absolute, which means only the last one has to be stored: what has not been sent lies in the save (`lb_pending`) and goes out with the next successful request. A queue would be a superfluous entity and a source of duplicates.
- We never show a spinner for longer than a second.

## Four states of the screen

1. **A live table.**
2. **A cache from localStorage** with an honest caption «as of 14:30» — it is shown INSTANTLY and updated in place.
3. **No connection** — «the table is unavailable», but **your own row is drawn from the local balance**. The owner's requirement «a guest is always visible» is met offline as well.
4. **The first launch offline** — only your own row, a dash instead of the place.

Plus, for the second tab (the platform one) the states from LEADERBOARD-PLAN «Chunk 2» remain: «the platform does not support it» and «sign in to get into the table».

## The server

- If D1 does not answer, `/top` returns the last snapshot from the Cache API with an honest `t` (**stale-on-error**).
- A write falls to 503 — the client leaves the number in the slot and does not treat this as an error.

## The platform

The worker on our own subdomain; with a portal's strict CSP the domain is added into `connect-src`. ⚠️ **It is verified on the bench of EVERY platform before the release** — our page has no CSP at all (a `grep` over `src/shell.html` is empty), which means the restriction, if it arises, will come from outside: from the headers of the platform's hosting, from the `sandbox` attribute on the iframe or from the parent document's CSP. None of this is recorded in the project.

## ZONES AND PRICE
## The dispatcher — 0.75 agent-days

- This specification + recording the decision in CLAUDE.md (the 2026-08-07 block is already there, supplement it with the submission mechanism via `onStarsChange` — so that the next session does not roll back to `noteWin`).
- **The save fields are the dispatcher's zone, 77-save.js is his canon:** `Save.gid` into the literal (:48), into BOTH branches of `mergeSave` (:54-72 and :74-111) with the min-string rule, do NOT touch it in `resetProgress` (:416-424).
- The config: the section for our own board (the worker's URL, on/off in one line following the `LEADERBOARD_ID` pattern, 00-config.js:379); enabling the platform tab after the owner's token.
- **Close `?dev=1` on the production build — a blocker, it is done BEFORE writes are enabled.**
- Fixing a typo in docs/LEADERBOARD-PLAN.md (in the table option «d» is struck through, while the text below says «I am striking out option "c"» and describes «d» at that — the reader draws the false conclusion that our own server was rejected).

## Integration — 3.0 agent-days

| Chunk | Days |
|---|---|
| The worker, the D1 schema, `POST /score`, `GET /top`, cron (the snapshot + the ladder) | 1.0 |
| `GET /me` (the exact rank via the ladder, the neighbours), keyset pagination, simple-CORS, the edge cache | 0.5 |
| Anti-cheat: HMAC, seq, the rate, the ceiling with clamping, the `f` flag, `/admin/hide`, `DELETE /me` | 0.75 |
| Worker tests (miniflare/vitest) + a seed of 50 000 rows + **a measurement of the real consumption from the D1 dashboard** | 0.75 |

Plus a new module **`src/app/82-lb.js`** — the network client: the `onStarsChange` subscription, dedup by value, the `lb_pending` slot, a timeout of 4 s, the degradation states. **The core (80-gameplay.js) is not touched.**

## Interface — 1.75 agent-days

- An overlay screen following the **«More Stars»** pattern (`src/shell.html:1843`, the styles and the cards are already there): the top-50 of our own tab, your own row highlighted, the neighbourhood (5 above / 5 below), a second page.
- **Two tabs:** «Now» (our service, it drops) and «Record» (the platform, the maximum) with honest captions — we explain the discrepancy of the numbers, we do not hide it (the owner's requirement 2026-08-06).
- The caption about D3: «in the table — as of the level's result».
- Four degradation states.
- The entry point: a button on the main screen next to the profile + a «your place» line on the win screen. **The place in the menu has already been freed up** — the «No more AD» banner block was removed with a tombstone specifically for the leaderboard block (WORKSTREAMS.md, v1-test-236, the owner's word «there will be a leaderboard block instead of it»).

## Graphics — 0 days

There is no work. The avatars (`avatars/Avatar01..49.png`, 192px) and the card styles are already in the project.

## Docs and deploy — 0.5 agent-days (Integration)

A line for the privacy policy, the deploy, quota monitoring.

---

## TOTAL ~6 agent-days

**There is exactly one cut line:** everything except the Interface screen (~4 days) gives a working service WITHOUT the screen — the score accumulates, the position is computed, the player sees nothing. **The first half is reversible, the second is not.** Lay out the screen after the owner fixes the formula (see the questions) — if the quantity is to be changed, the screen has to be redone anyway, and the table cannot be cleaned up after the fact.

## Integration points, so that they need not be looked up again

- The new module `src/app/82-lb.js` (the numbering is free between 80 and 85).
- The subscription is `onStarsChange` (77-save.js:270-276), NOT `noteWin`.
- The save fields are in 77-save.js next to `gn` (:196-224).
- The screen is 85-hud.js (the avatars are wired up there as well, :1459-1493).
- The events are in 79-telemetry.js, the name `lb` is already taken with this meaning (78-ads.js).
- The public API for the screen is already exposed: `__game.wallet/starBalance/liveBalance/leaderboardScore/spendStars` (99-main.js:1048-1056) + the test handles `bankScore` (:1119), `scoreShownDenom` (:1121), `mergeRaw` (:1125), `starGrant` (:1068).

## GUARDS
All guards are **two-sided per the project's canon: red on a broken build, green on a healthy one.** A sabotage test must strike at the PROPERTY, not at its neighbour.

## Identity guards (`test.js`, the dispatcher's zone) — 5 of them

Today NOTHING checks the cross-device merge of the identity: the existing guard (test.js:4612-4685, «HUD PACKAGE C») checks only the stability of the name between openings of the menu. We add them via the test handles `saveRaw`/`mergeRaw` (99-main.js:1125):

1. **Convergence of `gid` in BOTH merge orders.** Two «devices» with different `gid`s are merged in both directions and give ONE AND THE SAME result (the minimal one). *Sabotage test: replace min with `into.gid || from.gid` (the current `gn` rule) — the guard must go red, because the orders will diverge.*
2. **The `from.gen > gen` branch also preserves the minimum.** ⚠️ This is the most likely hole — the checklist at 77-save.js:11-12 is about exactly this. *Sabotage test: throw the line out of the :54-72 branch — with equal generations it is still green, here it is red.*
3. **`resetProgress` does not erase `gid`.** *Sabotage test: add `Save.gid=''` at :416-424.*
4. **`gid` makes it to the cloud:** after `commitSave` the field is present in the JSON that went to `bridge.storage`.
5. **`gid` is not shown to the player** — on the profile screen there is only `Save.gn` and the avatar.

## Submission guards (`test.js`, Integration)

6. **Spending drops the submitted number.** Bank the score → buy a boost (`buyBoost`) → record that `onStarsChange` fired and that a REDUCED value went to the client. *Sabotage test: put the subscription back on `noteWin` — the guard goes red, because the number will not travel until the next win. This is a direct defence of the owner's requirement.*
7. **We rank `leaderboardScore`, not `starBalance`.** Pour in `tu` with the test handle `starGrant(n)` (99-main.js:1068) → the numbers diverge → the smaller one is submitted. *Today the formulas are numerically equal, so without an artificial `tu` the guard is vacuous — and that is exactly why it is mandatory: it is the only one that will catch a substitution of the formula.*
8. **Dedup:** the same value does not go out a second time; a DROPPED value goes out without fail (a dropped one ≠ the previous one, dedup by value is safe for a dropping table).
9. **Not a single `await` on the win path:** with an unavailable endpoint (a mock with a timeout) the win, the banking of the score and the transition to the next level take the same time. *Sabotage test: put an `await` before showing the win screen.*
10. **A slot, not a queue:** three failed submissions in a row → in `lb_pending` there lies exactly ONE number, the last one.

## Worker guards (miniflare/vitest, Integration)

11. **The server stores the LAST value, not the maximum.** Write 5000 → 3000 → read 3000. *Sabotage test: replace the upsert with `max(s, ?)` — that is, with the platform's behaviour. This is the main guard of the whole undertaking.*
12. **Idempotency and anti-replay:** a retry with the same `q` → 409 with the current value, not a duplicate row; a `q` smaller than the stored one → 409; `|t−now| > 300 s` → 400.
13. **Silent clamping:** a claim above `Δ_max` writes the ceiling and grows `cl`, the response does not differ from the normal one; at `cl ≥ 5` the row gets `f=1`, disappears from `/top`, but `/me` keeps returning its own position.
14. **The exact rank == an honest recomputation** on a seed of 50 000 rows: the `rank` from the ladder matches a direct `COUNT(*)` for 20 random players.
15. **Simple CORS:** the request goes out WITHOUT a preflight (there is no OPTIONS in the worker's log). *Sabotage test: set `Content-Type: application/json` — the guard goes red.*
16. **stale-on-error:** with D1 unavailable `/top` returns a snapshot with an honest `t`, not a 500.

## Measurements, not guards

17. ⚠️ **The real D1 consumption on a seed of 50 000 rows, from the dashboard.** The assumption «updating a row with one index ≈ 2 rows written» is NOT from Cloudflare's documentation, it is an estimate, and the whole conclusion «40 thousand writes per day fit into the free 100 thousand» rests on it. Until the measurement, call the numbers of the estimate an estimate. It is cured by increasing the submission interval.
18. ⚠️ **CORS/iframe/cookies are verified ONLY on the platform's production bench.** Our automated test does not reach the leaderboards in principle — it walks over local files, where the SDK does not load, while the bridge sections run MOCKS. Our own server partially closes this gap (the endpoint is brought up locally and is honestly covered by the suite) — but not fully.

## A trap of the canon before the work starts

⚠️ **Before adding any new handle into `__game` — a `grep` over 99-main.js.** A duplicate key silently eats the hook (caught 2026-08-05, CLAUDE.md).

## RISKS
## 1. The platform's review risk — UNMEASURABLE, not «low». The only release blocker

**The mechanism:** docs/LAUNCH-PLAN.md records that Playgama names built-in analytics as a separate reason for rejection, and that «a part of the partner platforms blocks any external requests» — because of which our own telemetry is deliberately switched off for portal builds (79-telemetry.js:7, `let URL = ''`, everything else is ready). Our own leaderboard is an outgoing request to our own domain, the same class.

**Why it is unmeasurable:** ⚠️ **there is no primary source in the repository.** The section was assembled by searching, no quote of Playgama's rules or a letter from the platform is attached, the specific «partner platforms» are not named.

**Mitigation:** an answer from the platform by letter (questions 7-9). An intermediate option, if the risk is judged high: **write the score to ourselves, but show the platform's table** — a write is almost free and unnoticeable (`sendBeacon`, it survives the tab going away), whereas the screen requires a real CORS contract. An asymmetry that is easy to overlook.

## 2. `?dev=1` on the live site — a blocker, to be closed BEFORE writes are enabled

**The mechanism:** debugging opens on the production address via `?dev=1`, and there is score granting there (`starGrant`, `bankScore`). While there is no leaderboard, this is a cheat in a single-player game. **With a leaderboard it is a direct entry into the top.** Our own server does not help here at all: it verifies nothing, it accepts a signed number.

**Mitigation:** close `?dev=1` on the production build as a separate task BEFORE this, not together with it.

## 3. A submission error in the middle of a level — a new risk of our own architecture

**The mechanism:** we move the submission from `noteWin` (once per win) to `onStarsChange` (every change of the balance). This is MANDATORY for «dropping», but it raises the frequency of requests and creates a new point of failure in the middle of a round.

**Mitigation:** dedup by value (the pattern `lbLast`, 78-ads.js:441), a server-side limit of 20 s via the `u` field, one `lb_pending` slot instead of a queue, a timeout of 4 s without retries. The traffic estimate: 20 000 submissions/day with 10 000 active.

## 4. Cheating — we raise the price, we do not build a wall

**The mechanism:** the score is computed by the client, the save is plain text in localStorage, the HMAC key lies right there. Whoever opens the console will sign anything. Plus a forged number is «sticky»: `se`/`ss` are monotonic and are not lowered by synchronization.

**Mitigation:** one-sided protection (growth only), silent clamping, the quiet hiding `f=1`. ⚠️ **The formulation «our own server solves cheating» is TRUE only with validation** (server time, the growth ceiling, the age ceiling) — a simple receiver of a number gives exactly the same protection as the platform, that is, none. This is a separate scope of work (0.75 days), not a side effect.

## 5. D1 billing — rests on an unverified assumption

**The mechanism:** the conclusion «40 thousand writes per day fit into the free 100 thousand» leans on the estimate «updating a row with one index ≈ 2 rows written». **Cloudflare's documentation does not disclose how an index update is counted** — this is an estimate, not a number taken from the docs. Plus a «row read» = a scanned one, therefore a careless `COUNT(*)` carries off the quota instantly.

**Mitigation:** a measurement from the D1 dashboard on a seed of 50 000 rows is part of the scope of work. If a write turns out to be more expensive — it is cured by increasing the submission interval from 3 to 10 minutes. The plan is $5/mo in any case at 50 thousand active.

## 6. The iframe / CSP of the production portal — the measurement was on the bench, not in production

**The mechanism:** a request from the game to a non-playgama host has already been verified live (Integration substituted its own server for `saas.baseUrl` and recorded a table of the responses) — this is the strongest precedent, «our domain is reachable from the game's context» has been confirmed, not inferred. ⚠️ **But a reproduction ON THE PRODUCTION PORTAL inside an iframe has not been recorded.** Separately: the bridge's transport sends `credentials:'include'`, and third-party cookies in an iframe may not go through — an open question flagged by the author of the contract himself.

**Mitigation:** we do NOT build authorization on cookies at all — the identity is passed as an explicit field in the body. Verification on the bench of every platform before the release; the domain is added into `connect-src` if the portal has a strict CSP.

## 7. Loss of the identity on a cache clear — the platform's limitation, not ours

**The mechanism:** `gid` travels to the cloud only inside `Save`, and a cloud exists only at Playgama and Yandex. Poki and GameDistribution have no cloud at all — a Safari cache clear gives a new identity and an orphaned row.

**Mitigation:** there is no technical one. The row will die by the 180-day retention. **We must not promise the owner «progress will not be lost» on Poki.**

## 8. A rollback by the next session — a process risk

**The mechanism:** on the question of the «dropping rank» this is the THIRD reversal (2026-07-29 approved → 2026-08-06 cancelled → 2026-08-07 restored). Besides that, docs/LEADERBOARD-PLAN.md has a typo because of which the reader will decide that our own server was rejected (in the table option «d» is struck through, while the text says «I am striking out option "c"» and describes «d» at that).

**Mitigation:** the decision is already recorded with a date and a quote (CLAUDE.md, 2026-08-07, item 1) — that is what we refer to. Add the submission mechanism via `onStarsChange` there (otherwise the next session will see the comment at 78-ads.js:508-512 «accepted deliberately, the dispatcher 2026-07-29» and will roll back to `noteWin`). Fix the typo in LEADERBOARD-PLAN with a single word.

## QUESTIONS FOR THE OWNER
## Decisions (his word is needed, without them the work goes blind)

**1. The formula — fix it BEFORE the first submission.** I recommend `leaderboardScore()`: bought stars do NOT raise your place. Today the question is numerically empty (the `tu` field has had no active sources since 2026-07-27, both formulas give the same number), but if top-ups come back, the difference becomes «is a place bought or not», and a table with two scales can no longer be cleaned up. **The wording for the owner: «If we ever start selling stars again — should bought stars raise your place in the table or not?»**

**2. The fork on the name and the avatar — A or B, this is not our decision.**
Today the recorded rule is in force: the name is generated once per device and on a merge «a non-empty own value wins» (77-save.js:196-198, :63, :91). The new `gid` by itself does NOT fix the divergence of the names.
- **A. `gid` is only a technical key.** The name and the avatar stay as they are. A person on two devices is one row in the table, but on the screens he has two different names.
- **B. The name and the avatar are DERIVED from `gid`** by the same hash. The identity converges on both devices, but **for a part of the players the name will change once** on the first merge.

The owner's decision of 2026-08-07, item 2 says «the animal name and the avatar are already tied to it» — this is rather B, but the merge of two devices is not named there. By the project's rules, on a divergence from a recorded decision — stop and ask, not improvise.

**3. The platform tab — enable it right away or later?** The owner said on 2026-08-07 «the platform table remains the second tab». Enabling = one line in the config + **a SaaS token from the Playgama dashboard, which only the owner can obtain**. The question: do we set up the token now (then the «Record» tab ships in the same release) or do we roll out our own first?

**4. The level does not carry over between devices — do we fix it or do we name it a limitation?** The level number lives in a separate key `mixer_level`, not in the save. Even on Playgama/Yandex with a working cloud the player will carry over the balance, the stars, the accumulations and the purchases — **but will start from level 1.** If «auto-login» is sold by the owner as «progress is not lost», this must either be fixed (+0.25 days, moving the field into `Save` per the same checklist) or honestly talked through.

## Access and texts

**5. Access to the Cloudflare account** (the workers for the landing pages are already there) **and a subdomain for the API.** Not `*.workers.dev` — a part of corporate and school networks blocks it entirely.

**6. A line for the privacy policy.** One is enough: «we store a random identifier, a generated pseudonym and your game score; to delete it — use the button in the game».

## A letter to the platform (an answer from Playgama is needed, as three separate questions)

**7.** Are outgoing requests from a game to the developer's domain allowed at all?
**8.** Does an own leaderboard count as «built-in analytics» by your rules?
**9.** Which exact partner re-distribution platforms block external requests and how does this manifest itself (CSP, sandbox, a proxy)? Which CSP/sandbox are applied to the game iframe on playgama.com?

Why this matters: docs/LAUNCH-PLAN.md (~p. 296) records that Playgama names built-in analytics as a separate reason for rejection, because of which our own telemetry REMAINS SWITCHED OFF for portal builds. **⚠️ There is NO primary source of this prohibition in the repository** — the section was assembled by searching, there is no quote of the rules or a letter from the platform. Our own leaderboard = an outgoing request to our own domain, that is, THE SAME CLASS as the already forbidden telemetry.

## What we do NOT ask

**There is no need to re-ask about the «dropping rank» model.** It is recorded verbatim — CLAUDE.md, «OWNER'S DECISIONS 2026-08-07», item 1: «we're making our own», the reason is named («spending points would push you down the list»), and it is explicitly stated right there that the decision of 2026-08-06 «Records — like the platform's» is thereby cancelled. This is the third reversal on one question, but it is **already recorded with a date and a quote** — the specification refers to this block rather than reopening it.
