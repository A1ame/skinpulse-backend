// parsers/csmoney.js
// CS.Money — популярный трейд-маркетплейс
// Требует прокси т.к. агрессивно блокирует парсеры

const axios = require('axios');
const proxy = require('../proxy');

const BASE = 'https://cs.money/api/trade/sell-orders';

async function fetchPrices(appId = 730, skip = 0, limit = 60) {
  const proxyInfo = proxy.nextAgent();

  try {
    const axiosConfig = {
      params: {
        appId,
        skip,
        limit,
        sort: 'price',
        order: 'asc',
        isVirtual: false,
        botInventory: true,
      },
      timeout: 12000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://cs.money',
        'Referer': 'https://cs.money/csgo/trade/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    };

    if (proxyInfo) {
      axiosConfig.httpsAgent = proxyInfo.agent;
      axiosConfig.proxy = false;
    }

    const { data } = await axios.get(BASE, axiosConfig);

    // CS.Money возвращает массив предметов
    const items = Array.isArray(data) ? data : (data.items || data.data || []);

    return items.map(item => {
      const name = item.fullName || item.marketHashName || item.name;
      // CS.Money возвращает цену в USD
      const price = parseFloat(item.price || item.sellingPrice || 0);
      return { name, price, source: 'csmoney' };
    }).filter(i => i.name && i.price > 0);

  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 429 || status === 503) {
      console.error(`[CS.Money] Заблокирован (${status})`);
      if (proxyInfo) proxy.markBad(proxyInfo.url);
    } else {
      console.error('[CS.Money] Ошибка:', err.message);
    }
    return [];
  }
}

async function fetchAllPages(appId = 730, maxPages = 5) {
  const results = [];
  for (let page = 0; page < maxPages; page++) {
    const items = await fetchPrices(appId, page * 60);
    results.push(...items);
    if (items.length < 60) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

module.exports = { fetchPrices, fetchAllPages };
