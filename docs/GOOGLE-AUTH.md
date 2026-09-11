# GOOGLE ACCOUNT SIGN-IN — THE AGREED PLAN (his word 2026-09-10: «мне нужен гугловый акк и его имя
# с лидербордом на отдельном домене как сейчас», and his answer to the one fork: «покупки и место
# в таблице»)

⚠️ THE ANALYSIS THIS FILE HELD BEFORE (a list of forks, nothing built) IS SUPERSEDED. What survives
of it is recorded below as the checks that are still open; everything else is now decided.

## WHAT HE BOUGHT, IN HIS OWN TERMS

| | |
|---|---|
| the button | Google on blendo.monster ONLY — the portal has its own sign-in, the wrapper has Apple |
| the name | from the account, in the table and in the profile; no account — the animal name, as now |
| the leaderboard | stays on lb.blendo.monster; not one row moves |
| a new device | purchases come back, the table row comes back with its score; collection, level and boosts stay on the device |
| sign-out | mandatory — a phone is shared |

⛔ HE CHOSE THIS OVER «everything, including progress» (a cloud save on our own worker, roughly twice
the work). That is the next step if he ever asks for it, and the design below does not block it: the
mapping already holds the identity a save would be keyed by.

⚠️ THE PRICE OF WHAT HE CHOSE, AND IT IS TO BE NAMED TO HIM IN THE REPORT RATHER THAN DISCOVERED:
**the account has ONE row on the server and the balance stays PER DEVICE.** Two devices signed into
one account carry their own local `se`/`ss` and will overwrite the row in turn — whoever submits last
wins, and `lbSentScore` dedups only within a device. That is not a defect, it is the shape of «no
cloud save»; the cure is the option he declined.

## ⛔⛔ THE FIVE TRAPS, MEASURED IN THIS CODEBASE BEFORE A LINE WAS WRITTEN

**1. THE KEY MUST TRAVEL WITH THE ID, AND NEITHER SERVICE CAN SUPPLY IT.** `Save.lk` is registered
trust-on-first-use in TWO separate tables — the leaderboard's `p.k` and the pay worker's `pk` — and
whoever registers first owns the row. So a sign-in that returns only the id is a defect with a
guaranteed victim: the second device generates a FRESH key, the service that already holds one
answers 401, and the row (or the purchase) is locked out for ever. **The mapping therefore stores
the PAIR `{gid, k}` itself** rather than reading either service's table: a player who bought before
he ever submitted a score has a key in `pk` and none in `p`, and the mirror case is just as real.

**2. `guestName()` OVERWRITES `Save.gn` ON EVERY CALL** (77-save:345-348) — it is a derived value,
not a stored one. A Google name written into that field is wiped by the next frame of the menu. The
name needs a SOURCE MARKER, and the marker must travel with the id exactly as the key does.

**3. ADOPTING AN ID ON A FRESH DEVICE WOULD CLOBBER THE ACCOUNT'S ROW.** Our table stores the
CURRENT balance and falls when the player spends (the Forbes model, his own 2026-07-29 decision) —
it is not a max. A fresh device's `leaderboardScore()` is 0, so its first submission would drop the
account's row to 0 in front of him. **The sign-in reconciles the score before anything is sent.**
⚠️ AND THE RECONCILIATION COUNTS FROM THE RAW VALUE, NOT FROM THE FUNCTION: `leaderboardScore()` is
`max(0, se − max(0, ss − tu))`. A device whose raw figure is NEGATIVE (it has spent more than it
earned) reads 0 through the function, so `se += S − 0` leaves the raw at `S + raw < S` — a silent
undershoot. The delta is computed against the unclamped `se − max(0, ss − tu)`.

**4. ⛔⛔ AN UNSIGNED `/v1/auth` HANDS AN ATTACKER SOMEBODY ELSE'S KEY.** The obvious shape — «send
the ID token plus your `{gid, k}`, and the server anchors them» — is a hole with a working exploit:
a gid is semi-public, so anyone who knows one sends `{victim_gid, any k}` with his OWN Google
account. `ownerKey` finds the victim's REAL key already in `pk` (he has bought something) and
returns it; the mapping then stores `acc(attacker_sub → victim_gid, victim_real_k)`, and the
attacker's own device receives a working key for BOTH services (`pk.k === p.k === Save.lk`).
**`/v1/auth` is therefore a SIGNED call like every other endpoint of this worker** —
`what = 'auth.' + sha256(idToken)` through the existing `checkSig`. A wrong key then fails on `sig`;
where `pk` is empty TOFU accepts, which is the hole this project has already accepted everywhere
else. ⚠️ As a side effect the `INSERT OR IGNORE` into `pk` becomes unnecessary — `checkSig` does it
through `ownerKey`, so `acc.k` equals `pk.k` BY CONSTRUCTION rather than by a second write.

