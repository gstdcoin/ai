# GSTD Platform - Distributed Computing Platform

[![CI/CD](https://github.com/gstdcoin/ai/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/gstdcoin/ai/actions/workflows/ci-cd.yml)

GSTD (Global System for Trusted Distributed Computing) - это децентрализованная платформа для распределенных вычислений на блокчейне TON.

## 🚀 Возможности

- **Распределенные вычисления**: Создание и выполнение задач на децентрализованной сети устройств
- **Блокчейн интеграция**: Использование TON блокчейна для платежей и escrow контрактов
- **Trust System**: Многомерная система доверия для обеспечения качества вычислений
- **Economic Gravity**: Физическая модель для приоритизации задач
- **Dynamic Redundancy**: Автоматическая избыточность для отказоустойчивости
- **Pull-model Payments**: Работники самостоятельно получают награды через escrow контракт

## 📋 Требования

- Docker и Docker Compose
- PostgreSQL 15+
- Redis 7+
- Go 1.21+
- Node.js 18+ (для frontend)

## 🛠️ Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/gstdcoin/ai.git
cd ai
```

### 2. Настройка окружения

Создайте файл `.env` в корне проекта:

```env
# Database
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=distributed_computing
DB_HOST=postgres
DB_PORT=5432

# TON Blockchain
TON_CONTRACT_ADDRESS=your_contract_address
ADMIN_WALLET=your_admin_wallet
GSTD_JETTON_ADDRESS=your_jetton_address
TON_API_URL=https://tonapi.io
TON_API_KEY=your_api_key

# Frontend
NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

### 3. Запуск

```bash
docker-compose up -d
```

Платформа будет доступна по адресу:
- Frontend: https://app.gstdtoken.com
- Backend API: https://app.gstdtoken.com/api/v1

## 📁 Структура проекта

```
.
├── backend/              # Go backend сервис
│   ├── internal/
│   │   ├── api/         # API handlers и routes
│   │   ├── services/    # Бизнес-логика
│   │   ├── models/     # Модели данных
│   │   └── config/     # Конфигурация
│   ├── migrations/      # SQL миграции
│   └── Dockerfile
├── frontend/            # Next.js frontend
│   ├── src/
│   │   ├── components/  # React компоненты
│   │   ├── lib/        # Утилиты
│   │   └── pages/      # Страницы
│   └── Dockerfile
├── nginx/               # Nginx конфигурация
│   ├── conf.d/         # Конфигурация сайтов
│   └── nginx.conf      # Основной конфиг
├── scripts/             # Скрипты для деплоймента
│   ├── blue-green-deploy.sh
│   ├── rollback.sh
│   └── run-tests.sh
├── docs/                # Документация
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── CI_CD.md
├── docker-compose.yml   # Development конфигурация
├── docker-compose.prod.yml  # Production конфигурация
└── README.md
```

## 🔧 Разработка

### Backend

```bash
cd backend
go mod download
go run main.go
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Тесты

```bash
# Backend тесты
cd backend
go test ./...

# С линтером
bash ../scripts/run-tests.sh
```

## 📚 Документация

- [API Documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [CI/CD Pipeline](docs/CI_CD.md)

## 🚢 Деплоймент

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Blue-Green Deployment

```bash
bash scripts/blue-green-deploy.sh
```

### Rollback

```bash
bash scripts/rollback.sh
```

## 🔐 Безопасность

- SSL/TLS сертификаты через Let's Encrypt
- Security headers (HSTS, CSP, Permissions-Policy)
- Rate limiting на API endpoints
- Input validation
- SQL injection protection
- Circuit breaker pattern

## 📊 Мониторинг

- Health check: `/api/v1/health`
- Prometheus metrics: `/api/v1/metrics`
- Database health checks
- Contract balance monitoring

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📝 Лицензия

Этот проект является частью GSTD экосистемы.

## 🔗 Ссылки

- [Website](https://app.gstdtoken.com)
- [Documentation](docs/)
- [Issues](https://github.com/gstdcoin/ai/issues)

## 👥 Команда

GSTD Platform разрабатывается командой GSTD.

---

**Примечание**: Для production деплоймента убедитесь, что настроены все необходимые переменные окружения и secrets в GitHub Actions.
