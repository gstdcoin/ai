# GSTD: навигация по проекту / project map

Начните с [пошагового руководства](START_HERE.md). Установить нужно только [ноду](https://github.com/gstdcoin/gstdbot), если вы предоставляете вычисления. Для ИИ достаточно [чата](https://app.gstdtoken.com/ru/chat) или [Telegram-бота](https://t.me/gstdaibot).

## Какой репозиторий для чего

| Репозиторий | Назначение | Кому нужен |
| --- | --- | --- |
| [ai](https://github.com/gstdcoin/ai) | Приложение, API, единый реестр, платёжный учёт и Telegram webhook | Разработчики платформы; бот работает здесь |
| [gstdbot](https://github.com/gstdcoin/gstdbot) | Установка ноды, модели, панель оператора и исполнитель заданий | Владельцы оборудования; это **не** отдельный Telegram-бот |
| [web](https://github.com/gstdcoin/web) | Публичный сайт, объяснение, установка, документация | Посетители и авторы сайта |
| [contracts](https://github.com/gstdcoin/contracts) | TON-контракты, воспроизводимые тесты, записи развёртывания | Разработчики расчётов; публикация исходников не означает развёртывание |
| [A2A](https://github.com/gstdcoin/A2A) | SDK и локальный MCP-коннектор | Авторы приложений и ИИ-агентов; примеры-мониторы сами задания не исполняют |
| [gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Отложенное исследование моста | Не использовать для переводов; средств не принимает |
| [gstdcoin](https://github.com/gstdcoin/gstdcoin) | Профиль проекта и ссылки | Общая навигация |

## Актуальные инструкции

- [Пользователю: ИИ, нода, кошелёк, оплата](START_HERE.md).
- [Что включено и что ещё не проверено](READINESS.md).
- [Сайт, приложение, бот и способы доставки работы](ECOSYSTEM.md).
- [Telegram: возможности, паузы и развитие через полезность](TELEGRAM_UTILITY.md).
- [Тариф владельца ноды и котировка GSTD](MARKET_PRICING.md).
- [Внутренний баланс и распределение 85/10/5](FINANCE_V2.md).
- [Вывод с внутреннего баланса](WITHDRAWALS_AND_PRIVACY.md).
- [Отдельные mainnet-контракты заданий](MAINNET_ESCROW.md).
- [Резерв GSTD/XAUt0: экономика и ограничения](AUTONOMOUS_ECONOMY.md).
- [Управление нодой кнопками](https://github.com/gstdcoin/gstdbot/blob/main/docs/OPERATOR_PANEL.md).
- [Hugging Face и установка моделей](https://github.com/gstdcoin/gstdbot/blob/main/docs/HUGGINGFACE.md).

Документы `ARCHIVED_*` сохраняют историю и не являются инструкциями запуска. RFC и дизайн-заметки описывают предложения. Вопрос о готовности решается по READINESS, живому реестру и подтверждённым операциям, а не по числу репозиториев или зелёной сборке.

## English

Use [Start here](START_HERE.md) for AI, node setup and payments; [Readiness](READINESS.md) for evidence and remaining gates. The platform and Telegram webhook live in **ai**, the canonical compute node in **gstdbot**, the public website in **web**, contract sources/tests in **contracts**, agent clients/MCP in **A2A**. The bridge is deferred research. Do not install every repository or send funds to undeployed contracts. Archived documents and RFCs are historical or proposed behavior, not production activation.
