#!/bin/bash
# Скрипт для настройки GitHub с новым токеном

set -e

echo "=========================================="
echo "🔧 Настройка GitHub для GSTD Platform"
echo "=========================================="
echo ""

# Проверка наличия токена
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Ошибка: GITHUB_TOKEN не установлен"
    echo ""
    echo "Использование:"
    echo "  export GITHUB_TOKEN=your_token_here"
    echo "  bash scripts/setup_github.sh"
    exit 1
fi

echo "[1/5] Настройка git remote с новым токеном..."
git remote set-url origin https://${GITHUB_TOKEN}@github.com/gstdcoin/ai.git

echo "[2/5] Проверка подключения к GitHub..."
if git fetch origin main --dry-run 2>&1 | grep -q "fatal\|error"; then
    echo "❌ Ошибка подключения к GitHub. Проверьте токен."
    exit 1
fi
echo "✅ Подключение успешно"

echo "[3/5] Добавление всех изменений..."
git add -A

echo "[4/5] Проверка статуса..."
echo ""
git status --short | head -15

echo ""
echo "[5/5] Проверка готовности к коммиту..."
UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "✅ Найдено $UNCOMMITTED изменений для коммита"
else
    echo "ℹ️  Нет изменений для коммита"
fi

echo ""
echo "=========================================="
echo "✅ Настройка завершена!"
echo "=========================================="
echo ""
echo "📝 Следующие шаги:"
echo ""
echo "1. Закоммить изменения:"
echo "   git commit -m 'fix: исправления конфигурации и nginx'"
echo ""
echo "2. Отправить в GitHub:"
echo "   git push origin main"
echo ""
echo "⚠️  ВАЖНО: Токен должен иметь права:"
echo "   - repo (полный доступ к репозиторию)"
echo "   - workflow (для работы с GitHub Actions)"
echo ""
