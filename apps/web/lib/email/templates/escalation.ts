// ============================================================
// AcctOS — Email Template: Escalation to Firm Owner
// Sent when Reminder #2 fires — owner receives full context.
// ============================================================

import type { EscalationParams } from '../index'

const RED    = '#DC2626'
const TEXT   = '#0F172A'
const MUTED  = '#475569'
const BORDER = '#E2E8F0'
const BG     = '#F8FAFC'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function html(p: EscalationParams): string {
  const docList = p.pendingDocs.map(d =>
    `<li style="margin:5px 0;color:${TEXT};">${d}</li>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Escalation: ${p.clientName}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">

        <tr>
          <td style="background:${RED};padding:20px 32px;">
            <span style="color:white;font-size:18px;font-weight:700;">AcctOS</span>
            <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">by ${p.firmName}</span>
            <span style="float:right;background:rgba(255,255,255,0.15);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">⚑ Escalation</span>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">Document escalation</p>
            <p style="margin:0 0 24px;font-size:14px;color:${MUTED};">${p.clientName} — ${p.workflowLabel}</p>

            <div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:${RED};">
                Hi ${p.ownerName}, Reminder #2 has been sent to ${p.clientName}. 
                Documents are still missing with ${p.daysToDeadline} day${p.daysToDeadline !== 1 ? 's' : ''} until the CRA deadline.
              </p>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
                  <span style="font-size:12px;color:${MUTED};">Client</span><br>
                  <span style="font-size:14px;font-weight:600;color:${TEXT};">${p.clientName}</span>
                </td>
                <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
                  <span style="font-size:12px;color:${MUTED};">Assigned accountant</span><br>
                  <span style="font-size:14px;color:${TEXT};">${p.assignedTo}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;">
                  <span style="font-size:12px;color:${MUTED};">CRA deadline</span><br>
                  <span style="font-size:14px;font-weight:600;color:${p.daysToDeadline <= 5 ? RED : TEXT};">${formatDate(p.deadline)} (${p.daysToDeadline}d remaining)</span>
                </td>
                <td style="padding:8px 0;">
                  <span style="font-size:12px;color:${MUTED};">Workflow</span><br>
                  <span style="font-size:14px;color:${TEXT};">${p.workflowLabel}</span>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">Pending documents</p>
            <div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;margin-bottom:24px;">
              <ul style="margin:0;padding-left:18px;">${docList}</ul>
            </div>

            <p style="color:${MUTED};font-size:13px;line-height:1.6;">
              Log in to AcctOS to view the full client workspace and take action.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:${BG};border-top:1px solid ${BORDER};padding:14px 32px;">
            <p style="margin:0;font-size:11px;color:${MUTED};text-align:center;">
              AcctOS automated escalation — ${p.firmName}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
