# Nginx Configuration

## Структура

```
nginx/
├── nginx.conf                    # Основная конфигурация Nginx
├── conf.d/
│   └── app.gstdtoken.com.conf   # Конфигурация для домена
├── ssl/                         # SSL сертификаты (создаётся автоматически)
└── certbot/                     # Директория для Let's Encrypt challenge
```

## Конфигурация

### Основные настройки

- **Домен**: app.gstdtoken.com
- **SSL**: Let's Encrypt (email: goldenbit.kz@yandex.kz)
- **Frontend**: Next.js на порту 3000
- **Backend API**: Go на порту 8080
- **WebSocket**: Поддержка через /ws/

### Безопасность

- HTTP редиректит на HTTPS
- Security headers (HSTS, X-Frame-Options, CSP)
- Rate limiting для API
- Gzip сжатие
- Кэширование статических файлов

### Порты

- **80**: HTTP (редирект на HTTPS)
- **443**: HTTPS

## Получение SSL сертификата

```bash
# Из корня проекта
./scripts/init-letsencrypt.sh
```

## Обновление сертификата

Автоматическое обновление настроено через certbot контейнер в docker-compose.

Ручное обновление:
```bash
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload
```

## Логи

```bash
# Access log
docker-compose exec nginx tail -f /var/log/nginx/app.gstdtoken.com.access.log

# Error log
docker-compose exec nginx tail -f /var/log/nginx/app.gstdtoken.com.error.log
```

## Тестирование конфигурации

```bash
# Проверить синтаксис
docker-compose exec nginx nginx -t

# Перезагрузить конфигурацию
docker-compose exec nginx nginx -s reload
```



