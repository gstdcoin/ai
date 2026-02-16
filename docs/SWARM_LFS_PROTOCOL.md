# Swarm LFS — Large File Storage Protocol

**Версия:** 1.0  
**Дата:** 15 февраля 2026  
**Статус:** Активирован

---

## 1. Обзор

Swarm LFS — протокол стриминга тензоров (весов моделей) для распределённой сети GSTD. Минимизирует задержки, экономит трафик и защищает от подмены данных.

```
┌─────────────────┐     HTTP/2 / WebSocket      ┌─────────────────┐
│  LFS Coordinator │ ◄─────────────────────────► │  Worker (Bot)   │
│  (Backend)       │   Block stream + hash        │  LRU Cache      │
└─────────────────┘                              └─────────────────┘
         │                                                │
         │ Quantization (FP32→INT8)                       │ Integrity verify
         │ per block                                      │ per block
         ▼                                                ▼
```

---

## 2. Virtual File System — Стриминг тензоров

### 2.1 Транспорт

| Протокол | Использование |
|----------|---------------|
| **HTTP/2** | Основной: `GET /api/v1/lfs/stream/:model_id/:block_id` — Server Push, multiplexing |
| **WebSocket** | Альтернатива: `wss://.../api/v1/lfs/ws` — бинарный стрим блоков |

### 2.2 Формат блока

```json
{
  "block_id": "qwen2.5-coder:7b:layer:15",
  "seq": 15,
  "total": 32,
  "size_bytes": 65536,
  "hash": "sha256:abc123...",
  "quantized": true,
  "dtype": "int8",
  "payload_b64": "..."
}
```

### 2.3 Endpoints

- `GET /api/v1/lfs/manifest/:model_id` — манифест модели (список блоков, размеры, хэши)
- `GET /api/v1/lfs/stream/:model_id/:block_id` — стрим одного блока
- `GET /api/v1/lfs/stream/:model_id` — стрим всех блоков (Range request)

---

## 3. Smart Caching — LRU для воркера

### 3.1 Логика

- Воркер (Telegram, mobile_worker.js) хранит веса в LRU Cache.
- Ключ: `model_id` + `block_id`
- Максимум: 3 модели × ~50MB = 150MB (настраивается)
- При новой задаче: если модель уже в кэше — пропуск загрузки.

### 3.2 TTL

- Блоки без использования > 30 мин — evict
- При нехватке памяти — evict по LRU

---

## 4. Integrity Check

### 4.1 Хэш-подпись

- Каждый блок: `SHA256(payload)` → `hash` в заголовке
- Клиент проверяет: `SHA256(received) === block.hash`
- При несовпадении — отказ, повторная загрузка, алерт

### 4.2 Защита от MITM

- Хэш передаётся отдельно от payload (в JSON-обёртке)
- Опционально: Ed25519 подпись координатора (будущее)

---

## 5. Bandwidth Optimization — Quantization on-the-fly

### 5.1 Схема

- Исходные веса: FP32 (4 байта/параметр)
- Квантизация: FP32 → INT8 (1 байт) — сжатие ~4×
- Масштаб и zero_point сохраняются в заголовке блока

### 5.2 Формула

```
quantized[i] = round((fp32[i] - zero_point) / scale)
scale = (max - min) / 255
zero_point = -round(min / scale)
```

### 5.3 Обратная деквантизация на клиенте

```
fp32[i] = quantized[i] * scale + zero_point
```

---

## 6. Интеграция

| Компонент | Роль |
|-----------|------|
| Backend `SwarmLFSService` | Манифест, стрим, квантизация, хэш |
| mobile_worker.js | LRU Cache, проверка хэша, деквантизация |
| Telegram Bot | Получает задачи → запрашивает веса через LFS при необходимости |
| PipelineParallelismService | Использует LFS для доставки слоёв на ноды |

---

## 7. Безопасность

- Только HTTPS
- Rate limit: 100 блоков/мин на устройство
- Максимальный размер блока: 2MB
- Session/API key для защищённых маршрутов
