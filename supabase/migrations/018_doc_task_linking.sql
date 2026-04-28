-- Migration 018: Document ↔ Task linking
-- When a document is marked received, its linked task auto-completes.
-- Run in Supabase SQL Editor.

-- 1. Add task_id to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_documents_task_id ON documents(task_id);

-- 2. Add auto_completed_by_doc to tasks (audit trail)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS auto_completed_by_doc uuid REFERENCES documents(id) ON DELETE SET NULL;

-- 3. Seed links for existing workflows using name matching
-- This links documents to tasks where the names clearly correspond.
-- Review and adjust as needed — no data is deleted, only task_id is set.

-- Example: "Collect bank statements" task ↔ "Bank Statement" document
UPDATE documents d
SET task_id = t.id
FROM tasks t
WHERE d.workflow_id = t.workflow_id
  AND d.task_id IS NULL
  AND (
    -- Bank statements
    (LOWER(d.name) LIKE '%bank statement%' AND LOWER(t.title) LIKE '%bank statement%')
    OR
    -- Expense receipts
    (LOWER(d.name) LIKE '%expense%' AND LOWER(t.title) LIKE '%expense%')
    OR
    -- T183 authorization
    (LOWER(d.name) LIKE '%t183%' AND LOWER(t.title) LIKE '%t183%')
    OR
    -- Sales summary
    (LOWER(d.name) LIKE '%sales summary%' AND LOWER(t.title) LIKE '%sales%')
  );

-- Verify what was linked
SELECT
  d.name as document_name,
  t.title as task_title,
  d.workflow_id
FROM documents d
JOIN tasks t ON t.id = d.task_id
ORDER BY d.workflow_id, d.name
LIMIT 20;
