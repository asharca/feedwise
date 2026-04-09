FROM node:20-alpine AS base
RUN npm install -g pnpm@10

# Install all dependencies (including devDeps for tsx/drizzle-kit)
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

# Production dependencies only
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN echo "frozen-lockfile=true" >> .npmrc && \
    echo "network-timeout=120000" >> .npmrc && \
    pnpm install --prod

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production deps + tsx for worker/migrations
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY package.json drizzle.config.ts tsconfig.json ./
COPY lib ./lib
COPY mcp-server.ts ./

EXPOSE 3000
CMD ["pnpm", "start"]
