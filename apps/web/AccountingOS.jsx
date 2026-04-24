"use client";

import { useState, useMemo } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#F8FAFC", card: "#FFFFFF", border: "#E2E8F0",
  primary: "#2563EB", primaryBg: "#EFF6FF",
  green: "#16A34A",  greenBg:  "#DCFCE7",
  amber: "#F59E0B",  amberBg:  "#FEF3C7",
  red:   "#DC2626",  redBg:    "#FEE2E2",
  indigo: "#4F46E5", indigoBg: "#EEF2FF",
  text: "#0F172A", muted: "#475569", slate: "#94A3B8",
};

const TODAY = new Date("2025-10-14");
function daysFrom(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }
function fmtDate(d) { return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" }); }
function fmtLong(d) { return new Date(d).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }); }

// ─── USERS ────────────────────────────────────────────────────────────────────
import { RAW_CLIENTS, USERS } from "./acctosData";

// ─── WORKFLOW-LEVEL ENGINE ────────────────────────────────────────────────────
// Computes status PER WORKFLOW, then aggregates to client level.
// C4 (stage stall) now reads taskInProgressDays from the workflow, not the client.

function computeWorkflowStatus(wf, client) {
  if (!wf.stages || wf.stages.length === 0) {
    // Placeholder workflows (T2, Payroll) — derive from deadline only
    const d = daysFrom(TODAY, wf.deadline);
    if (d < 0 && wf.curStage < 6) return { status:"Overdue",  flags:["CRA deadline missed"], daysToDeadline:d };
    if (wf.curStage >= 6)         return { status:"Complete", flags:[], daysToDeadline:d };
    return { status:"On Track", flags:[], daysToDeadline:d };
  }

  const daysToDeadline = daysFrom(TODAY, wf.deadline);
  const daysInCycle    = daysFrom(wf.cycleStart, TODAY);
  const docs           = wf.docs || [];
  const missingDocs    = docs.some(d => d.status === "pending");
  const maxReminders   = docs.reduce((m, d) => Math.max(m, d.reminderCount || 0), 0);
  const stage          = wf.curStage;

  // Complete
  if (stage >= 6 && wf.stages.every(s => s.status === "complete"))
    return { status:"Complete", flags:[], daysToDeadline };

  // Overdue
  if (daysToDeadline < 0 && stage < 6)
    return { status:"Overdue", flags:["CRA deadline missed — file immediately"], daysToDeadline };

  const flags = [];
  let atRisk = false;

  // C1 — Timeline breach
  if (stage < 3 && daysInCycle > 12) {
    atRisk = true;
    flags.push("C1: Timeline breach — Stage 3 not started after Day 12");
  }
  // C2 — Deadline proximity
  if (daysToDeadline <= 3 && stage < 4) {
    atRisk = true;
    flags.push(`C2: Deadline in ${daysToDeadline}d — workflow not at Review stage`);
  }
  // C3 — Document blocker
  if (missingDocs && maxReminders >= 2 && daysToDeadline < 7) {
    atRisk = true;
    flags.push("C3: Document blocker — Reminder #2 sent, deadline < 7 days");
  }
  // C4 — Stage stall (reads from workflow, not client)
  if (wf.taskInProgressDays > 5 && stage < 6) {
    atRisk = true;
    flags.push(`C4: Stage stall — task in progress ${wf.taskInProgressDays} days`);
  }
  // C5 — High risk history
  if (client.riskHistory && stage < 3 && daysToDeadline <= 10) {
    atRisk = true;
    flags.push("C5: High-risk history — missed CRA deadline in last 12 months");
  }
  // Soft doc blocker
  if (missingDocs && maxReminders >= 2 && !atRisk) {
    atRisk = true;
    flags.push("Document blocker — client has not responded to Reminder #2");
  }

  return { status: atRisk ? "At Risk" : "On Track", flags, daysToDeadline };
}

// Aggregate: client status = worst workflow status
function aggregateClientStatus(computedWorkflows) {
  const priority = { "Overdue":3, "At Risk":2, "On Track":1, "Complete":0 };
  let worst = { status:"Complete", flags:[], daysToDeadline:null };
  for (const wc of computedWorkflows) {
    if ((priority[wc.status] ?? 0) > (priority[worst.status] ?? 0)) worst = wc;
  }
  return worst;
}

function wfRiskScore(wc, client) {
  let s = 0;
  const d = wc.daysToDeadline ?? 99;
  if (wc.status === "Overdue")       s += 100;
  if (wc.status === "At Risk")       s += 50;
  if (client.penaltyRisk === "HIGH") s += 25;
  if (client.riskHistory)            s += 15;
  if (d <= 3)  s += 30;
  if (d <= 7)  s += 20;
  if (d <= 14) s += 10;
  return s;
}

function useClients() {
  return useMemo(() => {
    return RAW_CLIENTS.map(client => {
      // Compute per-workflow status
      const computedWorkflows = client.workflows.map(wf => ({
        ...wf,
        computed: computeWorkflowStatus(wf, client),
      }));
      // Aggregate to client level
      const worstWf   = computedWorkflows.reduce((w, c) =>
        (c.computed.daysToDeadline ?? 999) < (w.computed.daysToDeadline ?? 999) &&
        c.computed.status !== "Complete" ? c : w, computedWorkflows[0]);
      const aggregate = aggregateClientStatus(computedWorkflows.map(w => w.computed));
      const score     = wfRiskScore(aggregate, client);
      return {
        ...client,
        workflows: computedWorkflows,
        status:         aggregate.status,
        flags:          aggregate.flags,
        daysToDeadline: aggregate.daysToDeadline,
        activeWf:       worstWf,
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }, []);
}

// ─── GATE ENFORCEMENT LOGIC ───────────────────────────────────────────────────
// Determines whether a stage is hard-blocked and why.
// Used in the workflow timeline UI to show lock banners instead of allowing progression.

function evaluateGate(stage, wf, client) {
  const docs        = wf.docs || [];
  const missingDocs = docs.filter(d => d.status === "pending");
  const n = stage.n;

  if (stage.blocked || stage.missed) {
    return {
      locked: true,
      reason: stage.blockReason || "This stage is blocked — resolve the previous stage first.",
      severity: stage.missed ? "missed" : "blocked",
    };
  }

  // Stage 2: block if docs still pending and Stage 2 is currently active
  if (n === 2 && missingDocs.length > 0 && stage.status === "in_progress") {
    return {
      locked: true,
      reason: `${missingDocs.length} document${missingDocs.length > 1 ? "s" : ""} still pending. Stage 3 cannot begin until all required documents are received.`,
      severity: "blocked",
    };
  }

  // Stage 4: dual review required if GST > $10k
  if (n === 4 && client.netGst > 10000 && stage.status === "pending") {
    return {
      locked: false,
      info: `GST $${client.netGst.toLocaleString()} > $10,000 — dual review required. Both accountant and senior must approve.`,
      severity: "info",
    };
  }

  // Stage 4: refund claim
  if (n === 4 && client.netGst < 0 && stage.status === "pending") {
    return {
      locked: false,
      info: "Refund claim detected — document justification required before this review can be approved.",
      severity: "warn",
    };
  }

  // Stage 5: block if Stage 4 not complete
  if (n === 5 && stage.status === "pending") {
    const reviewStage = wf.stages.find(s => s.n === 4);
    if (reviewStage && reviewStage.status !== "complete") {
      return {
        locked: true,
        reason: "Filing is blocked. Stage 4 review must be approved before this return can be submitted to CRA.",
        severity: "blocked",
      };
    }
  }

  return null;
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  "On Track": { color: C.green, bg: C.greenBg,  icon: "●" },
  "At Risk":  { color: C.amber, bg: C.amberBg,  icon: "▲" },
  "Overdue":  { color: C.red,   bg: C.redBg,    icon: "✕" },
  "Complete": { color: C.green, bg: C.greenBg,  icon: "✓" },
};

function StatusBadge({ status, small }) {
  const cfg = STATUS_CFG[status] || { color: C.slate, bg: "#F1F5F9", icon: "○" };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:cfg.bg, color:cfg.color, padding: small ? "2px 8px" : "4px 12px", borderRadius:20, fontSize: small ? 11 : 12, fontWeight:600 }}>
      <span style={{ fontSize: small ? 8 : 9 }}>{cfg.icon}</span>{status}
    </span>
  );
}

