// server.js
const express   = require('express');
const cors      = require('cors');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const routes     = require('./routes');
const aggregator = require('./aggregator');
const cache      = require('./cache');

let db = null;
try { db = require('./db'); } catch (_) {}

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', routes);

// Health check для Railway/Render
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[WS] +1 клиент (всего: ${clients.size}) from ${req.socket.remoteAddress}`);

  const skins = cache.get('skins');
  if (skins) ws.send(JSON.stringify({ type: 'init', data: skins }));

  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', () => { clients.delete(ws); });
});

function broadcast(type, data) {
  if (!clients.size) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

let isUpdating = false;
async function runUpdate() {
  if (isUpdating) return;
  isUpdating = true;
  try {
    const skins = await aggregator.fetchAll();
    broadcast('update', skins);
  } catch (err) {
    console.error('[Scheduler] Ошибка:', err.message);
  } finally {
    isUpdating = false;
  }
}

server.listen(PORT, async () => {
  const host = process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`;
  console.log(`\n🚀 SkinPulse запущен: http://${host}\n`);

  // Инициализация БД
  if (db) {
    await db.init().catch(err => {
      console.warn('[DB] PostgreSQL недоступен:', err.message);
      db = null;
    });
  }

  // Самопинг — не даём Render засыпать (сервис засыпает после 15 мин неактивности)
  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
      require('https').get(process.env.RENDER_EXTERNAL_URL + '/health').on('error', () => {});
    }, 10 * 60 * 1000);
    console.log('[Keepalive] Самопинг включён:', process.env.RENDER_EXTERNAL_URL);
  }

  // Самопинг — не даём Render засыпать
  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
      require('https').get(process.env.RENDER_EXTERNAL_URL + '/health').on('error', () => {});
    }, 10 * 60 * 1000);
    console.log('[Keepalive] Самопинг включён:', process.env.RENDER_EXTERNAL_URL);
  }

  // Первый сбор данных
  await runUpdate();

  // Обновление каждые 2 минуты (на сервере можно позволить)
  setInterval(runUpdate, 2 * 60 * 1000);

  // Пересчёт change24h каждые 15 минут
  setInterval(() => aggregator.recomputeChanges(), 15 * 60 * 1000);

  // Чистка БД раз в день
  if (db) setInterval(() => db.cleanup(), 24 * 60 * 60 * 1000);
});
