# ✅ GSTD Контракт настроен

## 🎯 Конфигурация

- **GSTD Jetton Address**: `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO`
- **Network**: `mainnet`
- **API Key**: Настроен (10 req/s)

## ✅ Что обновлено

### 1. .env файл
- ✅ `GSTD_JETTON_ADDRESS` установлен на адрес контракта
- ✅ `TON_NETWORK` изменён на `mainnet`

### 2. Backend
- ✅ Перезапущен с новой конфигурацией
- ✅ Использует mainnet для всех запросов
- ✅ Проверяет баланс GSTD по указанному адресу

## 🔧 Текущая конфигурация

```bash
TON_API_URL=https://tonapi.io
TON_API_KEY=6512ff28fd1ffc8e29b7230642e690b410f7c68e15ef74c4e81e17e9f7a65de6
TON_NETWORK=mainnet
GSTD_JETTON_ADDRESS=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO
TON_CONTRACT_ADDRESS=
```

## 🚀 Использование

### Проверка баланса GSTD
```bash
curl "https://app.gstdtoken.com/api/v1/wallet/gstd-balance?address=EQD..."
```

### В коде
```go
// Проверка баланса
balance, err := tonService.GetJettonBalance(ctx, address, "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO")

// Проверка наличия GSTD (минимум 1)
hasGSTD, err := tonService.CheckGSTDBalance(ctx, address, "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO")
```

## 📊 Как работает

1. **При создании задания:**
   - Проверяется баланс GSTD на адресе заказчика
   - Используется адрес: `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO`
   - Минимум 1 GSTD требуется для участия

2. **API endpoint:**
   - `GET /api/v1/wallet/gstd-balance?address=<address>`
   - Возвращает баланс GSTD и флаг `has_gstd`

3. **Network:**
   - Все запросы идут в mainnet
   - Используется production TON API

## 🔍 Проверка

### 1. Проверить конфигурацию
```bash
grep -E "GSTD_JETTON_ADDRESS|TON_NETWORK" .env
```

### 2. Проверить backend
```bash
docker-compose ps backend
docker-compose logs backend | tail -5
```

### 3. Проверить API
```bash
curl "https://app.gstdtoken.com/api/v1/wallet/gstd-balance?address=EQD..."
```

## ⚠️ Важно

- **Mainnet**: Все запросы идут в production сеть
- **GSTD контракт**: Используется указанный адрес для проверки баланса
- **Минимум 1 GSTD**: Требуется для создания заданий

## 📚 Документация

- [TON_API_READY.md](./TON_API_READY.md) - настройка TON API
- [API_KEY_CONFIGURED.md](./API_KEY_CONFIGURED.md) - детали API ключа

## ✅ Готово!

Система настроена для работы с GSTD контрактом в mainnet:
- ✅ Адрес контракта настроен
- ✅ Network установлен на mainnet
- ✅ Backend перезапущен
- ✅ API готов к работе

