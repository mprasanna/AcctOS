"use client";
// ─── CLIENT PORTAL ────────────────────────────────────────────────────────────
// Route: /portal/* (Next.js App Router)
// Users: business owners (portal_users) — separate from firm staff
//
// Pages rendered by this component (client-side router):
//   /portal/login          — firm-branded login
//   /portal/setup?token=x  — set password from invite
//   /portal/dashboard      — filings overview
//   /portal/documents/:id  — docs for a filing
//   /portal/messages       — message thread with accountant
//   /portal/invoices       — outstanding invoices + pay

import { useState, useEffect, useRef } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#F8FAFC", card: "#FFFFFF", border: "#E2E8F0",
  primary: "#2563EB", primaryBg: "#EFF6FF",
  green: "#16A34A", greenBg: "#DCFCE7",
  amber: "#F59E0B", amberBg: "#FEF3C7",
  red: "#DC2626", redBg: "#FEE2E2",
  text: "#0F172A", muted: "#475569", slate: "#94A3B8",
};

function fmtDate(d) { return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }); }
function fmtDateTime(d) { return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function daysFrom(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, ...style }}>{children}</div>;
}

function Btn({ children, onClick, variant="primary", disabled, fullWidth }) {
  const base = { borderRadius:9, padding:"10px 20px", fontSize:14, fontWeight:600, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.6:1, border:"none", width:fullWidth?"100%":undefined };
  const styles = variant==="primary"
    ? { ...base, background:C.primary, color:"white" }
    : { ...base, background:"none", color:C.text, border:`1px solid ${C.border}`, cursor:"pointer" };
  return <button onClick={onClick} disabled={disabled} style={styles}>{children}</button>;
}

function StatusPill({ status }) {
  const cfg = {
    "On Track": { bg:C.greenBg, color:C.green },
    "At Risk":  { bg:C.amberBg, color:C.amber },
    "Overdue":  { bg:C.redBg,   color:C.red },
    "Complete": { bg:C.greenBg, color:C.green },
  }[status] || { bg:"#F1F5F9", color:C.muted };
  return <span style={{ background:cfg.bg, color:cfg.color, fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20 }}>{status}</span>;
}

function StageProgress({ stages, curStage }) {
  const clr = { complete:C.green, in_progress:C.primary, blocked:C.red, missed:C.red, pending:C.border };
  return (
    <div style={{ display:"flex", gap:3, alignItems:"center" }}>
      {(stages||[]).map((s,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center" }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:clr[s.status]||C.border, border:s.status==="pending"?`1.5px solid ${C.border}`:"none" }} title={s.name} />
          {i < (stages.length-1) && <div style={{ width:8, height:1.5, background:C.border }} />}
        </div>
      ))}
    </div>
  );
}

function Input({ label, type="text", value, onChange, placeholder, required, autoComplete }) {
  return (
    <div>
      {label && <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>}
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} required={required} autoComplete={autoComplete}
        style={{ width:"100%", padding:"11px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:14, color:C.text, boxSizing:"border-box", outline:"none", background:"white" }}
        onFocus={e => e.target.style.borderColor=C.primary}
        onBlur={e => e.target.style.borderColor=C.border}
      />
    </div>
  );
}

// ─── PORTAL NAV ───────────────────────────────────────────────────────────────
function PortalNav({ page, setPage, firm, unreadCount }) {
  return (
    <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"0 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      {/* Firm brand */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 0" }}>
        {firm?.logo_url
          ? <img src={firm.logo_url} alt="" style={{ width:32, height:32, borderRadius:7, objectFit:"contain" }} />
          : <div style={{ width:32, height:32, borderRadius:7, background:C.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"white" }}>
              {(firm?.name||"??").slice(0,2).toUpperCase()}
            </div>
        }
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{firm?.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>Client Portal</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ display:"flex", gap:2 }}>
        {[
          { id:"dashboard", label:"My Filings" },
          { id:"messages",  label:`Messages${unreadCount>0?` (${unreadCount})`:""}` },
          { id:"invoices",  label:"Invoices" },
        ].map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            style={{ background:"none", border:"none", borderBottom:page===item.id?`2px solid ${C.primary}`:"2px solid transparent", padding:"14px 14px", cursor:"pointer", fontSize:13, fontWeight:page===item.id?600:400, color:page===item.id?C.primary:C.muted }}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Sign out */}
      <button onClick={() => fetch("/api/portal/auth/logout",{method:"POST"}).then(()=>setPage("login"))}
        style={{ background:"none", border:"none", fontSize:12, color:C.slate, cursor:"pointer" }}>
        Sign out
      </button>
    </div>
  );
}

