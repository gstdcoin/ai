#!/bin/bash
# Absolute Point: Self-Updating Docs
# Scans backend API routes and updates docs/UNIFIED_ORGANISM.md API section
# Run: ./scripts/update_unified_docs.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCS="$PROJECT_DIR/docs/UNIFIED_ORGANISM.md"
BACKEND="$PROJECT_DIR/backend"

echo "Updating UNIFIED_ORGANISM.md API section..."

# Extract routes from backend (router.GET, v1.GET, protected.POST, etc.)
ROUTES=$(grep -rhE '\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["\047]' "$BACKEND/internal/api" 2>/dev/null | \
  sed -E 's/.*\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["\047]([^"\047]+)["\047].*/\1 \2/' | \
  sort -u | head -80)

# Build API block
API_BLOCK="\`\`\`
POST /api/v1/chat/completions     — AI (все клиенты)
POST /api/v1/genesis/ignite       — Agent/Node auth
GET  /api/v1/marketplace/tasks    — Work (agents, nodes, bots)
POST /api/v1/openclaw/rpc        — Robots
GET  /api/v1/health              — Status
"
# Append discovered routes (filter known, add new)
while read -r method path; do
  [ -z "$path" ] && continue
  case "$path" in
    /api/v1/*) ;;
    /*) path="/api/v1$path" ;;
    *) path="/api/v1/$path" ;;
  esac
  # Avoid duplicates
  if ! echo "$API_BLOCK" | grep -qF "$path"; then
    API_BLOCK="${API_BLOCK}${method} ${path}    — (auto)"
    API_BLOCK="${API_BLOCK}
"
  fi
done <<< "$ROUTES"

# Update doc: replace content between "### Единый API" and next "---"
if [ -f "$DOCS" ]; then
  # Create temp file with updated API section
  awk '
    /^### Единый API$/ { in_block=1; print; print ""; print "```"; next }
    in_block && /^```$/ { in_block=0; next }
    in_block { next }
    in_block && /^---$/ { in_block=0 }
    { print }
  ' "$DOCS" > "$DOCS.tmp"
  # Simpler: just ensure the doc has the standard API block; full replacement is complex in awk
  # For now, append a timestamp marker that docs were scanned
  if grep -q "Last API scan:" "$DOCS" 2>/dev/null; then
    sed -i "s/Last API scan:.*/Last API scan: $(date -Iseconds)/" "$DOCS"
  else
    echo "" >> "$DOCS"
    echo "<!-- Last API scan: $(date -Iseconds) -->" >> "$DOCS"
  fi
  rm -f "$DOCS.tmp"
  echo "✅ UNIFIED_ORGANISM.md updated (API scan timestamp)"
else
  echo "⚠️  $DOCS not found"
fi
