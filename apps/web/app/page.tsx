'use client'
// apps/web/app/page.tsx — AcctOS marketing landing page
// Replace existing page.tsx with this file

import Link from 'next/link'

export default function MarketingPage() {
  return (
    <main style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: '#1a1a2e', background: '#fff', lineHeight: 1.6 }}>

      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #fff; }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: #1a56db; color: #fff; font-size: 15px; font-weight: 500;
          padding: 13px 28px; border-radius: 10px; text-decoration: none;
          border: none; cursor: pointer; transition: background 0.15s;
        }
        .btn-primary:hover { background: #1447c0; }
        .btn-outline {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: #1a56db; font-size: 15px; font-weight: 500;
          padding: 12px 26px; border-radius: 10px; text-decoration: none;
          border: 1.5px solid #1a56db; cursor: pointer; transition: all 0.15s;
        }
        .btn-outline:hover { background: #eff6ff; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #f0f0f0', zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, background: '#1a56db', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>A</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e' }}>AcctOS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <a href="#features" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>Features</a>
            <a href="#how-it-works" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>How it works</a>
            <a href="#pricing" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>Pricing</a>
            <a href="/login" style={{ fontSize: 14, color: '#555', textDecoration: 'none' }}>Sign in</a>
            <a href="/signup" className="btn-primary" style={{ padding: '9px 20px', fontSize: 14 }}>Start free trial</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background: '#f8faff', borderBottom: '1px solid #eef2ff', padding: '96px 24px 80px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 100, padding: '6px 16px', marginBottom: 32 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1a56db', display: 'inline-block' }}></span>
            <span style={{ fontSize: 13, color: '#1a56db', fontWeight: 500 }}>Built for Canadian accounting firms</span>
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 56, fontWeight: 400, lineHeight: 1.15, color: '#0f172a', marginBottom: 24 }}>
            Stop chasing clients.<br />Stop missing deadlines.
          </h1>
          <p style={{ fontSize: 19, color: '#475569', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 48px' }}>
            AcctOS manages your CRA filings, document collection, and team workflows — so every client file moves forward automatically.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
            <a href="/signup" className="btn-primary" style={{ fontSize: 16, padding: '14px 32px' }}>Start free trial →</a>
            <a href="/dashboard" className="btn-outline" style={{ fontSize: 16 }}>See the dashboard</a>
          </div>
          <p style={{ marginTop: 20, fontSize: 13, color: '#94a3b8' }}>No credit card required · 14-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* ── STAT BAR ── */}
      <section style={{ borderBottom: '1px solid #f0f0f0', padding: '32px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
          {[
            ['6 filing types', 'GST/HST, T1, T2, Payroll, Bookkeeping, CRA Notices'],
            ['5-condition', 'At Risk engine — flags problems before deadlines'],
            ['Flat CAD pricing', '$49 / $149 / $299 — no per-user fees ever'],
            ['Stage gate enforcement', 'Hard stops prevent filing before work is complete'],
          ].map(([stat, desc]) => (
            <div key={stat} style={{ padding: '4px 12px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{stat}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PAIN SECTION ── */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a56db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Sound familiar?</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: '#0f172a', fontWeight: 400 }}>The way most firms run today</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              ['📧', 'Chasing documents', 'You email clients, they forget. You email again. The GST deadline is in 4 days. You\'re not sure if the receipts ever came in.'],
              ['📋', 'Losing track', 'Spreadsheets, sticky notes, team chats. 40 clients, 6 filing types, 4 accountants. Something always slips through.'],
              ['⚠️', 'Penalty season', 'A missed T2 deadline costs $500 minimum. The real cost is the client relationship. And it was entirely avoidable.'],
            ].map(([icon, title, body]) => (
              <div key={title} style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 14, padding: '28px 24px' }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>{title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: '#f8faff', borderTop: '1px solid #eef2ff', borderBottom: '1px solid #eef2ff', padding: '96px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a56db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>How AcctOS works</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: '#0f172a', fontWeight: 400 }}>Three steps, then it runs itself</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {[
              ['01', 'Add your clients', 'Enter client name, filing type, and frequency. AcctOS builds the workflow, sets the CRA deadlines, and assigns the right template automatically.'],
              ['02', 'Work through stages', 'Each filing moves through 6 stages with hard gates. Stage 3 cannot start until all documents are received. No exceptions. No workarounds.'],
              ['03', 'Catch problems early', 'The At Risk engine checks 5 conditions on every load. You see which clients need attention today — before the deadline, not after.'],
            ].map(([num, title, body]) => (
              <div key={num} style={{ position: 'relative' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a56db', background: '#eff6ff', display: 'inline-block', padding: '4px 12px', borderRadius: 100, marginBottom: 18 }}>{num}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>{title}</h3>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.75 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a56db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>What's inside</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: '#0f172a', fontWeight: 400 }}>Everything your firm needs</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
            {[
              { icon: '🇨🇦', title: 'CRA deadlines built in', body: 'GST/HST monthly, quarterly, annual. T1, T2, Payroll. Every deadline calculated automatically from your client\'s filing frequency. No calendar setup. No spreadsheets.' },
              { icon: '🔴', title: 'At Risk engine', body: 'Five conditions computed in real time: timeline breach, deadline proximity, document blocker, stage stall, penalty history. You see what needs attention before it becomes a problem.' },
              { icon: '🚫', title: 'Stage gate enforcement', body: 'Stage 3 is locked until every document is received — server-side. No workarounds. Your team cannot skip steps, even by accident.' },
              { icon: '💬', title: 'Client portal', body: 'Business owners log in to upload documents, check filing status, message their accountant, and pay invoices. Each client gets their own permanent account.' },
              { icon: '🔗', title: 'QuickBooks integration', body: 'Connect a client\'s QBO account. When reconciliation is complete, Stage 1 advances automatically. No manual clicks. The bookkeeping done signal flows directly into your workflow.' },
              { icon: '🧾', title: 'Per-job invoicing', body: 'Set a billing rate per filing type. Send a Stripe invoice from any workflow with one click, or turn on auto-invoice at Stage 6 completion. Billing rates live in Settings.' },
              { icon: '⏱', title: 'Time tracking', body: 'Start a timer from any client workflow. Stop it when you\'re done. Log manual entries for time tracked elsewhere. Total billable hours per workflow, always visible.' },
              { icon: '👥', title: 'Team roles', body: 'Owner, senior accountant, accountant. Stage 4 review requires a senior or owner — the gate enforces this automatically. Every action is logged in the activity feed.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ display: 'flex', gap: 18, padding: '24px', border: '1px solid #f0f0f0', borderRadius: 14, background: '#fff' }}>
                <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{icon}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>{title}</h3>
                  <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section style={{ background: '#f8faff', borderTop: '1px solid #eef2ff', borderBottom: '1px solid #eef2ff', padding: '96px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a56db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Why AcctOS</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: '#0f172a', fontWeight: 400 }}>Built for Canada, priced for Canada</h2>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8faff' }}>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 500, color: '#64748b', borderBottom: '1px solid #f0f0f0' }}>Feature</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 500, color: '#64748b', borderBottom: '1px solid #f0f0f0' }}>TaxDome</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 500, color: '#64748b', borderBottom: '1px solid #f0f0f0' }}>Uku</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: '#1a56db', borderBottom: '1px solid #f0f0f0', background: '#eff6ff' }}>AcctOS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['CRA-native deadlines', '⚙️ Manual setup', '⚙️ Manual setup', '✅ Built in'],
                  ['At Risk engine', '❌ None', '❌ None', '✅ 5 conditions'],
                  ['Stage gate enforcement', '❌ None', '❌ None', '✅ Server-side'],
                  ['Corp vs sole prop branching', '❌ No', '❌ No', '✅ Automatic'],
                  ['Flat firm pricing (CAD)', '❌ Per user USD', '❌ Per user EUR', '✅ Flat CAD'],
                  ['Client portal', '✅ Best in class', '⚙️ Basic', '✅ Full portal'],
                  ['QBO integration', '✅ Yes', '✅ Yes', '✅ Auto-advance'],
                  ['Time tracking + invoicing', '✅ Yes', '✅ Yes', '✅ Yes'],
                ].map(([feature, td, uku, us], i) => (
                  <tr key={feature} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 20px', color: '#334155', borderBottom: '1px solid #f5f5f5' }}>{feature}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #f5f5f5' }}>{td}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #f5f5f5' }}>{uku}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 500, color: '#1a56db', borderBottom: '1px solid #f5f5f5', background: '#f5f9ff' }}>{us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#1a56db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Pricing</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: '#0f172a', fontWeight: 400 }}>Flat pricing. No surprises.</h2>
            <p style={{ fontSize: 16, color: '#64748b', marginTop: 12 }}>One avoided CRA penalty covers roughly a month of the Growth plan.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'Starter', price: '$49', clients: 'Up to 50 clients', users: '2 users', featured: false },
              { name: 'Growth', price: '$149', clients: 'Up to 150 clients', users: '5 users', featured: true },
              { name: 'Scale', price: '$299', clients: 'Unlimited clients', users: 'Unlimited users', featured: false },
            ].map(({ name, price, clients, users, featured }) => (
              <div key={name} style={{
                border: featured ? '2px solid #1a56db' : '1px solid #e2e8f0',
                borderRadius: 16, padding: '32px 28px',
                background: featured ? '#eff6ff' : '#fff',
                position: 'relative'
              }}>
                {featured && (
                  <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                    Most popular
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 600, color: '#0f172a' }}>{price}</span>
                  <span style={{ fontSize: 14, color: '#64748b' }}>CAD / month</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>Flat per firm — no per-user fees</div>
                <div style={{ fontSize: 14, color: '#334155', marginBottom: 8 }}>✓ {clients}</div>
                <div style={{ fontSize: 14, color: '#334155', marginBottom: 28 }}>✓ {users}</div>
                <a href="/signup" className={featured ? 'btn-primary' : 'btn-outline'} style={{ width: '100%', justifyContent: 'center', fontSize: 14 }}>
                  Start free trial
                </a>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: '#94a3b8' }}>
            All plans include every feature. No feature gates by tier.
          </p>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ background: '#0f172a', padding: '80px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: '#fff', fontWeight: 400, marginBottom: 18 }}>
            Ready to run a tighter firm?
          </h2>
          <p style={{ fontSize: 17, color: '#94a3b8', marginBottom: 40, lineHeight: 1.7 }}>
            14-day free trial. Set up in under an hour. No training required.
          </p>
          <a href="/signup" className="btn-primary" style={{ fontSize: 16, padding: '15px 36px', background: '#1a56db' }}>
            Start free trial →
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #f0f0f0', padding: '40px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: '#1a56db', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>A</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>AcctOS</span>
            <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 8 }}>Built for Canadian accounting firms</span>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <a href="/login" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>Sign in</a>
            <a href="/signup" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>Sign up</a>
            <a href="mailto:hello@acctos.ca" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>Contact</a>
          </div>
        </div>
      </footer>

    </main>
  )
}