// ─── PORTAL LOGIN ─────────────────────────────────────────────────────────────
function PortalLogin({ onLogin, brand }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/portal/auth/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) onLogin(data.portal_user);
      else setError(data.error || "Invalid email or password.");
    } catch(e) { setError("Network error — please try again."); }
    finally { setLoading(false); }
  }

  async function handleForgot() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    setLoading(true);
    try {
      await fetch("/api/portal/auth/forgot-password", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim() }),
      });
      setForgotSent(true);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Firm branding card */}
        <Card style={{ padding:"32px 32px 28px", marginBottom:0 }}>
          {/* Logo + firm name + tagline */}
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
              {brand?.logo_url
                ? <img src={brand.logo_url} alt={brand.firm_name} style={{ width:64, height:64, borderRadius:12, objectFit:"contain", border:`1px solid ${C.border}` }} />
                : <div style={{ width:64, height:64, borderRadius:12, background:C.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, color:"white" }}>
                    {(brand?.firm_name||"??").slice(0,2).toUpperCase()}
                  </div>
              }
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:5 }}>
              {brand?.firm_name || "Your Accounting Firm"}
            </div>
            <div style={{ fontSize:13, color:C.muted }}>
              {brand?.tagline || "Your secure accounting portal"}
            </div>
            {brand?.client_name && (
              <div style={{ marginTop:10, background:C.primaryBg, borderRadius:8, padding:"6px 14px", display:"inline-block" }}>
                <span style={{ fontSize:12, color:C.primary }}>Welcome back, <strong>{brand.client_name}</strong></span>
              </div>
            )}
          </div>

          {/* Form */}
          {forgotSent ? (
            <div style={{ textAlign:"center", padding:"16px 0" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📧</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Check your email</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:20 }}>We sent a password reset link to {email}</div>
              <Btn onClick={() => { setShowForgot(false); setForgotSent(false); }} variant="outline">Back to sign in</Btn>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {error && (
                <div style={{ background:C.redBg, border:`1px solid #FCA5A5`, borderRadius:8, padding:"9px 12px", fontSize:13, color:C.red }}>
                  {error}
                </div>
              )}
              <Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.ca" autoComplete="email" />
              {!showForgot && (
                <Input label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
              )}
              {!showForgot
                ? <>
                    <Btn onClick={handleLogin} disabled={loading || !email.trim() || !password} fullWidth>
                      {loading ? "Signing in…" : "Sign in"}
                    </Btn>
                    <button onClick={() => setShowForgot(true)} style={{ background:"none", border:"none", fontSize:12, color:C.muted, cursor:"pointer", textAlign:"center" }}>
                      Forgot your password?
                    </button>
                  </>
                : <>
                    <Btn onClick={handleForgot} disabled={loading} fullWidth>
                      {loading ? "Sending…" : "Send reset link"}
                    </Btn>
                    <button onClick={() => setShowForgot(false)} style={{ background:"none", border:"none", fontSize:12, color:C.muted, cursor:"pointer", textAlign:"center" }}>
                      Back to sign in
                    </button>
                  </>
              }
            </div>
          )}
        </Card>

        {/* Footer */}
        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:C.slate }}>
          Secured by AcctOS · <a href="https://acct-os.vercel.app" style={{ color:C.slate }}>acct-os.vercel.app</a>
        </div>
      </div>
    </div>
  );
}

