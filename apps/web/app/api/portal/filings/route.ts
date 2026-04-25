// app/api/portal/filings/route.ts
// GET /api/portal/filings
// Authenticated portal user — returns all workflows for their client
// with stage progress, deadline, pending doc count, and computed status.

import { NextRequest } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  // Fetch workflows with their stages and document counts
  const { data: workflows, error: wfErr } = await supabase
    .from('workflows')
    .select(`
      id,
      type,
      period,
      deadline,
      cur_stage,
      computed_status,
      cycle_start,
      stages (
        id, n, name, status
      ),
      documents ( id, status )
    `)
    .eq('client_id', portalUser!.client_id)
    .eq('firm_id', portalUser!.firm_id)
    .order('deadline', { ascending: true })

  if (wfErr) return err('Failed to load filings', 500)

  const today = new Date()

  const filings = (workflows ?? []).map(wf => {
    const stages = (wf.stages ?? []).sort((a: any, b: any) => a.n - b.n)
    const currentStage = stages.find((s: any) => s.n === wf.cur_stage)
    const pendingDocs = (wf.documents ?? []).filter((d: any) => d.status === 'pending').length
    const deadline = new Date(wf.deadline)
    const daysToDeadline = Math.floor((deadline.getTime() - today.getTime()) / 86400000)

    return {
      id:                wf.id,
      type:              wf.type,
      period_label:      wf.period,
      deadline:          wf.deadline,
      days_to_deadline:  daysToDeadline,
      cur_stage:         wf.cur_stage,
      stage_name:        currentStage?.name ?? '',
      status:            wf.computed_status ?? 'On Track',
      pending_docs_count: pendingDocs,
      stages:            stages.map((s: any) => ({
        n:      s.n,
        name:   s.name,
        status: s.status,
      })),
    }
  })

  return ok({ filings })
}
