<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — feedwise Project Guide

## When to consult this file

- **Before writing any Next.js code** — check the breaking changes notice above
- **When adding a new page or API route** — check directory conventions below
- **When modifying auth, database, or email logic** — check module boundaries
- **When unsure where to place new code** — check the directory map

## Project Structure

```
app/                      Next.js App Router
  (auth)/                 Auth-related pages (login, register)
  (reader)/               Reader UI pages
  api/                    API routes
  layout.tsx              Root layout
  page.tsx                Landing page
  globals.css             Global styles

lib/                      Business logic (no Next.js imports)
  auth/                   better-auth configuration
  crypto/                 Encryption utilities
  db/                     Drizzle schema + queries
  digest/                 Digest pipeline (normalize, dedupe, cluster, organize)
  email/                  Email templates + sender
  feeds/                  RSS feed parsing + fetching
  hooks/                  Shared React hooks
  jobs/                   BullMQ workers + job definitions
  oauth/                  OAuth provider integrations
  utils.ts                Shared utilities

components/               Shared React components (shadcn/ui based)

drizzle/                  Migration files

docs/                     Design specs and architecture decisions
```

## Module Boundaries

| Module | Depends on | Used by | Rule |
|--------|-----------|---------|------|
| `lib/db/` | `drizzle-orm`, `pg` | `lib/auth/`, `lib/feeds/`, `lib/email/`, `lib/jobs/`, `lib/digest/`, `app/api/` | Only database access layer. No business logic. |
| `lib/auth/` | `lib/db/`, `better-auth` | `app/`, `app/api/` | Auth configuration only. No UI components. |
| `lib/feeds/` | `lib/db/`, `feedparser-promised` | `lib/jobs/` | RSS fetching + parsing. No HTTP server logic. |
| `lib/email/` | `lib/db/`, `nodemailer` | `lib/jobs/` | Email sending + templates. No digest logic. |
| `lib/digest/` | `lib/db/` | `lib/jobs/`, `lib/email/`, `app/api/` | Content organization pipeline. LLM client utilities live here and may be reused by Web UI features. |
| `lib/jobs/` | `lib/db/`, `lib/feeds/`, `lib/email/`, `lib/digest/` | `package.json scripts` | Worker entry points. Orchestrates other modules. |
| `app/api/` | `lib/*` | — | API routes. Thin wrappers over lib modules. |
| `app/(reader)/` | `components/`, `lib/hooks/` | — | Reader UI. LLM features allowed when user has opted in and configured a key. |

## Key Decisions

- **LLM features**: allowed across digest pipeline and Web UI; always opt-in and gated on the user's own API key/config
- **LLM config**: OpenAI-compatible (baseURL + key + model), JSON mode
- **File size**: prefer small files, single responsibility
- **Testing**: new modules must have tests (pure functions mockable, fixtures for templates)
