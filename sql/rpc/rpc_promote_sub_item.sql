-- P5: promoteSubItem 事务化 RPC
-- 子项升格为独立事项：创建新事项 → 迁移记录/目标 → 原子操作
-- 部署：在 Supabase Dashboard SQL Editor 中手动执行

CREATE OR REPLACE FUNCTION rpc_promote_sub_item(
  p_user_id UUID,
  p_sub_item_id UUID,
  p_new_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_item RECORD;
  v_new_item_id UUID;
BEGIN
  SELECT * INTO v_sub_item FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SUB_ITEM_NOT_FOUND');
  END IF;

  -- 创建新 item
  INSERT INTO items (user_id, title, status, description)
  VALUES (p_user_id, COALESCE(p_new_title, v_sub_item.title), '活跃', v_sub_item.description)
  RETURNING id INTO v_new_item_id;

  -- 迁移 records
  UPDATE records SET item_id = v_new_item_id, sub_item_id = NULL
    WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;

  -- 迁移 goals
  UPDATE goals SET item_id = v_new_item_id, sub_item_id = NULL
    WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'new_item_id', v_new_item_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
