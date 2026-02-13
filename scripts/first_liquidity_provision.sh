#!/bin/bash
# First Liquidity Provision — запуск маховика Dynamic Gold Backing
# Использование: ./scripts/first_liquidity_provision.sh [API_URL] [ADMIN_WALLET]

set -e

API_URL="${1:-http://localhost:8080}"
ADMIN_WALLET="${2:-$ADMIN_WALLET}"

if [ -z "$ADMIN_WALLET" ]; then
  echo "❌ ADMIN_WALLET не задан."
  echo "   Укажите: ./first_liquidity_provision.sh <API_URL> <ADMIN_WALLET>"
  echo "   Или: export ADMIN_WALLET=UQ... && ./first_liquidity_provision.sh"
  exit 1
fi

# Для protected routes нужен session (логин через TonConnect в Dashboard)
if [ -z "$SESSION_TOKEN" ]; then
  echo "⚠️  SESSION_TOKEN не задан. Для /admin/commission нужна сессия."
  echo "   Получите токен: войдите в Dashboard, DevTools → Application → Local Storage → session_token"
  echo "   export SESSION_TOKEN=your_token"
  echo ""
fi

echo "🚀 First Liquidity Provision — запуск маховика"
echo "   API: $API_URL"
echo "   Admin: ${ADMIN_WALLET:0:12}..."
echo ""

# 1. Проверка комиссии (если есть endpoint)
echo "📊 1. Проверка баланса комиссии..."
BALANCE=$(curl -s "${API_URL}/api/v1/admin/commission/balance" \
  -H "X-Wallet-Address: $ADMIN_WALLET" \
  -H "X-Session-Token: ${SESSION_TOKEN:-}" 2>/dev/null | jq -r '.total_commission // 0' 2>/dev/null || echo "0")
echo "   Накопленная комиссия: ${BALANCE:-?} GSTD"
if [ -n "$BALANCE" ] && [ "$(awk -v b="$BALANCE" 'BEGIN{print (b+0>=10)?1:0}')" = "1" ]; then
  echo "   ✅ Достаточно для первой транзакции (≥10 GSTD)"
else
  echo "   ⚠️  Нужно ≥10–20 GSTD на ADMIN_WALLET. Пополните или дождитесь накопления комиссии."
fi
echo ""

# 2. Подготовка payload
AMOUNT_GSTD="${AMOUNT_GSTD:-10}"
AMOUNT_XAUT="${AMOUNT_XAUT:-0}"
echo "📤 2. Вызов POST /api/v1/admin/commission/prepare-liquidity"
echo "   Параметры: amount_gstd=$AMOUNT_GSTD, amount_xaut=$AMOUNT_XAUT"
echo ""

RESP=$(curl -s -X POST "${API_URL}/api/v1/admin/commission/prepare-liquidity" \
  -H "Content-Type: application/json" \
  -H "X-Wallet-Address: $ADMIN_WALLET" \
  -H "X-Session-Token: ${SESSION_TOKEN:-}" \
  -d "{\"amount_gstd\": $AMOUNT_GSTD, \"amount_xaut\": $AMOUNT_XAUT}" 2>/dev/null) || RESP=""

if echo "$RESP" | jq -e '.payload' >/dev/null 2>&1; then
  echo "✅ Payload получен:"
  echo "$RESP" | jq '.'
  echo ""
  echo "📋 3. Следующие шаги:"
  echo "   a) Войдите в Dashboard с ADMIN_WALLET (TonConnect)"
  echo "   b) Нажмите «Add Liquidity» в блоке Golden Reserve"
  echo "   c) Подпишите транзакцию в кошельке"
  echo "   d) PaymentWatcher зафиксирует минт LP (~60 сек)"
  echo "   e) Dynamic Gold Backing загорится на главной"
  echo ""
  echo "   Или откройте Ston.fi и добавьте ликвидность вручную:"
  echo "   https://app.ston.fi/pools/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
else
  echo "❌ Ошибка при получении payload:"
  echo "$RESP" | jq '.' 2>/dev/null || echo "$RESP"
  echo ""
  echo "   Убедитесь:"
  echo "   - Backend запущен"
  echo "   - ADMIN_WALLET совпадает с config"
  echo "   - Для protected routes: X-Session-Token от логина"
  exit 1
fi
