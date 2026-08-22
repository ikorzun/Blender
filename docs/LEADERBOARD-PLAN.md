# Leaderboards: how it works, how it looks, where the entry is

An analysis from 2026-07-29 based on the SDK code, the game code and the official
Playgama docs (read the same day). The key facts I rechecked personally — marked.

---

## Short answer

**How it works.** The game sends one number, the platform stores the table and
returns it. No server of our own is needed. Everything the SDK can do: set the
result, fetch the table, show the table by the platform's own means. No deletion,
no periods, no «friends only» filter.

**How it looks.** Our own overlay screen modelled on «More Stars»: top-20 rows,
your own position highlighted. The platform's native table cannot be shown — it
exists at exactly one platform, and that one is not in our publishing plans.

**Where the entry is.** A button on the main screen (which is also the pause),
next to the profile. Plus a «your place» row on the win screen — the stars and
the score are already there.

⚠️ **But before doing this, three facts that change the problem statement.**

---

## 1. ⛔ Playgama itself has no leaderboards

Checked personally in the SDK code: the leaderboard type is overridden by
**8 platforms out of 28**. A full table inside the game — only at **Yandex Games
and Y8**. The remaining seven have either the platform's native window or nothing.

**Playgama, Poki, CrazyGames, VK, Telegram, TikTok — cannot do it.**

✅ **Confirmed independently and more strongly than by reading the code:**
Integration took a LIVE measurement on our page — the platform answers
«leaderboards unavailable». That is a fact from a working build, not a conclusion
drawn from a minified file.

⚠️ And their own correction to themselves, which is worth knowing: the first quick
slice they took in an outdated way (in the previous SDK version support was asked
about with a flag, in the current one — with the type) and got «nobody has it at
all». Wrong: Yandex has it. The same class of error as with a plugin written for
the previous version — the trick is remembered, but the version has changed.

Playgama has a workaround: cloud leaderboards as a separate service. They are
switched on with a token that is taken in the developer dashboard, and that is
**an action of the owner, not of the programmer**. Without it there will be no
leaderboard on our main platform at all.

**What this means:** the leaderboard is a feature of a minority of platforms.
Retention cannot be built on it, the game is obliged to be complete without it.

## 2. ⛔ A place in the table is bought for $4.99

This is the main thing, and I checked it in the code myself.

A purchased booster multiplies the points awarded for every match. And the base
from which the stars are counted does **not** use the multiplier. So a player with
a ×5 booster racks up a lifetime score five times faster — and any rating that
grows out of the score grows five times faster for him too.

⚠️ We do have protection against pay-to-win: purchased currency is counted
separately and does not raise the rank. This protection **does not cover the
booster**, because the booster does not add currency — it speeds up earning.

✅ **DECIDED BY THE OWNER 2026-07-29 — AND IT IS NOT «a», NOT «b» AND NOT «c».** He
removed the problem statement itself: «there is no such notion as being bought. A
player can buy a booster and rack up a lot of points, and rise because of that.
But he can just as well spend his points and drop to the very bottom of the table.
Like in the Forbes rating».

The rank is not a lifetime achievement but a **current state**: earned — rose,
spent — fell. What I brought in as a hole has been declared a mechanic.

⚠️ **THE FORMULA DOES NOT NEED CHANGING — it already works that way.** Checked on
numbers:

| Situation | Place in the table | Wallet |
|---|---|---|
| Played, did not spend | 5000 | 5000 |
| Bought a ×5 booster, played five times as much | 25000 | 25000 |
| Spent half on the collection | 12500 | 12500 |
| Blew everything | **0** | 0 |
| Topped up by 3000 and did not spend | **5000** | 8000 |

⚠️ The last row is exactly the reason why «bought» is the wrong word: **the top-up
itself does not give a place**. What can be bought is a multiplier to earning, not
a position; the money has to be played out.

⚠️ Consequence for the screen: the number in the table and the number in the wallet
diverge as long as there is an unspent top-up. This has to be explained to the
player, not hidden.

## ⛔ VERIFIED BY A LIVE RUN: the «like in Forbes» mechanic DOES NOT WORK

