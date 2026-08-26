FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG TECPEY_BUILD_COMMIT_SHA
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_BACKEND_URL
ARG NEXT_PUBLIC_API_SOCKET_URL
ENV TECPEY_BUILD_COMMIT_SHA=$TECPEY_BUILD_COMMIT_SHA
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BACKEND_URL=$NEXT_PUBLIC_API_BACKEND_URL
ENV NEXT_PUBLIC_API_SOCKET_URL=$NEXT_PUBLIC_API_SOCKET_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN printf '%s\n' "$TECPEY_BUILD_COMMIT_SHA" | grep -Eq '^[0-9a-f]{40}$' \
    && npm run build

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS hardened-production-runtime
RUN apk upgrade --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0

FROM hardened-production-runtime AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM hardened-production-runtime AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /opt/yarn-v1.22.22
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
RUN mkdir -p /app/storage /app/.next/cache && chown node:node /app/storage /app/.next/cache
VOLUME ["/app/storage", "/app/.next/cache"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health?probe=live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/run-production-bootstrap.cjs", "server"]
