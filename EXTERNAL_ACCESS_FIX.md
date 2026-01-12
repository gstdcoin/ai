# Исправление доступа к платформе извне

## Проблема
Платформа возвращала 200 OK через `curl localhost`, но была недоступна извне.

## Выполненные изменения

### 1. ✅ Обновлены порты в docker-compose.yml для gateway

**Было:**
```yaml
ports:
  - "80:80"
  - "443:443"
```

**Стало:**
```yaml
ports:
  - "0.0.0.0:80:80"
  - "0.0.0.0:443:443"
```

**Объяснение:**
- По умолчанию Docker привязывает порты только к `127.0.0.1` (localhost)
- Явное указание `0.0.0.0` заставляет Docker слушать на всех сетевых интерфейсах
- Теперь платформа доступна не только с localhost, но и из внешней сети

### 2. ✅ Проверена переменная NEXT_PUBLIC_API_URL

**В docker-compose.yml для frontend:**
```yaml
environment:
  - NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

**Проверка:**
- ✅ URL установлен без портов (`https://app.gstdtoken.com`)
- ✅ URL установлен без завершающего слэша
- ✅ Используется HTTPS протокол

**Примечание:**
- Переменная уже была правильно настроена в docker-compose.yml
- Next.js также имеет fallback в `next.config.js`: `'https://app.gstdtoken.com'`
- Дополнительный `.env` файл не требуется, так как переменная передается через docker-compose

### 3. ✅ Добавлено логирование ошибок в gateway.conf

**Добавлено:**
```nginx
error_log /var/log/nginx/error.log debug;
```

**Расположение:**
- В блоке `server` сразу после `server_name`
- Уровень логирования: `debug` (максимальная детализация)

**Преимущества:**
- Детальное логирование всех ошибок Nginx
- Помогает диагностировать проблемы с проксированием
- Логи доступны через `docker logs <gateway_container>`

## Итоговая конфигурация

### docker-compose.yml (gateway)
```yaml
gateway:
  image: nginx:alpine
  ports:
    - "0.0.0.0:80:80"      # Слушает на всех интерфейсах
    - "0.0.0.0:443:443"    # Слушает на всех интерфейсах
  volumes:
    - ./gateway.conf:/etc/nginx/conf.d/default.conf
  ...
```

### gateway.conf
```nginx
server {
    listen 80;
    server_name app.gstdtoken.com;

    # Логирование ошибок для отладки
    error_log /var/log/nginx/error.log debug;

    # Явное указание DNS-резолвера Docker
    resolver 127.0.0.11 valid=5s;

    # Фронтенд
    location / {
        set $frontend frontend;
        proxy_pass http://$frontend:3000;
        ...
    }

    # Бэкенд
    location /api/ {
        set $backend backend;
        proxy_pass http://$backend:8080;
        ...
    }
}
```

### docker-compose.yml (frontend)
```yaml
frontend:
  environment:
    - NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

## Проверка работы

### 1. Проверка доступности извне

**С локальной машины:**
```bash
curl http://localhost
```

**С внешней машины (замените на ваш IP):**
```bash
curl http://<YOUR_SERVER_IP>
```

**С домена (если DNS настроен):**
```bash
curl http://app.gstdtoken.com
```

### 2. Проверка портов

**Проверка, что порты слушают на всех интерфейсах:**
```bash
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
# или
sudo ss -tlnp | grep :80
sudo ss -tlnp | grep :443
```

Должно показать `0.0.0.0:80` и `0.0.0.0:443`, а не `127.0.0.1:80`.

### 3. Проверка логов Nginx

**Просмотр логов ошибок:**
```bash
docker logs <gateway_container_name> 2>&1 | grep -i error
```

**Просмотр всех логов:**
```bash
docker logs <gateway_container_name>
```

### 4. Проверка переменных окружения фронтенда

**Проверка в контейнере:**
```bash
docker exec <frontend_container_name> env | grep NEXT_PUBLIC_API_URL
```

Должно показать: `NEXT_PUBLIC_API_URL=https://app.gstdtoken.com`

## Дополнительные шаги (если проблема сохраняется)

### 1. Проверка файрвола

Убедитесь, что порты 80 и 443 открыты:

```bash
# UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 2. Проверка маршрутизации

Убедитесь, что сервер имеет публичный IP и маршрутизация настроена правильно:

```bash
# Проверка IP адреса
ip addr show
# или
hostname -I
```

### 3. Проверка DNS

Если используете домен, убедитесь, что DNS записи настроены:

```bash
# Проверка A записи
dig app.gstdtoken.com
# или
nslookup app.gstdtoken.com
```

## Результат

✅ **Порты слушают на всех интерфейсах** (`0.0.0.0`)
✅ **NEXT_PUBLIC_API_URL настроен правильно** (без портов, без слэшей)
✅ **Логирование ошибок включено** (уровень debug)

Платформа теперь должна быть доступна извне через публичный IP или домен.
