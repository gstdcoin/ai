# A2A ↔ Платформа GSTD — Аудит соответствия

**Дата:** 15 февраля 2026  
**Цель:** Агенты должны использовать пользовательский интерфейс (API) и предоставление ресурсов

---

## 1. Текущее состояние

### ✅ Работает (соответствует платформе)

| Функция A2A | API платформы | Статус |
|-------------|---------------|--------|
| `register_node` | `POST /api/v1/nodes/register` | ✅ Работает (wallet из header) |
| `get_pending_tasks` | `GET /api/v1/tasks/worker/pending` | ✅ |
| `submit_result` | `POST /api/v1/tasks/worker/submit` | ✅ |
| `send_heartbeat` | `POST /api/v1/nodes/heartbeat` | ⚠️ Проверить путь |
| `create_task` / `outsource_computation` | `POST /api/v1/tasks/create` | ✅ API существует (агенты могут создавать задачи) |
| `get_balance` | `GET /api/v1/users/balance` | ✅ |
| `store_knowledge` / `memorize` | `POST /api/v1/knowledge/store` | ✅ |
| `query_knowledge` / `recall` | `GET /api/v1/knowledge/query` | ✅ |
| `discover_agents` | `GET /api/v1/nodes/public` | ✅ |
| `hire_agent` | `POST /api/v1/marketplace/rentals` | ✅ |
| `get_marketplace_agents` | `GET /api/v1/marketplace/agents` | ✅ |

### ❌ Отсутствует в A2A SDK

| Возможность платформы | API | Проблема |
|-----------------------|-----|----------|
| **Inference (AI Chat)** | `GET /api/v1/infer?prompt=...` | Нет метода в GSTDClient |
| **Chat Completions** | `POST /api/v1/chat/completions` | Нет метода в GSTDClient |
| **Пользовательский интерфейс** | Dashboard, Chat UI | Агенты используют API, не браузер — это нормально |

### ⚠️ Несоответствия

| SDK | Платформа | Рекомендация |
|-----|-----------|--------------|
| `register_node` отправляет `capabilities`, `type` | Backend ожидает `name`, `specs` | Backend игнорирует capabilities; добавить `specs.capabilities` или принять capabilities в backend |
| `referrer_id` в payload | Backend ожидает `referral_code` | Переименовать в SDK или поддержать оба в backend |
| `LLMService` вызывает Ollama напрямую | Платформа: `/chat/completions`, `/infer` | LLMService не использует платформу — для агентов нужен `platform_infer()` |

---

## 2. Рекомендации

### 2.1 Добавить в GSTDClient методы для доступа к UI-функциям (Inference)

Агенты должны иметь возможность вызывать inference платформы (аналог Chat в UI):

```python
# Предлагаемый API
def infer(self, prompt: str, model: str = "full") -> dict:
    """Вызов inference платформы (GET /api/v1/infer). Публичный, без auth."""
    ...

def chat_completions(self, messages: list, model: str = "qwen2.5-coder:7b") -> dict:
    """OpenAI-совместимый chat (POST /api/v1/chat/completions). Оплата GSTD при Ultra."""
    ...
```

### 2.2 Унифицировать register_node

- Вариант A: Backend принимает `capabilities` и маппит в `specs.capabilities`
- Вариант B: SDK отправляет `specs: {"capabilities": capabilities}`

### 2.3 Ресурсы (Provisioning)

Предоставление ресурсов уже реализовано:
- **Создание задач** — `create_task` → платформа выполняет
- **Регистрация как воркер** — `register_node` → агент получает задачи
- **Аренда агентов** — `hire_agent` → маркетплейс

---

## 3. Итог

| Критерий | Статус |
|----------|--------|
| Агенты используют API платформы | ✅ Частично — нет infer/chat в SDK |
| Предоставление ресурсов | ✅ create_task, register_node, hire_agent |
| Соответствие endpoints | ⚠️ Мелкие несоответствия (referrer_id, capabilities) |

**Исправлено:** Добавлены `infer()`, `chat_completions()` в GSTDClient и MCP-инструменты `platform_infer`, `platform_chat`. Агенты теперь могут использовать AI платформы без локального Ollama.
