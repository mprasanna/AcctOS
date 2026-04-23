# AcctOS — Complete Setup Guide
> One document. Zero to deployed. Covers Supabase, Vercel, all third-party services, and the full test checklist.

---

## Prerequisites

Install these before anything else.

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org or `nvm install 20` |
| pnpm | 9+ | `npm install -g pnpm` |
| Supabase CLI | latest | `npm install -g supabase` |
| Git | any | https://git-scm.com |

Verify:
```bash
node -v        # v20+
pnpm -v        # 9+
supabase -v    # 1.x
```

---

## Part 1 — Repository

### 1.1 Clone and install

```bash
git clone https://github.com/YOUR_ORG/acct-os.git
cd acct-os/apps/web
pnpm install
```

### 1.2 Install all dependencies

The full dependency list for all features built in Phases 1–4:

```bash
pnpm add \
  @supabase/supabase-js \
  @supabase/ssr \
  resend \
  stripe \
  @aws-sdk/client-s3 \
  @aws-sdk/s3-request-presigner

pnpm add -D \
  typescript \
  @types/node \
  @types/react \
  @types/react-dom
```

Your final `package.json` dependencies section should look like this:

```json
{
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@supabase/supabase-js": "^2.44.4",
    "@supabase/ssr": "^0.4.0",
    "resend": "^3.2.0",
    "stripe": "^16.0.0",
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
```

### 1.3 Copy environment file

```bash
cp .env.example .env.local
```

Leave `.env.local` open — you will fill it in as you complete each section below.

---

## Part 2 — Supabase Project

### 2.1 Create project

1. Go to https://supabase.com → New project
2. **Region: Canada (ca-central-1)** — required for PIPEDA
3. Choose a strong database password and save it in your password manager
4. Wait ~2 minutes for the project to provision

### 2.2 Get API keys

Dashboard → Project Settings → API:

```
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...   # "anon public" key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...       # "service_role" key — never expose
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF       # just the subdomain part
```

Also set your app URL:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000   # change to https://app.acct-os.com in Vercel
```

### 2.3 Enable database extensions

Dashboard → Database → Extensions. Enable each:

| Extension | Required for |
|---|---|
| `uuid-ossp` | UUID generation (migrations 001+) |
| `pgcrypto` | Token hashing |
| `pg_cron` | Automated job scheduling (Phase 3) |
| `pg_net` | HTTP calls from Postgres to Edge Functions (Phase 3) |

All four are available on Supabase free tier. Click the toggle — no configuration needed.

### 2.4 Link CLI and run migrations

```bash
# From the repo root
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Run all 14 migrations in order (001 through 014)
supabase db push
```

This creates every table, enum, index, trigger, RLS policy, and helper function across all four phases.

**Verify in Table Editor:**
- `firms` → 1 row
- `clients` → 6 rows
- `workflows` → 8 rows
- `stages` → ~30 rows
- `documents` → 7 rows

### 2.5 Create the Storage bucket

In Dashboard → Storage → New Bucket:
- **Name:** `client-documents`
- **Public:** No (private)
- **File size limit:** 26214400 (25 MB)

Or via SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-documents', 'client-documents', false, 26214400);
```

### 2.6 Configure the JWT custom claims hook

RLS policies read `firm_id` and `role` from the JWT. Supabase needs a hook to inject them.

In the SQL Editor, run:
```sql
CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims   jsonb;
  user_row record;
BEGIN
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

GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM authenticated, anon, public;
```

Then in Dashboard → Authentication → Hooks:
- Enable **Custom Access Token**
- Select function: `custom_access_token_hook`
- Save

### 2.7 Create the demo auth user

The seed data inserted a `users` row for `patrick@jensen.ca` with a placeholder UUID. You need to create the matching `auth.users` row, then link them.

