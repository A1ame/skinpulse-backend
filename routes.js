// routes.js
const express = require('express');
const router  = express.Router();
const cache   = require('./cache');
const proxy   = require('./proxy');

let db = null;
try { db = require('./db'); } catch (_) {}

// GET /api/skins
router.get('/skins', (req, res) => {
  const skins = cache.get('skins') || [];
  let result = [...skins];

  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    result = result.filter(s => s.name.toLowerCase().includes(q));
  }
  if (req.query.wear)       result = result.filter(s => s.wear === req.query.wear);
  if (req.query.minProfit)  result = result.filter(s => s.profit   >= parseFloat(req.query.minProfit));
  if (req.query.minPrice)   result = result.filter(s => s.minPrice >= parseFloat(req.query.minPrice));
  if (req.query.maxPrice)   result = result.filter(s => s.maxPrice <= parseFloat(req.query.maxPrice));
  if (req.query.onlyUp === '1') result = result.filter(s => s.change24 > 0);

  // Фильтр: показывать только скины где есть цены на ВСЕХ выбранных площадках
  if (req.query.sources) {
    const requiredSources = req.query.sources.split(',').map(s => s.trim()).filter(Boolean);
    if (requiredSources.length) {
      result = result.filter(skin =>
        requiredSources.every(src => skin.prices?.[src] != null)
      );
    }
  }

  const sortField = req.query.sort || 'profit';
  const sortDir   = req.query.dir  === 'asc' ? 1 : -1;
  const sortFns   = {
    profit:   s => s.profit,
    minPrice: s => s.minPrice,
    maxPrice: s => s.maxPrice,
    change24: s => s.change24,
  };
  const sortFn = sortFns[sortField] || sortFns.profit;
  result.sort((a, b) => (sortFn(b) - sortFn(a)) * sortDir);

  const page    = parseInt(req.query.page  || 1);
  const perPage = parseInt(req.query.limit || 50);
  const total   = result.length;
  const paged   = result.slice((page - 1) * perPage, page * perPage);

  res.json({
    total, page, perPage,
    pages: Math.ceil(total / perPage),
    lastUpdate: cache.get('lastUpdate'),
    items: paged,
  });
});

// GET /api/skins/:name
router.get('/skin', (req, res) => {
  const skins = cache.get('skins') || [];
  const name  = req.query.name;
  if (!name) return res.status(400).json({ error: 'name обязателен' });
  const skin = skins.find(s => s.name === name);
  if (!skin) return res.status(404).json({ error: 'Не найдено' });
  res.json(skin);
});

// GET /api/history?name=... — история цен из PostgreSQL
router.get('/history', async (req, res) => {
  if (!db) return res.json({ rows: [], note: 'PostgreSQL не подключён' });
  const name = req.query.name;
  const days = parseInt(req.query.days || 30);
  if (!name) return res.status(400).json({ error: 'name обязателен' });
  const rows = await db.getPriceHistory(name, days);
  res.json({ rows });
});

// GET /api/stats
router.get('/stats', (req, res) => {
  const skins = cache.get('skins') || [];
  const rising  = skins.filter(s => s.change24 > 0).length;
  const falling = skins.filter(s => s.change24 < 0).length;
  const avgProfit = skins.length
    ? +(skins.reduce((a, s) => a + s.profit, 0) / skins.length).toFixed(1)
    : 0;
  const topArb = skins.filter(s => s.profit >= 10).length;

  // Считаем сколько скинов есть на каждой площадке
  const sourceCounts = {};
  for (const skin of skins) {
    for (const [src, price] of Object.entries(skin.prices || {})) {
      if (price) sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
  }

  res.json({
    total: skins.length, rising, falling,
    unchanged: skins.length - rising - falling,
    avgProfit, topArb, sourceCounts,
    lastUpdate: cache.get('lastUpdate'),
    proxies: proxy.info(),
    dbConnected: !!db,
  });
});

// GET /api/status
router.get('/status', (_req, res) => res.json({ ok: true, ts: Date.now() }));

module.exports = router;
