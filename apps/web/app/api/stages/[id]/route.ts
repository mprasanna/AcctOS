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
      documents ( id, status, reminder_count ),
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

  // ── Advance next stage to in_progress ──────────────────────
  // The tasks route uses auto_advance_stage() Postgres fn for this.
  // When advancing via the stage button directly (no tasks), we do it here.
  if (status === 'complete' && stage.n < 6) {
    const nextStage = (freshStages ?? []).find((s: any) => s.n === stage.n + 1)
    if (nextStage && nextStage.status === 'pending' && !nextStage.blocked && !nextStage.missed) {
      await supabase
        .from('stages')
        .update({ status: 'in_progress' })
        .eq('id', nextStage.id)
    }
    // Also fire workflow_links in case this stage has a linked target
    await supabase.rpc('fire_workflow_links', {
      p_source_workflow_id: workflow.id,
      p_source_stage_n:     stage.n,
    })
  }

  // If Stage 6 just completed — mark workflow Complete
  if (status === 'complete' && stage.n === 6) {
    await supabase
      .from('workflows')
      .update({ computed_status: 'Complete' })
      .eq('id', workflow.id)
  }

  // Log event
  await supabase.from('events').insert({
    client_id:   workflow.client_id,
    firm_id:     workflow.firm_id,
    workflow_id: workflow.id,
    who:         userRow.name,
    action:      `Stage ${stage.n} — ${stage.name} marked ${status ?? 'updated'}`,
    detail:      note ?? null,
  })

  return NextResponse.json({
    stage: updatedStage,
    workflow_status: newComputed.status,
    workflow_flags:  newComputed.flags,
  })
}
