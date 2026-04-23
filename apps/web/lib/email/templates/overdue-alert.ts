// ============================================================
// AcctOS — Email Template: Overdue Alert
// Sent to firm owner when CRA deadline passes unfiled.
// ============================================================

import type { OverdueAlertParams } from '../index'

const RED    = '#DC2626'
const TEXT   = '#0F172A'
const MUTED  = '#475569'
const BORDER = '#E2E8F0'
const BG     = '#F8FAFC'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function html(p: OverdueAlertParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OVERDUE: ${p.clientName} — ${p.workflowLabel}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border:2px solid ${RED};border-radius:12px;overflow:hidden;">

        <tr>
          <td style="background:${RED};padding:20px 32px;">
            <span style="color:white;font-size:18px;font-weight:700;">AcctOS</span>
            <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">by ${p.firmName}</span>
            <span style="float:right;background:rgba(255,255,255,0.2);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">✕ OVERDUE</span>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:24px;font-weight:700;color:${RED};">CRA deadline missed</p>
            <p style="margin:0 0 24px;font-size:14px;color:${MUTED};">${p.clientName} — ${p.workflowLabel}</p>

            <div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:16px;margin-bottom:24px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:${RED};">
                Hi ${p.ownerName}, the CRA deadline for ${p.clientName}'s ${p.workflowLabel} 
                passed ${p.daysOverdue} day${p.daysOverdue !== 1 ? 's' : ''} ago on ${formatDate(p.deadline)}. 
                The return has not been filed.
              </p>
            </div>

            ${p.penaltyRisk === 'HIGH' ? `
            <div style="background:#FEE2E2;border:1px solid #F87171;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;font-weight:700;color:${RED};">
                ⚠ HIGH PENALTY RISK — This client has a history of late filings. 
                Interest and penalties are accumulating. File immediately and document the reason in CRA correspondence.
              </p>
            </div>
            ` : `
            <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#92400E;">
                Interest is accumulating on any amount owing. File as soon as possible to minimise penalties.
              </p>
            </div>
            `}

            <p style="color:${TEXT};font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>Immediate steps:</strong></p>
            <ol style="color:${TEXT};font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:20px;">
              <li>Open AcctOS and navigate to the client workspace</li>
              <li>Complete any remaining stages immediately</li>
              <li>File the late return to CRA today</li>
              <li>Document the reason for the late filing in the CRA correspondence log</li>
            </ol>

            <p style="color:${MUTED};font-size:13px;">
              Deadline was: <strong>${formatDate(p.deadline)}</strong>. 
              Days overdue: <strong style="color:${RED};">${p.daysOverdue}</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:${BG};border-top:1px solid ${BORDER};padding:14px 32px;">
            <p style="margin:0;font-size:11px;color:${MUTED};text-align:center;">
              AcctOS automated overdue alert — ${p.firmName}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
