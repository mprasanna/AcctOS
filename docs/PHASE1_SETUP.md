# AcctOS — Phase 1 Implementation Guide

> From demo prototype → real Supabase-backed app on Vercel.
> Estimated time: 1–2 days for a developer familiar with the codebase.

---

## What Phase 1 Delivers

- All mock data (`RAW_CLIENTS`) replaced with PostgreSQL via Supabase
- REST API fully implemented in Next.js App Router route handlers
- Risk engine (`computeWorkflowStatus`, `evaluateGate`) runs server-side on mutations
- Gate enforcement is real — stages cannot be illegally advanced
- Row Level Security isolates all firm data at the database level
- Vercel deployment with zero manual build steps

---

## Step 1 — Supabase Project Setup

### 1.1 Create project

1. Go to https://supabase.com → New project
2. **Region: Canada (ca-central-1)** — required for PIPEDA compliance
3. Save the database password securely (1Password)

### 1.2 Get API keys

Dashboard → Project Settings → API:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon / public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never public)

### 1.3 Run migrations

In the Supabase dashboard → SQL Editor, run each migration file in order:

```
001_init_schema.sql
002_workflows_stages_tasks.sql
003_documents_events.sql
004_rls_policies.sql
005_seed_demo_data.sql    ← run in staging only, NOT production
006_helper_functions.sql
```

Or via Supabase CLI (preferred for repeatability):

```bash
# Install CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref your-project-id

# Push all migrations
supabase db push
```

### 1.4 Verify seed data

In Supabase dashboard → Table Editor:
- `firms` → 1 row (Jensen & Associates CPA)
- `clients` → 6 rows (Maple, Sunrise, Patel, Riviera, Northbridge, Lakeshore)
- `workflows` → 8 rows
- `stages` → ~30 rows
- `documents` → 7 rows

---

## Step 2 — Create Demo User in Auth

The seed data inserts into `users` table but `auth.users` must be created separately.

### Option A — Supabase Dashboard

Dashboard → Authentication → Users → Invite user:
- Email: `patrick@jensen.ca`
- After they set password, note their UUID

Then update the seed user:
```sql
UPDATE users SET id = 'actual-auth-user-uuid'
WHERE email = 'patrick@jensen.ca';
```

### Option B — Admin API (automated)

```typescript
import { createSupabaseAdminClient } from '@/lib/supabase/server'

const admin = createSupabaseAdminClient()
const { data } = await admin.auth.admin.createUser({
  email: 'patrick@jensen.ca',
  password: 'demo-password-change-this',
  user_metadata: {
    firm_id: '00000000-0000-0000-0000-000000000001',
    role: 'owner',
  },
  email_confirm: true,
})
```

### 2.1 JWT custom claims

Supabase needs to inject `firm_id` and `role` into the JWT so RLS can use them.

In Supabase dashboard → Authentication → Hooks → Enable "Custom Access Token":

```sql
-- This function is called when generating JWTs
CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_row record;
BEGIN
  -- Get user's firm_id and role from users table
  SELECT firm_id, role INTO user_row
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_row IS NOT NULL THEN
    claims := jsonb_set(claims, '{firm_id}', to_jsonb(user_row.firm_id::text));
    claims := jsonb_set(claims, '{role}',    to_jsonb(user_row.role::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM authenticated, anon, public;
```

Then in Auth Settings, set the hook function to `custom_access_token_hook`.

---

## Step 3 — Local Development

### 3.1 Install dependencies

```bash
cd acct-os/apps/web
npm install
```

Required packages:
```bash
npm install @supabase/supabase-js @supabase/ssr next react react-dom
npm install -D typescript @types/node @types/react @types/react-dom
```

### 3.2 Environment variables

```bash
cp ../../.env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 3.3 Start dev server

```bash
npm run dev
# http://localhost:3000
```

---

## Step 4 — Update AccountingOS.jsx to Use Real API

The existing `AccountingOS.jsx` component uses `useClients()` which reads from `RAW_CLIENTS`.

### 4.1 Replace the data source

The new `useClients()` hook in `lib/hooks/index.ts` is a drop-in replacement.

**Before (mock):**
```javascript
import { useMemo } from 'react'
// ...
function useClients() {
  return useMemo(() => { /* transforms RAW_CLIENTS */ }, [])
}
```

**After (real API):**
```javascript
import { useClients } from '@/lib/hooks'
// useClients() now returns { clients, loading, error, refetch }
// clients array has the same shape as before — same fields, same computed status
```

### 4.2 Handle loading state

The mock data is synchronous. The real API is async. Add loading state handling:

```jsx
function Dashboard({ setView }) {
  const { clients, loading, error } = useClients()

  if (loading) return <LoadingScreen />
  if (error)   return <ErrorBanner message={error} />

  // Rest of Dashboard is unchanged
}
```

### 4.3 Wire up mutations

Replace the mock "no-op" buttons with real API calls:

```jsx
// Before: button does nothing
<Btn variant="primary">+ Send Request</Btn>

