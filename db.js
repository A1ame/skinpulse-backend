// db.js — PostgreSQL через pg
// Установка: npm install pg
// Нужен локальный PostgreSQL: https://www.postgresql.org/download/

const { Pool } = require('pg');

// Railway/Render дают DATABASE_URL — используем его если есть
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10, idleTimeoutMillis: 30000,
    })
  : new Pool({
      host:     process.env.PG_HOST     || 'localhost',
      port:     parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DB       || 'skinpulse',
      user:     process.env.PG_USER     || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
      max: 10, idleTimeoutMillis: 30000,
    });

pool.on('error', (err) => {
  console.error('[DB] Неожиданная ошибка пула:', err.message);
});

// Создаём таблицы при старте
async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        id          BIGSERIAL PRIMARY KEY,
        skin_name   TEXT        NOT NULL,
        source      TEXT        NOT NULL,  -- 'steam','waxpeer','dmarket','skinport','buff163','csmoney'
        price       NUMERIC(12,4) NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Индексы для быстрых запросов
      CREATE INDEX IF NOT EXISTS idx_snapshots_name_time
        ON price_snapshots (skin_name, recorded_at DESC);

      CREATE INDEX IF NOT EXISTS idx_snapshots_source
        ON price_snapshots (source, recorded_at DESC);

      -- Таблица для хранения агрегированных изменений (чтобы не считать каждый раз)
      CREATE TABLE IF NOT EXISTS price_changes (
        skin_name    TEXT PRIMARY KEY,
        change_1h    NUMERIC(8,2) DEFAULT 0,
        change_24h   NUMERIC(8,2) DEFAULT 0,
        change_7d    NUMERIC(8,2) DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[DB] Таблицы готовы');
  } catch (err) {
    console.error('[DB] Ошибка инициализации:', err.message);
    console.error('[DB] Убедись что PostgreSQL запущен и база skinpulse создана:');
    console.error('[DB]   createdb skinpulse');
  } finally {
    client.release();
  }
}

// Сохранить снапшот цен для всех скинов
async function saveSnapshot(skins) {
  if (!skins.length) return;

  const SOURCES = ['steam', 'waxpeer', 'dmarket', 'skinport', 'buff163', 'csmoney'];
  const rows = [];

  for (const skin of skins) {
    for (const src of SOURCES) {
      const price = skin.prices?.[src];
      if (price && price > 0) {
        rows.push([skin.name, src, price]);
      }
    }
  }

  if (!rows.length) return;

  // Батч-вставка через unnest
  const names  = rows.map(r => r[0]);
  const srcs   = rows.map(r => r[1]);
  const prices = rows.map(r => r[2]);

  try {
    await pool.query(`
      INSERT INTO price_snapshots (skin_name, source, price)
      SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[])
    `, [names, srcs, prices]);

    console.log(`[DB] Сохранено ${rows.length} ценовых снапшотов`);
  } catch (err) {
    console.error('[DB] Ошибка сохранения снапшота:', err.message);
  }
}

// Получить историю цен для одного скина (последние N дней)
async function getPriceHistory(skinName, days = 30) {
  try {
    const { rows } = await pool.query(`
      SELECT
        source,
        DATE_TRUNC('hour', recorded_at) AS hour,
        AVG(price)::numeric(12,4)       AS avg_price
      FROM price_snapshots
      WHERE skin_name = $1
        AND recorded_at > NOW() - INTERVAL '1 day' * $2
      GROUP BY source, hour
      ORDER BY hour ASC
    `, [skinName, days]);
    return rows;
  } catch (err) {
    console.error('[DB] Ошибка getPriceHistory:', err.message);
    return [];
  }
}

// Рассчитать и сохранить изменения цены за 1ч / 24ч / 7д для всех скинов
async function computeChanges() {
  try {
    // change_24h: сравниваем среднюю цену последних 2ч со средней ценой за 22-26ч назад
    await pool.query(`
      INSERT INTO price_changes (skin_name, change_24h, updated_at)
      SELECT
        now_data.skin_name,
        CASE
          WHEN COALESCE(old_data.avg_price, 0) = 0 THEN 0
          ELSE ROUND(((now_data.avg_price - old_data.avg_price) / old_data.avg_price * 100)::numeric, 2)
        END AS change_24h,
        NOW()
      FROM (
        SELECT skin_name, AVG(price) AS avg_price
        FROM price_snapshots
        WHERE recorded_at > NOW() - INTERVAL '2 hours'
        GROUP BY skin_name
      ) now_data
      LEFT JOIN (
        SELECT skin_name, AVG(price) AS avg_price
        FROM price_snapshots
        WHERE recorded_at BETWEEN NOW() - INTERVAL '26 hours' AND NOW() - INTERVAL '22 hours'
        GROUP BY skin_name
      ) old_data USING (skin_name)
      ON CONFLICT (skin_name) DO UPDATE
        SET change_24h  = EXCLUDED.change_24h,
            updated_at  = NOW()
    `);

    console.log('[DB] Изменения цен пересчитаны');
  } catch (err) {
    console.error('[DB] Ошибка computeChanges:', err.message);
  }
}

// Получить change_24h для всех скинов (возвращает Map name -> change)
async function getAllChanges() {
  try {
    const { rows } = await pool.query(`
      SELECT skin_name, change_24h, change_7d
      FROM price_changes
      WHERE updated_at > NOW() - INTERVAL '2 hours'
    `);
    const map = new Map();
    for (const row of rows) {
      map.set(row.skin_name, {
        change24: parseFloat(row.change_24h) || 0,
        change7d: parseFloat(row.change_7d)  || 0,
      });
    }
    return map;
  } catch (err) {
    console.error('[DB] Ошибка getAllChanges:', err.message);
    return new Map();
  }
}

// Удалить старые снапшоты (старше 30 дней)
async function cleanup() {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM price_snapshots
      WHERE recorded_at < NOW() - INTERVAL '30 days'
    `);
    if (rowCount > 0) console.log(`[DB] Очистка: удалено ${rowCount} старых записей`);
  } catch (err) {
    console.error('[DB] Ошибка cleanup:', err.message);
  }
}

module.exports = { init, saveSnapshot, getPriceHistory, computeChanges, getAllChanges, cleanup, pool };
