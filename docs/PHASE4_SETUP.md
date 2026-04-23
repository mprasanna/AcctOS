# AcctOS — Phase 4 Implementation Guide

> Integrations: plug into real firm workflows.
> Goal: 50–200 firms · 30%+ using QBO · avg revenue trending toward $149/month

---

## What Phase 4 Adds

| Feature | Files |
|---|---|
| QuickBooks Online OAuth + API | `lib/integrations/qbo.ts`, `app/api/integrations/qbo/*` |
| Zoho Books OAuth + API | `lib/integrations/zoho.ts`, `app/api/integrations/zoho/*` |
| Integration list + disconnect | `app/api/integrations/route.ts`, `app/api/integrations/[id]/route.ts` |
| QBO webhook → Stage 1 auto-advance | `app/api/webhooks/qbo/route.ts` |
| Zoho webhook → Stage 1 auto-advance | `app/api/webhooks/zoho/route.ts` |
| Client portal (token-gated, no login) | `app/api/portal/*` |
| Stripe billing (checkout + customer portal) | `lib/billing/stripe.ts`, `app/api/billing/*` |
| Stripe webhook (subscription lifecycle) | `app/api/webhooks/stripe/route.ts` |
| Billing trigger on Stage 6 completion | DB trigger `trg_billing_on_stage6` |
| Payroll Remittances workflow template | Appended to `lib/workflow-templates.ts` |
| Updated middleware (portal + webhook bypass) | `middleware.ts` |
| Phase 4 hooks | Appended to `lib/hooks/index.ts` |

---

## Step 1 — Run Migrations

```bash
supabase db push
```

New migrations:
- `012_phase4_schema.sql` — integrations, client_portal_tokens, stripe_subscriptions, billing_events, qbo_sync_log + triggers
- `013_phase4_rls.sql` — RLS for all Phase 4 tables
- `014_phase4_helpers.sql` — increment_portal_token_use, sync_firm_plan_from_stripe, get_integration_summary

---

## Step 2 — Set Up QuickBooks Online

### 2.1 Create QBO App

