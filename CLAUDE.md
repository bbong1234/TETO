# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test suite is configured.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DEEPSEEK_API_KEY=          # For AI semantic parsing
NEXT_PUBLIC_DEV_MODE=true  # Skip auth in development
NEXT_PUBLIC_DEV_USER_ID=   # UUID to use in dev mode
```

Database: run SQL migrations in `sql/` in numeric order (001, 003, 006, 008, 010) against your Supabase project.

## Architecture

**Stack:** Next.js App Router, TypeScript, Supabase (PostgreSQL + Auth), Tailwind CSS v4, Recharts, @dnd-kit.

### Request Flow

```
Browser → src/app/(dashboard)/<page>/page.tsx (Server Component)
        → fetches via src/app/api/v2/<resource>/route.ts
        → calls src/lib/db/<resource>.ts (Supabase queries)
```

Client components (suffixed `Client.tsx`) handle interactivity and call the API routes directly via `fetch`.

### Key Directories

- `src/app/(dashboard)/` — Protected pages: `records/`, `items/`, `insights/`. The group layout checks auth.
- `src/app/api/v2/` — All REST endpoints. Each resource folder has a `route.ts` (collection) and often `[id]/route.ts` (single item).
- `src/lib/db/` — All Supabase query logic. One file per domain: `records.ts`, `items.ts`, `goals.ts`, `phases.ts`, `tags.ts`, `insights.ts`.
- `src/lib/` — Cross-cutting: `goal-engine.ts` (quantitative goal calculations), `ai/parse-semantic.ts` (DeepSeek LLM parsing), `supabase/client.ts` + `server.ts`.
- `src/types/teto.ts` — All core domain types. Read this first when working on any feature.

### Domain Model

- **Items** — trackable projects/habits. Status: `活跃 | 推进中 | 放缓 | 停滞 | 已完成 | 已搁置`. Can have a `goal_config` (JSON) for quantitative goals.
- **Records** — individual log entries linked to an item. Types: `发生 | 计划 | 想法 | 总结`. Have `value` (numeric) and `time_anchor_date` for planning future dates.
- **Goals** — quantitative targets per item, computed by `src/lib/goal-engine.ts` from `goal_config` + aggregated record values.
- **Phases** — time-boxed periods (sprints) that group records and items.
- **Record Links** — micro-relationships between records: `completes | derived_from | postponed_from | related_to`.

### Auth

Supabase Magic Link. Dev mode (`NEXT_PUBLIC_DEV_MODE=true`) bypasses auth entirely using `NEXT_PUBLIC_DEV_USER_ID`. The server Supabase client is in `src/lib/supabase/server.ts`; browser client in `src/lib/supabase/client.ts`. All DB tables use Row-Level Security scoped to `auth.uid()`.

### API Versioning

All active endpoints are under `/api/v2/`. There is no v1 in production — any reference to `/api/v1/` in the codebase is stale or a bug.

### AI Parsing

`POST /api/v2/parse` calls DeepSeek via `src/lib/ai/parse-semantic.ts` to convert natural-language input into structured record objects. Types for the parsed output are in `src/types/semantic.ts`.
