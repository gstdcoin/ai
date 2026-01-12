# Конфигурация для работы по IP и домену

## Проблема
Платформа работала по IP `82.115.48.228`, но не работала по домену `app.gstdtoken.com`.

## Выполненные изменения

### 1. ✅ Создан .env файл в frontend

**Файл:** `/home/ubuntu/frontend/.env`
```
NEXT_PUBLIC_API_URL=http://82.115.48.228
```

**Объяснение:**
- Установлен API URL на IP-адрес вместо домена
- Используется HTTP протокол (без SSL)
- Фронтенд будет делать запросы напрямую на IP

### 2. ✅ Обновлен NEXT_PUBLIC_API_URL в docker-compose.yml

**Изменено для frontend:**
```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://82.115.48.228
```

**Было:** `https://app.gstdtoken.com`
**Стало:** `http://82.115.48.228`

### 3. ✅ Добавлен extra_hosts для всех сервисов

**Добавлено во все сервисы:**
```yaml
extra_hosts:
  - "app.gstdtoken.com:82.115.48.228"
```

**Обновленные сервисы:**
- ✅ gateway
- ✅ frontend
- ✅ backend
- ✅ postgres
- ✅ redis

**Объяснение:**
- `extra_hosts` добавляет запись в `/etc/hosts` каждого контейнера
- Домен `app.gstdtoken.com` будет резолвиться в IP `82.115.48.228`
- Это позволяет контейнерам обращаться к домену, даже если DNS не настроен

## Итоговая конфигурация

### docker-compose.yml

**Все сервисы имеют:**
```yaml
extra_hosts:
  - "app.gstdtoken.com:82.115.48.228"
```

**Frontend имеет:**
```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://82.115.48.228
```

### frontend/.env

```
NEXT_PUBLIC_API_URL=http://82.115.48.228
```

### gateway.conf

```nginx
server {
    listen 80 default_server;
    server_name app.gstdtoken.com 82.115.48.228;
    ...
}
```

## Как это работает

1. **Внешние запросы:**
   - Запросы на `http://82.115.48.228` → работают напрямую
   - Запросы на `http://app.gstdtoken.com` → резолвятся через DNS или extra_hosts

2. **Внутри контейнеров:**
   - Все контейнеры имеют запись в `/etc/hosts`: `82.115.48.228 app.gstdtoken.com`
   - Контейнеры могут обращаться к домену, даже если внешний DNS не настроен

3. **Фронтенд:**
   - Использует `NEXT_PUBLIC_API_URL=http://82.115.48.228` для API запросов
   - Делает запросы напрямую на IP, минуя домен

## Следующие шаги

### Перезапуск проекта

Выполните команду:
```bash
docker compose up -d --build
```

Или если используете старую версию docker-compose:
```bash
docker-compose up -d --build
```

### Проверка работы

1. **Проверка по IP:**
   ```bash
   curl http://82.115.48.228
   ```

2. **Проверка по домену (если DNS настроен):**
   ```bash
   curl http://app.gstdtoken.com
   ```

3. **Проверка extra_hosts в контейнере:**
   ```bash
   docker exec <container_name> cat /etc/hosts | grep app.gstdtoken.com
   ```

4. **Проверка переменной окружения:**
   ```bash
   docker exec <frontend_container> env | grep NEXT_PUBLIC_API_URL
   ```

## Важные замечания

1. **HTTP vs HTTPS:**
   - Сейчас используется HTTP (`http://82.115.48.228`)
   - После настройки SSL сертификата можно переключиться на HTTPS

2. **DNS настройка:**
   - `extra_hosts` работает только внутри контейнеров
   - Для внешнего доступа по домену нужна настройка DNS записи A:
     ```
     app.gstdtoken.com → 82.115.48.228
     ```

3. **Безопасность:**
   - HTTP не шифрует трафик
   - Рекомендуется настроить SSL/TLS после проверки работы

## Результат

✅ **.env файл создан** с `NEXT_PUBLIC_API_URL=http://82.115.48.228`
✅ **extra_hosts добавлен** для всех сервисов
✅ **NEXT_PUBLIC_API_URL обновлен** в docker-compose.yml
✅ **Готово к перезапуску** с `docker compose up -d --build`

После перезапуска платформа должна работать как по IP, так и по домену (если DNS настроен).
