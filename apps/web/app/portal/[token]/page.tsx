'use client'

import { useEffect, useState, useRef } from 'react'

// ─── Types matching GET /api/portal/[token] response ────────────────────────
type PendingDoc = { id: string; name: string }
type Workflow   = {
  id: string
  label: string
  period: string
  deadline: string
  cur_stage: number
  status: string
  pending_documents: PendingDoc[]
  all_documents_received: boolean
}
type PortalData = {
  client:       { id: string; name: string; type: string }
  firm_name:    string
  can_upload:   boolean
  can_view_status: boolean
  workflows:    Workflow[]
  pending_documents_count: number
  expires_at:   string
}
type UploadState = Record<string, 'idle' | 'uploading' | 'done' | 'error'>

export default function PortalPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [data, setData]         = useState<PortalData | null>(null)
  const [uploads, setUploads]   = useState<UploadState>({})
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Load portal ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return }
        setData(json)
        // Init upload state from existing doc statuses
        const init: UploadState = {}
        ;(json.workflows ?? []).forEach((wf: Workflow) => {
          // all_documents_received means they're done, pending_documents are still outstanding
          if (wf.all_documents_received) return
          wf.pending_documents.forEach(d => { init[d.id] = 'idle' })
        })
        setUploads(init)
      })
      .catch(() => setError('Could not load your portal. Please try again or contact your accountant.'))
      .finally(() => setLoading(false))
  }, [token])

  // ── Upload a file for a specific document ───────────────────────────────────
  async function uploadFile(doc: PendingDoc, wfId: string, file: File) {
    setUploads(s => ({ ...s, [doc.id]: 'uploading' }))
    setUploadErrors(e => { const n = { ...e }; delete n[doc.id]; return n })

    try {
      // Step 1: get presigned upload URL
      const res1 = await fetch(`/api/portal/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id:  doc.id,
          workflow_id:  wfId,
          file_name:    file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes:   file.size,
        }),
      })
      const { upload_url, path: storagePath, error: urlErr } = await res1.json()
      if (!res1.ok || !upload_url) throw new Error(urlErr ?? 'Could not get upload URL')

      // Step 2: PUT directly to storage (R2 or Supabase)
      const put = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error('Upload to storage failed')

      // Step 3: confirm — marks document as received in DB
      const res3 = await fetch(`/api/portal/${token}/upload`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id, storage_path: storagePath }),
      })
      if (!res3.ok) {
        const d = await res3.json()
        throw new Error(d.error ?? 'Could not confirm upload')
      }

      setUploads(s => ({ ...s, [doc.id]: 'done' }))
    } catch (e: any) {
      setUploads(s => ({ ...s, [doc.id]: 'error' }))
      setUploadErrors(errs => ({ ...errs, [doc.id]: e.message ?? 'Upload failed. Please try again.' }))
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  function statusColor(s: string) {
    if (s === 'Complete')  return { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' }
    if (s === 'Overdue')   return { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' }
    if (s === 'At Risk')   return { bg: '#FFFBEB', color: '#B45309', border: '#FCD34D' }
    return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' }
  }
  function daysLabel(deadline: string) {
    const d = Math.round((new Date(deadline).getTime() - Date.now()) / 86400000)
    if (d < 0)  return { text: `${Math.abs(d)} days overdue`, color: '#DC2626' }
    if (d === 0) return { text: 'Due today', color: '#DC2626' }
    if (d <= 7) return { text: `${d} days remaining`, color: '#B45309' }
    return { text: `${d} days remaining`, color: '#15803D' }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#64748B', fontSize: 15, margin: 0 }}>Loading your portal…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !data) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div style={{ background: 'white', border: '1px solid #FCA5A5', borderRadius: 12, padding: '32px 40px', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1E293B', margin: '0 0 10px' }}>Link not valid</h2>
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: '0 0 16px' }}>{error ?? 'This portal link is invalid or has expired.'}</p>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Contact {data?.firm_name ?? 'your accountant'} for a new link.</p>
      </div>
    </div>
  )

  const totalPending = (data.workflows ?? []).reduce((s, wf) => s + wf.pending_documents.filter(d => uploads[d.id] !== 'done').length, 0)
  const allComplete  = data.pending_documents_count > 0 && totalPending === 0

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{data.firm_name}</div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Secure Document Portal</div>
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'right' }}>
          <div>🔒 Encrypted</div>
          <div style={{ marginTop: 2 }}>Expires {fmtDate(data.expires_at)}</div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>

        {/* Welcome */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>
            Hi {data.client.name} 👋
          </h1>
          <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.6 }}>
            {allComplete
              ? `${data.firm_name} has received all the documents they need. You'll be in touch when your filing is ready.`
              : `${data.firm_name} needs some documents to complete your upcoming filing${data.workflows.length > 1 ? 's' : ''}. Please upload the files listed below.`}
          </p>
        </div>

        {/* All done */}
        {allComplete && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '24px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#15803D', marginBottom: 6 }}>All documents received</div>
            <div style={{ fontSize: 14, color: '#166534' }}>{data.firm_name} will proceed with your filing and will be in touch.</div>
          </div>
        )}

        {/* Workflows */}
        {(data.workflows ?? []).map(wf => {
          const pendingDocs  = wf.pending_documents.filter(d => uploads[d.id] !== 'done')
          const uploadedDocs = wf.pending_documents.filter(d => uploads[d.id] === 'done')
          const dl = daysLabel(wf.deadline)
          const sc = statusColor(wf.status)

          return (
            <div key={wf.id} style={{ marginBottom: 20 }}>
              {/* Workflow header */}
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px 12px 0 0', padding: '16px 20px', borderBottom: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>{wf.label}</div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>CRA Deadline: {fmtDate(wf.deadline)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: dl.color }}>{dl.text}</span>
                    {data.can_view_status && (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                        {wf.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '0 0 12px 12px', padding: '0 0 8px' }}>
                {pendingDocs.length > 0 && (
                  <div style={{ padding: '12px 20px 0' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Needed — {pendingDocs.length} document{pendingDocs.length !== 1 ? 's' : ''}
                    </div>
                    {pendingDocs.map(doc => {
                      const state = uploads[doc.id] ?? 'idle'
                      const err   = uploadErrors[doc.id]
                      return (
                        <div key={doc.id} style={{ border: `1px solid ${err ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 8, padding: '14px 16px', marginBottom: 8, background: err ? '#FEF2F2' : 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: '#1E293B' }}>{doc.name}</div>
                              {err && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>⚠ {err}</div>}
                              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>PDF, JPG, PNG, Excel, CSV, ZIP · Max 25 MB</div>
                            </div>

                            {data.can_upload && (
                              <div style={{ flexShrink: 0 }}>
                                <input
                                  type="file"
                                  ref={el => { fileRefs.current[doc.id] = el }}
                                  style={{ display: 'none' }}
                                  accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.zip"
                                  onChange={e => {
                                    const file = e.target.files?.[0]
                                    if (file) uploadFile(doc, wf.id, file)
                                    e.target.value = ''
                                  }}
                                />
                                {state === 'uploading' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#2563EB', animation: 'spin 0.6s linear infinite' }} />
                                    <span style={{ fontSize: 12, color: '#64748B' }}>Uploading…</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => fileRefs.current[doc.id]?.click()}
                                    style={{ background: state === 'error' ? '#DC2626' : '#2563EB', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    {state === 'error' ? 'Retry' : '↑ Upload'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Already received */}
                {uploadedDocs.length > 0 && (
                  <div style={{ padding: '12px 20px 0' }}>
                    {uploadedDocs.map(doc => (
                      <div key={doc.id} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#1E293B' }}>{doc.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#15803D' }}>✓ Received</span>
                      </div>
                    ))}
                  </div>
                )}

                {wf.all_documents_received && pendingDocs.length === 0 && uploadedDocs.length === 0 && (
                  <div style={{ padding: '14px 20px', fontSize: 13, color: '#15803D', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>✅</span> All documents received for this workflow
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 24, lineHeight: 1.6 }}>
          <div>This is a secure portal managed by {data.firm_name} via AcctOS.</div>
          <div>If you did not expect this link, please ignore it and contact {data.firm_name} directly.</div>
        </div>

      </div>
    </div>
  )
}
