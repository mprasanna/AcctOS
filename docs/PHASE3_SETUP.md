# AcctOS — Phase 3 Implementation Guide

> Retention Engine: firms can't run without it.
> Goal: 25–50 firms · MRR $3,000–$7,500

---

## What Phase 3 Adds

| Feature | Files |
|---|---|
| Transactional email (Resend) | `lib/email/index.ts` + `lib/email/templates/*` |
| Automation job queue + pg_cron | `supabase/migrations/010`, `supabase/functions/process-automation-jobs/` |
| Auto-create monthly/quarterly workflows | `supabase/functions/auto-create-workflows/` |
| Job management API | `app/api/automation/jobs/`, `app/api/automation/trigger/` |
| Resend webhook (delivery status) | `app/api/webhooks/resend/` |
| Dashboard intelligence + anomaly detection | `app/api/intelligence/` |
| R2 storage adapter (drop-in for Supabase Storage) | `lib/storage/r2.ts` |
| Updated `/api/upload` (provider-agnostic) | `app/api/upload/route.ts` |
| Updated `/api/documents/request` (real emails) | `app/api/documents/request/route.ts` |
| Phase 3 React hooks | appended to `lib/hooks/index.ts` |

---

## Step 1 — Run Migrations

```bash
supabase db push
```

Runs in order:
- `010_phase3_schema.sql` — automation_jobs, notification_log, gst_history, r2_objects + pg_cron schedules + triggers
- `011_phase3_rls.sql` — RLS for all Phase 3 tables

**Before running migration 010:** Replace `SUPABASE_PROJECT_REF` and `SERVICE_ROLE_KEY` placeholders in the pg_cron schedule definitions at the bottom of the file with your actual values.

---

## Step 2 — Enable pg_cron + pg_net

In Supabase Dashboard → Database → Extensions:
1. Enable `pg_cron`
2. Enable `pg_net`

After enabling, the schedules from migration 010 will start running automatically.

---

## Step 3 — Deploy Edge Functions

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref your-project-ref

# Deploy both Edge Functions
supabase functions deploy process-automation-jobs
supabase functions deploy auto-create-workflows
```

Set Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets:
```
SUPABASE_URL          = (auto-populated)
SUPABASE_SERVICE_ROLE_KEY = (auto-populated)
RESEND_API_KEY        = re_...
RESEND_FROM_ADDRESS   = AcctOS <noreply@yourdomain.ca>
NEXT_PUBLIC_APP_URL   = https://app.acct-os.com
```

---

## Step 4 — Configure Resend

1. Create account at https://resend.com
2. Verify your sending domain (Resend → Domains → Add Domain → follow DNS instructions)
3. Generate API key: Resend → API Keys → Create
4. Set up webhook: Resend → Webhooks → Add Endpoint
   - URL: `https://app.acct-os.com/api/webhooks/resend`
   - Events: `email.delivered`, `email.opened`, `email.bounced`, `email.complained`
   - Copy the Signing Secret → set as `RESEND_WEBHOOK_SECRET`

**Free tier:** 3,000 emails/month — sufficient for ~10 firms in Phase 3.
**At 50 firms:** ~$20/month (Resend Pro, ~30,000 emails/month).

---

## Step 5 — Add Phase 3 Env Vars

In Vercel → Project → Settings → Environment Variables:

```
RESEND_API_KEY            (Production)
RESEND_FROM_ADDRESS       (Production)
RESEND_REPLY_TO           (Production)
RESEND_WEBHOOK_SECRET     (Production)
STORAGE_PROVIDER=supabase (All — change to r2 when ready to migrate)
```

R2 vars only needed when `STORAGE_PROVIDER=r2`:
```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

---

## Step 6 — Test the Automation Pipeline

### Manual job trigger
```bash
curl -X POST https://app.acct-os.com/api/automation/trigger \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"send_test_email","type":"doc_reminder","workflow_id":"<id>"}'
```

The job is queued. To process immediately without waiting for cron:
```bash
# Invoke the Edge Function directly
supabase functions invoke process-automation-jobs --no-verify-jwt
```

### Verify notification_log
```sql
SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 10;
```

### Verify automation_jobs
```sql
SELECT type, status, scheduled_at, processed_at, last_error
FROM automation_jobs
ORDER BY scheduled_at DESC
LIMIT 20;
```

---

## Step 7 — Migrate to Cloudflare R2 (Optional — when Supabase Storage limits hit)

R2 gives you zero egress fees. At 50 firms with frequent document access, Supabase Storage egress would cost $20–40/month; R2 costs $0.

**Migration steps:**
1. Create Cloudflare account → R2 → Create Bucket → `acct-os-documents`
2. Create R2 API token with Object Read & Write permissions
3. Set env vars: `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
4. Deploy to Vercel

**No code changes needed** — the upload route checks `STORAGE_PROVIDER` and routes to the correct provider automatically. New uploads go to R2; existing files in Supabase Storage still resolve via the Supabase signed URL path.

