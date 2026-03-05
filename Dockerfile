FROM node:20 AS base
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install dependencies only when needed
FROM base AS deps
# RUN apk update && apk add --no-cache libc6-compat || apk add --no-cache gcompat || true
WORKDIR /app

COPY package.json ./
# Install dependencies - use npm install to handle package-lock.json sync issues
# Update @twa-dev/sdk to latest if needed
# Install dependencies - use npm install to handle package-lock.json sync issues
# Update @twa-dev/sdk to latest if needed
RUN npm install --legacy-peer-deps && \
    npm list @twa-dev/sdk || npm install @twa-dev/sdk@latest --save

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN groupadd -g 1001 -r nodejs
RUN useradd -u 1001 -r -g nodejs nextjs

# Copy build output and necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/next-i18next.config.js ./next-i18next.config.js

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["npx", "next", "start", "-p", "3000"]

