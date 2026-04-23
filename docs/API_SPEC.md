# AcctOS — REST API Specification
> Version 1.0 · Phase 1

All endpoints are under `/api/` and served by Next.js App Router route handlers.  
Authentication: Supabase JWT in `Authorization: Bearer <token>` header.  
All responses are `application/json`. Errors follow `{ error: string, code?: string }`.

---

## Authentication

### POST /api/auth/login
Sign in with email + password via Supabase Auth.

**Request**
```json
{ "email": "patrick@jensen.ca", "password": "..." }
```

**Response 200**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "firm_id": "uuid",
    "name": "Patrick W.",
    "initials": "PW",
    "role": "owner"
  }
}
```

**Errors**
- `401` — Invalid credentials
- `429` — Rate limited (5 attempts per 15 min per IP)

---

### POST /api/auth/refresh
Exchange a refresh token for a new access token.

**Request**
```json
{ "refresh_token": "..." }
```

**Response 200**
```json
{ "access_token": "eyJ...", "refresh_token": "..." }
```

---

### POST /api/auth/logout
Invalidate the current session.

**Response 204** — No content

---

## Clients

### GET /api/clients
List all clients for the authenticated firm. Computed workflow status is included.

**Query params**
| Param | Type | Default | Description |
|---|---|---|---|
| `status` | `On Track \| At Risk \| Overdue \| Complete` | all | Filter by computed status |
| `assigned_to` | uuid | — | Filter by assigned user |
| `q` | string | — | Search by name |
| `sort` | `risk_score \| name \| deadline` | `risk_score` | Sort field |

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Maple Contracting Ltd.",
      "type": "Corporation",
      "freq": "Monthly",
      "city": "Ottawa, ON",
      "since": "2022",
      "bn": "814**...",            // masked in list view
      "initials": "MC",
      "assigned_to": "uuid",
      "assigned_user": { "id": "uuid", "name": "Kiera S.", "initials": "KS" },
      "net_gst": 4820,
      "risk_history": false,
      "penalty_risk": null,
      "status": "On Track",        // aggregated from worst workflow
      "flags": [],
      "days_to_deadline": 17,
      "risk_score": 10,
      "active_workflow": { ... },  // worst-status workflow summary
      "workflow_count": 3,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2025-10-06T10:14:00Z"
    }
  ],
  "meta": { "total": 6, "filtered": 6 }
}
```

---

### GET /api/clients/:id
Get a single client with full workflow detail.

**Response 200**
```json
{
  "id": "uuid",
  "name": "Maple Contracting Ltd.",
  "type": "Corporation",
  "freq": "Monthly",
  "city": "Ottawa, ON",
  "since": "2022",
  "bn": "81427 3910 RT0001",      // unmasked for detail view (owner + senior only)
  "initials": "MC",
  "assigned_to": "uuid",
  "assigned_user": { ... },
  "net_gst": 4820,
  "risk_history": false,
  "penalty_risk": null,
  "status": "On Track",
  "flags": [],
  "days_to_deadline": 17,
  "risk_score": 10,
  "workflows": [ ... ],            // array of full workflow objects (see below)
  "email_log": [ ... ],
  "created_at": "...",
  "updated_at": "..."
}
```

**Errors**
- `404` — Client not found or not in this firm

---

### POST /api/clients
Create a new client and auto-generate the first workflow.

**Request**
```json
{
  "name": "New Corp Inc.",
  "type": "Corporation",
  "freq": "Monthly",
  "city": "Ottawa, ON",
  "since": "2025",
  "bn": "12345 6789 RT0001",
  "assigned_to": "uuid",
  "net_gst": null
}
```

**Response 201**
```json
{ "id": "uuid", ...client }
```

**Errors**
- `400` — Missing required fields or invalid enum value
- `409` — BN already on file for this firm

---

### PATCH /api/clients/:id
Update client profile fields. Does not affect workflows.