For a full migration of existing files, write a script that:
- Lists all `storage_objects` rows
- Downloads each file from Supabase Storage
- Uploads to R2 with the same key
- Inserts a row into `r2_objects`
- Updates `documents.storage_path` and `documents.upload_source`

---

## Automation Job Lifecycle

```
Workflow created
  └─ trg_workflow_schedule_jobs trigger fires
     └─ schedule_automation_jobs() inserts pending jobs:
          doc_reminder     → scheduled at cycle_start + 3 days
          doc_escalation   → scheduled at cycle_start + 6 days
          deadline_alert   → scheduled at deadline - N days (from settings)
          urgent_doc_alert → scheduled at deadline - 5 days
          overdue_flag     → scheduled at deadline + 1 hour

pg_cron ticks every 15 minutes
  └─ HTTP POST to process-automation-jobs Edge Function
     └─ SELECT pending jobs WHERE scheduled_at <= now()
        └─ For each job:
             Check: condition still applies?
             → Yes: send email via Resend, update status = 'sent'
             → No:  update status = 'skipped' (docs received, workflow complete, etc.)
             → Err: update status = 'failed', increment attempts
             Log to notification_log

Resend webhook fires on delivery events
  └─ POST /api/webhooks/resend
     └─ Verify signature
     └─ Update notification_log.delivery_status
     └─ On bounce: log event to activity feed
```

---

## Dashboard Intelligence

`GET /api/intelligence` powers the new `useIntelligence()` hook.

**Priority suggestion** — computed from risk scores:
> "You have 4 filings due this week. Start with Patel & Sons — overdue, high penalty risk."

**Anomaly detection** — compares current GST to prior 3-period average. Threshold: ±30%:
> "Sunrise Bakery's GST for Q3 2025 is $4,200 — 60% lower than the prior 3-period average ($10,500). Review before filing."

These surface in the dashboard `Alert` section automatically once there's historical data (after 2+ filed GST workflows per client).

Wire them into `AccountingOS.jsx`:
```tsx
import { useIntelligence } from '@/lib/hooks'

function Dashboard({ ... }) {
  const { data: intel } = useIntelligence()

  // In the alert section:
  {intel?.priority_suggestion && (
    <Alert color={C.indigo} bg={C.indigoBg} border="#C7D2FE">
      🧠 {intel.priority_suggestion}
    </Alert>
  )}

  {intel?.anomalies.map(a => (
    <Alert key={a.client_id} color={C.amber} bg={C.amberBg} border="#FCD34D">
      ⚑ {a.message}
    </Alert>
  ))}
}
```

---

## New API Endpoints (Phase 3)

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/intelligence` | Priority suggestions + anomaly flags + this-week summary |
| `GET`  | `/api/automation/jobs` | List automation jobs with status filter |
| `POST` | `/api/automation/trigger` | Manual trigger / cancel / reschedule / test |
| `POST` | `/api/webhooks/resend` | Resend delivery status callback |

---

## Package Updates Needed

```bash
cd apps/web
npm install resend @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## File Map (Phase 3 additions)

```
supabase/migrations/
  010_phase3_schema.sql          ← automation_jobs, notification_log, gst_history,
                                    r2_objects, schedule_automation_jobs(),
                                    trg_record_gst_history(), pg_cron schedules
  011_phase3_rls.sql             ← RLS for all Phase 3 tables

supabase/functions/
  process-automation-jobs/index.ts ← Deno Edge Function: processes job queue
  auto-create-workflows/index.ts   ← Deno Edge Function: monthly/quarterly workflow creation

apps/web/
  lib/email/index.ts             ← Resend client + typed senders
  lib/email/templates/
    doc-reminder.ts              ← Reminder #1 and #2 HTML email
    escalation.ts                ← Owner escalation email
    deadline-alert.ts            ← Accountant deadline alert email
    overdue-alert.ts             ← Owner overdue alert email
  lib/storage/r2.ts              ← Cloudflare R2 adapter + lifecycle tier tracking
  app/api/intelligence/route.ts  ← Priority suggestion + anomaly detection
  app/api/automation/jobs/route.ts
  app/api/automation/trigger/route.ts
  app/api/webhooks/resend/route.ts
  app/api/upload/route.ts        ← Updated: provider-agnostic (Supabase or R2)
  app/api/documents/request/route.ts ← Updated: real Resend emails
  lib/hooks/index.ts             ← Appended: useIntelligence, useAutomationJobs,
                                    useAutomationTrigger, useNotificationLog
```

---

## Success Metrics

| Metric | Target |
|---|---|
| Firms | 25–50 |
| MRR | $3,000–$7,500 |
| Firms mentioning reminders in retention conversations | >60% |
| Average document reminder response time | < 48 hours |
| Email delivery rate | > 95% |
| Churn after Phase 3 | < 15% |
