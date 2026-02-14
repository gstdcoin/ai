# Сервер — Лог очистки

**Дата:** 2026-02-11

## Удалено

### Корневые файлы
- `backend.log`, `backend_runtime.log` — runtime логи
- `broadcast_news.py` — утилита рассылки в Redis
- `buy_gstd.py` — утилита покупки GSTD (содержала mnemonic)
- `mesh_intercept_proof.py` — скрипт верификации
- `verify_final_synergy.py`, `verify_platform_readiness.py`, `verify_sovereign_mesh.py`, `verify_system_integrity.py` — скрипты верификации
- `.env.backup-manual` — резервная копия .env

### Backups
- `backups/postgres/*.sql.gz` — старые бэкапы (>14 дней)
- `backups/postgres/*.sql` — пустые файлы

### Логи
- `logs/` — усечены (backend, cleanup, sentinel — обнулены; monitor, health_report — до 100KB)
- `autonomy/*.log` — удалены
- `autonomy/backups/backup.log` — удалён

## Добавлено в .gitignore
- `broadcast_news.py`, `buy_gstd.py`, `mesh_intercept_proof.py`, `verify_*.py`

## Оставлено
- `scripts/` — все скрипты (deploy, backup, migrations)
- `autonomy/` — боты, MCP, конфиги
- `backups/` — структура каталога (для cron backup)
- `logs/` — структура (cron продолжит писать)
