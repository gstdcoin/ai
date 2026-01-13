#!/bin/bash
# Скрипт для настройки легковесного мониторинга

set -e

echo "🛠 Настройка легковесного мониторинга для GSTD Platform"
echo ""

# 1. Проверка Docker log rotation
echo "✅ 1. Проверка Docker log rotation..."
if docker-compose config | grep -q "max-size"; then
    echo "   ✅ Log rotation настроен в docker-compose.yml"
else
    echo "   ❌ Log rotation не найден!"
    exit 1
fi

# 2. Запуск Glances
echo ""
echo "📊 2. Запуск Glances..."
if docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d glances 2>/dev/null; then
    echo "   ✅ Glances запущен"
    echo "   📍 Web UI: http://$(hostname -I | awk '{print $1}'):61208"
    echo "   📍 API: http://$(hostname -I | awk '{print $1}'):61209"
else
    echo "   ⚠️  Glances не запустился (возможно уже запущен)"
fi

# 3. Проверка здоровья
echo ""
echo "🔍 3. Проверка здоровья сервисов..."
sleep 5

if curl -s -f http://localhost:61209/api/3/cpu > /dev/null 2>&1; then
    echo "   ✅ Glances API доступен"
else
    echo "   ⚠️  Glances API недоступен (подождите несколько секунд)"
fi

# 4. Инструкции по UptimeRobot
echo ""
echo "🌐 4. Настройка UptimeRobot:"
echo "   📝 Перейдите на https://uptimerobot.com"
echo "   📝 Добавьте мониторы:"
echo "      - HTTPS: https://app.gstdtoken.com (каждые 5 минут)"
echo "      - HTTPS: https://app.gstdtoken.com/api/v1/health (каждые 5 минут)"
echo "      - HTTPS: https://app.gstdtoken.com/api/v1/metrics (каждые 15 минут)"
echo ""

# 5. Проверка размера логов
echo "📊 5. Текущий размер логов:"
docker system df -v 2>/dev/null | grep -A 5 "Local Volumes" || echo "   (не удалось получить информацию)"

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📚 Документация: docs/MONITORING_SETUP.md"
