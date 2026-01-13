# 🔍 Production Audit Report - GSTD Platform
## Глубокий аудит перед запуском в Production

**Дата:** 2025-01-13  
**Статус:** Критические проблемы обнаружены

---

## 📊 Сводная таблица проблем

| Проблема | Причина | Критичность | Как исправить |
|----------|---------|-------------|---------------|
| **1. Отсутствие middleware для валидации сессий** | Сессии хранятся в Redis, но нет middleware для проверки session_token в запросах | **BLOCKER** | Добавить middleware для проверки сессий в routes.go |
| **2. Хардкод localhost в fallback** | Множество компонентов используют `http://localhost:8080` как fallback вместо production URL | **HIGH** | Заменить все fallback на `https://app.gstdtoken.com` |
| **3. Отсутствие обработки ошибок в Dashboard панелях** | StatsPanel, DevicesPanel не имеют try-catch для API запросов, могут падать с "Something went wrong" | **HIGH** | Добавить Error Boundaries и try-catch в каждый компонент |
| **4. Нет лимитов ресурсов в docker-compose** | Контейнеры могут исчерпать ресурсы сервера при нагрузке | **HIGH** | Добавить `deploy.resources.limits` для всех сервисов |
| **5. Проблема с 404 на внутренних роутах Next.js** | `error_page 404 =200 /index.html` может не работать корректно с proxy_pass | **HIGH** | Использовать правильную конфигурацию для Next.js standalone |
| **6. Session token хранится в localStorage** | localStorage уязвим для XSS атак, токены могут быть украдены | **HIGH** | Использовать httpOnly cookies или sessionStorage |
| **7. Нет механизма перепроверки транзакций при лагах TON** | PaymentTracker проверяет каждые 2 минуты, но нет exponential backoff при ошибках API | **MEDIUM** | Добавить retry с exponential backoff и circuit breaker |
| **8. Приватные ключи в переменных окружения** | PLATFORM_WALLET_PRIVATE_KEY хранится в .env, может быть скомпрометирован | **MEDIUM** | Использовать секреты Docker/Kubernetes или Vault |
| **9. Отсутствие rate limiting на критических эндпоинтах** | `/api/v1/users/login` может быть атакован брутфорсом | **MEDIUM** | Добавить rate limiting middleware |
| **10. Нет healthcheck для frontend контейнера** | Frontend может быть недоступен, но docker-compose не обнаружит это | **LOW** | Добавить healthcheck для frontend |

---

## 🔴 1. ИНФРАСТРУКТУРА И GATEWAY

### 1.1 Проблема 404 на внутренних роутах Next.js

**Файл:** `/home/ubuntu/gateway.conf`

**Проблема:**
- `error_page 404 =200 /index.html;` может не работать корректно с `proxy_pass`
- Next.js standalone требует специальной конфигурации для SPA роутинга

**Решение:**
```nginx
location / {
    proxy_pass http://gstd_frontend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Перехват ошибок 404 от Next.js
    proxy_intercept_errors on;
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    error_page 404 = @fallback;
}

location @fallback {
    proxy_pass http://gstd_frontend:3000;
    proxy_set_header Host $host;
}
```

**Проверка:** ✅ `output: 'standalone'` установлен в `next.config.js`

### 1.2 Проблема потери связи с базой данных

**Файл:** `docker-compose.yml`

**Проблема:**
- Нет retry логики при подключении к БД
- Нет connection pooling настроек
- Backend может упасть если БД недоступна при старте

**Решение:**
```yaml
backend:
  build: ./backend
  restart: always
  depends_on:
    gstd_postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '0.5'
        memory: 512M
```

---

## 🔐 2. ЛОГИКА АВТОРИЗАЦИИ И БЕЗОПАСНОСТЬ

### 2.1 Ошибка 'type' is required

**Файл:** `frontend/src/components/WalletConnect.tsx`

**Статус:** ✅ **ИСПРАВЛЕНО** - Добавлена принудительная проверка signature перед отправкой (строки 175-188)

**Проверка:**
- ✅ Signature оборачивается в объект с `type: 'test-item'`
- ✅ Проверка выполняется перед созданием `requestBody`

### 2.2 Валидация подписи TON Connect 2.0

**Файл:** `backend/internal/services/tonconnect_validator.go`

**Статус:** ✅ **СООТВЕТСТВУЕТ СТАНДАРТАМ**
- ✅ Проверка timestamp (не старше 20 минут)
- ✅ Проверка nonce
- ✅ Проверка адреса
- ✅ Ed25519 верификация подписи
- ✅ Получение публичного ключа из TON API

### 2.3 Проблема с хранением session_token

**Файл:** `frontend/src/components/WalletConnect.tsx:232`

**Проблема:**
```typescript
localStorage.setItem('session_token', userData.session_token);
```

