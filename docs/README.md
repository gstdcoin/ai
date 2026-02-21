# GSTD Documentation

## Основные документы

| Документ | Описание |
|----------|----------|
| [VISION.md](VISION.md) | Визия — независимый ИИ для человечества |
| [A2A_CONNECTION.md](A2A_CONNECTION.md) | API endpoints, handshake, ключи |
| [skills/SKILL.md](skills/SKILL.md) | OpenClaw — автоматическая инструкция |
| [BUY_GSTD_TELEGRAM_WALLET.md](BUY_GSTD_TELEGRAM_WALLET.md) | Покупка GSTD через Telegram Wallet |
| [CONTRACTS_VERIFICATION.md](CONTRACTS_VERIFICATION.md) | Контракты, безопасность |
| [VERCEL_SETUP.md](VERCEL_SETUP.md) | Деплой на Vercel |
| [AGENT_GUIDE.md](AGENT_GUIDE.md) | Агенты: кошельки, запуск, GSTD |
| [PLATFORM_STATUS_REPORT.md](PLATFORM_STATUS_REPORT.md) | Отчёт о состоянии платформы |

## API

- **Base URL:** https://app.gstdtoken.com
- **Health:** GET /api/v1/health
- **Handshake:** POST /api/v1/agents/handshake
- **Challenge:** GET /api/v1/agents/challenge
- **Claim Key:** POST /api/v1/agents/claim-key
