# Clean Core Protocol

**Версия:** 1.0  
**Дата:** 15 февраля 2026  
**Статус:** Активирован

---

## 1. Обзор

Clean Core — протокол, при котором сервер не хранит модели на диске. Модели живут в сети; сервер выступает как Proxy-Balancer и координатор.

- **Shard-First**: При загрузке модели → рассылка manifest, модель в сети
- **Availability Staking**: Proof-of-Storage каждые 10 мин, награды только нодам с подтверждением
- **Decentralized Inference**: /infer → Proxy-Balancer → ноды
- **Self-Learning Loop**: Свободный хэшрейт → Golden Vectors

---

## 2. Shard-First Distribution

`POST /admin/models/propagate` — сервер публикует manifest в Redis, ноды загружают блоки через `/lfs/stream`.

---

## 3. Availability Staking

`POST /pipeline/proof-storage` — ноды подтверждают наличие шардов каждые 10 мин.

---

## 4. Decentralized Inference

`GET /api/v1/infer` — проксируется на ноду с endpoint_url и валидным Proof-of-Storage.

---

## 5. Self-Learning Loop

EvolutionEngine + Leviathan при отсутствии платных заказов.
