# 🛠 Легковесный мониторинг для GSTD Platform

## Обзор

Вместо тяжелых Prometheus/Grafana (которые съедят всю память), используем легковесные решения:
- **Glances** - мониторинг ресурсов сервера (CPU, RAM, Disk, Network)
- **UptimeRobot** - внешний мониторинг доступности (бесплатно)
- **Docker Log Rotation** - автоматическая ротация логов

---

## ✅ 1. Docker Log Rotation (УЖЕ НАСТРОЕНО)

### Конфигурация

Все сервисы в `docker-compose.yml` настроены с:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"      # Максимум 10MB на файл
    max-file: "3"        # Хранить 3 файла (30MB на сервис)
    compress: "true"     # Сжимать старые логи
```

### Результат:
- ✅ Максимум ~150MB логов для всех сервисов
- ✅ Автоматическая ротация
- ✅ Сжатие старых логов
- ✅ Диск не переполнится

### Проверка:
```bash
# Размер логов
docker system df -v | grep -A 10 "Local Volumes"

# Просмотр логов
docker logs --tail 100 gstd_backend
docker logs --tail 100 gstd_frontend
docker logs --tail 100 gstd_gateway
```

---

## 📊 2. Glances - Мониторинг ресурсов

### Установка

```bash
# Запустить Glances вместе с основными сервисами
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d glances
```

### Доступ:
- **Web UI:** http://your-server-ip:61208
- **REST API:** http://your-server-ip:61209

### Что мониторит:
- ✅ CPU usage (per core)
- ✅ RAM usage
- ✅ Disk I/O
- ✅ Network traffic
- ✅ Docker containers stats
- ✅ Process list
- ✅ System load

### API Endpoints:
```bash
# Получить все метрики
curl http://localhost:61209/api/3/all

# Получить только CPU
curl http://localhost:61209/api/3/cpu

# Получить Docker stats
curl http://localhost:61209/api/3/docker
```

### Настройка firewall (если нужно):
```bash
# Открыть порт для Glances (опционально, только для внутренней сети)
sudo ufw allow from 10.0.0.0/8 to any port 61208
sudo ufw allow from 10.0.0.0/8 to any port 61209
```

### Автоматический запуск:
Glances автоматически запускается с `restart: unless-stopped`.

---

## 🌐 3. UptimeRobot - Внешний мониторинг

### Регистрация:
1. Перейти на https://uptimerobot.com
2. Создать бесплатный аккаунт (50 мониторов)
3. Добавить мониторы:

### Мониторы для настройки:

#### 1. Frontend (HTTPS)
- **Type:** HTTPS
- **URL:** https://app.gstdtoken.com
- **Interval:** 5 minutes
- **Alert Contacts:** Email, Telegram (если настроен)

#### 2. Backend API Health
- **Type:** HTTPS
- **URL:** https://app.gstdtoken.com/api/v1/health
- **Interval:** 5 minutes
- **Expected Status Code:** 200
- **Alert Contacts:** Email, Telegram

#### 3. Backend API Metrics
- **Type:** HTTPS
- **URL:** https://app.gstdtoken.com/api/v1/metrics
- **Interval:** 15 minutes
- **Expected Status Code:** 200

#### 4. Gateway (HTTP redirect)
- **Type:** HTTP
- **URL:** http://app.gstdtoken.com
- **Interval:** 5 minutes
- **Expected Status Code:** 301 (redirect to HTTPS)

### Настройка алертов:
1. **Email alerts** - автоматически
2. **Telegram bot** (опционально):
   - Создать бота через @BotFather
   - Получить chat_id
   - Добавить в UptimeRobot → Alert Contacts

### Преимущества:
- ✅ Бесплатно (50 мониторов)
- ✅ Внешний мониторинг (видит проблемы даже если сервер упал)
- ✅ Email/SMS/Telegram алерты
- ✅ История uptime
- ✅ Public status page (опционально)

---

## 🔍 4. Проверка логов вручную

### Полезные команды:

```bash
# Последние 100 строк логов backend
docker logs --tail 100 gstd_backend

