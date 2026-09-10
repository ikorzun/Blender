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
