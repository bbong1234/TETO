-- P5: deletePhase 事务化 RPC
-- 置空关联记录/目标的 phase_id，物理删除阶段 — 原子操作
-- 部署：在 Supabase Dashboard SQL Editor 中手动执行

CREATE OR REPLACE FUNCTION rpc_delete_phase(
  p_user_id UUID,
  p_phase_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM phases WHERE id = p_phase_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PHASE_NOT_FOUND');
  END IF;

  UPDATE records SET phase_id = NULL WHERE phase_id = p_phase_id AND user_id = p_user_id;
  UPDATE goals SET phase_id = NULL WHERE phase_id = p_phase_id AND user_id = p_user_id;
  DELETE FROM phases WHERE id = p_phase_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
