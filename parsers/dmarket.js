// parsers/dmarket.js
// DMarket — используем их агрегированный price endpoint (не требует auth)
const axios = require('axios');

const PRICE_URL = 'https://api.dmarket.com/price-aggregator/v1/list-items-prices';

async function fetchPrices(gameId = 'a8db', limit = 100, offset = 0) {
  try {
    const { data } = await axios.get(PRICE_URL, {
      params: { gameId, limit, offset, currency: 'USD' },
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Origin': 'https://dmarket.com',
        'Referer': 'https://dmarket.com/',
      },
    });

    const items = data.objects || data.items || [];
    return items.map(item => {
      // price-aggregator возвращает цену в USD-cents или USD-units — проверяем оба варианта
      let price = 0;
      if (item.price?.amount)      price = parseFloat(item.price.amount) / 100;
      else if (item.price?.USD)    price = parseFloat(item.price.USD)    / 100;
      else if (item.suggestedPrice) price = parseFloat(item.suggestedPrice) / 100;
      return { name: item.title || item.marketHashName, price, source: 'dmarket' };
    }).filter(i => i.name && i.price > 0);

  } catch (err) {
    // Fallback: пробуем exchange API v2
    return fetchExchangeV2(gameId, limit, offset);
  }
}

async function fetchExchangeV2(gameId = 'a8db', limit = 100, offset = 0) {
  try {
    const { data } = await axios.get('https://api.dmarket.com/exchange/v1/market/items', {
      params: { gameId, currency: 'USD', limit, offset, orderBy: 'price', orderDir: 'asc' },
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Origin': 'https://dmarket.com',
        'Referer': 'https://dmarket.com/',
        'Connection': 'close',
      },
      // keepAlive OFF — иначе ECONNRESET на некоторых серверах
      httpAgent:  new (require('http').Agent)({ keepAlive: false }),
      httpsAgent: new (require('https').Agent)({ keepAlive: false, rejectUnauthorized: false }),
    });

    const items = data.objects || [];
    return items.map(item => ({
      name: item.title,
      price: parseFloat(item.price?.USD || 0) / 100,
      source: 'dmarket',
    })).filter(i => i.name && i.price > 0);

  } catch (err) {
    console.error('[DMarket] Обе попытки неудачны:', err.response?.status || err.message);
    return [];
  }
}

// Загружает несколько страниц
async function fetchAllPages(gameId = 'a8db', maxPages = 10) {
  const all = [];
  for (let i = 0; i < maxPages; i++) {
    const items = await fetchPrices(gameId, 100, i * 100);
    all.push(...items);
    if (items.length < 100) break;
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`[DMarket] Всего получено: ${all.length}`);
  return all;
}

module.exports = { fetchPrices: () => fetchAllPages(), fetchAllPages };