// After: calls real API
const { send, loading } = useSendDocumentRequest()

<Btn
  variant="primary"
  disabled={loading}
  onClick={() => send(wf.id, pendingDocIds, `Reminder #${emailLog.length + 1}`)}
>
  {loading ? 'Sending...' : '+ Send Request'}
</Btn>
```

---

## Step 5 — Deploy to Vercel

### 5.1 Connect repository

1. Go to https://vercel.com → Import Project → GitHub
2. Select `acct-os` repository
3. **Root directory:** `apps/web`
4. Framework: Next.js (auto-detected)

### 5.2 Environment variables

In Vercel project → Settings → Environment Variables, add:

| Variable | Environment |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | **Production only** |

For preview deployments, point to a separate staging Supabase project.

### 5.3 Custom domain (optional)

Vercel → Domains → Add `app.acct-os.com` → follow DNS instructions.

---

## Step 6 — Verify Everything Works

### Checklist

- [ ] `GET /api/dashboard` returns 6 clients with correct status
- [ ] `GET /api/clients` returns risk-sorted list
- [ ] `GET /api/clients/[maple-id]` returns full workflow detail
- [ ] `PATCH /api/stages/[blocked-stage-id]` with `status: complete` returns `409 GATE_BLOCKED`
- [ ] `PATCH /api/stages/[stage-2-sunrise]` with `status: complete` returns `409` (docs missing)
- [ ] `PATCH /api/documents/[pending-doc-id]` with `status: received` auto-unblocks Stage 2 when all docs received
- [ ] `POST /api/documents/request` logs to email_log and increments reminder_count
- [ ] Unauthenticated `GET /api/clients` returns `401`
- [ ] User from different firm cannot read clients from another firm (RLS test)

### RLS smoke test

```sql
-- In Supabase SQL Editor, simulate a different firm's user
SET LOCAL "request.jwt.claims" = '{"firm_id": "99999999-0000-0000-0000-000000000000", "role": "owner"}';
SELECT COUNT(*) FROM clients;
-- Expected: 0 (different firm sees nothing)
```

---

## File Map

```
supabase/migrations/
  001_init_schema.sql          ← firms · users · clients + enums
  002_workflows_stages_tasks.sql ← workflows · stages · tasks
  003_documents_events.sql     ← documents · email_log · events
  004_rls_policies.sql         ← all RLS policies + auth helpers
  005_seed_demo_data.sql       ← 6 demo clients (staging only)
  006_helper_functions.sql     ← increment_reminder_count · refresh · stats

apps/web/
  types/database.ts            ← TypeScript types for all tables
  lib/supabase/client.ts       ← browser Supabase client
  lib/supabase/server.ts       ← server + admin Supabase clients
  lib/risk-engine.ts           ← computeWorkflowStatus · evaluateGate · wfRiskScore
  lib/hooks/index.ts           ← useClients · useClient · useWorkflows + mutations
  middleware.ts                ← auth route protection
  next.config.ts               ← security headers · redirects
  app/api/
    dashboard/route.ts         ← GET /api/dashboard
    clients/route.ts           ← GET · POST /api/clients
    clients/[id]/route.ts      ← GET · PATCH · DELETE /api/clients/:id
    workflows/route.ts         ← GET · POST /api/workflows
    stages/[id]/route.ts       ← PATCH /api/stages/:id (gate enforcement)
    tasks/route.ts             ← GET /api/tasks
    tasks/[id]/route.ts        ← PATCH /api/tasks/:id
    documents/route.ts         ← GET /api/documents
    documents/[id]/route.ts    ← PATCH /api/documents/:id
    documents/request/route.ts ← POST /api/documents/request

docs/
  API_SPEC.md                  ← Full REST API specification
```

---

## Phase 2 Preview

After Phase 1 is stable with 3+ paying customers:

1. Add Supabase Auth login page (`/login`)
2. Multi-user invite flow (`POST /api/users/invite`)
3. T1 and T2 workflow templates
4. File upload via Supabase Storage
5. Status auto-change when all tasks in a stage complete