**5. ⛔⛔ TWO GOOGLE ACCOUNTS MUST NOT SHARE ONE IDENTITY.** Without a check the fresh path binds any
`sub` to any gid, for ever, and the shared phone he is buying this feature for is exactly where it
bites: the parent signs in → `acc(X → gid_P)`; the child signs in on the same phone → fresh →
`acc(Y → gid_P)` → on HIS own phone the child now receives the parent's purchases and the parent's
row. One `SELECT sub FROM acc WHERE gid = ?` before the insert, the answer `err:'bound'`, and an
index on `gid`.

## THE SHAPE

### WHERE IT LIVES: ONE ENDPOINT IN THE PAY WORKER
`POST /v1/auth` on `pay.blendo.monster`. Not a sixth worker (another domain, another deploy, another
secret for him to manage), and not the leaderboard (its D1 carries the big table and the cron). The
pay worker already owns `gid`, a TOFU key table and a D1, and the main thing the player recovers is
a purchase. ⚠️ THE LEADERBOARD IS NOT MOVED AND IS NOT TOUCHED — his own condition. It keeps
answering `lb.blendo.monster` with the same rows under the same ids.

    acc (sub TEXT PRIMARY KEY, gid TEXT NOT NULL, k TEXT NOT NULL, c INTEGER NOT NULL)
    CREATE UNIQUE INDEX ix_acc_gid ON acc(gid)   -- trap 5, enforced by the schema as well

### THE CALL
The client sends the Google ID token plus its own current `{gid, k}`, **signed** (trap 4). The worker:
1. `checkSig(env, gid, 'auth.' + sha256(idToken), t, sig, k)` — the same door as `/v1/mine`;
2. verifies the token against Google's JWKS (RS256, `iss`, `aud` = our client id, `exp`) — **no
   client secret exists in this flow, so nothing new goes into `wrangler secret` but the client id**;
3. `SELECT gid, k FROM acc WHERE sub = ?`;
4. **no row** → the account is new: refuse with `err:'bound'` if this gid already belongs to another
   `sub` (trap 5), otherwise store THIS device's `{gid, k}` — the key being the one `checkSig`
   anchored, so `acc.k === pk.k` by construction;
5. **a row** → hand back the stored pair.
It answers `{ok:1, gid, k, fresh:0|1}` — `fresh` says whether the account was just created, because
a client that was just registered has nothing to adopt and must not run the adoption below.

### JWKS — THE FOUR DETAILS THAT ARE ONLY FOUND IN PRODUCTION OTHERWISE
- `iss` comes in TWO forms and both are legitimate: `https://accounts.google.com` and
  `accounts.google.com`. Accepting one is a sign-in that works until it does not.
- an unknown `kid` means a key ROTATION, not a forgery: re-fetch the JWKS ONCE and retry before
  refusing.
- the key set is cached in the isolate (and only there — a Worker isolate is not a shared cache).
- `email` is never stored. Only `sub` and the display name reach us.

### WHAT THE CLIENT DOES WITH THE ANSWER
Same gid → nothing but the name. A DIFFERENT gid → adopt, in this order, because each step depends
on the one before it:
1. **remember the pre-adoption `{gid, lk}`** (`Save.gp`/`Save.lp`) — trap 6 below;
2. `Save.gid = gid; Save.lk = k` and commit;
3. Forget every per-id memory: the leaderboard's `lbSentScore`/`lbSentGid` and cache, the pay
   module's registration mark. ⚠️ Both marks already NAME the id they were earned for (2026-09-06-e),
   so they invalidate themselves — but the cache and the sent-score do not;
4. `lbMe()` for the adopted id → the server's score `S`;
5. `S > rawScore()` → `Save.se += S − rawScore()`, where `rawScore()` is the UNCLAMPED figure of
   trap 3. ⚠️ `se` is a monotone counter merged by max, so raising it is legitimate and cannot
   double: after the raise the two numbers are equal and the branch never fires again. The wallet
   rises with it, which is correct — that is the account's own earned balance arriving on this device;
6. The pay restore pass — the purchases come back by the same road a returning payment takes;
7. Redraw the profile, the table row and the corner badge.

⚠️ **ONE THING THE ADOPTION CANNOT RECOVER, AND IT IS MONEY:** a purchase paid on THIS device under
its OLD gid and not yet granted (MB WAY completes minutes later; the tab was closed) is orphaned —
`/v1/mine` asks for the CURRENT gid. Rare, and named rather than hidden.

