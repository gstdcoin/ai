# 🔧 Стабилизация платформы GSTD

## Проблемы, которые были исправлены

### 1. ❌ База данных: Разрыв между паролем в docker-compose.yml и фактическим паролем в томе БД
**Решение:**
- Создан скрипт `redeploy.sh`, который синхронизирует пароли
- Добавлены health checks для правильного порядка запуска
- Использованы `depends_on` с условиями `service_healthy`

### 2. ❌ Nginx: Ошибка "host not found in upstream" при старте
**Решение:**
- Использован `resolver 127.0.0.11` для динамического DNS резолвинга
- Применены переменные `$frontend_upstream` и `$backend_upstream` в `proxy_pass`
- Nginx теперь резолвит имена контейнеров в момент запроса, а не при старте

### 3. ✅ Сохранены все настройки TON
- `TON_API_KEY` сохранен
- `TON_CONTRACT_ADDRESS` сохранен
- `GSTD_JETTON_ADDRESS` сохранен
- `ADMIN_WALLET` сохранен

## Изменения в файлах

### 1. `docker-compose.yml`

#### Добавлена единая сеть:
```yaml
networks:
  gstd-network:
    driver: bridge
    name: gstd-network
```

#### Все сервисы подключены к сети:
```yaml
services:
  postgres:
    networks:
      - gstd-network
  # ... и так далее для всех сервисов
```

#### PostgreSQL порт закрыт от внешнего доступа:
```yaml
ports:
  - "127.0.0.1:5432:5432"  # Only accessible from localhost
```

#### Синхронизированы пароли:
```yaml
postgres:
  environment:
    - POSTGRES_USER=postgres
    - POSTGRES_PASSWORD=postgres  # ← Должен совпадать с backend

backend:
  environment:
    - DB_USER=postgres              # ← Должен совпадать с postgres
    - DB_PASSWORD=postgres          # ← Должен совпадать с postgres
```

#### Добавлены health checks и зависимости:
```yaml
backend:
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/api/v1/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_started
```

### 2. `nginx/conf.d/app.gstdtoken.com.conf`

#### Добавлен resolver для динамического DNS:
```nginx
# Resolver for dynamic DNS resolution (Docker internal DNS)
resolver 127.0.0.11 valid=30s ipv6=off;
resolver_timeout 5s;
```

#### Использованы переменные в proxy_pass:
```nginx
location / {
    set $frontend_upstream http://frontend:3000;
    proxy_pass $frontend_upstream;
    # ...
}

location /api/ {
    set $backend_upstream http://backend:8080;
    proxy_pass $backend_upstream/api/;
    # ...
}
```

#### Добавлен health endpoint:
```nginx
location /api/v1/health {
    set $backend_upstream http://backend:8080;
    proxy_pass $backend_upstream/api/v1/health;
    proxy_set_header Host $host;
    access_log off;
}
```

### 3. `scripts/redeploy.sh`

Скрипт выполняет:
1. ✅ Экспорт паролей из docker-compose.yml
2. ✅ Остановку всех контейнеров
3. ✅ Синхронизацию паролей БД (проверка/сброс)
4. ✅ Запуск сервисов в правильном порядке:
   - PostgreSQL → ждет health
   - Redis → старт
   - Backend → ждет health
   - Frontend → старт
   - Nginx → старт
5. ✅ Проверку всех сервисов
6. ✅ Финальную проверку health endpoint

## Как использовать

### Полный перезапуск платформы:
```bash
cd /home/ubuntu
./scripts/redeploy.sh
```

### Обычный перезапуск (без синхронизации паролей):
```bash
cd /home/ubuntu
docker-compose down
docker-compose up -d
```

## Проверка работоспособности

После запуска проверьте:

1. **Все контейнеры запущены:**
   ```bash
   docker-compose ps
   ```

2. **Backend health endpoint:**
   ```bash
   curl http://localhost:8080/api/v1/health
   ```

3. **Nginx конфигурация:**
   ```bash
   docker exec ubuntu_nginx_1 nginx -t
   ```

4. **База данных доступна:**
   ```bash
   docker exec ubuntu_postgres_1 psql -U postgres -d distributed_computing -c "SELECT 1;"
   ```

5. **Внешний доступ:**
   ```bash
   curl https://app.gstdtoken.com/api/v1/health
   ```

## Почему это работает?

### Связь БД и Backend:
- При смене пароля в docker-compose.yml, PostgreSQL внутри контейнера не меняет пароль автоматически (он задается только при первом запуске)
- Скрипт `redeploy.sh` проверяет и синхронизирует пароли перед запуском
- Health checks гарантируют, что backend запустится только после готовности БД

### Запуск Nginx:
- Ошибка "host not found" возникает, когда Nginx пытается резолвить имена контейнеров при старте
- Использование `resolver 127.0.0.11` и переменных в `proxy_pass` заставляет Nginx искать IP адреса в момент запроса, а не при старте
- Это позволяет Nginx запускаться даже если frontend/backend еще не готовы

## Сохраненные настройки

Все настройки TON и CI/CD остались нетронутыми:
- ✅ `TON_API_KEY=6512ff28fd1ffc8e29b7230642e690b410f7c68e15ef74c4e81e17e9f7a65de6`
- ✅ `TON_CONTRACT_ADDRESS=EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi`
- ✅ `GSTD_JETTON_ADDRESS=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO`
- ✅ `ADMIN_WALLET=UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED`
- ✅ Все CI/CD настройки сохранены

---

**Дата:** 11 января 2026  
**Статус:** ✅ Готово к использованию
