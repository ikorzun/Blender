-- OUR OWN LEADERBOARD — D1 schema (spec in docs/LEADERBOARD-OWN.md).
-- ⚠️ POSITION = the LAST value of leaderboardScore(), NOT the maximum: the
-- owner's whole idea is that spending points DROPS your place (the "Forbes" model).
-- The platform's server cannot do that — that is exactly why we have our own table.

CREATE TABLE IF NOT EXISTS p (
  id TEXT PRIMARY KEY,            -- our Save.gid
  k  TEXT NOT NULL,               -- HMAC secret, arrives ONCE (TOFU)
  n  TEXT NOT NULL,               -- animal name from GUEST_NAMES
  a  INTEGER NOT NULL,            -- avatar number 1..49
  s  INTEGER NOT NULL,            -- position = leaderboardScore(), the LAST one
  u  INTEGER NOT NULL,            -- unix-sec of the last write: tie-break + rate-limit
  q  INTEGER NOT NULL DEFAULT 0,  -- client seq, monotonic (anti-replay)
  c  INTEGER NOT NULL,            -- created (for manual moderation; not read by the mechanics)
  f  INTEGER NOT NULL DEFAULT 0   -- 1 = hidden from the shared table
);

-- ⚠️ PARTIAL index: hidden (f=1) and zeroed-out (s=0) rows fall out of ALL
-- scans for free. In D1 a "row read" is a SCANNED row,
-- so an extra scan costs money, not just time.
CREATE INDEX IF NOT EXISTS ix_rank ON p(s DESC, u ASC) WHERE f = 0 AND s > 0;

-- Snapshot: the top, the rank ladder, the player counter. Written by cron once an hour.
CREATE TABLE IF NOT EXISTS snap (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  t INTEGER NOT NULL
);
