# Own leaderboard — server (Cloudflare Worker + D1)

Implementation of the server side per the spec `docs/LEADERBOARD-OWN.md`.
The client (`src/app/82-lb.js`) is a separate task, the game core is not edited.

## Why our own and not the platform's

The platform's server stores the **maximum** and cannot lower it. The owner needs
the «Forbes» model: you spent points — you dropped in the list. That is why the
**latest** value of `leaderboardScore()` is written here, not the best one.

## The run

```bash
node server/leaderboard/test/run.js
```

```bash
node server/leaderboard/test/break.js
```

The first — 24 guards on **real SQL** (`node:sqlite`, adds no dependencies): the
ladder's window function, the partial index, the tie-break, the keyset neighbours are
checked by the behaviour of the database, not by a mock. The second — the two-sided
check mandated by the canon: 8 sabotage tests, each must bring down **its own** assert.

## Endpoints

| | | |
|---|---|---|
| `POST /v1/score` | `{id,k?,n,a,s,q,t,sig}` | upsert + an ESTIMATE of the place (`rank` may be `null`) |
| `GET /v1/top?p=1` | — | top from the snapshot, cache 60 s |
| `GET /v1/me?id&t&sig` | — | exact place + 5 neighbours above and below |
| `DELETE /v1/me?id&t&sig` | — | deletion of one's own row |
| `POST /admin/hide` | Bearer | hide/restore a row by hand |

Codes: 400 form/clock, 401 signature, 409 repeat of `q` (idempotent, with the
saved state), 429 more often than 20 s, 503 failure.

⚠️⚠️ **`rank` IN THE RESPONSE TO A SUBMISSION IS THE BOUNDARY «NO BETTER THAN N», NOT
THE PLACE, AND `null` IS A LAWFUL ANSWER.** The estimate is computed from the ladder
(the score at every hundredth place) and costs zero database queries — the ladder was
set up for exactly this. There is no boundary in two cases, and both return `null`:
* there are fewer than a hundred players in the table — the ladder is empty (this is
  the state of the first weeks after launch);
* the score is above the first rung — all that is known is «somewhere in the first
  hundred».

⛔ **The exact place lives ONLY in `/v1/me` (`exact: 1`). The screen must take the
place from there and not from the response to a submission.** A confident `1` used to
stand here, and formally the contract was honest — `exact: 0` rides alongside. But the
field is named `rank`, and the very first live consumer read it as the real place: a
value that cannot be confused is better than a marker that can go unnoticed.

⚠️ **The response body is always non-empty JSON, success is a field of the body.** If
one day we go through the bridge's transport, it does `fetch().then(r=>r.json())`
without checking `res.ok`: an empty body arrives as a failure, and a 500 with a body —
as a success.

⚠️ **The requests are «simple» per CORS** — a `text/plain` body, no custom headers:
otherwise every submission would cost TWO requests out of the daily 100 000.
The only exception is `DELETE /v1/me`: the method is not among the simple ones, and a
preflight request is unavoidable. This is deliberate — deleting one's own data
happens once in a lifetime and does not lie on the hot path.

## Deploy

```bash
npx wrangler d1 create blendo-lb
```

Write the resulting `database_id` into `wrangler.toml`, then:

```bash
npx wrangler d1 execute blendo-lb --remote --file=server/leaderboard/schema.sql
```

```bash
npx wrangler secret put ADMIN_TOKEN
```

```bash
npx wrangler deploy --config server/leaderboard/wrangler.toml
```

The first snapshot will appear within the next hour — by the cron trigger.

⚠️⚠️ **THE RECIPE «force a snapshot via `wrangler dev --test-scheduled`» HAS BEEN
REMOVED AS UNVERIFIABLE.** `wrangler dev` without `--remote` brings up a LOCAL worker
with a LOCAL D1 — it does not build the production snapshot, while the operator is
sure that he forced one. Exactly the `--remote` asymmetry that the README knows for
`d1 execute`. **Not verified live** (a Cloudflare account is needed), which is why the
checklist keeps the only path that is verified by observation: wait for the hourly
tick and run the smoke a SECOND time — the cron being alive is proven by the shifted
`t` field in the `/v1/top` response.

Should a force be needed before release — that is a separate change to the worker
(`POST /admin/snap` under the same Bearer). We deliberately do NOT do it on the eve of
a one-off visit into someone else's account: the risk of the change is greater than
the one it closes.

⚠️ **By hand from the dashboard — a Cloudflare Rate Limiting rule by IP** (WAF, on
`/v1/score`). This is item 3 of the protection from the spec, and it is the only one
the worker does not set up for itself: our 20 s window lives in the `u` field of the
player's row and protects ONE row, not an address. The IP itself is not stored.

