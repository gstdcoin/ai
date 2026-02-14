#!/bin/bash
# Hardware Grants: Trigger allocation when Treasury has significant profit
# Run manually or via cron (e.g. weekly) when Treasury balance > 100 GSTD
# Grants go to workers in scarce H3 regions (< 5 nodes per region)

set -e
API_URL="${API_URL:-https://app.gstdtoken.com}"
SESSION_TOKEN="${SESSION_TOKEN:-}"

echo "Hardware Grants Trigger"
echo "API: $API_URL"
echo ""

# Option 1: Call admin endpoint (requires admin session)
if [ -n "$SESSION_TOKEN" ]; then
  echo "Calling admin endpoint..."
  curl -s -X POST "$API_URL/api/v1/admin/hardware-grants/allocate" \
    -H "X-Session-Token: $SESSION_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"max_gstd": 50}' | jq . 2>/dev/null || cat
  echo ""
  exit 0
fi

# Option 2: Maintenance job runs automatically every 24h
echo "No SESSION_TOKEN. Maintenance service allocates automatically when:"
echo "  - Gold Reserve (platform_funds) > 100 GSTD"
echo "  - No allocation in last 7 days"
echo "  - Scarce H3 regions have eligible workers"
echo ""
echo "To trigger manually, set SESSION_TOKEN (admin wallet session) and re-run."
exit 0
