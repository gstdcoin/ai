# GSTD: start here / начните здесь

## Русский

GSTD соединяет людей, которым нужен ИИ, и операторов вычислительных нод. Начать можно без покупки токенов. Оплачивается только явно выбранная платная сетевая работа.

### 1. Мне нужен ответ ИИ

1. Откройте [чат](https://app.gstdtoken.com/ru/chat). Бесплатные запросы зависят от квоты и доступных исполнителей.
2. Выберите модель. Если её нет, выберите другую самостоятельно: список не создаёт доступ к отсутствующему оборудованию.
3. Для передачи запроса другой ноде дайте явное согласие. Исполнитель видит запрос; не отправляйте ему секреты.
4. Для платного запроса проверьте модель, цену и способ расчёта до подтверждения. Ошибка или недоступность не означает согласие на подмену модели.

### 2. Хочу запустить ноду

1. Откройте [установку](https://gstdtoken.com/nodes?lang=ru). Основные цели — Linux x86-64/ARM64 и WSL2; модель и драйверы должны подходить оборудованию. Один Bash-установщик не поддерживает буквально любое устройство.
2. После установки откройте **адрес панели, который напечатал установщик**. Обычно это локальный порт 8080; не используйте чужой IP из примера. Для первого входа нужен локальный setup-token, затем PIN. Обычные действия выполняются кнопками.
3. В **«Кошельке начислений»** укажите свой публичный TON-адрес и нажмите **«Привязать мой кошелёк»**. Дождитесь подтверждения. Seed-фраза и приватный ключ не нужны. Старые задания и балансы не переносятся.
4. В **«Каталоге моделей»** выберите вариант по оценке RAM/диска либо публичный GGUF из Hugging Face. Скачайте и проверьте локальным запросом. Оценка совместимости не гарантирует запуск или скорость.
5. Проверьте регистрацию, heartbeat и свободный вычислительный слот. Для исходящей очереди публичный входящий порт не нужен; прямому чату нужен защищённый доступный HTTPS-маршрут. Не публикуйте Ollama напрямую.
6. Обновление исходной установки запускается из панели, с проверкой версии и подтверждением. Docker и системный HTTPS-компонент имеют отдельные процедуры обслуживания: [руководство оператора](https://github.com/gstdcoin/gstdbot/blob/main/docs/OPERATOR_PANEL.md).

У каждой машины своя идентичность ноды. Кластер сейчас распределяет запросы по отдельным нодам; память нескольких GPU/компьютеров автоматически не объединяется для одной модели. Текущий лимит регистрации — десять живых идентичностей на регистрационный кошелёк.

### 3. Как получать и тратить GSTD

[Купить GSTD: понятные шаги](https://app.gstdtoken.com/ru/buy). Новая доля протокола автоматически зачисляется подтверждённому администратору в обеспеченный баланс; 5% остаются отдельным резервом для выбранного пула GSTD/XAUt0. Автоматическое пополнение пула пока не развёрнуто. [Политика и границы автономности](AUTONOMOUS_ECONOMY.md).

| Путь | Что означает баланс | Кто подписывает выплату |
| --- | --- | --- |
| [Баланс платформы](https://app.gstdtoken.com/ru/payments) | Обеспеченные средства и принятые оплаченные задания в учёте платформы | Владелец кошелька обеспечения после заявки пользователя |
| [Mainnet escrow · открытая бета](https://app.gstdtoken.com/ru/escrow-mainnet) | Отдельное задание и средства в его контрактах; это не баланс платформы | Плательщик резервирует и принимает; каждый получатель сам подписывает получение своей доли |
| [Testnet](https://app.gstdtoken.com/ru/escrow) | Тестовые TON и tGSTD без реальной стоимости | Тестовые кошельки; не путать с mainnet |

Только принятая оплаченная работа: **85% исполнителю, 10% протоколу, 5% резерву**. Дополнительной комиссии GSTD за получение нет; газ TON оплачивает подписант. Установка, онлайн и бесплатные запросы не создают наград. Спрос и доход не гарантированы.

Привязать адрес в панели ноды и доказать владение кошельком в приложении — разные действия. В приложении подключите **тот же адрес**, выберите правильную сеть и подтвердите владение. Не сообщайте seed-фразу или приватный ключ ни ноде, ни сайту, ни боту.

В escrow сначала выберите точную модель и исполнителя, введите запрос, согласитесь на передачу, подготовьте задание и **сохраните приватные данные восстановления**. Затем подпишите развёртывание и полное резервирование, разрешите вычисление, проверьте ответ и отдельно примите работу. Получатель открывает данные этого задания и подписывает получение. При неопределённом исходе не подписывайте повторно: проверьте блокчейн. При просрочке непринятого задания доступен возврат плательщику. Контракт не оценивает качество ИИ и не решает споры.

Видимые до подписи бюджеты TON — суммы, прикладываемые к сообщениям, а не измеренная комиссия. Mainnet RPC проверен; реальный mainnet-цикл оплаты и выплаты **ещё не подтверждён**. Полный цикл с реальной нодой прошёл в testnet. [Состояние проверок](READINESS.md).

### 4. Создаю приложение

[API и SDK](https://gstdtoken.com/developers?lang=ru). Используйте точный идентификатор модели, обрабатывайте недоступность и лимиты. Для работника нужна постоянная подписывающая Ed25519-идентичность; один адрес кошелька не авторизует запросы. [A2A](https://github.com/gstdcoin/A2A) экспериментальный; стандартная нода — [gstdbot](https://github.com/gstdcoin/gstdbot). Наличие примера не доказывает, что сервис включён.

### Если что-то не работает

- **Нет модели:** установите её локально или выберите доступную в сети. Импорт Hugging Face поддерживает публичные одиночные GGUF, совместимые с Ollama; закрытые и разбитые модели не обещаются.
- **Нода онлайн, заданий нет:** проверьте модель, регистрацию и слот. Без оплаченного спроса очередь может быть пустой.
- **Баланс не совпал:** сравните адрес, сеть и способ расчёта. Средства escrow не отображаются как внутренний баланс платформы.
- **Кошелёк не открывает запрос:** проверьте сеть и поддержку TON Connect text-signing. Не отправляйте перевод вручную на случайный адрес.
- **Telegram:** [@gstdaibot](https://t.me/gstdaibot) — интерфейс платформы. Полная проверка доставки и языка Mini App на устройстве пользователя остаётся отдельным сценарием.
- **Сбой/восстановление:** сохраните приватную копию ключей ноды и конфигурации; не запускайте две копии одной идентичности. [Восстановление](https://github.com/gstdcoin/gstdbot/blob/main/docs/RECOVERY_REHEARSAL.md).

## English

### Use AI

Open [chat](https://app.gstdtoken.com/chat), choose an available model and explicitly consent before sharing a prompt with another node. Free access depends on quotas and capacity; buying GSTD is not required to start. An unavailable model is not silently replaced. Check the executor, price and payment method before paid work.

### Run a node

1. Follow [installation](https://gstdtoken.com/nodes?lang=en) on Linux x86-64/ARM64 or WSL2. Hardware, Ollama and GPU drivers need validation.
2. Open **the dashboard address printed by your installer**. First setup uses the local setup token and a new PIN. Routine management uses dashboard buttons.
3. In **Reward wallet**, bind your public TON address. Keep the node identity; existing balances and assigned jobs retain their previous recipient. Never provide a seed phrase or private key.
4. Download a resource-compatible model from **Model directory**, a public Hugging Face GGUF or an explicit supported Ollama name. Test a local prompt first. Estimates are not runtime or speed guarantees.
5. Check registration, heartbeat and a free compute slot. Outbound assigned work needs no public incoming port; direct chat needs a reachable protected HTTPS endpoint. Never expose Ollama directly.
6. Use the dashboard's reviewed source update workflow. Docker and privileged HTTPS software have separate maintenance procedures: [operator guide](https://github.com/gstdcoin/gstdbot/blob/main/docs/OPERATOR_PANEL.md).

Each machine has its own identity. Multi-host installations distribute requests; they do not automatically pool memory for one model. Registration currently permits ten live identities per registration wallet.

### Payments

[Buy GSTD](https://app.gstdtoken.com/buy). New protocol revenue is automatically credited to its confirmed beneficiary in the backed ledger; the 5% remains separate for the selected GSTD/XAUt0 pool. Automatic liquidity provision is not deployed. [Economic policy and autonomy boundaries](AUTONOMOUS_ECONOMY.md).

- [Platform balance](https://app.gstdtoken.com/payments): backed internal credits and withdrawal requests. The custody wallet owner signs payouts.
- [Mainnet escrow · open beta](https://app.gstdtoken.com/escrow-mainnet): a separate job and on-chain funds. The payer signs funding and acceptance; each beneficiary signs their own claim. Platform balances are not migrated.
- [Testnet](https://app.gstdtoken.com/escrow): valueless test TON/tGSTD, separate wallets and network.

Accepted paid work splits **85% executor / 10% protocol / 5% reserve**. No extra GSTD claim fee; signers pay TON gas. Installation, free inference and being online do not earn rewards. Demand and income are not guaranteed.

Binding a public address on the node is not wallet authentication in the app. Connect the same address and correct network, then prove ownership. In escrow: choose the exact model/node, consent, prepare, save private recovery, deploy/fund, authorize computation, review and accept, then claim. Do not repeat an uncertain transfer; check chain state. Expired unaccepted work can be refunded. Contracts do not judge AI quality or arbitrate disputes.

Attached TON budgets are not measured consumed fees. Mainnet RPC verification passed; a real mainnet payment/payout cycle is **not yet verified**. The real-node testnet cycle passed. [Readiness](READINESS.md).

### Build and troubleshoot

Use the [API documentation](https://gstdtoken.com/developers?lang=en) and signed clients. A wallet address is not node authentication. A2A is experimental; use the canonical node for compute. Handle exact-model unavailability, quotas and errors.

No work may mean no funded demand. Missing rewards may mean a different wallet, network or payment path. Public single-file GGUF imports still need Ollama architecture support. Telegram delivery and Mini App language need a real user-device check. Keep node identity/configuration backups private; recovery on another physical machine remains a release gate.

## Deployment boundaries / ограничения

One physical compute node is verified. The platform registry, Redis, DNS and hosting are central dependencies. Multiple independent operators, clean ARM64/GPU installs, cross-device uncertain-transaction recovery and a full disaster-recovery drill are not established by passing CI. The bridge is deferred research and must not receive funds. Source-available licensing is not OSI open source; see [licensing](LICENSING.md).
