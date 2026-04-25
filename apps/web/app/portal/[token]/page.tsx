'use client'

import { useEffect, useState, useRef } from 'react'

// ─── Client Portal Page ───────────────────────────────────────────────────────
// Public page — no Supabase Auth. The token in the URL is the credential.
// Route: /portal/[token]
//
// What it does:
//   1. Validates the token via GET /api/portal/[token]
//   2. Shows the client their pending documents
//   3. Lets them upload files directly
//   4. Shows current workflow status if token has can_view_status = true
//
// This page is intentionally minimal — it's the client-facing view,
// not the firm-facing view. No navigation, no sidebar, no firm branding.

type PortalData = {
  client_name:   string
  firm_name:     string
  workflow_label: string
  pending_docs:  Array<{ id: string; name: string; status: string }>
  workflow_status?: string
  can_upload:    boolean
  can_view_status: boolean
}

type UploadState = {
  [docId: string]: 'idle' | 'uploading' | 'done' | 'error'
}

export default function PortalPage({ params }: { params: { token: string } }) {
  const { token } = params

  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [data, setData]             = useState<PortalData | null>(null)
  const [uploads, setUploads]       = useState<UploadState>({})
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [allDone, setAllDone]       = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Load portal data ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error)
        } else {
          setData(json)
          // Init upload state
          const initState: UploadState = {}
          ;(json.pending_docs ?? []).forEach((d: any) => {
            initState[d.id] = d.status === 'received' ? 'done' : 'idle'
          })
          setUploads(initState)
        }
      })
      .catch(() => setError('Could not load your portal. Please try again or contact your accountant.'))
      .finally(() => setLoading(false))
  }, [token])

  // Check if all docs are done
  useEffect(() => {
    if (!data) return
    const pendingLeft = (data.pending_docs ?? []).filter(d => uploads[d.id] !== 'done')
    setAllDone(pendingLeft.length === 0 && (data.pending_docs ?? []).length > 0)
  }, [uploads, data])

  // ── Upload a file ────────────────────────────────────────────────────────────
  async function uploadFile(docId: string, file: File) {
    setUploads(s => ({ ...s, [docId]: 'uploading' }))
    setUploadErrors(e => { const n = { ...e }; delete n[docId]; return n })

    try {
      // Step 1: get presigned upload URL
      const res = await fetch(`/api/portal/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id:   docId,
          file_name:     file.name,
          file_type:     file.type,
          file_size:     file.size,
        }),
      })
      const { upload_url, storage_path, error: uploadErr } = await res.json()
      if (!res.ok || !upload_url) {
        throw new Error(uploadErr ?? 'Failed to get upload URL')
      }

      // Step 2: PUT file directly to storage
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) throw new Error('Upload to storage failed')

      // Step 3: confirm with the API so doc is marked received
      const confirmRes = await fetch(`/api/portal/${token}/upload`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId, storage_path }),
      })
      if (!confirmRes.ok) throw new Error('Could not confirm upload')

      setUploads(s => ({ ...s, [docId]: 'done' }))
    } catch (e: any) {
      setUploads(s => ({ ...s, [docId]: 'error' }))
      setUploadErrors(errs => ({ ...errs, [docId]: e.message ?? 'Upload failed. Please try again.' }))
    }
  }

  // ── Status badge colours ──────────────────────────────────────────────────────
  const statusColor = (status?: string) => {
    if (status === 'Complete')  return { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' }
    if (status === 'At Risk')   return { bg: '#FFFBEB', color: '#B45309', border: '#FCD34D' }
    if (status === 'Overdue')   return { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' }
    return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, fontFamily:'system-ui, sans-serif' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid #E2E8F0', borderTopColor:'#2563EB', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#64748B', fontSize:15 }}>Loading your portal…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error || !data) return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui, sans-serif' }}>
      <div style={{ background:'white', border:'1px solid #FCA5A5', borderRadius:12, padding:'32px 40px', maxWidth:440, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
        <h2 style={{ fontSize:18, fontWeight:600, color:'#1E293B', marginBottom:8 }}>Link not valid</h2>
        <p style={{ fontSize:14, color:'#64748B', lineHeight:1.6 }}>{error ?? 'This portal link is invalid or has expired.'}</p>
        <p style={{ fontSize:13, color:'#94A3B8', marginTop:16 }}>Contact your accountant for a new link.</p>
      </div>
    </div>
  )

  const pendingDocs  = data.pending_docs.filter(d => uploads[d.id] !== 'done')
  const receivedDocs = data.pending_docs.filter(d => uploads[d.id] === 'done')

  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', fontFamily:'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ background:'white', borderBottom:'1px solid #E2E8F0', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#1E293B' }}>{data.firm_name}</div>
          <div style={{ fontSize:13, color:'#64748B', marginTop:2 }}>Document Portal</div>
        </div>
        <div style={{ fontSize:13, color:'#94A3B8' }}>Secure · Encrypted</div>
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'32px 16px' }}>

        {/* Welcome */}
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'24px', marginBottom:20 }}>
          <h1 style={{ fontSize:20, fontWeight:700, color:'#1E293B', margin:'0 0 6px' }}>
            Hi {data.client_name}
          </h1>
          <p style={{ fontSize:14, color:'#475569', margin:0 }}>
            {data.workflow_label} · {data.firm_name} needs the following documents to complete your filing.
          </p>

          {/* Workflow status */}
          {data.can_view_status && data.workflow_status && (() => {
            const sc = statusColor(data.workflow_status)
            return (
              <div style={{ marginTop:14, background:sc.bg, border:`1px solid ${sc.border}`, borderRadius:8, padding:'8px 14px', display:'inline-flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:sc.color }}>Filing status: {data.workflow_status}</span>
              </div>
            )
          })()}
        </div>

        {/* All done state */}
        {allDone && (
          <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'24px', marginBottom:20, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:17, fontWeight:600, color:'#15803D', marginBottom:4 }}>All documents received</div>
            <div style={{ fontSize:13, color:'#166534' }}>Thank you. {data.firm_name} will proceed with your filing. You will be contacted if anything else is needed.</div>
          </div>
        )}

        {/* Pending documents */}
        {pendingDocs.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Documents needed — {pendingDocs.length} remaining
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {pendingDocs.map(doc => {
                const state = uploads[doc.id] || 'idle'
                const err   = uploadErrors[doc.id]
                return (
                  <div key={doc.id} style={{ background:'white', border:`1px solid ${state==='error'?'#FCA5A5':'#E2E8F0'}`, borderRadius:10, padding:'16px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:'#1E293B' }}>{doc.name}</div>
                        {err && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>⚠ {err}</div>}
                      </div>

                      {data.can_upload && state !== 'uploading' && (
                        <div>
                          <input
                            type="file"
                            ref={el => { fileRefs.current[doc.id] = el }}
                            style={{ display:'none' }}
                            accept=".pdf,.jpg,.jpeg,.png,.csv,.xls,.xlsx,.zip"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) uploadFile(doc.id, file)
                              e.target.value = ''
                            }}
                          />
                          <button
                            onClick={() => fileRefs.current[doc.id]?.click()}
                            style={{ background:'#2563EB', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                            Upload file
                          </button>
                        </div>
                      )}

                      {state === 'uploading' && (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:18, height:18, borderRadius:'50%', border:'2px solid #E2E8F0', borderTopColor:'#2563EB', animation:'spin 0.6s linear infinite' }} />
                          <span style={{ fontSize:13, color:'#64748B' }}>Uploading…</span>
                        </div>
                      )}
                    </div>

                    {/* Accepted file types */}
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:8 }}>
                      Accepted: PDF, JPG, PNG, Excel, CSV, ZIP · Max 25 MB
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Received documents */}
        {receivedDocs.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Received — {receivedDocs.length} of {data.pending_docs.length}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {receivedDocs.map(doc => (
                <div key={doc.id} style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, color:'#1E293B' }}>{doc.name}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'#15803D' }}>✓ Received</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginTop:32 }}>
          <div>This is a secure portal managed by {data.firm_name} via AcctOS.</div>
          <div style={{ marginTop:4 }}>If you did not expect this link, please ignore it and contact {data.firm_name} directly.</div>
        </div>

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
