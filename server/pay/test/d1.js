// A D1 interface over node:sqlite for the payment worker's guards.
// REAL SQL and not a mock: half of this worker's logic lives in its queries — the
// `INSERT OR IGNORE` that makes the webhook idempotent, the `AND cl = 0 AND gid = ?` that
// stops one player closing another's row — and a mock would answer whatever it was told.
//
// ⚠️⚠️ IT IS NOT A COPY OF THE LEADERBOARD'S ADAPTER, AND THE DIFFERENCE IS LOAD-BEARING.
// node:sqlite's `run()` returns `{changes, lastInsertRowid}`, while D1 returns
// `{success, meta:{changes, ...}}` — and `/v1/claim` answers the player with
// `res.meta.changes`. Hand it the bare node:sqlite result and every claim reports 0 taken
// while the rows are honestly marked: a guard reading that number would go red on a healthy
// build, and a client trusting it would show the player nothing. The leaderboard's own
// adapter can return the raw result because its worker never reads the count.
const { DatabaseSync } = require('node:sqlite');

function makeDB(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const stat = { reads: 0, writes: 0 };
  return {
    _raw: db, _stat: stat,
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() { stat.reads++; const r = db.prepare(sql).get(...args); return r === undefined ? null : r; },
        async all() { stat.reads++; return { success: true, results: db.prepare(sql).all(...args) }; },
        async run() {
          stat.writes++;
          const r = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
      };
      return api;
    },
  };
}

module.exports = { makeDB };
