import type { Metadata } from "next";
import React from "react";
import PhaseTabs from "@/components/landing/PhaseTabs";

export const metadata: Metadata = {
  title: "AcctOS — Workflow Intelligence for Canadian Accounting Firms",
  description: "CRA deadlines native. 5-condition risk engine. Gate enforcement that prevents errors before they become penalties.",
};

const S: Record<string, React.CSSProperties> = {
  page:       { fontFamily: "'DM Sans', system-ui, sans-serif", background: "#080C14", color: "#F1F5F9", minHeight: "100vh" },
  nav:        { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", borderBottom: "1px solid #1E293B", position: "sticky", top: 0, background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)", zIndex: 100 },
  logoMark:   { width: 32, height: 32, borderRadius: 8, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "white" },
  logoText:   { fontSize: 18, fontWeight: 700, color: "#F1F5F9", marginLeft: 10 },
  navLinks:   { display: "flex", gap: 32, listStyle: "none", margin: 0, padding: 0 },
  navLink:    { fontSize: 14, color: "#64748B", textDecoration: "none", cursor: "pointer" },
  navCta:     { background: "#2563EB", color: "white", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  hero:       { maxWidth: 1200, margin: "0 auto", padding: "80px 48px 60px", display: "grid", gridTemplateColumns: "1fr 420px", gap: 64, alignItems: "center" },
  badge:      { display: "inline-flex", alignItems: "center", gap: 8, background: "#0F1729", border: "1px solid #1E3A5F", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#38BDF8", fontWeight: 600, marginBottom: 24 },
  badgeDot:   { width: 6, height: 6, borderRadius: "50%", background: "#38BDF8" },
  h1:         { fontSize: 52, fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px", color: "#F1F5F9", letterSpacing: "-0.02em" },
  h1accent:   { color: "#2563EB" },
  heroSub:    { fontSize: 16, color: "#64748B", lineHeight: 1.7, margin: "0 0 36px", maxWidth: 520 },
  statsRow:   { display: "flex", gap: 36 },
  statNum:    { fontSize: 28, fontWeight: 800, color: "#F1F5F9" },
  statLabel:  { fontSize: 12, color: "#475569", marginTop: 2 },
  loginCard:  { background: "#0F1117", border: "1px solid #1E293B", borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" },
  loginTitle: { fontSize: 20, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 },
  loginSub:   { fontSize: 13, color: "#475569", marginBottom: 28 },
  label:      { fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 },
  input:      { width: "100%", padding: "10px 14px", background: "#080C14", border: "1px solid #1E293B", borderRadius: 8, fontSize: 14, color: "#F1F5F9", outline: "none", boxSizing: "border-box" as const },
  loginBtn:   { width: "100%", padding: "12px", background: "#2563EB", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 20 },
  divider:    { textAlign: "center" as const, color: "#334155", fontSize: 12, margin: "16px 0", position: "relative" as const },
  demoBtn:    { width: "100%", padding: "11px", background: "transparent", color: "#94A3B8", border: "1px solid #1E293B", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  loginNote:  { fontSize: 12, color: "#475569", textAlign: "center" as const, marginTop: 16 },
  section:    { maxWidth: 1200, margin: "0 auto", padding: "80px 48px" },
  sectionLbl: { fontSize: 12, fontWeight: 700, color: "#2563EB", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 },
  sectionH2:  { fontSize: 36, fontWeight: 800, color: "#F1F5F9", margin: "0 0 12px", letterSpacing: "-0.02em" },
  sectionSub: { fontSize: 15, color: "#64748B", margin: "0 0 56px", lineHeight: 1.7 },
  dividerLine:{ borderTop: "1px solid #1E293B", margin: "0 48px" },
  pricingGrid:{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 },
  planCard:   { background: "#0F1117", border: "1px solid #1E293B", borderRadius: 16, padding: "32px 28px" },
  planCardH:  { background: "#0F1729", border: "1px solid #1E3A5F", borderRadius: 16, padding: "32px 28px" },
  planName:   { fontSize: 14, fontWeight: 700, color: "#64748B", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 16 },
  planPrice:  { fontSize: 40, fontWeight: 800, color: "#F1F5F9", lineHeight: 1 },
  planPer:    { fontSize: 13, color: "#475569", marginTop: 4, marginBottom: 24 },
  planAnnual: { fontSize: 12, color: "#4ADE80", marginBottom: 28 },
  planFeats:  { display: "flex", flexDirection: "column" as const, gap: 10 },
  planFeat:   { fontSize: 13, color: "#94A3B8", display: "flex", gap: 8, alignItems: "flex-start" },
  planBtn:    { width: "100%", padding: "11px", background: "transparent", color: "#94A3B8", border: "1px solid #1E293B", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 28 },
  planBtnH:   { width: "100%", padding: "11px", background: "#2563EB", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 28 },
  table:      { width: "100%", borderCollapse: "collapse" as const },
  th:         { padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.06em", textAlign: "left" as const, borderBottom: "1px solid #1E293B" },
  thUs:       { padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#38BDF8", textTransform: "uppercase" as const, letterSpacing: "0.06em", textAlign: "left" as const, borderBottom: "1px solid #1E3A5F", background: "#0F1729" },
  td:         { padding: "11px 16px", fontSize: 13, color: "#64748B", borderBottom: "1px solid #0F1117" },
  tdUs:       { padding: "11px 16px", fontSize: 13, color: "#94A3B8", borderBottom: "1px solid #0F1117", background: "#0C1120" },
  tdFeat:     { padding: "11px 16px", fontSize: 13, color: "#94A3B8", borderBottom: "1px solid #0F1117", fontWeight: 500 },
  ctaSection: { background: "#0F1729", borderTop: "1px solid #1E3A5F", borderBottom: "1px solid #1E3A5F", padding: "80px 48px", textAlign: "center" as const },
  footer:     { padding: "32px 48px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" },
};

const COMPARE = [
  { feature: "Canada-native CRA deadlines",    uku: "❌ Manual",     tax: "❌ Templates",  us: "✅ Built in — GST, T1, T2, Payroll" },
  { feature: "At Risk prediction engine",       uku: "❌ None",       tax: "❌ None",        us: "✅ 5-condition, per workflow, real-time" },
  { feature: "Stage gate enforcement",          uku: "❌ None",       tax: "❌ None",        us: "✅ Server-side hard stops with reasons" },
  { feature: "Corp vs sole prop branching",     uku: "❌ No",         tax: "❌ No",          us: "✅ ITC, dual review, simplified checklist" },
  { feature: "Client portal for doc upload",    uku: "❌ Email only", tax: "✅ Full portal", us: "✅ Token-gated, no login needed" },
  { feature: "QBO / Zoho integration",          uku: "✅ QBO, Xero",  tax: "✅ QBO only",    us: "✅ QBO + Zoho — auto-advances Stage 1" },
  { feature: "Time tracking",                   uku: "✅ Full",       tax: "✅ Full",        us: "✅ Start/stop timer + manual log" },
  { feature: "Per-job invoicing",               uku: "✅ Yes",        tax: "✅ Yes",         us: "✅ Stripe invoice per workflow" },
  { feature: "Flat firm pricing (CAD)",         uku: "❌ Per user",   tax: "❌ Per user",    us: "✅ Only platform with flat CAD pricing" },
  { feature: "Setup time",                      uku: "Hours",         tax: "Days",          us: "✅ Minutes — add client, template applied" },
];

export default function LandingPage() {
  return (
    <div style={S.page}>
      {/* NAV */}
      <nav style={S.nav}>
        <div style={{display:"flex",alignItems:"center"}}>
          <div style={S.logoMark}>A</div>
          <span style={S.logoText}>AcctOS</span>
        </div>
        <ul style={S.navLinks}>
          <li><a href="#phases" style={S.navLink}>Features</a></li>
          <li><a href="#pricing" style={S.navLink}>Pricing</a></li>
          <li><a href="#compare" style={S.navLink}>Compare</a></li>
        </ul>
        <a href="/login"><button style={S.navCta}>Sign in →</button></a>
      </nav>

      {/* HERO */}
      <div style={S.hero}>
        <div>
          <div style={S.badge}>
            <div style={S.badgeDot}/>
            Phases 0–4 Production Ready · acct-os.vercel.app
          </div>
          <h1 style={S.h1}>
            We Don&apos;t Track Work.<br/>
            <span style={S.h1accent}>We Predict Risk.</span>
          </h1>
          <p style={S.heroSub}>
            The workflow intelligence platform built for Canadian accounting firms.
            CRA deadlines native. 5-condition At Risk engine. Gate enforcement that
            catches errors before they become CRA penalties.
          </p>
          <div style={S.statsRow}>
            {[["42","API routes"],["24","DB tables"],["5","Risk conditions"],["$0","Infra to start"]].map(([n,l],i)=>(
              <div key={i}>
                <div style={S.statNum}>{n}</div>
                <div style={S.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LOGIN CARD */}
        <div style={S.loginCard}>
          <div style={S.loginTitle}>Welcome back</div>
          <div style={S.loginSub}>Sign in to your firm</div>
          <div style={{marginBottom:16}}>
            <label style={S.label}>Work email</label>
            <input style={S.input} type="email" placeholder="you@yourfirm.ca" readOnly/>
          </div>
          <div>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" placeholder="••••••••••" readOnly/>
          </div>
          <a href="/login"><button style={S.loginBtn}>Sign in to AcctOS →</button></a>
          <div style={S.divider}>or</div>
          <button style={S.demoBtn}>Request a 30-minute demo</button>
          <div style={S.loginNote}>
            One prevented CRA penalty covers a month of Growth plan.
          </div>
        </div>
      </div>

      <div style={S.dividerLine}/>

      {/* PHASES */}
      <div style={S.section} id="phases">
        <div style={S.sectionLbl}>Four phases. One platform.</div>
        <h2 style={S.sectionH2}>Everything a Canadian firm needs</h2>
        <p style={S.sectionSub}>Built phase by phase — complexity only arrives when your firm demands it.</p>
        <PhaseTabs />
      </div>

      <div style={S.dividerLine}/>

      {/* PRICING */}
      <div style={S.section} id="pricing">
        <div style={S.sectionLbl}>Pricing</div>
        <h2 style={S.sectionH2}>Flat CAD firm pricing. No per-user fees.</h2>
        <p style={S.sectionSub}>A 5-person firm on AcctOS Growth saves $350+/month vs TaxDome Pro. One avoided CRA penalty covers the Growth plan for a month.</p>
        <div style={S.pricingGrid}>
          {[
            {
              name:"Starter", price:"$49", annual:"$39/mo billed annually ($468/yr)",
              highlight:false,
              feats:["Up to 10 clients","GST/HST workflows","CRA deadline tracking","At Risk engine","Document collection","Email reminders"],
            },
            {
              name:"Growth", price:"$149", annual:"$119/mo billed annually ($1,428/yr)",
              highlight:true,
              feats:["Up to 50 clients","All workflow templates","T1, T2, Payroll, Bookkeeping","QBO + Zoho integration","Client portal","Time tracking + invoicing"],
            },
            {
              name:"Scale", price:"$299", annual:"$239/mo billed annually ($2,868/yr)",
              highlight:false,
              feats:["Unlimited clients","Everything in Growth","Priority support","Custom automation rules","Advanced reporting","Early access to AI features"],
            },
          ].map((plan,i)=>(
            <div key={i} style={plan.highlight ? S.planCardH : S.planCard}>
              {plan.highlight && <div style={{fontSize:11,fontWeight:700,color:"#38BDF8",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Most Popular</div>}
              <div style={S.planName}>{plan.name}</div>
              <div style={S.planPrice}>{plan.price}<span style={{fontSize:16,fontWeight:400,color:"#475569"}}>/mo</span></div>
              <div style={S.planPer}>per firm · CAD · no per-user fees</div>
              <div style={S.planAnnual}>↓ {plan.annual}</div>
              <div style={S.planFeats}>
                {plan.feats.map((f,j)=>(
                  <div key={j} style={S.planFeat}>
                    <span style={{color:"#2563EB",flexShrink:0}}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <button style={plan.highlight ? S.planBtnH : S.planBtn}>
                {plan.highlight ? "Start free pilot →" : "Get started"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={S.dividerLine}/>

      {/* COMPARE */}
      <div style={S.section} id="compare">
        <div style={S.sectionLbl}>Comparison</div>
        <h2 style={S.sectionH2}>AcctOS vs Uku vs TaxDome</h2>
        <p style={S.sectionSub}>Both competitors charge per user in USD. AcctOS is flat CAD per firm.</p>
        <div style={{border:"1px solid #1E293B",borderRadius:12,overflow:"hidden"}}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Feature</th>
                <th style={S.th}>Uku</th>
                <th style={S.th}>TaxDome</th>
                <th style={S.thUs}>AcctOS</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row,i)=>(
                <tr key={i} style={{background: i%2===0 ? "transparent" : "#0A0E18"}}>
                  <td style={S.tdFeat}>{row.feature}</td>
                  <td style={S.td}>{row.uku}</td>
                  <td style={S.td}>{row.tax}</td>
                  <td style={S.tdUs}>{row.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={S.dividerLine}/>

      {/* CTA */}
      <div style={S.ctaSection}>
        <div style={{fontSize:12,fontWeight:700,color:"#2563EB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16}}>Free pilot</div>
        <h2 style={{fontSize:36,fontWeight:800,color:"#F1F5F9",margin:"0 0 16px",letterSpacing:"-0.02em"}}>The product is built. Let&apos;s get your firm live.</h2>
        <p style={{fontSize:15,color:"#64748B",margin:"0 0 36px",maxWidth:520,marginLeft:"auto",marginRight:"auto"}}>
          60-day free pilot. Your real clients. Your real deadlines. Cancel anytime.
          Most firms are fully set up in under an afternoon.
        </p>
        <div style={{display:"flex",gap:16,justifyContent:"center"}}>
          <a href="/login"><button style={{...S.navCta,padding:"14px 32px",fontSize:15}}>Start free pilot →</button></a>
          <button style={{padding:"14px 32px",fontSize:15,background:"transparent",color:"#94A3B8",border:"1px solid #1E293B",borderRadius:8,cursor:"pointer"}}>Book a demo</button>
        </div>
        <div style={{marginTop:32,display:"flex",gap:32,justifyContent:"center",fontSize:12,color:"#334155"}}>
          {["No credit card required","Canadian data residency","Cancel anytime","Setup in an afternoon"].map((t,i)=>(
            <span key={i}>✓ {t}</span>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer style={S.footer}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={S.logoMark}>A</div>
          <span style={{fontSize:14,color:"#475569"}}>AcctOS · Built for Canadian accounting firms</span>
        </div>
        <div style={{fontSize:12,color:"#334155"}}>
          © 2026 AcctOS · acct-os.vercel.app
        </div>
      </footer>
    </div>
  );
}
