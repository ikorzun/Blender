// Adapter: a D1 interface on top of the built-in `node:sqlite`.
// ⚠️ WHY REAL SQL AND NOT A MOCK: half the table's logic lives precisely in the
// queries — the ladder window function, the partial index, the `u ASC` tie-break,
// keyset neighbors. A mock would check my own invention, not the DB's behavior.
// Adds no dependencies: `node:sqlite` is present in Node 22.
const { DatabaseSync } = require('node:sqlite');

function makeDB(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const stat = { reads: 0, writes: 0 };
  return {
    _raw: db,
    _stat: stat,
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() {
          stat.reads++;
          const r = db.prepare(sql).get(...args);
          return r === undefined ? null : r;
        },
        async all() {
          stat.reads++;
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          stat.writes++;
          return db.prepare(sql).run(...args);
        },
      };
      return api;
    },
  };
}

module.exports = { makeDB };
