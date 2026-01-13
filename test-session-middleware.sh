#!/bin/bash
# Скрипт для тестирования session middleware

echo "🧪 Тестирование Session Middleware"
echo ""

BASE_URL="http://localhost:8080/api/v1"

# 1. Проверка публичных endpoints (должны работать без session)
echo "1. Тестирование публичных endpoints (без session token):"
echo ""

echo "   GET /health:"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/health")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")
if [ "$http_code" = "200" ]; then
    echo "   ✅ /health доступен без session (ожидалось)"
else
    echo "   ❌ /health недоступен (код: $http_code)"
    echo "   Ответ: $body"
fi
echo ""

echo "   POST /users/login (без payload, только проверка доступности):"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/users/login" -H "Content-Type: application/json" -d '{}')
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
if [ "$http_code" = "400" ] || [ "$http_code" = "200" ]; then
    echo "   ✅ /users/login доступен без session (ожидалось, код: $http_code)"
else
    echo "   ⚠️  /users/login вернул неожиданный код: $http_code"
fi
echo ""

# 2. Проверка защищенных endpoints (должны требовать session)
echo "2. Тестирование защищенных endpoints (без session token):"
echo ""

echo "   GET /tasks:"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/tasks")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")
if [ "$http_code" = "401" ]; then
    echo "   ✅ /tasks требует session (код 401 - ожидалось)"
    echo "   Ответ: $body" | head -1
elif [ "$http_code" = "200" ]; then
    echo "   ⚠️  /tasks доступен без session (не должно быть так!)"
else
    echo "   ⚠️  Неожиданный код: $http_code"
    echo "   Ответ: $body"
fi
echo ""

echo "   GET /nodes/my:"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/nodes/my")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")
if [ "$http_code" = "401" ]; then
    echo "   ✅ /nodes/my требует session (код 401 - ожидалось)"
    echo "   Ответ: $body" | head -1
elif [ "$http_code" = "200" ]; then
    echo "   ⚠️  /nodes/my доступен без session (не должно быть так!)"
else
    echo "   ⚠️  Неожиданный код: $http_code"
    echo "   Ответ: $body"
fi
echo ""

# 3. Проверка с невалидным session token
echo "3. Тестирование с невалидным session token:"
echo ""

echo "   GET /tasks с невалидным token:"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/tasks" -H "X-Session-Token: invalid_token_12345")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_CODE")
if [ "$http_code" = "401" ]; then
    echo "   ✅ Невалидный token отклонен (код 401 - ожидалось)"
    echo "   Ответ: $body" | head -1
else
    echo "   ⚠️  Неожиданный код: $http_code"
    echo "   Ответ: $body"
fi
echo ""

echo "✅ Тестирование завершено"
echo ""
echo "📋 Резюме:"
echo "   - Публичные endpoints (/health, /users/login) должны быть доступны"
echo "   - Защищенные endpoints (/tasks, /nodes/my) должны требовать session"
echo "   - Невалидные session tokens должны отклоняться"
