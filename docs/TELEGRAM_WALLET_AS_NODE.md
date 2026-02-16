# Telegram Bot — Wallet-as-Node

## Концепция

**Wallet-as-Node** — кошелёк пользователя становится вычислительным узлом без установки приложения. В Telegram это реализовано через:

1. **/connect &lt;wallet&gt;** — привязка кошелька
2. **Автоматическая активация** — при link вызываются:
   - `ActivateWalletAsNode(wallet)` — создаёт запись в `nodes` (wallet = node_id)
   - `LinkTelegramDevice(tg-{id}, wallet)` — регистрирует устройство в `devices`
3. **/take &lt;task_id&gt;** — пользователь может брать задачи (device_id = tg-{telegram_id})
4. **/complete** — отправка результата и получение награды

## Реализация

| Компонент | Файл | Изменение |
|-----------|------|-----------|
| LinkWallet | `telegram_bot_handler.go` | После link → ActivateWalletAsNode + LinkTelegramDevice |
| DeviceService | `device_service.go` | LinkTelegramDevice(deviceID, wallet) |
| Bot menu | `autonomy/bot/main.go` | Кнопка «⛏ Start Mining» → WebApp ?mining=1 |

## Модель и обучение

- **Ollama**: qwen2.5-coder:7b (основная), llama3 fallback
- **Leviathan**: RecordMiningGrowth при activate-wallet с source=telegram (web flow)
- **Бот /ask**: использует локальный Ollama или DeepSeek cloud

## Полный функционал в боте

| Кнопка | Действие |
|--------|----------|
| 📱 Open App | app.gstdtoken.com — полный дашборд |
| ⛏ Start Mining | Dashboard с mining=1 — Ignite, Settle Rewards |
| 📊 TMA | Mini App — Node Status, Golden Gate |
| 💎 My Balance | Баланс GSTD (linked wallet) |
| 🏆 Golden Gate | XAUt резерв, статистика сети |
| 🚀 My Nodes | Устройства (tg-{id} после link) |
| 📈 Marketplace | Доступные задачи |
| 🎁 Referrals | Реферальная ссылка |

## Команды

- `/connect <wallet>` — привязать кошелёк (Wallet-as-Node)
- `/take <task_id>` — взять задачу
- `/complete <task_id> [yes|no] [confidence] "reasoning"` — отправить результат
- `/ask <query>` — AI (Ollama/DeepSeek)
