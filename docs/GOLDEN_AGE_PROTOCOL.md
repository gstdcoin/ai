# Golden Age Protocol

**Версия:** 1.0  
**Дата:** 15 февраля 2026  
**Статус:** Активирован

---

## 1. Automated Payout Waves

- Раз в неделю или при достижении порога **10 GSTD** — массовая выплата из `settlement_ledger` на TON-кошельки воркеров
- Таблица `settlement_payout_waves` фиксирует каждую волну
- Поля `paid_at`, `payout_wave_id` в `settlement_ledger`

---

## 2. Dynamic Fee Scaling

- Если загрузка сети > **80%** — автоматически повышается `INFERENCE_FEE_GSTD` на **20%**
- Загрузка = (processing_tasks + queued_tasks) / (active_workers × 10)
- Множитель применяется в `inferenceFeeGSTD()`

---

## 3. Global Proof-of-Gold

- Каждое **воскресенье** в Leviathan ticker:
  > 🏛️ Weekly Audit: [N] GSTD processed -> [M] XAUt added to backing. Integrity: 100%.

---

## 4. Swarm Expansion

- Если активных нод < **1000** — в публичный тикер (не чаще 1 раза в час):
  > 🚀 Сеть ищет воркеров: Повышенные награды за Proof-of-Storage!

---

## Компоненты

| Компонент | Файл |
|-----------|------|
| GoldenAgeService | `backend/internal/services/golden_age_service.go` |
| Миграция | `backend/migrations/v57_golden_age.sql` |