// ─── PORTAL SETUP (set password from invite) ──────────────────────────────────
function PortalSetup({ token, onComplete }) {
  const [brand, setBrand]           = useState(null);
  const [email, setEmail]           = useState("");
  const [name, setName]             = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);

  useEffect(() => {
    if (!token) { setTokenError("Invalid setup link."); setTokenLoading(false); return; }
    fetch(`/api/portal/brand?token=${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setBrand(d); if(d.client_name) setName(d.client_name); }
        else setTokenError("This setup link has expired or already been used.");
      })
      .catch(()=> setTokenError("Could not load setup page."))
      .finally(() => setTokenLoading(false));
  }, [token]);

  async function handleSetup() {
    if (!email.trim() || !password || !name.trim()) { setError("All fields are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/portal/auth/setup", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token, email: email.trim(), password, display_name: name.trim() }),
      });
      const data = await res.json();
      if (res.ok) onComplete(data.portal_user);
      else setError(data.error || "Setup failed. The link may have expired.");
    } catch(e) { setError("Network error — please try again."); }
    finally { setLoading(false); }
  }

  if (tokenLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:13, color:C.muted }}>Loading…</div>
    </div>
  );

  if (tokenError) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <Card style={{ padding:"32px", maxWidth:400, textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
        <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:8 }}>Setup link invalid</div>
        <div style={{ fontSize:13, color:C.muted }}>{tokenError}</div>
        <div style={{ fontSize:12, color:C.slate, marginTop:12 }}>Contact your accountant to resend the invite.</div>
      </Card>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <Card style={{ padding:"32px" }}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            {brand?.logo_url
              ? <img src={brand.logo_url} alt="" style={{ width:56, height:56, borderRadius:10, objectFit:"contain", border:`1px solid ${C.border}`, display:"block", margin:"0 auto 12px" }} />
              : <div style={{ width:56, height:56, borderRadius:10, background:C.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"white", margin:"0 auto 12px" }}>
                  {(brand?.firm_name||"??").slice(0,2).toUpperCase()}
                </div>
            }
            <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{brand?.firm_name} has invited you</div>
            <div style={{ fontSize:13, color:C.muted }}>Create your portal account to upload documents, view filings, and message your accountant.</div>
          </div>

          {error && (
            <div style={{ background:C.redBg, border:`1px solid #FCA5A5`, borderRadius:8, padding:"9px 12px", fontSize:13, color:C.red, marginBottom:14 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Input label="Your name" value={name} onChange={e=>setName(e.target.value)} placeholder="Raj Patel" />
            <Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="raj@patelholdings.ca" autoComplete="email" />
            <Input label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            <Input label="Confirm password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
            <Btn onClick={handleSetup} disabled={loading || !email.trim() || !password || !name.trim()} fullWidth>
              {loading ? "Creating account…" : "Create my account"}
            </Btn>
          </div>
        </Card>
        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:C.slate }}>Secured by AcctOS</div>
      </div>
    </div>
  );
}

