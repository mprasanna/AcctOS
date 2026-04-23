// ============================================================
// AcctOS — QuickBooks Online Integration
// OAuth 2.0 PKCE flow + API client + token refresh
//
// QBO OAuth endpoints (Canada):
//   Auth:    https://appcenter.intuit.com/connect/oauth2
//   Token:   https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
//   Revoke:  https://developer.api.intuit.com/v2/oauth2/tokens/revoke
//
// QBO API base:
//   Production: https://quickbooks.api.intuit.com
//   Sandbox:    https://sandbox-quickbooks.api.intuit.com
// ============================================================

const QBO_AUTH_URL   = 'https://appcenter.intuit.com/connect/oauth2'
const QBO_TOKEN_URL  = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

const QBO_SCOPES = [
  'com.intuit.quickbooks.accounting',  // full accounting access
].join(' ')

// ────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────

export function getQboConfig() {
  const clientId     = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  const redirectUri  = process.env.QBO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/qbo/callback`
  const sandbox      = process.env.QBO_SANDBOX === 'true'

  if (!clientId || !clientSecret) {
    throw new Error('QBO_CLIENT_ID and QBO_CLIENT_SECRET are required for QuickBooks integration')
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    sandbox,
    apiBase: sandbox
      ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
      : 'https://quickbooks.api.intuit.com/v3/company',
  }
}

// ────────────────────────────────────────────────────────────
// OAUTH FLOW
// ────────────────────────────────────────────────────────────

export function buildQboAuthUrl(state: string): string {
  const cfg    = getQboConfig()
  const params = new URLSearchParams({
    client_id:     cfg.clientId,
    redirect_uri:  cfg.redirectUri,
    response_type: 'code',
    scope:         QBO_SCOPES,
    state,
  })
  return `${QBO_AUTH_URL}?${params.toString()}`
}

export interface QboTokenResponse {
  access_token:        string
  refresh_token:       string
  token_type:          string
  expires_in:          number   // seconds (typically 3600)
  x_refresh_token_expires_in: number  // seconds (typically 8726400 = ~101 days)
  realmId?:            string
}

export async function exchangeQboCode(code: string, realmId: string): Promise<{
  data: QboTokenResponse | null
  error: string | null
}> {
  const cfg         = getQboConfig()
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')

  try {
    const res = await fetch(QBO_TOKEN_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept:         'application/json',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
      }).toString(),
    })

    const data = await res.json()
    if (!res.ok) {
      return { data: null, error: data.error_description ?? `QBO token exchange failed: ${res.status}` }
    }
    return { data: { ...data, realmId }, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

export async function refreshQboToken(refreshToken: string): Promise<{
  data: QboTokenResponse | null
  error: string | null
}> {
  const cfg         = getQboConfig()
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')

  try {
    const res = await fetch(QBO_TOKEN_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept:         'application/json',
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })

    const data = await res.json()
    if (!res.ok) {
      return { data: null, error: data.error_description ?? `Token refresh failed: ${res.status}` }
    }
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

export async function revokeQboToken(token: string, tokenType: 'access_token' | 'refresh_token' = 'refresh_token'): Promise<boolean> {
  const cfg         = getQboConfig()
  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')

  const res = await fetch(QBO_REVOKE_URL, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({ token_type_hint: tokenType, token }),
  })

  return res.ok
}

// ────────────────────────────────────────────────────────────
// API CLIENT
// ────────────────────────────────────────────────────────────

export interface QboApiOptions {
  accessToken: string
  realmId:     string
  sandbox?:    boolean
}

async function qboGet<T>(path: string, opts: QboApiOptions): Promise<{
  data: T | null
  error: string | null
}> {
  const cfg  = getQboConfig()
  const base = opts.sandbox ?? cfg.sandbox
    ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
    : 'https://quickbooks.api.intuit.com/v3/company'

  try {
    const res = await fetch(`${base}/${opts.realmId}${path}?minorversion=65`, {
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        Accept:        'application/json',
      },
    })

    if (res.status === 401) return { data: null, error: 'TOKEN_EXPIRED' }
    if (!res.ok)            return { data: null, error: `QBO API ${res.status}: ${await res.text()}` }

    const json = await res.json()
    return { data: json, error: null }
  } catch (err: any) {
    return { data: null, error: err.message }
  }
}

// ── Get company info ──────────────────────────────────────────

export interface QboCompanyInfo {
  CompanyName:  string
  LegalName:    string
  CompanyAddr?: { Line1?: string; City?: string; Country?: string }
  FiscalYearStartMonth?: string
  Country:      string
}

export async function getQboCompanyInfo(opts: QboApiOptions): Promise<{
  data: QboCompanyInfo | null
  error: string | null
}> {
  const result = await qboGet<{ CompanyInfo: QboCompanyInfo }>('/companyinfo/' + opts.realmId, opts)
  return { data: result.data?.CompanyInfo ?? null, error: result.error }
}

// ── Check if a period is reconciled ──────────────────────────
// QBO doesn't have a single "is reconciled" flag. We query Accounts
// and check if their last reconcile date covers the period.

export interface QboReconciliationStatus {
  isReconciled:     boolean
  lastReconciledDate: string | null  // ISO date
  accountsReconciled: number
  accountsPending:    number
}

export async function checkQboReconciliation(
  opts:        QboApiOptions,
  periodEnd:   string  // ISO date string "2025-10-31"
): Promise<{ data: QboReconciliationStatus | null; error: string | null }> {
  // Query all bank and credit card accounts
  const result = await qboGet<{ QueryResponse: { Account: any[] } }>(
    `/query?query=SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card') MAXRESULTS 100`,
    opts
  )

  if (result.error) return { data: null, error: result.error }

  const accounts = result.data?.QueryResponse?.Account ?? []
  if (accounts.length === 0) {
    return { data: { isReconciled: false, lastReconciledDate: null, accountsReconciled: 0, accountsPending: 0 }, error: null }
  }

  let reconciled = 0
  let pending    = 0
  let latestDate: string | null = null

  for (const acct of accounts) {
    const lastReconDate = acct.LastReconciledDate as string | undefined
    if (lastReconDate && lastReconDate >= periodEnd) {
      reconciled++
      if (!latestDate || lastReconDate > latestDate) latestDate = lastReconDate
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
