import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── POST /api/automation/trigger ────────────────────────────────────────────
// Manually trigger an automation job or reschedule all jobs for a workflow.
// Used from the Settings page and for testing.
//
// Body options:
//   { action: 'trigger_job', job_id: 'uuid' }
//   → immediately set job scheduled_at to now() so next cron run picks it up
//
//   { action: 'reschedule_workflow', workflow_id: 'uuid' }
//   → cancel all pending jobs for workflow and reschedule from scratch
//
//   { action: 'cancel_job', job_id: 'uuid' }
//   → mark job as cancelled (will not be processed)
//
//   { action: 'send_test_email', type: 'doc_reminder'|'deadline_alert', workflow_id: 'uuid' }
//   → send a test email immediately (owner only)

export async function POST(req: NextRequest) {
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

  if (!['owner', 'senior_accountant'].includes(userRow?.role ?? '')) {
    return NextResponse.json(
      { error: 'Only owner and senior accountant can trigger automation actions', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { action, job_id, workflow_id, type } = body

  if (!action) {
    return NextResponse.json({ error: 'action is required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  switch (action) {
    case 'trigger_job': {
      if (!job_id) return NextResponse.json({ error: 'job_id required', code: 'VALIDATION_ERROR' }, { status: 400 })

      const { data: job } = await supabase
        .from('automation_jobs')
        .select('id, status')
        .eq('id', job_id)
        .single()

      if (!job) return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 })
      if (job.status === 'cancelled') {
        return NextResponse.json({ error: 'Cannot trigger a cancelled job', code: 'VALIDATION_ERROR' }, { status: 400 })
      }

      await supabase
        .from('automation_jobs')
        .update({ status: 'pending', scheduled_at: new Date().toISOString() })
        .eq('id', job_id)

      return NextResponse.json({ triggered: true, job_id, message: 'Job will be processed in the next cron run (up to 15 min)' })
    }

    case 'reschedule_workflow': {
      if (!workflow_id) return NextResponse.json({ error: 'workflow_id required', code: 'VALIDATION_ERROR' }, { status: 400 })

      // Cancel existing pending jobs
      await supabase
        .from('automation_jobs')
        .update({ status: 'cancelled' })
        .eq('workflow_id', workflow_id)
        .eq('status', 'pending')

      // Re-schedule via the Postgres function
      const { error: rpcError } = await supabase
        .rpc('schedule_automation_jobs', {
          p_workflow_id: workflow_id,
          p_firm_id:     userRow!.firm_id,
        })

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
      }

      return NextResponse.json({ rescheduled: true, workflow_id })
    }

    case 'cancel_job': {
      if (!job_id) return NextResponse.json({ error: 'job_id required', code: 'VALIDATION_ERROR' }, { status: 400 })

      await supabase
        .from('automation_jobs')
        .update({ status: 'cancelled' })
        .eq('id', job_id)
        .eq('status', 'pending')   // only cancel pending jobs

      return NextResponse.json({ cancelled: true, job_id })
    }

    case 'send_test_email': {
      if (!workflow_id || !type) {
        return NextResponse.json({ error: 'workflow_id and type required', code: 'VALIDATION_ERROR' }, { status: 400 })
      }

      // Create a job scheduled for right now — will be picked up by next cron run
      const { data: job } = await supabase
        .from('automation_jobs')
        .insert({
          firm_id:      userRow!.firm_id,
          workflow_id,
          type,
          status:       'pending',
          scheduled_at: new Date().toISOString(),
          payload:      { test: true },
        })
        .select('id')
        .single()

      return NextResponse.json({
        queued:  true,
        job_id:  job?.id,
        message: `Test ${type} job queued. Will send in the next cron run (up to 15 min). To send immediately, call the Edge Function directly.`,
      }, { status: 201 })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}`, code: 'VALIDATION_ERROR' }, { status: 400 })
  }
}
