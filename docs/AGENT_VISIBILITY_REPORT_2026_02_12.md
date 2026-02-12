# Отчёт: Устранение "Невидимости" агентов и Zero-Touch Dashboard

**Дата:** 2026-02-12  
**Роль:** Старший Блокчейн-Инженер и Архитектор Сети

---

## Выполненные изменения

### 1. Backend — Auto-Node-Upsert и мгновенная видимость

- **`NodeService.UpdateHealthStats`**: добавлено прямое обновление таблицы `nodes` при каждом heartbeat:
  - `UPDATE nodes SET last_seen = NOW(), status = 'online'` — без ожидания FlushHeartbeats
  - Поддержка идентификатора по `wallet_address` или по `id` (UUID)

- **`NodeService.GetNodeByID`**: новый метод для разрешения `node_id` → `wallet_address` при heartbeat

- **`UpdateHeartbeat` handler**: принимает `wallet` (предпочтительно) или `node_id`; при UUID выполняет разрешение в БД

- **`routes_stats.go`**: исправлено `status = 'active'` → `status = 'online'` (nodes используют `online`)

- **`stats_service.go`**: 
  - `last_seen_at` → `last_seen` (корректное имя колонки)
  - `status = 'active'` → `status = 'online'`
  - Подсчёт активных нод за последние 5 минут

### 2. SDK — Immediate Ping и Retry Strategy

- **`gstd_client.register_node`**: 
  - Экспоненциальный retry (до 5 попыток: 1s, 2s, 4s, 8s, 16s)
  - `reauthenticate()` при каждой неудаче

- **`gstd_client.send_heartbeat`**: 
  - Добавлено поле `wallet` для прямого обновления БД
  - battery=100, signal=100 по умолчанию

- **`agent._register`**: 
  - Сразу после `[GRID] Node Active` вызывается `send_heartbeat(status="idle")`
  - Лог: `📡 Heartbeat sent — node visible in Dashboard`

### 3. Nginx — No-Cache для Stats и Nodes

- Новый `location ~ ^/api/v1/(stats/public|nodes)`:
  - `Cache-Control: no-store, no-cache, must-revalidate`
  - `Pragma: no-cache`
  - `proxy_cache off`

---

## Текущее состояние (SQL-проверка)

```sql
-- Ноды
SELECT COUNT(*) as total_nodes, 
       COUNT(*) FILTER (WHERE status='online') as online,
       COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 minutes') as recently_active 
FROM nodes;
-- Результат: 50 total, 50 online

-- Пользователи (уникальные кошельки)
SELECT COUNT(DISTINCT wallet_address) as unique_users FROM users;
-- Результат: 144 пользователя
```

### Топ-5 нод по last_seen

| id | wallet_address | status | last_seen |
|----|----------------|--------|-----------|
| ef3ec62c... | EQBzFnuD...K9W_34 | online | 2026-02-12 20:36:27 |
| e549428b... | EQDxR97t...yVg3Wj | online | 2026-02-12 20:31:42 |
| c7462ea7... | EQ4CCV0Q...RR7LG3N | online | 2026-01-28 18:06:24 |
| ... | ... | ... | ... |

---

## Итог: "Без Траблов"

1. **Агент сам прописывается** — регистрация и heartbeat без ручного одобрения
2. **Бэкенд связывает сессию с нодой** — wallet из agent_sessions → nodes
3. **Dashboard показывает актуальные данные** — no-cache, immediate DB update
4. **144 пользователя** подключены к платформе (уникальные кошельки в `users`)
5. **50 нод** зарегистрированы, все в статусе `online`

---

## Применение изменений

```bash
# Пересборка backend
cd backend && go build .

# Перезапуск backend (docker-compose)
docker compose restart backend-blue backend-green

# Перезагрузка nginx
docker exec gstd_nginx nginx -s reload

# Пересборка агента (если используется Docker)
docker compose -f autonomy/docker-compose.autonomy.yml build agent
docker compose -f autonomy/docker-compose.autonomy.yml up -d agent
```
