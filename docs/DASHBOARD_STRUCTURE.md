# GSTD Dashboard — Структура и Блок-схема

## 1. Целевой функционал (из ТЗ и платформы)

| Блок | Назначение | Приоритет |
|------|------------|-----------|
| **Кошелёк** | Баланс GSTD/TON, вывод, синхронизация | P0 |
| **Майнинг** | Ignite/Stop, статус ноды, незабранные награды | P0 |
| **Задачи** | Создать, взять, выполнить, получить выплату | P0 |
| **Чат** | AI Chat (Sovereign) | P0 |
| **Рефералы** | Ссылка, приглашённые, доход | P1 |
| **Статистика** | Золотой резерв, сеть, пул | P1 |
| **Устройства** | Ноды, флот, команды | P1 |
| **Маркетплейс** | Задачи, покупка/продажа | P1 |
| **Агенты** | Маркетплейс агентов | P2 |
| **Кредитование** | Lending (USDT под залог GSTD) | P2 |
| **Помощь** | FAQ, инструкции | P1 |

---

## 2. Блок-схема навигации (Mermaid)

```mermaid
flowchart TB
    subgraph Header
        A[Leviathan Ticker]
        B[Header: Wallet | Create Task | Logout]
    end

    subgraph Nav["Навигация (5 пунктов)"]
        N1[Главная / Mining]
        N2[Чат]
        N3[Задачи]
        N4[Устройства]
        N5[Ещё]
    end

    subgraph Home["Главная"]
        H1[SovereignSwitch: Master/Worker]
        H2[Ignite: Start/Stop]
        H3[Settle Rewards]
        H4[Wallet Balance]
        H5[Yield Mult + Referrals]
        H6[Activity Feed]
    end

    subgraph More["Ещё (подменю)"]
        M1[Статистика]
        M2[Кредитование]
        M3[Агенты]
        M4[Маркетплейс]
        M5[Рефералы]
        M6[Помощь]
        M7[Agent Node → /agent]
    end

    Nav --> Home
    Nav --> More
```

---

## 3. Упрощённая навигация (5 пунктов)

| Пункт | Иконка | Содержимое |
|-------|--------|------------|
| **Главная** | Hammer | Майнинг, баланс, рефералы, активность |
| **Чат** | MessageSquare | AI Chat |
| **Задачи** | ListTodo | Создать, мои, доступные |
| **Устройства** | Server | Ноды, флот |
| **Ещё** | MoreHorizontal | Статистика, Маркетплейс, Агенты, Рефералы, Кредитование, Помощь |

---

## 4. Эргономика

1. **Главный экран** — 2 крупные действия: Ignite и Settle Rewards.
2. **Блоки** — карточки с чёткими заголовками и иконками.
3. **Порядок** — сверху вниз: действия → баланс → детали.
4. **Мобильная** — Bottom Nav 5 пунктов, FAB для создания задачи.
5. **Десктоп** — Sidebar с полным списком вкладок.

---

## 5. Локализация

Все строки в `common.json` (en/ru). Добавлены ключи:
- `more`, `unclaimed`, `settle_rewards`, `platform_node`, `ignite`, `igniting`, `mining_online`, `mining_stop`, `mining_start`, `wallet_label`
- `copy_link`, `referral_program`, `referral_desc`, `your_referral_code`, `total_referrals`, `total_earnings`, `have_invite_code`, `apply`, `referral_applied`
- `hive_intelligence`, `claim_rewards_connect`, `rewards_claimed`, `claim_failed`, `no_rewards_ready`
