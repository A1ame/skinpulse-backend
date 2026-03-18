// cache.js
// Простой in-memory кэш — всё хранится в оперативной памяти
// (достаточно для локального запуска; для production нужен Redis)

const store = new Map();

function set(key, value) {
  store.set(key, { value, ts: Date.now() });
}

function get(key, maxAgeMs = Infinity) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.value;
}

function has(key) {
  return store.has(key);
}

function del(key) {
  store.delete(key);
}

function all() {
  const result = {};
  for (const [k, v] of store) result[k] = v.value;
  return result;
}

module.exports = { set, get, has, del, all };
