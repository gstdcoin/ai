#!/bin/bash
# Set Telegram webhook for the bot (uses TELEGRAM_BOT_TOKEN from .env)
# Run: ./scripts/set_telegram_webhook.sh
# Or: TELEGRAM_BOT_TOKEN=xxx ./scripts/set_telegram_webhook.sh

set -e
if [ -f /home/ubuntu/.env ]; then
  source /home/ubuntu/.env 2>/dev/null || true
fi
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN not set. Add to .env or pass as env var."
  exit 1
fi
WEBHOOK_URL="${WEBHOOK_URL:-https://app.gstdtoken.com/api/v1/telegram/webhook}"
echo "Setting webhook for bot to: $WEBHOOK_URL"
RESP=$(curl -s -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\"}")
echo "$RESP" | head -c 500
if echo "$RESP" | grep -q '"ok":true'; then
  echo ""
  echo "✅ Webhook set successfully. Bot will receive updates at $WEBHOOK_URL"
else
  echo ""
  echo "❌ Failed to set webhook. Check token and URL."
  exit 1
fi
