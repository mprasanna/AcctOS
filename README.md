# AcctOS

Canadian accounting firm workflow management. GST/HST, T1, T2, Bookkeeping, and Payroll workflows with CRA-aware deadlines, automated document reminders, and QuickBooks Online integration.

## Quick start

```bash
cd apps/web
pnpm install
cp ../../.env.example .env.local
# fill in .env.local
pnpm dev
```

See **[SETUP.md](./SETUP.md)** for the complete deployment guide: Supabase, Vercel, Resend, Stripe, QBO, and Zoho.

## Stack

- **Next.js 14** (App Router) — web app
- **Supabase** — PostgreSQL + Auth + Storage + Edge Functions
- **Vercel** — hosting + CI/CD
- **Resend** — transactional email
- **Stripe** — subscription billing
- **Cloudflare R2** — file storage (production)

## Project layout

```
acct-os/
├── apps/web/          Next.js application
│   ├── app/api/       39 REST API route handlers
│   ├── lib/           risk engine · hooks · email · integrations · billing
│   └── types/         TypeScript database types
├── supabase/
│   ├── migrations/    14 SQL migration files (001–014)
│   └── functions/     2 Deno Edge Functions
├── docs/              Phase setup guides + API spec
├── .env.example       All environment variables
└── SETUP.md           Complete deployment guide
```
