// app/api/auth/signup/route.ts
// POST /api/auth/signup
// Called after Supabase Auth user is created client-side.
// Creates the firms row and users row for the new firm owner.
// Uses admin client to bypass RLS since the new user has no firm_id yet.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { firm_name, user_name, email, user_id } = body

  if (!firm_name || !email || !user_id) {
    return NextResponse.json({ error: 'firm_name, email, and user_id are required' }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  // Check if user_id already has a firm (prevent double-setup)
  const { data: existingUser } = await admin
    .from('users')
    .select('id, firm_id')
    .eq('id', user_id)
    .single()

  if (existingUser?.firm_id) {
    return NextResponse.json({ ok: true, message: 'Already set up' })
  }

  // 1. Create the firm
  const { data: firm, error: firmErr } = await admin
    .from('firms')
    .insert({
      name:          firm_name.trim(),
      primary_email: email.toLowerCase().trim(),
      plan:          'starter',   // free trial starts on starter
      province:      'ON',        // default — can change in Settings
    })
    .select()
    .single()

  if (firmErr || !firm) {
    console.error('Firm creation failed:', firmErr)
    return NextResponse.json({ error: 'Failed to create firm. Please contact support.' }, { status: 500 })
  }

  // 2. Create the firm_settings row
  await admin.from('firm_settings').insert({
    firm_id:                   firm.id,
    auto_create_workflows:     true,
    doc_reminder_enabled:      true,
    escalate_on_reminder2:     true,
    deadline_alert_days:       3,
    overdue_flag_enabled:      true,
    notify_owner_on_escalation: true,
    notify_assigned_on_advance: false,
    dual_review_threshold:     10000,
    require_upload_to_receive: false,
    doc_reminder_send_to_client: false,
    invoice_on_completion:     false,
    billing_rates: {
      'GST/HST':    35000,   // $350 CAD in cents
      'T1':         65000,   // $650
      'T2':         120000,  // $1,200
      'Payroll':    20000,   // $200
      'Bookkeeping': 40000,  // $400
    },
  })

  // 3. Create the owner user row
  const initials = (user_name || email)
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const { data: user, error: userErr } = await admin
    .from('users')
    .insert({
      id:       user_id,       // must match Supabase Auth UUID
      firm_id:  firm.id,
      name:     user_name?.trim() || email.split('@')[0],
      email:    email.toLowerCase().trim(),
      initials: initials || 'PW',
      role:     'owner',
    })
    .select()
    .single()

  if (userErr || !user) {
    console.error('User creation failed:', userErr)
    // Rollback firm if user creation fails
    await admin.from('firms').delete().eq('id', firm.id)
    return NextResponse.json({ error: 'Failed to create user profile. Please contact support.' }, { status: 500 })
  }

  // 4. Log welcome event
  await admin.from('events').insert({
    firm_id:     firm.id,
    event_type:  'firm_created',
    description: `${firm_name} joined AcctOS`,
    metadata:    { plan: 'starter', owner_email: email },
  }).catch(() => {}) // non-critical

  return NextResponse.json({
    ok:      true,
    firm_id: firm.id,
    user_id: user.id,
  }, { status: 201 })
}
