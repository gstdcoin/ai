---
description: Full GSTD ecosystem health check and audit
---

# GSTD Ecosystem Audit Workflow

// turbo-all

## 1. Check all running containers

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>&1
```

## 2. Check backend health

```bash
curl -s http://localhost:8080/api/v1/health | python3 -m json.tool
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
docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -c "
SELECT 'nodes' as metric, COUNT(*) as total, COUNT(*) FILTER(WHERE status='online' AND last_seen > NOW()-INTERVAL '5 min') as active FROM nodes
UNION ALL
SELECT 'users', COUNT(*), 0 FROM users
UNION ALL
SELECT 'tasks', COUNT(*), COUNT(*) FILTER(WHERE status='completed') FROM tasks;"
```

## 5. Check Redis health

```bash
docker exec gstd_redis_prod redis-cli -a GstdRedis2026 ping
docker exec gstd_redis_prod redis-cli -a GstdRedis2026 dbsize
docker exec gstd_redis_prod redis-cli -a GstdRedis2026 info memory | head -5
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
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 && echo " frontend OK"
pgrep -f "next-serve" | head -1
```
