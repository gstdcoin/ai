# Инструкция по развёртыванию на production

## Требования

1. Сервер с Ubuntu 20.04+ или Debian 11+
2. Docker и Docker Compose установлены
3. Домен `app.gstdtoken.com` настроен и указывает на IP сервера
4. Порты 80 и 443 открыты в firewall

## Настройка DNS

Убедитесь, что DNS записи настроены правильно:

```
A     app.gstdtoken.com    ->  YOUR_SERVER_IP
```

Проверить можно командой:
```bash
dig app.gstdtoken.com +short
```

## Установка Docker и Docker Compose

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker
```

## Настройка Firewall

```bash
# UFW (если используется)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Или iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
```

## Клонирование и настройка проекта

```bash
# Клонировать репозиторий
git clone <repository-url>
cd distributed-computing-platform

# Создать директории для SSL
mkdir -p nginx/ssl nginx/certbot

# Установить права на скрипты
chmod +x scripts/*.sh
```

## Настройка переменных окружения

### Backend (.env)
```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=CHANGE_THIS_PASSWORD
DB_NAME=distributed_computing
DB_SSLMODE=disable

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

TON_NETWORK=mainnet
TON_CONTRACT_ADDRESS=YOUR_CONTRACT_ADDRESS
GSTD_JETTON_ADDRESS=YOUR_GSTD_JETTON_ADDRESS
TON_API_KEY=YOUR_TON_API_KEY

PORT=8080
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=https://app.gstdtoken.com/api
TON_NETWORK=mainnet
GSTD_JETTON_ADDRESS=YOUR_GSTD_JETTON_ADDRESS
```

## Получение SSL сертификата

### Первоначальная настройка

```bash
# Запустить скрипт инициализации
./scripts/init-letsencrypt.sh
```

Скрипт:
1. Создаст временный сертификат
2. Запустит Nginx
3. Получит реальный сертификат от Let's Encrypt
4. Перезагрузит Nginx

### Автоматическое обновление

Сертификаты обновляются автоматически через certbot контейнер в docker-compose.

Для ручного обновления:
```bash
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload
```

### Настройка cron для обновления (опционально)

```bash
# Добавить в crontab
crontab -e

# Добавить строку (обновление каждые 12 часов)
0 */12 * * * cd /path/to/project && docker-compose run --rm certbot renew && docker-compose exec nginx nginx -s reload
```

## Запуск приложения

```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Логи конкретного сервиса
docker-compose logs -f nginx
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Инициализация базы данных

```bash
# Подключиться к PostgreSQL
docker-compose exec postgres psql -U postgres -d distributed_computing

# Выполнить SQL из DATABASE_SCHEMA.md
# Или импортировать дамп
docker-compose exec -T postgres psql -U postgres -d distributed_computing < database_dump.sql
```

## Проверка работы

1. **HTTP редирект**: http://app.gstdtoken.com должен редиректить на HTTPS
2. **HTTPS доступ**: https://app.gstdtoken.com должен открываться с валидным сертификатом
3. **API**: https://app.gstdtoken.com/api/v1/stats должен возвращать JSON
4. **Frontend**: https://app.gstdtoken.com должен показывать главную страницу

## Мониторинг

### Проверка сертификата

```bash
# Проверить срок действия
docker-compose exec certbot certbot certificates

# Проверить через openssl
echo | openssl s_client -servername app.gstdtoken.com -connect app.gstdtoken.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Логи

```bash
# Nginx логи
docker-compose exec nginx tail -f /var/log/nginx/app.gstdtoken.com.access.log
docker-compose exec nginx tail -f /var/log/nginx/app.gstdtoken.com.error.log

# Backend логи
docker-compose logs -f backend

# Frontend логи
docker-compose logs -f frontend
```

## Обновление приложения

```bash
# Остановить сервисы
docker-compose down

# Обновить код
git pull

# Пересобрать образы
docker-compose build --no-cache

# Запустить заново
docker-compose up -d
```

## Резервное копирование

### База данных

```bash
# Создать бэкап
docker-compose exec postgres pg_dump -U postgres distributed_computing > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
docker-compose exec -T postgres psql -U postgres distributed_computing < backup.sql
```

### SSL сертификаты

```bash
# Бэкап сертификатов
tar -czf ssl_backup_$(date +%Y%m%d).tar.gz nginx/ssl/

# Восстановление
tar -xzf ssl_backup_YYYYMMDD.tar.gz
```

## Troubleshooting

### Проблема: Сертификат не получается

1. Проверьте DNS: `dig app.gstdtoken.com`
2. Убедитесь, что порт 80 открыт
3. Проверьте логи certbot: `docker-compose logs certbot`

### Проблема: 502 Bad Gateway

1. Проверьте, что backend и frontend запущены: `docker-compose ps`
2. Проверьте логи: `docker-compose logs backend frontend`
3. Проверьте конфигурацию Nginx

### Проблема: Смешанный контент (Mixed Content)

Убедитесь, что `NEXT_PUBLIC_API_URL` использует HTTPS в production.

## Безопасность

1. **Измените пароли БД** в .env файле
2. **Настройте firewall** для ограничения доступа
3. **Регулярно обновляйте** Docker образы
4. **Мониторьте логи** на подозрительную активность
5. **Используйте сильные пароли** для всех сервисов

## Производительность

### Оптимизация Nginx

- Уже настроено кэширование статических файлов
- Gzip сжатие включено
- Rate limiting настроен

### Масштабирование

Для увеличения производительности можно:

1. Запустить несколько инстансов backend за load balancer
2. Использовать Redis Cluster
3. Настроить PostgreSQL репликацию
4. Добавить CDN для статических файлов

## Контакты

Email для сертификата: goldenbit.kz@yandex.kz



