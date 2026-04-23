# AcctOS — Phase 2 Implementation Guide

> From Interactive MVP → Usable Product.
> Goal: 10 firms relying on it daily. Churn < 20%.

---

## What Phase 2 Adds

| Feature | File(s) |
|---|---|
| Multi-user auth (signup, login, invite, roles) | `app/api/auth/*`, `app/api/users/*`, `app/auth/accept-invite` |
| Firm settings (automation preferences) | `app/api/settings`, migration 007 |
| Status auto-advance (task → stage → workflow cascade) | migration 009, updated `app/api/tasks/[id]` |
| File uploads (presigned URL → Supabase Storage) | `app/api/upload`, migration 007/008 |
| T1 + T2 + Bookkeeping workflow templates | `lib/workflow-templates.ts` |
| Bookkeeping → GST Stage 1 feed (workflow links) | `app/api/workflow-links`, migration 007 |
| Updated `POST /api/workflows` with full template engine | `app/api/workflows/route.ts` |
| AuthProvider + useAuth + Phase 2 hooks | `lib/hooks/index.ts` |

---

## Step 1 — Run Phase 2 Migrations

In order, after Phase 1 migrations (001–006):

```
007_phase2_schema.sql        ← firm_settings, storage_objects, workflow_links,
                                auto_advance_log, user_invitations
008_phase2_rls.sql           ← RLS for all Phase 2 tables + Storage bucket policies
009_auto_advance_functions.sql ← auto_advance_stage() + fire_workflow_links() functions
```

```bash
supabase db push
```

---

## Step 2 — Create the Storage Bucket

In Supabase Dashboard → Storage → New Bucket:
- **Name:** `client-documents`
- **Public:** No (private — all access via signed URLs)
- **File size limit:** 25MB

Or via SQL:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-documents', 'client-documents', false, 26214400);
```

The RLS policies in migration 008 apply automatically after bucket creation.

---

## Step 3 — Configure Auth JWT Hook

The `custom_access_token_hook` from Phase 1 setup still applies.
Make sure it's active — it injects `firm_id` and `role` into the JWT.

---

## Step 4 — Wrap App in AuthProvider

In `app/layout.tsx` (or your root layout):

```tsx
import { AuthProvider } from '@/lib/hooks'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

---

## Step 5 — Signup Flow

New firms use `POST /api/auth/signup`:

```json
{
  "email": "owner@newfirm.ca",
  "password": "secure-password",
  "firm_name": "Bright Tax Advisory",
  "your_name": "Sarah M."
}
```

This atomically creates:
1. `auth.users` row (Supabase Auth)
2. `firms` row
3. `users` profile row
4. `firm_settings` row (via trigger)

Then call `POST /api/auth/login` to get a session.

---

## Step 6 — Invite Team Members

Owner calls `POST /api/users/invite`:

```json
{
  "email": "accountant@newfirm.ca",
  "name": "James R.",
  "role": "accountant"
}
```

The invited user receives a Supabase Auth email. They click the link, set a password, and are redirected to `/auth/accept-invite?token=...`. This route creates their `users` profile row and marks the invitation accepted.

---

## Step 7 — Wire AutoAdvance in AccountingOS.jsx

The `useUpdateTask` hook now returns `auto_advance` in its result:

```tsx
const { update } = useUpdateTask()

const handleTaskComplete = async (taskId: string) => {
  const result = await update(taskId, { status: 'complete' })

  if (result.data?.auto_advance?.advanced) {
    const { stage_n, next_stage } = result.data.auto_advance
    showToast(`Stage ${stage_n} completed automatically → Stage ${next_stage} started`)
    refetch() // refresh the client workspace
  }
}
```

---

## Step 8 — File Upload in Document Tab

Replace the "Received" toggle with a real upload:

```tsx
import { useFileUpload, useMarkDocumentReceived } from '@/lib/hooks'

function DocumentRow({ doc, workflowId }) {
  const { upload, loading, progress } = useFileUpload()
  const { markReceived } = useMarkDocumentReceived()

  const handleUpload = async (file: File) => {
    const { error, path } = await upload(file, workflowId, doc.id)
    if (!error && path) {
      await markReceived(doc.id, 'Manual upload')
      refetch()
    }
  }

  return (
    <div>
      <span>{doc.name}</span>
      {doc.status === 'pending' && (
        <input
          type="file"
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
      )}
      {loading && progress && (
        <progress value={progress.percent} max={100} />
      )}
    </div>
  )
}
```

---

