FROM node:20-alpine AS base
RUN npm install -g pnpm@10

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN echo "frozen-lockfile=true" >> .npmrc && \
    echo "network-timeout=120000" >> .npmrc && \
    pnpm install

# Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY package.json drizzle.config.ts tsconfig.json ./
COPY lib ./lib
COPY mcp-server.ts ./

EXPOSE 3000
CMD ["pnpm", "start"]
