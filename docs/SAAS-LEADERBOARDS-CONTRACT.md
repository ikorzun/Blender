# Playgama SaaS leaderboards: the contract for «submitting a score with no screen»

INTEGRATION's answer to the dispatcher's four questions (request 2026-07-29,
leaderboards design — docs/LEADERBOARD-PLAN.md).

⚠️ **THE SOURCE OF EVERY STATEMENT IS MARKED.** `[code]` — read in the
vendored `playgama-bridge.js` v2.0.0; `[measurement]` — verified by a run
against the real SDK with our own server; `[?]` — not established, a live
run with the owner's token is needed. There is no token — the board has not
been created in the dashboard yet, that is his step. Everything marked `[?]` is NOT guessed.

---

## 1. Config fields

`[code]` The enable gate (`_isSaas`, verbatim logic):

```
saas.<module> is set  AND  (
      (platformId === 'playgama'  AND  saas.publicToken is set)
   OR  saas.<module>.platforms — an array containing the current platformId
)
```

`[code]` The transport reads: `saas.baseUrl` (otherwise the default
`<api playgama>/api/bridge/v1`) and `saas.publicToken` — it goes out as the
`x-public-token` header. Together with it, `x-player-id` and `x-platform-id` are sent.

**A working example for our platforms:**

```json
{
  "saas": {
    "publicToken": "<token from the dashboard>",
    "leaderboards": {
      "platforms": ["poki", "crazy_games", "playgama"]
    }
  }
}
```

⚠️ **`platforms` IS MANDATORY for everyone except Playgama.** `[measurement]` On Poki
a config with a token but WITHOUT `platforms` leaves the type as `not_available` —
the first branch of the gate requires exactly `playgama`. Table of the run (platform
Poki, real SDK):

| config | `leaderboards.type` |
|---|---|
| without the `saas` section (as it is now) | `not_available` |
| `saas.leaderboards.platforms:['poki']`, **without a token** | **`in_game`** |
| the same + `publicToken` | `in_game` |
| `saas.leaderboards` **without** `platforms` + a token | `not_available` |

⚠️ **THE TYPE `in_game` DOES NOT MEAN IT WORKS.** `[measurement]` The gate
turns on WITHOUT a token as well: the type will become `in_game`, the calls will go out with an empty
`x-public-token`, and the rebuff will come only from the server — and we will not see it
(see §3). Check for the token ourselves.

`[?]` The board name (`leaderboards/<id>`) is created in the dashboard; the allowed
characters, the length and the rate limits — from the docs/dashboard, not from the code.

---

## 2. Authorization and the guest

`[code]` The write gate is **NOT `isAuthorized`, but a non-empty `playerId`**:

```js
setScore(id, score){
  if (this.type === NOT_AVAILABLE) return Promise.reject();
  if (this.#saas) return this._platformBridge.playerId
      ? this.#saas.post(`leaderboards/${id}`, { score })
      : Promise.reject();
  …
}
```

⚠️ **CORRECTION TO THE DISPATCHER'S EXPECTATION** («the guest has an empty identifier and the
write is rejected»): `[measurement]` in our runs `player.id` for an
UNauthorized guest is **non-empty** (for example `xYqlDvA0ms6eu87s`,
`oQG29Klwms6euevm` — a new one for each session). That means the guest DOES PASS the local gate
and the request goes out to the server. Whether the server will accept a guest id and what it
will do with «a new player every session» — `[?]`, only a live run.

`[code]` The header is formed as `"x-player-id": playerId || ""` — that
is, an empty id is technically permitted at the transport level; it is cut off
precisely by the gate above.

`[code]` Reading the table (`getEntries`) requires `type === IN_GAME`, otherwise
an empty reject. It does not require authorization.

---

## 3. What the call returns — and why the resolve cannot be trusted

`[code]` The entire SaaS transport:

```js
get(p){  return fetch(`${base}/${p}`, {method:'GET',  …}).then(e => e.json()) }
post(p,b){return fetch(`${base}/${p}`, {method:'POST', body:JSON.stringify(b), …}).then(e => e.json()) }
```

**Neither `res.ok`, nor the status.** The dispatcher's statement is confirmed verbatim.

⚠️⚠️ **THE CONSEQUENCE — THE MAIN THING IN THIS DOCUMENT: A FAILED WRITE LOOKS
LIKE A SUCCESSFUL ONE.** `[measurement]` I substituted my own server for `saas.baseUrl` and
called `setScore`:

| server response | what Bridge does |
|---|---|
| `200 {"ok":true}` | resolve |
| **`403 {"error":"no token"}`** | **resolve — as success** |
| **`500 {"error":"boom"}`** | **resolve — as success** |
| `502`, body is not JSON | reject, but with a JSON parsing error |

That is, `setScore(...).then(() => 'saved')` is **a lie**. The only
rejects: the local gates (§2) and invalid JSON. Any meaningful
server error (no token, the board is not created, a limit, an expired token)
arrives as a successful resolve with an error body.

**What follows from this for the code:** a resolve MUST BE PARSED, not
taken on faith. The shape of a successful response is `[?]`: Bridge hands over the SaaS body
raw, without normalization, and it can be seen only live. Before the
token, writing the parsing blind is not allowed — lay in a point and fill it in after
the first run.

`[?]` The shape of a table record (the entry fields: name/score/rank/photo and their names in
the SaaS response) — also only live: the native platforms have their own shape, SaaS
is not normalized.

---

## 4. How to tell «the platform cannot do it» from «the network went down»

`[code]` Both cases give an **empty** `Promise.reject()` with no argument, so
they cannot be told apart by the reject itself. They MUST be distinguished BEFORE the call:

```js
// 1. Can the platform do it at all
const t = bridge.leaderboards.type;           // 'not_available' | 'in_game' | 'native' | 'native_popup'
if (t === 'not_available') return 'the platform does not support it';

// 2. Is there anyone to attribute the result to
if (!bridge.player.id) return 'no player identifier';

// 3. Only now do we call — and ANY reject here means transport,
//    and NOT the absence of support
try { const r = await bridge.leaderboards.setScore(BOARD, score); /* §3: parse r */ }
catch(e){ /* network / invalid JSON */ }
```

⚠️ Checking the type is NECESSARY, but NOT SUFFICIENT: `in_game` also happens when
the token is missing (§1). The full set of preconditions — the type, `player.id`
and the presence of `saas.publicToken` in the config.

⚠️ And remember §3: the absence of an exception ≠ success. «It was written» is proven
only by parsing the response body or by reading your own record back.

---

## To check on a live run (after the owner creates the board)

1. The shape of a successful `setScore` and `getEntries` response (Bridge does not
   normalize — the fields are unknown).
2. Whether the server will accept a GUEST `player.id` and how it will behave with a new
   guest id every session (whether it will clutter the table).
3. What arrives for an unknown board name and for an expired token — and
   whether that is distinguishable from success by the body (by the status we cannot tell).
4. Limits: the write frequency, the board name length, the page size of the listing.
5. Whether `credentials:'include'` (Bridge always sends it) affects operation
   from the platform's iframe — third-party cookies may not get through there.
6. **The overwrite policy: the best result or the last one** (see
   the addendum) — this determines whether to send the score always or only on growth.
7. The body of a successful `POST` — empty or JSON: if empty, a successful write
   will go off into `.catch` (see the addendum).

---

## Addendum following the reading of the docs (2026-07-29, the same day)

### ⚠️ CORRECTION: our SDK is NOT the freshest — we are two patch versions behind

Earlier I wrote «v2.0.0 — the current release, no need to update». **That
is wrong**, the source was bad: I was looking at GitHub Releases, where the latest
tag is indeed v2.0.0 (2026-07-10). `[measurement]` In npm there is **2.0.2**
(2026-07-23), before it 2.0.1 (2026-07-20) — both are NOT tagged with a release and
NOT mentioned in the docs' changelog.

⚠️ **CONCLUSION FOR THE PROCESS: look up this SDK's version in npm, not in the GitHub
releases.** The releases lag behind, and so does the changelog.

`[measurement]` I compared our bundle with 2.0.2: the public API surface is **identical**
(not a single added/disappeared getter, `+8 KB` — internal edits),
the SaaS transport is **the same**, `res.ok` is absent both there and there. Hence:
- the contract from §1–4 is NOT tied to the version and remains true on the fresh one;
- the update is low-risk (the API has not changed), but also not urgent for
  the leaderboards; it makes sense to do it **before the upload to the portal**, so as to
  pick up the patch fixes — as a separate task with a run of the suite.

### ⚠️ THE MIRROR HALF OF THE PROBLEM FROM §3: an empty body = a false failure