Verified **twice, independently, on different platforms** — me on Poki,
Integration on Playgama. It matched.

**My run:**

1. we sent **90000** → 90000 in the table;
2. we sent **1000** → the server returned **90000** in the response, the same
   record and the same update time; the table did not change.

**The server stores the BEST result, not the last one.** The «Score order:
Higher is better» setting in the dashboard governs not only the sorting, but also
what stays in the table.

⚠️ So **the place cannot fall**. The model you approved, «spent the points and
dropped to the very bottom», cannot be expressed on this platform: the table will
show the player's **peak** state, not the current one.

**Integration's run (with a control that I did not have):**

1. they sent 12345 → 12345 in the table;
2. they sent 500 → 12345 again in the response, the table did not change;
3. **control:** they sent 20000 → accepted, 20000 in the table.

The third step proves it is not a failure: the bigger value is accepted, the
smaller one is silently ignored. The semantics is the maximum over all time.

⚠️ **The refusal is invisible by the usual means:** an ignored record returns the
same success status and the same «the attempt was counted normally» field as an
accepted one. The **only** way to tell them apart is by comparing the number in
the response with the sent one.

### What to do about it — three options

| | What we get | What we pay with |
|---|---|---|
| **a)** Look in the dashboard whether the «Score order» list has an option like «last result» | Forbes works as intended | There may be no such option at all |
| **b)** Accept «peak wealth»: the place only grows | Works already today, no code to change | Falling is impossible — half of your idea goes away |
| **c)** Store the rank **on our own side** | The mechanic works fully and on all platforms | Our own server is needed — but it is the same worker that is needed for telemetry anyway |
| ~~d) Send a different value~~ | — | Does not solve it: when the maximum is stored, ANY value will show the peak |

⚠️ I honestly cross out option «c»: the problem is not WHAT we send, but that the
server remembers the maximum. Any number will be shown at its highest point.

## What else this run gave (former «unknowns» closed)

- ✅ **The shape of a successful response**: `{uuid, leaderboardUuid, playerUuid,
  score, platformId, updatedAt}`. ⚠️ And the most valuable part: **the server
  returns the SAVED number, not the sent one**. This gives a way to understand
  whether our record landed — compare what was sent with what came back. It partly
  cures the former trouble «by the response you cannot tell success from error».
- ✅ **The shape of the table**: `{score, id, name, photo, rank, platformId,
  updatedAt}` — it arrives already parsed, contrary to the fear that the response
  is given raw.
- ⚠️ **The server ACCEPTS a submission from a guest.** In the run the player was
  not authorized, the record went through, the platform issued the name itself
  («Lavender Leech»). So **our own gate on authorization is the only thing that
  does not let guests into the table**. It is good that we put it in: without it
  the table would have filled up with random names, a new one every session.
- ✅ The bundle «our token + someone else's platform» works: checked on Poki.

- ✅ **No rate limit** was encountered on three consecutive records.

