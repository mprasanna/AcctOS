'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function SignupPage() {
  const [firmName, setFirmName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const signup = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!firmName.trim())     { setError('Firm name is required.'); return; }
    setLoading(true); setError('');
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { name: name.trim() || email.split('@')[0], role: 'owner' } },
      });
      if (authErr) throw new Error(authErr.message);
      if (!authData.user) throw new Error('Signup failed.');
      const res = await fetch('/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ firm_name: firmName.trim(), user_name: name.trim() || email.split('@')[0], email: email.trim().toLowerCase(), user_id: authData.user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed.');
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .su-root{min-height:100vh;display:flex;font-family:'DM Sans',system-ui,sans-serif;background:#fff;color:#1a1a2e}
        .su-left{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:48px;background:#f8faff;border-right:1px solid #eef2ff}
        .su-logo{display:flex;align-items:center;gap:10px}
        .su-logo-mark{width:34px;height:34px;background:#1a56db;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:600}
        .su-logo-text{font-size:18px;font-weight:600;color:#0f172a}
        .su-hero{flex:1;display:flex;flex-direction:column;justify-content:center;padding:48px 0}
        .su-tagline{font-family:'DM Serif Display',serif;font-size:40px;font-weight:400;color:#0f172a;line-height:1.15;margin-bottom:18px}
        .su-tagline span{color:#1a56db}
        .su-sub{font-size:15px;color:#475569;line-height:1.7;margin-bottom:36px;max-width:380px}
        .su-checks{display:flex;flex-direction:column;gap:14px}
        .su-check{display:flex;align-items:flex-start;gap:12px}
        .su-check-dot{width:20px;height:20px;border-radius:50%;background:#eff6ff;border:1.5px solid #bfdbfe;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
        .su-check-dot::after{content:'';width:7px;height:7px;border-radius:50%;background:#1a56db}
        .su-check-label{font-size:14px;color:#334155;line-height:1.55}
        .su-check-label strong{color:#0f172a;font-weight:600}
        .su-quote{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;font-size:13px;color:#64748b;line-height:1.65;font-style:italic}
        .su-quote-author{font-size:11px;color:#94a3b8;margin-top:8px;font-style:normal;font-weight:600;text-transform:uppercase;letter-spacing:0.06em}
        .su-right{width:480px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:48px 52px;background:#fff}
        .su-form-wrap{width:100%;max-width:360px}
        .su-badge{display:inline-flex;align-items:center;gap:7px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:100px;padding:5px 14px;font-size:12px;font-weight:500;color:#1a56db;margin-bottom:28px}
        .su-badge-dot{width:7px;height:7px;border-radius:50%;background:#1a56db}
        .su-title{font-family:'DM Serif Display',serif;font-size:30px;font-weight:400;color:#0f172a;margin-bottom:6px}
        .su-subtitle{font-size:14px;color:#64748b;margin-bottom:32px}
        .su-field{margin-bottom:18px}
        .su-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
        .su-label{display:block;font-size:12px;font-weight:500;color:#64748b;margin-bottom:6px}
        .su-input{width:100%;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:9px;font-size:14px;font-family:'DM Sans',system-ui,sans-serif;color:#0f172a;outline:none;transition:border-color 0.15s,box-shadow 0.15s;box-sizing:border-box}
        .su-input::placeholder{color:#cbd5e1}
        .su-input:focus{border-color:#1a56db;box-shadow:0 0 0 3px rgba(26,86,219,0.1)}
        .su-error{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:13px;color:#dc2626;margin-bottom:16px}
        .su-btn{width:100%;padding:12px;background:#1a56db;color:#fff;border:none;border-radius:10px;font-size:15px;font-family:'DM Sans',system-ui,sans-serif;font-weight:600;cursor:pointer;transition:background 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px}
        .su-btn:hover:not(:disabled){background:#1447c0;transform:translateY(-1px)}
        .su-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}
        .su-divider{display:flex;align-items:center;gap:12px;margin:22px 0;font-size:12px;color:#e2e8f0}
        .su-divider::before,.su-divider::after{content:'';flex:1;height:1px;background:#e2e8f0}
        .su-signin{display:block;text-align:center;font-size:13px;color:#475569;text-decoration:none;padding:11px;border:1px solid #e2e8f0;border-radius:9px;transition:border-color 0.15s,color 0.15s}
        .su-signin:hover{border-color:#1a56db;color:#1a56db}
        .su-terms{font-size:12px;color:#94a3b8;text-align:center;margin-top:22px;line-height:1.6}
        .su-spinner{width:15px;height:15px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){.su-left{display:none}.su-right{width:100%;padding:40px 24px}}
      `}</style>
      <div className="su-root">
        <div className="su-left">
          <div className="su-logo">
            <div className="su-logo-mark">A</div>
            <span className="su-logo-text">AcctOS</span>
          </div>
          <div className="su-hero">
            <h1 className="su-tagline">Your firm.<br /><span>Under control.</span></h1>
            <p className="su-sub">Set up in under an hour. Add your clients, connect QuickBooks, and your first workflows are live — with CRA deadlines already set.</p>
            <div className="su-checks">
              {[['14-day free trial','No credit card required. Cancel anytime.'],['CRA deadlines built in','GST/HST, T1, T2, Payroll — no configuration needed.'],['At Risk engine from day one','Flags problems before deadlines, automatically.'],['Client portal included','Business owners upload docs, view status, pay invoices.'],['Flat CAD pricing','$49 / $149 / $299 — no per-user fees, ever.']].map(([t,d])=>(
                <div key={t} className="su-check">
                  <div className="su-check-dot" />
                  <div className="su-check-label"><strong>{t}</strong> — {d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="su-quote">
            &ldquo;One avoided CRA penalty covers roughly a month of the Growth plan. That&apos;s the conversation.&rdquo;
            <div className="su-quote-author">AcctOS — Built for Canadian firms</div>
          </div>
        </div>
        <div className="su-right">
          <div className="su-form-wrap">
            <div className="su-badge"><div className="su-badge-dot" />14-day free trial</div>
            <h2 className="su-title">Create your firm</h2>
            <p className="su-subtitle">Set up your AcctOS workspace in under 2 minutes</p>
            <form onSubmit={signup}>
              <div className="su-field">
                <label className="su-label" htmlFor="firmName">Firm name</label>
                <input id="firmName" className="su-input" type="text" placeholder="Jensen & Associates CPA" value={firmName} onChange={e=>setFirmName(e.target.value)} required autoComplete="organization" />
              </div>
              <div className="su-row">
                <div>
                  <label className="su-label" htmlFor="name">Your name</label>
                  <input id="name" className="su-input" type="text" placeholder="Patrick W." value={name} onChange={e=>setName(e.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label className="su-label" htmlFor="email">Work email</label>
                  <input id="email" className="su-input" type="email" placeholder="you@yourfirm.ca" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" />
                </div>
              </div>
              <div className="su-field">
                <label className="su-label" htmlFor="password">Password</label>
                <input id="password" className="su-input" type="password" placeholder="Minimum 8 characters" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
              </div>
              {error && <div className="su-error">{error}</div>}
              <button type="submit" className="su-btn" disabled={loading}>
                {loading ? <><div className="su-spinner"/>Creating your workspace…</> : <>Create free account →</>}
              </button>
            </form>
            <div className="su-divider">already have an account</div>
            <a href="/login" className="su-signin">Sign in to AcctOS →</a>
            <p className="su-terms">Canadian data residency · Supabase ca-central-1<br/>No credit card required · Cancel anytime</p>
          </div>
        </div>
      </div>
    </>
  );
}
