import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeWorkflowStatus } from '@/lib/risk-engine'

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

  const body = await req.json()
  const { status, upload_source } = body

  // ── Fetch the document to check upload_required ──────────────────────────
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id, upload_required, storage_path, workflow_id, firm_id')
    .eq('id', params.id)
    .single()

  // ── Enforce upload_required: cannot mark received without a file ──────────
  if (status === 'received' && existingDoc?.upload_required) {
    if (!existingDoc.storage_path) {
      return NextResponse.json({
        error: 'This document requires a file upload before it can be marked received. Upload the file first.',
        code: 'UPLOAD_REQUIRED',
      }, { status: 409 })
    }
  }

  const patch: Record<string, unknown> = {}
  if (status)        patch.status = status
  if (upload_source) patch.upload_source = upload_source
  if (status === 'received') {
    patch.uploaded_at = new Date().toISOString()
  }

  const { data: updatedDoc, error: updateError } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // ── Check if all docs in workflow are now received ─────────────────────────
  // If so: unblock Stage 2 → set to 'complete'; unblock Stage 3 → 'pending'

  if (status === 'received') {
    const { data: allDocs } = await supabase
      .from('documents')
      .select('status')
      .eq('workflow_id', updatedDoc.workflow_id)

    const allReceived = (allDocs ?? []).every(d => d.status === 'received')

    if (allReceived) {
      // Advance Stage 2 to complete
      await supabase
        .from('stages')
        .update({
          status:       'complete',
          completed_at: new Date().toISOString(),
          blocked:      false,
          block_reason: null,
          note:         `All docs received · ${new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`,
        })
        .eq('workflow_id', updatedDoc.workflow_id)
        .eq('n', 2)

      // Unblock downstream stages
      await supabase
        .from('stages')
        .update({ blocked: false, block_reason: null })
        .eq('workflow_id', updatedDoc.workflow_id)
        .in('n', [3, 4, 5])
        .eq('blocked', true)

      // Advance workflow cur_stage
      const { data: wf } = await supabase
        .from('workflows')
        .select('cur_stage')
        .eq('id', updatedDoc.workflow_id)
        .single()

      if (wf && wf.cur_stage < 3) {
        await supabase
          .from('workflows')
          .update({ cur_stage: 3 })
          .eq('id', updatedDoc.workflow_id)
      }

      // Log event
      if (userRow) {
        await supabase.from('events').insert({
          client_id:   updatedDoc.client_id,
          firm_id:     userRow.firm_id,
          workflow_id: updatedDoc.workflow_id,
          who:         userRow.name,
          action:      'Marked documents complete',
          detail:      `All documents received — Stage 3 unblocked`,
        })
      }
    }

    // Recompute workflow status
    const { data: workflow } = await supabase
      .from('workflows')
      .select(`
        *,
        stages ( * ),
        documents ( id, status, reminder_count ),
        client:clients!workflows_client_id_fkey ( id, type, net_gst, risk_history, penalty_risk )
      `)
      .eq('id', updatedDoc.workflow_id)
      .single()

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
    }
  }

  return NextResponse.json({ document: updatedDoc })
}
