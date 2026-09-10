# GOOGLE ACCOUNT SIGN-IN — THE ANALYSIS (his word 2026-09-10: «стоит прикрутить авторизацию через гугл аккаунт»)

⚠️ THIS IS AN ANALYSIS AND A LIST OF FORKS, NOT A PLAN THAT WAS APPROVED. Nothing here was built.
Every claim below is either MEASURED IN THIS CODEBASE (marked ✅) or a CHECK that must be made before a
line is written (marked ⛔ CHECK). Two of the checks can only be answered by reading somebody else's live
rules, and guessing them in a canon would be worse than silence.

## ⛔⛔ FIRST: IT REVERSES HIS OWN WORD OF 2026-08-07, AND HE SHOULD KNOW THAT BEFORE HE SPENDS ANYTHING

Verbatim then: «гостю нужно присвоить уникальный id и всегда его показывать, что-то вроде автологина в
игре, но не гугловый». That decision is what the whole identity of this game is built on today, and it is
not a detail: the id is issued by US, the player's NAME and AVATAR are DERIVED from it, and everything the
player owns hangs off it. Adding Google sign-in does not replace that — it adds a second, stronger identity
beside it. The question to answer first is therefore not «how» but «what for», and the honest answer is
below in one paragraph.

## ✅ WHAT IT WOULD ACTUALLY BUY — MEASURED IN THE CODE, AND IT IS ONE THING

`Save.gid` is generated on the first launch (`Date.now().toString(36) + random`, 77-save `guestId`) and
lives in `localStorage`. Keyed by it, today:
- the leaderboard row (its score, its nickname, its avatar) and the HMAC key `Save.lk` that proves the row
  is his (trust-on-first-use, 2026-09-06-e);
- **the payment ledger**: `server/pay` stores an entitlement against `gid` and hands it back through
  `/v1/mine` — that is what makes a purchase survive a closed tab;
- the player's own name and avatar (`gidHash`), so on two devices he looks the same — but only if the id
  reached the second device.

⚡⚡ **AND THAT IS THE HOLE: THE ID ITSELF HAS NO WAY TO TRAVEL ON blendo.monster.** The only cloud copy of
the save is `bridge.storage`, i.e. the PORTAL's. On our own domain a cleared browser (or Safari's 7-day
eviction of site data) means a NEW gid — a new leaderboard row, a new wallet, and **a purchase that
`/v1/mine` will never return, because it is filed under an id nobody remembers**. That is the one thing
Google sign-in cures, and it is worth curing: it is the only place in this project where the player can
lose money he paid.

⛔ WHAT IT DOES **NOT** BUY, so it is not oversold: it changes nothing in the Playgama portal (the platform
has its own player and its own storage) and nothing in the iOS wrapper (StoreKit ties a purchase to the
Apple ID already). It also does not fix the max-merge losing OVERLAPPING sessions on two devices — that is
a separate, recorded item in V2-IDEAS.

## THE FORKS, AS CHECKS

**1. ⛔ CHECK — IT CANNOT BE ONE PATH FOR ALL THREE SURFACES.** In the portal the game is an iframe on
Playgama's origin: Google Identity Services in a third-party context depends on rules we do not control,
and the platform already exposes `player.authorize` (the SDK carries `authorize`/`authorizePlayer`/
`authorizeUser`). So the design is «Google on our own domain; the platform's own authorization inside the
portal; Apple in the wrapper», i.e. a third arm of the provider chain `payApi()` already uses — not one
button everywhere. Verify what GIS actually does inside their iframe before promising anything.

**2. ⛔ CHECK — APPLE'S GUIDELINE 4.8.** Offering a third-party sign-in in an app has historically obliged
the app to offer Sign in with Apple as well, with exceptions. The current wording of the App Review
Guidelines must be read before the wrapper gets any sign-in at all; this is the one item that can turn a
one-week task into a two-week one, and it is not ours to guess.

**3. THE MERGE IS THE REAL WORK, AND IT IS SERVER-SIDE.** Linking a Google `sub` to an existing `gid` needs
a mapping table (`sub → gid`) in a worker, plus a rule for the case that has to happen: ONE Google account
meets TWO gids, because the player played as a guest on the phone and on the laptop. Then either one gid
wins and the other's rows are migrated (the leaderboard row, the pay ledger's `pk`/`ent`), or the mapping
keeps both and the client merges the saves — and our merge is monotone-max, which loses overlapping
increments. **The cheapest honest version: the OLDEST gid wins, exactly as `pickGid` already decides, and
the loser's ledger rows are re-pointed by a one-off server statement.**

**4. THE VERIFICATION IS CHEAP AND NEEDS NO NEW SECRET.** «Sign in with Google» hands the page a signed
JWT (`credential`); a worker verifies it against Google's public keys and checks `aud` = our client id,
`iss`, `exp`. There is no client secret in that flow, so nothing new goes into `wrangler secret`. What IS
needed is a Google Cloud project, an OAuth consent screen with a link to a privacy policy (we have
`privacy.html` — it already states what the leaderboard stores) and the domain listed as an authorised
origin. ⛔ CHECK: whether the consent screen needs verification for our scopes (a bare sign-in usually does
not) — an unverified screen shows a warning, which is a product decision.

**5. WHERE IT LANDS.** The existing `server/pay` worker already owns `gid`, the TOFU key and a D1 database,
and it is already the thing that knows what a player has bought. A `server/auth` of its own would need a
second copy of the same identity table — the defect this project has paid for repeatedly. So: one more
endpoint in the pay worker, and the leaderboard keeps reading the same `gid`.

**6. WHAT THE PLAYER SEES.** `#msUser` in the menu is a placeholder avatar and name and has been since the
menu was built — the canon says in as many words that it is «for the future Google authorization». So the
entry point exists; what has never been designed is what the menu says once he IS signed in, and whether
signing out is offered at all (it must be — a shared device).

## THE SHAPE OF A FIRST BATCH, IF HE SAYS GO

Smallest thing that closes the hole above and nothing else: the button on our own domain only; the worker
endpoint that verifies the token and returns the gid mapped to that `sub` (creating the mapping on first
sign-in); the client adopting that gid through the SAME merge path a cloud copy already takes; and the
purchase recovery proven end to end in a real browser — sign in on a second profile, get the boost back.
The portal and the wrapper are untouched in that batch, and it is the batch that decides whether the rest
is worth it.
