# Multi-stage Dockerfile for Co-Space Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace and server manifests
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY apps/client/package*.json ./apps/client/

# Install dependencies
RUN npm ci

# Copy Prisma schema and server source
COPY apps/server/prisma ./apps/server/prisma
RUN cd apps/server && npx prisma generate

COPY apps/server/tsconfig*.json ./apps/server/
COPY apps/server/src ./apps/server/src

# Compile TypeScript
RUN npm run build --workspace=@cospace/server

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy installed production dependencies and built assets
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package*.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist

WORKDIR /app/apps/server

# Run as non-root user
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
