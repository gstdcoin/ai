#!/bin/bash
export GROQ_API_KEY="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"
export GSTD_SWARM_URL="http://localhost:8080"
export NODE_ENV=production

cd /home/ubuntu/frontend
exec npx next start -p 3000
