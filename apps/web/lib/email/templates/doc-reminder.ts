// ============================================================
// AcctOS — Email Template: Document Reminder
// Used for both Reminder #1 (Day 3) and Reminder #2 (Day 6).
// Plain HTML — no external CSS, no images, renders in all clients.
// ============================================================

import type { DocReminderParams } from '../index'

const BRAND_BLUE  = '#2563EB'
const AMBER       = '#F59E0B'
const TEXT        = '#0F172A'
const MUTED       = '#475569'
const BORDER      = '#E2E8F0'
const BG          = '#F8FAFC'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function html(p: DocReminderParams): string {
  const days   = daysUntil(p.deadline)
  const isR2   = p.reminderNumber === 2
  const accent = isR2 ? AMBER : BRAND_BLUE
  const badge  = isR2
    ? `<span style="background:#FEF3C7;color:#92400E;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">Reminder #2 — Action Required</span>`
    : `<span style="background:#EFF6FF;color:#1D4ED8;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">Reminder #1</span>`

  const docList = p.pendingDocs.map(d =>
    `<li style="margin:6px 0;color:${TEXT};">${d}</li>`
  ).join('')

  const uploadSection = p.uploadLink
    ? `<div style="margin:24px 0;text-align:center;">
         <a href="${p.uploadLink}" style="background:${BRAND_BLUE};color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
           Upload Documents →
         </a>
       </div>`
    : `<p style="color:${MUTED};font-size:13px;margin:16px 0;">
         Please reply to this email with the documents attached, or contact your accountant directly.
       </p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${isR2 ? '[Action Required] ' : ''}Documents needed — ${p.workflowLabel}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:white;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:${accent};padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:white;font-size:18px;font-weight:700;letter-spacing:-0.3px;">AcctOS</span>
                    <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">by ${p.firmName}</span>
                  </td>
                  <td align="right">
                    ${badge}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${TEXT};">
                Documents needed
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:${MUTED};">
                ${p.workflowLabel}
              </p>

              <!-- Deadline banner -->
              <div style="background:${days <= 5 ? '#FEF3C7' : '#EFF6FF'};border:1px solid ${days <= 5 ? '#FCD34D' : '#BFDBFE'};border-radius:8px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;font-weight:600;color:${days <= 5 ? '#92400E' : '#1D4ED8'};">
                  📅 CRA deadline: ${formatDate(p.deadline)} — ${days > 0 ? `${days} days remaining` : 'deadline has passed'}
                </p>
              </div>

              <p style="color:${TEXT};font-size:14px;line-height:1.6;margin:0 0 16px;">
                Hi ${p.clientName},
              </p>
              <p style="color:${TEXT};font-size:14px;line-height:1.6;margin:0 0 20px;">
                To complete your <strong>${p.workflowLabel}</strong> filing, we still need the following documents:
              </p>

              <!-- Document list -->
              <div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">
                  Documents Required
                </p>
                <ul style="margin:0;padding-left:20px;">
                  ${docList}
                </ul>
              </div>

              ${uploadSection}

              ${isR2 ? `
              <div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;color:#991B1B;font-weight:500;">
                  ⚑ This is our second request. If we do not receive these documents soon, we may be unable to file your return by the CRA deadline and penalties may apply.
                </p>
              </div>
              ` : ''}

              <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
                If you have any questions, please reply to this email or call your accountant at ${p.firmName}.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BG};border-top:1px solid ${BORDER};padding:16px 32px;">
              <p style="margin:0;font-size:11px;color:${MUTED};text-align:center;">
                This message was sent by ${p.firmName} via AcctOS. 
                If you believe you received this in error, please contact ${p.firmName} directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
