"use client";

import { useState } from "react";

const PHASES = [
  {
    tab: "Phase 1 — MVP",
    badge: "✓ Live · Supabase + Next.js",
    title: "Real backend. Real data. Real risk engine.",
    desc:
      "Phase 1 replaces the demo prototype with a production Supabase database. The 5-condition risk algorithm runs server-side. Every stage transition is gate-validated. Clients are real, workflows are persistent, and the CRA deadline clock never stops.",
    features: [
      {
        strong: "Supabase PostgreSQL backend",
        text: " — 14 migration files, full schema for firms, clients, workflows, stages, tasks, documents and events",
      },
      {
        strong: "5-condition At Risk engine",
        text: " — C1 timeline breach, C2 deadline proximity, C3 document blocker, C4 stage stall, C5 risk history — per workflow, not per client",
      },
      {
        strong: "Gate-enforced stage transitions",
        text: " — Stage 3 hard-blocked until all docs received. Filing blocked until review approved. Hard stops with specific reasons.",
      },
      {
        strong: "REST API",
        text: " — complete endpoints for clients, workflows, stages, tasks, documents, dashboard and settings",
      },
      {
        strong: "CRA deadlines native",
        text: " — monthly, quarterly, annual filers. Ontario timezone. No manual configuration.",
      },
    ],
    url: "app.acctos.com/dashboard",
    screen: "dashboard",
  },
  {
    tab: "Phase 2 — Multi-user",
    badge: "✓ Live · Supabase Auth + RLS",
    title: "Multi-user roles. File uploads. T1 & T2 templates.",
    desc:
      "Phase 2 turns AcctOS into a real team tool. Supabase Auth with Row Level Security isolates every firm's data at the database level. Four user roles with distinct permissions. Stage auto-advance when tasks complete.",
    features: [
      {
        strong: "4 user roles",
        text: " — Owner (full access + escalations), Senior Accountant (dual review approval), Accountant (assigned clients), Admin (documents + comms)",
      },
      {
        strong: "Row Level Security",
        text: " — every query scoped to firm_id at the Postgres level. A bug in application code cannot leak data between firms.",
      },
      {
        strong: "Auto-advance stages",
        text: " — when all tasks in a stage are complete and the gate condition passes, the workflow advances automatically",
      },
      {
        strong: "File uploads",
        text: " — clients upload directly to Supabase Storage. Document checklist auto-updates. Stage 2 gate unlocks on receipt.",
      },
      {
        strong: "T1, T2 & Bookkeeping templates",
        text: " — same engine, new configurations. T1 for personal returns, T2 for corporate, monthly bookkeeping cycle.",
      },
    ],
    url: "app.acctos.com/clients/sunrise-bakery",
    screen: "workflow",
  },
  {
    tab: "Phase 3 — Automation",
    badge: "✓ Live · Resend + pg_cron + R2",
    title: "Automated reminders. Smart rules. R2 file storage.",
    desc:
      "Phase 3 makes AcctOS sticky. Transactional email sequences run automatically — Day 3 reminder, Day 6 escalation, deadline alerts. Automation rules engine fires background jobs via pg_cron. Cloudflare R2 replaces Supabase Storage for zero egress cost at scale.",
    features: [
      {
        strong: "Automated document reminder sequence",
        text: " — Day 3: Reminder #1 to client. Day 6: Reminder #2 + escalate to firm owner. Deadline < 5d: urgent alert.",
      },
      {
        strong: "5 automation rules",
        text: " — auto-create workflows, document reminders, escalation, deadline alerts, overdue flags — all configurable per firm",
      },
      {
        strong: "Cloudflare R2 storage",
        text: " — zero egress fees. 3-tier lifecycle: Standard (0–2yr) → Infrequent Access (2–4yr) → Archive (4–7yr, CRA requirement)",
      },
      {
        strong: "Dashboard intelligence",
        text: " — priority suggestions, GST anomaly detection (≥20% QoQ change), risk trend per client",
      },
      {
        strong: "pg_cron background jobs",
        text: " — runs inside Supabase Postgres. No external queue until 50+ firms justify complexity.",
      },
    ],
    url: "app.acctos.com/settings/automation",
    screen: "automation",
  },
  {
    tab: "Phase 4 — Integrations",
    badge: "✓ Live · QBO + Stripe + Client Portal",
    title: "QuickBooks sync. Client portal. Billing triggers.",
    desc:
      "Phase 4 plugs AcctOS into real firm workflows. When QuickBooks Online marks a period reconciled, Stage 1 advances automatically. Clients upload documents through a tokenised portal. Filing completion triggers a Stripe invoice.",
    features: [
      {
        strong: "QuickBooks Online OAuth",
        text: " — reconciliation webhook auto-advances Stage 1 gate. Zoho Books supported as alternative.",
      },
      {
        strong: "Client portal (no login required)",
        text: " — tokenised URL sent to client. They see pending docs, upload directly, and the checklist auto-updates in AcctOS.",
      },
      {
        strong: "Stripe billing",
        text: " — Starter $49/mo · Growth $149/mo · Scale $299/mo (all CAD, firm-flat). Stage 6 completion triggers invoice automatically.",
      },
      {
        strong: "Payroll Remittances template",
        text: " — monthly and bi-weekly cycles. CRA payroll deadlines built in. Same engine, new configuration.",
      },
      {
        strong: "Full webhook suite",
        text: " — QBO reconciliation events, Zoho Books events, Stripe subscription lifecycle, Resend delivery events.",
      },
    ],
    url: "app.acctos.com/settings/integrations",
    screen: "integrations",
  },
];

