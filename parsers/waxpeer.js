// parsers/waxpeer.js
// Waxpeer public API — не требует ключа для чтения цен
const axios = require('axios');

const BASE = 'https://api.waxpeer.com/v1';

async function fetchPrices(game = 'csgo', skip = 0, limit = 100) {
  try {
    const { data } = await axios.get(`${BASE}/prices`, {
      params: { game, skip, limit },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!data.success || !Array.isArray(data.items)) return [];

    return data.items.map(item => ({
      name: item.name,
      // Waxpeer возвращает цену в тысячных долях $ (1000 = $1.00)
      price: typeof item.min === 'number' ? item.min / 1000 : null,
      source: 'waxpeer',
    })).filter(i => i.price !== null && i.price > 0);

  } catch (err) {
    console.error('[Waxpeer] Ошибка:', err.response?.status || err.message);
    return [];
  }
}

module.exports = { fetchPrices };
