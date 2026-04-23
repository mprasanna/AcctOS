// ============================================================
// AcctOS — Email Template: Deadline Alert
// Sent to assigned accountant N days before CRA deadline.
// ============================================================

import type { DeadlineAlertParams } from '../index'

const AMBER  = '#F59E0B'
const RED    = '#DC2626'
const TEXT   = '#0F172A'
const MUTED  = '#475569'
const BORDER = '#E2E8F0'
const BG     = '#F8FAFC'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function html(p: DeadlineAlertParams): string {
  const isUrgent = p.daysToDeadline <= 1
  const accent   = isUrgent ? RED : AMBER

  const stageNames = ['', 'Bookkeeping', 'Document Collection', 'Preparation', 'Review', 'Filing', 'Confirmation']
  const stageName  = stageNames[p.currentStage] ?? `Stage ${p.currentStage}`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Deadline alert: ${p.clientName}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">

        <tr>
          <td style="background:${accent};padding:20px 32px;">
            <span style="color:white;font-size:18px;font-weight:700;">AcctOS</span>
            <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">by ${p.firmName}</span>
            <span style="float:right;background:rgba(255,255,255,0.2);color:white;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">
              ${isUrgent ? '🔴 Urgent' : '📅 Deadline Alert'}
            </span>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:${TEXT};">
              ${isUrgent ? 'Deadline tomorrow' : `${p.daysToDeadline} days to deadline`}
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:${MUTED};">${p.clientName} — ${p.workflowLabel}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border:1px solid ${BORDER};border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 16px;border-right:1px solid ${BORDER};">
                  <p style="margin:0 0 3px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">CRA Deadline</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:${accent};">${formatDate(p.deadline)}</p>
                </td>
                <td style="padding:14px 16px;border-right:1px solid ${BORDER};">
                  <p style="margin:0 0 3px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Current Stage</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:${TEXT};">${p.currentStage}/6 — ${stageName}</p>
                </td>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 3px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Status</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:${p.currentStatus === 'At Risk' ? AMBER : p.currentStatus === 'Overdue' ? RED : '#16A34A'};">${p.currentStatus}</p>
                </td>
              </tr>
            </table>

            <p style="color:${TEXT};font-size:14px;line-height:1.6;margin:0 0 20px;">
              Hi ${p.accountantName}, the CRA filing deadline for <strong>${p.clientName}</strong>'s ${p.workflowLabel} 
              is in <strong>${p.daysToDeadline} day${p.daysToDeadline !== 1 ? 's' : ''}</strong>. 
              The workflow is currently at Stage ${p.currentStage} (${stageName}).
            </p>

            ${p.currentStage < 5 ? `
            <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#92400E;">
                ⚑ The workflow needs to reach Stage 5 (Filing) before the deadline. 
                ${5 - p.currentStage} stage${5 - p.currentStage !== 1 ? 's' : ''} remaining.
              </p>
            </div>
            ` : ''}

            <p style="color:${MUTED};font-size:13px;">Log in to AcctOS to continue the workflow.</p>
          </td>
        </tr>

        <tr>
          <td style="background:${BG};border-top:1px solid ${BORDER};padding:14px 32px;">
            <p style="margin:0;font-size:11px;color:${MUTED};text-align:center;">AcctOS automated alert — ${p.firmName}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
