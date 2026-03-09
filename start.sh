#!/bin/bash
export GROQ_API_KEY="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"
export GSTD_SWARM_URL="http://localhost:8080"
export NODE_ENV=production

cd /home/ubuntu/frontend

# Next.js standalone requires manual copy of static + public assets
echo "[start.sh] Copying static assets to standalone..."
cp -r .next/static .next/standalone/.next/static 2>/dev/null
cp -r public/* .next/standalone/public/ 2>/dev/null
echo "[start.sh] Assets copied. Starting Next.js..."

exec npx next start -p 3000
