// ============================================================
// AcctOS — Database Types
// Auto-generated shape matching supabase/migrations/001–003
// ============================================================

export type UserRole = 'owner' | 'senior_accountant' | 'accountant' | 'admin';
export type ClientType = 'Corporation' | 'Sole prop' | 'Partnership';
export type FilingFreq = 'Monthly' | 'Quarterly' | 'Annual';
export type PenaltyRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type PlanTier = 'Starter' | 'Growth' | 'Scale';
export type WorkflowType = 'GST/HST' | 'T1' | 'T2' | 'Payroll' | 'Bookkeeping' | 'Financial Statements' | 'Other';
export type WorkflowStatus = 'On Track' | 'At Risk' | 'Overdue' | 'Complete';
export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'blocked' | 'missed';
export type TaskStatus = 'pending' | 'in_progress' | 'complete' | 'blocked' | 'missed';
export type DocumentStatus = 'pending' | 'received' | 'rejected';

// ────────────────────────────────────────────────────────────
// Row types (DB shape)
// ────────────────────────────────────────────────────────────

export interface FirmRow {
  id: string;
  name: string;
  plan: PlanTier;
  primary_email: string | null;
  province: string;
  cra_bn: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  firm_id: string;
  name: string;
  initials: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  firm_id: string;
  name: string;
  type: ClientType;
  freq: FilingFreq;
  city: string | null;
  since: string | null;
  bn: string | null;
  initials: string | null;
  assigned_to: string | null;
  net_gst: number | null;
  risk_history: boolean;
  penalty_risk: PenaltyRisk | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRow {
  id: string;
  client_id: string;
  firm_id: string;
  type: WorkflowType;
  label: string;
  period: string;
  deadline: string;       // ISO date string
  cycle_start: string;    // ISO date string
  cur_stage: number;
  task_in_progress_days: number;
  computed_status: WorkflowStatus;
  computed_flags: string[];
  days_to_deadline: number | null;
  created_at: string;
  updated_at: string;
}

export interface StageRow {
  id: string;
  workflow_id: string;
  firm_id: string;
  n: number;
  name: string;
  status: StageStatus;
  date_label: string | null;
  completed_at: string | null;
  gate: string | null;
  gate_label: string | null;
  blocked: boolean;
  block_reason: string | null;
  missed: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  workflow_id: string;
  firm_id: string;
  stage_n: number | null;
  title: string;
  assigned_to: string | null;
  assigned_initials: string | null;
  due_date: string | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  workflow_id: string;
  client_id: string;
  firm_id: string;
  name: string;
  status: DocumentStatus;
  reminder_count: number;
  last_reminder_at: string | null;
  uploaded_at: string | null;
  upload_source: string | null;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLogRow {
  id: string;
  client_id: string;
  firm_id: string;
  workflow_id: string | null;
  type: string;
  sent_at: string;
  status: string;
}

export interface EventRow {
  id: string;
  client_id: string;
  firm_id: string;
  workflow_id: string | null;
  who: string;
  action: string;
  detail: string | null;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// Supabase Database type (for createClient<Database>())
// ────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      firms:      { Row: FirmRow;      Insert: Omit<FirmRow, 'id' | 'created_at' | 'updated_at'>;      Update: Partial<FirmRow> };
      users:      { Row: UserRow;      Insert: Omit<UserRow, 'created_at' | 'updated_at'>;              Update: Partial<UserRow> };
      clients:    { Row: ClientRow;    Insert: Omit<ClientRow, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<ClientRow> };
      workflows:  { Row: WorkflowRow;  Insert: Omit<WorkflowRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<WorkflowRow> };
      stages:     { Row: StageRow;     Insert: Omit<StageRow, 'id' | 'created_at' | 'updated_at'>;    Update: Partial<StageRow> };
      tasks:      { Row: TaskRow;      Insert: Omit<TaskRow, 'id' | 'created_at' | 'updated_at'>;     Update: Partial<TaskRow> };
      documents:  { Row: DocumentRow;  Insert: Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<DocumentRow> };
      email_log:  { Row: EmailLogRow;  Insert: Omit<EmailLogRow, 'id'>;                                Update: never };
      events:     { Row: EventRow;     Insert: Omit<EventRow, 'id'>;                                   Update: never };
    };
    Enums: {
      user_role: UserRole;
      client_type: ClientType;
      filing_freq: FilingFreq;
      penalty_risk_level: PenaltyRisk;
      plan_tier: PlanTier;
      workflow_type: WorkflowType;
      workflow_status: WorkflowStatus;
      stage_status: StageStatus;
      task_status: TaskStatus;
      document_status: DocumentStatus;
    };
  };
}

// ────────────────────────────────────────────────────────────
// API response shapes (enriched with joins)
// ────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
}

export interface WorkflowSummary extends WorkflowRow {
  stages: StageRow[];
}

export interface ClientSummary extends ClientRow {
  assigned_user: UserPublic | null;
  status: WorkflowStatus;
  flags: string[];
  days_to_deadline: number | null;
  risk_score: number;
  active_workflow: WorkflowSummary | null;
  workflow_count: number;
}

export interface ClientDetail extends ClientSummary {
  workflows: WorkflowWithDetails[];
  email_log: EmailLogRow[];
}

export interface WorkflowWithDetails extends WorkflowRow {
  client: Pick<ClientRow, 'id' | 'name' | 'type' | 'net_gst' | 'risk_history' | 'penalty_risk'>;
  stages: StageRow[];
  tasks: TaskRow[];
  documents: DocumentRow[];
}

export interface DashboardStats {
  stats: {
    active_filings: number;
    on_track: number;
    at_risk: number;
    overdue: number;
    complete: number;
  };
  soon_at_risk: Array<{ id: string; name: string; days_to_deadline: number }>;
  spotlights: ClientSummary[];
  as_of: string;
}

// ────────────────────────────────────────────────────────────
// Phase 2 Row types
// ────────────────────────────────────────────────────────────

export interface FirmSettingsRow {
  id:                          string;
  firm_id:                     string;
  auto_create_workflows:       boolean;
  doc_reminder_enabled:        boolean;
  escalate_on_reminder2:       boolean;
  deadline_alert_days:         number;
  overdue_flag_enabled:        boolean;
  notify_owner_on_escalation:  boolean;
  notify_assigned_on_advance:  boolean;
  dual_review_threshold:       number;
  created_at:                  string;
  updated_at:                  string;
}

export interface StorageObjectRow {
  id:            string;
  firm_id:       string;
  client_id:     string;
  workflow_id:   string;
  document_id:   string | null;
  bucket:        string;
  storage_path:  string;
  original_name: string;
  content_type:  string | null;
  size_bytes:    number | null;
  checksum:      string | null;
  version:       number;
  superseded_by: string | null;
  uploaded_by:   string | null;
  upload_source: string;
  created_at:    string;
}

export interface AutoAdvanceLogRow {
  id:              string;
  firm_id:         string;
  workflow_id:     string;
  stage_n:         number;
  trigger_type:    string;
  trigger_detail:  string | null;
  previous_status: string;
  new_status:      string;
  created_at:      string;
}

export interface WorkflowLinkRow {
  id:                  string;
  firm_id:             string;
  source_workflow_id:  string;
  source_stage_n:      number;
  target_workflow_id:  string;
  target_stage_n:      number;
  active:              boolean;
  created_at:          string;
}

export interface UserInvitationRow {
  id:          string;
  firm_id:     string;
  email:       string;
  role:        UserRole;
  invited_by:  string | null;
  token:       string;
  expires_at:  string;
  accepted_at: string | null;
  created_at:  string;
}