## Degradation: what is done and what is not

- `/top`, when D1 is unavailable, returns **200 with the `stale` marker**, not 503 —
  rule number one of the spec: the table is decoration and does not block the game.
  There is a guard for this (a database that throws an exception on every query).
- ⛔ **The edge cache (`caches.default`) as the storage of the last snapshot is NOT
  implemented.** The spec names it, but there is nothing to check it with in Node —
  the Cache API lives only in the worker's runtime. Right now, with D1 down, the
  screen gets an empty list with an honest `stale:1` and draws its own «no
  connection» state (for that it has a local cache and its own row from the
  balance). If the owner needs exactly a server-side stale — that is a separate
  change and a live smoke after the deploy, it cannot be verified silently.

## Local bench for developing the client and the screen

Until the production worker is deployed, the client (`src/app/82-lb.js`) and the
screen are developed against a permanent bench:

```bash
node server/leaderboard/test/dev-serve.js
```

Port 8788 (the game preview has 8779, `wrangler dev` has 8787 — they do not overlap).

⚠️⚠️ **THE GAME DOES NOT AIM AT THE BENCH BY ITSELF — TURN IT ON EXPLICITLY:** open the
preview with `?lb=1` (or `?lb=<address>`, or put the address into
`localStorage.mixer_lb_url`). Earlier the client turned itself on at ANY `localhost`,
but all the workstreams sit on localhost at once: Graphics, Physics and Narrative have
no bench running, and they were getting failed requests in the console on every win,
with no hint why.
The same `src/index.js` on top of `node:sqlite`, lives until Ctrl-C. On start it seeds
24 rows with LIVE names and a spread of scores across orders of magnitude (the list
has both five-digit and two-digit ones — on an even row you cannot see how the layout
holds long numbers) and **builds a snapshot right away**, so `/v1/top` returns a
non-empty list from the very first second.

⚠️ Among the seed there is one **hidden** row `ShouldNotAppear` — the screen must not
show it, and this can be checked only if it is in the database.

| bench route | what for |
|---|---|
| `POST /_dev/snap` | build a snapshot — in production the cron does this once an hour, locally there is no cron at all |
| `POST /_dev/seed?n=24` | re-seed the list |
| `POST /_dev/rewind?sec=3600` | age the rows: opens the rate window (20 s) ahead of time |
| `POST /_dev/reset` | clear |
| `GET /_dev/state` | what is in the database and in the top right now |

⚠️ **«MY ROW DISAPPEARED FROM THE TOP» NO LONGER AWAITS YOU ON THE BENCH.** A warning
used to stand here: the server capped growth by the row's age and hid it, and from the
outside this read as a breakage of the client (caught by a run of the bench, would
have cost the next person half a day). The mechanic is gone since 2026-08-09 — I leave
a trace to explain what exactly will no longer happen here.
Today a row disappears from the common table **only** because of a manual
`/admin/hide`; in the seed there is one such row — `ShouldNotAppear`. The only
remaining refusal of the server is `429` by the rate window, and it is cured by
`POST /_dev/rewind`.

⚠️ **There are NO `/_dev/*` routes in the production worker and there will not be** —
they live only in `dev-serve.js` and are intercepted before the worker is reached. The
reason is the same as the one for which `/admin/snap` was postponed: we do not touch
the product on the eve of a one-off visit into someone else's account.

⚠️ The database is **in memory**: a restart of the bench = a fresh seed, submitted rows
do not survive a restart. For developing the screen this is enough; should durability
be needed — say so, I will add a file-backed database.

## Smoke after the deploy — by the list, not from memory

```bash
node server/leaderboard/test/smoke.js https://lb.<domain>/
```

⚠️ **This is a script, not a list in prose** — deliberately: nobody executes a
checklist written as text, and on the day of access it turns out that half of the
steps are unexecutable. The same scenario is run locally and is already green:

```bash
node server/leaderboard/test/smoke.js --local
```

On the production worker there are **eleven** checks (the local run adds two — showing
the yellow state and the transition into green after the snapshot is built).
Green means exactly this:

| step | green answer |
|---|---|
| submitting the result | `200`, `ok:1`, the place in the body, **`s` equals what was sent** |
| a repeat of the same submission | `409` with `dup:1`, the same score |
| a second write right away | `429` — the 20 s window holds |
| a broken signature | `401` |
| reading the top | the snapshot is FRESH: no `stale`, `t` younger than 2 h |
| one's own place | `200`, `exact:1`, the neighbours as an array, the same score |
| the ACAO header on a read | `*` |
| the preflight for DELETE | `204` + `allow-methods` contains `DELETE` |
| a second SUCCESSFUL submission | the score changed **in a re-read of `/v1/me`** |
| deleting one's own data | `200`, `gone:1` |
| a read after the deletion | `404` |

