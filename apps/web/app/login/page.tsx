'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    window.location.href = '/dashboard';
  };

  return (
    <>
      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          background: #080C14;
          font-family: var(--font-body, 'DM Sans', system-ui, sans-serif);
        }

        /* ── Left panel — branding ── */
        .login-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          background: #080C14;
          border-right: 1px solid #1E293B;
          position: relative;
          overflow: hidden;
        }

        /* Subtle grid background */
        .login-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
        }

        /* Blue glow orb */
        .login-left::after {
          content: '';
          position: absolute;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%);
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .login-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .login-logo-mark {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #2563EB;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display, 'Syne', system-ui, sans-serif);
          font-size: 20px;
          font-weight: 800;
          color: white;
          letter-spacing: -0.02em;
        }

        .login-logo-text {
          font-family: var(--font-display, 'Syne', system-ui, sans-serif);
          font-size: 22px;
          font-weight: 700;
          color: #F1F5F9;
          letter-spacing: -0.02em;
        }

        .login-hero {
          position: relative;
          z-index: 1;
        }

        .login-tagline {
          font-family: var(--font-display, 'Syne', system-ui, sans-serif);
          font-size: 42px;
          font-weight: 800;
          color: #F1F5F9;
          line-height: 1.1;
          letter-spacing: -0.03em;
          margin: 0 0 20px;
        }

        .login-tagline span {
          color: #2563EB;
        }

        .login-sub {
          font-size: 15px;
          color: #64748B;
          line-height: 1.7;
          margin: 0 0 40px;
          max-width: 380px;
        }

        .login-stats {
          display: flex;
          gap: 32px;
        }

        .login-stat-num {
          font-family: var(--font-display, 'Syne', system-ui, sans-serif);
          font-size: 28px;
          font-weight: 800;
          color: #F1F5F9;
          line-height: 1;
        }

        .login-stat-label {
          font-size: 12px;
          color: #475569;
          margin-top: 4px;
        }

        .login-quotes {
          position: relative;
          z-index: 1;
        }

        .login-quote {
          background: #0F1117;
          border: 1px solid #1E293B;
          border-radius: 10px;
          padding: 16px 20px;
          font-size: 13px;
          color: #64748B;
          line-height: 1.6;
          font-style: italic;
        }

        .login-quote-author {
          font-size: 11px;
          color: #334155;
          margin-top: 8px;
          font-style: normal;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        /* ── Right panel — form ── */
        .login-right {
          width: 480px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 56px;
          background: #080C14;
        }

        .login-form-wrap {
          width: 100%;
          max-width: 360px;
        }

        .login-form-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0F1729;
          border: 1px solid #1E3A5F;
          border-radius: 20px;
          padding: 5px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #38BDF8;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .login-form-title {
          font-family: var(--font-display, 'Syne', system-ui, sans-serif);
          font-size: 28px;
          font-weight: 800;
          color: #F1F5F9;
          margin: 0 0 6px;
          letter-spacing: -0.02em;
        }

        .login-form-sub {
          font-size: 14px;
          color: #475569;
          margin: 0 0 36px;
        }

        .form-field {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          background: #0F1117;
          border: 1px solid #1E293B;
          border-radius: 10px;
          font-size: 14px;
          font-family: var(--font-body, 'DM Sans', system-ui, sans-serif);
          color: #F1F5F9;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }

        .form-input::placeholder { color: #334155; }

        .form-input:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
        }

        .login-error {
          background: #2D0A0A;
          border: 1px solid #7F1D1D;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          color: #F87171;
          margin-bottom: 20px;
        }

        .login-submit {
          width: 100%;
          padding: 13px;
          background: #2563EB;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-family: var(--font-body, 'DM Sans', system-ui, sans-serif);
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(37,99,235,0.3);
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .login-submit:hover:not(:disabled) {
          background: #1D4ED8;
          box-shadow: 0 6px 20px rgba(37,99,235,0.4);
          transform: translateY(-1px);
        }

        .login-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 24px 0;
          font-size: 12px;
          color: #1E293B;
        }

        .login-divider::before,
        .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #1E293B;
        }

        .login-back {
          display: block;
          text-align: center;
          font-size: 13px;
          color: #334155;
          text-decoration: none;
          padding: 12px;
          border: 1px solid #1E293B;
          border-radius: 10px;
          transition: color 0.15s, border-color 0.15s;
        }

        .login-back:hover { color: #64748B; border-color: #334155; }

        .login-footer-note {
          font-size: 12px;
          color: #334155;
          text-align: center;
          margin-top: 28px;
          line-height: 1.6;
        }

        /* ── Spinner ── */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .login-left { display: none; }
          .login-right { width: 100%; padding: 40px 24px; }
        }
      `}</style>

      <div className="login-root">
        {/* LEFT — Branding */}
        <div className="login-left">
          <div className="login-logo fade-up">
            <div className="login-logo-mark">A</div>
            <span className="login-logo-text">AcctOS</span>
          </div>

          <div className="login-hero fade-up-1">
            <h1 className="login-tagline">
              We Don&apos;t Track Work.<br />
              <span>We Predict Risk.</span>
            </h1>
            <p className="login-sub">
              Workflow intelligence built for Canadian accounting firms.
              CRA deadlines native. 5-condition At Risk engine. Gate enforcement
              that catches errors before they become penalties.
            </p>
            <div className="login-stats">
              {[["42","API routes"],["24","DB tables"],["5","Risk conditions"],["98%","Infra margin"]].map(([n,l],i)=>(
                <div key={i}>
                  <div className="login-stat-num">{n}</div>
                  <div className="login-stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="login-quotes fade-up-2">
            <div className="login-quote">
              &ldquo;One avoided CRA penalty covers a month of the Growth plan.
              That&apos;s the conversation.&rdquo;
              <div className="login-quote-author">AcctOS — Built for Canadian firms</div>
            </div>
          </div>
        </div>

        {/* RIGHT — Form */}
        <div className="login-right">
          <div className="login-form-wrap fade-up">
            <div className="login-form-badge">
              <span className="pulse-dot" style={{width:6,height:6,borderRadius:"50%",background:"#38BDF8",display:"inline-block"}}/>
              Phases 0–4 Live
            </div>

            <h2 className="login-form-title">Welcome back</h2>
            <p className="login-form-sub">Sign in to your firm&apos;s AcctOS workspace</p>

            <form onSubmit={login}>
              <div className="form-field">
                <label className="form-label" htmlFor="email">Work email</label>
                <input
                  id="email"
                  className="form-input"
                  type="email"
                  placeholder="you@yourfirm.ca"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="form-input"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-submit" disabled={loading}>
                {loading
                  ? <><div className="spinner"/> Signing in…</>
                  : <>Sign in to AcctOS →</>
                }
              </button>
            </form>

            <div className="login-divider">or</div>

            <a href="/" className="login-back">← Back to acctos</a>

            <p className="login-footer-note">
              Canadian data residency · Supabase ca-central-1<br/>
              No account? Contact us for a free 60-day pilot.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
