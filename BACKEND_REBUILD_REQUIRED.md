# ⚠️ Backend Rebuild Required

**Проблема:** Backend использует старый скомпилированный бинарник, который содержит устаревшие SQL запросы.

**Ошибки:**
- `pq: column "wallet_address" does not exist` - код уже исправлен, но бинарник старый
- `pq: column "reward_amount_ton" does not exist` - код уже исправлен, но бинарник старый

**Решение:** Пересобрать backend образ:

```bash
cd /home/ubuntu
docker compose build backend
docker compose up -d backend
```

**Или пересоздать контейнер:**
```bash
docker compose down backend
docker compose build backend
docker compose up -d backend
```

**Изменения уже в Git:**
- ✅ `backend/internal/services/user_service.go` - исправлены запросы (address вместо wallet_address)
- ✅ `backend/internal/services/stats_service.go` - исправлен запрос (labor_compensation_ton вместо reward_amount_ton)
- ✅ `docker-compose.yml` - исправлены переменные окружения (DB_NAME=distributed_computing, DB_SSLMODE=disable)

**Коммиты:**
- `8d0353b` - fix: Update database queries to match actual schema
- `0b409f3` - fix: Use DB_HOST instead of POSTGRES_HOST for database connection
