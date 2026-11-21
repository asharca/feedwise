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
  articles/               Per-article enrichment (AI summary, tags, full text)
  auth/                   better-auth configuration
  client-api/             Google Reader + Fever protocol handlers
  crypto/                 Encryption utilities
  db/                     Drizzle schema + queries
  dedupe/                 SimHash near-duplicate detection
  digest/                 Digest pipeline (normalize, dedupe, cluster, organize)
  email/                  Email templates + sender
  events/                 Redis pub/sub events for SSE
  feeds/                  Feed/HTML-source fetching, parsing, ingest, scheduling
  hooks/                  Shared React hooks
  hot/                    Hot-list providers (DailyHotApi / newsnow) + ingest
  jobs/                   BullMQ workers, queues, job schedulers
  mcp/                    MCP tool registry (stdio + HTTP)
  net/                    safe-fetch: SSRF-safe outbound HTTP
  notify/                 Notification channel adapters
  oauth/                  OAuth 2.1 server for MCP
  query/                  Client fetch + TanStack Query keys
  rules/                  Rule evaluation + actions
  search/                 Search cursor/highlight helpers
  share/                  Re-published RSS output
  utils.ts                Shared utilities

components/               Shared React components (shadcn/ui based)

drizzle/                  Migration files

docs/                     Design specs and architecture decisions
```

## Module Boundaries

| Module          | Depends on                                           | Used by                                                                         | Rule                                                                                                |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `lib/db/`       | `drizzle-orm`, `pg`                                  | `lib/*`, `app/api/`                                                             | Only database access layer. No business logic.                                                      |
| `lib/auth/`     | `lib/db/`, `better-auth`                             | `app/`, `app/api/`                                                              | Auth configuration only. No UI components.                                                          |
| `lib/net/`      | `undici`, `ipaddr.js`                                | `lib/feeds/`, `lib/articles/`, `lib/notify/`, `app/api/image-proxy`             | Every server-side fetch of a user- or feed-controlled URL MUST go through `safeFetch`.              |
| `lib/feeds/`    | `lib/db/`, `lib/net/`, `feedsmith`, `linkedom`       | `lib/jobs/`, `app/api/`                                                         | Fetching + parsing + ingest. No HTTP server logic.                                                  |
| `lib/rules/`    | `lib/db/`, `lib/jobs/queues/`                        | `lib/feeds/`, `lib/hot/`, `app/api/`                                            | Runs after ingest commits; never throws into ingest.                                                |
| `lib/notify/`   | `lib/db/`, `lib/net/`, `lib/crypto/`, `web-push`     | `lib/jobs/`, `app/api/`                                                         | One adapter per channel type; channel config stored encrypted.                                      |
| `lib/email/`    | `lib/db/`, `nodemailer`                              | `lib/jobs/`                                                                     | Email sending + templates. No digest logic.                                                         |
| `lib/digest/`   | `lib/db/`                                            | `lib/jobs/`, `lib/email/`, `app/api/`                                           | Content organization pipeline. LLM client utilities live here and may be reused by Web UI features. |
| `lib/jobs/`     | `lib/*`                                              | `package.json scripts`                                                          | Worker entry points + queues. Periodic work uses BullMQ job schedulers, never `setInterval`.        |
| `app/api/`      | `lib/*`                                              | —                                                                               | API routes. Thin wrappers over lib modules. `{ success, data }` / `{ success: false, error }`.       |
| `app/(reader)/` | `components/`, `lib/hooks/`, `lib/query/`            | —                                                                               | Reader UI. Data via TanStack Query + `apiFetch`. LLM features opt-in with the user's own key.       |

## Key Decisions

- **LLM features**: allowed across digest pipeline and Web UI; always opt-in and gated on the user's own API key/config
- **LLM config**: OpenAI-compatible (baseURL + key + model), JSON mode
- **File size**: prefer small files, single responsibility
- **Testing**: new modules must have tests (pure functions mockable, fixtures for templates)
