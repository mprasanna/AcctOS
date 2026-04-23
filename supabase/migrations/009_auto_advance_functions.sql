-- ============================================================
-- AcctOS — Migration 009: Auto-Advance Function + Phase 2 Seed
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- AUTO-ADVANCE STAGE FUNCTION
--
-- Called from the API after any task is marked complete.
-- Checks if all tasks in a stage are complete, gate passes,
-- then advances the stage and optionally the next stage too.
--
-- Returns: the new stage status and whether an advance occurred.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_advance_stage(
  p_workflow_id uuid,
  p_stage_n     smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage           stages%ROWTYPE;
  v_all_tasks_done  boolean;
  v_missing_docs    integer;
  v_advanced        boolean := false;
  v_log_detail      text;
BEGIN
  -- Get the stage
  SELECT * INTO v_stage
  FROM stages
  WHERE workflow_id = p_workflow_id AND n = p_stage_n;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('advanced', false, 'reason', 'stage not found');
  END IF;

  -- Already complete — nothing to do
  IF v_stage.status = 'complete' THEN
    RETURN jsonb_build_object('advanced', false, 'reason', 'already complete');
  END IF;

  -- Check all tasks in this stage are complete
  SELECT NOT EXISTS (
    SELECT 1 FROM tasks
    WHERE workflow_id = p_workflow_id
      AND stage_n = p_stage_n
      AND status NOT IN ('complete')
  ) INTO v_all_tasks_done;

  IF NOT v_all_tasks_done THEN
    RETURN jsonb_build_object('advanced', false, 'reason', 'tasks still pending');
  END IF;

  -- Gate checks per stage
  IF p_stage_n = 2 THEN
    -- Stage 2 needs all docs received
    SELECT COUNT(*) INTO v_missing_docs
    FROM documents
    WHERE workflow_id = p_workflow_id AND status = 'pending';

    IF v_missing_docs > 0 THEN
      RETURN jsonb_build_object(
        'advanced', false,
        'reason', format('%s documents still pending', v_missing_docs)
      );
    END IF;
  END IF;

  -- All checks passed — advance the stage
  UPDATE stages
  SET
    status       = 'complete',
    completed_at = now(),
    note         = COALESCE(note, 'Auto-advanced: all tasks complete · ' ||
                   TO_CHAR(now(), 'Mon DD'))
  WHERE workflow_id = p_workflow_id AND n = p_stage_n;

  -- Advance cur_stage on the workflow
  UPDATE workflows
  SET cur_stage = GREATEST(cur_stage, p_stage_n + 1)
  WHERE id = p_workflow_id
    AND cur_stage <= p_stage_n;

  -- Log the auto-advance
  INSERT INTO auto_advance_log (
    firm_id, workflow_id, stage_n,
    trigger_type, trigger_detail,
    previous_status, new_status
  )
  SELECT
    w.firm_id, p_workflow_id, p_stage_n,
    'all_tasks_complete',
    format('Stage %s auto-advanced after all tasks completed', p_stage_n),
    v_stage.status, 'complete'
  FROM workflows w WHERE w.id = p_workflow_id;

  -- Set next stage to in_progress (if it's pending and not blocked)
  UPDATE stages
  SET status = 'in_progress'
  WHERE workflow_id = p_workflow_id
    AND n = p_stage_n + 1
    AND status = 'pending'
    AND blocked = false
    AND missed = false;

  -- Check if this advance should trigger a workflow_link
  PERFORM fire_workflow_links(p_workflow_id, p_stage_n);

  v_advanced := true;
  RETURN jsonb_build_object(
    'advanced',    true,
    'stage_n',     p_stage_n,
    'next_stage',  p_stage_n + 1,
    'reason',      'all tasks complete, gate passed'
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- WORKFLOW LINKS TRIGGER FUNCTION
-- When a source stage completes, advance the linked target stage.
-- This is the Bookkeeping → GST Stage 1 feed.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fire_workflow_links(
  p_source_workflow_id  uuid,
  p_source_stage_n      smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link  workflow_links%ROWTYPE;
BEGIN
  FOR v_link IN
    SELECT * FROM workflow_links
    WHERE source_workflow_id = p_source_workflow_id
      AND source_stage_n     = p_source_stage_n
      AND active             = true
  LOOP
    -- Mark the target stage as in_progress (Stage 1 gate passed = bookkeeping done)
    UPDATE stages
    SET
      status = 'complete',
      completed_at = now(),
      note = format('Auto-completed via linked workflow (bookkeeping feed) · %s',
                    TO_CHAR(now(), 'Mon DD'))
    WHERE workflow_id = v_link.target_workflow_id
      AND n           = v_link.target_stage_n
      AND status      = 'pending';

    -- Advance target workflow cur_stage
    UPDATE workflows
    SET cur_stage = GREATEST(cur_stage, v_link.target_stage_n + 1)
    WHERE id = v_link.target_workflow_id
      AND cur_stage <= v_link.target_stage_n;

    -- Start next stage on target
    UPDATE stages
    SET status = 'in_progress'
    WHERE workflow_id = v_link.target_workflow_id
      AND n           = v_link.target_stage_n + 1
      AND status      = 'pending'
      AND blocked     = false;

    -- Log
    INSERT INTO auto_advance_log (
      firm_id, workflow_id, stage_n,
      trigger_type, trigger_detail,
      previous_status, new_status
    )
    SELECT
      w.firm_id,
      v_link.target_workflow_id,
      v_link.target_stage_n,
      'bookkeeping_linked',
      format('Stage auto-advanced from linked workflow %s', p_source_workflow_id),
      'pending', 'complete'
    FROM workflows w WHERE w.id = v_link.target_workflow_id;
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- PHASE 2 SEED: default settings for demo firm
-- ────────────────────────────────────────────────────────────

INSERT INTO firm_settings (firm_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (firm_id) DO NOTHING;
