-- P5: deleteItem 事务化 RPC
-- 将关联记录/目标/阶段置空，删除子项，软删除事项 — 原子操作
-- 部署：在 Supabase Dashboard SQL Editor 中手动执行

CREATE OR REPLACE FUNCTION rpc_delete_item(
  p_user_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_item_count INT;
  v_record_count INT;
  v_goal_count INT;
  v_phase_count INT;
BEGIN
  -- Step 1: 验证 item 归属
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  END IF;

  -- Step 2: 置空关联记录的 item_id/phase_id/sub_item_id
  UPDATE records SET item_id = NULL, phase_id = NULL, sub_item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 3: 置空关联目标的 item_id/sub_item_id
  UPDATE goals SET item_id = NULL, sub_item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 4: 置空关联阶段的 item_id
  UPDATE phases SET item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 5: 物理删除子事项（record_links CASCADE）
  DELETE FROM sub_items WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 6: 软删除事项
  UPDATE items SET status = '已搁置' WHERE id = p_item_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
