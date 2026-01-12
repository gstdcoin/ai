# Реализация валидации TonConnect

## Обзор

Реализована полная валидация подписи TonConnect в эндпоинте `/api/v1/users/login`. Система теперь проверяет, что пользователь действительно владеет кошельком перед созданием сессии.

## Компоненты

### 1. TonConnectValidator (`backend/internal/services/tonconnect_validator.go`)

Сервис для валидации подписей TonConnect:

- **ValidateSignature()** - основная функция валидации:
  - Парсит payload (JSON или формат `nonce:timestamp:address`)
  - Проверяет timestamp (не старше 10 минут, не в будущем)
  - Проверяет nonce (не пустой)
  - Проверяет соответствие адреса в payload и запросе
  - Декодирует подпись (base64 или hex)
  - Получает публичный ключ из адреса кошелька через TON API
  - Проверяет Ed25519 подпись

### 2. Обновленный loginUser (`backend/internal/api/routes_user.go`)

Эндпоинт теперь:
- Принимает `wallet_address`, `signature` и `payload`
- Валидирует подпись через TonConnectValidator
- Возвращает 401 Unauthorized при невалидной подписи
- Создает сессию в Redis после успешной валидации
- Возвращает `session_token` для дальнейшей аутентификации

### 3. Обновленный фронтенд (`frontend/src/components/WalletConnect.tsx`)

Функция `loginUser()` теперь:
- Генерирует payload с nonce и timestamp
- Хеширует payload через SHA-256
- Подписывает хеш через TonConnect v2
- Отправляет подпись и payload на бэкенд
- Сохраняет session_token в localStorage

## Формат данных

### Payload (JSON)
```json
{
  "nonce": "random_string",
  "timestamp": 1234567890,
  "address": "EQ..."
}
```

### Payload (простой формат)
```
nonce:timestamp:address
```

### Signature
- Base64 или hex строка
- 64 байта (Ed25519)

## Безопасность

1. **Timestamp validation**: Подпись недействительна, если старше 10 минут
2. **Nonce validation**: Предотвращает replay атаки
3. **Address verification**: Адрес в payload должен совпадать с адресом в запросе
4. **Public key resolution**: Публичный ключ получается через TON API (с кэшированием)
5. **Ed25519 verification**: Криптографическая проверка подписи

## Сессии в Redis

После успешной валидации создается сессия:
- **Key**: `session:{session_token}`
- **TTL**: 24 часа
- **Data**:
  - `wallet_address`: адрес кошелька
  - `user_id`: ID пользователя
  - `created_at`: время создания
  - `last_access`: время последнего доступа

## Использование

### Фронтенд
```typescript
const payload = JSON.stringify({
  nonce: generateNonce(),
  timestamp: Math.floor(Date.now() / 1000),
  address: walletAddress,
});

const hash = await sha256(payload);
const signature = await tonConnectUI.connector.signData({
  data: hash,
  version: 'v2',
});

const response = await fetch('/api/v1/users/login', {
  method: 'POST',
  body: JSON.stringify({
    wallet_address: walletAddress,
    signature: signature.signature,
    payload: payload,
  }),
});
```

### Бэкенд
```go
validator := services.NewTonConnectValidator(tonService)
err := validator.ValidateSignature(
    ctx,
    walletAddress,
    signature,
    payload,
    10*time.Minute,
)
```

## Обработка ошибок

- **400 Bad Request**: Отсутствуют обязательные поля
- **401 Unauthorized**: Невалидная подпись или истекший timestamp
- **500 Internal Server Error**: Ошибка создания пользователя или сессии

## Зависимости

- `crypto/ed25519` - проверка подписи
- `crypto/sha256` - хеширование payload
- `github.com/redis/go-redis/v9` - хранение сессий
- TONService - получение публичного ключа

## Тестирование

Для тестирования можно использовать:
1. Валидную подпись от TonConnect
2. Истекшую подпись (timestamp > 10 минут назад)
3. Невалидную подпись (неправильный формат)
4. Подпись с несовпадающим адресом

## Миграция

Старый код без валидации подписи больше не работает. Все клиенты должны обновиться для отправки `signature` и `payload`.
