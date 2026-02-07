# 🚀 GSTD IMPLEMENTATION MASTER PLAN
## От Стратегии к Реализации: Полный План Действий

**Дата:** 2026-02-07
**Статус:** В РАЗРАБОТКЕ

---

# EXECUTIVE SUMMARY

Этот документ содержит **конкретные технические реализации** для достижения 1M пользователей.

## Что Будет Создано:

### ✅ Phase 1: Zero-Barrier Entry (Неделя 1-2)
1. **Agent SDK 2.0** — `Agent.run()` в одну строку
2. **Telegram Mini App Backend** — API для мгновенного онбординга
3. **Welcome Bonus System** — автоматически 1.0 GSTD новым пользователям
4. **Referral System v2** — многоуровневая система (3 уровня)

### ✅ Phase 2: Agent Marketplace (Неделя 3-4)
5. **Agent Registry** — каталог агентов для аренды
6. **Burn Mechanism** — 5% сжигание на транзакцию
7. **Trust Score для агентов** — качество и рейтинг

### ✅ Phase 3: Viral Growth (Неделя 5-6)
8. **Invite Links** — генерация и отслеживание
9. **Gamification** — XP, уровни, достижения

---

# ДЕТАЛЬНЫЙ ПЛАН РЕАЛИЗАЦИИ

## ╔══════════════════════════════════════════════╗
## ║  PHASE 1: ZERO-BARRIER ENTRY                ║
## ╚══════════════════════════════════════════════╝

### 1.1 Agent SDK 2.0 — Одна Команда для Запуска

**Файл:** `/home/ubuntu/A2A/python-sdk/gstd_a2a/agent.py`

```python
# Использование:
# pip install gstd-a2a
# 
# from gstd import Agent
# Agent.run()  # Всё! Агент работает и зарабатывает

class Agent:
    """Zero-Config Autonomous Agent для GSTD Grid"""
    
    @classmethod
    def run(cls, **kwargs):
        """Запускает агент в одну строку"""
        # 1. Автогенерация кошелька если нет
        # 2. Автобутстрап 0.5 GSTD
        # 3. Регистрация в сети
        # 4. Loop: получение задач → выполнение → отправка → получение награды
```

### 1.2 Telegram Mini App — API Endpoints

**Новые эндпоинты для бэкенда:**

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/v1/telegram/init` | POST | Инициализация пользователя из Telegram |
| `/api/v1/telegram/onboard` | POST | Создание кошелька + welcome bonus |
| `/api/v1/telegram/earn/start` | POST | Включить режим заработка |
| `/api/v1/telegram/earn/stop` | POST | Остановить заработок |
| `/api/v1/telegram/stats` | GET | Статистика пользователя |

### 1.3 Welcome Bonus System

**Логика:**
```
НОВЫЙ ПОЛЬЗОВАТЕЛЬ:
1. Подключает Telegram → Создаём custodial wallet
2. Проверяем: first_bonus_claimed = false
3. Если нет → Начисляем 1.0 GSTD из Treasury
4. Устанавливаем first_bonus_claimed = true
```

### 1.4 Multi-Level Referral System

**Структура:**
```
Level 0 (Worker):        100% дохода от задачи
Level 1 (Direct Ref):    5% от Platform Fee
Level 2 (Indirect):      2% от Platform Fee  
Level 3 (Third):         1% от Platform Fee

TOTAL: 8% от Platform Fee идёт на реферальные выплаты
```

---

## ╔══════════════════════════════════════════════╗
## ║  PHASE 2: AGENT MARKETPLACE                 ║
## ╚══════════════════════════════════════════════╝

### 2.1 Agent Registry — Новые Таблицы

```sql
-- Реестр агентов для аренды
CREATE TABLE agent_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_wallet VARCHAR(100) NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT,
    capabilities JSONB DEFAULT '[]',
    pricing_model VARCHAR(20) DEFAULT 'per_task', -- per_task, hourly, subscription
    price_gstd DECIMAL(18,6) NOT NULL,
    trust_score DECIMAL(5,4) DEFAULT 0.5,
    total_rentals INT DEFAULT 0,
    total_earnings DECIMAL(18,6) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Аренды агентов
