FROM node:20-alpine AS base
RUN npm install -g pnpm@10

# Install all dependencies (including devDeps for tsx/drizzle-kit)
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# Use Chinese npm mirror for stable Docker builds
RUN echo "frozen-lockfile=true" >> .npmrc && \
    echo "network-timeout=300000" >> .npmrc && \
    echo "registry=https://registry.npmmirror.com" >> .npmrc && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 10000 && \
    pnpm config set fetch-retry-maxtimeout 60000 && \
    pnpm config set fetch-retry-factor 2 && \
    pnpm install

# Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production dependencies + runtime tools (tsx for worker, drizzle-kit for migrations)
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# Use Chinese npm mirror for stable Docker builds
RUN echo "frozen-lockfile=true" >> .npmrc && \
    echo "network-timeout=300000" >> .npmrc && \
    echo "registry=https://registry.npmmirror.com" >> .npmrc && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 10000 && \
    pnpm config set fetch-retry-maxtimeout 60000 && \
    pnpm config set fetch-retry-factor 2 && \
    pnpm install --prod && \
    pnpm add tsx esbuild drizzle-kit

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY package.json drizzle.config.ts tsconfig.json ./
COPY lib ./lib

EXPOSE 3000
CMD ["pnpm", "start"]