## Step 9 — Settings Page Integration

Replace the mock toggle state in `SettingsPage` with real data:

```tsx
import { useSettings } from '@/lib/hooks'

function SettingsPage() {
  const { data, loading, save } = useSettings()
  const settings = data?.settings

  const toggle = async (key: string) => {
    await save({ [key]: !settings?.[key] })
  }

  // Replace local useState with settings?.auto_create_workflows, etc.
}
```

---

## Step 10 — Create a Bookkeeping→GST Link

After creating both a Bookkeeping and GST workflow for the same client:

```tsx
import { useCreateWorkflowLink } from '@/lib/hooks'

const { link } = useCreateWorkflowLink()

// Called from the workflow creation UI when user opts in
await link({
  source_workflow_id: bookkeepingWorkflowId,  // Bookkeeping
  source_stage_n: 6,                           // Sign-off stage
  target_workflow_id: gstWorkflowId,           // GST/HST
  target_stage_n: 1,                           // Bookkeeping gate
})
```

Or: when `POST /api/workflows` creates a GST workflow, it returns `suggested_bookkeeping_link` if a Bookkeeping workflow exists for the client. The UI can prompt the user to link them.

---

## New API Endpoints (Phase 2)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Create firm + owner account |
| `POST` | `/api/auth/login` | Sign in, get session token |
| `POST` | `/api/auth/logout` | Invalidate session |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET`  | `/api/users` | List team members + pending invites |
| `POST` | `/api/users/invite` | Invite a team member |
| `GET`  | `/api/users/:id` | Get user profile |
| `PATCH`| `/api/users/:id` | Update user profile or role |
| `DELETE`| `/api/users/:id` | Remove user, reassign clients |
| `GET`  | `/api/settings` | Get firm profile + automation settings |
| `PATCH`| `/api/settings` | Update firm profile + automation settings |
| `POST` | `/api/upload` | Get presigned upload URL |
| `GET`  | `/api/upload?path=...` | Get signed download URL |
| `GET`  | `/api/workflow-links` | List workflow links |
| `POST` | `/api/workflow-links` | Create Bookkeeping→GST link |

---

## Auto-Advance Behaviour (Task → Stage → Workflow)

When `PATCH /api/tasks/:id { status: 'complete' }`:

1. Task is updated
2. `auto_advance_stage(workflow_id, stage_n)` is called (Postgres function)
3. Function checks: all tasks in stage complete? Gate passes?
4. If yes: stage → `complete`, next stage → `in_progress`
5. `fire_workflow_links()` checks for linked workflows and advances them
6. `computeWorkflowStatus()` runs, `workflows.computed_status` updated
7. Response includes `auto_advance: { advanced: true, stage_n: 3, next_stage: 4 }`

The UI can use this to show a toast: "Stage 3 completed automatically."

---

## File Map (Phase 2 additions)

```
supabase/migrations/
  007_phase2_schema.sql         ← firm_settings, storage_objects, workflow_links,
                                   auto_advance_log, user_invitations
  008_phase2_rls.sql            ← Phase 2 RLS + Storage bucket policies
  009_auto_advance_functions.sql ← auto_advance_stage() + fire_workflow_links()

apps/web/
  lib/workflow-templates.ts      ← GST, T1, T2, Bookkeeping templates + resolveTemplate()
  lib/hooks/index.ts             ← All hooks including AuthProvider, useAuth, useUsers,
                                   useSettings, useFileUpload, useCreateWorkflowLink
  app/api/auth/login/route.ts
  app/api/auth/logout/route.ts
  app/api/auth/refresh/route.ts
  app/api/auth/signup/route.ts   ← Atomic firm + user creation
  app/api/users/route.ts
  app/api/users/invite/route.ts
  app/api/users/[id]/route.ts
  app/api/settings/route.ts
  app/api/upload/route.ts        ← Presigned URL generation + download URL
  app/api/workflow-links/route.ts
  app/api/workflows/route.ts     ← Updated with full template engine
  app/api/tasks/[id]/route.ts    ← Updated with auto-advance cascade
  app/auth/accept-invite/route.ts ← Invite acceptance callback
  types/database.ts              ← Phase 2 row types appended
```

---

## Success Metrics

| Metric | Target |
|---|---|
| Firms actively using daily | 10 |
| Churn after 3 months | < 20% |
| Primary feedback theme | "Saves time on deadline tracking" |
| MRR | $1,500–$3,000 |
| Feature requests driving Phase 3 | Email reminders, mobile view |
