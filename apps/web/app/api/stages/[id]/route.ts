import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { evaluateGate, computeWorkflowStatus } from '@/lib/risk-engine'
import type { StageStatus } from '@/types/database'

type RouteParams = { params: { id: string } }

// ─── PATCH /api/stages/:id ────────────────────────────────────────────────────
// Gate enforcement runs server-side before any status change.
// On success, recalculates workflow computed_status.

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role, name')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const { status, note, dual_review_confirmed } = body as {
    status?: StageStatus
    note?: string
    dual_review_confirmed?: boolean
  }

  // Fetch the stage + its workflow + client for gate evaluation
  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('*')
    .eq('id', params.id)
    .single()

  if (stageError || !stage) {
    return NextResponse.json({ error: 'Stage not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data: workflow, error: wfError } = await supabase
    .from('workflows')
    .select(`
      *,
      stages ( * ),
      documents ( id, status, reminder_count, is_t183 ),
      client:clients!workflows_client_id_fkey ( id, type, net_gst, risk_history, penalty_risk )
    `)
    .eq('id', stage.workflow_id)
    .single()

  if (wfError || !workflow) {
    return NextResponse.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // ── Gate enforcement ──────────────────────────────────────

  if (status === 'complete') {
    const gate = evaluateGate(stage, { ...workflow, stages: workflow.stages, documents: workflow.documents }, workflow.client)

    if (gate?.locked) {
      return NextResponse.json({
        error: 'Gate condition not met',
        code: 'GATE_BLOCKED',
        gate_reason: gate.reason,
      }, { status: 409 })
    }

    // Dual-review check for Stage 4 + GST > $10k
    if (stage.n === 4 && (workflow.client.net_gst ?? 0) > 10_000) {
      if (!dual_review_confirmed) {
        return NextResponse.json({
          error: 'Dual review required. Set dual_review_confirmed: true to confirm both reviewers have approved.',
          code: 'GATE_BLOCKED',
          gate_reason: `GST $${workflow.client.net_gst?.toLocaleString()} > $10,000 — dual review required.`,
        }, { status: 409 })
      }
    }

    // Stage 5 blocked until Stage 4 complete
    if (stage.n === 5) {
      const reviewStage = (workflow.stages ?? []).find((s: any) => s.n === 4)
      if (reviewStage?.status !== 'complete') {
        return NextResponse.json({
          error: 'Filing is blocked until Stage 4 review is approved.',
          code: 'GATE_BLOCKED',
          gate_reason: 'Stage 4 review must be complete before filing.',
        }, { status: 409 })
      }
    }

    // T1 Stage 5 — T183 authorization must be received before filing
    if (stage.n === 5 && workflow.type === 'T1') {
      const t183Doc = (workflow.documents ?? []).find((d: any) => d.is_t183)
      if (t183Doc && t183Doc.status !== 'received') {
        return NextResponse.json({
          error: 'T183 client authorization form has not been received. The client must sign and upload the T183 before the return can be EFILEd.',
          code: 'GATE_BLOCKED',
          gate_reason: 'T183 authorization required — client must sign before EFILE.',
        }, { status: 409 })
      }
    }

    // Cannot regress status
    const statusOrder: Record<StageStatus, number> = {
      pending: 0, in_progress: 1, blocked: 2, missed: 3, complete: 4,
    }
    if ((statusOrder[status] ?? 0) < (statusOrder[stage.status as StageStatus] ?? 0)) {
      return NextResponse.json({
        error: 'Cannot regress stage status',
        code: 'VALIDATION_ERROR',
      }, { status: 400 })
    }
  }

  // ── Apply update ─────────────────────────────────────────

  const patch: Record<string, unknown> = {}
  if (status) {
    patch.status = status
    if (status === 'complete') patch.completed_at = new Date().toISOString()
  }
  if (note !== undefined) patch.note = note

  const { data: updatedStage, error: updateError } = await supabase
    .from('stages')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // ── Recalculate workflow status ──────────────────────────

  // Refresh stages after update
  const { data: freshStages } = await supabase
    .from('stages')
    .select('*')
    .eq('workflow_id', workflow.id)

  const newComputed = computeWorkflowStatus(
    { ...workflow, stages: freshStages ?? [], documents: workflow.documents },
    workflow.client
  )

  // Advance cur_stage if this stage just completed
  const newCurStage = status === 'complete'
    ? Math.max(workflow.cur_stage, stage.n + 1)
    : workflow.cur_stage

  await supabase
    .from('workflows')
    .update({
      computed_status:        newComputed.status,
      computed_flags:         newComputed.flags,
      days_to_deadline:       newComputed.daysToDeadline,
      cur_stage:              Math.min(newCurStage, 6),
    })
    .eq('id', workflow.id)

  // Log event
  await supabase.from('events').insert({
    client_id:   workflow.client_id,
    firm_id:     workflow.firm_id,
    workflow_id: workflow.id,
    who:         userRow.name,
    action:      `Stage ${stage.n} — ${stage.name} marked ${status ?? 'updated'}`,
    detail:      note ?? null,
  })

  // ── Auto-invoice on Stage 6 completion ──────────────────────────────────────
  // Fire-and-forget: if invoice_on_completion = true and billing rate exists
  if (status === 'complete' && stage.n === 6) {
    supabase
      .from('firm_settings')
      .select('invoice_on_completion, billing_rates')
      .eq('firm_id', workflow.firm_id)
      .single()
      .then(async ({ data: settings }) => {
        if (!settings?.invoice_on_completion) return
        const rates = (settings.billing_rates ?? {}) as Record<string, number>
        const amountCents = rates[workflow.type ?? ''] ?? 0
        if (amountCents <= 0) return

        // Call invoice creation internally
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `sb-access-token=${workflow.firm_id}` },
          body: JSON.stringify({ workflow_id: workflow.id, amount_cents: amountCents }),
        }).catch(() => null) // never block the response
      })
      .catch(() => null)
  }

  return NextResponse.json({
    stage: updatedStage,
    workflow_status: newComputed.status,
    workflow_flags:  newComputed.flags,
  })
}