1. Go to https://developer.intuit.com → Create an App
2. Select "QuickBooks Online and Payments"
3. App name: "AcctOS" (your firm's branded name)
4. Add OAuth 2.0 Redirect URI: `https://app.acct-os.com/api/integrations/qbo/callback`
5. Request scopes: `com.intuit.quickbooks.accounting`
6. Copy Client ID and Client Secret → set as `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`

### 2.2 Set Up QBO Webhooks

In developer.intuit.com → Webhooks:
1. Add endpoint: `https://app.acct-os.com/api/webhooks/qbo`
2. Select entities: **Account** (fires when bank accounts are reconciled)
3. Copy Verifier Token → set as `QBO_WEBHOOK_VERIFIER_TOKEN`

### 2.3 Connect a Firm

After setting env vars, the "Connect QuickBooks" button in the Integration tab calls:
```
GET /api/integrations/qbo/connect
```
This redirects to QBO OAuth. After the firm owner authorizes, QBO redirects to:
```
GET /api/integrations/qbo/callback?code=...&realmId=...&state=...
```
The callback exchanges the code, stores tokens, fetches company info, and redirects to settings with `?integration=qbo&status=connected`.

### 2.4 Map Clients to QBO Accounts

After connection, map each client to their QBO entity:
```json
POST /api/integrations (Phase 4 extension — coming via UI)
```
Until the mapping UI is built, insert directly:
```sql
INSERT INTO client_integrations (firm_id, client_id, integration_id, external_id, external_name)
VALUES ('...', '...', '...', 'qbo-customer-id', 'Maple Contracting Ltd.');
```

---

## Step 3 — Set Up Zoho Books

1. Go to https://api.console.zoho.com → Add Client → Server-based Applications
2. Redirect URI: `https://app.acct-os.com/api/integrations/zoho/callback`
3. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`
4. In Zoho Books → Settings → Webhooks → Create webhook:
   - URL: `https://app.acct-os.com/api/webhooks/zoho`
   - Events: Banking, Bank Reconciliation
   - Token: set `ZOHO_WEBHOOK_TOKEN`

---

## Step 4 — Set Up Stripe

### 4.1 Create Products and Prices

In Stripe Dashboard → Products → Create:
1. Starter — $49 CAD/month + $470 CAD/year (20% discount)
2. Growth  — $149 CAD/month + $1,430 CAD/year
3. Scale   — $299 CAD/month + $2,870 CAD/year

Copy the Price IDs → set as `STRIPE_PRICE_*` env vars.

### 4.2 Configure Webhooks

In Stripe Dashboard → Webhooks → Add Endpoint:
- URL: `https://app.acct-os.com/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy signing secret → set as `STRIPE_WEBHOOK_SECRET`

### 4.3 Configure Customer Portal

In Stripe Dashboard → Billing → Customer Portal → Configure:
- Enable: plan upgrades/downgrades, cancellations, payment method updates
- Return URL: `https://app.acct-os.com/dashboard/settings`

### 4.4 Test Checkout Flow

```tsx
const { startCheckout } = useBilling()
// In Settings page:
<button onClick={() => startCheckout('Growth', 'monthly')}>Upgrade to Growth</button>
```

---

## Step 5 — Client Portal

### 5.1 Create a Portal Token

```tsx
const { createToken } = usePortalTokens(clientId)

await createToken({
  client_id:   'uuid',
  label:       'October 2025 GST Filing',
  expires_days: 14,
})
// Returns { portal_url: 'https://app.acct-os.com/portal/abc123...' }
```

### 5.2 Client Experience

The client opens the portal URL (no login required):
1. Sees pending documents for their filing(s)
2. Uploads files directly via `POST /api/portal/[token]/upload`
3. After upload, calls `PATCH /api/portal/[token]/upload` to confirm
4. System marks document as received and checks if Stage 2 can advance

### 5.3 Build the Portal Page

Create `app/portal/[token]/page.tsx` — this is a public page consuming `GET /api/portal/[token]`.

```tsx
// Minimal portal page
export default async function PortalPage({ params }) {
  const res = await fetch(`/api/portal/${params.token}`)
  const data = await res.json()

  if (data.error) return <PortalError message={data.error} />

  return (
    <PortalLayout firmName={data.firm_name} clientName={data.client.name}>
      {data.workflows.map(wf => (
        <WorkflowCard key={wf.id} workflow={wf} token={params.token} />
      ))}
    </PortalLayout>
  )
}
```

---

## Stage 1 Auto-Advance Flow (QBO/Zoho)

```
Accountant reconciles books in QBO
  └─ QBO fires webhook → POST /api/webhooks/qbo
     └─ Verify HMAC signature
     └─ Find integration by realm_id
     └─ Find client_integrations for this integration
     └─ For each client:
          advanceStage1OnReconciliation()
          └─ Find active workflow covering this period
          └─ If Stage 1 is pending:
               • Mark Stage 1 complete
               • Mark Stage 2 in_progress
               • Log to auto_advance_log
               • Log event to activity feed
               • Log to qbo_sync_log
```

The accountant's QBO reconciliation now **directly triggers** the AcctOS workflow — the bookkeeping gate becomes fully hands-free.

---

## Billing Flow (Stage 6 Trigger)

```
Workflow advances to Stage 6 (cur_stage = 6)
  └─ trg_billing_on_stage6 trigger fires
     └─ INSERT into billing_events (event_type = 'filing_complete')

Daily or on-demand:
  GET /api/billing → shows pending billing_events
  POST /api/billing/invoice (Phase 4 extension)
    └─ Read pending filing_complete events
    └─ createFilingInvoice() → Stripe Invoice → email to client
    └─ Mark billing_event as invoiced
```

Phase 4 includes the billing trigger and the filing invoice function. The actual "process and send invoices" endpoint can be called manually or wired to a daily pg_cron job.

---

## New API Endpoints (Phase 4)

| Method | Path | Description |
|---|---|---|
| `GET`    | `/api/integrations` | List connected integrations with status |
| `GET`    | `/api/integrations/qbo` | Initiate QBO OAuth redirect |
| `GET`    | `/api/integrations/qbo/callback` | QBO OAuth callback |
| `GET`    | `/api/integrations/zoho` | Initiate Zoho OAuth redirect |
| `GET`    | `/api/integrations/zoho/callback` | Zoho OAuth callback |
| `DELETE` | `/api/integrations/[id]` | Disconnect + revoke tokens |
| `POST`   | `/api/webhooks/qbo` | QBO reconciliation events |
| `POST`   | `/api/webhooks/zoho` | Zoho Books events |
| `POST`   | `/api/webhooks/stripe` | Stripe subscription lifecycle |
| `GET`    | `/api/portal/[token]` | Client portal data (public, token-gated) |
| `POST`   | `/api/portal/[token]/upload` | Client file upload URL |
| `PATCH`  | `/api/portal/[token]/upload` | Confirm upload + mark received |
| `POST`   | `/api/portal/tokens` | Create portal token for client |
| `GET`    | `/api/portal/tokens` | List portal tokens |
| `GET`    | `/api/billing` | Current plan + usage |
| `POST`   | `/api/billing/checkout` | Create Stripe checkout session |
| `POST`   | `/api/billing/portal` | Create Stripe Customer Portal session |

---

## New Packages Required

```bash
cd apps/web
npm install stripe @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

(Resend and R2 were installed in Phase 3 — no new installs for QBO/Zoho, they use native `fetch`.)

---

## File Map (Phase 4 additions)

```
supabase/migrations/
  012_phase4_schema.sql     ← integrations, client_portal_tokens, stripe_subscriptions,
                               billing_events, qbo_sync_log + triggers
  013_phase4_rls.sql        ← RLS for all Phase 4 tables
  014_phase4_helpers.sql    ← Helper functions

apps/web/
  lib/integrations/
    qbo.ts                  ← QBO OAuth, token refresh, reconciliation check API
    zoho.ts                 ← Zoho Books OAuth, token refresh, reconciliation check
    helpers.ts              ← ensureValidToken(), advanceStage1OnReconciliation()
  lib/billing/
    stripe.ts               ← Stripe client, checkout, portal, filing invoice
  app/api/integrations/
    route.ts                ← GET list
    [id]/route.ts           ← DELETE disconnect
    qbo/route.ts            ← GET OAuth initiate
    qbo/callback/route.ts   ← GET OAuth callback
    zoho/route.ts           ← GET OAuth initiate
    zoho/callback/route.ts  ← GET OAuth callback
  app/api/webhooks/
    qbo/route.ts            ← POST QBO events
    zoho/route.ts           ← POST Zoho events
    stripe/route.ts         ← POST Stripe events
  app/api/portal/
    tokens/route.ts         ← POST create token, GET list
    [token]/route.ts        ← GET portal data (public)
    [token]/upload/route.ts ← POST presigned upload, PATCH confirm
  app/api/billing/
    route.ts                ← GET plan + usage
    checkout/route.ts       ← POST create checkout
    portal/route.ts         ← POST create portal session
  middleware.ts             ← Updated: portal + webhook routes bypass JWT
  lib/workflow-templates.ts ← Payroll template appended
  lib/hooks/index.ts        ← useIntegrations, usePortalTokens, useBilling appended
```

---

## Success Metrics

| Metric | Target |
|---|---|
| Active firms | 50–200 |
| Firms using QBO/Zoho integration | ≥ 30% |
| Average revenue per firm | trending to $149/month |
| Stage 1 auto-advance rate (integrated firms) | > 80% |
| Client portal document upload rate | > 60% (vs email) |
| MRR | $7,500–$30,000 |
