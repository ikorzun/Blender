-- СВОЯ ТАБЛИЦА ЛИДЕРОВ — схема D1 (постановка docs/LEADERBOARD-OWN.md).
-- ⚠️ ПОЗИЦИЯ = ПОСЛЕДНЕЕ значение leaderboardScore(), а НЕ максимум: вся
-- затея владельца в том, чтобы трата очков РОНЯЛА место («Форбс»-модель).
-- Сервер площадки этого не умеет — потому и своя таблица.

CREATE TABLE IF NOT EXISTS p (
  id TEXT PRIMARY KEY,            -- наш Save.gid
  k  TEXT NOT NULL,               -- секрет HMAC, приходит ОДИН раз (TOFU)
  n  TEXT NOT NULL,               -- имя-животное из GUEST_NAMES
  a  INTEGER NOT NULL,            -- номер аватара 1..49
  s  INTEGER NOT NULL,            -- позиция = leaderboardScore(), ПОСЛЕДНЕЕ
  u  INTEGER NOT NULL,            -- unix-сек последней записи: тай-брейк + rate-limit
  q  INTEGER NOT NULL DEFAULT 0,  -- seq клиента, монотонный (анти-реплей)
  c  INTEGER NOT NULL,            -- создано (для ручной модерации; механикой не читается)
  f  INTEGER NOT NULL DEFAULT 0   -- 1 = скрыт из общей таблицы
);

-- ⚠️ ЧАСТИЧНЫЙ индекс: скрытые (f=1) и обнулившиеся (s=0) выпадают из ВСЕХ
-- сканов бесплатно. В D1 «строка чтения» — это ПРОСКАНИРОВАННАЯ строка,
-- поэтому лишний скан стоит денег, а не только времени.
CREATE INDEX IF NOT EXISTS ix_rank ON p(s DESC, u ASC) WHERE f = 0 AND s > 0;

-- Снимок: топ, лесенка рангов, счётчик игроков. Пишется cron'ом раз в час.
CREATE TABLE IF NOT EXISTS snap (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  t INTEGER NOT NULL
);
