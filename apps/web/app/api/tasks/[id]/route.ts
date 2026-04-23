import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeWorkflowStatus } from '@/lib/risk-engine'
import type { TaskStatus } from '@/types/database'

type RouteParams = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, name')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const { status, assigned_to } = body as { status?: TaskStatus; assigned_to?: string }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.id)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}
  if (status !== undefined)      patch.status = status
  if (assigned_to !== undefined) patch.assigned_to = assigned_to

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No patchable fields', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Reset stall counter when task completes or starts
  if (status === 'complete') {
    await supabase
      .from('workflows')
      .update({ task_in_progress_days: 0 })
      .eq('id', task.workflow_id)
  } else if (status === 'in_progress') {
    // Mark when task started for C4 stall detection
    await supabase
      .from('workflows')
      .update({ task_in_progress_days: 0 })
      .eq('id', task.workflow_id)
  }

  // Update the task
  const { data: updatedTask, error: updateError } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // ── Auto-advance: call the Postgres function ────────────────
  // The function checks if all tasks in the stage are complete,
  // evaluates gate conditions, and advances the stage if so.
  // It also fires workflow_links (Bookkeeping → GST).

  let autoAdvanceResult: any = null

  if (status === 'complete' && task.stage_n) {
    const { data: advResult } = await supabase
      .rpc('auto_advance_stage', {
        p_workflow_id: task.workflow_id,
        p_stage_n:     task.stage_n,
      })

    autoAdvanceResult = advResult

    // If the stage advanced, also mark the next stage as in_progress
    // (done inside the Postgres function — we just reflect the result)
  }

  // ── Recompute workflow status ──────────────────────────────
  // Always recompute after any task change to keep computed_status fresh

  const { data: workflow } = await supabase
    .from('workflows')
    .select(`
      *,
      stages ( * ),
      documents ( id, status, reminder_count ),
      client:clients!workflows_client_id_fkey ( id, type, net_gst, risk_history, penalty_risk )
    `)
    .eq('id', task.workflow_id)
    .single()

  let updatedWorkflowStatus = null

  if (workflow) {
    const newComputed = computeWorkflowStatus(
      { ...workflow, stages: workflow.stages, documents: workflow.documents },
      workflow.client
    )

    await supabase
      .from('workflows')
      .update({
        computed_status:  newComputed.status,
        computed_flags:   newComputed.flags,
        days_to_deadline: newComputed.daysToDeadline,
      })
      .eq('id', workflow.id)

    updatedWorkflowStatus = {
      status:          newComputed.status,
      flags:           newComputed.flags,
      days_to_deadline: newComputed.daysToDeadline,
    }
  }

  // ── Log event ─────────────────────────────────────────────

  if (status) {
    await supabase.from('events').insert({
      client_id:   workflow?.client_id ?? '',
      firm_id:     userRow.firm_id,
      workflow_id: task.workflow_id,
      who:         userRow.name,
      action:      `Task "${task.title}" — ${status.replace('_', ' ')}`,
      detail:      autoAdvanceResult?.advanced
        ? `Stage ${task.stage_n} auto-advanced to complete`
        : null,
    })
  }

  return NextResponse.json({
    task:             updatedTask,
    auto_advance:     autoAdvanceResult,
    workflow_status:  updatedWorkflowStatus,
  })
}
