# 🌐 Настройка UptimeRobot для GSTD Platform

## Быстрый старт

1. **Регистрация:** https://uptimerobot.com (бесплатно, 50 мониторов)
2. **Добавить мониторы** (см. ниже)
3. **Настроить алерты** (Email, Telegram)

---

## 📋 Мониторы для добавления

### 1. Frontend (Главная страница)
- **Type:** HTTPS
- **URL:** `https://app.gstdtoken.com`
- **Interval:** 5 minutes
- **Expected Status Code:** 200
- **Alert Contacts:** Email (обязательно)

### 2. Backend Health Check
- **Type:** HTTPS
- **URL:** `https://app.gstdtoken.com/api/v1/health`
- **Interval:** 5 minutes
- **Expected Status Code:** 200
- **Alert Contacts:** Email, Telegram (если настроен)
- **Keyword:** `"status":"ok"` (опционально, для проверки JSON)

### 3. Backend Metrics
- **Type:** HTTPS
- **URL:** `https://app.gstdtoken.com/api/v1/metrics`
- **Interval:** 15 minutes
- **Expected Status Code:** 200
- **Alert Contacts:** Email

### 4. Gateway HTTP Redirect
- **Type:** HTTP
- **URL:** `http://app.gstdtoken.com`
- **Interval:** 5 minutes
- **Expected Status Code:** 301 (redirect to HTTPS)
- **Alert Contacts:** Email

### 5. API Version (опционально)
- **Type:** HTTPS
- **URL:** `https://app.gstdtoken.com/api/v1/version`
- **Interval:** 30 minutes
- **Expected Status Code:** 200
- **Alert Contacts:** Email

---

## 🔔 Настройка алертов

### Email Alerts (автоматически)
- Добавьте email в Alert Contacts
- Выберите "Email" при создании монитора

### Telegram Alerts (опционально)

1. **Создать бота:**
   - Открыть @BotFather в Telegram
   - Отправить `/newbot`
   - Следовать инструкциям
   - Сохранить токен

2. **Получить chat_id:**
   ```bash
   # Отправить любое сообщение боту, затем:
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Найти `"chat":{"id":123456789}` в ответе

3. **Добавить в UptimeRobot:**
   - Settings → Alert Contacts → Add Alert Contact
   - Type: Telegram
   - Chat ID: ваш chat_id
   - Bot Token: ваш токен

4. **Привязать к мониторам:**
   - При создании/редактировании монитора выбрать Telegram в Alert Contacts

---

## 📊 Public Status Page (опционально)

UptimeRobot позволяет создать публичную страницу статуса:

1. Settings → Public Status Pages
2. Create New Status Page
3. Выбрать мониторы для отображения
4. Получить ссылку (например: `https://status.uptimerobot.com/xxxxx`)

**Использование:**
- Добавить ссылку на главную страницу платформы
- Пользователи смогут видеть статус сервисов

---

## ✅ Чеклист

- [ ] Зарегистрирован аккаунт UptimeRobot
- [ ] Добавлен монитор Frontend
- [ ] Добавлен монитор Backend Health
- [ ] Добавлен монитор Backend Metrics
- [ ] Настроены Email алерты
- [ ] Настроены Telegram алерты (опционально)
- [ ] Создан Public Status Page (опционально)

---

## 🎯 Результат

После настройки вы будете получать:
- ✅ Email при падении любого сервиса
- ✅ Telegram уведомления (если настроено)
- ✅ История uptime (99.9%+ для production)
- ✅ Public status page для пользователей

**Бесплатный план:** 50 мониторов, проверка каждые 5 минут

---

**Обновлено:** 2026-01-13
