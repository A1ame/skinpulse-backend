// parsers/buff163.js
// Buff163 — крупнейший китайский маркетплейс, цены ниже чем везде
//
// ТРЕБОВАНИЯ:
//   1. Прокси (желательно китайские или гонконгские IP)
//   2. Файл proxy-list.txt с прокси
//
// API Buff163 публичное, но требует обхода через прокси т.к. блокирует не-CN IP

const axios  = require('axios');
const proxy  = require('../proxy');

const BASE = 'https://buff.163.com/api/market/goods';

// Маппинг game → game_id в Buff163
const GAME_IDS = {
  csgo: 'csgo',
  dota2: 'dota2',
};

async function fetchPrices(game = 'csgo', page = 1, pageSize = 80) {
  const proxyInfo = proxy.nextAgent();

  if (!proxyInfo) {
    // Без прокси пробуем прямой запрос (работает редко)
    console.warn('[Buff163] Нет прокси — пробуем без прокси (может не работать)');
  }

  try {
    const axiosConfig = {
      params: {
        game,
        page_num: page,
        page_size: pageSize,
        sort_by: 'price.asc',
        currency: 'USD',
        _: Date.now(),
      },
      timeout: 15000,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://buff.163.com/market/',
        'X-Requested-With': 'XMLHttpRequest',
      },
    };

    if (proxyInfo) {
      axiosConfig.httpsAgent = proxyInfo.agent;
      axiosConfig.proxy = false; // отключаем системный прокси
    }

    const { data } = await axios.get(BASE, axiosConfig);

    if (data.code !== 'OK' || !data.data?.items) {
      console.error('[Buff163] Ответ не OK:', data.code, data.error);
      return [];
    }

    return data.data.items.map(item => ({
      name: item.market_hash_name || item.name,
      // Buff163 показывает цену в CNY, конвертируем в USD (примерный курс)
      price: item.sell_min_price
        ? parseFloat(item.sell_min_price) * 0.14  // 1 CNY ≈ 0.14 USD
        : null,
      priceCNY: item.sell_min_price ? parseFloat(item.sell_min_price) : null,
      source: 'buff163',
    })).filter(i => i.price !== null && i.price > 0);

  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 429) {
      console.error(`[Buff163] Заблокирован (${status}) — попробуй другой прокси`);
      if (proxyInfo) proxy.markBad(proxyInfo.url);
    } else {
      console.error('[Buff163] Ошибка:', err.message);
    }
    return [];
  }
}

// Загрузить несколько страниц
async function fetchAllPages(game = 'csgo', maxPages = 5) {
  const results = [];
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPrices(game, page);
    results.push(...items);
    if (items.length < 80) break; // последняя страница
    await new Promise(r => setTimeout(r, 1500)); // пауза между страницами
  }
  return results;
}

module.exports = { fetchPrices, fetchAllPages };
