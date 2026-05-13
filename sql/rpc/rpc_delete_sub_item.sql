-- P5: deleteSubItem 事务化 RPC
-- 置空关联记录/目标的 sub_item_id，物理删除子项 — 原子操作
-- 部署：在 Supabase Dashboard SQL Editor 中手动执行

CREATE OR REPLACE FUNCTION rpc_delete_sub_item(
  p_user_id UUID,
  p_sub_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SUB_ITEM_NOT_FOUND');
  END IF;

  UPDATE records SET sub_item_id = NULL WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;
  UPDATE goals SET sub_item_id = NULL WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;
  DELETE FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
