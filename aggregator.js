// aggregator.js
const waxpeer  = require('./parsers/waxpeer');
const dmarket  = require('./parsers/dmarket');
const skinport = require('./parsers/skinport');
const steam    = require('./parsers/steam');
const buff163  = require('./parsers/buff163');
const csmoney  = require('./parsers/csmoney');
const cache    = require('./cache');

let db = null;
try { db = require('./db'); } catch (_) {}

const SOURCES = ['steam','waxpeer','dmarket','skinport','buff163','csmoney'];

async function fetchAll() {
  console.log('[Aggregator] Старт...');

  const proxyMod   = (() => { try { return require('./proxy'); } catch(_){ return null; } })();
  const hasProxies = proxyMod && proxyMod.info().total > 0;

  // Все источники параллельно
  const [steamItems, waxpeerItems, dmarketItems, skinportItems, buffItems, csmoneyItems] =
    await Promise.all([
      steam.fetchPrices(730, 500),
      waxpeer.fetchPrices(),
      dmarket.fetchPrices(),
      skinport.fetchPrices(),
      hasProxies ? buff163.fetchAllPages()  : Promise.resolve([]),
      hasProxies ? csmoney.fetchAllPages()  : Promise.resolve([]),
    ]);

  console.log(
    `[Aggregator] Steam=${steamItems.length} Waxpeer=${waxpeerItems.length}` +
    ` DMarket=${dmarketItems.length} Skinport=${skinportItems.length}` +
    ` Buff163=${buffItems.length} CS.Money=${csmoneyItems.length}`
  );

  // Склейка в map
  const map = {};
  const add = items => {
    for (const it of items) {
      if (!it.name || !(it.price > 0)) continue;
      if (!map[it.name]) map[it.name] = {};
      // Берём минимальную цену если источник уже есть (могут быть дубли)
      if (!map[it.name][it.source] || it.price < map[it.name][it.source])
        map[it.name][it.source] = it.price;
    }
  };
  add(steamItems); add(waxpeerItems); add(dmarketItems);
  add(skinportItems); add(buffItems); add(csmoneyItems);

  // Изменения цен из БД
  let changesMap = new Map();
  if (db) { try { changesMap = await db.getAllChanges(); } catch(_) {} }

  const result = Object.entries(map)
    .map(([name, prices]) => buildSkin(name, prices, changesMap))
    .filter(Boolean)
    // Сортируем по убыванию прибыли
    .sort((a, b) => b.profit - a.profit);

  console.log(`[Aggregator] Итого: ${result.length} предметов`);
  cache.set('skins', result);
  cache.set('lastUpdate', new Date().toISOString());

  if (db) db.saveSnapshot(result).catch(() => {});
  return result;
}

function buildSkin(name, prices, changesMap = new Map()) {
  const vals = Object.values(prices).filter(p => p > 0);
  if (!vals.length) return null;

  const minPrice = Math.min(...vals);
  const maxPrice = Math.max(...vals);
  const profit   = vals.length >= 2 ? +((maxPrice / minPrice - 1) * 100).toFixed(1) : 0;

  let bestBuy = null, worstBuy = null;
  for (const [src, p] of Object.entries(prices)) {
    if (!(p > 0)) continue;
    if (!bestBuy  || p < prices[bestBuy])  bestBuy  = src;
    if (!worstBuy || p > prices[worstBuy]) worstBuy = src;
  }

  const wearMatch = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
  const ch = changesMap.get(name) || { change24: 0, change7d: 0 };

  return {
    name,
    wear: wearMatch ? wearMatch[1] : 'Unknown',
    prices: {
      steam:    prices.steam    || null,
      waxpeer:  prices.waxpeer  || null,
      dmarket:  prices.dmarket  || null,
      skinport: prices.skinport || null,
      buff163:  prices.buff163  || null,
      csmoney:  prices.csmoney  || null,
    },
    minPrice, maxPrice, profit,
    bestBuy, worstBuy,
    change24: ch.change24,
    change7d:  ch.change7d,
    updatedAt: Date.now(),
  };
}

async function recomputeChanges() {
  if (!db) return;
  try {
    await db.computeChanges();
    const changesMap = await db.getAllChanges();
    const skins = cache.get('skins') || [];
    for (const s of skins) {
      const ch = changesMap.get(s.name);
      if (ch) { s.change24 = ch.change24; s.change7d = ch.change7d; }
    }
    cache.set('skins', skins);
    console.log('[Aggregator] change24h пересчитан');
  } catch (err) {
    console.error('[Aggregator] recomputeChanges:', err.message);
  }
}

module.exports = { fetchAll, recomputeChanges, SOURCES };
