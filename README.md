# Feedwise

Self-hosted RSS reader with MCP server integration. Subscribe to feeds, read articles in a clean Reeder-style interface, and let AI assistants query your reading data via MCP.

## Features

- RSS/Atom/JSON feed aggregation with background refresh
- Three-panel reader (sidebar / article list / reading view)
- Keyboard shortcuts (j/k navigate, s star, m read, o open original)
- OPML import/export
- Dark/light theme
- MCP server for AI assistant integration

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

# Start development server + background workers
pnpm dev:all
```

Open http://localhost:3000, create an account, and start adding feeds.

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm worker` | Start background feed workers |
| `pnpm dev:all` | Run both dev server + workers |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm mcp` | Start MCP server (stdio) |
| `pnpm db:push` | Push schema to database |
| `pnpm db:generate` | Generate migration files |
| `pnpm db:migrate` | Run migrations |

## MCP Server

Feedwise exposes your RSS data as MCP tools for AI assistants like Claude. There are two modes: **HTTP** (recommended, no local setup needed) and **stdio** (local only).

### Available Tools

| Tool | Description |
|------|-------------|
| `list_subscriptions` | List all RSS feed subscriptions |
| `list_articles` | List articles with filters (feed, unread, starred, date, search) |
| `get_article` | Get full article content by ID |
| `search_articles` | Full-text search across articles |
| `get_today_digest` | Get today's articles grouped by feed |
| `mark_article_read` | Mark article as read/unread |
| `mark_article_starred` | Star/unstar an article |
| `add_subscription` | Subscribe to a new RSS feed |
| `remove_subscription` | Unsubscribe from a feed |

---

### Mode 1 — HTTP (Recommended)

The MCP server runs as part of the Feedwise web app at `/api/mcp`. No local installation required — just a token.

#### Step 1: Generate an API Token

1. Open Feedwise in your browser → **Settings** → **MCP Server**
2. Enter a name for the token (e.g. `Claude Desktop`) and click **Generate**
3. Copy the token immediately — it is shown **only once**

Tokens look like: `fw_a3f8c2e1d4b7...`

To revoke a token, click the delete icon next to it in Settings.

#### Step 2: Configure Your MCP Client

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "feedwise": {
      "url": "https://your-app.com/api/mcp",
      "headers": {
        "Authorization": "Bearer fw_your_token_here"
      }
    }
  }
}
```

**Cursor** — open Settings → MCP and add:

```json
{
  "feedwise": {
    "url": "https://your-app.com/api/mcp",
    "headers": {
      "Authorization": "Bearer fw_your_token_here"
    }
  }
}
```

**Claude Code (CLI)** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "feedwise": {
      "url": "https://your-app.com/api/mcp",
      "headers": {
        "Authorization": "Bearer fw_your_token_here"
      }
    }
  }
}
```

#### Example Prompts

```
What are today's top articles from my RSS feeds?
```

```
Search my feeds for anything about TypeScript 5.9
```

```
Mark all articles from Hacker News as read
```

```
Subscribe me to https://example.com/feed.xml
```

---

### Mode 2 — stdio (Local Only)

For running Feedwise locally and connecting via stdio transport.

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "feedwise": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/feedwise", "mcp"],
      "env": {
        "DATABASE_URL": "postgresql://feedwise:password@localhost:5432/feedwise",
        "FEEDWISE_USER_EMAIL": "your@email.com"
      }
    }
  }
}
```

**Claude Code (CLI)** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "feedwise": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/feedwise", "mcp"],
      "env": {
        "DATABASE_URL": "postgresql://feedwise:password@localhost:5432/feedwise",
        "FEEDWISE_USER_EMAIL": "your@email.com"
      }
    }
  }
}
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `FEEDWISE_USER_EMAIL` | No | User to connect as (defaults to first user in DB) |

## Deployment (Docker)

```bash
# Start PostgreSQL + Redis
docker compose -f docker-compose.dev.yml up -d

# Build and run
pnpm build
pnpm start &
pnpm worker &
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Base UI)
- **Backend**: Next.js API routes, Drizzle ORM, PostgreSQL
- **Jobs**: BullMQ + Redis for background feed fetching
- **Auth**: Better Auth (email + password)
- **MCP**: @modelcontextprotocol/sdk (HTTP + stdio transports)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` | Next article |
| `k` | Previous article |
| `s` | Toggle star |
| `m` | Toggle read |
| `o` | Open original in new tab |
| `Escape` | Close article |

## License

MIT
