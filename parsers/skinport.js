// parsers/skinport.js
const axios = require('axios');

const BASE = 'https://api.skinport.com/v1';

async function fetchPrices(appId = 730, currency = 'USD', attempt = 1) {
  try {
    const { data } = await axios.get(`${BASE}/items`, {
      params: { app_id: appId, currency },
      timeout: 30000,
      headers: {
        // 406 = сервер не принимает формат — указываем явно что принимаем JSON и любой encoding
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': attempt === 1
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
      },
    });

    if (!Array.isArray(data)) {
      console.error('[Skinport] Неожиданный ответ:', typeof data);
      return [];
    }

    const result = data
      .map(item => ({
        name: item.market_hash_name,
        price: typeof item.min_price === 'number' ? +(item.min_price / 100).toFixed(4) : null,
        source: 'skinport',
      }))
      .filter(i => i.name && i.price !== null && i.price > 0);

    console.log(`[Skinport] Получено ${result.length} предметов`);
    return result;

  } catch (err) {
    const status = err.response?.status;
    // Retry при 403, 406, 429
    if ((status === 403 || status === 406 || status === 429) && attempt < 3) {
      const delay = attempt * 5000;
      console.warn(`[Skinport] ${status} — retry ${attempt}/3 через ${delay/1000}с`);
      await new Promise(r => setTimeout(r, delay));
      return fetchPrices(appId, currency, attempt + 1);
    }
    console.error('[Skinport] Ошибка:', status || err.message);
    return [];
  }
}

module.exports = { fetchPrices };
