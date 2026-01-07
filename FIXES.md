# Исправления проблем развёртывания

## Проблемы и решения

### 1. Ошибка сборки Backend: `go.sum: file does not exist`

**Проблема**: Dockerfile требует `go.sum`, но файл отсутствует.

**Решение**: 
- Обновлён Dockerfile для автоматического создания `go.sum` через `go mod tidy`
- Файл `go.sum` теперь опционален при сборке

### 2. Ошибка получения SSL: `403 Forbidden` для ACME challenge

**Проблема**: Let's Encrypt не может получить доступ к challenge файлам.

**Причины**:
- Nginx запускается вместе с backend/frontend, которые не собраны
- Права доступа к директории certbot
- Nginx не может прочитать файлы из `/var/www/certbot`

**Решение**:
- Обновлён скрипт `init-letsencrypt.sh` для запуска только Nginx при получении сертификата
- Добавлена проверка и создание директории certbot с правильными правами
- Обновлена конфигурация Nginx для правильной обработки ACME challenge

## Правильный порядок развёртывания

### Вариант 1: Пошаговый запуск (рекомендуется)

```bash
# 1. Создать директории
mkdir -p nginx/ssl nginx/certbot
chmod 755 nginx/certbot

# 2. Получить SSL сертификат (только Nginx)
./scripts/init-letsencrypt.sh

# 3. Запустить все сервисы
docker-compose up -d --build
```

### Вариант 2: Если сертификат уже получен

```bash
# Просто запустить все сервисы
docker-compose up -d --build
```

## Проверка работы

```bash
# Проверить статус
docker-compose ps

# Проверить логи
docker-compose logs nginx
docker-compose logs backend
docker-compose logs frontend

# Проверить SSL
curl -I https://app.gstdtoken.com

# Проверить сертификат
docker-compose exec certbot certbot certificates
```

## Если проблемы остаются

### Backend не собирается

```bash
# Очистить кэш Docker
docker-compose build --no-cache backend

# Проверить go.mod
cd backend
cat go.mod
```

### SSL не получается

1. Проверьте DNS:
   ```bash
   dig app.gstdtoken.com
   ```

2. Проверьте что порт 80 открыт:
   ```bash
   sudo netstat -tlnp | grep :80
   ```

3. Проверьте логи certbot:
   ```bash
   docker-compose logs certbot
   ```

4. Попробуйте получить сертификат вручную:
   ```bash
   docker-compose run --rm --entrypoint "\
     certbot certonly --webroot -w /var/www/certbot \
       --email goldenbit.kz@yandex.kz \
       -d app.gstdtoken.com \
       --rsa-key-size 4096 \
       --agree-tos \
       --non-interactive" certbot
   ```

### Nginx возвращает 500

1. Проверьте что backend запущен:
   ```bash
   docker-compose ps backend
   docker-compose logs backend
   ```

2. Проверьте конфигурацию Nginx:
   ```bash
   docker-compose exec nginx nginx -t
   ```

3. Перезапустите Nginx:
   ```bash
   docker-compose restart nginx
   ```

## Обновлённые файлы

- `backend/Dockerfile` - исправлена работа с go.sum
- `scripts/init-letsencrypt.sh` - улучшена обработка ACME challenge
- `nginx/conf.d/app.gstdtoken.com.conf` - улучшена конфигурация для challenge