CREATE TABLE agent_rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agent_registry(id),
    renter_wallet VARCHAR(100) NOT NULL,
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    total_cost_gstd DECIMAL(18,6),
    tasks_executed INT DEFAULT 0
);
```

### 2.2 Burn Mechanism — 5% на Каждую Транзакцию

**Интеграция в PaymentService:**

```go
// При каждой транзакции:
// 1. WorkerReward = 90%
// 2. PlatformFee = 5% (операции, резервы)
// 3. BURN = 5% → Отправляется на burn address

const BURN_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c" // TON Black Hole
const BURN_RATE = 0.05

func (s *PaymentService) ProcessPayment(amount float64) {
    burnAmount := amount * BURN_RATE
    workerAmount := amount * 0.90
    platformFee := amount * 0.05
    
    // Burn tokens (send to black hole)
    s.sendToBurnAddress(burnAmount)
    
    // Track burn for analytics
    s.recordBurn(burnAmount)
}
```

### 2.3 Trust Score для Агентов

**Формула:**
```
TRUST_SCORE = 0.5 * Accuracy + 0.2 * Latency + 0.15 * Reviews + 0.15 * Uptime

Accuracy = successful_tasks / total_tasks
Latency = 1 - (avg_response_time / max_allowed_time)
Reviews = avg_rating / 5
Uptime = online_time / total_time
```

---

## ╔══════════════════════════════════════════════╗
## ║  PHASE 3: VIRAL GROWTH                      ║
## ╚══════════════════════════════════════════════╝

### 3.1 Invite Links Generation

**Формат ссылок:**
```
Telegram Bot: https://t.me/GSTD_Main_Bot?start=ref_{WALLET_HASH}
Web App: https://app.gstdtoken.com?ref={CODE}
```

### 3.2 Gamification System

**XP и Уровни:**
```
Bronze:   0 - 499 XP      (10% stake)
Silver:   500 - 1999 XP   (7% stake)
Gold:     2000 - 9999 XP  (5% stake)
Diamond:  10000+ XP       (1% stake)

XP Sources:
- Task completed: 100 XP
- 5-star rating: +50 XP
- Daily login: 10 XP
- Referral signup: 200 XP
- Referral first task: 100 XP
```

---

# ТЕХНИЧЕСКИЕ ФАЙЛЫ К СОЗДАНИЮ

| Файл | Назначение | Приоритет |
|------|------------|-----------|
| `A2A/python-sdk/gstd_a2a/agent.py` | Zero-Config Agent | 🔴 КРИТИЧНО |
| `A2A/python-sdk/gstd_a2a/auto_wallet.py` | Автогенерация кошелька | 🔴 КРИТИЧНО |
| `backend/internal/services/telegram_onboard_service.go` | Telegram API | 🔴 КРИТИЧНО |
| `backend/internal/services/welcome_bonus_service.go` | Welcome Bonus | 🔴 КРИТИЧНО |
| `backend/internal/services/burn_service.go` | Механизм сжигания | 🟡 ВЫСОКИЙ |
| `backend/internal/services/agent_marketplace_service.go` | Маркетплейс агентов | 🟡 ВЫСОКИЙ |
| `backend/internal/api/telegram_handlers.go` | Telegram handlers | 🔴 КРИТИЧНО |
| `frontend/src/pages/telegram-app.tsx` | Telegram Mini App UI | 🟡 ВЫСОКИЙ |
| `schema_marketplace.sql` | Таблицы для маркетплейса | 🟡 ВЫСОКИЙ |

---

# СЛЕДУЮЩИЕ ШАГИ

1. ✅ Создать Agent SDK 2.0 с `Agent.run()`
2. ✅ Добавить Welcome Bonus Service
3. ✅ Расширить Referral System до 3 уровней
4. ✅ Создать Burn Service
5. ✅ Добавить Agent Marketplace таблицы
6. ✅ Создать Telegram Onboarding API

**Начинаем реализацию...**
