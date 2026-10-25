---
description: Full GSTD ecosystem health check and audit
---

# GSTD Ecosystem Audit Workflow

**Target architecture:** Cloudflare Workers + the existing Upstash Redis database. No Docker, no Go backend, no PostgreSQL. The app Worker is not deployed yet, so production API checks are expected to fail until deployment prerequisites are met. Do not deploy through Vercel.
The intended API host is `app.gstdtoken.com/api/v1` — `api.gstdtoken.com` does NOT exist.

Run the checks below manually from repository root.

## 1. Check API health

```bash
curl -s https://app.gstdtoken.com/api/v1/health | python3 -m json.tool
```

Expected after deployment: `{"status":"ok","kv":"ok",...}`. Until then, record the current HTTP status as unavailable; do not treat it as healthy.

## 2. Check external endpoints

```bash
for url in \
  "https://app.gstdtoken.com" \
  "https://app.gstdtoken.com/api/v1/health" \
  "https://app.gstdtoken.com/api/v1/stats/public" \
  "https://app.gstdtoken.com/api/v1/nodes/list" \
  "https://gstdtoken.com"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url")
  echo "$code $url"
done
```

## 3. Check network stats

```bash
curl -s https://app.gstdtoken.com/api/v1/stats/public | python3 -m json.tool
```

## 4. Check active nodes

```bash
curl -s https://app.gstdtoken.com/api/v1/nodes/list | python3 -c "
import json,sys
d=json.load(sys.stdin)
nodes=d.get('nodes',[])
print(f'Active nodes: {len(nodes)}')
for n in nodes[:5]:
    print(f'  {n.get(\"name\",\"?\")} | {n.get(\"status\",\"?\")} | {n.get(\"wallet_address\",\"\")[:12]}...')
"
```

## 5. Check inference endpoint

```bash
curl -s -X POST https://app.gstdtoken.com/api/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  | python3 -m json.tool
```

## 6. Check critical API endpoints

```bash
for ep in \
  "nodes/list" \
  "agents/leaderboard" \
  "agents/marketplace" \
  "agents/stats/network" \
  "leaderboard" \
  "network/info" \
  "network/stats"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://app.gstdtoken.com/api/v1/$ep")
  echo "$code /api/v1/$ep"
done
```

## 7. Check SSL certificate expiry

```bash
echo | openssl s_client -servername app.gstdtoken.com -connect app.gstdtoken.com:443 2>/dev/null | openssl x509 -noout -enddate
```

## 8. Check deployment readiness

```bash
# Confirm the Cloudflare Worker workflow, required GitHub Actions secrets,
# cron replacement, and smoke tests are configured before changing DNS.
```

## 9. Verify no broken links (dev)

```bash
cd frontend && npm run build 2>&1 | grep -E "error|warn" | tail -20
```
