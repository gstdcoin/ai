# GSTD Frontend — Deploy на Vercel

Инструкция по развёртыванию фронтенда на Vercel для проверки взаимодействия с API.

---

## 1. Подключение репозитория

1. Откройте [vercel.com](https://vercel.com) и войдите (GitHub)
2. **Add New** → **Project**
3. Импортируйте `gstdcoin/ai`
4. **Root Directory:** `frontend` (важно — монорепо)
5. **Framework Preset:** Next.js (авто)

---

## 2. Environment Variables

В настройках проекта добавьте:

| Variable | Value | Описание |
|----------|-------|----------|
| `NEXT_PUBLIC_API_URL` | `https://app.gstdtoken.com` | API (default, CORS разрешает *.vercel.app) |
| `NEXT_PUBLIC_GSTD_VERCEL_RELAY_WALLET` | `EQ...` | Кошелёк для Vercel-ноды в рое (опционально) |
| `NEXT_PUBLIC_WS_URL` | `wss://app.gstdtoken.com/ws` | WebSocket |
| `GSTD_JETTON_ADDRESS` | Адрес контракта GSTD | Для TonConnect |
| `TON_NETWORK` | `mainnet` | Сеть TON |

**Vercel Swarm Node:** При открытии страницы на `*.vercel.app` компонент `VercelSwarmHeartbeat` вызывает A2A handshake каждые 20 сек. Нода появляется в рое (Dashboard → Devices). Без `NEXT_PUBLIC_GSTD_VERCEL_RELAY_WALLET` используется zero-address.

---

## 3. Build Settings

- **Build Command:** `npm run build`
- **Install Command:** `npm install --legacy-peer-deps`
- **Output Directory:** `.next`

---

## 4. Деплой

После подключения репо каждый push в `main` будет триггерить деплой.

**Preview:** каждая ветка/PR получает свой URL (`xxx-git-branch-org.vercel.app`).

---

## 5. Проверка взаимодействия

После деплоя проверьте:

1. **Главная** — `/` загружается, stats с API
2. **Dashboard** — `/dashboard`, подключение кошелька
3. **API proxy** — запросы к `/api/v1/health`, `/api/v1/market/price` возвращают данные
4. **Chat** — отправка сообщений (Free Tier при balance < 0.01)
5. **Buy GSTD** — карточка с ценой и ссылками

---

## 6. Что может не хватать

| Область | Проверить |
|---------|-----------|
| CORS | Backend уже разрешает `*.vercel.app` |
| API URL | Для rewrites: `NEXT_PUBLIC_API_URL` = URL Vercel (чтобы /api проксировался). Иначе — `app.gstdtoken.com` (прямые вызовы) |
| WebSocket | `wss://app.gstdtoken.com/ws` — для real-time |
| TonConnect | Добавить Vercel домен в tonconnect-manifest.json `url` |
| CSP | Content-Security-Policy для Vercel домена |

## 7. Preview URL (текущий деплой)

- **Production:** https://frontend-alpha-sable-5z72k3f2so.vercel.app
- API: frontend вызывает `app.gstdtoken.com` (default). Rewrite `/api/*` → `app.gstdtoken.com` при `NEXT_PUBLIC_API_URL` = Vercel URL.

---

## 8. Custom Domain (опционально)

Для `app.gstdtoken.com`:
- Vercel → Settings → Domains → Add `app.gstdtoken.com`
- Настроить DNS (A/CNAME по инструкции Vercel)
