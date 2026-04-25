"use client";
import { useState } from "react";

const PHASES = [
  {
    tab: "Phase 1",
    label: "Backend + DB",
    badge: "✓ Live",
    title: "Real backend. Real data. Real risk engine.",
    desc: "Replaced the static prototype with a production Supabase PostgreSQL database. The 5-condition At Risk algorithm runs server-side on every request. Every stage transition is gate-validated before writing to the DB.",
    features: [
      "Supabase PostgreSQL — full schema across firms, clients, workflows, stages, tasks, documents, events",
      "5-condition At Risk engine — C1 timeline breach, C2 deadline proximity, C3 document blocker, C4 stage stall, C5 risk history — evaluated per workflow",
      "Gate-enforced stage transitions — Stage 3 hard-blocked until all docs received, filing blocked until review approved",
      "42 REST API routes — clients, workflows, stages, tasks, documents, dashboard, settings, auth",
      "Row Level Security — firm data isolated at the Postgres level, not application code",
    ],
    screen: (
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#0F1117",borderRadius:10,padding:"16px",color:"#94A3B8",lineHeight:1.7}}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["#FF5F56","#FFBD2E","#27C93F"].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:c}}/>)}
        </div>
        <div><span style={{color:"#64748B"}}>GET </span><span style={{color:"#38BDF8"}}>/api/dashboard</span></div>
        <div style={{color:"#64748B",marginLeft:8}}>→ <span style={{color:"#4ADE80"}}>200 OK</span></div>
        <div style={{color:"#64748B",marginLeft:8,fontSize:10}}>{"{ active_filings: 9, at_risk: 3, overdue: 2 }"}</div>
        <div style={{marginTop:8}}><span style={{color:"#64748B"}}>PATCH </span><span style={{color:"#38BDF8"}}>/api/stages/uuid</span></div>
        <div style={{color:"#64748B",marginLeft:8}}>→ <span style={{color:"#F87171"}}>409 GATE_BLOCKED</span></div>
        <div style={{color:"#64748B",marginLeft:8,fontSize:10}}>{"{ gate_reason: \"2 docs pending\" }"}</div>
        <div style={{marginTop:8}}><span style={{color:"#64748B"}}>RLS </span><span style={{color:"#A78BFA"}}>firm_isolation_select</span></div>
        <div style={{color:"#64748B",marginLeft:8,fontSize:10}}>firm_id = auth.jwt() -&gt;&gt; 'firm_id'</div>
      </div>
    ),
  },
  {
    tab: "Phase 2",
    label: "Workflow Engine",
    badge: "✓ Live",
    title: "Templates, roles, and gate enforcement in the UI.",
    desc: "Five workflow templates applied automatically on client creation. Four role types with server-side permission checks. Stage auto-advance when all tasks complete. Document checklist enforced per entity type.",
    features: [
      "5 templates — GST/HST, T1 Personal, T2 Corporate, Payroll Remittances, Monthly Bookkeeping",
      "Client type branching — Corporation gets ITC reconciliation; sole prop gets simplified checklist",
      "4 user roles — Owner, Senior CPA, Accountant, Admin — enforced at API level not just UI",
      "Dual review gate — GST > $10,000 requires both accountant and senior CPA to approve Stage 4",
      "T183 gate — T1 Stage 5 hard-blocked until authorization form is uploaded",
    ],
    screen: (
      <div style={{background:"#0F1117",borderRadius:10,padding:"14px",fontSize:11,fontFamily:"system-ui"}}>
        <div style={{color:"#94A3B8",marginBottom:10,fontWeight:600}}>Sunrise Bakery — GST/HST Q3</div>
        {[
          {n:1,name:"Bookkeeping",status:"complete",color:"#4ADE80"},
          {n:2,name:"Document Collection",status:"complete",color:"#4ADE80"},
          {n:3,name:"Preparation",status:"blocked",color:"#F87171"},
          {n:4,name:"Review",status:"pending",color:"#475569"},
          {n:5,name:"Filing",status:"pending",color:"#475569"},
          {n:6,name:"Confirmation",status:"pending",color:"#475569"},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:s.color==="#4ADE80"?"#052E16":s.color==="#F87171"?"#2D0A0A":"#1E293B",border:`1.5px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:s.color,fontWeight:700,flexShrink:0}}>{s.n}</div>
            <div style={{fontSize:11,color:s.color==="#475569"?"#475569":"#E2E8F0"}}>{s.name}</div>
            {s.status==="blocked"&&<div style={{marginLeft:"auto",fontSize:10,color:"#F87171",background:"#2D0A0A",padding:"1px 6px",borderRadius:4}}>🔒 2 docs pending</div>}
            {s.status==="complete"&&<div style={{marginLeft:"auto",fontSize:10,color:"#4ADE80"}}>✓</div>}
          </div>
        ))}
      </div>
    ),
  },
  {
    tab: "Phase 3",
    label: "Communications",
    badge: "✓ Live",
    title: "Automated reminders, escalations, and file uploads.",
    desc: "Resend-powered transactional email handles document reminders automatically. Reminder #2 escalates to the firm owner. Clients upload documents directly. Every email is logged in notification_log with Resend delivery tracking.",
    features: [
      "Automated reminder Day 3 — sends Reminder #1 if docs pending 3 days after Stage 2 starts",
      "Escalation on Reminder #2 — firm owner CC'd automatically, no manual action needed",
      "Client direct reminders — toggle on to route reminders directly to client email",
      "File upload pipeline — presigned URLs to Supabase Storage or Cloudflare R2",
      "8 automation toggles — all configurable in Settings → Automation, saved to DB immediately",
    ],
    screen: (
      <div style={{background:"#0F1117",borderRadius:10,padding:"14px",fontSize:11,fontFamily:"system-ui"}}>
        <div style={{color:"#94A3B8",marginBottom:10,fontWeight:600}}>Automation Rules</div>
        {[
          {label:"Doc reminder Day 3",on:true},
          {label:"Escalate on Reminder #2",on:true},
          {label:"Deadline alert 3 days",on:true},
          {label:"Overdue flag",on:true},
          {label:"Require upload to receive",on:false},
          {label:"Send reminders to client",on:false},
          {label:"Auto-invoice on completion",on:false},
        ].map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #1E293B"}}>
            <span style={{color:r.on?"#E2E8F0":"#475569"}}>{r.label}</span>
            <div style={{width:28,height:16,borderRadius:8,background:r.on?"#2563EB":"#1E293B",position:"relative"}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:"white",position:"absolute",top:2,left:r.on?14:2,transition:"left 0.2s"}}/>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    tab: "Phase 4",
    label: "Integrations",
    badge: "✓ Live",
    title: "QBO sync, client portal, Stripe billing.",
    desc: "QuickBooks Online and Zoho Books integrations auto-advance Stage 1 when reconciliation completes. Clients upload documents through a secure token-gated portal. Stripe handles firm subscription billing.",
    features: [
      "QBO + Zoho Books OAuth — bookkeeping reconciliation auto-advances GST Stage 1, no manual action",
      "Client portal — 96-char token-gated upload link, no login required, marks documents received automatically",
      "Stripe billing — $49/$149/$299 CAD flat firm pricing, monthly or annual, customer portal for self-serve changes",
      "Per-job invoicing — Stripe invoices sent to business clients using firm's own Stripe Connect account",
      "Time tracking — start/stop timer or manual log, billable minutes shown per workflow",
    ],
    screen: (
      <div style={{background:"#0F1117",borderRadius:10,padding:"14px",fontSize:11,fontFamily:"system-ui"}}>
        <div style={{color:"#94A3B8",marginBottom:10,fontWeight:600}}>Integrations</div>
        {[
          {name:"QuickBooks Online",status:"Connected",detail:"Maple Contracting synced · 2h ago",color:"#4ADE80"},
          {name:"Zoho Books",status:"Not connected",detail:"Click to connect",color:"#475569"},
          {name:"Stripe Billing",status:"Active · Growth",detail:"$149/mo · renews May 1",color:"#4ADE80"},
          {name:"Cloudflare R2",status:"Active",detail:"client-documents · 12 files",color:"#4ADE80"},
        ].map((item,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1E293B"}}>
            <div>
              <div style={{color:item.color==="#475569"?"#475569":"#E2E8F0",fontWeight:500}}>{item.name}</div>
              <div style={{color:"#475569",fontSize:10}}>{item.detail}</div>
            </div>
            <span style={{fontSize:10,color:item.color,background:item.color==="#4ADE80"?"#052E16":"#1E293B",padding:"2px 8px",borderRadius:4}}>{item.status}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function PhaseTabs() {
  const [active, setActive] = useState(0);
  const ph = PHASES[active];

  return (
    <div style={{maxWidth:960,margin:"0 auto"}}>
      {/* Tab buttons */}
      <div style={{display:"flex",gap:4,marginBottom:32,background:"#0F1117",padding:4,borderRadius:10,border:"1px solid #1E293B"}}>
        {PHASES.map((p,i)=>(
          <button key={i} onClick={()=>setActive(i)} style={{flex:1,padding:"10px 8px",borderRadius:8,border:"none",cursor:"pointer",background:active===i?"#1E293B":"transparent",transition:"all 0.15s"}}>
            <div style={{fontSize:11,fontWeight:700,color:active===i?"#38BDF8":"#475569",marginBottom:2}}>{p.tab}</div>
            <div style={{fontSize:10,color:active===i?"#94A3B8":"#334155"}}>{p.label}</div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:40,alignItems:"start"}}>
        <div>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#052E16",border:"1px solid #166534",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#4ADE80",fontWeight:600,marginBottom:16}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#4ADE80",display:"inline-block"}}/>
            {ph.badge}
          </div>
          <h3 style={{fontSize:20,fontWeight:700,color:"#F1F5F9",margin:"0 0 12px",lineHeight:1.3}}>{ph.title}</h3>
          <p style={{fontSize:13,color:"#64748B",lineHeight:1.7,margin:"0 0 20px"}}>{ph.desc}</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {ph.features.map((f,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{color:"#2563EB",fontWeight:700,flexShrink:0,marginTop:1}}>→</span>
                <span style={{fontSize:12,color:"#94A3B8",lineHeight:1.6}}>{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          {ph.screen}
        </div>
      </div>
    </div>
  );
}