**In Dashboard → Authentication → Users → Add User:**
- Email: `patrick@jensen.ca`
- Password: (set something you'll remember for testing)
- Email confirm: checked
- Copy the UUID that Supabase assigns

**Then in SQL Editor:**
```sql
-- Replace 'ACTUAL-UUID-FROM-SUPABASE-AUTH' with the UUID you just copied
UPDATE public.users
SET id = 'ACTUAL-UUID-FROM-SUPABASE-AUTH'
WHERE email = 'patrick@jensen.ca';
```

This is the only manual step. Every future user is created via `POST /api/auth/signup` or the invite flow.

### 2.8 Configure pg_cron schedules

Migration 010 created the cron schedules but with placeholder values. Update them with your real project ref and service role key.

In SQL Editor:
```sql
-- First, remove the placeholder schedules
SELECT cron.unschedule('process-automation-jobs');
SELECT cron.unschedule('refresh-days-to-deadline');
SELECT cron.unschedule('auto-create-monthly-workflows');
SELECT cron.unschedule('auto-create-quarterly-workflows');

-- Re-create with real values
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY below

SELECT cron.schedule(
  'process-automation-jobs',
  '*/15 * * * *',
  format($$
    SELECT net.http_post(
      url     := 'https://%s.supabase.co/functions/v1/process-automation-jobs',
      headers := jsonb_build_object(
        'Authorization', 'Bearer %s',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$, 'YOUR_PROJECT_REF', 'YOUR_SERVICE_ROLE_KEY')
);

SELECT cron.schedule(
  'refresh-days-to-deadline',
  '0 0 * * *',
  $$ SELECT refresh_all_days_to_deadline(); $$
);

SELECT cron.schedule(
  'auto-create-monthly-workflows',
  '0 10 1 * *',
  format($$
    SELECT net.http_post(
      url     := 'https://%s.supabase.co/functions/v1/auto-create-workflows',
      headers := jsonb_build_object(
        'Authorization', 'Bearer %s',
        'Content-Type',  'application/json'
      ),
      body    := '{"freq":"Monthly"}'::jsonb
    );
  $$, 'YOUR_PROJECT_REF', 'YOUR_SERVICE_ROLE_KEY')
);

SELECT cron.schedule(
  'auto-create-quarterly-workflows',
  '0 10 2 1,4,7,10 *',
  format($$
    SELECT net.http_post(
      url     := 'https://%s.supabase.co/functions/v1/auto-create-workflows',
      headers := jsonb_build_object(
        'Authorization', 'Bearer %s',
        'Content-Type',  'application/json'
      ),
      body    := '{"freq":"Quarterly"}'::jsonb
    );
  $$, 'YOUR_PROJECT_REF', 'YOUR_SERVICE_ROLE_KEY')
);

-- Verify
SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
```

### 2.9 Deploy Edge Functions

```bash
# From repo root
supabase functions deploy process-automation-jobs
supabase functions deploy auto-create-workflows
```

Set Edge Function secrets in Dashboard → Edge Functions → Manage secrets:
```
RESEND_API_KEY          = re_...
RESEND_FROM_ADDRESS     = AcctOS <noreply@yourdomain.ca>
NEXT_PUBLIC_APP_URL     = https://app.acct-os.com
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them manually.

---

## Part 3 — Resend (Email)

1. Create account at https://resend.com
2. **Verify your domain:** Resend → Domains → Add Domain → follow DNS instructions for your sending domain (e.g. `acct-os.com`). DNS propagation takes 5–30 minutes.
3. **Create API key:** Resend → API Keys → Create → Full Access → copy key

In `.env.local`:
```
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=AcctOS <noreply@yourdomain.ca>
RESEND_REPLY_TO=hello@yourdomain.ca
```

4. **Configure webhook:** Resend → Webhooks → Add Endpoint
   - URL: `https://app.acct-os.com/api/webhooks/resend`
   - Events: `email.delivered`, `email.opened`, `email.bounced`, `email.complained`
   - Copy the Signing Secret:
   ```
   RESEND_WEBHOOK_SECRET=whsec_...
   ```

> **During local development:** leave `RESEND_API_KEY` unset. The automation engine logs a warning and skips sending — no emails will fire, nothing breaks.

---

## Part 4 — Cloudflare R2 (File Storage)

R2 replaces Supabase Storage for production. Zero egress fees. Start with Supabase Storage (`STORAGE_PROVIDER=supabase`) and switch to R2 when you have paying customers.

**To set up R2 now:**

1. Create Cloudflare account → R2 → Create Bucket → name: `acct-os-documents`
2. R2 → Manage R2 API Tokens → Create Token → Permissions: Object Read & Write → scope to `acct-os-documents`
3. Copy the Access Key ID and Secret Access Key

In `.env.local`:
```
STORAGE_PROVIDER=supabase          # change to 'r2' when ready
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=acct-os-documents
```

**To switch to R2:** change `STORAGE_PROVIDER=r2` in Vercel env vars and redeploy. All new uploads go to R2. Existing files in Supabase Storage continue to resolve via their signed URLs until you run a migration script.

---

## Part 5 — QuickBooks Online

Skip this section if you are testing locally without QBO. The app works fully without it — Stage 1 just stays manual.

1. Go to https://developer.intuit.com → Create an App → QuickBooks Online and Payments
2. App name: your brand name (clients see this in the OAuth screen)
3. Under **Keys & OAuth**:
   - Add Redirect URI: `https://app.acct-os.com/api/integrations/qbo/callback`
   - For local testing also add: `http://localhost:3000/api/integrations/qbo/callback`
   - Copy Client ID and Client Secret
4. Under **Webhooks**:
   - Endpoint URL: `https://app.acct-os.com/api/webhooks/qbo`
   - Select entity: **Account**
   - Copy the Verifier Token

In `.env.local`:
```
QBO_CLIENT_ID=AB...
QBO_CLIENT_SECRET=...
QBO_REDIRECT_URI=https://app.acct-os.com/api/integrations/qbo/callback
QBO_SANDBOX=false                    # set 'true' for local testing with sandbox
QBO_WEBHOOK_VERIFIER_TOKEN=...
```

> **Sandbox vs Production:** Use `QBO_SANDBOX=true` locally — it points to `sandbox-quickbooks.api.intuit.com`. You need a separate sandbox company in the Intuit developer portal. Switch to `QBO_SANDBOX=false` for production.

---

## Part 6 — Zoho Books

Skip if not needed. Same pattern as QBO.

1. Go to https://api.console.zoho.com → Add Client → Server-based Applications
2. Homepage URL: `https://app.acct-os.com`
3. Redirect URI: `https://app.acct-os.com/api/integrations/zoho/callback`
4. Copy Client ID and Secret
5. In Zoho Books → Settings → Webhooks → New Webhook:
   - URL: `https://app.acct-os.com/api/webhooks/zoho`
   - Notify for: Banking events
   - Create a shared token (any string you choose)

In `.env.local`:
```
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REDIRECT_URI=https://app.acct-os.com/api/integrations/zoho/callback
ZOHO_WEBHOOK_TOKEN=your_shared_secret
```

---

## Part 7 — Stripe

1. Create account at https://stripe.com
2. Switch to **Canada** as your business country in account settings
3. Dashboard → Developers → API Keys → copy Secret key

In `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...   # use sk_live_ for production
```

### 7.1 Create products and prices

Dashboard → Products → Add product. Create three:

| Product | Monthly CAD | Annual CAD |
|---|---|---|
| AcctOS Starter | $49 | $470 (20% off) |
| AcctOS Growth | $149 | $1,430 |
| AcctOS Scale | $299 | $2,870 |

For each product, create two prices (monthly recurring + annual recurring). Copy all six Price IDs:

```
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_SCALE_MONTHLY=price_...
STRIPE_PRICE_SCALE_ANNUAL=price_...
```

### 7.2 Configure webhooks

Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://app.acct-os.com/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy the Signing Secret:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 7.3 Configure Customer Portal

Dashboard → Settings → Billing → Customer Portal → Configure:
- Allow customers to: update payment methods, upgrade/downgrade plans, cancel subscriptions
- Return URL: `https://app.acct-os.com/dashboard/settings`
- Save

---

## Part 8 — Vercel Deployment

### 8.1 Connect repository

1. Go to https://vercel.com → Add New Project → Import Git Repository
2. Select your `acct-os` repo
3. Configure:
   - **Framework:** Next.js (auto-detected)
   - **Root directory:** `apps/web`
   - **Build command:** `next build`
   - **Output directory:** `.next`
   - **Node.js version:** 20.x

### 8.2 Set environment variables

In Vercel → Project → Settings → Environment Variables. Add each variable below. Use the **Production** environment for live values. Add a second staging Supabase project for **Preview** environments — preview deployments should never touch production data.

**Required for all environments:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL          = https://app.acct-os.com  (or your domain)
```

**Server-only (Production):**
```
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM_ADDRESS
RESEND_REPLY_TO
RESEND_WEBHOOK_SECRET
STORAGE_PROVIDER             = supabase  (or r2)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER_MONTHLY
STRIPE_PRICE_STARTER_ANNUAL
STRIPE_PRICE_GROWTH_MONTHLY
STRIPE_PRICE_GROWTH_ANNUAL
STRIPE_PRICE_SCALE_MONTHLY
STRIPE_PRICE_SCALE_ANNUAL
QBO_CLIENT_ID
QBO_CLIENT_SECRET
QBO_REDIRECT_URI
QBO_SANDBOX                  = false
QBO_WEBHOOK_VERIFIER_TOKEN
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REDIRECT_URI
ZOHO_WEBHOOK_TOKEN
```

**R2 (only if STORAGE_PROVIDER=r2):**
```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

### 8.3 Custom domain

Vercel → Project → Settings → Domains → Add `app.acct-os.com` (or your domain). Follow the DNS instructions. SSL is provisioned automatically.

### 8.4 Deploy

```bash
git add .
git commit -m "chore: initial deployment"
git push origin main
```

Vercel builds and deploys automatically on push to `main`. Each push to other branches creates a preview deployment.

---

## Part 9 — Local Development

```bash
cd acct-os/apps/web
pnpm dev
# http://localhost:3000
```

TypeScript errors appear in your editor in real time. No build step needed locally.

Before opening a PR:
```bash
pnpm typecheck   # tsc --noEmit — must pass
pnpm lint        # ESLint — must pass
```

---

## Part 10 — Smoke Tests

Run these in order after deployment. Each test has an expected result. Stop and investigate if anything fails before moving on.

### 10.1 Database

```sql
-- Run in Supabase SQL Editor

-- Verify all 14 migrations ran
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: 20+ tables including automation_jobs, billing_events, client_portal_tokens, etc.

-- Verify RLS is enabled on all tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected: 0 rows (every table has RLS enabled)

-- Verify cron jobs
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
-- Expected: 4 rows (process-automation-jobs, refresh-days-to-deadline,
--           auto-create-monthly-workflows, auto-create-quarterly-workflows)

-- Verify demo data
SELECT COUNT(*) FROM clients;   -- 6
SELECT COUNT(*) FROM workflows; -- 8
SELECT COUNT(*) FROM stages;    -- ~30
```

### 10.2 Authentication

```bash
# Create a new firm and owner account
curl -s -X POST https://app.acct-os.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@yourfirm.ca","password":"test-password-123","firm_name":"Test Firm CPA","your_name":"Test User"}' \
  | jq .
# Expected: { user: { id, email, firm_id, role: "owner" }, firm: { id, name } }

# Sign in
curl -s -X POST https://app.acct-os.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@yourfirm.ca","password":"test-password-123"}' \
  | jq .
# Expected: { access_token, refresh_token, user: { id, firm_id, role } }

# Save the access token
TOKEN="eyJ..."
```

### 10.3 Core API

```bash
# Dashboard
curl -s https://app.acct-os.com/api/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .stats
# Expected: { active_filings, on_track, at_risk, overdue, complete }

# Client list (demo firm — use patrick@jensen.ca token if testing seed data)
curl -s https://app.acct-os.com/api/clients \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
# Expected for demo firm: 6
# Expected for new test firm: 0

# Unauthenticated request — must be rejected
curl -s https://app.acct-os.com/api/clients | jq .
# Expected: { error: "Unauthorized", code: "UNAUTHORIZED" }  (HTTP 401)
```

### 10.4 RLS isolation

```bash
# Sign in as test@yourfirm.ca (different firm from demo data)
# Then try to access demo firm clients
curl -s "https://app.acct-os.com/api/clients" \
  -H "Authorization: Bearer $TEST_TOKEN" | jq '.data | length'
# Expected: 0  (RLS prevents cross-firm data access)
```

### 10.5 Gate enforcement

```bash
# Get the Sunrise Bakery workflow ID (blocked at Stage 2 — docs missing)
SUNRISE_WF_ID=$(curl -s "https://app.acct-os.com/api/workflows?client_id=SUNRISE_CLIENT_ID" \
  -H "Authorization: Bearer $DEMO_TOKEN" | jq -r '.data[0].id')

# Get Stage 3's ID
STAGE3_ID=$(curl -s "https://app.acct-os.com/api/workflows/$SUNRISE_WF_ID" \
  -H "Authorization: Bearer $DEMO_TOKEN" | jq -r '.stages[] | select(.n==3) | .id')

# Try to advance Stage 3 — must be blocked
curl -s -X PATCH "https://app.acct-os.com/api/stages/$STAGE3_ID" \
  -H "Authorization: Bearer $DEMO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"complete"}' | jq .
# Expected: { error: "Gate condition not met", code: "GATE_BLOCKED", gate_reason: "..." }  (HTTP 409)
```

### 10.6 File upload

```bash
# Get a presigned upload URL
curl -s -X POST https://app.acct-os.com/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"WORKFLOW_UUID","file_name":"test.pdf","content_type":"application/pdf","size_bytes":1024}' \
  | jq .
# Expected: { upload_url, path, storage_object_id, provider: "supabase", expires_in: 60 }
```

### 10.7 Email (Resend)

```bash
# Trigger a test document reminder job
curl -s -X POST https://app.acct-os.com/api/automation/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"send_test_email","type":"doc_reminder","workflow_id":"WORKFLOW_UUID"}' | jq .
# Expected: { queued: true, job_id: "uuid", message: "Test doc_reminder job queued..." }

# Check the job was created
curl -s "https://app.acct-os.com/api/automation/jobs?status=pending" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
# Expected: 1+

# To process immediately (don't wait 15 minutes):
supabase functions invoke process-automation-jobs --no-verify-jwt
# Then check notification_log in Supabase Table Editor
```

### 10.8 Client portal

```bash
# Create a portal token for a client
curl -s -X POST https://app.acct-os.com/api/portal/tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"CLIENT_UUID","label":"Test Portal","expires_days":7}' | jq .
# Expected: { portal_url: "https://app.acct-os.com/portal/abc123..." }

# Access the portal WITHOUT auth header (should work — token-gated)
curl -s "https://app.acct-os.com/api/portal/TOKEN_VALUE" | jq .
# Expected: { client, firm_name, workflows, pending_documents_count }

# Try with invalid token
curl -s "https://app.acct-os.com/api/portal/invalid_token" | jq .
# Expected: { error: "Invalid or expired portal link" }  (HTTP 404)
```

### 10.9 Intelligence

```bash
curl -s https://app.acct-os.com/api/intelligence \
  -H "Authorization: Bearer $DEMO_TOKEN" | jq '{priority_suggestion, anomaly_count: (.anomalies | length)}'
# Expected for demo data:
# { priority_suggestion: "Start with Patel & Sons — ...", anomaly_count: 0 }
# (Anomalies need 2+ historical GST periods — will appear after a few billing cycles)
```

### 10.10 Stripe checkout (manual browser test)

```bash
curl -s -X POST https://app.acct-os.com/api/billing/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"Growth","interval":"monthly"}' | jq .checkout_url
# Expected: "https://checkout.stripe.com/pay/cs_test_..."

# Open that URL in a browser
# Use Stripe test card: 4242 4242 4242 4242, any future date, any CVC
# After checkout completes, verify in Supabase:
```

```sql
SELECT plan, status FROM stripe_subscriptions WHERE firm_id = 'YOUR_FIRM_ID';
-- Expected: { plan: "Growth", status: "active" }

SELECT plan FROM firms WHERE id = 'YOUR_FIRM_ID';
-- Expected: "Growth"
```

---

## Part 11 — Final Checklist Before Going Live

```
Infrastructure
  ☐ Supabase region confirmed as ca-central-1
  ☐ All 14 migrations applied (verify: SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' → 20+)
  ☐ RLS enabled on all tables (verify: 0 rows with rowsecurity=false)
  ☐ JWT custom claims hook active (test: sign in, decode JWT, confirm firm_id and role fields)
  ☐ Storage bucket 'client-documents' created and private
  ☐ 4 pg_cron jobs running with real project ref and service role key
  ☐ 2 Edge Functions deployed (process-automation-jobs, auto-create-workflows)
  ☐ Edge Function secrets set in Supabase dashboard

Email
  ☐ Sending domain verified in Resend
  ☐ RESEND_API_KEY set in Vercel production
  ☐ Resend webhook endpoint registered
  ☐ RESEND_WEBHOOK_SECRET set in Vercel production
  ☐ Test email delivered successfully (smoke test 10.7)

Stripe
  ☐ All 6 Price IDs set in Vercel production
  ☐ Stripe webhook endpoint registered with correct events
  ☐ STRIPE_WEBHOOK_SECRET set in Vercel production
  ☐ Customer Portal configured with return URL
  ☐ Checkout flow tested end-to-end (smoke test 10.10)

QBO (if using)
  ☐ App registered at developer.intuit.com
  ☐ Production redirect URI added
  ☐ Webhook endpoint registered with verifier token
  ☐ QBO_SANDBOX=false in Vercel production

Zoho (if using)
  ☐ Client registered at api.console.zoho.com
  ☐ Webhook configured with shared token

Security
  ☐ SUPABASE_SERVICE_ROLE_KEY not in NEXT_PUBLIC_ prefixed var
  ☐ No secrets in git history (git log --all -S 'sk_live' should be empty)
  ☐ .env.local in .gitignore
  ☐ Preview deployments pointed at staging Supabase project, not production

Deployment
  ☐ Custom domain configured in Vercel
  ☐ HTTPS only (HSTS header present in response headers)
  ☐ All smoke tests 10.1–10.10 pass
  ☐ pnpm typecheck passes with 0 errors
```

---

## Part 12 — Environment Variable Reference

Complete reference for `.env.local` and Vercel:

```bash
# ── Core (all environments) ─────────────────────────────────

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://app.acct-os.com

# ── Server-only (never NEXT_PUBLIC_) ───────────────────────

SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF

# ── Email (Resend) ──────────────────────────────────────────

RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=AcctOS <noreply@yourdomain.ca>
RESEND_REPLY_TO=hello@yourdomain.ca
RESEND_WEBHOOK_SECRET=whsec_...

# ── File Storage ────────────────────────────────────────────

STORAGE_PROVIDER=supabase         # 'supabase' | 'r2'

# R2 (only needed when STORAGE_PROVIDER=r2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=acct-os-documents

# ── Stripe ──────────────────────────────────────────────────

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_SCALE_MONTHLY=price_...
STRIPE_PRICE_SCALE_ANNUAL=price_...

# ── QuickBooks Online ───────────────────────────────────────

QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=https://app.acct-os.com/api/integrations/qbo/callback
QBO_SANDBOX=false
QBO_WEBHOOK_VERIFIER_TOKEN=

# ── Zoho Books ──────────────────────────────────────────────

ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REDIRECT_URI=https://app.acct-os.com/api/integrations/zoho/callback
ZOHO_WEBHOOK_TOKEN=
```

---

## Part 13 — Repository Structure

What you committed:

```
acct-os/
├── apps/web/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/              login · logout · refresh · signup
│   │   │   ├── automation/        jobs · trigger
│   │   │   ├── billing/           route · checkout · portal
│   │   │   ├── clients/           route · [id]
│   │   │   ├── dashboard/
│   │   │   ├── documents/         route · [id] · request
│   │   │   ├── integrations/      route · [id] · qbo/** · zoho/**
│   │   │   ├── intelligence/
│   │   │   ├── portal/            tokens · [token] · [token]/upload
│   │   │   ├── settings/
│   │   │   ├── stages/            [id]
│   │   │   ├── tasks/             route · [id]
│   │   │   ├── upload/
│   │   │   ├── users/             route · invite · [id]
│   │   │   ├── webhooks/          qbo · resend · stripe · zoho
│   │   │   ├── workflow-links/
│   │   │   └── workflows/
│   │   └── auth/
│   │       └── accept-invite/
│   ├── lib/
│   │   ├── billing/               stripe.ts
│   │   ├── email/                 index.ts · templates/*
│   │   ├── hooks/                 index.ts  ← all React hooks
│   │   ├── integrations/          qbo.ts · zoho.ts · helpers.ts
│   │   ├── risk-engine.ts         ← C1–C5 + gate enforcement (pure TS)
│   │   ├── storage/               r2.ts
│   │   ├── supabase/              client.ts · server.ts
│   │   └── workflow-templates.ts  ← GST · T1 · T2 · Bookkeeping · Payroll
│   ├── types/
│   │   └── database.ts            ← all DB row types + API shapes
│   ├── middleware.ts
│   ├── next.config.ts
│   └── package.json
├── supabase/
│   ├── functions/
│   │   ├── process-automation-jobs/index.ts
│   │   └── auto-create-workflows/index.ts
│   └── migrations/
│       ├── 001_init_schema.sql
│       ├── 002_workflows_stages_tasks.sql
│       ├── 003_documents_events.sql
│       ├── 004_rls_policies.sql
│       ├── 005_seed_demo_data.sql
│       ├── 006_helper_functions.sql
│       ├── 007_phase2_schema.sql
│       ├── 008_phase2_rls.sql
│       ├── 009_auto_advance_functions.sql
│       ├── 010_phase3_schema.sql
│       ├── 011_phase3_rls.sql
│       ├── 012_phase4_schema.sql
│       ├── 013_phase4_rls.sql
│       └── 014_phase4_helpers.sql
├── docs/
│   ├── API_SPEC.md
│   ├── PHASE1_SETUP.md
│   ├── PHASE2_SETUP.md
│   ├── PHASE3_SETUP.md
│   └── PHASE4_SETUP.md
├── .env.example
└── SETUP.md                       ← this file
```

---

## Quick Reference: All API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | Create firm + owner |
| POST | `/api/auth/login` | Public | Sign in |
| POST | `/api/auth/logout` | JWT | Sign out |
| POST | `/api/auth/refresh` | Public | Refresh token |
| GET | `/api/dashboard` | JWT | KPIs + spotlights |
| GET/POST | `/api/clients` | JWT | List / create clients |
| GET/PATCH/DELETE | `/api/clients/:id` | JWT | Client detail / update / archive |
| GET/POST | `/api/workflows` | JWT | List / create workflows |
| PATCH | `/api/stages/:id` | JWT | Advance stage (gate-enforced) |
| GET | `/api/tasks` | JWT | List tasks |
| PATCH | `/api/tasks/:id` | JWT | Complete task (auto-advance) |
| GET | `/api/documents` | JWT | List documents |
| PATCH | `/api/documents/:id` | JWT | Mark received |
| POST | `/api/documents/request` | JWT | Send reminder email |
| POST/GET | `/api/upload` | JWT | Presigned upload / download URL |
| GET/POST | `/api/users` | JWT | List team / redirect to invite |
| POST | `/api/users/invite` | JWT | Invite team member |
| GET/PATCH/DELETE | `/api/users/:id` | JWT | User profile |
| GET/PATCH | `/api/settings` | JWT | Firm settings |
| GET/POST | `/api/workflow-links` | JWT | Bookkeeping→GST links |
| GET | `/api/intelligence` | JWT | Priority suggestions + anomalies |
| GET | `/api/automation/jobs` | JWT | Automation job queue |
| POST | `/api/automation/trigger` | JWT | Manual job trigger |
| GET | `/api/integrations` | JWT | List integrations |
| GET | `/api/integrations/qbo` | JWT | Start QBO OAuth |
| GET | `/api/integrations/qbo/callback` | Public | QBO OAuth callback |
| GET | `/api/integrations/zoho` | JWT | Start Zoho OAuth |
| GET | `/api/integrations/zoho/callback` | Public | Zoho OAuth callback |
| DELETE | `/api/integrations/:id` | JWT | Disconnect integration |
| GET | `/api/billing` | JWT | Plan + usage |
| POST | `/api/billing/checkout` | JWT | Stripe checkout |
| POST | `/api/billing/portal` | JWT | Stripe customer portal |
| POST/GET | `/api/portal/tokens` | JWT | Create / list portal tokens |
| GET | `/api/portal/:token` | Token | Client portal data |
| POST/PATCH | `/api/portal/:token/upload` | Token | Client file upload |
| POST | `/api/webhooks/qbo` | HMAC | QBO reconciliation events |
| POST | `/api/webhooks/zoho` | Token | Zoho events |
| POST | `/api/webhooks/stripe` | HMAC | Stripe subscription lifecycle |
| POST | `/api/webhooks/resend` | HMAC | Email delivery status |
