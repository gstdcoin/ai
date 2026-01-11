#!/bin/bash
# Script to display CI/CD SSH keys for GitHub Secrets setup

echo "=========================================="
echo "🔐 CI/CD SSH Keys для GitHub Secrets"
echo "=========================================="
echo ""

KEY_FILE="$HOME/.ssh/github_actions_deploy"
PUB_KEY_FILE="$HOME/.ssh/github_actions_deploy.pub"

if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Приватный ключ не найден: $KEY_FILE"
    echo "Создайте ключи командой:"
    echo "  ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N \"\" -C \"github-actions-deploy\""
    exit 1
fi

echo "📋 SSH_HOST (для GitHub Secret):"
echo "82.115.48.228"
echo ""

echo "📋 SSH_USER (для GitHub Secret):"
echo "ubuntu"
echo ""

echo "📋 SSH_PORT (для GitHub Secret, опционально):"
echo "22"
echo ""

echo "=========================================="
echo "🔑 SSH_KEY (для GitHub Secret)"
echo "=========================================="
echo "Скопируйте весь блок ниже (включая BEGIN и END):"
echo ""
cat "$KEY_FILE"
echo ""
echo "=========================================="
echo ""

echo "=========================================="
echo "🔑 SSH_KNOWN_HOSTS (для GitHub Secret)"
echo "=========================================="
echo "Скопируйте весь вывод ниже:"
echo ""
ssh-keyscan -H 82.115.48.228 2>/dev/null || ssh-keyscan -t rsa,ecdsa,ed25519 82.115.48.228 2>/dev/null
echo ""
echo "=========================================="
echo ""

echo "✅ Публичный ключ (уже добавлен в authorized_keys):"
cat "$PUB_KEY_FILE"
echo ""

echo "📝 Инструкция:"
echo "1. Откройте: https://github.com/gstdcoin/ai/settings/secrets/actions"
echo "2. Обновите секреты SSH_KEY и SSH_KNOWN_HOSTS"
echo "3. Проверьте SSH_HOST, SSH_USER, SSH_PORT"
echo "4. Протестируйте деплой через GitHub Actions"
echo ""
