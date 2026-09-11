-- PAYMENTS ON OUR OWN DOMAIN — D1 schema (spec in docs/STRIPE-PORTUGAL.md).
-- The fifth worker of the project. It exists for one reason the client cannot cover: the grant
-- must be made by whoever SAW the payment, and a browser never sees it — only Stripe's webhook does.
--
-- ⚠️⚠️ THE SESSION ID IS THE PRIMARY KEY, AND THAT IS THE WHOLE IDEMPOTENCE. Stripe retries a
-- webhook until it gets a 2xx, and it may deliver the same event twice at any time; with the
-- session as the key an `INSERT OR IGNORE` makes a second delivery a no-op. A row per DELIVERY,
-- keyed by anything else, would hand the player two boosts for one payment.
CREATE TABLE IF NOT EXISTS ent (
  sid TEXT PRIMARY KEY,           -- Stripe Checkout Session id
  gid TEXT NOT NULL,              -- the player's Save.gid, carried through the session's metadata
  pid TEXT NOT NULL,              -- OUR product id ('bundle5'), never Stripe's
  amt INTEGER NOT NULL,           -- what was actually paid, in minor units (kept for the books)
  cur TEXT NOT NULL,
  c   INTEGER NOT NULL,           -- created, unix seconds
  cl  INTEGER NOT NULL DEFAULT 0  -- claimed, unix seconds; 0 = the player has not taken it yet
);

-- ⚠️ PARTIAL index: the only hot query is «what does this player own and has not taken», and a
-- claimed row must fall out of it for free. In D1 a row read is a SCANNED row.
CREATE INDEX IF NOT EXISTS ix_ent_gid ON ent(gid) WHERE cl = 0;

-- The player's signing key, first-write-wins — the leaderboard's own TOFU, and deliberately its
-- own copy rather than a shared table: two services must not be able to lock each other out.
-- ⚠️ THE HOLE IS THE SAME ONE THE LEADERBOARD RECORDS AND ACCEPTS: whoever registers a key for a
-- gid first owns it. Here it is narrower still — an attacker would have to know somebody's gid AND
-- register before that player's own first request, and the row he could then take is one purchase
-- made from that player's browser.
CREATE TABLE IF NOT EXISTS pk (
  gid TEXT PRIMARY KEY,
  k   TEXT NOT NULL,
  c   INTEGER NOT NULL
);

-- ===== GOOGLE SIGN-IN: THE ACCOUNT → IDENTITY MAPPING (docs/GOOGLE-AUTH.md) =====
-- ⚠️⚠️ IT STORES THE PAIR `{gid, k}` AND NOT THE GID ALONE, AND THAT IS THE WHOLE POINT. The
-- signing key is registered trust-on-first-use in TWO separate tables — the leaderboard's `p.k` and
-- this worker's `pk` — and whoever registers first owns the row. A sign-in that handed back only an
-- id would have the second device generate a FRESH key, the service that already holds one answer
-- 401, and the player's row (or his purchase) locked out for ever.
-- ⚠️ The key written here is the one `checkSig` has just anchored in `pk`, so `acc.k === pk.k` by
-- construction rather than by a second write.
-- ⛔ NO EMAIL AND NO NAME: `sub` is the only Google field stored. The display name lives in the
-- save and reaches the leaderboard as the nickname it already stores.
CREATE TABLE IF NOT EXISTS acc (
  sub TEXT PRIMARY KEY,           -- Google's stable subject id for this account
  gid TEXT NOT NULL,              -- the identity this account owns
  k   TEXT NOT NULL,              -- its signing key, the pair above
  c   INTEGER NOT NULL            -- created, unix seconds
);

-- ⛔⛔ UNIQUE, AND IT IS A RULE RATHER THAN AN OPTIMISATION: without it two Google accounts can bind
-- to one identity for ever, and the shared phone this feature exists for is exactly where that
-- bites — the parent signs in, the child signs in on the same phone, and on his own phone the child
-- receives the parent's purchases and the parent's row. The endpoint checks it too; the index is
-- what makes the check hold across two requests that race.
CREATE UNIQUE INDEX IF NOT EXISTS ix_acc_gid ON acc(gid);
