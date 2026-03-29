FROM node:22-alpine AS builder
WORKDIR /app
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/scripts ./apps/backend/scripts
RUN npm ci --workspace backend --include-workspace-root=false
RUN npm run prisma:generate --workspace backend

COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules

COPY --from=builder /app/apps/backend/dist    ./apps/backend/dist
# Conteúdo público do backend (assets estáticos e arquivos servidos pela API)
COPY --from=builder /app/apps/backend/public  ./apps/backend/public
COPY --from=builder /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=builder /app/apps/backend/node_modules/.prisma          ./apps/backend/node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma/client   ./apps/backend/node_modules/@prisma/client

WORKDIR /app/apps/backend
EXPOSE 3210
CMD ["sh", "-lc", "node scripts/prisma-migrate-safe.mjs && node dist/main.js"]