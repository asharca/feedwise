@AGENTS.md
@~/.claude/CLAUDE.md

# feedwise — Project-specific rules

## Project

RSS aggregator with daily digest emails. Next.js 16 App Router + React 19 + TypeScript + Drizzle ORM + PostgreSQL + BullMQ workers.

## Build & Test Commands

```bash
pnpm dev          # Next.js dev server
pnpm build        # Production build
pnpm test         # Vitest
pnpm db:generate  # Drizzle migration generate
pnpm db:migrate   # Drizzle migration apply
pnpm db:studio    # Drizzle studio
pnpm worker       # Start background job workers
pnpm dev:all      # dev + worker concurrently
```

## Verification

- After code changes: `pnpm build` must pass
- After DB schema changes: `pnpm db:generate` then `pnpm db:migrate`
- After logic changes: `pnpm test`
- Before declaring done: run the relevant verification command

## Architecture Constraints

- **LLM features**: allowed across digest pipeline and Web UI; always opt-in and gated on the user's own API key/config
- **LLM config**: OpenAI-compatible (baseURL + key + model), JSON mode
- **File size**: prefer small files, single responsibility
- **Testing**: new modules must have tests (pure functions mockable, fixtures for templates)

## Key Directories

| Directory     | Purpose                                                |
| ------------- | ------------------------------------------------------ |
| `app/`        | Next.js App Router pages + API routes                  |
| `lib/db/`     | Drizzle schema + queries                               |
| `lib/digest/` | Digest pipeline (normalize, dedupe, cluster, organize) |
| `lib/email/`  | Email templates + sender                               |
| `lib/jobs/`   | BullMQ workers + job definitions                       |
| `lib/feeds/`  | RSS feed parsing + fetching                            |
| `lib/auth/`   | better-auth configuration                              |
| `components/` | Shared React components                                |
| `drizzle/`    | Migration files                                        |
| `docs/`       | Design specs and decisions                             |
