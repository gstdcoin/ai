# Быстрый старт для production

## Предварительные требования

1. ✅ Домен `app.gstdtoken.com` настроен и указывает на IP сервера
2. ✅ Порты 80 и 443 открыты в firewall
3. ✅ Docker и Docker Compose установлены

## Шаги развёртывания

### Вариант 1: Автоматическая настройка (рекомендуется)

```bash
# Клонировать проект
git clone <repository-url>
cd distributed-computing-platform

# Установить права
chmod +x scripts/*.sh

# Запустить автоматическую настройку
./scripts/setup-production.sh
```

### Вариант 2: Ручная настройка

```bash
# Клонировать проект
git clone <repository-url>
cd distributed-computing-platform

# Создать необходимые директории
mkdir -p nginx/ssl nginx/certbot

# Установить права
chmod +x scripts/*.sh
```

### 2. Генерация go.sum для backend

```bash
# Автоматическая генерация через Docker
cd backend
docker run --rm -v "$(pwd)":/app -w /app golang:1.21-alpine sh -c "go mod download && go mod tidy"
cd ..
```

Или используйте скрипт:
```bash
./scripts/build-backend.sh
```

### 3. Настройка переменных окружения

Создайте файл `.env` в корне проекта (см. `.env.example`):

```bash
cp .env.example .env
nano .env  # Отредактируйте пароли и адреса
```

**Важно**: Измените пароль БД и настройте TON адреса!

### 4. Получение SSL сертификата

**Важно**: Сначала создайте директории и получите сертификат, затем запускайте все сервисы.

```bash
# Создать директории для SSL
mkdir -p nginx/ssl nginx/certbot
chmod 755 nginx/certbot

# Запустить скрипт получения сертификата
# Скрипт запустит только Nginx для получения сертификата
./scripts/init-letsencrypt.sh
```

Этот скрипт:
- Создаст временный сертификат
- Запустит только Nginx (без backend/frontend)
- Получит реальный сертификат от Let's Encrypt (email: goldenbit.kz@yandex.kz)
- Настроит автоматическое обновление

**Если возникла ошибка 403**: Убедитесь что DNS правильно настроен и порт 80 открыт.

### 5. Запуск всех сервисов

```bash
# Запустить все контейнеры с пересборкой
docker-compose up -d --build

# Проверить статус
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Если backend не собирается, проверьте логи:
docker-compose logs backend
```

### 6. Инициализация базы данных

```bash
# Подключиться к PostgreSQL
docker-compose exec postgres psql -U postgres -d distributed_computing

# Выполнить SQL из DATABASE_SCHEMA.md
# Или импортировать дамп
```

### 7. Проверка работы

1. Откройте https://app.gstdtoken.com в браузере
2. Проверьте, что сертификат валиден (зелёный замочек)
3. Проверьте API: https://app.gstdtoken.com/api/v1/stats

## Проверка SSL сертификата

```bash
# Проверить срок действия
docker-compose exec certbot certbot certificates

# Проверить через openssl
echo | openssl s_client -servername app.gstdtoken.com -connect app.gstdtoken.com:443 2>/dev/null | openssl x509 -noout -dates
```

## Обновление сертификата вручную

```bash
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload
```

## Мониторинг

```bash
# Статус всех сервисов
docker-compose ps

# Логи Nginx
docker-compose logs -f nginx

# Логи Backend
docker-compose logs -f backend

# Логи Frontend
docker-compose logs -f frontend
```

## Обновление приложения

```bash
# Остановить
docker-compose down

# Обновить код
git pull

# Пересобрать
docker-compose build --no-cache

# Запустить
docker-compose up -d
```

## Troubleshooting

### Сертификат не получается
- Проверьте DNS: `dig app.gstdtoken.com`
- Убедитесь, что порт 80 открыт
- Проверьте логи: `docker-compose logs certbot`

### 502 Bad Gateway
- Проверьте статус: `docker-compose ps`
- Проверьте логи: `docker-compose logs backend frontend`

### Смешанный контент
- Убедитесь, что `NEXT_PUBLIC_API_URL` использует HTTPS

## Контакты

Email для сертификата: **goldenbit.kz@yandex.kz**

Полная документация: [DEPLOYMENT.md](./DEPLOYMENT.md)

