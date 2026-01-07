# Платформа: Надежность и Восстановление

## Причины предыдущего падения

### 1. Отсутствие политики перезапуска
- **Проблема**: Контейнеры не перезапускались автоматически при сбоях
- **Решение**: Добавлена политика `restart: unless-stopped` для всех сервисов

### 2. Повреждение базы данных PostgreSQL
- **Проблема**: База данных была повреждена (ошибка `pg_attribute catalog is missing`)
- **Причина**: Некорректное завершение работы контейнера при системном сбое
- **Решение**: 
  - Добавлены настройки надежности PostgreSQL (fsync, synchronous_commit)
  - Настроены автоматические бэкапы
  - Добавлен скрипт восстановления

### 3. Отсутствие health checks
- **Проблема**: Не было мониторинга состояния сервисов
- **Решение**: Добавлены health checks для всех критических сервисов

### 4. Отсутствие ограничений ресурсов
- **Проблема**: Контейнеры могли использовать все доступные ресурсы
- **Решение**: Добавлены ограничения памяти и CPU для всех сервисов

## Внедренные меры защиты

### 1. Автоматический перезапуск
Все сервисы настроены с политикой `restart: unless-stopped`:
- PostgreSQL
- Redis
- Backend
- Frontend
- Nginx
- Certbot

### 2. Health Checks
- **PostgreSQL**: Проверка готовности каждые 10 секунд
- **Redis**: Проверка ping каждые 10 секунд
- **Backend**: Проверка API endpoint каждые 30 секунд
- **Frontend**: Мониторинг через зависимость от backend

### 3. Ограничения ресурсов
- **PostgreSQL**: Максимум 2GB RAM, минимум 512MB
- **Redis**: Максимум 512MB RAM, минимум 128MB
- **Backend**: Максимум 1GB RAM, минимум 256MB, 1 CPU
- **Frontend**: Максимум 1GB RAM, минимум 256MB, 1 CPU

### 4. Автоматические бэкапы
- **Расписание**: Ежедневно в 2:00 AM
- **Хранение**: Последние 7 дней
- **Скрипт**: `/home/ubuntu/scripts/backup-database.sh`
- **Восстановление**: `/home/ubuntu/scripts/restore-database.sh`

### 5. Мониторинг и восстановление
- **Health Check**: Каждые 5 минут (`/home/ubuntu/scripts/health-check.sh`)
- **Auto-Recovery**: Каждые 15 минут (`/home/ubuntu/scripts/auto-recovery.sh`)
- **Логи**: `/home/ubuntu/logs/`

## Использование

### Проверка состояния платформы
```bash
/home/ubuntu/scripts/health-check.sh
```

### Создание бэкапа вручную
```bash
/home/ubuntu/scripts/backup-database.sh
```

### Восстановление из бэкапа
```bash
/home/ubuntu/scripts/restore-database.sh /home/ubuntu/backups/postgres/backup_YYYYMMDD_HHMMSS.sql.gz
```

### Просмотр логов
```bash
# Логи health checks
tail -f /home/ubuntu/logs/health.log

# Логи бэкапов
tail -f /home/ubuntu/logs/backup.log

# Логи восстановления
tail -f /home/ubuntu/logs/recovery.log
```

### Перезапуск сервисов
```bash
cd /home/ubuntu
docker-compose restart
```

### Полный перезапуск
```bash
cd /home/ubuntu
docker-compose down
docker-compose up -d
```

## Настройки PostgreSQL для надежности

- `fsync=on` - Гарантирует запись на диск
- `synchronous_commit=on` - Синхронная фиксация транзакций
- `wal_level=replica` - Уровень логирования для репликации
- `max_connections=200` - Максимальное количество подключений
- `shared_buffers=256MB` - Размер буферного кэша
- `checkpoint_completion_target=0.9` - Плавные checkpoint'ы

## Настройки Redis для надежности

- `appendonly yes` - Включен AOF (Append Only File) для персистентности
- `maxmemory 512mb` - Ограничение памяти
- `maxmemory-policy allkeys-lru` - Политика вытеснения при нехватке памяти

## Мониторинг

### Cron задачи
Автоматически настроены через `/home/ubuntu/scripts/setup-cron.sh`:
- Бэкапы: Ежедневно в 2:00 AM
- Health checks: Каждые 5 минут
- Auto-recovery: Каждые 15 минут

### Проверка cron задач
```bash
crontab -l
```

## Восстановление после сбоя

1. **Автоматическое восстановление**: Скрипт `auto-recovery.sh` попытается восстановить сервисы автоматически

2. **Ручное восстановление**:
   ```bash
   cd /home/ubuntu
   docker-compose down
   docker-compose up -d
   ```

3. **Восстановление базы данных**:
   ```bash
   /home/ubuntu/scripts/restore-database.sh <backup_file>
   ```

4. **Проверка состояния**:
   ```bash
   /home/ubuntu/scripts/health-check.sh
   ```

## Предотвращение проблем

1. **Регулярные бэкапы**: Автоматически каждый день
2. **Мониторинг ресурсов**: Health checks отслеживают использование
3. **Ограничения ресурсов**: Предотвращают исчерпание памяти/CPU
4. **Автоматический перезапуск**: Сервисы перезапускаются при сбоях
5. **Логирование**: Все действия записываются в логи

## Контакты и поддержка

При возникновении проблем:
1. Проверьте логи: `/home/ubuntu/logs/`
2. Запустите health check: `/home/ubuntu/scripts/health-check.sh`
3. Проверьте статус контейнеров: `docker-compose ps`


