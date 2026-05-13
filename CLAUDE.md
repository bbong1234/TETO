# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint（eslint-config-next）+ TypeScript（tsc）
npm run typecheck        # TypeScript type checking
npm run test             # Run vitest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run test:contract    # Run API contract tests
npm run test:eval        # Run evaluation tests
```

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DEEPSEEK_API_KEY=          # For AI semantic parsing
NEXT_PUBLIC_DEV_MODE=true  # Skip auth in development
NEXT_PUBLIC_DEV_USER_ID=   # UUID to use in dev mode
```

Database: SQL migrations are in `sql/` organized by version:
- `sql/保留存档sql/sql1.0.0/` — Initial schema
- `sql/保留存档sql/sql1.0.1/` — Early refinements
- `sql/保留存档sql/sql1.1-1.4/` — Major feature additions
- `sql/保留存档sql/sql1.5/` — Latest structural changes
- `sql/` root — Recent migrations (016+)
- `sql/rpc/` — Database functions

## Architecture

**Stack:** Next.js App Router, TypeScript, Supabase (PostgreSQL + Auth), Tailwind CSS v4, Recharts, @dnd-kit, Vitest.

### Request Flow

```
Browser → src/app/(dashboard)/<page>/page.tsx (Server Component)
        → fetches via src/app/api/v2/<resource>/route.ts
        → calls src/lib/db/<resource>.ts (Supabase queries)
```

Client components (suffixed `Client.tsx`) handle interactivity and call the API routes directly via `fetch`.

### Key Directories

- `src/app/(dashboard)/` — Protected pages: `records/`, `items/`, `insights/`, `debug/`. The group layout checks auth.
- `src/app/api/v2/` — All REST endpoints. Each resource folder has a `route.ts` (collection) and often `[id]/route.ts` (single item).
- `src/lib/db/` — Supabase query logic: `records.ts`, `items.ts`, `goals.ts`, `phases.ts`, `tags.ts`, `insights.ts`, `sub-items.ts`, `item-folders.ts`, `record-days.ts`, `record-links.ts`, `user-rules.ts`.
- `src/lib/` — Cross-cutting concerns:
  - `goal-engine.ts` — Quantitative goal calculations
  - `ai/parse-semantic.ts` — DeepSeek LLM parsing
  - `domain/` — Business logic, invariants, policies
  - `stats/` — Statistics, metrics, computation
  - `observability/` — Tracing and error codes
  - `supabase/client.ts` + `server.ts` — Supabase clients
- `src/types/teto.ts` — All core domain types. Read this first when working on any feature.

### Domain Model

- **Items** — Trackable projects/habits. Status: `活跃 | 推进中 | 放缓 | 停滞 | 已完成 | 已搁置`. Can have goals and sub-items.
- **SubItems** — Sub-tasks within an item. Can be promoted to full items.
- **ItemFolders** — Organizational folders for items.
- **Records** — Individual log entries linked to an item. Types: `发生 | 计划 | 想法 | 总结`. Have `metric_value` (numeric) and `time_anchor_date` for planning future dates. Support three-layer nine-group semantic fields.
- **RecordDays** — Day-level containers for records with date and summary.
- **RecordLinks** — Micro-relationships between records: `completes | derived_from | postponed_from | related_to`.
- **Goals** — Quantitative targets with rule types: `一次性完成 | 周期性达成 | 周期性限制`. Computed by goal engine.
- **Phases** — Time-boxed periods (sprints) that group records and items.
- **Tags** — Categorization labels for records.
- **UserRules** — User-defined rules for data processing.

### Three-Layer Nine-Group System (三层九组)

Records support structured semantic fields:
- **L1-A** — Raw input layer (`raw_input`, `input_source`)
- **L2-B** — Time group (`occurred_at`, `occurred_at_end`, `time_text`, `time_precision`)
- **L2-D** — Action backbone (`action_text`, `event_text`, `object_text`)
- **L2-F** — Cause group (`cause_text`)
- **L2-G** — Outcome group (`outcome_type`, `outcome_direction`)
- **L2-H** — Location/People (`place_type`, `people`, `relation_roles`)
- **L2-I** — Quantification (`money_direction`, `money_currency`, `metrics`)
- **L3-J** — Organization (`review_status`, `confidence_level`, `body_state`)

### Auth

Supabase Magic Link. Dev mode (`NEXT_PUBLIC_DEV_MODE=true`) bypasses auth entirely using `NEXT_PUBLIC_DEV_USER_ID`. The server Supabase client is in `src/lib/supabase/server.ts`; browser client in `src/lib/supabase/client.ts`. All DB tables use Row-Level Security scoped to `auth.uid()`.

### API Versioning

All active endpoints are under `/api/v2/`. There is no v1 in production — any reference to `/api/v1/` in the codebase is stale or a bug.

### AI Parsing

`POST /api/v2/parse` calls DeepSeek via `src/lib/ai/parse-semantic.ts` to convert natural-language input into structured record objects. Types for the parsed output are in `src/types/semantic.ts`.

### Goal Engine

`src/lib/goal-engine.ts` computes goal progress from record aggregations. Supports three rule types:
- **一次性完成** — One-time completion targets
- **周期性达成** — Periodic achievement goals (daily/weekly/monthly)
- **周期性限制** — Periodic limit goals (e.g., spend less than X per week)