⚠️ **THE YELLOW OUTCOME IS NEITHER GREEN NOR RED.** If the top returns `stale:1` or
`t:0`, the snapshot has not been built yet: on a fresh deploy this is normal (the cron
bakes once an hour), but it is indistinguishable FROM «the cron did not register and
the top is empty forever» until the second run. In this case the script returns
**code 2** and does not print «responds per the contract». **The protocol: wait for
the hourly tick and run the smoke again** — the cron being alive is proven by the
shifted `t`.
The previous version checked only «200 and an array» and was green on a dead
snapshot; the docs meanwhile, three paragraphs below, declared an empty top to be the
norm, that is, they suggested not looking closely at exactly the signal that
distinguishes these two states.

⚠️ The number of rows in the top is NOT checked: on the day of the deploy there are
zero players, and an empty FRESH snapshot is a healthy answer.

⚠️ The smoke takes about 25 seconds: inside it there is an honest wait for the rate
window, without which the `UPDATE` path (the second submission) is not executed at
all, and it is exactly that path which carries the «Forbes» model — the drop of the
score.

### If the smoke was interrupted

The `SMOKE` row is written into the production table. The script removes it by three
paths (the normal finish, `finally`, catching Ctrl-C), but **there is no guarantee**:
on a hard kill of the process or a network break during the deletion itself it will
remain, and the nightly retention will not take it (it cleans out those silent for 180
days). That is why the id is printed as the FIRST line of the run, BEFORE the row is
created. Manual cleanup:

```bash
npx wrangler d1 execute blendo-lb --remote --command "DELETE FROM p WHERE id='<id from the run header>'"
```

If the row has already made it into the snapshot and is visible to players — it is
removed instantly by `POST /admin/hide` with the Bearer, without waiting for the next
cron tick.

## What to say honestly about the protection

⛔ **THERE IS NO ANTI-CHEAT PROTECTION HERE.** The owner's decision of 2026-08-09,
verbatim: «let's not overthink it and not build anti-cheat protection right now. For
now make a good simple foundation for the leaderboard». The age-based trust ceiling
(`GROW_BASE`/`GROW_PER_S`), the silent trimming of the submitted score and the
automatic hiding of a suspicious row are **deleted entirely**, not switched off by a
flag: the history is in git, the way back is `git revert`.

⚠️ **THE PRICE HAS BEEN NAMED TO THE OWNER AND ACCEPTED.** The score is counted by the
client, the server cannot verify it. That means anyone who opens the console will send
any number and stand first without having played a single level. This is a deliberate
trade of «simplicity now» against «honesty of the table», not an oversight and not a
forgotten task.

### What remains — and why it is NOT «anti-cheat protection»

Tearing it out along the way is a typical mistake, so the list is explicit:

| remains | what it actually protects |
|---|---|
| the `sig` signature | **ownership of the row.** Without it an outsider will overwrite someone else's result and delete someone else's data. We protect the player from an OUTSIDER, not from himself |
| `RATE_SEC = 20` | **our free plan** (the limit on database queries), not honesty. Remove it — and the very first cycle of submissions will eat the daily quota |
| `/admin/hide` + the `f` flag | **manual moderation.** Now it is the only one: the name comes from the client as is, and nothing else insures against an obscene name in the top |

⚠️ The `f` flag in the submission handler **is not touched in either direction**. There
is no longer anyone to set it (there is no automation), and clearing it by a
submission would mean letting someone hidden by hand bring himself back with the very
first win. The only owner of the flag is the admin. There is a guard and a separate
sabotage test for this.

⚠️ The `c` field (when the row was created) is still written, but **is not read** by
the mechanics — the age ceiling rested on it. Kept for manual moderation: there is no
other way to tell a fresh row from an old one.

## The cost estimate

A read row in D1 is a **scanned** one, not a returned one. That is why an exact
`COUNT(*) WHERE s > ?` for a player in 30 000th place would cost 30 000 rows on every
submission and never fits into the free plan. Hence the ladder: once an hour the cron
collects the score at every hundredth place (with 50 000 players that is 500 numbers),
the estimate of the place after a submission costs **zero** database queries, and the
exact place costs no more than a hundred rows and only when the screen is opened.

Up to ~5 000 active per day — the free plan with a twofold margin;
50 000 active — Workers Paid $5/month without overages.

