"use client";
import { useState, useMemo, useEffect } from "react";

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

const TODAY = new Date();
function daysFrom(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }
function fmtDate(d) { return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" }); }
function fmtLong(d) { return new Date(d).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }); }

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

function useClients(refreshKey = 0) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/api/clients', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
      .then(json => {
        if (!json.data) throw new Error("No data in response");
        const mapped = json.data.map(c => ({
          ...c,
          type:           c.client_type  ?? c.type,
          freq:           c.filing_freq  ?? c.freq,
          assigned:       c.assigned_to  ?? c.assigned,
          assigned_user:  c.assigned_user,
          status:         c.computed_status  ?? c.status  ?? "On Track",
          flags:          c.computed_flags   ?? c.flags   ?? [],
          daysToDeadline: c.days_to_deadline ?? c.daysToDeadline ?? null,
          score:          c.risk_score       ?? c.score   ?? 0,
          riskHistory:    c.risk_history     ?? c.riskHistory ?? false,
          penaltyRisk:    c.penalty_risk     ?? c.penaltyRisk ?? null,
          netGst:         c.net_gst          ?? c.netGst  ?? null,
          activeWf: c.active_workflow ? {
            ...c.active_workflow,
            stages:     c.active_workflow.stages ?? [],
            tasks:      c.active_workflow.tasks  ?? [],
            docs:       c.active_workflow.documents ?? c.active_workflow.docs ?? [],
            stageNotes: c.active_workflow.stage_notes ?? {},
            curStage:   c.active_workflow.cur_stage ?? 1,
            taskInProgressDays: c.active_workflow.task_in_progress_days ?? 0,
            cycleStart: c.active_workflow.cycle_start ? new Date(c.active_workflow.cycle_start) : null,
            deadline:   c.active_workflow.deadline    ? new Date(c.active_workflow.deadline)    : null,
            computed: {
              status: c.active_workflow.computed_status ?? "On Track",
              flags:  c.active_workflow.computed_flags  ?? [],
            },
            daysToDeadline: c.active_workflow.days_to_deadline ?? null,
          } : null,
          workflows: (c.workflows ?? []).map(wf => ({
            ...wf,
            stages:     (wf.stages ?? []).sort((a, b) => (a.n ?? 0) - (b.n ?? 0)),
            tasks:      (wf.tasks ?? []).sort((a, b) => (a.stage_n ?? 0) - (b.stage_n ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
            docs:       wf.documents ?? wf.docs ?? [],
            stageNotes: wf.stage_notes ?? {},
            curStage:   wf.cur_stage   ?? 1,
            taskInProgressDays: wf.task_in_progress_days ?? 0,
            cycleStart: wf.cycle_start ? new Date(wf.cycle_start) : null,
            deadline:   wf.deadline    ? new Date(wf.deadline)    : null,
            computed: {
              status: wf.computed_status ?? "On Track",
              flags:  wf.computed_flags  ?? [],
            },
            daysToDeadline: wf.days_to_deadline ?? null,
          })),
        }));
        setClients(mapped);
        setError(null);
      })
      .catch(err => {
        console.error("useClients fetch failed:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return { clients, loading, error };
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

// ─── STAGE ACTOR HELPER ───────────────────────────────────────────────────────
function getStageActor(stageN, client) {
  const isDualReview = client.netGst > 10000;
  const actors = {
    1: { action: "Confirm bookkeeping is complete in QBO",                          role: "Accountant", who: "KS / JR" },
    2: { action: "Mark all required documents as received",                         role: "Admin",      who: "RH" },
    3: { action: client.type==="Corporation" ? "Complete draft return — ITC reconciliation required first" : "Complete draft return — simplified checklist", role: "Accountant", who: "KS / JR" },
    4: { action: isDualReview ? "Dual approval required — accountant + senior CPA both must sign off" : "Review draft return and approve", role: isDualReview ? "Accountant + Owner" : "Senior CPA", who: isDualReview ? "KS + PW" : "PW" },
    5: { action: "Submit return to CRA",                                             role: "Accountant", who: "KS / JR" },
    6: { action: "Record CRA confirmation number to close workflow",                 role: "Accountant", who: "KS / JR" },
  };
  return actors[stageN] || { action: "Advance stage", role: "Accountant", who: "KS / JR" };
}


// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:"relative", display:"inline-flex", alignItems:"center" }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ width:15, height:15, borderRadius:"50%", background:C.primaryBg, color:C.primary, fontSize:9, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:"help", marginLeft:5, flexShrink:0 }}
      >i</span>
      {show && (
        <span style={{ position:"absolute", left:20, top:-4, background:"#1E293B", color:"white", fontSize:11, lineHeight:1.5, padding:"6px 10px", borderRadius:7, width:220, zIndex:999, pointerEvents:"none", whiteSpace:"pre-wrap", boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── FIELD HELP CONTENT ───────────────────────────────────────────────────────
const FIELD_HELP = {
  // Client fields
  client_name:  "Full legal name of the business or individual. For corporations, use the registered name. For sole proprietors, use the business operating name.",
  entity_type:  "Corporation: incorporated business (Inc., Ltd., Corp.)\nSole prop: unincorporated individual business\nPartnership: two or more people in business together",
  filing_freq:  "Monthly: large businesses (>$1.5M annual taxable supplies)\nQuarterly: medium businesses ($1.5M–$6M)\nAnnual: small businesses (<$1.5M)",
  city:         "City and province where the business operates. Used for CRA timezone and deadline calculations.",
  client_since: "Year you started working with this client. Helps track relationship history.",
  bn:           "Canada Revenue Agency Business Number. Format: 123456789 RT0001. The RT0001 suffix identifies the GST/HST account. Leave blank if unknown.",
  net_gst:      "Expected net GST/HST amount for this filing period. Used to determine if dual review is required (>$10,000 triggers mandatory second sign-off).",
  // Workflow fields
  wf_type_gst:  "GST/HST: 6-stage CRA filing workflow. Auto-generates bookkeeping, document collection, preparation, review, filing, and confirmation stages.",
  wf_type_t2:   "T2: Corporate income tax return. Annual filing, typically 6 months after fiscal year end.",
  wf_type_t1:   "T1: Personal income tax return. Annual, due April 30 (or June 15 for self-employed).",
  wf_type_payroll: "Payroll Remittances: monthly or bi-weekly CRA payroll deduction remittances. Penalty-sensitive — late remittances compound quickly.",
  wf_type_bookkeeping: "Monthly Bookkeeping: reconciliation and review cycle. Can be linked to auto-advance GST Stage 1 when complete.",
  period:       "Human-readable label for this filing period. Examples: 'October 2026', 'Q3 2026 (Jul–Sep)', 'FY 2026', 'Apr 2026'",
  cycle_start:  "First day of the period being filed. Used by the At Risk engine to calculate Day 12 timeline breach (C1 condition).",
  deadline:     "CRA filing deadline for this period.\nGST Monthly: last day of following month\nGST Quarterly: last day of month after quarter-end\nT2: 6 months after fiscal year-end\nPayroll: 15th of following month",
};

// ─── ADD CLIENT MODAL ────────────────────────────────────────────────────────
const WF_TYPES = ["GST/HST","T2","T1","Payroll","Bookkeeping"];
const CLIENT_TYPES = ["Corporation","Sole prop","Partnership"];
const FREQ_OPTIONS = ["Monthly","Quarterly","Annual"];

function AddClientModal({ onClose, onSaved }) {
  const [step, setStep]   = useState(1); // 1=client info, 2=workflow
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [newClientId, setNewClientId] = useState(null);

  const [form, setForm] = useState({
    name:"", type:"Corporation", freq:"Monthly", city:"", since: new Date().getFullYear().toString(), bn:"", net_gst:"",
  });
  const [wfForm, setWfForm] = useState({
    type:"GST/HST", period:"", deadline:"", cycle_start:"",
  });

  function setF(k,v){ setForm(p=>({...p,[k]:v})); }
  function setW(k,v){ setWfForm(p=>({...p,[k]:v})); }

  async function saveClient() {
    if (!form.name.trim()) { setError("Client name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/clients", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, net_gst: form.net_gst ? Number(form.net_gst) : null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create client."); return; }
      setNewClientId(data.id);
      setStep(2);
    } catch(e){ setError("Network error."); }
    finally{ setSaving(false); }
  }

  async function saveWorkflow() {
    if (!wfForm.type || !wfForm.period || !wfForm.deadline || !wfForm.cycle_start) {
      setError("All workflow fields are required."); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ client_id: newClientId, ...wfForm }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create workflow."); return; }
      onSaved(); onClose();
    } catch(e){ setError("Network error."); }
    finally{ setSaving(false); }
  }

  const inp = (label, key, formObj, setFn, type="text", opts=null, helpKey=null) => (
    <div key={key}>
      <label style={{ display:"flex", alignItems:"center", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>
        {label}
        {helpKey && FIELD_HELP[helpKey] && <Tooltip text={FIELD_HELP[helpKey]} />}
      </label>
      {opts
        ? <select value={formObj[key]} onChange={e=>setFn(key,e.target.value)}
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", background:"white" }}>
            {opts.map(o=><option key={o}>{o}</option>)}
          </select>
        : <input type={type} value={formObj[key]} onChange={e=>setFn(key,e.target.value)}
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", boxSizing:"border-box" }} />
      }
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"white", borderRadius:14, padding:"28px 32px", width:480, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Add New Client</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Step {step} of 2 — {step===1?"Client Info":"First Workflow"}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:C.muted, cursor:"pointer" }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {[1,2].map(s=>(
            <div key={s} style={{ flex:1, height:4, borderRadius:2, background:step>=s?C.primary:C.border }} />
          ))}
        </div>

        {error && <div style={{ background:C.redBg, border:`1px solid #FCA5A5`, borderRadius:8, padding:"8px 12px", fontSize:12, color:C.red, marginBottom:14 }}>{error}</div>}

        {step===1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {inp("Client / Business Name","name",form,setF,"text",null,"client_name")}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {inp("Entity Type","type",form,setF,"text",CLIENT_TYPES,"entity_type")}
              {inp("Filing Frequency","freq",form,setF,"text",FREQ_OPTIONS,"filing_freq")}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {inp("City","city",form,setF,"text",null,"city")}
              {inp("Client Since (year)","since",form,setF,"text",null,"client_since")}
            </div>
            {inp("CRA Business Number (BN)","bn",form,setF,"text",null,"bn")}
            {inp("Net GST Amount (optional)","net_gst",form,setF,"number",null,"net_gst")}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:6 }}>
              <Btn onClick={onClose}>Cancel</Btn>
              <button onClick={saveClient} disabled={saving}
                style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
                {saving?"Saving…":"Next: Add Workflow →"}
              </button>
            </div>
          </div>
        )}

        {step===2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:C.greenBg, border:"1px solid #BBF7D0", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#14532D" }}>
              ✓ Client created. Now add their first workflow — stages and tasks will be created automatically from the template.
            </div>
            {inp("Workflow Type","type",wfForm,setW,"text",WF_TYPES,"wf_type_gst")}
            {inp("Period Label","period",wfForm,setW,"text",null,"period")}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {inp("Cycle Start","cycle_start",wfForm,setW,"date",null,"cycle_start")}
              {inp("CRA Deadline","deadline",wfForm,setW,"date",null,"deadline")}
            </div>
            <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#0369A1" }}>
              💡 Stages, tasks, and document checklist will be auto-generated from the {wfForm.type} template for a {form.type}.
              {FIELD_HELP[`wf_type_${wfForm.type.toLowerCase().replace("/","").replace(" ","_")}`] &&
                <div style={{ marginTop:5, color:"#0369A1" }}>{FIELD_HELP[`wf_type_${wfForm.type.toLowerCase().replace("/","").replace(" ","_")}`]}</div>
              }
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginTop:6 }}>
              <Btn onClick={() => { onSaved(); onClose(); }}>Skip workflow for now</Btn>
              <button onClick={saveWorkflow} disabled={saving}
                style={{ background:C.green, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
                {saving?"Creating…":"Create Workflow ✓"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ clients, onSelect, setView, onAddClient }) {
  const [wfTypeFilter, setWfTypeFilter] = useState("All");

  // Collect all unique workflow types across all clients
  const allWfTypes = ["All", ...Array.from(new Set(
    clients.flatMap(c => (c.workflows||[]).map(w => w.type))
  )).sort()];

  // Filter clients by workflow type
  const filteredClients = wfTypeFilter === "All"
    ? clients
    : clients.filter(c => (c.workflows||[]).some(w => w.type === wfTypeFilter));

  const cnt = {
    all:      filteredClients.length,
    ontrack:  filteredClients.filter(c => c.status==="On Track").length,
    atrisk:   filteredClients.filter(c => c.status==="At Risk").length,
    overdue:  filteredClients.filter(c => c.status==="Overdue").length,
    complete: filteredClients.filter(c => c.status==="Complete").length,
  };
  const spotlights = filteredClients.filter(c => c.status !== "Complete").slice(0,3);
  const soonAtRisk = filteredClients.filter(c => c.status==="On Track" && c.daysToDeadline!=null && c.daysToDeadline<=5 && c.daysToDeadline>=0);
  const tiles = [
    { label:"Active Filings", value:cnt.all-cnt.complete, color:C.primary, bg:C.primaryBg },
    { label:"On Track",       value:cnt.ontrack,  color:C.green, bg:C.greenBg },
    { label:"At Risk",        value:cnt.atrisk,   color:C.amber, bg:C.amberBg },
    { label:"Overdue",        value:cnt.overdue,  color:C.red,   bg:C.redBg },
  ];

  return (
    <div>
      <SectionHead title="Command Centre" sub={`${new Date().toLocaleDateString("en-CA",{month:"long",year:"numeric"})} · ${cnt.all} active clients · Ontario (CRA timezone)`}
        action={<>
          <button onClick={onAddClient}
            style={{ background:C.green, color:"white", border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            + Add Client
          </button>
          <Btn onClick={() => setView("deadlines")}>📅 Deadlines</Btn>
          <Btn onClick={() => setView("allworkflows")}>⚡ All Workflows</Btn>
          <Btn variant="primary" onClick={() => setView("clients")}>All Clients →</Btn>
        </>}
      />
      {/* Workflow type filter tabs */}
      {allWfTypes.length > 2 && (
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {allWfTypes.map(t => (
            <button key={t} onClick={() => setWfTypeFilter(t)}
              style={{ padding:"5px 14px", borderRadius:20, border:`1px solid ${wfTypeFilter===t?C.primary:C.border}`, background:wfTypeFilter===t?C.primary:"white", color:wfTypeFilter===t?"white":C.text, fontSize:12, fontWeight:wfTypeFilter===t?600:400, cursor:"pointer" }}>
              {t}
              {t !== "All" && (
                <span style={{ marginLeft:5, background:wfTypeFilter===t?"rgba(255,255,255,0.25)":C.primaryBg, color:wfTypeFilter===t?"white":C.primary, fontSize:10, fontWeight:700, padding:"1px 5px", borderRadius:8 }}>
                  {clients.filter(c=>(c.workflows||[]).some(w=>w.type===t)).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
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
              const u  = cl.assigned_user;
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
  const counts = {
    All: clients.length,
    "On Track": clients.filter(c => c.status==="On Track").length,
    "At Risk":  clients.filter(c => c.status==="At Risk").length,
    "Overdue":  clients.filter(c => c.status==="Overdue").length,
    "Complete": clients.filter(c => c.status==="Complete").length,
  };
  const filterColors = { "At Risk": C.amber, "Overdue": C.red, "On Track": C.green, "Complete": C.green, "All": C.primary };
  return (
    <div>
      <SectionHead title="All Clients" sub={`${clients.length} clients on file`} />
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…"
          style={{ flex:1, padding:"8px 14px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:"none" }} />
        <div style={{ display:"flex", gap:4 }}>
          {["All","On Track","At Risk","Overdue","Complete"].map(s => {
            const active = f===s;
            const badgeColor = filterColors[s];
            return (
              <button key={s} onClick={() => setF(s)}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:`1px solid ${active?C.primary:C.border}`, background:active?C.primary:"white", color:active?"white":C.text, fontSize:13, fontWeight:500, cursor:"pointer" }}>
                {s}
                <span style={{ background:active?"rgba(255,255,255,0.25)":(s==="At Risk"?C.amberBg:s==="Overdue"?C.redBg:s==="Complete"||s==="On Track"?C.greenBg:C.primaryBg), color:active?"white":badgeColor, fontSize:11, fontWeight:700, padding:"1px 6px", borderRadius:10, minWidth:18, textAlign:"center" }}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map(cl => {
          const wf = cl.activeWf;
          const u  = cl.assigned_user;
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
                {wf && <div style={{ fontSize:12, color:C.muted }}>{cl.daysToDeadline==null?"—":cl.daysToDeadline<0?`${Math.abs(cl.daysToDeadline)}d overdue`:`${cl.daysToDeadline}d to deadline`}</div>}
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

// ─── WORKFLOW TAB (with live stage advancement) ───────────────────────────────
function WorkflowTab({ wf, wfComputed, client, stageCfg, onRefresh }) {
  const [stageData, setStageData] = useState(() => (wf.stages||[]).map(s => ({...s})));
  const [confirmInput, setConfirmInput] = useState("");
  const [saving, setSaving] = useState(null); // stageN being saved
  const [saveError, setSaveError] = useState(null);
  const [advanced, setAdvanced] = useState(null);

  // Reset when workflow changes
  const wfId = wf.id;
  const [lastWfId, setLastWfId] = useState(wfId);
  if (wfId !== lastWfId) {
    setStageData((wf.stages||[]).map(s => ({...s})));
    setLastWfId(wfId); setAdvanced(null); setSaveError(null);
  }

  async function advanceStage(stageN, opts={}) {
    const stage = stageData.find(s => s.n === stageN);
    if (!stage?.id) {
      setSaveError("Stage ID missing — data may not have loaded from DB yet.");
      return;
    }
    setSaving(stageN);
    setSaveError(null);
    try {
      const body = { status: "complete" };
      if (opts.cra_confirmation) body.cra_confirmation = opts.cra_confirmation;
      if (opts.dual_review_confirmed) body.dual_review_confirmed = true;

      const res = await fetch(`/api/stages/${stage.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.gate_reason || data.error || "Failed to advance stage.");
        return;
      }

      // Optimistic update while refetch happens
      setStageData(prev => prev.map(s => {
        if (s.n === stageN)     return {...s, status:"complete"};
        if (s.n === stageN + 1) return {...s, status:"in_progress"};
        return s;
      }));
      setAdvanced(stageN);
      setConfirmInput("");

      // Refetch clients so dashboard + status badges update
      if (onRefresh) onRefresh();
    } catch(e) {
      setSaveError("Network error — check your connection.");
    } finally {
      setSaving(null);
    }
  }

  if ((stageData||[]).length === 0)
    return (
      <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:8, padding:"16px 20px", textAlign:"center" }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.amber, marginBottom:4 }}>⚠ No stage data loaded from database</div>
        <div style={{ fontSize:12, color:C.muted }}>This workflow has no stages in Supabase yet. Create the workflow via POST /api/workflows to auto-generate stages from the template.</div>
      </div>
    );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{wf.label} — Stage Timeline</div>
        {wfComputed.status && <StatusBadge status={wfComputed.status} small />}
      </div>

      {advanced !== null && (
        <div style={{ background:C.greenBg, border:"1px solid #BBF7D0", borderRadius:8, padding:"9px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <span>✓</span>
          <span style={{ fontSize:13, color:"#14532D", fontWeight:500 }}>Stage {advanced} completed — Stage {advanced+1} is now active</span>
          <span style={{ fontSize:12, color:C.green, marginLeft:"auto" }}>Saved to DB</span>
        </div>
      )}

      {saveError && (
        <div style={{ background:C.redBg, border:"1px solid #FCA5A5", borderRadius:8, padding:"9px 14px", marginBottom:14, fontSize:13, color:C.red }}>
          🔒 {saveError}
        </div>
      )}

      {!wf.id && (
        <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:8, padding:"9px 14px", marginBottom:14, fontSize:12, color:C.amber }}>
          ⚠ This workflow has no database ID — stage advancement is disabled. Ensure data comes from /api/clients.
        </div>
      )}

      {stageData.map((s, i) => {
        const cfg      = stageCfg[s.status] || stageCfg.pending;
        const gate     = evaluateGate(s, {...wf, stages: stageData}, client);
        const isActive = s.status === "in_progress";
        const actor    = getStageActor(s.n, client);
        const isSaving = saving === s.n;

        return (
          <div key={s.id || i} style={{ display:"flex" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginRight:14, width:24 }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:cfg.bg, border:`2px solid ${cfg.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:cfg.color, fontWeight:700, flexShrink:0 }}>
                {isSaving ? "…" : s.status==="complete"?"✓":s.status==="missed"?"✕":s.status==="blocked"?"🔒":i+1}
              </div>
              {i < stageData.length-1 && <div style={{ width:2, flex:1, minHeight:14, background:s.status==="complete"?C.green:C.border, margin:"2px 0" }} />}
            </div>

            <div style={{ flex:1, paddingBottom:16, paddingTop:2 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <span style={{ fontSize:13, fontWeight:500, color:C.text }}>Stage {i+1}: {s.name}</span>
                <Pill label={cfg.label} bg={cfg.bg} color={cfg.color} />
              </div>
              {s.date && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.date}</div>}
              {s.note && <div style={{ fontSize:11, color:C.primary, marginTop:2 }}>↳ {s.note}</div>}
              {s.gate_label && <div style={{ fontSize:11, color:C.slate, marginTop:3 }}>🔒 {s.gate_label}</div>}
              <GateBanner gate={gate} />

              {/* ACTION FOOTER — active, unblocked, not stage 6 */}
              {isActive && !gate?.locked && s.n < 6 && (
                <div style={{ marginTop:10, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#14532D", marginBottom:2 }}>{actor.action}</div>
                      <div style={{ fontSize:11, color:"#16A34A" }}>👤 {actor.role} · {actor.who}</div>
                      {!s.id && <div style={{ fontSize:10, color:C.amber, marginTop:2 }}>⚠ No DB id — will not save</div>}
                    </div>
                    <button onClick={() => advanceStage(s.n)} disabled={isSaving || !s.id}
                      style={{ background:isSaving?"#D1FAE5":C.green, color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:isSaving||!s.id?"not-allowed":"pointer", opacity:isSaving?0.7:1 }}>
                      {isSaving ? "Saving…" : `Complete Stage ${s.n} →`}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage 6 — CRA confirmation */}
              {isActive && s.n === 6 && !gate?.locked && (
                <div style={{ marginTop:10, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:8, padding:"10px 14px" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#14532D", marginBottom:8 }}>Record CRA confirmation number to close workflow</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
                      placeholder="e.g. RT2025-48291"
                      style={{ flex:1, padding:"7px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none" }} />
                    <button onClick={() => confirmInput.trim() && advanceStage(6, { cra_confirmation: confirmInput.trim() })}
                      disabled={!confirmInput.trim() || isSaving || !s.id}
                      style={{ background:confirmInput.trim()&&!isSaving?C.green:"#D1FAE5", color:confirmInput.trim()&&!isSaving?"white":"#6EE7B7", border:"none", borderRadius:8, padding:"7px 16px", fontSize:13, fontWeight:600, cursor:confirmInput.trim()&&!isSaving&&s.id?"pointer":"not-allowed" }}>
                      {isSaving ? "Saving…" : "Close Workflow ✓"}
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:"#16A34A", marginTop:6 }}>👤 Accountant · {client.assigned_user?.initials || client.assigned}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── TIME TRACKING TAB ────────────────────────────────────────────────────────
function TimeTrackingTab({ wf, client }) {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [runningEntry, setRunning]    = useState(null);
  const [elapsed, setElapsed]         = useState(0);
  const [showManual, setShowManual]   = useState(false);
  const [manualMins, setManualMins]   = useState("");
  const [manualNote, setManualNote]   = useState("");
  const [saving, setSaving]           = useState(false);
  const timerRef                       = useRef(null);

  const wfId = wf?.id;

  // Load entries
  useEffect(() => {
    if (!wfId) return;
    setLoading(true);
    fetch(`/api/time-entries?workflow_id=${wfId}`, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        setEntries(json.data ?? []);
        const running = (json.data ?? []).find(e => e.running);
        setRunning(running ?? null);
      })
      .finally(() => setLoading(false));
  }, [wfId]);

  // Tick elapsed seconds for running timer
  useEffect(() => {
    if (!runningEntry) { clearInterval(timerRef.current); return; }
    setElapsed(Math.round((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000));
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [runningEntry]);

  async function startTimer() {
    if (!wfId) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/time-entries", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"start", workflow_id: wfId, client_id: client?.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunning(data.data);
        setEntries(prev => [{ ...data.data, running:true, computed_minutes:0 }, ...prev]);
      }
    } finally { setSaving(false); }
  }

  async function stopTimer() {
    if (!runningEntry?.id) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/time-entries", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"stop", entry_id: runningEntry.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunning(null);
        setElapsed(0);
        setEntries(prev => prev.map(e => e.id === runningEntry.id
          ? { ...e, running:false, stopped_at:data.data.stopped_at, computed_minutes: data.duration_minutes }
          : e
        ));
      }
    } finally { setSaving(false); }
  }

  async function logManual() {
    const mins = parseInt(manualMins);
    if (!mins || mins <= 0 || !wfId) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/time-entries", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"log", workflow_id: wfId, client_id: client?.id, duration_minutes: mins, note: manualNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setEntries(prev => [{ ...data.data, computed_minutes: mins, running:false }, ...prev]);
        setManualMins(""); setManualNote(""); setShowManual(false);
      }
    } finally { setSaving(false); }
  }

  async function deleteEntry(id) {
    await fetch(`/api/time-entries?entry_id=${id}`, { method:"DELETE", credentials:"include" });
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  const totalMins = entries.filter(e => e.billable !== false).reduce((s, e) => s + (e.computed_minutes ?? 0), 0);
  const fmtTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };
  const fmtMins = (m) => {
    if (!m) return "0m";
    const h = Math.floor(m / 60), rem = m % 60;
    return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Time Tracking</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Total billable: {fmtMins(totalMins)}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => setShowManual(v=>!v)}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, color:C.muted, cursor:"pointer" }}>
            + Manual
          </button>
          {!runningEntry
            ? <button onClick={startTimer} disabled={saving}
                style={{ background:C.primary, color:"white", border:"none", borderRadius:7, padding:"6px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                ▶ Start Timer
              </button>
            : <button onClick={stopTimer} disabled={saving}
                style={{ background:C.red, color:"white", border:"none", borderRadius:7, padding:"6px 14px", fontSize:13, fontWeight:600, cursor:"pointer", minWidth:140 }}>
                ⏹ Stop — {fmtTime(elapsed)}
              </button>
          }
        </div>
      </div>

      {/* Running timer banner */}
      {runningEntry && (
        <div style={{ background:C.amberBg, border:"1px solid #FCD34D", borderRadius:8, padding:"9px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>⏱</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.amber }}>Timer running — {fmtTime(elapsed)}</div>
            <div style={{ fontSize:11, color:C.muted }}>Started {new Date(runningEntry.started_at).toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"})}</div>
          </div>
        </div>
      )}

      {/* Manual entry form */}
      {showManual && (
        <Card style={{ padding:"14px 16px", marginBottom:12, background:"#F8FAFC" }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:10 }}>Log time manually</div>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <input type="number" min="1" placeholder="Minutes" value={manualMins}
              onChange={e => setManualMins(e.target.value)}
              style={{ width:90, padding:"6px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13 }} />
            <input type="text" placeholder="Note (optional)" value={manualNote}
              onChange={e => setManualNote(e.target.value)}
              style={{ flex:1, padding:"6px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13 }} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={logManual} disabled={!manualMins || saving}
              style={{ background:C.primary, color:"white", border:"none", borderRadius:7, padding:"6px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              Log {manualMins ? fmtMins(parseInt(manualMins)) : ""}
            </button>
            <button onClick={() => setShowManual(false)}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"6px 12px", fontSize:12, color:C.muted, cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* Entries list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:20, color:C.muted, fontSize:13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign:"center", padding:24, color:C.muted }}>
          <div style={{ fontSize:28, marginBottom:8 }}>⏱</div>
          <div style={{ fontSize:13 }}>No time logged yet. Start a timer or log manually.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {entries.map(e => (
            <div key={e.id} style={{ background:e.running?"#FFFBEB":"white", border:`1px solid ${e.running?"#FCD34D":C.border}`, borderRadius:8, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>
                  {e.running ? `⏱ Running — ${fmtTime(elapsed)}` : fmtMins(e.computed_minutes)}
                  {!e.billable && <span style={{ marginLeft:8, fontSize:11, color:C.muted }}>(non-billable)</span>}
                </div>
                {e.note && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{e.note}</div>}
                <div style={{ fontSize:11, color:C.slate, marginTop:2 }}>
                  {e.user?.name} · {new Date(e.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric"})}
                </div>
              </div>
              {!e.running && (
                <button onClick={() => deleteEntry(e.id)}
                  style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:"2px 6px" }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TASKS TAB (wired to DB, grouped by stage, with gate enforcement) ──────────
const STAGE_NAMES = {
  1:"Bookkeeping", 2:"Document Collection", 3:"Preparation",
  4:"Review", 5:"Filing", 6:"Confirmation"
};

function TasksTab({ wf, onRefresh }) {
  const [tasks, setTasks]     = useState(wf.tasks || []);
  const [saving, setSaving]   = useState(null);
  const [error, setError]     = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const wfId = wf.id;
  const [lastId, setLastId] = useState(wfId);
  if (wfId !== lastId) { setTasks(wf.tasks || []); setLastId(wfId); }

  // ── Gate: can tasks in stageN be checked? ─────────────────────────────────
  function isStageGated(stageN) {
    if (stageN <= 1) return { gated: false };
    const byStage = groupByStage(tasks);
    const prevN = stageN - 1;
    const prevTasks = byStage[prevN] || [];

    // Previous stage must be fully complete
    if (prevTasks.length > 0 && !prevTasks.every(t => t.status === "complete")) {
      const done  = prevTasks.filter(t => t.status === "complete").length;
      const total = prevTasks.length;
      return {
        gated: true,
        reason: `Stage ${prevN} must be complete first (${done}/${total} tasks done).`,
      };
    }

    // Stage 3 specific: docs must all be received (mirrors the workflow gate)
    if (stageN === 3) {
      const docs = wf.documents ?? wf.docs ?? [];
      const pending = docs.filter(d => d.status === "pending");
      if (pending.length > 0) {
        return {
          gated: true,
          reason: `Hard stop: ${pending.length} document${pending.length>1?"s":""} still pending in Stage 2. All documents must be received before Stage 3 tasks can begin.`,
          hard: true,
        };
      }
    }

    // Stage 5: Stage 4 review stage must be complete (not just tasks)
    if (stageN === 5) {
      const stage4 = (wf.stages || []).find(s => s.n === 4);
      if (stage4 && stage4.status !== "complete") {
        return {
          gated: true,
          reason: "Hard stop: Stage 4 Review must be approved before Filing tasks can begin.",
          hard: true,
        };
      }
    }

    return { gated: false };
  }

  function groupByStage(taskList) {
    const g = {};
    taskList.forEach(t => {
      const sn = t.stage_n ?? 0;
      if (!g[sn]) g[sn] = [];
      g[sn].push(t);
    });
    return g;
  }

  async function toggleTask(task, stageN) {
    if (!task.id) return;
    const gate = isStageGated(stageN);
    if (gate.gated) { setError(gate.reason); return; }
    setError(null);

    const newStatus = task.status === "complete" ? "in_progress" : "complete";
    setSaving(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === task.id ? {...t, status: newStatus} : t));
        if (onRefresh) onRefresh();
      } else {
        setError(data.error || "Failed to update task.");
      }
    } catch(e) { setError("Network error."); }
    finally { setSaving(null); }
  }

  if (!tasks.length)
    return <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:8, padding:"16px 20px", fontSize:12, color:C.amber }}>⚠ No tasks loaded from database for this workflow.</div>;

  const byStage   = groupByStage(tasks);
  const stageNums = Object.keys(byStage).map(Number).sort((a,b) => a-b);

  const tcfg = {
    complete:    [C.greenBg,   C.green],
    in_progress: [C.primaryBg, C.primary],
    pending:     ["#F1F5F9",   C.muted],
    blocked:     [C.redBg,     C.red],
    missed:      [C.redBg,     C.red],
  };

  const stageCfgMap = {
    complete:    { bg:C.greenBg,   color:C.green,   label:"Complete",    icon:"✓" },
    in_progress: { bg:C.primaryBg, color:C.primary,  label:"In Progress", icon:"●" },
    blocked:     { bg:C.redBg,     color:C.red,      label:"Blocked",     icon:"🔒" },
    pending:     { bg:"#F1F5F9",   color:C.muted,    label:"Pending",     icon:"○" },
  };

  function stageStatus(stageTasks) {
    if (stageTasks.every(t => t.status === "complete"))   return "complete";
    if (stageTasks.some(t => t.status === "in_progress")) return "in_progress";
    if (stageTasks.some(t => t.status === "blocked"))     return "blocked";
    return "pending";
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {error && (
        <div style={{ background:C.redBg, border:"1px solid #FCA5A5", borderRadius:8, padding:"10px 14px", fontSize:13, color:C.red, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>🔒 {error}</span>
          <button onClick={() => setError(null)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:16 }}>×</button>
        </div>
      )}

      {stageNums.map(sn => {
        const stageTasks = byStage[sn];
        const status     = stageStatus(stageTasks);
        const scfg       = stageCfgMap[status] || stageCfgMap.pending;
        const isOpen     = !collapsed[sn];
        const wfStage    = (wf.stages || []).find(s => s.n === sn);
        const stageName  = wfStage?.name || STAGE_NAMES[sn] || `Stage ${sn}`;
        const gate       = isStageGated(sn);
        const done       = stageTasks.filter(t => t.status === "complete").length;

        return (
          <div key={sn} style={{ border:`1px solid ${status==="in_progress"?C.primary:status==="complete"?"#BBF7D0":gate.gated?C.border:C.border}`, borderRadius:10, overflow:"hidden", background:"white" }}>

            {/* Stage header */}
            <div onClick={() => setCollapsed(p => ({...p,[sn]:!p[sn]}))}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", cursor:"pointer", background:status==="complete"?"#F0FDF4":status==="in_progress"?C.primaryBg:gate.gated?"#F8FAFC":"white", borderBottom:isOpen?`1px solid ${C.border}`:"none" }}>

              <div style={{ width:26, height:26, borderRadius:"50%", background:gate.gated&&status!=="complete"?"#F1F5F9":scfg.bg, border:`2px solid ${gate.gated&&status!=="complete"?C.border:scfg.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:gate.gated&&status!=="complete"?C.muted:scfg.color, fontWeight:700, flexShrink:0 }}>
                {gate.gated && status !== "complete" ? "🔒" : scfg.icon}
              </div>

              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:gate.gated&&status!=="complete"?C.muted:C.text }}>Stage {sn}: {stageName}</span>
                  <Pill label={gate.gated&&status!=="complete"?"Locked":scfg.label} bg={gate.gated&&status!=="complete"?"#F1F5F9":scfg.bg} color={gate.gated&&status!=="complete"?C.muted:scfg.color} />
                </div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{done}/{stageTasks.length} tasks complete</div>
              </div>

              <div style={{ width:80, height:4, borderRadius:2, background:C.border, flexShrink:0 }}>
                <div style={{ width:`${(done/stageTasks.length)*100}%`, height:"100%", borderRadius:2, background:scfg.color, transition:"width 0.3s" }} />
              </div>

              <span style={{ color:C.muted, fontSize:13 }}>{isOpen?"∧":"∨"}</span>
            </div>

            {isOpen && (
              <div>
                {/* Gate banner inside stage */}
                {gate.gated && status !== "complete" && (
                  <div style={{ background:gate.hard?C.redBg:C.amberBg, borderBottom:`1px solid ${gate.hard?"#FCA5A5":"#FCD34D"}`, padding:"8px 16px", display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span style={{ fontSize:12, flexShrink:0 }}>{gate.hard?"🔒":"⚑"}</span>
                    <span style={{ fontSize:12, color:gate.hard?C.red:C.amber, fontWeight:500 }}>
                      {gate.hard ? "HARD STOP — " : ""}{gate.reason}
                    </span>
                  </div>
                )}

                {stageTasks.map((task, i) => {
                  const [tbg, tc] = tcfg[task.status] || tcfg.pending;
                  const isSaving  = saving === task.id;
                  const isLocked  = gate.gated && task.status !== "complete";
                  const isBlocked = task.status === "blocked";
                  const assignee  = task.assigned_user?.name || task.assigned_initials || task.who || "—";

                  return (
                    <div key={task.id || i}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 16px 9px 20px", borderBottom:i<stageTasks.length-1?`1px solid ${C.border}`:"none", background:isBlocked||isLocked?"#FAFAFA":"white", opacity:isLocked&&status!=="complete"?0.7:1 }}>

                      <button onClick={() => !isLocked && !isBlocked && toggleTask(task, sn)}
                        disabled={isSaving || !task.id || isLocked || isBlocked}
                        style={{ width:18, height:18, borderRadius:4, border:`2px solid ${task.status==="complete"?C.green:isLocked||isBlocked?C.border:C.border}`, background:task.status==="complete"?C.green:"white", cursor:(!isLocked&&!isBlocked&&task.id)?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {task.status==="complete" && <span style={{ color:"white", fontSize:10, fontWeight:700 }}>✓</span>}
                        {isSaving && <span style={{ color:C.muted, fontSize:9 }}>…</span>}
                        {(isLocked || isBlocked) && task.status !== "complete" && <span style={{ fontSize:8, color:C.muted }}>—</span>}
                      </button>

                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, color:task.status==="complete"?C.muted:isLocked?C.muted:C.text, textDecoration:task.status==="complete"?"line-through":"none", fontWeight:task.status==="in_progress"?600:400 }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:1, display:"flex", gap:10 }}>
                          <span>👤 {assignee}</span>
                          {(task.due_date||task.due) && <span>📅 {task.due_date||task.due}</span>}
                        </div>
                      </div>

                      <Pill label={isLocked&&task.status!=="complete"?"locked":task.status.replace("_"," ")} bg={isLocked&&task.status!=="complete"?"#F1F5F9":tbg} color={isLocked&&task.status!=="complete"?C.muted:tc} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── DOCUMENTS TAB (wired to DB) ─────────────────────────────────────────────
function DocumentsTab({ wf, client, onRefresh }) {
  const [docs, setDocs]             = useState(wf.docs || wf.documents || []);
  const [saving, setSaving]         = useState(null);
  const [uploading, setUploading]   = useState(null); // doc.id being uploaded
  const [showSendModal, setShowSendModal] = useState(false);
  const [emailLog, setEmailLog]     = useState([]);
  const [sendResult, setSendResult] = useState(null); // {sent, error}

  const wfId = wf.id;
  const [lastId, setLastId] = useState(wfId);
  if (wfId !== lastId) { setDocs(wf.docs || wf.documents || []); setLastId(wfId); }

  // Fetch email log for this workflow
  useEffect(() => {
    if (!wf.id) return;
    fetch(`/api/clients/${client.id}/events?limit=20`, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data) {
          const emailEvents = json.data.filter(e => e.action?.includes('sent') || e.action?.includes('Reminder'));
          setEmailLog(emailEvents);
        }
      }).catch(()=>{});
  }, [wf.id, client.id]);

  async function markReceived(doc) {
    if (!doc.id) return;
    if (doc.upload_required && !doc.storage_path) {
      alert("A file upload is required before this document can be marked received.");
      return;
    }
    setSaving(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ status:"received", upload_source:"Manual" }),
      });
      if (res.ok) {
        setDocs(prev => prev.map(d => d.id === doc.id
          ? {...d, status:"received", uploaded_at: new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}), upload_source:"Manual"}
          : d
        ));
        if (onRefresh) onRefresh();
      }
    } finally { setSaving(null); }
  }

  async function uploadFile(doc, file) {
    if (!doc.id || !file) return;
    setUploading(doc.id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_id", doc.id);
      formData.append("workflow_id", wf.id);
      formData.append("client_id", client.id);
      const res = await fetch("/api/upload", { method:"POST", credentials:"include", body: formData });
      if (res.ok) {
        setDocs(prev => prev.map(d => d.id === doc.id
          ? {...d, status:"received", uploaded_at: new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}), upload_source:"Firm upload"}
          : d
        ));
        if (onRefresh) onRefresh();
      }
    } finally { setUploading(null); }
  }

  const pendingDocs  = docs.filter(d => d.status === "pending");
  const pendingCount = pendingDocs.length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Document Checklist — {wf.label}</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {pendingCount > 0 && <Pill label={`${pendingCount} pending`} bg={C.amberBg} color={C.amber} />}
          {pendingCount > 0 && wf.id && (
            <button onClick={() => setShowSendModal(true)}
              style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              + Send Request
            </button>
          )}
        </div>
      </div>

      <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#0369A1" }}>
        {client.type==="Corporation"
          ? "🔒 Corporation checklist: bank statements, AR/AP aging, invoices, receipts >$500, ITC reconciliation"
          : "🔒 Sole prop checklist: bank statements, all sales invoices, receipts >$100, GST registration (new clients)"}
      </div>

      {sendResult && (
        <div style={{ background:sendResult.sent?C.greenBg:C.redBg, border:`1px solid ${sendResult.sent?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"9px 14px", marginBottom:12, fontSize:13, color:sendResult.sent?"#14532D":C.red }}>
          {sendResult.sent ? "✓ Reminder email sent successfully." : `⚠ Email failed: ${sendResult.error}`}
        </div>
      )}

      {!docs.length
        ? <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:8, padding:"16px", fontSize:12, color:C.amber }}>⚠ No documents loaded from database for this workflow.</div>
        : (
          <Card>
            {docs.map((doc, i) => (
              <div key={doc.id || i} style={{ padding:"10px 16px", borderBottom:i<docs.length-1?`1px solid ${C.border}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{doc.name}</div>
                      {doc.is_t183 && <span style={{ fontSize:10, fontWeight:700, background:"#DBEAFE", color:"#1D4ED8", borderRadius:4, padding:"1px 6px" }}>T183</span>}
                      {doc.upload_required && doc.status!=="received" && <span style={{ fontSize:10, fontWeight:700, background:"#FEF3C7", color:"#B45309", borderRadius:4, padding:"1px 6px" }}>Upload required</span>}
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>
                      {doc.status==="received"
                        ? `✓ Received ${doc.uploaded_at||doc.uploadedAt||""}${doc.upload_source||doc.by?" · "+(doc.upload_source||doc.by):""}`
                        : `Reminder #${doc.reminder_count??doc.reminderCount??0}${doc.last_reminder_at||doc.lastReminderAt?" · Last sent "+(doc.last_reminder_at||doc.lastReminderAt):""}`}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {doc.status==="pending" && doc.id && (
                      <>
                        {/* File upload */}
                        <label style={{ fontSize:11, color:C.primary, background:C.primaryBg, border:`1px solid #BFDBFE`, borderRadius:6, padding:"3px 10px", cursor:"pointer" }}>
                          {uploading===doc.id ? "…" : "↑ Upload"}
                          <input type="file" style={{ display:"none" }} onChange={e => e.target.files?.[0] && uploadFile(doc, e.target.files[0])} />
                        </label>
                        {/* Mark received manually */}
                        <button onClick={() => markReceived(doc)} disabled={saving===doc.id}
                          style={{ fontSize:11, color:C.green, background:C.greenBg, border:`1px solid #BBF7D0`, borderRadius:6, padding:"3px 10px", cursor:"pointer" }}>
                          {saving===doc.id ? "…" : "Mark Received"}
                        </button>
                      </>
                    )}
                    <Pill label={doc.status==="received"?"Received":"Pending"} bg={doc.status==="received"?C.greenBg:C.amberBg} color={doc.status==="received"?C.green:C.amber} />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )
      }

      {emailLog.length > 0 && (
        <div style={{ marginTop:14, background:"#F8FAFC", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px" }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:8 }}>Email Log</div>
          {emailLog.slice(0,5).map((e, i) => (
            <div key={i} style={{ fontSize:12, color:C.text, marginBottom:4, display:"flex", gap:8 }}>
              <span style={{ color:C.green }}>✓</span>
              <span>{e.action}</span>
              <span style={{ color:C.muted, marginLeft:"auto" }}>{e.created_at ? new Date(e.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric"}) : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Send Request Modal ── */}
      {showSendModal && (
        <SendRequestModal
          wf={wf}
          client={client}
          pendingDocs={pendingDocs}
          onClose={() => setShowSendModal(false)}
          onSent={(result) => { setSendResult(result); setShowSendModal(false); if (onRefresh) onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── SEND REQUEST MODAL ───────────────────────────────────────────────────────
function SendRequestModal({ wf, client, pendingDocs, onClose, onSent }) {
  const maxReminders  = Math.max(...pendingDocs.map(d => d.reminder_count ?? 0), 0);
  const reminderNum   = maxReminders + 1;
  const isEscalation  = reminderNum >= 2;
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState(null);

  // Preview the email that will be sent
  const deadlineStr = wf.deadline ? new Date(wf.deadline).toLocaleDateString("en-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"}) : "—";
  const daysLeft    = wf.deadline ? Math.ceil((new Date(wf.deadline) - new Date()) / 86400000) : null;

  async function send() {
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/documents/request", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          workflow_id:  wf.id,
          document_ids: pendingDocs.map(d => d.id).filter(Boolean),
          type:         `Reminder #${reminderNum}`,
        }),
      });
      const data = await res.json();
      if (res.ok || res.status === 207) {
        onSent({ sent: !data.error, error: data.error });
      } else {
        setError(data.error || "Failed to send.");
      }
    } catch(e) { setError("Network error."); }
    finally { setSending(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"white", borderRadius:14, padding:"28px 32px", width:520, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Send Document Request</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{wf.label} · {client.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:C.muted, cursor:"pointer" }}>×</button>
        </div>

        {isEscalation && (
          <div style={{ background:C.amberBg, border:"1px solid #FCD34D", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#92400E" }}>
            ⚑ This is Reminder #{reminderNum} — firm owner will be CC'd on this escalation.
          </div>
        )}

        {/* Email preview */}
        <div style={{ background:"#F8FAFC", border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Email Preview</div>
          <div style={{ fontSize:13, color:C.text, marginBottom:6 }}>
            <strong>To:</strong> Assigned accountant → forwards to {client.name}
          </div>
          <div style={{ fontSize:13, color:C.text, marginBottom:6 }}>
            <strong>Subject:</strong> {isEscalation ? "[Action Required] " : ""}Documents needed — {wf.label}
          </div>
          <div style={{ fontSize:13, color:C.text, marginBottom:10 }}>
            <strong>Deadline:</strong> {deadlineStr}{daysLeft !== null ? ` (${daysLeft > 0 ? daysLeft+"d remaining" : "overdue"})` : ""}
          </div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Documents requested:</div>
          {pendingDocs.map((d,i) => (
            <div key={i} style={{ fontSize:12, color:C.text, padding:"3px 0", display:"flex", gap:6 }}>
              <span style={{ color:C.amber }}>○</span>{d.name}
            </div>
          ))}
          {isEscalation && (
            <div style={{ marginTop:10, fontSize:12, color:"#991B1B", background:"#FFF1F2", borderRadius:6, padding:"6px 10px" }}>
              This is the second request. If not received, the return may be filed late — CRA penalties may apply.
            </div>
          )}
        </div>

        {error && <div style={{ background:C.redBg, border:"1px solid #FCA5A5", borderRadius:8, padding:"8px 12px", fontSize:12, color:C.red, marginBottom:12 }}>{error}</div>}

        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <button onClick={send} disabled={sending}
            style={{ background:isEscalation?C.amber:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:sending?"not-allowed":"pointer", opacity:sending?0.7:1 }}>
            {sending ? "Sending…" : `Send Reminder #${reminderNum} →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ACTIVITY TAB (fetches from DB) ──────────────────────────────────────────
function ActivityTab({ clientId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    fetch(`/api/clients/${clientId}/events`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setEvents(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>Loading activity…</div>;

  // Fallback: if no clientId or endpoint missing, show helpful message
  if (!clientId) return <div style={{ background:C.amberBg, border:`1px solid #FCD34D`, borderRadius:8, padding:"16px", fontSize:12, color:C.amber }}>⚠ Client ID missing — cannot load activity.</div>;

  if (!events.length) return <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>No activity logged yet for this client.</div>;

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:14 }}>Activity Feed</div>
      <div style={{ position:"relative", paddingLeft:24 }}>
        <div style={{ position:"absolute", left:8, top:0, bottom:0, width:2, background:C.border }} />
        {events.map((a, i) => (
          <div key={a.id || i} style={{ position:"relative", marginBottom:16 }}>
            <div style={{ position:"absolute", left:-20, top:2, width:10, height:10, borderRadius:"50%", background:a.who==="System"?C.border:C.primary, border:"2px solid white" }} />
            <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{a.action||a.act}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>{a.detail}</div>
            <div style={{ fontSize:11, color:C.slate, marginTop:2 }}>{a.who} · {a.created_at ? new Date(a.created_at).toLocaleString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : a.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}



// ─── INVOICES TAB ─────────────────────────────────────────────────────────────
function InvoicesTab({ wf, client }) {
  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [override, setOverride]   = useState("");
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);

  useEffect(() => {
    if (!wf?.id) return;
    fetch(`/api/invoices?workflow_id=${wf.id}`, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setInvoices(json.data); })
      .finally(() => setLoading(false));
  }, [wf?.id]);

  async function createInvoice() {
    setCreating(true); setError(null); setSuccess(null);
    try {
      const body = { workflow_id: wf.id };
      if (override) body.override_amount = Math.round(parseFloat(override) * 100);
      const res  = await fetch("/api/invoices", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Invoice created — $${((data.amount_cents||0)/100).toFixed(2)} CAD sent via Stripe.`);
        setInvoices(prev => [{
          id: data.invoiceId,
          event_type: "filing_invoice_created",
          amount_cents: data.amount_cents,
          description: data.description,
          created_at: new Date().toISOString(),
        }, ...prev]);
        setOverride("");
      } else {
        setError(data.error || "Failed to create invoice.");
      }
    } finally { setCreating(false); }
  }

  const fmtCAD = cents => `$${((cents||0)/100).toFixed(2)} CAD`;

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:14 }}>Invoices — {wf?.label}</div>

      {/* Create invoice */}
      <Card style={{ padding:"16px 18px", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:8 }}>Create invoice for this workflow</div>
        {error && <div style={{ background:C.redBg, border:"1px solid #FCA5A5", borderRadius:7, padding:"8px 12px", fontSize:12, color:C.red, marginBottom:10 }}>{error}</div>}
        {success && <div style={{ background:C.greenBg, border:"1px solid #BBF7D0", borderRadius:7, padding:"8px 12px", fontSize:12, color:C.green, marginBottom:10 }}>✓ {success}</div>}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type="number" min="0" step="0.01" placeholder="Amount (CAD) — leave blank to use rate from Settings"
            value={override} onChange={e => setOverride(e.target.value)}
            style={{ flex:1, padding:"7px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13 }} />
          <button onClick={createInvoice} disabled={creating}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:7, padding:"7px 16px", fontSize:13, fontWeight:600, cursor:"pointer", opacity:creating?0.7:1, whiteSpace:"nowrap" }}>
            {creating ? "Sending…" : "Send Invoice →"}
          </button>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
          Default rates are set in Settings → Billing → Billing Rates. Invoice is sent via Stripe to the client email on file.
        </div>
      </Card>

      {/* Invoice history */}
      {loading ? (
        <div style={{ textAlign:"center", padding:16, color:C.muted, fontSize:13 }}>Loading…</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign:"center", padding:24, color:C.muted }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🧾</div>
          <div style={{ fontSize:13 }}>No invoices yet for this workflow.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {invoices.map((inv, i) => (
            <div key={inv.id || i} style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{inv.description || "Filing invoice"}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
                  {new Date(inv.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})}
                </div>
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:C.green }}>{fmtCAD(inv.amount_cents)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── INTEGRATION TAB (wired to DB) ───────────────────────────────────────────
function IntegrationTab({ clientId }) {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [portalLink, setPortalLink]     = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    fetch("/api/integrations", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setIntegrations(json.data); })
      .catch(()=>{})
      .finally(() => setLoading(false));
  }, []);

  async function generatePortalLink() {
    setGeneratingLink(true);
    try {
      const res  = await fetch("/api/portal/tokens", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json();
      if (res.ok) setPortalLink(data.portal_url || data.url || JSON.stringify(data));
    } catch(e) {}
    finally { setGeneratingLink(false); }
  }

  const statusCfg = {
    connected:       { label:"Connected",       bg:C.greenBg,   color:C.green },
    disconnected:    { label:"Not Connected",   bg:"#F1F5F9",   color:C.muted },
    token_expired:   { label:"Token Expired",   bg:C.redBg,     color:C.red },
    token_expiring:  { label:"Expiring Soon",   bg:C.amberBg,   color:C.amber },
    error:           { label:"Error",           bg:C.redBg,     color:C.red },
  };

  const PROVIDERS = [
    { key:"qbo",  name:"QuickBooks Online",  desc:"Auto-sync bookkeeping → Stage 1 gate hands-free when reconciliation complete", authUrl:"/api/integrations/qbo" },
    { key:"zoho", name:"Zoho Books",         desc:"Alternative accounting integration — same Stage 1 auto-advance", authUrl:"/api/integrations/zoho" },
  ];

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:14 }}>Integrations</div>

      {/* Accounting integrations */}
      {PROVIDERS.map(p => {
        const found = integrations.find(i => i.provider === p.key);
        const sc    = statusCfg[found?.token_status || found?.status || "disconnected"];
        const isConnected = found?.status === "connected";
        return (
          <Card key={p.key} style={{ padding:"16px 20px", marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{p.name}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{p.desc}</div>
                {isConnected && found?.company_name && (
                  <div style={{ fontSize:11, color:C.green, marginTop:3 }}>✓ Connected to: {found.company_name}</div>
                )}
                {isConnected && found?.last_synced_at && (
                  <div style={{ fontSize:11, color:C.muted }}>Last sync: {new Date(found.last_synced_at).toLocaleString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                )}
                {found?.last_sync_error && (
                  <div style={{ fontSize:11, color:C.red, marginTop:3 }}>⚠ {found.last_sync_error}</div>
                )}
              </div>
              <Pill label={loading?"Loading…":sc.label} bg={sc.bg} color={sc.color} />
            </div>
            {!isConnected ? (
              <button onClick={() => window.location.href = p.authUrl}
                style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Connect {p.name} →
              </button>
            ) : (
              <button onClick={() => fetch(`/api/integrations/${found.id}`, { method:"DELETE", credentials:"include" }).then(() => setIntegrations(prev => prev.filter(i => i.id !== found.id)))}
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 14px", fontSize:12, color:C.muted, cursor:"pointer" }}>
                Disconnect
              </button>
            )}
          </Card>
        );
      })}

      {/* Client portal link */}
      <Card style={{ padding:"16px 20px" }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Client Portal</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
          Generate a secure link for this client to upload documents directly — no login required. Link expires in 7 days.
        </div>
        {portalLink ? (
          <div>
            <div style={{ background:C.greenBg, border:"1px solid #BBF7D0", borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:12, color:"#14532D", wordBreak:"break-all" }}>
              ✓ {portalLink}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => navigator.clipboard.writeText(portalLink)}
                style={{ background:C.primaryBg, color:C.primary, border:`1px solid #BFDBFE`, borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                Copy Link
              </button>
              <button onClick={() => setPortalLink(null)}
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 14px", fontSize:12, color:C.muted, cursor:"pointer" }}>
                Generate New
              </button>
            </div>
          </div>
        ) : (
          <button onClick={generatePortalLink} disabled={generatingLink}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:generatingLink?"not-allowed":"pointer", opacity:generatingLink?0.7:1 }}>
            {generatingLink ? "Generating…" : "Generate Portal Link →"}
          </button>
        )}
      </Card>
    </div>
  );
}

// ─── EDIT CLIENT MODAL ────────────────────────────────────────────────────────
function EditClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:    client.name    || "",
    type:    client.type    || "Corporation",
    freq:    client.freq    || "Monthly",
    city:    client.city    || "",
    since:   client.since   || "",
    bn:      client.bn      || "",
    net_gst: client.netGst  || client.net_gst || "",
  });
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res  = await fetch(`/api/clients/${client.id}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, net_gst: form.net_gst ? Number(form.net_gst) : null }),
      });
      const data = await res.json();
      if (res.ok) { onSaved(); onClose(); }
      else setError(data.error || "Failed to save.");
    } catch(e) { setError("Network error."); }
    finally { setSaving(false); }
  }

  async function deleteClient() {
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method:"DELETE", credentials:"include" });
      if (res.ok) { onSaved(); onClose(); }
      else { const d = await res.json(); setError(d.error || "Failed to delete."); }
    } catch(e) { setError("Network error."); }
    finally { setDeleting(false); }
  }

  const inp = (label, key, type="text", opts=null) => (
    <div key={key}>
      <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>
      {opts
        ? <select value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))}
            style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", background:"white" }}>
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
        : <input type={type} value={form[key]||""} onChange={e => setForm(f=>({...f,[key]:e.target.value}))}
            style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", boxSizing:"border-box" }} />
      }
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"white", borderRadius:14, padding:"26px 30px", width:460, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Edit Client</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:C.muted, cursor:"pointer" }}>×</button>
        </div>
        {error && <div style={{ background:C.redBg, border:"1px solid #FCA5A5", borderRadius:8, padding:"8px 12px", fontSize:12, color:C.red, marginBottom:12 }}>{error}</div>}
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
          {inp("Client Name","name")}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {inp("Entity Type","type","text",["Corporation","Sole prop","Partnership"])}
            {inp("Filing Frequency","freq","text",["Monthly","Quarterly","Annual"])}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {inp("City","city")}
            {inp("Client Since","since")}
          </div>
          {inp("CRA Business Number","bn")}
          {inp("Net GST Amount","net_gst","number")}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)} style={{ background:"none", border:"none", color:C.red, fontSize:12, cursor:"pointer" }}>Delete client…</button>
            : <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:12, color:C.red }}>Are you sure?</span>
                <button onClick={deleteClient} disabled={deleting}
                  style={{ background:C.red, color:"white", border:"none", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer" }}>
                  {deleting?"Deleting…":"Yes, delete"}
                </button>
                <button onClick={() => setConfirmDelete(false)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer" }}>Cancel</button>
              </div>
          }
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <button onClick={save} disabled={saving}
              style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"7px 16px", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CLIENT WORKSPACE ────────────────────────────────────────────────────────
function ClientWorkspace({ client: initialClient, initialTab, onBack, onRefresh }) {
  const [tab, setTab]         = useState(initialTab || "workflow");
  const [wfIdx, setWfIdx]     = useState(0);
  const [client, setClient]   = useState(initialClient);
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit]       = useState(false);

  // Re-fetch fresh client data from DB on mount and after any action
  async function refreshClient() {
    if (!initialClient?.id) return;
    setRefreshing(true);
    try {
      const res  = await fetch(`/api/clients/${initialClient.id}`, { credentials:"include" });
      const data = await res.json();
      if (res.ok && data) {
        // Map DB fields to UI shape (same as useClients mapper)
        const mapped = {
          ...data,
          type:           data.client_type  ?? data.type,
          freq:           data.filing_freq  ?? data.freq,
          assigned:       data.assigned_to  ?? data.assigned,
          status:         data.computed_status ?? data.status ?? "On Track",
          flags:          data.computed_flags  ?? data.flags  ?? [],
          daysToDeadline: data.days_to_deadline ?? null,
          riskHistory:    data.risk_history ?? false,
          penaltyRisk:    data.penalty_risk ?? null,
          netGst:         data.net_gst ?? null,
          workflows: (data.workflows ?? []).map(wf => ({
            ...wf,
            stages:     (wf.stages ?? []).sort((a,b)=>(a.n??0)-(b.n??0)),
            tasks:      (wf.tasks ?? []).sort((a,b)=>((a.stage_n??0)-(b.stage_n??0))||((a.sort_order??0)-(b.sort_order??0))),
            docs:       wf.documents ?? wf.docs ?? [],
            stageNotes: wf.stage_notes ?? {},
            curStage:   wf.cur_stage ?? 1,
            taskInProgressDays: wf.task_in_progress_days ?? 0,
            cycleStart: wf.cycle_start ? new Date(wf.cycle_start) : null,
            deadline:   wf.deadline    ? new Date(wf.deadline)    : null,
            computed: {
              status: wf.computed_status ?? "On Track",
              flags:  wf.computed_flags  ?? [],
            },
            daysToDeadline: wf.days_to_deadline ?? null,
          })),
        };
        setClient(mapped);
      }
    } catch(e) { console.error("ClientWorkspace re-fetch failed:", e); }
    finally { setRefreshing(false); }
  }

  useEffect(() => { refreshClient(); }, [initialClient?.id]);

  // Combined refresh: update client list AND re-fetch this client
  function handleRefresh() {
    refreshClient();
    if (onRefresh) onRefresh();
  }

  const wf = client.workflows?.[wfIdx];
  const u  = client.assigned_user;
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
    <>
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:C.primary, cursor:"pointer", fontSize:13, fontWeight:500, padding:0 }}>← Back</button>
        {refreshing && <span style={{ fontSize:11, color:C.muted }}>Refreshing…</span>}
        <button onClick={() => setShowEdit(true)}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, color:C.muted, cursor:"pointer" }}>
          ✎ Edit Client
        </button>
      </div>
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

      {/* Intelligence panel — derived from real DB data */}
      <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"#0369A1", marginBottom:8 }}>🧠 Active Rules — {wf?.label}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {client.type==="Corporation" && <RuleRow icon="✓" text="Corporation — ITC reconciliation task auto-added; dual review gate if GST > $10,000" color="#0369A1" />}
          {client.type==="Sole prop"   && <RuleRow icon="✓" text="Sole prop — simplified checklist; annual revenue threshold check; no ITCs" color="#0369A1" />}
          {(client.netGst||client.net_gst)>10000 && <RuleRow icon="✓" text={`GST $${(client.netGst||client.net_gst)?.toLocaleString()} > $10,000 — dual review required (Stage 4 gate)`} color="#0369A1" />}
          {(client.netGst||client.net_gst)<0     && <RuleRow icon="⚑" text="Refund claim — justification documentation required before Stage 4 approval" color={C.amber} />}
          {(client.riskHistory||client.risk_history) && <RuleRow icon="⚑" text="High-risk — missed CRA deadline in last 12 months; senior CPA auto-assigned to Stage 3" color={C.red} />}
          {missingDocs.length>0 && <RuleRow icon="⚑" text={`${missingDocs.length} doc${missingDocs.length>1?"s":""} still pending — Stage 3 tasks hard-locked`} color={C.red} />}
          {client.flags?.length>0 && client.flags.map((f,i) => (
            <RuleRow key={i} icon="⚑" text={f.replace(/^C\d: /,"")} color={client.status==="Overdue"?C.red:C.amber} />
          ))}
          {(client.workflows||[]).some(w=>w.type==="Bookkeeping") && <RuleRow icon="✓" text="Bookkeeping workflow linked — Stage 1 auto-advances when bookkeeping signed off" color="#0369A1" />}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:18 }}>
        {["workflow","tasks","documents","messages","time","invoices","activity","integration"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background:"none", border:"none", borderBottom:tab===t?`2px solid ${C.primary}`:"2px solid transparent", padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:tab===t?600:400, color:tab===t?C.primary:C.muted, textTransform:"capitalize" }}>{t}</button>
        ))}
      </div>

      {/* WORKFLOW TAB — with gate enforcement + stage advancement */}
      {tab==="workflow" && wf && (
        <WorkflowTab wf={wf} wfComputed={wfComputed} client={client} stageCfg={stageCfg} onRefresh={handleRefresh} />
      )}

      {/* TASKS TAB */}
      {tab==="tasks" && wf && (
        <TasksTab wf={wf} onRefresh={handleRefresh} />
      )}

      {/* DOCUMENTS TAB */}
      {tab==="documents" && wf && (
        <DocumentsTab wf={wf} client={client} onRefresh={handleRefresh} />
      )}

      {/* MESSAGES TAB */}
      {tab==="messages" && (
        <MessagesTab client={client} />
      )}

      {/* ACTIVITY TAB */}
      {tab==="activity" && (
        <ActivityTab clientId={client.id} key={client.id} />
      )}

      {/* TIME TRACKING TAB */}
      {tab==="time" && wf && (
        <TimeTrackingTab wf={wf} client={client} />
      )}

      {/* INVOICES TAB */}
      {tab==="invoices" && wf && (
        <InvoicesTab wf={wf} client={client} />
      )}

      {/* INTEGRATION TAB */}
      {tab==="integration" && (
        <IntegrationTab clientId={client.id} />
      )}
    </div>
    {showEdit && (
      <EditClientModal
        client={client}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); handleRefresh(); }}
      />
    )}
    </>
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


// ─── BILLING RATES SECTION ────────────────────────────────────────────────────
function BillingRatesSection() {
  const WORKFLOW_TYPES = ["GST/HST","T1","T2","Payroll","Bookkeeping"];
  const [rates, setRates]   = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  useEffect(() => {
    fetch("/api/settings", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.settings?.billing_rates) {
          // Convert cents to CAD display
          const display = {};
          Object.entries(json.settings.billing_rates).forEach(([k,v]) => { display[k] = (v/100).toFixed(2); });
          setRates(display);
        }
      });
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    const cents = {};
    Object.entries(rates).forEach(([k,v]) => { if (v && parseFloat(v) > 0) cents[k] = Math.round(parseFloat(v)*100); });
    const res = await fetch("/api/settings", {
      method:"PATCH", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ billing_rates: cents }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved." : "Failed to save.");
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <Card style={{ padding:"20px 24px", marginTop:14 }}>
      <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Per-Filing Billing Rates</div>
      <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
        Set a default rate per filing type in CAD. Used when "Auto-invoice on completion" is enabled.
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {WORKFLOW_TYPES.map(type => (
          <div key={type} style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:140, fontSize:13, fontWeight:500, color:C.text }}>{type}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:13, color:C.muted }}>$</span>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={rates[type] || ""}
                onChange={e => setRates(r => ({...r, [type]: e.target.value}))}
                style={{ width:100, padding:"6px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13 }} />
              <span style={{ fontSize:12, color:C.muted }}>CAD</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14 }}>
        <button onClick={save} disabled={saving}
          style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"7px 16px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Saving…" : "Save Rates"}
        </button>
        {msg && <span style={{ fontSize:12, color:C.green }}>{msg}</span>}
      </div>
    </Card>
  );
}

// ─── WORKFLOW TEMPLATES ───────────────────────────────────────────────────────
function WorkflowTemplates() {
  const [active, setActive] = useState("GST/HST");

  const TEMPLATES = {
    "GST/HST": {
      freq: "Monthly / Quarterly / Annual",
      tasks: 11,
      docs_corp: 6, docs_sole: 3,
      note: "Corporation: ITC reconciliation + dual review if GST > $10,000. Sole prop: simplified checklist.",
      stages: [
        { name:"Bookkeeping",         who:"Accountant",   task:"Reconcile QBO + confirm bank feeds",              gate:"blocked",  gateText:"Hard block — bookkeeping must be confirmed in QBO before doc collection begins" },
        { name:"Document Collection", who:"Admin",         task:"Request docs per client-type checklist",          gate:"blocked",  gateText:"Hard block — Stage 3 locked until all docs received. Auto-reminders Day 3 & 6. Owner CC'd on Reminder #2" },
        { name:"Preparation",         who:"Accountant",   task:"ITC reconciliation (Corp) · revenue check (Sole prop) · calculate GST", gate:"info", gateText:"Corp: ITC reconciliation required. Sole prop: annual revenue threshold check. High-risk: senior auto-assigned" },
        { name:"Review",              who:"Senior CPA",   task:"Review return · approve or reject",               gate:"info",     gateText:"GST > $10,000: dual review gate — both accountant + senior must approve. Refund: justification doc required" },
        { name:"Filing",              who:"Accountant",   task:"Submit return to CRA via My Business Account",    gate:"blocked",  gateText:"Hard block — Stage 4 review must be fully approved before filing is enabled" },
        { name:"Confirmation",        who:"Accountant",   task:"Record CRA confirmation number → workflow closes",gate:"complete", gateText:"CRA confirmation number required. Workflow marked Complete. Event logged. Dashboard updates." },
      ],
    },
    "T1": {
      freq: "Annual — January to April",
      tasks: 17,
      docs_corp: 10, docs_sole: 9,
      note: "T183 authorization form required at Stage 5 before EFILE. Dual review if refund > $5,000 or balance > $2,000.",
      stages: [
        { name:"Document Collection", who:"Admin",         task:"Send organizer · chase T4/T5/slips · confirm RRSP room", gate:"blocked", gateText:"Hard block — all slips and receipts must be received. Auto-reminders Day 3 and Day 10" },
        { name:"Organizer Review",    who:"Accountant",   task:"Review completed organizer · flag rental, business, foreign income", gate:"info", gateText:"Check for TFSA/RRSP over-contributions · flag unusual items · prior-year changes" },
        { name:"Preparation",         who:"Accountant",   task:"Prepare T1 in tax software · apply all slips and carryforwards", gate:"info", gateText:"Apply capital loss carryforwards · CCA schedule · home office if self-employed" },
        { name:"Review",              who:"Senior CPA",   task:"Senior review · cross-check against prior year",  gate:"info",     gateText:"Refund > $5,000 or balance > $2,000: dual review required. Cross-check all slips." },
        { name:"Client Approval",     who:"Admin",        task:"Send T183 for client signature · confirm refund/balance", gate:"blocked", gateText:"Hard block — T183 authorization form must be received (uploaded via portal or scanned) before EFILE" },
        { name:"Filing & Confirmation",who:"Accountant",  task:"EFILE to CRA · record NETFILE confirmation number", gate:"complete", gateText:"NETFILE confirmation number required. Send copy to client. Workflow marked Complete." },
      ],
    },
    "T2": {
      freq: "Annual — 6 months after fiscal year end",
      tasks: 21,
      docs_corp: 10, docs_sole: 0,
      note: "Corporation only. Financial statements prepared before the T2. SR&ED and SBD calculation included.",
      stages: [
        { name:"Year-End Bookkeeping",  who:"Senior Accountant", task:"Post adjusting entries · reconcile balance sheet · CCA review", gate:"blocked", gateText:"All year-end entries must be posted. Balance sheet fully reconciled. Payroll reconciled to T4/GL." },
        { name:"Document Collection",   who:"Admin",             task:"Collect minute book, share registry, prior T2, loan schedules", gate:"blocked", gateText:"Hard block — minute book, share registry, prior year T2 and NOA must all be received" },
        { name:"Financial Statements",  who:"Senior / Owner",    task:"Prepare draft financials · internal review · send to client",   gate:"blocked", gateText:"Draft financial statements must be internally reviewed and sent to client before T2 preparation" },
        { name:"T2 Preparation",        who:"Senior Accountant", task:"Complete T2 · GIFI schedules · SR&ED · SBD calculation",       gate:"blocked", gateText:"Financial statements must be complete. GIFI schedules, small business deduction, SR&ED if applicable." },
        { name:"Review & Approval",     who:"Owner",             task:"Full senior review of all schedules · client sign-off",         gate:"blocked", gateText:"Owner review of all T2 schedules and GIFI. Client approval required before filing." },
        { name:"Filing & Confirmation", who:"Senior Accountant", task:"EFILE T2 · record confirmation · send copy to client",          gate:"complete", gateText:"CRA confirmation number required. Send filed return and financials to client. Workflow Complete." },
      ],
    },
    "Payroll": {
      freq: "Monthly / Bi-weekly (remitter type dependent)",
      tasks: 13,
      docs_corp: 5, docs_sole: 2,
      note: "HARD deadline — late remittances compound with penalties. PD7A must be verified against CRA Payroll Tables.",
      stages: [
        { name:"Payroll Processing",     who:"Accountant",   task:"Run payroll · confirm hours, salaries, new hires, terminations", gate:"blocked", gateText:"All employee hours and salaries confirmed. New hires and terminations verified." },
        { name:"Deduction Calculation",  who:"Accountant",   task:"Calculate CPP (employee + employer) · EI (×1.4) · income tax",  gate:"blocked", gateText:"CPP, EI, and income tax calculated per CRA tables. YTD maximums checked." },
        { name:"T4/RL-1 Review",         who:"Senior CPA",   task:"Cross-check deductions against CRA Payroll Tables",             gate:"blocked", gateText:"Deductions verified against CRA tables. YTD CPP/EI maximums not exceeded." },
        { name:"Remittance Preparation", who:"Accountant",   task:"Prepare PD7A · confirm total against GL balance",               gate:"blocked", gateText:"PD7A form prepared. Remittance total confirmed against general ledger balance." },
        { name:"CRA Payment",            who:"Accountant",   task:"Submit payment via My Business Account — HARD DEADLINE",        gate:"blocked",  gateText:"⚠ HARD DEADLINE — penalties for late remittance. Submit via My Business Account or financial institution." },
        { name:"Confirmation",           who:"Accountant",   task:"Record CRA payment confirmation · reconcile to GL",             gate:"complete", gateText:"Payment confirmation number recorded. Reconcile payroll remittance to general ledger." },
      ],
    },
    "Bookkeeping": {
      freq: "Monthly",
      tasks: 14,
      docs_corp: 4, docs_sole: 2,
      note: "Sign-off at Stage 6 auto-advances GST Stage 1 for any linked GST workflow. No CRA filing deadline.",
      stages: [
        { name:"Transaction Import",  who:"Accountant",       task:"Confirm QBO bank feeds live · import missing transactions", gate:"blocked", gateText:"All bank and credit card feeds imported and up to date in QBO. No missing transactions." },
        { name:"Categorisation",      who:"Accountant",       task:"Categorise all transactions · flag unusual items",          gate:"blocked", gateText:"Zero uncategorised transactions remaining. Large or unusual items flagged for review." },
        { name:"Bank Reconciliation", who:"Accountant",       task:"Reconcile all accounts to bank statements",                 gate:"blocked", gateText:"All accounts reconciled. Zero unreconciled items. Chequing, savings, credit cards all match." },
        { name:"Review",              who:"Senior Accountant",task:"Review P&L and balance sheet · flag variances > 20%",       gate:"info",    gateText:"P&L compared to prior month. Variances > 20% flagged. AP/AR aging reviewed." },
        { name:"Adjusting Entries",   who:"Accountant",       task:"Post depreciation · prepaid amortisation · accruals",       gate:"blocked", gateText:"All adjusting entries posted: CCA/depreciation, prepaid amortisation, accruals (payroll, rent)." },
        { name:"Sign-off",            who:"Senior Accountant",task:"Final sign-off · export P&L and balance sheet",             gate:"complete", gateText:"✓ Books signed off. Linked GST workflow Stage 1 auto-advances. P&L and balance sheet exported." },
      ],
    },
  };

  const gateStyle = {
    blocked:  { bg:"#FFF1F2", border:"#FECDD3", color:C.red,     icon:"🔒" },
    info:     { bg:"#EFF6FF", border:"#BFDBFE", color:C.primary, icon:"⑂"  },
    complete: { bg:C.greenBg, border:"#BBF7D0", color:C.green,   icon:"✓"  },
  };

  const tabOrder = ["GST/HST","T1","T2","Payroll","Bookkeeping"];
  const t = TEMPLATES[active];

  return (
    <div>
      <SectionHead title="Workflow Templates" sub="5 filing types · same engine · same 6-stage structure · all live" />

      {/* Tab selector */}
      <div style={{ display:"flex", gap:0, marginBottom:20, borderBottom:`1px solid ${C.border}` }}>
        {tabOrder.map(name => (
          <button key={name} onClick={() => setActive(name)}
            style={{ background:"none", border:"none", borderBottom:active===name?`2px solid ${C.primary}`:"2px solid transparent",
              padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:active===name?600:400,
              color:active===name?C.primary:C.muted, marginBottom:-1, whiteSpace:"nowrap" }}>
            {name}
          </button>
        ))}
      </div>

      {/* Template header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{active}</span>
            <Pill label="✓ Live" bg={C.greenBg} color={C.green} />
            <span style={{ fontSize:12, color:C.muted }}>{t.freq}</span>
          </div>
          <div style={{ fontSize:12, color:C.muted }}>{t.note}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <Pill label={`${t.tasks} tasks`}     bg="#F1F5F9" color={C.text} />
          <Pill label={`Corp: ${t.docs_corp} docs`}  bg="#F1F5F9" color={C.muted} />
          {t.docs_sole > 0 && <Pill label={`Sole prop: ${t.docs_sole} docs`} bg="#F1F5F9" color={C.muted} />}
        </div>
      </div>

      {/* Stage timeline */}
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
        {t.stages.map((s, i) => {
          const gs = gateStyle[s.gate];
          return (
            <div key={i} style={{ display:"flex", gap:0, alignItems:"stretch" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:32, flexShrink:0 }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:C.primaryBg, color:C.primary,
                  fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                  border:`2px solid ${C.primary}`, flexShrink:0 }}>{i+1}</div>
                {i < t.stages.length-1 && <div style={{ width:2, flex:1, minHeight:10, background:C.border, margin:"3px 0" }} />}
              </div>
              <div style={{ flex:1, background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", marginLeft:8, marginBottom:2 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{s.name}</span>
                    <span style={{ fontSize:11, color:C.muted, marginLeft:8 }}>· {s.task}</span>
                  </div>
                  <span style={{ fontSize:11, color:C.muted, background:"#F1F5F9", padding:"2px 8px", borderRadius:6, whiteSpace:"nowrap", marginLeft:8 }}>
                    👤 {s.who}
                  </span>
                </div>
                <div style={{ background:gs.bg, border:`1px solid ${gs.border}`, borderRadius:6, padding:"5px 10px", display:"flex", gap:6, alignItems:"flex-start" }}>
                  <span style={{ fontSize:11, flexShrink:0 }}>{gs.icon}</span>
                  <span style={{ fontSize:11, color:gs.color }}>{s.gateText}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#0369A1" }}>
        Every template uses the same At Risk engine (C1–C5), the same gate enforcement, and the same 6-stage structure. Templates configure the rules — the engine runs identically across all 5 filing types.
      </div>
    </div>
  );
}

// ─── ROADMAP ─────────────────────────────────────────────────────────────────
function RoadmapPage() {
  const phases = [
    {
      id:0, label:"Phase 0", name:"Demo Prototype", status:"done",
      goal:"Validate the idea. Static React prototype shown to accounting firms.",
      cost:"$0", customers:"0",
      items:[
        "Workflow-level At Risk engine (C1–C5 conditions) ✓",
        "Visual gate enforcement — hard stops with reasons ✓",
        "6 demo clients covering all status types ✓",
        "CRA deadline reference + deadlines calendar ✓",
        "All 8 views: Dashboard, Clients, Workflows, Deadlines, Templates, Why Us, Roadmap, Settings ✓",
      ],
      stack:["React (local) — no backend"],
    },
    {
      id:1, label:"Phase 1", name:"Backend + DB", status:"done",
      goal:"Make it real. Every action writes to Supabase. First paying customers.",
      cost:"$0/month", customers:"1–3",
      items:[
        "Supabase PostgreSQL — 14 migrations, full schema ✓",
        "Next.js App Router + Vercel deployment ✓",
        "All API routes live: clients, workflows, stages, tasks, documents, users, settings ✓",
        "useClients() fetches from /api/clients — no more mock data ✓",
        "Stage PATCH → gate enforcement server-side → auto-recompute computed_status ✓",
        "Task PATCH → auto_advance_stage() Postgres function ✓",
        "Document PATCH → marks received, unblocks Stage 3 ✓",
        "RLS row-level security — firm data isolation ✓",
      ],
      stack:["Supabase (PostgreSQL + Auth + RLS + Storage)", "Next.js 14 + Vercel"],
    },
    {
      id:2, label:"Phase 2", name:"Workflow Engine", status:"done",
      goal:"Templates, roles, full task lifecycle, gate enforcement in UI.",
      cost:"$0/month", customers:"3–10",
      items:[
        "workflow-templates.ts — GST/HST, T2, T1, Payroll, Bookkeeping templates ✓",
        "POST /api/workflows auto-generates 6 stages + tasks + docs from template ✓",
        "Client type branching (Corporation vs Sole prop) in templates ✓",
        "Supabase Auth + multi-user roles (owner, senior_accountant, accountant, admin) ✓",
        "Users & Roles UI in Settings — invite, role change ✓",
        "Task gate enforcement in UI — Stage N locked until Stage N-1 complete ✓",
        "Stage 3 hard stop — tasks locked until all docs received ✓",
        "Add Client modal — 2-step: client info → first workflow ✓",
      ],
      stack:["Supabase Auth", "workflow-templates.ts"],
    },
    {
      id:3, label:"Phase 3", name:"Communications", status:"done",
      goal:"Automated email reminders, escalations, and document request flow.",
      cost:"$25–$75/month", customers:"10–50",
      items:[
        "Resend transactional email — doc reminders, escalations ✓",
        "POST /api/documents/request — sends Reminder #1 / #2 via Resend ✓",
        "Send Request modal in UI — shows email preview before sending ✓",
        "Email escalation: Reminder #2 auto-CCs firm owner ✓",
        "Automation rules engine (Settings → Automation tab) ✓",
        "Document upload via /api/upload — marks received in DB ✓",
        "Activity feed fetches from events table — real audit trail ✓",
      ],
      stack:["Resend (~$20/mo)", "Supabase Storage"],
    },
    {
      id:4, label:"Phase 4", name:"Integrations", status:"done",
      goal:"QBO sync, client portal, Stripe billing, webhook handlers.",
      cost:"$50–$150/month", customers:"50–200",
      items:[
        "QuickBooks Online OAuth — lib/integrations/qbo.ts + webhook handler ✓",
        "Zoho Books OAuth — lib/integrations/zoho.ts ✓",
        "Client portal — /api/portal/tokens, /api/portal/[token]/upload ✓",
        "Stripe billing — /api/billing/checkout, /api/billing/portal ✓",
        "Billing plan UI in Settings → Billing tab ✓",
        "Webhook handlers: QBO, Stripe, Resend, Zoho ✓",
        "Workflow links — Bookkeeping → auto-advance GST Stage 1 ✓",
      ],
      stack:["QBO OAuth API", "Stripe", "Zoho API", "Cloudflare R2"],
    },
    {
      id:5, label:"Phase 5", name:"AI Layer", status:"next",
      goal:"Intelligence on top of 6+ months of real usage data.",
      cost:"$50–$200/month", customers:"200+",
      items:[
        "Risk prediction — learn from client filing history, flag earlier",
        "Priority suggestions — 'Start with Patel today: 3 days to deadline'",
        "Anomaly detection — 'GST 60% lower than last quarter — review before filing'",
        "Smart document pre-population — based on this client's history",
        "Natural language dashboard summaries",
      ],
      stack:["Anthropic API — only after PMF + 6 months data"],
    },
  ];

  const statusCfg = {
    done: { bg:C.greenBg,   color:C.green,   border:"#BBF7D0", label:"✓ Complete" },
    next: { bg:C.amberBg,   color:C.amber,   border:"#FCD34D", label:"▶ Up Next" },
    roadmap: { bg:"#F1F5F9", color:C.muted,  border:C.border,  label:"Roadmap" },
  };

  return (
    <div>
      <SectionHead title="Build Phases" sub="Where we are and what's next" />

      {/* Current status banner */}
      <div style={{ background:C.greenBg, border:"1px solid #BBF7D0", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.green, marginBottom:4 }}>✓ Phase 0 → Phase 4 complete</div>
        <div style={{ fontSize:12, color:"#14532D" }}>
          The product is live at acct-os.vercel.app. All 4 phases are shipped: full Supabase backend, workflow engine with templates, automated email reminders, QBO/Zoho integrations, Stripe billing, and client portal. Phase 5 (AI layer) begins after 6 months of real usage data.
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {phases.map(ph => {
          const s = statusCfg[ph.status] || statusCfg.roadmap;
          return (
            <Card key={ph.id} style={{ padding:"16px 20px", borderLeft:`4px solid ${s.color}`, background:ph.status==="next"?"#FFFBEB":"white" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{ph.label}: {ph.name}</span>
                    <Pill label={s.label} bg={s.bg} color={s.color} />
                  </div>
                  <div style={{ fontSize:12, color:C.muted }}>{ph.goal}</div>
                </div>
                <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                  <Pill label={ph.cost} bg="#F1F5F9" color={C.text} />
                  <Pill label={`${ph.customers} customers`} bg="#F1F5F9" color={C.muted} />
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {ph.items.map((item,i) => (
                  <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.text }}>
                    <span style={{ color:ph.status==="done"?C.green:ph.status==="next"?C.amber:C.slate, flexShrink:0 }}>
                      {ph.status==="done"?"✓":"○"}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              {ph.stack && (
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, display:"flex", gap:8, flexWrap:"wrap" }}>
                  {ph.stack.map((s,i) => <Pill key={i} label={s} bg="#F1F5F9" color={C.muted} />)}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div style={{ marginTop:16, background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"14px 18px" }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#0369A1", marginBottom:5 }}>Unit economics at scale</div>
        <div style={{ fontSize:12, color:"#0C4A6E" }}>
          At Growth plan ($149 CAD/month per firm), infra cost at 100 firms is ~$1–2/month per firm. Gross margin on infrastructure exceeds 98%. The business risk is product-market fit, not infrastructure cost.
        </div>
      </div>
    </div>
  );
}
// ─── WHY US ───────────────────────────────────────────────────────────────────
function WhyUsPage() {
  const rows = [
    { feature:"Canada-first CRA deadlines",           uku:"Manual setup",          taxt:"Generic calendar",     us:"Native — GST monthly/quarterly/annual, T1, T2, Payroll built in" },
    { feature:"Workflow engine",                       uku:"Linear task lists",     taxt:"Linear task lists",    us:"6-stage engine: gate enforcement, branching by client type, auto-advance" },
    { feature:"At Risk algorithm",                     uku:"Simple overdue flag",   taxt:"Basic flag",           us:"5-condition predictive engine per workflow (C1–C5), computed in real time" },
    { feature:"Stage gate enforcement",                uku:"None",                  taxt:"None",                 us:"Hard stops with specific reasons — Stage 3 locked until docs received" },
    { feature:"Document request & escalation",         uku:"Manual email",          taxt:"Basic reminders",      us:"Automated Resend emails — Reminder #1, Reminder #2 + owner escalation" },
    { feature:"Multi-workflow per client",             uku:"One workflow",          taxt:"One workflow",         us:"GST + T2 + Payroll simultaneously — worst status aggregated to client" },
    { feature:"Corporation vs sole prop branching",    uku:"No",                    taxt:"No",                   us:"ITC reconciliation, dual review gate, simplified checklist — auto-applied" },
    { feature:"Team roles (owner/senior/accountant)",  uku:"Basic roles",           taxt:"Basic roles",          us:"Role-gated stage approvals — Stage 4 requires senior or owner" },
    { feature:"Client portal for doc upload",          uku:"Email only",            taxt:"Email only",           us:"Portal tokens — client uploads directly, marks document received in DB" },
    { feature:"QBO / Zoho integration",                uku:"Manual",               taxt:"QBO only",             us:"QBO + Zoho OAuth — bookkeeping auto-advances Stage 1 gate" },
    { feature:"Pricing for Canadian firms",            uku:"$49+ USD per user",     taxt:"$99+ USD per user",    us:"Flat CAD firm pricing — $49/$149/$299 — no per-user fees" },
    { feature:"Setup time",                            uku:"Days of configuration", taxt:"Hours",                us:"Add client → select workflow type → template applied in seconds" },
  ];

  const FIVE_DASHBOARDS = [
    { icon:"⊞", name:"Command Centre",      desc:"Risk-sorted client ledger. At Risk, Overdue, On Track tiles. Top 3 spotlights. Workflow type filter tabs." },
    { icon:"👥", name:"Clients",             desc:"All clients with status badges, filter by status, search. Each row shows workflow pills, stage progress, days to deadline." },
    { icon:"⚡", name:"All Workflows",       desc:"Every engagement across all clients, sorted by deadline. Cross-client view for workflow type or period." },
    { icon:"📅", name:"Deadlines",           desc:"CRA deadline calendar grouped by urgency — Overdue, At Risk (≤7d), Upcoming (≤30d). Built-in Canadian CRA rules." },
    { icon:"🗂", name:"Templates",           desc:"GST/HST workflow template with stage-by-stage gate rules. T1, T2, Payroll, Bookkeeping coming in ongoing development." },
  ];

  const CLIENT_DETAIL_TABS = [
    { name:"Workflow",    desc:"6-stage timeline with gate banners, action footers, stage advancement. CRA confirmation number input for Stage 6." },
    { name:"Tasks",       desc:"Stage-grouped task list with progress bars, gate enforcement (locked if previous stage incomplete), checkbox to mark complete → writes to DB." },
    { name:"Documents",   desc:"Document checklist by client type, file upload, Mark Received, Send Request modal with email preview." },
    { name:"Activity",    desc:"Live audit feed from events table — who did what and when, auto-advance logs, stage completions." },
    { name:"Integration", desc:"QBO / Zoho Books connection status per client. Connect button initiates OAuth flow." },
  ];

  return (
    <div>
      <SectionHead title="Why AcctOS" sub="Built specifically for Canadian accounting firms" />

      {/* Core hook */}
      <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:10, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.green, marginBottom:6 }}>The core insight</div>
        <div style={{ fontSize:13, color:"#14532D", fontStyle:"italic", marginBottom:8 }}>
          "Most firms don't miss CRA deadlines because they don't care — they miss them because they lose track. We don't track work. We predict risk."
        </div>
        <div style={{ fontSize:12, color:"#15803D" }}>
          One avoided CRA penalty covers roughly a month of the Growth plan. That's the conversation every sales call starts with.
        </div>
      </div>

      {/* 5 dashboards */}
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>The 5 views</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
        {FIVE_DASHBOARDS.map(d => (
          <div key={d.name} style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:14 }}>{d.icon}</span>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.name}</span>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{d.desc}</div>
          </div>
        ))}
        <div style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:14 }}>🏢</span>
            <span style={{ fontSize:13, fontWeight:600, color:C.text }}>Client Detail</span>
          </div>
          <div style={{ fontSize:12, color:C.muted }}>5 tabs: Workflow · Tasks · Documents · Activity · Integration — everything about one client in one place.</div>
        </div>
      </div>

      {/* Client detail tabs */}
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Client detail — 5 tabs</div>
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:20 }}>
        {CLIENT_DETAIL_TABS.map((t,i) => (
          <div key={t.name} style={{ display:"flex", gap:12, alignItems:"flex-start", background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px" }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:C.primaryBg, color:C.primary, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{t.name}</div>
              <div style={{ fontSize:12, color:C.muted }}>{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Workflow types */}
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Supported filing types</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
        {[
          ["GST/HST","Monthly / Quarterly / Annual","Live — full template, gate engine, branching"],
          ["T2 Corporate","Annual (year-end based)","Template built, UI available"],
          ["T1 Personal","Annual (Jan–Apr peak)","Template built, highest volume"],
          ["Payroll","Monthly / bi-weekly","Penalty-sensitive remittances"],
          ["Bookkeeping","Monthly","Links to auto-advance GST Stage 1"],
          ["CRA Notices","Event-based","Deadline response tracking"],
        ].map(([type, freq, status]) => (
          <div key={type} style={{ background:"white", border:`1px solid ${C.border}`, borderRadius:8, padding:"11px 14px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{type}</div>
            <div style={{ fontSize:11, color:C.muted, margin:"2px 0 4px" }}>{freq}</div>
            <div style={{ fontSize:11, color:C.green }}>{status}</div>
          </div>
        ))}
      </div>

      {/* Competitor comparison */}
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>vs. Uku and TaxDome</div>
      <Card style={{ overflow:"hidden", marginBottom:20 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F8FAFC" }}>
              {["Feature","Uku","TaxDome","AcctOS"].map((h,i) => (
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:11, fontWeight:600, color:i===3?C.primary:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} style={{ background:i%2===0?"white":"#FAFAFA" }}>
                <td style={{ padding:"9px 14px", fontSize:12, fontWeight:500, color:C.text }}>{r.feature}</td>
                <td style={{ padding:"9px 14px", fontSize:12, color:C.muted }}>{r.uku}</td>
                <td style={{ padding:"9px 14px", fontSize:12, color:C.muted }}>{r.taxt}</td>
                <td style={{ padding:"9px 14px", fontSize:12, color:C.green, fontWeight:500 }}>✓ {r.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Demo script */}
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Demo script — 8 minutes</div>
      {[
        ["Command Centre","Show risk tiles: 1 overdue, 1 at risk, 3 on track. Point to spotlight cards — they know exactly what needs action today without clicking anything."],
        ["At Risk client (Sunrise Bakery)","Open it. Stage 2 shows HARD STOP — 3 documents pending, Stage 3 is locked. The system flagged it. They didn't have to notice."],
        ["Overdue client (Patel & Sons)","Stage 5 shows Missed with 'file immediately'. Penalty risk banner. They act today instead of finding out at year-end."],
        ["On Track client (Maple Contracting)","All stages green. Tasks in progress. Nothing to do — it's fine. That's the point."],
        ["Add a new client","Click + Add Client. Two steps: client info → workflow type. Stages, tasks, and document checklist appear automatically. No setup."],
        ["Tasks tab — stage gating","Open Tasks on any client. Stage 3 is locked until Stage 2 docs are in. The system enforces the rules so accountants don't skip steps."],
        ["Send Request","Go to Documents. Click Send Request. They see exactly what email will go out before it sends. Reminder #2 auto-escalates to the owner."],
        ["Settings → Team","Show role assignment. Owner, Senior CPA, Accountant, Admin — each role controls different stage approvals. One invite sends an email."],
      ].map(([step, line], i) => (
        <div key={i} style={{ display:"flex", gap:12, marginBottom:12 }}>
          <div style={{ width:24, height:24, borderRadius:"50%", background:C.primaryBg, color:C.primary, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{step}</div>
            <div style={{ fontSize:12, color:C.muted, fontStyle:"italic", marginTop:2 }}>"{line}"</div>
          </div>
        </div>
      ))}
    </div>
  );
}
// ─── PORTAL MESSAGING — FIRM SIDE ────────────────────────────────────────────

function useUnreadMessages() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch("/api/notifications", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.unread_messages != null) setCount(d.unread_messages); })
      .catch(()=>{});
  }, []);
  return { count, setCount };
}

function MessagesPage({ onSelectClient }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAll, setShowAll]   = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody]   = useState("");
  const [replySending, setReplySending] = useState(false);

  function load(all=false) {
    setLoading(true);
    fetch(`/api/messages${all?"?all=true":""}`, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.messages) setMessages(d.messages); })
      .catch(()=>{})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(showAll); }, [showAll]);

  async function markRead(ids) {
    await fetch("/api/messages/read", {
      method:"PATCH", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ message_ids: ids }),
    });
    setMessages(prev => prev.map(m => ids.includes(m.id) ? {...m, read_at: new Date().toISOString()} : m));
  }

  async function sendReply(msg) {
    if (!replyBody.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/messages/${msg.id}/reply`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ body: replyBody.trim(), workflow_id: msg.workflow_id }),
      });
      if (res.ok) { setReplyBody(""); setReplyingTo(null); load(showAll); }
    } finally { setReplySending(false); }
  }

  const unread = messages.filter(m => !m.read_at);

  return (
    <div>
      <SectionHead
        title="Messages"
        sub="Messages from your clients through the portal"
        action={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {unread.length > 0 && (
              <button onClick={() => markRead(unread.map(m=>m.id))}
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, color:C.muted, cursor:"pointer" }}>
                Mark all read
              </button>
            )}
            <button onClick={() => setShowAll(v => !v)}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, color:C.muted, cursor:"pointer" }}>
              {showAll ? "Show unread only" : "Show all"}
            </button>
          </div>
        }
      />
      {unread.length > 0 && (
        <div style={{ background:C.primaryBg, border:`1px solid #BFDBFE`, borderRadius:9, padding:"10px 16px", marginBottom:16, fontSize:13, color:C.primary }}>
          {unread.length} unread message{unread.length>1?"s":""} from your clients
        </div>
      )}
      {loading ? (
        <div style={{ padding:"40px", textAlign:"center", color:C.muted, fontSize:13 }}>Loading messages…</div>
      ) : messages.length === 0 ? (
        <Card style={{ padding:"48px 32px", textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>💬</div>
          <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:6 }}>No messages yet</div>
          <div style={{ fontSize:13, color:C.muted }}>When your clients send messages through their portal, they'll appear here.</div>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {messages.map(msg => {
            const isUnread = !msg.read_at;
            const isReplying = replyingTo === msg.id;
            return (
              <Card key={msg.id} style={{ padding:"14px 18px", borderLeft:`3px solid ${isUnread?C.primary:C.border}`, background:isUnread?"#F8FAFF":"white" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <Avatar name={msg.sender_name || msg.client_name} size={32} />
                    <div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{msg.client_name}</span>
                        {isUnread && <span style={{ background:C.primary, color:"white", fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:10 }}>New</span>}
                        {msg.workflow_label && <span style={{ background:C.primaryBg, color:C.primary, fontSize:11, padding:"1px 8px", borderRadius:6 }}>{msg.workflow_label}</span>}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>
                        {msg.sender_name} · {new Date(msg.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => { markRead([msg.id]); onSelectClient && onSelectClient(msg.client_id, "messages"); }}
                      style={{ background:C.primaryBg, color:C.primary, border:"none", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      Open in client →
                    </button>
                    <button onClick={() => { setReplyingTo(isReplying ? null : msg.id); if(!msg.read_at) markRead([msg.id]); }}
                      style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
                      {isReplying ? "Cancel" : "Reply"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.text, background:"#F8FAFC", borderRadius:7, padding:"9px 12px", marginBottom: isReplying ? 10 : 0 }}>
                  {msg.body}
                </div>
                {isReplying && (
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                      placeholder="Type your reply…" rows={2}
                      style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, resize:"vertical", outline:"none", fontFamily:"inherit" }} />
                    <button onClick={() => sendReply(msg)} disabled={replySending || !replyBody.trim()}
                      style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:replyBody.trim()&&!replySending?"pointer":"not-allowed", opacity:replySending?0.7:1, alignSelf:"flex-start" }}>
                      {replySending ? "Sending…" : "Send"}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessagesTab({ client }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [body, setBody]         = useState("");
  const [sending, setSending]   = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [filterWf, setFilterWf] = useState("all");

  function load() {
    const base = `/api/messages?client_id=${client.id}`;
    const qs   = filterWf !== "all" ? `&workflow_id=${filterWf}` : "";
    fetch(base + qs, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.messages) setMessages(d.messages); })
      .catch(()=>{})
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [filterWf, client.id]);

  async function sendReply() {
    if (!body.trim()) return;
    setSending(true);
    const lastClientMsg = messages.filter(m => m.sender_type==="client").slice(-1)[0];
    try {
      const res = await fetch(`/api/messages/${lastClientMsg?.id || "new"}/reply`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ body: body.trim(), workflow_id: workflowId || null, client_id: client.id }),
      });
      if (res.ok) { setBody(""); load(); }
    } finally { setSending(false); }
  }

  const workflows = client.workflows || [];

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={() => setFilterWf("all")}
          style={{ background:filterWf==="all"?C.primaryBg:"white", color:filterWf==="all"?C.primary:C.muted, border:`1px solid ${filterWf==="all"?C.primary:C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:filterWf==="all"?600:400 }}>
          All messages
        </button>
        {workflows.map(wf => (
          <button key={wf.id} onClick={() => setFilterWf(wf.id)}
            style={{ background:filterWf===wf.id?C.primaryBg:"white", color:filterWf===wf.id?C.primary:C.muted, border:`1px solid ${filterWf===wf.id?C.primary:C.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:filterWf===wf.id?600:400 }}>
            {wf.type} — {wf.period}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16, minHeight:120 }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"32px", color:C.muted, fontSize:13 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign:"center", padding:"32px", color:C.muted, fontSize:13 }}>
            No messages yet. When {client.name.split(" ")[0]} sends a message through their portal, it will appear here.
          </div>
        ) : messages.map(msg => {
          const isClient = msg.sender_type === "client";
          return (
            <div key={msg.id} style={{ display:"flex", flexDirection:"column", alignItems:isClient?"flex-start":"flex-end" }}>
              <div style={{ maxWidth:"78%", background:isClient?"#F8FAFC":C.primaryBg, border:`1px solid ${isClient?C.border:"#BFDBFE"}`, borderRadius:10, padding:"9px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:4, display:"flex", gap:8 }}>
                  <span style={{ fontWeight:600, color:isClient?C.text:C.primary }}>{isClient ? msg.sender_name : "You"}</span>
                  {msg.workflow_label && <span style={{ background:isClient?"#E2E8F0":C.primary, color:isClient?C.muted:"white", fontSize:10, padding:"0px 6px", borderRadius:4 }}>{msg.workflow_label}</span>}
                  <span>{new Date(msg.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{msg.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
        <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
          <span style={{ fontSize:12, color:C.muted, flexShrink:0 }}>Re:</span>
          <select value={workflowId} onChange={e => setWorkflowId(e.target.value)}
            style={{ padding:"5px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:12, outline:"none", background:"white", flex:1 }}>
            <option value="">General (no specific filing)</option>
            {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.type} — {wf.period}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder={`Reply to ${client.name.split(" ")[0]}…`} rows={3}
            style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, resize:"vertical", outline:"none", fontFamily:"inherit" }} />
          <button onClick={sendReply} disabled={sending || !body.trim()}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:body.trim()&&!sending?"pointer":"not-allowed", opacity:sending?0.7:1, alignSelf:"flex-end" }}>
            {sending ? "…" : "Send"}
          </button>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Reply is sent to the client's portal immediately.</div>
      </div>
    </div>
  );
}

function PortalSettingsTab() {
  const [portal, setPortal] = useState({ tagline:"Your secure accounting portal" });
  const [logoUrl, setLogoUrl]         = useState(null);
  const [logoFile, setLogoFile]       = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [logoSaving, setLogoSaving]   = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [showKey, setShowKey]         = useState(false);

  useEffect(() => {
    fetch("/api/settings", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.portal) setPortal(p => ({...p, ...d.portal}));
        if (d?.portal?.logo_url) setLogoUrl(d.portal.logo_url);
      }).catch(()=>{});
  }, []);

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMsg({ ok:false, text:"Logo must be under 2MB." }); return; }
    if (!["image/png","image/jpeg","image/jpg","image/svg+xml"].includes(file.type)) { setMsg({ ok:false, text:"PNG, JPG, or SVG only." }); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function uploadLogo() {
    if (!logoFile) return;
    setLogoSaving(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("logo", logoFile);
      const res = await fetch("/api/settings/portal/logo", { method:"POST", credentials:"include", body:fd });
      const data = await res.json();
      if (res.ok) { setLogoUrl(data.logo_url); setLogoFile(null); setMsg({ ok:true, text:"Logo uploaded." }); }
      else setMsg({ ok:false, text:data.error || "Upload failed." });
    } catch(e) { setMsg({ ok:false, text:"Network error." }); }
    finally { setLogoSaving(false); }
  }

  async function removeLogo() {
    setLogoSaving(true);
    try {
      const res = await fetch("/api/settings/portal/logo", { method:"DELETE", credentials:"include" });
      if (res.ok) { setLogoUrl(null); setLogoPreview(null); setMsg({ ok:true, text:"Logo removed." }); }
    } finally { setLogoSaving(false); }
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/settings", { method:"PATCH", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ portal }) });
      const data = await res.json();
      setMsg(res.ok ? { ok:true, text:"Portal settings saved." } : { ok:false, text:data.error || "Failed." });
    } catch(e) { setMsg({ ok:false, text:"Network error." }); }
    finally { setSaving(false); }
  }

  const firmInitials = "J&A";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {msg && <div style={{ background:msg.ok?C.greenBg:C.redBg, border:`1px solid ${msg.ok?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:msg.ok?"#14532D":C.red }}>{msg.text}</div>}

      <Card style={{ padding:"20px 24px" }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Portal branding</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Your clients see this when they log in. Use your firm logo and a short tagline to build trust.</div>
        <div style={{ display:"flex", gap:20, alignItems:"flex-start", marginBottom:16 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
            <div style={{ width:80, height:80, borderRadius:12, border:`2px dashed ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", background:"#F8FAFC" }}>
              {(logoPreview || logoUrl) ? <img src={logoPreview||logoUrl} alt="Logo" style={{ width:"100%", height:"100%", objectFit:"contain" }} /> : <div style={{ fontSize:20, fontWeight:700, color:C.muted }}>{firmInitials}</div>}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <label style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontSize:11, color:C.text, cursor:"pointer" }}>
                {logoUrl ? "Change" : "Upload"}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoChange} style={{ display:"none" }} />
              </label>
              {(logoUrl || logoPreview) && <button onClick={removeLogo} style={{ background:"none", border:"none", fontSize:11, color:C.red, cursor:"pointer" }}>Remove</button>}
            </div>
            {logoFile && <button onClick={uploadLogo} disabled={logoSaving} style={{ background:C.primary, color:"white", border:"none", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer" }}>{logoSaving ? "Uploading…" : "Save logo"}</button>}
            <div style={{ fontSize:10, color:C.slate, textAlign:"center" }}>PNG, JPG or SVG · Max 2MB</div>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>Portal tagline</label>
            <input value={portal.tagline} onChange={e => setPortal(p=>({...p,tagline:e.target.value}))} placeholder="Your secure accounting portal" maxLength={80}
              style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", boxSizing:"border-box" }} />
            <div style={{ fontSize:11, color:C.slate, marginTop:4 }}>One line shown below your firm name on the portal login page.</div>
          </div>
        </div>
        <div style={{ background:"#F1F5F9", borderRadius:10, padding:"16px", marginBottom:4 }}>
          <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Login page preview</div>
          <div style={{ background:"white", borderRadius:10, padding:"24px", maxWidth:280, margin:"0 auto", textAlign:"center", border:`1px solid ${C.border}` }}>
            <div style={{ width:48, height:48, borderRadius:9, border:`2px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", margin:"0 auto 10px", background:"#F8FAFC" }}>
              {(logoPreview || logoUrl) ? <img src={logoPreview||logoUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} /> : <div style={{ fontSize:14, fontWeight:700, color:C.muted }}>{firmInitials}</div>}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:3 }}>Jensen & Associates</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>{portal.tagline || "Your secure accounting portal"}</div>
            <div style={{ background:"#F8FAFC", borderRadius:7, padding:"7px 10px", marginBottom:6, fontSize:11, color:C.slate, textAlign:"left" }}>Email</div>
            <div style={{ background:"#F8FAFC", borderRadius:7, padding:"7px 10px", marginBottom:10, fontSize:11, color:C.slate, textAlign:"left" }}>Password</div>
            <div style={{ background:C.primary, color:"white", borderRadius:7, padding:"8px", fontSize:12, fontWeight:600 }}>Sign in</div>
            <div style={{ fontSize:9, color:C.slate, marginTop:10 }}>Secured by AcctOS</div>
          </div>
        </div>
      </Card>

      <div>
        <button onClick={save} disabled={saving}
          style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"9px 22px", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
          {saving ? "Saving…" : "Save Portal Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsPage() {
  const [activeTab, setActiveTab] = useState("firm");

  // ── Firm profile state ───────────────────────────────────────────────────────
  const [firm, setFirm]       = useState({ name:"", email:"", province:"Ontario", bn:"" });
  const [firmSaving, setFirmSaving] = useState(false);
  const [firmMsg, setFirmMsg] = useState(null);

  // ── Automation rules state ───────────────────────────────────────────────────
  const [rules, setRules]       = useState({ auto_create_workflows:true, doc_reminder_day3:true, escalate_on_reminder2:true, deadline_alert_3d:true, overdue_flag:true, require_upload_to_receive:false, doc_reminder_send_to_client:false, invoice_on_completion:false });
  const [esign, setEsign]       = useState({ provider:"none", key:"", secret:"" });
  const [showEsignKey, setShowEsignKey] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesMsg, setRulesMsg] = useState(null);

  // ── Users/team state ─────────────────────────────────────────────────────────
  const [users, setUsers]         = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("accountant");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMsg, setInviteMsg]     = useState(null);
  const [roleChanging, setRoleChanging] = useState(null);

  // ── Load settings on mount ───────────────────────────────────────────────────
  useEffect(() => {
    // Load firm settings
    fetch("/api/settings", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.firm)   setFirm(f => ({...f, ...json.firm}));
        if (json?.rules)  setRules(r => ({...r, ...json.rules}));
        if (json?.portal) setEsign(e => ({
          ...e,
          provider: json.portal.esign_provider || "none",
          key:      json.portal.esign_key || "",
          secret:   json.portal.esign_secret || "",
        }));
      }).catch(()=>{});

    // Load users
    fetch("/api/users", { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data) setUsers(json.data);
        if (json?.pending_invitations) setInvitations(json.pending_invitations);
      }).catch(()=>{})
      .finally(() => setUsersLoading(false));
  }, []);

  async function saveFirm() {
    setFirmSaving(true); setFirmMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ firm }),
      });
      const data = await res.json();
      setFirmMsg(res.ok ? { ok:true, text:"Saved." } : { ok:false, text:data.error || "Failed." });
    } catch(e) { setFirmMsg({ ok:false, text:"Network error." }); }
    finally { setFirmSaving(false); }
  }

  async function saveRules() {
    setRulesSaving(true); setRulesMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      setRulesMsg(res.ok ? { ok:true, text:"Saved." } : { ok:false, text:data.error || "Failed." });
    } catch(e) { setRulesMsg({ ok:false, text:"Network error." }); }
    finally { setRulesSaving(false); }
  }

  const [esignSaving, setEsignSaving] = useState(false);
  const [esignMsg, setEsignMsg]       = useState(null);

  async function saveEsign() {
    setEsignSaving(true); setEsignMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ portal: { esign_provider: esign.provider, esign_key: esign.key, esign_secret: esign.secret } }),
      });
      const data = await res.json();
      setEsignMsg(res.ok ? { ok:true, text:"E-signature settings saved." } : { ok:false, text:data.error || "Failed." });
    } catch(e) { setEsignMsg({ ok:false, text:"Network error." }); }
    finally { setEsignSaving(false); }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSending(true); setInviteMsg(null);
    try {
      const res = await fetch("/api/users/invite", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMsg({ ok:true, text:`Invite sent to ${inviteEmail}.` });
        setInviteEmail("");
        setInvitations(prev => [data, ...prev]);
      } else {
        setInviteMsg({ ok:false, text:data.error || "Failed." });
      }
    } catch(e) { setInviteMsg({ ok:false, text:"Network error." }); }
    finally { setInviteSending(false); }
  }

  async function changeRole(userId, newRole) {
    setRoleChanging(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? {...u, role: newRole} : u));
      }
    } finally { setRoleChanging(null); }
  }

  const ROLE_LABELS = {
    owner:              "Owner",
    senior_accountant:  "Senior CPA",
    accountant:         "Accountant",
    admin:              "Admin",
  };
  const ROLE_COLORS = {
    owner:             [C.primaryBg, C.primary],
    senior_accountant: [C.greenBg, C.green],
    accountant:        ["#F1F5F9", C.muted],
    admin:             [C.amberBg, C.amber],
  };

  const tabs = ["firm","team","automation","portal","billing"];
  const tabLabels = { firm:"Firm Profile", team:"Team & Roles", automation:"Automation", portal:"Client Portal", billing:"Billing" };

  return (
    <div>
      <SectionHead title="Settings" sub="Firm profile, team, and automation preferences" />

      {/* Tab bar */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background:"none", border:"none", borderBottom:activeTab===t?`2px solid ${C.primary}`:"2px solid transparent", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:activeTab===t?600:400, color:activeTab===t?C.primary:C.muted }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── FIRM PROFILE ── */}
      {activeTab==="firm" && (
        <Card style={{ padding:"20px 24px" }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:16 }}>Firm Profile</div>
          {firmMsg && <div style={{ background:firmMsg.ok?C.greenBg:C.redBg, border:`1px solid ${firmMsg.ok?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:firmMsg.ok?"#14532D":C.red, marginBottom:14 }}>{firmMsg.text}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
            {[
              ["Firm Name","name","text"],
              ["Primary Email","email","email"],
              ["Province","province","text"],
              ["CRA Business Number","bn","text"],
            ].map(([label,key,type]) => (
              <div key={key}>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>
                <input type={type} value={firm[key]||""} onChange={e => setFirm(f => ({...f,[key]:e.target.value}))}
                  style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, color:C.text, boxSizing:"border-box", outline:"none" }} />
              </div>
            ))}
          </div>
          <button onClick={saveFirm} disabled={firmSaving}
            style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:firmSaving?"not-allowed":"pointer", opacity:firmSaving?0.7:1 }}>
            {firmSaving ? "Saving…" : "Save Firm Profile"}
          </button>
        </Card>
      )}

      {/* ── TEAM & ROLES ── */}
      {activeTab==="team" && (
        <div>
          {/* Current team */}
          <Card style={{ marginBottom:14 }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:14, fontWeight:600, color:C.text }}>Team Members</span>
              <span style={{ fontSize:11, color:C.muted }}>{users.length} users</span>
            </div>
            {usersLoading
              ? <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>Loading…</div>
              : users.length === 0
              ? <div style={{ padding:"20px", textAlign:"center", color:C.muted, fontSize:13 }}>No users found.</div>
              : users.map((u, i) => {
                const [rbg, rc] = ROLE_COLORS[u.role] || ["#F1F5F9", C.muted];
                return (
                  <div key={u.id} style={{ padding:"12px 18px", borderBottom:i<users.length-1?`1px solid ${C.border}`:"none", display:"flex", alignItems:"center", gap:12 }}>
                    <Avatar name={u.name || u.email} size={34} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{u.name || "—"}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{u.email}</div>
                    </div>
                    <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                      disabled={roleChanging === u.id}
                      style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, fontWeight:600, color:rc, background:rbg, cursor:"pointer", outline:"none" }}>
                      {Object.entries(ROLE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    {roleChanging === u.id && <span style={{ fontSize:11, color:C.muted }}>Saving…</span>}
                  </div>
                );
              })
            }
          </Card>

          {/* Invite */}
          <Card style={{ padding:"18px 20px", marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:14 }}>Invite Team Member</div>
            {inviteMsg && <div style={{ background:inviteMsg.ok?C.greenBg:C.redBg, border:`1px solid ${inviteMsg.ok?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:inviteMsg.ok?"#14532D":C.red, marginBottom:12 }}>{inviteMsg.text}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@firm.ca"
                style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none" }} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", background:"white" }}>
                {Object.entries(ROLE_LABELS).filter(([v]) => v !== "owner").map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button onClick={sendInvite} disabled={inviteSending || !inviteEmail.trim()}
                style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:inviteEmail.trim()&&!inviteSending?"pointer":"not-allowed", opacity:inviteSending?0.7:1, whiteSpace:"nowrap" }}>
                {inviteSending ? "Sending…" : "Send Invite"}
              </button>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>They'll receive an email with a sign-up link. Link expires in 7 days.</div>
          </Card>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <Card style={{ padding:"18px 20px" }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:12 }}>Pending Invitations</div>
              {invitations.map((inv, i) => (
                <div key={inv.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<invitations.length-1?`1px solid ${C.border}`:"none" }}>
                  <div>
                    <div style={{ fontSize:13, color:C.text }}>{inv.email}</div>
                    <div style={{ fontSize:11, color:C.muted }}>Role: {ROLE_LABELS[inv.role] || inv.role} · Sent {new Date(inv.created_at).toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</div>
                  </div>
                  <Pill label="Pending" bg={C.amberBg} color={C.amber} />
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── AUTOMATION ── */}
      {activeTab==="automation" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Card style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:16 }}>Automation Rules</div>
            {rulesMsg && <div style={{ background:rulesMsg.ok?C.greenBg:C.redBg, border:`1px solid ${rulesMsg.ok?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:rulesMsg.ok?"#14532D":C.red, marginBottom:14 }}>{rulesMsg.text}</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:20 }}>
              {[
                ["auto_create_workflows",  "Auto-create workflows at billing cycle start",        "On the 1st of each month, new GST workflows are created automatically for monthly filers."],
                ["doc_reminder_day3",      "Send document reminder after 3 days",                 "If documents are still pending 3 days after a workflow reaches Stage 2, Reminder #1 is sent."],
                ["escalate_on_reminder2",  "Escalate to owner on Reminder #2",                    "When Reminder #2 is sent, the firm owner is CC'd automatically."],
                ["deadline_alert_3d",      "Deadline alert 3 days before CRA due date",           "Assigned accountant is notified 3 days before the CRA deadline if workflow is not Complete."],
                ["overdue_flag",           "Flag overdue clients on dashboard",                   "Clients past their CRA deadline with an incomplete workflow are flagged Overdue."],
                ["require_upload_to_receive","Require file upload before marking received",      "Accountants cannot click 'Mark Received' without uploading the file. Enforced server-side."],
                ["doc_reminder_send_to_client","Send reminders directly to client",              "Reminder emails go to the client's email directly. Accountant is CC'd. Requires client_email on profile."],
                ["invoice_on_completion",    "Auto-invoice when workflow completes",             "Creates and sends a Stripe invoice at Stage 6 close using the billing rate for that workflow type."],
              ].map(([key, label, desc]) => (
                <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{label}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{desc}</div>
                  </div>
                  <div onClick={() => setRules(r => ({...r,[key]:!r[key]}))}
                    style={{ width:40, height:22, borderRadius:11, background:rules[key]?C.primary:C.border, cursor:"pointer", position:"relative", flexShrink:0, marginTop:2 }}>
                    <div style={{ width:16, height:16, borderRadius:"50%", background:"white", position:"absolute", top:3, left:rules[key]?21:3, transition:"left 0.15s" }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={saveRules} disabled={rulesSaving}
              style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:rulesSaving?"not-allowed":"pointer", opacity:rulesSaving?0.7:1 }}>
              {rulesSaving ? "Saving…" : "Save Automation Rules"}
            </button>
          </Card>

          {/* ── E-SIGNATURE PROVIDER ── */}
          <Card style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>E-signature provider</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Used for T183 authorization on T1 workflows. The firm connects one account — business owners sign via email link, no account needed.</div>
            {esignMsg && <div style={{ background:esignMsg.ok?C.greenBg:C.redBg, border:`1px solid ${esignMsg.ok?"#BBF7D0":"#FCA5A5"}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:esignMsg.ok?"#14532D":C.red, marginBottom:14 }}>{esignMsg.text}</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              {[
                ["none",        "No e-signatures",  "Clients scan and upload the T183 form. Current default."],
                ["docusign",    "DocuSign",          "Industry-standard. Clients recognize the brand. Recommended."],
                ["dropboxsign", "Dropbox Sign",      "Developer-friendly. Simpler API. Lower cost at low volume."],
              ].map(([val, label, desc]) => (
                <div key={val} onClick={() => setEsign(e=>({...e,provider:val}))}
                  style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"12px 14px", borderRadius:9, border:`1.5px solid ${esign.provider===val?C.primary:C.border}`, background:esign.provider===val?C.primaryBg:"white", cursor:"pointer" }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${esign.provider===val?C.primary:C.border}`, background:esign.provider===val?C.primary:"white", flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {esign.provider===val && <div style={{ width:6, height:6, borderRadius:"50%", background:"white" }} />}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{label}</div>
                    <div style={{ fontSize:12, color:C.muted }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {esign.provider !== "none" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"14px", background:"#F8FAFC", borderRadius:9, border:`1px solid ${C.border}`, marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{esign.provider === "docusign" ? "DocuSign" : "Dropbox Sign"} API credentials</div>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>API Key</label>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type={showEsignKey?"text":"password"} value={esign.key} onChange={e => setEsign(s=>({...s,key:e.target.value}))} placeholder="Paste your API key"
                      style={{ flex:1, padding:"7px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13, outline:"none" }} />
                    <button onClick={() => setShowEsignKey(v=>!v)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"7px 10px", fontSize:11, color:C.muted, cursor:"pointer" }}>{showEsignKey?"Hide":"Show"}</button>
                  </div>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{esign.provider === "docusign" ? "Account ID / Secret" : "API Secret"}</label>
                  <input type="password" value={esign.secret} onChange={e => setEsign(s=>({...s,secret:e.target.value}))} placeholder="Paste your secret"
                    style={{ width:"100%", padding:"7px 10px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div style={{ fontSize:11, color:C.muted }}>{esign.provider === "docusign" ? "Find these in your DocuSign Developer account under Apps & Keys." : "Find these in your Dropbox Sign dashboard under API → API Key."}</div>
              </div>
            )}
            <button onClick={saveEsign} disabled={esignSaving}
              style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:esignSaving?"not-allowed":"pointer", opacity:esignSaving?0.7:1 }}>
              {esignSaving ? "Saving…" : "Save E-signature Settings"}
            </button>
          </Card>
        </div>
      )}

      {/* ── CLIENT PORTAL ── */}
      {activeTab==="portal" && <PortalSettingsTab />}

      {/* ── BILLING ── */}
      {activeTab==="billing" && (
        <>
        <Card style={{ padding:"20px 24px" }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:16 }}>Billing Plan</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
            {[
              ["Starter","$49/mo","Up to 50 clients","2 users"],
              ["Growth","$149/mo","Up to 150 clients","5 users"],
              ["Scale","$299/mo","Unlimited clients","Unlimited users"],
            ].map(([name,price,clients,users]) => (
              <div key={name} style={{ border:`2px solid ${C.border}`, borderRadius:10, padding:"16px" }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{name}</div>
                <div style={{ fontSize:24, fontWeight:700, color:C.text, margin:"6px 0" }}>{price}</div>
                <div style={{ fontSize:12, color:C.muted }}>{clients}</div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>{users}</div>
                <button onClick={() => fetch("/api/billing/checkout", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({plan:name.toLowerCase()}) }).then(r=>r.json()).then(d=>{ if(d.url) window.location.href=d.url; })}
                  style={{ background:C.primary, color:"white", border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", width:"100%" }}>
                  Manage Plan →
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize:11, color:C.muted }}>Billing is managed via Stripe. Click "Manage Plan" to update your subscription, view invoices, or cancel.</div>
        </Card>

        {/* Per-job billing rates */}
        <BillingRatesSection />
        </>
      )}
    </div>
  );
}
// ─── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]         = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddClient, setShowAddClient] = useState(false);
  const { clients, loading, error } = useClients(refreshKey);
  const { count: unreadMsgs } = useUnreadMessages();
  const urgent = clients.filter(c => c.status==="At Risk"||c.status==="Overdue").length;
  const onRefresh = () => setRefreshKey(k => k + 1);
  const onAddClient = () => setShowAddClient(true);

  const nav = [
    { id:"dashboard",    label:"Command Centre", icon:"⊞" },
    { id:"clients",      label:"Clients",        icon:"👥" },
    { id:"messages",     label:"Messages",       icon:"💬" },
    { id:"allworkflows", label:"Workflows",      icon:"⚡" },
    { id:"deadlines",    label:"Deadlines",      icon:"📅" },
    { id:"templates",    label:"Templates",      icon:"🗂" },
    { id:"whyus",        label:"Why Us",         icon:"⚔️" },
    { id:"roadmap",      label:"Roadmap",        icon:"📍" },
    { id:"settings",     label:"Settings",       icon:"⚙" },
  ];

  const onSelect = (c, initialTab) => { setSelected({...c, _initialTab: initialTab}); setView("client"); };

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, flexDirection:"column", gap:12 }}>
      <div style={{ width:32, height:32, borderRadius:"50%", border:`3px solid ${C.border}`, borderTopColor:C.primary, animation:"spin 0.8s linear infinite" }} />
      <div style={{ fontSize:13, color:C.muted }}>Loading clients from database…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, flexDirection:"column", gap:12 }}>
      <div style={{ background:C.redBg, border:`1px solid #FCA5A5`, borderRadius:12, padding:"24px 32px", maxWidth:400, textAlign:"center" }}>
        <div style={{ fontSize:20, marginBottom:8 }}>⚠️</div>
        <div style={{ fontSize:15, fontWeight:600, color:C.red, marginBottom:6 }}>Could not load clients</div>
        <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>API error: {error}</div>
        <div style={{ fontSize:12, color:C.slate }}>Check that you are logged in and the API is reachable.</div>
        <button onClick={() => window.location.href='/login'}
          style={{ marginTop:16, background:C.primary, color:"white", border:"none", borderRadius:8, padding:"8px 20px", fontSize:13, fontWeight:500, cursor:"pointer" }}>
          Go to Login
        </button>
      </div>
    </div>
  );

  return (
    <>
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"var(--font-body, 'DM Sans', system-ui, sans-serif)" }}>
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
                {item.id==="messages"&&unreadMsgs>0 && (
                  <span style={{ background:C.primary, color:"white", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:10 }}>{unreadMsgs}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Avatar name="Patrick W." size={26} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.text }}>Patrick W.</div>
              <div style={{ fontSize:10, color:C.muted }}>Owner · Growth Plan</div>
            </div>
            <button onClick={() => {
              fetch('/api/auth/logout', { method:'POST', credentials:'include' })
                .then(() => { window.location.href = '/login'; });
            }} style={{ background:"none", border:"none", fontSize:10, color:C.muted, cursor:"pointer", padding:"2px 4px", borderRadius:4 }}
              onMouseEnter={e => e.currentTarget.style.color=C.red}
              onMouseLeave={e => e.currentTarget.style.color=C.muted}
            >Sign out</button>
          </div>
        </div>
      </div>
      <div style={{ flex:1, padding:"28px 32px", overflowY:"auto", maxWidth:1000 }}>
        {view==="dashboard"    && <Dashboard clients={clients} onSelect={onSelect} setView={setView} onAddClient={onAddClient} />}
        {view==="clients"      && <ClientList clients={clients} onSelect={onSelect} />}
        {view==="messages"     && <MessagesPage onSelectClient={(clientId, tab) => { const c = clients.find(cl=>cl.id===clientId); if(c) onSelect(c, tab); }} />}
        {view==="client"       && selected && <ClientWorkspace client={selected} initialTab={selected._initialTab} onBack={() => { setSelected(null); setView("dashboard"); }} onRefresh={onRefresh} />}
        {view==="allworkflows" && <AllWorkflows clients={clients} onSelectClient={onSelect} />}
        {view==="deadlines"    && <DeadlinesView clients={clients} onSelectClient={onSelect} />}
        {view==="templates"    && <WorkflowTemplates />}
        {view==="whyus"        && <WhyUsPage />}
        {view==="roadmap"      && <RoadmapPage />}
        {view==="settings"     && <SettingsPage />}
      </div>
    </div>
    {showAddClient && (
      <AddClientModal
        onClose={() => setShowAddClient(false)}
        onSaved={() => { setShowAddClient(false); onRefresh(); }}
      />
    )}
    </>
  );
}