**Request** (all fields optional)
```json
{
  "name": "Updated Name Ltd.",
  "assigned_to": "uuid",
  "net_gst": 5200,
  "risk_history": true,
  "penalty_risk": "HIGH"
}
```

**Response 200** — Updated client object

---

### DELETE /api/clients/:id
Archive a client (soft delete). Requires `owner` or `senior_accountant` role.

**Response 204**

---

## Workflows

### GET /api/workflows
List all workflows across all clients in the firm.

**Query params**
| Param | Type | Description |
|---|---|---|
| `client_id` | uuid | Filter to one client |
| `type` | workflow_type | Filter by type |
| `status` | workflow_status | Filter by computed status |
| `sort` | `deadline \| risk_score` | Default: `deadline` |

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "client_name": "Maple Contracting Ltd.",
      "type": "GST/HST",
      "label": "GST/HST — October 2025",
      "period": "Oct 2025",
      "deadline": "2025-10-31",
      "cycle_start": "2025-10-01",
      "cur_stage": 3,
      "task_in_progress_days": 2,
      "computed_status": "On Track",
      "computed_flags": [],
      "days_to_deadline": 17,
      "stages": [ ... ],
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "meta": { "total": 8 }
}
```

---

### GET /api/workflows/:id
Get a single workflow with full stages, tasks, and documents.

**Response 200**
```json
{
  "id": "uuid",
  "client_id": "uuid",
  "client": { "id": "uuid", "name": "Maple Contracting Ltd.", "type": "Corporation", "net_gst": 4820, "risk_history": false },
  "type": "GST/HST",
  "label": "GST/HST — October 2025",
  "period": "Oct 2025",
  "deadline": "2025-10-31",
  "cycle_start": "2025-10-01",
  "cur_stage": 3,
  "task_in_progress_days": 2,
  "computed_status": "On Track",
  "computed_flags": [],
  "days_to_deadline": 17,
  "stages": [
    {
      "id": "uuid",
      "n": 1,
      "name": "Bookkeeping",
      "status": "complete",
      "date_label": "Oct 2",
      "completed_at": "2025-10-02T09:11:00Z",
      "gate": "bookkeepingStatus = complete",
      "gate_label": "Bookkeeping confirmed in QBO",
      "blocked": false,
      "block_reason": null,
      "missed": false,
      "note": "Reconciled in QBO — Oct 2"
    }
  ],
  "tasks": [ ... ],
  "documents": [ ... ]
}
```

---

### POST /api/workflows
Create a new workflow for a client.

**Request**
```json
{
  "client_id": "uuid",
  "type": "GST/HST",
  "period": "Nov 2025",
  "deadline": "2025-11-30",
  "cycle_start": "2025-11-01"
}
```
Stage and task templates are auto-generated from `type` + client `type`.

**Response 201** — Full workflow object

---

### PATCH /api/workflows/:id
Update workflow-level fields (not stages — use stage endpoints).

**Request**
```json
{
  "deadline": "2025-11-30",
  "task_in_progress_days": 3
}
```

**Response 200** — Updated workflow

---

## Stages

### PATCH /api/stages/:id
Advance or update a stage. Gate enforcement runs server-side before the update.

**Request**
```json
{
  "status": "complete",
  "note": "ITC reconciliation confirmed"
}
```

**Gate enforcement rules (server-side)**:
- Stage 2 → `complete` blocked if any docs still `pending`
- Stage 3 → `complete` for Corporation requires `taskInProgressDays` acknowledgement
- Stage 4 → `complete` for GST > $10k requires `dual_review_confirmed: true`
- Stage 5 → `complete` blocked if Stage 4 not `complete`
- Any stage → cannot go backwards (status regression blocked)

**Response 200** — Updated stage + recalculated workflow status

**Errors**
- `409` — Gate condition not met; body contains `{ gate_reason: "..." }`
- `403` — Insufficient role for this stage transition

---

## Tasks

### GET /api/tasks
List tasks, optionally filtered.

**Query params**: `workflow_id`, `assigned_to`, `status`, `stage_n`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "workflow_id": "uuid",
      "stage_n": 3,
      "title": "Calculate GST and prepare draft return",
      "assigned_to": "uuid",
      "assigned_initials": "KS",
      "due_date": "2025-10-10",
      "status": "in_progress",
      "sort_order": 6
    }
  ]
}
```

