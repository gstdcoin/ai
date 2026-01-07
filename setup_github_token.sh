#!/bin/bash
# Скрипт для настройки GitHub Personal Access Token

echo "=== Настройка GitHub Personal Access Token ==="
echo ""
echo "Шаг 1: Создайте Personal Access Token на GitHub"
echo "  1. Перейдите: https://github.com/settings/tokens"
echo "  2. Нажмите 'Generate new token (classic)'"
echo "  3. Название: 'GSTD Platform Server'"
echo "  4. Срок действия: выберите нужный (рекомендуется: 90 дней или No expiration)"
echo "  5. Права доступа: выберите 'repo' (полный доступ к репозиториям)"
echo "  6. Нажмите 'Generate token'"
echo "  7. СКОПИРУЙТЕ ТОКЕН (он показывается только один раз!)"
echo ""
read -p "Введите ваш Personal Access Token: " GITHUB_TOKEN

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Ошибка: Токен не может быть пустым"
    exit 1
fi

echo ""
echo "Настраиваю git remote..."

# Устанавливаем remote с токеном
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/gstdcoin/ai.git"

echo "✓ Remote URL обновлен"
echo ""

# Настраиваем credential helper для безопасного хранения
echo "Настраиваю credential helper..."
git config --global credential.helper store

echo "✓ Credential helper настроен"
echo ""

# Проверяем подключение
echo "Проверяю подключение к GitHub..."
if git ls-remote origin > /dev/null 2>&1; then
    echo "✓ Подключение успешно!"
    echo ""
    echo "Теперь вы можете использовать:"
    echo "  git push origin main"
    echo "  git pull origin main"
    echo "  git fetch origin"
else
    echo "✗ Ошибка подключения. Проверьте токен и права доступа."
    exit 1
fi

# Безопасность: очищаем переменную из памяти
unset GITHUB_TOKEN

echo ""
echo "⚠️  ВАЖНО: Токен сохранен в ~/.git-credentials"
echo "   Для безопасности рекомендуется использовать SSH ключи вместо токена"

