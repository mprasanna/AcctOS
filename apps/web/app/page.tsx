import type { Metadata } from "next";
import React from "react";
import PhaseTabs from "@/components/landing/PhaseTabs";

export const metadata: Metadata = {
  title: "AcctOS — Canadian Accounting Operations",
  description:
    "The workflow intelligence platform built specifically for Canadian accounting firms. CRA deadlines native. 5-condition risk engine. Gate enforcement that prevents errors before they become penalties.",
  openGraph: {
    title: "AcctOS — We Don't Track Work. We Predict Risk.",
    description:
      "Phases 0–4 production-ready. GST/HST workflows, multi-user roles, automated reminders, QuickBooks integration, client portal. Built for Ontario accounting firms.",
    siteName: "AcctOS",
  },
};

// ─── Inline style helpers (avoids extra CSS files) ───────────────────────────
const S = {
  // Layout
  page: {
    background: "#0D1B2A",
    color: "#fff",
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
    minHeight: "100vh",
    overflowX: "hidden" as const,
  },
  container: { maxWidth: 1200, margin: "0 auto", padding: "0 40px" },

  // Nav
  nav: {
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    background: "rgba(13,27,42,0.92)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "0 40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 58,
  },
  navLogo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: {
    width: 32, height: 32, background: "#0D9488", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
  },
  logoText: { fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: "#fff" },
  navLinks: { display: "flex", gap: 28, alignItems: "center" },
  navLink: { color: "#94A3B8", textDecoration: "none", fontSize: 13, fontWeight: 500 },
  navCta: {
    background: "#0D9488", color: "#fff", border: "none",
    padding: "8px 18px", borderRadius: 8,
    fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
} as const;

function LogoMark() {
  return (
    <div style={S.logoMark as React.CSSProperties}>A</div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 22 }}>
      <div style={{ width: 36, height: 36, background: "rgba(13,148,136,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 16 }}>
        {icon}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────
const COMP_ROWS = [
  ["CRA deadlines native",          "Manual setup",   "Generic",         true],
  ["5-condition At Risk algorithm",  "Simple overdue", "Basic flag",      true],
  ["Gate enforcement with reasons",  "—",              "—",               true],
  ["Corp vs sole prop branching",    "—",              "—",               true],
  ["Automated document reminders",   "Manual",         "Basic",           true],
  ["QuickBooks Online integration",  "Add-on",         "Limited",         true],
  ["Client upload portal",           "Paid add-on",    "Yes",             true],
  ["Pricing (Ontario firms)",        "$49+ USD/user",  "$99+ USD/user",   true],
  ["Setup time",                     "Days",           "Hours",           true],
] as const;

export default function HomePage() {
  return (
    <>
      {/* ── Google Fonts ────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #0D1B2A; }
        a { color: inherit; }
        button { font-family: 'DM Sans', system-ui, sans-serif; }
        .nav-link:hover { color: #fff !important; }
        .demo-btn:hover { border-color: #0D9488 !important; color: #5EEAD4 !important; }
        .btn-primary:hover { background: #14B8A6 !important; }
        .btn-outline:hover { border-color: #0D9488 !important; color: #5EEAD4 !important; }
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .phases-grid { grid-template-columns: 1fr !important; }
          .features-grid { grid-template-columns: 1fr 1fr !important; }
          .hide-mobile { display: none !important; }
        }
        @media (max-width: 600px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .container-pad { padding: 0 20px !important; }
        }
      `}</style>

      <div style={S.page}>

        {/* ══ NAV ══════════════════════════════════════════════════════════ */}
        <nav style={S.nav}>
          <div style={S.navLogo}>
            <LogoMark />
            <span style={S.logoText}>AcctOS</span>
          </div>
          <div className="hide-mobile" style={S.navLinks}>
            <a href="#phases" className="nav-link" style={S.navLink}>Features</a>
            <a href="#compare" className="nav-link" style={S.navLink}>Compare</a>
            <a href="#pricing" className="nav-link" style={S.navLink}>Pricing</a>
          </div>
          <a href="/login">
            <button style={S.navCta}>Sign in →</button>
          </a>
        </nav>

        {/* ══ HERO ═════════════════════════════════════════════════════════ */}
        <div className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 40px 60px" }}>
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 60, alignItems: "center" }}>
            {/* Left */}
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(13,148,136,0.15)", border: "1px solid rgba(13,148,136,0.35)", borderRadius: 20, padding: "5px 14px", fontSize: 12, color: "#5EEAD4", fontWeight: 600, marginBottom: 22, letterSpacing: ".04em" }}>
                <div style={{ width: 7, height: 7, background: "#14B8A6", borderRadius: "50%" }} />
                Phases 0–4 Production Ready
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.08, fontWeight: 900, marginBottom: 20 }}>
                We Don&apos;t Track Work.<br />
                <span style={{ color: "#14B8A6" }}>We Predict Risk.</span>
              </h1>
              <p style={{ color: "#94A3B8", fontSize: 16, lineHeight: 1.7, maxWidth: 480, marginBottom: 32 }}>
                The workflow intelligence platform built specifically for Canadian accounting firms. CRA deadlines native. 5-condition risk engine. Gate enforcement that prevents errors before they become penalties.
              </p>
              <div style={{ display: "flex", gap: 32 }}>
                {[["6", "Workflow templates"], ["5", "Risk conditions"], ["14", "DB migrations"], ["98%", "Infra margin"]].map(([num, label]) => (
                  <div key={label} style={{ borderLeft: "2px solid #0D9488", paddingLeft: 14 }}>
                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 700 }}>{num}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Login card */}
            <div style={{ background: "#112236", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 32, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Welcome back</div>
              <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 24 }}>Sign in to Jensen &amp; Associates CPA</div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Work email</label>
                <input
                  type="email"
                  placeholder="patrick@jensenaccounting.ca"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" }}
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••••"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" }}
                />
              </div>
              <a href="/login">
                <button className="btn-primary" style={{ width: "100%", background: "#0D9488", border: "none", borderRadius: 8, padding: 12, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, transition: "background .2s" }}>
                  Sign in to AcctOS
                </button>
              </a>
              <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 12, margin: "16px 0", position: "relative" }}>
                <span style={{ background: "#112236", padding: "0 10px", position: "relative", zIndex: 1 }}>or</span>
                <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(255,255,255,0.1)" }} />
              </div>
              <button className="demo-btn" style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 11, color: "#94A3B8", fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .2s" }}>
                Request a 30-minute demo
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: "#64748B", marginTop: 14 }}>
                No account? <a href="/signup" style={{ color: "#5EEAD4", textDecoration: "none" }}>Start your free 60-day pilot →</a>
              </div>
            </div>
          </div>
        </div>

        {/* ══ PHASES ═══════════════════════════════════════════════════════ */}
        <div id="phases" style={{ background: "#112236", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "72px 0" }}>
          <div className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#14B8A6", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Four phases. One platform.</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 14 }}>
              Everything a Canadian accounting firm needs
            </h2>
            <p style={{ color: "#94A3B8", fontSize: 15, lineHeight: 1.7, maxWidth: 580, marginBottom: 48 }}>
              Built phase by phase so complexity only arrives when users demand it. All four phases are production-ready today.
            </p>
            {/* Interactive phase tabs — client component */}
            <PhaseTabs />
          </div>
        </div>

        {/* ══ FEATURES GRID ════════════════════════════════════════════════ */}
        <div className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 40px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#14B8A6", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Built for Canada</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 48 }}>
            Every rule the CRA expects,<br />built into the engine
          </h2>
          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            <FeatCard icon="📅" title="CRA deadlines native" desc="Monthly, quarterly, and annual CRA deadlines built in. Ontario timezone. Monthly filers: last day of following month. Quarterly: last day of month after quarter-end." />
            <FeatCard icon="🔒" title="Gate enforcement" desc="Stage 3 cannot begin until all documents are received. Filing is blocked until review is approved. Hard stops with specific reasons — database-level prevention, not just visual warnings." />
            <FeatCard icon="⚡" title="5-condition risk engine" desc="C1 timeline breach · C2 deadline proximity · C3 document blocker · C4 stage stall · C5 risk history. Evaluated per workflow. Status computed dynamically — never stored, never stale." />
            <FeatCard icon="🏢" title="Corp vs sole prop branching" desc="Corporation: ITC reconciliation added to Stage 3. Dual review gate if GST > $10,000. Sole proprietor: simplified checklist, revenue threshold check, no ITCs required." />
            <FeatCard icon="📧" title="Automated escalation" desc="Document requests go out automatically. Day 3: Reminder #1. Day 6: Reminder #2 + owner escalation. Deadline < 5 days: urgent alert. Full email log per client, per filing." />
            <FeatCard icon="🛡️" title="Row Level Security" desc="Every database query scoped to firm_id at the Postgres level via Supabase RLS. A bug in application code cannot leak data between firms. PIPEDA-compliant. Data in ca-central-1." />
          </div>
        </div>

        {/* ══ COMPARISON ═══════════════════════════════════════════════════ */}
        <div id="compare" className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px 72px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#14B8A6", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Why AcctOS</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 32 }}>
            Built for Canada. Not adapted.
          </h2>
          <div style={{ background: "#112236", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Feature", "Uku", "TaxDome", "AcctOS"].map((h, i) => (
                    <th key={h} style={{ padding: "14px 20px", textAlign: i === 0 ? "left" : "center", fontSize: 12, fontWeight: 600, color: i === 3 ? "#fff" : "#94A3B8", background: i === 3 ? "rgba(13,148,136,0.12)" : "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMP_ROWS.map(([feat, uku, taxdome], i) => (
                  <tr key={feat} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "12px 20px", fontSize: 13, color: "#fff", fontWeight: 500 }}>{feat}</td>
                    <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748B", textAlign: "center" }}>{uku}</td>
                    <td style={{ padding: "12px 20px", fontSize: 13, color: "#64748B", textAlign: "center" }}>{taxdome}</td>
                    <td style={{ padding: "12px 20px", fontSize: 13, color: "#22C55E", fontWeight: 600, textAlign: "center", background: "rgba(13,148,136,0.06)" }}>✓ Yes</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ PRICING ══════════════════════════════════════════════════════ */}
        <div id="pricing" className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px 72px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#14B8A6", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 14 }}>
            Flat CAD. Per firm. No per-user nonsense.
          </h2>
          <p style={{ color: "#94A3B8", fontSize: 15, lineHeight: 1.7, maxWidth: 520, marginBottom: 40 }}>
            One avoided CRA penalty covers roughly a month of the Growth plan. That&apos;s the math.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { name: "Starter", price: "$49", clients: "50 clients", users: "2 users", rec: false },
              { name: "Growth", price: "$149", clients: "150 clients", users: "5 users", rec: true },
              { name: "Scale", price: "$299", clients: "Unlimited", users: "Unlimited", rec: false },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.rec ? "rgba(13,148,136,0.1)" : "#112236", border: plan.rec ? "2px solid rgba(13,148,136,0.5)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 26 }}>
                {plan.rec && <div style={{ display: "inline-block", background: "rgba(13,148,136,0.2)", color: "#5EEAD4", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, marginBottom: 12, letterSpacing: ".04em" }}>★ Recommended</div>}
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#fff" }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                  <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 40, fontWeight: 700, color: plan.rec ? "#14B8A6" : "#fff" }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>/mo CAD</span>
                </div>
                <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 4 }}>{plan.clients}</div>
                <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>{plan.users}</div>
                <a href="/signup">
                  <button className="btn-primary" style={{ width: "100%", background: plan.rec ? "#0D9488" : "transparent", border: plan.rec ? "none" : "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "11px 0", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background .2s" }}>
                    {plan.rec ? "Start free pilot →" : "Get started"}
                  </button>
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* ══ CTA ══════════════════════════════════════════════════════════ */}
        <div className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px 72px" }}>
          <div style={{ background: "linear-gradient(135deg, rgba(13,148,136,.15), rgba(20,184,166,.08))", border: "1px solid rgba(13,148,136,.25)", borderRadius: 20, padding: "56px 40px", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(13,148,136,0.15)", border: "1px solid rgba(13,148,136,0.3)", borderRadius: 20, padding: "5px 14px", fontSize: 12, color: "#5EEAD4", fontWeight: 600, marginBottom: 20, letterSpacing: ".04em" }}>
              Phases 0–4 production-ready
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700, marginBottom: 14, lineHeight: 1.2 }}>
              The product is built.<br />Let&apos;s get your firm live.
            </h2>
            <p style={{ color: "#94A3B8", fontSize: 15, marginBottom: 32 }}>
              60-day pilot, no credit card. Your real clients, your workflows, your deadlines. Live in an afternoon.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
              <a href="/signup">
                <button className="btn-primary" style={{ background: "#0D9488", border: "none", padding: "13px 28px", borderRadius: 10, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background .2s" }}>
                  Start free 60-day pilot →
                </button>
              </a>
              <a href="/demo">
                <button className="btn-outline" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", padding: "12px 28px", borderRadius: 10, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all .2s" }}>
                  Book a 30-minute demo
                </button>
              </a>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
              {["No credit card required", "Canadian data residency (ca-central-1)", "PIPEDA compliant", "Cancel any time"].map(t => (
                <div key={t} style={{ fontSize: 12, color: "#64748B" }}>✓ {t}</div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="container-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, background: "#0D9488", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Georgia, serif", fontWeight: 700, color: "#fff" }}>A</div>
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>AcctOS</span>
              <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>Canadian Accounting Operations</span>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {["Privacy", "Terms", "Security", "API Docs"].map(link => (
                <a key={link} href={`/${link.toLowerCase().replace(" ", "-")}`} style={{ fontSize: 12, color: "#64748B", textDecoration: "none" }}>{link}</a>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>© 2025 AcctOS · Vercel + Supabase · Ontario, Canada</div>
          </div>
        </div>

      </div>
    </>
  );
}
