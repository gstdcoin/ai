# Инструкция по запуску проекта

## Что было реализовано

✅ **Обновлена архитектура**: Заменён стейк GSTD на проверку наличия токена на кошельке
✅ **Фронтенд**: Next.js с панелью управления, поддержкой ru/en
✅ **Бэкенд**: Go с масштабируемой архитектурой
✅ **Двуязычность**: Полная поддержка русского и английского
✅ **Масштабируемость**: Connection pooling, Redis для очередей, горизонтальное масштабирование

## Структура проекта

```
.
├── frontend/                 # Next.js фронтенд
│   ├── src/
│   │   ├── components/      # React компоненты
│   │   │   └── dashboard/   # Панель управления
│   │   ├── pages/           # Next.js страницы
│   │   ├── store/           # Zustand store
│   │   └── styles/          # CSS стили
│   ├── public/
│   │   └── locales/         # Переводы (ru/en)
│   └── package.json
│
├── backend/                  # Go бэкенд
│   ├── internal/
│   │   ├── api/             # API handlers
│   │   ├── config/          # Конфигурация
│   │   ├── database/         # БД подключение
│   │   ├── queue/            # Redis очередь
│   │   ├── services/         # Бизнес-логика
│   │   └── models/           # Модели данных
│   └── main.go
│
├── contracts/                # TON смарт-контракты
├── docker-compose.yml        # Docker Compose конфигурация
└── README.md
```

## Быстрый старт

### 1. Установка зависимостей

```bash
# Фронтенд
cd frontend
npm install

# Бэкенд (зависимости загружаются автоматически при запуске)
cd backend
```

### 2. Настройка переменных окружения

#### Фронтенд (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
TON_NETWORK=testnet
GSTD_JETTON_ADDRESS=your_gstd_jetton_address
```

#### Бэкенд (.env)
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=distributed_computing
REDIS_HOST=localhost
REDIS_PORT=6379
TON_NETWORK=testnet
GSTD_JETTON_ADDRESS=your_gstd_jetton_address
PORT=8080
```

### 3. Запуск через Docker Compose

```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

### 4. Инициализация базы данных

```bash
# Подключиться к PostgreSQL
docker-compose exec postgres psql -U postgres -d distributed_computing

# Выполнить SQL из DATABASE_SCHEMA.md
```

### 5. Запуск в режиме разработки

#### Фронтенд
```bash
cd frontend
npm run dev
# Откроется на http://localhost:3000
```

#### Бэкенд
```bash
cd backend
go run main.go
# Запустится на http://localhost:8080
```

## Основные функции

### Панель управления

1. **Подключение кошелька**: TON Connect интеграция
2. **Проверка GSTD**: Автоматическая проверка наличия токена
3. **Создание заданий**: Форма с валидацией
4. **Просмотр заданий**: Список с фильтрацией
5. **Устройства**: Информация об исполнителях
6. **Статистика**: Графики и метрики

### API Endpoints

- `POST /api/v1/tasks` - Создание задания
- `GET /api/v1/tasks` - Список заданий
- `GET /api/v1/tasks?requester=<address>` - Задания заказчика
- `GET /api/v1/devices` - Список устройств
- `GET /api/v1/stats` - Статистика
- `GET /api/v1/wallet/gstd-balance?address=<address>` - Баланс GSTD

## Масштабируемость

### Горизонтальное масштабирование

1. **Бэкенд**: Можно запустить несколько инстансов за load balancer
2. **База данных**: Connection pooling настроен (100 соединений)
3. **Redis**: Connection pool (100 соединений)
4. **Очереди**: Redis Sorted Sets для приоритизации

### Вертикальное масштабирование

- Увеличение ресурсов для каждого сервиса
- Настройка connection pool sizes
- Оптимизация запросов к БД

## Особенности реализации

### Проверка GSTD токена

Вместо стейка используется проверка баланса Jetton токена GSTD на кошельке:

```go
// В task_service.go
func (s *TaskService) checkGSTDBalance(ctx context.Context, address string) (bool, error) {
    // Проверка через TON blockchain API
    // Минимальный баланс: 1 GSTD
}
```

### Двуязычность

- Используется `next-i18next` для интернационализации
- Переводы в `public/locales/ru/` и `public/locales/en/`
- Переключение языка в сайдбаре

### Панель управления

- Адаптивный дизайн (Tailwind CSS)
- Real-time обновления (через API polling)
- Модальные окна для создания заданий
- Таблицы с сортировкой и фильтрацией

## Следующие шаги

1. ✅ Реализовать проверку GSTD через TON API
2. ✅ Добавить WebSocket для real-time обновлений
3. ✅ Реализовать полную валидацию заданий
4. ✅ Интегрировать TON смарт-контракт
5. ✅ Добавить тесты

## Проблемы и решения

### Проблема: Ошибки компиляции TypeScript
**Решение**: Убедитесь, что установлены все зависимости (`npm install`)

### Проблема: БД не подключается
**Решение**: Проверьте переменные окружения и статус PostgreSQL

### Проблема: Redis не работает
**Решение**: Проверьте статус Redis и переменные окружения

## Поддержка

Для вопросов и проблем создавайте issues в репозитории.



