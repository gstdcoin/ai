# Платформа распределённых вычислений

## Описание

Децентрализованная платформа для выполнения микро-задач (≤5 секунд) на мобильных устройствах и десктопах с использованием блокчейна TON для выплат наград.

**Production URL**: https://app.gstdtoken.com

## Изменения в архитектуре

**Важно:** Для участия в системе требуется наличие GSTD токена на кошельке (не стейк).

## Структура проекта

```
.
├── frontend/          # Next.js фронтенд с поддержкой ru/en
├── backend/           # Go бэкенд с масштабируемой архитектурой
├── contracts/         # TON смарт-контракты
├── nginx/            # Nginx конфигурация с SSL
├── scripts/           # Скрипты для развёртывания
└── docker-compose.yml # Docker Compose для запуска всей системы
```

## Быстрый старт

### Production развёртывание

См. [DEPLOYMENT.md](./DEPLOYMENT.md) для полной инструкции по развёртыванию на production.

### Локальная разработка

```bash
# Клонировать репозиторий
git clone <repository-url>
cd distributed-computing-platform

# Запустить все сервисы (без SSL)
docker-compose up -d

# Фронтенд будет доступен на http://localhost:3000
# Бэкенд API на http://localhost:8080
```

### Получение SSL сертификата

```bash
# Убедитесь, что DNS настроен правильно
dig app.gstdtoken.com

# Запустить скрипт инициализации SSL
./scripts/init-letsencrypt.sh
```

## Особенности

### Фронтенд

- ✅ Next.js 14 с TypeScript
- ✅ Поддержка двух языков (ru/en) через next-i18next
- ✅ Панель управления для заказчиков и устройств
- ✅ Интеграция с TON Connect
- ✅ Адаптивный дизайн с Tailwind CSS
- ✅ Production оптимизации

### Бэкенд

- ✅ Go с Gin framework
- ✅ PostgreSQL для хранения данных
- ✅ Redis для очередей заданий
- ✅ Масштабируемая архитектура
- ✅ Connection pooling для БД и Redis

### Инфраструктура

- ✅ Nginx как reverse proxy
- ✅ Let's Encrypt SSL сертификаты
- ✅ Автоматическое обновление сертификатов
- ✅ Security headers
- ✅ Rate limiting
- ✅ Gzip сжатие

## API Endpoints

- `POST /api/v1/tasks` - Создание задания
- `GET /api/v1/tasks` - Список заданий
- `GET /api/v1/tasks/:id` - Детали задания
- `GET /api/v1/devices` - Список устройств
- `GET /api/v1/stats` - Статистика платформы
- `GET /api/v1/wallet/gstd-balance` - Проверка баланса GSTD

## Переменные окружения

См. `.env.example` для настройки.

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Полная архитектура системы
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Схема базы данных
- [API_SPECIFICATION.md](./API_SPECIFICATION.md) - API спецификация
- [SMART_CONTRACT.md](./SMART_CONTRACT.md) - Смарт-контракт TON
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Инструкция по развёртыванию
- [SETUP.md](./SETUP.md) - Инструкция по настройке

## SSL Сертификат

- **Домен**: app.gstdtoken.com
- **Email**: goldenbit.kz@yandex.kz
- **Провайдер**: Let's Encrypt
- **Автообновление**: Включено через certbot

## Безопасность

- HTTPS только (HTTP редиректит на HTTPS)
- Security headers (HSTS, X-Frame-Options, CSP)
- Rate limiting для API
- CORS настроен правильно
- Регулярное обновление сертификатов

## Мониторинг

```bash
# Статус сервисов
docker-compose ps

# Логи
docker-compose logs -f nginx
docker-compose logs -f backend
docker-compose logs -f frontend

# Проверка сертификата
docker-compose exec certbot certbot certificates
```

## Лицензия

[Указать лицензию]
