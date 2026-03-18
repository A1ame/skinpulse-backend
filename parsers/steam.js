// parsers/steam.js
const axios = require('axios');

const SEARCH_URL = 'https://steamcommunity.com/market/search/render/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(start = 0, count = 100, appId = 730, attempt = 1) {
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
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamcommunity.com/market/search?appid=' + appId,
      },
    });

    if (!data?.success) {
      // Steam иногда возвращает успех=false при rate limit
      if (attempt < 3) {
        console.warn(`[Steam] success=false на start=${start}, retry ${attempt}/3...`);
        await sleep(attempt * 3000);
        return fetchPage(start, count, appId, attempt + 1);
      }
      return [];
    }

    const total = data.total_count || 0;
    if (start === 0) console.log(`[Steam] Всего предметов на маркете: ${total}`);

    return (data.results || []).map(item => ({
      name:   item.hash_name,
      price:  item.sell_price / 100,
      volume: item.sell_listings || 0,
      source: 'steam',
    })).filter(i => i.name && i.price > 0);

  } catch (err) {
    const status = err.response?.status;
    if (status === 429 || status === 503) {
      const delay = attempt * 8000;
      console.warn(`[Steam] Rate limit (${status}), пауза ${delay/1000}с...`);
      await sleep(delay);
      if (attempt < 3) return fetchPage(start, count, appId, attempt + 1);
    } else {
      console.error(`[Steam] Ошибка (start=${start}):`, status || err.message);
    }
    return [];
  }
}

// Загружаем топ-N предметов батчами
async function fetchPrices(appId = 730, totalItems = 1000) {
  const all   = [];
  const batch = 100;
  const pages = Math.ceil(totalItems / batch);

  for (let i = 0; i < pages; i++) {
    const items = await fetchPage(i * batch, batch, appId);
    all.push(...items);

    if (items.length < batch) {
      console.log(`[Steam] Конец списка на странице ${i + 1}`);
      break;
    }

    // Пауза между батчами — Steam строго следит за rate limit
    if (i < pages - 1) await sleep(3000);
  }

  console.log(`[Steam] Итого получено: ${all.length} предметов`);
  return all;
}

async function fetchItemPrice(marketHashName, currency = 1, appId = 730) {
  try {
    const { data } = await axios.get('https://steamcommunity.com/market/priceoverview/', {
      params: { appid: appId, currency, market_hash_name: marketHashName },
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0' },
    });
    if (!data.success) return null;
    const price = parseFloat((data.lowest_price || data.median_price || '0').replace(/[^0-9.]/g, ''));
    return { name: marketHashName, price, volume: parseInt((data.volume || '0').replace(/,/g, ''), 10), source: 'steam' };
  } catch (err) {
    if (err.response?.status === 429) await sleep(5000);
    return null;
  }
}

module.exports = { fetchPrices, fetchItemPrice, sleep };
