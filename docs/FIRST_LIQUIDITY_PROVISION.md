# First Liquidity Provision — запуск маховика Dynamic Gold Backing

Чтобы запустить механизм Dynamic Gold Backing, выполните первую транзакцию пополнения ликвидности.

## Предварительные условия

1. **ADMIN_WALLET** — на кошельке должно быть ≥10–20 GSTD (накопленная комиссия)
2. **Backend** — сервер должен быть запущен
3. **Сессия** — для protected routes нужен логин через TonConnect

## Способ 1: Через Dashboard (рекомендуется)

1. Войдите в Dashboard с **ADMIN_WALLET** (TonConnect)
2. В блоке **Golden Reserve Fund** нажмите **Add Liquidity**
3. Введите количество GSTD (например, 10) и XAUt (0 для single-sided)
4. Нажмите **Prepare**
5. Откройте ссылку **Open Ston.fi Pool** и добавьте ликвидность вручную
6. Подпишите транзакцию в кошельке
7. Через ~60 сек PaymentWatcher зафиксирует минт LP
8. Блок **Dynamic Gold Backing** загорится на главной в реальном времени

## Способ 2: Через скрипт

```bash
# Экспортируйте переменные
export ADMIN_WALLET=UQ...   # Ваш admin-кошелёк
export SESSION_TOKEN=...   # Из localStorage после логина в Dashboard
export AMOUNT_GSTD=10      # Опционально, по умолчанию 10
export AMOUNT_XAUT=0       # Опционально

# Запуск
./scripts/first_liquidity_provision.sh http://localhost:8080 $ADMIN_WALLET
```

## Способ 3: Прямой вызов API

```bash
curl -X POST "https://app.gstdtoken.com/api/v1/admin/commission/prepare-liquidity" \
  -H "Content-Type: application/json" \
  -H "X-Wallet-Address: $ADMIN_WALLET" \
  -H "X-Session-Token: $SESSION_TOKEN" \
  -d '{"amount_gstd": 10, "amount_xaut": 0}'
```

## После транзакции

- **PaymentWatcher** проверяет LP каждые 60 сек
- При обнаружении минта LP логируется: `PaymentWatcher: LP mint detected for ...`
- **Dynamic Gold Backing** на Dashboard обновляется каждые 15 сек (при platform_share > 0)
- Блок показывает: Total Pool Liquidity и Our Share

## Прямая ссылка на пул Ston.fi

https://app.ston.fi/pools/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp
