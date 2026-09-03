# «Mixer» metrics — a basic set for a casual game

The spec, 2026-07-28. The owner's order: «how much time the player spent on the
screen, where he clicked, where the success is and where the drop-offs are; a
basic set for a casual game; crash logs and their analysis».

---

## 0. Principles (why the set is exactly this one)

1. **Every metric answers a decision we are going to make.** A metric that
   has no action behind it is noise. Below, under each group it is written
   what we do with it.
2. **The funnel matters more than the counters.** «5000 matches» says nothing;
   «out of 100 who opened the game, 41 reached level 3» says where to fix.
3. **The events are small and rare.** Mobile traffic: a batch once per 12
   events + on leaving the tab (it already works that way). No per-frame sends.
4. **No personal data at all.** Only the anonymous session `sid`. No IP
   geolocation, no device identifiers, no platform data.

---

## 1. What is already there (19 events, the transport is ready)

`79-telemetry.js`: `sendBeacon` batches, an anonymous `sid`, a flush on leaving.
⚠️ `URL = ''` — **the telemetry is off**, the events go nowhere. Turning it on =
one line (a Cloudflare worker, as on the landings).

The economy and the ads are covered: `level_start`, `win`, `lose`, `spend`, `rw`
(shake/hint/x2/continue/detector), `inter`, `boost`, `unlock_buy`,
`bundle_buy`, `acc_up`, `continue`, `stars_migrate`.
⚠️ 2026-09-03: `inter`, `rw` with `p:'x2'` / `p:'continue'` and `continue` are GONE — no
interstitial and no other rewarded placement than the shake and the tip (the owner's word).
The inventory above is the history of the event vocabulary, not the live set.

## 2. What is NOT there and what we are adding

| The hole | What we are adding |
|---|---|
| Time on a screen | `screen` (enter/exit + duration) |
| Where he clicked | `tap` (screen sector + hit/miss) |
| Drop-offs | `quit` (leaving the tab + context) |
| Crashes | `err` (the error + the stack + the context) |
| The first session | `fts` (the steps of the first playthrough) |
| Client health | `perf` (frames/memory, once per session) |

---

## 3. The screens and the time spent on them

**The `screen` event**: `{n:'screen', v:'<name>', ms:<how long he stayed>, lv:<level>}`
is sent on LEAVING the screen (the duration is known then).

The screens: `intro` · `game` · `pause` · `win` · `menu` · `collection` ·
`more_stars` · `ad` · `museum`.

**What we decide.** If the median on `more_stars` is < 2 s — the screen is not
read, the presentation is to blame, not the price. If `win` is held longer than
6 s — the screen hurts the pace, we have to speed up the transition.
If `intro` > 8 s — the fly-around is long, cut it.

## 4. Where he clicked

**The `tap` event**: `{n:'tap', z:'<zone>', r:'<result>', lv, t:<ms from the level start>}`

- the zone `z`: a 3×3 grid over the screen (`tl,tc,tr,ml,mc,mr,bl,bc,br`) — not
  coordinates, so as not to breed data and not to depend on the screen size;
- the result `r`: `match` (matched) · `miss` (a miss) · `rock` (a stone) ·
  `surprise` · `ui` (a button) · `dead` (an empty spot).

**What we decide.** The share of `miss` by zone = the map of misses: if the
misses pile up in `bc` (bottom-centre), it means the finger is covering the
objects — raise the camera or move the HUD. If `ui` taps often land next to a
button but not on it — the tap zone is small.

⚠️ **Not coordinates, but sectors.** An exact heat-map requires normalization
for hundreds of resolutions and stores an order of magnitude more; 9 sectors
are enough for the decisions.

## 5. The funnel and the drop-offs

**The `quit` event**: `{n:'quit', v:'<screen>', lv, ms:<session duration>, st:'<state>'}`
is sent on `visibilitychange → hidden` (the same moment as the flush).

The `st` states: `playing` (quit in the middle of a level) · `stuck` (quit in a
dead end, `level.deadlock`) · `after_win` (left right after a win) · `on_offer`
(left on the purchase screen) · `on_ad` (left during an ad).

**The key funnel of the first session** (the `fts` event, the step in the `k` field):
```
open → intro_done → first_tap → first_match → level1_win → level2_start → level3_win
```
**What we decide.** A collapse between `first_tap` and `first_match` = he did not
understand the rule, a hint is needed at the start. A collapse at `level2_start`
= the win does not motivate, the win screen or the reward are weak. `st:'stuck'`
in a noticeable share = the rescue grinding kicks in too late.

## 6. Crashes and errors

**The `err` event**: `{n:'err', m:<message>, f:<file:line>, st:<stack, 3 frames>,
lv, v:<screen>, b:<build version>, w:<is the webgl context alive?>}`

We catch three sources:
1. `window.onerror` — synchronous errors;
2. `unhandledrejection` — fallen promises (asset loading, ads, bridge);
3. `webglcontextlost` — **the most frequent «crash» in 3D on mobile**: the game
   does not crash, but the screen goes black; without a separate event it looks
   like «he just left».

**The rules, so as not to drown in the noise:**
- deduplication: an identical signature (`m`+`f`) is sent **once per session**;
- a ceiling of 5 errors per session — after that we keep quiet (protection
  against an infinite loop);
- the send is **immediate** (we do not wait for a batch): the game may die on
  the very next line.

**The analysis.** We group by signature, we sort by «sessions affected» (not by
the number of events — one loop of errors in one session must not look like an
epidemic). We look at the slice by build version: a spike after a release = a
regression, we roll back.

## 7. Client health

**The `perf` event** once per session (at the 60th second of play):
`{n:'perf', fps:<median>, worst:<worst frame>, mem:<MB>, dpr, w, h, gl:<renderer>}`

**What we decide.** If 20% of the sessions have a median < 30 frames — a «light
mode» is needed (fewer objects/effects). The `gl` field will show on which GPUs
the trouble is.

---

## 8. Summary indicators (what to look at weekly)

| Indicator | How it is counted | Alarm |
|---|---|---|
| Level completion rate | `win` / `level_start` | < 70% |
| First-session drop-off | no `level1_win` among `open` | > 45% |
| Time to the first match | `fts:first_match` − `open` | > 25 s |
| Share of dead ends | `st:'stuck'` / sessions | > 8% |
| Misses | `tap.r='miss'` / all taps | > 25% |
| Ad watch-through | `rw` / video requests | < 80% |
| Storefront conversion | `bundle_buy` / `screen:more_stars` | — the baseline |
| Sessions with an error | sessions with `err` / all | > 1% |

---

## 9. How to run it (the infrastructure)

**Reception.** A Cloudflare Worker (as on the owner's landings) → writes batches
into storage. At the start this is enough: an endpoint + a write to a log/table.

**Storage.** One flat table of events: `t, sid, n, lv, v, …payload`. Aggregates
are counted by queries, not in advance — the set of questions will change.

**Privacy.** Only `sid` (random, lives for the session). No device id, no
platform account, no IP geolocation.

⚠️ **The platforms.** Playgama/Yandex have their OWN analytics — some of the
indicators (installs, D1/D7 retention, payments) are more correctly taken from
there rather than counted by ourselves. Our layer answers the questions about
the GAME (where they drop off, where they press, what crashes), not about the store.

---

## 10. The order of rollout

1. **Crashes first** — the only group that catches a loss of money silently.
2. Then `screen` + `quit` — they give the funnel and the drop-offs.
3. Then `tap` — the map of misses.
4. `perf` — when real traffic from different devices appears.
5. We turn the endpoint on **last**, when there is somewhere to receive into.