# Логи с фильтром (только ошибки)
docker logs gstd_backend 2>&1 | grep -i error

# Логи за последний час
docker logs --since 1h gstd_backend

# Следить за логами в реальном времени
docker logs -f gstd_backend

# Размер логов всех контейнеров
docker system df -v
```

### Поиск проблем:

```bash
# Ошибки во всех сервисах
docker logs gstd_backend 2>&1 | grep -i error | tail -20
docker logs gstd_frontend 2>&1 | grep -i error | tail -20
docker logs gstd_gateway 2>&1 | grep -i error | tail -20

# Проверка здоровья
curl https://app.gstdtoken.com/api/v1/health

# Метрики
curl https://app.gstdtoken.com/api/v1/metrics
```

---

## 📈 5. Метрики для отслеживания

### Критические метрики (через Glances API):

```bash
# CPU usage
curl -s http://localhost:61209/api/3/cpu | jq '.total'

# RAM usage
curl -s http://localhost:61209/api/3/mem | jq '.used'

# Disk usage
curl -s http://localhost:61209/api/3/fs | jq '.[0].used_percent'

# Docker containers
curl -s http://localhost:61209/api/3/docker | jq '.[] | {name: .name, cpu: .cpu_percent, mem: .memory_percent}'
```

### Backend метрики (через API):

```bash
# Все метрики
curl https://app.gstdtoken.com/api/v1/metrics

# Health check
curl https://app.gstdtoken.com/api/v1/health
```

---

## 🚨 6. Алерты и уведомления

### Настройка Telegram бота (опционально):

1. Создать бота через @BotFather
2. Получить токен
3. Получить chat_id (отправить сообщение боту, затем):
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Добавить в `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=your_token
   TELEGRAM_CHAT_ID=your_chat_id
   ```

### Скрипт для проверки и алертов:

Создать `scripts/health-check.sh`:
```bash
#!/bin/bash
# Проверка здоровья платформы и отправка алертов

HEALTH_URL="https://app.gstdtoken.com/api/v1/health"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"

# Проверка health endpoint
response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$response" != "200" ]; then
    message="🚨 ALERT: Health check failed! Status: $response"
    
    # Отправить в Telegram
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="${TELEGRAM_CHAT_ID}" \
            -d text="$message"
    fi
    
    # Логировать
    echo "$(date): $message" >> /var/log/gstd-health.log
    exit 1
fi

echo "$(date): Health check OK" >> /var/log/gstd-health.log
exit 0
```

Добавить в cron (каждые 5 минут):
```bash
*/5 * * * * /home/ubuntu/scripts/health-check.sh
```

---

## 📊 7. Дашборд (опционально)

### Простой HTML дашборд:

Создать `monitoring/dashboard.html` для локального просмотра метрик через Glances API.

---

## ✅ Чеклист настройки

- [x] Docker log rotation настроен
- [ ] Glances запущен и доступен
- [ ] UptimeRobot мониторы настроены
- [ ] Telegram бот настроен (опционально)
- [ ] Health check скрипт добавлен в cron
- [ ] Firewall настроен (если нужно)

---

## 🎯 Результат

После настройки у вас будет:
- ✅ Автоматическая ротация логов (не переполнит диск)
- ✅ Мониторинг ресурсов через Glances
- ✅ Внешний мониторинг через UptimeRobot
- ✅ Алерты при проблемах
- ✅ Минимальное потребление ресурсов (~128MB для Glances)

**Общий размер мониторинга:** ~150MB (логи) + 128MB (Glances) = **278MB**

**Сравнение с Prometheus/Grafana:** ~2GB+ (экономия 85% ресурсов!)

---

**Обновлено:** 2026-01-13