function Avatar({ name, size=32 }) {
  const p = [["#DBEAFE","#1D4ED8"],["#DCFCE7","#15803D"],["#FEF3C7","#B45309"],["#FCE7F3","#BE185D"],["#EDE9FE","#6D28D9"]];
  const [bg, fg] = p[name.charCodeAt(0) % p.length];
  const init = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{ width:size, height:size, borderRadius:"50%", background:bg, color:fg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.35, fontWeight:600, flexShrink:0 }}>{init}</div>;
}

function StageBar({ stages }) {
  const clr = { complete:C.green, in_progress:C.primary, blocked:C.red, missed:C.red, pending:C.border };
  return (
    <div style={{ display:"flex", gap:3, alignItems:"center" }}>
      {(stages||[]).slice(0,6).map((s,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center" }}>
          <div style={{ width:9, height:9, borderRadius:"50%", background:clr[s.status]||C.border, border:s.status==="pending"?`1.5px solid ${C.border}`:"none" }} title={s.name} />
          {i<5 && <div style={{ width:7, height:1.5, background:C.border }} />}
        </div>
      ))}
    </div>
  );
}

function Pill({ label, bg, color }) {
  return <span style={{ background:bg, color, fontSize:11, fontWeight:600, padding:"2px 9px", borderRadius:20 }}>{label}</span>;
}

function Card({ children, style={} }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, ...style }}>{children}</div>;
}

function Alert({ children, color, bg, border }) {
  return <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:8, padding:"10px 16px", fontSize:13, color, display:"flex", alignItems:"flex-start", gap:8 }}>{children}</div>;
}

function SectionHead({ title, sub, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
      <div>
        <h1 style={{ fontSize:20, fontWeight:700, color:C.text, margin:0 }}>{title}</h1>
        {sub && <p style={{ color:C.muted, fontSize:13, margin:"3px 0 0" }}>{sub}</p>}
      </div>
      {action && <div style={{ display:"flex", gap:8 }}>{action}</div>}
    </div>
  );
}

function Btn({ children, variant="outline", onClick, disabled }) {
  const s = variant==="primary"
    ? { background:C.primary, color:"white", border:"none", opacity:disabled?.5:1, cursor:disabled?"not-allowed":"pointer" }
    : { background:"white", color:C.text, border:`1px solid ${C.border}`, cursor:"pointer" };
  return <button onClick={onClick} disabled={disabled} style={{ ...s, borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:500 }}>{children}</button>;
}

function RuleRow({ icon, text, color }) {
  return (
    <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
      <span style={{ fontSize:11, color, flexShrink:0, marginTop:1 }}>{icon}</span>
      <span style={{ fontSize:12, color }}>{text}</span>
    </div>
  );
}