⚠️ **TWO TEST ROWS ARE LEFT IN THE TABLE:** 90000 «Lavender Leech» (my run) and
20000 «Aquamarine Guppy» (Integration's run). There is nothing in the game to
delete them with, the board is recreated in the dashboard — and right now is the
cheapest time to do it, while there are no real players.
⚠️ Integration did it more neatly than me: they pinned one identifier in advance,
so their three records landed in ONE row. I did not do that.

## Guests do not get into the table

The owner's decision: «to get into the leaderboard you need to log in».

⚠️ This is **stricter than what the SDK does itself**: its check lets you through
on a non-empty identifier, and a guest's one is non-empty. So our check has to be
put in separately, otherwise guests will go into the table.
✅ As a side effect it closes the littering risk: the guest identifier is new every
session, one person would breed rows on every visit, and there is nothing to
delete them with.

## 3. ⛔ The choice is made once and for all

The table on the platform **can neither be reset nor cleaned** — the SDK has no
deletion method. Changing the value after launch will not reshuffle the places,
but worse: two incompatible scales will remain in one table forever.

That is why the question from point 2 has to be closed **before the first
submission**, not after.

---

## What else surfaced and requires a decision

- ⚠️ **About signing in to an account — MY NOTE WAS INACCURATE, corrected by
  Integration's measurement.** I wrote «it requires signing in on all three
  paths». In fact the check on our side looks not at «has the player signed in»
  but at a non-empty identifier, and a guest's one is **non-empty** — that is, the
  request goes to the server from a guest too. Whether the server will reject it
  is unknown and can only be checked with a real token.
  ⚠️ BUT A RISK SURFACED THAT NOBODY EXPECTED: the guest identifier is **new every
  session** (measured). So one and the same person can breed rows in the table on
  every visit, and the table will get littered. At Yandex signing in really is
  mandatory — there it is confirmed.
- ⚠️ **The game is single-language**, while the only platform with a full table is
  Russian-language Yandex. «Lay out the screen» in fact means «the screen + set up
  localization of the whole game», and that is weeks, not days.
- ⚠️ **The «Reset progress» button** resets the progress, while the result on the
  platform will remain forever. The player will start over and will see a record
  he will never beat again. To be decided before the first submission.
- ⚠️ **Debugging opens on the live site** via `?dev=1`, and there is a points grant
  there. While there is no leaderboard, that is a cheat in a single-player game.
  With a leaderboard it is a direct entrance into the top. It has to be closed
  **before**, not together.
- ⚠️ **Cheating cannot be eliminated** without our own server: the client counts
  the score, the save is plain text in the browser. A forged number is also
  «sticky» — the counters only grow upwards and are not lowered by syncing.

---

## ⚠️ One more finding that makes «piece 1» not so simple

Integration raised a server of its own instead of the real one and looked at how
score submission behaves on errors. The result:

| Server response | What the game sees |
|---|---|
| «saved» | success |
| «no token» (403) | **success** |
| «internal error» (500) | **success** |
| a non-text response | error |

That is, **a failed record looks like a successful one**. There is no token, the
board is not set up, the token has expired, we hit the limit — everything arrives
as «saved». The reason: the transport does not look at the server's response code
at all.

⚠️ Two consequences for the work follow from this:
1. Submission cannot be written as «called it and off we go» — the response will
   have to be **parsed by hand**, and we will see the shape of a successful
   response only with a real token.
2. The «the platform can do leaderboards» sign becomes true after the settings are
   switched on **even without a token** — the requests will go nowhere, and
   silently. It has to be checked by three conditions before the call, and not by
   the fact that there is no error.

The full contract with examples — [docs/SAAS-LEADERBOARDS-CONTRACT.md](SAAS-LEADERBOARDS-CONTRACT.md).

## What to do: three pieces, can be cut in parts

**Piece 1 — score submission, without a screen (less than a day).**
Add a leaderboards section to the config, send the number on a win where the
platform can do it, silently skip where it cannot. The player sees nothing, but
results start accumulating. It is reasonable to roll this out even without a
screen.

**Piece 2 — our own table screen (days).**
An overlay modelled on «More Stars», four states: the table, «the platform does
not support it», «sign in to get into the table», «you are the first». The entry
is a button on the main screen + a «your place» row on the win screen.
⚠️ It will have to be checked on the platform's stand: our autotest does not reach
leaderboards in principle — it walks over local files, and the SDK does not load
there.

**Piece 3 — localization (weeks).**
Needed only if we are aiming at Yandex. Not required for English-language
platforms.

---

## My recommendation

**Do piece 1 now, piece 2 — after the answer to the question about the booster,
piece 3 — as a separate decision.**

The reason: score submission is cheap and reversible, and the screen is not. Until
the question «is the top of the table bought» is settled, it is too early to lay
out the screen: if the value has to change, it will all have to be redone anyway,
and the table can no longer be cleaned.

⚠️ **And honestly: there will be no leaderboard on our main platforms.** If the
goal is to give the player a reason to come back tomorrow, then daily rewards and
streaks will give more for less money, and they work everywhere. The leaderboard
is worth doing if the goal is competition specifically, and you are ready for the
fact that a minority will see it.

---

## The first step is yours

Go into the Playgama developer dashboard, create a board and take its identifier
together with the token. Until then any work of ours is done blindly and is not
verified by anything.
