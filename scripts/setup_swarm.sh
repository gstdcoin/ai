#!/bin/bash

echo "🛑 GSTD SWARM SETUP: Начало протокола зачистки..."

# 1. Остановка текущих процессов Ollama
pkill ollama || true
sleep 2

# 2. Удаление старых моделей
echo "🧹 Удаление старых весов..."
ollama list | awk 'NR>1 {print $1}' | while read -r model; do
    echo "Deleting $model..."
    ollama rm "$model"
done

# 3. Имплантация Micro-Stack (Загрузка SOTA-малышей)
echo "⬇️ Загрузка GSTD Micro-Stack (CPU Optimized)..."
ollama pull deepseek-r1:1.5b
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5:3b

echo "✅ Имплантация завершена. Рой готов к инициализации."
