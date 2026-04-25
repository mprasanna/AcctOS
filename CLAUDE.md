# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. The repo is a pnpm workspace; root scripts filter into `apps/web`.

```bash
pnpm dev          # next dev on http://localhost:3000
pnpm build        # next build (skips typecheck/lint — see next.config.mjs)
pnpm typecheck    # tsc --noEmit — must pass before PR
pnpm lint         # next lint — must pass before PR
```

There is no test runner configured. Verification is done via the smoke-test `curl` checklist in `SETUP.md` Part 10 against a deployed environment.

### Database / Edge Functions

```bash
supabase link --project-ref <REF>
supabase db push                                # applies all numbered migrations in order
supabase functions deploy process-automation-jobs
supabase functions deploy auto-create-workflows
supabase functions invoke process-automation-jobs --no-verify-jwt   # process queue immediately instead of waiting 15m
```

Migrations live in `supabase/migrations/` and must be applied **in numeric order** (001 → 017). The numeric prefix is load-bearing — never insert a migration out of sequence.

## Architecture

### Stack and shape

- pnpm workspace; the only app is `apps/web` (Next.js 14 App Router, TypeScript).
- Backend is Supabase — Postgres + Auth + Storage + Deno Edge Functions. There is no separate API service; every endpoint is a Next.js Route Handler under `apps/web/app/api/`.
- Hosting: Vercel (web) + Supabase (DB/Auth/Edge) + Resend (email) + Stripe (billing) + Cloudflare R2 (production file storage).
- Path alias `@/*` → `apps/web/*`.

### Multi-tenancy and auth (read this before touching data access)

Tenancy is enforced at the database layer via RLS keyed on `firm_id`. Two pieces make this work:

1. **Custom JWT hook (`custom_access_token_hook`)** — installed in Supabase Auth, injects `firm_id` and `role` claims from `public.users` into every issued JWT. RLS policies read these claims directly. If the hook is not installed/enabled, every authenticated query returns empty and the app appears broken — check this first when seeing 0-row results.
2. **Two Supabase clients** in `apps/web/lib/supabase/`:
   - `createSupabaseServerClient()` — anon key + cookie session, **RLS-bound**. Default for all route handlers and server components.
   - `createSupabaseAdminClient()` — service role key, **bypasses RLS**. Only for: Edge Functions, atomic admin ops (e.g. signup creating firm + first user), webhook handlers verifying provider signatures. Never import this from client components.

Middleware (`apps/web/middleware.ts`) gates everything except an explicit allowlist: `/api/auth/*`, `/api/portal/*` (token-gated), `/api/webhooks/*` (HMAC/token-signed by provider), `/login`, `/signup`, `/portal/*`, `/auth/*`, and `/`. Unauthed API → 401 JSON; unauthed page → redirect to `/login?redirectTo=…`.

### The risk engine is the product

`apps/web/lib/risk-engine.ts` is pure TypeScript with no React or Supabase deps. It exports:

- `computeWorkflowStatus` — applies conditions C1–C5 (timeline breach, deadline proximity, document blocker, stage stall, high-risk history) plus deadline math to produce `On Track | At Risk | Overdue | Complete`.
- `evaluateGate` — per-stage enforcement (e.g. Stage 2 blocks if docs pending; Stage 4 dual-review if GST > $10k; Stage 5 blocks if Stage 4 not approved).
- `aggregateClientStatus`, `wfRiskScore`, `willBecomeAtRisk` — used by dashboard sorting and "soon at risk" spotlights.

Because it's pure, it runs identically on the server (gate enforcement before DB writes — see `app/api/stages/[id]/route.ts`) and on the client (UI status badges). Never bypass `evaluateGate` when mutating stage status — the server-side check in the PATCH route is the authoritative gate.

### Workflow lifecycle

`apps/web/lib/workflow-templates.ts` defines the 6-stage templates for GST/HST, T1, T2, Bookkeeping, and Payroll. Each template lists `stages[]` (with gate metadata), `tasks[]` (assigned by role, due offsets in days from `cycle_start`), and `docs[]` (with `corp_only` / `sole_prop_only` branching). `POST /api/workflows` reads the template for the requested type and materialises stage/task/document rows in one transaction.

Recurring workflows are auto-created by the `auto-create-workflows` Edge Function, scheduled by `pg_cron`:
- Monthly cycles: 1st of every month
- Quarterly cycles: 2nd of Jan/Apr/Jul/Oct

The `process-automation-jobs` Edge Function runs every 15 min, drains `automation_jobs` (doc reminders, escalations) in batches of 50, calls Resend, and writes `notification_log`. Locally, `RESEND_API_KEY` may be unset — the function logs a warning and skips sending; nothing breaks.

### Storage abstraction

File uploads go through `POST /api/upload` which returns a presigned URL. The provider is selected by `STORAGE_PROVIDER` env var (`supabase` | `r2`); R2 logic lives in `apps/web/lib/storage/r2.ts`. Switching providers is a redeploy with the env var changed — existing files in the old provider continue to resolve via their stored signed URLs.

### Build behaviour to be aware of

`next.config.mjs` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` — the production build will succeed even with type/lint errors. **Always run `pnpm typecheck && pnpm lint` before pushing**; CI/Vercel will not catch these for you.

The same file applies a strict CSP (`default-src 'self'`, `frame-ancestors 'none'`) and HSTS. If you add a third-party script/iframe/font source, you must add it to the CSP or it will be blocked silently.

### Notable conventions

- API errors use `{ error: string, code?: string }` with codes like `UNAUTHORIZED`, `GATE_BLOCKED`, `NOT_FOUND` — match this shape for new endpoints.
- All route handlers do their own auth check via `supabase.auth.getUser()` and look up `firm_id`/`role` from `public.users` even though middleware already gated the request — RLS is the second line, but route handlers also enforce role checks for write paths.
- `apps/web/types/database.ts` is the single source of truth for DB row shapes and API response shapes (`ClientSummary`, `WorkflowWithDetails`, `DashboardStats`, etc.). Update it when you add columns.
- Supabase region for production must be `ca-central-1` (PIPEDA). Do not provision new projects in US regions.
