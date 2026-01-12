# Решение проблем развёртывания

## Проблема 1: Backend не собирается - `go.sum: file does not exist`

### Симптомы
```
COPY failed: file not found in build context or excluded by .dockerignore: stat go.sum: file does not exist
ERROR: Service 'backend' failed to build
```

### Решение
Dockerfile обновлён для автоматического создания `go.sum`. Просто пересоберите:

```bash
docker-compose build --no-cache backend
docker-compose up -d
```

Если проблема остаётся:
```bash
cd backend
# Если Go установлен локально
go mod tidy
# Или просто удалите go.sum и позвольте Docker создать его
rm -f go.sum
cd ..
docker-compose build --no-cache backend
```

## Проблема 2: SSL сертификат не получается - `403 Forbidden`

### Симптомы
```
Certbot failed to authenticate some domains
Type: unauthorized
Detail: Invalid response from https://app.gstdtoken.com/.well-known/acme-challenge/...: 403
```

### Решение

1. **Проверьте DNS**:
   ```bash
   dig app.gstdtoken.com
   # Должен вернуть IP вашего сервера (82.115.48.228)
   ```

2. **Проверьте что порт 80 открыт**:
   ```bash
   sudo netstat -tlnp | grep :80
   # Или
   sudo ufw status
   ```

3. **Убедитесь что Nginx запущен**:
   ```bash
   docker-compose ps nginx
   # Должен быть "Up"
   ```

4. **Проверьте права доступа**:
   ```bash
   mkdir -p nginx/certbot
   chmod 755 nginx/certbot
   ```

5. **Попробуйте получить сертификат вручную**:
   ```bash
   # Остановите все кроме nginx
   docker-compose stop backend frontend
   
   # Получите сертификат
   docker-compose run --rm --entrypoint "\
     certbot certonly --webroot -w /var/www/certbot \
       --email goldenbit.kz@yandex.kz \
       -d app.gstdtoken.com \
       --rsa-key-size 4096 \
       --agree-tos \
       --non-interactive \
       --verbose" certbot
   
   # Перезапустите nginx
   docker-compose restart nginx
   ```

6. **Проверьте логи**:
   ```bash
   docker-compose logs nginx | grep acme
   docker-compose logs certbot
   ```

## Проблема 3: Nginx возвращает 500

### Симптомы
```
HTTP/2 500
server: nginx/1.24.0
```

### Решение

1. **Проверьте что backend запущен**:
   ```bash
   docker-compose ps backend
   docker-compose logs backend
   ```

2. **Проверьте конфигурацию Nginx**:
   ```bash
   docker-compose exec nginx nginx -t
   ```

3. **Проверьте что backend доступен из nginx**:
   ```bash
   docker-compose exec nginx ping backend
   # Или
   docker-compose exec nginx wget -O- http://backend:8080/api/v1/stats
   ```

4. **Перезапустите сервисы**:
   ```bash
   docker-compose restart backend nginx
   ```

## Проблема 4: Frontend не запускается

### Симптомы
Frontend контейнер падает или не отвечает.

### Решение

1. **Проверьте логи**:
   ```bash
   docker-compose logs frontend
   ```

2. **Проверьте переменные окружения**:
   ```bash
   docker-compose exec frontend env | grep NEXT_PUBLIC
   ```

3. **Пересоберите frontend**:
   ```bash
   docker-compose build --no-cache frontend
   docker-compose up -d frontend
   ```

## Проблема 5: База данных не подключается

### Симптомы
Backend не может подключиться к PostgreSQL.

### Решение

1. **Проверьте что PostgreSQL запущен**:
   ```bash
   docker-compose ps postgres
   ```

2. **Проверьте переменные окружения**:
   ```bash
   docker-compose exec backend env | grep DB_
   ```

3. **Проверьте подключение**:
   ```bash
   docker-compose exec postgres psql -U postgres -d distributed_computing -c "SELECT 1;"
   ```

4. **Проверьте логи**:
   ```bash
   docker-compose logs postgres
   docker-compose logs backend | grep -i database
   ```

## Проблема 6: Redis не работает

### Симптомы
Backend не может подключиться к Redis.

### Решение

1. **Проверьте что Redis запущен**:
   ```bash
   docker-compose ps redis
   ```

2. **Проверьте подключение**:
   ```bash
   docker-compose exec redis redis-cli ping
   # Должен вернуть "PONG"
   ```

3. **Проверьте логи**:
   ```bash
   docker-compose logs redis
   ```

## Общие команды для диагностики

```bash
# Статус всех сервисов
docker-compose ps

# Логи всех сервисов
docker-compose logs

# Логи конкретного сервиса
docker-compose logs -f nginx
docker-compose logs -f backend
docker-compose logs -f frontend

# Перезапуск всех сервисов
docker-compose restart

# Полная перезагрузка
docker-compose down
docker-compose up -d --build

# Очистка и пересборка
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Полезные ссылки

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Полная инструкция по развёртыванию
- [FIXES.md](./FIXES.md) - Исправления известных проблем
- [QUICK_START.md](./QUICK_START.md) - Быстрый старт



