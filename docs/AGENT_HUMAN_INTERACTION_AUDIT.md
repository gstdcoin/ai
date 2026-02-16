# Agent–Human Interaction Audit

**Дата:** 16 февраля 2026  
**Цель:** Выявить потенциальные проблемы при взаимодействии агентов и людей с платформой GSTD

---

## 1. Точки взаимодействия

| Канал | Агенты | Люди | Потенциальные проблемы |
|-------|--------|------|------------------------|
| **Chat / Inference** | API key, MCP | TonConnect, сессия | Разные auth-модели; агент без кошелька не может использовать Ultra |
| **Task Claim/Complete** | API key + wallet | TonConnect, WebSocket | Device ID: `swarm-*` vs `browser-*` vs `tg-*` — возможны коллизии |
| **Device Registration** | `POST /nodes/register` | `POST /devices/register`, `POST /nodes/register` | Два разных эндпоинта; nodes требует PoW, devices — нет |
| **Session** | Нет сессии (API key) | Redis session, X-Session-Token | Агенты не получают session_token при «логине» |
| **Referral** | `ref_` в env | URL start param, ref в URL | Разные способы применения кода |

---

## 2. Выявленные проблемы

### 2.1 Разные пути регистрации

- **Nodes** (`/nodes/register`): для агентов и «внешних» нод. Создаёт node с `device_id`, `wallet_address`, `device_type`.
- **Devices** (`/devices/register`): для браузерных воркеров. Требует PoW nonce, CPU/RAM.
- **Telegram** (`/telegram/bot/link`): привязка `tg-{id}` к кошельку.

**Риск:** Один кошелёк может быть привязан к нескольким device_id с разными типами. При расчёте выплат и приоритетов возможна путаница.

### 2.2 Device ID коллизии

- Browser: `browser-{random}`
- Swarm: `swarm-{hostname}-{uuid8}`
- Telegram: `tg-{telegram_id}`

**Риск:** Низкий — форматы разные. Но `browser-*` меняется при очистке localStorage.

### 2.3 Session vs API Key

- Люди: логин через TonConnect → session_token → X-Session-Token.
- Агенты: GSTD_API_KEY в заголовке.

**Риск:** Эндпоинты с `OptionalSession` могут вести себя по-разному для агентов и людей. Нужно проверять, что защищённые маршруты корректно принимают оба типа auth.

### 2.4 Chat: Ultra vs Standard

- Ultra (приоритетный): требует баланс > 500 GSTD и активную сессию.
- Агенты с API key: обычно идут через стандартный inference.

**Риск:** Агент с кошельком и балансом > 500 может не попасть в Ultra, если не использует session.

### 2.5 TonConnect обязателен для людей

- Dashboard, Chat, Mining — всё через TonConnect.
- Без кошелька человек не может использовать платформу.

**Риск:** Нет «гостевого» или read-only режима для новых пользователей.

---

## 3. Рекомендации

### 3.1 Унификация device registration

- Рассмотреть единый эндпоинт с параметром `source: agent | browser | telegram`.
- Явно документировать разницу между `/nodes/register` и `/devices/register`.

### 3.2 Session для агентов (опционально)

- Если агент передаёт wallet в API key — выдавать session-like token для Ultra.
- Или явно документировать, что Ultra только для TonConnect-пользователей.

### 3.3 Rate limits

- Отдельные лимиты для API key (агенты) и session (люди).
- Избегать блокировки по IP при росте числа агентов.

### 3.4 Логирование

- Логировать `source` (agent/browser/telegram) при каждом запросе.
- Упростит отладку и анализ инцидентов.

---

## 4. Unified Identity Protocol (внедрён)

### 4.1 Global Device Namespace

- `device_id = hash(wallet_address + platform_fingerprint)` — формат `gstd_<32 hex>`
- Устраняет коллизии, все устройства под одним кошельком видны пользователю
- `services.GenerateDeviceID`, `NormalizeDeviceID`, `PlatformFingerprintFromMetadata`

### 4.2 Hybrid Auth Layer

- Middleware объединяет Session (браузер) и API Key (агенты)
- Общий `UserContext` с `wallet_address`, `auth_source`, Ultra-проверка в handler
- Chat (`/api/v1/chat/completions`, `/v1/chat/completions`) — Ultra доступен агентам с API key

### 4.3 Unified Registry

- `POST /api/v1/registry/join` — единый эндпоинт для nodes и devices
- Автоопределение типа по метаданным: `source`, `device_type`, `specs.type`
- Поддержка `platform_fingerprint` для генерации device_id

---

## 5. Windows / Linux Desktop — участие в сети

| Платформа | Решение | Статус |
|-----------|---------|--------|
| **Linux** | A2A/swarm (Python) | ✅ `run_swarm.sh` |
| **Windows** | A2A/swarm (Python) | ✅ `run_swarm.bat` |
| **macOS** | A2A/swarm (Python) | ✅ `run_swarm.sh` |
| **Web (любая ОС)** | Dashboard + Ignite Miner | ✅ Браузерный воркер |

**Desktop-клиент (Python):**

- Регистрируется как нода с `device_type: desktop`
- Heartbeat каждые 25 сек
- Получает задачи через REST, опционально WebSocket для Fleet Commands
- Кроссплатформенный (Windows, Linux, macOS)

См. `A2A/swarm/README.md` и `run_swarm.bat` (Windows), `run_swarm.sh` (Linux/macOS).
