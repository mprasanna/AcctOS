// ============================================================
// AcctOS — Phase 2 Data Hooks
// Covers: auth state, users, settings, file upload,
//         auto-advance response handling, all Phase 1 hooks.
// ============================================================

'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase/client'
import type {
  ClientSummary, ClientDetail, WorkflowWithDetails,
  DashboardStats, WorkflowStatus, StageStatus, TaskStatus,
  UserRow, UserRole,
} from '@/types/database'

// ────────────────────────────────────────────────────────────
// BASE FETCH HELPER
// ────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null; gateReason?: string }> {
  try {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      credentials: 'include',
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { data: null, error: body.error ?? `HTTP ${res.status}`, gateReason: body.gate_reason }
    }

    const json = await res.json()
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message }
  }
}

// ────────────────────────────────────────────────────────────
// AUTH CONTEXT
// Provides current user + firm_id throughout the app.
// ────────────────────────────────────────────────────────────

export interface AuthUser {
  id:       string
  email:    string
  firm_id:  string
  name:     string
  initials: string
  role:     UserRole
}

interface AuthContextValue {
  user:    AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate from Supabase session
    supabase.auth.getUser().then(async ({ data: { user: sbUser } }) => {
      if (sbUser) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, name, initials, email, role, firm_id')
          .eq('id', sbUser.id)
          .single()

        if (profile) {
          setUser({
            id:       profile.id,
            email:    profile.email,
            firm_id:  profile.firm_id,
            name:     profile.name,
            initials: profile.initials,
            role:     profile.role,
          })
        }
      }
      setLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null)
        return
      }
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, name, initials, email, role, firm_id')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          setUser({
            id:       profile.id,
            email:    profile.email,
            firm_id:  profile.firm_id,
            name:     profile.name,
            initials: profile.initials,
            role:     profile.role,
          })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    // Call the server-side logout route so Supabase SSR can clear the
    // session cookie via Set-Cookie response headers. Calling
    // supabase.auth.signOut() directly on the client does NOT clear the
    // httpOnly server cookie — the middleware would still see the user as
    // authenticated on the next request.
    setUser(null) // Optimistic clear — feels instant in the UI
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    // fetch follows the 302 redirect automatically but won't navigate the
    // page. Force a hard navigation so Next.js re-runs middleware cleanly.
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// ────────────────────────────────────────────────────────────
// AUTH MUTATIONS
// ────────────────────────────────────────────────────────────

export function useLogin() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    const { error: sbError } = await supabase.auth.signInWithPassword({ email, password })
    if (sbError) setError(sbError.message)
    setLoading(false)
    return { error: sbError?.message ?? null }
  }, [])

  return { login, loading, error }
}

export function useSignup() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const signup = useCallback(async (payload: {
    email: string; password: string; firm_name: string; your_name: string
  }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { signup, loading, error }
}

// ────────────────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────────────────

export function useDashboard() {
  const [data, setData]       = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<DashboardStats>('/api/dashboard')
    setData(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ────────────────────────────────────────────────────────────
// CLIENTS
// ────────────────────────────────────────────────────────────

export interface UseClientsOptions {
  status?:     WorkflowStatus
  assignedTo?: string
  q?:          string
  sort?:       'risk_score' | 'name' | 'deadline'
}

export function useClients(options: UseClientsOptions = {}) {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (options.status)     params.set('status', options.status)
    if (options.assignedTo) params.set('assigned_to', options.assignedTo)
    if (options.q)          params.set('q', options.q)
    if (options.sort)       params.set('sort', options.sort)

    const result = await apiFetch<{ data: ClientSummary[] }>(
      `/api/clients${params.size ? '?' + params.toString() : ''}`
    )
    setClients(result.data?.data ?? [])
    setError(result.error)
    setLoading(false)
  }, [options.status, options.assignedTo, options.q, options.sort])

  useEffect(() => { fetch() }, [fetch])
  return { clients, loading, error, refetch: fetch }
}

export function useClient(id: string | null) {
  const [client, setClient]   = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const result = await apiFetch<ClientDetail>(`/api/clients/${id}`)
    setClient(result.data)
    setError(result.error)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])
  return { client, loading, error, refetch: fetch }
}

