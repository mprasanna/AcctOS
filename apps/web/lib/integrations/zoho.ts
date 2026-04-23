// ============================================================
// AcctOS — Zoho Books Integration
// OAuth 2.0 flow + API client + token refresh
//
// Zoho OAuth endpoints:
//   Auth:  https://accounts.zoho.com/oauth/v2/auth
//   Token: https://accounts.zoho.com/oauth/v2/token
//
// Zoho Books API base (Canada data centre):
//   https://www.zohoapis.com/books/v3
// ============================================================

const ZOHO_AUTH_URL  = 'https://accounts.zoho.com/oauth/v2/auth'
const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'
const ZOHO_API_BASE  = 'https://www.zohoapis.com/books/v3'

const ZOHO_SCOPES = [
  'ZohoBooks.accountants.ALL',
  'ZohoBooks.reports.READ',
  'ZohoBooks.banking.READ',
].join(',')

// ────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────

export function getZohoConfig() {
  const clientId     = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const redirectUri  = process.env.ZOHO_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/zoho/callback`

  if (!clientId || !clientSecret) {
    throw new Error('ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are required for Zoho Books integration')
  }

  return { clientId, clientSecret, redirectUri }
}

// ────────────────────────────────────────────────────────────
// OAUTH FLOW
// ────────────────────────────────────────────────────────────

export function buildZohoAuthUrl(state: string): string {
  const cfg    = getZohoConfig()
  const params = new URLSearchParams({
    client_id:     cfg.clientId,
    redirect_uri:  cfg.redirectUri,
    response_type: 'code',
    scope:         ZOHO_SCOPES,
    access_type:   'offline',  // request refresh token
    state,
    prompt:        'consent',
  })
  return `${ZOHO_AUTH_URL}?${params.toString()}`
}

export interface ZohoTokenResponse {
  access_token:  string
  refresh_token: string
  token_type:    string
  expires_in:    number   // seconds (typically 3600)
  api_domain:    string
}

export async function exchangeZohoCode(code: string): Promise<{
  data: ZohoTokenResponse | null
  error: string | null
}> {
  const cfg = getZohoConfig()

  try {
    const res = await fetch(ZOHO_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri:  cfg.redirectUri,
        code,
      }).toString(),
    })

    const data = await res.json()
    if (data.error) return { data: null, error: data.error }
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

export async function refreshZohoToken(refreshToken: string): Promise<{
  data: ZohoTokenResponse | null
  error: string | null
}> {
  const cfg = getZohoConfig()

  try {
    const res = await fetch(ZOHO_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    })

    const data = await res.json()
    if (data.error) return { data: null, error: data.error }
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

// ────────────────────────────────────────────────────────────
// API CLIENT
// ────────────────────────────────────────────────────────────

export interface ZohoApiOptions {
  accessToken: string
  orgId:       string   // Zoho Books organization ID (realm_id equivalent)
}

async function zohoGet<T>(path: string, opts: ZohoApiOptions): Promise<{
  data: T | null
  error: string | null
}> {
  try {
    const res = await fetch(`${ZOHO_API_BASE}${path}?organization_id=${opts.orgId}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${opts.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.status === 401) return { data: null, error: 'TOKEN_EXPIRED' }
    if (!res.ok)            return { data: null, error: `Zoho API ${res.status}` }

    const json = await res.json()
    if (json.code !== 0) return { data: null, error: json.message ?? 'Zoho API error' }
    return { data: json, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

// ── Get organization info ─────────────────────────────────────

export async function getZohoOrgInfo(opts: ZohoApiOptions): Promise<{
  data: { name: string; org_id: string; currency_code: string } | null
  error: string | null
}> {
  const result = await zohoGet<{ organizations: any[] }>('/organizations', opts)
  const org    = result.data?.organizations?.[0]
  if (!org) return { data: null, error: result.error ?? 'No organization found' }
  return { data: { name: org.name, org_id: org.organization_id, currency_code: org.currency_code }, error: null }
}

// ── Check reconciliation status ───────────────────────────────

export interface ZohoReconciliationStatus {
  isReconciled:     boolean
  lastReconciledDate: string | null
  accountsReconciled: number
  accountsPending:    number
}

export async function checkZohoReconciliation(
  opts:      ZohoApiOptions,
  periodEnd: string   // ISO date "2025-10-31"
): Promise<{ data: ZohoReconciliationStatus | null; error: string | null }> {
  // Fetch bank accounts from Zoho Books
  const result = await zohoGet<{ bankaccounts: any[] }>('/bankaccounts', opts)
  if (result.error) return { data: null, error: result.error }

  const accounts = result.data?.bankaccounts ?? []
  let reconciled = 0
  let pending    = 0
  let latestDate: string | null = null

  for (const acct of accounts) {
    const lastRecon = acct.last_reconciliation_date as string | undefined
    if (lastRecon && lastRecon >= periodEnd) {
      reconciled++
      if (!latestDate || lastRecon > latestDate) latestDate = lastRecon
    } else {
      pending++
    }
  }

  return {
    data: {
      isReconciled:       pending === 0 && reconciled > 0,
      lastReconciledDate: latestDate,
      accountsReconciled: reconciled,
      accountsPending:    pending,
    },
    error: null,
  }
}
