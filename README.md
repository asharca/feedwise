# Feedwise

Self-hosted information collection platform: RSS/Atom/JSON feeds, RSSHub routes, hot lists from 22+ platforms and arbitrary web pages flow into one reader, get de-duplicated, filtered by rules and pushed to where you want them — all on your own server.

## Features

- **Sources**: RSS 2.0 / Atom / RDF / JSON Feed, RSSHub routes (Discover page), any web page via CSS selectors with live preview, OPML import/export, 热榜 (DailyHotApi or newsnow).
- **Polite, efficient fetching**: conditional requests (ETag / Last-Modified), `Cache-Control` / `Retry-After` honoured, adaptive per-feed polling interval from the feed's publishing cadence (15 min – 24 h) with failure backoff, per-host concurrency limit, schedulers safe to run as multiple replicas.
- **Reader**: three-panel layout, virtualized compact list or card grid, content views (文章 / 社交 / 图片 / 视频 / 音频) auto-detected per feed with per-subscription override, inline audio/video, full-text extraction (Readability) on demand or automatically per subscription, "相关报道" via SimHash near-duplicate detection, keyboard shortcuts, live updates over SSE.
- **Search**: indexed full-text search that handles Chinese/Japanese/Korean (CJK bigrams) as well as latin text; `-term` excludes.
- **Rules**: match title / content / author / URL / feed / folder (contains, regex, equals…) on new articles → mark read, star, hide, tag, fetch full text, notify. Hot-list rules alert on keywords across all boards.
- **Notifications**: Webhook (HMAC-signed), Telegram, Bark, ntfy, 飞书, 钉钉, 企业微信, browser Web Push (PWA).
- **Open ecosystem**: Google Reader API and Fever API for third-party clients (Reeder, NetNewsWire, Read You, FeedMe, Fluent Reader…), re-published RSS feeds of any filter, MCP server (stdio + OAuth-protected HTTP) for AI assistants.
- **AI (optional, bring your own OpenAI-compatible key)**: per-article summaries and importance, auto-tagging, AI search, daily email digest with clustering.
- **Security**: every server-side fetch of a feed/user-supplied URL is SSRF-guarded (private, loopback and link-local addresses refused at connect time, redirects re-validated, size and time limits); secrets encrypted at rest.

## Quick Start

### Prerequisites

- Node.js 20.18+
- PostgreSQL 14+ (16 recommended)
- Redis
- pnpm

### Setup

```bash
pnpm install

cp .env.example .env
# Edit DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env

# Create/upgrade the schema. Use migrations, not `db:push`: search relies on
# SQL functions that only the migrations create.
pnpm db:migrate

# If you have existing rows with plaintext SMTP/LLM secrets (idempotent):
pnpm db:encrypt-secrets

# Dev server + background workers
pnpm dev:all
```

Open http://localhost:3000, create an account, and start adding feeds.

Local feeds served from your own machine or LAN are refused by the SSRF guard; set `ALLOW_PRIVATE_NETWORK_FETCH=1` in development if you need them.

### Scripts

| Command                   | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `pnpm dev`                | Start Next.js dev server                                 |
| `pnpm worker`             | Start background workers (feeds, hot lists, full text, notifications, digests) |
| `pnpm dev:all`            | Run both dev server + workers                            |
| `pnpm build`              | Production build                                         |
| `pnpm start`              | Start production server                                  |
| `pnpm mcp`                | Start MCP server over stdio (as `FEEDWISE_USER_EMAIL`)   |
| `pnpm db:generate`        | Generate migration files                                 |
| `pnpm db:migrate`         | Run migrations                                           |
| `pnpm db:encrypt-secrets` | One-time encrypt existing plaintext secrets (idempotent) |

## Deployment (Docker)

`docker-compose.yml` runs PostgreSQL, Redis, DailyHotApi (internal only), a one-shot migration job, the web app and the worker. Set the compose variables listed at the bottom of `.env.example`, then:

```bash
docker compose up -d
```

Workers can be scaled horizontally: feed scheduling claims due feeds with `FOR UPDATE SKIP LOCKED` and periodic tasks run as BullMQ job schedulers.

### Browser push

Generate VAPID keys once (`npx web-push generate-vapid-keys`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` for both the app and the worker. Then enable push per device in 设置 → 通知渠道.

## Third-party clients

Set an API password in 设置 → 第三方客户端 (separate from your login password).

- **Google Reader API** (Reeder, NetNewsWire "FreshRSS", Read You, FeedMe, Fluent Reader): server `<origin>/api/greader`, username = your email.
- **Fever API**: endpoint `<origin>/api/fever`.

Changing or revoking the API password signs out every client.

## RSS output

设置 → RSS 输出 publishes any filter (feed, folder, tag, starred, view) as an unguessable public RSS 2.0 URL. Rotate the token to revoke a URL.

## MCP

- **HTTP**: `<origin>/api/mcp`, OAuth 2.1 with dynamic client registration and PKCE — add it as a remote MCP server in Claude, Cursor, etc.
- **stdio**: `FEEDWISE_USER_EMAIL=you@example.com pnpm mcp`.

Tools: `search_articles`, `list_articles`, `get_article`, `mark_articles`, `list_feeds`, `subscribe_feed`, `hot_boards`, `hot_trending`, `related_coverage`.

## 热榜

热榜独立于 RSS 文章，聚合新闻、科技、社区和文娱榜单；不会写入文章表或影响未读数。登录后访问「热榜」，可查看各源前 30 名、相对上一快照的排名变化、新上榜条目、跨平台事件及上升趋势。手动刷新只排队，不会阻塞页面等待上游。

- 上游由 `HOT_API_PROVIDER` 选择：`dailyhot`（默认，自托管 [DailyHotApi](https://github.com/imsyy/DailyHotApi)）或 `newsnow`（[newsnow](https://github.com/newsnext/newsnow)）；地址为 `HOT_API_URL`。newsnow 未提供的榜单会显示明确错误。
- 生产 Compose 内置 `imsyy/dailyhot-api:latest`，仅在容器网络内访问（`http://dailyhot-api:6688`），不对外暴露端口。本地开发的 `docker-compose.dev.yml` 映射 `6688` 端口。
- Worker 每 5 分钟检查待刷新源。默认刷新间隔 20 分钟，最低 10 分钟；连续失败按 2、4、8 倍间隔退避，成功后复位。快照和超过 14 天未出现的条目会被清理。
- 部分源可能暂时不可用：显示错误并保留最后成功榜单，其他源照常更新；「更新时间」指最后成功快照时间。尚未抓取的源显示空榜。
- 热榜规则只对新上榜条目生效，同一规则对同一条目只通知一次。
- 所有接口要求登录：`GET /api/hot?category=all|news|tech|community|entertainment`、`GET /api/hot/trending`、`POST /api/hot/[key]/refresh`。跨平台事件采用标题相似度聚类，属于启发式结果，并非人工核验。

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Query + Virtual
- **Backend**: Next.js API routes, Drizzle ORM, PostgreSQL
- **Jobs**: BullMQ + Redis
- **Auth**: Better Auth (email + password); OAuth 2.1 for MCP
- **Parsing**: feedsmith, linkedom, Mozilla Readability

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