// ────────────────────────────────────────────────────────────
// WORKFLOWS
// ────────────────────────────────────────────────────────────

export function useWorkflows(options: { clientId?: string; status?: WorkflowStatus } = {}) {
  const [workflows, setWorkflows] = useState<WorkflowWithDetails[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (options.clientId) params.set('client_id', options.clientId)
    if (options.status)   params.set('status', options.status)

    const result = await apiFetch<{ data: WorkflowWithDetails[] }>(
      `/api/workflows?${params.toString()}`
    )
    setWorkflows(result.data?.data ?? [])
    setError(result.error)
    setLoading(false)
  }, [options.clientId, options.status])

  useEffect(() => { fetch() }, [fetch])
  return { workflows, loading, error, refetch: fetch }
}

// ────────────────────────────────────────────────────────────
// USERS
// ────────────────────────────────────────────────────────────

export interface UsersData {
  data: UserRow[]
  pending_invitations: Array<{
    id: string; email: string; role: UserRole
    created_at: string; expires_at: string; accepted_at: string | null
  }>
}

export function useUsers() {
  const [data, setData]       = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<UsersData>('/api/users')
    setData(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

export function useInviteUser() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const invite = useCallback(async (payload: { email: string; name: string; role: UserRole }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/users/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { invite, loading, error }
}

export function useUpdateUser() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const update = useCallback(async (
    id: string,
    payload: { name?: string; initials?: string; role?: UserRole }
  ) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { update, loading, error }
}

// ────────────────────────────────────────────────────────────
// SETTINGS
// ────────────────────────────────────────────────────────────

export function useSettings() {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch('/api/settings')
    setData(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  const save = useCallback(async (patch: Record<string, unknown>) => {
    const result = await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    if (!result.error) setData(result.data)
    return result
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch, save }
}

// ────────────────────────────────────────────────────────────
// STAGE MUTATIONS
// ────────────────────────────────────────────────────────────

export interface StageUpdateResult {
  stage: any
  workflow_status: { status: WorkflowStatus; flags: string[]; days_to_deadline: number } | null
  gate_reason?: string
}

export function useUpdateStage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [gateReason, setGateReason] = useState<string | null>(null)

  const update = useCallback(async (
    stageId: string,
    payload: { status?: StageStatus; note?: string; dual_review_confirmed?: boolean }
  ) => {
    setLoading(true)
    setError(null)
    setGateReason(null)

    const result = await apiFetch<StageUpdateResult>(`/api/stages/${stageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    if (result.error) {
      setError(result.error)
      if (result.gateReason) setGateReason(result.gateReason)
    }

    setLoading(false)
    return result
  }, [])

  return { update, loading, error, gateReason }
}

// ────────────────────────────────────────────────────────────
// TASK MUTATIONS (Phase 2: includes auto_advance in response)
// ────────────────────────────────────────────────────────────

export interface TaskUpdateResult {
  task: any
  auto_advance: {
    advanced:   boolean
    stage_n?:   number
    next_stage?: number
    reason:     string
  } | null
  workflow_status: { status: WorkflowStatus; flags: string[]; days_to_deadline: number } | null
}

export function useUpdateTask() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const update = useCallback(async (
    taskId: string,
    payload: { status?: TaskStatus; assigned_to?: string }
  ) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch<TaskUpdateResult>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { update, loading, error }
}

// ────────────────────────────────────────────────────────────
// DOCUMENT MUTATIONS
// ────────────────────────────────────────────────────────────

export function useMarkDocumentReceived() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const markReceived = useCallback(async (docId: string, uploadSource?: string) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch(`/api/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'received', upload_source: uploadSource }),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { markReceived, loading, error }
}

export function useSendDocumentRequest() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const send = useCallback(async (workflowId: string, documentIds: string[], type: string) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/documents/request', {
      method: 'POST',
      body: JSON.stringify({ workflow_id: workflowId, document_ids: documentIds, type }),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { send, loading, error }
}

// ────────────────────────────────────────────────────────────
// FILE UPLOAD (Phase 2)
// Presigned URL flow — file goes directly to Supabase Storage.
// ────────────────────────────────────────────────────────────

export interface UploadProgress {
  percent:  number
  uploaded: number
  total:    number
}

export function useFileUpload() {
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [progress, setProgress]   = useState<UploadProgress | null>(null)

  const upload = useCallback(async (
    file: File,
    workflowId: string,
    documentId?: string,
    onProgress?: (p: UploadProgress) => void
  ) => {
    setLoading(true)
    setError(null)
    setProgress(null)

    try {
      // 1. Get presigned upload URL
      const urlResult = await apiFetch<{
        upload_url: string
        path: string
        storage_object_id: string
      }>('/api/upload', {
        method: 'POST',
        body: JSON.stringify({
          workflow_id:  workflowId,
          document_id:  documentId,
          file_name:    file.name,
          content_type: file.type,
          size_bytes:   file.size,
        }),
      })

      if (urlResult.error || !urlResult.data) {
        setError(urlResult.error ?? 'Failed to get upload URL')
        setLoading(false)
        return { error: urlResult.error, path: null }
      }

      const { upload_url, path } = urlResult.data

      // 2. Upload file directly to Supabase Storage using XMLHttpRequest for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const p: UploadProgress = {
              percent:  Math.round((e.loaded / e.total) * 100),
              uploaded: e.loaded,
              total:    e.total,
            }
            setProgress(p)
            onProgress?.(p)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      setProgress({ percent: 100, uploaded: file.size, total: file.size })
      setLoading(false)
      return { error: null, path }
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
      return { error: err.message, path: null }
    }
  }, [])

  return { upload, loading, error, progress }
}

export function useDownloadUrl() {
  const getUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const result = await apiFetch<{ download_url: string }>(`/api/upload?path=${encodeURIComponent(storagePath)}`)
    return result.data?.download_url ?? null
  }, [])

  return { getUrl }
}

// ────────────────────────────────────────────────────────────
// CLIENT MUTATIONS
// ────────────────────────────────────────────────────────────

export function useCreateClient() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const create = useCallback(async (payload: {
    name: string; type: string; freq: string
    city?: string; since?: string; bn?: string
    assigned_to?: string; net_gst?: number
  }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { create, loading, error }
}

export function usePatchClient() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const patch = useCallback(async (id: string, payload: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { patch, loading, error }
}

// ────────────────────────────────────────────────────────────
// WORKFLOW MUTATIONS (Phase 2)
// ────────────────────────────────────────────────────────────

export function useCreateWorkflow() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const create = useCallback(async (payload: {
    client_id:          string
    type:               string
    period:             string
    deadline:           string
    cycle_start:        string
    link_bookkeeping_to?: string
  }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { create, loading, error }
}

export function useCreateWorkflowLink() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const link = useCallback(async (payload: {
    source_workflow_id: string
    source_stage_n?:    number
    target_workflow_id: string
    target_stage_n?:    number
  }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/workflow-links', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { link, loading, error }
}

// ────────────────────────────────────────────────────────────
// PHASE 3 HOOKS
// ────────────────────────────────────────────────────────────

// ── Intelligence ─────────────────────────────────────────────

export interface IntelligenceData {
  priority_suggestion: string | null
  anomalies: Array<{
    client_id:   string
    client_name: string
    current_gst: number
    prior_avg:   number
    change_pct:  number
    periods:     string[]
    message:     string
  }>
  this_week: {
    count:   number
    filings: Array<{ client_id: string; client_name: string; workflow_label: string; days_to_deadline: number; status: string }>
  }
  notification_stats: {
    total: number; delivered: number; opened: number; bounced: number
    by_type: Record<string, number>
  }
  as_of: string
}

export function useIntelligence() {
  const [data, setData]       = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<IntelligenceData>('/api/intelligence')
    setData(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ── Automation Jobs ───────────────────────────────────────────

export interface AutomationJob {
  id:           string
  type:         string
  status:       string
  scheduled_at: string
  processed_at: string | null
  attempts:     number
  last_error:   string | null
  client:       { id: string; name: string } | null
  workflow:     { id: string; label: string } | null
}

export function useAutomationJobs(options: { status?: string; workflowId?: string } = {}) {
  const [jobs, setJobs]       = useState<AutomationJob[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (options.status)     params.set('status', options.status)
    if (options.workflowId) params.set('workflow_id', options.workflowId)

    const result = await apiFetch<{ data: AutomationJob[]; summary: Record<string, number> }>(
      `/api/automation/jobs?${params.toString()}`
    )
    setJobs(result.data?.data ?? [])
    setSummary(result.data?.summary ?? {})
    setError(result.error)
    setLoading(false)
  }, [options.status, options.workflowId])

  useEffect(() => { fetch() }, [fetch])
  return { jobs, summary, loading, error, refetch: fetch }
}

export function useAutomationTrigger() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const trigger = useCallback(async (payload: {
    action:       'trigger_job' | 'cancel_job' | 'reschedule_workflow' | 'send_test_email'
    job_id?:      string
    workflow_id?: string
    type?:        string
  }) => {
    setLoading(true)
    setError(null)
    const result = await apiFetch('/api/automation/trigger', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.error) setError(result.error)
    setLoading(false)
    return result
  }, [])

  return { trigger, loading, error }
}

// ── Notification log ─────────────────────────────────────────

export function useNotificationLog(workflowId?: string) {
  const [data, setData]       = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!workflowId) return
    setLoading(true)
    const result = await apiFetch<any>(`/api/automation/jobs?workflow_id=${workflowId}`)
    setData(result.data?.data ?? [])
    setError(result.error)
    setLoading(false)
  }, [workflowId])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ────────────────────────────────────────────────────────────
// PHASE 4 HOOKS
// ────────────────────────────────────────────────────────────

// ── Integrations ─────────────────────────────────────────────

export interface Integration {
  id:               string
  provider:         'qbo' | 'zoho_books'
  status:           string
  company_name:     string | null
  realm_id:         string | null
  last_synced_at:   string | null
  last_sync_error:  string | null
  sync_enabled:     boolean
  token_status:     string
  clients_mapped:   number
  connected_user:   { id: string; name: string } | null
}

export function useIntegrations() {
  const [data, setData]       = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<{ data: Integration[] }>('/api/integrations')
    setData(result.data?.data ?? [])
    setError(result.error)
    setLoading(false)
  }, [])

  const disconnect = useCallback(async (integrationId: string) => {
    const result = await apiFetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
    if (!result.error) await fetch()
    return result
  }, [fetch])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch, disconnect }
}

export function useConnectIntegration() {
  const connect = useCallback((provider: 'qbo' | 'zoho_books') => {
    // Redirect to OAuth flow — no API call needed
    window.location.href = `/api/integrations/${provider === 'qbo' ? 'qbo' : 'zoho'}`
  }, [])
  return { connect }
}

// ── Portal tokens ─────────────────────────────────────────────

export function usePortalTokens(clientId?: string) {
  const [data, setData]       = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const result = await apiFetch<{ data: any[] }>(
      `/api/portal/tokens?client_id=${clientId}`
    )
    setData(result.data?.data ?? [])
    setError(result.error)
    setLoading(false)
  }, [clientId])

  const createToken = useCallback(async (payload: {
    client_id:   string
    label?:      string
    expires_days?: number
  }) => {
    const result = await apiFetch('/api/portal/tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!result.error) await fetch()
    return result
  }, [fetch])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch, createToken }
}

// ── Billing ───────────────────────────────────────────────────

export interface BillingData {
  firm:   { name: string; email: string }
  plan:   { name: string; max_clients: number; max_users: number; features: string[] }
  subscription: {
    status:             string
    billing_interval:   string
    current_period_end: string | null
    trial_end:          string | null
    cancel_at:          string | null
  } | null
  usage: { clients: number; clients_limit: number; clients_pct: number }
  available_plans: Array<{
    name: string; amount_cad: number; max_clients: number; features: string[]
  }>
}

export function useBilling() {
  const [data, setData]       = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<BillingData>('/api/billing')
    setData(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  const startCheckout = useCallback(async (plan: string, interval: 'monthly' | 'annual' = 'monthly') => {
    const result = await apiFetch<{ checkout_url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    })
    if (result.data?.checkout_url) {
      window.location.href = result.data.checkout_url
    }
    return result
  }, [])

  const openPortal = useCallback(async () => {
    const result = await apiFetch<{ portal_url: string }>('/api/billing/portal', {
      method: 'POST',
    })
    if (result.data?.portal_url) {
      window.location.href = result.data.portal_url
    }
    return result
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch, startCheckout, openPortal }
}