### THE NAME
`Save.gn` holds the displayed name, `Save.gs` its source (`''` derived, `'g'` Google). `guestName()`
returns the stored name when the source is `'g'` and otherwise behaves exactly as today. Both fields
travel with the gid through a `pickName` helper shaped like `pickLk` — a name is a property of the
identity, not of the device.
⚠️ THE VALUE IS TRIMMED, COLLAPSED AND CUT TO 40 (the server's own limit); empty after that → the
animal name. Names render through `textContent` everywhere (85-hud), so there is no markup path.
⛔ WHAT THIS DOES NOT SOLVE, AND IT IS NAMED RATHER THAN HIDDEN: a Google display name is arbitrary
user text shown to other players. Moderation stays what it is — the `/admin/hide` flag.
⚠️ THE FIELD IS `name` (the full display name), falling back to `given_name`. First-name-only is one
line if he prefers it, and it is the friendlier choice for a public table — his call.

### THE CLIENT ID LIVES IN ONE PLACE
It is needed twice — by GIS on the client and as `aud` on the worker — and two copies are the drift
this project has paid for with PID, the price and the material map. The client READS it from the
worker (a field on `/v1/price`, or `GET /v1/auth/cfg`) before rendering the button; the button is
drawn in the menu, not on the boot path, so one async hop costs nothing there.

### THE BUTTON
Google's own rendered button (`google.accounts.id.renderButton`): with a custom button the GIS
library does not hand back an ID token at all, only an access token through a second flow. Its look
is constrained to Google's themes — a frame goes to him before it is wired.
⛔⛔ THE LIBRARY IS ADDED BY JS AND ONLY INSIDE THE ORIGIN GATE — the same three questions
`payHostOk()` asks (our own origin, not in an iframe, not the wrapper). Otherwise a third-party
script lands in the portal's console and in an App Store review.

### SIGN-OUT — AND IT RESTORES THE DEVICE'S OWN IDENTITY
**6. ⛔⛔ A DEVICE THAT ADOPTED SOMEBODY ELSE'S IDENTITY MUST GET ITS OWN BACK.** His reason for
wanting sign-out at all is «a phone is shared» — and a name-only sign-out leaves the device BEING
that account: the next person plays, earns and BUYS under a stranger's gid. So the pre-adoption
`{gid, lk}` is kept (`Save.gp`/`Save.lp`, step 1 of the adoption) and restored on sign-out, with the
per-id memories cleared exactly as on adoption.
⛔ IT MUST NOT GENERATE A NEW `gid`: that would strand the purchases on this device behind an id
nobody remembers — the very hole this feature exists to close. Where the account was CREATED from
this device there is nothing to restore, and sign-out is name-only, as it was.
⚠️ Signing in again on the same device is then a no-op, and on another account it adopts that
account's id. **Tell him plainly what sign-out means**, since it now moves more than a name.

## WHAT IS HIS, AND IT GATES THE LIVE CHECK
A Google Cloud project, an OAuth client id (Web application) with `https://blendo.monster` as an
authorised JavaScript origin, and a consent screen naming the privacy policy we already publish.
⚠️ The client id is NOT a secret (it ships in the page) but it IS his to create; the guards run
against a locally-signed token and a stubbed JWKS, and the real click is his.
⚠️ `privacy.html` MUST say that a Google account identifier (`sub`) and the account's display name
are stored on our server once the player signs in. It is a disclosure obligation, not a courtesy.

## THE GUARDS, AND THE SABOTAGES EACH MUST REDDEN
The server half (`server/pay/test/run.js`) runs against a locally-signed RS256 token and a stubbed
JWKS fetch; the client half is a marked section with a stubbed `/v1/auth` and a stubbed
`google.accounts.id` (the library does not load on `file://`).
- the signature removed from `/v1/auth` → the «a foreign gid cannot be claimed» arm;
- the `bound` check removed → the «two accounts, one gid» arm;
- the reconciliation counting from the clamped value → the «a negative device does not undershoot» arm;
- sign-out without the restore → the «a shared phone gets its own id back» arm;
- the button rendered outside the origin gate (an iframe) → the gate arm.

## STILL OPEN, AND NOT OURS TO GUESS
- **Apple's guideline 4.8** — offering a third-party sign-in in an app has historically obliged the
  app to offer Sign in with Apple too. The wrapper gets NO sign-in in this batch, so it is not
  blocking; it must be read before it ever does.
- **The consent screen's verification state** — a bare sign-in usually needs none, and an unverified
  screen shows a warning. A product decision on his side.