// ─── GATE BANNER (visual enforcement) ────────────────────────────────────────
function GateBanner({ gate }) {
  if (!gate) return null;
  const configs = {
    blocked: { bg:"#FFF1F2", border:"#FECDD3", color:C.red,   icon:"🔒", label:"Hard Stop" },
    missed:  { bg:C.redBg,   border:"#FCA5A5", color:C.red,   icon:"✕",  label:"Missed" },
    info:    { bg:"#EFF6FF",  border:"#BFDBFE", color:C.primary, icon:"ℹ", label:"Gate Rule" },
    warn:    { bg:C.amberBg,  border:"#FCD34D", color:C.amber, icon:"⚑",  label:"Attention" },
  };
  const cfg = configs[gate.severity] || configs.info;
  const text = gate.reason || gate.info;
  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:8, padding:"8px 12px", marginTop:6, display:"flex", gap:8, alignItems:"flex-start" }}>
      <span style={{ fontSize:12, flexShrink:0, marginTop:1 }}>{cfg.icon}</span>
      <div style={{ flex:1 }}>
        <span style={{ fontSize:11, fontWeight:700, color:cfg.color, textTransform:"uppercase", letterSpacing:"0.04em", marginRight:6 }}>{cfg.label}</span>
        <span style={{ fontSize:12, color:cfg.color }}>{text}</span>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ clients, onSelect, setView }) {
  const cnt = {
    all:      clients.length,
    ontrack:  clients.filter(c => c.status==="On Track").length,
    atrisk:   clients.filter(c => c.status==="At Risk").length,
    overdue:  clients.filter(c => c.status==="Overdue").length,
    complete: clients.filter(c => c.status==="Complete").length,
  };
  const spotlights = clients.filter(c => c.status !== "Complete").slice(0,3);
  const soonAtRisk = clients.filter(c => c.status==="On Track" && c.daysToDeadline!=null && c.daysToDeadline<=5 && c.daysToDeadline>=0);
  const tiles = [
    { label:"Active Filings", value:cnt.all-cnt.complete, color:C.primary, bg:C.primaryBg },
    { label:"On Track",       value:cnt.ontrack,  color:C.green, bg:C.greenBg },
    { label:"At Risk",        value:cnt.atrisk,   color:C.amber, bg:C.amberBg },
    { label:"Overdue",        value:cnt.overdue,  color:C.red,   bg:C.redBg },
  ];

  return (
    <div>
      <SectionHead title="Command Centre" sub={`October 2025 · ${cnt.all} active clients · Ontario (CRA timezone)`}
        action={<>
          <Btn onClick={() => setView("deadlines")}>📅 Deadlines</Btn>
          <Btn onClick={() => setView("allworkflows")}>⚡ All Workflows</Btn>
          <Btn variant="primary" onClick={() => setView("clients")}>All Clients →</Btn>
        </>}
      />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background:t.bg, borderRadius:12, padding:"16px 20px", border:`1px solid ${t.color}22` }}>
            <div style={{ fontSize:12, color:t.color, fontWeight:600, marginBottom:3 }}>{t.label}</div>
            <div style={{ fontSize:32, fontWeight:700, color:t.color, lineHeight:1 }}>{t.value}</div>
          </div>
        ))}
      </div>
      {(cnt.overdue>0||cnt.atrisk>0||soonAtRisk.length>0) && (
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          {cnt.overdue>0 && <Alert color={C.red} bg={C.redBg} border="#FCA5A5"><strong>✕ {cnt.overdue} overdue</strong> — CRA deadline passed. File immediately to minimise penalties.</Alert>}
          {cnt.atrisk>0  && <Alert color={C.amber} bg={C.amberBg} border="#FCD34D"><strong>▲ {cnt.atrisk} at risk</strong> — will miss deadline if nothing changes today.</Alert>}
          {soonAtRisk.length>0 && <Alert color={C.indigo} bg={C.indigoBg} border="#C7D2FE"><strong>🔮 {soonAtRisk.length} client{soonAtRisk.length>1?"s":""} will become At Risk within 5 days</strong> — {soonAtRisk.map(c=>c.name.split(" ")[0]).join(", ")}</Alert>}
        </div>
      )}
      {spotlights.length>0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>This Week · Highest Priority</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            {spotlights.map(cl => {
              const wf = cl.activeWf;
              const cfg = STATUS_CFG[cl.status]||STATUS_CFG["On Track"];
              return (
                <div key={cl.id} onClick={() => onSelect(cl)}
                  style={{ background:"white", border:`2px solid ${cfg.color}33`, borderRadius:10, padding:"14px 16px", cursor:"pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor=cfg.color}
                  onMouseLeave={e => e.currentTarget.style.borderColor=cfg.color+"33"}
                >
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{cl.name}</div>
                    <StatusBadge status={cl.status} small />
                  </div>
                  {wf && <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>{wf.label}</div>}
                  {wf && wf.stages && <StageBar stages={wf.stages} />}
                  <div style={{ fontSize:11, marginTop:6, color:cl.daysToDeadline<0?C.red:cl.daysToDeadline<=5?C.amber:C.muted }}>
                    {cl.daysToDeadline<0?`${Math.abs(cl.daysToDeadline)}d overdue`:`${cl.daysToDeadline}d to deadline`}
                  </div>
                  {cl.flags?.length>0 && <div style={{ fontSize:11, color:cfg.color, marginTop:4 }}>⚑ {cl.flags[0].replace(/^C\d: /,"")}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Card>
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.text }}>Active Client Ledger</span>
          <span style={{ fontSize:11, color:C.muted }}>Sorted by risk score · highest first</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F8FAFC" }}>
              {["Client","Workflows","Worst Stage","Status","Deadline","Risk Flag","Accountant"].map(h => (
                <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((cl,i) => {
              const wf = cl.activeWf;
              const u  = USERS[cl.assigned];
              return (
                <tr key={cl.id} onClick={() => onSelect(cl)}
                  style={{ background:i%2===0?"white":"#FAFAFA", cursor:"pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background=C.primaryBg}
                  onMouseLeave={e => e.currentTarget.style.background=i%2===0?"white":"#FAFAFA"}
                >
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{cl.name}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{cl.city} · {cl.type}</div>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {cl.workflows.map(w => (
                        <Pill key={w.id} label={w.type} bg={w.computed?.status==="Complete"?C.greenBg:w.computed?.status==="At Risk"?C.amberBg:w.computed?.status==="Overdue"?C.redBg:"#F1F5F9"} color={w.computed?.status==="Complete"?C.green:w.computed?.status==="At Risk"?C.amber:w.computed?.status==="Overdue"?C.red:C.muted} />
                      ))}
                    </div>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    {wf && wf.stages ? <><StageBar stages={wf.stages} /><div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Stage {wf.curStage}/6</div></> : "—"}
                  </td>
                  <td style={{ padding:"11px 14px" }}><StatusBadge status={cl.status} small /></td>
                  <td style={{ padding:"11px 14px" }}>
                    {wf && <>
                      <div style={{ fontSize:12, color:C.text }}>{fmtDate(wf.deadline)}</div>
                      <div style={{ fontSize:11, color:cl.daysToDeadline<0?C.red:cl.daysToDeadline<=5?C.amber:C.muted }}>
                        {cl.daysToDeadline<0?`${Math.abs(cl.daysToDeadline)}d overdue`:`${cl.daysToDeadline}d`}
                      </div>
                    </>}
                  </td>
                  <td style={{ padding:"11px 14px", maxWidth:160 }}>
                    {cl.flags?.length>0
                      ? <div style={{ fontSize:11, color:cl.status==="Overdue"?C.red:C.amber }}>⚑ {cl.flags[0].replace(/^C\d: /,"")}</div>
                      : <div style={{ fontSize:11, color:C.muted }}>—</div>}
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Avatar name={u?.name||"?"} size={22} />
                      <span style={{ fontSize:12, color:C.text }}>{u?.initials}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop:14, background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"12px 18px" }}>
        <div style={{ fontSize:12, fontWeight:600, color:"#0369A1", marginBottom:6 }}>📅 CRA Deadline Reference — Built in</div>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
          {[["Monthly","Last day of following month"],["Quarterly","Last day of month after quarter-end"],["Annual (self-employed)","June 15"],["Annual (corp)","April 30 or custom"]].map(([l,d]) => (
            <div key={l} style={{ fontSize:12 }}><span style={{ color:C.muted }}>{l}: </span><span style={{ color:"#0369A1", fontWeight:500 }}>{d}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CLIENT LIST ─────────────────────────────────────────────────────────────
function ClientList({ clients, onSelect }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("All");
  const filtered = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) && (f==="All"||c.status===f));
  return (
    <div>
      <SectionHead title="All Clients" sub={`${clients.length} clients on file`} />
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…"
          style={{ flex:1, padding:"8px 14px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:"none" }} />
        <div style={{ display:"flex", gap:4 }}>
          {["All","On Track","At Risk","Overdue","Complete"].map(s => (
            <Btn key={s} onClick={() => setF(s)} variant={f===s?"primary":"outline"}>{s}</Btn>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map(cl => {
          const wf = cl.activeWf;
          const u  = USERS[cl.assigned];
          return (
            <div key={cl.id} onClick={() => onSelect(cl)}
              style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:10, padding:"13px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}
              onMouseEnter={e => e.currentTarget.style.borderColor=C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor=C.border}
            >
              <Avatar name={cl.name} size={40} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{cl.name}</div>
                <div style={{ fontSize:12, color:C.muted }}>{cl.type} · {cl.city} · {cl.freq} · BN {cl.bn}</div>
                {cl.flags?.length>0 && <div style={{ fontSize:11, color:cl.status==="Overdue"?C.red:C.amber, marginTop:2 }}>⚑ {cl.flags[0].replace(/^C\d: /,"")}</div>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
                <StatusBadge status={cl.status} />
                {wf && <div style={{ fontSize:12, color:C.muted }}>{cl.daysToDeadline<0?`${Math.abs(cl.daysToDeadline)}d overdue`:`${cl.daysToDeadline}d to deadline`}</div>}
              </div>
              {u && <div style={{ display:"flex", alignItems:"center", gap:6 }}><Avatar name={u.name} size={24} /><span style={{ fontSize:12, color:C.muted }}>{u.initials}</span></div>}
              <span style={{ color:C.slate, fontSize:18 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CLIENT WORKSPACE ────────────────────────────────────────────────────────
function ClientWorkspace({ client, onBack }) {
  const [tab, setTab] = useState("workflow");
  const [wfIdx, setWfIdx] = useState(0);
  const wf = client.workflows[wfIdx];
  const u  = USERS[client.assigned];
  const missingDocs = (wf?.docs||[]).filter(d => d.status==="pending");
  const wfComputed  = wf?.computed || {};

  const stageCfg = {
    complete:    { bg:C.greenBg,   color:C.green,   label:"Complete" },
    in_progress: { bg:C.primaryBg, color:C.primary, label:"In Progress" },
    blocked:     { bg:C.redBg,     color:C.red,     label:"Blocked" },
    missed:      { bg:C.redBg,     color:C.red,     label:"Missed" },
    pending:     { bg:"#F1F5F9",   color:C.muted,   label:"Pending" },
  };

  return (
    <div>
      <button onClick={onBack} style={{ background:"none", border:"none", color:C.primary, cursor:"pointer", fontSize:13, fontWeight:500, padding:0, marginBottom:14 }}>← Back</button>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <Avatar name={client.name} size={48} />
          <div>
            <h1 style={{ fontSize:19, fontWeight:700, color:C.text, margin:0 }}>{client.name}</h1>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{client.type} · {client.city} · {client.freq} filer · Since {client.since}</div>
            <div style={{ fontSize:11, color:C.slate, marginTop:1 }}>BN {client.bn} · {u?.name}</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
          <StatusBadge status={client.status} />
          {wf && <div style={{ fontSize:12, color:C.muted }}>Due {fmtLong(wf.deadline)}</div>}
          {client.daysToDeadline!=null && (
            <div style={{ fontSize:12, fontWeight:600, color:client.daysToDeadline<0?C.red:client.daysToDeadline<=5?C.amber:C.green }}>
              {client.daysToDeadline<0?`${Math.abs(client.daysToDeadline)} days overdue`:`${client.daysToDeadline} days remaining`}
            </div>
          )}
        </div>
      </div>

      {/* Workflow selector */}
      {client.workflows.length>1 && (
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {client.workflows.map((w,i) => (
            <button key={w.id} onClick={() => { setWfIdx(i); setTab("workflow"); }}
              style={{ background:wfIdx===i?C.primaryBg:"white", color:wfIdx===i?C.primary:C.text, border:`1px solid ${wfIdx===i?C.primary:C.border}`, borderRadius:8, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:wfIdx===i?600:400, display:"flex", alignItems:"center", gap:6 }}>
              {w.type} — {w.period}
              {w.computed?.status==="At Risk"  && <span style={{ width:7, height:7, borderRadius:"50%", background:C.amber, display:"inline-block" }} />}
              {w.computed?.status==="Overdue"  && <span style={{ width:7, height:7, borderRadius:"50%", background:C.red,   display:"inline-block" }} />}
              {w.computed?.status==="Complete" && <span style={{ width:7, height:7, borderRadius:"50%", background:C.green, display:"inline-block" }} />}
            </button>
          ))}
        </div>
      )}

      {/* Flag banners — from workflow-level computed status */}
      {wfComputed.flags?.map((f,i) => (
        <div key={i} style={{ marginBottom:8, background:wfComputed.status==="Overdue"?C.redBg:C.amberBg, border:`1px solid ${wfComputed.status==="Overdue"?"#FCA5A5":"#FCD34D"}`, borderRadius:8, padding:"9px 14px", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12 }}>⚑</span>
          <span style={{ fontSize:13, fontWeight:500, color:wfComputed.status==="Overdue"?C.red:C.amber }}>{f.replace(/^C\d: /,"")}</span>
          {client.penaltyRisk && i===0 && <Pill label={`Penalty Risk: ${client.penaltyRisk}`} bg={C.redBg} color={C.red} />}
        </div>
      ))}

      {/* Intelligence panel */}
      <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"#0369A1", marginBottom:8 }}>🧠 Active Intelligence Rules — {wf?.label}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {client.type==="Corporation" && <RuleRow icon="✓" text="Corporation — ITC reconciliation task added; dual review if GST > $10,000" color="#0369A1" />}
          {client.type==="Sole prop"   && <RuleRow icon="✓" text="Sole proprietor — simplified checklist; revenue threshold check; no ITCs" color="#0369A1" />}
          {client.netGst>10000         && <RuleRow icon="✓" text={`GST $${client.netGst?.toLocaleString()} > $10,000 — dual review required`} color="#0369A1" />}
          {client.netGst<0             && <RuleRow icon="⚑" text="Refund claim — justification documentation required before filing" color={C.amber} />}
          {client.riskHistory          && <RuleRow icon="⚑" text="High-risk client — missed CRA deadline in last 12 months; senior auto-assigned to Stage 3" color={C.red} />}
          {missingDocs.length>0        && <RuleRow icon="⚑" text={`${missingDocs.length} doc${missingDocs.length>1?"s":""} pending — Stage 3 hard-blocked`} color={C.red} />}
          {client.emailLog?.length>0   && <RuleRow icon="⚑" text={`Reminder #${client.emailLog.length} sent — escalation active`} color={C.amber} />}
          <RuleRow icon="○" text="QuickBooks integration — Phase 4 (bookkeeping status set manually for now)" color={C.slate} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {["workflow","tasks","documents","activity","integration"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background:"none", border:"none", borderBottom:tab===t?`2px solid ${C.primary}`:"2px solid transparent", padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:tab===t?600:400, color:tab===t?C.primary:C.muted, textTransform:"capitalize" }}>{t}</button>
        ))}
      </div>

      {/* WORKFLOW TAB — with gate enforcement */}
      {tab==="workflow" && wf && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{wf.label} — Stage Timeline</div>
            {wfComputed.status && <StatusBadge status={wfComputed.status} small />}
          </div>
          {(wf.stages||[]).length===0
            ? <div style={{ background:"#F8FAFC", borderRadius:8, padding:"20px", textAlign:"center", color:C.muted, fontSize:12 }}>Stage detail not available for this workflow type yet</div>
            : (wf.stages||[]).map((s,i) => {
              const cfg  = stageCfg[s.status]||stageCfg.pending;
              const gate = evaluateGate(s, wf, client);
              return (
                <div key={i} style={{ display:"flex" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginRight:14, width:24 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:cfg.bg, border:`2px solid ${cfg.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:cfg.color, fontWeight:700, flexShrink:0 }}>
                      {s.status==="complete"?"✓":s.status==="missed"?"✕":s.status==="blocked"?"🔒":i+1}
                    </div>
                    {i<(wf.stages.length-1) && <div style={{ width:2, flex:1, minHeight:14, background:C.border, margin:"2px 0" }} />}
                  </div>
                  <div style={{ flex:1, paddingBottom:16, paddingTop:2 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <span style={{ fontSize:13, fontWeight:500, color:C.text }}>Stage {i+1}: {s.name}</span>
                      <Pill label={cfg.label} bg={cfg.bg} color={cfg.color} />
                    </div>
                    {s.date && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.date}</div>}
                    {wf.stageNotes?.[i+1] && <div style={{ fontSize:11, color:C.primary, marginTop:2 }}>↳ {wf.stageNotes[i+1]}</div>}
                    {s.gateLabel && <div style={{ fontSize:11, color:C.slate, marginTop:3 }}>🔒 {s.gateLabel}</div>}
                    {/* GATE BANNER — hard stop / info / warn */}
                    <GateBanner gate={gate} />
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* TASKS TAB */}
      {tab==="tasks" && wf && (
        <Card>
          {(wf.tasks||[]).length===0
            ? <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>No task detail for this workflow yet</div>
            : (wf.tasks||[]).map((task,i) => {
              const tcfg = { complete:[C.greenBg,C.green], in_progress:[C.primaryBg,C.primary], pending:["#F1F5F9",C.muted], blocked:[C.redBg,C.red], missed:[C.redBg,C.red] };
              const [tbg,tc] = tcfg[task.status]||tcfg.pending;
              const taskUser = Object.values(USERS).find(u => u.initials===task.who);
              return (
                <div key={i} style={{ padding:"10px 16px", borderBottom:i<(wf.tasks.length-1)?`1px solid ${C.border}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{task.title}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                      👤 {taskUser?.name||task.who}{task.due?` · 📅 Due ${task.due}`:""}
                    </div>
                  </div>
                  <Pill label={task.status.replace("_"," ")} bg={tbg} color={tc} />
                </div>
              );
            })
          }
        </Card>
      )}

      {/* DOCUMENTS TAB */}
      {tab==="documents" && wf && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Document Checklist — {wf.label}</div>
            <Btn variant="primary">+ Send Request</Btn>
          </div>
          <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#0369A1" }}>
            {client.type==="Corporation"
              ? "🔒 Corporation checklist: bank statements, AR/AP aging, invoices, receipts >$500, ITC reconciliation"
              : "🔒 Sole prop checklist: bank statements, all sales invoices, receipts >$100, GST registration (new clients)"}
          </div>
          <Card>
            {(wf.docs||[]).length===0
              ? <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>No documents on record for this workflow</div>
              : (wf.docs||[]).map((doc,i) => (
                <div key={i} style={{ padding:"10px 16px", borderBottom:i<wf.docs.length-1?`1px solid ${C.border}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, color:C.text }}>{doc.name}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>
                      {doc.uploadedAt?`Uploaded ${doc.uploadedAt}${doc.by?" · "+doc.by:""}`:`Reminder #${doc.reminderCount} sent ${doc.lastReminderAt||"—"}`}
                    </div>
                  </div>
                  <Pill label={doc.status==="received"?"Received":"Pending"} bg={doc.status==="received"?C.greenBg:C.amberBg} color={doc.status==="received"?C.green:C.amber} />
                </div>
              ))
            }
          </Card>
          {client.emailLog?.length>0 && (
            <div style={{ marginTop:14, background:C.amberBg, border:"1px solid #FCD34D", borderRadius:8, padding:"12px 16px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.amber, marginBottom:8 }}>Email Escalation Log</div>
              {client.emailLog.map((e,i) => (
                <div key={i} style={{ fontSize:12, color:"#92400E", marginBottom:4, display:"flex", gap:8 }}>
                  <span style={{ color:C.green }}>✓</span>{e.type} — Sent {e.date}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY TAB */}
      {tab==="activity" && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:14 }}>Activity Feed</div>
          {(client.activity||[]).length===0
            ? <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>No activity logged yet</div>
            : (
              <div style={{ position:"relative", paddingLeft:24 }}>
                <div style={{ position:"absolute", left:8, top:0, bottom:0, width:2, background:C.border }} />
                {(client.activity||[]).map((a,i) => (
                  <div key={i} style={{ position:"relative", marginBottom:16 }}>
                    <div style={{ position:"absolute", left:-20, top:2, width:10, height:10, borderRadius:"50%", background:a.who==="System"?C.border:C.primary, border:"2px solid white" }} />
                    <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{a.act}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{a.detail}</div>
                    <div style={{ fontSize:11, color:C.slate, marginTop:2 }}>{a.who} · {a.t}</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* INTEGRATION TAB */}
      {tab==="integration" && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:14 }}>Integration Status — Phase 4</div>
          <Card style={{ padding:"16px 20px", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>QuickBooks Online</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Auto-sync bookkeeping status — Stage 1 gate becomes hands-free</div>
              </div>
              <Pill label="Not Connected" bg="#F1F5F9" color={C.muted} />
            </div>
            <div style={{ background:"#F8FAFC", borderRadius:8, padding:"10px 14px", fontSize:12, color:C.muted, marginBottom:12 }}>
              Currently: <code style={{ background:C.border, borderRadius:4, padding:"1px 5px", fontSize:11 }}>bookkeepingStatus: "complete"</code> — set manually until QBO connected.
            </div>
            <Btn disabled>Connect QuickBooks (Phase 4)</Btn>
          </Card>
          <Card style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Zoho Books</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>Alternative accounting integration — Phase 4</div>
            <Pill label="Roadmap" bg="#F1F5F9" color={C.muted} />
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── ALL WORKFLOWS VIEW ───────────────────────────────────────────────────────
function AllWorkflows({ clients, onSelectClient }) {
  const rows = [];
  clients.forEach(c => c.workflows.forEach(wf => rows.push({ c, wf })));
  rows.sort((a,b) => new Date(a.wf.deadline)-new Date(b.wf.deadline));
  return (
    <div>
      <SectionHead title="All Workflows" sub={`${rows.length} active engagements across all clients · sorted by deadline`} />
      <Card>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F8FAFC" }}>
              {["Workflow","Client","Period","Stage","Deadline","Status"].map(h => (
                <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({c,wf},i) => {
              const wfStatus = wf.computed?.status || "On Track";
              return (
                <tr key={wf.id} onClick={() => onSelectClient(c)}
                  style={{ background:i%2===0?"white":"#FAFAFA", cursor:"pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background=C.primaryBg}
                  onMouseLeave={e => e.currentTarget.style.background=i%2===0?"white":"#FAFAFA"}
                >
                  <td style={{ padding:"11px 16px" }}>
                    <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{wf.label}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{wf.type}</div>
                  </td>
                  <td style={{ padding:"11px 16px", fontSize:13, color:C.text }}>{c.name}</td>
                  <td style={{ padding:"11px 16px", fontSize:12, color:C.muted }}>{wf.period}</td>
                  <td style={{ padding:"11px 16px" }}>
                    {wf.stages&&wf.stages.length>0?<><StageBar stages={wf.stages}/><div style={{ fontSize:11, color:C.muted }}>{wf.curStage}/6</div></>:<span style={{ fontSize:12, color:C.muted }}>{wf.curStage}/6</span>}
                  </td>
                  <td style={{ padding:"11px 16px" }}>
                    <div style={{ fontSize:12, color:C.text }}>{fmtDate(wf.deadline)}</div>
                    {(() => { const d=daysFrom(TODAY,wf.deadline); return <div style={{ fontSize:11, color:d<0?C.red:d<=5?C.amber:C.muted }}>{d<0?`${Math.abs(d)}d overdue`:`${d}d`}</div>; })()}
                  </td>
                  <td style={{ padding:"11px 16px" }}><StatusBadge status={wfStatus} small /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── DEADLINES VIEW ───────────────────────────────────────────────────────────
function DeadlinesView({ clients, onSelectClient }) {
  const all = [];
  clients.forEach(c => c.workflows.forEach(wf => { const d=daysFrom(TODAY,wf.deadline); all.push({c,wf,d}); }));
  all.sort((a,b) => a.d-b.d);
  const overdue = all.filter(r => r.d<0);
  const risk    = all.filter(r => r.d>=0&&r.d<=7&&r.c.status!=="Complete");
  const soon    = all.filter(r => r.d>7&&r.d<=30&&r.c.status!=="Complete");
  const Section = ({title,rows,color,bg}) => rows.length===0?null:(
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:600, color }}>{title}</div>
        <Pill label={String(rows.length)} bg={bg} color={color} />
      </div>
      {rows.map(({c,wf,d},i) => (
        <div key={i} onClick={() => onSelectClient(c)}
          style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px", marginBottom:8, cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}
          onMouseEnter={e => e.currentTarget.style.borderColor=color}
          onMouseLeave={e => e.currentTarget.style.borderColor=C.border}
        >
          <div style={{ width:48, textAlign:"center", background:bg, borderRadius:8, padding:"6px 4px" }}>
            <div style={{ fontSize:10, color, fontWeight:500 }}>{new Date(wf.deadline).toLocaleDateString("en-CA",{month:"short"})}</div>
            <div style={{ fontSize:20, fontWeight:700, color }}>{new Date(wf.deadline).getDate()}</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{c.name}</div>
            <div style={{ fontSize:12, color:C.muted }}>{wf.label}</div>
          </div>
          <StatusBadge status={wf.computed?.status||c.status} small />
          <div style={{ fontSize:12, fontWeight:600, color }}>{d<0?`${Math.abs(d)}d overdue`:d===0?"Today":`${d}d`}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <SectionHead title="CRA Deadlines" sub="Built-in Canada calendar · monthly, quarterly, annual filers" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
        {[["Overdue",overdue.length,C.red,C.redBg],["At Risk (≤7d)",risk.length,C.amber,C.amberBg],["Upcoming (≤30d)",soon.length,C.green,C.greenBg]].map(([l,v,color,bg]) => (
          <div key={l} style={{ background:bg, borderRadius:10, padding:"14px 18px" }}>
            <div style={{ fontSize:12, color, fontWeight:600 }}>{l}</div>
            <div style={{ fontSize:28, fontWeight:700, color }}>{v}</div>
          </div>
        ))}
      </div>
      <Section title="Overdue — act today" rows={overdue} color={C.red} bg={C.redBg} />
      <Section title="At Risk — deadline within 7 days" rows={risk} color={C.amber} bg={C.amberBg} />
      <Section title="Upcoming — next 30 days" rows={soon} color={C.green} bg={C.greenBg} />
    </div>
  );
}

// ─── WORKFLOW TEMPLATES ───────────────────────────────────────────────────────
function WorkflowTemplates() {
  const [open, setOpen] = useState("gst");
  const wfs = [
    { id:"gst", name:"GST/HST Filing", phase:"Phase 1 — Live", pc:C.green, freq:"Monthly / Quarterly / Annual",
      desc:"CRA-aware 6-stage workflow with 5-condition At Risk engine, per-workflow status computation, client-type branching, document escalation, and dual-review gate enforcement.",
      stages:[
        { name:"Data Ready",          task:"Confirm bookkeeping complete in QBO",              gate:"Hard block — Stage 2 cannot start if bookkeeping incomplete" },
        { name:"Document Collection", task:"Request invoices/receipts per client-type checklist", gate:"Hard block — Stage 3 cannot start until all docs received; auto-reminders Day 3 & 6; escalate on Reminder #2" },
        { name:"Preparation",         task:"Calculate GST + prepare draft return",              gate:"Branch: Corporation → ITC reconciliation + validation; Sole prop → simplified checklist; high-risk → senior auto-assigned" },
        { name:"Review",              task:"Senior review and sign-off",                        gate:"GST > $10k → dual review gate; refund → justification doc required" },
        { name:"Filing",              task:"Submit return to CRA",                              gate:"Hard block — Filing disabled until Stage 4 review is approved" },
        { name:"Confirmation",        task:"Record CRA confirmation number",                    gate:"Auto-notify firm owner on completion; mark workflow Complete" },
      ]},
    { id:"t1",     name:"Personal Tax Return (T1)",        phase:"Phase 2 — Upcoming", pc:C.amber, freq:"Annual (Jan–Apr peak)",         desc:"Highest client volume, heaviest document chase. T4/T5 tracking, seasonal surge management.", stages:[] },
    { id:"t2",     name:"Corporate Tax (T2)",              phase:"Phase 2 — Upcoming", pc:C.amber, freq:"Annual (year-end based)",        desc:"Multi-step corporate returns, high-value client management, complex year-end coordination.", stages:[] },
    { id:"bk",     name:"Monthly Bookkeeping",             phase:"Phase 2 — Upcoming", pc:C.amber, freq:"Monthly",                       desc:"Reconciliation and review cycle — feeds directly into GST workflow.", stages:[] },
    { id:"payroll",name:"Payroll Remittances",             phase:"Phase 3 — Roadmap",  pc:C.slate, freq:"Monthly / Bi-weekly",           desc:"CRA payroll deadlines, penalty-sensitive remittance tracking.", stages:[] },
    { id:"reports",name:"Financial Statements / Reports",  phase:"Phase 3 — Roadmap",  pc:C.slate, freq:"Monthly / Quarterly",           desc:"Client-facing deliverables, review cycle management.", stages:[] },
    { id:"onboard",name:"New Client Onboarding",           phase:"Phase 3 — Roadmap",  pc:C.slate, freq:"Event-based",                   desc:"Collect info, set up QBO, assign workflows, define document checklist.", stages:[] },
    { id:"yearend",name:"Year-End Closing",                phase:"Phase 3 — Roadmap",  pc:C.slate, freq:"Annual",                        desc:"Adjust entries, finalise books.", stages:[] },
    { id:"audit",  name:"CRA Notices / Audit Response",   phase:"Phase 3 — Roadmap",  pc:C.slate, freq:"Event-based",                   desc:"Document collection, deadline response, CRA correspondence tracking.", stages:[] },
  ];
  return (
    <div>
      <SectionHead title="Workflow Templates" sub="One engine — configurable templates. T1 in Phase 2 = a new template, not a new system." />
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {wfs.map(wf => (
          <Card key={wf.id} style={{ overflow:"hidden" }}>
            <div onClick={() => setOpen(open===wf.id?null:wf.id)} style={{ padding:"13px 18px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:600, color:C.text }}>{wf.name}</span>
                  <Pill label={wf.phase} bg={wf.pc+"22"} color={wf.pc} />
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{wf.freq}</div>
              </div>
              <span style={{ color:C.slate }}>{open===wf.id?"∧":"∨"}</span>
            </div>
            {open===wf.id && (
              <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${C.border}` }}>
                <p style={{ fontSize:12, color:C.muted, margin:"12px 0 14px" }}>{wf.desc}</p>
                {wf.stages.length>0?wf.stages.map((s,i) => (
                  <div key={i} style={{ background:"#F8FAFC", borderRadius:8, padding:"9px 13px", marginBottom:6, display:"flex", gap:10, alignItems:"flex-start" }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", background:C.primaryBg, color:C.primary, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{s.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{s.task}</div>
                    </div>
                    <div style={{ fontSize:11, color:C.indigo, background:C.indigoBg, padding:"2px 8px", borderRadius:6, flexShrink:0, maxWidth:240, textAlign:"right" }}>🔒 {s.gate}</div>
                  </div>
                )):(
                  <div style={{ background:"#F8FAFC", borderRadius:8, padding:"18px", textAlign:"center", color:C.muted, fontSize:12 }}>Template available in {wf.phase.split(" — ")[0]}</div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── ROADMAP ─────────────────────────────────────────────────────────────────
function RoadmapPage() {
  const phases = [
    { id:0, label:"Phase 0", name:"Demo Prototype", status:"current", goal:"Sell the idea. Show to firms, close pilots.", cost:"$0", customers:"0",
      items:["Workflow-level At Risk engine — C1–C5 per workflow ✓","Per-workflow status aggregated to client level ✓","Visual gate enforcement — hard stops with reasons ✓","Three demo clients + 3 supporting clients ✓","Activity feed, multi-workflow selector ✓","Roadmap, Why Us, Deadlines, All Workflows views ✓"],
      stack:["React (local) — no backend needed yet"] },
    { id:1, label:"Phase 1", name:"Interactive MVP", status:"next", goal:"Make it real enough to use. First 3 paying customers.", cost:"$0/month", customers:"1–3",
      items:["Replace mock data with Supabase fetch","Basic CRUD: create client, update status, save tasks","Stage blocking logic wired to real data","Client type branching live in backend"],
      stack:["Supabase free (PostgreSQL + Auth + Storage)","Next.js + Vercel (free)"] },
    { id:2, label:"Phase 2", name:"Usable Product", status:"roadmap", goal:"People rely on it daily.", cost:"$0–$25/month", customers:"3–10",
      items:["Supabase Auth + multi-user roles","Status auto-change on task completion","File uploads via Supabase Storage","T1 + T2 + Bookkeeping workflow templates"],
      stack:["Supabase Auth + Storage"] },
    { id:3, label:"Phase 3", name:"Retention Engine", status:"roadmap", goal:"Firms can't run without it.", cost:"$25–$75/month", customers:"10–50",
      items:["Transactional email: Resend (reminders, escalations)","Automation rules engine","Forward-looking intelligence alerts","Cloudflare R2 (free egress)"],
      stack:["Resend (~$20/mo)","Cloudflare R2","BullMQ + Upstash Redis"] },
    { id:4, label:"Phase 4", name:"Integrations", status:"roadmap", goal:"Plug into real firm workflows.", cost:"$50–$150/month", customers:"50–200",
      items:["QuickBooks Online API — auto-sync bookkeeping status","Client portal","Billing triggers on filing completion"],
      stack:["QBO OAuth API","Stripe"] },
    { id:5, label:"Phase 5", name:"AI Layer", status:"roadmap", goal:"Intelligence on top of clean data.", cost:"$50–$200/month", customers:"200+",
      items:["Risk prediction from client history","Priority suggestions: 'Start with Patel'","Anomaly detection: GST 3× higher than last quarter","Smart document pre-population"],
      stack:["Anthropic API — only after PMF"] },
  ];
  const ss = { current:{bg:C.primaryBg,color:C.primary,label:"You are here"}, next:{bg:C.greenBg,color:C.green,label:"Build next"}, roadmap:{bg:"#F1F5F9",color:C.muted,label:"Roadmap"} };
  return (
    <div>
      <SectionHead title="Build Roadmap" sub="Only add complexity when users demand it" />
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {phases.map(ph => {
          const s = ss[ph.status];
          return (
            <Card key={ph.id} style={{ padding:"18px 20px", borderLeft:`4px solid ${s.color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{ph.label}: {ph.name}</span>
                    <Pill label={s.label} bg={s.bg} color={s.color} />
                  </div>
                  <div style={{ fontSize:12, color:C.muted }}>{ph.goal}</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Pill label={ph.cost} bg="#F1F5F9" color={C.text} />
                  <Pill label={`${ph.customers} customers`} bg="#F1F5F9" color={C.muted} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Build</div>
                  {ph.items.map((item,i) => (
                    <div key={i} style={{ display:"flex", gap:6, marginBottom:4, fontSize:12, color:C.text }}>
                      <span style={{ color:ph.status==="current"?C.green:C.slate, flexShrink:0 }}>{ph.status==="current"?"✓":"○"}</span>{item}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Stack</div>
                  {ph.stack.map((s,i) => <div key={i} style={{ display:"flex", gap:6, marginBottom:4, fontSize:12, color:C.muted }}><span>▸</span>{s}</div>)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div style={{ marginTop:16, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:10, padding:"14px 18px" }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.green, marginBottom:5 }}>Unit Economics</div>
        <div style={{ fontSize:12, color:"#14532D" }}>At the Growth plan ($149/month per firm), infra cost per firm at 100 customers is ~$1–2/month. Gross margin on infrastructure exceeds 98%. <strong>The business risk is product-market fit, not infrastructure cost.</strong></div>
      </div>
    </div>
  );
}

// ─── WHY US ───────────────────────────────────────────────────────────────────
function WhyUsPage() {
  const rows = [
    { feature:"Canada-first CRA deadlines",   uku:"Manual setup",   taxt:"Generic",      us:"Native · built in" },
    { feature:"Workflow intelligence",         uku:"Linear tasks",   taxt:"Linear tasks", us:"Decision-aware branching" },
    { feature:"At Risk algorithm",             uku:"Simple overdue", taxt:"Basic flag",   us:"5-condition predictive per workflow" },
    { feature:"Gate enforcement",              uku:"None",           taxt:"None",         us:"Hard stops with reasons" },
    { feature:"Document reminders",            uku:"Manual",         taxt:"Basic",        us:"Automated escalation sequence" },
    { feature:"Setup time for first workflow", uku:"Days",           taxt:"Hours",        us:"Minutes (prebuilt)" },
    { feature:"Sole prop branching logic",     uku:"No",             taxt:"No",           us:"Yes (simplified checklist)" },
    { feature:"Pricing for Ontario firms",     uku:"$49+ USD/user",  taxt:"$99+ USD/user",us:"Flat CAD, firm pricing" },
  ];
  return (
    <div>
      <SectionHead title="Why Us vs Uku / TaxDome" sub="Use this in every sales conversation and demo" />
      <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.green, marginBottom:6 }}>Positioning Statement</div>
        <div style={{ fontSize:13, color:"#14532D", fontStyle:"italic" }}>"Uku and TaxDome are good products built for large markets. We're built specifically for Canadian accounting firms — CRA deadlines are native, GST workflows are prebuilt, and the system tells you what's at risk before it becomes a problem. You're live in an afternoon, not a week."</div>
      </div>
      <div style={{ background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.amber, marginBottom:6 }}>Core Emotional Hook</div>
        <div style={{ fontSize:13, color:"#7C2D12", fontStyle:"italic", marginBottom:4 }}>"Most firms don't miss deadlines because they don't care — they miss them because they lose track."</div>
        <div style={{ fontSize:13, color:"#7C2D12", fontStyle:"italic" }}>"We don't track work. We predict risk."</div>
      </div>
      <Card style={{ overflow:"hidden", marginBottom:20 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F8FAFC" }}>
              {["Feature","Uku","TaxDome","AcctOS"].map((h,i) => (
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, fontWeight:600, color:i===3?C.primary:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} style={{ background:i%2===0?"white":"#FAFAFA" }}>
                <td style={{ padding:"10px 16px", fontSize:13, fontWeight:500, color:C.text }}>{r.feature}</td>
                <td style={{ padding:"10px 16px", fontSize:13, color:C.muted }}>{r.uku}</td>
                <td style={{ padding:"10px 16px", fontSize:13, color:C.muted }}>{r.taxt}</td>
                <td style={{ padding:"10px 16px", fontSize:13, color:C.green, fontWeight:600 }}>✓ {r.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Demo Script — 5 Steps</div>
      {[
        ["Dashboard","Here are your clients this month. One on track, one at risk, one overdue. You see it all in one place the moment you log in."],
        ["Sunrise Bakery (At Risk)","Documents still missing, reminder sent twice. Open the client — you can see the hard stop right on the stage. It literally says 'this cannot proceed'. The system flagged it — you didn't have to notice yourself."],
        ["Patel & Sons (Overdue)","This one was missed. Open it — the filing stage shows 'Missed' with a penalty risk banner. You can act today instead of finding out at year-end."],
        ["Maple Contracting (On Track)","This one is fine. Bookkeeping done, docs in, prep underway. Nothing for you to do."],
        ["Workflow Intelligence","Corporation? ITC reconciliation added automatically. GST > $10k? Dual review gate. Refund? Justification required. It's not a to-do list — it knows the rules and it enforces them."],
      ].map(([step,line],i) => (
        <div key={i} style={{ display:"flex", gap:12, marginBottom:12 }}>
          <div style={{ width:24, height:24, borderRadius:"50%", background:C.primaryBg, color:C.primary, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{step}</div>
            <div style={{ fontSize:13, color:C.muted, fontStyle:"italic", marginTop:2 }}>"{line}"</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsPage() {
  const [plan, setPlan] = useState("Growth");
  const [rules, setRules] = useState({ autoCreate:true, docReminder:true, escalate:true, deadlineAlert:true, overdueFlag:true });
  const toggle = k => setRules(r => ({...r,[k]:!r[k]}));
  return (
    <div>
      <SectionHead title="Settings" sub="Firm profile, billing, and automation preferences" />
      {[
        { title:"Firm Profile", content:(
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[["Firm Name","Jensen & Associates CPA"],["Primary Email","mark@jensenaccounting.ca"],["Province","Ontario, Canada"],["CRA Business Number","123456789 RT0001"]].map(([l,v]) => (
              <div key={l}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>{l}</label>
                <input defaultValue={v} style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, color:C.text, boxSizing:"border-box", outline:"none" }} />
              </div>
            ))}
          </div>
        )},
        { title:"Billing Plan", content:(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            {[["Starter","$49/mo","50 clients","2 users",false],["Growth","$149/mo","150 clients","5 users",true],["Scale","$299/mo","Unlimited","Unlimited",false]].map(([name,price,clients,users,rec]) => (
              <div key={name} onClick={() => setPlan(name)} style={{ border:`2px solid ${plan===name?C.primary:C.border}`, borderRadius:10, padding:"14px", cursor:"pointer", background:plan===name?C.primaryBg:"white" }}>
                <div style={{ fontSize:14, fontWeight:700, color:plan===name?C.primary:C.text }}>{name}</div>
                <div style={{ fontSize:22, fontWeight:700, color:C.text, margin:"5px 0" }}>{price}</div>
                <div style={{ fontSize:12, color:C.muted }}>{clients}</div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:rec?8:0 }}>{users}</div>
                {rec && <Pill label="Recommended" bg={C.primaryBg} color={C.primary} />}
              </div>
            ))}
          </div>
        )},
        { title:"Automation Rules", content:(
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {[["autoCreate","Auto-create workflows at billing cycle start"],["docReminder","Send document reminders after 3 days"],["escalate","Escalate to owner on Reminder #2"],["deadlineAlert","Deadline alerts 3 days before CRA due date"],["overdueFlag","Flag overdue clients on dashboard"]].map(([k,label]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:C.text }}>{label}</span>
                <div onClick={() => toggle(k)} style={{ width:40, height:22, borderRadius:11, background:rules[k]?C.primary:C.border, cursor:"pointer", position:"relative" }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", background:"white", position:"absolute", top:3, left:rules[k]?21:3, transition:"left 0.15s" }} />
                </div>
              </div>
            ))}
          </div>
        )},
      ].map(s => (
        <Card key={s.title} style={{ padding:"18px 20px", marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:14 }}>{s.title}</div>
          {s.content}
        </Card>
      ))}
      <Btn variant="primary">Save Changes</Btn>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]       = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const clients = useClients();
  const urgent  = clients.filter(c => c.status==="At Risk"||c.status==="Overdue").length;

  const nav = [
    { id:"dashboard",    label:"Command Centre", icon:"⊞" },
    { id:"clients",      label:"Clients",        icon:"👥" },
    { id:"allworkflows", label:"Workflows",      icon:"⚡" },
    { id:"deadlines",    label:"Deadlines",      icon:"📅" },
    { id:"templates",    label:"Templates",      icon:"🗂" },
    { id:"whyus",        label:"Why Us",         icon:"⚔️" },
    { id:"roadmap",      label:"Roadmap",        icon:"📍" },
    { id:"settings",     label:"Settings",       icon:"⚙" },
  ];

  const onSelect = c => { setSelected(c); setView("client"); };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"'Inter', system-ui, sans-serif" }}>
      <div style={{ width:210, background:C.card, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh", flexShrink:0 }}>
        <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:C.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"white", fontWeight:700 }}>A</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.2 }}>AcctOS</div>
              <div style={{ fontSize:10, color:C.muted }}>Jensen & Associates</div>
            </div>
          </div>
        </div>
        <nav style={{ padding:"10px 8px", flex:1, overflowY:"auto" }}>
          {nav.map(item => {
            const active = view===item.id||(item.id==="clients"&&view==="client");
            return (
              <button key={item.id} onClick={() => { setView(item.id); setSelected(null); }}
                style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"7px 10px", borderRadius:7, border:"none", cursor:"pointer", textAlign:"left", background:active?C.primaryBg:"none", color:active?C.primary:C.text, fontSize:13, fontWeight:active?600:400, marginBottom:1 }}
                onMouseEnter={e => { if(!active) e.currentTarget.style.background="#F8FAFC"; }}
                onMouseLeave={e => { if(!active) e.currentTarget.style.background="none"; }}
              >
                <span style={{ fontSize:13 }}>{item.icon}</span>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.id==="dashboard"&&urgent>0 && (
                  <span style={{ background:C.red, color:"white", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:10 }}>{urgent}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name="Patrick W." size={26} />
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:C.text }}>Patrick W.</div>
              <div style={{ fontSize:10, color:C.muted }}>Owner · Growth Plan</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex:1, padding:"28px 32px", overflowY:"auto", maxWidth:1000 }}>
        {view==="dashboard"    && <Dashboard clients={clients} onSelect={onSelect} setView={setView} />}
        {view==="clients"      && <ClientList clients={clients} onSelect={onSelect} />}
        {view==="client"       && selected && <ClientWorkspace client={selected} onBack={() => { setSelected(null); setView("dashboard"); }} />}
        {view==="allworkflows" && <AllWorkflows clients={clients} onSelectClient={onSelect} />}
        {view==="deadlines"    && <DeadlinesView clients={clients} onSelectClient={onSelect} />}
        {view==="templates"    && <WorkflowTemplates />}
        {view==="whyus"        && <WhyUsPage />}
        {view==="roadmap"      && <RoadmapPage />}
        {view==="settings"     && <SettingsPage />}
      </div>
    </div>
  );
}