**Риски:**
- XSS атаки могут украсть токен из localStorage
- Токен доступен всем скриптам на странице

**Решение:**
1. **Вариант 1 (Рекомендуемый):** Использовать httpOnly cookies
```go
// В backend/internal/api/routes_user.go
c.SetCookie("session_token", sessionToken, 86400, "/", "app.gstdtoken.com", true, true)
```

2. **Вариант 2:** Использовать sessionStorage вместо localStorage (удаляется при закрытии вкладки)

3. **Вариант 3:** Добавить middleware для проверки сессий и не хранить токен на клиенте

### 2.4 Отсутствие middleware для валидации сессий

**Файл:** `backend/internal/api/routes.go`

**Проблема:**
- Сессии создаются в Redis, но нет middleware для проверки `session_token` в запросах
- Любой может вызвать API без авторизации

**Решение:**
```go
// backend/internal/api/middleware_session.go
func ValidateSession(redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Получить session_token из cookie или header
		sessionToken := c.GetHeader("X-Session-Token")
		if sessionToken == "" {
			cookie, err := c.Cookie("session_token")
			if err == nil {
				sessionToken = cookie
			}
		}
		
		if sessionToken == "" {
			c.JSON(401, gin.H{"error": "session token required"})
			c.Abort()
			return
		}
		
		// Проверить сессию в Redis
		ctx := c.Request.Context()
		sessionKey := fmt.Sprintf("session:%s", sessionToken)
		exists, err := redisClient.Exists(ctx, sessionKey).Result()
		if err != nil || exists == 0 {
			c.JSON(401, gin.H{"error": "invalid or expired session"})
			c.Abort()
			return
		}
		
		// Обновить last_access
		redisClient.HSet(ctx, sessionKey, "last_access", time.Now().Unix())
		
		// Получить wallet_address из сессии
		walletAddress, err := redisClient.HGet(ctx, sessionKey, "wallet_address").Result()
		if err == nil {
			c.Set("wallet_address", walletAddress)
		}
		
		c.Next()
	}
}
```

**Применить к защищенным роутам:**
```go
// В routes.go
api := router.Group("/api/v1")
api.Use(ValidateSession(redisClient))
api.GET("/tasks", getTasks)
api.POST("/tasks", createTask)
// и т.д.
```

---

## 🎨 3. ФУНКЦИОНАЛ КАБИНЕТА (UX/LOGIC)

### 3.1 Обработка ошибок в Dashboard

**Файлы:**
- `frontend/src/components/dashboard/StatsPanel.tsx`
- `frontend/src/components/dashboard/DevicesPanel.tsx`
- `frontend/src/components/dashboard/TasksPanel.tsx`

**Проблема:**
- Нет try-catch блоков для API запросов
- Ошибки могут привести к падению компонента с "Something went wrong"

**Решение:**
```typescript
// Пример для StatsPanel.tsx
useEffect(() => {
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://app.gstdtoken.com').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/stats`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      logger.error('Failed to fetch stats', err);
      setError(err?.message || 'Failed to load statistics');
      toast.error('Error', 'Failed to load statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  fetchStats();
}, []);
```

**Статус Error Boundary:** ✅ Есть в `frontend/src/components/common/ErrorBoundary.tsx`, но нужно обернуть каждую панель отдельно

---

## ⛓️ 4. БЛОКЧЕЙН-ВЗАИМОДЕЙСТВИЕ

### 4.1 Трекинг транзакций и reconciliation

**Файл:** `backend/internal/services/payment_tracker.go`

**Статус:** ✅ **ЕСТЬ МЕХАНИЗМ**
- ✅ Проверка каждые 2 минуты
- ✅ Таймаут 20 минут для pending транзакций
- ✅ Поиск по tx_hash, query_id, comment

**Проблема:**
- Нет exponential backoff при ошибках TON API
- Нет circuit breaker для защиты от лагов сети

**Решение:**
```go
// Добавить в payment_tracker.go
type retryConfig struct {
	maxRetries int
	baseDelay  time.Duration
}

func (pt *PaymentTracker) reconcilePaymentsWithRetry(ctx context.Context) {
	config := retryConfig{
		maxRetries: 3,
		baseDelay:  5 * time.Second,
	}
	
	for attempt := 0; attempt < config.maxRetries; attempt++ {
		blockchainTxs, err := pt.tonService.GetContractTransactions(ctx, pt.contractAddr, 50)
		if err == nil {
			// Успешно, обработать транзакции
			break
		}
		
		// Exponential backoff
		if attempt < config.maxRetries-1 {
			delay := config.baseDelay * time.Duration(1<<uint(attempt))
			log.Printf("PaymentTracker: Retry %d/%d after %v", attempt+1, config.maxRetries, delay)
			time.Sleep(delay)
		}
	}
}
```

### 4.2 Хранение приватных ключей

**Файл:** `backend/internal/config/config.go:91`

**Проблема:**
```go
PlatformWalletPrivateKey: getEnv("PLATFORM_WALLET_PRIVATE_KEY", ""),
```

**Риски:**
- Приватный ключ в переменных окружения может быть скомпрометирован
- Доступен в логах при ошибках

**Решение:**
1. **Использовать Docker secrets:**
```yaml
secrets:
  platform_wallet_key:
    external: true

