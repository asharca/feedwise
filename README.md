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

Feedwise includes an MCP (Model Context Protocol) server that exposes your RSS data as tools for AI assistants like Claude.

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

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

Or using `npx tsx` directly:

```json
{
  "mcpServers": {
    "feedwise": {
      "command": "npx",
      "args": ["tsx", "--env-file=/path/to/feedwise/.env", "/path/to/feedwise/mcp-server.ts"],
      "env": {
        "FEEDWISE_USER_EMAIL": "your@email.com"
      }
    }
  }
}
```

### Claude Code Configuration

Add to `.claude/settings.json`:

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

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `FEEDWISE_USER_EMAIL` | No | User email for MCP server (defaults to first user) |

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
- **MCP**: @modelcontextprotocol/sdk (stdio transport)

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
