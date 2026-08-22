# Own-leaderboard client contract (`window.__lb`) — the INTEGRATION ↔ INTERFACE seam

Zones (dispatcher's decision 2026-08-09): **the protocol belongs to Integration**
(`src/app/82-lb.js`: key, signature, response codes, retry policy), **the screen
belongs to Interface** (the win inset and the full screen, on top of this API).
The contract was written BEFORE the module was edited, so that the screen would be
built against something agreed, not against a guess.

⚠️ The module returns **data only**. It draws nothing, raises no toasts and knows nothing about the DOM.

---

## Three methods

```js
await __lb.top(page = 1)   // the overall top (from the snapshot, server cache 60 s)
await __lb.me()            // your EXACT place + neighbours above/below
await __lb.submit()        // send the current score (the screen usually does not need it)
__lb.invalidate()          // forget the cache: the next call goes to the server
__lb.base()                // '' = the leaderboard is off (no address), otherwise the URL
```

## The `state` field is ALWAYS there, and three of the four values are not errors

| `state` | what it is | what to show |
|---|---|---|
| `'ok'` | the data arrived | the leaderboard |
| `'early'` | the server is alive, the snapshot is not built yet (cron once an hour) | "the list will appear later", **not an error** |
| `'offline'` | there is no network/server, or the leaderboard is switched off | hide the block silently |
| `'broken'` | the response does not follow the contract | hide the block silently |
| `'refused'` | the server refused on the merits (the `err` field in the body) | hide the block silently |

⚠️ **`'early'` and `'broken'` are separated deliberately.** The server degrades SOFTLY and
on a fallen database answers `200` — the sign of breakage lives **in the body**, not in the
response code. A check on `res.ok` would be green on a dead leaderboard.

## What each method returns

```js
__lb.top()  → { state, rows: [{name, av, score}, …], total, at }
__lb.me()   → { state, rank, exact, score, up: [rows], dn: [rows] }
__lb.submit() → { state, dup, rank, exact, sent, score }
```

`av` is the avatar number (1..49), `at` is the snapshot time (sec), `total` is how many
players there are in the leaderboard altogether.

⚠️⚠️ **ANY `me()` AND `submit()` RESPONSE WITH `state:'ok'` CARRIES `exact` — EVEN IF
`false`.** Even when there is no place at all: `me()` has a legitimate case "the player's
row is not in the leaderboard yet", and there it carries `rank: null, exact: false`. Without
the field that case is indistinguishable from "the field was renamed on the server", and the
screen's refusal on `exact` is a closed one — no sign of trustworthiness, we do not show the
place. A uniform contract makes the guard at the seam simple: **`ok` without `exact` =
broken**, with no reservations.
⚠️ `top()` does not carry the field and must not: it is a list, there is no place in it at
all. The early exits (`offline`, `broken`, `refused`) likewise: there is neither a place nor
a success there, and the screen shows a different state.

⚠️⚠️ **"THE PLAYER'S ROW IS NOT THERE YET" IS `ok`, NOT `refused`.** The marker is `me: null`
together with `rank: null, exact: false`. That is what EVERY player looks like before the
first win, that is, the most frequent path of the first launch; putting it into `refused` is
not allowed — the screen would stop telling a newcomer from a dead server. (Verified by a
measurement 2026-08-10: the server answers `404 {"err":"none"}`, and before the fix the
client honestly translated that into `refused` — the "no row" branch was unreachable.)

## ⚠️⚠️ THE MAIN THING FOR THE INSET: the place is taken FROM `me()`, not from the submit response

* `me().rank` is the **exact** place, it comes with `exact: true`.
* `submit().rank` is an **estimate** from the latest snapshot, it comes with `exact: false`,
  and it **can be `null`**. `null` means "there is nothing to say", not "first place": the
  estimate is computed from the ladder (the score at every hundredth place), and there is no
  boundary when the leaderboard has fewer than a hundred players or when the score is above
  the first step.

⛔ **Never show `submit().rank` as the player's place.** Here the server used to hand out a
confident `1` to everyone, and the very first live run read it as a real place
(fixed 2026-08-09, `rank` is now `null`).

**The sequence of the win inset is strictly this:**

```
bank the score → submit() → wait for the response → me() → draw
```

⛔ Calling `me()` in parallel with the submit means getting the place BEFORE the round just
played has been counted, that is, "one level behind". The cache does not get in the way:
`submit()` resets it itself.

⚠️ **The inset must not dare delay the transition to the next level** (the owner's word):
the data is asynchronous, it did not arrive within a second — the screen lives without it.

## Spending on a multiplier

The screen **needs to do nothing**. The module is subscribed to balance changes itself and
sends the new value; after a spend the place drops without the interface taking part. It is
enough for the screen to redraw on its own event and to call `me()`.

⚠️ The server has a rate window of 20 seconds per player. If the spend happened right after
a win, the submit is **postponed** until the window opens and goes out by itself — nothing
will be lost, but there will be no instant number either. The screen must survive a delay of
up to ~20 seconds.

## What the screen does NOT need to know

The signature, the player key, the codes `400/401/409/429/503`, retries, the rank ladder, the
browser cache. All of that is inside the module. New protocol behaviour appears — the module
changes, the screen is not touched.

## Being switched off

`__lb.base() === ''` — the address is not set, the leaderboard is switched off entirely (that
is how it ships until the worker is deployed). All methods answer `state: 'offline'` and write
no errors to the console. In this state the screen simply does not show the leaderboard block.
