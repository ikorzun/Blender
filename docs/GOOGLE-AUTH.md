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

## ✅ THE CLIENT HALF SHIPPED 2026-09-11 — WHAT THE CODE ACTUALLY DOES, AND THE THREE THINGS THE PLAN DID NOT COVER

`src/app/84-auth.js` owns the ORDER OF THE STEPS and nothing else; the protocol calls are 83-pay's
(`payAuthCfg`, `payAuth` — one signed call, the token's hash in the signed string), the identity
arithmetic is 77-save's (`pickName`, `rawScore`, `identityAdopt/Lift/Restore`, `playerNameSet`), the
band is drawn by 85-hud into `#msAuth` under the profile row. The gate is `payHostOk()`'s.

**1. ⛔⛔ SIGN-OUT LEAKED THE ACCOUNT'S BALANCE, AND THE PLAN ABOVE HAD NO ANSWER FOR IT.** Step 5
raises `se` by `S − rawScore()`; step «restore the pre-adoption `{gid, lk}`» gives the identity back
and says nothing about the raise. So the guest's own row and his own wallet inherited the account's
score. `Save.gr` records the lift (it ACCUMULATES — signing into a second account while signed into
the first must not lose the first lift) and `identityRestore` subtracts it.
⚠️ `se` GOES DOWN THERE, and it is the only place in the game where a monotone counter does. It is
safe because the lift and its rollback live on ONE device: sign-in exists only on our own origin,
where there is no bridge and `bridgeSyncSave` never runs, so no cloud copy can merge the raised value
back by max. The residual, named to him: a player who SPENT from the lifted wallet ends below where
he started — `ss` is monotone and what is spent is spent.

**2. THE NAME NEVER REACHED THE ROW WHEN THE SCORE DID NOT MOVE.** `lbSubmit` skips a submission
whose score equals the last one sent, so a sign-in that changes only the name was silently dropped
and the row kept the animal until the score next moved. `lbForgetSent()` (82-lb) is called on every
successful sign-in AND on sign-out. ⚠️ A change of ID invalidates that memory by itself
(`lbSentGid !== id` inside `lbSubmit`, verified by reading); a change of NAME does not — that gap is
the whole reason the function exists. Measured on an http stand with the bot flag hidden: two
submissions, the same score 70, `Crab` then `Ivan K`.

**3. THE `bound` WALL IS PRODUCT, AND HE IS TOLD IT IN THESE WORDS:** «This device already belongs to
another account». It fires exactly when a NEW account is created on a device whose gid already
belongs to one — i.e. a second person on a shared phone cannot CREATE an account there, only sign in
with one made on another device. That follows from trap 5 and it is not a defect.

**WHAT WAS MEASURED AND CORRECTED AGAINST THE PLAN:**
- **`gp`/`lp`/`gr` MUST be named in `mergeSave`, against the advice they should not be.** `loadSave`
  merges the stored copy INTO the empty literal, so a field that is not named there is LOST at every
  launch — «do not mention them and the device keeps its own» would have dropped the way back on the
  first reload. They are named under a new `own` argument, true only for our own storage: at load
  they survive, from a CLOUD copy they never arrive.
- **The band wears no backing at any width.** The first draft gave it a white pill on the authority
  of a markup comment saying the card «dissolves on mobile». Measured at 390 / 800 / 1280: the card
  is a real white card at every width and `.ms-head` is transparent at every one — the comment has
  been stale since 2026-08-11. A white pill inside a white card.
- **⛔ THE BAND IS GONE — THE SIGN-IN IS THE PROFILE'S SECOND LINE (his node 840:4681, 2026-09-11-v).**
  The whole band (a full-size Google button, «Signed in with Google», a bordered «Sign out» pill) was
  replaced by one 14px line under the name: the Google mark, «Sign in with Google» in #3971ff, and —
  signed in — «Logout» in Carbon 600 (#a2a2a8) in the same slot. The reason the band never repeated
  the name still holds and is why the line does not either: the row above already carries it.
  ⛔⛔ AND THE LINE IS THE PICTURE, NOT THE BUTTON. A button of ours yields no ID token, so Google's
  own rendered button lies on the line at `opacity:0`, CLIPPED to it (`overflow:hidden`) — the clip is
  what keeps its ~200px minimum width off the «×5 Boost» control beside it. What the suite can state
  is our half: the click reaches the overlay and not the page behind it. What happens inside Google's
  iframe it cannot see, and the guard says so.
- **The client id is read from `/v1/auth/cfg` and written down nowhere else** — one copy, the
  worker's var, asserted by the guard against what GIS was initialised with.
- **⚡ THE LINE'S TWO WORDINGS ARE CHOSEN BY MEASUREMENT, AND THE SHORT ONE IS MANDATORY** (his word
  2026-09-11-g). «Sign in with Google» is written, measured against the room the header has left, and
  swapped for «[G] Sign in» only when it does not fit. A width breakpoint is wrong for it — whether
  the words fit depends on the SCORE beside them as much as on the screen.
  ⛔⛔ AND SINCE 2026-09-11-p THE NUMBER GIVES WAY TO IT. At 320 with a short name the profile's
  column stopped shrinking where the NAME stopped, and the line beneath was ellipsised to «Sig…» —
  so the wallet's fit now asks about the whole column (`.ms-uname`, `.ms-auth-lbl`, `.ms-auth-out`)
  and falls down its own ladder rather than let the mandatory short form be clipped. `headFit` drives
  the label to its floor BEFORE deciding the number, or the two measurements chase each other.

**THE ONE TAP** (his word 2026-09-11-v: «show the native Google popup on entering the game,
auto-login if possible») is `authPromptOneTap()`, called from `finishIntro` — the honest «entered the
game», and never from `skipIntro`, which is what every probe and the whole suite take. One
`initialize` serves both the button and the prompt (it is GLOBAL library config; a second call would
silently re-point the callback), with `auto_select: true`, `itp_support: true` — without which the
prompt does nothing at all in Safari, his own browser — and `use_fedcm_for_prompt: true`.
- ⚠️ **THE CORNER IS GOOGLE'S, NOT OURS, AND HE WAS TOLD.** On a desktop the prompt is a card in the
  top-right of the window, which is what he asked for; the same call on a phone renders a BOTTOM
  SHEET, and no option of the library moves it.
- ⛔ **NO MOMENT LISTENER.** Under FedCM the notification reasons are gone, and a branch on them would
  throw or lie. The only honest signal is the credential arriving at the callback.
- ⛔⛔ **`disableAutoSelect()` ON SIGN-OUT IS THE TRAP THE WHOLE FEATURE TURNS ON.** Without it the
  next launch signs the same account straight back in, before anyone taps — the sign-out undone in
  silence, on the shared phone that is the only reason sign-out exists.
- ⚡ **AND AUTO-LOGIN BUYS MORE THAN A SAVED TAP:** it re-covers Safari's seven-day eviction of
  localStorage (2026-09-04-a) — a player whose save was swept returns to his purchases and his row.

**THE GUARD** is the marked section `⟦AUTH-SECTION⟧` — 27 arms on an http stand with the bot flag
hidden (a submission is muted on `file://` and under automation), a stubbed worker and a stubbed
`google.accounts.id` (so no Google script is ever fetched, and the arm asserts the absence of the
tag). Proven against eight variants, each reddening its own arms and a comment edit none: the lift
from the CLAMPED figure → the lift arm alone; `lbInvalidate` moved after `lbMe` → the cache arms;
`lbForgetSent` made a no-op → the row arm alone; the lift not recorded → the two arms that read it;
the way back not stored → its four arms; `guestName` ignoring the source → all five name arms; the
origin gate always true → the gate arm alone; `gp/lp/gr` copied unconditionally → the cloud arm alone.
