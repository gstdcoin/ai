---
description: Full GSTD ecosystem health check and audit
---

# GSTD Ecosystem Audit Workflow

// turbo-all

## Automation (run this first)

From repository root — full check with exit code `0` / `1` (CI-friendly):

```bash
./scripts/ecosystem-audit.sh
```

- Skip public URL checks (e.g. laptop without routing to prod): `./scripts/ecosystem-audit.sh --local-only`
- Optional Telegram alert on failure (requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `.env`): `./scripts/ecosystem-audit-alert.sh`
- Optional cron on the production host (example every 6 hours):

```cron
0 */6 * * * cd /home/ubuntu && ./scripts/ecosystem-audit.sh >> /var/log/gstd-ecosystem-audit.log 2>&1
```

PostgreSQL logical backups (host cron): `./scripts/backup_postgres.sh` (writes under `backups/postgres/`, retention 7 days).

**Production crontab (copy-paste):** see [`scripts/crontab.prod.example`](../../scripts/crontab.prod.example) — daily DB backup, optional audit every 6h, and `ecosystem-audit-alert.sh` for Telegram on failure. Optional rsync off-site: [`scripts/backup-offsite-rsync.example.sh`](../../scripts/backup-offsite-rsync.example.sh). Dependency updates: [`.github/dependabot.yml`](../../.github/dependabot.yml). PRs: [`.github/workflows/dependency-review.yml`](../../.github/workflows/dependency-review.yml). Disclosure: [`SECURITY.md`](../../SECURITY.md).

Manual steps below mirror what the script runs; use them for deep dives only.

## 1. Check all running containers

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>&1
```

## 2. Check backend health (inside Docker network)

```bash
docker exec ubuntu-backend-blue-1 wget -qO- http://localhost:8080/api/v1/health 2>&1 | python3 -m json.tool
```

## 3. Check external endpoints

```bash
for url in "https://app.gstdtoken.com" "https://api.gstdtoken.com/api/v1/health" "https://chat.gstdtoken.com" "https://gstdbot.gstdtoken.com" "https://monitor.gstdtoken.com"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url")
  echo "$code $url"
done
```

## 4. Check database stats

```bash
PG_CONTAINER=$(docker ps --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" | head -1)
docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -c "
SELECT 'nodes' as metric, COUNT(*) as total, COUNT(*) FILTER(WHERE status='online' AND last_seen > NOW()-INTERVAL '5 min') as active FROM nodes
UNION ALL
SELECT 'users', COUNT(*), 0 FROM users
UNION ALL
SELECT 'tasks', COUNT(*), COUNT(*) FILTER(WHERE status='completed') FROM tasks;"
```

## 5. Check Redis health

```bash
REDIS_CONTAINER=$(docker ps --filter "ancestor=redis:7-alpine" --format "{{.Names}}" | head -1)
docker exec "$REDIS_CONTAINER" redis-cli -a ${REDIS_PASSWORD:-GstdRedis2026} ping 2>/dev/null
docker exec "$REDIS_CONTAINER" redis-cli -a ${REDIS_PASSWORD:-GstdRedis2026} dbsize 2>/dev/null
docker exec "$REDIS_CONTAINER" redis-cli -a ${REDIS_PASSWORD:-GstdRedis2026} info memory 2>/dev/null | head -5
```

## 6. Check backend logs for errors

```bash
docker logs --tail 50 ubuntu-backend-blue-1 2>&1 | grep -i "error\|panic\|fatal" | tail -10
```

## 7. Check SSL certificate expiry

```bash
echo | openssl s_client -servername app.gstdtoken.com -connect app.gstdtoken.com:443 2>/dev/null | openssl x509 -noout -enddate
```

## 8. Check disk usage

```bash
df -h / | tail -1
docker system df 2>&1
```

## 9. Check Telegram bot status

```bash
docker logs --tail 10 gstd-telegram-bot 2>&1
```

## 10. Check frontend status

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 && echo " frontend responds OK"
```

## 11. Check bridge status

```bash
docker logs --tail 5 gstd-bridge-test 2>&1
```

## 12. Check image cleanup (should be current + rollback only)

```bash
docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep -E "gstd|backend|bot|bridge" | sort
```

## 13. Check node rewards subsystem (critical endpoints)

```bash
for ep in "nodes/rewards/program" "nodes/rewards/network" "nodes/tools/health" "nodes/tools/tasks/available" "nodes/tools/governance/active" "nodes/tools/burn-stats"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://api.gstdtoken.com/api/v1/$ep")
  echo "$code /api/v1/$ep"
done
```
