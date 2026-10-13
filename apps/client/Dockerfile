# Multi-stage Dockerfile for Co-Space Client
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY apps/client/package*.json ./apps/client/

# Install dependencies
RUN npm ci

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

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
