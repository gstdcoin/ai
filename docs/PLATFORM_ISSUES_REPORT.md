# GSTD Platform — Проблемные участки после очистки

**Дата:** 15 февраля 2026

---

## 1. Критичные (влияют на UX)

### TasksPanel — мёртвая кнопка «Create Task»

**Файл:** `frontend/src/components/dashboard/TasksPanel.tsx` (стр. 467–476)

Кнопка «Create Task» в пустом состоянии TasksPanel отправляет событие `openCreateTask`, но **обработчика больше нет** (раньше Dashboard слушал его и открывал NewTaskModal).

**Результат:** Клик по кнопке ничего не делает.

**Рекомендация:** Убрать кнопку или блок `action` в EmptyState для фильтров `my` и `all`.

---

### Marketplace — вкладка «Create Task»

**Файл:** `frontend/src/components/marketplace/Marketplace.tsx`

В Marketplace остаётся вкладка «Create Task» (стр. 233) и форма создания задач (стр. 432+). Это противоречит решению «сеть управляется платформой, задачи создаёт система».

**Рекомендация:** Удалить вкладку `create` и связанную форму, оставить только `jobs` и `my-tasks`.

---

## 2. Мёртвый код (не влияет на работу)

### Backend

| Файл | Описание |
|------|----------|
| `routes.go` | Функция `getLoanQuote` (стр. 1272) — маршрут удалён, функция не вызывается |
| `lending_service.go` | Сервис не используется (удалён из container) |

### Frontend

| Файл | Описание |
|------|----------|
| `BurnStatsWidget.tsx` | Не импортируется |
| `LendingPanel.tsx` | Не импортируется |
| `NewTaskModal.tsx` | Не импортируется |

**Рекомендация:** Удалить для уменьшения бандла и упрощения кода.

---

## 3. Без проблем

- **URL `/dashboard?tab=lending`** — `lending` не в `valid`, откроется `chat` (корректно)
- **localStorage `activeTab=lending`** — не восстанавливается, остаётся `chat` (корректно)
- **CreateTaskModal** — используется в Marketplace, удалять только вместе с вкладкой Create