---

### PATCH /api/tasks/:id
Update a task status or assignment.

**Request**
```json
{
  "status": "complete",
  "assigned_to": "uuid"
}
```

Side effects:
- When all tasks in a stage reach `complete`, the stage auto-advances (if gate passes)
- `task_in_progress_days` is reset on status change to `complete`
- An event is logged

**Response 200** — Updated task

---

## Documents

### GET /api/documents
List documents for a workflow or client.

**Query params**: `workflow_id` (required), `status`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "workflow_id": "uuid",
      "name": "Bank_Statement_Oct25.pdf",
      "status": "received",
      "reminder_count": 0,
      "last_reminder_at": null,
      "uploaded_at": "2025-10-05T00:00:00Z",
      "upload_source": "Client upload",
      "storage_path": "firm_id/client_id/workflow_id/Bank_Statement_Oct25.pdf"
    }
  ]
}
```

---

### PATCH /api/documents/:id
Mark a document as received or update reminder count.

**Request**
```json
{
  "status": "received",
  "upload_source": "Manual"
}
```

Side effect: if all documents in workflow move to `received`, Stage 2 gate unblocks automatically.

**Response 200** — Updated document

---

### POST /api/documents/request
Trigger a document request email to the client.

**Request**
```json
{
  "workflow_id": "uuid",
  "document_ids": ["uuid", "uuid"],
  "type": "Reminder #2"
}
```

**Response 201**
```json
{
  "sent": true,
  "email_log_id": "uuid",
  "reminder_count_updated": 3
}
```

**Errors**
- `403` — Only `owner` or `admin` can send reminders
- `429` — Max 1 reminder per document per 24h

---

## Users

### GET /api/users
List all users in the firm.

**Response 200**
```json
{
  "data": [
    { "id": "uuid", "name": "Patrick W.", "initials": "PW", "email": "...", "role": "owner" }
  ]
}
```

---

### POST /api/users/invite
Invite a new team member. Sends Supabase Auth invite email.

**Request**
```json
{ "email": "newuser@jensen.ca", "name": "Alex M.", "role": "accountant" }
```

**Response 201**
```json
{ "invited": true, "email": "newuser@jensen.ca" }
```

**Role guard**: Only `owner` can invite users.

---

### PATCH /api/users/:id
Update user profile or role.

**Request**
```json
{ "role": "senior_accountant", "name": "Alex M." }
```

**Role guard**: Only `owner` can change roles.

**Response 200** — Updated user

---

## Dashboard / Aggregates

### GET /api/dashboard
Returns pre-aggregated stats for the command centre. Optimised single query.

**Response 200**
```json
{
  "stats": {
    "active_filings": 7,
    "on_track": 3,
    "at_risk": 1,
    "overdue": 1,
    "complete": 1
  },
  "soon_at_risk": [
    { "id": "uuid", "name": "Riviera Auto Body", "days_to_deadline": 4 }
  ],
  "spotlights": [ ...top 3 clients by risk_score ],
  "as_of": "2025-10-14T09:00:00Z"
}
```

---

## Error Codes

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Authenticated but insufficient role |
| 404 | `NOT_FOUND` | Resource not found or not in this firm |
| 409 | `GATE_BLOCKED` | Stage/task gate condition not met |
| 409 | `CONFLICT` | Duplicate resource (BN already exists) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Versioning

No versioning in Phase 1. When breaking changes are needed in Phase 2, prefix routes with `/api/v2/`.
