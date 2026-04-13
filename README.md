# Feedwise

Self-hosted RSS reader. Subscribe to feeds, read articles in a clean Reeder-style interface.

## Features

- RSS/Atom/JSON feed aggregation with background refresh
- Three-panel reader (sidebar / article list / reading view)
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