// ─── PORTAL DASHBOARD — FILINGS ───────────────────────────────────────────────
function PortalDashboard({ user, setPage, setActiveFilingId }) {
  const [filings, setFilings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/filings", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.filings) setFilings(d.filings); })
      .catch(()=>{})
      .finally(() => setLoading(false));
  }, []);

  const active   = filings.filter(f => f.status !== "Complete");
  const complete = filings.filter(f => f.status === "Complete");

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0 }}>My filings</h1>
        <p style={{ fontSize:13, color:C.muted, margin:"4px 0 0" }}>All your CRA filings managed by {user?.firm_name || "your firm"}</p>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>Loading your filings…</div>
      ) : filings.length === 0 ? (
        <Card style={{ padding:"48px 32px", textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>No filings yet</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Your accountant will add filings here as they're created.</div>
        </Card>
      ) : (
        <div>
          {active.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Active filings</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {active.map(f => <FilingCard key={f.id} filing={f} setPage={setPage} setActiveFilingId={setActiveFilingId} />)}
              </div>
            </div>
          )}
          {complete.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Completed</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {complete.map(f => <FilingCard key={f.id} filing={f} setPage={setPage} setActiveFilingId={setActiveFilingId} compact />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilingCard({ filing, setPage, setActiveFilingId, compact }) {
  const daysLeft = filing.days_to_deadline;
  const deadlineColor = daysLeft < 0 ? C.red : daysLeft <= 7 ? C.amber : C.green;

  return (
    <Card style={{ padding: compact ? "12px 16px" : "16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{filing.type}</span>
            <span style={{ fontSize:12, color:C.muted }}>— {filing.period_label}</span>
            <StatusPill status={filing.status} />
          </div>
          {!compact && (
            <>
              <div style={{ marginBottom:10 }}>
                <StageProgress stages={filing.stages} curStage={filing.cur_stage} />
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                  Stage {filing.cur_stage} of 6 — {filing.stage_name}
                </div>
              </div>
              {filing.pending_docs_count > 0 && (
                <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:7, padding:"7px 12px", fontSize:12, color:C.amber, marginBottom:10 }}>
                  ⚠ {filing.pending_docs_count} document{filing.pending_docs_count>1?"s":""} needed from you
                  <button onClick={() => { setActiveFilingId(filing.id); setPage("documents"); }}
                    style={{ background:"none", border:"none", color:C.primary, fontSize:12, fontWeight:600, cursor:"pointer", marginLeft:8 }}>
                    Upload now →
                  </button>
                </div>
              )}
            </>
          )}
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            <div style={{ fontSize:12, color:C.muted }}>
              CRA deadline: <span style={{ fontWeight:600, color:deadlineColor }}>{fmtDate(filing.deadline)}</span>
            </div>
            {daysLeft !== null && !compact && (
              <div style={{ fontSize:12, fontWeight:600, color:deadlineColor }}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days remaining`}
              </div>
            )}
          </div>
        </div>
        {!compact && filing.pending_docs_count > 0 && (
          <button onClick={() => { setActiveFilingId(filing.id); setPage("documents"); }}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0, marginLeft:12 }}>
            Upload docs
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── PORTAL DOCUMENTS ─────────────────────────────────────────────────────────
function PortalDocuments({ filingId, setPage }) {
  const [docs, setDocs]         = useState([]);
  const [filing, setFiling]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState({});
  const [uploaded, setUploaded]   = useState({});
  const fileRefs = useRef({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/documents?workflow_id=${filingId}`, { credentials:"include" }).then(r=>r.json()),
      fetch(`/api/portal/filings`, { credentials:"include" }).then(r=>r.json()),
    ]).then(([docsData, filingsData]) => {
      if (docsData?.documents) setDocs(docsData.documents);
      if (filingsData?.filings) {
        const f = filingsData.filings.find(f => f.id === filingId);
        if (f) setFiling(f);
      }
    }).catch(()=>{}).finally(() => setLoading(false));
  }, [filingId]);

  async function handleUpload(doc, file) {
    if (!file) return;
    setUploading(prev => ({...prev, [doc.id]: true}));
    try {
      // Step 1: get presigned URL
      const res1 = await fetch("/api/portal/upload", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ workflow_id: filingId, document_id: doc.id, filename: file.name, content_type: file.type }),
      });
      const { presigned_url, storage_path } = await res1.json();

      // Step 2: PUT file directly to R2
      await fetch(presigned_url, { method:"PUT", body: file, headers:{"Content-Type": file.type} });

      // Step 3: confirm
      const res3 = await fetch("/api/portal/upload/confirm", {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ document_id: doc.id, storage_path }),
      });
      const confirmed = await res3.json();
      if (res3.ok) {
        setDocs(prev => prev.map(d => d.id === doc.id ? {...d, status:"received", storage_path} : d));
        setUploaded(prev => ({...prev, [doc.id]: true}));
        if (confirmed.stage_advanced) {
          // Show stage advance notification
        }
      }
    } catch(e) { console.error("Upload failed:", e); }
    finally { setUploading(prev => ({...prev, [doc.id]: false})); }
  }

  const pending   = docs.filter(d => d.status === "pending");
  const received  = docs.filter(d => d.status === "received");
  const allDone   = pending.length === 0 && docs.length > 0;

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 24px" }}>
      <button onClick={() => setPage("dashboard")} style={{ background:"none", border:"none", color:C.primary, cursor:"pointer", fontSize:13, fontWeight:500, padding:0, marginBottom:16 }}>
        ← Back to my filings
      </button>

      {filing && (
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:20, fontWeight:700, color:C.text, margin:"0 0 4px" }}>
            Documents — {filing.type} {filing.period_label}
          </h1>
          <div style={{ fontSize:13, color:C.muted }}>
            CRA deadline: {fmtDate(filing.deadline)} · Stage {filing.cur_stage} of 6
          </div>
        </div>
      )}

      {allDone && (
        <div style={{ background:C.greenBg, border:`1px solid #BBF7D0`, borderRadius:10, padding:"14px 18px", marginBottom:20, display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:20 }}>✓</span>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:C.green }}>All documents received</div>
            <div style={{ fontSize:12, color:"#14532D" }}>Your accountant will now proceed to the next stage.</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>Loading documents…</div>
      ) : (
        <div>
          {pending.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
                Needed from you ({pending.length})
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {pending.map(doc => (
                  <Card key={doc.id} style={{ padding:"14px 18px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{doc.name}</span>
                          {doc.is_t183 && (
                            <span style={{ background:"#EFF6FF", color:C.primary, fontSize:10, fontWeight:600, padding:"1px 7px", borderRadius:6 }}>T183 Authorization</span>
                          )}
                        </div>
                        {uploaded[doc.id] && (
                          <div style={{ fontSize:12, color:C.green, fontWeight:500 }}>✓ Uploaded successfully</div>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        {uploading[doc.id] && (
                          <span style={{ fontSize:12, color:C.muted }}>Uploading…</span>
                        )}
                        <label style={{ background:C.primary, color:"white", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                          {uploaded[doc.id] ? "Replace" : "Upload"}
                          <input type="file" style={{ display:"none" }}
                            onChange={e => { const f = e.target.files?.[0]; if(f) handleUpload(doc, f); }}
                          />
                        </label>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {received.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
                Received ({received.length})
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {received.map(doc => (
                  <div key={doc.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:"#F8FAFC", borderRadius:9, border:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, color:C.text }}>{doc.name}</span>
                    <span style={{ fontSize:12, color:C.green, fontWeight:600 }}>✓ Received</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PORTAL MESSAGES ──────────────────────────────────────────────────────────
function PortalMessages({ user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filings, setFilings]   = useState([]);
  const [body, setBody]         = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [sending, setSending]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/messages", { credentials:"include" }).then(r=>r.json()),
      fetch("/api/portal/filings",  { credentials:"include" }).then(r=>r.json()),
    ]).then(([msgData, filingsData]) => {
      if (msgData?.messages) setMessages(msgData.messages);
      if (filingsData?.filings) setFilings(filingsData.filings);
    }).catch(()=>{}).finally(() => setLoading(false));
  }, []);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/portal/messages", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ body: body.trim(), workflow_id: workflowId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, data.message]);
        setBody("");
      }
    } finally { setSending(false); }
  }

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0 }}>Messages</h1>
        <p style={{ fontSize:13, color:C.muted, margin:"4px 0 0" }}>Ask your accountant a question or send a note about a filing</p>
      </div>

      {/* Thread */}
      <Card style={{ padding:"16px 18px", marginBottom:16, minHeight:200 }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"32px", color:C.muted }}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign:"center", padding:"32px", color:C.muted }}>
            <div style={{ fontSize:24, marginBottom:10 }}>💬</div>
            No messages yet. Send your accountant a message below.
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {messages.map(msg => {
              const isMe = msg.sender_type === "client";
              return (
                <div key={msg.id} style={{ display:"flex", flexDirection:"column", alignItems:isMe?"flex-end":"flex-start" }}>
                  <div style={{ maxWidth:"80%", background:isMe?C.primaryBg:"#F8FAFC", border:`1px solid ${isMe?"#BFDBFE":C.border}`, borderRadius:10, padding:"10px 14px" }}>
                    {msg.workflow_label && (
                      <div style={{ fontSize:11, background:isMe?C.primary:"#E2E8F0", color:isMe?"white":C.muted, padding:"1px 8px", borderRadius:5, display:"inline-block", marginBottom:6 }}>
                        {msg.workflow_label}
                      </div>
                    )}
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.55 }}>{msg.body}</div>
                    <div style={{ fontSize:10, color:C.slate, marginTop:5, textAlign:isMe?"right":"left" }}>
                      {isMe ? "You" : msg.sender_name} · {fmtDateTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Compose */}
      <Card style={{ padding:"16px 18px" }}>
        <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
          <span style={{ fontSize:12, color:C.muted, flexShrink:0 }}>About:</span>
          <select value={workflowId} onChange={e=>setWorkflowId(e.target.value)}
            style={{ flex:1, padding:"6px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:12, outline:"none", background:"white" }}>
            <option value="">General question</option>
            {filings.map(f => <option key={f.id} value={f.id}>{f.type} — {f.period_label}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <textarea value={body} onChange={e=>setBody(e.target.value)}
            placeholder="Type your message…"
            rows={3}
            style={{ flex:1, padding:"10px 14px", borderRadius:9, border:`1px solid ${C.border}`, fontSize:13, resize:"vertical", outline:"none", fontFamily:"inherit" }}
          />
          <button onClick={send} disabled={sending || !body.trim()}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:9, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:body.trim()&&!sending?"pointer":"not-allowed", opacity:sending?0.7:1, alignSelf:"flex-end" }}>
            {sending ? "…" : "Send"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── PORTAL INVOICES ──────────────────────────────────────────────────────────
function PortalInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [paying, setPaying]     = useState({});

  useEffect(() => {
    fetch("/api/portal/invoices", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.invoices) setInvoices(d.invoices); })
      .catch(()=>{})
      .finally(() => setLoading(false));
  }, []);

  async function pay(invoice) {
    setPaying(prev => ({...prev, [invoice.id]: true}));
    try {
      const res = await fetch(`/api/portal/invoices/${invoice.stripe_invoice_id}/pay`, {
        method:"POST", credentials:"include",
      });
      const data = await res.json();
      if (data.payment_url) window.open(data.payment_url, "_blank");
    } finally { setPaying(prev => ({...prev, [invoice.id]: false})); }
  }

  const outstanding = invoices.filter(i => i.status === "open");
  const paid        = invoices.filter(i => i.status === "paid");

  const totalOwing = outstanding.reduce((s, i) => s + i.amount_cad, 0);

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.text, margin:0 }}>Invoices</h1>
        {totalOwing > 0 && (
          <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:9, padding:"10px 16px", marginTop:12, fontSize:13, color:C.amber }}>
            Balance owing: <strong>${(totalOwing/100).toFixed(2)} CAD</strong>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <Card style={{ padding:"48px 32px", textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🧾</div>
          <div style={{ fontSize:14, fontWeight:600, color:C.text }}>No invoices yet</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Invoices from your accountant will appear here.</div>
        </Card>
      ) : (
        <div>
          {outstanding.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Outstanding</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {outstanding.map(inv => (
                  <Card key={inv.id} style={{ padding:"16px 20px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:3 }}>
                          {inv.workflow_type} — {inv.period_label}
                        </div>
                        <div style={{ fontSize:12, color:C.muted }}>
                          Due {fmtDate(inv.due_date)}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                        <div style={{ fontSize:18, fontWeight:700, color:C.text }}>
                          ${(inv.amount_cad/100).toFixed(2)}
                        </div>
                        <button onClick={() => pay(inv)} disabled={paying[inv.id]}
                          style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:paying[inv.id]?"not-allowed":"pointer", opacity:paying[inv.id]?0.7:1 }}>
                          {paying[inv.id] ? "…" : "Pay now"}
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {paid.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Paid</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {paid.map(inv => (
                  <div key={inv.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", background:"#F8FAFC", borderRadius:9, border:`1px solid ${C.border}` }}>
                    <div>
                      <span style={{ fontSize:13, color:C.text, fontWeight:500 }}>{inv.workflow_type} — {inv.period_label}</span>
                      <span style={{ fontSize:12, color:C.muted, marginLeft:10 }}>{fmtDate(inv.due_date)}</span>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ fontSize:13, color:C.text }}>${(inv.amount_cad/100).toFixed(2)}</span>
                      <span style={{ background:C.greenBg, color:C.green, fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:6 }}>Paid</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PORTAL APP SHELL ─────────────────────────────────────────────────────────
export default function ClientPortal() {
  const [page, setPage]             = useState("loading");
  const [user, setUser]             = useState(null);
  const [brand, setBrand]           = useState(null);
  const [activeFilingId, setActiveFilingId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Detect setup token in URL
  const setupToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;

  useEffect(() => {
    if (setupToken) { setPage("setup"); return; }

    // Check if already logged in
    fetch("/api/portal/me", { credentials:"include" })
      .then(r => {
        if (r.ok) return r.json();
        throw new Error("not logged in");
      })
      .then(data => {
        setUser(data.portal_user);
        if (data.firm) setBrand({ firm_name: data.firm.name, logo_url: data.firm.logo_url, tagline: data.firm.tagline });
        setPage("dashboard");
        // Load unread count
        fetch("/api/portal/messages", { credentials:"include" })
          .then(r=>r.json()).then(d => setUnreadCount((d?.messages||[]).filter(m=>m.sender_type==="accountant"&&!m.read_at).length))
          .catch(()=>{});
      })
      .catch(() => {
        // Not logged in — load brand for login page
        fetch("/api/portal/brand")
          .then(r => r.ok ? r.json() : null)
          .then(d => { if(d) setBrand(d); })
          .catch(()=>{});
        setPage("login");
      });
  }, [setupToken]);

  function handleLogin(portalUser) {
    setUser(portalUser);
    setPage("dashboard");
  }

  if (page === "loading") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:13, color:C.muted }}>Loading…</div>
    </div>
  );

  if (page === "login")  return <PortalLogin onLogin={handleLogin} brand={brand} />;
  if (page === "setup")  return <PortalSetup token={setupToken} onComplete={handleLogin} />;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter', system-ui, sans-serif" }}>
      <PortalNav page={page} setPage={setPage} firm={brand} unreadCount={unreadCount} />
      {page === "dashboard" && <PortalDashboard user={user} setPage={setPage} setActiveFilingId={setActiveFilingId} />}
      {page === "documents" && <PortalDocuments filingId={activeFilingId} setPage={setPage} />}
      {page === "messages"  && <PortalMessages user={user} />}
      {page === "invoices"  && <PortalInvoices />}
    </div>
  );
}
