FROM node:22-alpine AS builder
WORKDIR /app

COPY apps/backend/package*.json ./
RUN npm ci

COPY apps/backend ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY apps/backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3210
CMD ["node", "dist/main.js"]
