# GSTD Swarm × Bitchat — Offline Mesh Integration

[bitchat](https://bitchat.free/) — децентрализованный P2P мессенджер по **Bluetooth mesh**. Без интернета, без серверов, без номеров телефонов.

GSTD Swarm интегрирует bitchat как **офлайн-транспорт** для узлов в физической близости.

---

## Зачем

| Сценарий | Решение |
|----------|---------|
| Интернет отключён | bitchat — mesh по Bluetooth |
| Протесты, катастрофы | Сеть работает без инфраструктуры |
| Ограниченный доступ | Узлы ретранслируют через несколько хопов |
| Цензура | Нет централизованных серверов |

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    GSTD SWARM (Online)                       │
│  app.gstdtoken.com  │  Tasks  │  Hive  │  GSTD Economy       │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Bridge Node     │  ← Имеет интернет
                    │  (bitchat + API)  │
                    └─────────┬─────────┘
                              │ Bluetooth Mesh
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ Node A   │◄───────►│ Node B   │◄───────►│ Node C   │
   │ Offline  │ bitchat │ Offline  │ bitchat │ Offline  │
   └──────────┘         └──────────┘         └──────────┘
```

---

## Протокол Swarm-over-Bitchat

Сообщения в bitchat — JSON, префикс `gstd:` для swarm.

### Типы сообщений

| Type | Payload | Описание |
|------|---------|----------|
| `gstd:task` | task_id, type, reward, payload | Задача для выполнения |
| `gstd:result` | task_id, device_id, result | Результат (для relay на bridge) |
| `gstd:status` | device_id, wallet, capabilities | Heartbeat узла |
| `gstd:recall` | topic, query | Запрос к Hive (через bridge) |

### Формат

```json
{
  "v": 1,
  "type": "gstd:task",
  "ts": 1737500000,
  "payload": {
    "task_id": "uuid",
    "task_type": "AI_INFERENCE",
    "reward_gstd": 0.05,
    "payload": {"prompt": "..."}
  }
}
```

---

## Использование

### 1. Установка bitchat

- **iOS/macOS:** [App Store — bitchat mesh](https://apps.apple.com/app/bitchat-mesh) | [GitHub](https://github.com/permissionlesstech/bitchat)
- **Android:** [Play Store — bitchat](https://play.google.com/store/apps/details?id=...) | [GitHub](https://github.com/permissionlesstech/bitchat-android)

### 2. Bridge-узел (с интернетом)

Узел с доступом к API и bitchat:
- Получает задачи с `GET /tasks/pending`
- Рассылает в bitchat mesh
- Собирает результаты из bitchat и отправляет `POST /device/tasks/:id/result`

### 3. Офлайн-узлы

- Принимают `gstd:task` из bitchat
- Выполняют (inference, compute)
- Отправляют `gstd:result` обратно в mesh
- Bridge доставляет на API при появлении связи

---

## Связка с GSTD

| Действие | Online | Offline (bitchat) |
|----------|--------|-------------------|
| Получить задачу | GET /tasks/pending | gstd:task в mesh |
| Взять задачу | POST /device/tasks/:id/claim | Локальный claim по task_id |
| Отправить результат | POST /device/tasks/:id/result | gstd:result → bridge → API |
| Баланс | GET /users/balance | Кэш + синхронизация при online |

**Награды:** Зачисляются при доставке результата через bridge. Wallet в `gstd:status` и `gstd:result`.

---

## Безопасность

- **Подпись:** payload подписывается wallet (Ed25519), проверка на bridge
- **Replay:** ts + nonce в сообщении
- **Максимальный размер:** bitchat ограничивает сообщения — сжимать payload

---

## Статус

- **Протокол:** Спецификация готова
- **Bridge:** Референсная реализация — в планах
- **bitchat:** [bitchat.free](https://bitchat.free/) — Public Domain

---

*GSTD Foundation × [permissionlesstech](https://bitchat.free/)*
