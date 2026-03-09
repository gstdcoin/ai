---
description: Full GSTD ecosystem health check and audit
---

# GSTD Ecosystem Audit Workflow

// turbo-all

## 1. Check all running containers

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | sort
```

## 2. Check backend health

```bash
curl -s http://localhost:8080/api/v1/health | python3 -m json.tool
```

## 3. Check external endpoints

```bash
echo "--- app.gstdtoken.com ---"
curl -ks -o /dev/null -w "%{http_code}" https://app.gstdtoken.com/
echo ""
echo "--- api.gstdtoken.com ---"
curl -ks -o /dev/null -w "%{http_code}" https://api.gstdtoken.com/api/v1/health
echo ""
echo "--- gstdbot.gstdtoken.com ---"
curl -ks -o /dev/null -w "%{http_code}" https://gstdbot.gstdtoken.com/
echo ""
echo "--- chat.gstdtoken.com ---"
curl -ks -o /dev/null -w "%{http_code}" https://chat.gstdtoken.com/
echo ""
echo "--- monitor.gstdtoken.com ---"
curl -ks -o /dev/null -w "%{http_code}" https://monitor.gstdtoken.com/
echo ""
```

## 4. Check database stats

```bash
docker exec postgres_prod psql -U postgres -d distributed_computing -c "
SELECT 'nodes' as metric, COUNT(*) as total, COUNT(*) FILTER(WHERE status='online' AND last_seen > NOW()-INTERVAL '5 min') as active FROM nodes
UNION ALL
SELECT 'users', COUNT(*), 0 FROM users
UNION ALL
SELECT 'tasks', COUNT(*), COUNT(*) FILTER(WHERE status='completed') FROM tasks;"
```

## 5. Check Redis health

```bash
docker exec redis_prod redis-cli dbsize
docker exec redis_prod redis-cli info memory | head -5
docker exec redis_prod redis-cli info keyspace
```

## 6. Check backend logs for errors

```bash
docker logs --tail 50 ubuntu-backend-blue-1 2>&1 | grep -i "error\|panic\|fatal" | tail -10
```

## 7. Check SSL certificate expiry

```bash
sudo certbot certificates 2>&1 | grep -E "Domains:|Expiry"
```

## 8. Check disk usage

```bash
df -h / | tail -1
docker system df
```

## 9. Check Telegram bot status

```bash
docker logs --tail 5 gstd-telegram-bot 2>&1
```