In §3 it is proven that an error with a JSON body resolves as a success. The reverse is also
true `[code]`: `.then(e => e.json())` on an EMPTY body (204 / an empty 200)
will throw an exception — that is, **a successful write will fly into `.catch`**.
All in all the path lies in both directions, and «whether it was saved» cannot be determined
from the promise outcome in principle. Parse only the body; the shape is `[?]`.

### The overwrite policy — a question that is NOT idle precisely for us

`[?]` Whether the board stores the BEST result or the LAST one sent — is not
visible from the code, this is a server policy.
⚠️ For us this is not a trifle: `leaderboardScore()` **can DECREASE** —
under the current model, spending beyond the top-ups lowers the rank deliberately. If
the server writes «the last one», the rank will sag after every such spend;
if «the best one» — the sag will not be displayed at all, and the behavior intended by the owner,
«spending drops your position», will not work. **The decision depends on the
server's answer**: either always send, or only on growth. Put it into the live
run as the first item.

### Small things from the docs that do not change the essence

- `[docs]` There is a ROOT section `leaderboards: [{ "id": "..." }]` —
  a description of the boards. `[code]` The SaaS path does NOT read it (the id goes straight into the URL
  `leaderboards/<id>`); it is used by the native branch via
  `_getPlatformLeaderboardId`. Keeping both does no harm.
- ⚠️ `[?]` There is **no** `saas` section in the docs' `config.md` — the key names
  (`saas.publicToken` / `saas.baseUrl` / `saas.<module>.platforms`)
  were established BY READING THE CODE and confirmed by a measurement, but are not officially
  documented. The risk: this may turn out to be an internal detail of the build and
  shift in a future version. Clarify with Playgama together with the token.

---

## ✅ CLOSED BY A LIVE RUN (2026-07-29, board `Blendo`, the owner's token)

A run on the production board, platform `playgama`, table type `in_game`.
The dispatcher independently repeated it on `poki` — the same result.

### ⛔ THE MAIN THING: the server stores the MAXIMUM, not the last one

```
sent 12345 → 201, score 12345 in the body → 12345 in the table
sent   500 → 201, score 12345 (!) in the body → 12345 in the table
CONTROL: 20000 → 201, score 20000 → 20000 in the table
```
The control (the third step) rules out the reading «the second write did not get through»:
the larger one is accepted, the smaller one is silently ignored. **The consequence for the
product: the mechanic approved by the owner, «spent — dropped», does NOT WORK with this
leaderboard** — the rank can only grow. The decision is the owner's
(the options are in docs/LEADERBOARD-PLAN.md).

### ⚠️ The refusal is invisible by the status — distinguish by the BODY

An ignored write returns **the same 201** and **`scoreAttemptStatus:
"normal"`**, `scoreAttemptReasons: []` — a field that looks created exactly
for this does not fire. **The only honest sign: the body carries the
STORED score, not the sent one.** Implemented in `78-ads`:
`accepted = (res.score === sentScore)`.
⚠️ `accepted === false` is NOT an error: this is the normal «below the personal peak».

### The shapes of the responses (Bridge does not normalize them)

- **POST** `leaderboards/<id>` → **201**, body
  `{uuid, leaderboardUuid, playerUuid, score, platformId, updatedAt,
    scoreAttemptStatus, scoreAttemptReasons[]}`
- **GET** `leaderboards/<id>` → **200**, body — a **BARE ARRAY** (not a wrapper)
  `[{score, id, name, photo, rank, platformId, updatedAt}]`.
  The field names matched the ones in the docs.

### The guest: the server ACCEPTS, only our gate does not let him through

The run went with `isAuthorized: false`, `isGuest: true` — the write went through (201)
and landed in the table. ⚠️ That means the owner's decision «only logged-in players in the
leaderboard» rests EXCLUSIVELY on our check in `78-ads`; remove
it — and the guests will go through. The server assigns the guest a name itself (we got
«Aquamarine Guppy»), we do not send a name at all.

### Other

- I did not encounter a rate limit on three writes in a row (did not measure it properly).
- ⚠️ A trace in the production table: the records landed in ONE row, because I pinned
  `bridge-player-guest-id` in advance. The row `qa-mixer-probe-01` / 20000
  stayed forever — there is no deletion in the SDK. Before the launch it is better to recreate
  the board (proposed to the owner).

## What this document does NOT solve

The product question «what exactly to send». The dispatcher separately found that
a purchased booster multiplies the points award, while the base stars do not, that is,
a place in the table can be bought. Turn score submission on only after the owner's
decision: the table on the platform **can neither be reset nor cleaned**.
