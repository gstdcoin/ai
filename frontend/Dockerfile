FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk update && apk add --no-cache libc6-compat || apk add --no-cache gcompat || true
WORKDIR /app

COPY package.json package-lock.json* ./
# Install dependencies - use npm install to handle package-lock.json sync issues
# Update @twa-dev/sdk to latest if needed
RUN npm install && \
    npm list @twa-dev/sdk || npm install @twa-dev/sdk@latest --save

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Install wget for healthcheck
RUN apk add --no-cache wget

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]


