# Feedwise

Self-hosted RSS reader. Subscribe to feeds, read articles in a clean Reeder-style interface.

## Features

- RSS/Atom/JSON feed aggregation with background refresh
- Three-panel reader (sidebar / article list / reading view)
- Compact article list (default) or card grid, toggled per browser; selected article highlighted during `j`/`k` navigation
- 热榜: self-hosted DailyHotApi boards with rank changes and cross-platform events (see below)
- Keyboard shortcuts (j/k navigate, s star, m read, o open original)
- OPML import/export
- Dark/light theme

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Copy and edit environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL

# Create database tables
pnpm db:push

# Encryption setup (required) — generate a 32-byte base64 key
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env

# If you have existing rows with plaintext SMTP/LLM secrets, run the
# one-time migration (idempotent — safe to re-run):
pnpm db:encrypt-secrets

# Start development server + background workers
pnpm dev:all
```

Open http://localhost:3000, create an account, and start adding feeds.

### Scripts

| Command                   | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `pnpm dev`                | Start Next.js dev server                                 |
| `pnpm worker`             | Start background feed workers                            |
| `pnpm dev:all`            | Run both dev server + workers                            |
| `pnpm build`              | Production build                                         |
| `pnpm start`              | Start production server                                  |
| `pnpm mcp`                | Start MCP server (stdio)                                 |
| `pnpm db:push`            | Push schema to database                                  |
| `pnpm db:generate`        | Generate migration files                                 |
| `pnpm db:migrate`         | Run migrations                                           |
| `pnpm db:encrypt-secrets` | One-time encrypt existing plaintext secrets (idempotent) |

## Deployment (Docker)

```bash
# Start PostgreSQL + Redis
docker compose -f docker-compose.dev.yml up -d

# Build and run
pnpm build
pnpm start &
pnpm worker &
```

## 热榜

热榜独立于 RSS 文章，聚合新闻、科技、社区和文娱榜单；不会写入文章表或影响未读数。登录后访问「热榜」，可查看各源前 30 名、相对上一快照的排名变化、新上榜条目、跨平台事件及上升趋势。手动刷新只排队，不会阻塞页面等待上游。

- 使用自托管 [DailyHotApi](https://github.com/imsyy/DailyHotApi)，两个 Compose 文件均包含 `imsyy/dailyhot-api:latest`，映射端口 `6688`。
- 本地开发的 `.env` 设置 `HOT_API_URL=http://localhost:6688`；生产 Compose 默认通过 `http://dailyhot-api:6688` 访问，也可用 `HOT_API_URL` 覆盖。若复用本地 `.env` 部署 Docker，请将此变量改为容器可访问的地址，而不是 `localhost`。
- 升级时先执行 `pnpm db:migrate`。迁移仅新增 `hot_sources`、`hot_items`、`hot_snapshots`、`hot_ranks`，不迁移或修改现有文章数据。生产 Compose 的迁移服务会自动执行迁移。
- 启动 `pnpm worker`（生产为 `pnpm worker:prod`）后即排队首次抓取，每 5 分钟检查待刷新源。默认刷新间隔 20 分钟，最低 10 分钟；连续失败按 2、4、8 倍间隔退避，成功后复位。快照和超过 14 天未出现的条目会被清理。
- 部分源可能暂时不可用：显示错误并保留最后成功榜单，其他源照常更新；「更新时间」指最后成功快照时间。尚未抓取的源显示空榜。
- 所有接口要求登录：`GET /api/hot?category=all|news|tech|community|entertainment`、`GET /api/hot/trending`、`POST /api/hot/[key]/refresh`。刷新未知源返回 404。跨平台事件采用标题相似度聚类，属于启发式结果，并非人工核验。

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Base UI)
- **Backend**: Next.js API routes, Drizzle ORM, PostgreSQL
- **Jobs**: BullMQ + Redis for background feed fetching
- **Auth**: Better Auth (email + password)
- **MCP**: @modelcontextprotocol/sdk (HTTP + stdio transports)

## Keyboard Shortcuts

| Key      | Action                   |
| -------- | ------------------------ |
| `j`      | Next article             |
| `k`      | Previous article         |
| `s`      | Toggle star              |
| `m`      | Toggle read              |
| `o`      | Open original in new tab |
| `Escape` | Close article            |

## License

MIT
