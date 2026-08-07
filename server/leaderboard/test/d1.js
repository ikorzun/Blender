// Адаптер: интерфейс D1 поверх встроенного `node:sqlite`.
// ⚠️ ЗАЧЕМ НАСТОЯЩИЙ SQL, А НЕ МОК: половина логики таблицы живёт именно в
// запросах — оконная функция лесенки, частичный индекс, тай-брейк `u ASC`,
// keyset-соседи. Мок проверял бы мою же выдумку, а не поведение базы.
// Зависимостей не добавляет: `node:sqlite` есть в Node 22.
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