function ScreenDashboard() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, background: "#F8FAFC", height: 320, display: "flex", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 150, background: "#fff", borderRight: "1px solid #E2E8F0", padding: "10px 0", flexShrink: 0 }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, background: "#2563EB", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>A</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>AcctOS</span>
        </div>
        {[["⊞", "Command Centre", true], ["👥", "Clients", false], ["⚡", "Workflows", false], ["📅", "Deadlines", false], ["🗂", "Templates", false], ["⚙", "Settings", false]].map(([icon, label, active]) => (
          <div key={String(label)} style={{ padding: "6px 12px", fontSize: 11, color: active ? "#2563EB" : "#475569", background: active ? "#EFF6FF" : "transparent", fontWeight: active ? 600 : 400, margin: "1px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10 }}>{String(icon)}</span>{String(label)}
          </div>
        ))}
      </div>
      {/* Main */}
      <div style={{ flex: 1, padding: 16, overflow: "hidden" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>Command Centre</div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 10 }}>October 2025 · 6 active clients · Ontario (CRA timezone)</div>
        {/* Alert */}
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#DC2626", marginBottom: 6, display: "flex", gap: 6 }}>✕ 1 overdue — CRA deadline passed. File immediately.</div>
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#B45309", marginBottom: 10, display: "flex", gap: 6 }}>▲ 2 at risk — will miss deadline if nothing changes today.</div>
        {/* Tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
          {[["Active", "5", "#2563EB", "#EFF6FF"], ["On Track", "2", "#16A34A", "#DCFCE7"], ["At Risk", "2", "#F59E0B", "#FEF3C7"], ["Overdue", "1", "#DC2626", "#FEE2E2"]].map(([l, v, c, bg]) => (
            <div key={String(l)} style={{ background: String(bg), borderRadius: 8, padding: "8px 10px", border: `1px solid ${String(c)}33` }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: String(c), marginBottom: 2 }}>{String(l)}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: String(c), lineHeight: 1 }}>{String(v)}</div>
            </div>
          ))}
        </div>
        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Client", "Status", "Stage", "Deadline"].map(h => (
                <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: "#94A3B8", fontWeight: 600, fontSize: 9, textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Patel & Sons", city: "Mississauga, ON", badge: "Overdue", bc: "#DC2626", bb: "#FEE2E2", dots: ["#16A34A","#16A34A","#16A34A","#16A34A","#DC2626","#E2E8F0"], dl: "75d over", dc: "#DC2626" },
              { name: "Sunrise Bakery", city: "Ottawa, ON", badge: "At Risk", bc: "#F59E0B", bb: "#FEF3C7", dots: ["#16A34A","#DC2626","#E2E8F0","#E2E8F0","#E2E8F0","#E2E8F0"], dl: "17d", dc: "#F59E0B" },
              { name: "Maple Contracting", city: "Ottawa, ON", badge: "On Track", bc: "#16A34A", bb: "#DCFCE7", dots: ["#16A34A","#16A34A","#2563EB","#E2E8F0","#E2E8F0","#E2E8F0"], dl: "17d", dc: "#475569" },
            ].map(row => (
              <tr key={row.name} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "6px 8px" }}><div style={{ fontWeight: 600, color: "#0F172A" }}>{row.name}</div><div style={{ color: "#94A3B8", fontSize: 9 }}>{row.city}</div></td>
                <td style={{ padding: "6px 8px" }}><span style={{ background: row.bb, color: row.bc, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10 }}>{row.badge}</span></td>
                <td style={{ padding: "6px 8px" }}><div style={{ display: "flex", gap: 2 }}>{row.dots.map((c, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />)}</div></td>
                <td style={{ padding: "6px 8px", color: row.dc, fontWeight: 600 }}>{row.dl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScreenWorkflow() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, background: "#F8FAFC", height: 320, display: "flex", overflow: "hidden" }}>
      <div style={{ width: 150, background: "#fff", borderRight: "1px solid #E2E8F0", padding: "10px 0", flexShrink: 0 }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, background: "#2563EB", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>A</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>AcctOS</span>
        </div>
        <div style={{ padding: "0 8px 8px", borderBottom: "1px solid #E2E8F0", marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6, padding: "0 4px" }}>Team</div>
          {[["PW", "Patrick W.", "#DBEAFE", "#1D4ED8", "Owner"], ["KS", "Kiera S.", "#DCFCE7", "#15803D", "Senior"], ["JR", "James R.", "#FEF3C7", "#B45309", "Acct."], ["RH", "Reece H.", "#EDE9FE", "#6D28D9", "Admin"]].map(([init, name, bg, fg, role]) => (
            <div key={String(init)} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: String(bg), color: String(fg), fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{String(init)}</div>
              <div style={{ fontSize: 10, color: "#0F172A", flex: 1 }}>{String(name)}</div>
              <div style={{ fontSize: 8, background: "#F1F5F9", color: "#64748B", padding: "1px 5px", borderRadius: 4 }}>{String(role)}</div>
            </div>
          ))}
        </div>
        {[["📋", "Workflow", true], ["✓", "Tasks", false], ["📄", "Documents", false], ["📊", "Activity", false]].map(([icon, label, active]) => (
          <div key={String(label)} style={{ padding: "6px 12px", fontSize: 11, color: active ? "#2563EB" : "#475569", background: active ? "#EFF6FF" : "transparent", fontWeight: active ? 600 : 400, margin: "1px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10 }}>{String(icon)}</span>{String(label)}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Sunrise Bakery Inc.</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>Corporation · Monthly · GST/HST — October 2025</div>
          </div>
          <span style={{ background: "#FEF3C7", color: "#F59E0B", fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10 }}>At Risk</span>
        </div>
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#B45309", marginBottom: 10 }}>⚑ Document blocker — Reminder #2 sent Oct 9. Stage 3 hard-blocked.</div>
        {[
          { n: "✓", label: "Stage 1: Bookkeeping", sub: "Complete — Oct 2", badge: ["Complete", "#16A34A", "#DCFCE7"], gate: null, sc: "#16A34A", sb: "#DCFCE7" },
          { n: "🔒", label: "Stage 2: Document Collection", sub: "Reminder #2 sent Oct 9", badge: ["Blocked", "#DC2626", "#FEE2E2"], gate: { text: "🔒 Hard Stop — 3 docs pending. Stage 3 cannot begin.", red: true }, sc: "#DC2626", sb: "#FEE2E2" },
          { n: "3", label: "Stage 3: Preparation", sub: null, badge: ["Pending", "#94A3B8", "#F1F5F9"], gate: { text: "🔒 Blocked upstream — resolve document collection first.", red: true }, sc: "#E2E8F0", sb: "#F1F5F9" },
          { n: "4", label: "Stage 4: Review", sub: null, badge: ["Pending", "#94A3B8", "#F1F5F9"], gate: null, sc: "#E2E8F0", sb: "#F1F5F9" },
          { n: "5", label: "Stage 5: Filing", sub: null, badge: ["Pending", "#94A3B8", "#F1F5F9"], gate: { text: "🔒 Review approval required before filing", red: false }, sc: "#E2E8F0", sb: "#F1F5F9" },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 8, borderBottom: "1px solid #F1F5F9", marginBottom: 2 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: s.sb, border: `1.5px solid ${s.sc}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: s.sc, flexShrink: 0, marginTop: 1 }}>{s.n}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#0F172A" }}>{s.label}</div>
                <span style={{ background: s.badge[2] as string, color: s.badge[1] as string, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10 }}>{s.badge[0]}</span>
              </div>
              {s.sub && <div style={{ fontSize: 9, color: "#94A3B8" }}>{s.sub}</div>}
              {s.gate && <div style={{ background: s.gate.red ? "#FFF1F2" : "#EFF6FF", border: `1px solid ${s.gate.red ? "#FECDD3" : "#BFDBFE"}`, borderRadius: 5, padding: "3px 7px", fontSize: 9, color: s.gate.red ? "#DC2626" : "#2563EB", marginTop: 3 }}>{s.gate.text}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenAutomation() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, background: "#F8FAFC", height: 320, display: "flex", overflow: "hidden" }}>
      <div style={{ width: 150, background: "#fff", borderRight: "1px solid #E2E8F0", padding: "10px 0", flexShrink: 0 }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, background: "#2563EB", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>A</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>AcctOS</span>
        </div>
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6, padding: "0 4px" }}>Settings</div>
          {[["Firm Profile", false], ["Automation", true], ["Email Templates", false], ["Billing", false], ["Team", false]].map(([label, active]) => (
            <div key={String(label)} style={{ fontSize: 10, color: active ? "#2563EB" : "#475569", fontWeight: active ? 600 : 400, padding: "5px 8px", background: active ? "#EFF6FF" : "transparent", borderRadius: 5, marginBottom: 2 }}>{String(label)}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, padding: 14, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>Automation Rules</div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 12 }}>5 rules active · all jobs running via pg_cron</div>
        {[
          ["Auto-create workflows at cycle start", "Monthly", "#22C55E"],
          ["Send document Reminder #1 after 3 days", "Day 3", "#22C55E"],
          ["Escalate to owner on Reminder #2", "Day 6 ⚑", "#F59E0B"],
          ["Deadline alert 3 days before CRA due date", "−3d ⚑", "#DC2626"],
          ["Flag overdue clients on dashboard", "Daily", "#22C55E"],
        ].map(([label, timing, dotColor]) => (
          <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 7, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: String(dotColor), flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 10, color: "#0F172A", fontWeight: 500 }}>{String(label)}</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{String(timing)}</div>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#15803D", marginBottom: 4 }}>📧 Email log — Sunrise Bakery</div>
          {["✓ Initial request — Oct 3", "✓ Reminder #1 — Oct 6", "✓ Reminder #2 + Owner escalation — Oct 9"].map(line => (
            <div key={line} style={{ fontSize: 9, color: "#166534", marginBottom: 2 }}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScreenIntegrations() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, background: "#F8FAFC", height: 320, display: "flex", overflow: "hidden" }}>
      <div style={{ width: 150, background: "#fff", borderRight: "1px solid #E2E8F0", padding: "10px 0", flexShrink: 0 }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, background: "#2563EB", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>A</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>AcctOS</span>
        </div>
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6, padding: "0 4px" }}>Settings</div>
          {[["Firm Profile", false], ["Integrations", true], ["Client Portal", false], ["Billing", false], ["Automation", false], ["Team", false]].map(([label, active]) => (
            <div key={String(label)} style={{ fontSize: 10, color: active ? "#2563EB" : "#475569", fontWeight: active ? 600 : 400, padding: "5px 8px", background: active ? "#EFF6FF" : "transparent", borderRadius: 5, marginBottom: 2 }}>{String(label)}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, padding: 14, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Integrations</div>
        {[
          { abbr: "QB", name: "QuickBooks Online", sub: "Jensen & Associates — Connected · Last sync Oct 14", badge: "Connected", bc: "#16A34A", bb: "#DCFCE7", bg: "#2CA01C" },
          { abbr: "St", name: "Stripe Billing", sub: "Growth plan active · $149/mo CAD", badge: "Active", bc: "#16A34A", bb: "#DCFCE7", bg: "#635BFF" },
          { abbr: "R2", name: "Cloudflare R2 Storage", sub: "Zero egress · 3-tier lifecycle · CRA 7yr retention", badge: "Active", bc: "#16A34A", bb: "#DCFCE7", bg: "#F6821F" },
          { abbr: "Zh", name: "Zoho Books", sub: "Alternative to QBO — not connected", badge: "Available", bc: "#64748B", bb: "#F1F5F9", bg: "#E41E2B" },
        ].map(row => (
          <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: row.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{row.abbr}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0F172A" }}>{row.name}</div>
              <div style={{ fontSize: 9, color: "#94A3B8" }}>{row.sub}</div>
            </div>
            <span style={{ background: row.bb, color: row.bc, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10 }}>{row.badge}</span>
          </div>
        ))}
        <div style={{ padding: "8px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 9, color: "#1D4ED8" }}>
          🔗 <strong>Client Portal active</strong> — tokenised links sent for 3 clients this month. Maple Contracting uploaded 4/4 docs via portal.
        </div>
      </div>
    </div>
  );
}

const SCREENS: Record<string, React.ReactNode> = {
  dashboard: <ScreenDashboard />,
  workflow: <ScreenWorkflow />,
  automation: <ScreenAutomation />,
  integrations: <ScreenIntegrations />,
};

export default function PhaseTabs() {
  const [active, setActive] = useState(0);
  const phase = PHASES[active];

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 5, marginBottom: 40, overflowX: "auto" }}>
        {PHASES.map((p, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "10px 16px",
              border: "none",
              borderRadius: 8,
              background: active === i ? "#0D9488" : "transparent",
              color: active === i ? "#fff" : "#94A3B8",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: active === i ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all .18s",
            }}
          >
            {p.tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
        {/* Left: info */}
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: "#4ADE80", marginBottom: 16, letterSpacing: ".04em" }}>
            {phase.badge}
          </div>
          <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 10, lineHeight: 1.25 }}>
            {phase.title}
          </h3>
          <p style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>{phase.desc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {phase.features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                <div style={{ width: 18, height: 18, background: "rgba(13,148,136,0.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  <div style={{ width: 6, height: 6, background: "#14B8A6", borderRadius: "50%" }} />
                </div>
                <span style={{ color: "#F0F6FF", lineHeight: 1.55 }}>
                  <strong style={{ color: "#fff", fontWeight: 600 }}>{f.strong}</strong>
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: screenshot */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
          {/* Browser chrome */}
          <div style={{ background: "rgba(255,255,255,0.06)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["#EF4444", "#F59E0B", "#22C55E"].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: 5, padding: "4px 10px", fontSize: 11, color: "#64748B", textAlign: "center" }}>
              {phase.url}
            </div>
          </div>
          {SCREENS[phase.screen]}
        </div>
      </div>
    </div>
  );
}