services:
  backend:
    secrets:
      - platform_wallet_key
```

2. **Использовать HashiCorp Vault или AWS Secrets Manager**

3. **Минимизировать использование:** Платформа на pull-model, приватный ключ не нужен для большинства операций

**Статус:** ✅ Согласно `docs/PULL_MODEL_SETUP.md`, платформа переведена на pull-model, приватный ключ опционален

---

## 📈 5. ГОТОВНОСТЬ К НАГРУЗКЕ

### 5.1 Лимиты ресурсов в docker-compose

**Файл:** `docker-compose.yml`

**Проблема:**
- Нет лимитов CPU и памяти
- Контейнеры могут исчерпать ресурсы сервера

**Решение:**
```yaml
services:
  gstd_postgres:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
  
  gstd_redis:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.25'
          memory: 256M
  
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
  
  frontend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.25'
          memory: 256M
  
  gateway:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
```

### 5.2 Хардкод localhost в fallback

**Файлы:**
- `frontend/src/lib/taskWorker.ts:45`
- `frontend/src/components/dashboard/*.tsx` (множество файлов)

**Проблема:**
```typescript
const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
```

**Риски:**
- В production может использоваться localhost вместо production URL
- Запросы будут падать с CORS ошибками

**Решение:**
```typescript
// Создать централизованный конфиг
// frontend/src/lib/config.ts
export const API_BASE_URL = 
  process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://app.gstdtoken.com' 
    : 'http://localhost:8080');

// Использовать везде:
import { API_BASE_URL } from '../lib/config';
const apiBase = API_BASE_URL.replace(/\/+$/, '');
```

**Статус apiClient.ts:** ✅ Использует правильный fallback `https://app.gstdtoken.com` (строка 91)

### 5.3 Отсутствие healthcheck для frontend

**Файл:** `docker-compose.yml`

**Решение:**
```yaml
frontend:
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

---

## 📋 ПРИОРИТЕТНЫЙ ПЛАН ИСПРАВЛЕНИЙ

### Критично (BLOCKER) - Исправить перед запуском:
1. ✅ Добавить middleware для валидации сессий
2. ✅ Заменить все localhost fallback на production URL
3. ✅ Исправить конфигурацию nginx для Next.js роутинга

### Высокий приоритет (HIGH) - Исправить в первую неделю:
4. ✅ Добавить обработку ошибок в Dashboard компоненты
5. ✅ Добавить лимиты ресурсов в docker-compose
6. ✅ Переместить session_token в httpOnly cookies

### Средний приоритет (MEDIUM) - Исправить в первый месяц:
7. ✅ Добавить exponential backoff для PaymentTracker
8. ✅ Добавить rate limiting на критических эндпоинтах
9. ✅ Использовать Docker secrets для приватных ключей

### Низкий приоритет (LOW) - Улучшения:
10. ✅ Добавить healthcheck для frontend

---

## ✅ ЧТО УЖЕ РАБОТАЕТ ХОРОШО

1. ✅ **Валидация подписей TON Connect 2.0** - Полностью соответствует стандартам
2. ✅ **Error Boundary** - Есть глобальный ErrorBoundary в _app.tsx
3. ✅ **Retry логика в apiClient** - Есть retry с exponential backoff
4. ✅ **Reconciliation транзакций** - PaymentTracker работает каждые 2 минуты
5. ✅ **Pull-model архитектура** - Платформа не хранит приватные ключи пользователей
6. ✅ **Healthchecks** - Есть для postgres и redis
7. ✅ **Standalone output** - Next.js настроен для Docker

---

## 🚀 РЕКОМЕНДАЦИИ ДЛЯ PRODUCTION

1. **Мониторинг:** Настроить Prometheus + Grafana для метрик
2. **Логирование:** Централизованное логирование (ELK stack или Loki)
3. **Backup:** Автоматические бэкапы БД (уже есть в `backup_db.sh`)
4. **SSL:** Проверить автоматическое обновление Let's Encrypt сертификатов
5. **CDN:** Рассмотреть Cloudflare для статических ресурсов
6. **Rate Limiting:** Добавить nginx rate limiting для защиты от DDoS

---

**Отчет составлен:** 2025-01-13  
**Следующий аудит:** После исправления критических проблем
