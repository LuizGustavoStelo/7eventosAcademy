FROM node:22-alpine AS builder
WORKDIR /app

COPY apps/frontend/package*.json ./
RUN npm ci

COPY apps/frontend ./
RUN npm run build

FROM nginx:1.29-alpine AS runtime
COPY infra/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
