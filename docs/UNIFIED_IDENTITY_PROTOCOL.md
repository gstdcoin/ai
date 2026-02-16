# Unified Identity Protocol

**Версия:** 1.0  
**Дата:** 16 февраля 2026

---

## Обзор

Протокол Unified Identity объединяет идентификацию устройств, аутентификацию и регистрацию в единую модель для агентов и людей.

## 1. Global Device Namespace

### Генерация device_id

```
device_id = "gstd_" + hex(SHA256(wallet_address + "|" + platform_fingerprint))[:32]
```

- **wallet_address** — TON-адрес владельца
- **platform_fingerprint** — отпечаток платформы (OS, hostname, device_type, user_agent и т.д.)
- Один и тот же (wallet, fingerprint) всегда даёт один и тот же device_id
- Устраняет коллизии, позволяет видеть все устройства под одним кошельком

### API (Go)

```go
services.GenerateDeviceID(walletAddress, platformFingerprint string) string
services.NormalizeDeviceID(wallet, fingerprint, legacyID string) string
services.PlatformFingerprintFromMetadata(deviceType, hostname, osName, userAgent string) string
```

---

## 2. Hybrid Auth Layer

### Middleware

Объединяет Session (браузер) и API Key (агенты) в общий `UserContext`:

| Источник | AuthSource | wallet_address |
|----------|------------|----------------|
| X-Session-Token / Cookie | `session` | из Redis |
| X-GSTD-API-KEY (sk_sovereign_*) | `sovereign` | из ключа |
| X-GSTD-API-KEY (gstd_*) | `api_key` | из APIKeyService |
| Authorization: Bearer | то же | то же |

### UserContext

```go
type UserContext struct {
    WalletAddress string  // TON-адрес
    AuthSource    string  // "session" | "api_key" | "sovereign" | ""
    UserID        string
    UltraAllowed  bool    // проверяется в handler при необходимости
}
```

### Маршруты с HybridAuth

- `POST /api/v1/chat/completions`
- `GET /api/v1/chat/ultra-status`
- `POST /v1/chat/completions`
- `GET /v1/chat/ultra-status`

Агенты с API key получают доступ к Ultra (при достаточном балансе GSTD) без session.

---

## 3. Unified Registry

### Endpoint

```
POST /api/v1/registry/join
```

**Auth:** Session или API Key (protected)

### Request Body

```json
{
  "wallet_address": "EQ...",
  "referral_code": "ref_XXX",
  "source": "swarm | browser | telegram | agent | desktop",
  "platform_fingerprint": "Linux|hostname|swarm",

  "name": "Node-Name",
  "specs": { "type": "swarm", "capabilities": [...], "hostname": "...", "os": "..." },

  "device_id": "legacy-id",
  "device_type": "browser | android | ios | desktop | swarm | telegram",
  "device_info": "...",
  "pow_nonce": "...",
  "cpu_score": 0,
  "ram_gb": 0,
  "public_key": "..."
}
```

### Определение типа

| source / device_type / specs.type | Результат |
|-----------------------------------|-----------|
| swarm, agent, desktop | **node** |
| browser, telegram, mobile | **device** |
| specs.capabilities | **node** |
| device_type + device_id | **device** |

### Response

```json
{
  "type": "node" | "device",
  "id": "node_id или device_id",
  "wallet": "EQ...",
  "message": "...",
  "registered": { ... }
}
```

### Обратная совместимость

- `POST /api/v1/nodes/register` — по-прежнему работает
- `POST /api/v1/devices/register` — по-прежнему работает
- Swarm client по умолчанию использует `/registry/join` с `platform_fingerprint`
