# Multi-stage Dockerfile for Co-Space Client
FROM node:24.22.1-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package*.json ./
COPY .npmrc ./
COPY apps/server/package*.json ./apps/server/
COPY apps/client/package*.json ./apps/client/

# Install dependencies
RUN npm install --global npm@11.11.0 \
  && test "$(node --version)" = "v24.22.1" \
  && test "$(npm --version)" = "11.11.0" \
  && npm ci

# Copy client source
COPY apps/client ./apps/client

# Build client for production
RUN npm run build --workspace=@cospace/client

# Runner stage using Nginx
FROM nginx:1.27-alpine AS runner

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: in nginx:1.27-alpine localhost resolves to ::1 while nginx listens on IPv4.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
