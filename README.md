# SkinPulse Backend v2.1

CS2 парсер цен — Node.js + PostgreSQL + WebSocket

---

## 🚀 Деплой на Railway (бесплатно, 5 минут)

Railway — лучший вариант для этого проекта: поддерживает WebSocket, PostgreSQL, Node.js.
Бесплатный план: $5 кредитов в месяц (хватает на ~500 часов работы).

### Шаг 1 — Загрузи проект на GitHub

```bash
# В папке skinpulse-backend:
git init
git add .
git commit -m "Initial commit"

# Создай репозиторий на github.com, потом:
git remote add origin https://github.com/ТВО_ИМЯ/skinpulse.git
git push -u origin main
```

### Шаг 2 — Создай проект на Railway

1. Зайди на **railway.app** → Sign up (через GitHub)
2. **New Project** → **Deploy from GitHub repo**
3. Выбери репозиторий `skinpulse`
4. Railway автоматически найдёт `package.json` и запустит `npm start`

### Шаг 3 — Добавь PostgreSQL

1. В проекте на Railway нажми **+ New** → **Database** → **Add PostgreSQL**
2. Кликни на PostgreSQL → вкладка **Variables**
3. Скопируй `DATABASE_URL` — Railway автоматически прокинет его в твой сервис

### Шаг 4 — Получи URL сайта

1. Кликни на свой сервис → вкладка **Settings**
2. **Domains** → **Generate Domain**
3. Получишь URL вида `skinpulse-production.up.railway.app`

**Всё! Сайт работает, данные собираются, история пишется в PostgreSQL.**

---

## 💻 Локальный запуск

```bash
npm install
npm start
# Открой http://localhost:3000
```

Для истории цен нужен PostgreSQL локально:
```bash
# macOS
brew install postgresql && brew services start postgresql
createdb skinpulse

# Ubuntu
sudo apt install postgresql
sudo -u postgres createdb skinpulse
```

---

## 📁 Структура

```
skinpulse-backend/
├── server.js          ← Точка входа
├── aggregator.js      ← Сборщик данных со всех площадок
├── cache.js           ← In-memory кэш
├── db.js              ← PostgreSQL (история цен)
├── routes.js          ← REST API /api/*
├── proxy.js           ← Менеджер прокси
├── proxy-list.txt     ← Список прокси (НЕ в git)
├── parsers/
│   ├── steam.js       ← Steam Market (bulk search)
│   ├── waxpeer.js     ← Waxpeer API
│   ├── dmarket.js     ← DMarket API
│   ├── skinport.js    ← Skinport API
│   ├── buff163.js     ← Buff163 (нужны прокси)
│   └── csmoney.js     ← CS.Money (нужны прокси)
└── public/
    └── index.html     ← Фронтенд
```

---

## 🔌 REST API

| URL | Описание |
|-----|----------|
| `GET /api/skins` | Список с фильтрами |
| `GET /api/history?name=...&days=30` | История цен из БД |
| `GET /api/stats` | Статистика |
| `GET /health` | Health check |

### Параметры `/api/skins`
`q`, `wear`, `minProfit`, `minPrice`, `maxPrice`, `sources`, `sort`, `dir`, `page`, `limit`

---

## 🌐 Площадки

| Площадка | Статус | Прокси |
|----------|--------|--------|
| Waxpeer | ✅ Работает | Не нужны |
| DMarket | ✅ Работает | Не нужны |
| Skinport | ✅ Работает | Не нужны |
| Steam | ✅ Работает | Не нужны |
| Buff163 | ⚠️ Нужны прокси | CN/HK прокси |
| CS.Money | ⚠️ Нужны прокси | Любые |

### Добавление прокси (для Buff163/CS.Money)
Создай `proxy-list.txt` рядом с `server.js`:
```
http://user:pass@1.2.3.4:8080
socks5://user:pass@5.6.7.8:1080
```

На Railway — добавь переменную `PROXY_LIST` со строками через `\n`,
либо используй внешний прокси-провайдер с API.

---

## 📊 История цен

После первого запуска данные начнут накапливаться автоматически:
- Снапшот каждые **2 минуты**
- `change24h` пересчитывается каждые **15 минут**
- Данные хранятся **30 дней**
- Графики появятся через **~2 часа** работы сервера
