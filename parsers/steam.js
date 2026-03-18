// parsers/steam.js
// Steam Market — поиск предметов (НЕ priceoverview — он rate-limit 1/sec)
// search/render возвращает до 100 предметов за раз и не банит так агрессивно
const axios = require('axios');

const SEARCH_URL = 'https://steamcommunity.com/market/search/render/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(start = 0, count = 100, appId = 730) {
  try {
    const { data } = await axios.get(SEARCH_URL, {
      params: {
        appid: appId,
        start, count,
        search_descriptions: 0,
        sort_column: 'popular',
        sort_dir: 'desc',
        norender: 1,
      },
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamcommunity.com/market/',
      },
    });

    if (!data?.success) return [];

    return (data.results || []).map(item => ({
      name:   item.hash_name,
      price:  item.sell_price / 100,
      volume: item.sell_listings || 0,
      source: 'steam',
    })).filter(i => i.name && i.price > 0);

  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[Steam] Rate limit — пауза 10с');
      await sleep(10000);
    } else {
      console.error('[Steam] Ошибка (start=' + start + '):', err.response?.status || err.message);
    }
    return [];
  }
}

// Загружает топ-N предметов по популярности (не делает 1 запрос на предмет!)
async function fetchPrices(appId = 730, totalItems = 500) {
  const all = [];
  const batchSize = 100;
  const batches   = Math.ceil(totalItems / batchSize);

  for (let i = 0; i < batches; i++) {
    const items = await fetchPage(i * batchSize, batchSize, appId);
    all.push(...items);
    if (items.length < batchSize) break;
    if (i < batches - 1) await sleep(2000); // пауза между батчами
  }

  console.log(`[Steam] Получено ${all.length} предметов`);
  return all;
}

// Одиночный запрос цены — использовать РЕДКО (rate limit 1/сек)
async function fetchItemPrice(marketHashName, currency = 1, appId = 730) {
  try {
    const { data } = await axios.get('https://steamcommunity.com/market/priceoverview/', {
      params: { appid: appId, currency, market_hash_name: marketHashName },
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0' },
    });
    if (!data.success) return null;
    const price = parseFloat((data.lowest_price || data.median_price || '0').replace(/[^0-9.]/g, ''));
    return { name: marketHashName, price, volume: parseInt((data.volume||'0').replace(/,/g,''),10), source: 'steam' };
  } catch (err) {
    if (err.response?.status === 429) await sleep(5000);
    return null;
  }
}

module.exports = { fetchPrices, fetchItemPrice, sleep };
