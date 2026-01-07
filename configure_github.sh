#!/bin/bash
# Простой скрипт для настройки GitHub токена

echo "=== Настройка GitHub Personal Access Token ==="
echo ""
echo "Текущий remote URL:"
git remote get-url origin
echo ""
echo "Для настройки доступа введите команду:"
echo "  git remote set-url origin https://<TOKEN>@github.com/gstdcoin/ai.git"
echo ""
echo "Где <TOKEN> - это ваш Personal Access Token с GitHub"
echo ""
echo "После настройки проверьте подключение:"
echo "  git ls-remote origin"
echo ""
read -p "Введите ваш GitHub Personal Access Token (или нажмите Enter для пропуска): " TOKEN

if [ -z "$TOKEN" ]; then
    echo "Токен не введен. Используйте команду вручную:"
    echo "  git remote set-url origin https://<TOKEN>@github.com/gstdcoin/ai.git"
    exit 0
fi

echo ""
echo "Настраиваю remote URL..."
git remote set-url origin "https://${TOKEN}@github.com/gstdcoin/ai.git"

echo "✓ Remote URL обновлен"
echo ""

# Настраиваем credential helper
git config --global credential.helper store

echo "Проверяю подключение..."
if git ls-remote origin > /dev/null 2>&1; then
    echo "✓ Подключение успешно!"
    echo ""
    echo "Теперь вы можете использовать:"
    echo "  git push origin main"
    echo "  git pull origin main"
else
    echo "✗ Ошибка подключения. Проверьте:"
    echo "  1. Токен правильный и не истек"
    echo "  2. У токена есть права 'repo'"
    echo "  3. Репозиторий существует и доступен"
    exit 1
fi

# Очищаем переменную
unset TOKEN

