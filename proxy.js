// proxy.js — менеджер прокси для площадок с защитой (Buff163, CS.Money)
//
// Формат прокси в proxy-list.txt (один на строку):
//   http://user:pass@1.2.3.4:8080
//   socks5://user:pass@5.6.7.8:1080
//   http://1.2.3.4:3128           (без авторизации)
//
// Бесплатные прокси (нестабильны): https://free-proxy-list.net/
// Платные (рекомендуется): webshare.io, proxyscrape.com, smartproxy.com

const fs   = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXY_FILE = path.join(__dirname, 'proxy-list.txt');

let proxies  = [];
let current  = 0;
let lastLoad = 0;

// Загружаем список прокси из файла
function loadProxies() {
  if (!fs.existsSync(PROXY_FILE)) {
    console.warn('[Proxy] proxy-list.txt не найден — Buff163/CS.Money работать не будут');
    console.warn('[Proxy] Создай файл proxy-list.txt рядом с server.js, по одному прокси на строку');
    proxies = [];
    return;
  }

  const lines = fs.readFileSync(PROXY_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  proxies = lines;
  lastLoad = Date.now();
  console.log(`[Proxy] Загружено ${proxies.length} прокси`);
}

// Получить следующий прокси по кругу (round-robin)
function next() {
  // Перезагружаем список каждые 5 минут
  if (Date.now() - lastLoad > 5 * 60 * 1000) loadProxies();

  if (!proxies.length) return null;
  const proxy = proxies[current % proxies.length];
  current++;
  return proxy;
}

// Создать axios-агент для прокси
function getAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

// Получить готовый агент для следующего прокси
function nextAgent() {
  const proxy = next();
  if (!proxy) return null;
  try {
    return { agent: getAgent(proxy), url: proxy };
  } catch (_) {
    return null;
  }
}

// Пометить прокси как сломанный (удалить из ротации на эту сессию)
function markBad(proxyUrl) {
  proxies = proxies.filter(p => p !== proxyUrl);
  console.warn(`[Proxy] Прокси удалён из ротации: ${proxyUrl} (осталось: ${proxies.length})`);
}

// Инфо
function info() {
  return { total: proxies.length, current: current % Math.max(proxies.length, 1) };
}

loadProxies();

module.exports = { next, nextAgent, markBad, info, loadProxies };
